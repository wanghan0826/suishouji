/* Each moving item is a real post entry. Repeated items loop the same post. */
(() => {
  const area=document.getElementById('danmakuArea');
  const bg=document.getElementById('danmakuBg');
  const status=document.getElementById('wallStatus');
  const toggle=document.getElementById('toggleDanmaku');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const icons={mood:'☀',daily:'☕',scene:'❋',food:'◒',vent:'⚡',secret:'☾',game:'✦',campus:'✎',life:'❀',music:'♫',travel:'➚',tech:'⌘'};
  let pool=[],lanes=[],cursor=0,last=0,raf=0,resizeTimer;
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
    const button=document.createElement('button');
    button.type='button';button.className='danmaku-item wall-post';
    button.dataset.postId=String(post.id);
    button.setAttribute('aria-haspopup','dialog');
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
    button.addEventListener('click',()=>{obj.hovered=false;obj.focused=false;showDetail(post);});
    button.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')obj.hovered=true;});
    button.addEventListener('pointerleave',()=>{obj.hovered=false;});
    button.addEventListener('focus',()=>{obj.focused=true;});
    button.addEventListener('blur',()=>{obj.focused=false;});
    button.style.transform=`translate3d(${x}px,0,0)`;
    return obj;
  }
  function layout(){
    area.querySelectorAll('.danmaku-item').forEach(e=>e.remove());lanes=[];
    if(!pool.length){status.textContent='这里还很安静，写一条，让你的心情飘过屏幕。';return;}
    const w=area.clientWidth,h=area.clientHeight,mobile=w<650;
    const top=mobile?176:182,bottom=mobile?105:100;
    const usable=Math.max(180,h-top-bottom);
    const count=Math.max(1,Math.min(pool.length,mobile?3:4,Math.floor(usable/(mobile?110:125))));
    const spacing=usable/count;
    for(let row=0;row<count;row++){
      const lane={y:top+row*spacing+(spacing-57)/2,speed:(mobile?25:32)+(row%4)*4,gap:mobile?140:230,items:[]};
      let x=35+(row%2)*120;
      const allowance=Math.min(mobile?2:3,Math.floor(pool.length/count)+(row<pool.length%count?1:0));
      while(x<w+150&&lane.items.length<allowance){const entry=item(nextPost(),lane,x);lane.items.push(entry);x+=entry.width+lane.gap;}
      lanes.push(lane);
    }
    status.textContent=pool.length+' 条分享正在循环播放';updateControl();
  }
  function frame(now){
    const dt=last?Math.min((now-last)/1000,.06):0;last=now;
    if(!stopped()){
      for(const lane of lanes){
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
    pool=[...new Map(posts.map(p=>[p.id,p])).values()];cursor=0;layout();
    backgroundImages=pool.filter(p=>p.media_type==='image'&&p.media);
    if(!bg.dataset.initialized){changeBackground();bg.dataset.initialized='true';}
    configureBackground();
  }
  if(danmakuInterval){clearInterval(danmakuInterval);danmakuInterval=null;}
  startDanmakuLoop=setPosts;
  startBgSlideshow=()=>{};
  spawnDanmaku=post=>{
    if(!pool.some(p=>p.id===post.id))pool.unshift(post);
    if(!lanes.length){layout();return;}
    const lane=lanes[cursor++%lanes.length],tail=lane.items.at(-1);
    lane.items.push(item(post,lane,Math.max(area.clientWidth,tail?tail.x+tail.width+lane.gap:0)));
    status.textContent=pool.length+' 条分享正在循环播放';
  };
  toggle.addEventListener('click',()=>{manualPaused=!manualPaused;updateControl();});
  document.getElementById('wallPost').addEventListener('click',()=>document.getElementById('btnOpenPost').click());
  document.addEventListener('visibilitychange',()=>{last=0;updateControl();});
  new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(layout,120);}).observe(area);
  if(allPosts.length)setPosts(allPosts);
  updateControl();raf=requestAnimationFrame(frame);
})();
