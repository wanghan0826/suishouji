/* Hand-drawn on a 24-unit grid for Suishouji; no emoji or icon library. */
(() => {
 const ns='http://www.w3.org/2000/svg';
 const paths={
  theme:['M12 3.5 20.5 12 12 20.5 3.5 12Z','M12 3.5V20.5M8 8l4 4-4 4'],
  account:['M8.5 7.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0Z','M5 20v-2.5C5 15 8.1 13.5 12 13.5s7 1.5 7 4V20M3.5 5.5V3.5h3M20.5 18.5v2h-3'],
  hot:['M4 18.5h16M5.5 14l4-4 3 2.5 6-7','M14 5.5h4.5V10'],
  checkin:['M5.5 5.5h13v15h-15v-15h2M7.5 3.5v4M16.5 3.5v4M3.5 10h17','m8.5 15 2.5 2.5 5-5'],
  compose:['m14.5 4.5 5 5-9.5 9.5-6 1 1-6Z','m12.5 6.5 5 5M5 15l4 4'],
  inbox:['M4 4.5h16v12h-5l-3 3-3-3H4Z','M8 9h8M8 12h5'],
  home:['M3.5 6.5h12v7H9l-3.5 3v-3h-2Z','M18.5 9.5h2v10H14l-2 2v-4'],
  games:['m8 3.5 5.5 3v6L8 15.5l-5.5-3v-6Z','m16 8.5 5.5 3v6l-5.5 3-5.5-3v-1.5M16 12v5M13.5 14.5h5'],
  plaza:['M3.5 4.5h17v15h-17Z','M3.5 9.5h17M10 9.5v10M7 7h.1M10 7h.1'],
  space:['M5 20.5v-12l7-5 7 5v12','M3 20.5h18M9 20.5v-7h6v7M10 9.5h4'],
  comment:['M3.5 5h17v11h-9l-5 4v-4h-3Z','M7.5 9h9M7.5 12h5'],
  share:['M4.5 11.5v8h15v-5','M10 14 20 4M13 4h7v7'],
  collapse:['m6 12 6-6 6 6M12 6v14M5 3h14']
 };
 function create(name){const definition=paths[name];if(!definition)return null;const svg=document.createElementNS(ns,'svg');for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.65','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);svg.classList.add('ui-icon');for(const d of definition){const p=document.createElementNS(ns,'path');p.setAttribute('d',d);svg.append(p);}return svg;}
 function button(element,name,label){if(!element)return;const icon=create(name),text=document.createElement('span');text.className='ui-label';text.textContent=String(label);element.replaceChildren(...(icon?[icon,text]:[text]));element.classList.add('ui-control');element.dataset.uiIcon=name;}
 function setLabel(element,label){if(!element)return;const text=element.querySelector(':scope > .ui-label');if(text)text.textContent=String(label);else if(element.dataset.uiIcon)button(element,element.dataset.uiIcon,label);else element.textContent=String(label);}
 function inbox(element,unread=0){button(element,'inbox','消息');if(unread>0){const badge=document.createElement('span');badge.className='ui-unread';badge.setAttribute('aria-hidden','true');badge.textContent=unread>99?'99+':String(unread);element.append(badge);}}
 function navigation(nav){if(!nav)return;for(const e of nav.children){const href=e.getAttribute('href')||'';const name=e.dataset.mobileReaderClose!==undefined?'collapse':e.dataset.mobileShare!==undefined?'share':href==='#commentsTitle'?'comment':e.dataset.touchCompose!==undefined||e.dataset.mobileCompose!==undefined?'compose':href==='/games'?'games':href==='/plaza'?'plaza':href==='/space'?'space':'home';const text=e.querySelector('.ui-label')?.textContent||e.querySelector('span:last-child')?.textContent||e.textContent.trim();button(e,name,text);}nav.classList.add('ui-navigation');}
 const controls={btnAppearance:['theme','主题'],btnAccount:['account','登录 / 注册'],btnHot:['hot','热门'],btnCheckin:['checkin','签到'],btnOpenPost:['compose','写一条']};
 for(const [id,[name,label]] of Object.entries(controls))button(document.getElementById(id),name,label);
 document.getElementById('btnAppearance')?.setAttribute('aria-label','选择视觉主题');
 navigation(document.getElementById('mobileNav'));
 window.SJIcons={create,button,setLabel,inbox,navigation};
})();
