import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import crypto from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
import {DEFAULT_RULES,normalizeRules,winningHand,newRoom,startHand,available,playAction,tick,roomView,botDiscard} from '../scripts/mahjong-engine.mjs';
import {createMahjongGame} from '../scripts/mahjong-game.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const win=[0,1,2,9,10,11,18,19,20,27,27,27,31,31],op=()=>crypto.randomBytes(16).toString('hex');
function table(rules={}){const r=newRoom({id:1,username:'one'},1000,rules);for(let s=1;s<4;s++)r.seats[s]={userId:s+1,name:'player'+s,bot:false,away:false,ready:true,score:0};startHand(r,1000);return r;}
function force(r,hands,{turn=0,melds=[[],[],[],[]],rivers=[[],[],[],[]]}={}){r.hands=hands.map(h=>[...h]);r.melds=structuredClone(melds);r.rivers=structuredClone(rivers);const used=Array(34).fill(0);for(const t of [...hands.flat(),...melds.flatMap(ms=>ms.flatMap(m=>Array(m.type==='pong'?3:4).fill(m.tile))),...rivers.flat()])used[t]++;assert.ok(used.every(n=>n<=4));r.wall=[];used.forEach((n,t)=>{for(let i=n;i<4;i++)r.wall.push(t);});r.turn=turn;r.drawn=hands[turn].at(-1);r.phase='playing';r.canKong=true;r.afterKong=false;r.pending=null;return r;}
function conservation(r){const tiles=[...r.wall,...r.hands.flat(),...r.melds.flatMap(ms=>ms.flatMap(m=>Array(m.type==='pong'?3:4).fill(m.tile))),...r.rivers.flat()];if(r.result?.items.some(i=>i.rob))tiles.push(r.result.tile);assert.equal(tiles.length,136);for(let t=0;t<34;t++)assert.equal(tiles.filter(v=>v===t).length,4,'tile '+t);assert.equal(r.seats.reduce((n,s)=>n+s.score,0),0);}

