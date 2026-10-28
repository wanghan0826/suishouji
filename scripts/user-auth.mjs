import crypto from 'node:crypto';import {promisify} from 'node:util';
const scrypt=promisify(crypto.scrypt),digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);};
const error=(status,message)=>Object.assign(Error(message),{status});
export function ensureUserSchema(db){
 db.exec(`CREATE TABLE IF NOT EXISTS site_users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL UNIQUE,salt TEXT NOT NULL,password_hash TEXT NOT NULL,disabled INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,last_login INTEGER NOT NULL,registration_ip TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS user_sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS user_sessions_user ON user_sessions(user_id);
 CREATE TABLE IF NOT EXISTS user_access(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,event TEXT NOT NULL,ip TEXT NOT NULL,created_at INTEGER NOT NULL);`);
 for(const table of ['posts','comments'])if(db.prepare("SELECT 1 FROM sqlite_master WHERE name=?").get(table)&&!db.prepare('PRAGMA table_info('+table+')').all().some(x=>x.name==='user_id'))db.exec('ALTER TABLE '+table+' ADD COLUMN user_id INTEGER');
}
export function createUserAuth({db,origin,localHttp=false,trustProxy=false}){
 ensureUserSchema(db);
 const cookieName=localHttp?'sj_user_local':'__Host-sj_user',age=7*86400;
 let busy=0,lastClean=0;const buckets=new Map();
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const send=(res,status,body,extra={})=>{res.writeHead(status,{...headers,...extra});res.end(JSON.stringify(body));};
 const ip=req=>{const peer=req.socket.remoteAddress||'';if(!trustProxy)return peer;return String(req.headers['x-forwarded-for']||'').split(',').map(x=>x.trim()).filter(Boolean).at(-1)||peer;};
 function throttle(key,max,ms){const now=Date.now();let row=buckets.get(key);if(!row||row.until<=now){if(buckets.size>10000)for(const [k,v] of buckets)if(v.until<=now)buckets.delete(k);if(buckets.size>10000)throw error(429,'请求过多，请稍后再试');row={count:0,until:now+ms};buckets.set(key,row);}if(++row.count>max)throw error(429,'尝试过多，请稍后再试');}
 function encrypted(req){return localHttp||req.socket.encrypted||((trustProxy||['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))&&req.headers['x-forwarded-proto']==='https');}
 function mutate(req,json=true){if(!encrypted(req))throw error(426,'请通过 HTTPS 登录和发布');if(req.headers.origin!==origin)throw error(403,'请求来源不正确，请刷新页面');if(json&&!String(req.headers['content-type']||'').startsWith('application/json'))throw error(415,'请求格式不正确');}
 async function body(req){let text='',size=0;for await(const chunk of req){size+=chunk.length;if(size>4096)throw error(413,'请求过大');text+=chunk;}try{return JSON.parse(text);}catch{throw error(400,'请求格式不正确');}}
 async function derive(password,salt){if(busy>=2)throw error(429,'登录服务繁忙，请稍后再试');busy++;try{return (await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024})).toString('hex');}finally{busy--;}}
 const passwordValid=p=>typeof p==='string'&&p.length>=6&&p.length<=128;
 const newPasswordValid=p=>passwordValid(p)&&p.length<=12;
 const publicUser=u=>({id:u.id,username:u.username});
 function session(req){const raw=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!raw||!/^[A-Za-z0-9_-]{43}$/.test(raw))return null;return db.prepare('SELECT u.id,u.username,u.disabled,s.csrf FROM user_sessions s JOIN site_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(digest(raw),Date.now())||null;}
 const cookie=(value,seconds)=>`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${localHttp?'':'; Secure'}`;
 function issue(user,res){const raw=crypto.randomBytes(32).toString('base64url'),csrf=crypto.randomBytes(32).toString('base64url');db.prepare('DELETE FROM user_sessions WHERE token_hash IN (SELECT token_hash FROM user_sessions WHERE user_id=? ORDER BY expires_at DESC LIMIT -1 OFFSET 4)').run(user.id);db.prepare('INSERT INTO user_sessions VALUES(?,?,?,?)').run(digest(raw),user.id,csrf,Date.now()+age*1000);send(res,200,{user:publicUser(user),csrf},{'Set-Cookie':cookie(raw,age)});}
 function clean(){if(Date.now()-lastClean<300000)return;lastClean=Date.now();db.prepare('DELETE FROM user_sessions WHERE expires_at<?').run(Date.now());db.prepare('DELETE FROM user_access WHERE created_at<?').run(Date.now()-30*86400000);}
 function requireUser(req){const u=session(req);if(!u)throw error(401,'请先登录后再操作');if(u.disabled)throw error(403,'账号已被封禁，请联系站主');mutate(req,false);if(!equal(String(req.headers['x-sj-csrf']||''),u.csrf))throw error(403,'登录凭据已更新，请刷新页面重试');return u;}
 async function handle(req,res){const p=new URL(req.url,'http://internal').pathname;if(!p.startsWith('/api/auth/'))return false;
  try{clean();
   if(p==='/api/auth/status'&&req.method==='GET'){const u=encrypted(req)?session(req):null;send(res,200,{user:u&&!u.disabled?publicUser(u):null,csrf:u&&!u.disabled?u.csrf:null});return true;}
   if(req.method!=='POST')throw error(404,'接口不存在');mutate(req);const input=await body(req);
   if(p==='/api/auth/register'||p==='/api/auth/login'){
    const username=typeof input.username==='string'?input.username.trim().toLowerCase():'';
    throttle('ip:'+ip(req),20,600000);throttle('account:'+digest(username),12,600000);
    if(!/^[a-z0-9_]{3,20}$/.test(username))throw error(400,'用户名须为3至20位字母、数字或下划线');
    if(p.endsWith('/register')?!newPasswordValid(input.password):!passwordValid(input.password))throw error(400,p.endsWith('/register')?'密码须为6至12位':'请输入有效密码');
    const user=db.prepare('SELECT * FROM site_users WHERE username=?').get(username);
    if(p.endsWith('/register')){
     if(input.accept!==true)throw error(400,'请先确认账号记录说明');
     if(['admin','administrator','root','system','support'].includes(username))throw error(400,'请换一个用户名');
     throttle('register:'+ip(req),5,86400000);if(user)throw error(409,'用户名已被使用');
     const salt=crypto.randomBytes(16).toString('hex'),hash=await derive(input.password,salt),now=Date.now();
     let id;try{id=Number(db.prepare('INSERT INTO site_users(username,salt,password_hash,created_at,last_login,registration_ip) VALUES(?,?,?,?,?,?)').run(username,salt,hash,now,now,ip(req)).lastInsertRowid);}catch(e){if(String(e.message).includes('UNIQUE'))throw error(409,'用户名已被使用');throw e;}
     db.prepare('INSERT INTO user_access(user_id,event,ip,created_at) VALUES(?,?,?,?)').run(id,'register',ip(req),now);issue({id,username},res);return true;
    }
    const hash=await derive(input.password,user?.salt||'0'.repeat(32));
    if(!user||!equal(hash,user.password_hash))throw error(401,'用户名或密码不正确');if(user.disabled)throw error(403,'账号已被封禁，请联系站主');
    db.prepare('UPDATE site_users SET last_login=? WHERE id=?').run(Date.now(),user.id);db.prepare('INSERT INTO user_access(user_id,event,ip,created_at) VALUES(?,?,?,?)').run(user.id,'login',ip(req),Date.now());issue(user,res);return true;
   }
   const user=requireUser(req);
   if(p==='/api/auth/logout'){db.prepare('DELETE FROM user_sessions WHERE user_id=? AND csrf=?').run(user.id,user.csrf);send(res,200,{ok:true},{'Set-Cookie':cookie('',0)});return true;}
   if(p==='/api/auth/password'){
    throttle('password:'+user.id,6,600000);if(!newPasswordValid(input.password))throw error(400,'新密码须为6至12位');if(!passwordValid(input.currentPassword))throw error(400,'当前密码不正确');const account=db.prepare('SELECT * FROM site_users WHERE id=?').get(user.id);
    if(!equal(await derive(input.currentPassword,account.salt),account.password_hash))throw error(401,'当前密码不正确');
    const salt=crypto.randomBytes(16).toString('hex'),hash=await derive(input.password,salt);db.prepare('UPDATE site_users SET salt=?,password_hash=? WHERE id=?').run(salt,hash,user.id);db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(user.id);issue(user,res);return true;
   }
   throw error(404,'接口不存在');
  }catch(e){send(res,e.status||500,{error:e.status?e.message:'暂时无法完成操作，请稍后重试'});return true;}
 }
 function authorizeWrite(req,res){if(req.method!=='POST'||!/^\/api\/(?:posts(?:\/\d+\/(?:comments|heart))?|checkin)$/.test(new URL(req.url,'http://internal').pathname))return true;
  try{req.siteUser=requireUser(req);req.accountIp=ip(req);return true;}catch(e){send(res,e.status||500,{error:e.message});return false;}}
 return {handle,authorizeWrite,ip};
}
