import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createDrawingGame,drawingScores,studioScores,validStroke} from '../scripts/draw-game.mjs';
import {DRAW_WORDS,DRAW_WORD_STATS,pickDrawChoices} from '../scripts/draw-words.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
async function fixture(t){
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE site_users(id INTEGER PRIMARY KEY,username TEXT,disabled INTEGER DEFAULT 0);');for(let id=1;id<=12;id++)db.prepare('INSERT INTO site_users VALUES(?,?,0)').run(id,'player_'+id);
  const current=req=>db.prepare('SELECT id,username FROM site_users WHERE id=? AND disabled=0').get(Number(req.headers['x-test-user'])||0),users={currentUser:current,requireUser(req){const user=current(req);if(!user)throw fail(401,'登录后操作');if(req.headers['x-test-csrf']!=='valid')throw fail(403,'无效凭据');return user;}};
  let now=Date.parse('2026-11-03T12:00:00+08:00');let game=createDrawingGame({db,users,clock:()=>now}),server=http.createServer(async(req,res)=>{if(!await game.handle(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  t.after(async()=>{game.close();server.closeAllConnections();await new Promise(r=>server.close(r));db.close();});
  async function call(route='',{user=1,data,csrf='valid',method=data===undefined?'GET':'POST'}={}){const r=await fetch(base+'/api/draw-game'+route,{method,headers:{'X-Test-User':String(user),'X-Test-CSRF':csrf,'Content-Type':'application/json'},...(data!==undefined?{body:JSON.stringify(data)}:{})});return {status:r.status,data:await r.json(),headers:r.headers};}
  const create=async()=>{const r=await call('',{data:{mode:'party'}});assert.equal(r.status,200);return r.data.room.token;};
  const start=async(count=3)=>{const token=await create();for(let user=2;user<=count;user++)assert.equal((await call('/'+token+'/join',{user,data:{}})).status,200);assert.equal((await call('/'+token+'/start',{data:{}})).status,200);await call('/'+token+'/choose',{data:{round:1,choice:0}});return token;};
  const choose=async(token,user=1,choice=0)=>{const r=await call('/'+token,{user});return call('/'+token+'/choose',{user,data:{round:r.data.room.round,choice}});};const restart=()=>{game.close();game=createDrawingGame({db,users,clock:()=>now});};const advance=ms=>now+=ms;return {db,base,call,create,start,choose,restart,advance};
}
const stroke=(round=1,epoch=0,op='a'.repeat(32),path='b'.repeat(32))=>({round,epoch,opId:op,strokeId:path,color:'#25352d',size:6,points:[[10,20],[100,200]]});

test('room nicknames persist and remain bound to the same account and seat in one room',async t=>{
 const f=await fixture(t),token=await f.create(),base='/'+token;await f.call(base+'/join',{user:2,data:{}});
 let state=(await f.call(base+'/nickname',{user:2,data:{nickname:'  小汪  ',userId:1}})).data.room;
 assert.equal(state.members.find(m=>m.id===2).name,'小汪');assert.equal(state.members.find(m=>m.id===2).seat,1);assert.equal(state.members.find(m=>m.id===1).name,'player_1');
 const version=state.version;assert.equal((await f.call(base+'/nickname',{user:2,data:{nickname:'小汪'}})).data.room.version,version);
 assert.equal(f.db.prepare('SELECT username FROM site_users WHERE id=2').get().username,'player_2');assert.equal(f.db.prepare('SELECT nickname FROM draw_members WHERE user_id=2 AND room_token=?').get(token).nickname,'小汪');
 f.restart();state=(await f.call(base)).data.room;assert.equal(state.members.find(m=>m.id===2).name,'小汪');
 const other=await f.create();await f.call('/'+other+'/join',{user:2,data:{}});assert.equal((await f.call('/'+other,{user:2})).data.room.members.find(m=>m.id===2).name,'player_2');
 await f.call(base+'/nickname',{data:{nickname:'画手'}});assert.equal((await f.call(base,{user:3})).data.preview.host,'画手');
});

test('renaming broadcasts the new identity and updates answers without changing the canvas or timer',async t=>{
 const f=await fixture(t),token=await f.start(4),base='/'+token;await f.call(base+'/stroke',{data:stroke()});await f.call(base+'/guess',{user:2,data:{round:1,text:'wrong guess'}});
 const before=(await f.call(base)).data.room,controller=new AbortController();t.after(()=>controller.abort());
 const stream=await fetch(f.base+'/api/draw-game'+base+'/events',{headers:{'X-Test-User':'3'},signal:controller.signal}),reader=stream.body.getReader();await reader.read();
 const updated=await f.call(base+'/nickname',{user:2,data:{nickname:'<b>小汪</b>'}});assert.equal(updated.status,200);const event=new TextDecoder().decode((await reader.read()).value);assert.match(event,/event: state/);assert.ok(event.includes('<b>小汪</b>'));assert.ok(!event.includes(before.turn.answer));controller.abort();await reader.cancel().catch(()=>{});
 const after=(await f.call(base,{user:3})).data.room;assert.equal(after.members.find(m=>m.id===2).seat,1);assert.equal(after.messages[0].name,'<b>小汪</b>');assert.equal(after.messages[0].seat,1);assert.equal(after.messages[0].userId,2);
 assert.deepEqual(after.board,before.board);assert.equal(after.turn.deadline,before.turn.deadline);assert.equal(after.turn.epoch,before.turn.epoch);assert.deepEqual(after.members.map(m=>m.score),before.members.map(m=>m.score));
});

test('nickname writes validate identity, CSRF, membership, names, room phase and rate limits',async t=>{
 const f=await fixture(t),token=await f.create(),base='/'+token;await f.call(base+'/join',{user:2,data:{}});
 assert.equal((await f.call(base+'/nickname',{user:0,data:{nickname:'无账号'}})).status,401);assert.equal((await f.call(base+'/nickname',{csrf:'bad',data:{nickname:'坏凭据'}})).status,403);assert.equal((await f.call(base+'/nickname',{user:3,data:{nickname:'旁观者'}})).status,403);
 for(const nickname of ['',null,'x'.repeat(21),'换\n行','隐\u200b藏','\u2028名字']){f.advance(60001);assert.equal((await f.call(base+'/nickname',{data:{nickname}})).status,400);}
 f.advance(60001);for(let i=0;i<6;i++)assert.equal((await f.call(base+'/nickname',{data:{nickname:'昵称'+i}})).status,200);assert.equal((await f.call(base+'/nickname',{data:{nickname:'太频繁'}})).status,429);
 f.advance(60001);await f.call(base+'/leave',{user:2,data:{}});assert.equal((await f.call(base+'/nickname',{user:2,data:{nickname:'已离开'}})).status,403);await f.call(base+'/close',{data:{}});assert.equal((await f.call(base+'/nickname',{data:{nickname:'已结束'}})).status,409);
});

test('leaving and rejoining preserves room nicknames and never renumbers other players',async t=>{
 const f=await fixture(t),created=await f.call('',{data:{mode:'studio'}}),base='/'+created.data.room.token;for(const user of [2,3])await f.call(base+'/join',{user,data:{}});
 await f.call(base+'/nickname',{user:2,data:{nickname:'第二位'}});await f.call(base+'/leave',{user:2,data:{}});let r=(await f.call(base)).data.room;assert.equal(r.members.find(m=>m.id===3).seat,2);
 await f.call(base+'/join',{user:4,data:{}});await f.call(base+'/join',{user:2,data:{}});r=(await f.call(base)).data.room;assert.deepEqual(r.members.map(m=>[m.id,m.seat]),[[1,0],[2,1],[3,2],[4,3]]);assert.equal(r.members.find(m=>m.id===2).name,'第二位');
});

test('word bank has thousands of unique curated prompts, with three difficulty choices and no avoidable repeats',()=>{
 assert.ok(DRAW_WORD_STATS.total>=2000);assert.equal(new Set(DRAW_WORDS.map(w=>w.text.normalize('NFKC'))).size,DRAW_WORDS.length);assert.ok(DRAW_WORD_STATS.difficulties.every(n=>n>=400));assert.ok(DRAW_WORDS.every(w=>w.category&&w.text.length<=12&&w.text.trim()===w.text));
 const used=new Set();for(let i=0;i<100;i++){const choices=pickDrawChoices(used);assert.deepEqual(choices.map(w=>w.difficulty),[0,1,2]);for(const w of choices){assert.ok(!used.has(w.text));used.add(w.text);}}assert.equal(used.size,300);
});

test('only the artist sees three persisted candidates; selection is round-bound, retry-safe and starts a full drawing timer',async t=>{
 const f=await fixture(t),token=await f.create(),base='/'+token;for(const user of [2,3])await f.call(base+'/join',{user,data:{}});
 let state=(await f.call(base+'/start',{data:{}})).data.room;assert.equal(state.phase,'choosing');const choices=state.turn.choices;assert.equal(choices.length,3);assert.equal(state.turn.answer,null);const guest=(await f.call(base,{user:2})).data;assert.equal(guest.room.turn.choices,undefined);for(const c of choices)assert.ok(!JSON.stringify(guest).includes(c.text));
 assert.equal((await f.call(base+'/guess',{user:2,data:{round:1,text:choices[0].text}})).status,409);assert.equal((await f.call(base+'/stroke',{data:stroke()})).status,409);assert.equal((await f.call(base+'/choose',{user:2,data:{round:1,choice:0}})).status,403);for(const choice of [-1,3,'0'])assert.equal((await f.call(base+'/choose',{data:{round:1,choice}})).status,400);assert.equal((await f.call(base+'/choose',{data:{round:99,choice:0}})).status,409);
 f.restart();assert.deepEqual((await f.call(base)).data.room.turn.choices,choices);
 const controller=new AbortController(),stream=await fetch(f.base+'/api/draw-game'+base+'/events',{headers:{'X-Test-User':'2'},signal:controller.signal}),reader=stream.body.getReader();t.after(()=>controller.abort());let event=new TextDecoder().decode((await reader.read()).value);for(const c of choices)assert.ok(!event.includes(c.text));
 f.advance(5000);state=(await f.call(base+'/choose',{data:{round:1,choice:1}})).data.room;assert.equal(state.phase,'playing');assert.equal(state.turn.answer,choices[1].text);assert.equal(state.turn.deadline-state.serverNow,90000);assert.equal(state.turn.choices,undefined);event=new TextDecoder().decode((await reader.read()).value);for(const c of choices)assert.ok(!event.includes(c.text));controller.abort();await reader.cancel().catch(()=>{});const deadline=state.turn.deadline;f.advance(1000);assert.equal((await f.call(base+'/choose',{data:{round:1,choice:1}})).data.room.turn.deadline,deadline);assert.equal((await f.call(base+'/choose',{data:{round:1,choice:2}})).status,409);
 f.advance(89001);assert.equal((await f.call(base)).data.room.phase,'between');f.advance(8001);state=(await f.call(base,{user:2})).data.room;assert.equal(state.phase,'choosing');assert.equal(state.turn.drawerId,2);assert.equal((await f.call(base+'/choose',{user:2,data:{round:1,choice:1}})).status,409);
});

test('selection timeout chooses a candidate without revealing alternatives, and legacy in-progress drawings still resume',async t=>{
 const f=await fixture(t),token=await f.create(),base='/'+token;for(const user of [2,3])await f.call(base+'/join',{user,data:{}});const picking=(await f.call(base+'/start',{data:{}})).data.room;f.advance(20001);let state=(await f.call(base)).data.room;assert.equal(state.phase,'playing');assert.ok(picking.turn.choices.some(w=>w.text===state.turn.answer));assert.equal(state.turn.deadline-state.serverNow,90000);const guest=(await f.call(base,{user:2})).data.room;assert.equal(guest.turn.answer,null);assert.equal(guest.turn.choices,undefined);
 const answer=state.turn.answer;f.db.prepare("UPDATE draw_rounds SET choices='[]',selected_choice=-1 WHERE room_token=?").run(token);f.restart();state=(await f.call(base)).data.room;assert.equal(state.phase,'playing');assert.equal(state.turn.answer,answer);assert.equal((await f.call(base+'/choose',{data:{round:1,choice:0}})).status,409);
});

test('free studio starts solo, accepts late viewers and awards all correct guesses without cancellation',async t=>{
 const f=await fixture(t),created=await f.call('',{data:{canvasHeight:1280}}),base='/'+created.data.room.token;
 assert.equal(created.data.room.mode,'studio');assert.equal(created.data.room.canvasHeight,1280);
 let r=(await f.call(base+'/start',{data:{}})).data.room;assert.equal(r.phase,'choosing');r=(await f.choose(created.data.room.token)).data.room;assert.equal(r.phase,'playing');assert.equal(r.turn.eligibleCount,0);assert.equal(r.turn.drawerId,1);
 assert.equal((await f.call(base+'/stroke',{data:{...stroke(),points:[[20,1000],[60,1200]]}})).status,200);assert.equal((await f.call(base+'/stroke',{data:{...stroke(1,0,'c'.repeat(32)),points:[[20,1281]]}})).status,400);
 const joined=(await f.call(base+'/join',{user:2,data:{}})).data.room;assert.equal(joined.turn.answer,null);assert.equal(joined.turn.eligibleCount,1);
 const answer=r.turn.answer;const correct=await f.call(base+'/guess',{user:2,data:{round:1,text:answer}});r=correct.data.room;
 assert.equal(r.phase,'between');assert.equal(r.turn.reason,'all');assert.equal(r.members.find(m=>m.id===1).score,10);assert.equal(r.members.find(m=>m.id===2).score,100);
 assert.equal((await f.call(base+'/guess',{user:2,data:{round:1,text:answer}})).status,409);
 await f.call(base+'/join',{user:3,data:{}});f.advance(8001);r=(await f.call(base)).data.room;assert.equal(r.round,2);assert.equal(r.turn.drawerId,1);assert.equal(r.turn.eligibleCount,2);await f.choose(created.data.room.token);
 await f.call(base+'/leave',{user:2,data:{}});r=(await f.call(base)).data.room;assert.equal(r.phase,'playing');assert.equal(r.turn.reason,'');
 await f.call(base+'/join',{user:2,data:{}});assert.equal((await f.call(base)).data.room.turn.eligibleCount,2);
 await f.call(base+'/leave',{data:{}});assert.equal((await f.call(base,{user:3})).data.room.phase,'closed');
});

test('solo studio times out without points and continues with the same artist; closing is host-only',async t=>{
 const f=await fixture(t),created=await f.call('',{data:{mode:'studio'}}),base='/'+created.data.room.token;await f.call(base+'/start',{data:{}});await f.choose(created.data.room.token);f.advance(90001);
 let r=(await f.call(base)).data.room;assert.equal(r.phase,'between');assert.deepEqual(r.turn.scores,[]);assert.equal(r.members[0].score,0);
 f.advance(8001);r=(await f.call(base)).data.room;assert.equal(r.round,2);assert.equal(r.turn.drawerId,1);
 await f.call(base+'/join',{user:2,data:{}});assert.equal((await f.call(base+'/close',{user:2,data:{}})).status,403);assert.equal((await f.call(base+'/close',{data:{}})).data.room.phase,'closed');
});

test('studio rank scores are fixed under late arrivals and ten-seat cap still applies mid-game',async t=>{
 assert.deepEqual(studioScores([2,3,4],[3,2],1),[{userId:1,points:20},{userId:3,points:100},{userId:2,points:80}]);assert.deepEqual(studioScores([],[],1),[]);
 const f=await fixture(t);for(const data of [{mode:'other'},{canvasHeight:1},{canvasHeight:1601},{canvasHeight:640.5}])assert.equal((await f.call('',{data})).status,400);
 const created=await f.call('',{data:{mode:'studio'}}),base='/'+created.data.room.token;await f.call(base+'/start',{data:{}});for(let user=2;user<=9;user++)await f.call(base+'/join',{user,data:{}});
 const results=await Promise.all([10,11].map(user=>f.call(base+'/join',{user,data:{}})));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await f.call(base)).data.room.turn.eligibleCount,9);
});

test('an inactive studio closes after ten minutes and does not create endless unattended rounds',async t=>{
 const f=await fixture(t),created=await f.call('',{data:{mode:'studio'}}),base='/'+created.data.room.token;await f.call(base+'/start',{data:{}});f.advance(600001);assert.equal((await f.call(base)).data.room.phase,'closed');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM draw_rounds').get().n,1);
});

test('drawing score order is deterministic and all-correct cancels every provisional score',()=>{
  assert.deepEqual(drawingScores([2,3,4],[3,2],1),[{userId:1,points:2},{userId:3,points:3},{userId:2,points:2}]);assert.deepEqual(drawingScores([2,3],[2,3],1),[]);assert.deepEqual(drawingScores([2,3],[],1),[]);assert.deepEqual(drawingScores([2,3],[2,2,99],1),[{userId:1,points:1},{userId:2,points:2}]);
  assert.deepEqual(validStroke(stroke()).points,[[10,20],[100,200]]);for(const bad of [{color:'url(secret)'},{size:999},{points:[[1,Infinity]]},{points:[[961,0]]},{points:Array.from({length:129},()=>[1,2])},{opId:'<script>'}])assert.throws(()=>validStroke({...stroke(),...bad}));
});

test('drawing lobby caps ten accounts under racing joins, requires three, and freezes the roster at start',async t=>{
  const f=await fixture(t),token=await f.create(),base='/'+token;
  assert.equal((await f.call(base+'/start',{data:{}})).status,409);assert.equal((await f.call(base+'/join',{user:2,csrf:'bad',data:{}})).status,403);assert.equal((await f.call('',{user:0})).status,401);
  for(let user=2;user<=9;user++)await f.call(base+'/join',{user,data:{}});
  const race=await Promise.all([f.call(base+'/join',{user:10,data:{}}),f.call(base+'/join',{user:11,data:{}})]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.equal((await f.call(base)).data.room.members.length,10);
  assert.equal((await f.call(base+'/start',{user:2,data:{}})).status,403);assert.equal((await f.call(base+'/start',{data:{}})).status,200);assert.equal((await f.call(base+'/join',{user:12,data:{}})).status,409);assert.equal((await f.call(base+'/start',{data:{}})).status,409);
  const outsider=(await f.call(base,{user:12})).data;assert.ok(outsider.preview);assert.ok(!JSON.stringify(outsider).includes('answer'));assert.equal((await f.call(base+'/events',{user:12})).status,403);
});

test('drawing hides the answer from guessers, locks correct guesses, and all-correct settles to zero once',async t=>{
  const f=await fixture(t),token=await f.start(),base='/'+token,answer=(await f.call(base)).data.room.turn.answer;
  const guesser=await f.call(base,{user:2});assert.equal(guesser.data.room.turn.answer,null);assert.ok(!JSON.stringify(guesser.data).includes(answer));
  assert.equal((await f.call(base+'/guess',{data:{round:1,text:answer}})).status,403);
  await f.call(base+'/guess',{user:2,data:{round:1,text:'我觉得是'+answer}});assert.ok(!JSON.stringify((await f.call(base,{user:3})).data).includes(answer));
  const first=await f.call(base+'/guess',{user:2,data:{round:1,text:answer}});assert.equal(first.data.guess.correct,true);assert.equal(first.data.room.turn.myRank,1);assert.equal(first.data.room.turn.provisional,2);assert.equal(first.data.room.members.find(m=>m.id===2).score,0);
  await f.call(base+'/guess',{user:2,data:{round:1,text:answer}});assert.equal(f.db.prepare('SELECT COUNT(*) n FROM draw_correct').get().n,1);
  const all=await f.call(base+'/guess',{user:3,data:{round:1,text:answer}});assert.equal(all.data.room.turn.reason,'all');assert.equal(all.data.room.phase,'between');assert.equal(all.data.room.turn.answer,answer);assert.ok(all.data.room.members.every(m=>m.score===0));
  assert.equal((await f.call(base+'/guess',{user:2,data:{round:1,text:answer}})).status,409);assert.ok((await f.call(base)).data.room.members.every(m=>m.score===0));
});

test('partial guesses settle in server-arrival order at the deadline and rotate each artist exactly once',async t=>{
  const f=await fixture(t),token=await f.start(4),base='/'+token,answer=(await f.call(base)).data.room.turn.answer;
  await f.call(base+'/guess',{user:3,data:{round:1,text:answer}});await f.call(base+'/guess',{user:2,data:{round:1,text:answer}});f.advance(90001);
  const ended=(await f.call(base,{user:2})).data.room;assert.equal(ended.turn.reason,'time');assert.deepEqual(ended.turn.scores,[{userId:1,points:2},{userId:3,points:3},{userId:2,points:2}]);assert.equal(ended.members.find(m=>m.id===3).score,3);
  await f.call(base);assert.equal((await f.call(base)).data.room.members.find(m=>m.id===3).score,3);
  for(const [round,drawer]of [[2,2],[3,3],[4,4]]){f.advance(8001);let next=(await f.call(base,{user:drawer})).data.room;assert.equal(next.round,round);assert.equal(next.turn.drawerId,drawer);next=(await f.choose(token,drawer)).data.room;assert.ok(next.turn.answer);f.advance(90001);await f.call(base);}
  assert.equal((await f.call(base)).data.room.phase,'finished');assert.equal(f.db.prepare('SELECT COUNT(DISTINCT drawer_id) n FROM draw_rounds').get().n,4);
});

test('stroke authorization, epoch checks, undo/clear and retry deduplication preserve the shared board',async t=>{
  const f=await fixture(t),token=await f.start(),base='/'+token;
  assert.equal((await f.call(base+'/stroke',{user:2,data:stroke()})).status,403);
  for(let i=0;i<2;i++)assert.equal((await f.call(base+'/stroke',{data:stroke()})).status,200);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM draw_strokes').get().n,1);assert.equal(f.db.prepare('SELECT guesses FROM growth_game_daily WHERE user_id=1').get().guesses,1);
  await f.call(base+'/stroke',{data:stroke(1,0,'c'.repeat(32),'b'.repeat(32))});await f.call(base+'/stroke',{data:stroke(1,0,'d'.repeat(32),'e'.repeat(32))});
  const undo=await f.call(base+'/undo',{data:{round:1,epoch:0}});assert.equal(undo.data.room.board.length,2);assert.equal(undo.data.room.turn.epoch,1);
  assert.equal((await f.call(base+'/stroke',{data:stroke(1,0,'f'.repeat(32))})).status,409);
  const clear=await f.call(base+'/clear',{data:{round:1,epoch:1}});assert.equal(clear.data.room.board.length,0);assert.equal(clear.data.room.turn.epoch,2);
  assert.equal((await f.call(base+'/stroke',{data:stroke(1,2,'f'.repeat(32))})).status,200);const restored=(await f.call(base,{user:2})).data.room;assert.equal(restored.board.length,1);assert.equal(restored.turn.answer,null);
});

test('leaving cancels the current round, transfers hosting and cannot be used to rejoin an active match',async t=>{
  const f=await fixture(t),token=await f.start(4),base='/'+token,answer=(await f.call(base)).data.room.turn.answer;await f.call(base+'/guess',{user:2,data:{round:1,text:answer}});
  assert.equal((await f.call(base+'/leave',{data:{}})).status,200);const r=(await f.call(base,{user:2})).data.room;assert.equal(r.hostId,2);assert.equal(r.turn.reason,'left');assert.ok(r.members.every(m=>m.score===0));assert.equal((await f.call(base+'/join',{user:1,data:{}})).status,409);
  assert.equal((await f.call(base+'/close',{user:3,data:{}})).status,403);assert.equal((await f.call(base+'/close',{user:2,data:{}})).data.room.phase,'closed');
});

test('server-sent events stream strokes without answers and reject expired or banned sessions',async t=>{
  const f=await fixture(t),token=await f.start(),base='/'+token,answer=(await f.call(base)).data.room.turn.answer,controller=new AbortController();
  const response=await fetch(f.base+'/api/draw-game'+base+'/events',{headers:{'X-Test-User':'2'},signal:controller.signal});assert.match(response.headers.get('content-type'),/text\/event-stream/);const reader=response.body.getReader(),decode=new TextDecoder();
  let data=decode.decode((await reader.read()).value);assert.match(data,/event: snapshot/);assert.ok(!data.includes(answer));
  await f.call(base+'/stroke',{data:stroke()});data=decode.decode((await reader.read()).value);assert.match(data,/event: stroke/);assert.ok(!data.includes(answer));
  f.db.prepare('UPDATE site_users SET disabled=1 WHERE id=2').run();await f.call(base+'/stroke',{data:stroke(1,0,'d'.repeat(32))});data=decode.decode((await reader.read()).value);assert.match(data,/event: revoked/);controller.abort();await reader.cancel().catch(()=>{});
  assert.equal((await f.call(base,{user:2})).status,401);f.advance(8*86400000);assert.equal((await f.call(base)).status,410);
});

test('a full ten-player room fans out one stroke to nine live readers and settles racing correct answers once',async t=>{
 const f=await fixture(t),token=await f.start(10),base='/'+token,answer=(await f.call(base)).data.room.turn.answer,connections=[];
 try{
  for(let user=2;user<=10;user++){const controller=new AbortController(),r=await fetch(f.base+'/api/draw-game'+base+'/events',{headers:{'X-Test-User':String(user)},signal:controller.signal}),reader=r.body.getReader();assert.equal(r.status,200);const first=new TextDecoder().decode((await reader.read()).value);assert.match(first,/snapshot/);assert.ok(!first.includes(answer));connections.push({controller,reader});}
  assert.equal((await f.call(base+'/stroke',{data:stroke()})).status,200);
  for(const c of connections){const event=new TextDecoder().decode((await c.reader.read()).value);assert.match(event,/event: stroke/);assert.ok(!event.includes(answer));}
  const guesses=await Promise.all(Array.from({length:9},(_,i)=>f.call(base+'/guess',{user:i+2,data:{round:1,text:answer}})));assert.ok(guesses.every(g=>g.status===200));const result=(await f.call(base)).data.room;assert.equal(result.turn.correctCount,9);assert.equal(result.turn.reason,'all');assert.equal(new Set(f.db.prepare('SELECT rank FROM draw_correct').all().map(r=>r.rank)).size,9);assert.ok(result.members.every(m=>m.score===0));
 }finally{for(const c of connections){c.controller.abort();await c.reader.cancel().catch(()=>{});}}
});
