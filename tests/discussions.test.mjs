import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {ensureDiscussions,discussionText,readDiscussions} from '../scripts/discussions.mjs';
test('discussion validation preserves a clear title and body within the existing post limit',()=>{
 const text=discussionText({discussionTitle:' 最近玩什么？ ',text:' 分享一下你的推荐。 '});assert.equal(text,'【讨论｜最近玩什么？】\n分享一下你的推荐。');
 assert.throws(()=>discussionText({discussionTitle:'a\nb',text:'body'}));assert.throws(()=>discussionText({discussionTitle:'',text:'body'}));assert.throws(()=>discussionText({discussionTitle:'a',text:'b'.repeat(431)}));assert.ok(discussionText({discussionTitle:'a'.repeat(60),text:'b'.repeat(430)}).length<=500);
});
test('plaza lists only discussions, hides archived content and uses visible replies for activity and counts',()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE posts(id INTEGER PRIMARY KEY,text TEXT,name TEXT,theme TEXT,media TEXT,media_type TEXT,created_at INTEGER,hearts INTEGER);CREATE TABLE comments(id INTEGER PRIMARY KEY,post_id INTEGER,thread_id INTEGER,created_at INTEGER);CREATE TABLE admin_archive(kind TEXT,item_id INTEGER);`);ensureDiscussions(db);ensureDiscussions(db);
 const insert=db.prepare('INSERT INTO posts VALUES(?,?,?,?,?,?,?,?)');for(let i=1;i<=24;i++)insert.run(i,'【讨论｜100% '+i+'】\nbody','tester',i%2?'game':'daily','','',i,0);for(let i=1;i<=23;i++)db.prepare('INSERT INTO discussion_posts VALUES(?)').run(i);
 db.exec("INSERT INTO comments VALUES(1,1,NULL,100),(2,1,1,200),(3,2,NULL,99);INSERT INTO admin_archive VALUES('comment',1),('post',3);");
 const read=q=>readDiscussions(db,new URL('https://example.com/api/discussions'+q));
 assert.equal(read('').total,22);assert.equal(read('').items.length,20);assert.equal(read('?page=2').items.length,2);assert.equal(read('').items[0].id,2);assert.equal(read('?sort=new').items[0].id,23);assert.equal(read('?sort=unanswered').total,21);assert.equal(read('?q=100%25').total,22);assert.equal(read('?q=_').total,0);assert.ok(read('?theme=game').items.every(p=>p.theme==='game'));assert.ok(!JSON.stringify(read('')).includes('user_id'));
 assert.throws(()=>read('?sort=unknown'));assert.throws(()=>read('?page=-1'));db.close();
});
