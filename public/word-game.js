(() => {
 const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e;};
 let token=location.pathname.match(/^\/play\/([a-f0-9]{32})\/?$/)?.[1]||null,current=null,lastVersion=0,epoch=0,busy=false,lastUser=null;
 let readController=null,readPromise=null,composing=false,wordError='',pendingGuess=false;
 const text=(element,value)=>{if(element.textContent!==value)element.textContent=value;};
 const lobbyStatus=()=>{
  document.body.classList.toggle('in-word-room',!!token);
  $('gameLobby').hidden=!!token;
  $('gameLogin').hidden=!token||!!SJAuth.user;
 };
 function sync(state){$('gameSyncStatus').dataset.state=state;text($('gameSyncStatus'),state==='connected'?'与对方自动同步':state==='offline'?'网络暂时不可用，恢复后会重连；当前输入已保留。':'正在重新连接，当前输入已保留…');}
 function wordState(){
  const input=$('gameWord'),word=input.value.trim(),count=Array.from(word).length;
  const invalid=!composing&&(count>12||/[\p{Cc}\p{Cf}]/u.test(word));
  const message=composing?'':invalid?'请输入1–12字，不要包含换行或隐藏字符。':wordError;
  text($('gameWordCount'),composing?'选字中':count+' / 12字');text($('gameWordError'),message);input.setAttribute('aria-invalid',String(invalid||!!wordError));
  $('gameSubmit').disabled=busy||composing||invalid||!word||current?.status!=='playing'||!!current?.ownWord;
  text($('gameSubmit'),busy&&pendingGuess?'锁定中…':current?.ownWord?'本轮已锁定':'锁定我的词');
  return !composing&&!invalid&&!!word;
 }
 async function api(route='',data,signal){let r;try{r=await fetch('/api/word-game'+route,{signal,credentials:'same-origin',cache:'no-store',...(data!==undefined?{method:'POST',headers:{'Content-Type':'application/json','X-SJ-CSRF':SJAuth.csrf},body:JSON.stringify(data)}:{})});}catch(e){throw Object.assign(Error(e.name==='AbortError'?'连接等待较久，正在重新连接；当前输入已保留。':'网络暂时不可用，当前输入已保留，请稍后重试。'),{connection:true});}let value;try{value=await r.json();}catch{throw Object.assign(Error('暂时没有收到有效回复，当前输入已保留，请稍后重试。'),{connection:true});}if(!r.ok)throw Object.assign(Error(value.error||'游戏暂时不可用'),{status:r.status});return value;}
 function clear(){epoch++;readController?.abort();readController=null;readPromise=null;current=null;lastVersion=0;wordError='';composing=false;$('gameRoom').hidden=true;$('gameJoin').hidden=true;$('gameHistory').replaceChildren();$('gameHistorySection').hidden=true;$('gameWord').value='';$('gameInviteURL').value='';$('gameRecent').replaceChildren();$('gameRecentSection').hidden=true;for(const id of ['gameOwnWord','gameOtherWord','gameWinWord','gameResultStatus','gameCopyStatus','gameOwnName','gameOtherName','gameJoinText'])$(id).textContent='';$('gameWin').hidden=true;$('gameError').textContent='';wordState();}
 function error(e,guess=false){if([401,403,404,410].includes(e.status)){const value=e.message;clear();$('gameError').textContent=value;if(e.status===401)SJAuth.refresh();}else if(guess){wordError=e.message;wordState();}else $('gameError').textContent=e.message;}
 function login(){SJAuth.open({purpose:token?'登录后查看邀请，再确认是否加入这局猜词。':'登录后开一局同频猜词，邀请朋友一起玩。',resume:async()=>{await load();(token?$('gameJoinButton'):$('gameCreate')).focus();}});}
 function render(data){
  if(data.preview){if(lastVersion)return;current=null;$('gameJoin').hidden=false;$('gameJoinText').textContent='@'+data.preview.host+' 邀请你一起同频猜词。加入后，房间仅你们两人可看。';$('gameRoom').hidden=true;return;}
  const room=data.room;
  if(!room||room.version<lastVersion)return;
  const previous=current;
  current=room;
  lastVersion=room.version;
  lobbyStatus();
  $('gameJoin').hidden=true;
  $('gameRoom').hidden=false;
  text($('gameRound'),'第 '+room.round+' 轮');
  const matched=room.status==='matched',active=room.status==='playing',waiting=room.status==='waiting';
  text($('gamePhase'),waiting?'等朋友加入':matched?'同频了！':room.status==='closed'?'本局已结束':room.ownWord?'等朋友锁定词语':'各想一个词');
  text($('gameOwnName'),'你 · @'+(room.myRole==='host'?room.host:room.guest));
  text($('gameOtherName'),room.guest?'TA · @'+(room.myRole==='host'?room.guest:room.host):'你的同频搭子');
  text($('gameOwnWord'),room.ownWord||'待提交');
  text($('gameOtherWord'),room.partnerReady?'已锁定':'正在想词');
  $('gameOwnCard').dataset.ready=String(!!room.ownWord);
  $('gameOtherCard').dataset.ready=String(room.partnerReady);
  $('gamePlayers').hidden=!active;
  $('gameForm').hidden=!active||!!room.ownWord;
  $('gameWord').disabled=!active||!!room.ownWord;
  if(previous?.round!==room.round||room.ownWord){$('gameWord').value='';wordError='';}
  wordState();
  const last=room.history.at(-1);
  const clues=active&&room.round>1&&last;
  const opening=(active||waiting)&&room.round===1&&room.prompt;
  $('gameContext').hidden=!clues&&!opening;
  $('gameContext').dataset.kind=clues?'clues':'prompt';
  text($('gameContextLabel'),clues?'上一轮揭晓':'第一轮主题');
  $('gameContextHelp').hidden=!clues;
  text($('gameClueFirst'),clues?last.hostWord:opening||'');
  text($('gameClueSecond'),clues?last.guestWord:'');
  $('gameCluePlus').hidden=!clues;
  $('gameClueSecond').hidden=!clues;
  if(previous&&last&&previous.history.at(-1)?.round!==last.round){
    const reveal=matched?$('gameWin'):$('gameContext');
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)reveal.animate(
      [{opacity:.45,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:280}
    );
  }
  $('gameInvite').hidden=room.status!=='waiting';$('gameInviteURL').value=location.origin+'/play/'+room.token;$('gameEnd').hidden=!['waiting','playing'].includes(room.status);$('gameNew').hidden=!['matched','closed'].includes(room.status);$('gameWin').hidden=!matched;
  if(matched){const last=room.history.at(-1);$('gameWinWord').textContent=last?.hostWord||room.ownWord;$('gameWinText').textContent='你们在第 '+room.round+' 轮，想到了同一个词。';}
  text($('gameTip'),waiting?'把邀请发给一位朋友。对方登录加入后就能开始。':matched?'你们找到了同频答案。':room.status==='closed'?'可查看已揭晓的词，或再开一局。':'');
  if(previous&&previous.completedRounds===room.completedRounds)return;
  $('gameHistorySection').hidden=!room.history.length;$('gameHistoryCount').textContent=room.completedRounds>50?'最近50轮 / 已揭晓'+room.completedRounds+'轮':'已揭晓 '+room.completedRounds+' 轮';const rows=[...room.history].reverse().map(item=>{const row=make('article',undefined,'game-history-row');row.dataset.matched=String(!!item.matched);const caption=make('div',undefined,'game-history-caption');caption.append(make('span','第 '+item.round+' 轮'),make('span',item.matched?'✓ 同频':'继续靠近'));const words=make('div',undefined,'game-history-words');words.append(make('strong',item.hostWord),make('span',item.matched?'＝':'＋'),make('strong',item.guestWord));row.append(caption,words);return row;});$('gameHistory').replaceChildren(...rows);
 }
 async function load(){
  await SJAuth.ready;const version=epoch,user=SJAuth.user?.id;lobbyStatus();
  if(!user){text($('gameIntroStatus'),token?'登录后可以确认加入这局。':'');return;}
  if(readPromise)return readPromise;
  $('gameIntroStatus').textContent='';const controller=new AbortController();readController=controller;
  if($('gameSyncStatus').dataset.state==='offline')sync('connecting');
  const timeout=setTimeout(()=>controller.abort(),8000);
  const task=(async()=>{try{const data=await api(token?'/'+token:'',undefined,controller.signal);if(version!==epoch||SJAuth.user?.id!==user)return;sync('connected');if(token)render(data);else{$('gameRecentSection').hidden=!data.items.length;$('gameRecent').replaceChildren(...data.items.map(item=>{const link=make('a',undefined,'game-recent-link');link.href='/play/'+item.token;link.append(make('strong',item.partner?'和 @'+item.partner:'等待朋友的房间'),make('span',(item.status==='matched'?'已同频':item.status==='closed'?'已结束':item.status==='waiting'?'等待加入':'进行中')+' · 第'+item.round+'轮'));return link;}));}}catch(e){if(version!==epoch||SJAuth.user?.id!==user||document.hidden)return;if(e.connection&&token)sync('offline');else error(e);}finally{clearTimeout(timeout);if(readController===controller){readController=null;readPromise=null;}}})();
  readPromise=task;return task;
 }
 async function mutate(action,body={}){await SJAuth.ready;if(!SJAuth.user){login();return;}if(busy)return;busy=true;pendingGuess=action.endsWith('/guess');wordError='';const version=epoch,user=SJAuth.user.id;$('gameError').textContent='';if(current)render({room:current});$('gameCreate').disabled=true;$('gameJoinButton').disabled=true;$('gameEnd').disabled=true;$('gameNew').disabled=true;try{const data=await api(action,body);if(version!==epoch||SJAuth.user?.id!==user)return;if(!token){token=data.room.token;history.pushState(null,'','/play/'+token);current=null;lastVersion=0;$('gameLobby').hidden=true;$('gameRecentSection').hidden=true;}sync('connected');render(data);}catch(e){if(version===epoch)error(e,pendingGuess);}finally{busy=false;pendingGuess=false;$('gameCreate').disabled=false;$('gameJoinButton').disabled=false;$('gameEnd').disabled=false;$('gameNew').disabled=false;if(current)render({room:current});}}
 $('gameWord').addEventListener('input',()=>{wordError='';wordState();});$('gameWord').addEventListener('compositionstart',()=>{composing=true;wordState();});$('gameWord').addEventListener('compositionend',()=>{composing=false;wordError='';wordState();});
 $('gameCreate').onclick=()=>mutate('',{category:$('gameCategory').value});$('gameLogin').onclick=login;$('gameJoinButton').onclick=()=>mutate('/'+token+'/join');$('gameForm').onsubmit=e=>{e.preventDefault();if(current?.status!=='playing'||current.ownWord||busy||!wordState())return;mutate('/'+token+'/guess',{round:current.round,word:$('gameWord').value});};$('gameEnd').onclick=()=>{if(confirm('结束这局猜词？之后不能继续提交，已揭晓的记录仍可查看。'))mutate('/'+token+'/close');};$('gameNew').onclick=()=>{clear();token=null;history.pushState(null,'','/play');load();};
 $('gameCopy').onclick=async()=>{const text='来和我玩「同频猜词」：各写一个词，同时揭晓，直到我们想到一样的。\n'+$('gameInviteURL').value;try{await navigator.clipboard.writeText(text);$('gameCopyStatus').textContent='邀请已复制，发给你想一起玩的朋友吧。';}catch{$('gameInviteURL').focus();$('gameInviteURL').select();$('gameCopyStatus').textContent='链接已选中，可以手动复制。';}};
 $('gameCopyResult').onclick=async()=>{if(!current||current.status!=='matched')return;const text='我和 @'+(current.myRole==='host'?current.guest:current.host)+' 在随手记第'+current.round+'轮想到了同一个词：「'+current.history.at(-1).hostWord+'」。\n一起来玩同频猜词：'+location.origin+'/play';try{await navigator.clipboard.writeText(text);$('gameResultStatus').textContent='同频结果已复制，由你选择朋友分享。';}catch{$('gameResultStatus').textContent=text;}};
 $('gamePublishResult').onclick=()=>{if(!current||current.status!=='matched'||!SJAuth.user)return;const word=current.history.at(-1)?.hostWord;if(!word)return;try{sessionStorage.setItem('sj-game-share-draft',JSON.stringify({userId:SJAuth.user.id,at:Date.now(),title:'第'+current.round+'轮，我们同频了！',text:'我和朋友在第'+current.round+'轮想到了同一个词：「'+word+'」。你会第几轮同频？\n一起来玩：'+location.origin+'/play',section:'game',gameTag:'word'}));location.assign('/plaza?section=game&tag=word&compose=1');}catch{$('gameError').textContent='暂时无法打开分享草稿，可以先复制同频结果。';}};
 document.addEventListener('sj:logout',()=>{try{sessionStorage.removeItem('sj-game-share-draft');}catch{}clear();});document.addEventListener('sj:auth-change',()=>{const id=SJAuth.user?.id;if(lastUser!==id){lastUser=id;clear();load();}});document.addEventListener('visibilitychange',()=>{if(document.hidden)readController?.abort();else if(!busy)load();});window.addEventListener('offline',()=>{readController?.abort();if(token)sync('offline');});window.addEventListener('online',()=>{if(!busy)load();});window.addEventListener('pagehide',()=>readController?.abort());window.addEventListener('popstate',()=>{clear();token=location.pathname.match(/^\/play\/([a-f0-9]{32})\/?$/)?.[1]||null;load();});setInterval(()=>{if(token&&SJAuth.user&&!document.hidden&&!busy)load();},2500);SJAuth.ready.then(()=>{lastUser=SJAuth.user?.id;load();});
})();