test('Xinyu defaults exclude chi and keep rob-kong independent from self-draw-only',()=>{assert.equal(DEFAULT_RULES.selfDrawOnly,true);assert.equal(DEFAULT_RULES.reserve,16);assert.equal(normalizeRules({robKong:true}).robKong,true);assert.equal(normalizeRules({selfDrawOnly:false,robKong:true}).robKong,true);for(const rules of [{reserve:-1},{hands:99},{chi:true},{sevenPairs:1},[],null])assert.throws(()=>normalizeRules(rules));});
test('winning solver handles honors, open melds, seven pairs and four-copy limits',()=>{
 assert.ok(winningHand(win));assert.equal(winningHand(win.slice(1)),null);assert.equal(winningHand([27,28,29,9,10,11,18,19,20,0,0,0,31,31]),null);
 assert.ok(winningHand(win.slice(3),[{type:'pong',tile:3}]));assert.equal(winningHand(win,[{type:'pong',tile:3}]),null);
 const seven=[0,0,1,1,9,9,10,10,18,18,27,27,31,31];assert.ok(winningHand(seven).some(p=>p.name==='七对'));assert.equal(winningHand(seven,[],{...DEFAULT_RULES,sevenPairs:false}),null);
 assert.ok(winningHand([0,0,0,0,1,1,9,9,18,18,27,27,31,31]).some(p=>p.name==='豪华七对'));
 assert.equal(winningHand([0,0,1,1,1,2,2,2,3,3,3],[{type:'an',tile:0}]),null);
});
test('dealing preserves all 136 tiles and gives dealer 14; public views never expose a wall or another hand',()=>{
 const r=table();conservation(r);assert.deepEqual(r.hands.map(h=>h.length),[14,13,13,13]);assert.equal(r.wall.length,83);
 const v=roomView(r,2,'t',1000).room;assert.deepEqual(v.hand,r.hands[1]);assert.ok(v.seats.every(s=>!Object.hasOwn(s,'hand')));assert.equal(v.wall,undefined);assert.equal(v.drawn,null);assert.equal(roomView(r,99,'t',1000).room,undefined);
 r.melds[0]=[{type:'an',tile:0,from:null}];assert.equal(roomView(r,2,'t',1000).room.seats[0].melds[0].tile,null);
});
test('selfdraw pays each opponent equally, is capped, zero-sum and settles only once',()=>{
 const r=force(table({cap:8}),[win,[],[],[]]);playAction(r,0,{type:'hu'},1100);assert.equal(r.phase,'between');assert.ok(r.result.delta[0]>0);assert.equal(r.result.delta[1],r.result.delta[2]);assert.equal(r.result.delta.reduce((n,x)=>n+x),0);assert.throws(()=>playAction(r,0,{type:'hu'},1101));conservation(r);
});
test('pong waits for all hu candidates and hu takes priority regardless of request order',()=>{
 const r=force(table({selfDrawOnly:false}),[[2],[2,2],[0,1,9,10,11,18,19,20,27,27,27,31,31],[]]);playAction(r,0,{type:'discard',tile:2},1100);assert.deepEqual(available(r,1).claims,['pong']);assert.ok(available(r,2).claims.includes('hu'));
 playAction(r,1,{type:'claim',choice:'pong'},1200);assert.equal(r.phase,'respond');assert.equal(r.melds[1].length,0);playAction(r,2,{type:'claim',choice:'hu'},1300);assert.deepEqual(r.result.winners,[2]);assert.equal(r.melds[1].length,0);assert.equal(r.result.source,0);conservation(r);
});
test('selfdraw rooms offer no discard hu or chi, and a pong must be followed by a discard',()=>{
 const r=force(table(),[[2],[2,2],[0,1,9,10,11,18,19,20,27,27,27,31,31],[]]),wallCount=r.wall.length;playAction(r,0,{type:'discard',tile:2},1100);assert.equal(available(r,2).claims,undefined);assert.throws(()=>playAction(r,1,{type:'claim',choice:'chi'},1200));playAction(r,1,{type:'claim',choice:'pong'},1200);assert.equal(r.turn,1);assert.equal(r.canKong,false);assert.equal(r.drawn,null);assert.equal(r.wall.length,wallCount);conservation(r);
});
test('multiple discard wins are either settled together or awarded to the closest seat',()=>{
 for(const multiHu of [true,false]){const r=force(table({selfDrawOnly:false,multiHu}),[[2],[0,1,9,10,11,12,13,14,18,19,20,27,27],[0,1,3,4,5,6,7,8,21,22,23,28,28],[]]);playAction(r,0,{type:'discard',tile:2},1100);playAction(r,2,{type:'claim',choice:'hu'},1200);assert.equal(r.phase,'respond');playAction(r,1,{type:'claim',choice:'hu'},1300);assert.deepEqual(r.result.winners,multiHu?[1,2]:[1]);conservation(r);}
});
test('concealed, exposed and added kongs draw from the tail and preserve physical tile counts',()=>{
 for(const kind of ['an','ming','bu']){
   const r=force(table(),kind==='an'?[[3,3,3,3,0],[],[],[]]:kind==='ming'?[[3],[3,3,3],[],[]]:[[3,0],[],[],[]],{melds:kind==='bu'?[[{type:'pong',tile:3,from:1}],[],[],[]]:[[],[],[],[]]});const tail=r.wall.at(-1);
   if(kind==='ming'){playAction(r,0,{type:'discard',tile:3},1100);playAction(r,1,{type:'claim',choice:'kong'},1200);assert.equal(r.drawn,tail);assert.equal(r.melds[1][0].type,'ming');}
   else {playAction(r,0,{type:'kong',tile:3,kind},1100);assert.equal(r.drawn,tail);assert.equal(r.melds[0][0].type,kind);}
   assert.equal(r.kongs.length,1);assert.equal(r.afterKong,true);conservation(r);
 }
});
test('robbed added kong removes only its fourth tile and awards no kong points',()=>{
 const r=force(table({selfDrawOnly:false,robKong:true}),[[2],[0,1,9,10,11,18,19,20,27,27,27,31,31],[],[]],{melds:[[{type:'pong',tile:2,from:3}],[],[],[]]});playAction(r,0,{type:'kong',kind:'bu',tile:2},1100);assert.equal(r.melds[0][0].type,'pong');playAction(r,1,{type:'claim',choice:'hu'},1200);assert.equal(r.kongs.length,0);assert.equal(r.result.items[0].rob,true);assert.equal(r.hands[0].length,0);conservation(r);
});
test('draw with reserve respects the chosen kong-settlement option',()=>{
 for(const mode of ['immediate','win']){const r=table({kongSettlement:mode});r.kongs=[{seat:0,type:'an',points:2,tile:3}];r.rules.reserve=r.wall.length;playAction(r,0,{type:'discard',tile:r.drawn},1100);if(r.phase==='respond'){for(const s of Object.keys(r.pending.eligible))playAction(r,Number(s),{type:'claim',choice:'pass'},1200);}assert.ok(r.result.draw);assert.deepEqual(r.result.delta,mode==='immediate'?[6,-2,-2,-2]:[0,0,0,0]);}
});
test('timeouts discard the drawn tile, and bots complete full matches without tile duplication or score drift',()=>{
 const r=table(),drawn=r.drawn;tick(r,r.deadline+1);assert.equal(r.rivers[0][0],drawn);
 for(let n=0;n<30;n++){const t=table({hands:1,selfDrawOnly:n%2===0,robKong:n%2!==0});t.seats.forEach(s=>s.bot=true);let now=1000,steps=0;while(['playing','respond'].includes(t.phase)&&steps++<1200){now+=100000;tick(t,now);conservation(t);}assert.equal(t.phase,'finished');assert.ok(steps<1200);}
 assert.equal(botDiscard([0,1,2,9,10,11,27]),27);
});

