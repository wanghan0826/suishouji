export const FEEDBACK_STATUSES=['new','planned','building','done','closed'];
export const FEEDBACK_MODES=['any','solo','two','party'];
const DAY=86400000,fail=(status,message)=>Object.assign(Error(message),{status});
const dayStart=now=>Date.parse(new Date(now+8*3600000).toISOString().slice(0,10)+'T00:00:00+08:00');
const publicColumns='id,title,details,mode,status,reply,created_at,updated_at,version';
export function ensureGameFeedback(db){
  db.exec(`CREATE TABLE IF NOT EXISTS game_feedback(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,title TEXT NOT NULL,details TEXT NOT NULL DEFAULT '',mode TEXT NOT NULL DEFAULT 'any',status TEXT NOT NULL DEFAULT 'new',reply TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1,request_key TEXT NOT NULL,UNIQUE(user_id,request_key));
    CREATE INDEX IF NOT EXISTS feedback_user_date ON game_feedback(user_id,created_at);
    CREATE INDEX IF NOT EXISTS feedback_status_date ON game_feedback(status,created_at);`);
}
function text(value,max,label,{required=false,multiline=false}={}){
  if(typeof value!=='string')throw fail(400,'请填写有效的'+label);
  const result=value.trim();if((required&&!result)||Array.from(result).length>max||/[\p{Cc}\p{Cf}]/u.test(multiline?result.replace(/[\r\n\t]/g,''):result))throw fail(400,label+(required?'须为1–'+max+'字':'最多'+max+'字')+'，不要包含隐藏字符');return result;
}
export function submitGameFeedback(db,userId,input,now=Date.now()){
  const title=text(input.title,50,'游戏名称或想法',{required:true}),details=text(input.details??'',800,'玩法说明',{multiline:true}),mode=input.mode??'any',key=input.requestKey;
  if(!FEEDBACK_MODES.includes(mode)||typeof key!=='string'||!/^[a-f0-9]{32}$/.test(key))throw fail(400,'建议格式无效，请刷新页面后重试');
  db.exec('BEGIN IMMEDIATE');try{
    const previous=db.prepare(`SELECT ${publicColumns} FROM game_feedback WHERE user_id=? AND request_key=?`).get(userId,key);
    if(previous){if(previous.title!==title||previous.details!==details||previous.mode!==mode)throw fail(409,'这次提交的内容已变化，请重新提交当前建议');db.exec('COMMIT');return {item:previous,repeated:true};}
    const count=db.prepare('SELECT COUNT(*) n FROM game_feedback WHERE user_id=? AND created_at>=?').get(userId,dayStart(now)).n;
    if(count>=5)throw fail(429,'每天最多提交5条建议，已有建议可以在下方查看进度。');
    const id=Number(db.prepare('INSERT INTO game_feedback(user_id,title,details,mode,created_at,updated_at,request_key) VALUES(?,?,?,?,?,?,?)').run(userId,title,details,mode,now,now,key).lastInsertRowid),item=db.prepare(`SELECT ${publicColumns} FROM game_feedback WHERE id=?`).get(id);
    db.exec('COMMIT');return {item,repeated:false};
  }catch(e){db.exec('ROLLBACK');throw e;}
}
function pageNumber(value){const n=Number(value??1);if(!Number.isSafeInteger(n)||n<1||n>100000)throw fail(400,'页码无效');return n;}
export function readMyGameFeedback(db,userId,page=1,now=Date.now()){
  page=pageNumber(page);const total=db.prepare('SELECT COUNT(*) n FROM game_feedback WHERE user_id=?').get(userId).n,count=db.prepare('SELECT COUNT(*) n FROM game_feedback WHERE user_id=? AND created_at>=?').get(userId,dayStart(now)).n;
  return {items:db.prepare(`SELECT ${publicColumns} FROM game_feedback WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?`).all(userId,(page-1)*20),total,page,limit:20,remaining:Math.max(0,5-count)};
}
export function readAdminGameFeedback(db,{status='new',page=1}={}){
  if(status!=='all'&&!FEEDBACK_STATUSES.includes(status))throw fail(400,'建议状态无效');page=pageNumber(page);
  const counts=Object.fromEntries(FEEDBACK_STATUSES.map(s=>[s,0]));for(const row of db.prepare('SELECT status,COUNT(*) n FROM game_feedback GROUP BY status').all())if(Object.hasOwn(counts,row.status))counts[row.status]=row.n;
  const condition=status==='all'?'':' WHERE f.status=?',args=status==='all'?[]:[status],total=db.prepare('SELECT COUNT(*) n FROM game_feedback f'+condition).get(...args).n;
  return {items:db.prepare('SELECT f.'+publicColumns.split(',').join(',f.')+',u.username FROM game_feedback f JOIN site_users u ON u.id=f.user_id'+condition+' ORDER BY f.created_at DESC,f.id DESC LIMIT 20 OFFSET ?').all(...args,(page-1)*20),total,page,limit:20,counts};
}
export function updateGameFeedback(db,id,input,now=Date.now()){
  if(!input||typeof input!=='object'||Array.isArray(input))throw fail(400,'建议处理格式无效');
  if(!Number.isSafeInteger(id)||id<1)throw fail(400,'建议编号无效');if(!FEEDBACK_STATUSES.includes(input.status)||!Number.isSafeInteger(input.version)||input.version<1)throw fail(400,'建议状态或版本无效');
  const reply=text(input.reply??'',500,'站主回复',{multiline:true});
  const previous=db.prepare(`SELECT ${publicColumns} FROM game_feedback WHERE id=?`).get(id);if(!previous)throw fail(404,'没有找到这条建议');
  if(previous.status===input.status&&previous.reply===reply)return {item:previous,changed:false};
  const updated=db.prepare('UPDATE game_feedback SET status=?,reply=?,updated_at=?,version=version+1 WHERE id=? AND version=?').run(input.status,reply,now,id,input.version);
  if(!updated.changes)throw fail(409,'这条建议已被其他页面更新，请重新打开后处理');
  return {item:db.prepare(`SELECT ${publicColumns} FROM game_feedback WHERE id=?`).get(id),changed:true};
}
export function createGameFeedback({db,users}){
  ensureGameFeedback(db);
  return {async handle(req,res){
    const url=new URL(req.url,'http://local');if(!url.pathname.startsWith('/api/game-feedback'))return false;
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));return true;};
    try{
      if(url.pathname!=='/api/game-feedback')throw fail(404,'反馈地址无效');const user=req.method==='GET'?users.currentUser(req):users.requireUser(req);if(!user)throw fail(401,'登录后提交建议或查看处理进度');
      if(req.method==='GET')return send(200,readMyGameFeedback(db,user.id,url.searchParams.get('page')??1));
      if(req.method!=='POST')throw fail(405,'仅支持查看或提交建议');if(!String(req.headers['content-type']||'').startsWith('application/json'))throw fail(415,'建议格式无效');
      const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>8192)throw fail(413,'建议内容太长，请精简后重试');chunks.push(chunk);}
      let input;try{input=JSON.parse(Buffer.concat(chunks).toString());if(!input||typeof input!=='object'||Array.isArray(input))throw 0;}catch{throw fail(400,'建议格式无效');}
      return send(200,submitGameFeedback(db,user.id,input));
    }catch(e){return send(e.status||500,{error:e.status?e.message:'暂时无法处理建议，内容已保留，请稍后重试'});}
  }};
}
