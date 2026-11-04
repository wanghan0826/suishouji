(()=>{
  const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e;};
  const statuses={new:'待查看',planned:'已计划',building:'开发中',done:'已上线',closed:'暂不安排'},modes={any:'玩法不限',solo:'单人',two:'双人',party:'多人'};
  let owner=null,epoch=0,read=null,posting=null,operation=null,page=1,pages=1;
  const date=ts=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ts));
  const draft=()=>({title:$('feedbackTitle').value.trim(),details:$('feedbackDetails').value.trim(),mode:$('feedbackMode').value});
  function clearPrivate(){epoch++;read?.abort();read=null;posting=null;operation=null;page=1;pages=1;$('feedbackForm').reset();$('feedbackFields').disabled=false;$('feedbackSubmit').disabled=false;$('feedbackSubmit').textContent='把建议交给站主 →';$('feedbackItems').replaceChildren();$('feedbackMessage').textContent='';$('feedbackError').textContent='';$('feedbackMineStatus').textContent='登录后可以查看自己提交的建议和站主回复。';$('feedbackQuota').textContent='每个账号每天最多提交5条。';$('feedbackPagination').hidden=true;}
  async function call(data,signal){let r;try{r=await fetch('/api/game-feedback'+(data===undefined?'?page='+page:''),{credentials:'same-origin',cache:'no-store',signal,...(data!==undefined?{method:'POST',headers:{'Content-Type':'application/json','X-SJ-CSRF':SJAuth.csrf},body:JSON.stringify(data)}:{})});}catch(e){throw Object.assign(Error(e.name==='AbortError'?'请求已取消':'网络暂时不可用，填写内容已保留，请稍后重试。'),{network:true});}let value;try{value=await r.json();}catch{throw Error('没有收到完整回复，填写内容已保留，请稍后重试。');}if(!r.ok)throw Object.assign(Error(value.error||'暂时无法处理建议'),{status:r.status});return value;}
  function card(item){
    const article=make('article',undefined,'feedback-item'),meta=make('div',undefined,'feedback-meta'),state=make('span',statuses[item.status]||'待查看','feedback-badge');state.dataset.status=item.status;
    meta.append(state,make('span',modes[item.mode]||modes.any),make('time',date(item.created_at)));article.append(meta,make('h3',item.title));if(item.details)article.append(make('p',item.details,'feedback-body'));
    if(item.reply){const reply=make('div',undefined,'feedback-reply');reply.append(make('strong','站主回复'),make('p',item.reply));article.append(reply);}else article.append(make('p','建议已交给站主，处理进度会显示在这里。','feedback-muted'));return article;
  }
  async function load(){
    await SJAuth.ready;const id=SJAuth.user?.id,version=epoch;if(!id)return;read?.abort();const controller=new AbortController();read=controller;const timeout=setTimeout(()=>controller.abort(),10000);$('feedbackMineStatus').textContent='正在读取你的建议…';
    try{const data=await call(undefined,controller.signal);if(version!==epoch||SJAuth.user?.id!==id||read!==controller)return;pages=Math.max(1,Math.ceil(data.total/data.limit));if(page>pages){page=pages;read=null;return load();}
      $('feedbackItems').replaceChildren(...data.items.map(card));$('feedbackMineStatus').textContent=data.total?'共 '+data.total+' 条建议 · 仅你和站主可见':'你还没有提交过建议，有想法或遇到问题都可以告诉站主。';$('feedbackQuota').textContent='今天还可以提交 '+data.remaining+' 条建议（北京时间每天最多5条）。';$('feedbackPagination').hidden=pages<=1;$('feedbackPage').textContent=page+' / '+pages;$('feedbackPrev').disabled=page<=1;$('feedbackNext').disabled=page>=pages;
    }catch(e){if(version!==epoch||SJAuth.user?.id!==id||read!==controller)return;$('feedbackMineStatus').textContent='暂时无法更新建议：'+e.message;if([401,403].includes(e.status))SJAuth.refresh();}finally{clearTimeout(timeout);if(read===controller)read=null;}
  }
  function login(){SJAuth.open({purpose:'登录后提交建议，内容仅你和站主可见；登录不会自动提交。',resume:()=>{$('feedbackTitle').focus();load();}});}
  $('feedbackLogin').onclick=login;$('feedbackRefresh').onclick=load;$('feedbackPrev').onclick=()=>{if(page>1){page--;load();}};$('feedbackNext').onclick=()=>{if(page<pages){page++;load();}};
  $('feedbackForm').onsubmit=async e=>{
    e.preventDefault();await SJAuth.ready;if(!SJAuth.user){login();return;}if(posting)return;const id=SJAuth.user.id,version=epoch,body=draft(),signature=JSON.stringify({...body,userId:id});
    if(operation?.signature!==signature)operation={signature,key:crypto.randomUUID().replaceAll('-','')};const job={id,version};posting=job;$('feedbackFields').disabled=true;$('feedbackSubmit').disabled=true;$('feedbackSubmit').textContent='正在提交…';$('feedbackError').textContent='';$('feedbackMessage').textContent='';
    try{const data=await call({...body,requestKey:operation.key});if(epoch!==version||SJAuth.user?.id!==id||posting!==job)return;$('feedbackForm').reset();operation=null;$('feedbackMessage').textContent=data.repeated?'已确认收到这条建议，没有重复提交。':'建议已收到！你可以在下方查看处理进度和站主回复。';page=1;await load();}
    catch(e){if(epoch!==version||SJAuth.user?.id!==id||posting!==job)return;$('feedbackError').textContent=e.message;if([401,403].includes(e.status))SJAuth.refresh();}
    finally{if(posting===job){posting=null;$('feedbackFields').disabled=false;$('feedbackSubmit').disabled=false;$('feedbackSubmit').textContent='把建议交给站主 →';}}
  };
  function auth(){const id=SJAuth.user?.id;if(owner!==id){if(owner)clearPrivate();owner=id;if(id)load();else $('feedbackMineStatus').textContent='登录后可以查看自己提交的建议和站主回复。';}$('feedbackLogin').hidden=!!id;}
  document.addEventListener('sj:auth-change',auth);document.addEventListener('sj:logout',()=>{clearPrivate();owner=null;});window.addEventListener('pageshow',e=>{if(e.persisted)SJAuth.refresh().then(load);});SJAuth.ready.then(auth);
})();
