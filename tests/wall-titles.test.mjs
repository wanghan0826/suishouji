import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import{DatabaseSync}from'node:sqlite';import{wallTitleInput,ensureWallTitles,attachWallTitles}from'../scripts/wall-titles.mjs';
test('wall titles count graphemes, preserve emoji, reject control text and keep legacy rows unchanged',()=>{
 assert.equal(wallTitleInput(undefined),'');assert.equal(wallTitleInput('  一起玩  '),'一起玩');assert.equal(wallTitleInput('👨‍👩‍👧‍👦'.repeat(24)),'👨‍👩‍👧‍👦'.repeat(24));for(const v of ['字'.repeat(25),'a\nb','a\u202eb',123])assert.throws(()=>wallTitleInput(v));
 const db=new DatabaseSync(':memory:');ensureWallTitles(db);ensureWallTitles(db);db.exec("INSERT INTO post_wall_titles VALUES(1,'完整短标题'),(3,'不在列表中的标题')");const items=attachWallTitles(db,[{id:1,text:'完整正文'},{id:2,text:'旧帖子'}]);assert.equal(items[0].wall_title,'完整短标题');assert.deepEqual(items[1],{id:2,text:'旧帖子'});assert.ok(!JSON.stringify(items).includes('不在列表中'));db.close();
});
test('mobile summaries mark excerpts, retain complete manual titles and do not split emoji',()=>{
 const context={Intl};vm.runInNewContext(fs.readFileSync('public/wall-copy.js','utf8'),context);const text=context.SJWallText;
 assert.equal(text.summary({text:'很短的一句话'}).text,'很短的一句话');assert.equal(text.summary({wall_title:'独立弹幕标题',text:'正文'.repeat(100)}).text,'独立弹幕标题');assert.equal(text.summary({text:'【讨论｜一起玩什么？】\n正文'}).text,'一起玩什么？');assert.equal(text.summary({text:'长'.repeat(100)}).kind,'摘要');assert.equal(text.summary({text:'👨‍👩‍👧‍👦'.repeat(25)}).text,'👨‍👩‍👧‍👦'.repeat(24)+'…');
});