async function fixture(t){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE site_users(id INTEGER PRIMARY KEY,username TEXT,disabled INTEGER DEFAULT 0)');for(let n=1;n<=6;n++)db.prepare('INSERT INTO site_users VALUES(?,?,0)').run(n,'user'+n);
 const current=req=>db.prepare('SELECT id,username FROM site_users WHERE id=? AND disabled=0').get(Number(req.headers['x-user'])||0),users={currentUser:current,requireUser(req){const u=current(req);if(!u)throw Object.assign(Error('登录'),{status:401});if(req.headers['x-csrf']!=='valid')throw Object.assign(Error('CSRF'),{status:403});return u;}};
 let now=1000000,game=createMahjongGame({db,users,clock:()=>now});const server=http.createServer(async(req,res)=>{if(!await game.handle(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{game.close();server.closeAllConnections();await new Promise(r=>server.close(r));db.close();});
 const call=async(route='',{user=1,data,csrf='valid'}={})=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/mahjong'+route,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-User':String(user),'X-CSRF':csrf},...(data===undefined?{}:{body:JSON.stringify(data)})});return {status:r.status,data:await r.json()};};
 const create=async(rules={})=>{const r=await call('',{data:{rules}});assert.equal(r.status,200,JSON.stringify(r.data));return r.data.room.token;};
 const mutate=async(token,action,extra={},user=1)=>{const r=await call('/'+token,{user});return call('/'+token+'/'+action,{user,data:{version:r.data.room?.version??r.data.preview?.version,opId:op(),...extra}});};
 const start=async()=>{const token=await create();assert.equal((await mutate(token,'start',{fillBots:true})).status,200);return token;};
 const read=token=>JSON.parse(db.prepare('SELECT state FROM mahjong_rooms WHERE token=?').get(token).state),write=(token,r)=>db.prepare('UPDATE mahjong_rooms SET state=? WHERE token=?').run(JSON.stringify(r),token),advance=ms=>now+=ms,restart=()=>{game.close();game=createMahjongGame({db,users,clock:()=>now});};
 const connect=async(token,user=1)=>{
   const controller=new AbortController(),response=await fetch('http://127.0.0.1:'+server.address().port+'/api/mahjong/'+token+'/events',{headers:{'X-User':String(user)},signal:controller.signal});
   assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/event-stream/);assert.equal(response.headers.get('x-accel-buffering'),'no');
   const reader=response.body.getReader(),decoder=new TextDecoder(),events=[],waiters=[];let buffer='';
   const pump=(async()=>{try{while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);if(!block.startsWith('event: '))continue;const event={type:block.split('\n')[0].slice(7),data:JSON.parse(block.split('\ndata: ')[1])},index=waiters.findIndex(w=>w.test(event));if(index>=0){const w=waiters.splice(index,1)[0];clearTimeout(w.timer);w.resolve(event);}else events.push(event);}}}catch(e){if(!controller.signal.aborted)throw e;}})();
   t.after(async()=>{controller.abort();await pump;});
   return {events,close(){controller.abort();},next(test=()=>true){const index=events.findIndex(test);if(index>=0)return Promise.resolve(events.splice(index,1)[0]);return new Promise((resolve,reject)=>{const w={resolve,test,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(Error('Missing live Mahjong event'));},2500)};waiters.push(w);});}};
 };
 const raw=(route,user=1,headers={})=>fetch('http://127.0.0.1:'+server.address().port+'/api/mahjong'+route,{headers:{'X-User':String(user),...headers}});
 return {db,call,raw,create,mutate,start,read,write,advance,restart,connect,sweep:()=>game.sweep()};
}
test('API authentication, CSRF, host-only rules, four-seat capacity and ready resets',async t=>{
 const f=await fixture(t);assert.equal((await f.call('',{user:0})).status,401);assert.equal((await f.call('',{data:{},csrf:'wrong'})).status,403);const token=await f.create();for(const user of [2,3,4])assert.equal((await f.mutate(token,'join',{},user)).status,200);assert.equal((await f.mutate(token,'join',{},5)).status,409);assert.equal((await f.mutate(token,'rules',{rules:{base:2}},2)).status,403);assert.equal((await f.mutate(token,'start',{fillBots:true})).status,409);
 for(const user of [2,3,4])await f.mutate(token,'ready',{ready:true},user);await f.mutate(token,'rules',{rules:{base:2}});assert.equal(f.read(token).seats[1].ready,false);for(const user of [2,3,4])await f.mutate(token,'ready',{ready:true},user);assert.equal((await f.mutate(token,'start')).status,200);assert.equal((await f.mutate(token,'rules',{rules:{}})).status,409);
});
test('API hides hands from nonmembers, persists across restarts and rejects stale/duplicate actions safely',async t=>{
 const f=await fixture(t),token=await f.start(),before=f.read(token),version=before.version,input={version,opId:op(),type:'discard',tile:before.drawn};
 assert.equal((await f.call('/'+token,{user:2})).data.room,undefined);assert.equal((await f.mutate(token,'action',{type:'hu'},2)).status,403);f.restart();assert.deepEqual((await f.call('/'+token)).data.room.hand,before.hands[0]);
 const first=await f.call('/'+token+'/action',{data:input});assert.equal(first.status,200);assert.equal((await f.call('/'+token+'/action',{data:input})).status,200);assert.equal(f.read(token).rivers[0].length,1);
 assert.equal((await f.call('/'+token+'/action',{data:{...input,opId:op()}})).status,409);assert.equal((await f.call('/'+token+'/close',{data:input})).status,409);
 assert.equal(f.db.prepare('SELECT guesses FROM growth_game_daily WHERE user_id=1').get().guesses,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM growth_game_users').get().n,1);
});
test('leaving transfers hosting, uses bot takeover, supports reclaim and closes when all humans leave',async t=>{
 const f=await fixture(t),token=await f.create();await f.mutate(token,'join',{},2);await f.mutate(token,'ready',{ready:true},2);await f.mutate(token,'start',{fillBots:true});const left=await f.mutate(token,'leave');assert.equal(left.data.room,undefined);assert.equal(f.read(token).hostId,2);assert.equal(f.read(token).seats[0].away,true);assert.equal((await f.mutate(token,'join')).status,200);assert.equal(f.read(token).seats[0].away,false);await f.mutate(token,'leave');await f.mutate(token,'leave',{},2);assert.equal(f.read(token).phase,'closed');assert.equal((await f.mutate(token,'join')).status,410);
});
test('server processes response timeouts, bans and expiry without accepting late actions',async t=>{
 const f=await fixture(t),token=await f.start();f.advance(61000);const r=(await f.call('/'+token)).data.room;assert.ok(r.version>2);assert.equal(f.read(token).rivers[0].length,1);f.db.prepare('UPDATE site_users SET disabled=1 WHERE id=1').run();assert.equal((await f.call('/'+token)).status,401);f.advance(7*86400000);assert.equal((await f.call('/'+token,{user:2})).status,410);
});
test('simultaneous valid claims share a response context; another players pass or pong never invalidates hu',async t=>{
 const f=await fixture(t),token=await f.create({selfDrawOnly:false});for(const user of [2,3,4]){await f.mutate(token,'join',{},user);await f.mutate(token,'ready',{ready:true},user);}await f.mutate(token,'start');
 const r=force(f.read(token),[[2],[2,2],[0,1,9,10,11,18,19,20,27,27,27,31,31],[]]);f.write(token,r);
 const discarded=(await f.mutate(token,'action',{type:'discard',tile:2})).data.room,context={version:discarded.version,handNo:discarded.handNo,responseId:discarded.pending.id,type:'claim'};
 assert.equal((await f.call('/'+token+'/action',{user:3,data:{...context,version:context.version-1,responseId:'old',opId:op(),choice:'hu'}})).status,409);
 const responses=await Promise.all([f.call('/'+token+'/action',{user:2,data:{...context,choice:'pong',opId:op()}}),f.call('/'+token+'/action',{user:3,data:{...context,choice:'hu',opId:op()}})]);assert.deepEqual(responses.map(x=>x.status),[200,200]);assert.deepEqual(f.read(token).result.winners,[2]);
 assert.equal((await f.call('/'+token+'/action',{user:3,data:{...context,choice:'hu',opId:op()}})).status,409);
});
test('a real SQLite write lock defers background cleanup and rooms advance once the lock is released',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sj-mj-lock-')),file=path.join(dir,'test.db'),db=new DatabaseSync(file);let game,writer;
 try{
  db.exec('PRAGMA busy_timeout=0; CREATE TABLE site_users(id INTEGER PRIMARY KEY,username TEXT,disabled INTEGER DEFAULT 0); INSERT INTO site_users VALUES(1,\'lock_test\',0)');
  const now=10000000;game=createMahjongGame({db,users:{},clock:()=>now});const r=newRoom({id:1,username:'lock_test'},now-31*60000);db.prepare('INSERT INTO mahjong_rooms VALUES(?,?,?,?)').run('a'.repeat(32),JSON.stringify(r),now,now+86400000);
  writer=new DatabaseSync(file);writer.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE');assert.doesNotThrow(()=>game.sweep());writer.exec('ROLLBACK');assert.equal(JSON.parse(db.prepare('SELECT state FROM mahjong_rooms').get().state).phase,'lobby');
  game.sweep();assert.equal(JSON.parse(db.prepare('SELECT state FROM mahjong_rooms').get().state).phase,'closed');
  writer.exec('BEGIN IMMEDIATE');assert.doesNotThrow(()=>game.sweep());writer.exec('ROLLBACK');assert.doesNotThrow(()=>game.sweep());
 }finally{game?.close();writer?.close();db.close();fs.unlinkSync(file);fs.rmdirSync(dir);}
});
test('confirmed discard stream records claimed tiles and bot plays, with bounded history across hands',()=>{
 const r=force(table(),[[0],[0,0,4],[],[]]);
 playAction(r,0,{type:'discard',tile:0},1100);playAction(r,1,{type:'claim',choice:'pong'},1200);
 assert.deepEqual(r.rivers[0],[]);
 assert.deepEqual(roomView(r,3,'t',1200).room.discards,[{id:1,seat:0,tile:0,index:0,handNo:1,at:1100}]);
 assert.equal(roomView(r,99,'t',1200).preview.discards,undefined);
 r.seats[1].bot=true;tick(r,r.deadline+1);assert.equal(r.discards.at(-1).seat,1);assert.equal(r.discards.at(-1).tile,4);
 startHand(r,100000);for(let i=0;i<14;i++){force(r,[[12],[],[],[]]);playAction(r,0,{type:'discard',tile:12},100001+i);}
 assert.deepEqual(r.discards.map(e=>e.id),[5,6,7,8,9,10,11,12,13,14,15,16]);assert.ok(r.discards.every(e=>e.handNo===2));
});
test('only active tablemates can read and send chat; safe retries preserve the game version',async t=>{
 const f=await fixture(t),token=await f.create(),route='/'+token+'/chat',message={kind:'text',text:'  <img src=x onerror=alert(1)>  ',opId:op()};
 await f.mutate(token,'join',{},2);const version=f.read(token).version;
 assert.equal((await f.call(route,{user:0,data:message})).status,401);
 assert.equal((await f.call(route,{user:3,data:message})).status,403);
 assert.equal((await f.call(route,{user:2,csrf:'bad',data:message})).status,403);
 for(const bad of [{kind:'emoji',text:'unknown'},{kind:'text',text:'😀'.repeat(81)},{kind:'text',text:'\u202eabc'},{kind:'text',text:'\u200b'}])assert.equal((await f.call(route,{user:2,data:{...bad,opId:op()}})).status,400);
 const sent=await f.call(route,{user:2,data:message});assert.equal(sent.status,200);assert.equal(sent.data.chat[0].text,message.text.trim());assert.equal(sent.data.chat[0].name,'user2');
 assert.deepEqual((await f.call(route,{user:2,data:message})).data,sent.data);
 assert.equal((await f.call(route,{user:2,data:{...message,text:'another'}})).status,409);
 const emoji={kind:'emoji',text:'clap',opId:op()};
 assert.equal((await f.call(route,{user:2,data:emoji})).status,429);
 assert.equal((await f.call(route,{user:1,data:emoji})).status,200);
 assert.equal(f.read(token).version,version);
 f.restart();assert.equal((await f.call('/'+token)).data.room.chat.length,2);assert.equal((await f.call('/'+token,{user:3})).data.preview.chat,undefined);
 for(let i=0;i<50;i++){f.advance(850);assert.equal((await f.call(route,{user:2,data:{kind:'text',text:'消息 '+i,opId:op()}})).status,200);}
 const history=(await f.call('/'+token)).data.room.chat;assert.equal(history.length,48);assert.equal(history[0].text,'消息 2');assert.equal(history.at(-1).text,'消息 49');
 await f.mutate(token,'leave',{},2);assert.equal((await f.call('/'+token,{user:2})).data.preview.chat,undefined);assert.equal((await f.call(route,{user:2,data:message})).status,403);
 await f.mutate(token,'close');assert.deepEqual((await f.call('/'+token)).data.room.chat,[]);assert.equal((await f.call(route,{data:message})).status,410);
});

