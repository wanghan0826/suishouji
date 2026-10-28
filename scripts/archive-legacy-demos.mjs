import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {DatabaseSync} from 'node:sqlite';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=path.resolve(process.env.DATA_DIR||path.join(root,'data')),file=path.join(data,'wall.db');
if(!fs.existsSync(file))throw Error('Set DATA_DIR to the existing website data directory');
const manifest=JSON.parse(fs.readFileSync(new URL('./legacy-demo-manifest.json',import.meta.url),'utf8'));
const apply=process.argv.includes('--apply'),accountArg=process.argv.indexOf('--account'),account=accountArg<0?'':String(process.argv[accountArg+1]||'').toLowerCase();
const db=new DatabaseSync(file,{readOnly:!apply});
const owner=account?db.prepare('SELECT id,username,disabled FROM site_users WHERE username=?').get(account):null;
if(account&&!owner)throw Error('Requested account does not exist');
const repost=process.argv.includes('--repost-featured');
if(repost&&(!owner||owner.disabled))throw Error('An active owner account is required for reposting');
const runKey='featured-repost-v1:'+(owner?.id||'');
const hasRuns=db.prepare("SELECT 1 FROM sqlite_master WHERE name='site_maintenance'").get();
if(repost&&hasRuns){const done=db.prepare('SELECT value FROM site_maintenance WHERE key=?').get(runKey);if(done){console.log(JSON.stringify({mode:'already-applied',result:JSON.parse(done.value)}));db.close();process.exit(0);}}
const items=[];
const featured=[];
for(const expected of manifest){
 const post=db.prepare('SELECT id,text,name,media,user_id FROM posts WHERE id=?').get(expected.id);
 if(!post)continue;
 const digest=crypto.createHash('sha256').update([post.text,post.name,post.media].join('\0')).digest('hex');
 if(post.user_id!==null||digest!==expected.digest)throw Error('Post '+expected.id+' changed; inspect before archiving');
 if(post.id>=13&&post.id<=20)featured.push(db.prepare('SELECT * FROM posts WHERE id=?').get(post.id));
 if(!db.prepare("SELECT 1 FROM admin_archive WHERE kind='post' AND item_id=?").get(post.id))items.push(post.id);
}
const publishedIds=[];
if(repost){if(featured.length!==8)throw Error('Expected eight original featured posts');for(const post of featured)if(!fs.existsSync(path.join(data,'uploads',post.media)))throw Error('Featured image missing: '+post.id);}
if(apply){
 db.exec('BEGIN IMMEDIATE');
 try{const now=Date.now();for(const id of items){db.prepare("INSERT INTO admin_archive(kind,item_id,archived_at) VALUES('post',?,?) ON CONFLICT DO NOTHING").run(id,now);db.prepare('INSERT INTO admin_audit(username,action,target,created_at) VALUES(?,?,?,?)').run('maintenance'+(owner?':'+owner.username:''),'archive','post:'+id,now);}
 if(repost){for(const post of featured.sort((a,b)=>a.id-b.id)){
  const id=Number(db.prepare('INSERT INTO posts(text,name,theme,media,media_type,hearts,ip,topic,created_at,user_id) VALUES(?,?,?,?,?,0,?,?,?,?)').run('【图文整理｜网络配图】\n'+post.text,owner.username,post.theme,post.media,post.media_type,'local-maintenance','',now,owner.id).lastInsertRowid);
  publishedIds.push(id);db.prepare('INSERT INTO admin_audit(username,action,target,created_at) VALUES(?,?,?,?)').run('maintenance:'+owner.username,'repost_featured','post:'+id,now);
 }db.exec('CREATE TABLE IF NOT EXISTS site_maintenance(key TEXT PRIMARY KEY,value TEXT NOT NULL)');db.prepare('INSERT INTO site_maintenance VALUES(?,?)').run(runKey,JSON.stringify({owner:owner.username,publishedIds,archivedIds:items,at:now}));}
 db.exec('COMMIT');}
 catch(e){db.exec('ROLLBACK');throw e;}
}
console.log(JSON.stringify({mode:apply?'applied':'dry-run',account:owner?{id:owner.id,username:owner.username,disabled:owner.disabled}:null,archiveIds:items,archived:apply?items.length:0,featured:repost?featured.length:0,publishedIds}));db.close();
