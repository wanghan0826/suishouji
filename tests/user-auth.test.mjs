import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import net from 'node:net';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';import {DatabaseSync} from 'node:sqlite';import {createAccount} from '../admin-service.mjs';
const password='User_pw_42',adminPassword='Isolated-test-admin-password-42';

test('personal spaces enforce follower and mutual access at the API, revoke access immediately, and keep updates off public feeds',async t=>{
 const f=await fixture(t),owner=await f.register('space_owner'),fan=await f.register('space_fan'),stranger=await f.register('space_other');const base='/api/spaces/space_owner';
 assert.equal((await f.call(base)).data.visibility,'mutual');assert.equal((await f.call(base)).data.canAccess,false);assert.equal((await f.call(base,{session:owner})).data.canAccess,true);assert.equal((await f.call(base+'/updates')).status,401);assert.equal((await f.call(base+'/members',{session:stranger})).status,403);
 const secret='only-space-private-message';assert.equal((await f.call(base+'/updates',{method:'POST',session:owner,body:{text:secret}})).status,200);assert.equal((await f.call(base+'/updates',{session:stranger})).status,403);assert.ok(!JSON.stringify((await f.call('/api/posts')).data).includes(secret));assert.ok(!JSON.stringify((await f.call('/api/discussions')).data).includes(secret));
 assert.equal((await f.call(base+'/follow',{method:'POST',session:fan,body:{},csrfOverride:'bad'})).status,403);assert.equal((await f.call(base+'/follow',{method:'POST',session:fan,body:{},originOverride:'https://evil.example'})).status,403);
 assert.equal((await f.call(base+'/follow',{method:'POST',session:owner,body:{}})).status,400);assert.equal((await f.call(base+'/follow',{method:'POST',session:fan,body:{}})).status,200);assert.equal((await f.call(base+'/updates',{session:fan})).status,403);assert.match((await f.call(base+'/updates',{session:fan})).data.error,/互关/);
 await f.call(base+'/profile',{method:'POST',session:owner,body:{title:'我的空间',bio:'',visibility:'followers',color:'mint'}});assert.equal((await f.call(base,{session:fan})).data.visibility,'followers');assert.equal((await f.call(base+'/updates',{session:fan})).data.items[0].text,secret);
 const settings={title:'我的空间',bio:'只给朋友的简介',visibility:'mutual',color:'mint'};assert.equal((await f.call(base+'/profile',{method:'POST',session:stranger,body:settings})).status,403);assert.equal((await f.call(base+'/profile',{method:'POST',session:owner,body:settings})).status,200);assert.equal((await f.call(base+'/updates',{session:fan})).status,403);assert.equal((await f.call(base,{session:fan})).data.bio,'');
 await f.call('/api/spaces/space_fan/follow',{method:'POST',session:owner,body:{}});assert.equal((await f.call(base,{session:fan})).data.mutual,true);const updates=(await f.call(base+'/updates',{session:fan})).data;assert.equal(updates.items[0].text,secret);assert.equal((await f.call(base+'/updates/'+updates.items[0].id,{method:'POST',session:fan,body:{}})).status,403);
 await f.call(base+'/unfollow',{method:'POST',session:fan,body:{}});assert.equal((await f.call(base+'/updates',{session:fan})).status,403);
 const admin=await f.admin();assert.equal((await f.call('/api/admin/space-updates')).status,401);assert.equal((await f.call('/api/admin/space-updates',{session:admin})).data.items.length,1);await f.call('/api/admin/space-updates/'+updates.items[0].id+'/archive',{method:'POST',session:admin,body:{}});assert.equal((await f.call(base+'/updates',{session:owner})).data.total,0);
 await f.call(base+'/profile',{method:'POST',session:owner,body:{...settings,visibility:'public'}});assert.equal((await f.call(base)).data.canAccess,true);assert.equal((await f.call(base+'/updates')).status,200);
 assert.ok(!JSON.stringify((await f.call(base)).data).includes('registration_ip'));assert.equal((await f.call('/space')).status,200);assert.equal((await f.call('/u/space_owner')).status,200);
});