test('live Mahjong updates are personalized, immediate and carry chat without changing the game version',async t=>{
 const f=await fixture(t),token=await f.create();await f.mutate(token,'join',{},2);
 assert.equal((await f.call('/'+token+'/events',{user:0})).status,401);
 assert.equal((await f.call('/'+token+'/events',{user:3})).status,403);
 const host=await f.connect(token),other=await f.connect(token,2);await host.next();await other.next();
 await f.mutate(token,'ready',{ready:true},2);await host.next(e=>e.data.room?.seats[1].ready);await other.next(e=>e.data.room?.seats[1].ready);
 await f.mutate(token,'start',{fillBots:true});const a=(await host.next(e=>e.data.room?.phase==='playing')).data.room,b=(await other.next(e=>e.data.room?.phase==='playing')).data.room;
 assert.equal(a.hand.length,14);assert.equal(b.hand.length,13);assert.notDeepEqual(a.hand,b.hand);
 assert.equal(a.seats[1].hand,undefined);assert.equal(b.seats[0].hand,undefined);assert.equal(a.wall,undefined);assert.equal(b.wall,undefined);
 const version=a.version;await f.call('/'+token+'/chat',{user:2,data:{kind:'text',text:'出牌顺畅',opId:op()}});
 const chat=(await host.next(e=>e.data.room?.chat.at(-1)?.text==='出牌顺畅')).data.room;assert.equal(chat.version,version);
 await f.mutate(token,'action',{type:'discard',tile:a.hand[0]});const play=(await other.next(e=>e.data.room?.discards?.length)).data.room;assert.equal(play.discards.at(-1).tile,a.hand[0]);assert.ok(play.version>version);
 const reconnect=await f.connect(token);assert.equal((await reconnect.next()).data.room.version,f.read(token).version);
 await f.mutate(token,'close');assert.equal((await other.next(e=>e.type==='revoked')).data.status,410);assert.equal((await host.next(e=>e.type==='revoked')).data.status,410);
});

