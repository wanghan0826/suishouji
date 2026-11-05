import crypto from 'node:crypto';

export const DEFAULT_RULES=Object.freeze({hands:4,base:1,reserve:16,selfDrawOnly:true,sevenPairs:true,luxuryPairs:true,menqing:true,pungs:true,halfFlush:true,flush:true,allHonors:true,singleWait:true,kongDouble:true,kongFlower:true,multiHu:true,robKong:false,mingKong:1,anKong:2,kongSettlement:'immediate',cap:32,turnSeconds:60,responseSeconds:12,dealer:'winner'});
const choices={hands:[1,4,8,16],base:[1,2,5,10],reserve:[0,8,16,20],mingKong:[0,1,2],anKong:[0,1,2,4],kongSettlement:['immediate','win'],cap:[8,16,32,64],turnSeconds:[30,60,90],responseSeconds:[8,12,20],dealer:['winner','rotate']};
const fail=(message,status=409)=>Object.assign(Error(message),{status});
export function normalizeRules(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw fail('规则格式无效',400);
  const out={...DEFAULT_RULES};
  for(const [key,value]of Object.entries(input)){
    if(!Object.hasOwn(out,key))throw fail('未知规则：'+key,400);
    if(choices[key]?!choices[key].includes(value):typeof value!=='boolean')throw fail('规则选项无效：'+key,400);
    out[key]=value;
  }
  if(out.selfDrawOnly)out.robKong=false;
  if(!out.sevenPairs)out.luxuryPairs=false;
  return out;
}
export const tileName=t=>Number.isInteger(t)&&t>=0&&t<34?(t<27?['一','二','三','四','五','六','七','八','九'][t%9]+['万','筒','条'][Math.floor(t/9)]:['东','南','西','北','中','发','白'][t-27]):'暗牌';
const count=hand=>{const c=Array(34).fill(0);for(const t of hand){if(!Number.isInteger(t)||t<0||t>33)return null;c[t]++;if(c[t]>4)return null;}return c;};
function groups(c,n){
  const t=c.findIndex(v=>v>0);if(t<0)return n===0;if(n<=0)return false;
  if(c[t]>=3){c[t]-=3;const ok=groups(c,n-1);c[t]+=3;if(ok)return true;}
  if(t<27&&t%9<=6&&c[t+1]&&c[t+2]){c[t]--;c[t+1]--;c[t+2]--;const ok=groups(c,n-1);c[t]++;c[t+1]++;c[t+2]++;if(ok)return true;}
  return false;
}
export function winningHand(hand,melds=[],rules=DEFAULT_RULES){
  if(!Array.isArray(hand)||!Array.isArray(melds)||melds.length>4||hand.length!==14-melds.length*3)return null;
  const c=count(hand);if(!c)return null;
  const all=count([...hand,...melds.flatMap(m=>Array(m.type==='pong'?3:4).fill(m.tile))]);if(!all)return null;
  const pairs=!melds.length&&rules.sevenPairs&&c.every(v=>v%2===0);
  let standard=false;for(let i=0;i<34&&!standard;i++)if(c[i]>=2){c[i]-=2;standard=groups(c,4-melds.length);c[i]+=2;}
  if(!pairs&&!standard)return null;
  const patterns=[{name:'自摸平胡',factor:1}],honors=all.slice(27).some(Boolean),suits=[0,1,2].filter(s=>all.slice(s*9,s*9+9).some(Boolean));
  if(pairs){patterns.push({name:rules.luxuryPairs&&c.some(v=>v===4)?'豪华七对':'七对',factor:rules.luxuryPairs&&c.some(v=>v===4)?8:4});}
  else if(rules.pungs&&c.filter(v=>v===2).length===1&&c.every(v=>v===0||v===2||v===3))patterns.push({name:'碰碰胡',factor:2});
  if(rules.allHonors&&!suits.length)patterns.push({name:'全字牌',factor:8});
  else if(rules.flush&&suits.length===1&&!honors)patterns.push({name:'清一色',factor:4});
  else if(rules.halfFlush&&suits.length===1&&honors)patterns.push({name:'混一色',factor:2});
  if(rules.menqing&&melds.every(m=>m.type==='an'))patterns.push({name:'门清',factor:2});
  if(rules.singleWait&&melds.length===4)patterns.push({name:'金钩钓',factor:4});
  if(rules.kongDouble&&melds.some(m=>m.type!=='pong'))patterns.push({name:'开杠',factor:2});
  return patterns;
}
const log=(r,text)=>{r.log.push(text);if(r.log.length>32)r.log.shift();};
const name=(r,s)=>r.seats[s]?.name||'牌友';
const sort=hand=>hand.sort((a,b)=>a-b);
export function newRoom(host,now,rules={}){return {rules:normalizeRules(rules),phase:'lobby',handNo:0,version:1,hostId:host.id,createdAt:now,lastActive:now,seats:[{userId:host.id,name:host.username,bot:false,away:false,ready:true,score:0},null,null,null],dealer:0,turn:0,wall:[],hands:[[],[],[],[]],melds:[[],[],[],[]],rivers:[[],[],[],[]],log:[],deadline:0,botAt:0,drawn:null,pending:null,result:null,kongs:[],activity:[]};}
export function startHand(r,now){
  const wall=Array.from({length:136},(_,i)=>Math.floor(i/4));for(let i=wall.length-1;i>0;i--){const j=crypto.randomInt(i+1);[wall[i],wall[j]]=[wall[j],wall[i]];}
  r.wall=wall;r.hands=[[],[],[],[]];r.melds=[[],[],[],[]];r.rivers=[[],[],[],[]];r.kongs=[];r.activity=[];r.result=null;r.pending=null;r.handNo++;r.phase='playing';r.log=[];
  // Deal in packets of four, then one; dealer receives the first extra tile.
  for(let n=0;n<3;n++)for(let s=0;s<4;s++)for(let k=0;k<4;k++)r.hands[(r.dealer+s)%4].push(r.wall.shift());
  for(let s=0;s<4;s++)r.hands[(r.dealer+s)%4].push(r.wall.shift());r.hands.forEach(sort);
  draw(r,r.dealer,now);log(r,'第'+r.handNo+'局，'+name(r,r.dealer)+'坐庄');
}
function playable(r){return r.wall.length>r.rules.reserve;}
function setTurn(r,seat,now){r.turn=seat;r.deadline=now+r.rules.turnSeconds*1000;r.botAt=now+1000;}
function draw(r,seat,now,tail=false){
  if(!playable(r))return settle(r,[],null,now);
  const t=tail?r.wall.pop():r.wall.shift();r.hands[seat].push(t);sort(r.hands[seat]);r.drawn=t;r.afterKong=tail;r.canKong=true;r.phase='playing';setTurn(r,seat,now);
}
const remove=(hand,t,n)=>{for(let k=0;k<n;k++){const i=hand.indexOf(t);if(i<0)throw fail('手牌已变化，请重新选择');hand.splice(i,1);}};
function huPatterns(r,seat,tile=null){
  const p=winningHand(tile===null?r.hands[seat]:[...r.hands[seat],tile],r.melds[seat],r.rules);
  if(p){p[0].name=tile===null?'自摸':'点胡';if(tile===null&&r.afterKong&&r.rules.kongFlower)p.push({name:'杠上开花',factor:2});}
  return p;
}
export function available(r,seat){
  if(r.phase==='respond')return r.pending?.eligible[seat]&&!Object.hasOwn(r.pending.choices,seat)?{claims:r.pending.eligible[seat],tile:r.pending.tile}:{};
  if(r.phase!=='playing'||r.turn!==seat)return {};
  const hand=r.hands[seat],c=count(hand),kongs=[];
  if(r.canKong&&playable(r))for(let t=0;t<34;t++){if(c[t]===4)kongs.push({type:'an',tile:t});if(c[t]&&r.melds[seat].some(m=>m.type==='pong'&&m.tile===t))kongs.push({type:'bu',tile:t});}
  return {discard:true,hu:!!huPatterns(r,seat),kongs};
}
function settle(r,winners,source,now,rob=false){
  const delta=[0,0,0,0],items=[];
  if(winners.length){
    for(const s of winners){const patterns=huPatterns(r,s,source===null?null:r.pending.tile),raw=patterns.reduce((n,p)=>n*p.factor,1),multiplier=Math.min(raw,r.rules.cap),points=multiplier*r.rules.base,payers=source===null?[0,1,2,3].filter(v=>v!==s):[source];
      for(const from of payers){delta[from]-=points;delta[s]+=points;}
      items.push({seat:s,patterns,multiplier,uncapped:raw,points,payers,rob});
    }
  }
  if(winners.length||r.rules.kongSettlement==='immediate')for(const k of r.kongs){const p=k.points*r.rules.base;for(let s=0;s<4;s++)if(s!==k.seat){delta[s]-=p;delta[k.seat]+=p;}}
  for(let s=0;s<4;s++)r.seats[s].score+=delta[s];
  r.result={winners,source,tile:source===null?(winners.length?r.drawn:null):r.pending.tile,delta,items,kongs:r.kongs.map(k=>({...k,applied:winners.length>0||r.rules.kongSettlement==='immediate'})),hands:r.hands.map(h=>[...h]),at:now,draw:!winners.length};
  r.nextDealer=r.rules.dealer==='winner'?(winners[0]??r.dealer):(r.dealer+1)%4;
  r.phase=r.handNo>=r.rules.hands?'finished':'between';r.pending=null;r.deadline=0;r.drawn=null;
  log(r,winners.length?winners.map(s=>name(r,s)).join('、')+(source===null?'自摸':'胡牌')+'，本局结算':'荒牌流局，本局结算');
}
function kong(r,seat,tile,type,now,from=null){
  if(type==='bu'){remove(r.hands[seat],tile,1);r.melds[seat].find(m=>m.type==='pong'&&m.tile===tile).type='bu';}
  else{remove(r.hands[seat],tile,type==='an'?4:3);r.melds[seat].push({type,tile,from});}
  r.kongs.push({seat,type,points:type==='an'?r.rules.anKong:r.rules.mingKong,tile});
  log(r,name(r,seat)+(type==='an'?'暗杠':'杠'+tileName(tile)));r.pending=null;draw(r,seat,now,true);
}
function respond(r,tile,from,now,rob=false){
  const eligible={};
  for(let n=1;n<4;n++){const s=(from+n)%4,c=count(r.hands[s]),opts=[];
    if(!r.rules.selfDrawOnly&&huPatterns(r,s,tile))opts.push('hu');
    if(!rob){if(c[tile]>=3&&playable(r))opts.push('kong');if(c[tile]>=2)opts.push('pong');}
    if(opts.length)eligible[s]=opts;
  }
  if(!Object.keys(eligible).length){if(rob)kong(r,from,tile,'bu',now);else draw(r,(from+1)%4,now);return;}
  r.phase='respond';r.pending={id:crypto.randomBytes(12).toString('hex'),tile,from,rob,eligible,choices:{}};r.drawn=null;r.deadline=now+r.rules.responseSeconds*1000;r.botAt=now+900;
}
function resolve(r,now){
  const p=r.pending;
  if(!Object.keys(p.eligible).every(s=>Object.hasOwn(p.choices,s)))return;
  const order=Array.from({length:3},(_,i)=>(p.from+i+1)%4),winners=order.filter(s=>p.choices[s]==='hu');
  if(winners.length){
    if(p.rob)remove(r.hands[p.from],p.tile,1);
    settle(r,r.rules.multiHu?winners:winners.slice(0,1),p.from,now,p.rob);return;
  }
  if(p.rob){kong(r,p.from,p.tile,'bu',now);return;}
  const seat=order.find(s=>['pong','kong'].includes(p.choices[s]));
  if(seat!==undefined){const river=r.rivers[p.from];if(river.at(-1)===p.tile)river.pop();
    if(p.choices[seat]==='kong'){kong(r,seat,p.tile,'ming',now,p.from);return;}
    remove(r.hands[seat],p.tile,2);r.melds[seat].push({type:'pong',tile:p.tile,from:p.from});r.pending=null;r.phase='playing';r.canKong=false;r.afterKong=false;r.drawn=null;setTurn(r,seat,now);log(r,name(r,seat)+'碰'+tileName(p.tile));return;
  }
  r.pending=null;draw(r,(p.from+1)%4,now);
}
export function playAction(r,seat,input,now){
  if(!r.seats[seat])throw fail('请先入座',403);
  const a=available(r,seat);
  if(input.type==='claim'){
    if(!a.claims)throw fail('已响应或这张牌不能操作');
    if(input.choice!=='pass'&&!a.claims.includes(input.choice))throw fail('不能执行这个响应',400);
    r.pending.choices[seat]=input.choice;log(r,name(r,seat)+'已响应');resolve(r,now);return;
  }
  if(!a.discard)throw fail('还没轮到你出牌');
  if(input.type==='hu'){if(!a.hu)throw fail('当前手牌还不能胡');settle(r,[seat],null,now);return;}
  if(input.type==='kong'){
    const k=a.kongs.find(k=>k.tile===input.tile&&k.type===input.kind);if(!k)throw fail('当前不能杠这张牌');
    if(k.type==='bu'&&r.rules.robKong){respond(r,k.tile,seat,now,true);return;}
    kong(r,seat,k.tile,k.type,now);return;
  }
  if(input.type!=='discard'||!Number.isInteger(input.tile)||!r.hands[seat].includes(input.tile))throw fail('请选择手中的一张牌',400);
  remove(r.hands[seat],input.tile,1);r.rivers[seat].push(input.tile);
  // A claim may remove the tile from the river before another player polls.
  // Keep a bounded stream of confirmed public discards, independent of river length.
  r.discardSeq=(r.discardSeq||0)+1;(r.discards??=[]).push({id:r.discardSeq,seat,tile:input.tile,index:r.rivers[seat].length-1,handNo:r.handNo,at:now});if(r.discards.length>12)r.discards.shift();
  log(r,name(r,seat)+'打出'+tileName(input.tile));r.afterKong=false;r.drawn=null;respond(r,input.tile,seat,now);
}
// The bot uses only its own hand and visible melds. It never reads the wall or other hands.
export function botDiscard(hand){
  const c=count(hand);let best=Infinity,tile=hand.at(-1);
  for(const t of new Set(hand)){let value=c[t]>=3?9:c[t]===2?5:0;if(t<27)for(const d of [-2,-1,1,2])if(Math.floor((t+d)/9)===Math.floor(t/9)&&c[t+d])value+=Math.abs(d)===1?2:1;
    if(value<best){best=value;tile=t;}
  }return tile;
}
export function tick(r,now){
  if(r.phase==='respond'){
    let changed=false;
    for(const s of Object.keys(r.pending.eligible).map(Number))if(!Object.hasOwn(r.pending.choices,s)){
      const bot=r.seats[s].bot||r.seats[s].away;
      if(bot&&now>=r.botAt||now>=r.deadline){r.pending.choices[s]=bot?(r.pending.eligible[s].find(v=>v==='hu')||r.pending.eligible[s].find(v=>v==='kong')||r.pending.eligible[s].find(v=>v==='pong')||'pass'):'pass';changed=true;}
    }
    if(changed)resolve(r,now);return changed;
  }
  if(r.phase==='playing'){
    const s=r.turn,bot=r.seats[s].bot||r.seats[s].away;
    if(bot&&now>=r.botAt||now>=r.deadline){const a=available(r,s);if(bot&&a.hu)playAction(r,s,{type:'hu'},now);else if(bot&&a.kongs.length)playAction(r,s,{type:'kong',kind:a.kongs[0].type,tile:a.kongs[0].tile},now);else playAction(r,s,{type:'discard',tile:bot?botDiscard(r.hands[s]):r.drawn??r.hands[s].at(-1)},now);return true;}
  }return false;
}
export function roomView(r,id,token,now){
  const me=r.seats.findIndex(s=>s?.userId===id&&!s.away),host=r.seats.find(s=>s?.userId===r.hostId);
  if(me<0)return {preview:{host:host?.name||'朋友',count:r.seats.filter(Boolean).length,phase:r.phase,canJoin:r.phase==='lobby'&&r.seats.some(s=>!s)||r.seats.some(s=>s?.userId===id&&s.away)&&!['closed','finished'].includes(r.phase),rules:r.rules}};
  const revealed=['between','finished'].includes(r.phase);
  return {room:{token,phase:r.phase,version:r.version,handNo:r.handNo,rules:r.rules,me,hostId:r.hostId,dealer:r.dealer,turn:r.turn,remaining:Math.max(0,r.wall.length-r.rules.reserve),wallCount:r.wall.length,deadline:r.deadline,serverNow:now,drawn:r.turn===me&&r.phase==='playing'?r.drawn:null,hand:[...r.hands[me]],seats:r.seats.map((s,i)=>s?{...s,handCount:r.hands[i].length,melds:r.melds[i].map(m=>m.type==='an'&&i!==me&&!revealed?{type:'an',tile:null,from:null}:m),river:r.rivers[i],...(revealed?{hand:r.hands[i]}:{})}:null),actions:available(r,me),pending:r.pending?{id:r.pending.id,tile:r.pending.tile,from:r.pending.from,rob:r.pending.rob,responded:Object.hasOwn(r.pending.choices,me)}:null,result:r.result,log:r.log,discards:r.discards||[]}};
}
