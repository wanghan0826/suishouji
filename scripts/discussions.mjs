import {publicCommentVisible} from './comment-threads.mjs';
export function ensureDiscussions(db){db.exec('CREATE TABLE IF NOT EXISTS discussion_posts(post_id INTEGER PRIMARY KEY)');}
export function discussionText(fields){
 const title=String(fields.discussionTitle||'').trim(),body=String(fields.text||'').trim();
 if(!title||title.length>60||/[\r\n]/.test(title))throw Error('话题标题须为1–60字，不能换行');
 if(!body||body.length>430)throw Error('请填写1–430字的话题内容');
 return `【讨论｜${title}】\n${body}`;
}
export function readDiscussions(db,url){
 const sort=url.searchParams.get('sort')||'active',theme=url.searchParams.get('theme')||'',q=(url.searchParams.get('q')||'').trim(),page=Number(url.searchParams.get('page')||1);
 if(!['active','new','unanswered'].includes(sort)||q.length>80||!Number.isInteger(page)||page<1||page>10000)throw Error('筛选条件无效');
 const where=["NOT EXISTS(SELECT 1 FROM admin_archive a WHERE a.kind='post' AND a.item_id=p.id)"],args=[];
 if(theme){where.push('p.theme=?');args.push(theme);}
 if(q){where.push("p.text LIKE ? ESCAPE '\\'");args.push('%'+q.replace(/[\\%_]/g,'\\$&')+'%');}
 const visible=publicCommentVisible();
 if(sort==='unanswered')where.push(`NOT EXISTS(SELECT 1 FROM comments c WHERE c.post_id=p.id AND ${visible})`);
 const base=`FROM discussion_posts d JOIN posts p ON p.id=d.post_id WHERE ${where.join(' AND ')}`;
 const total=db.prepare('SELECT COUNT(*) total '+base).get(...args).total;
 const items=db.prepare(`SELECT p.id,p.text,p.name,p.theme,p.media,p.media_type,p.created_at,p.hearts,(SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id AND ${visible}) replies,MAX(p.created_at,COALESCE((SELECT MAX(c.created_at) FROM comments c WHERE c.post_id=p.id AND ${visible}),0)) activity ${base} ORDER BY ${sort==='active'?'activity':'p.created_at'} DESC,p.id DESC LIMIT 20 OFFSET ?`).all(...args,(page-1)*20);
 return {items,total,page,pages:Math.max(1,Math.ceil(total/20))};
}
