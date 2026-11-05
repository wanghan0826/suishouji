(()=>{
  const $=id=>document.getElementById(id),el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const defaults={hands:4,base:1,reserve:16,selfDrawOnly:true,sevenPairs:true,luxuryPairs:true,menqing:true,pungs:true,halfFlush:true,flush:true,allHonors:true,singleWait:true,kongDouble:true,kongFlower:true,multiHu:true,robKong:false,mingKong:1,anKong:2,kongSettlement:'immediate',cap:32,turnSeconds:60,responseSeconds:12,dealer:'winner'};
  const fields={hands:['局数',[[1,'1 局体验'],[4,'4 局'],[8,'8 局'],[16,'16 局']]],base:['基础积分',[[1,'1 分'],[2,'2 分'],[5,'5 分'],[10,'10 分']]],reserve:['荒牌保留',[[0,'不留荒牌'],[8,'留 8 张'],[16,'留 16 张'],[20,'留 20 张']]],selfDrawOnly:['胡牌方式',[[true,'只自摸'],[false,'可自摸、可点胡']]],mingKong:['明杠 / 补杠',[[0,'不计分'],[1,'每家 1 分'],[2,'每家 2 分']]],anKong:['暗杠',[[0,'不计分'],[1,'每家 1 分'],[2,'每家 2 分'],[4,'每家 4 分']]],kongSettlement:['杠分结算', [['immediate','流局也计杠分'],['win','有人胡牌才计杠分']]],cap:['胡牌倍数上限',[[8,'8 倍'],[16,'16 倍'],[32,'32 倍'],[64,'64 倍']]],turnSeconds:['出牌时间',[[30,'30 秒'],[60,'60 秒'],[90,'90 秒']]],responseSeconds:['碰杠胡响应',[[8,'8 秒'],[12,'12 秒'],[20,'20 秒']]],dealer:['下一局庄家',[['winner','赢家坐庄，流局连庄'],['rotate','每局轮庄']]]};
  const checks={sevenPairs:'七对 ×4',luxuryPairs:'豪华七对 ×8',menqing:'门清 ×2',pungs:'碰碰胡 ×2',halfFlush:'混一色 ×2',flush:'清一色 ×4',allHonors:'全字牌 ×8',singleWait:'金钩钓 ×4',kongDouble:'开杠 ×2',kongFlower:'杠上开花 ×2',multiHu:'允许一炮多响',robKong:'允许抢补杠胡'};
  const phases={lobby:'等待入座',playing:'正在打牌',respond:'等待响应',between:'本局结算',finished:'整桌结束',closed:'牌室关闭'},directions=['东','南','西','北'];
  let token=/^\/mahjong\/([a-f0-9]{32})\/?$/.exec(location.pathname)?.[1]||'',room=null,preview=null,selected=null,selectedIndex=-1,busy=false,epoch=0,authId=undefined,polling=false,lastRendered='',confirmAction=null;
  const controllers=new Set(),name=t=>t<27?['一','二','三','四','五','六','七','八','九'][t%9]+['万','筒','条'][Math.floor(t/9)]:['东','南','西','北','中','发','白'][t-27];
  const operationId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
  const svgNS='http://www.w3.org/2000/svg';
  const sides=['bottom','right','top','left'];
  const icons={back:'M19 12H5m6-6-6 6 6 6',sound:'M4 9h4l5-4v14l-5-4H4zm13 0a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12',muted:'M4 9h4l5-4v14l-5-4H4zm13 1 5 5m0-5-5 5',expand:'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5',collapse:'M4 9h5V4m11 5h-5V4m-6 16v-5H4m11 5v-5h5',chat:'M4 5h16v11h-8l-5 4v-4H4zm4 5h8m-8 3h5',menu:'M5 6h14M5 12h14M5 18h14',close:'m6 6 12 12m0-12L6 18',hello:'M6 19c-2-2-2-5-1-6l3 3V6a1 1 0 0 1 2 0v6-8a1 1 0 0 1 2 0v8-6a1 1 0 0 1 2 0v6-3a1 1 0 0 1 2 0v7a5 5 0 0 1-5 5H9',laugh:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM7 10l2-2 1 2m4 0 1-2 2 2M8 14h8a4 4 0 0 1-8 0Z',clap:'m5 13 4 4c1 1 2 0 1-1L6 9l1-1 5 5-4-7 1-1 5 6-2-6 1-1 4 8 1-2 2 1-2 7a5 5 0 0 1-8 2l-6-5Zm11-9 2-2m1 5 3-1',think:'M20 12a8 8 0 1 0-11 7m-2-8h3m4 0 2-1m-4 5h4m4 5H9l2-4h2v2h6z',wow:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8 8v2m8-2v2m-2 5a2 3 0 1 1-4 0 2 3 0 1 1 4 0Z',again:'M20 10a8 8 0 1 0 0 5m0-11v6h-6'};
  function icon(key){const svg=document.createElementNS(svgNS,'svg'),p=document.createElementNS(svgNS,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');p.setAttribute('d',icons[key]);svg.append(p);return svg;}
  function buttonIcon(id,key){$(id).querySelector('[data-mj-icon]').replaceChildren(icon(key));}
  document.querySelectorAll('[data-mj-icon]').forEach(n=>n.append(icon(n.dataset.mjIcon)));
  const emoji={hello:'打招呼',laugh:'大笑',clap:'鼓掌',think:'想一想',wow:'好牌！',again:'再来一局'};
  let chatLast=null,chatUnread=false,chatPending=null,chatBusy=false;
  for(const [id,label]of Object.entries(emoji)){const b=el('button');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.append(icon(id));b.onclick=()=>sendChat('emoji',id);$('mjEmoji').append(b);}
  function chatOpen(open,focus=false){
    $('mjChat').hidden=!open;$('mjChatToggle').setAttribute('aria-expanded',String(open));
    if(open){chatUnread=false;const list=$('mjChatHistory');list.scrollTop=list.scrollHeight;if(focus)$('mjChatClose').focus();}
    else {$('mjChatInput').blur();if(focus)$('mjChatToggle').focus();}
    $('mjChatToggle').lastElementChild.hidden=!chatUnread;
  }
  function syncChat(history){
    const list=$('mjChatHistory'),newest=history.at(-1)?.id||0;
    if(chatLast!==null&&newest<=chatLast)return;
    const atEnd=list.scrollHeight-list.clientHeight-list.scrollTop<35,previousHeight=list.scrollHeight,previousTop=list.scrollTop;
    if(chatLast!==null&&$('mjChat').hidden&&history.some(m=>m.id>chatLast&&m.seat!==room?.me))chatUnread=true;
    chatLast=newest;$('mjChatToggle').lastElementChild.hidden=!chatUnread;
    const items=history.map(m=>{const li=el('div','mj-chat-line'+(m.seat===room?.me?' is-mine':'')),body=el('span','mj-chat-body');li.dataset.id=m.id;li.append(el('b','',m.name),body);
      if(m.kind==='emoji'&&Object.hasOwn(emoji,m.text)){body.classList.add('mj-chat-reaction');body.append(icon(m.text),el('span','',emoji[m.text]));}else{body.textContent=m.text;body.dir='auto';}return li;});
    const first=Number(list.firstElementChild?.dataset.id||0),retained=new Set(history.map(m=>m.id));let removed=0;
    for(const old of [...list.children])if(!retained.has(Number(old.dataset.id))){removed+=old.getBoundingClientRect().height+6;old.remove();}
    const displayed=Number(list.lastElementChild?.dataset.id||first-1);
    if(items.length)list.append(...items.filter(li=>Number(li.dataset.id)>displayed));
    else list.replaceChildren(el('p','mj-chat-empty','还没有消息，和牌友打个招呼吧。'));
    if(atEnd||!previousHeight)list.scrollTop=list.scrollHeight;else list.scrollTop=Math.max(0,previousTop-removed);
  }
  function resetChat(){chatLast=null;chatUnread=false;chatPending=null;chatBusy=false;chatOpen(false);$('mjChatHistory').replaceChildren();$('mjChatInput').value='';$('mjChatStatus').textContent='';$('mjChatSend').disabled=false;}
  async function sendChat(kind,text){
    if(!room||room.phase==='closed'||chatBusy)return;
    if(kind==='text'&&(!text||[...text].length>80)){$('mjChatStatus').textContent='请输入 1–80 个字符。';return;}
    if(chatPending?.kind!==kind||chatPending?.text!==text)chatPending={kind,text,opId:operationId()};
    const revision=epoch;chatBusy=true;$('mjChatSend').disabled=true;$('mjChatStatus').textContent='';
    try {const value=await api('/'+token+'/chat',chatPending);if(room?.phase!=='closed')syncChat(value.chat);chatPending=null;if(kind==='text'&&$('mjChatInput').value.trim()===text)$('mjChatInput').value='';}
    catch(e){if(revision===epoch){$('mjChatStatus').textContent=e.message;if(e.status&&e.status!==429)chatPending=null;}}
    finally{if(revision===epoch){chatBusy=false;$('mjChatSend').disabled=false;}}
  }
  $('mjChatToggle').onclick=()=>chatOpen($('mjChat').hidden,true);$('mjChatClose').onclick=()=>chatOpen(false,true);
  $('mjChat').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();chatOpen(false,true);}};
  $('mjChatForm').onsubmit=e=>{e.preventDefault();sendChat('text',$('mjChatInput').value.trim());};
  const viewport=window.visualViewport;
  function keyboardSize(){const h=viewport&&document.activeElement===$('mjChatInput')&&window.innerHeight-viewport.height>75?Math.floor(viewport.height):0;$('mjTable').classList.toggle('mj-keyboard',!!h);$('mjTable').style.setProperty('--mj-keyboard-height',h?h+'px':'100dvh');}
  viewport?.addEventListener('resize',keyboardSize);$('mjChatInput').onblur=()=>requestAnimationFrame(keyboardSize);
  const orientation=matchMedia('(orientation: landscape)'),fullElement=()=>document.fullscreenElement||document.webkitFullscreenElement;
  let fullOwned=false,fullPending=false,rotationHint=false,fullEpoch=0;
  function fullUi(){const full=fullOwned&&!!fullElement();buttonIcon('mjFullscreen',full?'collapse':'expand');$('mjFullscreen').setAttribute('aria-pressed',String(full));$('mjFullscreen').setAttribute('aria-label',full?'退出全屏':'横屏全屏');$('mjFullscreen').querySelector('span:last-child').textContent=full?'退出':'横屏';$('mjModeNotice').textContent=rotationHint&&!orientation.matches?'请将手机横放，牌桌会自动调整。':'';}
  function releaseFull(){fullEpoch++;rotationHint=false;if(fullOwned){screen.orientation?.unlock?.();if(fullElement()){try{Promise.resolve((document.exitFullscreen||document.webkitExitFullscreen).call(document)).catch(()=>{});}catch{}}}fullOwned=false;fullUi();}
  $('mjFullscreen').onclick=async()=>{
    if(fullOwned&&fullElement()){releaseFull();return;}if(fullPending)return;
    if(fullElement()){rotationHint=true;fullUi();return;}
    fullPending=true;const id=fullEpoch,root=document.documentElement;
    try{
      const request=root.requestFullscreen||root.webkitRequestFullscreen;if(!request)throw Error();
      await request.call(root,{navigationUI:'hide'});fullOwned=!!fullElement();
      if(id!==fullEpoch){releaseFull();return;}
      try{if(!screen.orientation?.lock)throw Error();await screen.orientation.lock('landscape');rotationHint=false;}catch{rotationHint=true;}
      if(id!==fullEpoch){releaseFull();return;}
    }catch{if(id===fullEpoch)rotationHint=true;}
    finally{fullPending=false;fullUi();}
  };
  function fullChanged(){if(fullOwned&&!fullElement()){fullOwned=false;rotationHint=false;screen.orientation?.unlock?.();}fullUi();}
  document.addEventListener('fullscreenchange',fullChanged);document.addEventListener('webkitfullscreenchange',fullChanged);orientation.addEventListener('change',fullUi);
  const voiceCues=[[0,10183],[10183,10688],[20871,13028],[33899,11458],[45357,10838],[56195,10624],[66819,12123],[78942,10440],[89382,11589],[100971,12194],[113165,12281],[125446,14626],[140072,13035],[153107,12291],[165398,12215],[177613,13710],[191323,12030],[203353,13061],[216414,11982],[228396,12315],[240711,14666],[255377,13073],[268450,12472],[280922,12252],[293174,13749],[306923,12063],[318986,13224],[332210,13478],[345688,12864],[358552,12039],[370591,11157],[381748,16311],[398059,12503],[410562,11402]],voiceAsset='/assets/mahjong-voice-f089a5cf.wav',voiceRate=22050;
  let voiceOn=true,voiceId=null,voiceContext=null,voiceBuffer=null,voiceLoading=null,voiceCurrent=null,voiceQueue=[],voiceReading=false,voiceGeneration=0;
  try{voiceOn=localStorage.getItem('sj-mahjong-voice')!=='off';}catch{}
  function voiceUi(){buttonIcon('mjSound',voiceOn?'sound':'muted');$('mjSound').setAttribute('aria-pressed',String(voiceOn));$('mjSound').title=voiceOn?'关闭报牌声音':'开启报牌声音';}
  function voiceStop(){voiceGeneration++;voiceQueue=[];voiceReading=false;if(voiceCurrent){try{voiceCurrent.stop();}catch{}voiceCurrent=null;}}
  function voiceReset(){voiceId=null;voiceStop();}
  function voicePrepare(){
    if(!voiceOn||!room||document.hidden)return;
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    try{
      voiceContext??=new Audio();
      if(voiceContext.state!=='running')voiceContext.resume().then(playVoice).catch(()=>{});
      if(!voiceBuffer&&!voiceLoading)voiceLoading=fetch(voiceAsset).then(r=>{if(!r.ok)throw Error();return r.arrayBuffer();}).then(b=>voiceContext.decodeAudioData(b)).then(b=>{voiceBuffer=b;playVoice();}).catch(()=>{}).finally(()=>{voiceLoading=null;});
    }catch{}
  }
  function playVoice(){
    if(!voiceOn||document.hidden||!voiceBuffer||voiceReading||voiceContext.state!=='running')return;
    voiceQueue=voiceQueue.filter(e=>Date.now()-e.queued<4000);const event=voiceQueue.shift();if(!event)return;
    const cue=voiceCues[event.tile];if(!cue)return;
    const source=voiceContext.createBufferSource(),gain=voiceContext.createGain(),rev=voiceGeneration;
    source.buffer=voiceBuffer;gain.gain.value=.8;source.connect(gain);gain.connect(voiceContext.destination);
    voiceCurrent=source;voiceReading=true;source.onended=()=>{source.disconnect();gain.disconnect();if(rev===voiceGeneration){voiceCurrent=null;voiceReading=false;playVoice();}};
    source.start(0,cue[0]/voiceRate,cue[1]/voiceRate);
  }
  function syncVoice(r){
    const stream=r.discards||[],latest=stream.at(-1)?.id||0;
    if(voiceId===null){voiceId=latest;return;}
    if(latest<=voiceId)return;
    if(voiceOn&&voiceContext&&!document.hidden){const now=Date.now();voiceQueue.push(...stream.filter(e=>e.id>voiceId&&e.handNo===r.handNo&&r.serverNow-e.at<4000).map(e=>({...e,queued:now})));voiceQueue=voiceQueue.slice(-4);playVoice();}
    voiceId=latest;
  }
  voiceUi();
  $('mjSound').onclick=()=>{voiceOn=!voiceOn;try{localStorage.setItem('sj-mahjong-voice',voiceOn?'on':'off');}catch{}voiceUi();if(voiceOn)voicePrepare();else voiceStop();};
  $('mjTable').addEventListener('click',e=>{if(!e.target.closest('#mjSound'))voicePrepare();},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)voiceStop();});
  function tile(t,back=false){
    const svg=document.createElementNS(svgNS,'svg');svg.setAttribute('viewBox','0 0 40 56');svg.setAttribute('aria-hidden','true');
    const node=(tag,attrs,text)=>{const n=document.createElementNS(svgNS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text)n.textContent=text;svg.append(n);return n;};
    node('rect',{x:0,y:4,width:40,height:52,rx:3,fill:'#79a690'});node('rect',{x:0,y:0,width:40,height:50,rx:3,fill:back?'#2c7463':'#f8f3dd'});node('path',{d:'M3 3H37',stroke:back?'#81ac95':'#fffdf1','stroke-width':2});
    if(back){node('path',{d:'M9 12H31V38H9ZM14 17H26V33H14Z',fill:'none',stroke:'#83b5a1','stroke-width':1});return svg;}
    if(t===33){node('path',{d:'M7 10H33V40H7ZM11 14H29V36H11Z',fill:'none',stroke:'#264c60','stroke-width':1.6});return svg;}
    if(t>=27){node('text',{x:20,y:35,'text-anchor':'middle','font-size':29,'font-weight':700,'font-family':'KaiTi, STKaiti, Microsoft YaHei, serif',fill:t===31?'#b34535':t===32?'#267357':'#233e4a'},name(t));return svg;}
    const n=t%9+1,suit=Math.floor(t/9);
    if(suit===0){node('text',{x:20,y:23,'text-anchor':'middle','font-size':22,'font-weight':700,fill:'#273e49'},['一','二','三','四','五','六','七','八','九'][n-1]);node('text',{x:20,y:44,'text-anchor':'middle','font-size':20,'font-weight':700,fill:'#b34535'},'万');return svg;}
    if(suit===2&&n===1){node('path',{d:'M7 36q4-16 13-14 0-9 6-11 6 0 6 6l4 1-5 3q-3 13-15 12l-5 9 1-9z',fill:'#267357'});node('path',{d:'M15 29q5-8 11-7-2 7-11 7',fill:'#e5d79e'});node('circle',{cx:28,cy:16,r:1.4,fill:'#f8f3dd'});node('path',{d:'M18 33l-3 5m7-6-1 6',stroke:'#b34535','stroke-width':1.6});return svg;}
    const positions={1:[[20,25]],2:[[20,15],[20,35]],3:[[11,12],[20,25],[29,38]],4:[[11,14],[29,14],[11,36],[29,36]],5:[[11,12],[29,12],[20,25],[11,38],[29,38]],6:[[11,12],[29,12],[11,25],[29,25],[11,38],[29,38]],7:[[11,10],[20,17],[29,24],[11,33],[29,33],[11,43],[29,43]],8:[[11,9],[29,9],[11,20],[29,20],[11,31],[29,31],[11,42],[29,42]],9:[[10,11],[20,11],[30,11],[10,25],[20,25],[30,25],[10,39],[20,39],[30,39]]}[n];
    for(let i=0;i<positions.length;i++){const[x,y]=positions[i],color=suit===1?(i===Math.floor(n/2)&&n%2?'#b34535':'#284c68'):'#267357';if(suit===1){node('circle',{cx:x,cy:y,r:n===1?9:n>=8?3.5:4.3,fill:'none',stroke:color,'stroke-width':2});node('circle',{cx:x,cy:y,r:n===1?4.5:1,fill:color});}else{node('path',{d:`M${x} ${y-4}v8m-3-6h6m-6 4h6`,fill:'none',stroke:color,'stroke-width':2.2,'stroke-linecap':'round'});}}
    return svg;
  }
  [0,13,30].forEach(t=>$('mjCover').append(tile(t)));
  function rulesForm(root,values,disabled=false){
    root.replaceChildren();
    const group=keys=>{const grid=el('div','mj-rule-grid');for(const k of keys){const label=el('label','',fields[k][0]),select=el('select');select.dataset.rule=k;select.setAttribute('aria-label',fields[k][0]);select.disabled=disabled;for(const[v,text]of fields[k][1]){const opt=el('option','',text);opt.value=String(v);select.append(opt);}select.value=String(values[k]);label.append(select);grid.append(label);}return grid;};
    root.append(group(['hands','base','selfDrawOnly','reserve']));
    for(const [title,keys]of [['积分与杠分',['mingKong','anKong','kongSettlement','cap']],['出牌与庄家',['turnSeconds','responseSeconds','dealer']]]){const d=el('details'),s=el('summary','',title);d.append(s,group(keys));root.append(d);}
    const d=el('details'),s=el('summary','','可选牌型与胡牌细则'),grid=el('div','mj-rule-checks');for(const[k,text]of Object.entries(checks)){const label=el('label','',text),input=el('input');input.type='checkbox';input.dataset.rule=k;input.checked=values[k];input.disabled=disabled;label.append(input);grid.append(label);}d.append(s,grid);root.append(d);
    root.append(el('p','mj-rule-note','固定：136张、无精、不可吃。各项倍数相乘后封顶，再乘基础分；点胡由放铳者支付，自摸由另外三家各付一份。杠分乘基础分，单独结算；明杠和补杠同分。豪华七对替代普通七对，全字牌替代清一色/混一色。只自摸时不能抢杠胡。'));
    const sync=()=>{root.querySelector('[data-rule=robKong]').disabled=disabled||root.querySelector('[data-rule=selfDrawOnly]').value==='true';root.querySelector('[data-rule=luxuryPairs]').disabled=disabled||!root.querySelector('[data-rule=sevenPairs]').checked;};root.onchange=sync;sync();
  }
  function readRules(root){const out={};for(const n of root.querySelectorAll('[data-rule]'))out[n.dataset.rule]=n.type==='checkbox'?n.checked:n.value==='true'?true:n.value==='false'?false:/^\d+$/.test(n.value)?Number(n.value):n.value;return out;}
  rulesForm($('mjCreateRules'),defaults);
  function message(text=''){const id=room?'mjTableMessage':'mjMessage';$(id).textContent=text;}
  async function api(route='',data){
    const revision=epoch,controller=new AbortController();controllers.add(controller);const timeout=setTimeout(()=>controller.abort(),12000);
    try{const response=await fetch('/api/mahjong'+route,{method:data===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','X-SJ-CSRF':window.SJAuth.csrf},...(data===undefined?{}:{body:JSON.stringify(data)})});const value=await response.json();if(revision!==epoch)throw new DOMException('Account or room changed','AbortError');if(!response.ok)throw Object.assign(Error(value.error||'牌桌同步失败'),{status:response.status});return value;}catch(e){if(revision!==epoch)throw new DOMException('Account or room changed','AbortError');if(e.name==='AbortError')throw Error('连接等待较久，正在尝试重新同步。');if(e instanceof TypeError)throw Error('网络暂时不可用，恢复后会自动同步牌桌。');throw e;}finally{clearTimeout(timeout);controllers.delete(controller);}
  }
  function hideTable(){if(!$('mjTable').hidden){releaseFull();resetChat();voiceReset();}document.body.classList.remove('mj-in-table');$('mjTable').hidden=true;$('mjHome').hidden=false;}
  function clearPrivate(){epoch++;for(const c of controllers)c.abort();room=null;preview=null;selected=null;lastRendered='';busy=false;polling=false;hideTable();for(const id of ['mjHand','mjOpponents','mjRivers','mjResult','mjActions','mjMyMelds','mjLobby','mjLog','mjRecent','mjRoomRules'])$(id).replaceChildren();for(const id of ['mjMyName','mjSelection','mjTurnHint','mjTableMessage','mjInviteInfo','mjCenterStatus','mjWallCount'])$(id).textContent='';$('mjShareLink').value='';$('mjCreate').querySelector('button[type=submit]').disabled=false;for(const d of document.querySelectorAll('.mj-dialog[open]'))d.close();$('mjInvite').hidden=true;$('mjConnection').textContent='';$('mjMessage').textContent='';}
  function navigate(next){clearPrivate();token=next;history.pushState(null,'',next?'/mahjong/'+next:'/mahjong');if(next)refresh();else recents();}
  function accept(value){
    if(value.room){if(room&&room.token===value.room.token&&room.version>value.room.version)return;value.room._offset=Date.now()-value.room.serverNow;room=value.room;preview=null;$('mjInvite').hidden=true;$('mjTable').hidden=false;$('mjHome').hidden=true;document.body.classList.add('mj-in-table');$('mjChatToggle').disabled=room.phase==='closed';if(room.phase==='closed'){resetChat();voiceReset();}else{syncChat(room.chat||[]);syncVoice(room);}render();}
    else if(value.preview){if(room&&room.version>value.preview.version)return;room=null;preview=value.preview;hideTable();$('mjInvite').hidden=false;$('mjInviteInfo').textContent=preview.host+'的牌室 · '+preview.count+'/4人 · '+(phases[preview.phase]||'');$('mjJoinInvite').disabled=!preview.canJoin;$('mjJoinInvite').textContent=preview.canJoin?'加入 / 回到座位':'暂时无法加入';}
  }
  async function refresh(){if(!token||!window.SJAuth.user||polling||busy)return;polling=true;const revision=epoch;try{accept(await api('/'+token));$('mjConnection').textContent='';}catch(e){if(revision!==epoch)return;if(e.status===401){clearPrivate();await window.SJAuth.refresh();message('登录已失效，请重新登录。');}else if([404,410].includes(e.status)){clearPrivate();message(e.message);recents();}else if(room)$('mjConnection').textContent=e.message;else message(e.message);}finally{if(revision===epoch)polling=false;}}
  async function recents(){if(!window.SJAuth.user){$('mjRecent').replaceChildren(el('p','mj-muted','登录后查看最近的牌室。'));return;}const revision=epoch;try{const v=await api();if(revision!==epoch)return;const root=$('mjRecent');root.replaceChildren();if(!v.rooms.length)root.append(el('p','mj-muted','还没有牌室，先开一桌吧。'));for(const r of v.rooms){const a=el('a','mj-recent-link');a.href='/mahjong/'+r.token;a.append(el('span','',r.host+'的牌室'),el('small','',phases[r.phase]+' · '+r.count+'/4'));a.onclick=e=>{e.preventDefault();navigate(r.token);};root.append(a);}}catch(e){if(revision===epoch)message(e.message);}}
  async function mutate(action,extra={}){
    if(busy||!token)return false;const revision=epoch,roomToken=token;busy=true;controls();message('');const input={...extra,version:room?.version??preview?.version,handNo:room?.handNo,responseId:room?.pending?.id,opId:operationId()};
    try{accept(await api('/'+roomToken+'/'+action,input));selected=null;if(action==='leave'||action==='close'){for(const d of document.querySelectorAll('.mj-dialog[open]'))d.close();navigate('');message(action==='close'?'牌室已结束。':'已离开牌室。原座位由机器人接管，可用邀请链接回座。');}return true;}
    catch(e){if(revision!==epoch)return;message(e.message);if(e.status===409||!e.status){selected=null;try{accept(await api('/'+roomToken));}catch{}}if(e.status===401){clearPrivate();await window.SJAuth.refresh();message('请重新登录后回到牌室。');}}
    finally{if(revision===epoch){busy=false;controls();}}
  }
  function actionButton(label,fn,cls=''){const b=el('button',cls,label);b.type='button';b.dataset.mjMutate='';b.onclick=fn;return b;}
  function controls(){
    for(const b of document.querySelectorAll('[data-mj-mutate]'))b.disabled=busy;$('mjSaveRules').disabled=busy;$('mjJoinInvite').disabled=busy||!preview?.canJoin;
    const can=!!room?.actions.discard&&selected!==null&&room.hand.includes(selected);$('mjDiscard').disabled=busy||!can;$('mjDiscard').textContent=can?'打出 '+name(selected):'选择手牌';
    for(const b of $('mjHand').children){b.disabled=busy||!room?.actions.discard;b.setAttribute('aria-pressed',String(selected!==null&&Number(b.dataset.index)===selectedIndex));}
    $('mjSelection').textContent=selected!==null?'已选 '+name(selected):'点选手牌，再确认出牌';
  }
  function meldNode(m,small=false){const d=el('span',small?'':'mj-meld');for(let i=0;i<(m.type==='pong'?3:4);i++)d.append(tile(m.tile,m.tile===null));if(!small)d.append(el('small','',m.type==='pong'?'碰':m.type==='an'?'暗杠':m.type==='bu'?'补杠':'明杠'));return d;}
  function renderBoard(r){
    const actor=r.phase==='playing'?r.turn:r.phase==='respond'?r.pending.from:-1;
    const opponents=$('mjOpponents'),rivers=$('mjRivers'),compass=$('mjCompass');
    opponents.replaceChildren();rivers.replaceChildren();
    const latest=(r.discards||[]).at(-1);
    const featured=r.pending&&!r.pending.rob?{seat:r.pending.from,tile:r.pending.tile,index:r.seats[r.pending.from].river.length-1}:latest?.handNo===r.handNo?latest:null;
    for(const [offset,side]of sides.entries()){
      const s=(r.me+offset)%4,p=r.seats[s],mark=compass.querySelector('[data-side='+side+']');
      mark.textContent=directions[s];mark.classList.toggle('is-active',s===actor);
      if(offset>0&&p){
        const group=el('div','mj-seat'),badge=el('div','mj-opponent'+(actor===s?' is-turn':'')),details=el('div','mj-opponent-info');
        group.dataset.side=side;
        badge.append(el('span','mj-seat-avatar',p.bot?'机':p.name.slice(0,1).toUpperCase()),details);
        details.append(el('strong','',p.name),el('small','',directions[s]+'位 · '+p.score+'分'+(r.dealer===s?' · 庄':'')));
        const rack=el('div','mj-rack');rack.setAttribute('aria-label','手牌 '+p.handCount+' 张'+(p.away?'，暂离托管':''));
        for(let j=0;j<p.handCount;j++)rack.append(el('i'));
        const melds=el('div','mj-mini-melds');for(const m of p.melds)melds.append(meldNode(m,true));
        group.append(badge,rack,melds);opponents.append(group);
      }
      const box=el('div','mj-river'),tiles=el('div','mj-river-tiles');
      box.dataset.side=side;box.setAttribute('aria-label',directions[s]+'位弃牌');
      for(const [i,t]of (p?.river||[]).entries()){
        const svg=tile(t),entry=el('span','mj-river-tile');entry.title=name(t);
        if(featured?.seat===s&&featured.index===i&&featured.tile===t)entry.classList.add('is-last');
        entry.append(svg);tiles.append(entry);
      }
      box.append(tiles);rivers.append(box);
      // Follow the newest end of each pile, even when a long hand needs scrolling.
      box.scrollTop=box.scrollHeight;box.scrollLeft=box.scrollWidth;
    }
    $('mjWallCount').textContent='余 '+r.remaining+' 张';$('mjWallCount').title='另留 '+r.rules.reserve+' 张荒牌';
    $('mjCenterStatus').textContent=r.phase==='respond'?directions[r.pending.from]+'家'+(r.pending.rob?'补杠 ':'打出 ')+name(r.pending.tile):actor>=0?directions[actor]+'家出牌':phases[r.phase];
  }
  function render(){
    const r=room;if(!r)return;const key=r.token+':'+r.version;if(lastRendered===key){countdown();return;}lastRendered=key;selected=null;
    $('mjTableTitle').textContent='第 '+r.handNo+'/'+r.rules.hands+' 局';$('mjMyName').textContent=r.seats[r.me].name+' · '+directions[r.me]+'位 · '+r.seats[r.me].score+'分'+(r.dealer===r.me?' · 庄':'');
    renderBoard(r);
    const lobby=$('mjLobby');lobby.hidden=r.phase!=='lobby'&&r.phase!=='closed';lobby.replaceChildren();
    if(r.phase==='lobby'){
      lobby.append(el('h2','','朋友到齐，就开一桌'),el('p','',r.rules.selfDrawOnly?'本桌只自摸，可碰可杠不可吃。':'本桌可自摸、可点胡，可碰可杠不可吃。'));
      const list=el('div','mj-seat-list');r.seats.forEach((p,s)=>list.append(el('span','',directions[s]+' · '+(p?p.name+' '+(p.ready?'已准备':'未准备'):'等牌友'))));lobby.append(list);
      if(r.hostId===window.SJAuth.user?.id)lobby.append(actionButton(r.seats.some(s=>!s)?'机器人补位并开始':'开始本桌',()=>mutate('start',{fillBots:true})),el('p','','可以从菜单邀请牌友。机器人补位后，本桌不再接受新玩家。'));
      else lobby.append(actionButton(r.seats[r.me].ready?'取消准备':'我准备好了',()=>mutate('ready',{ready:!r.seats[r.me].ready})));
    }else if(r.phase==='closed')lobby.append(el('h2','','这间牌室已结束'),actionButton('回麻将大厅',()=>navigate('')));
    const ended=['between','finished'].includes(r.phase);$('mjBoard').hidden=ended;$('mjResult').hidden=!ended;renderResult();
    $('mjTurnHint').textContent=r.phase==='playing'?(r.turn===r.me?'轮到你：'+(r.drawn===null?'碰后请先出牌':'已摸 '+name(r.drawn)):'等 '+r.seats[r.turn].name+' 出牌'):r.phase==='respond'?(r.actions.claims?'可以响应这张牌':r.pending.responded?'已响应，等其他牌友':'等其他牌友响应'):phases[r.phase];
    const actions=$('mjActions');actions.replaceChildren();const a=r.actions;
    if(a.hu)actions.append(actionButton('自摸',()=>mutate('action',{type:'hu'})));
    for(const k of a.kongs||[])actions.append(actionButton((k.type==='an'?'暗杠 ':'补杠 ')+name(k.tile),()=>mutate('action',{type:'kong',kind:k.type,tile:k.tile})));
    if(a.claims){for(const c of a.claims)actions.append(actionButton(({hu:'胡 ',kong:'杠 ',pong:'碰 '})[c]+name(a.tile),()=>mutate('action',{type:'claim',choice:c})));actions.append(actionButton('过',()=>mutate('action',{type:'claim',choice:'pass'}),'mj-pass'));}
    $('mjMyMelds').replaceChildren();for(const m of r.seats[r.me].melds)$('mjMyMelds').append(meldNode(m));
    const hand=$('mjHand');hand.replaceChildren();const ordered=[...r.hand];if(r.drawn!==null){ordered.splice(ordered.lastIndexOf(r.drawn),1);ordered.push(r.drawn);}ordered.forEach((t,i)=>{const b=el('button','mj-tile'+(i===ordered.length-1&&r.drawn!==null?' is-drawn':''));b.type='button';b.dataset.tile=String(t);b.dataset.index=String(i);b.setAttribute('aria-label',name(t)+(i===ordered.length-1&&r.drawn!==null?'，刚摸到的牌':''));b.append(tile(t));b.onclick=()=>{if(selected!==null&&selectedIndex===i){selected=null;selectedIndex=-1;}else{selected=t;selectedIndex=i;}controls();};hand.append(b);});
    document.querySelector('.mj-hand-area').hidden=ended||r.phase==='lobby'||r.phase==='closed';$('mjMyMelds').hidden=ended||r.phase==='lobby';countdown();controls();
  }
  function renderResult(){
    const root=$('mjResult'),r=room,result=r.result;root.replaceChildren();if(!result)return;
    root.append(el('h2','',result.draw?'荒牌流局':result.winners.map(s=>r.seats[s].name).join('、')+(result.source===null?' 自摸':' 胡牌')));
    r.seats.forEach((p,s)=>{const row=el('div','mj-score-row');row.append(el('span','',p.name+(result.winners.includes(s)?' · 胡':'')),el('b','',(result.delta[s]>0?'+':'')+result.delta[s]+' / 总分 '+p.score));root.append(row);});
    for(const item of result.items)root.append(el('p','',r.seats[item.seat].name+'：'+item.patterns.map(p=>p.name+(p.factor>1?' ×'+p.factor:'')).join(' · ')+' → '+item.multiplier+'倍'+(item.uncapped>item.multiplier?'（已封顶）':'')+' × 基础'+r.rules.base+'分；'+(result.source===null?'其他三家各付':'放铳者支付')+item.points+'分'+(item.rob?' · 抢杠胡':'')));
    root.append(el('p','',result.kongs.length?result.kongs.map(k=>r.seats[k.seat].name+' '+(k.type==='an'?'暗杠':'明/补杠')+'，'+(k.applied?'另外三家各付'+k.points*r.rules.base+'分':'流局不计杠分')).join('；'):'本局没有杠分。'));
    const d=el('details'),s=el('summary','','查看四家手牌');d.append(s);r.seats.forEach((p,i)=>{d.append(el('span','mj-reveal-label',p.name));const h=el('div','mj-reveal');for(const t of result.hands[i])h.append(tile(t));if(result.winners.includes(i)&&result.source!==null)h.append(tile(result.tile));for(const m of p.melds)h.append(meldNode(m));d.append(h);});root.append(d);
    if(r.phase==='between')root.append(r.hostId===window.SJAuth.user?.id?actionButton('下一局 →',()=>mutate('next')):el('p','','等房主开始下一局。'));else root.append(actionButton('回大厅，再开一桌',()=>navigate('')));
  }
  function countdown(){if(!room)return;const left=Math.max(0,Math.ceil((room.deadline-(Date.now()-room._offset))/1000));$('mjCountdown').textContent=room.deadline?String(left).padStart(2,'0'):'—';$('mjCompass').classList.toggle('is-urgent',!!room.deadline&&left<=8);}
  $('mjDiscard').onclick=()=>{if(selected!==null)mutate('action',{type:'discard',tile:selected});};
  $('mjCreate').onsubmit=async e=>{e.preventDefault();const rules=readRules($('mjCreateRules'));if(!window.SJAuth.user){window.SJAuth.open({purpose:'登录后创建麻将牌室。',resume:()=>$('mjCreate').requestSubmit()});return;}if(busy)return;const revision=epoch;busy=true;const b=e.submitter||$('mjCreate').querySelector('button[type=submit]');b.disabled=true;try{const v=await api('',{rules});token=v.room.token;history.pushState(null,'','/mahjong/'+token);accept(v);message('');}catch(err){if(revision===epoch)message(err.message);}finally{if(revision===epoch){busy=false;b.disabled=false;controls();}}};
  $('mjJoinForm').onsubmit=e=>{e.preventDefault();const value=$('mjRoomLink').value.trim();let next=/^[a-f0-9]{32}$/.test(value)?value:null;try{const u=new URL(value,location.origin);next=next||/^\/mahjong\/([a-f0-9]{32})\/?$/.exec(u.pathname)?.[1];}catch{}if(!next){message('请粘贴完整的麻将邀请链接或32位房间号。');return;}navigate(next);if(!window.SJAuth.user)window.SJAuth.open({purpose:'登录后查看并加入朋友的牌室。',resume:refresh});};
  $('mjJoinInvite').onclick=()=>mutate('join');$('mjBack').onclick=()=>navigate('');
  $('mjRulesOpen').onclick=()=>{if(!room)return;$('mjMoreDialog').close();const edit=room.phase==='lobby'&&room.hostId===window.SJAuth.user?.id;rulesForm($('mjRoomRules'),room.rules,!edit);$('mjSaveRules').hidden=!edit;$('mjRulesNote').textContent=edit?'房主可以修改；保存后其他朋友需要重新准备。':'本桌规则已确定。开局后不能修改。';$('mjRulesDialog').showModal();};
  $('mjEditRules').onsubmit=async e=>{e.preventDefault();const success=await mutate('rules',{rules:readRules($('mjRoomRules'))});if(success)$('mjRulesDialog').close();else $('mjRulesNote').textContent=$('mjTableMessage').textContent+'。你的规则选择已保留，可再次保存。';};
  $('mjShare').onclick=()=>{$('mjMoreDialog').close();$('mjShareLink').value=location.origin+'/mahjong/'+token;$('mjShareState').textContent='';$('mjShareDialog').showModal();};
  $('mjCopyLink').onclick=async()=>{try{await navigator.clipboard.writeText($('mjShareLink').value);$('mjShareState').textContent='已复制，发给朋友就能一起玩。';}catch{$('mjShareLink').focus();$('mjShareLink').select();$('mjShareState').textContent='请长按或手动复制上面的链接。';}};
  $('mjMoreOpen').onclick=()=>{if(!room)return;$('mjLog').replaceChildren(...room.log.map(v=>el('li','',v)));$('mjCloseAsk').hidden=room.hostId!==window.SJAuth.user?.id;$('mjMoreDialog').showModal();};
  function ask(title,text,fn){$('mjMoreDialog').close();$('mjConfirmTitle').textContent=title;$('mjConfirmText').textContent=text;confirmAction=fn;$('mjConfirmDialog').showModal();}
  $('mjLeaveAsk').onclick=()=>ask('离开牌室？','离开后本局由机器人接管，朋友可以继续打。你可用邀请链接回到原座位。',()=>mutate('leave'));
  $('mjCloseAsk').onclick=()=>ask('结束整桌？','所有牌友都将结束本桌。未结算的一局不会计分。',()=>mutate('close'));
  $('mjConfirmDo').onclick=()=>{$('mjConfirmDialog').close();confirmAction?.();confirmAction=null;};
  for(const b of document.querySelectorAll('[data-mj-close]'))b.onclick=()=>b.closest('dialog').close();
  function authChanged(){const id=window.SJAuth.user?.id||null;if(id===authId)return;clearPrivate();authId=id;if(id){if(token)refresh();else recents();}else{recents();if(token)message('请点右上角登录，再加入朋友的牌室。');}}
  document.addEventListener('sj:auth-change',authChanged);document.addEventListener('sj:logout',clearPrivate);window.SJAuth.ready.then(authChanged);
  window.addEventListener('popstate',()=>{clearPrivate();token=/^\/mahjong\/([a-f0-9]{32})\/?$/.exec(location.pathname)?.[1]||'';if(token)refresh();else recents();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});window.addEventListener('online',refresh);
  window.addEventListener('offline',()=>{if(room)$('mjConnection').textContent='网络已断开，恢复后会自动同步；出牌仍按牌桌计时。';else message('网络已断开，请恢复连接后再操作。');});
  setInterval(()=>{if(!document.hidden&&navigator.onLine&&token&&window.SJAuth.user)refresh();},1200);setInterval(countdown,250);
  document.addEventListener('DOMContentLoaded',()=>{const nav=$('touchNav');if(nav){for(const n of nav.querySelectorAll('[aria-current]'))n.removeAttribute('aria-current');nav.querySelector('a[href="/games"]')?.setAttribute('aria-current','page');}});
})();
