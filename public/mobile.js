(() => {
 const root=document.documentElement,nav=document.getElementById('mobileNav');
 function viewport(){const view=window.visualViewport;root.style.setProperty('--visual-viewport-height',(view?.height||innerHeight)+'px');root.dataset.keyboardOpen=String(!!view&&innerHeight-view.height>120&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||''));}
 window.visualViewport?.addEventListener('resize',viewport);window.addEventListener('resize',viewport);document.addEventListener('focusin',viewport);document.addEventListener('focusout',()=>requestAnimationFrame(viewport));viewport();
 const defaultNavigation=nav?.innerHTML;
 function navigation(){if(!nav)return;nav.innerHTML=document.body.classList.contains('has-open-post')?'<button type="button" data-mobile-reader-close>↑ 收起</button><a href="#commentsTitle">💬 评论</a><button type="button" data-mobile-share>↗ 分享</button>':defaultNavigation;}
 nav?.addEventListener('click',event=>{if(event.target.closest('[data-mobile-compose]'))document.getElementById('btnOpenPost')?.click();if(event.target.closest('[data-mobile-share]'))document.getElementById('postShare')?.click();if(event.target.closest('[data-mobile-reader-close]'))document.querySelector('[data-reader-close]')?.click();});
 document.addEventListener('sj:reading-change',navigation);navigation();
 if(nav&&document.getElementById('wall')){
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){nav.querySelectorAll('a').forEach(a=>{if(a.hash==='#'+entry.target.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});}},{rootMargin:'-10% 0px -60% 0px',threshold:0});
  for(const id of ['wall','shares']){const section=document.getElementById(id);if(section)observer.observe(section);}
 }
})();
