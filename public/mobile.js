(() => {
 const root=document.documentElement,nav=document.getElementById('mobileNav');
 function viewport(){const view=window.visualViewport;root.style.setProperty('--visual-viewport-height',(view?.height||innerHeight)+'px');root.dataset.keyboardOpen=String(!!view&&innerHeight-view.height>120&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||''));}
 window.visualViewport?.addEventListener('resize',viewport);window.addEventListener('resize',viewport);document.addEventListener('focusin',viewport);document.addEventListener('focusout',()=>requestAnimationFrame(viewport));viewport();
 nav?.querySelector('[data-mobile-compose]')?.addEventListener('click',()=>document.getElementById('btnOpenPost')?.click());
 nav?.querySelector('[data-mobile-share]')?.addEventListener('click',()=>document.getElementById('postShare')?.click());
 if(nav&&document.getElementById('wall')){
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){nav.querySelectorAll('a').forEach(a=>{if(a.hash==='#'+entry.target.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});}},{rootMargin:'-10% 0px -60% 0px',threshold:0});
  for(const id of ['wall','shares']){const section=document.getElementById(id);if(section)observer.observe(section);}
 }
})();
