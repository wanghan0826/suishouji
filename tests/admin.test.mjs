import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {DatabaseSync} from 'node:sqlite';import {createAdminService,createAccount,chinaDate} from '../admin-service.mjs';
const password='Only-for-isolated-local-tests-27';
async function fixture(t,{configured=true,secure=false,trustProxy=false}={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tmp-'));
 if(configured)await fs.writeFile(path.join(dir,'admin-auth.json'),JSON.stringify(await createAccount(password)));
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE posts(id INTEGER PRIMARY KEY,text TEXT,name TEXT,theme TEXT,media TEXT,media_type TEXT,hearts INTEGER,topic TEXT,created_at INTEGER);
 CREATE TABLE comments(id INTEGER PRIMARY KEY,post_id INTEGER,text TEXT,name TEXT,created_at INTEGER);`);
 const post=db.prepare('INSERT INTO posts VALUES(?,?,?,?,?,?,?,?,?)');
 post.run(1,'100% effort','小明','daily','test.jpg','image',5,'',Date.now()-1000);post.run(2,'一条树洞','匿名','secret','','',0,'',Date.now()-2000);post.run(3,'另一条风景','小雨','scene','','',3,'',Date.now()-3000);
 db.prepare('INSERT INTO comments VALUES(?,?,?,?,?)').run(1,1,'评论一','甲',Date.now());db.prepare('INSERT INTO comments VALUES(?,?,?,?,?)').run(2,2,'评论二','乙',Date.now());
 const server=http.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,origin=secure?'https://suishouji.online':base;
 const publicDir=path.join(dir,'public');await fs.mkdir(publicDir);await fs.cp(path.resolve('public/admin'),path.join(publicDir,'admin'),{recursive:true});
 const service=createAdminService({db,dataDir:dir,publicDir,origin,allowLocalHttp:!secure,trustProxy,automaticTopic:()=>({date:chinaDate(),topic:'自动测试话题'})});
 server.on('request',async(req,res)=>{if(await service.handle(req,res))return;if(service.handlePublic(req,res))return;res.writeHead(404);res.end('{}');});
 t.after(async()=>{service.close();server.closeAllConnections();await new Promise(r=>server.close(r));db.close();await fs.rm(dir,{recursive:true,force:true});});
 const call=async(route,{method='GET',body,session,originOverride,csrfOverride,forwardTls=false}={})=>{
  const headers={};if(session)headers.Cookie=session.cookie;if(method!=='GET'){headers.Origin=originOverride??origin;headers['Content-Type']='application/json';if(session)headers['X-CSRF-Token']=csrfOverride??session.csrf;}if(forwardTls)headers['X-Forwarded-Proto']='https';
  const response=await fetch(base+route,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})});const data=await response.json();return {status:response.status,data,cookie:response.headers.get('set-cookie'),headers:response.headers};
 };
 const login=async()=>{const result=await call('/api/admin/login',{method:'POST',body:{username:'admin',password},forwardTls:secure});assert.equal(result.status,200);return {cookie:result.cookie.split(';')[0],csrf:result.data.csrf};};
 return {call,login,db,base,service};
}
test('management data requires login, and setup is locked without an account',async t=>{
 const f=await fixture(t,{configured:false});assert.equal((await f.call('/api/admin/overview')).status,401);assert.equal((await f.call('/api/admin/status')).data.configured,false);assert.equal((await f.call('/api/admin/login',{method:'POST',body:{username:'admin',password}})).status,503);
});
test('login creates a protected session; logout revokes it',async t=>{
 const f=await fixture(t);const invalid=await f.call('/api/admin/login',{method:'POST',body:{username:'admin',password:'wrong'}});assert.equal(invalid.status,401);
 const result=await f.call('/api/admin/login',{method:'POST',body:{username:'admin',password}});assert.equal(result.status,200);assert.match(result.cookie,/HttpOnly/);assert.match(result.cookie,/SameSite=Strict/);
 const session={cookie:result.cookie.split(';')[0],csrf:result.data.csrf};const summary=await f.call('/api/admin/overview',{session});assert.equal(summary.status,200);assert.equal(summary.data.posts,3);assert.equal(summary.data.comments,2);assert.equal(summary.data.images,1);assert.equal(summary.data.todayPosts,3);assert.ok(!JSON.stringify(summary.data).includes('password'));
 assert.equal((await f.call('/api/admin/logout',{method:'POST',session,body:{}})).status,200);assert.equal((await f.call('/api/admin/overview',{session})).status,401);
});
test('origin and CSRF validation reject unauthorized mutation',async t=>{
 const f=await fixture(t),session=await f.login();
 assert.equal((await f.call('/api/admin/login',{method:'POST',originOverride:'https://evil.invalid',body:{username:'admin',password}})).status,403);
 assert.equal((await f.call('/api/admin/posts/1/archive',{method:'POST',session,csrfOverride:'wrong',body:{}})).status,403);
 assert.equal((await f.call('/api/admin/posts/1/archive',{method:'POST',session,originOverride:'https://evil.invalid',body:{}})).status,403);
 assert.equal(f.db.prepare('SELECT count(*) n FROM admin_archive').get().n,0);
});
test('archive and restore hide public posts, comments, likes and hot results without losing data',async t=>{
 const f=await fixture(t),session=await f.login();
 assert.equal((await f.call('/api/posts?limit=60')).data.posts.length,3);
 assert.equal((await f.call('/api/admin/posts/1/archive',{method:'POST',session,body:{}})).status,200);
 assert.equal((await f.call('/api/posts?limit=60')).data.posts.length,2);
 assert.ok(!(await f.call('/api/hot')).data.posts.some(p=>p.id===1));
 assert.equal((await f.call('/api/posts/1/comments')).status,404);
 assert.equal((await f.call('/api/posts/1/heart',{method:'POST',body:{}})).status,404);
 assert.equal(f.db.prepare('SELECT count(*) n FROM posts').get().n,3);assert.equal(f.db.prepare('SELECT count(*) n FROM comments').get().n,2);
 assert.equal((await f.call('/api/admin/posts?state=archived',{session})).data.total,1);
 assert.equal((await f.call('/api/admin/posts/1/restore',{method:'POST',session,body:{}})).status,200);
 assert.equal((await f.call('/api/posts?theme=daily')).data.posts[0].id,1);assert.equal((await f.call('/api/posts/1/comments')).data.comments.length,1);
});
test('comment moderation is independent of post visibility and can be restored',async t=>{
 const f=await fixture(t),session=await f.login();
 await f.call('/api/admin/comments/1/archive',{method:'POST',session,body:{}});
 assert.equal((await f.call('/api/posts/1/comments')).data.comments.length,0);assert.equal((await f.call('/api/posts')).data.posts.length,3);
 assert.equal((await f.call('/api/admin/comments?state=archived',{session})).data.total,1);
 await f.call('/api/admin/comments/1/restore',{method:'POST',session,body:{}});assert.equal((await f.call('/api/posts/1/comments')).data.comments.length,1);
});
test('search escapes SQL wildcards, validates filters and paginates',async t=>{
 const f=await fixture(t),session=await f.login();
 const result=await f.call('/api/admin/posts?q='+encodeURIComponent('%'),{session});assert.equal(result.status,200);assert.equal(result.data.total,1);
 const malicious=await f.call('/api/admin/posts?q='+encodeURIComponent("' OR 1=1--"),{session});assert.equal(malicious.data.total,0);
 assert.equal((await f.call('/api/admin/posts?theme=unknown',{session})).status,400);
 const second=await f.call('/api/admin/posts?limit=1&page=2',{session});assert.equal(second.data.items.length,1);assert.equal(second.data.items[0].id,2);assert.equal(second.data.total,3);
});
test('daily topic override, scheduled topic and automatic restoration preserve public contract',async t=>{
 const f=await fixture(t),session=await f.login(),today=chinaDate(),future=chinaDate(new Date(Date.now()+86400000));
 assert.equal((await f.call('/api/topic')).data.topic,'自动测试话题');
 assert.equal((await f.call('/api/admin/topics/'+today,{method:'PUT',session,body:{topic:'今天最想记录什么？'}})).status,200);assert.equal((await f.call('/api/topic')).data.topic,'今天最想记录什么？');
 await f.call('/api/admin/topics/'+future,{method:'PUT',session,body:{topic:'未来的话题'}});assert.equal((await f.call('/api/topic')).data.topic,'今天最想记录什么？');
 assert.equal((await f.call('/api/admin/topics',{session})).data.items.length,2);
 assert.equal((await f.call('/api/admin/topics/2026-02-30',{method:'PUT',session,body:{topic:'错误日期'}})).status,400);
 assert.equal((await f.call('/api/admin/topics/'+today,{method:'PUT',session,body:{topic:' '.repeat(4)}})).status,400);
 await f.call('/api/admin/topics/'+today,{method:'DELETE',session,body:{}});assert.equal((await f.call('/api/topic')).data.topic,'自动测试话题');
});
test('production rejects HTTP login and sets Secure host-only cookie behind TLS proxy',async t=>{
 const f=await fixture(t,{secure:true});assert.equal((await f.call('/api/admin/status')).status,426);
 assert.equal((await f.call('/api/admin/login',{method:'POST',body:{username:'admin',password}})).status,426);
 const result=await f.call('/api/admin/login',{method:'POST',forwardTls:true,body:{username:'admin',password}});assert.equal(result.status,200);assert.match(result.cookie,/^__Host-sj_admin=/);assert.match(result.cookie,/; Secure/);assert.ok(!result.cookie.includes('Domain='));
});
test('login failure limit and session expiry are enforced',async t=>{
 const f=await fixture(t),session=await f.login();f.db.prepare('UPDATE admin_sessions SET expires_at=?').run(Date.now()-1);assert.equal((await f.call('/api/admin/overview',{session})).status,401);
 for(let i=0;i<8;i++)assert.equal((await f.call('/api/admin/login',{method:'POST',body:{username:'admin',password:'incorrect'}})).status,401);
 assert.equal((await f.call('/api/admin/login',{method:'POST',body:{username:'admin',password}})).status,429);
});
test('admin static pages are readable with strict security headers and no cache',async t=>{
 const f=await fixture(t);for(const route of ['/admin','/admin/','/admin/admin.css','/admin/admin.js']){const r=await fetch(f.base+route);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.ok((await r.text()).length>100);}
 assert.equal((await f.call('/admin/../../admin-auth.json')).status,404);
});

test('container proxy TLS headers require explicit trust',async t=>{
 for(const trustProxy of [false,true]){
  const f=await fixture(t,{secure:true,trustProxy});let status;
  const req={url:'/api/admin/status',method:'GET',headers:{'x-forwarded-proto':'https'},socket:{remoteAddress:'172.18.0.2'}};
  const res={writeHead(code){status=code;},end(){}};
  await f.service.handle(req,res);assert.equal(status,trustProxy?200:426);
 }
});
