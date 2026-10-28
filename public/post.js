(() => {
 const $=id=>document.getElementById(id),id=location.pathname.match(/^\/post\/(\d+)\/?$/)?.[1];
 const categories={mood:'心情',daily:'日常',scene:'风景',food:'美食',vent:'吐槽',secret:'树洞',game:'游戏',campus:'校园',life:'生活',music:'音乐',travel:'旅行',tech:'科技'};
 let post,toastTimer,replyTo=null;
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
  const name=document.createElement('strong');name.textContent=c.name||'匿名小伙伴';
  const time=document.createElement('time');time.dateTime=new Date(c.created_at).toISOString();time.textContent=date(c.created_at);meta.append(name,time);
  const text=document.createElement('p');text.textContent=c.text;item.append(meta);
  if(c.parent_id){const target=document.createElement(c.reply_to_name?'a':'span');target.className='comment-reply-target';target.textContent=c.reply_to_name?'回复 @'+c.reply_to_name:'回复的评论已下架';if(c.reply_to_name)target.href='#comment-'+c.parent_id;item.append(target);}
  const button=document.createElement('button');button.type='button';button.className='comment-reply-button';button.textContent='回复';button.setAttribute('aria-label','回复 @'+(c.name||'匿名小伙伴')+' 的评论');button.addEventListener('click',()=>chooseReply(c));item.append(text,button);return item;
 }
 async function comments(){
  const list=$('postComments');list.textContent='评论加载中…';
  try{
   const data=await request('/api/posts/'+id+'/comments');list.replaceChildren();$('postCommentCount').textContent=data.comments.length?'('+data.comments.length+')':'';
   if(!data.comments.length){list.textContent='还没有评论，来聊聊吧。';list.className='comment-empty';return;}
   list.className='';
   const threads=new Map();
   for(const c of data.comments.filter(c=>!c.thread_id)){
    const thread=document.createElement('div');thread.className='comment-thread';thread.append(commentElement(c));const replies=document.createElement('div');replies.className='comment-replies';thread.append(replies);threads.set(c.id,replies);list.append(thread);
   }
   for(const c of data.comments.filter(c=>c.thread_id)){const parent=threads.get(c.thread_id);if(parent)parent.append(commentElement(c));}
  }catch(error){list.textContent=error.status===404?'帖子已下架，无法查看评论。':'评论暂时无法加载，请刷新重试。';}
 }
 async function load(){
  try{
   if(!id)throw Object.assign(Error('帖子不存在或已下架'),{status:404});
   ({post}=await request('/api/posts/'+id));
   const lines=post.text.split('\n'),heading=lines.length>1&&lines[0].length<=90;
   const title=heading?lines.shift().replace(/^【|】$/g,''):(post.name||'小伙伴')+'的分享';
   document.title=title+' · 随手记';document.querySelector('meta[name="description"]').content=post.text.slice(0,150);
   $('postTitle').textContent=title;$('postTheme').textContent=categories[post.theme]||'分享';$('postTheme').style.background='var(--accent)';$('postAuthor').textContent=post.name||'匿名小伙伴';$('postDate').textContent=date(post.created_at);$('postDate').dateTime=new Date(post.created_at).toISOString();$('postHearts').textContent=post.hearts;
   richText($('postBody'),heading?lines.join('\n'):post.text);
   if(post.topic){$('postTopic').hidden=false;$('postTopic').textContent='参与话题 · '+post.topic;}
   if(post.media){
    const src='/uploads/'+encodeURIComponent(post.media);
    if(post.media_type==='image'){
     const figure=document.createElement('figure'),link=document.createElement('a'),image=document.createElement('img'),caption=document.createElement('figcaption');link.href=src;link.target='_blank';link.rel='noopener';link.setAttribute('aria-label','查看帖子原图');image.src=src;image.alt=title+' · 帖子配图';caption.textContent='点击图片查看原图';link.append(image);figure.append(link,caption);$('postMedia').append(figure);
    }else if(post.media_type==='video'){const video=document.createElement('video');video.src=src;video.controls=true;video.preload='metadata';video.setAttribute('aria-label','帖子视频');$('postMedia').append(video);}
   }
   $('postState').hidden=true;$('postArticle').hidden=false;
   const canonical=document.createElement('link');canonical.rel='canonical';canonical.href=location.origin+'/post/'+id;document.head.append(canonical);
   comments();
  }catch(error){$('postState').textContent=error.status===404?'这条分享不存在或已下架，回到弹幕墙看看吧。':'帖子暂时无法加载，请刷新重试。';document.title=error.status===404?'帖子不存在 · 随手记':'帖子加载失败 · 随手记';}
 }
 $('postHeart').addEventListener('click',async()=>{const button=$('postHeart');button.disabled=true;try{const data=await request('/api/posts/'+id+'/heart',{});$('postHearts').textContent=data.hearts;button.classList.add('liked');notify('谢谢你的喜欢');}catch(error){notify(error.message);}finally{button.disabled=false;}});
 $('postCommentForm').addEventListener('submit',async event=>{
  event.preventDefault();const text=$('postCommentText').value.trim();if(!text||!post)return;const button=$('postCommentSubmit');button.disabled=true;
  try{const replying=!!replyTo;await request('/api/posts/'+id+'/comments',{text,parent_id:replyTo?.id??null});$('postCommentText').value='';setReply(null);await comments();notify(replying?'回复已发布':'评论已发布');}catch(error){notify(error.message);}finally{button.disabled=false;}
 });
 $('commentReplyCancel').addEventListener('click',()=>{setReply(null);$('postCommentText').focus();});
 $('postShare').addEventListener('click',async()=>{
  const url=location.origin+'/post/'+id;
  try{await navigator.clipboard.writeText(url);notify('帖子链接已复制，可以分享给朋友了');}catch{$('postShareFallback').hidden=false;$('postShareUrl').value=url;$('postShareUrl').focus();$('postShareUrl').select();notify('长按或复制下方帖子链接');}
 });
 load();
})();
