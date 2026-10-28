import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';import crypto from 'node:crypto';
test('legacy cleanup archives exact demo records and reposts credited images once under an authorized account',t=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'sj-cleanup-')),db=new DatabaseSync(path.join(data,'wall.db'));
 t.after(()=>{db.close();fs.rmSync(data,{recursive:true,force:true});});
 db.exec(`CREATE TABLE posts(id INTEGER PRIMARY KEY AUTOINCREMENT,text TEXT,name TEXT,theme TEXT,media TEXT,media_type TEXT,hearts INTEGER DEFAULT 0,ip TEXT,topic TEXT,created_at INTEGER,user_id INTEGER);
 CREATE TABLE site_users(id INTEGER PRIMARY KEY,username TEXT,disabled INTEGER);INSERT INTO site_users VALUES(1,'taid1',0);
 CREATE TABLE admin_archive(kind TEXT,item_id INTEGER,archived_at INTEGER,PRIMARY KEY(kind,item_id));CREATE TABLE admin_audit(id INTEGER PRIMARY KEY,username TEXT,action TEXT,target TEXT,created_at INTEGER);`);
 const originals=JSON.parse(fs.readFileSync(new URL('../scripts/legacy-demo-fixture.json',import.meta.url),'utf8'));
 fs.mkdirSync(path.join(data,'uploads'));
 for(const p of originals){db.prepare('INSERT INTO posts(id,text,name,theme,media,media_type,hearts,ip,topic,created_at,user_id) VALUES(?,?,?,?,?,?,?,\'\',\'\',?,NULL)').run(p.id,p.text,p.name,p.theme,p.media,p.media_type,p.hearts,p.created_at);if(p.media)fs.writeFileSync(path.join(data,'uploads',p.media),'isolated fixture');}
 const run=(...args)=>{const r=spawnSync(process.execPath,['scripts/archive-legacy-demos.mjs','--account','Taid1','--repost-featured',...args],{env:{...process.env,DATA_DIR:data},encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
 const dry=run();assert.equal(dry.mode,'dry-run');assert.equal(dry.archiveIds.length,20);assert.equal(db.prepare('SELECT count(*) n FROM admin_archive').get().n,0);
 const applied=run('--apply');assert.equal(applied.archived,20);assert.equal(applied.publishedIds.length,8);assert.equal(db.prepare('SELECT count(*) n FROM posts WHERE user_id=1').get().n,8);
 assert.equal(db.prepare('SELECT count(*) n FROM admin_archive').get().n,20);
 for(const p of db.prepare('SELECT * FROM posts WHERE user_id=1').all()){assert.equal(p.name,'taid1');assert.ok(p.text.startsWith('【图文整理｜网络配图】'));assert.ok(p.text.includes('https://www.pexels.com/'));assert.equal(p.hearts,0);}
 assert.equal(run('--apply').mode,'already-applied');assert.equal(db.prepare('SELECT count(*) n FROM posts').get().n,28);
 db.prepare('DELETE FROM site_maintenance').run();db.prepare("UPDATE posts SET text='changed real content' WHERE id=1").run();
 const refused=spawnSync(process.execPath,['scripts/archive-legacy-demos.mjs','--account','taid1','--repost-featured','--apply'],{env:{...process.env,DATA_DIR:data},encoding:'utf8'});assert.notEqual(refused.status,0);assert.equal(db.prepare('SELECT count(*) n FROM posts').get().n,28);
});
