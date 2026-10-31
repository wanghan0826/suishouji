import crypto from 'node:crypto';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),day=now=>new Date(now+8*3600000).toISOString().slice(0,10),age=7*86400000;
const cookieName=local=>local?'sj_invite_local':'__Host-sj_invite';
function visitor(req,local){const raw=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName(local)+'='))?.slice(cookieName(local).length+1);return /^[a-f0-9]{64}$/.test(raw||'')?raw:null;}
export function ensureInvitationSchema(db){db.exec(`CREATE TABLE IF NOT EXISTS invitation_visits(visitor_hash TEXT PRIMARY KEY,inviter_id INTEGER NOT NULL,visited_at INTEGER NOT NULL,registered_user_id INTEGER UNIQUE,registered_at INTEGER,mutual_at INTEGER,first_note_at INTEGER);CREATE INDEX IF NOT EXISTS invitation_visit_date ON invitation_visits(visited_at);`);}
export function claimInvitation(db,req,userId,localHttp){const raw=visitor(req,localHttp);if(!raw)return;db.prepare('UPDATE invitation_visits SET registered_user_id=?,registered_at=? WHERE visitor_hash=? AND registered_user_id IS NULL AND inviter_id<>? AND visited_at>=? AND EXISTS(SELECT 1 FROM site_users u WHERE u.id=inviter_id AND u.disabled=0)').run(userId,Date.now(),hash(raw),userId,Date.now()-age);}
export function recordInvitationMutual(db,a,b){db.prepare(`UPDATE invitation_visits SET mutual_at=? WHERE mutual_at IS NULL AND ((inviter_id=? AND registered_user_id=?) OR (inviter_id=? AND registered_user_id=?)) AND EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=inviter_id AND f.following_id=registered_user_id) AND EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=registered_user_id AND f.following_id=inviter_id)`).run(Date.now(),a,b,b,a);}
export function recordInvitationNote(db,owner,author){db.prepare('UPDATE invitation_visits SET first_note_at=? WHERE inviter_id=? AND registered_user_id=? AND mutual_at IS NOT NULL AND first_note_at IS NULL').run(Date.now(),owner,author);}
export function readInvitationAnalytics(db,now=Date.now()){
 const since=Date.parse(day(now-29*86400000)+'T00:00:00+08:00');
 const rows=db.prepare(`SELECT v.visited_at,v.registered_at,v.mutual_at,v.first_note_at,CASE WHEN u.id IS NOT NULL AND u.disabled=0 THEN 1 ELSE 0 END valid FROM invitation_visits v LEFT JOIN site_users u ON u.id=v.registered_user_id WHERE v.visited_at>=?`).all(since);
 const days=Array.from({length:30},(_,i)=>({day:day(now-(29-i)*86400000),visitors:0,registrations:0,mutual:0,notes:0})),totals={visitors:0,registrations:0,mutual:0,notes:0};
 for(const r of rows){const d=days.find(x=>x.day===day(r.visited_at));if(!d)continue;for(const [key,value]of Object.entries({visitors:1,registrations:r.valid&&r.registered_at?1:0,mutual:r.valid&&r.mutual_at?1:0,notes:r.valid&&r.first_note_at?1:0})){d[key]+=value;totals[key]+=value;}}
 return {days,totals,window:30,attributionDays:7};
}
export function createInvitationTracking({db,users,origin,localHttp}){
 ensureInvitationSchema(db);let lastClean=0;
 return {async handle(req,res){if(new URL(req.url,'http://local').pathname!=='/api/invitations/visit')return false;const send=(status,data,extra={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(data));return true;};
  if(req.method!=='POST')return send(405,{error:'请求方法无效'});if(req.headers.origin!==origin||!String(req.headers['content-type']||'').startsWith('application/json'))return send(403,{error:'请求来源无效'});
  let input;try{let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>256)return send(413,{error:'请求过大'});chunks.push(c);}input=JSON.parse(Buffer.concat(chunks).toString());}catch{return send(400,{error:'请求格式无效'});}
  if(!input||typeof input.username!=='string'||!/^[a-zA-Z0-9_]{3,20}$/.test(input.username))return send(400,{error:'邀请地址无效'});
  if(users.currentUser(req)||/bot|crawler|spider|headless/i.test(req.headers['user-agent']||''))return send(200,{ok:true});
  const inviter=db.prepare('SELECT id FROM site_users WHERE username=? AND disabled=0').get(input.username.toLowerCase());if(!inviter)return send(404,{error:'空间不存在'});
  const now=Date.now();if(now-lastClean>86400000){db.prepare('DELETE FROM invitation_visits WHERE visited_at<?').run(now-90*86400000);lastClean=now;}
  let raw=visitor(req,localHttp),prior=raw&&db.prepare('SELECT visited_at FROM invitation_visits WHERE visitor_hash=?').get(hash(raw));if(prior&&now-prior.visited_at<age)return send(200,{ok:true});raw=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO invitation_visits(visitor_hash,inviter_id,visited_at) VALUES(?,?,?)').run(hash(raw),inviter.id,now);
  return send(200,{ok:true},{'Set-Cookie':cookieName(localHttp)+'='+raw+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800'+(localHttp?'':'; Secure')});
 }};
}
