(() => {
  'use strict';
  const $=id=>document.getElementById(id),local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  const themes={mood:'心情',daily:'日常',scene:'风景',food:'美食',vent:'吐槽',secret:'树洞',game:'游戏',campus:'校园',life:'生活',music:'音乐',travel:'旅行',tech:'科技'};
  const titles={overview:['SITE OVERVIEW','数据概览'],posts:['POST MANAGEMENT','帖子管理'],comments:['COMMENT MANAGEMENT','评论管理'],topics:['DAILY TOPICS','每日话题']};
  let csrf='',view='overview',page=1,totalPages=1,requestId=0,toastTimer;
  const fmt=value=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
  const node=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=String(text);return e;};
  const toast=text=>{clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3000);};
  function showLogin(){csrf='';$('appView').classList.add('hidden');$('loginView').classList.remove('hidden');$('password').value='';}
  async function api(route,{method='GET',body}={}){
    const response=await fetch('/api/admin/'+route,{method,credentials:'same-origin',cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    let data;try{data=await response.json();}catch{throw Error('服务器暂时没有返回有效内容，请稍后重试');}
    if(!response.ok){if(response.status===401&&route!=='login')showLogin();throw Error(data.error||'操作失败，请稍后重试');}return data;
  }
  function mediaElement(post,className='content-media'){
    if(post.media&&/^[A-Za-z0-9._-]+$/.test(post.media)&&post.media_type==='image'){const image=node('img',className);image.src='/uploads/'+encodeURIComponent(post.media);image.alt='帖子配图';image.loading='lazy';return image;}
    return node('span',className,post.media_type==='video'?'▷':'✎');
  }
  function details(post){
    $('detailMeta').textContent=(post.name||'匿名小伙伴')+' · '+(themes[post.theme]||'评论')+' · '+fmt(post.created_at);
    $('detailTitle').textContent=post.post_id?'评论详情':'分享详情';$('detailText').textContent=post.text;$('detailMedia').replaceChildren();
    if(post.media&&/^[A-Za-z0-9._-]+$/.test(post.media)){
      const e=node(post.media_type==='video'?'video':'img');e.src='/uploads/'+encodeURIComponent(post.media);if(e.tagName==='VIDEO')e.controls=true;else e.alt='帖子配图';$('detailMedia').append(e);
    }
    $('postDialog').showModal();$('postDialog').scrollTop=0;
  }
  function confirmAction(title,text){
    $('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirmDialog').showModal();
    return new Promise(resolve=>{let done=false;const finish=value=>{if(done)return;done=true;$('confirmDialog').close();$('confirmDialog').removeEventListener('cancel',cancel);resolve(value);};const cancel=e=>{e.preventDefault();finish(false);};$('cancelConfirm').onclick=()=>finish(false);$('acceptConfirm').onclick=()=>finish(true);$('confirmDialog').addEventListener('cancel',cancel);});
  }
  function recentItem(post){const item=node('div','recent-item');item.append(mediaElement(post,'recent-media'));const copy=node('div','recent-copy');copy.append(node('p','',post.text.split(/[\r\n]/)[0]),node('small','',(post.name||'匿名小伙伴')+' · '+(themes[post.theme]||'分享')+' · '+fmt(post.created_at)));const button=node('button','text-button','查看 →');button.onclick=()=>details(post);item.append(copy,button);return item;}
  async function loadOverview(id){
    const data=await api('overview');if(id!==requestId)return;
    for(const [key,stat] of [['statPosts','posts'],['statComments','comments'],['statImages','images'],['statToday','todayPosts']])$(key).textContent=data[stat];
    $('todayDate').textContent=data.topic.date;$('todayTopic').textContent=data.topic.topic;$('archiveCount').textContent='回收站：'+data.archived+' 项';
    $('recentPosts').replaceChildren(...(data.recent.length?data.recent.map(recentItem):[node('p','empty-state','还没有分享')]));
    const actions={login:'登录管理端',logout:'退出管理端',archive:'移入回收站',restore:'恢复内容',topic_set:'设置每日话题',topic_auto:'恢复自动话题'};
    $('auditList').replaceChildren(...(data.audit.length?data.audit.map(a=>{const row=node('div','audit-row');row.append(node('span','',(actions[a.action]||a.action)+(a.target==='session'?'':' · '+a.target)),node('time','',fmt(a.created_at)));return row;}):[node('p','empty-state','还没有管理操作')]));
  }
  function contentItem(post){
    const item=node('article','content-item');if(view==='posts')item.append(mediaElement(post));
    const copy=node('div','content-copy'),meta=node('div','content-meta');meta.append(node('span','tiny-tag',view==='posts'?(themes[post.theme]||'分享'):'评论'),node('span','',post.name||'匿名小伙伴'),node('time','',fmt(post.created_at)),node('span','','#'+post.id));
    if(post.archived)meta.append(node('span','archived-label','回收站'));
    copy.append(meta,node('div','content-text',post.text));if(post.post_id)copy.append(node('p','post-reference','所属帖子 #'+post.post_id+'：'+post.post_text));
    const actions=node('div','content-actions'),open=node('button','text-button','查看详情');open.onclick=()=>details(post);
    const action=node('button',post.archived?'restore-button':'danger-button',post.archived?'恢复展示':'移入回收站');
    action.onclick=async()=>{
      const restore=!!post.archived;
      if(!await confirmAction(restore?'恢复这条内容？':'移入回收站？',restore?'恢复后，该内容会重新在前台显示。':'内容将从前台隐藏，图片文件保留。你可以在回收站中恢复。'))return;
      action.disabled=true;
      try{await api(view+'/'+post.id+'/'+(restore?'restore':'archive'),{method:'POST',body:{}});toast(restore?'已恢复展示':'已移入回收站');await load();}catch(e){showError(e.message);}finally{action.disabled=false;}
    };
    actions.append(open,action);item.append(copy,actions);return item;
  }
  async function loadContent(id){
    const params=new URLSearchParams({page:String(page),limit:'20',state:$('stateFilter').value,q:$('searchInput').value.trim()});if(view==='posts'&&$('themeFilter').value)params.set('theme',$('themeFilter').value);
    const data=await api(view+'?'+params);if(id!==requestId)return;
    totalPages=Math.max(1,Math.ceil(data.total/data.limit));if(page>totalPages){page=totalPages;return load();}
    $('contentList').replaceChildren(...(data.items.length?data.items.map(contentItem):[node('div','empty-state',$('stateFilter').value==='archived'?'回收站是空的':'没有找到符合条件的内容')]));
    $('listTotal').textContent='共 '+data.total+' 条';$('pageIndicator').textContent=page+' / '+totalPages;$('prevPage').disabled=page<=1;$('nextPage').disabled=page>=totalPages;
  }
  async function loadTopics(id){
    const data=await api('topics');if(id!==requestId)return;
    $('topicDate').min=data.today;if(!$('topicDate').value||$('topicDate').value<data.today)$('topicDate').value=data.today;
    $('automaticTopic').textContent=data.automatic;
    $('scheduledTopics').replaceChildren(...(data.items.length?data.items.map(t=>{
      const row=node('div','topic-row');row.append(node('time','',t.date),node('p','',t.topic));const edit=node('button','text-button','编辑'),reset=node('button','secondary','恢复自动');
      edit.onclick=()=>{$('topicDate').value=t.date;$('topicInput').value=t.topic;updateChars();$('topicInput').focus();};
      reset.onclick=async()=>{if(!await confirmAction('恢复自动轮换？',t.date+' 将不再使用手动话题，改为系统话题库自动轮换。'))return;reset.disabled=true;try{await api('topics/'+t.date,{method:'DELETE',body:{}});toast('已恢复自动轮换');await load();}catch(e){showError(e.message);}finally{reset.disabled=false;}};
      row.append(edit,reset);return row;
    }):[node('div','empty-state','暂未安排手动话题，系统正在自动轮换')]));
  }
  function showError(message){$('pageError').textContent=message;$('pageError').classList.remove('hidden');}
  async function load(){const id=++requestId;$('pageError').classList.add('hidden');$('refreshButton').disabled=true;try{if(view==='overview')await loadOverview(id);else if(view==='topics')await loadTopics(id);else await loadContent(id);}catch(e){if(id===requestId)showError(e.message);}finally{if(id===requestId)$('refreshButton').disabled=false;}}
  function navigate(next){if(!titles[next])return;view=next;page=1;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===next));$('pageEyebrow').textContent=titles[next][0];$('pageTitle').textContent=titles[next][1];$('overviewView').classList.toggle('hidden',next!=='overview');$('contentView').classList.toggle('hidden',!['posts','comments'].includes(next));$('topicsView').classList.toggle('hidden',next!=='topics');$('themeFilter').classList.toggle('hidden',next!=='posts');$('listTitle').textContent=next==='comments'?'评论列表':'帖子列表';$('searchInput').value='';$('stateFilter').value='visible';$('themeFilter').value='';load();}
  function enter(data){csrf=data.csrf;$('accountName').textContent=data.username;$('loginView').classList.add('hidden');$('appView').classList.remove('hidden');$('previewBadge').classList.toggle('hidden',!local);$('password').value='';navigate('overview');}
  function updateChars(){$('topicCharCount').textContent=$('topicInput').value.length+' / 80';}
  for(const [value,label] of Object.entries(themes)){const option=node('option','',label);option.value=value;$('themeFilter').append(option);}
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>navigate(b.dataset.view));document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>navigate(b.dataset.goto));
  $('refreshButton').onclick=load;$('postDialog').querySelector('.dialog-close').onclick=()=>$('postDialog').close();
  $('filterForm').onsubmit=e=>{e.preventDefault();page=1;load();};$('resetFilter').onclick=()=>{$('searchInput').value='';$('stateFilter').value='visible';$('themeFilter').value='';page=1;load();};
  $('prevPage').onclick=()=>{if(page>1){page--;load();}};$('nextPage').onclick=()=>{if(page<totalPages){page++;load();}};
  $('loginForm').onsubmit=async e=>{e.preventDefault();$('loginError').textContent='';if(location.protocol!=='https:'&&!local){$('loginError').textContent='请先切换到HTTPS后再登录';return;}$('loginButton').disabled=true;try{enter(await api('login',{method:'POST',body:{username:$('username').value.trim(),password:$('password').value}}));}catch(e){$('loginError').textContent=e.message;$('password').value='';}finally{$('loginButton').disabled=false;}};
  $('logoutButton').onclick=async()=>{try{await api('logout',{method:'POST',body:{}});showLogin();toast('已退出登录');}catch(e){showError(e.message);}};
  $('topicInput').oninput=updateChars;$('topicForm').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{await api('topics/'+$('topicDate').value,{method:'PUT',body:{topic:$('topicInput').value.trim()}});toast('话题已保存');$('topicInput').value='';updateChars();await load();}catch(e){showError(e.message);}finally{button.disabled=false;}};
  async function init(){
    if(location.protocol!=='https:'&&!local){$('connectionNotice').classList.remove('hidden');$('connectionNotice').append(document.createTextNode('管理登录需要加密连接。'),Object.assign(document.createElement('a'),{href:'https://'+location.host+'/admin',textContent:'切换到HTTPS →'}));$('loginButton').disabled=true;$('password').disabled=true;return;}
    try{const data=await api('status');if(data.authenticated)enter(data);else if(!data.configured){$('connectionNotice').textContent='管理账户尚未启用，请由站主完成首次账户设置。';$('connectionNotice').classList.remove('hidden');$('loginButton').disabled=true;$('password').disabled=true;}}catch(e){$('loginError').textContent=e.message;}
  }
  init();
})();
