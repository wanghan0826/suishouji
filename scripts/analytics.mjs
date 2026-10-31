import crypto from 'node:crypto';
const dayOf=now=>new Date(now+8*3600000).toISOString().slice(0,10);
export function ensureAnalytics(db){db.exec(`CREATE TABLE IF NOT EXISTS analytics_daily(day TEXT NOT NULL,visitor TEXT NOT NULL,post_id INTEGER NOT NULL,views INTEGER NOT NULL DEFAULT 0,shares INTEGER NOT NULL DEFAULT 0,cards INTEGER NOT NULL DEFAULT 0,last_view INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,visitor,post_id)); CREATE INDEX IF NOT EXISTS analytics_day ON analytics_daily(day);`);}
export function readAnalytics(db,now=Date.now()){
 const today=dayOf(now),since=dayOf(now-6*86400000);
 const totals=db.prepare('SELECT COALESCE(SUM(views),0) views,COUNT(DISTINCT CASE WHEN views>0 THEN visitor END) visitors,COALESCE(SUM(shares),0) shares,COALESCE(SUM(cards),0) cards FROM analytics_daily WHERE day=?').get(today);
 const rows=db.prepare('SELECT day,SUM(views) views,COUNT(DISTINCT CASE WHEN views>0 THEN visitor END) visitors,SUM(shares) shares,SUM(cards) cards FROM analytics_daily WHERE day>=? GROUP BY day ORDER BY day').all(since);
 const days=Array.from({length:7},(_,i)=>{const day=dayOf(now-(6-i)*86400000);return rows.find(r=>r.day===day)||{day,views:0,visitors:0,shares:0,cards:0};});
 const top=db.prepare(`SELECT p.id,p.text,p.name,SUM(a.views) views,SUM(a.shares) shares,SUM(a.cards) cards FROM analytics_daily a JOIN posts p ON p.id=a.post_id WHERE a.day>=? AND NOT EXISTS(SELECT 1 FROM admin_archive x WHERE x.kind='post' AND x.item_id=p.id) GROUP BY p.id HAVING SUM(a.views)>0 ORDER BY views DESC,p.id DESC LIMIT 8`).all(since);
 return {today:totals,days,top};
}
export function createAnalytics({db,origin,localHttp=false}){
 ensureAnalytics(db);let lastCleanup=0;
 return {async handle(req,res){
  if(new URL(req.url,'http://local').pathname!=='/api/visit')return false;
  const json=(status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));return true;};
  if(req.method!=='POST')return json(405,{error:'仅支持POST'});
  if(req.headers.origin!==origin||!String(req.headers['content-type']).startsWith('application/json'))return json(403,{error:'请求来源无效'});
  let input;try{let bytes=0,chunks=[];for await(const c of req){bytes+=c.length;if(bytes>1024)return json(413,{error:'请求过大'});chunks.push(c);}input=JSON.parse(Buffer.concat(chunks).toString());}catch{return json(400,{error:'无效请求'});}
  if(!input||!['view','share','card'].includes(input.event)||!/^\/(?:post\/[1-9]\d{0,9})?$/.test(input.path||''))return json(400,{error:'无效事件'});
  const postId=Number(input.path.split('/')[2]||0);
  if(postId&&!db.prepare("SELECT id FROM posts p WHERE id=? AND NOT EXISTS(SELECT 1 FROM admin_archive a WHERE a.kind='post' AND a.item_id=p.id)").get(postId))return json(404,{error:'帖子不存在'});
  if(!postId&&input.event!=='view')return json(400,{error:'请选择帖子'});
  if(/bot|crawler|spider|headless/i.test(req.headers['user-agent']||''))return json(200,{ok:true});
  const name=localHttp?'sj_visit':'__Host-sj_visit';let raw=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
  const fresh=!/^[a-f0-9]{32}$/.test(raw||'');if(fresh)raw=crypto.randomBytes(16).toString('hex');
  const now=Date.now(),day=dayOf(now),visitor=crypto.createHash('sha256').update(raw).digest('hex');
  if(now-lastCleanup>86400000){db.prepare('DELETE FROM analytics_daily WHERE day<?').run(dayOf(now-89*86400000));lastCleanup=now;}
  const previous=db.prepare('SELECT * FROM analytics_daily WHERE day=? AND visitor=? AND post_id=?').get(day,visitor,postId);
  // Cap repeated activity from one browser; refreshes within 30 seconds count once.
  const view=input.event==='view'&&(!previous||now-previous.last_view>=30000)&&(!previous||previous.views<500)?1:0;
  const share=input.event==='share'&&(!previous||previous.shares<100)?1:0,card=input.event==='card'&&(!previous||previous.cards<100)?1:0;
  db.prepare(`INSERT INTO analytics_daily VALUES(?,?,?,?,?,?,?) ON CONFLICT(day,visitor,post_id) DO UPDATE SET views=views+excluded.views,shares=shares+excluded.shares,cards=cards+excluded.cards,last_view=MAX(last_view,excluded.last_view)`).run(day,visitor,postId,view,share,card,view?now:0);
  return json(200,{ok:true},fresh?{'Set-Cookie':`${name}=${raw}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${localHttp?'':'; Secure'}`} :{});
 }};
}
