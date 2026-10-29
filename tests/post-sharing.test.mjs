import test from 'node:test';import assert from 'node:assert/strict';import {postShareInfo,renderPostShareHtml} from '../scripts/post-sharing.mjs';
const template='<head><title>Generic</title><meta name="description" content="generic"></head>';
test('share crawlers receive post-specific titles, descriptions and absolute public covers without JavaScript',()=>{
 const p={id:29,text:'【标题】\n正文内容 https://example.com/source',name:'taid1',media:'picture.png',media_type:'image'},info=postShareInfo(p,'https://example.com');
 assert.equal(info.title,'标题');assert.equal(info.description,'正文内容');assert.equal(info.url,'https://example.com/post/29');assert.equal(info.image,'https://example.com/uploads/picture.png');
 const html=renderPostShareHtml(template,p,'https://example.com');assert.match(html,/<meta property="og:title" content="标题 · 随手记">/);assert.ok(html.includes('property="og:image"'));assert.ok(html.includes('rel="canonical"'));assert.ok(!html.includes('generic'));
 assert.equal(postShareInfo({...p,media_type:'video'},'https://example.com').image,'https://example.com/assets/lake.jpg');
 assert.equal(renderPostShareHtml(template,null,'https://example.com'),template);
});
test('untrusted post text cannot become share-page markup or replacement tokens',()=>{
 const p={id:2,text:'【<script>alert(1)</script> $&】\n" onload="bad & more',name:'author',media:'',media_type:''};
 const html=renderPostShareHtml(template,p,'https://example.com');assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('$&amp;'));assert.ok(html.includes('&quot; onload=&quot;'));assert.equal((html.match(/<title>/g)||[]).length,1);
});