test('live streams revoke departed or disabled players, expire rooms and cap duplicate connections',async t=>{
 const f=await fixture(t),token=await f.create();await f.mutate(token,'join',{},2);
 const host=await f.connect(token),other=await f.connect(token,2),duplicate=await f.connect(token);await host.next();await other.next();await duplicate.next();
 const third=await f.connect(token);await third.next();assert.equal((await f.call('/'+token+'/events')).status,429);third.close();
 await f.mutate(token,'leave',{},2);assert.equal((await other.next(e=>e.type==='revoked')).data.status,403);
 f.db.prepare('UPDATE mahjong_rooms SET expires_at=0 WHERE token=?').run(token);
 // Reading a room that expires must also revoke the existing streams, without leaking another snapshot.
 assert.equal((await f.call('/'+token)).status,410);
 assert.equal((await host.next(e=>e.type==='revoked')).data.status,410);
 f.restart();
 const second=await f.create();await f.mutate(second,'join',{},2);const banned=await f.connect(second,2);await banned.next();
 f.db.prepare('UPDATE site_users SET disabled=1 WHERE id=2').run();f.sweep();assert.equal((await banned.next(e=>e.type==='revoked')).data.status,401);
});

test('pong announcements occur only after successful resolution, include bots and survive a claimed discard',()=>{
 const r=force(table(),[[0],[0,0,4],[],[]]);playAction(r,0,{type:'discard',tile:0},1100);assert.deepEqual(r.sounds.map(e=>e.kind),['discard']);
 playAction(r,1,{type:'claim',choice:'pong'},1200);assert.deepEqual(r.sounds.map(e=>e.kind),['discard','pong']);assert.deepEqual(r.rivers[0],[]);assert.equal(r.sounds[1].seat,1);assert.equal(roomView(r,2,'token',1300).room.sounds[1].kind,'pong');assert.equal(roomView(r,99,'token',1300).preview.sounds,undefined);
 assert.throws(()=>playAction(r,1,{type:'claim',choice:'pong'},1300));assert.equal(r.sounds.length,2);
 const bot=force(table(),[[4],[4,4,5],[],[]]);bot.seats[1].bot=true;playAction(bot,0,{type:'discard',tile:4},1100);tick(bot,2100);assert.equal(bot.sounds.at(-1).kind,'pong');
 const cancelled=force(table({selfDrawOnly:false}),[[2],[2,2,4],[0,1,9,10,11,12,13,14,18,19,20,27,27],[]]);playAction(cancelled,0,{type:'discard',tile:2},1100);playAction(cancelled,1,{type:'claim',choice:'pong'},1200);assert.equal(cancelled.sounds.filter(e=>e.kind==='pong').length,0);playAction(cancelled,2,{type:'claim',choice:'hu'},1300);assert.equal(cancelled.sounds.filter(e=>e.kind==='pong').length,0);
});

