import crypto from 'node:crypto';
import {pickDrawChoices,DRAW_WORD_STATS} from './draw-words.mjs';
import {normalizeWord} from './word-game.mjs';
import {ensureGrowthMetrics,recordGrowthGuess} from './growth-metrics.mjs';

const DAY=86400000,TURN=90000,BREAK=8000,CHOOSING=20000;
const fail=(status,message)=>Object.assign(Error(message),{status});
function roomNickname(value){if(typeof value!=='string'||/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value))throw fail(400,'昵称请输入1–20字，不要包含换行或隐藏字符');const name=value.normalize('NFC').trim();if(!name||Array.from(name).length>20)throw fail(400,'昵称请输入1–20字');return name;}
export const DRAW_COLORS=['#25352d','#ef606c','#efaa44','#63a77d','#5c90dc','#a982d6','#ffffff'];

export function drawingScores(eligible,correct,drawer){
  const unique=[...new Set(correct)].filter(id=>eligible.includes(id));
  if(unique.length===eligible.length||!unique.length)return [];
  return [{userId:drawer,points:unique.length},...unique.map((id,index)=>({userId:id,points:eligible.length-index}))];
}
export function studioScores(eligible,correct,drawer){const unique=[...new Set(correct)].filter(id=>eligible.includes(id));return unique.length?[{userId:drawer,points:unique.length*10},...unique.map((id,i)=>({userId:id,points:Math.max(20,100-i*20)}))]:[];}
export function validStroke(input,height=640){
  if(!/^[a-f0-9]{32}$/.test(input.opId||'')||!/^[a-f0-9]{32}$/.test(input.strokeId||'')||!DRAW_COLORS.includes(input.color)||![3,6,12,20].includes(input.size)||!Array.isArray(input.points)||!input.points.length||input.points.length>128||input.points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isInteger)||p[0]<0||p[0]>960||p[1]<0||p[1]>height))throw fail(400,'画笔数据无效，请刷新画板后重试');
  return {opId:input.opId,strokeId:input.strokeId,color:input.color,size:input.size,points:input.points};
}
export function createDrawingGame({db,users,clock=Date.now}){
  ensureGrowthMetrics(db);
  db.exec(`CREATE TABLE IF NOT EXISTS draw_rooms(token TEXT PRIMARY KEY,host_id INTEGER NOT NULL,phase TEXT NOT NULL DEFAULT 'lobby',round INTEGER NOT NULL DEFAULT 0,roster TEXT NOT NULL DEFAULT '[]',next_at INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS draw_members(room_token TEXT NOT NULL,user_id INTEGER NOT NULL,seat INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,score INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(room_token,user_id),UNIQUE(room_token,seat));
    CREATE INDEX IF NOT EXISTS draw_member_user ON draw_members(user_id,room_token);
    CREATE TABLE IF NOT EXISTS draw_rounds(room_token TEXT NOT NULL,round INTEGER NOT NULL,drawer_id INTEGER NOT NULL,answer TEXT NOT NULL,category TEXT NOT NULL,eligible TEXT NOT NULL,deadline INTEGER NOT NULL,canvas_epoch INTEGER NOT NULL DEFAULT 0,next_seq INTEGER NOT NULL DEFAULT 1,point_count INTEGER NOT NULL DEFAULT 0,settled_at INTEGER,reason TEXT NOT NULL DEFAULT '',PRIMARY KEY(room_token,round));
    CREATE TABLE IF NOT EXISTS draw_correct(room_token TEXT NOT NULL,round INTEGER NOT NULL,user_id INTEGER NOT NULL,rank INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(room_token,round,user_id),UNIQUE(room_token,round,rank));
    CREATE TABLE IF NOT EXISTS draw_strokes(room_token TEXT NOT NULL,round INTEGER NOT NULL,seq INTEGER NOT NULL,op_id TEXT NOT NULL,stroke_id TEXT NOT NULL,color TEXT NOT NULL,size INTEGER NOT NULL,points TEXT NOT NULL,PRIMARY KEY(room_token,round,seq),UNIQUE(room_token,round,op_id));
    CREATE TABLE IF NOT EXISTS draw_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,room_token TEXT NOT NULL,round INTEGER NOT NULL,user_id INTEGER NOT NULL,text TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS draw_message_room ON draw_messages(room_token,round,id);
    CREATE TABLE IF NOT EXISTS draw_activity(room_token TEXT NOT NULL,round INTEGER NOT NULL,user_id INTEGER NOT NULL,PRIMARY KEY(room_token,round,user_id));`);
  const columns=db.prepare('PRAGMA table_info(draw_rooms)').all().map(c=>c.name);
  if(!db.prepare('PRAGMA table_info(draw_members)').all().some(c=>c.name==='nickname'))db.exec("ALTER TABLE draw_members ADD COLUMN nickname TEXT NOT NULL DEFAULT ''");
  if(!columns.includes('mode'))db.exec("ALTER TABLE draw_rooms ADD COLUMN mode TEXT NOT NULL DEFAULT 'party'");
  if(!columns.includes('canvas_height'))db.exec('ALTER TABLE draw_rooms ADD COLUMN canvas_height INTEGER NOT NULL DEFAULT 640');
  if(!columns.includes('last_activity'))db.exec('ALTER TABLE draw_rooms ADD COLUMN last_activity INTEGER NOT NULL DEFAULT 0');
  const roundColumns=db.prepare('PRAGMA table_info(draw_rounds)').all().map(c=>c.name);
  if(!roundColumns.includes('choices'))db.exec("ALTER TABLE draw_rounds ADD COLUMN choices TEXT NOT NULL DEFAULT '[]'");
  if(!roundColumns.includes('choose_deadline'))db.exec('ALTER TABLE draw_rounds ADD COLUMN choose_deadline INTEGER NOT NULL DEFAULT 0');
  if(!roundColumns.includes('selected_choice'))db.exec('ALTER TABLE draw_rounds ADD COLUMN selected_choice INTEGER NOT NULL DEFAULT -1');
  if(!roundColumns.includes('difficulty'))db.exec('ALTER TABLE draw_rounds ADD COLUMN difficulty INTEGER NOT NULL DEFAULT 0');
  const score=(r,eligible,guessed,drawer)=>r.mode==='studio'?studioScores(eligible,guessed,drawer):drawingScores(eligible,guessed,drawer);
  const streams=new Map(),buckets=new Map();let cleanupAt=0;
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
  const room=token=>{const r=db.prepare('SELECT * FROM draw_rooms WHERE token=?').get(token);if(!r)throw fail(404,'没有找到这个画室');if(r.expires_at<=clock())throw fail(410,'画室已过期，可以重新开一间');return r;};
  const members=token=>db.prepare('SELECT m.*,u.username FROM draw_members m JOIN site_users u ON u.id=m.user_id WHERE m.room_token=? AND m.active=1 AND u.disabled=0 ORDER BY m.seat').all(token);
  const turn=r=>db.prepare('SELECT * FROM draw_rounds WHERE room_token=? AND round=?').get(r.token,r.round);
  const correct=r=>db.prepare('SELECT user_id,rank FROM draw_correct WHERE room_token=? AND round=? ORDER BY rank').all(r.token,r.round);
  function participate(r,id){if(db.prepare('INSERT OR IGNORE INTO draw_activity VALUES(?,?,?)').run(r.token,r.round,id).changes)recordGrowthGuess(db,id,clock());}
  function limit(id,kind){const max=kind==='stroke'?650:['create','nickname'].includes(kind)?6:kind==='guess'?60:90,window=kind==='create'?3600000:60000,key=id+':'+kind,now=clock();let row=buckets.get(key);if(!row||row.until<=now){row={n:0,until:now+window};buckets.set(key,row);}if(++row.n>max)throw fail(429,kind==='stroke'?'画笔同步稍快，请稍停一下。':'操作有点快，请稍后再试');if(buckets.size>3000)for(const[k,v]of buckets)if(v.until<now)buckets.delete(k);}
  function settle(r,reason='time'){
    const t=turn(r);if(!t||t.settled_at!==null)return;
    const guessed=correct(r).map(v=>v.user_id),eligible=JSON.parse(t.eligible),cancelled=['left','skip'].includes(reason),scores=cancelled?[]:score(r,eligible,guessed,t.drawer_id),now=clock();
    db.prepare('UPDATE draw_rounds SET settled_at=?,reason=? WHERE room_token=? AND round=? AND settled_at IS NULL').run(now,reason,r.token,r.round);
    for(const s of scores)db.prepare('UPDATE draw_members SET score=score+? WHERE room_token=? AND user_id=?').run(s.points,r.token,s.userId);
    const roster=JSON.parse(r.roster),active=members(r.token),hasNext=roster.slice(r.round).some(id=>active.some(m=>m.user_id===id));
    db.prepare('UPDATE draw_rooms SET phase=?,next_at=?,version=version+1 WHERE token=?').run((r.mode==='studio'?active.some(m=>m.user_id===r.host_id):hasNext&&active.length>=3)?'between':'finished',now+BREAK,r.token);
  }
  function next(r){
    const active=members(r.token),roster=JSON.parse(r.roster);let index=r.round;
    while(index<roster.length&&!active.some(m=>m.user_id===roster[index]))index++;
    if(r.mode==='studio'?!active.some(m=>m.user_id===r.host_id):(index>=roster.length||active.length<3)){db.prepare("UPDATE draw_rooms SET phase='finished',version=version+1 WHERE token=?").run(r.token);return;}
    const drawer=r.mode==='studio'?r.host_id:roster[index],eligible=active.filter(m=>m.user_id!==drawer).map(m=>m.user_id),used=new Set();
    for(const old of db.prepare('SELECT answer,choices FROM draw_rounds WHERE room_token=?').all(r.token)){if(old.answer)used.add(old.answer);for(const word of JSON.parse(old.choices))used.add(word.text);}
    const choices=pickDrawChoices(used);
    db.prepare('INSERT INTO draw_rounds(room_token,round,drawer_id,answer,category,eligible,deadline,choices,choose_deadline) VALUES(?,?,?,?,?,?,?,?,?)').run(r.token,index+1,drawer,'','选题中',JSON.stringify(eligible),0,JSON.stringify(choices),clock()+CHOOSING);
    db.prepare("UPDATE draw_rooms SET phase='choosing',round=?,next_at=0,version=version+1 WHERE token=?").run(index+1,r.token);
  }
  function choose(r,index){const t=turn(r),word=JSON.parse(t.choices)[index];if(!word)throw fail(400,'请选择给出的三个词之一');db.prepare('UPDATE draw_rounds SET answer=?,category=?,difficulty=?,selected_choice=?,choose_deadline=0,deadline=? WHERE room_token=? AND round=?').run(word.text,word.category,word.difficulty,index,clock()+TURN,r.token,r.round);db.prepare("UPDATE draw_rooms SET phase='playing',version=version+1 WHERE token=?").run(r.token);}
  function advance(token){const r=room(token);if(r.mode==='studio'&&['choosing','playing','between'].includes(r.phase)&&clock()-r.last_activity>=600000){transaction(()=>{if(['choosing','playing'].includes(r.phase))settle(r,'skip');db.prepare("UPDATE draw_rooms SET phase='closed',version=version+1 WHERE token=?").run(token);});return true;}if(r.phase==='choosing'&&turn(r).choose_deadline<=clock()){transaction(()=>choose(r,crypto.randomInt(3)));return true;}if(r.phase==='playing'&&turn(r).deadline<=clock()){transaction(()=>settle(r));return true;}if(r.phase==='between'&&r.next_at<=clock()){transaction(()=>next(r));return true;}return false;}
  function board(r){return db.prepare('SELECT seq,op_id opId,stroke_id strokeId,color,size,points FROM draw_strokes WHERE room_token=? AND round=? ORDER BY seq').all(r.token,r.round).map(s=>({...s,points:JSON.parse(s.points)}));}
  function state(token,id,includeBoard=false){
    const r=room(token),list=members(token),mine=list.find(m=>m.user_id===id);
    if(!mine){const host=list.find(m=>m.user_id===r.host_id);return {preview:{host:host?.nickname||host?.username||'朋友',count:list.length,phase:r.phase,canJoin:(r.phase==='lobby'||r.mode==='studio'&&['choosing','playing','between'].includes(r.phase))&&list.length<10}};}
    const t=turn(r),guessed=correct(r),eligible=t?JSON.parse(t.eligible):[],done=t?.settled_at!==null,rank=guessed.find(v=>v.user_id===id)?.rank||0;
    const scores=t&&done&&!['left','skip'].includes(t.reason)?score(r,eligible,guessed.map(v=>v.user_id),t.drawer_id):[];
    const result={room:{token,mode:r.mode,canvasHeight:r.canvas_height,phase:r.phase,round:r.round,totalRounds:JSON.parse(r.roster).length,version:r.version,hostId:r.host_id,me:id,serverNow:clock(),nextAt:r.next_at,members:list.map(m=>({id:m.user_id,name:m.nickname||m.username,score:m.score,seat:m.seat,guessed:guessed.some(g=>g.user_id===m.user_id),rank:guessed.find(g=>g.user_id===m.user_id)?.rank||0})),turn:t?{drawerId:t.drawer_id,answer:t.answer&&(t.drawer_id===id||done)?t.answer:null,category:t.answer?t.category:'选题中',length:t.answer?Array.from(t.answer).length:0,difficulty:t.answer?t.difficulty:null,choices:r.phase==='choosing'&&t.drawer_id===id?JSON.parse(t.choices).map((w,index)=>({...w,index})):undefined,chooseDeadline:t.choose_deadline,deadline:t.deadline,epoch:t.canvas_epoch,correctCount:guessed.length,eligibleCount:eligible.length,myRank:rank,provisional:rank?(r.mode==='studio'?Math.max(20,100-(rank-1)*20):eligible.length-rank+1):0,reason:t.reason,scores}:null,messages:t?db.prepare("SELECT m.id,m.user_id userId,COALESCE(NULLIF(d.nickname,''),u.username) name,d.seat,m.text FROM draw_messages m JOIN site_users u ON u.id=m.user_id JOIN draw_members d ON d.room_token=m.room_token AND d.user_id=m.user_id WHERE m.room_token=? AND m.round=? AND u.disabled=0 ORDER BY m.id DESC LIMIT 30").all(token,r.round).reverse():[]}};
    if(includeBoard)result.room.board=t?board(r):[];return result;
  }
  function write(stream,event,data){if(stream.res.destroyed)return;if(stream.res.writableLength>512*1024){stream.res.end();return;}stream.res.write('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n');}
  function broadcast(token,event='state',data){
    for(const s of streams.get(token)||[]){const user=users.currentUser(s.req),active=user&&members(token).some(m=>m.user_id===user.id);if(!active){write(s,'revoked',{error:'已离开画室或登录已失效'});s.res.end();continue;}try{write(s,event,data??state(token,s.userId,event==='snapshot'));}catch{write(s,'revoked',{error:'画室暂时无法访问'});s.res.end();}}
  }
  async function body(req){if(!String(req.headers['content-type']||'').startsWith('application/json'))throw fail(415,'请求格式无效');const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>16384)throw fail(413,'这次画笔数据太大，请分段绘画');chunks.push(c);}try{const value=JSON.parse(Buffer.concat(chunks).toString());if(!value||typeof value!=='object'||Array.isArray(value))throw 0;return value;}catch{throw fail(400,'请求数据无效');}}
  function clean(){if(clock()-cleanupAt<DAY)return;cleanupAt=clock();const old=db.prepare('SELECT token FROM draw_rooms WHERE expires_at<?').all(clock()-30*DAY);for(const r of old){for(const table of ['draw_strokes','draw_correct','draw_rounds','draw_messages','draw_activity','draw_members'])db.prepare('DELETE FROM '+table+' WHERE room_token=?').run(r.token);db.prepare('DELETE FROM draw_rooms WHERE token=?').run(r.token);}}
  const timer=setInterval(()=>{for(const row of db.prepare("SELECT token FROM draw_rooms WHERE phase IN ('choosing','playing','between') AND expires_at>?").all(clock())){try{if(advance(row.token))broadcast(row.token,'snapshot');}catch{}}},1000);timer.unref();
  const heartbeat=setInterval(()=>{for(const[token,list]of streams){const valid=db.prepare('SELECT 1 FROM draw_rooms WHERE token=? AND expires_at>?').get(token,clock());for(const s of list){const user=users.currentUser(s.req);if(!valid||!user||!members(token).some(m=>m.user_id===user.id)){write(s,'revoked',{error:'登录或画室权限已变化'});s.res.end();}else s.res.write(': keepalive\n\n');}}},15000);heartbeat.unref();
  return {close(){clearInterval(timer);clearInterval(heartbeat);for(const list of streams.values())for(const s of list)s.res.end();},async handle(req,res){
    const url=new URL(req.url,'http://local');if(!url.pathname.startsWith('/api/draw-game'))return false;
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));return true;};
    try{
      const root=url.pathname==='/api/draw-game',match=/^\/api\/draw-game\/([a-f0-9]{32})(?:\/(join|start|choose|guess|stroke|clear|undo|leave|skip|next|close|nickname|events))?$/.exec(url.pathname);if(!root&&!match)throw fail(404,'画室地址无效');
      const user=req.method==='GET'?users.currentUser(req):users.requireUser(req);if(!user)throw fail(401,'登录后加入你画我猜');
      if(req.method==='GET'){
        if(root){const items=db.prepare('SELECT r.token,r.phase,r.round,r.created_at FROM draw_rooms r JOIN draw_members m ON m.room_token=r.token WHERE m.user_id=? AND m.active=1 AND r.expires_at>? ORDER BY r.created_at DESC LIMIT 10').all(user.id,clock());return send(200,{items,wordCount:DRAW_WORD_STATS.total});}
        const token=match[1];if(advance(token))broadcast(token,'snapshot');
        if(match[2]==='events'){
          const data=state(token,user.id,true);if(!data.room)throw fail(403,'加入画室后才能实时查看');
          const list=streams.get(token)||new Set();if([...list].filter(s=>s.userId===user.id).length>=3)throw fail(429,'画室打开的页面太多，请关闭其他页面');
          res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no','Vary':'Cookie','X-Content-Type-Options':'nosniff'});res.flushHeaders();const stream={req,res,userId:user.id};list.add(stream);streams.set(token,list);write(stream,'snapshot',data);res.on('close',()=>{list.delete(stream);if(!list.size)streams.delete(token);});return true;
        }
        if(match[2])throw fail(405,'请求方法无效');return send(200,state(token,user.id,true));
      }
      if(req.method!=='POST')throw fail(405,'仅支持读取或提交');const input=await body(req),action=root?'create':match[2];limit(user.id,action);
      if(root){const mode=input.mode??'studio',height=input.canvasHeight??640;if(!['studio','party'].includes(mode)||!Number.isInteger(height)||height<480||height>1600)throw fail(400,'画室设置无效');const token=crypto.randomBytes(16).toString('hex'),now=clock();transaction(()=>{clean();db.prepare('INSERT INTO draw_rooms(token,host_id,created_at,expires_at,mode,canvas_height) VALUES(?,?,?,?,?,?)').run(token,user.id,now,now+7*DAY,mode,height);db.prepare('INSERT INTO draw_members(room_token,user_id,seat) VALUES(?,?,0)').run(token,user.id);});return send(200,state(token,user.id,true));}
      const token=match[1];if(advance(token))broadcast(token,'snapshot');let changed=false,stroke=null,reset=false,guessResult=null;
      transaction(()=>{
        const r=room(token),list=members(token),mine=list.find(m=>m.user_id===user.id),host=r.host_id===user.id,t=turn(r);
        if(action==='join'){
          if(mine)return;if(r.phase!=='lobby'&&!(r.mode==='studio'&&['choosing','playing','between'].includes(r.phase)))throw fail(409,'本局已开始或结束，等待朋友重新开房');if(list.length>=10)throw fail(409,'画室已满10人');
          const old=db.prepare('SELECT seat FROM draw_members WHERE room_token=? AND user_id=?').get(token,user.id),seat=old?.seat??(db.prepare('SELECT COALESCE(MAX(seat),-1)+1 n FROM draw_members WHERE room_token=?').get(token).n);
          db.prepare('INSERT INTO draw_members(room_token,user_id,seat) VALUES(?,?,?) ON CONFLICT(room_token,user_id) DO UPDATE SET active=1').run(token,user.id,seat);if(r.mode==='studio'&&['choosing','playing'].includes(r.phase)){const eligible=JSON.parse(t.eligible);if(!eligible.includes(user.id)){eligible.push(user.id);db.prepare('UPDATE draw_rounds SET eligible=? WHERE room_token=? AND round=?').run(JSON.stringify(eligible),token,r.round);}}changed=true;return;
        }
        if(!mine)throw fail(403,'只有画室内的玩家可以操作');
        if(action==='nickname'){if(['closed','finished'].includes(r.phase))throw fail(409,'这局已结束，请在新的画室设置昵称');const name=roomNickname(input.nickname);if(name===mine.nickname)return;db.prepare('UPDATE draw_members SET nickname=? WHERE room_token=? AND user_id=?').run(name,token,user.id);changed=true;return;}
        if(action==='start'){if(!host)throw fail(403,'请等房主开始');if(r.phase!=='lobby')throw fail(409,'本局已经开始');if(r.mode==='party'&&list.length<3)throw fail(409,'轮流挑战至少3人，自由画室1人可开');db.prepare('UPDATE draw_rooms SET roster=? WHERE token=?').run(JSON.stringify(list.map(m=>m.user_id)),token);next(room(token));changed=true;reset=true;return;}
        if(action==='close'){if(!host)throw fail(403,'只有房主可以结束整局');if(['choosing','playing'].includes(r.phase))settle(r,'skip');db.prepare("UPDATE draw_rooms SET phase='closed',version=version+1 WHERE token=?").run(token);changed=true;return;}
        if(action==='leave'){
          if(['choosing','playing'].includes(r.phase)&&(r.mode!=='studio'||host))settle(r,'left');db.prepare('UPDATE draw_members SET active=0 WHERE room_token=? AND user_id=?').run(token,user.id);
          const remaining=members(token);if(host&&remaining.length)db.prepare('UPDATE draw_rooms SET host_id=? WHERE token=?').run(remaining[0].user_id,token);
          if(r.mode==='studio'&&host)db.prepare("UPDATE draw_rooms SET phase='closed',version=version+1 WHERE token=?").run(token);else if(!remaining.length)db.prepare("UPDATE draw_rooms SET phase='closed' WHERE token=?").run(token);else if(r.mode!=='studio'&&r.phase!=='lobby'&&remaining.length<3)db.prepare("UPDATE draw_rooms SET phase='finished' WHERE token=?").run(token);changed=true;reset=true;return;
        }
        if(action==='next'){if(!host||r.phase!=='between'||input.round!==r.round||clock()<r.next_at-BREAK+2000)throw fail(409,'等待本轮结算后继续');next(r);changed=true;reset=true;return;}
        if(action==='skip'){if(!host||!['choosing','playing'].includes(r.phase))throw fail(403,'只有房主可以跳过正在进行的回合');if(input.round!==r.round)throw fail(409,'已经进入下一轮，请确认后再操作');settle(r,'skip');changed=true;reset=true;return;}
        if(action==='choose'){if(!t||user.id!==t.drawer_id)throw fail(403,'只有本轮画手可以选题');if(input.round!==r.round)throw fail(409,'已经进入新的回合');if(!Number.isInteger(input.choice)||input.choice<0||input.choice>2)throw fail(400,'请选择给出的三个词之一');if(r.phase==='playing'&&t.selected_choice===input.choice)return;if(r.phase!=='choosing'||t.settled_at!==null)throw fail(409,'本轮题目已确定，不能重新选择');choose(r,input.choice);changed=true;reset=true;return;}
        if(!t||r.phase!=='playing'||t.settled_at!==null||input.round!==r.round)throw fail(409,'已进入新的回合，画板会自动同步');
        if(action==='guess'){
          if(user.id===t.drawer_id)throw fail(403,'这一轮你是画者');if(!JSON.parse(t.eligible).includes(user.id))throw fail(403,'你不在本轮猜题名单中');
          if(typeof input.text!=='string'||!input.text.trim()||Array.from(input.text.trim()).length>30||/[\p{Cc}\p{Cf}]/u.test(input.text))throw fail(400,'请输入1–30字，不要包含换行或隐藏字符');
          const prior=correct(r);if(prior.some(g=>g.user_id===user.id)){guessResult={correct:true,already:true};return;}
          const text=input.text.trim();participate(r,user.id);
          if(normalizeWord(text)===normalizeWord(t.answer)){
            db.prepare('INSERT INTO draw_correct VALUES(?,?,?,?,?)').run(token,r.round,user.id,prior.length+1,clock());guessResult={correct:true};
            if(prior.length+1===JSON.parse(t.eligible).length){settle(r,'all');reset=true;}
          }else{
            // Do not relay spellings that contain the answer, even after whitespace normalization.
            const safe=normalizeWord(text).includes(normalizeWord(t.answer))?'（这条猜测已隐藏）':text;
            db.prepare('INSERT INTO draw_messages(room_token,round,user_id,text,created_at) VALUES(?,?,?,?,?)').run(token,r.round,user.id,safe,clock());guessResult={correct:false};
          }
          changed=true;return;
        }
        if(!['stroke','clear','undo'].includes(action))throw fail(404,'未知画室操作');if(user.id!==t.drawer_id)throw fail(403,'这一轮只有画者可以操作画板');
        if(input.epoch!==t.canvas_epoch)throw fail(409,'画板已更新，正在同步新画板');
        if(action==='stroke'){
          const value=validStroke(input,r.canvas_height);if(db.prepare('SELECT 1 FROM draw_strokes WHERE room_token=? AND round=? AND op_id=?').get(token,r.round,value.opId))return;
          if(db.prepare('SELECT COUNT(*) n FROM draw_strokes WHERE room_token=? AND round=?').get(token,r.round).n>=1200||t.point_count+value.points.length>30000)throw fail(409,'本轮笔迹已满，可以清空后继续');
          db.prepare('INSERT INTO draw_strokes VALUES(?,?,?,?,?,?,?,?)').run(token,r.round,t.next_seq,value.opId,value.strokeId,value.color,value.size,JSON.stringify(value.points));
          db.prepare('UPDATE draw_rounds SET next_seq=next_seq+1,point_count=point_count+? WHERE room_token=? AND round=?').run(value.points.length,token,r.round);participate(r,user.id);stroke={round:r.round,epoch:t.canvas_epoch,seq:t.next_seq,...value};return;
        }
        if(action==='clear')db.prepare('DELETE FROM draw_strokes WHERE room_token=? AND round=?').run(token,r.round);
        else {const last=db.prepare('SELECT stroke_id FROM draw_strokes WHERE room_token=? AND round=? ORDER BY seq DESC LIMIT 1').get(token,r.round);if(last)db.prepare('DELETE FROM draw_strokes WHERE room_token=? AND round=? AND stroke_id=?').run(token,r.round,last.stroke_id);}
        const count=db.prepare('SELECT points FROM draw_strokes WHERE room_token=? AND round=?').all(token,r.round).reduce((n,s)=>n+JSON.parse(s.points).length,0);
        db.prepare('UPDATE draw_rounds SET canvas_epoch=canvas_epoch+1,point_count=? WHERE room_token=? AND round=?').run(count,token,r.round);changed=true;reset=true;
      });
      if(changed||stroke)db.prepare('UPDATE draw_rooms SET last_activity=? WHERE token=?').run(clock(),token);
      if(changed){db.prepare('UPDATE draw_rooms SET version=version+1 WHERE token=?').run(token);broadcast(token,reset?'snapshot':'state');}
      if(stroke)broadcast(token,'stroke',stroke);
      if(action==='stroke')return send(200,{ok:true});
      if(action==='leave')return send(200,{ok:true,left:true});
      return send(200,{...state(token,user.id,reset),...(guessResult?{guess:guessResult}:{})});
    }catch(e){return send(e.status||500,{error:e.status?e.message:'画室暂时无法完成操作，请稍后再试'});}
  }};
}
