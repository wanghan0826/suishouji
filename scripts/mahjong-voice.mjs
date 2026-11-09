const fail=(status,message)=>Object.assign(Error(message),{status});
export const VOICE_MAX_BYTES=512*1024;
export function parseVoice(input){
  const mime=typeof input.mime==='string'?input.mime.split(';')[0].trim().toLowerCase():'',duration=input.duration;
  if(!['audio/webm','audio/ogg','audio/mp4'].includes(mime))throw fail(415,'浏览器录音格式暂不支持');
  if(!Number.isInteger(duration)||duration<500||duration>30000)throw fail(400,'语音长度需要在0.5至30秒之间');
  if(typeof input.audio!=='string'||input.audio.length>Math.ceil(VOICE_MAX_BYTES/3)*4)throw fail(413,'语音文件过大，请缩短后重试');
  if(input.audio.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.audio))throw fail(400,'语音内容无效');
  const audio=Buffer.from(input.audio,'base64');
  if(audio.toString('base64')!==input.audio)throw fail(400,'语音内容无效');
  if(audio.length<64||audio.length>VOICE_MAX_BYTES)throw fail(400,'没有录到有效的声音');
  const valid=mime==='audio/webm'?audio.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])):mime==='audio/ogg'?audio.toString('ascii',0,4)==='OggS':audio.toString('ascii',4,8)==='ftyp';
  if(!valid)throw fail(415,'语音文件格式与内容不一致');
  return {mime,duration,audio};
}
export function sendVoice(req,res,record){
  const audio=Buffer.from(record.audio),headers={'Content-Type':record.mime,'Cache-Control':'no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Accept-Ranges':'bytes'};
  let start=0,end=audio.length-1,status=200;
  if(req.headers.range){
    const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    if(!match||Number(match[1])>=audio.length||match[2]&&Number(match[2])<Number(match[1])){res.writeHead(416,{...headers,'Content-Range':'bytes */'+audio.length});res.end();return;}
    start=Number(match[1]);end=match[2]?Math.min(end,Number(match[2])):end;status=206;headers['Content-Range']=`bytes ${start}-${end}/${audio.length}`;
  }
  res.writeHead(status,{...headers,'Content-Length':end-start+1});res.end(audio.subarray(start,end+1));
}