test('private voice messages bind the sender, retry once, persist and support bounded authenticated audio reads',async t=>{
 const f=await fixture(t),token=await f.create();await f.mutate(token,'join',{},2);
 const audio=Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.alloc(2048,7)]),message={kind:'voice',mime:'audio/webm;codecs=opus',duration:1200,audio:audio.toString('base64'),opId:op(),name:'forged'};
 assert.equal((await f.call('/'+token+'/chat',{user:3,data:message})).status,403);assert.equal((await f.call('/'+token+'/chat',{user:2,data:message,csrf:'bad'})).status,403);
 const sent=await f.call('/'+token+'/chat',{user:2,data:message});assert.equal(sent.status,200);const item=sent.data.chat.at(-1);assert.equal(item.name,'user2');assert.equal(item.duration,1200);assert.equal(item.audio,undefined);assert.match(item.url,/\/voice\/\d+$/);
 assert.equal((await f.call('/'+token+'/chat',{user:2,data:message})).data.chat.length,1);assert.equal((await f.call('/'+token+'/chat',{user:2,data:{...message,duration:1400}})).status,409);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mahjong_voice').get().n,1);
 const route=item.url.replace('/api/mahjong','');assert.equal((await f.raw(route,0)).status,401);assert.equal((await f.raw(route,3)).status,403);
 const response=await f.raw(route);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'audio/webm');assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await response.arrayBuffer()),audio);
 const partial=await f.raw(route,2,{Range:'bytes=4-19'});assert.equal(partial.status,206);assert.equal(partial.headers.get('content-range'),'bytes 4-19/'+audio.length);assert.deepEqual(Buffer.from(await partial.arrayBuffer()),audio.subarray(4,20));assert.equal((await f.raw(route,2,{Range:'bytes=999999-'})).status,416);
 f.restart();assert.equal((await f.raw(route,2)).status,200);await f.mutate(token,'leave',{},2);assert.equal((await f.raw(route,2)).status,403);await f.mutate(token,'close');assert.equal((await f.raw(route)).status,410);
});

