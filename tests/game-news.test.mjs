import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';
test('news publishing requires an active account, preserves old posts, and applies each batch once',()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'sj-news-')),db=new DatabaseSync(path.join(data,'wall.db'));
 try{
  db.exec(`CREATE TABLE posts(id INTEGER PRIMARY KEY,text TEXT,name TEXT,theme TEXT,media TEXT,media_type TEXT,hearts INTEGER,ip TEXT,topic TEXT,created_at INTEGER,user_id INTEGER);
  INSERT INTO posts VALUES(1,'existing','someone','mood','','',3,'','',1,NULL);
  CREATE TABLE site_users(id INTEGER PRIMARY KEY,username TEXT,disabled INTEGER);INSERT INTO site_users VALUES(1,'taid1',0);
  CREATE TABLE admin_audit(username TEXT,action TEXT,target TEXT,created_at INTEGER);`);
  const run=(...args)=>spawnSync(process.execPath,['scripts/publish-game-news.mjs','--account','taid1',...args],{env:{...process.env,DATA_DIR:data},encoding:'utf8'});
  db.exec('UPDATE site_users SET disabled=1');assert.notEqual(run('--apply').status,0);db.exec('UPDATE site_users SET disabled=0');
  const dry=run();assert.equal(dry.status,0,dry.stderr);assert.equal(JSON.parse(dry.stdout).mode,'dry-run');assert.equal(db.prepare('SELECT COUNT(*) n FROM posts').get().n,1);
  const result=run('--apply');assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).publishedIds.length,4);
  assert.equal(db.prepare('SELECT text FROM posts WHERE id=1').get().text,'existing');
  for(const p of db.prepare('SELECT * FROM posts WHERE user_id=1').all()){assert.equal(p.name,'taid1');assert.equal(p.theme,'game');assert.ok(p.text.length<=500);assert.ok(fs.existsSync(path.join(data,'uploads',p.media)));}
  const again=run('--apply');assert.equal(again.status,0,again.stderr);assert.equal(JSON.parse(again.stdout).mode,'already-applied');assert.equal(db.prepare('SELECT COUNT(*) n FROM posts').get().n,5);
 }finally{db.close();fs.rmSync(data,{recursive:true,force:true});}
});
