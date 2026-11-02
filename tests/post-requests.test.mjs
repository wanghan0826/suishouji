import test from 'node:test';import assert from 'node:assert/strict';import{DatabaseSync}from'node:sqlite';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import{ensurePostRequests,postFingerprint,postRequestKey,commitPostRequest}from'../scripts/post-requests.mjs';

test('post creation and retry receipt roll back together and a committed receipt remains readable after reopening',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'sj-post-receipts-')),file=path.join(directory,'test.db');let db=new DatabaseSync(file);try{
 db.exec("CREATE TABLE posts(id INTEGER PRIMARY KEY,user_id INTEGER);CREATE TABLE admin_archive(kind TEXT,item_id INTEGER)");ensurePostRequests(db);
 const request={userId:42,key:postRequestKey('test-request-key-1234'),fingerprint:postFingerprint(['hello'],Buffer.from('image'))};
 assert.throws(()=>commitPostRequest(db,request,()=>{db.exec('INSERT INTO posts VALUES(1,42)');throw Error('simulated-write-failure');}),/simulated-write-failure/);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM posts').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM post_requests').get().n,0);
 const created=commitPostRequest(db,request,()=>{db.exec('INSERT INTO posts VALUES(1,42)');return 1;});assert.deepEqual(created,{id:1,replayed:false});
 db.close();db=new DatabaseSync(file);ensurePostRequests(db);const retried=commitPostRequest(db,request,()=>assert.fail('must not create again'));assert.deepEqual(retried,{id:1,replayed:true});
 assert.notEqual(postFingerprint(['hello'],Buffer.from('changed-image')),request.fingerprint);assert.equal(postRequestKey(undefined),'');
 for(const value of ['','short','bad key with spaces','x'.repeat(81),[]])assert.throws(()=>postRequestKey(value),{status:400});
 }finally{db.close();await fs.unlink(file);await fs.rmdir(directory);}
});
