import test from 'node:test';import assert from 'node:assert/strict';
import {DEFAULT_FACTORS,DEFAULT_RULES,normalizeRules,winningHand,newRoom,startHand,playAction,available,roomView} from '../scripts/mahjong-engine.mjs';
const win=[0,1,2,9,10,11,18,19,20,27,27,27,31,31];
function table(rules={}){const r=newRoom({id:1,username:'one'},1000,rules);for(let s=1;s<4;s++)r.seats[s]={userId:s+1,name:'player'+s,bot:false,away:false,ready:true,score:0};startHand(r,1000);return r;}
function force(r,hands,melds=[[],[],[],[]]){r.hands=hands.map(h=>[...h]);r.melds=structuredClone(melds);const used=Array(34).fill(0);for(const t of [...hands.flat(),...melds.flatMap(ms=>ms.flatMap(m=>Array(m.type==='pong'?3:4).fill(m.tile)))])used[t]++;assert.ok(used.every(n=>n<=4));r.wall=used.flatMap((n,t)=>Array(4-n).fill(t));r.turn=0;r.drawn=hands[0].at(-1);r.rivers=[[],[],[],[]];r.phase='playing';r.canKong=true;r.afterKong=false;r.pending=null;return r;}
const rules=input=>normalizeRules({cap:64,...input}),pattern=(hand,melds,input,name)=>winningHand(hand,melds,rules(input)).find(p=>p.name===name);
test('ten independent factors accept integer 1–64 and preserve historic defaults',()=>{
 for(const [key,value]of Object.entries(DEFAULT_FACTORS)){assert.equal(DEFAULT_RULES[key+'Factor'],value);for(const valid of [1,3,64])assert.equal(normalizeRules({[key+'Factor']:valid})[key+'Factor'],valid);for(const invalid of [0,-1,65,1.5,'4',null,true,NaN,Infinity])assert.throws(()=>normalizeRules({[key+'Factor']:invalid}),e=>e.status===400);}
 assert.equal(normalizeRules({selfDrawOnly:true,robKong:true}).robKong,true);assert.equal(normalizeRules({selfDrawOnly:false,robKong:false}).robKong,false);
});
test('every optional hand pattern uses its configured factor and respects exclusions',()=>{
 assert.equal(pattern([0,0,1,1,9,9,10,10,18,18,27,27,31,31],[],{sevenPairsFactor:3},'七对').factor,3);
 const luxury=winningHand([0,0,0,0,1,1,9,9,18,18,27,27,31,31],[],rules({sevenPairsFactor:3,luxuryPairsFactor:5}));assert.equal(luxury.find(p=>p.name==='豪华七对').factor,5);assert.ok(!luxury.some(p=>p.name==='七对'));
 assert.equal(pattern([0,0,0,9,9,9,18,18,18,27,27,27,31,31],[],{pungsFactor:7},'碰碰胡').factor,7);
 assert.equal(pattern([0,1,2,3,4,5,6,7,8,27,27,27,31,31],[],{halfFlushFactor:3},'混一色').factor,3);
 assert.equal(pattern([0,1,2,0,1,2,3,4,5,6,7,8,8,8],[],{flushFactor:5},'清一色').factor,5);
 const honors=winningHand([27,27,27,28,28,28,29,29,29,30,30,30,31,31],[],rules({allHonorsFactor:7}));assert.equal(honors.find(p=>p.name==='全字牌').factor,7);assert.ok(!honors.some(p=>['清一色','混一色'].includes(p.name)));
 assert.equal(pattern(win,[],{menqingFactor:3},'门清').factor,3);
 const melds=[27,28,29,30].map(tile=>({type:'pong',tile,from:1})),single=winningHand([31,31],melds,rules({singleWaitFactor:9}));assert.equal(single.find(p=>p.name==='单吊').factor,9);assert.ok(!single.some(p=>p.name==='金钩钓'));assert.ok(!winningHand(win).some(p=>p.name==='单吊'));assert.ok(!winningHand([31,31],melds,rules({singleWait:false,singleWaitFactor:9})).some(p=>p.name==='单吊'));
 assert.equal(pattern([3,4,5,9,10,11,18,19,20,31,31],[{type:'an',tile:0}],{kongDoubleFactor:7},'开杠').factor,7);
});
test('actual settlement applies non-power-of-two factors, factor one and caps without score drift',()=>{
 for(const [input,raw,multiplier]of [[{menqingFactor:3},3,3],[{menqingFactor:1},1,1],[{menqing:false,menqingFactor:64},1,1],[{menqingFactor:64,cap:8},64,8]]){const r=force(table({base:2,cap:64,...input}),[win,[],[],[]]);playAction(r,0,{type:'hu'},1100);const item=r.result.items[0];assert.equal(item.uncapped,raw);assert.equal(item.multiplier,multiplier);assert.deepEqual(r.result.delta,[multiplier*6,-multiplier*2,-multiplier*2,-multiplier*2]);assert.equal(r.result.delta.reduce((a,b)=>a+b,0),0);}
 const r=force(table({cap:64,menqingFactor:3,kongFlowerFactor:9}),[win,[],[],[]]);r.afterKong=true;playAction(r,0,{type:'hu'},1100);assert.equal(r.result.items[0].patterns.find(p=>p.name==='杠上开花').factor,9);assert.equal(r.result.items[0].uncapped,27);
});
test('largest combined configured factors stay exact before capping and use the 单吊 label',()=>{
 const input=Object.fromEntries(Object.keys(DEFAULT_FACTORS).map(k=>[k+'Factor',64])),r=force(table({...input,cap:64,base:10}),[[31,31],[],[],[]],[[27,28,29,30].map(tile=>({type:'an',tile,from:null})),[],[],[]]);r.afterKong=true;playAction(r,0,{type:'hu'},1100);assert.equal(r.result.items[0].uncapped,64**6);assert.ok(Number.isSafeInteger(r.result.items[0].uncapped));assert.equal(r.result.items[0].multiplier,64);assert.equal(r.result.delta[0],1920);assert.ok(r.result.items[0].patterns.some(p=>p.name==='单吊'));
});
test('legacy rooms fall back to the original factors and expose complete settings without rewriting state',()=>{
 const legacy=Object.fromEntries(Object.entries(DEFAULT_RULES).filter(([k])=>!k.endsWith('Factor'))),r=force(table(),[win,[],[],[]]);r.rules=legacy;assert.deepEqual(winningHand(win,[],legacy),winningHand(win));const view=roomView(r,1,'t',1000).room;assert.equal(view.rules.menqingFactor,2);assert.equal(r.rules.menqingFactor,undefined);playAction(r,0,{type:'hu'},1100);assert.equal(r.result.items[0].uncapped,2);assert.deepEqual(r.result.delta,[6,-2,-2,-2]);
});
test('self-draw-only can independently rob an added kong without allowing an ordinary discard win',()=>{
 const waiting=[0,1,9,10,11,18,19,20,27,27,27,31,31],melds=[[{type:'pong',tile:2,from:3}],[],[],[]];
 const ordinary=force(table({selfDrawOnly:true,robKong:true}),[[2],waiting,[],[]]);playAction(ordinary,0,{type:'discard',tile:2},1100);assert.equal(available(ordinary,1).claims,undefined);assert.throws(()=>playAction(ordinary,1,{type:'claim',choice:'hu'},1150));
 const robbed=force(table({selfDrawOnly:true,robKong:true,menqingFactor:3}),[[2],waiting,[],[]],melds),wall=robbed.wall.length;playAction(robbed,0,{type:'kong',kind:'bu',tile:2},1100);assert.equal(robbed.pending.rob,true);assert.deepEqual(available(robbed,1).claims,['hu']);playAction(robbed,1,{type:'claim',choice:'hu'},1200);assert.equal(robbed.result.items[0].rob,true);assert.equal(robbed.result.items[0].patterns[0].name,'抢杠胡');assert.equal(robbed.result.items[0].uncapped,3);assert.equal(robbed.result.source,0);assert.equal(robbed.melds[0][0].type,'pong');assert.equal(robbed.kongs.length,0);assert.equal(robbed.wall.length,wall);assert.deepEqual(robbed.result.delta,[-3,3,0,0]);
 const off=force(table({selfDrawOnly:true,robKong:false}),[[2],waiting,[],[]],melds);playAction(off,0,{type:'kong',kind:'bu',tile:2},1100);assert.equal(off.pending,null);assert.equal(off.melds[0][0].type,'bu');assert.equal(available(off,1).claims,undefined);
});
test('passing a rob-kong window completes the kong, while concealed kongs stay unrobbable',()=>{
 const waiting=[0,1,9,10,11,18,19,20,27,27,27,31,31],r=force(table({selfDrawOnly:true,robKong:true}),[[2],waiting,[],[]],[[{type:'pong',tile:2,from:3}],[],[],[]]);playAction(r,0,{type:'kong',kind:'bu',tile:2},1100);playAction(r,1,{type:'claim',choice:'pass'},1200);assert.equal(r.pending,null);assert.equal(r.melds[0][0].type,'bu');assert.equal(r.kongs.length,1);assert.equal(r.afterKong,true);
 const concealed=force(table({selfDrawOnly:true,robKong:true}),[[2,2,2,2],[],[],[]]);playAction(concealed,0,{type:'kong',kind:'an',tile:2},1100);assert.equal(concealed.pending,null);assert.equal(concealed.melds[0][0].type,'an');
});
