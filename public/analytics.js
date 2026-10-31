(() => {
 let queue=Promise.resolve();const seen=new Map();
 window.SJTrack=(event,path=location.pathname)=>{
  if(!/^\/(?:post\/[1-9]\d*)?$/.test(path))return;
  if(event==='view'){if(Date.now()-(seen.get(path)||0)<30000)return;seen.set(path,Date.now());}
  queue=queue.then(()=>fetch('/api/visit',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({event,path}),keepalive:true})).catch(()=>{});
 };
 if(location.pathname==='/')window.SJTrack('view','/');
})();
