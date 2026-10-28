import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import net from 'node:net';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';import {DatabaseSync} from 'node:sqlite';import {createAccount} from '../admin-service.mjs';
const password='Isolated-test-account-password-42';
async function fixture(t,{secure=false}={}){
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'sj-account-'));await fs.writeFile(path.join(data,'admin-auth.json'),JSON.stringify(await createAccount(password)));
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base='http://127.0.0.1:'+port,origin=secure?'https://test.example': 'http://localhost:'+port;
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),EXTRA_PORTS:'',DATA_DIR:data,SITE_ORIGIN:origin,HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
 let db;t.after(async()=>{db?.close();child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));await fs.rm(data,{recursive:true,force:true});});
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/topic')).ok){ready=true;break;}}catch{}await delay(50);}assert.ok(ready,logs);db=new DatabaseSync(path.join(data,'wall.db'));
 async function call(route,{method='GET',body,session,originOverride,csrfOverride,forwardTls=false}={}){
  const headers={};if(session){headers.Cookie=session.cookie;headers['X-SJ-CSRF']=csrfOverride??session.csrf;headers['X-CSRF-Token']=session.csrf;}
  if(method!=='GET')headers.Origin=originOverride??origin;if(forwardTls)headers['X-Forwarded-Proto']='https';
  if(body!==undefined&&!(body instanceof FormData))headers['Content-Type']='application/json';
  const r=await fetch(base+route,{method,headers,...(body!==undefined?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});const text=await r.text();let json;try{json=JSON.parse(text);}catch{json=text;}return {status:r.status,data:json,cookie:r.headers.get('set-cookie'),headers:r.headers};
 }
 const register=async(username='account_one')=>{const r=await call('/api/auth/register',{method:'POST',body:{username,password,accept:true}});assert.equal(r.status,200,JSON.stringify(r.data));return {...r.data,cookie:r.cookie.split(';')[0]};};
 const login=async(username='account_one',pwd=password)=>{const r=await call('/api/auth/login',{method:'POST',body:{username,password:pwd}});return {...r.data,cookie:r.cookie?.split(';')[0],status:r.status};};
 const admin=async()=>{const r=await call('/api/admin/login',{method:'POST',body:{username:'admin',password}});assert.equal(r.status,200);return {...r.data,cookie:r.cookie.split(';')[0]};};
 return {call,register,login,admin,db,origin};
}
test('registration establishes hashed sessions; posting and comments use the account, never a supplied nickname',async t=>{
 const f=await fixture(t);assert.equal((await f.call('/api/auth/status')).data.user,null);
 assert.equal((await f.call('/api/posts',{method:'POST'})).status,401);assert.equal((await f.call('/api/checkin',{method:'POST',body:{}})).status,401);
 assert.equal((await f.call('/api/auth/register',{method:'POST',body:{username:'invalid-user',password,accept:true}})).status,400);
 assert.equal((await f.call('/api/auth/register',{method:'POST',originOverride:'https://other.example',body:{username:'user_one',password,accept:true}})).status,403);
 const user=await f.register();const stored=f.db.prepare('SELECT * FROM site_users').get();assert.notEqual(stored.password_hash,password);assert.equal(stored.password_hash.length,128);assert.ok(!JSON.stringify(user.user).includes('ip'));
 assert.equal(f.db.prepare('SELECT token_hash FROM user_sessions').get().token_hash.length,64);assert.equal((await f.call('/api/auth/status',{session:user})).data.user.id,user.user.id);
 const form=new FormData();form.set('text','Account-linked post');form.set('name','fake_admin');form.set('theme','daily');
 const post=await f.call('/api/posts',{method:'POST',body:form,session:user});assert.equal(post.status,200);assert.equal(post.data.post.name,'account_one');const id=post.data.post.id;
 assert.equal(f.db.prepare('SELECT user_id FROM posts WHERE id=?').get(id).user_id,user.user.id);
 assert.equal((await f.call('/api/posts/'+id+'/comments',{method:'POST',body:{text:'Bad CSRF'},session:user,csrfOverride:'bad'})).status,403);
 const comment=await f.call('/api/posts/'+id+'/comments',{method:'POST',body:{text:'Real comment',name:'someone_else'},session:user});assert.equal(comment.status,200);assert.equal(comment.data.comment.name,'account_one');assert.equal(f.db.prepare('SELECT user_id FROM comments').get().user_id,user.user.id);
 assert.equal((await f.call('/api/admin/users',{session:user})).status,401);
 const publicPosts=(await f.call('/api/posts')).data.posts;assert.ok(publicPosts.every(p=>!('ip' in p)&&!('password_hash' in p)));
 assert.equal((await f.call('/api/auth/register',{method:'POST',body:{username:'ACCOUNT_ONE',password,accept:true}})).status,409);
 assert.equal((await f.call('/api/auth/logout',{method:'POST',body:{},session:user})).status,200);assert.equal((await f.call('/api/auth/status',{session:user})).data.user,null);
 assert.equal((await f.call('/api/posts/'+id+'/comments',{method:'POST',body:{text:'old cookie'},session:user})).status,401);
});
test('password rotation revokes other sessions and login failures are throttled',async t=>{
 const f=await fixture(t),first=await f.register(),second=await f.login();assert.equal(second.status,200);
 const next=password+'-changed';const changed=await f.call('/api/auth/password',{method:'POST',session:first,body:{currentPassword:password,password:next}});assert.equal(changed.status,200);assert.equal((await f.call('/api/auth/status',{session:second})).data.user,null);
 assert.equal((await f.login('account_one',password)).status,401);assert.equal((await f.login('account_one',next)).status,200);
 let last;for(let i=0;i<13;i++)last=await f.login('unknown_name',password);assert.equal(last.status,429);
});
test('management traces content, bans accounts immediately and preserves legacy anonymous records',async t=>{
 const f=await fixture(t),user=await f.register(),admin=await f.admin();
 f.db.prepare("INSERT INTO posts(text,name,theme,media,media_type,ip,created_at,user_id) VALUES('linked','account_one','daily','','','test',?,?)").run(Date.now(),user.user.id);
 f.db.prepare("INSERT INTO posts(text,name,theme,media,media_type,ip,created_at) VALUES('legacy','old author','daily','','','old',?)").run(Date.now());
 assert.equal(f.db.prepare("SELECT user_id FROM posts WHERE text='legacy'").get().user_id,null);
 const listed=await f.call('/api/admin/users?q=ACCOUNT_ONE',{session:admin});assert.equal(listed.status,200);assert.equal(listed.data.total,1);
 const trace=await f.call('/api/admin/users/'+user.user.id,{session:admin});assert.equal(trace.status,200);assert.equal(trace.data.posts.length,1);assert.equal(trace.data.access.length,1);assert.ok('registration_ip' in trace.data.user);assert.ok(!('password_hash' in trace.data.user));
 const managed=await f.call('/api/admin/posts',{session:admin});assert.ok(managed.data.items.some(x=>x.user_id===user.user.id));
 assert.equal((await f.call('/api/admin/users/'+user.user.id+'/ban',{method:'POST',body:{},session:admin})).status,200);assert.equal((await f.login()).status,403);assert.equal((await f.call('/api/auth/status',{session:user})).data.user,null);
 assert.equal(f.db.prepare('SELECT count(*) n FROM posts').get().n,2);
 assert.equal((await f.call('/api/admin/users/'+user.user.id+'/unban',{method:'POST',body:{},session:admin})).status,200);assert.equal((await f.login()).status,200);
});
test('public HTTPS deployment rejects plaintext registration and uses Secure user cookies',async t=>{
 const f=await fixture(t,{secure:true});const body={username:'secure_user',password,accept:true};
 assert.equal((await f.call('/api/auth/register',{method:'POST',body})).status,426);
 const r=await f.call('/api/auth/register',{method:'POST',body,forwardTls:true});assert.equal(r.status,200);assert.match(r.cookie,/^__Host-sj_user=/);assert.match(r.cookie,/; Secure/);assert.match(r.cookie,/HttpOnly/);assert.match(r.cookie,/SameSite=Strict/);
});
