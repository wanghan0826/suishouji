(()=>{
  const picker=document.getElementById('homeGamePicker');if(!picker)return;const summary=picker.querySelector('summary');
  function close(focus=false){if(!picker.open)return;picker.open=false;if(focus)summary.focus({preventScroll:true});}
  document.getElementById('homePickerClose').onclick=()=>close(true);
  document.addEventListener('pointerdown',e=>{if(!picker.contains(e.target))close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&picker.open){e.preventDefault();close(true);}});
  picker.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>close()));
  document.addEventListener('sj:reading-change',()=>{if(document.body.classList.contains('has-open-post'))close();});
  document.querySelectorAll('[data-home-icon]').forEach(n=>{const icon=window.SJIcons?.create(n.dataset.homeIcon);if(icon)n.append(icon);});
  function artwork(){const light=document.documentElement.dataset.lightweight==='true';for(const source of document.querySelectorAll('source[data-home-srcset]')){if(light)source.removeAttribute('srcset');else source.srcset=source.dataset.homeSrcset;}for(const img of document.querySelectorAll('img[data-home-src]')){if(light)img.removeAttribute('src');else if(img.getAttribute('src')!==img.dataset.homeSrc)img.src=img.dataset.homeSrc;}}
  artwork();document.addEventListener('sj:appearance-change',artwork);
})();
