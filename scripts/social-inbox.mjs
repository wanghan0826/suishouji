import {publicCommentVisible} from './comment-threads.mjs';
export function createSocialInbox({db,users}){
 db.exec('CREATE TABLE IF NOT EXISTS social_reads(user_id INTEGER NOT NULL,event_key TEXT NOT NULL,read_at INTEGER NOT NULL,PRIMARY KEY(user_id,event_key));');
 const fail=(status,message)=>Object.assign(Error(message),{status});
 function events(id){
  const since=Date.now()-90*86400000;
  const follows=db.prepare('SELECT f.follower_id,f.created_at,u.username FROM user_follows f JOIN site_users u ON u.id=f.follower_id WHERE f.following_id=? AND u.disabled=0 AND f.created_at>=? ORDER BY f.created_at DESC LIMIT 100').all(id,since).map(x=>({key:'follow:'+x.follower_id+':'+x.created_at,kind:'follow',username:x.username,created_at:x.created_at,text:'关注了你，看看对方的空间，遇到同频的人就回关吧。',href:'/u/'+x.username}));
  const notes=db.prepare('SELECT d.id,d.text,d.created_at,u.username FROM space_danmaku d JOIN site_users u ON u.id=d.author_id WHERE d.user_id=? AND d.author_id<>? AND d.hidden=0 AND u.disabled=0 AND d.created_at>=? ORDER BY d.created_at DESC,d.id DESC LIMIT 100').all(id,id,since).map(x=>({key:'danmaku:'+x.id,kind:'danmaku',username:x.username,created_at:x.created_at,text:x.text,href:'/space'}));
  const comments=db.prepare(`SELECT c.id,c.text,c.created_at,c.post_id,u.username,CASE WHEN target.user_id=? AND ${publicCommentVisible('target')} THEN 'reply' ELSE 'comment' END kind FROM comments c JOIN posts p ON p.id=c.post_id JOIN site_users u ON u.id=c.user_id LEFT JOIN comments target ON target.id=c.parent_id AND target.post_id=c.post_id WHERE (p.user_id=? OR (target.user_id=? AND ${publicCommentVisible('target')})) AND c.user_id<>? AND u.disabled=0 AND c.created_at>=? AND ${publicCommentVisible('c')} AND NOT EXISTS(SELECT 1 FROM admin_archive a WHERE a.kind='post' AND a.item_id=p.id) ORDER BY c.created_at DESC,c.id DESC LIMIT 100`).all(id,id,id,id,since).map(x=>({key:'comment:'+x.id,kind:x.kind,username:x.username,created_at:x.created_at,text:x.text,href:'/post/'+x.post_id+'#comment-'+x.id}));
  const reads=new Set(db.prepare('SELECT event_key FROM social_reads WHERE user_id=?').all(id).map(x=>x.event_key));
  return [...follows,...notes,...comments].sort((a,b)=>b.created_at-a.created_at||a.key.localeCompare(b.key)).slice(0,100).map(x=>({...x,read:reads.has(x.key)}));
 }
 return {async handle(req,res){const path=new URL(req.url,'http://local').pathname;if(!path.startsWith('/api/social/'))return false;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));return true;};
  try{
   const user=users.currentUser(req);if(!user)throw fail(401,'请先登录查看消息');
   if(path==='/api/social/inbox'&&req.method==='GET'){const all=events(user.id);return send(200,{items:all.slice(0,100),unread:all.filter(x=>!x.read).length,limit:100,days:90});}
   if(path!=='/api/social/read'||req.method!=='POST')throw fail(404,'接口不存在');users.requireUser(req);
   if(!String(req.headers['content-type']||'').startsWith('application/json'))throw fail(415,'请求格式无效');let bytes=0,chunks=[];for await(const c of req){bytes+=c.length;if(bytes>8192)throw fail(413,'请求过大');chunks.push(c);}let input;try{input=JSON.parse(Buffer.concat(chunks).toString());}catch{throw fail(400,'请求格式无效');}
   if(!input||!Array.isArray(input.keys)||input.keys.length>100||input.keys.some(x=>typeof x!=='string'||x.length>100))throw fail(400,'消息格式无效');
   const valid=new Set(events(user.id).map(x=>x.key)),mark=db.prepare('INSERT OR IGNORE INTO social_reads VALUES(?,?,?)');for(const key of input.keys)if(valid.has(key))mark.run(user.id,key,Date.now());
   db.prepare('DELETE FROM social_reads WHERE user_id=? AND read_at<?').run(user.id,Date.now()-90*86400000);return send(200,{ok:true});
  }catch(e){return send(e.status||500,{error:e.status?e.message:'消息暂时无法加载'});}
 }};
}
