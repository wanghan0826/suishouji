import {publicCommentVisible} from './comment-threads.mjs';
export const SECTIONS={game:'游戏交流',news:'游戏资讯',life:'生活日常'};
export const GAME_TAGS={word:'同频猜词',valorant:'无畏契约',hok:'王者荣耀',lol:'英雄联盟',cs:'CS',other:'其他游戏'};
const own=(o,k)=>Object.hasOwn(o,k);
export function channelInput(fields){
 const section=fields.section|| (fields.theme==='game'?'game':'life'),gameTag=fields.gameTag||'';
 if(!own(SECTIONS,section)||gameTag&&(!own(GAME_TAGS,gameTag)||section==='life'))throw Error('请选择有效分区和游戏标签');
 return {section,gameTag};
}
export function ensureCommunity(db){
 db.exec("CREATE TABLE IF NOT EXISTS post_channels(post_id INTEGER PRIMARY KEY,section TEXT NOT NULL CHECK(section IN ('game','news','life')),game_tag TEXT NOT NULL DEFAULT '');CREATE INDEX IF NOT EXISTS post_channels_section ON post_channels(section,game_tag,post_id);");
 // Only unclassified public posts are assigned. Explicit choices survive restarts.
 db.exec("INSERT OR IGNORE INTO post_channels(post_id,section) SELECT id,CASE WHEN theme='game' THEN 'game' ELSE 'life' END FROM posts");
}
export function channelFilter(url,conditions,args,alias='p'){
 const section=url.searchParams.get('section')||'',gameTag=url.searchParams.get('tag')||'';
 if(section&&!own(SECTIONS,section)||gameTag&&!own(GAME_TAGS,gameTag)||section==='life'&&gameTag)throw Error('分区筛选无效');
 if(section){conditions.push(`COALESCE((SELECT pc.section FROM post_channels pc WHERE pc.post_id=${alias}.id),CASE WHEN ${alias}.theme='game' THEN 'game' ELSE 'life' END)=?`);args.push(section);}
 if(gameTag){conditions.push(`EXISTS(SELECT 1 FROM post_channels pc WHERE pc.post_id=${alias}.id AND pc.game_tag=?)`);args.push(gameTag);}
}
export function readCommunity(db,url){
 const page=Number(url.searchParams.get('page')||1),sort=url.searchParams.get('sort')||'new',q=(url.searchParams.get('q')||'').trim();
 if(!Number.isSafeInteger(page)||page<1||page>10000||!['new','active','unanswered'].includes(sort)||q.length>80)throw Error('筛选条件无效');
 const where=["NOT EXISTS(SELECT 1 FROM admin_archive a WHERE a.kind='post' AND a.item_id=p.id)"],args=[];
 channelFilter(url,where,args);
 const theme=url.searchParams.get('theme')||'';if(theme){where.push('p.theme=?');args.push(theme);}
 if(q){where.push("p.text LIKE ? ESCAPE '\\'");args.push('%'+q.replace(/[\\%_]/g,'\\$&')+'%');}
 const visible=publicCommentVisible();if(sort==='unanswered')where.push(`NOT EXISTS(SELECT 1 FROM comments c WHERE c.post_id=p.id AND ${visible})`);
 const base=`FROM posts p LEFT JOIN post_channels pc ON pc.post_id=p.id WHERE ${where.join(' AND ')}`;
 const total=db.prepare('SELECT COUNT(*) total '+base).get(...args).total;
 const items=db.prepare(`SELECT p.id,p.text,p.name,p.theme,p.media,p.media_type,p.created_at,p.hearts,COALESCE(pc.section,CASE WHEN p.theme='game' THEN 'game' ELSE 'life' END) section,COALESCE(pc.game_tag,'') gameTag,(SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id AND ${visible}) replies,MAX(p.created_at,COALESCE((SELECT MAX(c.created_at) FROM comments c WHERE c.post_id=p.id AND ${visible}),0)) activity ${base} ORDER BY ${sort==='active'?'activity':'p.created_at'} DESC,p.id DESC LIMIT 20 OFFSET ?`).all(...args,(page-1)*20);
 return {items,total,page,pages:Math.max(1,Math.ceil(total/20))};
}