test('space danmaku binds real authors, follows space privacy, and supports owner and admin moderation',async t=>{
 const f=await fixture(t),owner=await f.register('wall_owner'),fan=await f.register('wall_friend'),other=await f.register('wall_other'),base='/api/spaces/wall_owner';
 assert.equal((await f.call(base+'/danmaku')).status,401);
 await f.call(base+'/follow',{method:'POST',session:fan,body:{}});
 assert.equal((await f.call(base+'/danmaku',{session:fan})).status,403);
 assert.equal((await f.call(base+'/danmaku',{method:'POST',session:fan,body:{text:'not mutual'}})).status,403);
 await f.call('/api/spaces/wall_friend/follow',{method:'POST',session:owner,body:{}});
 assert.equal((await f.call(base+'/danmaku',{method:'POST',session:fan,body:{text:'hello'},csrfOverride:'wrong'})).status,403);
 assert.equal((await f.call(base+'/danmaku',{method:'POST',session:fan,body:{text:'hello'},originOverride:'https://evil.example'})).status,403);
 for(const text of ['', 'a'.repeat(81)])assert.equal((await f.call(base+'/danmaku',{method:'POST',session:fan,body:{text}})).status,400);
 const secret='private-friend-danmaku',sent=await f.call(base+'/danmaku',{method:'POST',session:fan,body:{text:secret,username:'fake_author',user_id:owner.user.id}});assert.equal(sent.status,200);
 assert.equal((await f.call(base+'/danmaku',{method:'POST',session:fan,body:{text:'too fast'}})).status,429);
 await f.call(base+'/updates',{method:'POST',session:owner,body:{text:'private-owner-update'}});
 let items=(await f.call(base+'/danmaku',{session:fan})).data.items;assert.equal(items.length,2);assert.equal(items.find(x=>x.kind==='message').username,'wall_friend');assert.equal(items.find(x=>x.kind==='message').canHide,true);assert.equal(items.find(x=>x.kind==='update').canHide,false);
 assert.ok(!JSON.stringify(items).includes('author_id'));assert.ok(!JSON.stringify((await f.call('/api/posts')).data).includes(secret));assert.ok(!JSON.stringify((await f.call('/api/discussions')).data).includes(secret));
 assert.equal((await f.call(base+'/danmaku/'+sent.data.id,{method:'POST',session:other,body:{}})).status,403);
 const admin=await f.admin();assert.equal((await f.call('/api/admin/space-danmaku')).status,401);assert.equal((await f.call('/api/admin/space-danmaku',{session:admin})).data.items[0].space_owner,'wall_owner');
 await f.call('/api/admin/space-danmaku/'+sent.data.id+'/archive',{method:'POST',session:admin,body:{}});assert.equal((await f.call(base+'/danmaku',{session:fan})).data.items.length,1);
 await f.call('/api/admin/space-danmaku/'+sent.data.id+'/restore',{method:'POST',session:admin,body:{}});assert.equal((await f.call(base+'/danmaku',{session:fan})).data.items.length,2);
 f.db.prepare('UPDATE site_users SET disabled=1 WHERE username=?').run('wall_friend');assert.equal((await f.call(base+'/danmaku',{session:owner})).data.items.length,1);f.db.prepare('UPDATE site_users SET disabled=0 WHERE username=?').run('wall_friend');
 await f.call(base+'/unfollow',{method:'POST',session:fan,body:{}});assert.equal((await f.call(base+'/danmaku',{session:fan})).status,403);assert.equal((await f.call(base+'/danmaku',{method:'POST',session:fan,body:{text:'lost permission'}})).status,403);
 assert.equal((await f.call(base+'/danmaku/'+sent.data.id,{method:'POST',session:fan,body:{}})).status,200);assert.equal((await f.call(base+'/danmaku',{session:owner})).data.items.length,1);
 const own=await f.call(base+'/danmaku',{method:'POST',session:owner,body:{text:'owner note'}});assert.equal(own.status,200);assert.equal((await f.call(base+'/danmaku/'+own.data.id,{method:'POST',session:owner,body:{}})).status,200);
 await f.call('/api/admin/space-danmaku/'+sent.data.id+'/restore',{method:'POST',session:admin,body:{}});assert.equal((await f.call(base+'/danmaku/'+sent.data.id,{method:'POST',session:owner,body:{}})).status,200);
 await f.call(base+'/profile',{method:'POST',session:owner,body:{title:'',bio:'',visibility:'public',color:'mint'}});assert.equal((await f.call(base+'/danmaku')).status,200);assert.equal((await f.call(base+'/danmaku',{method:'POST',body:{text:'anonymous'}})).status,401);
});

