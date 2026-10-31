(() => {
  'use strict';
  const $=id=>document.getElementById(id),local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  const themes={mood:'心情',daily:'日常',scene:'风景',food:'美食',vent:'吐槽',secret:'树洞',game:'游戏',campus:'校园',life:'生活',music:'音乐',travel:'旅行',tech:'科技'};
  const titles={users:['ACCOUNT MANAGEMENT','账号管理'],overview:['SITE OVERVIEW','数据概览'],posts:['POST MANAGEMENT','帖子管理'],comments:['COMMENT MANAGEMENT','评论管理'],topics:['DAILY TOPICS','每日话题']};
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
    loadTraffic();loadSpaceModeration();loadInvitations();loadSocialMetrics();
    const actions={login:'登录管理端',logout:'退出管理端',archive:'移入回收站',restore:'恢复内容',topic_set:'设置每日话题',topic_auto:'恢复自动话题'};
    $('auditList').replaceChildren(...(data.audit.length?data.audit.map(a=>{const row=node('div','audit-row');row.append(node('span','',(actions[a.action]||a.action)+(a.target==='session'?'':' · '+a.target)),node('time','',fmt(a.created_at)));return row;}):[node('p','empty-state','还没有管理操作')]));
  }
  async function loadSpaceDanmaku(){try{const data=await api('space-danmaku');$('spaceDanmakuModeration').replaceChildren(...(data.items.length?data.items.map(p=>{const row=node('div','account-record');row.append(node('strong','','@'+p.username+' → @'+p.space_owner+' 的空间 · '+(p.hidden?'已下架':p.contextHidden?'随原留言隐藏':'展示中')),node('p','',p.text));const b=node('button','text-button',p.hidden?'恢复':'下架');b.onclick=async()=>{b.disabled=true;try{await api('space-danmaku/'+p.id+'/'+(p.hidden?'restore':'archive'),{method:'POST',body:{}});loadSpaceDanmaku();}catch(e){toast(e.message);}finally{b.disabled=false;}};row.append(b);return row;}):[node('p','empty-state','还没有空间弹幕留言')]));}catch(e){$('spaceDanmakuModeration').textContent='空间弹幕暂时无法加载';}}
  async function loadSpaceModeration(){loadSpaceDanmaku();try{const data=await api('space-updates');$('spaceModeration').replaceChildren(...(data.items.length?data.items.map(p=>{const row=node('div','account-record');row.append(node('strong','','@'+p.username+' · '+(p.hidden?'已下架':'展示中')),node('p','',p.text));const b=node('button','text-button',p.hidden?'恢复':'下架');b.onclick=async()=>{b.disabled=true;try{await api('space-updates/'+p.id+'/'+(p.hidden?'restore':'archive'),{method:'POST',body:{}});loadSpaceModeration();}catch(e){toast(e.message);}finally{b.disabled=false;}};row.append(b);return row;}):[node('p','empty-state','还没有空间动态')]));}catch(e){$('spaceModeration').textContent='空间动态暂时无法加载';}}
  async function loadSocialMetrics(){try{const d=await api('social-metrics'),r=d.retention;$('socialCollectionStart').textContent='开始记录：'+fmt(d.startedAt);$('socialActive').textContent=d.today.users;$('socialActions').textContent=d.today.actions;$('socialPairs').textContent=d.mutualPairs;$('socialRetention').textContent=r.rate===null?'待观察':(r.rate*100).toFixed(1)+'%';$('socialRetentionSample').textContent=r.returned+' / '+r.eligible+' 个完整样本 · '+r.pending+' 个待观察';$('socialMetricsError').textContent=r.eligible?'样本较少时，百分比波动较大，请结合人数判断。':'目前没有完整第7日观察样本，暂不计算留存率。';}catch(e){$('socialMetricsError').textContent='复访统计暂时无法加载：'+e.message;}}
  async function loadInvitations(){try{const data=await api('invitations'),n=data.totals;for(const [field,id]of [['visitors','inviteVisitors'],['registrations','inviteRegistrations'],['mutual','inviteMutual'],['notes','inviteNotes']])$(id).textContent=n[field];const labels={direct:'普通邀请 / 未标记',xiaohongshu:'小红书',qq:'QQ',wechat:'微信',campus:'校园小圈子',other:'其他'},variants={default:'普通',a:'文案 A',b:'文案 B'};$('inviteGroups').replaceChildren(...(data.groups.length?data.groups.map(g=>{const row=node('tr');for(const text of [labels[g.channel]||'其他',variants[g.variant]||'普通',g.visitors,g.registrations,g.mutual,g.notes,g.visitors?(g.notes/g.visitors*100).toFixed(1)+'%':'暂无分母'])row.append(node('td','',text));return row;}):[(()=>{const row=node('tr'),cell=node('td','','还没有渠道记录');cell.colSpan=7;row.append(cell);return row;})()]));const pct=(a,b)=>b?(a/b*100).toFixed(1)+'%':'暂无分母';$('inviteRegistrationRate').textContent='到访→注册：'+pct(n.registrations,n.visitors);$('inviteMutualRate').textContent='注册→互关：'+pct(n.mutual,n.registrations);$('inviteNoteRate').textContent='互关→留弹：'+pct(n.notes,n.mutual);$('inviteDays').replaceChildren(...data.days.slice(-7).map(d=>{const row=node('tr');for(const k of ['day','visitors','registrations','mutual','notes'])row.append(node('td','',d[k]));return row;}));$('inviteAnalyticsError').textContent=n.visitors?'':'还没有邀请到访记录。可以从我的空间复制邀请，发给愿意一起试用的朋友。';}catch(e){$('inviteAnalyticsError').textContent='邀请统计暂时无法加载：'+e.message;}}
  let campaignRevision=0;function invalidateCampaign(){campaignRevision++;$('campaignURL').value='';$('campaignCopy').disabled=true;$('campaignStatus').textContent='';}for(const id of ['campaignHost','campaignChannel','campaignVariant'])$(id).addEventListener('input',invalidateCampaign);
  $('campaignForm').onsubmit=async event=>{event.preventDefault();invalidateCampaign();const current=campaignRevision,button=event.submitter;button.disabled=true;const name=$('campaignHost').value.trim().toLowerCase();try{if(!/^[a-z0-9_]{3,20}$/.test(name))throw Error('请填写有效用户名');const r=await fetch('/api/spaces/'+encodeURIComponent(name),{cache:'no-store'});if(!r.ok)throw Error('没有找到可用空间，请检查用户名');if(current!==campaignRevision)return;const url=new URL('/u/'+name,location.origin);url.search=new URLSearchParams({from:'invite',source:$('campaignChannel').value,variant:$('campaignVariant').value}).toString();$('campaignURL').value=url.href;$('campaignCopy').disabled=false;$('campaignStatus').textContent='链接已生成。对方注册后，请及时回应关注。';}catch(e){if(current===campaignRevision)$('campaignStatus').textContent=e.message;}finally{button.disabled=false;}};
  $('campaignCopy').onclick=async()=>{const text=$('campaignURL').value;if(!text)return;try{await navigator.clipboard.writeText(text);$('campaignStatus').textContent='推广邀请已复制';}catch{$('campaignURL').focus();$('campaignURL').select();$('campaignStatus').textContent='链接已选中，可以手动复制';}};
  async function loadTraffic(){
    try{const data=await api('analytics');$('trafficError').textContent='';for(const [key,id]of [['views','trafficViews'],['visitors','trafficVisitors'],['shares','trafficShares'],['cards','trafficCards']])$(id).textContent=data.today[key];
    $('trafficDays').replaceChildren(...data.days.map(d=>{const row=node('tr');for(const key of ['day','views','visitors','shares','cards'])row.append(node('td','',d[key]));return row;}));
    $('trafficTop').replaceChildren(...(data.top.length?data.top.map(p=>{const a=node('a','traffic-post',p.text.split('\n')[0].slice(0,65)+' · '+p.views+' 次阅读');a.href='/post/'+p.id;a.target='_blank';a.rel='noopener';return a;}):[node('p','empty-state','还没有访问记录，分享一条帖子邀请朋友来看看吧。')]));
    }catch(e){$('trafficError').textContent='访问统计暂时无法加载：'+e.message;}
  }
  function contentItem(post){
    const item=node('article','content-item');if(view==='posts')item.append(mediaElement(post));
    const copy=node('div','content-copy'),meta=node('div','content-meta');meta.append(node('span','tiny-tag',view==='posts'?(themes[post.theme]||'分享'):'评论'),node('span','',post.name||'匿名小伙伴'),node('time','',fmt(post.created_at)),node('span','','#'+post.id));
    if(post.archived)meta.append(node('span','archived-label','回收站'));
    if(post.parent_id)meta.append(node('span','tiny-tag','回复评论 #'+post.parent_id));
    copy.append(meta,node('div','content-text',post.text));if(post.post_id)copy.append(node('p','post-reference','所属帖子 #'+post.post_id+'：'+post.post_text));
    const actions=node('div','content-actions'),open=node('button','text-button','查看详情');open.onclick=()=>details(post);
    const action=node('button',post.archived?'restore-button':'danger-button',post.archived?'恢复展示':'移入回收站');
    action.onclick=async()=>{
      const restore=!!post.archived;
      if(!await confirmAction(restore?'恢复这条内容？':'移入回收站？',restore?'恢复后，该内容会重新在前台显示。':'内容将从前台隐藏，图片文件保留。你可以在回收站中恢复。'))return;
      action.disabled=true;
      try{await api(view+'/'+post.id+'/'+(restore?'restore':'archive'),{method:'POST',body:{}});toast(restore?'已恢复展示':'已移入回收站');await load();}catch(e){showError(e.message);}finally{action.disabled=false;}
    };
    if(post.user_id){const account=node('button','text-button','账号 #'+post.user_id);account.onclick=()=>traceUser(post.user_id);actions.append(account);}else actions.append(node('span','muted','历史匿名记录'));actions.append(open,action);item.append(copy,actions);return item;
  }
  async function loadContent(id){
    const params=new URLSearchParams({page:String(page),limit:'20',state:$('stateFilter').value,q:$('searchInput').value.trim()});if(view==='posts'&&$('themeFilter').value)params.set('theme',$('themeFilter').value);
    const data=await api(view+'?'+params);if(id!==requestId)return;
    totalPages=Math.max(1,Math.ceil(data.total/data.limit));if(page>totalPages){page=totalPages;return load();}
    $('contentList').replaceChildren(...(data.items.length?data.items.map(contentItem):[node('div','empty-state',$('stateFilter').value==='archived'?'回收站是空的':'没有找到符合条件的内容')]));
    $('listTotal').textContent='共 '+data.total+' 条';$('pageIndicator').textContent=page+' / '+totalPages;$('prevPage').disabled=page<=1;$('nextPage').disabled=page>=totalPages;
  }
  async function traceUser(id){
    try{
      const data=await api('users/'+id),u=data.user;
      $('detailTitle').textContent='账号 '+u.username+' · #'+u.id;
      $('detailMeta').textContent=(u.disabled?'已封禁':'正常')+' · 注册于 '+fmt(u.created_at);
      $('detailText').textContent='注册 IP：'+u.registration_ip+'。以下记录仅供站主管理。内容归属为站内账号，不代表已核验真实身份。';
      const wrap=$('detailMedia');wrap.replaceChildren();
      for(const [title,rows,format] of [
        ['最近帖子（最多50条）',data.posts,p=>'#'+p.id+' · '+fmt(p.created_at)+' · '+p.text],
        ['最近评论（最多50条）',data.comments,p=>'#'+p.id+' / 帖子 #'+p.post_id+' · '+fmt(p.created_at)+' · '+p.text],
        ['近30天登录记录（最多30条）',data.access,p=>fmt(p.created_at)+' · '+(p.event==='register'?'注册':'登录')+' · '+p.ip]
      ]){wrap.append(node('h3','',title));for(const row of rows)wrap.append(node('p','account-record',format(row)));if(!rows.length)wrap.append(node('p','muted','暂无记录'));}
      $('postDialog').showModal();
    }catch(e){showError(e.message);}
  }
  async function loadUsers(id){
    const data=await api('users?'+new URLSearchParams({page:String(page),limit:'20',q:$('userSearch').value.trim()}));if(id!==requestId)return;
    totalPages=Math.max(1,Math.ceil(data.total/data.limit));$('userTotal').textContent='共 '+data.total+' 个账号';$('userPage').textContent=page+' / '+totalPages;$('userPrev').disabled=page<=1;$('userNext').disabled=page>=totalPages;
    $('userList').replaceChildren(...(data.items.length?data.items.map(u=>{
      const row=node('article','content-item'),copy=node('div','content-copy');
      copy.append(node('strong','',u.username+' · #'+u.id+(u.disabled?' · 已封禁':'')),node('p','muted','帖子 '+u.posts+' / 评论 '+u.comments+' · 最近登录 '+fmt(u.last_login)));
      const actions=node('div','content-actions'),detail=node('button','text-button','查看关联记录'),ban=node('button',u.disabled?'restore-button':'danger-button',u.disabled?'解除封禁':'封禁账号');detail.onclick=()=>traceUser(u.id);
      ban.onclick=async()=>{if(!await confirmAction(u.disabled?'解除封禁？':'封禁这个账号？',u.disabled?'账号将可以重新登录和发布。':'会立即注销该账号的全部会话，并阻止登录和发布。已有内容保留，可另行移入回收站。'))return;ban.disabled=true;try{await api('users/'+u.id+'/'+(u.disabled?'unban':'ban'),{method:'POST',body:{}});await load();}catch(e){showError(e.message);}finally{ban.disabled=false;}};
      actions.append(detail,ban);row.append(copy,actions);return row;
    }):[node('p','empty-state','还没有符合条件的注册账号')]));
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
  async function load(){const id=++requestId;$('pageError').classList.add('hidden');$('refreshButton').disabled=true;try{if(view==='overview')await loadOverview(id);else if(view==='users')await loadUsers(id);else if(view==='topics')await loadTopics(id);else await loadContent(id);}catch(e){if(id===requestId)showError(e.message);}finally{if(id===requestId)$('refreshButton').disabled=false;}}
  function navigate(next){if(!titles[next])return;view=next;page=1;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===next));$('pageEyebrow').textContent=titles[next][0];$('pageTitle').textContent=titles[next][1];$('overviewView').classList.toggle('hidden',next!=='overview');$('contentView').classList.toggle('hidden',!['posts','comments'].includes(next));$('topicsView').classList.toggle('hidden',next!=='topics');$('usersView').classList.toggle('hidden',next!=='users');$('themeFilter').classList.toggle('hidden',next!=='posts');$('listTitle').textContent=next==='comments'?'评论列表':'帖子列表';$('searchInput').value='';$('stateFilter').value='visible';$('themeFilter').value='';load();}
  function enter(data){csrf=data.csrf;$('accountName').textContent=data.username;$('loginView').classList.add('hidden');$('appView').classList.remove('hidden');$('previewBadge').classList.toggle('hidden',!local);$('password').value='';navigate('overview');}
  function updateChars(){$('topicCharCount').textContent=$('topicInput').value.length+' / 80';}
  for(const [value,label] of Object.entries(themes)){const option=node('option','',label);option.value=value;$('themeFilter').append(option);}
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>navigate(b.dataset.view));document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>navigate(b.dataset.goto));
  $('userFilterForm').onsubmit=e=>{e.preventDefault();page=1;load();};$('userPrev').onclick=()=>{if(page>1){page--;load();}};$('userNext').onclick=()=>{if(page<totalPages){page++;load();}};
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
