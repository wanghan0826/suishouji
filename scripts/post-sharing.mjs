const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function postShareInfo(post,origin){
 const lines=post.text.split('\n'),heading=lines.length>1&&lines[0].length<=90;
 const title=heading?lines.shift().replace(/^【|】$/g,''):(post.name||'小伙伴')+'的分享';
 const description=(heading?lines.join(' '):post.text).replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim().slice(0,100)||'来随手记，看看这条分享。';
 return {title,description,url:origin+'/post/'+post.id,image:origin+(post.media&&post.media_type==='image'?'/uploads/'+encodeURIComponent(post.media):'/assets/lake.jpg')};
}
export function renderPostShareHtml(template,post,origin){
 if(!post)return template;
 const info=postShareInfo(post,origin),title=escape(info.title+' · 随手记'),description=escape(info.description),image=escape(info.image),url=escape(info.url);
 const tags=`<link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:site_name" content="随手记">
<meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${url}"><meta property="og:image" content="${image}"><meta property="og:image:alt" content="${escape(info.title)}">
<meta itemprop="name" content="${title}"><meta itemprop="description" content="${description}"><meta itemprop="image" content="${image}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${image}">`;
 return template.replace(/<title>[\s\S]*?<\/title>/,()=>'<title>'+title+'</title>').replace(/<meta name="description"[^>]*>/,()=>'<meta name="description" content="'+description+'">').replace('</head>',()=>tags+'\n</head>');
}