test('discussion creation binds the real account and moderation controls plaza and wall together',async t=>{
 const f=await fixture(t),form=new FormData();form.set('discussion','1');form.set('discussionTitle','一起聊游戏');form.set('text','你最近在玩什么？');form.set('theme','game');form.set('name','fake_author');
 assert.equal((await f.call('/api/posts',{method:'POST',body:form})).status,401);
 const user=await f.register();assert.equal((await f.call('/api/posts',{method:'POST',body:form,session:user,csrfOverride:'bad'})).status,403);
 const created=await f.call('/api/posts',{method:'POST',body:form,session:user});assert.equal(created.status,200);const id=created.data.post.id;assert.equal(created.data.post.name,'account_one');assert.equal((await f.call('/api/discussions')).data.total,1);
 assert.ok((await f.call('/api/posts')).data.posts.some(p=>p.id===id));
 const reply=await f.call('/api/posts/'+id+'/comments',{method:'POST',body:{text:'一起玩！'},session:user});assert.equal(reply.status,200);assert.equal((await f.call('/api/discussions')).data.items[0].replies,1);assert.equal((await f.call('/api/discussions?sort=unanswered')).data.total,0);
 const admin=await f.admin();await f.call('/api/admin/posts/'+id+'/archive',{method:'POST',session:admin,body:{}});assert.equal((await f.call('/api/discussions')).data.total,0);await f.call('/api/admin/posts/'+id+'/restore',{method:'POST',session:admin,body:{}});assert.equal((await f.call('/api/discussions')).data.total,1);
 form.set('discussionTitle','bad\ntitle');assert.equal((await f.call('/api/posts',{method:'POST',body:form,session:user})).status,400);assert.equal((await f.call('/api/discussions')).data.total,1);
});
test('social inbox isolates recipients, rejects forged read markers, and removes hidden or cancelled activity',async t=>{
 const f=await fixture(t),owner=await f.register('inbox_owner'),friend=await f.register('inbox_friend'),other=await f.register('inbox_other');
 assert.equal((await f.call('/api/social/inbox')).status,401);await f.call('/api/spaces/inbox_owner/follow',{method:'POST',session:friend,body:{}});
 let inbox=(await f.call('/api/social/inbox',{session:owner})).data;assert.equal(inbox.unread,1);assert.equal(inbox.items[0].username,'inbox_friend');assert.equal(inbox.items[0].kind,'follow');assert.equal((await f.call('/api/social/inbox',{session:other})).data.items.length,0);
 assert.equal((await f.call('/api/social/read',{method:'POST',session:owner,body:{keys:[inbox.items[0].key]},csrfOverride:'bad'})).status,403);
 await f.call('/api/social/read',{method:'POST',session:other,body:{keys:[inbox.items[0].key]}});assert.equal((await f.call('/api/social/inbox',{session:owner})).data.unread,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM social_reads WHERE user_id=?').get(other.user.id).n,0);
 await f.call('/api/social/read',{method:'POST',session:owner,body:{keys:[inbox.items[0].key]}});assert.equal((await f.call('/api/social/inbox',{session:owner})).data.unread,0);
 await f.call('/api/spaces/inbox_friend/follow',{method:'POST',session:owner,body:{}});const note=await f.call('/api/spaces/inbox_owner/danmaku',{method:'POST',session:friend,body:{text:'<img src=x onerror=alert(1)> private note'}});assert.equal(note.status,200);
 inbox=(await f.call('/api/social/inbox',{session:owner})).data;assert.equal(inbox.unread,1);assert.equal(inbox.items.find(x=>x.kind==='danmaku').href,'/space');assert.ok(!JSON.stringify(inbox).includes('author_id'));assert.ok(!(await f.call('/api/social/inbox',{session:other})).data.items.some(x=>x.kind==='danmaku'));
 await f.call('/api/spaces/inbox_owner/danmaku/'+note.data.id,{method:'POST',session:owner,body:{}});assert.equal((await f.call('/api/social/inbox',{session:owner})).data.items.length,1);
 await f.call('/api/spaces/inbox_owner/unfollow',{method:'POST',session:friend,body:{}});assert.equal((await f.call('/api/social/inbox',{session:owner})).data.items.length,0);
 await f.call('/api/spaces/inbox_owner/follow',{method:'POST',session:friend,body:{}});assert.equal((await f.call('/api/social/inbox',{session:owner})).data.unread,1);f.db.prepare('UPDATE site_users SET disabled=1 WHERE id=?').run(friend.user.id);assert.equal((await f.call('/api/social/inbox',{session:owner})).data.items.length,0);assert.equal((await f.call('/api/social/inbox',{session:friend})).status,401);
});
test('comment inbox targets post and reply owners once and respects archived roots and posts',async t=>{
 const f=await fixture(t),owner=await f.register('notify_owner'),fan=await f.register('notify_friend'),third=await f.register('notify_third'),form=new FormData();form.set('text','inbox post');form.set('theme','daily');const post=(await f.call('/api/posts',{method:'POST',session:owner,body:form})).data.post;
 const root=(await f.call('/api/posts/'+post.id+'/comments',{method:'POST',session:fan,body:{text:'root comment'}})).data.comment;
 let inbox=(await f.call('/api/social/inbox',{session:owner})).data;assert.equal(inbox.items.length,1);assert.equal(inbox.items[0].kind,'comment');assert.equal(inbox.items[0].href,'/post/'+post.id+'#comment-'+root.id);assert.equal((await f.call('/api/social/inbox',{session:fan})).data.items.length,0);
 const reply=(await f.call('/api/posts/'+post.id+'/comments',{method:'POST',session:third,body:{text:'reply comment',parent_id:root.id}})).data.comment;inbox=(await f.call('/api/social/inbox',{session:fan})).data;assert.equal(inbox.items[0].kind,'reply');assert.equal(inbox.items[0].key,'comment:'+reply.id);assert.equal((await f.call('/api/social/inbox',{session:owner})).data.items.length,2);
 const admin=await f.admin();await f.call('/api/admin/comments/'+root.id+'/archive',{method:'POST',session:admin,body:{}});assert.equal((await f.call('/api/social/inbox',{session:owner})).data.items.length,0);assert.equal((await f.call('/api/social/inbox',{session:fan})).data.items.length,0);
 await f.call('/api/admin/comments/'+root.id+'/restore',{method:'POST',session:admin,body:{}});await f.call('/api/admin/posts/'+post.id+'/archive',{method:'POST',session:admin,body:{}});assert.equal((await f.call('/api/social/inbox',{session:owner})).data.items.length,0);assert.equal((await f.call('/api/social/inbox',{session:fan})).data.items.length,0);
});
async function fixture(t,{secure=false}={}){
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'sj-account-'));await fs.writeFile(path.join(data,'admin-auth.json'),JSON.stringify(await createAccount(adminPassword)));
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
 const admin=async()=>{const r=await call('/api/admin/login',{method:'POST',body:{username:'admin',password:adminPassword}});assert.equal(r.status,200);return {...r.data,cookie:r.cookie.split(';')[0]};};
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
 const next='New_pw_42';const changed=await f.call('/api/auth/password',{method:'POST',session:first,body:{currentPassword:password,password:next}});assert.equal(changed.status,200);assert.equal((await f.call('/api/auth/status',{session:second})).data.user,null);
 assert.equal((await f.login('account_one',password)).status,401);assert.equal((await f.login('account_one',next)).status,200);
 let last;for(let i=0;i<13;i++)last=await f.login('unknown_name',password);assert.equal(last.status,429);
});

