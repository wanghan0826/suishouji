#!/usr/bin/env node
// Owner runs this interactively in the server terminal; no credential is embedded in source.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createAccount} from './admin-service.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const data=path.resolve(process.env.DATA_DIR || path.join(root,'data'));
const ask=(prompt,hidden=false)=>new Promise(resolve=>{
  process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();let value='';
  const handler=buffer=>{for(const char of buffer.toString('utf8')){if(char==='\u0003'){process.stdout.write('\n已取消。\n');process.exit(1);}if(char==='\r'||char==='\n'){process.stdin.off('data',handler);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');resolve(value);return;}if(char==='\u007f'||char==='\b'){if(value){value=value.slice(0,-1);if(!hidden)process.stdout.write('\b \b');}}else if(char>=' '){value+=char;if(!hidden)process.stdout.write(char);}}};process.stdin.on('data',handler);
});
if(!process.stdin.isTTY)throw Error('请由站主在交互式终端中运行此命令。');
const username=(await ask('管理用户名（默认 admin）：')).trim()||'admin';
const first=await ask('设置管理密码（至少12位，输入不回显）：',true);
const again=await ask('再次输入密码：',true);
if(first!==again)throw Error('两次密码不一致，未保存任何修改。');
const account=await createAccount(first,username);
await fs.mkdir(data,{recursive:true});
const target=path.join(data,'admin-auth.json'),temp=target+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
await fs.writeFile(temp,JSON.stringify(account),{mode:0o600,flag:'wx'});await fs.rename(temp,target);await fs.chmod(target,0o600);
const db=new DatabaseSync(path.join(data,'wall.db'));
if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='admin_sessions'").get())db.exec('DELETE FROM admin_sessions');
db.close();console.log('管理账户已保存，原有管理会话已注销。请通过 HTTPS 打开 /admin 登录。');
