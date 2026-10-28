import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

// Explicit maintenance command; importing or deploying this file never publishes posts.
const folder=new URL('./news-20261028/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',folder),'utf8'));
const arg=process.argv.indexOf('--account');
const account=arg<0?'':String(process.argv[arg+1]||'').toLowerCase();
if(!account)throw Error('An explicit --account is required');
const apply=process.argv.includes('--apply');
if(!process.env.DATA_DIR)throw Error('DATA_DIR must point to the existing website database');
const data=path.resolve(process.env.DATA_DIR),file=path.join(data,'wall.db');
if(!fs.existsSync(file))throw Error('Existing database not found');
const db=new DatabaseSync(file,{readOnly:!apply});
try {
 const owner=db.prepare('SELECT id,username,disabled FROM site_users WHERE username=?').get(account);
 if(!owner||owner.disabled)throw Error('An existing active account is required');
 const key=manifest.batch+':'+owner.id;
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='site_maintenance'").get()){
  const done=db.prepare('SELECT value FROM site_maintenance WHERE key=?').get(key);
  if(done){console.log(JSON.stringify({mode:'already-applied',...JSON.parse(done.value)}));process.exitCode=0;}
  if(done){db.close();process.exit(0);}
 }
 const items=manifest.entries.map(e=>{
  if(typeof e.text!=='string'||!e.text.trim()||e.text.length>500)throw Error('Invalid post text');
  if(path.basename(e.asset)!==e.asset||!/^image\/(png|jpeg)$/.test(e.mediaType))throw Error('Invalid asset');
  if(!e.text.includes(e.source)||new URL(e.source).protocol!=='https:')throw Error('Missing source credit');
  const bytes=fs.readFileSync(new URL(e.asset,folder));
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==e.sha256)throw Error('Asset hash mismatch');
  const media=e.sha256.slice(0,24)+path.extname(e.asset);
  return {...e,bytes,media};
 });
 const publishedIds=[];
 if(apply){
  fs.mkdirSync(path.join(data,'uploads'),{recursive:true});
  // Content-addressed files remain safe to retry if the database transaction fails.
  for(const e of items){const dest=path.join(data,'uploads',e.media);if(fs.existsSync(dest)){
   if(crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex')!==e.sha256)throw Error('Upload collision');
  }else fs.writeFileSync(dest,e.bytes,{flag:'wx',mode:0o644});}
  db.exec('BEGIN IMMEDIATE');
  try{
   db.exec('CREATE TABLE IF NOT EXISTS site_maintenance(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
   if(db.prepare('SELECT 1 FROM site_maintenance WHERE key=?').get(key))throw Error('Batch already published concurrently');
   const now=Date.now();
   for(const e of items){
    const id=Number(db.prepare('INSERT INTO posts(text,name,theme,media,media_type,hearts,ip,topic,created_at,user_id) VALUES(?,?,?,?,?,0,?,?,?,?)').run(e.text,owner.username,'game',e.media,e.mediaType,'local-maintenance','',now,owner.id).lastInsertRowid);
    publishedIds.push(id);
    db.prepare('INSERT INTO admin_audit(username,action,target,created_at) VALUES(?,?,?,?)').run('maintenance:'+owner.username,'publish_news','post:'+id,now);
   }
   db.prepare('INSERT INTO site_maintenance VALUES(?,?)').run(key,JSON.stringify({account:owner.username,publishedIds,at:now}));
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 console.log(JSON.stringify({mode:apply?'applied':'dry-run',account:owner.username,count:items.length,publishedIds}));
} finally {if(db.isOpen)db.close();}
