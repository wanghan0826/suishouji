/* Visitor-local appearance preferences; independent of post categories. */
(() => {
  const key='suishouji.appearance.v1';
  const themes=['night','forest','sunset','paper'];
  const names={night:'静谧夜色',forest:'林间微光',sunset:'暖橙日落',paper:'晴日纸白'};
  const colors={night:'#101e26',forest:'#142e27',sunset:'#3c252d',paper:'#f0ede3'};
  let preferences={theme:'night',automatic:false,interval:60,slideshow:false};
  try {
    const saved=JSON.parse(localStorage.getItem(key));
    if(saved&&typeof saved==='object')preferences={
      theme:themes.includes(saved.theme)?saved.theme:'night',
      automatic:saved.automatic===true,
      interval:[30,60,300].includes(saved.interval)?saved.interval:60,
      slideshow:saved.slideshow===true
    };
  } catch {}
  const root=document.documentElement;
  const apply=()=>{
    root.dataset.appearance=preferences.theme;
    root.dataset.backgroundRotation=String(preferences.slideshow);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',colors[preferences.theme]);
  };
  apply();
  function initialize(){
    const dialog=document.getElementById('appearanceDialog');
    const trigger=document.getElementById('btnAppearance');
    const automatic=document.getElementById('appearanceAutomatic');
    const interval=document.getElementById('appearanceInterval');
    const slideshow=document.getElementById('appearanceSlideshow');
    const state=document.getElementById('appearanceState');
    const savedState=document.getElementById('appearanceSaved');
    const choices=[...dialog.querySelectorAll('[data-appearance-choice]')];
    let timer;
    function render(){
      choices.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.appearanceChoice===preferences.theme)));
      automatic.checked=preferences.automatic;
      interval.value=String(preferences.interval);
      interval.disabled=!preferences.automatic;
      slideshow.checked=preferences.slideshow;
      state.textContent=`当前：${names[preferences.theme]} · ${preferences.automatic?'自动切换中':'已固定'}`;
      trigger.title=`视觉主题：${names[preferences.theme]}`;
    }
    function persist(){
      try {localStorage.setItem(key,JSON.stringify(preferences));savedState.textContent='已自动保存到当前浏览器';}
      catch {savedState.textContent='当前浏览器无法保存设置，本次访问仍然有效';}
    }
    function notify(){document.dispatchEvent(new CustomEvent('sj:appearance-change',{detail:{slideshow:preferences.slideshow}}));}
    function startTimer(){
      clearInterval(timer);
      if(preferences.automatic)timer=setInterval(()=>{
        if(document.hidden||dialog.open)return;
        preferences.theme=themes[(themes.indexOf(preferences.theme)+1)%themes.length];
        apply();render();persist();
      },preferences.interval*1000);
    }
    choices.forEach(button=>button.addEventListener('click',()=>{
      preferences.theme=button.dataset.appearanceChoice;
      preferences.automatic=false;
      apply();render();persist();startTimer();
    }));
    automatic.addEventListener('change',()=>{preferences.automatic=automatic.checked;render();persist();startTimer();});
    interval.addEventListener('change',()=>{preferences.interval=Number(interval.value);persist();startTimer();});
    slideshow.addEventListener('change',()=>{preferences.slideshow=slideshow.checked;apply();persist();notify();});
    trigger.addEventListener('click',()=>{render();dialog.showModal();});
    dialog.querySelector('[data-appearance-close]').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();}});
    dialog.addEventListener('close',startTimer);
    render();startTimer();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
