(() => {
 const $=id=>document.getElementById(id),colors=[['#e5f4ec','#264a3a','#347459'],['#e8f2fb','#28475e','#366c99'],['#f9eaf0','#573943','#a15470']];
 let source,file,objectUrl,version=0;
 function lines(ctx,text,width,max){
  const result=[];let line='';const tokens=(text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*|[\s\S]/gu)||[]).flatMap(t=>ctx.measureText(t).width>width?Array.from(t):[t]);
  for(const token of tokens){
   if(token==='\n'||(ctx.measureText(line+token).width>width&&!/^[，。！？；：、,.!?;:）】”’]$/.test(token))){
    if(line.trim())result.push(line.trim());line=token==='\n'?'':token.trimStart();
    if(result.length>=max){result[max-1]=Array.from(result[max-1]).slice(0,-1).join('')+'…';return result;}
   }else line+=token;
  }if(line.trim())result.push(line.trim());return result;
 }
 async function render(index){
  const current=++version,data=source,[bg,ink,accent]=colors[index],canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1440;const ctx=canvas.getContext('2d');
  ctx.fillStyle=bg;ctx.fillRect(0,0,1080,1440);ctx.fillStyle='#ffffffb8';ctx.beginPath();ctx.roundRect(56,56,968,1328,40);ctx.fill();
  ctx.fillStyle=accent;ctx.font='bold 42px sans-serif';ctx.fillText('随手记 / 一条飘过的心情',104,145);ctx.fillStyle=ink;ctx.font='bold 62px sans-serif';
  const titleLines=lines(ctx,data.title,870,3);titleLines.forEach((s,i)=>ctx.fillText(s,104,278+i*88));
  ctx.font='34px sans-serif';const body=data.post.text.split('\n').filter((s,i)=>i||!data.post.text.startsWith('【')).join('\n').replace(/https?:\/\/\S+/g,'').trim();
  lines(ctx,body,860,Math.min(9,12-titleLines.length)).forEach((s,i)=>ctx.fillText(s,104,310+titleLines.length*88+i*56));
  ctx.fillStyle=accent;ctx.font='bold 30px sans-serif';ctx.fillText('@'+data.post.name,104,1085);ctx.font='24px sans-serif';ctx.fillText('每条弹幕，都是一个故事的入口。',104,1134);
  const qr=qrcode(0,'M');qr.addData(data.url);qr.make();const n=qr.getModuleCount(),scale=Math.floor(210/(n+8)),size=(n+8)*scale,x=1080-104-size,y=1174;
  ctx.fillStyle='#fff';ctx.fillRect(x,y,size,size);ctx.fillStyle='#152d24';for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c))ctx.fillRect(x+(c+4)*scale,y+(r+4)*scale,scale,scale);
  ctx.fillStyle=ink;ctx.font='bold 31px sans-serif';ctx.fillText('让每一种心情',104,1228);ctx.fillText('自由飘过。',104,1274);ctx.font='23px sans-serif';ctx.fillText('suishouji.online · 扫码读原帖 ↗',104,1336);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(current!==version||!blob)return;
  if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(blob);file=new File([blob],'随手记-弹幕心情卡.png',{type:'image/png'});$('cardPreview').src=objectUrl;$('cardDownload').href=objectUrl;$('cardDownload').download=file.name;$('cardDownload').hidden=false;$('cardFileShare').hidden=!navigator.canShare?.({files:[file]});
  $('cardStatus').textContent='长按图片保存，或点下方保存图片。扫码即可打开原帖。';
  document.querySelectorAll('[data-card-color]').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
 }
 window.SJCard={open(post,title){source={post:{...post},title,url:location.origin+'/post/'+post.id+'?from=card'};$('cardPanel').hidden=false;$('cardStatus').textContent='正在制作心情卡…';render(0).catch(()=>{$('cardStatus').textContent='暂时无法生成图片，请重试。';});window.SJTrack?.('card','/post/'+post.id);}};
 document.querySelectorAll('[data-card-color]').forEach((b,i)=>b.addEventListener('click',()=>render(i).catch(()=>{$('cardStatus').textContent='生成失败，请重试。';})));
 $('cardFileShare').addEventListener('click',async()=>{if(!file)return;try{await navigator.share({files:[file],title:source.title});}catch(e){if(e.name!=='AbortError')$('cardStatus').textContent='请先保存图片，再到微信、QQ 或小红书发送。';}});
 $('shareDialog').addEventListener('close',()=>{$('cardPanel').hidden=true;version++;file=null;if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}$('cardPreview').removeAttribute('src');$('cardDownload').hidden=true;$('cardFileShare').hidden=true;});
})();
