import crypto from 'node:crypto';
import {newRoom,startHand,playAction,tick,roomView,normalizeRules} from './mahjong-engine.mjs';
import {ensureGrowthMetrics,recordGrowthGuess} from './growth-metrics.mjs';

const fail=(status,message)=>Object.assign(Error(message),{status}),DAY=86400000;
export function createMahjongGame({db,users,clock=Date.now}){
  ensureGrowthMetrics(db);
  db.exec(`CREATE TABLE IF NOT EXISTS mahjong_rooms(token TEXT PRIMARY KEY,state TEXT NOT NULL,updated_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS mahjong_members(token TEXT NOT NULL,user_id INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(token,user_id));
    CREATE INDEX IF NOT EXISTS mahjong_user_rooms ON mahjong_members(user_id,active);
    CREATE TABLE IF NOT EXISTS mahjong_ops(token TEXT NOT NULL,user_id INTEGER NOT NULL,op_id TEXT NOT NULL,fingerprint TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(token,user_id,op_id));`);
  const buckets=new Map();let cleanupAt=0;
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
  const load=token=>{const row=db.prepare('SELECT * FROM mahjong_rooms WHERE token=?').get(token);if(!row)throw fail(404,'没有找到这间牌室');if(row.expires_at<=clock())throw fail(410,'牌室已过期，请重新开房');return JSON.parse(row.state);};
  const save=(token,r)=>db.prepare('UPDATE mahjong_rooms SET state=?,updated_at=? WHERE token=?').run(JSON.stringify(r),clock(),token);
  function limit(id,kind){const now=clock(),key=id+':'+kind,max=kind==='create'?6:kind==='read'?180:90,window=kind==='create'?3600000:60000;let b=buckets.get(key);if(!b||b.until<=now){b={n:0,until:now+window};buckets.set(key,b);}if(++b.n>max)throw fail(429,'操作有点快，请稍后再试');if(buckets.size>3000)for(const[k,v]of buckets)if(v.until<now)buckets.delete(k);}
  function active(r){return r.seats.filter(s=>s&&!s.bot&&!s.away);}
  function advance(token){return transaction(()=>{const r=load(token);let changed=false;
    if(r.pending&&!r.pending.id){r.pending.id=crypto.randomBytes(12).toString('hex');changed=true;}
    for(const s of active(r))if(!db.prepare('SELECT 1 FROM site_users WHERE id=? AND disabled=0').get(s.userId)){s.away=true;changed=true;db.prepare('UPDATE mahjong_members SET active=0 WHERE token=? AND user_id=?').run(token,s.userId);}
    const humans=active(r);
    if(!humans.length||clock()-r.lastActive>30*60000){if(r.phase!=='closed'){r.phase='closed';r.deadline=0;changed=true;}}
    else {if(!humans.some(s=>s.userId===r.hostId)){r.hostId=humans[0].userId;humans[0].ready=true;changed=true;}if(tick(r,clock()))changed=true;}
    if(changed){r.version++;save(token,r);}return r;
  });}
  const view=(token,r,id)=>{const v=roomView(r,id,token,clock());if(v.preview)v.preview.version=r.version;return v;};
  const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  async function body(req){if(!String(req.headers['content-type']||'').startsWith('application/json'))throw fail(415,'请求格式无效');let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>8192)throw fail(413,'请求过大');chunks.push(c);}try{const v=JSON.parse(Buffer.concat(chunks).toString());if(!v||typeof v!=='object'||Array.isArray(v))throw 0;return v;}catch{throw fail(400,'请求内容无效');}}
  async function handle(req,res){
    const path=new URL(req.url,'http://local').pathname;if(path!=='/api/mahjong'&&!path.startsWith('/api/mahjong/'))return false;
    try{
      const match=/^\/api\/mahjong(?:\/([a-f0-9]{32})(?:\/(join|leave|ready|start|rules|next|close|action))?)?\/?$/.exec(path);if(!match)throw fail(404,'未知牌室操作');
      if(!['GET','POST'].includes(req.method))throw fail(405,'不支持此操作');
      const user=req.method==='POST'?users.requireUser(req):users.currentUser(req);if(!user)throw fail(401,'登录后可以开房或加入牌室');limit(user.id,req.method==='GET'?'read':'write');
      const [,token,action]=match;
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
      let r=advance(token);
      if(req.method==='GET'){
        if(action)throw fail(405,'请通过按钮执行此操作');
        if(active(r).some(s=>s.userId===user.id)&&clock()-r.lastActive>60000){r.lastActive=clock();save(token,r);}
        send(res,200,view(token,r,user.id));return true;
      }
      if(!action)throw fail(404,'请选择牌室操作');
      const input=await body(req);
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
      });send(res,200,view(token,r,user.id));return true;
    }catch(e){send(res,e.status||500,{error:e.status?e.message:'牌桌同步暂时失败，请稍后重试'});return true;}
  }
  function sweep(){
    try{
    for(const row of db.prepare('SELECT token,state FROM mahjong_rooms WHERE expires_at>? ORDER BY updated_at DESC LIMIT 500').all(clock())){const r=JSON.parse(row.state);if(['playing','respond','lobby'].includes(r.phase))try{advance(row.token);}catch{/* An expired room cannot stop other tables. */}}
    if(clock()-cleanupAt>3600000){transaction(()=>{db.prepare('DELETE FROM mahjong_ops WHERE token IN (SELECT token FROM mahjong_rooms WHERE expires_at<=?)').run(clock());db.prepare('DELETE FROM mahjong_members WHERE token IN (SELECT token FROM mahjong_rooms WHERE expires_at<=?)').run(clock());db.prepare('DELETE FROM mahjong_rooms WHERE expires_at<=?').run(clock());});cleanupAt=clock();}
    }catch(e){
      // SQLite may be briefly locked by a backup, migration or another writer.
      // Background work must never terminate the HTTP process; retry next tick.
      if(![5,6].includes(e.errcode))console.error('Mahjong maintenance deferred; will retry.');
    }
  }
  const timer=setInterval(sweep,500);timer.unref();return {handle,close(){clearInterval(timer);},sweep};
}
