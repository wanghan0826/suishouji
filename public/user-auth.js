(() => {
 const $=id=>document.getElementById(id),dialog=$('accountDialog');let register=false;
 const state={user:null,csrf:'',ready:null,open,render,refresh};window.SJAuth=state;
 function render(){
  $('btnAccount').textContent=state.user?state.user.username:'登录 / 注册';$('btnAccount').title=state.user?'账号：'+state.user.username:'登录或注册';
  $('accountSignedOut').hidden=!!state.user;$('accountSignedIn').hidden=!state.user;
  $('accountIdentity').textContent=state.user?state.user.username+' · 账号 #'+state.user.id:'';
  for(const id of ['postName','commentName'])$(id).value=state.user?.username||'';
 }
 function mode(value){register=value;$('accountLoginTab').setAttribute('aria-pressed',String(!value));$('accountRegisterTab').setAttribute('aria-pressed',String(value));$('accountConfirmWrap').hidden=!value;$('accountConfirm').required=value;$('accountAccept').required=value;$('accountSubmit').textContent=value?'注册并登录 →':'登录 →';$('accountPassword').autocomplete=value?'new-password':'current-password';$('accountError').textContent='';$('accountPassword').value='';$('accountConfirm').value='';}
 function open(){render();if(!dialog.open)dialog.showModal();}
 async function call(route,body){const response=await fetch('/api/auth/'+route,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-SJ-CSRF':state.csrf},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error||'暂时无法完成操作');return data;}
 async function refresh(){try{const r=await fetch('/api/auth/status',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();state.user=data.user;state.csrf=data.csrf||'';render();}catch{state.user=null;state.csrf='';render();$('accountError').textContent='账号服务暂时不可用，请刷新后重试。';}}
 $('btnAccount').addEventListener('click',open);$('accountClose').onclick=()=>dialog.close();$('accountLoginTab').onclick=()=>mode(false);$('accountRegisterTab').onclick=()=>mode(true);
 $('accountForm').onsubmit=async event=>{event.preventDefault();$('accountError').textContent='';if(register&&$('accountPassword').value!==$('accountConfirm').value){$('accountError').textContent='两次输入的密码不一致';return;}const button=$('accountSubmit');button.disabled=true;try{const data=await call(register?'register':'login',{username:$('accountUsername').value,password:$('accountPassword').value,accept:$('accountAccept').checked});state.user=data.user;state.csrf=data.csrf;$('accountForm').reset();render();dialog.close();}catch(e){$('accountError').textContent=e.message;$('accountPassword').value='';$('accountConfirm').value='';}finally{button.disabled=false;}};
 $('accountLogout').onclick=async()=>{const button=$('accountLogout');button.disabled=true;try{await call('logout',{});state.user=null;state.csrf='';$('accountPasswordForm').reset();render();mode(false);}catch(e){$('accountPasswordError').textContent=e.message;}finally{button.disabled=false;}};
 $('accountPasswordForm').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;$('accountPasswordError').textContent='';try{const data=await call('password',{currentPassword:$('accountCurrentPassword').value,password:$('accountNewPassword').value});state.csrf=data.csrf;$('accountPasswordForm').reset();$('accountPasswordError').textContent='密码已修改，其他设备已退出登录。';}catch(error){$('accountPasswordError').textContent=error.message;}finally{button.disabled=false;}};
 $('btnOpenPost').addEventListener('click',async e=>{if(state.user)return;e.stopImmediatePropagation();await state.ready;if(state.user)$('btnOpenPost').click();else open();},true);
 dialog.addEventListener('close',()=>{$('accountPassword').value='';$('accountConfirm').value='';$('accountPasswordForm').reset();});
 state.ready=refresh();render();
})();
