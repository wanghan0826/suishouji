(() => {
 const username=location.pathname.match(/^\/u\/([a-zA-Z0-9_]{3,20})\/?$/)?.[1];
 window.SJInviteReady=(async()=>{if(!username||new URLSearchParams(location.search).get('from')!=='invite')return;await SJAuth.ready;if(SJAuth.user)return;try{await fetch('/api/invitations/visit',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username}),signal:AbortSignal.timeout(5000)});}catch{}})();
})();
