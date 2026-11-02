import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';import crypto from 'node:crypto';

test('unchanged drafts retain their operation after retry, while edits, attachment replacement, account switches and resets create a new one',async()=>{
 const form=new EventTarget(),document=new EventTarget(),window={SJAuth:{user:{id:7}}};
 vm.runInNewContext(await fs.readFile(new URL('../public/post-request.js',import.meta.url),'utf8'),{window,document,crypto:crypto.webcrypto,Blob,Uint8Array});
 const request=window.SJPostRequests.attach(form),image=new File(['photo'],'same.png',{type:'image/png',lastModified:42});
 const data=(text='草稿',file=image)=>{const f=new FormData();f.set('text',text);f.set('media',file);return f;};
 const first=request.key(data());assert.match(first,/^[a-f0-9]{32}$/);assert.equal(request.key(data()),first);
 const changed=request.key(data('改过的草稿'));assert.notEqual(changed,first);assert.equal(request.key(data('改过的草稿')),changed);
 const replaced=request.key(data('改过的草稿',new File(['other'],'same.png',{type:'image/png',lastModified:42})));assert.notEqual(replaced,changed);
 const beforeSwitch=request.key(data());window.SJAuth.user.id=8;assert.notEqual(request.key(data()),beforeSwitch);
 for(const event of ['reset','change','sj:logout']){const before=request.key(data());(event==='sj:logout'?document:form).dispatchEvent(new Event(event));assert.notEqual(request.key(data()),before);}
});
