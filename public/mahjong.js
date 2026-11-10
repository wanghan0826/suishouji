(()=>{
  const $=id=>document.getElementById(id),el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const factorDefaults={sevenPairs:4,luxuryPairs:8,menqing:2,pungs:2,halfFlush:2,flush:4,allHonors:8,singleWait:4,kongDouble:2,kongFlower:2};
  const defaults={hands:4,base:1,reserve:16,selfDrawOnly:true,sevenPairs:true,luxuryPairs:true,menqing:true,pungs:true,halfFlush:true,flush:true,allHonors:true,singleWait:true,kongDouble:true,kongFlower:true,multiHu:true,robKong:false,mingKong:1,anKong:2,kongSettlement:'immediate',cap:32,turnSeconds:60,responseSeconds:12,dealer:'winner',...Object.fromEntries(Object.entries(factorDefaults).map(([k,v])=>[k+'Factor',v]))};
  const fields={hands:['局数',[[1,'1 局体验'],[4,'4 局'],[8,'8 局'],[16,'16 局']]],base:['基础积分',[[1,'1 分'],[2,'2 分'],[5,'5 分'],[10,'10 分']]],reserve:['荒牌保留',[[0,'不留荒牌'],[8,'留 8 张'],[16,'留 16 张'],[20,'留 20 张']]],selfDrawOnly:['胡牌方式',[[true,'只自摸'],[false,'可自摸、可点胡']]],mingKong:['明杠 / 补杠',[[0,'不计分'],[1,'每家 1 分'],[2,'每家 2 分']]],anKong:['暗杠',[[0,'不计分'],[1,'每家 1 分'],[2,'每家 2 分'],[4,'每家 4 分']]],kongSettlement:['杠分结算', [['immediate','流局也计杠分'],['win','有人胡牌才计杠分']]],cap:['胡牌倍数上限',[[8,'8 倍'],[16,'16 倍'],[32,'32 倍'],[64,'64 倍']]],turnSeconds:['出牌时间',[[30,'30 秒'],[60,'60 秒'],[90,'90 秒']]],responseSeconds:['碰杠胡响应',[[8,'8 秒'],[12,'12 秒'],[20,'20 秒']]],dealer:['下一局庄家',[['winner','赢家坐庄，流局连庄'],['rotate','每局轮庄']]]};
  const checks={sevenPairs:'七对',luxuryPairs:'豪华七对',menqing:'门清',pungs:'碰碰胡',halfFlush:'混一色',flush:'清一色',allHonors:'全字牌',singleWait:'单吊',kongDouble:'开杠',kongFlower:'杠上开花',multiHu:'允许一炮多响',robKong:'允许抢补杠胡'};
  const phases={lobby:'等待入座',playing:'正在打牌',respond:'等待响应',between:'本局结算',finished:'整桌结束',closed:'牌室关闭'},directions=['东','南','西','北'];
  let presetUI=null;
  let token=/^\/mahjong\/([a-f0-9]{32})\/?$/.exec(location.pathname)?.[1]||'',room=null,preview=null,selected=null,selectedIndex=-1,busy=false,epoch=0,authId=undefined,polling=false,lastRendered='',confirmAction=null;
  const controllers=new Set(),name=t=>t<27?['一','二','三','四','五','六','七','八','九'][t%9]+['万','筒','条'][Math.floor(t/9)]:['东','南','西','北','中','发','白'][t-27];
  const operationId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
  const svgNS='http://www.w3.org/2000/svg';
  const sides=['bottom','right','top','left'];
  const icons={back:'M19 12H5m6-6-6 6 6 6',sound:'M4 9h4l5-4v14l-5-4H4zm13 0a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12',muted:'M4 9h4l5-4v14l-5-4H4zm13 1 5 5m0-5-5 5',expand:'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5',collapse:'M4 9h5V4m11 5h-5V4m-6 16v-5H4m11 5v-5h5',chat:'M4 5h16v11h-8l-5 4v-4H4zm4 5h8m-8 3h5',menu:'M5 6h14M5 12h14M5 18h14',close:'m6 6 12 12m0-12L6 18',hello:'M6 19c-2-2-2-5-1-6l3 3V6a1 1 0 0 1 2 0v6-8a1 1 0 0 1 2 0v8-6a1 1 0 0 1 2 0v6-3a1 1 0 0 1 2 0v7a5 5 0 0 1-5 5H9',laugh:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM7 10l2-2 1 2m4 0 1-2 2 2M8 14h8a4 4 0 0 1-8 0Z',clap:'m5 13 4 4c1 1 2 0 1-1L6 9l1-1 5 5-4-7 1-1 5 6-2-6 1-1 4 8 1-2 2 1-2 7a5 5 0 0 1-8 2l-6-5Zm11-9 2-2m1 5 3-1',think:'M20 12a8 8 0 1 0-11 7m-2-8h3m4 0 2-1m-4 5h4m4 5H9l2-4h2v2h6z',wow:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8 8v2m8-2v2m-2 5a2 3 0 1 1-4 0 2 3 0 1 1 4 0Z',again:'M20 10a8 8 0 1 0 0 5m0-11v6h-6'};
  function icon(key){const svg=document.createElementNS(svgNS,'svg'),p=document.createElementNS(svgNS,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');p.setAttribute('d',icons[key]);svg.append(p);return svg;}
  function buttonIcon(id,key){$(id).querySelector('[data-mj-icon]').replaceChildren(icon(key));}
  document.querySelectorAll('[data-mj-icon]').forEach(n=>n.append(icon(n.dataset.mjIcon)));
  const emoji={hello:'打招呼',laugh:'大笑',clap:'鼓掌',think:'想一想',wow:'好牌！',again:'再来一局',love:'比心',proud:'得意',shock:'震惊',cry:'哭哭',please:'拜托',angry:'生气',sleepy:'困了',hurry:'快出牌',nice:'打得好',shy:'害羞'};
  let chatLast=null,chatUnread=false,chatPending=null,chatBusy=false,voiceChat=null;
  function sticker(id){const n=el('span','mj-sticker'),index=Object.keys(emoji).indexOf(id);n.style.setProperty('--sticker-x',(index%4)*100/3+'%');n.style.setProperty('--sticker-y',Math.floor(index/4)*100/3+'%');n.setAttribute('aria-hidden','true');return n;}
  for(const [id,label]of Object.entries(emoji)){const b=el('button');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.append(sticker(id));b.onclick=()=>sendChat('emoji',id);$('mjEmoji').append(b);}
  function chatOpen(open,focus=false){
    $('mjChat').hidden=!open;$('mjChatToggle').setAttribute('aria-expanded',String(open));
    if(open){chatUnread=false;const list=$('mjChatHistory');list.scrollTop=list.scrollHeight;if(focus)$('mjChatClose').focus();}
    else {voiceChat?.cancelRecording();$('mjChatInput').blur();if(focus)$('mjChatToggle').focus();}
    $('mjChatToggle').lastElementChild.hidden=!chatUnread;
  }
  function syncChat(history){
    const list=$('mjChatHistory'),newest=history.at(-1)?.id||0;
    if(chatLast!==null&&newest<=chatLast)return;
    const atEnd=list.scrollHeight-list.clientHeight-list.scrollTop<35,previousHeight=list.scrollHeight,previousTop=list.scrollTop;
    if(chatLast!==null&&$('mjChat').hidden&&history.some(m=>m.id>chatLast&&m.seat!==room?.me))chatUnread=true;
    chatLast=newest;$('mjChatToggle').lastElementChild.hidden=!chatUnread;
    const items=history.map(m=>{const li=el('div','mj-chat-line'+(m.seat===room?.me?' is-mine':'')),body=el('span','mj-chat-body');li.dataset.id=m.id;li.append(el('b','',m.name),body);
      if(m.kind==='voice'){body.classList.add('mj-chat-voice');body.append(voiceChat.message(m));}
      else if(m.kind==='emoji'&&Object.hasOwn(emoji,m.text)){body.classList.add('mj-chat-reaction');body.append(sticker(m.text),el('span','',emoji[m.text]));}else{body.textContent=m.text;body.dir='auto';}return li;});
    const first=Number(list.firstElementChild?.dataset.id||0),retained=new Set(history.map(m=>m.id));let removed=0;
    for(const old of [...list.children])if(!retained.has(Number(old.dataset.id))){removed+=old.getBoundingClientRect().height+6;old.remove();}
    const displayed=Number(list.lastElementChild?.dataset.id||first-1);
    if(items.length)list.append(...items.filter(li=>Number(li.dataset.id)>displayed));
    else list.replaceChildren(el('p','mj-chat-empty','还没有消息，和牌友打个招呼吧。'));
    if(atEnd||!previousHeight)list.scrollTop=list.scrollHeight;else list.scrollTop=Math.max(0,previousTop-removed);
    voiceChat?.sync(history);
  }
  function resetChat(){voiceChat?.reset();chatLast=null;chatUnread=false;chatPending=null;chatBusy=false;chatOpen(false);$('mjChatHistory').replaceChildren();$('mjChatInput').value='';$('mjChatStatus').textContent='';$('mjChatSend').disabled=false;}
  async function sendChat(kind,text,voice){
    if(!room||room.phase==='closed'||chatBusy)return;
    if(kind==='text'&&(!text||[...text].length>80)){$('mjChatStatus').textContent='请输入 1–80 个字符。';return;}
    if(chatPending?.kind!==kind||chatPending?.text!==text||kind==='voice'&&chatPending.audio!==voice.audio)chatPending={kind,text,...voice,opId:voice?.opId||operationId()};
    const revision=epoch;chatBusy=true;$('mjChatSend').disabled=true;$('mjChatStatus').textContent='';
    try {const value=await api('/'+token+'/chat',chatPending);if(room&&room.phase!=='closed')syncChat(value.chat);chatPending=null;if(kind==='text'&&$('mjChatInput').value.trim()===text)$('mjChatInput').value='';return true;}
    catch(e){if(revision===epoch){if([404,410].includes(e.status)){endRoom(e.message);return;}$('mjChatStatus').textContent=e.message;if(e.status&&e.status!==429)chatPending=null;}}
    finally{if(revision===epoch){chatBusy=false;$('mjChatSend').disabled=false;}}
  }
  $('mjChatToggle').onclick=()=>chatOpen($('mjChat').hidden,true);$('mjChatClose').onclick=()=>chatOpen(false,true);
  $('mjChat').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();chatOpen(false,true);}};
  $('mjChatForm').onsubmit=e=>{e.preventDefault();sendChat('text',$('mjChatInput').value.trim());};
  const viewport=window.visualViewport;
  function keyboardSize(){const h=!window.SJLandscape.isRotated()&&viewport&&document.activeElement===$('mjChatInput')&&window.innerHeight-viewport.height>75?Math.floor(viewport.height):0;$('mjTable').classList.toggle('mj-keyboard',!!h);$('mjTable').style.setProperty('--mj-keyboard-height',h?h+'px':'100dvh');}
  viewport?.addEventListener('resize',keyboardSize);$('mjChatInput').onblur=()=>requestAnimationFrame(keyboardSize);
  const releaseFull=window.SJLandscape.bind($('mjFullscreen'),({active,unavailable})=>{
    buttonIcon('mjFullscreen',active?'collapse':'expand');
    $('mjFullscreen').querySelector('span:last-child').textContent=active?'退出':'全屏';
    $('mjModeNotice').textContent=unavailable?'浏览器暂时无法隐藏工具栏，牌桌仍可横向使用。':'';
  });
  const voiceCues=[[0,12236],[12236,12766],[25002,13435],[38437,14211],[52648,11453],[64101,12742],[76843,13514],[90357,12036],[102393,12544],[114937,13600],[128537,13624],[142161,15371],[157532,14346],[171878,13453],[185331,13698],[199029,13983],[213012,13693],[226705,14451],[241156,13388],[254544,13686],[268230,15266],[283496,15376],[298872,12997],[311869,14180],[326049,14285],[340334,13403],[353737,13564],[367301,12337],[379638,12851],[392489,14244],[406733,13411],[420144,13274],[433418,13978],[447396,12322],[459718,9101]],voiceAsset='/assets/mahjong-female-pong-185d458e.wav',voiceRate=24000;
  let voiceOn=true,voiceId=null,voiceContext=null,voiceBuffer=null,voiceLoading=null,voiceCurrent=null,voiceQueue=[],voiceReading=false,voiceGeneration=0;
  try{voiceOn=localStorage.getItem('sj-mahjong-voice')!=='off';}catch{}
  function voiceUi(){buttonIcon('mjSound',voiceOn?'sound':'muted');$('mjSound').setAttribute('aria-pressed',String(voiceOn));$('mjSound').title=voiceOn?'关闭女声报牌':'开启女声报牌';}
  function voiceStop(){voiceGeneration++;voiceQueue=[];voiceReading=false;if(voiceCurrent){try{voiceCurrent.stop();}catch{}voiceCurrent=null;}voiceChat?.duck(false);}
  function voiceReset(){voiceId=null;voiceStop();}
  function prepareAudio(unlock=false){
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    try{
      voiceContext??=new Audio({latencyHint:'interactive'});
      if(unlock&&voiceContext.state!=='running')voiceContext.resume().then(playVoice).catch(()=>{});
    }catch{}return voiceContext;
  }
  function voicePrepare(unlock=false){
    if(!voiceOn||!room||document.hidden)return;
    try{
      if(!prepareAudio(unlock))return;
      if(!voiceBuffer&&!voiceLoading)voiceLoading=fetch(voiceAsset).then(r=>{if(!r.ok)throw Error();return r.arrayBuffer();}).then(b=>voiceContext.decodeAudioData(b)).then(b=>{voiceBuffer=b;playVoice();}).catch(()=>{}).finally(()=>{voiceLoading=null;});
    }catch{}
  }
  function playVoice(){
    if(!voiceOn||document.hidden||!voiceBuffer||voiceReading||voiceContext.state!=='running')return;
    voiceQueue=voiceQueue.filter(e=>Date.now()-e.queued<1800);const event=voiceQueue.shift();if(!event)return;
    const cue=voiceCues[event.kind==='pong'?34:event.tile];if(!cue)return;
    const source=voiceContext.createBufferSource(),gain=voiceContext.createGain(),rev=voiceGeneration;
    source.buffer=voiceBuffer;gain.gain.value=.8;source.connect(gain);gain.connect(voiceContext.destination);
    voiceCurrent=source;voiceReading=true;voiceChat?.duck(true);source.onended=()=>{source.disconnect();gain.disconnect();if(rev===voiceGeneration){voiceCurrent=null;voiceReading=false;voiceChat?.duck(false);playVoice();}};
    source.start(0,cue[0]/voiceRate,cue[1]/voiceRate);
  }
  function syncVoice(r){
    const stream=r.sounds||r.discards||[],latest=stream.at(-1)?.id||0;
    if(voiceId===null){voiceId=latest;return;}
    if(latest<=voiceId)return;
    if(voiceOn&&voiceContext&&!document.hidden){const now=Date.now();voiceQueue.push(...stream.filter(e=>e.id>voiceId&&e.handNo===r.handNo&&r.serverNow-e.at<1800).map(e=>({...e,queued:now-Math.max(0,r.serverNow-e.at)})));voiceQueue=voiceQueue.slice(-2);playVoice();}
    voiceId=latest;
  }
  voiceUi();
  voiceChat=window.createMahjongVoiceChat({getRoom:()=>room,getContext:()=>prepareAudio(true),send:data=>sendChat('voice','',data)});
  $('mjSound').onclick=()=>{voiceOn=!voiceOn;try{localStorage.setItem('sj-mahjong-voice',voiceOn?'on':'off');}catch{}voiceUi();if(voiceOn)voicePrepare(true);else voiceStop();};
  $('mjTable').addEventListener('pointerdown',e=>{voiceChat.unlock();if(!e.target.closest('#mjSound'))voicePrepare(true);},true);
  $('mjTable').addEventListener('click',e=>{voiceChat.unlock();if(!e.target.closest('#mjSound'))voicePrepare(true);},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)voiceStop();});
  const tileTemplates=new Map();
  $('mjTable').addEventListener('animationend',e=>e.target.closest('.mj-tile,.mj-river-tile')?.classList.remove('is-entering'));
  function tile(t,back=false){
    const key=back?'back':t;if(!tileTemplates.has(key))tileTemplates.set(key,drawTile(t,back));return tileTemplates.get(key).cloneNode(true);
  }
  function drawTile(t,back=false){
    const svg=document.createElementNS(svgNS,'svg');svg.setAttribute('viewBox','0 0 40 56');svg.setAttribute('aria-hidden','true');
    const node=(tag,attrs,text)=>{const n=document.createElementNS(svgNS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text)n.textContent=text;svg.append(n);return n;};
    node('rect',{x:0,y:4,width:40,height:52,rx:3,fill:'#7da68e'});node('rect',{x:.5,y:.5,width:39,height:50,rx:3,fill:back?'#2c7463':'#fffdf0',stroke:back?'#4f9276':'#d6d6bf','stroke-width':1});node('path',{d:'M3 3H37M2 5V46',fill:'none',stroke:back?'#81ac95':'#ffffff','stroke-width':2});node('path',{d:'M38 5V47Q38 49 35 49H4',fill:'none',stroke:back?'#235747':'#e5e1c9','stroke-width':1.4});
    if(back){node('path',{d:'M9 12H31V38H9ZM14 17H26V33H14Z',fill:'none',stroke:'#83b5a1','stroke-width':1});return svg;}
    if(t===33){node('path',{d:'M7 10H33V40H7ZM11 14H29V36H11Z',fill:'none',stroke:'#264c60','stroke-width':1.6});return svg;}
    if(t>=27){node('text',{x:20,y:35,'text-anchor':'middle','font-size':29,'font-weight':700,'font-family':'KaiTi, STKaiti, Microsoft YaHei, serif',fill:t===31?'#b34535':t===32?'#267357':'#233e4a'},name(t));return svg;}
    const n=t%9+1,suit=Math.floor(t/9);
    if(suit===0){node('text',{x:20,y:23,'text-anchor':'middle','font-size':23,'font-weight':700,'font-family':'KaiTi, STKaiti, Microsoft YaHei, serif',fill:'#263c43'},['一','二','三','四','五','六','七','八','九'][n-1]);node('text',{x:20,y:44,'text-anchor':'middle','font-size':22,'font-weight':700,'font-family':'KaiTi, STKaiti, Microsoft YaHei, serif',fill:'#b34535'},'万');return svg;}
    if(suit===2){
      const layouts={1:[[20,25]],2:[[12,25],[28,25]],3:[[20,14],[11,35],[29,35]],4:[[11,14],[29,14],[11,36],[29,36]],5:[[10,12],[30,12],[20,25],[10,38],[30,38]],6:[[10,15],[20,15],[30,15],[10,35],[20,35],[30,35]],7:[[10,11],[20,11],[30,11],[11,27],[29,27],[11,41],[29,41]],8:[[8,15],[16,15],[24,15],[32,15],[8,35],[16,35],[24,35],[32,35]],9:[[10,11],[20,11],[30,11],[10,25],[20,25],[30,25],[10,39],[20,39],[30,39]]};
      const height=n<=2?30:n<=4?17:n===6||n===8?17:11.5,width=n===1?8:n<=4?5.6:n===8?4.3:4.9;
      svg.dataset.suit='bamboo';svg.dataset.rank=n;
      for(const [i,[x,y]]of layouts[n].entries()){
        const red=n===5&&i===2||n===7&&i<3||n===9&&i%3===1;
        const body=red?'#b94432':'#17774f',edge=red?'#803427':'#0e5138',light=red?'#e27c58':'#65b77c';
        const stick=node('g',{'class':'mj-bamboo-stick',transform:`translate(${x} ${y})`});
        const shape=(tag,attrs)=>{const part=document.createElementNS(svgNS,tag);for(const[k,v]of Object.entries(attrs))part.setAttribute(k,v);stick.append(part);};
        const w=width/2,h=height/2;
        // Each continuous silhouette is one bamboo; joint bands stay inside it.
        shape('path',{d:`M${-w+1} ${-h}Q${-w} ${-h} ${-w} ${-h+1.4}L${-w+.35} ${-height*.2}L${-w} ${h-1.4}Q${-w} ${h} ${-w+1} ${h}H${w-1}Q${w} ${h} ${w} ${h-1.4}L${w-.35} ${-height*.2}L${w} ${-h+1.4}Q${w} ${-h} ${w-1} ${-h}Z`,fill:body,stroke:edge,'stroke-width':.65,'stroke-linejoin':'round'});
        shape('path',{d:`M${-w+1.35} ${-h+1.4}L${-w+1.6} ${h-1.5}`,stroke:light,'stroke-width':n<=2?1.45:1,'stroke-linecap':'round'});
        for(const yBand of [-height*.22,height*.24])shape('path',{d:`M${-w+.5} ${yBand}H${w-.5}`,stroke:edge,'stroke-width':.85});
        shape('path',{d:`M${-w+1} ${-h+.8}H${w-1}`,stroke:light,'stroke-width':.75,'stroke-linecap':'round'});
      }
      return svg;
    }
    const positions={1:[[20,25]],2:[[20,15],[20,35]],3:[[11,12],[20,25],[29,38]],4:[[11,14],[29,14],[11,36],[29,36]],5:[[11,12],[29,12],[20,25],[11,38],[29,38]],6:[[11,12],[29,12],[11,25],[29,25],[11,38],[29,38]],7:[[11,10],[20,17],[29,24],[11,33],[29,33],[11,43],[29,43]],8:[[11,9],[29,9],[11,20],[29,20],[11,31],[29,31],[11,42],[29,42]],9:[[10,11],[20,11],[30,11],[10,25],[20,25],[30,25],[10,39],[20,39],[30,39]]}[n];
    for(let i=0;i<positions.length;i++){const[x,y]=positions[i],color=i===Math.floor(n/2)&&n%2?'#b34535':'#284c68';node('circle',{cx:x,cy:y,r:n===1?9:n>=8?3.5:4.3,fill:'none',stroke:color,'stroke-width':2});node('circle',{cx:x,cy:y,r:n===1?4.5:1,fill:color});}
    return svg;
  }
  [18,22,26].forEach(t=>$('mjCover').append(tile(t)));
  function rulesForm(root,values,disabled=false){
    values={...defaults,...values};root.replaceChildren();
    const group=keys=>{const grid=el('div','mj-rule-grid');for(const k of keys){const label=el('label','',fields[k][0]),select=el('select');select.dataset.rule=k;select.setAttribute('aria-label',fields[k][0]);select.disabled=disabled;for(const[v,text]of fields[k][1]){const opt=el('option','',text);opt.value=String(v);select.append(opt);}select.value=String(values[k]);label.append(select);grid.append(label);}return grid;};
    root.append(group(['hands','base','selfDrawOnly','reserve']));
    for(const [title,keys]of [['积分与杠分',['mingKong','anKong','kongSettlement','cap']],['出牌与庄家',['turnSeconds','responseSeconds','dealer']]]){const d=el('details'),s=el('summary','',title);d.append(s,group(keys));root.append(d);}
    const d=el('details'),s=el('summary','','可选牌型与胡牌细则'),grid=el('div','mj-rule-checks');for(const[k,text]of Object.entries(checks)){const row=el('div','mj-rule-check'),label=el('label','mj-rule-toggle'),input=el('input');input.type='checkbox';input.dataset.rule=k;input.checked=values[k];input.disabled=disabled;label.append(input,el('span','',text));row.append(label);
      if(k==='singleWait')label.title='碰杠四组后，剩一张手牌配对胡牌';
      if(Object.hasOwn(factorDefaults,k)){const factorLabel=el('label','mj-rule-factor'),number=el('input');number.type='number';number.min='1';number.max='64';number.step='1';number.required=true;number.inputMode='numeric';number.dataset.rule=k+'Factor';number.value=String(values[k+'Factor']);number.setAttribute('aria-label',text+'倍数');factorLabel.append(el('span','','×'),number,el('span','','倍'));row.append(factorLabel);}grid.append(row);
    }d.append(s,el('p','mj-factor-note','各项可设1–64倍；1倍表示不额外翻倍。叠加后仍受本桌倍数上限限制。'),grid);root.append(d);
    root.append(el('p','mj-rule-note','固定：136张、无精、不可吃。各项倍数相乘后封顶，再乘基础分；点胡即用别人打出的牌胡牌，由放铳者支付，自摸由另外三家各付一份。杠分乘基础分，单独结算；豪华七对替代普通七对，全字牌替代清一色/混一色。单吊指碰杠四组后，剩一张手牌配对胡牌。抢补杠胡独立开关，只自摸时也可单独开启。'));
    const sync=()=>{root.querySelector('[data-rule=robKong]').disabled=disabled;root.querySelector('[data-rule=luxuryPairs]').disabled=disabled||!root.querySelector('[data-rule=sevenPairs]').checked;for(const k of Object.keys(factorDefaults)){const check=root.querySelector('[data-rule='+k+']'),n=root.querySelector('[data-rule='+k+'Factor]');n.disabled=disabled||check.disabled||!check.checked;if(n.disabled&&(!Number.isInteger(Number(n.value))||Number(n.value)<1||Number(n.value)>64))n.value=String(factorDefaults[k]);}};root.onchange=sync;sync();
  }
  function readRules(root){const out={};for(const n of root.querySelectorAll('[data-rule]'))out[n.dataset.rule]=n.type==='checkbox'?n.checked:n.type==='number'?Number(n.value):n.value==='true'?true:n.value==='false'?false:/^\d+$/.test(n.value)?Number(n.value):n.value;return out;}
  rulesForm($('mjCreateRules'),defaults);
  const advancedRules=el('details','mj-advanced'),advancedSummary=el('summary','','自定义更多家规');
  advancedSummary.append(el('small','','计分 · 杠分 · 胡牌细则'));
  advancedRules.append(advancedSummary,...[...$('mjCreateRules').children].slice(1));$('mjCreateRules').append(advancedRules);
  function message(text=''){const id=room?'mjTableMessage':'mjMessage';$(id).textContent=text;}
  async function api(route='',data){
    const revision=epoch,controller=new AbortController();controllers.add(controller);const timeout=setTimeout(()=>controller.abort(),12000);
    try{const response=await fetch('/api/mahjong'+route,{method:data===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','X-SJ-CSRF':window.SJAuth.csrf},...(data===undefined?{}:{body:JSON.stringify(data)})});const value=await response.json();if(revision!==epoch)throw new DOMException('Account or room changed','AbortError');if(!response.ok)throw Object.assign(Error(value.error||'牌桌同步失败'),{status:response.status});return value;}catch(e){if(revision!==epoch)throw new DOMException('Account or room changed','AbortError');if(e.name==='AbortError')throw Error('连接等待较久，正在尝试重新同步。');if(e instanceof TypeError)throw Error('网络暂时不可用，恢复后会自动同步牌桌。');throw e;}finally{clearTimeout(timeout);controllers.delete(controller);}
  }
  let liveStream=null,streamReady=false,streamRetryAt=0,streamFailures=0,streamSeenAt=0,handKey='',riverFrame=0;
  function stopStream(){liveStream?.close();liveStream=null;streamReady=false;}
  function ensureStream(){
    if(liveStream||!window.EventSource||!room||document.hidden||!navigator.onLine||Date.now()<streamRetryAt)return;
    const revision=epoch,source=new EventSource('/api/mahjong/'+token+'/events');liveStream=source;
    source.addEventListener('state',e=>{
      if(revision!==epoch||liveStream!==source)return;
      try{const value=JSON.parse(e.data);streamReady=true;streamFailures=0;streamSeenAt=Date.now();$('mjConnection').textContent='';accept(value);}catch{stopStream();streamRetryAt=Date.now()+3000;}
    });
    source.addEventListener('ping',()=>{if(revision===epoch&&liveStream===source)streamSeenAt=Date.now();});
    source.addEventListener('revoked',e=>{
      if(revision!==epoch||liveStream!==source)return;
      const value=JSON.parse(e.data);stopStream();
      if([404,410].includes(value.status))endRoom(value.error);
      else if(value.status===401){clearPrivate();window.SJAuth.refresh();message(value.error);}
      else endRoom(value.error);
    });
    source.onerror=()=>{if(revision!==epoch||liveStream!==source)return;stopStream();streamRetryAt=Date.now()+Math.min(15000,1500*2**Math.min(++streamFailures,4));refresh();};
  }
  function hideTable(){stopStream();if(!$('mjTable').hidden){releaseFull();resetChat();voiceReset();}document.body.classList.remove('mj-in-table','game-landscape-page');$('mjTable').hidden=true;$('mjHome').hidden=false;}
  function clearPrivate(){epoch++;presetUI?.reset();for(const c of controllers)c.abort();room=null;preview=null;selected=null;selectedIndex=-1;handKey='';lastRendered='';busy=false;polling=false;delete $('mjMyMelds')._key;streamRetryAt=0;streamFailures=0;hideTable();for(const id of ['mjHand','mjOpponents','mjRivers','mjResult','mjSettlementDetails','mjActions','mjMyMelds','mjLobby','mjLog','mjRecent','mjRoomRules'])$(id).replaceChildren();for(const id of ['mjMyName','mjMyScore','mjSelection','mjTurnHint','mjTableMessage','mjInviteInfo','mjCenterStatus','mjWallCount'])$(id).textContent='';$('mjShareLink').value='';$('mjCreate').querySelector('button[type=submit]').disabled=false;for(const d of document.querySelectorAll('.mj-dialog[open]'))d.close();$('mjInvite').hidden=true;$('mjConnection').textContent='';$('mjMessage').textContent='';}
  function navigate(next){clearPrivate();token=next;history.pushState(null,'',next?'/mahjong/'+next:'/mahjong');if(next)refresh();else recents();}
  function endRoom(reason='牌室已关闭，已返回大厅。'){
    clearPrivate();token='';history.replaceState(null,'','/mahjong');message(reason);recents();window.scrollTo(0,0);
  }
  function accept(value){
    if(value.room?.phase==='closed'||value.preview?.phase==='closed'){endRoom('牌室已关闭，已返回大厅，可以重新开房。');return;}
    if(value.room){if(room&&room.token===value.room.token&&room.version>value.room.version)return;value.room._offset=Date.now()-value.room.serverNow;room=value.room;preview=null;if($('mjTable').hidden&&window.SJLandscape.isRotated())document.body.scrollTop=0;$('mjInvite').hidden=true;$('mjTable').hidden=false;$('mjHome').hidden=true;document.body.classList.add('mj-in-table','game-landscape-page');$('mjChatToggle').disabled=false;syncChat(room.chat||[]);voicePrepare();syncVoice(room);render();ensureStream();}
    else if(value.preview){if(room&&room.version>value.preview.version)return;room=null;preview=value.preview;hideTable();$('mjInvite').hidden=false;$('mjInviteInfo').textContent=preview.host+'的牌室 · '+preview.count+'/4人 · '+(phases[preview.phase]||'');$('mjJoinInvite').disabled=!preview.canJoin;$('mjJoinInvite').textContent=preview.canJoin?'加入 / 回到座位':'暂时无法加入';}
  }
  async function refresh(){if(!token||!window.SJAuth.user||polling||busy)return;polling=true;const revision=epoch;try{accept(await api('/'+token));$('mjConnection').textContent='';}catch(e){if(revision!==epoch)return;if(e.status===401){clearPrivate();await window.SJAuth.refresh();message('登录已失效，请重新登录。');}else if([404,410].includes(e.status)){endRoom(e.message);}else if(room)$('mjConnection').textContent=e.message;else message(e.message);}finally{if(revision===epoch)polling=false;}}
  async function recents(){presetUI?.load();if(!window.SJAuth.user){$('mjRecent').replaceChildren(el('p','mj-muted','登录后查看最近的牌室。'));return;}const revision=epoch;try{const v=await api();if(revision!==epoch)return;const root=$('mjRecent');root.replaceChildren();if(!v.rooms.length)root.append(el('p','mj-recent-empty','还没有进行中的牌室。开好房后，可以从这里回到牌桌。'));for(const r of v.rooms){if(r.phase==='closed')continue;const a=el('a','mj-recent-link'),copy=el('span','mj-room-copy');a.href='/mahjong/'+r.token;copy.append(el('strong','',r.host+'的牌室'),el('small','',phases[r.phase]+' · '+r.count+'/4 人'+(r.handNo?' · 第'+r.handNo+'局':'')));a.append(copy,el('b','mj-room-enter','进入 ↗'));a.onclick=e=>{e.preventDefault();navigate(r.token);};root.append(a);}}catch(e){if(revision===epoch)message(e.message);}}
  async function mutate(action,extra={}){
    if(busy||!token)return false;const revision=epoch,roomToken=token;busy=true;controls();message('');const input={...extra,version:room?.version??preview?.version,handNo:room?.handNo,responseId:room?.pending?.id,opId:operationId()};
    try{const value=await api('/'+roomToken+'/'+action,input);selected=null;if(action==='leave'||action==='close'){for(const d of document.querySelectorAll('.mj-dialog[open]'))d.close();navigate('');message(action==='close'?'牌室已结束。':'已离开牌室。原座位由机器人接管，可用邀请链接回座。');}else accept(value);return true;}
    catch(e){if(revision!==epoch)return;if([404,410].includes(e.status)){endRoom(e.message);return;}message(e.message);if(e.status===409||!e.status){selected=null;try{accept(await api('/'+roomToken));}catch(resync){if([404,410].includes(resync.status))endRoom(resync.message);}}if(e.status===401){clearPrivate();await window.SJAuth.refresh();message('请重新登录后回到牌室。');}}
    finally{if(revision===epoch){busy=false;controls();}}
  }
  function actionButton(label,fn,cls=''){const b=el('button',cls,label);b.type='button';b.dataset.mjMutate='';b.onclick=fn;return b;}
  function controls(){
    for(const b of document.querySelectorAll('[data-mj-mutate]'))b.disabled=busy;$('mjSaveRules').disabled=busy;$('mjJoinInvite').disabled=busy||!preview?.canJoin;
    const can=!!room?.actions.discard&&selected!==null&&room.hand.includes(selected);$('mjDiscard').disabled=busy||!can;$('mjDiscard').textContent=busy&&can?'正在出牌…':can?'打出 '+name(selected):'选择手牌';$('mjHand').setAttribute('aria-busy',String(busy));
    for(const b of $('mjHand').children){const active=selected!==null&&Number(b.dataset.index)===selectedIndex;b.disabled=busy||!room?.actions.discard;b.setAttribute('aria-pressed',String(active));b.classList.toggle('is-pending',busy&&active);}
    $('mjSelection').textContent=selected!==null?'已选 '+name(selected):'点选手牌 · 点牌河可放大';
  }
  function meldNode(m,small=false){const d=el('span',small?'':'mj-meld');for(let i=0;i<(m.type==='pong'?3:4);i++)d.append(tile(m.tile,m.tile===null));if(!small)d.append(el('small','',m.type==='pong'?'碰':m.type==='an'?'暗杠':m.type==='bu'?'补杠':'明杠'));return d;}
  function portraitIndex(player){
    // Stable across clients and seating changes; all nine characters are reachable.
    let hash=2166136261;for(const c of String(player.userId??player.name)){hash=Math.imul(hash^c.codePointAt(0),16777619);}
    return (hash>>>0)%9+1;
  }
  function renderBoard(r){
    const actor=r.phase==='playing'?r.turn:r.phase==='respond'?r.pending.from:-1;
    const opponents=$('mjOpponents'),rivers=$('mjRivers'),compass=$('mjCompass');
    const latest=(r.discards||[]).at(-1);
    const featured=r.pending&&!r.pending.rob?{seat:r.pending.from,tile:r.pending.tile,index:r.seats[r.pending.from].river.length-1}:latest?.handNo===r.handNo?latest:null;
    let changed=false;
    for(const [offset,side]of sides.entries()){
      const s=(r.me+offset)%4,p=r.seats[s],mark=compass.querySelector('[data-side='+side+']');
      mark.textContent=directions[s];mark.classList.toggle('is-active',s===actor);
      let group=opponents.querySelector('[data-side='+side+']');
      if(offset>0&&p){
        if(!group){group=el('div','mj-seat');group.dataset.side=side;const badge=el('div','mj-opponent'),avatar=el('span','table-avatar mj-chibi-avatar'),details=el('div','mj-opponent-info');avatar.setAttribute('aria-hidden','true');details.append(el('strong'),el('small'));badge.append(avatar,details);group.append(badge,el('div','mj-rack'),el('div','mj-mini-melds'));opponents.append(group);}
        const badge=group.querySelector('.mj-opponent');badge.classList.toggle('is-turn',actor===s);
        const key=JSON.stringify([p,r.dealer===s]);
        if(group._key!==key){group._key=key;group.querySelector('.table-avatar').style.setProperty('--mj-portrait',`url('/assets/mahjong-chibi-v1-${portraitIndex(p)}.webp')`);
          group.querySelector('strong').textContent=p.name;group.querySelector('small').textContent=directions[s]+'位 · '+p.score+'分'+(r.dealer===s?' · 庄':'')+(p.bot||p.away?' · 托管':'');
          const rack=group.querySelector('.mj-rack');rack.setAttribute('aria-label','手牌 '+p.handCount+' 张'+(p.away?'，暂离托管':''));
          while(rack.children.length>p.handCount)rack.lastElementChild.remove();while(rack.children.length<p.handCount)rack.append(el('i'));
          const melds=group.querySelector('.mj-mini-melds'),meldKey=JSON.stringify(p.melds);if(melds._key!==meldKey){melds._key=meldKey;melds.replaceChildren(...p.melds.map(m=>meldNode(m,true)));}
        }
      }else group?.remove();
      let box=rivers.querySelector('[data-side='+side+']');
      if(!box){box=el('button','mj-river');box.type='button';box.dataset.side=side;box.append(el('span','mj-river-label'),el('span','mj-river-tiles'));rivers.append(box);}
      box.onclick=()=>openRivers(s);const river=p?.river||[],tiles=box.lastElementChild;
      const key=r.handNo+':'+river.join(',');
      if(box._key!==key){
        const sameHand=box._hand===r.handNo;box._key=key;box._hand=r.handNo;changed=true;
        for(let i=tiles.children.length-1;i>=0;i--)if(!sameHand||i>=river.length||Number(tiles.children[i].dataset.tile)!==river[i])tiles.children[i].remove();
        for(const [i,t]of river.entries()){
          let entry=tiles.children[i];if(!entry||Number(entry.dataset.tile)!==t){entry=el('span','mj-river-tile');entry.dataset.tile=t;entry.title=name(t);entry.append(tile(t));tiles.insertBefore(entry,tiles.children[i]||null);if(sameHand&&featured?.seat===s&&featured.index===i)entry.classList.add('is-entering');}
        }
        box.setAttribute('aria-label',directions[s]+'位弃牌 '+river.length+'张，点按放大');box.firstElementChild.textContent=directions[s]+' · '+river.length+'张';box.hidden=!river.length;
      }
      [...tiles.children].forEach((entry,i)=>entry.classList.toggle('is-last',featured?.seat===s&&featured.index===i&&featured.tile===river[i]));
    }
    $('mjWallCount').textContent='余 '+r.remaining+' 张';$('mjWallCount').title='另留 '+r.rules.reserve+' 张荒牌';
    $('mjCenterStatus').textContent=r.phase==='respond'?directions[r.pending.from]+'家'+(r.pending.rob?'补杠 ':'打出 ')+name(r.pending.tile):actor>=0?directions[actor]+'家出牌':phases[r.phase];
    if(changed){scheduleRivers();if($('mjRiverDialog').open)paintRivers();}
  }
  function scheduleRivers(){if(!riverFrame)riverFrame=requestAnimationFrame(()=>{riverFrame=0;fitRivers();});}
  function fitRivers(){
    const board=$('mjBoard'),table=$('mjTable'),w=board.clientWidth,h=board.clientHeight;if(!w||!h)return;
    const boxes=[...$('mjRivers').children],rows=Math.max(3,...boxes.map(b=>Math.ceil(b.querySelectorAll('.mj-river-tile').length/6)));
    const handCount=$('mjHand').children.length,meldCount=$('mjMyMelds').querySelectorAll('svg').length;
    const discardWidth=parseFloat(getComputedStyle(table).getPropertyValue('--mj-discard-w'))||104,handAvailable=w*.85-discardWidth-16;
    const handSize=Math.min(60,w*.048,h*.18,(handAvailable-30-handCount*2-meldCount)/(Math.max(1,handCount+meldCount*.64)));
    table.style.setProperty('--mj-tile-w',handSize+'px');
    // Reserve the top rack and bottom hand before fitting a square of four rotated rivers.
    // Equal native grids stay disjoint even at the corners; labels sit outside each grid.
    const top=Math.max(32,h*.03+handSize*.67+12),bottom=h-handSize*1.4-30,gap=7,available=Math.min(w*.43,bottom-top);
    const size=Math.max(3,Math.min(24,(available-11-2*(rows+5)-gap*2)/(6+rows*2.8)));
    const pileWidth=size*6+11,pileHeight=size*1.4*rows+rows+5;
    const ringRadius=pileWidth/2+pileHeight+gap;
    table.style.setProperty('--mj-ring-radius',ringRadius+'px');table.style.setProperty('--mj-action-w',Math.max(62,Math.min(110,w*.32-ringRadius-16-handSize*.56))+'px');
    board.style.setProperty('--pile-tile',size+'px');board.style.setProperty('--pile-width',pileWidth+'px');board.style.setProperty('--pile-height',pileHeight+'px');
    board.style.setProperty('--pile-offset',(pileWidth/2+gap+pileHeight/2)+'px');board.style.setProperty('--mj-center-y',((top+bottom)/2)+'px');
    board.style.setProperty('--mj-compass-w',Math.min(86,pileWidth-8)+'px');board.style.setProperty('--mj-compass-h',Math.min(62,pileWidth-18)+'px');
    board.style.setProperty('--mj-back-step',Math.min(15,(h*.54-13)/14)+'px');
    for(const group of $('mjOpponents').children){const count=group.querySelectorAll('.mj-mini-melds svg').length,isTop=group.dataset.side==='top';group.style.setProperty('--mj-open-w',Math.min(handSize*.64,((isTop?w*.29:h*.67)-16)/Math.max(1,count))+'px');}
    for(const box of boxes){box.classList.remove('is-dense');box.style.setProperty('--pile-cols','6');box.style.setProperty('--pile-rows',String(rows));}
  }
  new ResizeObserver(scheduleRivers).observe($('mjBoard'));
  function paintRivers(){
    if(!room)return;
    $('mjRiverDetail').replaceChildren(...room.seats.map((p,s)=>{
      const section=el('section','mj-river-detail'),tiles=el('div');section.dataset.seat=s;
      if(!p){section.append(el('h3','',directions[s]+'位 · 空座'));return section;}
      section.append(el('h3','',directions[s]+'位 · '+p.name+' · '+p.river.length+'张'),tiles);
      for(const t of p.river){const entry=el('span');entry.title=name(t);entry.append(tile(t));tiles.append(entry);}
      if(!p.river.length)tiles.append(el('small','','还没有弃牌'));
      return section;
    }));
  }
  function openRivers(seat){paintRivers();$('mjRiverDialog').showModal();$('mjRiverDetail').querySelector('[data-seat="'+seat+'"]').scrollIntoView({block:'nearest'});}
  function render(){
    const r=room;if(!r)return;const key=r.token+':'+r.version;if(lastRendered===key){countdown();return;}lastRendered=key;
    $('mjTableTitle').textContent='第 '+r.handNo+'/'+r.rules.hands+' 局';$('mjMyName').textContent=r.seats[r.me].name;$('mjMyScore').textContent=directions[r.me]+'位 · '+r.seats[r.me].score+'分'+(r.dealer===r.me?' · 庄':'');$('mjMyAvatar').style.setProperty('--mj-portrait',`url('/assets/mahjong-chibi-v1-${portraitIndex(r.seats[r.me])}.webp')`);
    renderBoard(r);
    const lobby=$('mjLobby');lobby.hidden=r.phase!=='lobby'&&r.phase!=='closed';lobby.replaceChildren();
    if(r.phase==='lobby'){
      lobby.append(el('h2','','朋友到齐，就开一桌'),el('p','',r.rules.selfDrawOnly?'本桌只自摸，可碰可杠不可吃。':'本桌可自摸、可点胡，可碰可杠不可吃。'));
      const list=el('div','mj-seat-list');r.seats.forEach((p,s)=>list.append(el('span','',directions[s]+' · '+(p?p.name+' '+(p.ready?'已准备':'未准备'):'等牌友'))));lobby.append(list);
      if(r.hostId===window.SJAuth.user?.id)lobby.append(actionButton(r.seats.some(s=>!s)?'机器人补位并开始':'开始本桌',()=>mutate('start',{fillBots:true})),el('p','','可以从菜单邀请牌友。机器人补位后，本桌不再接受新玩家。'));
      else lobby.append(actionButton(r.seats[r.me].ready?'取消准备':'我准备好了',()=>mutate('ready',{ready:!r.seats[r.me].ready})));
    }else if(r.phase==='closed')lobby.append(el('h2','','这间牌室已结束'),actionButton('回麻将大厅',()=>navigate('')));
    const ended=['between','finished'].includes(r.phase);$('mjBoard').hidden=ended;$('mjResult').hidden=!ended;$('mjTable').classList.toggle('mj-showing-result',ended);renderResult();
    $('mjTurnHint').textContent=r.phase==='playing'?(r.turn===r.me?'轮到你：'+(r.drawn===null?'碰后请先出牌':'已摸 '+name(r.drawn)):'等 '+r.seats[r.turn].name+' 出牌'):r.phase==='respond'?(r.actions.claims?'可以响应这张牌':r.pending.responded?'已响应，等其他牌友':'等其他牌友响应'):phases[r.phase];
    const actions=$('mjActions');actions.replaceChildren();const a=r.actions;
    if(a.hu)actions.append(actionButton('自摸',()=>mutate('action',{type:'hu'})));
    for(const k of a.kongs||[])actions.append(actionButton((k.type==='an'?'暗杠 ':'补杠 ')+name(k.tile),()=>mutate('action',{type:'kong',kind:k.type,tile:k.tile})));
    if(a.claims){for(const c of a.claims)actions.append(actionButton(({hu:'胡 ',kong:'杠 ',pong:'碰 '})[c]+name(a.tile),()=>mutate('action',{type:'claim',choice:c})));actions.append(actionButton('过',()=>mutate('action',{type:'claim',choice:'pass'}),'mj-pass'));}
    const melds=$('mjMyMelds'),meldKey=JSON.stringify(r.seats[r.me].melds);if(melds._key!==meldKey){melds._key=meldKey;melds.replaceChildren(...r.seats[r.me].melds.map(m=>meldNode(m)));}
    renderHand(r);
    document.querySelector('.mj-hand-area').hidden=ended||r.phase==='lobby'||r.phase==='closed';$('mjDiscard').hidden=ended||r.phase==='lobby'||r.phase==='closed';$('mjMyMelds').hidden=ended||r.phase==='lobby';countdown();controls();scheduleRivers();
  }
  function renderHand(r){
    const hand=$('mjHand'),ordered=[...r.hand];if(r.drawn!==null){ordered.splice(ordered.lastIndexOf(r.drawn),1);ordered.push(r.drawn);}
    const key=r.handNo+':'+r.drawn+':'+ordered.join(',');
    if(!r.actions.discard){selected=null;selectedIndex=-1;}
    if(handKey===key)return;
    const hadHand=!!handKey;handKey=key;selected=null;selectedIndex=-1;
    const old=new Map([...hand.children].map(b=>[b.dataset.key,b])),counts=new Map(),next=[];
    ordered.forEach((t,i)=>{
      const n=(counts.get(t)||0)+1;counts.set(t,n);const id=t+':'+n,drawn=i===ordered.length-1&&r.drawn!==null;
      let b=old.get(id);old.delete(id);
      if(!b){b=el('button','mj-tile');b.type='button';b.dataset.key=id;b.dataset.tile=t;b.append(tile(t));if(hadHand&&drawn)b.classList.add('is-entering');
        b.onclick=()=>{const index=Number(b.dataset.index);if(selected!==null&&selectedIndex===index){selected=null;selectedIndex=-1;}else{selected=Number(b.dataset.tile);selectedIndex=index;}controls();};}
      b.dataset.index=i;b.classList.toggle('is-drawn',drawn);b.setAttribute('aria-label',name(t)+(drawn?'，刚摸到的牌':''));next.push(b);
    });
    for(const b of old.values())b.remove();next.forEach((b,i)=>{if(hand.children[i]!==b)hand.insertBefore(b,hand.children[i]||null);});
  }
  function renderResult(){
    const root=$('mjResult'),r=room,result=r.result;if(!result){root.replaceChildren();delete root._key;return;}
    const key=[r.token,r.handNo,result.at,r.phase,r.hostId,r.me].join(':');if(root._key===key&&root.childElementCount)return;root._key=key;root.replaceChildren();root.dataset.handNo=r.handNo;
    const header=el('header','mj-settlement-head'),heading=el('div'),title=el('h2','',result.draw?'荒牌流局':result.source===null?'自摸胡牌':result.winners.length>1?'一炮多响':'胡牌结算');title.id='mjSettlementTitle';
    heading.append(el('span','mj-settlement-kicker','第 '+r.handNo+' / '+r.rules.hands+' 局 · 本局结算'),title,el('p','',result.draw?'四家手牌已摊开，可查看本局牌型。':result.winners.map(s=>r.seats[s].name).join('、')+(result.source===null?' 自摸':result.items.some(i=>i.rob)?' 抢杠胡': ' 胡牌 · '+r.seats[result.source].name+' 放铳')));
    const mine=el('div','mj-settlement-mine'),delta=result.delta[r.me];mine.append(el('small','','你的本局积分'),el('strong',delta>0?'is-gain':delta<0?'is-loss':'',signedPoints(delta)));header.append(heading,mine);
    const list=el('div','mj-settlement-list');list.setAttribute('aria-label','四家剩余手牌与本局积分');
    for(const offset of [0,1,2,3]){const seat=(r.me+offset)%4,p=r.seats[seat],winner=result.winners.includes(seat),row=el('section','mj-settlement-row'+(winner?' is-winner':'')+(seat===result.source?' is-source':''));row.dataset.seat=seat;row.setAttribute('aria-label',p.name+'，'+(winner?'胡牌，':'')+'本局'+signedPoints(result.delta[seat])+'分');
      const identity=el('div','mj-settlement-player'),avatar=el('span','table-avatar mj-chibi-avatar'),label=el('div','mj-settlement-identity');avatar.style.setProperty('--mj-portrait',`url('/assets/mahjong-chibi-v1-${portraitIndex(p)}.webp')`);avatar.setAttribute('aria-hidden','true');
      const tags=[directions[seat]+'位'];if(seat===r.me)tags.push('你');if(winner)tags.push(result.source===null?'自摸':'胡牌');else if(seat===result.source)tags.push(result.items.some(i=>i.rob)?'被抢杠':'放铳');label.append(el('strong','',p.name),el('small','',tags.join(' · ')));identity.append(avatar,label);
      const cards=el('div','mj-settlement-tiles'),hand=el('div','mj-settlement-concealed'),concealed=[...result.hands[seat]].sort((a,b)=>a-b),hasWinTile=winner&&Number.isInteger(result.tile);
      if(hasWinTile&&result.source===null){const i=concealed.lastIndexOf(result.tile);if(i>=0)concealed.splice(i,1);}
      for(const t of concealed)hand.append(resultTile(t));cards.append(hand);
      if(hasWinTile){const winning=resultTile(result.tile,'mj-settlement-winning');winning.setAttribute('aria-label','胡牌张：'+name(result.tile));winning.title='胡牌张：'+name(result.tile);winning.append(el('b','','胡'));cards.append(winning);}
      if(p.melds.length){const melds=el('div','mj-settlement-melds');for(const m of p.melds){const group=meldNode(m);group.title=({pong:'碰',an:'暗杠',bu:'补杠',ming:'明杠'})[m.type]+' '+name(m.tile);group.setAttribute('aria-label',group.title);melds.append(group);}cards.append(melds);}
      const score=el('div','mj-settlement-score');score.append(el('strong',result.delta[seat]>0?'is-gain':result.delta[seat]<0?'is-loss':'',signedPoints(result.delta[seat])),el('small','','总分 '+p.score));row.append(identity,cards,score);list.append(row);
    }
    const footer=el('footer','mj-settlement-footer'),left=el('div'),right=el('div'),details=el('button','','计分明细');details.type='button';details.onclick=()=>$('mjSettlementDialog').showModal();left.append(details);
    if(r.phase==='between'&&r.hostId!==window.SJAuth.user?.id)left.append(el('span','mj-settlement-wait','等待房主开始下一局'));
    right.append(actionButton('返回大厅',()=>navigate('')));if(r.phase==='between'&&r.hostId===window.SJAuth.user?.id)right.append(actionButton('下一局 →',()=>mutate('next'),'mj-settlement-next'));footer.append(left,right);root.append(header,list,footer);
    const detail=$('mjSettlementDetails');detail.replaceChildren();for(const item of result.items)detail.append(el('p','',r.seats[item.seat].name+'：'+item.patterns.map(p=>(p.name==='金钩钓'?'单吊':p.name)+' ×'+p.factor).join(' · ')+' → '+item.uncapped+'倍'+(item.uncapped>item.multiplier?'，封顶至'+item.multiplier+'倍':'')+' × 基础'+r.rules.base+'分；'+(result.source===null?'其他三家各付':item.rob?'被抢杠者支付':'放铳者支付')+item.points+'分'+(item.rob?' · 抢杠胡':'')));
    detail.append(el('p','',result.kongs.length?result.kongs.map(k=>r.seats[k.seat].name+' '+(k.type==='an'?'暗杠':'明/补杠')+'，'+(k.applied?'另外三家各付'+k.points*r.rules.base+'分':'流局不计杠分')).join('；'):'本局没有杠分。'));root.scrollTop=0;scheduleSettlement();
    if($('mjChat').hidden&&!document.querySelector('dialog[open]'))root.focus({preventScroll:true});
  }
  function signedPoints(n){return (n>0?'+':n<0?'−':'')+Math.abs(n);}
  function resultTile(t,cls=''){const card=el('span','mj-settlement-tile'+(cls?' '+cls:''));card.dataset.tile=t;card.title=name(t);card.setAttribute('aria-label',name(t));card.append(tile(t));return card;}
  let settlementFrame=0;
  function scheduleSettlement(){if(!settlementFrame)settlementFrame=requestAnimationFrame(()=>{settlementFrame=0;const rows=[...$('mjResult').querySelectorAll('.mj-settlement-row')];if(!rows.length||$('mjResult').hidden)return;const sizes=rows.map(row=>{const cards=row.querySelector('.mj-settlement-tiles'),count=cards.querySelectorAll('svg').length,groups=cards.children.length;return Math.min(34,(row.clientHeight-12)/1.4,(cards.clientWidth-count-18-(groups-1)*9)/Math.max(1,count));});$('mjResult').style.setProperty('--settlement-tile',Math.max(7,Math.min(...sizes))+'px');});}
  new ResizeObserver(scheduleSettlement).observe($('mjResult'));
  function countdown(){if(!room)return;const left=Math.max(0,Math.ceil((room.deadline-(Date.now()-room._offset))/1000));$('mjCountdown').textContent=room.deadline?String(left).padStart(2,'0'):'—';$('mjCompass').classList.toggle('is-urgent',!!room.deadline&&left<=8);}
  $('mjDiscard').onclick=()=>{if(selected!==null)mutate('action',{type:'discard',tile:selected});};
  async function createRoomWithRules(rules){if(!window.SJAuth.user){window.SJAuth.open({purpose:'登录后创建麻将牌室。',resume:()=>createRoomWithRules(rules)});return false;}if(busy)return false;const revision=epoch;busy=true;const b=$('mjCreate').querySelector('button[type=submit]');b.disabled=true;try{const v=await api('',{rules});token=v.room.token;history.pushState(null,'','/mahjong/'+token);accept(v);message('');return true;}catch(err){if(revision===epoch)message(err.message);return false;}finally{if(revision===epoch){busy=false;b.disabled=false;controls();}}}
  $('mjCreate').onsubmit=e=>{e.preventDefault();createRoomWithRules(readRules($('mjCreateRules')));};
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
  presetUI=window.createMahjongPresetsUI({api,readRules,renderRules:rulesForm,openRoom:createRoomWithRules,ask});
  document.addEventListener('sj:auth-change',authChanged);document.addEventListener('sj:logout',clearPrivate);window.SJAuth.ready.then(authChanged);
  window.addEventListener('popstate',()=>{clearPrivate();token=/^\/mahjong\/([a-f0-9]{32})\/?$/.exec(location.pathname)?.[1]||'';if(token)refresh();else recents();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopStream();else{streamRetryAt=0;refresh();}});window.addEventListener('online',()=>{streamRetryAt=0;refresh();});
  window.addEventListener('pagehide',stopStream);window.addEventListener('pageshow',()=>{if(room)refresh();});
  window.addEventListener('offline',()=>{stopStream();if(room)$('mjConnection').textContent='网络已断开，恢复后会自动同步；出牌仍按牌桌计时。';else message('网络已断开，请恢复连接后再操作。');});
  setInterval(()=>{if(document.hidden||!navigator.onLine||!token||!window.SJAuth.user)return;if(streamReady&&Date.now()-streamSeenAt>35000){stopStream();streamRetryAt=0;}if(!streamReady)refresh();},1200);setInterval(countdown,250);
  document.addEventListener('DOMContentLoaded',()=>{const nav=$('touchNav');if(nav){for(const n of nav.querySelectorAll('[aria-current]'))n.removeAttribute('aria-current');nav.querySelector('a[href="/games"]')?.setAttribute('aria-current','page');}});
})();
