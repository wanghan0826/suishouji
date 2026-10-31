import {visibleSpaceMessage} from './scripts/space-threads.mjs';
import {ensureSocialMetrics,readSocialMetrics} from './scripts/social-metrics.mjs';
import {ensureInvitationSchema,readInvitationAnalytics} from './scripts/invitations.mjs';
import {ensureSpaces} from './scripts/spaces.mjs';
import {ensureAnalytics,readAnalytics} from './scripts/analytics.mjs';
import {ensureUserSchema} from './scripts/user-auth.mjs';
import {ensureCommentThreads,readPublicComments,publicCommentVisible} from './scripts/comment-threads.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
const scrypt=promisify(crypto.scrypt);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const token=()=>crypto.randomBytes(32).toString('base64url');
const THEMES=new Set(['mood','daily','scene','food','vent','secret','game','campus','life','music','travel','tech']);
export const chinaDate=(now=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export async function createAccount(password,username='admin'){
  if(typeof password!=='string'||password.length<12||password.length>256)throw Error('密码须为12至256位');
  if(!/^[a-zA-Z0-9_-]{3,32}$/.test(username))throw Error('用户名须为3至32位字母、数字、下划线或连字符');
  const salt=crypto.randomBytes(16).toString('hex');
  const key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  return {version:1,username,salt,key:key.toString('hex')};
}
const constant=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);};
const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
function failure(status,message){return Object.assign(Error(message),{status});}
export function createAdminService({db,dataDir,publicDir,origin='https://example.com',allowLocalHttp=false,trustProxy=false,automaticTopic,sessionMs=8*3600000}){
  if(!db||!dataDir||!publicDir||typeof automaticTopic!=='function')throw Error('Missing admin service configuration');
  ensureUserSchema(db);
  ensureSpaces(db);ensureInvitationSchema(db);ensureSocialMetrics(db);
  ensureAnalytics(db);
  ensureCommentThreads(db);
  const expectedOrigin=new URL(origin).origin;
  if(new URL(expectedOrigin).protocol!=='https:'&&!allowLocalHttp)throw Error('Admin origin must use HTTPS');
  const cookieName=allowLocalHttp?'sj_admin_local':'__Host-sj_admin';
  const authFile=path.join(dataDir,'admin-auth.json');
  db.exec(`CREATE TABLE IF NOT EXISTS admin_archive(kind TEXT NOT NULL CHECK(kind IN ('post','comment')), item_id INTEGER NOT NULL, archived_at INTEGER NOT NULL, PRIMARY KEY(kind,item_id));
    CREATE TABLE IF NOT EXISTS admin_sessions(token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, username TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_topics(date TEXT PRIMARY KEY, topic TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_audit(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, created_at INTEGER NOT NULL);`);
  const cleanTimer=setInterval(()=>db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(Date.now()),300000);cleanTimer.unref();
  const attempts=new Map();
  const publicColumns='p.id,p.text,p.name,p.theme,p.media,p.media_type,p.hearts,p.topic,p.created_at';
  const visiblePost="NOT EXISTS(SELECT 1 FROM admin_archive a WHERE a.kind='post' AND a.item_id=p.id)";
  const visibleComment=publicCommentVisible();
  const headers={
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin',
    'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  };
  function json(res,status,data,extra={}){res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(data));}
  async function account(){try{const a=JSON.parse(await fs.readFile(authFile,'utf8'));if(a.version!==1||!a.username||!a.salt||!/^[a-f0-9]{128}$/.test(a.key))throw Error();return a;}catch(e){if(e.code==='ENOENT')return null;throw failure(503,'管理账户配置异常，请联系站主');}}
  function session(req){const cookies=String(req.headers.cookie||'').split(';').map(x=>x.trim());const raw=cookies.find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!raw||!/^[A-Za-z0-9_-]{43}$/.test(raw))return null;return db.prepare('SELECT * FROM admin_sessions WHERE token_hash=? AND expires_at>?').get(hash(raw),Date.now())||null;}
  const cookie=(value,age)=>`${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${allowLocalHttp?'':'; Secure'}`;
  function mutationOrigin(req){if(req.headers.origin!==expectedOrigin)throw failure(403,'请求来源校验失败，请刷新页面重试');if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw failure(415,'仅支持JSON请求');}
  async function body(req){if(Number(req.headers['content-length']||0)>8192)throw failure(413,'请求内容过大');let chunks=[],bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>8192)throw failure(413,'请求内容过大');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw failure(400,'请求内容不是有效JSON');}}
  const audit=(username,action,target)=>db.prepare('INSERT INTO admin_audit(username,action,target,created_at) VALUES(?,?,?,?)').run(username,action,String(target),Date.now());
  const pagination=url=>({limit:Math.min(50,Math.max(1,parseInt(url.searchParams.get('limit')||'20',10)||20)),page:Math.max(1,Math.min(100000,parseInt(url.searchParams.get('page')||'1',10)||1))});
  const checkId=s=>{const id=Number(s);if(!Number.isSafeInteger(id)||id<1)throw failure(400,'无效编号');return id;};
  const currentTopic=()=>{const date=chinaDate();return {date,topic:db.prepare('SELECT topic FROM admin_topics WHERE date=?').get(date)?.topic||automaticTopic().topic};};
  async function handle(req,res){
    const url=new URL(req.url,'http://internal'),p=url.pathname;
    if(!p.startsWith('/admin')&&!p.startsWith('/api/admin'))return false;
    try{
      if(['/admin','/admin/','/admin/index.html','/admin/admin.css','/admin/admin.js'].includes(p)&&req.method==='GET'){
        const name=p.endsWith('.css')?'admin.css':p.endsWith('.js')?'admin.js':'index.html';
        const data=await fs.readFile(path.join(publicDir,'admin',name));
        res.writeHead(200,{...headers,'Content-Type':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8'});res.end(data);return true;
      }
      if(!p.startsWith('/api/admin/')){json(res,404,{error:'未找到页面'});return true;}
      const peer=req.socket.remoteAddress||'';
      const encrypted=req.socket.encrypted||((trustProxy||['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer))&&req.headers['x-forwarded-proto']==='https');
      if(!allowLocalHttp&&!encrypted)throw failure(426,'请使用HTTPS访问管理端');
      if(p==='/api/admin/status'&&req.method==='GET'){const a=await account(),s=session(req);json(res,200,{configured:!!a,authenticated:!!s,...(s?{username:s.username,csrf:s.csrf}:{}),secure:!allowLocalHttp});return true;}
      if(p==='/api/admin/login'&&req.method==='POST'){
        mutationOrigin(req);const a=await account();if(!a)throw failure(503,'管理账户尚未启用，请由站主先完成账户设置');
        const ip=req.socket.remoteAddress||'unknown',now=Date.now();
        for(const [key,v] of attempts)if(v.until<=now)attempts.delete(key);
        let record=attempts.get(ip);if(!record){if(attempts.size>=1000)throw failure(429,'登录请求过多，请稍后再试');record={failures:0,until:now+600000};attempts.set(ip,record);}
        if(record.failures>=8)throw failure(429,'登录尝试过多，请10分钟后再试');
        const input=await body(req);if(typeof input.password!=='string'||input.password.length>256||typeof input.username!=='string')throw failure(400,'请填写用户名和密码');
        const key=await scrypt(input.password,a.salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
        if(!constant(input.username,a.username)||!constant(key.toString('hex'),a.key)){record.failures++;throw failure(401,'用户名或密码不正确');}
        attempts.delete(ip);db.prepare('DELETE FROM admin_sessions WHERE expires_at<?').run(now);
        // Bound simultaneous sessions; a fresh login never leaves unlimited valid cookies.
        db.prepare('DELETE FROM admin_sessions WHERE token_hash IN (SELECT token_hash FROM admin_sessions ORDER BY expires_at DESC LIMIT -1 OFFSET 4)').run();
        const raw=token(),csrf=token();db.prepare('INSERT INTO admin_sessions VALUES(?,?,?,?)').run(hash(raw),csrf,a.username,now+sessionMs);audit(a.username,'login','session');
        json(res,200,{ok:true,username:a.username,csrf},{'Set-Cookie':cookie(raw,Math.floor(sessionMs/1000))});return true;
      }
      const s=session(req);if(!s)throw failure(401,'登录已失效，请重新登录');
      if(!['GET','HEAD'].includes(req.method)){mutationOrigin(req);if(!constant(req.headers['x-csrf-token']||'',s.csrf))throw failure(403,'页面凭据已失效，请刷新重试');}
      if(p==='/api/admin/logout'&&req.method==='POST'){db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(s.token_hash);audit(s.username,'logout','session');json(res,200,{ok:true},{'Set-Cookie':cookie('',0)});return true;}
      if(p==='/api/admin/space-updates'&&req.method==='GET'){json(res,200,{items:db.prepare('SELECT s.id,s.text,s.created_at,s.hidden,u.username FROM space_updates s JOIN site_users u ON u.id=s.user_id ORDER BY s.id DESC LIMIT 30').all()});return true;}
      if(p==='/api/admin/space-danmaku'&&req.method==='GET'){json(res,200,{items:db.prepare(`SELECT d.id,d.text,d.created_at,d.hidden,CASE WHEN ${visibleSpaceMessage('d')} THEN 0 ELSE 1 END contextHidden,a.username,o.username space_owner FROM space_danmaku d JOIN site_users a ON a.id=d.author_id JOIN site_users o ON o.id=d.user_id ORDER BY d.id DESC LIMIT 30`).all()});return true;}
      const danmakuAction=/^\/api\/admin\/space-danmaku\/(\d+)\/(archive|restore)$/.exec(p);
      if(danmakuAction&&req.method==='POST'){const id=checkId(danmakuAction[1]);const r=db.prepare('UPDATE space_danmaku SET hidden=? WHERE id=?').run(danmakuAction[2]==='archive'?1:0,id);if(!r.changes)throw failure(404,'弹幕不存在');audit(s.username,'space_danmaku_'+danmakuAction[2],id);json(res,200,{ok:true});return true;}
      const spaceAction=/^\/api\/admin\/space-updates\/(\d+)\/(archive|restore)$/.exec(p);
      if(spaceAction&&req.method==='POST'){const id=checkId(spaceAction[1]);const r=db.prepare('UPDATE space_updates SET hidden=? WHERE id=?').run(spaceAction[2]==='archive'?1:0,id);if(!r.changes)throw failure(404,'动态不存在');audit(s.username,'space_'+spaceAction[2],id);json(res,200,{ok:true});return true;}
      if(p==='/api/admin/social-metrics'&&req.method==='GET'){json(res,200,readSocialMetrics(db));return true;}
      if(p==='/api/admin/invitations'&&req.method==='GET'){json(res,200,readInvitationAnalytics(db));return true;}
      if(p==='/api/admin/analytics'&&req.method==='GET'){json(res,200,readAnalytics(db));return true;}
      if(p==='/api/admin/overview'&&req.method==='GET'){
        const start=Date.parse(chinaDate()+'T00:00:00+08:00');
        const scalar=(q,...args)=>Number(db.prepare(q).get(...args).n);
        json(res,200,{posts:scalar(`SELECT count(*) n FROM posts p WHERE ${visiblePost}`),comments:scalar(`SELECT count(*) n FROM comments c JOIN posts p ON p.id=c.post_id WHERE ${visiblePost} AND ${visibleComment}`),images:scalar(`SELECT count(*) n FROM posts p WHERE p.media_type='image' AND p.media<>'' AND ${visiblePost}`),todayPosts:scalar(`SELECT count(*) n FROM posts p WHERE p.created_at>=? AND ${visiblePost}`,start),archived:scalar('SELECT count(*) n FROM admin_archive'),topic:currentTopic(),recent:db.prepare(`SELECT ${publicColumns} FROM posts p WHERE ${visiblePost} ORDER BY p.created_at DESC,p.id DESC LIMIT 5`).all(),audit:db.prepare('SELECT action,target,created_at FROM admin_audit ORDER BY id DESC LIMIT 8').all()});return true;
      }
      if((p==='/api/admin/posts'||p==='/api/admin/comments')&&req.method==='GET'){
        const isPost=p.endsWith('/posts'),{limit,page}=pagination(url);let condition=[],args=[];
        const state=url.searchParams.get('state')||'visible';if(!['all','visible','archived'].includes(state))throw failure(400,'无效状态');
        const kind=isPost?'post':'comment',alias=isPost?'p':'c',visible=isPost?visiblePost:visibleComment;
        if(state!=='all')condition.push(state==='visible'?visible:`NOT (${visible})`);
        const q=(url.searchParams.get('q')||'').trim();if(q.length>80)throw failure(400,'搜索内容过长');
        if(q){condition.push(`(${alias}.text LIKE ? ESCAPE '\\' OR ${alias}.name LIKE ? ESCAPE '\\')`);const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';args.push(pattern,pattern);}
        const theme=url.searchParams.get('theme');if(isPost&&theme){if(!THEMES.has(theme))throw failure(400,'无效主题');condition.push('p.theme=?');args.push(theme);}
        const where=condition.length?' WHERE '+condition.join(' AND '):'';
        const from=isPost?'posts p':'comments c JOIN posts p ON p.id=c.post_id';
        const columns=isPost?`${publicColumns},p.user_id,(SELECT count(*) FROM comments c WHERE c.post_id=p.id AND ${visibleComment}) comment_count`:'c.id,c.post_id,c.text,c.name,c.created_at,c.user_id,c.parent_id,c.thread_id,p.text post_text';
        const total=Number(db.prepare(`SELECT count(*) n FROM ${from}${where}`).get(...args).n);
        const items=db.prepare(`SELECT ${columns},EXISTS(SELECT 1 FROM admin_archive a WHERE a.kind='${kind}' AND a.item_id=${alias}.id) archived FROM ${from}${where} ORDER BY ${alias}.created_at DESC,${alias}.id DESC LIMIT ? OFFSET ?`).all(...args,limit,(page-1)*limit);
        json(res,200,{items,total,page,limit});return true;
      }
      const action=p.match(/^\/api\/admin\/(posts|comments)\/(\d+)\/(archive|restore)$/);
      if(action&&req.method==='POST'){
        await body(req);const id=checkId(action[2]),kind=action[1]==='posts'?'post':'comment',table=kind==='post'?'posts':'comments';
        if(!db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id))throw failure(404,'内容不存在');
        db.exec('BEGIN IMMEDIATE');try{if(action[3]==='archive')db.prepare('INSERT INTO admin_archive VALUES(?,?,?) ON CONFLICT DO NOTHING').run(kind,id,Date.now());else db.prepare('DELETE FROM admin_archive WHERE kind=? AND item_id=?').run(kind,id);audit(s.username,action[3],kind+':'+id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
        json(res,200,{ok:true});return true;
      }
      if(p==='/api/admin/users'&&req.method==='GET'){
        const {limit,page}=pagination(url),q=(url.searchParams.get('q')||'').trim();if(q.length>40)throw failure(400,'搜索内容过长');
        const where=q?' WHERE instr(u.username,?)>0 OR CAST(u.id AS TEXT)=?':'',args=q?[q.toLowerCase(),q]:[];
        const total=Number(db.prepare('SELECT count(*) n FROM site_users u'+where).get(...args).n);
        const items=db.prepare('SELECT u.id,u.username,u.disabled,u.created_at,u.last_login,(SELECT count(*) FROM posts WHERE user_id=u.id) posts,(SELECT count(*) FROM comments WHERE user_id=u.id) comments FROM site_users u'+where+' ORDER BY u.id DESC LIMIT ? OFFSET ?').all(...args,limit,(page-1)*limit);
        json(res,200,{items,total,page,limit});return true;
      }
      const userAction=p.match(/^\/api\/admin\/users\/(\d+)(?:\/(ban|unban))?$/);
      if(userAction){
        const id=checkId(userAction[1]),user=db.prepare('SELECT id,username,disabled,created_at,last_login,registration_ip FROM site_users WHERE id=?').get(id);
        if(!user)throw failure(404,'账号不存在');
        if(req.method==='GET'&&!userAction[2]){json(res,200,{user,posts:db.prepare('SELECT id,text,created_at FROM posts WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(id),comments:db.prepare('SELECT id,post_id,text,created_at FROM comments WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(id),access:db.prepare('SELECT event,ip,created_at FROM user_access WHERE user_id=? AND created_at>? ORDER BY id DESC LIMIT 30').all(id,Date.now()-30*86400000)});return true;}
        if(req.method==='POST'&&userAction[2]){await body(req);db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE site_users SET disabled=? WHERE id=?').run(userAction[2]==='ban'?1:0,id);if(userAction[2]==='ban')db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(id);audit(s.username,userAction[2],'user:'+id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}json(res,200,{ok:true});return true;}
      }
      if(p==='/api/admin/topics'&&req.method==='GET'){const items=db.prepare('SELECT date,topic,updated_at FROM admin_topics WHERE date>=? ORDER BY date LIMIT 90').all(chinaDate());json(res,200,{items,current:currentTopic(),today:chinaDate(),automatic:automaticTopic().topic});return true;}
      const topic=p.match(/^\/api\/admin\/topics\/(\d{4}-\d{2}-\d{2})$/);
      if(topic&&['PUT','DELETE'].includes(req.method)){
        const date=topic[1];if(!validDate(date)||date<chinaDate())throw failure(400,'请选择今天或未来的有效日期');
        const input=await body(req);
        db.exec('BEGIN IMMEDIATE');try{if(req.method==='PUT'){const text=String(input.topic||'').trim();if(!text||text.length>80)throw failure(400,'话题须为1至80字');db.prepare('INSERT INTO admin_topics VALUES(?,?,?) ON CONFLICT(date) DO UPDATE SET topic=excluded.topic,updated_at=excluded.updated_at').run(date,text,Date.now());}else db.prepare('DELETE FROM admin_topics WHERE date=?').run(date);audit(s.username,req.method==='PUT'?'topic_set':'topic_auto',date);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
        json(res,200,{ok:true,current:currentTopic()});return true;
      }
      json(res,404,{error:'管理接口不存在'});return true;
    }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'操作暂未完成，请稍后重试'});else res.end();return true;}
  }
  // Only moderate public reads and block interactions on archived content.
  // Existing publishing, uploads, check-ins and visible-post likes stay in the original server.
  function handlePublic(req,res){
    const url=new URL(req.url,'http://internal'),p=url.pathname;
    if(p==='/api/topic'&&req.method==='GET'){json(res,200,currentTopic());return true;}
    if(p==='/api/posts'&&req.method==='GET'){
      let conditions=[visiblePost],args=[];const theme=url.searchParams.get('theme'),topic=url.searchParams.get('topic');
      const before=Number(url.searchParams.get('before')||Date.now()+1000);if(!Number.isFinite(before)){json(res,400,{error:'无效分页时间'});return true;}
      conditions.push('p.created_at<?');args.push(before);
      if(topic){conditions.push('p.topic=?');args.push(topic);}else if(theme&&THEMES.has(theme)){conditions.push('p.theme=?');args.push(theme);}
      const limit=Math.min(200,Math.max(1,parseInt(url.searchParams.get('limit')||'60',10)||60));
      json(res,200,{posts:db.prepare(`SELECT ${publicColumns} FROM posts p WHERE ${conditions.join(' AND ')} ORDER BY p.created_at DESC,p.id DESC LIMIT ?`).all(...args,limit)});return true;
    }
    if(p==='/api/hot'&&req.method==='GET'){json(res,200,{posts:db.prepare(`SELECT ${publicColumns} FROM posts p WHERE p.created_at>? AND p.hearts>0 AND ${visiblePost} ORDER BY p.hearts DESC,p.created_at DESC LIMIT 10`).all(Date.now()-7*86400000)});return true;}
    const match=p.match(/^\/api\/posts\/(\d+)(?:\/(comments|heart))?$/);
    if(match){
      const id=Number(match[1]);if(!Number.isSafeInteger(id)||db.prepare("SELECT 1 FROM admin_archive WHERE kind='post' AND item_id=?").get(id)){json(res,404,{error:'帖子不存在或已下架'});return true;}
      if(!match[2]&&req.method==='GET'){
        const post=db.prepare(`SELECT ${publicColumns} FROM posts p WHERE p.id=? AND ${visiblePost}`).get(id);
        json(res,post?200:404,post?{post}:{error:'帖子不存在或已下架'});return true;
      }
      if(match[2]==='comments'&&req.method==='GET'){
        json(res,200,{comments:readPublicComments(db,id)});return true;
      }
    }
    return false;
  }
  return {handle,handlePublic,currentTopic,close:()=>clearInterval(cleanTimer)};
}