test('voice limits reject oversized, malformed and long clips and remove audio when chat history rotates',async t=>{
 const f=await fixture(t),token=await f.create(),message={kind:'voice',mime:'audio/ogg',duration:1000,audio:Buffer.concat([Buffer.from('OggS'),Buffer.alloc(80)]).toString('base64')};
 for(const bad of [{duration:30001},{duration:100},{mime:'text/html'},{audio:'<script>'},{audio:Buffer.alloc(100).toString('base64')},{audio:'A'.repeat(710000)}])assert.ok((await f.call('/'+token+'/chat',{data:{...message,...bad,opId:op()}})).status>=400);
 f.advance(60001);const sent=await f.call('/'+token+'/chat',{data:{...message,opId:op()}});assert.equal(sent.status,200);const route=sent.data.chat[0].url.replace('/api/mahjong','');
 for(let i=0;i<48;i++){f.advance(850);assert.equal((await f.call('/'+token+'/chat',{data:{kind:'text',text:'消息'+i,opId:op()}})).status,200);}
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mahjong_voice').get().n,0);assert.equal((await f.raw(route)).status,404);
 for(const text of ['love','proud','shock','cry','please','angry','sleepy','hurry','nice','shy']){f.advance(850);assert.equal((await f.call('/'+token+'/chat',{data:{kind:'emoji',text,opId:op()}})).status,200);}
});
