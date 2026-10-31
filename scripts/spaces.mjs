export const DEFAULT_SPACE_VISIBILITY='mutual';
export function ensureSpaces(db){db.exec(`CREATE TABLE IF NOT EXISTS user_spaces(user_id INTEGER PRIMARY KEY,title TEXT NOT NULL DEFAULT '',bio TEXT NOT NULL DEFAULT '',visibility TEXT NOT NULL DEFAULT '${DEFAULT_SPACE_VISIBILITY}',color TEXT NOT NULL DEFAULT 'mint');
CREATE TABLE IF NOT EXISTS user_follows(follower_id INTEGER NOT NULL,following_id INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(follower_id,following_id),CHECK(follower_id<>following_id));CREATE INDEX IF NOT EXISTS follows_target ON user_follows(following_id);
CREATE TABLE IF NOT EXISTS space_updates(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,text TEXT NOT NULL,created_at INTEGER NOT NULL,hidden INTEGER NOT NULL DEFAULT 0);CREATE INDEX IF NOT EXISTS space_updates_user ON space_updates(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS space_danmaku(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,author_id INTEGER NOT NULL,text TEXT NOT NULL,created_at INTEGER NOT NULL,hidden INTEGER NOT NULL DEFAULT 0);CREATE INDEX IF NOT EXISTS space_danmaku_user ON space_danmaku(user_id,created_at DESC);`);}
export function spaceAccess(db,owner,viewer){const mode=db.prepare('SELECT visibility FROM user_spaces WHERE user_id=?').get(owner)?.visibility||DEFAULT_SPACE_VISIBILITY;if(owner===viewer||mode==='public')return true;if(!viewer)return false;const follows=(a,b)=>!!db.prepare('SELECT 1 FROM user_follows WHERE follower_id=? AND following_id=?').get(a,b);return follows(viewer,owner)&&(mode==='followers'||follows(owner,viewer));}
export function createSpaces({db,users}){
 ensureSpaces(db);const fail=(status,message)=>Object.assign(Error(message),{status}),rates=new Map();
 function limit(id){const now=Date.now();for(const [k,v]of rates)if(v.until<now)rates.delete(k);const r=rates.get(id)||{n:0,until:now+60000};if(++r.n>30)throw fail(429,'操作太频繁，请稍后再试');rates.set(id,r);}
 async function body(req){if(!String(req.headers['content-type']||'').startsWith('application/json'))throw fail(415,'请求格式无效');let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>4096)throw fail(413,'请求过大');chunks.push(c);}try{const b=JSON.parse(Buffer.concat(chunks).toString());if(!b||typeof b!=='object'||Array.isArray(b))throw 0;return b;}catch{throw fail(400,'请求格式无效');}}
 return {async handle(req,res){const url=new URL(req.url,'http://local'),match=/^\/api\/spaces\/([a-zA-Z0-9_]{2,20})(?:\/(profile|follow|unfollow|updates|members|public-posts|danmaku)(?:\/(\d+))?)?$/.exec(url.pathname);if(!url.pathname.startsWith('/api/spaces/'))return false;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));return true;};
  try{
   if(!match)throw fail(404,'空间不存在');const viewer=users.currentUser(req),username=match[1].toLowerCase();if(username==='me'&&!viewer)throw fail(401,'请先登录，进入自己的空间');
   const owner=db.prepare('SELECT id,username FROM site_users WHERE username=? AND disabled=0').get(username==='me'?viewer.username:username);if(!owner)throw fail(404,'空间不存在');const id=owner.id,action=match[2],isOwner=viewer?.id===id,canAccess=spaceAccess(db,id,viewer?.id);
   if(req.method==='GET'){
    const page=Number(url.searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>10000)throw fail(400,'页码无效');
    if(!action){const profile=db.prepare('SELECT title,bio,visibility,color FROM user_spaces WHERE user_id=?').get(id)||{title:'',bio:'',visibility:DEFAULT_SPACE_VISIBILITY,color:'mint'};
     const following=!!viewer&&!!db.prepare('SELECT 1 FROM user_follows WHERE follower_id=? AND following_id=?').get(viewer.id,id),followedBy=!!viewer&&!!db.prepare('SELECT 1 FROM user_follows WHERE follower_id=? AND following_id=?').get(id,viewer.id);
     const followers=db.prepare('SELECT COUNT(*) n FROM user_follows f JOIN site_users u ON u.id=f.follower_id WHERE f.following_id=? AND u.disabled=0').get(id).n,followingCount=db.prepare('SELECT COUNT(*) n FROM user_follows f JOIN site_users u ON u.id=f.following_id WHERE f.follower_id=? AND u.disabled=0').get(id).n;
     return send(200,{username:owner.username,title:profile.title||owner.username+' 的空间',bio:canAccess?profile.bio:'',visibility:profile.visibility,color:profile.color,isOwner,canAccess,following,followedBy,mutual:following&&followedBy,followers,followingCount});
    }
    if(!canAccess)throw fail(viewer?403:401,'这个空间仅向'+((db.prepare('SELECT visibility FROM user_spaces WHERE user_id=?').get(id)?.visibility||DEFAULT_SPACE_VISIBILITY)==='mutual'?'互关的朋友':'粉丝')+'开放');
    if(action==='danmaku'){
     const updates=db.prepare("SELECT id,text,created_at FROM space_updates WHERE user_id=? AND hidden=0 ORDER BY created_at DESC,id DESC LIMIT 30").all(id).map(item=>({...item,kind:'update',username:owner.username,canHide:isOwner}));
     const messages=db.prepare('SELECT d.id,d.text,d.created_at,u.username,u.id author_id FROM space_danmaku d JOIN site_users u ON u.id=d.author_id WHERE d.user_id=? AND d.hidden=0 AND u.disabled=0 ORDER BY d.created_at DESC,d.id DESC LIMIT 30').all(id).map(({author_id,...item})=>({...item,kind:'message',canHide:isOwner||viewer?.id===author_id}));
     return send(200,{items:[...updates,...messages].sort((a,b)=>b.created_at-a.created_at||b.id-a.id).slice(0,60)});
    }
    if(action==='updates'){const total=db.prepare('SELECT COUNT(*) n FROM space_updates WHERE user_id=? AND hidden=0').get(id).n;return send(200,{total,page,pages:Math.max(1,Math.ceil(total/20)),items:db.prepare('SELECT id,text,created_at FROM space_updates WHERE user_id=? AND hidden=0 ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?').all(id,(page-1)*20)});}
    if(action==='public-posts'){const where="p.user_id=? AND NOT EXISTS(SELECT 1 FROM admin_archive a WHERE a.kind='post' AND a.item_id=p.id)";const total=db.prepare('SELECT COUNT(*) n FROM posts p WHERE '+where).get(id).n;return send(200,{total,page,pages:Math.max(1,Math.ceil(total/20)),items:db.prepare('SELECT p.id,p.text,p.created_at FROM posts p WHERE '+where+' ORDER BY p.created_at DESC,p.id DESC LIMIT 20 OFFSET ?').all(id,(page-1)*20)});}
    if(action==='members'){const type=url.searchParams.get('type')||'followers';if(!['followers','following'].includes(type))throw fail(400,'列表类型无效');const from=type==='followers'?'f.follower_id':'f.following_id',target=type==='followers'?'f.following_id':'f.follower_id';const total=db.prepare(`SELECT COUNT(*) n FROM user_follows f JOIN site_users u ON u.id=${from} WHERE ${target}=? AND u.disabled=0`).get(id).n;return send(200,{total,page,pages:Math.max(1,Math.ceil(total/30)),items:db.prepare(`SELECT u.username FROM user_follows f JOIN site_users u ON u.id=${from} WHERE ${target}=? AND u.disabled=0 ORDER BY f.created_at DESC,u.id DESC LIMIT 30 OFFSET ?`).all(id,(page-1)*30)});}
    throw fail(404,'接口不存在');
   }
   if(req.method!=='POST')throw fail(405,'请求方法不支持');const user=users.requireUser(req);limit(user.id);const input=await body(req);
   if(action==='follow'||action==='unfollow'){if(isOwner)throw fail(400,'不能关注自己');if(action==='follow')db.prepare('INSERT OR IGNORE INTO user_follows VALUES(?,?,?)').run(user.id,id,Date.now());else db.prepare('DELETE FROM user_follows WHERE follower_id=? AND following_id=?').run(user.id,id);return send(200,{ok:true});}
   if(action==='danmaku'){
    if(match[3]){const item=db.prepare('SELECT author_id FROM space_danmaku WHERE id=? AND user_id=?').get(Number(match[3]),id);if(!item)throw fail(404,'弹幕不存在');if(!isOwner&&item.author_id!==user.id)throw fail(403,'只能撤回自己的弹幕');db.prepare('UPDATE space_danmaku SET hidden=1 WHERE id=? AND user_id=?').run(Number(match[3]),id);return send(200,{ok:true});}
    if(!canAccess)throw fail(403,'获得空间访问权限后才能留言');
    if(typeof input.text!=='string'||!input.text.trim()||input.text.trim().length>80)throw fail(400,'请填写1–80字的弹幕');
    const last=db.prepare('SELECT created_at FROM space_danmaku WHERE user_id=? AND author_id=? ORDER BY id DESC LIMIT 1').get(id,user.id);if(last&&Date.now()-last.created_at<10000)throw fail(429,'让弹幕飞一会儿，10秒后再发一条');
    const result=db.prepare('INSERT INTO space_danmaku(user_id,author_id,text,created_at) VALUES(?,?,?,?)').run(id,user.id,input.text.trim(),Date.now());return send(200,{ok:true,id:Number(result.lastInsertRowid)});
   }
   if(!isOwner)throw fail(403,'只能管理自己的空间');
   if(action==='profile'){if(typeof input.title!=='string'||input.title.length>40||typeof input.bio!=='string'||input.bio.length>140||!['public','followers','mutual'].includes(input.visibility)||!['mint','sky','rose','sand'].includes(input.color))throw fail(400,'空间设置格式无效');db.prepare('INSERT INTO user_spaces VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET title=excluded.title,bio=excluded.bio,visibility=excluded.visibility,color=excluded.color').run(id,input.title.trim(),input.bio.trim(),input.visibility,input.color);return send(200,{ok:true});}
   if(action==='updates'&&match[3]){const r=db.prepare('UPDATE space_updates SET hidden=1 WHERE id=? AND user_id=?').run(Number(match[3]),id);if(!r.changes)throw fail(404,'动态不存在');return send(200,{ok:true});}
   if(action==='updates'){if(typeof input.text!=='string'||!input.text.trim()||input.text.trim().length>500)throw fail(400,'请填写1–500字的动态');const r=db.prepare('INSERT INTO space_updates(user_id,text,created_at) VALUES(?,?,?)').run(id,input.text.trim(),Date.now());return send(200,{ok:true,id:Number(r.lastInsertRowid)});}
   throw fail(404,'接口不存在');
  }catch(e){return send(e.status||500,{error:e.status?e.message:'空间暂时无法访问，请稍后再试'});}
 }};
}
