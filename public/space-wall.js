(() => {
 const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 window.SJSpaceWall={create({api,onDenied,onChanged}){
  let profile=null,items=[],filter='all',generation=0,poll=null,tick=null,paused=false,expanded=false,cursor=0,signature='',selected=null;
  const active=new Map(),motion=matchMedia('(prefers-reduced-motion: reduce)'),board=$('spaceWallBoard');
  const filtered=()=>items.filter(x=>filter==='all'||x.kind===filter);
  function clearBullets(){for(const {animation}of active.values())animation?.cancel();active.clear();board.replaceChildren();}
  function setExpanded(value){expanded=value;$('spaceWall').classList.toggle('is-expanded',value);document.body.classList.toggle('space-wall-open',value);$('spaceWallExpand').textContent=value?'收起弹幕':'展开弹幕';$('spaceWallExpand').setAttribute('aria-expanded',String(value));render();}
  function stop(){generation++;profile=null;items=[];signature='';clearInterval(poll);clearInterval(tick);poll=tick=null;clearBullets();$('spaceWall').hidden=true;setExpanded(false);if($('spaceBulletDialog').open)$('spaceBulletDialog').close();$('spaceBulletText').textContent='';$('spaceWallText').value='';}
  function open(item){selected=item;for(const [key,value]of active)value.detail=key===item.kind+item.id;$('spaceBulletTitle').textContent=item.kind==='update'?'主人的空间动态':'朋友留下的弹幕';$('spaceBulletText').textContent=item.text;$('spaceBulletAuthor').textContent='@'+item.username;$('spaceBulletAuthor').href='/u/'+encodeURIComponent(item.username);$('spaceBulletTime').textContent=new Date(item.created_at).toLocaleString('zh-CN');$('spaceBulletHide').hidden=!item.canHide;$('spaceBulletHide').textContent=item.kind==='update'?'下架这条动态':profile.isOwner?'移除这条留言':'撤回我的留言';$('spaceBulletError').textContent='';$('spaceBulletDialog').showModal();playback();}
  function bullet(item){const b=make('button',undefined,'space-bullet');b.type='button';b.dataset.kind=item.kind;b.append(make('span',item.kind==='update'?'主人动态':'好友留弹','space-bullet-kind'),make('span',item.text.replace(/\s+/g,' ').slice(0,34)+(item.text.length>34?'…':''),'space-bullet-excerpt'),make('small','@'+item.username));b.setAttribute('aria-label',(item.kind==='update'?'主人动态':'好友留言')+'，'+item.username+'：'+item.text);b.onclick=()=>open(item);return b;}
  function playback(){for(const value of active.values()){if(paused||document.hidden||value.hover||value.focus||value.detail)value.animation?.pause();else value.animation?.play();}$('spaceWallPause').textContent=paused?'继续播放':'暂停播放';$('spaceWallPause').setAttribute('aria-pressed',String(paused));}
  function fill(initial=false){if(!profile||motion.matches||(paused&&!initial)||document.hidden)return;const list=filtered();if(!list.length)return;const rows=Math.min(list.length,expanded?Math.min(12,Math.max(1,Math.floor(board.clientHeight/50))):innerWidth<=760?5:6),rowHeight=expanded?(board.clientHeight-40)/rows:44,top=expanded?20:Math.max(12,(board.clientHeight-rows*rowHeight)/2),speed=innerWidth<=760?37:48;
   for(let row=0;row<rows;row++){
    if([...active.values()].some(v=>v.row===row))continue;let item;
    for(let n=0;n<list.length;n++){const candidate=list[cursor++%list.length];if(!active.has(candidate.kind+candidate.id)){item=candidate;break;}}
    if(!item)continue;const key=item.kind+item.id,b=bullet(item);b.style.top=(top+row*rowHeight)+'px';board.append(b);const width=b.offsetWidth,distance=board.clientWidth+width+24,duration=distance/speed*1000;
    const animation=b.animate([{transform:'translateX('+(board.clientWidth+12)+'px)'},{transform:'translateX('+(-width-12)+'px)'}],{duration,easing:'linear',fill:'both'}),value={animation,row,hover:false,focus:false};active.set(key,value);
    if(initial)animation.currentTime=duration*(.12+(row%5)*.12);
    const state=(type,valueState)=>{if(!active.has(key))return;value[type]=valueState;playback();};b.onpointerenter=e=>{if(e.pointerType==='mouse')state('hover',true);};b.onpointerleave=()=>state('hover',false);b.onfocus=()=>state('focus',true);b.onblur=()=>state('focus',false);
    animation.finished.then(()=>{if(active.get(key)!==value)return;active.delete(key);b.remove();fill();}).catch(()=>{});
   }playback();
  }
  function render(){clearBullets();if(!profile)return;const list=filtered();board.dataset.static=String(motion.matches);$('spaceWallEmpty').hidden=!!list.length;$('spaceWallEmpty').textContent=filter==='message'?'还没有好友留弹，留一句话打个招呼吧。':filter==='update'?'主人还没有发布动态。':'这里的每一条弹幕，都来自这个空间。留下第一句吧。';$('spaceWallCount').textContent=items.length?'最近 '+items.length+' 条 · 点击弹幕看全文':'空间里的小小回声';$('spaceWallPause').hidden=motion.matches;
   if(motion.matches){board.append(...list.slice(0,60).map(bullet));}else fill(true);
  }
  async function reload(){const current=generation;if(!profile)return;try{const data=await api('/danmaku');if(current!==generation||!profile)return;const next=JSON.stringify(data.items);items=data.items;if(signature!==next){signature=next;render();}$('spaceWallStatus').textContent='';}catch(e){if(current!==generation)return;$('spaceWallStatus').textContent=e.message;if([401,403,404].includes(e.status)){stop();onDenied();}}}
  async function start(nextProfile){stop();const current=generation;profile=nextProfile;$('spaceWall').hidden=false;$('spaceWallCompose').hidden=!window.SJAuth.user;$('spaceWallLogin').hidden=!!window.SJAuth.user;render();await reload();if(!profile||current!==generation)return;poll=setInterval(()=>{if(!document.hidden)reload();},30000);tick=setInterval(()=>fill(),1000);}
  document.querySelectorAll('[data-space-wall-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.spaceWallFilter;document.querySelectorAll('[data-space-wall-filter]').forEach(c=>c.setAttribute('aria-pressed',String(b===c)));render();});
  $('spaceWallPause').onclick=()=>{paused=!paused;playback();fill();};$('spaceWallExpand').onclick=()=>setExpanded(!expanded);$('spaceWallLogin').onclick=()=>SJAuth.open();
  $('spaceWallCompose').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;$('spaceWallStatus').textContent='';try{await api('/danmaku',{text:$('spaceWallText').value});$('spaceWallText').value='';if(filter==='update')document.querySelector('[data-space-wall-filter="all"]').click();await reload();$('spaceWallStatus').textContent='弹幕已留在这个空间。';}catch(error){$('spaceWallStatus').textContent=error.message;if([401,403].includes(error.status)){stop();onDenied();}}finally{b.disabled=false;}};
  $('spaceBulletClose').onclick=()=>$('spaceBulletDialog').close();$('spaceBulletDialog').addEventListener('close',()=>{selected=null;for(const value of active.values())value.detail=false;playback();});
  $('spaceBulletHide').onclick=async()=>{const b=$('spaceBulletHide'),item=selected;if(!item)return;b.disabled=true;try{await api('/'+(item.kind==='update'?'updates':'danmaku')+'/'+item.id,{});$('spaceBulletDialog').close();await reload();onChanged();}catch(e){$('spaceBulletError').textContent=e.message;}finally{b.disabled=false;}};
  $('spaceBulletReply').onclick=()=>{$('spaceBulletDialog').close();if(!SJAuth.user){SJAuth.open();return;}$('spaceWallText').focus();};
  document.addEventListener('visibilitychange',()=>{playback();if(!document.hidden)reload();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&expanded&&!$('spaceBulletDialog').open)setExpanded(false);});
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,150);});motion.addEventListener('change',render);
  return {start,reset:stop,reload};
 }};
})();
