import fs from 'node:fs';
const sha=process.env.RELEASE_SHA;
if(!/^[a-f0-9]{40}$/.test(sha||''))throw Error('Invalid release commit');
for(const file of ['public/index.html','public/post.html','public/plaza.html','public/space.html','public/friends.html']){
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/((?:src|href)="\/[^"?]+\.(?:js|css))(?:\?[^" ]*)?"/g,'$1?v='+sha+'"'));
}
