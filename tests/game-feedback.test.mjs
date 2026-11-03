import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {ensureGameFeedback,submitGameFeedback,readMyGameFeedback,readAdminGameFeedback,updateGameFeedback} from '../scripts/game-feedback.mjs';
const now=Date.parse('2026-11-03T12:00:00+08:00'),key=n=>String(n).padStart(32,'0'),input=(n=1)=>({title:'想玩双人合作解谜',details:'两个人各有一半线索。\n一起解开谜题。',mode:'two',requestKey:key(n)});
function fixture(t){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE site_users(id INTEGER PRIMARY KEY,username TEXT);INSERT INTO site_users VALUES(1,\'alice\'),(2,\'bob\');');ensureGameFeedback(db);t.after(()=>db.close());return db;}
test('game feedback migration preserves records, binds ownership and never exposes receipt keys',t=>{
 const db=fixture(t),sent=submitGameFeedback(db,1,{...input(),user_id:2,status:'done',reply:'fake'},now);assert.equal(sent.item.status,'new');assert.equal(sent.item.reply,'');ensureGameFeedback(db);
 assert.equal(readMyGameFeedback(db,1,1,now).total,1);assert.equal(readMyGameFeedback(db,2,1,now).total,0);assert.equal(readMyGameFeedback(db,1,1,now).remaining,4);assert.ok(!JSON.stringify(sent).includes('request_key'));assert.ok(!JSON.stringify(sent.item).includes('user_id'));
 const admin=readAdminGameFeedback(db);assert.equal(admin.items[0].username,'alice');assert.equal(admin.counts.new,1);
});
test('lost-response retries return the same feedback even at the daily quota and reject changed receipts',t=>{
 const db=fixture(t),first=submitGameFeedback(db,1,input(),now);for(let i=2;i<=5;i++)submitGameFeedback(db,1,{...input(i),title:'游戏'+i},now+i);
 const retry=submitGameFeedback(db,1,input(),now+100);assert.equal(retry.item.id,first.item.id);assert.equal(retry.repeated,true);assert.equal(readMyGameFeedback(db,1,1,now).total,5);
 assert.throws(()=>submitGameFeedback(db,1,{...input(),details:'changed'},now),e=>e.status===409);assert.throws(()=>submitGameFeedback(db,1,input(6),now),e=>e.status===429);
 assert.equal(submitGameFeedback(db,2,input(),now).repeated,false);assert.equal(submitGameFeedback(db,1,input(7),now+86400000).repeated,false);
});
test('feedback status edits are versioned, retry-safe and visible only to the submitting account',t=>{
 const db=fixture(t),sent=submitGameFeedback(db,1,input(),now).item,edit={status:'building',reply:'已经安排开发，进度会在这里更新。',version:sent.version};
 const updated=updateGameFeedback(db,sent.id,edit,now+1000);assert.equal(updated.item.version,2);assert.equal(updated.changed,true);assert.equal(updateGameFeedback(db,sent.id,edit,now+2000).changed,false);
 assert.throws(()=>updateGameFeedback(db,sent.id,{...edit,status:'done'},now+2000),e=>e.status===409);assert.equal(readMyGameFeedback(db,1,1,now).items[0].reply,edit.reply);assert.equal(readMyGameFeedback(db,2,1,now).items.length,0);
 assert.equal(readAdminGameFeedback(db,{status:'new'}).total,0);assert.equal(readAdminGameFeedback(db,{status:'building'}).total,1);assert.equal(readAdminGameFeedback(db,{status:'all'}).counts.building,1);
 assert.throws(()=>updateGameFeedback(db,999,edit,now),e=>e.status===404);
});
test('feedback validation limits payloads, controls, filters and pagination without interpreting markup',t=>{
 const db=fixture(t);for(const bad of [{title:''},{title:'a'.repeat(51)},{details:'a'.repeat(801)},{mode:'anything'},{title:'a\nb'},{details:'a\u200bb'},{requestKey:'x'}])assert.throws(()=>submitGameFeedback(db,1,{...input(),...bad},now),e=>e.status===400);
 const sent=submitGameFeedback(db,1,{...input(),title:'<img src=x onerror=alert(1)>',details:'<script>test</script>'},now);assert.equal(sent.item.title,'<img src=x onerror=alert(1)>');
 assert.throws(()=>readMyGameFeedback(db,1,0,now),e=>e.status===400);assert.throws(()=>readAdminGameFeedback(db,{status:'bad'}),e=>e.status===400);assert.throws(()=>updateGameFeedback(db,1,null),e=>e.status===400);assert.throws(()=>updateGameFeedback(db,1,{status:'bad',version:1}),e=>e.status===400);assert.throws(()=>updateGameFeedback(db,1,{status:'done',version:1,reply:'x'.repeat(501)}),e=>e.status===400);
 for(let i=2;i<=25;i++)submitGameFeedback(db,1,{...input(i),title:'建议'+i},now+i*86400000);assert.equal(readMyGameFeedback(db,1,1,now).items.length,20);assert.equal(readMyGameFeedback(db,1,2,now).items.length,5);assert.equal(readAdminGameFeedback(db,{page:2}).items.length,5);
});
