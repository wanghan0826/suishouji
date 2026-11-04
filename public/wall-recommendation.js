(()=>{
  const card=document.querySelector('.wall-recommendation'),close=document.getElementById('closeWallRecommendation');
  if(!card||!close)return;
  const key='sj-feedback-recommendation-v1-dismissed';
  let dismissed=false;try{dismissed=sessionStorage.getItem(key)==='1';}catch{}
  card.hidden=dismissed;
  close.addEventListener('click',()=>{
    card.hidden=true;
    try{sessionStorage.setItem(key,'1');}catch{}
    if(document.activeElement===close)document.getElementById('toggleDanmaku')?.focus({preventScroll:true});
  });
})();