test('replies preserve old comments, bind real authors, validate targets, and respect moderation',async t=>{
 const f=await fixture(t),one=await f.register(),two=await f.register('reply_other'),admin=await f.admin();
 const now=Date.now();
 for(const text of ['discussion','another post'])f.db.prepare("INSERT INTO posts(text,name,theme,created_at) VALUES(?,'legacy','daily',?)").run(text,now);
 f.db.prepare("INSERT INTO comments(post_id,text,name,created_at) VALUES(1,'Original old comment','历史用户',?)").run(now);
 const route='/api/posts/1/comments',write=(body,session=one)=>f.call(route,{method:'POST',body,session});
 const old=(await f.call(route)).data.comments[0];assert.equal(old.id,1);assert.equal(old.parent_id,null);assert.equal(old.thread_id,null);
 const ordinary=await write({text:'A normal comment'});assert.equal(ordinary.status,200);assert.equal(ordinary.data.comment.parent_id,null);
 const reply=await write({text:'Reply to old comment',parent_id:1,name:'fake_author',reply_to_name:'fake_target',thread_id:999},two);assert.equal(reply.status,200);
 const child=reply.data.comment;assert.equal(child.name,'reply_other');assert.equal(child.reply_to_name,'历史用户');assert.equal(child.parent_id,1);assert.equal(child.thread_id,1);
 const nested=await write({text:'Reply to the reply',parent_id:child.id});assert.equal(nested.status,200);assert.equal(nested.data.comment.thread_id,1);assert.equal(nested.data.comment.parent_id,child.id);assert.equal(nested.data.comment.reply_to_name,'reply_other');
 assert.equal(f.db.prepare('SELECT user_id FROM comments WHERE id=?').get(child.id).user_id,two.user.id);
 assert.equal((await f.call('/api/posts/2/comments',{method:'POST',body:{text:'wrong post',parent_id:1},session:one})).status,404);
 assert.equal((await write({text:'missing',parent_id:99999})).status,404);
 assert.equal((await write({text:'invalid',parent_id:'1'})).status,400);
 assert.equal((await f.call(route,{method:'POST',body:{text:'unsigned',parent_id:1}})).status,401);
 assert.equal((await f.call(route,{method:'POST',body:{text:'bad csrf',parent_id:1},session:one,csrfOverride:'bad'})).status,403);
 const count=f.db.prepare('SELECT COUNT(*) n FROM comments').get().n;assert.equal(count,4);
 const manage=async(id,action)=>{const r=await f.call('/api/admin/comments/'+id+'/'+action,{method:'POST',body:{},session:admin});assert.equal(r.status,200);};
 await manage(child.id,'archive');const moderated=(await f.call(route)).data.comments;
 assert.ok(!moderated.some(c=>c.id===child.id));assert.equal(moderated.find(c=>c.id===nested.data.comment.id).reply_to_name,null);assert.ok(!JSON.stringify(moderated).includes('reply_other'));
 assert.equal((await write({text:'hidden target',parent_id:child.id})).status,404);
 await manage(child.id,'restore');assert.equal((await f.call(route)).data.comments.find(c=>c.id===nested.data.comment.id).reply_to_name,'reply_other');
 await manage(1,'archive');assert.deepEqual((await f.call(route)).data.comments.map(c=>c.id),[ordinary.data.comment.id]);
 assert.equal((await write({text:'hidden root',parent_id:nested.data.comment.id})).status,404);
 await manage(1,'restore');const restored=(await f.call(route)).data.comments;
 assert.equal(restored.length,4);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM comments').get().n,count);assert.ok(restored.every(c=>!('ip' in c)&&!('user_id' in c)));
 const management=await f.call('/api/admin/comments',{session:admin});assert.equal(management.data.items.find(c=>c.id===child.id).parent_id,1);
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
test('new passwords accept 6 through 12 characters and existing longer passwords remain usable',async t=>{
 const f=await fixture(t);
 for(const [name,pwd,status] of [['bound_five','12345',400],['bound_six','123456',200],['bound_twelve','123456789012',200],['bound_thirteen','1234567890123',400]]){
  const r=await f.call('/api/auth/register',{method:'POST',body:{username:name,password:pwd,accept:true}});assert.equal(r.status,status);
 }
 const legacy='Existing-longer-password-42',old=await createAccount(legacy,'legacy_user'),now=Date.now();
 f.db.prepare('INSERT INTO site_users(username,salt,password_hash,created_at,last_login) VALUES(?,?,?,?,?)').run('legacy_user',old.salt,old.key,now,now);
 const logged=await f.login('legacy_user',legacy);assert.equal(logged.status,200);
 assert.equal((await f.call('/api/auth/password',{method:'POST',session:logged,body:{currentPassword:legacy,password:'1234567890123'}})).status,400);
 assert.equal((await f.call('/api/auth/password',{method:'POST',session:logged,body:{currentPassword:legacy,password:'123456'}})).status,200);
 assert.equal((await f.login('legacy_user','123456')).status,200);
});
