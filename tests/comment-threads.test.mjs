import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {ensureCommentThreads,readPublicComments} from '../scripts/comment-threads.mjs';
test('thread migration preserves existing comment records and can run repeatedly',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec("CREATE TABLE comments(id INTEGER PRIMARY KEY,post_id INTEGER,text TEXT,name TEXT,created_at INTEGER);INSERT INTO comments VALUES(8,2,'old text','old author',10);CREATE TABLE admin_archive(kind TEXT,item_id INTEGER,archived_at INTEGER);");
  ensureCommentThreads(db);ensureCommentThreads(db);
  assert.deepEqual({...db.prepare('SELECT * FROM comments').get()},{id:8,post_id:2,text:'old text',name:'old author',created_at:10,parent_id:null,thread_id:null});
  assert.equal(readPublicComments(db,2)[0].text,'old text');
 }finally{db.close();}
});
