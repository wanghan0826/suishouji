/* Repeating an unchanged publish request must confirm the original post. */
import {createHash} from 'node:crypto';

export function ensurePostRequests(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS post_requests(
    user_id INTEGER NOT NULL, request_key TEXT NOT NULL,
    fingerprint TEXT NOT NULL, post_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(user_id,request_key)
  )`);
}

const fail=(status,message)=>Object.assign(new Error(message),{status});
export function postRequestKey(value) {
  if(value===undefined)return '';
  if(typeof value!=='string'||! /^[a-zA-Z0-9_-]{16,80}$/.test(value))throw fail(400,'发布凭据无效，请刷新后重试');
  return value;
}

export function postFingerprint(fields,bytes) {
  const hash=createHash('sha256').update(JSON.stringify(fields));
  if(bytes)hash.update(bytes);
  return hash.digest('hex');
}

export function findPostRequest(db,request) {
  if(!request.key)return null;
  const row=db.prepare('SELECT fingerprint,post_id FROM post_requests WHERE user_id=? AND request_key=?').get(request.userId,request.key);
  if(!row)return null;
  if(row.fingerprint!==request.fingerprint)throw fail(409,'这次发布的内容已变化，请重新确认后发布');
  const post=db.prepare("SELECT id FROM posts p WHERE p.id=? AND p.user_id=? AND NOT EXISTS(SELECT 1 FROM admin_archive a WHERE a.kind='post' AND a.item_id=p.id)").get(row.post_id,request.userId);
  if(!post)throw fail(410,'这条帖子已下架或移除，不会重复发布');
  return Number(row.post_id);
}

export function commitPostRequest(db,request,createPost) {
  db.exec('BEGIN IMMEDIATE');
  try {
    // Recheck after asynchronous media writes: simultaneous retries can race.
    const existing=findPostRequest(db,request);
    if(existing!==null){db.exec('COMMIT');return {id:existing,replayed:true};}
    const id=Number(createPost());
    if(request.key)db.prepare('INSERT INTO post_requests VALUES(?,?,?,?,?)').run(request.userId,request.key,request.fingerprint,id,Date.now());
    db.exec('COMMIT');
    return {id,replayed:false};
  } catch(error) {db.exec('ROLLBACK');throw error;}
}
