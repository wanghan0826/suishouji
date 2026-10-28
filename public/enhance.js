/* Editorial content and accessible dialog behavior. Existing APIs stay intact. */
(() => {
  let articles = [];
  let selected = null;
  const dialog = document.getElementById('articleDialog');
  let contentPromise;
  const getArticles = () => contentPromise ||= fetch('/editorial.json?v=20261019-wall-3').then(r => {if(!r.ok) throw Error('load'); return r.json();}).catch(e => {contentPromise=null;throw e;});
  const openPost = () => document.getElementById('btnOpenPost').click();
  
  document.getElementById('btnLoadMore').addEventListener('click',()=>{hasMore=true;loadPosts(false);});
  document.querySelectorAll('[data-article]').forEach(button => button.addEventListener('click', async () => {
    try {
      articles = await getArticles(); selected=articles[Number(button.dataset.article)];
      const img=document.getElementById('articleImage'); img.src='/assets/'+selected.image;img.alt=selected.alt;
      document.getElementById('articleTag').textContent=selected.tag+' / 编辑精选';
      document.getElementById('articleTitle').textContent=selected.title;
      document.getElementById('articleIntro').textContent=selected.intro;
      document.getElementById('articleContent').replaceChildren(...selected.body.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
      dialog.showModal();dialog.scrollTop=0;
    } catch {toast('图文暂时没有加载成功，请再试一次。');}
  }));
  dialog.querySelector('.article-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  document.getElementById('articlePost').addEventListener('click',()=>{
    dialog.close();openPost();
    const input=document.getElementById('postText');input.value=selected.prompt;input.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector(`#themePicker [data-theme="${selected.theme}"]`)?.click();input.focus();
  });
  const modals=[...document.querySelectorAll('.modal-mask')];let lastFocus=null;
  const observer=new MutationObserver(records=>{
    for(const {target} of records){const open=target.classList.contains('show');target.setAttribute('aria-hidden',String(!open));target.inert=!open;
      if(open){lastFocus=document.activeElement;target.setAttribute('role','dialog');target.setAttribute('aria-modal','true');const heading=target.querySelector('h3');if(heading)target.setAttribute('aria-label',heading.textContent);else target.setAttribute('aria-label','分享详情');setTimeout(()=>target.querySelector('textarea,input,button')?.focus(),50);}else if(lastFocus?.isConnected&&!modals.some(m=>m.classList.contains('show')))lastFocus.focus();}
    document.body.style.overflow=modals.some(m=>m.classList.contains('show'))?'hidden':'';
  });
  modals.forEach(m=>{m.inert=true;m.setAttribute('aria-hidden','true');observer.observe(m,{attributes:true,attributeFilter:['class']});});
  document.addEventListener('keydown',e=>{
    const modal=modals.find(m=>m.classList.contains('show'));if(!modal)return;
    if(e.key==='Escape'){modal.classList.remove('show');return;}
    if(e.key==='Tab'){const items=[...modal.querySelectorAll('button,input,textarea,[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);if(!items.length)return;const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  });
})();
