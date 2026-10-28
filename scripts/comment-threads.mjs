// Existing comments remain root comments; replies keep their direct target and root.
export function ensureCommentThreads(db){
 const columns=new Set(db.prepare('PRAGMA table_info(comments)').all().map(c=>c.name));
 db.exec('BEGIN IMMEDIATE');
 try{
  for(const column of ['parent_id','thread_id'])if(!columns.has(column))db.exec(`ALTER TABLE comments ADD COLUMN ${column} INTEGER`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_comments_thread ON comments(post_id,thread_id,id)');
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
}
const visible=alias=>`NOT EXISTS(SELECT 1 FROM admin_archive a WHERE a.kind='comment' AND a.item_id=${alias}.id)`;
export function publicCommentVisible(alias='c'){
 return `${visible(alias)} AND (${alias}.thread_id IS NULL OR EXISTS(SELECT 1 FROM comments root WHERE root.id=${alias}.thread_id AND root.post_id=${alias}.post_id AND ${visible('root')}))`;
}
export function readPublicComments(db,postId){
 return db.prepare(`SELECT c.id,c.text,c.name,c.created_at,c.parent_id,c.thread_id,
 CASE WHEN target.id IS NOT NULL AND ${visible('target')} THEN target.name ELSE NULL END reply_to_name
 FROM comments c LEFT JOIN comments target ON target.id=c.parent_id AND target.post_id=c.post_id
 WHERE c.post_id=? AND ${publicCommentVisible()}
 ORDER BY COALESCE(c.thread_id,c.id),CASE WHEN c.thread_id IS NULL THEN 0 ELSE 1 END,c.created_at,c.id LIMIT 200`).all(postId);
}
export function findReplyTarget(db,postId,parentId){
 return db.prepare(`SELECT c.id,c.name,c.thread_id FROM comments c WHERE c.id=? AND c.post_id=? AND ${publicCommentVisible()}`).get(parentId,postId);
}
