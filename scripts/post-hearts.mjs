const fail=(status,message)=>Object.assign(Error(message),{status});
export function ensurePostHearts(db){
 db.exec(`CREATE TABLE IF NOT EXISTS post_hearts(id INTEGER PRIMARY KEY AUTOINCREMENT,post_id INTEGER NOT NULL,user_id INTEGER NOT NULL,created_at INTEGER NOT NULL,UNIQUE(post_id,user_id));
 CREATE INDEX IF NOT EXISTS post_hearts_page ON post_hearts(post_id,id DESC);
 CREATE TABLE IF NOT EXISTS post_heart_history(post_id INTEGER PRIMARY KEY,count INTEGER NOT NULL);`);
 // Old counters never recorded identities; preserve them without inventing people.
 db.exec('INSERT OR IGNORE INTO post_heart_history SELECT p.id,MAX(0,COALESCE(p.hearts,0)-(SELECT COUNT(*) FROM post_hearts h WHERE h.post_id=p.id)) FROM posts p');
}
export function createPostHearts({db,users}){
 ensurePostHearts(db);
 const visible=id=>db.prepare("SELECT p.id,p.hearts FROM posts p WHERE p.id=? AND NOT EXISTS(SELECT 1 FROM admin_archive a WHERE a.kind='post' AND a.item_id=p.id)").get(id);
 const valid=value=>{const n=Number(value);if(!/^\d+$/.test(String(value))||!Number.isSafeInteger(n)||n<1)throw fail(400,'帖子编号无效');return n;};
 function summary(id,userId){const accounts=db.prepare('SELECT COUNT(*) n FROM post_hearts WHERE post_id=?').get(id).n,history=db.prepare('SELECT count FROM post_heart_history WHERE post_id=?').get(id)?.count||0;return {id,hearts:accounts+history,accountHearts:accounts,legacyHearts:history,liked:!!userId&&!!db.prepare('SELECT 1 FROM post_hearts WHERE post_id=? AND user_id=?').get(id,userId)};}
 return {handle(req,res){const url=new URL(req.url,'http://local'),batch=url.pathname==='/api/post-hearts',match=/^\/api\/posts\/(\d+)\/(heart|likes)$/.exec(url.pathname);if(!batch&&!match)return false;
 const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));return true;};
 try{if(batch){if(req.method!=='GET')throw fail(405,'仅支持读取');const raw=(url.searchParams.get('ids')||'').split(',');if(!raw.length||raw.length>100)throw fail(400,'一次最多查询100条帖子');const ids=[...new Set(raw.map(valid))],user=users.currentUser(req);return send(200,{items:ids.filter(visible).map(id=>summary(id,user?.id))});}
 const id=valid(match[1]);if(!visible(id))throw fail(404,'帖子不存在或已下架');
 if(match[2]==='heart'&&req.method==='POST'){
  const user=users.requireUser(req);db.exec('BEGIN IMMEDIATE');let added;
  try{db.prepare('INSERT OR IGNORE INTO post_heart_history SELECT p.id,MAX(0,p.hearts-(SELECT COUNT(*) FROM post_hearts h WHERE h.post_id=p.id)) FROM posts p WHERE p.id=?').run(id);added=!!db.prepare('INSERT OR IGNORE INTO post_hearts(post_id,user_id,created_at) VALUES(?,?,?)').run(id,user.id,Date.now()).changes;
   if(added)db.prepare('UPDATE posts SET hearts=hearts+1 WHERE id=?').run(id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  return send(200,{...summary(id,user.id),added});
 }
 if(match[2]!=='likes'||req.method!=='GET')throw fail(405,'请求方法无效');
 const before=url.searchParams.has('before')?valid(url.searchParams.get('before')):Number.MAX_SAFE_INTEGER;
 const rows=db.prepare('SELECT h.id,u.username FROM post_hearts h JOIN site_users u ON u.id=h.user_id WHERE h.post_id=? AND h.id<? ORDER BY h.id DESC LIMIT 31').all(id,before),items=rows.slice(0,30);
 return send(200,{...summary(id,users.currentUser(req)?.id),items:items.map(r=>({username:r.username})),nextBefore:rows.length>30?items.at(-1).id:null});
 }catch(e){return send(e.status||500,{error:e.status?e.message:'点赞暂时无法完成，请稍后重试'});}
 }};
}
