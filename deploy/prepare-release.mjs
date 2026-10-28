import fs from 'node:fs';
const sha=process.env.RELEASE_SHA;
if(!/^[a-f0-9]{40}$/.test(sha||''))throw Error('Invalid release commit');
const file='public/index.html';
fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/((?:src|href)="\/[^"?]+\.(?:js|css))(?:\?[^" ]*)?"/g,'$1?v='+sha+'"'));
