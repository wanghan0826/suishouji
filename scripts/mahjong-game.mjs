import crypto from 'node:crypto';
import {newRoom,startHand,playAction,tick,roomView,normalizeRules} from './mahjong-engine.mjs';
import {ensureGrowthMetrics,recordGrowthGuess} from './growth-metrics.mjs';
import {parseVoice,sendVoice,VOICE_MAX_BYTES} from './mahjong-voice.mjs';

const fail=(status,message)=>Object.assign(Error(message),{status}),DAY=86400000;
const CHAT_LIMIT=48,EMOJIS=new Set(['hello','laugh','clap','think','wow','again','love','proud','shock','cry','please','angry','sleepy','hurry','nice','shy']);
function chatInput(input){
  if(input.kind==='voice')return {kind:'voice',text:'',voice:parseVoice(input)};
  if(input.kind==='emoji'&&EMOJIS.has(input.text))return {kind:'emoji',text:input.text};
  if(input.kind!=='text'||typeof input.text!=='string')throw fail(400,'请选择表情或输入文字');
  const text=input.text.trim().normalize('NFC');
  if(!text||[...text].length>80||/[\p{Cc}\p{Cs}\u202a-\u202e\u2066-\u2069]/u.test(text)||!text.replace(/[\p{Cf}\s]/gu,''))throw fail(400,'请输入 1–80 个字符的聊天内容');
  return {kind:'text',text};
}
export function createMahjongGame({db,users,clock=Date.now}){
  ensureGrowthMetrics(db);
  db.exec(`CREATE TABLE IF NOT EXISTS mahjong_rooms(token TEXT PRIMARY KEY,state TEXT NOT NULL,updated_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS mahjong_members(token TEXT NOT NULL,user_id INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(token,user_id));
    CREATE INDEX IF NOT EXISTS mahjong_user_rooms ON mahjong_members(user_id,active);
    CREATE TABLE IF NOT EXISTS mahjong_ops(token TEXT NOT NULL,user_id INTEGER NOT NULL,op_id TEXT NOT NULL,fingerprint TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(token,user_id,op_id));
    CREATE TABLE IF NOT EXISTS mahjong_chat(id INTEGER PRIMARY KEY AUTOINCREMENT,token TEXT NOT NULL,user_id INTEGER NOT NULL,seat INTEGER NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS mahjong_chat_room ON mahjong_chat(token,id DESC);`);
  db.exec('CREATE TABLE IF NOT EXISTS mahjong_voice(id INTEGER PRIMARY KEY,token TEXT NOT NULL,mime TEXT NOT NULL,duration INTEGER NOT NULL,audio BLOB NOT NULL); CREATE INDEX IF NOT EXISTS mahjong_voice_room ON mahjong_voice(token)');
  const buckets=new Map(),streams=new Map();let cleanupAt=0;
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
  const load=token=>{const row=db.prepare('SELECT * FROM mahjong_rooms WHERE token=?').get(token);if(!row)throw fail(404,'没有找到这间牌室');if(row.expires_at<=clock())throw fail(410,'牌室已过期，请重新开房');return JSON.parse(row.state);};
  const save=(token,r)=>db.prepare('UPDATE mahjong_rooms SET state=?,updated_at=? WHERE token=?').run(JSON.stringify(r),clock(),token);
  function limit(id,kind){const now=clock(),key=id+':'+kind,max=['create','voice'].includes(kind)?6:kind==='read'?180:kind==='chat'?12:90,window=kind==='create'?3600000:kind==='chat'?10000:60000;let b=buckets.get(key);if(!b||b.until<=now){b={n:0,until:now+window};buckets.set(key,b);}if(++b.n>max)throw fail(429,kind==='chat'||kind==='voice'?'发得太快了，请稍等再发':'操作有点快，请稍后再试');if(buckets.size>3000)for(const[k,v]of buckets)if(v.until<now)buckets.delete(k);}
  function active(r){return r.seats.filter(s=>s&&!s.bot&&!s.away);}
  function advance(token){return transaction(()=>{const r=load(token);let changed=false;
    if(r.pending&&!r.pending.id){r.pending.id=crypto.randomBytes(12).toString('hex');changed=true;}
    for(const s of active(r))if(!db.prepare('SELECT 1 FROM site_users WHERE id=? AND disabled=0').get(s.userId)){s.away=true;changed=true;db.prepare('UPDATE mahjong_members SET active=0 WHERE token=? AND user_id=?').run(token,s.userId);}
    const humans=active(r);
    if(!humans.length||clock()-r.lastActive>30*60000){if(r.phase!=='closed'){r.phase='closed';r.deadline=0;changed=true;}}
    else {if(!humans.some(s=>s.userId===r.hostId)){r.hostId=humans[0].userId;humans[0].ready=true;changed=true;}if(tick(r,clock()))changed=true;}
    if(changed){r.version++;save(token,r);}return r;
  });}
  const chatHistory=token=>db.prepare('SELECT c.id,c.seat,c.name,c.kind,c.text,c.created_at AS at,v.duration FROM mahjong_chat c LEFT JOIN mahjong_voice v ON v.id=c.id WHERE c.token=? ORDER BY c.id DESC LIMIT ?').all(token,CHAT_LIMIT).reverse().map(m=>m.kind==='voice'?{...m,url:'/api/mahjong/'+token+'/voice/'+m.id}:m);
  const view=(token,r,id)=>{const v=roomView(r,id,token,clock());if(v.preview)v.preview.version=r.version;else v.room.chat=r.phase==='closed'?[]:chatHistory(token);return v;};
  function write(stream,event,data){
    if(stream.res.destroyed||stream.res.writableEnded)return false;
    if(stream.res.writableLength>256*1024){stream.res.end();return false;}
    return stream.res.write('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n');
  }
  function revoke(stream,status,message){write(stream,'revoked',{status,error:message});stream.res.end();}
  function broadcast(token,r,heartbeat=false){
    const list=streams.get(token);if(!list?.size)return;
    const chat=r.phase==='closed'?[]:chatHistory(token),key=r.version+':'+(chat.at(-1)?.id||0);
    if(!heartbeat&&[...list].every(s=>s.key===key))return;
    for(const s of list){
      const user=users.currentUser(s.req);
      if(!user||user.id!==s.userId){revoke(s,401,'登录已失效，请重新登录。');continue;}
      if(!r.seats.some(p=>p?.userId===s.userId&&!p.away)){revoke(s,403,'已离开牌室，请重新加入。');continue;}
      if(r.phase==='closed'){revoke(s,410,'牌室已关闭，已返回大厅。');continue;}
      if(s.key!==key){const data=roomView(r,s.userId,token,clock());data.room.chat=chat;write(s,'state',data);s.key=key;}
      else if(heartbeat)write(s,'ping',{serverNow:clock()});
    }
  }
  const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  async function body(req,max=8192){if(!String(req.headers['content-type']||'').startsWith('application/json'))throw fail(415,'请求格式无效');let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>max)throw fail(413,'请求过大');chunks.push(c);}try{const v=JSON.parse(Buffer.concat(chunks).toString());if(!v||typeof v!=='object'||Array.isArray(v))throw 0;return v;}catch{throw fail(400,'请求内容无效');}}
  async function handle(req,res){
    const path=new URL(req.url,'http://local').pathname;if(path!=='/api/mahjong'&&!path.startsWith('/api/mahjong/'))return false;
    let requestedToken;
    try{
      const voiceMatch=/^\/api\/mahjong\/([a-f0-9]{32})\/voice\/([1-9]\d{0,14})$/.exec(path),match=voiceMatch?[null,voiceMatch[1],'voice']:/^\/api\/mahjong(?:\/([a-f0-9]{32})(?:\/(join|leave|ready|start|rules|next|close|action|chat|events))?)?\/?$/.exec(path);if(!match)throw fail(404,'未知牌室操作');
      if(!['GET','POST'].includes(req.method))throw fail(405,'不支持此操作');
      const [,token,action]=match;
      requestedToken=token;
      const user=req.method==='POST'?users.requireUser(req):users.currentUser(req);if(!user)throw fail(401,'登录后可以开房或加入牌室');limit(user.id,req.method==='GET'?'read':action==='chat'?'chat':'write');
      if(!token){
        if(req.method==='GET'){
          const rows=db.prepare('SELECT r.token,r.state,r.expires_at FROM mahjong_rooms r JOIN mahjong_members m ON m.token=r.token WHERE m.user_id=? AND m.active=1 AND r.expires_at>? ORDER BY r.updated_at DESC LIMIT 12').all(user.id,clock());
          send(res,200,{rooms:rows.map(row=>{const r=JSON.parse(row.state);return {token:row.token,phase:r.phase,handNo:r.handNo,count:r.seats.filter(Boolean).length,host:r.seats.find(s=>s?.userId===r.hostId)?.name||'朋友'};}).filter(r=>r.phase!=='closed')});return true;
        }
        const input=await body(req);limit(user.id,'create');const r=newRoom(user,clock(),input.rules),token=crypto.randomBytes(16).toString('hex');
        transaction(()=>{
          const existing=db.prepare("SELECT r.state FROM mahjong_rooms r JOIN mahjong_members m ON m.token=r.token WHERE m.user_id=? AND m.active=1 AND r.expires_at>?").all(user.id,clock()).filter(row=>!['closed','finished'].includes(JSON.parse(row.state).phase));if(existing.length>=3)throw fail(409,'最多同时保留三间牌室，请先结束旧牌室');
          db.prepare('INSERT INTO mahjong_rooms VALUES(?,?,?,?)').run(token,JSON.stringify(r),clock(),clock()+7*DAY);db.prepare('INSERT INTO mahjong_members VALUES(?,?,1)').run(token,user.id);
        });send(res,200,view(token,r,user.id));return true;
      }
      let r=advance(token);broadcast(token,r);
      if(req.method==='GET'){
        if(action==='voice'){
          if(r.phase==='closed')throw fail(410,'牌室已关闭');
          if(!active(r).some(s=>s.userId===user.id))throw fail(403,'入座后才能播放同桌语音');
          const voice=db.prepare('SELECT v.* FROM mahjong_voice v JOIN mahjong_chat c ON c.id=v.id AND c.token=v.token WHERE v.token=? AND v.id=?').get(token,Number(voiceMatch[2]));
          if(!voice)throw fail(404,'这条语音已不在最近消息中');sendVoice(req,res,voice);return true;
        }
        if(action==='events'){
          if(r.phase==='closed')throw fail(410,'牌室已关闭，请重新开房');
          if(!active(r).some(s=>s.userId===user.id))throw fail(403,'入座后才能同步牌桌');
          const list=streams.get(token)||new Set();
          if([...streams.values()].reduce((n,items)=>n+[...items].filter(s=>s.userId===user.id).length,0)>=3)throw fail(429,'打开的牌桌太多，请关闭其他页面');
          r.lastActive=clock();save(token,r);
          res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no','Vary':'Cookie','X-Content-Type-Options':'nosniff'});res.flushHeaders();
          const stream={req,res,userId:user.id,key:null};list.add(stream);streams.set(token,list);
          res.on('close',()=>{list.delete(stream);if(!list.size)streams.delete(token);});
          broadcast(token,r);return true;
        }
        if(action)throw fail(405,'请通过按钮执行此操作');
        if(active(r).some(s=>s.userId===user.id)&&clock()-r.lastActive>60000){r.lastActive=clock();save(token,r);}
        send(res,200,view(token,r,user.id));return true;
      }
      if(!action||['events','voice'].includes(action))throw fail(404,'请选择牌室操作');
      const input=await body(req,action==='chat'?Math.ceil(VOICE_MAX_BYTES/3)*4+8192:8192);
      if(action==='chat'){
        if(!/^[a-f0-9]{32}$/.test(input.opId||''))throw fail(400,'聊天凭据无效，请重试');
        const item=chatInput(input),fingerprint=crypto.createHash('sha256').update(JSON.stringify(['chat',item.voice?['voice',item.voice.mime,item.voice.duration,crypto.createHash('sha256').update(item.voice.audio).digest('hex')]:item])).digest('hex');
        transaction(()=>{
          r=load(token);const seat=r.seats.findIndex(s=>s?.userId===user.id&&!s.away);
          if(seat<0)throw fail(403,'入座后才能使用同桌聊天');
          if(r.phase==='closed')throw fail(410,'牌室已关闭');
          const old=db.prepare('SELECT fingerprint FROM mahjong_ops WHERE token=? AND user_id=? AND op_id=?').get(token,user.id,input.opId);
          if(old){if(old.fingerprint!==fingerprint)throw fail(409,'这次消息已发送，请重新编辑');return;}
          if(item.voice)limit(user.id,'voice');
          const now=clock(),last=db.prepare('SELECT created_at FROM mahjong_chat WHERE token=? AND user_id=? ORDER BY id DESC LIMIT 1').get(token,user.id);
          if(last&&now-last.created_at<750)throw fail(429,'发得太快了，请稍等再发');
          const inserted=db.prepare('INSERT INTO mahjong_chat(token,user_id,seat,name,kind,text,created_at) VALUES(?,?,?,?,?,?,?)').run(token,user.id,seat,user.username,item.kind,item.text,now);
          if(item.voice)db.prepare('INSERT INTO mahjong_voice VALUES(?,?,?,?,?)').run(inserted.lastInsertRowid,token,item.voice.mime,item.voice.duration,item.voice.audio);
          db.prepare('DELETE FROM mahjong_chat WHERE token=? AND id < (SELECT id FROM mahjong_chat WHERE token=? ORDER BY id DESC LIMIT 1 OFFSET ?)').run(token,token,CHAT_LIMIT-1);
          db.prepare('DELETE FROM mahjong_voice WHERE token=? AND id NOT IN (SELECT id FROM mahjong_chat WHERE token=?)').run(token,token);
          db.prepare('INSERT INTO mahjong_ops VALUES(?,?,?,?,?)').run(token,user.id,input.opId,fingerprint,now);
        });broadcast(token,r);send(res,200,{chat:chatHistory(token)});return true;
      }
      if(!/^[a-f0-9]{32}$/.test(input.opId||'')||!Number.isSafeInteger(input.version))throw fail(400,'操作凭据无效，请刷新后重试');
      const fingerprint=crypto.createHash('sha256').update(JSON.stringify([action,input])).digest('hex');
      transaction(()=>{
        r=load(token);const old=db.prepare('SELECT fingerprint FROM mahjong_ops WHERE token=? AND user_id=? AND op_id=?').get(token,user.id,input.opId);
        if(old){if(old.fingerprint!==fingerprint)throw fail(409,'这次操作已使用，请重新操作');return;}
        const sameResponse=action==='action'&&input.type==='claim'&&r.phase==='respond'&&input.handNo===r.handNo&&input.responseId===r.pending.id&&input.version<=r.version;
        if(input.version!==r.version&&!sameResponse)throw fail(409,'牌桌已更新，正在同步，请重新选择');
        if(r.phase==='closed')throw fail(410,'牌室已关闭，请重新开房');
        const seat=r.seats.findIndex(s=>s?.userId===user.id),mine=seat>=0?r.seats[seat]:null,host=r.hostId===user.id;
        if(action==='join'){
          if(mine&&!mine.away)return;
          if(mine&&mine.away){mine.away=false;mine.ready=r.phase!=='lobby';}
          else {if(r.phase!=='lobby')throw fail(409,'本桌已开局，暂不支持中途加入');const free=r.seats.findIndex(s=>!s);if(free<0)throw fail(409,'四个座位已满');r.seats[free]={userId:user.id,name:user.username,bot:false,away:false,ready:false,score:0};}
          db.prepare('INSERT INTO mahjong_members VALUES(?,?,1) ON CONFLICT(token,user_id) DO UPDATE SET active=1').run(token,user.id);
        }else{
          if(!mine||mine.away)throw fail(403,'请先加入牌室');
          if(action==='leave'){
            db.prepare('UPDATE mahjong_members SET active=0 WHERE token=? AND user_id=?').run(token,user.id);
            if(r.phase==='lobby')r.seats[seat]=null;else mine.away=true;
            if(!active(r).length){r.phase='closed';r.deadline=0;}else if(host){r.hostId=active(r)[0].userId;active(r)[0].ready=true;}
          }else if(action==='ready'){
            if(r.phase!=='lobby')throw fail(409,'本桌已开始');if(typeof input.ready!=='boolean')throw fail(400,'准备状态无效');mine.ready=host||input.ready;
          }else if(action==='rules'){
            if(!host)throw fail(403,'只有房主可以调整规则');if(r.phase!=='lobby')throw fail(409,'开始后不能修改本桌规则');r.rules=normalizeRules(input.rules);for(const s of active(r))s.ready=s.userId===r.hostId;
          }else if(action==='start'){
            if(!host)throw fail(403,'请等房主开局');if(r.phase!=='lobby')throw fail(409,'本桌已经开始');if(active(r).some(s=>!s.ready))throw fail(409,'请等所有朋友准备');
            for(let s=0;s<4;s++)if(!r.seats[s]){if(input.fillBots!==true)throw fail(409,'还缺牌友，可以选择机器人补位');r.seats[s]={userId:null,name:'练习机 '+(s+1),bot:true,away:false,ready:true,score:0};}
            r.dealer=r.seats.findIndex(s=>s?.userId===r.hostId);startHand(r,clock());
          }else if(action==='next'){
            if(!host)throw fail(403,'请等房主开下一局');if(r.phase!=='between')throw fail(409,'当前不能开下一局');r.dealer=r.nextDealer;startHand(r,clock());
          }else if(action==='close'){
            if(!host)throw fail(403,'只有房主可以结束牌室');r.phase='closed';r.deadline=0;
          }else if(action==='action'){
            if(!['playing','respond'].includes(r.phase))throw fail(409,'本局已结束');playAction(r,seat,input,clock());
            if(!r.activity.includes(user.id)){r.activity.push(user.id);recordGrowthGuess(db,user.id,clock());}
          }else throw fail(404,'未知操作');
        }
        r.lastActive=clock();r.version++;save(token,r);db.prepare('INSERT INTO mahjong_ops VALUES(?,?,?,?,?)').run(token,user.id,input.opId,fingerprint,clock());
      });broadcast(token,r);send(res,200,view(token,r,user.id));return true;
    }catch(e){if(e.status===410&&requestedToken)for(const s of streams.get(requestedToken)||[])revoke(s,410,e.message);send(res,e.status||500,{error:e.status?e.message:'牌桌同步暂时失败，请稍后重试'});return true;}
  }
  function sweep(){
    try{
    for(const row of db.prepare('SELECT token,state FROM mahjong_rooms WHERE expires_at>? ORDER BY updated_at DESC LIMIT 500').all(clock())){const r=JSON.parse(row.state);if(['playing','respond','lobby'].includes(r.phase))try{broadcast(row.token,advance(row.token));}catch{/* An expired room cannot stop other tables. */}}
    if(clock()-cleanupAt>3600000){if(db.prepare('SELECT 1 FROM mahjong_rooms WHERE expires_at<=? LIMIT 1').get(clock()))transaction(()=>{for(const table of ['mahjong_voice','mahjong_chat','mahjong_ops','mahjong_members'])db.prepare(`DELETE FROM ${table} WHERE token IN (SELECT token FROM mahjong_rooms WHERE expires_at<=?)`).run(clock());db.prepare('DELETE FROM mahjong_rooms WHERE expires_at<=?').run(clock());});cleanupAt=clock();}
    }catch(e){
      // SQLite may be briefly locked by a backup, migration or another writer.
      // Background work must never terminate the HTTP process; retry next tick.
      if(![5,6].includes(e.errcode))console.error('Mahjong maintenance deferred; will retry.');
    }
  }
  const timer=setInterval(sweep,500);timer.unref();
  const heartbeat=setInterval(()=>{
    for(const token of streams.keys())try{
      const r=advance(token);broadcast(token,r,true);
      if(r.phase!=='closed'&&clock()-r.lastActive>60000&&[...streams.get(token)||[]].some(s=>users.currentUser(s.req)?.id===s.userId&&active(r).some(p=>p.userId===s.userId))){r.lastActive=clock();save(token,r);}
    }catch(e){if(e.status)for(const s of streams.get(token)||[])revoke(s,e.status,e.message);}
  },15000);heartbeat.unref();
  return {handle,close(){clearInterval(timer);clearInterval(heartbeat);for(const list of streams.values())for(const s of list)s.res.end();streams.clear();},sweep};
}
