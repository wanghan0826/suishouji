import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {beats, classify, describePlay, legalMoves} from '../scripts/landlord-rules.mjs';
import {act, advanceTurn, deal, newRoom, humanSeat} from '../scripts/landlord-engine.mjs';
import {createLandlordGame} from '../scripts/landlord-game.mjs';

const cards = ranks => {
  const used = Array(15).fill(0);
  return ranks.map(rank => rank < 13 ? rank*4+used[rank]++ : 52+rank-13);
};
const shape = ranks => classify(cards(ranks))[0];

test('classic hand shapes, attachment lengths, strength and ace-high runs', () => {
  const examples = {
    single:[0], pair:[0,0], triple:[0,0,0], tripleSingle:[0,0,0,13], triplePair:[0,0,0,1,1],
    straight:[7,8,9,10,11], pairs:[0,0,1,1,2,2], plane:[0,0,0,1,1,1],
    planeSingles:[0,0,0,1,1,1,3,4], planePairs:[0,0,0,1,1,1,3,3,4,4],
    fourSingles:[0,0,0,0,3,4], fourPairs:[0,0,0,0,3,3,4,4], bomb:[0,0,0,0], rocket:[13,14]
  };
  for (const [kind,ranks] of Object.entries(examples)) assert.equal(shape(ranks)?.kind,kind);
  for (const invalid of [[8,9,10,11,12],[0,1,2,3],[0,0,1,1],[11,11,11,12,12,12],[0,0,0,1,1,1,2,2,2,2,3],[0,0,0,1,1,1,13,14]]) {
    assert.equal(shape(invalid),undefined);
  }
  assert.equal(describePlay([0,0]),undefined);
  assert.ok(beats(shape(examples.rocket),shape(examples.bomb)));
  assert.ok(!beats(shape(examples.bomb),shape(examples.rocket)));
  assert.ok(!beats(shape([5,6,7,8,9,10]),shape([0,1,2,3,4])));
  assert.ok(beats(shape([1,1,1,2,2,2,6,7]),shape(examples.planeSingles)));
  const hand=cards([1,1,1,2,2,2,6,7,13,14]);
  const previous=shape(examples.planeSingles);
  assert.ok(legalMoves(hand,previous).some(move => move.shape.kind === 'planeSingles'));
  assert.ok(legalMoves(hand,previous).every(move => move.cards.every(card => hand.includes(card)) && describePlay(move.cards,previous)));
});

function table() {
  const room=newRoom({id:1,username:'host'});
  room.seats[1]=humanSeat(2,'second');
  room.seats[2]=humanSeat(3,'third');
  deal(room,1000,{start:0});
  return room;
}

test('all-pass redeals, highest bidder leads, two passes reset and both springs settle zero-sum', () => {
  const room=table();
  assert.deepEqual(room.hands.map(hand => hand.length),[17,17,17]);
  assert.equal(new Set([...room.hands.flat(),...room.bottom]).size,54);
  for (let i=0;i<3;i++) act(room,i,'bid',{score:0},1200+i);
  assert.equal(room.redeal,true);
  assert.equal(room.round,1);
  const first=room.turn;
  act(room,first,'bid',{score:2},1400);
  assert.throws(() => act(room,room.turn,'bid',{score:1},1401), /更高/);
  act(room,room.turn,'bid',{score:0},1402);
  act(room,room.turn,'bid',{score:0},1403);
  assert.equal(room.landlord,first);
  assert.equal(room.hands[first].length,20);
  room.hands[first]=cards([0,0,0,0,8]);
  act(room,first,'play',{cards:cards([0,0,0,0])},1500);
  act(room,room.turn,'pass',{},1501);
  act(room,room.turn,'pass',{},1502);
  assert.equal(room.turn,first);
  assert.equal(room.tablePlay,null);
  assert.throws(() => act(room,first,'pass',{},1503),/领出/);
  act(room,first,'play',{cards:cards([8])},1504);
  assert.equal(room.multiplier,4);
  assert.equal(room.result.scores[first],16);
  assert.equal(room.result.scores.reduce((sum,score) => sum+score,0),0);

  const reverse=table();
  act(reverse,0,'bid',{score:3},1300);
  reverse.hands=[[0,2],[4],[]];
  act(reverse,0,'play',{cards:[0]},1301);
  act(reverse,1,'play',{cards:[4]},1302);
  assert.deepEqual(reverse.result.scores,[-12,6,6]);
});

