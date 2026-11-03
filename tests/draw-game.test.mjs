import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createDrawingGame,drawingScores,validStroke} from '../scripts/draw-game.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
async function fixture(t){
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE site_users(id INTEGER PRIMARY KEY,username TEXT,disabled INTEGER DEFAULT 0);');for(let id=1;id<=12;id++)db.prepare('INSERT INTO site_users VALUES(?,?,0)').run(id,'player_'+id);
  const current=req=>db.prepare('SELECT id,username FROM site_users WHERE id=? AND disabled=0').get(Number(req.headers['x-test-user'])||0),users={currentUser:current,requireUser(req){const user=current(req);if(!user)throw fail(401,'登录后操作');if(req.headers['x-test-csrf']!=='valid')throw fail(403,'无效凭据');return user;}};
  let now=Date.parse('2026-11-03T12:00:00+08:00');const game=createDrawingGame({db,users,clock:()=>now}),server=http.createServer(async(req,res)=>{if(!await game.handle(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  t.after(async()=>{game.close();server.closeAllConnections();await new Promise(r=>server.close(r));db.close();});
  async function call(route='',{user=1,data,csrf='valid',method=data===undefined?'GET':'POST'}={}){const r=await fetch(base+'/api/draw-game'+route,{method,headers:{'X-Test-User':String(user),'X-Test-CSRF':csrf,'Content-Type':'application/json'},...(data!==undefined?{body:JSON.stringify(data)}:{})});return {status:r.status,data:await r.json(),headers:r.headers};}
  const create=async()=>{const r=await call('',{data:{}});assert.equal(r.status,200);return r.data.room.token;};
  const start=async(count=3)=>{const token=await create();for(let user=2;user<=count;user++)assert.equal((await call('/'+token+'/join',{user,data:{}})).status,200);assert.equal((await call('/'+token+'/start',{data:{}})).status,200);return token;};
  const advance=ms=>now+=ms;return {db,base,call,create,start,advance};
}
const stroke=(round=1,epoch=0,op='a'.repeat(32),path='b'.repeat(32))=>({round,epoch,opId:op,strokeId:path,color:'#25352d',size:6,points:[[10,20],[100,200]]});

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
  for(const [round,drawer]of [[2,2],[3,3],[4,4]]){f.advance(8001);let next=(await f.call(base,{user:drawer})).data.room;assert.equal(next.round,round);assert.equal(next.turn.drawerId,drawer);assert.ok(next.turn.answer);f.advance(90001);await f.call(base);}
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
