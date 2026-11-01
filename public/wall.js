/* Each moving item is a real post entry. Repeated items loop the same post. */
(() => {
  const area=document.getElementById('danmakuArea');
  const bg=document.getElementById('danmakuBg');
  const status=document.getElementById('wallStatus');
  const toggle=document.getElementById('toggleDanmaku');
  // Remove only the legacy player's initial items when taking over playback.
  area.querySelectorAll('.danmaku-item').forEach(e=>e.remove());
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const icons={mood:'☀',daily:'☕',scene:'❋',food:'◒',vent:'⚡',secret:'☾',game:'✦',campus:'✎',life:'❀',music:'♫',travel:'➚',tech:'⌘'};
  let pool=[],lanes=[],cursor=0,last=0,raf=0,resizeTimer;
  let previousWidth=0,restored=false;
  const progressKey='sj-wall-progress-v2';
  function saveProgress(){if(!pool.length)return;try{sessionStorage.setItem(progressKey,JSON.stringify({at:Date.now(),ids:pool.map(p=>p.id).join(','),nextId:pool[cursor%pool.length]?.id,width:area.clientWidth,lanes:lanes.map(l=>l.items.slice(0,5).map(e=>({id:Number(e.element.dataset.postId),x:e.x})))}));}catch{}}
  function shuffle(posts){const result=[...posts];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
  function restoreProgress(){if(restored)return null;restored=true;try{const s=JSON.parse(sessionStorage.getItem(progressKey));if(s&&Number.isFinite(s.at)&&Date.now()-s.at>=0&&Date.now()-s.at<86400000&&typeof s.ids==='string'&&Number.isFinite(s.width)&&s.width>0&&Array.isArray(s.lanes)&&s.lanes.length<=7&&s.lanes.every(row=>Array.isArray(row)&&row.length<=5&&row.every(e=>e&&Number.isSafeInteger(e.id)&&Number.isFinite(e.x)&&Math.abs(e.x)<10000))){const byId=new Map(pool.map(p=>[p.id,p])),order=s.ids.split(',').map(Number);if(order.length!==pool.length||new Set(order).size!==pool.length||order.some(id=>!byId.has(id)))return null;pool=order.map(id=>byId.get(id));const next=pool.findIndex(p=>p.id===s.nextId);if(next>=0)cursor=next;return s;}}catch{}return null;}
  let backgroundImages=[],backgroundIndex=0;
  function changeBackground(){
    bg.style.backgroundImage=backgroundImages.length?`url("/uploads/${encodeURIComponent(backgroundImages[backgroundIndex++%backgroundImages.length].media)}")`:'url("/assets/lake.jpg")';
    bg.classList.add('show');
  }
  function configureBackground(){
    if(bgInterval){clearInterval(bgInterval);bgInterval=null;}
    if(document.documentElement.dataset.backgroundRotation==='true'&&backgroundImages.length>1){
      bgInterval=setInterval(()=>{if(!document.hidden&&!document.querySelector('#appearanceDialog[open]'))changeBackground();},12000);
    }
  }
  document.addEventListener('sj:appearance-change',configureBackground);
  let manualPaused=reduce.matches;
  const stopped=()=>manualPaused||document.hidden;
  const updateControl=()=>{
    toggle.textContent=manualPaused?'▶ 播放弹幕':'Ⅱ 暂停弹幕';
    toggle.setAttribute('aria-pressed',String(manualPaused));
    area.classList.toggle('is-paused',stopped());
  };
  function nextPost(){return pool[cursor++%pool.length];}
  function item(post,lane,x){
    const theme=THEMES[post.theme]||THEMES.mood;
    const button=document.createElement('a');
    button.href='/post/'+post.id;button.className='danmaku-item wall-post';
    button.dataset.postId=String(post.id);
    button.setAttribute('aria-label',`打开${post.name||'匿名小伙伴'}的帖子：${post.text}`);
    button.style.setProperty('--post-color',theme.color);
    const avatar=document.createElement('span');avatar.className='wall-avatar';avatar.textContent=icons[post.theme]||'✦';avatar.setAttribute('aria-hidden','true');
    if(post.media&&post.media_type==='image'){
      const image=document.createElement('img');image.alt='';image.src='/uploads/'+encodeURIComponent(post.media);image.loading='lazy';avatar.replaceChildren(image);
    }
    const copy=document.createElement('span');copy.className='wall-copy';
    const meta=document.createElement('span');meta.className='wall-meta';meta.textContent=(post.name||'匿名小伙伴')+' · '+theme.label;
    const text=document.createElement('span');text.className='wall-text';text.textContent=post.text;
    copy.append(meta,text);
    const arrow=document.createElement('span');arrow.className='wall-arrow';arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');
    button.append(avatar,copy,arrow);button.style.top=lane.y+'px';
    area.appendChild(button);
    const obj={element:button,x,width:button.getBoundingClientRect().width,hovered:false,focused:false};
    button.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')obj.hovered=true;});
    button.addEventListener('pointerleave',()=>{obj.hovered=false;});
    button.addEventListener('focus',()=>{obj.focused=true;});
    button.addEventListener('blur',()=>{obj.focused=false;});
    button.style.transform=`translate3d(${x}px,0,0)`;
    return obj;
  }
  function layout(){
    if(!pool.length){for(const l of lanes)for(const e of l.items)e.element.remove();lanes=[];status.textContent='这里还很安静，写一条，让你的心情飘过屏幕。';return;}
    const w=area.clientWidth,h=area.clientHeight,mobile=w<=760;
    const reading=mobile&&document.body.classList.contains('has-open-post');
    const top=reading?126:mobile?176:182,bottom=reading?(document.getElementById('postReader')?.getBoundingClientRect().height||0)+16:mobile?105:100;
    const usable=Math.max(44,h-top-bottom);
    const count=Math.max(1,Math.min(pool.length,mobile?6:7,Math.floor(usable/(mobile?68:76))));
    const spacing=usable/count;
    const saved=restoreProgress();
    if(previousWidth&&previousWidth!==w)for(const lane of lanes)for(const entry of lane.items)entry.x*=w/previousWidth;
    previousWidth=w;
    for(let row=0;row<count;row++){
      const lane=lanes[row]||{items:[]};
      Object.assign(lane,{y:top+row*spacing+(spacing-(mobile?44:46))/2,speed:(mobile?25:32)+(row%4)*4,gap:mobile?56:90,active:true});
      lanes[row]=lane;
      if(!lane.items.length&&saved){for(const entry of (saved.lanes[row]||[]).slice(0,5)){const post=pool.find(p=>p.id===entry.id);if(post&&Number.isFinite(entry.x)&&Math.abs(entry.x)<10000)lane.items.push(item(post,lane,entry.x*w/saved.width));}}
      let x=12+(row%3)*(mobile?38:75);
      const allowance=Math.min(mobile?3:5,Math.max(1,Math.ceil(pool.length/count)));
      if(!lane.items.length)while(x<w+100&&lane.items.length<allowance){const entry=item(nextPost(),lane,x);lane.items.push(entry);x+=entry.width+lane.gap;}
      for(const entry of lane.items){entry.element.style.display='';entry.element.style.top=lane.y+'px';entry.element.style.transform=`translate3d(${entry.x}px,0,0)`;}
    }
    for(const lane of lanes.slice(count)){lane.active=false;for(const entry of lane.items)entry.element.style.display='none';}
    status.textContent=pool.length+' 条分享正在循环播放';updateControl();
  }
  function frame(now){
    const dt=last?Math.min((now-last)/1000,.06):0;last=now;
    if(!stopped()){
      for(const lane of lanes){
        if(!lane.active)continue;
        for(const entry of lane.items){
          if(!entry.hovered&&!entry.focused)entry.x-=lane.speed*dt;
          entry.element.style.transform=`translate3d(${entry.x}px,0,0)`;
        }
        const expired=lane.items.filter(entry=>entry.x+entry.width<-40&&!entry.hovered&&!entry.focused);
        for(const entry of expired){
          entry.element.remove();lane.items.splice(lane.items.indexOf(entry),1);
          const tail=Math.max(area.clientWidth,...lane.items.map(e=>e.x+e.width+lane.gap));
          lane.items.push(item(nextPost(),lane,tail));
        }
      }
    }
    raf=requestAnimationFrame(frame);
  }
  function setPosts(posts){
    const nextId=pool[cursor%pool.length]?.id;
    const incoming=new Map(posts.map(p=>[p.id,p]));
    const retained=pool.filter(p=>incoming.has(p.id)).map(p=>incoming.get(p.id));
    const known=new Set(retained.map(p=>p.id));
    pool=[...retained,...shuffle([...incoming.values()].filter(p=>!known.has(p.id)))];
    cursor=Math.max(0,pool.findIndex(p=>p.id===nextId));
    const byId=new Map(pool.map(p=>[p.id,p]));
    for(const lane of lanes){lane.items=lane.items.filter(entry=>{if(byId.has(Number(entry.element.dataset.postId)))return true;entry.element.remove();return false;});}
    layout();
    backgroundImages=pool.filter(p=>p.media_type==='image'&&p.media);
    if(!bg.dataset.initialized){changeBackground();bg.dataset.initialized='true';}
    configureBackground();
  }
  if(danmakuInterval){clearInterval(danmakuInterval);danmakuInterval=null;}
  startDanmakuLoop=setPosts;
  startBgSlideshow=()=>{};
  spawnDanmaku=post=>{
    if(!pool.some(p=>p.id===post.id))pool.push(post);
    if(!lanes.length){layout();return;}
    const playing=lanes.filter(l=>l.active),lane=playing[cursor%playing.length];
    if(!lane)return;
    const tail=lane.items.at(-1);
    lane.items.push(item(post,lane,Math.max(area.clientWidth,tail?tail.x+tail.width+lane.gap:0)));
    status.textContent=pool.length+' 条分享正在循环播放';
  };
  toggle.addEventListener('click',()=>{manualPaused=!manualPaused;updateControl();});
  document.getElementById('wallPost').addEventListener('click',()=>document.getElementById('btnOpenPost').click());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)saveProgress();last=0;updateControl();});
  window.addEventListener('pagehide',saveProgress);
  setInterval(saveProgress,5000);
  document.addEventListener('sj:reading-change',layout);
  new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(layout,120);}).observe(area);
  if(allPosts.length)setPosts(allPosts);
  updateControl();raf=requestAnimationFrame(frame);
})();