test('bot-only simulation terminates and cards remain unique across a complete hand', () => {
  for (let game=0;game<25;game++) {
    const room=table();
    room.seats.forEach(seat => seat.bot=true);
    let now=1000;
    for (let turn=0;turn<350 && room.phase !== 'result';turn++) {
      assert.equal(advanceTurn(room,now+=35000),true);
      assert.equal(new Set(room.hands.flat()).size,room.hands.flat().length);
    }
    assert.equal(room.phase,'result');
    assert.equal(room.result.scores.reduce((sum,score) => sum+score,0),0);
  }
});

test('rooms enforce identity, private cards, one-time actions and reconnect',async t => {
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE site_users(id INTEGER PRIMARY KEY, disabled INTEGER DEFAULT 0)');
  for(let i=1;i<=4;i++) db.prepare('INSERT INTO site_users(id) VALUES (?)').run(i);
  const currentUser=req => {
    const id=Number(req.headers['x-user']);
    return id && db.prepare('SELECT id FROM site_users WHERE id=? AND disabled=0').get(id) && {id,username:'seat_'+id};
  };
  const users={currentUser,requireUser(req){
    const user=currentUser(req);
    if (!user || req.headers['x-sj-csrf'] !== 'test') throw Object.assign(new Error('Unauthorized'),{status:user ? 403 : 401});
    return user;
  }};
  let now=500000;
  let game=createLandlordGame({db,users,clock:()=>now});
  const server=createServer((req,res) => game.handle(req,res));
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(async () => {
    game.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  const base='http://127.0.0.1:'+server.address().port+'/api/landlord';
  async function call(path='',user=1,data,csrf='test') {
    const response=await fetch(base+path,{headers:{'Content-Type':'application/json','X-User':String(user),'X-SJ-CSRF':csrf},
      ...(data === undefined ? {} : {method:'POST',body:JSON.stringify(data)})});
    return {status:response.status,...await response.json()};
  }
  const opId=()=>randomBytes(16).toString('hex');
  assert.equal((await call('',0,{})).status,401);
  assert.equal((await call('',1,{},'wrong')).status,403);
  const create={opId:opId()};
  const {room:{token}}=await call('',1,create);
  assert.equal((await call('',1,create)).room.token,token);
  assert.equal((await call('',1,{...create,solo:true})).status,409);
  const path='/'+token;
  for (const id of [2,3]) assert.equal((await call(path+'/join',id,{opId:opId()})).status,200);
  assert.equal((await call(path+'/join',4,{opId:opId()})).status,409);
  let view=(await call(path)).room;
  assert.equal((await call(path+'/start',2,{opId:opId(),version:view.version})).status,403);
  view=(await call(path+'/start',1,{opId:opId(),version:view.version})).room;
  assert.equal(view.phase,'bidding');
  assert.equal(view.hand.length,17);
  assert.deepEqual(view.bottom,[]);
  assert.equal((await call(path,4)).room,undefined);
  const caller=view.turn+1;
  const input={opId:opId(),version:view.version,score:3};
  view=(await call(path+'/bid',caller,input)).room;
  assert.equal(view.hand.length,20);
  assert.equal(view.bottom.length,3);
  assert.deepEqual((await call(path+'/bid',caller,input)).room.hand,view.hand);
  assert.equal((await call(path+'/bid',caller,{...input,score:2})).status,409);
  assert.equal((await call(path+'/play',caller,{opId:opId(),version:view.version,cards:[view.hand[0],view.hand[0]]})).status,400);
  assert.equal((await call(path+'/play',caller,{opId:opId(),version:view.version-1,cards:[view.hand[0]]})).status,409);
  const played=(await call(path+'/play',caller,{opId:opId(),version:view.version,cards:[view.hand[0]]})).room;
  game.close();
  game=createLandlordGame({db,users,clock:()=>now});
  assert.deepEqual((await call(path,caller)).room.hand,played.hand);
  assert.equal((await call(path+'/leave',caller,{opId:opId()})).preview.canJoin,true);
  assert.equal((await call(path+'/join',caller,{opId:opId()})).room.hand.length,19);
  now+=31000;
  assert.ok((await call(path,caller)).room.version > played.version);
  const solo=await call('',4,{solo:true,opId:opId()});
  assert.equal(solo.room.phase,'bidding');
  assert.equal(solo.room.seats.filter(s => s.bot).length,2);
});
