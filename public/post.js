(() => {
 const $=id=>document.getElementById(id),routeId=()=>location.pathname.match(/^\/post\/(\d+)\/?$/)?.[1];
 const categories={mood:'心情',daily:'日常',scene:'风景',food:'美食',vent:'吐槽',secret:'树洞',game:'游戏',campus:'校园',life:'生活',music:'音乐',travel:'旅行',tech:'科技'};
 let post,toastTimer,replyTo=null,id=null,loadVersion=0;
 const announce=()=>document.dispatchEvent(new Event('sj:reading-change'));
 function stopMedia(){for(const video of $('postMedia').querySelectorAll('video'))video.pause();}
 function closeReader(update=true){
  loadVersion++;stopMedia();id=null;post=null;$('postReader').hidden=true;document.body.classList.remove('has-open-post','reader-expanded');$('readerExpand').textContent='展开阅读';$('readerExpand').setAttribute('aria-expanded','false');
  window.SJTrack?.('view','/');document.title='随手记 · 满屏都是你的心情';if(update)history.pushState(null,'','/');announce();
 }
 const date=ts=>new Date(ts).toLocaleString('zh-CN',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
 function notify(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3000);}
 async function request(route,body){
  const options={credentials:'same-origin',cache:'no-store'};
  if(body!==undefined){await window.SJAuth.ready;if(!window.SJAuth.user){window.SJAuth.open();throw Error('请先登录，再继续操作');}Object.assign(options,{method:'POST',headers:{'Content-Type':'application/json','X-SJ-CSRF':window.SJAuth.csrf},body:JSON.stringify(body)});}
  const response=await fetch(route,options),data=await response.json();
  if(!response.ok){if(response.status===401)window.SJAuth.open();const error=Error(data.error||'暂时无法完成操作');error.status=response.status;throw error;}return data;
 }
 // Create links as DOM nodes, keeping user text out of HTML and URL attributes.
 function richText(element,text){
  for(const line of text.split('\n')){
   const p=document.createElement('p');let start=0;
   for(const match of line.matchAll(/https?:\/\/[^\s<>"'，。；）】]+/g)){
    p.append(document.createTextNode(line.slice(start,match.index)));
    const a=document.createElement('a');a.href=match[0];a.textContent=match[0];a.target='_blank';a.rel='noopener noreferrer';p.append(a);start=match.index+match[0].length;
   }
   p.append(document.createTextNode(line.slice(start)));element.append(p);
  }
 }
 function setReply(comment){
  replyTo=comment;$('commentReplyBanner').hidden=!comment;
  $('commentReplyLabel').textContent=comment?'正在回复 @'+(comment.name||'匿名小伙伴'):'';
  $('commentTextLabel').textContent=comment?'你的回复':'你的评论';
  $('postCommentSubmit').textContent=comment?'发表回复 →':'发表评论 →';
  $('postCommentText').placeholder=comment?'回复 @'+(comment.name||'匿名小伙伴')+'…':'友善交流，说说你的想法…';
 }
 async function chooseReply(comment){
  await window.SJAuth.ready;setReply(comment);
  if(!window.SJAuth.user){window.SJAuth.open();return;}
  $('postCommentText').focus({preventScroll:true});$('postCommentForm').scrollIntoView({block:'center',behavior:'instant'});
 }
 function commentElement(c){
  const item=document.createElement('article');item.className='post-comment';item.id='comment-'+c.id;
  const meta=document.createElement('div');meta.className='post-comment-meta';
  const name=document.createElement(/^[a-z0-9_]{3,20}$/i.test(c.name)?'a':'strong');name.textContent=c.name||'匿名小伙伴';if(name.tagName==='A')name.href='/u/'+encodeURIComponent(c.name);
  const time=document.createElement('time');time.dateTime=new Date(c.created_at).toISOString();time.textContent=date(c.created_at);meta.append(name,time);
  const text=document.createElement('p');text.textContent=c.text;item.append(meta);
  if(c.parent_id){const target=document.createElement(c.reply_to_name?'a':'span');target.className='comment-reply-target';target.textContent=c.reply_to_name?'回复 @'+c.reply_to_name:'回复的评论已下架';if(c.reply_to_name)target.href='#comment-'+c.parent_id;item.append(target);}
  const button=document.createElement('button');button.type='button';button.className='comment-reply-button';button.textContent='回复';button.setAttribute('aria-label','回复 @'+(c.name||'匿名小伙伴')+' 的评论');button.addEventListener('click',()=>chooseReply(c));item.append(text,button);return item;
 }
 async function comments(){
  const list=$('postComments');list.textContent='评论加载中…';
  const requested=id;
  try{
   const data=await request('/api/posts/'+requested+'/comments');if(requested!==id)return;list.replaceChildren();$('postCommentCount').textContent=data.comments.length?'('+data.comments.length+')':'';
   if(!data.comments.length){list.textContent='还没有评论，来聊聊吧。';list.className='comment-empty';return;}
   list.className='';
   const threads=new Map();
   for(const c of data.comments.filter(c=>!c.thread_id)){
    const thread=document.createElement('div');thread.className='comment-thread';thread.append(commentElement(c));const replies=document.createElement('div');replies.className='comment-replies';thread.append(replies);threads.set(c.id,replies);list.append(thread);
   }
   for(const c of data.comments.filter(c=>c.thread_id)){const parent=threads.get(c.thread_id);if(parent)parent.append(commentElement(c));}
  }catch(error){if(requested===id)list.textContent=error.status===404?'帖子已下架，无法查看评论。':'评论暂时无法加载，请刷新重试。';}
 }
 async function load(nextId,update=true){
  if(!/^\d+$/.test(String(nextId)))return;
  if(id===String(nextId)&&!$('postReader').hidden)return;
  const version=++loadVersion;stopMedia();id=String(nextId);post=null;
  $('postMedia').replaceChildren();$('postBody').replaceChildren();$('postComments').replaceChildren();$('postArticle').hidden=true;$('postState').hidden=false;$('postState').textContent='正在展开这条弹幕…';$('postTopic').hidden=true;$('postShareFallback').hidden=true;$('postCommentText').value='';setReply(null);
  $('postReader').hidden=false;document.body.classList.add('has-open-post');document.body.classList.remove('reader-expanded');$('readerExpand').textContent='展开阅读';$('readerExpand').setAttribute('aria-expanded','false');
  if(update)history.pushState({sjPost:id},'','/post/'+id);window.scrollTo({top:0,behavior:'instant'});$('postContent').scrollTop=0;announce();
  try{
   const data=await request('/api/posts/'+id);if(version!==loadVersion)return;post=data.post;window.SJTrack?.('view','/post/'+id);
   const discussion=post.text.startsWith('【讨论｜');$('readerOrigin').hidden=discussion;$('readerBackToPlaza').hidden=!discussion;
   const lines=post.text.split('\n'),heading=lines.length>1&&lines[0].length<=90;
   const title=heading?lines.shift().replace(/^【|】$/g,''):(post.name||'小伙伴')+'的分享';
   document.title=title+' · 随手记';document.querySelector('meta[name="description"]').content=post.text.slice(0,150);
   $('postTitle').textContent=title;$('postTheme').textContent=categories[post.theme]||'分享';$('postTheme').style.background='var(--accent)';$('postAuthor').textContent=post.name||'匿名小伙伴';$('postAuthor').href='/u/'+encodeURIComponent(post.name);$('postDate').textContent=date(post.created_at);$('postDate').dateTime=new Date(post.created_at).toISOString();$('postHearts').textContent=post.hearts;
   richText($('postBody'),heading?lines.join('\n'):post.text);
   if(post.topic){$('postTopic').hidden=false;$('postTopic').textContent='参与话题 · '+post.topic;}
   if(post.media){
    const src='/uploads/'+encodeURIComponent(post.media);
    if(post.media_type==='image'){
     const figure=document.createElement('figure'),link=document.createElement('a'),image=document.createElement('img'),caption=document.createElement('figcaption');link.href=src;link.target='_blank';link.rel='noopener';link.setAttribute('aria-label','查看帖子原图');image.src=src;image.alt=title+' · 帖子配图';caption.textContent='点击图片查看原图';link.append(image);figure.append(link,caption);$('postMedia').append(figure);
    }else if(post.media_type==='video'){
     const video=document.createElement('video');video.src=src;video.controls=true;video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');video.preload='metadata';video.setAttribute('aria-label','帖子视频');
     const toggle=document.createElement('button');toggle.type='button';toggle.className='reader-video-toggle';toggle.textContent='播放视频';
     toggle.addEventListener('click',async()=>{try{if(video.paused)await video.play();else video.pause();}catch{notify('视频暂时无法播放，请重试或检查视频格式。');}});
     video.addEventListener('play',()=>{toggle.textContent='暂停视频';});video.addEventListener('pause',()=>{toggle.textContent='播放视频';});$('postMedia').append(video,toggle);
    }
   }
   $('postState').hidden=true;$('postArticle').hidden=false;
   let canonical=document.querySelector('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical);}canonical.href=location.origin+'/post/'+id;
   comments();
  }catch(error){if(version!==loadVersion)return;$('postState').textContent=error.status===404?'这条分享不存在或已下架，收起后看看其他弹幕吧。':'帖子暂时无法加载，请刷新重试。';document.title=error.status===404?'帖子不存在 · 随手记':'帖子加载失败 · 随手记';}
 }
 $('postHeart').addEventListener('click',async()=>{const button=$('postHeart'),target=id;button.disabled=true;try{const data=await request('/api/posts/'+target+'/heart',{});if(id!==target)return;$('postHearts').textContent=data.hearts;button.classList.add('liked');notify('谢谢你的喜欢');}catch(error){notify(error.message);}finally{button.disabled=false;}});
 $('postCommentForm').addEventListener('submit',async event=>{
  event.preventDefault();const text=$('postCommentText').value.trim();if(!text||!post)return;const button=$('postCommentSubmit'),target=id;button.disabled=true;
  try{const replying=!!replyTo;await request('/api/posts/'+target+'/comments',{text,parent_id:replyTo?.id??null});if(id!==target)return;$('postCommentText').value='';setReply(null);await comments();notify(replying?'回复已发布':'评论已发布');}catch(error){notify(error.message);}finally{button.disabled=false;}
 });
 $('commentReplyCancel').addEventListener('click',()=>{setReply(null);$('postCommentText').focus();});
 async function copyLink(){
  const url=location.origin+'/post/'+id;
  try{await navigator.clipboard.writeText(url);notify('帖子链接已复制，可以分享给朋友了');return true;}catch{$('shareDialog').close();$('postShareFallback').hidden=false;$('postShareUrl').value=url;$('postShareUrl').focus();$('postShareUrl').select();notify('长按或复制下方帖子链接');return false;}
 }
 const shareData=()=>({title:document.title,text:post.text.replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').slice(0,100),url:location.origin+'/post/'+id});
 $('postShare').addEventListener('click',()=>{
  if(!post)return;window.SJTrack?.('share','/post/'+id);const data=shareData(),image=location.origin+(post.media&&post.media_type==='image'?'/uploads/'+encodeURIComponent(post.media):'/assets/lake.jpg');
  $('sharePostTitle').textContent=data.title;$('shareDescription').textContent=data.text;$('shareImage').src=image;
  $('shareQQ').href='https://connect.qq.com/widget/shareqq/index.html?'+new URLSearchParams({url:data.url,title:data.title,summary:data.text,pics:image,site:'随手记'});
  $('shareNative').hidden=typeof navigator.share!=='function';$('shareGuide').textContent='选择分享方式，由你选择朋友并确认发送。';$('shareDialog').showModal();
 });
 $('shareCard').addEventListener('click',()=>{if(post)window.SJCard.open(post,$('postTitle').textContent);});
 $('shareClose').addEventListener('click',()=>$('shareDialog').close());
 $('shareCopy').addEventListener('click',copyLink);
 $('shareWechat').addEventListener('click',async()=>{const copied=await copyLink();$('shareGuide').textContent=/MicroMessenger/i.test(navigator.userAgent)?'在微信右上角点击「···」→「发送给朋友」或「分享到朋友圈」。':copied?'链接已复制。打开微信，粘贴给好友；也可先在微信中打开，再用右上角「···」转发。':'请复制帖子链接，打开微信粘贴给好友。';});
 $('shareNative').addEventListener('click',async()=>{try{await navigator.share(shareData());}catch(error){if(error.name!=='AbortError')$('shareGuide').textContent='当前浏览器暂时无法系统分享，请选择 QQ 或复制链接。';}});
 window.SJOpenPost=load;
 document.addEventListener('click',event=>{
  const homeLink=event.target.closest('.brand,.main-nav a');
  if(homeLink&&(homeLink.hash||new URL(homeLink.href,location.href).pathname==='/')&&document.body.classList.contains('has-open-post')&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();const target=homeLink.hash;closeReader();if(target)document.querySelector(target)?.scrollIntoView();return;}
  const link=event.target.closest('a.wall-post,a.card-link');if(!link||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.target==='_blank')return;
  const url=new URL(link.href),match=url.pathname.match(/^\/post\/(\d+)$/);if(url.origin!==location.origin||!match)return;event.preventDefault();load(match[1]);
 });
 document.querySelectorAll('[data-reader-close]').forEach(button=>button.addEventListener('click',()=>closeReader()));
 $('readerExpand').addEventListener('click',()=>{const expanded=document.body.classList.toggle('reader-expanded');$('readerExpand').setAttribute('aria-expanded',String(expanded));$('readerExpand').textContent=expanded?'收起阅读':'展开阅读';announce();});
 window.addEventListener('popstate',()=>{const next=routeId();if(next)load(next,false);else closeReader(false);});
 window.addEventListener('pagehide',stopMedia);
 if(routeId())load(routeId(),false);
})();

