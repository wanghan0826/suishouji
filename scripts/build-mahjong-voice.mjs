// Build the static voice sprite from numbered 00.mp3 … 33.mp3 clips.
// node scripts/build-mahjong-voice.mjs <clip-directory> [ffmpeg-executable]
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const folder=process.argv[2],ffmpeg=process.argv[3]||'ffmpeg',rate=24000;
if(!folder)throw Error('Provide a directory containing numbered Mandarin voice clips');
const names=['万','筒','条'].flatMap(s=>[...'一二三四五六七八九'].map(n=>n+s)).concat(['东风','南风','西风','北风','红中','发财','白板']);
const buffers=[],cues=[];let offset=0;
for(const [index,name]of names.entries()){
  const decoded=spawnSync(ffmpeg,['-v','error','-i',path.join(folder,String(index).padStart(2,'0')+'.mp3'),'-f','s16le','-ar',String(rate),'-ac','1','pipe:1'],{maxBuffer:2*1024*1024,windowsHide:true});
  if(decoded.status!==0)throw Error('Cannot decode '+name);
  const data=decoded.stdout,samples=Array.from({length:data.length/2},(_,i)=>data.readInt16LE(i*2)),peak=Math.max(...samples.map(Math.abs)),threshold=Math.max(45,peak*.006);
  const first=samples.findIndex(n=>Math.abs(n)>threshold),last=samples.findLastIndex(n=>Math.abs(n)>threshold);
  if(first<0||last-first<rate*.18)throw Error('Empty voice clip: '+name);
  const start=Math.max(0,first-Math.round(rate*.015)),end=Math.min(samples.length,last+Math.round(rate*.06)),length=end-start,pcm=Buffer.alloc(length*2),level=Math.min(3,26000/peak),fade=Math.round(rate*.006);
  for(let i=0;i<length;i++)pcm.writeInt16LE(Math.round(samples[start+i]*level*Math.min(1,i/fade,(length-1-i)/fade)),i*2);
  cues.push([offset,length]);offset+=length;buffers.push(pcm);
}
const header=Buffer.alloc(44),bytes=offset*2;
header.write('RIFF');header.writeUInt32LE(bytes+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(bytes,40);
const audio=Buffer.concat([header,...buffers]),hash=createHash('sha256').update(audio).digest('hex').slice(0,8),file='mahjong-female-'+hash+'.wav';
fs.writeFileSync(fileURLToPath(new URL('../public/assets/'+file,import.meta.url)),audio);
console.log(JSON.stringify({file,rate,cues,names,bytes:audio.length}));
