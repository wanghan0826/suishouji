import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {DatabaseSync} from 'node:sqlite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),data=path.resolve(process.env.DATA_DIR||path.join(root,'data'));
const db=new DatabaseSync(path.join(data,'wall.db'));
if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='posts'").get())throw Error('Start the server once before adding demo content');
if(db.prepare('SELECT count(*) n FROM posts').get().n)throw Error('Demo content is only allowed in an empty site');
await fs.mkdir(path.join(data,'uploads'),{recursive:true});
const demos=[['lake.jpg','scene','把脚步放慢，把风景装进口袋'],['coffee.jpg','daily','一杯咖啡的时间，留给自己'],['plants.jpg','life','新叶慢慢长，日子也可以慢慢过'],['travel.jpg','travel','下一次出发，给自己留一点空白']];
for(const [image,theme,text] of demos){await fs.copyFile(path.join(root,'public/assets',image),path.join(data,'uploads','demo-'+image));db.prepare('INSERT INTO posts(text,name,theme,media,media_type,created_at) VALUES(?,?,?,?,?,?)').run(text+'（部署示例内容，配图来自 Unsplash）','站点示例',theme,'demo-'+image,'image',Date.now());}
db.close();console.log('Added 4 clearly labeled demo posts. No production data was imported.');
