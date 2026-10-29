import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import net from 'node:net';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
test('fresh deployment uses independent data and serves the complete application',async t=>{
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'suishouji-startup-'));
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const env={...process.env,PORT:String(port),EXTRA_PORTS:'',DATA_DIR:data,SITE_ORIGIN:'http://localhost:'+port};
 const child=spawn(process.execPath,['server.mjs'],{env,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
 t.after(async()=>{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));await fs.rm(data,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+port;let ready=false;
 for(let i=0;i<80;i++){try{if((await fetch(base+'/api/topic')).ok){ready=true;break;}}catch{}await delay(50);}
 assert.ok(ready,logs);
 for(const route of ['/','/appearance.js','/wall.js','/post.js','/post.css','/assets/lake.jpg','/admin'])assert.equal((await fetch(base+route)).status,200,route);
 const missing=await fetch(base+'/post/999');assert.equal(missing.status,404);assert.match(await missing.text(),/id="postState"/);
 assert.equal((await(await fetch(base+'/api/posts')).json()).posts.length,0);
 assert.equal((await(await fetch(base+'/api/admin/status')).json()).configured,false);
 assert.equal((await fetch(base+'/api/admin/overview')).status,401);
 const seed=spawn(process.execPath,['scripts/seed-demo.mjs'],{env,stdio:['ignore','pipe','pipe']});let seedLogs='';seed.stderr.on('data',x=>seedLogs+=x);assert.equal(await new Promise(r=>seed.once('exit',r)),0,seedLogs);
 const posts=(await(await fetch(base+'/api/posts')).json()).posts;assert.equal(posts.length,4);assert.ok(posts.every(p=>p.name==='站点示例'));
 const permalink=base+'/post/'+posts[0].id;
 for(const route of [permalink,permalink+'/']){const page=await fetch(route);assert.equal(page.status,200);const html=await page.text();assert.match(html,/id="postArticle"/);assert.match(html,/property="og:title"/);assert.match(html,/property="og:image"/);assert.ok(html.includes('http://localhost:'+port+'/post/'+posts[0].id));}
 const detail=(await(await fetch(base+'/api/posts/'+posts[0].id)).json()).post;assert.equal(detail.text,posts[0].text);assert.ok(!('ip' in detail));assert.ok(!('user_id' in detail));
 assert.equal((await fetch(base+'/uploads/'+posts[0].media)).status,200);
 const repeat=spawn(process.execPath,['scripts/seed-demo.mjs'],{env,stdio:'ignore'});assert.notEqual(await new Promise(r=>repeat.once('exit',r)),0);
 assert.equal((await(await fetch(base+'/api/posts')).json()).posts.length,4);
});
