(() => {
 const $=id=>document.getElementById(id),route=location.pathname.match(/^\/u\/([a-zA-Z0-9_]+)\/?$/),name=route?route[1].toLowerCase():'me',base='/api/spaces/'+name;
 let profile,tab='updates',page=1,pages=1,version=0,checkingEntry=false;const labels={public:'公开空间',followers:'仅粉丝可见',mutual:'仅互关可见'};
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e;};
 async function api(path='',body){const opts={credentials:'same-origin',cache:'no-store'};if(body!==undefined){await SJAuth.ready;Object.assign(opts,{method:'POST',headers:{'Content-Type':'application/json','X-SJ-CSRF':SJAuth.csrf},body:JSON.stringify(body)});}const r=await fetch(base+path,opts),data=await r.json();if(!r.ok){const error=Error(data.error||'暂时无法完成操作');error.status=r.status;throw error;}return data;}
 const wall=SJSpaceWall.create({api,onDenied:()=>refresh(),onChanged:()=>load()});
 function renderEntry(){
  const signedIn=!!SJAuth.user,waiting=signedIn&&profile.following&&profile.visibility==='mutual',steps=[['登录账号',signedIn],['关注 @'+profile.username,profile.following],...(profile.visibility==='mutual'?[['等待对方回关',profile.mutual]]:[])];
  $('spaceGateSteps').replaceChildren(...steps.map(([text,done],i)=>{const li=node('li',(done?'✓ ':String(i+1)+' · ')+text);li.dataset.complete=String(done);return li;}));
  $('spaceGateTitle').textContent=waiting?'已关注，等对方回关':profile.followedBy&&signedIn?'回关后，就能一起留弹':'先认识，再进这个小空间';
  $('spaceGateText').textContent=waiting?'对方回关后，这个页面会在检查时打开空间。进入后，就能查看动态和互相留弹。':profile.visibility==='mutual'?'这是仅互关可见的空间。双方关注后，才能查看动态和互相留弹。':'这是仅粉丝可见的空间。关注主人后，就能查看动态和留下弹幕。';
  $('spaceGateLogin').hidden=waiting;$('spaceGateLogin').textContent=!signedIn?'登录 / 注册后继续':profile.followedBy?'回关 @'+profile.username+' 并进入':'关注 @'+profile.username;
  $('spaceGateCheck').hidden=!waiting;$('spaceGateCheck').disabled=checkingEntry;
  $('spaceGateStatus').textContent=waiting?'页面打开且可见时，每30秒检查一次；也可以手动检查。':'';
 }
 async function checkEntry(manual=false){
  if(checkingEntry||!profile||profile.canAccess||!SJAuth.user||!profile.following||document.hidden)return;
  checkingEntry=true;const current=version,userId=SJAuth.user.id;$('spaceGateCheck').disabled=true;if(manual)$('spaceGateStatus').textContent='正在检查空间权限…';
  try{const next=await api();if(current!==version||SJAuth.user?.id!==userId)return;
   if(next.canAccess||next.visibility!==profile.visibility||next.following!==profile.following||next.followedBy!==profile.followedBy){await refresh();return;}
   if(manual)$('spaceGateStatus').textContent='还在等待对方回关。页面可见时会继续检查，无需重复关注。';
  }catch(e){if(current===version&&SJAuth.user?.id===userId)$('spaceGateStatus').textContent='暂时没能检查，请稍后点击“检查回关”。';}
  finally{checkingEntry=false;$('spaceGateCheck').disabled=false;}
 }
 async function changeFollow(){
  await SJAuth.ready;if(!profile)return;
  if(!SJAuth.user){const target=profile.username;SJAuth.open({purpose:'登录后回到这个空间，由你确认是否关注对方。',resume:async()=>{await refresh();if(profile?.username===target&&!profile.isOwner){const button=profile.canAccess?$('followSpace'):$('spaceGateLogin');if(!button.hidden)button.focus();}}});return;}
  const b=$('followSpace'),gate=$('spaceGateLogin'),userId=SJAuth.user.id;b.disabled=gate.disabled=true;
  try{await api(profile.following?'/unfollow':profile.followedBy?'/followback':'/follow',{});if(SJAuth.user?.id===userId)await refresh();}
  catch(e){if(SJAuth.user?.id===userId){$('spaceState').textContent=e.message;if(e.status===401){await SJAuth.refresh();await refresh();}else if(e.status===409){await refresh();$('spaceGateStatus').textContent=e.message;}}}
  finally{b.disabled=gate.disabled=false;}
 }
 async function refresh(){wall.reset();profile=null;$('spaceList').replaceChildren();const current=++version;$('spaceState').textContent='正在打开空间…';$('spaceContent').hidden=true;$('spaceMain').hidden=true;$('spaceLogin').hidden=true;try{await SJAuth.ready;const nextProfile=await api();if(current!==version)return;profile=nextProfile;
  $('spaceTitle').textContent=profile.title;$('spaceUsername').textContent='@'+profile.username;$('spaceAvatar').textContent=profile.username.slice(0,1).toUpperCase();$('spaceBio').textContent=profile.bio|| (profile.canAccess?'欢迎来到我的小角落。':'');$('spaceVisibility').textContent=labels[profile.visibility];$('spaceHero').dataset.color=profile.color;document.title=profile.title+' · 随手记';
  $('spaceFollowers').textContent=profile.followers+' 粉丝';$('spaceFollowing').textContent=profile.followingCount+' 关注';$('spaceRelation').textContent=profile.mutual?'你们已互关':profile.followedBy?'对方关注了你':'';
  $('editSpace').hidden=!profile.isOwner;$('makeSpaceInvite').hidden=!profile.isOwner;$('inviteSpace').hidden=!profile.isOwner;$('spaceInviteGuide').hidden=!profile.isOwner||profile.visibility!=='mutual';$('spaceCompose').hidden=!profile.isOwner;$('followSpace').hidden=profile.isOwner;$('followSpace').textContent=profile.following?(profile.mutual?'已互关 · 取消关注':'已关注 · 取消关注'):(profile.followedBy?'回关':'＋ 关注');
  $('spaceMain').hidden=false;$('spaceGate').hidden=profile.canAccess;$('spaceTabs').hidden=!profile.canAccess;
  if(!profile.canAccess){$('spaceState').textContent='';renderEntry();return;}
  await wall.start(profile);if(current!==version)return;await load();
 }catch(e){if(current===version){$('spaceState').textContent=e.message;$('spaceMain').hidden=true;$('spaceLogin').hidden=e.status!==401;}}}
 async function load(){const current=++version;$('spaceState').textContent='正在加载…';$('spaceContent').hidden=true;$('spacePrev').disabled=true;$('spaceNext').disabled=true;try{const path=tab==='followers'||tab==='following'?'/members?type='+tab+'&page='+page:'/'+tab+'?page='+page,data=await api(path);if(current!==version)return;if(page>data.pages){page=data.pages;return load();}pages=data.pages;$('spaceList').replaceChildren(...data.items.map(item=>{
  if(item.username){const link=node('a','@'+item.username+' →','space-member');link.href='/u/'+encodeURIComponent(item.username);return link;}
  const article=node('article',undefined,'space-update'),time=node('time',new Date(item.created_at).toLocaleString('zh-CN')),text=node('p',item.text);article.append(time,text);if(tab==='public-posts'){const a=node('a','打开帖子 →');a.href='/post/'+item.id;article.append(a);}else if(profile.isOwner){const b=node('button','下架','text-button');b.onclick=async()=>{b.disabled=true;try{await api('/updates/'+item.id,{});await wall.reload();await load();}catch(e){$('spaceState').textContent=e.message;}finally{b.disabled=false;}};article.append(b);}return article;
 }));$('spaceState').textContent=data.total?'共 '+data.total+' 条记录':tab==='updates'?'这里还没有动态。':tab==='public-posts'?'还没有公开分享。':'还没有记录。';$('spacePublicNote').hidden=tab!=='public-posts';$('spaceContent').hidden=false;$('spacePage').textContent=page+' / '+pages;$('spacePrev').disabled=page<=1;$('spaceNext').disabled=page>=pages;
 }catch(e){if(current===version){$('spaceState').textContent=e.message;if([401,403].includes(e.status)){wall.reset();profile.canAccess=false;$('spaceCompose').hidden=true;$('spaceList').replaceChildren();}}}}
 document.querySelectorAll('[data-space-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.spaceTab;page=1;document.querySelectorAll('[data-space-tab]').forEach(c=>c.setAttribute('aria-pressed',String(c===b)));load();});
 $('spaceFollowers').onclick=()=>{if(profile?.canAccess)document.querySelector('[data-space-tab=followers]').click();};$('spaceFollowing').onclick=()=>{if(profile?.canAccess)document.querySelector('[data-space-tab=following]').click();};
 $('followSpace').onclick=changeFollow;
 $('editSpace').onclick=()=>{$('spaceEditTitle').value=profile.title;$('spaceEditBio').value=profile.bio;$('spaceEditVisibility').value=profile.visibility;$('spaceEditColor').value=profile.color;$('spaceEditError').textContent='';$('spaceEditDialog').showModal();};$('spaceEditClose').onclick=()=>$('spaceEditDialog').close();
 $('spaceEditForm').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{await api('/profile',{title:$('spaceEditTitle').value,bio:$('spaceEditBio').value,visibility:$('spaceEditVisibility').value,color:$('spaceEditColor').value});$('spaceEditDialog').close();await refresh();}catch(e){$('spaceEditError').textContent=e.message;}finally{button.disabled=false;}};
 $('spaceCompose').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{await api('/updates',{text:$('spaceText').value});$('spaceText').value='';await wall.reload();tab='updates';page=1;document.querySelector('[data-space-tab=updates]').click();}catch(e){$('spaceState').textContent=e.message;}finally{button.disabled=false;}};
 $('spacePrev').onclick=()=>{if(page>1){page--;load();}};$('spaceNext').onclick=()=>{if(page<pages){page++;load();}};$('spaceLogin').onclick=()=>SJAuth.open();$('spaceGateLogin').onclick=changeFollow;$('spaceGateCheck').onclick=()=>checkEntry(true);
 setInterval(()=>checkEntry(),30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkEntry();});
 $('makeSpaceInvite').onclick=()=>SJSpaceInvite.open();
 $('inviteSpace').onclick=async()=>{const text='来随手记找我：'+location.origin+'/u/'+profile.username+'?from=invite\n把日常变成弹幕，给朋友留一个会回应的小空间。'+(profile.visibility==='mutual'?'注册后先关注我，等我回关，我们就能一起留弹。':profile.visibility==='followers'?'注册并关注我，就能进入空间留言。':'我的空间公开可看，登录后可以给我留一句弹幕。');try{await navigator.clipboard.writeText(text);$('inviteSpaceStatus').textContent='邀请文案已复制，可以发给你想一起留弹的朋友。';}catch{$('inviteSpaceStatus').textContent=text;}};
 $('shareSpace').onclick=async()=>{const url=location.origin+'/u/'+profile.username;try{await navigator.clipboard.writeText(url);$('spaceState').textContent='空间链接已复制。朋友访问时仍需满足你的权限设置。';}catch{$('spaceState').textContent='空间链接：'+url;}};
 let lastAuthId=SJAuth.user?.id;document.addEventListener('sj:auth-change',()=>{if(lastAuthId!==SJAuth.user?.id){lastAuthId=SJAuth.user?.id;refresh();}});document.addEventListener('sj:relationships-change',refresh);$('accountDialog').addEventListener('close',refresh);refresh();
})();
