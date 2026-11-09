window.createMahjongVoiceChat=({getRoom,getContext,send})=>{
  const $=id=>document.getElementById(id),record=$('mjVoiceRecord'),auto=$('mjVoiceAuto'),status=$('mjChatStatus'),retry=$('mjVoiceRetry');
  let enabled=true,unlocked=false,lastId=null,queue=[],playing=null,loading=false,generation=0,playback=0,request=null,recording=null,upload=null,ducked=false;
  try{enabled=localStorage.getItem('sj-mahjong-chat-autoplay')!=='off';}catch{}
  const label=m=>Math.max(1,Math.ceil(m.duration/1000))+'秒语音';
  function autoUi(){auto.setAttribute('aria-pressed',String(enabled));auto.textContent=enabled?'自动播放：开':'自动播放：关';}
  function paint(id,active){for(const b of document.querySelectorAll('[data-voice-id="'+id+'"]')){b.classList.toggle('is-playing',active);b.setAttribute('aria-pressed',String(active));b.textContent=(active?'停止播放 · ':'播放 · ')+b.dataset.label;}}
  function stop(){playback++;loading=false;request?.abort();request=null;if(playing){const p=playing;playing=null;p.source.onended=null;try{p.source.stop();}catch{}p.source.disconnect();p.gain.disconnect();paint(p.message.id,false);}}
  async function play(message,manual=false){
    const room=getRoom();if(!room||document.hidden||recording||!manual&&(!enabled||!unlocked))return false;
    if(loading){if(!manual)return false;stop();}
    if(playing){if(!manual)return false;const same=playing.message.id===message.id;stop();if(same)return true;}
    const revision=generation,attempt=++playback,token=room.token,context=getContext();loading=true;
    if(!context){loading=false;status.textContent='此浏览器暂不支持语音播放。';return false;}
    if(context.state!=='running'){try{await context.resume();}catch{}if(context.state!=='running'){if(attempt===playback)loading=false;status.textContent='点一下牌桌，即可启用语音播放。';return false;}}
    if(attempt!==playback||revision!==generation)return true;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);request=controller;
    try{
      const r=await fetch(message.url,{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(!r.ok)throw Error('语音已失效或暂时无法播放。');
      const buffer=await context.decodeAudioData(await r.arrayBuffer());
      if(revision!==generation||attempt!==playback||getRoom()?.token!==token||controller.signal.aborted||document.hidden||recording||!manual&&!enabled)return true;
      const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=ducked ? .22 : 1;source.connect(gain);gain.connect(context.destination);
      const item={message,source,gain,manual};playing=item;paint(message.id,true);source.onended=()=>{source.disconnect();gain.disconnect();if(playing===item){playing=null;paint(message.id,false);drain();}};
      source.start(0,0,Math.min(buffer.duration,message.duration/1000+.15,30.15));status.textContent='';return true;
    }catch(e){if(revision===generation&&e.name!=='AbortError')status.textContent=e.message||'这条语音暂时无法播放，请点消息重试。';return true;}
    finally{clearTimeout(timeout);if(request===controller)request=null;if(revision===generation&&attempt===playback){loading=false;if(!playing)setTimeout(drain,0);}}
  }
  function drain(){
    if(playing||loading||recording||!enabled||!unlocked||document.hidden)return;
    queue=queue.filter(m=>Date.now()-m.queued<90000);const message=queue.shift();if(message)play(message).then(ok=>{if(!ok)queue.unshift(message);});
  }
  function unlock(){
    if(!getRoom()||document.hidden)return;const context=getContext();
    if(context){unlocked=true;if(context.state==='running')drain();else context.resume().then(drain).catch(()=>{});}
  }
  function sync(history){
    const newest=history.at(-1)?.id||0;if(lastId===null){lastId=newest;return;}if(newest<=lastId)return;
    const room=getRoom(),now=Date.now();if(!room)return;
    if(enabled&&!document.hidden){const fresh=history.filter(m=>m.id>lastId&&m.kind==='voice'&&m.seat!==room?.me&&room.serverNow-m.at<45000);queue.push(...fresh.map(m=>({...m,queued:now})));queue=queue.slice(-8);if(fresh.length&&!unlocked)status.textContent='收到新语音，点一下牌桌即可启用自动播放。';drain();}
    lastId=newest;
  }
  function message(m){const b=document.createElement('button');b.type='button';b.className='mj-voice-message';b.dataset.voiceId=m.id;b.dataset.label=label(m);b.setAttribute('aria-label',m.name+'，'+label(m)+'，点按播放');b.setAttribute('aria-pressed','false');b.textContent='播放 · '+label(m);b.onclick=()=>{unlock();queue=queue.filter(v=>v.id!==m.id);play(m,true);};return b;}
  function duck(active){ducked=active;if(playing){const context=getContext();playing.gain.gain.setTargetAtTime(active ? .22 : 1,context.currentTime,.035);}}
  const supported=!!(navigator.mediaDevices?.getUserMedia&&window.MediaRecorder);
  function recordUi(text='按住说话'){record.textContent=text;record.classList.toggle('is-recording',!!recording?.recorder&&recording.recorder.state==='recording');record.classList.toggle('is-cancel',!!recording?.cancel);record.setAttribute('aria-busy',String(!!recording));}
  function tracks(stream){for(const t of stream?.getTracks()||[])t.stop();}
  function finish(cancel=false){
    const current=recording;if(!current)return;current.released=true;current.cancel||=cancel;clearInterval(current.timer);
    if(current.recorder?.state==='recording')current.recorder.stop();
    else{tracks(current.stream);recording=null;recordUi();if(current.cancel)status.textContent='已取消录音。';}
  }
  async function uploadVoice(data){
    data.opId??=crypto.randomUUID().replaceAll('-','');const revision=generation;record.disabled=true;retry.hidden=true;status.textContent='正在发送语音…';
    try{const success=await send(data);if(revision!==generation)return;if(success){upload=null;status.textContent='语音已发送，同桌玩家将自动播放。';}else{upload=data;retry.hidden=false;}}
    catch(err){if(revision===generation){upload=data;retry.hidden=false;status.textContent=err.message||'语音发送失败，请点重发。';}}
    finally{if(revision===generation){record.disabled=!supported;drain();}}
  }
  async function begin(e){
    if(!supported||recording||record.disabled||!getRoom()||e.isPrimary===false)return;
    e.preventDefault();$('mjChatInput').blur();unlock();stop();const current={token:getRoom().token,revision:generation,released:false,cancel:false,x:e.clientX,y:e.clientY};recording=current;
    try{if(e.pointerId!==undefined)record.setPointerCapture(e.pointerId);}catch{}
    status.textContent='正在启用麦克风…';recordUi('准备录音…');
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});current.stream=stream;
      if(recording!==current||current.released||current.revision!==generation||getRoom()?.token!==current.token){tracks(stream);if(current.revision===generation&&!recording)status.textContent='麦克风已就绪，请再次按住说话。';return;}
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw Error('这个浏览器暂不支持发送语音。');
      const recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:64000}),chunks=[];current.recorder=recorder;current.start=performance.now();
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onerror=()=>{current.cancel=true;status.textContent='录音中断，请重新按住说话。';finish(true);};
      recorder.onstop=async()=>{
        tracks(stream);clearInterval(current.timer);if(recording===current)recording=null;recordUi();
        if(current.revision!==generation||getRoom()?.token!==current.token)return;
        if(current.cancel){status.textContent='已取消录音。';drain();return;}
        const duration=Math.min(30000,Math.round(performance.now()-current.start)),blob=new Blob(chunks,{type:recorder.mimeType});
        if(duration<500||!blob.size){status.textContent='说话时间太短，请按住至少半秒。';drain();return;}
        if(blob.size>512*1024){status.textContent='语音文件太大，请缩短后重试。';drain();return;}
        const audio=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
        if(current.revision===generation)uploadVoice({audio,mime:recorder.mimeType,duration});
      };
      recorder.start(200);status.textContent='松开发送，上滑取消。';recordUi('录音中 · 0秒');
      current.timer=setInterval(()=>{const seconds=Math.floor((performance.now()-current.start)/1000);recordUi(current.cancel?'松开取消':'录音中 · '+seconds+'秒');if(seconds>=30)finish();},100);
    }catch(err){tracks(current.stream);if(recording!==current)return;recording=null;recordUi();status.textContent=err.name==='NotAllowedError'?'麦克风未获授权，请在浏览器网站设置中允许麦克风后重试。':err.name==='NotFoundError'?'没有找到麦克风，请检查设备。':err.message||'无法开始录音，请重试。';}
  }
  record.onpointerdown=begin;record.onpointermove=e=>{if(!recording)return;const distance=window.SJLandscape?.isRotated()?e.clientX-recording.x:recording.y-e.clientY;recording.cancel=distance>45;recordUi(recording.cancel?'松开取消':'录音中');};
  record.onpointerup=e=>{e.preventDefault();finish();};record.onpointercancel=()=>finish(true);record.onlostpointercapture=()=>{if(recording&&!recording.released)finish(true);};record.oncontextmenu=e=>e.preventDefault();
  record.onkeydown=e=>{if([' ','Enter'].includes(e.key)&&!e.repeat)begin(e);if(e.key==='Escape')finish(true);};record.onkeyup=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();finish();}};
  auto.onclick=()=>{enabled=!enabled;try{localStorage.setItem('sj-mahjong-chat-autoplay',enabled?'on':'off');}catch{}autoUi();if(!enabled){queue=[];if(playing&&!playing.manual)stop();}else unlock();};
  retry.onclick=()=>{if(upload)uploadVoice(upload);};autoUi();record.disabled=!supported;record.title=supported?'按住说话，松开发送，上滑取消':'此浏览器暂不支持录音，可用新版浏览器打开';
  document.addEventListener('visibilitychange',()=>{if(document.hidden){finish(true);queue=[];stop();}});window.addEventListener('blur',()=>finish(true));
  function reset(){generation++;finish(true);stop();queue=[];lastId=null;loading=false;upload=null;retry.hidden=true;record.disabled=!supported;recordUi();}
  return {sync,message,unlock,duck,reset,cancelRecording:()=>finish(true)};
};
