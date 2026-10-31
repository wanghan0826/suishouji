#!/usr/bin/env node
/* 随手记 · 弹幕分享站：零依赖 Node 后端（SQLite + 媒体上传 + 评论 + 签到 + 话题 + 静态托管） */
import http from 'node:http';
import {createSpaces} from './scripts/spaces.mjs';
import {ensureDiscussions,discussionText,readDiscussions} from './scripts/discussions.mjs';
import {createAnalytics} from './scripts/analytics.mjs';
import { createAdminService } from './admin-service.mjs';
import {createUserAuth} from './scripts/user-auth.mjs';
import {findReplyTarget,readPublicComments} from './scripts/comment-threads.mjs';
import {renderPostShareHtml} from './scripts/post-sharing.mjs';
import { stat, mkdir, writeFile, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'http://localhost:8080';
const site = new URL(SITE_ORIGIN);
if (site.origin !== SITE_ORIGIN) throw Error('SITE_ORIGIN must be an origin without a trailing slash or path');
const localHttp = site.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(site.hostname);
if (site.protocol !== 'https:' && !localHttp) throw Error('Public deployments require an HTTPS SITE_ORIGIN');
const HOST = localHttp ? '127.0.0.1' : (process.env.HOST || '127.0.0.1');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const UPLOADS = path.join(DATA, 'uploads');
await mkdir(UPLOADS, { recursive: true });

const PORT = Number(process.env.PORT || 8080);
const EXTRA_PORTS = (process.env.EXTRA_PORTS || '').split(',').map(s => Number(s.trim())).filter(Boolean);
const MAX_UPLOAD = 60 * 1024 * 1024;
const MAX_TEXT = 500;
const MAX_NAME = 12;
const MAX_COMMENT = 200;

/* ---------- 每日话题库（按年积日轮换） ---------- */
const TOPICS = [
  '今天最开心的一件事', '你最近在追什么剧', '今天的天空是什么颜色',
  '说一个今天吃到的好吃的', '此刻最想做的事', '分享一张你拍的照片',
  '今天遇到的小确幸', '你最近单曲循环的歌', '说一句想对某人说的话',
  '今天的摸鱼时刻', '推荐一部你喜欢的电影', '你现在最想去哪里',
  '今天学到了什么', '晒一晒你的书桌或工位', '说一个你的小怪癖',
  '今天的心情打几分', '你养过或想养什么宠物', '最近让你笑出声的事',
  '童年最怀念的东西', '如果明天放假你会干嘛', '今天喝了什么',
  '分享一个冷知识', '说一个你的小愿望', '今天运动了吗',
  '最近买到的好东西', '你理想中的周末', '一件一直想做没做的事',
  '今天谁帮了你', '用三个词形容今天', '你最近在玩什么游戏',
  '深夜最想说的话', '今天路上看到了什么',
];
function dayOfYear(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}
function todayTopic() {
  const d = new Date();
  const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return { date: dateStr, topic: TOPICS[dayOfYear(d) % TOPICS.length] };
}

/* ---------- 数据库 ---------- */
const db = new DatabaseSync(path.join(DATA, 'wall.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS posts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT 'mood',
  media TEXT NOT NULL DEFAULT '',
  media_type TEXT NOT NULL DEFAULT '',
  hearts INTEGER NOT NULL DEFAULT 0,
  ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE TABLE IF NOT EXISTS comments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);
CREATE TABLE IF NOT EXISTS checkins(
  ip TEXT PRIMARY KEY,
  streak INTEGER NOT NULL DEFAULT 1,
  total INTEGER NOT NULL DEFAULT 1,
  last_checkin INTEGER NOT NULL
);
`);
// 迁移：老库补 topic 列
try { db.exec('ALTER TABLE posts ADD COLUMN topic TEXT NOT NULL DEFAULT ""'); } catch {}

const THEMES = new Set([
  'mood', 'daily', 'scene', 'food', 'vent', 'secret',
  'game', 'campus', 'life', 'music', 'travel', 'tech'
]);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8'
};
const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const VID_EXT = new Set(['.mp4', '.webm', '.mov']);

/* ---------- 简易限流 ---------- */
const buckets = new Map();
function limited(ip, max, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(ip) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) { buckets.set(ip, arr); return true; }
  arr.push(now); buckets.set(ip, arr); return false;
}

/* ---------- 工具 ---------- */
function send(res, code, body, headers = {}) {
  const isObj = typeof body === 'object' && body !== null && !Buffer.isBuffer(body);
  const data = isObj ? JSON.stringify(body) : body;
  res.writeHead(code, { 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', ...headers });
  res.end(data);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function parseMultipart(buf, boundary) {
  const dash = Buffer.from('--' + boundary);
  const fields = {}; let file = null;
  let start = buf.indexOf(dash);
  while (start !== -1) {
    let pos = start + dash.length;
    if (buf[pos] === 45 && buf[pos + 1] === 45) break;
    pos += 2;
    const headEnd = buf.indexOf('\r\n\r\n', pos);
    if (headEnd === -1) break;
    const head = buf.subarray(pos, headEnd).toString('utf8');
    let next = buf.indexOf(dash, headEnd);
    if (next === -1) break;
    const data = buf.subarray(headEnd + 4, next - 2);
    const nameM = /name="([^"]*)"/.exec(head);
    const fileM = /filename="([^"]*)"/.exec(head);
    const typeM = /Content-Type:\s*([^\r\n]+)/i.exec(head);
    if (nameM) {
      if (fileM && fileM[1]) file = { name: fileM[1], type: typeM ? typeM[1].trim() : '', data };
      else fields[nameM[1]] = data.toString('utf8');
    }
    start = next;
  }
  return { fields, file };
}
function clientIp(req) {
  return (TRUST_PROXY ? req.headers['x-forwarded-for'] || '' : '').split(',').map(x=>x.trim()).filter(Boolean).at(-1) || req.socket.remoteAddress || '';
}
async function serveFile(res, file, status = 200) {
  try {
    const st = await stat(file);
    if (!st.isFile()) throw 0;
    const ext = path.extname(file).toLowerCase();
    res.writeHead(status, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size, 'Cache-Control': ['.html','.json'].includes(ext) ? 'no-cache' : 'public, max-age=86400'
    });
    createReadStream(file).pipe(res);
  } catch { send(res, 404, 'not found'); }
}
async function readJson(req) {
  const buf = await readBody(req, 64 * 1024);
  return JSON.parse(buf.toString('utf8') || '{}');
}
function isSameDay(ts1, ts2) {
  const a = new Date(ts1), b = new Date(ts2);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isYesterday(ts, now = Date.now()) {
  return isSameDay(ts, now - 86400000);
}

const POST_FIELDS = 'id,text,name,theme,media,media_type,hearts,topic,created_at';

/* ---------- API ---------- */
async function api(req, res, url) {
  const ip = clientIp(req);

  /* 每日话题 */
  if (req.method === 'GET' && url.pathname === '/api/topic') {
    return send(res, 200, todayTopic());
  }

  /* 帖子列表 */
  if (req.method === 'GET' && url.pathname === '/api/posts') {
    const limit = Math.min(Number(url.searchParams.get('limit')) || 60, 200);
    const before = Number(url.searchParams.get('before')) || Date.now() + 1000;
    const theme = url.searchParams.get('theme') || '';
    const topicDate = url.searchParams.get('topic') || '';
    let rows;
    if (topicDate) {
      rows = db.prepare(
        `SELECT ${POST_FIELDS} FROM posts WHERE created_at<? AND topic=? ORDER BY created_at DESC LIMIT ?`
      ).all(before, topicDate, limit);
    } else if (theme && THEMES.has(theme)) {
      rows = db.prepare(
        `SELECT ${POST_FIELDS} FROM posts WHERE created_at<? AND theme=? ORDER BY created_at DESC LIMIT ?`
      ).all(before, theme, limit);
    } else {
      rows = db.prepare(
        `SELECT ${POST_FIELDS} FROM posts WHERE created_at<? ORDER BY created_at DESC LIMIT ?`
      ).all(before, limit);
    }
    return send(res, 200, { posts: rows });
  }

  /* 热门榜（近7天点赞最高） */
  if (req.method === 'GET' && url.pathname === '/api/hot') {
    const since = Date.now() - 7 * 86400000;
    const rows = db.prepare(
      `SELECT ${POST_FIELDS} FROM posts WHERE created_at>? AND hearts>0 ORDER BY hearts DESC, created_at DESC LIMIT 10`
    ).all(since);
    return send(res, 200, { posts: rows });
  }

  /* 发帖 */
  if (req.method === 'POST' && url.pathname === '/api/posts') {
    if (limited(ip, 6, 60_000)) return send(res, 429, { error: '发得太勤啦，喝口水再来～' });
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('multipart/form-data')) return send(res, 400, { error: 'bad form' });
    const boundary = (ct.match(/boundary=(.+)$/) || [])[1];
    if (!boundary) return send(res, 400, { error: 'bad boundary' });
    let buf;
    try { buf = await readBody(req, MAX_UPLOAD + 1024 * 1024); }
    catch { return send(res, 413, { error: '文件太大啦（限 60MB）' }); }
    const { fields, file } = parseMultipart(buf, boundary);

    let discussion;try{if(fields.discussion==='1')discussion=discussionText(fields);}catch(e){return send(res,400,{error:e.message});}
    const text = discussion || String(fields.text || '').trim().slice(0, MAX_TEXT);
    if (!text) return send(res, 400, { error: '说点什么吧，一个字也行' });
    const name = req.siteUser.username;
    const theme = THEMES.has(fields.theme) ? fields.theme : 'mood';
    const topic = fields.topic === todayTopic().date ? fields.topic : '';

    let media = '', mediaType = '';
    if (file && file.data.length) {
      if (file.data.length > MAX_UPLOAD) return send(res, 413, { error: '文件太大啦（限 60MB）' });
      const ext = path.extname(file.name).toLowerCase();
      if (IMG_EXT.has(ext)) mediaType = 'image';
      else if (VID_EXT.has(ext)) mediaType = 'video';
      else return send(res, 400, { error: '只支持图片或视频哦' });
      media = crypto.randomBytes(12).toString('hex') + ext;
      await writeFile(path.join(UPLOADS, media), file.data);
    }

    const now = Date.now();
    const r = db.prepare(
      'INSERT INTO posts(text,name,theme,media,media_type,ip,topic,created_at,user_id) VALUES(?,?,?,?,?,?,?,?,?)'
    ).run(text, name, theme, media, mediaType, ip, topic, now, req.siteUser.id);
    if(discussion)db.prepare('INSERT INTO discussion_posts(post_id) VALUES(?)').run(r.lastInsertRowid);
    const post = db.prepare(`SELECT ${POST_FIELDS} FROM posts WHERE id=?`).get(r.lastInsertRowid);
    return send(res, 200, { post });
  }

  /* 点赞 */
  const heartM = /^\/api\/posts\/(\d+)\/heart$/.exec(url.pathname);
  if (req.method === 'POST' && heartM) {
    if (limited('h' + ip, 30, 60_000)) return send(res, 429, { error: '慢一点～' });
    const id = Number(heartM[1]);
    db.prepare('UPDATE posts SET hearts=hearts+1 WHERE id=?').run(id);
    const row = db.prepare('SELECT hearts FROM posts WHERE id=?').get(id);
    if (!row) return send(res, 404, { error: '不存在' });
    return send(res, 200, { hearts: row.hearts });
  }

  /* 评论列表 */
  const commentsGetM = /^\/api\/posts\/(\d+)\/comments$/.exec(url.pathname);
  if (req.method === 'GET' && commentsGetM) {
    const postId = Number(commentsGetM[1]);
    const rows = readPublicComments(db, postId);
    return send(res, 200, { comments: rows });
  }

  /* 发表评论（JSON） */
  const commentsPostM = /^\/api\/posts\/(\d+)\/comments$/.exec(url.pathname);
  if (req.method === 'POST' && commentsPostM) {
    if (limited('c' + ip, 10, 60_000)) return send(res, 429, { error: '评论太快啦～' });
    const postId = Number(commentsPostM[1]);
    const post = db.prepare('SELECT id FROM posts WHERE id=?').get(postId);
    if (!post) return send(res, 404, { error: '帖子不存在' });
    let body;
    try { body = await readJson(req); } catch { return send(res, 400, { error: 'bad json' }); }
    const text = String(body.text || '').trim().slice(0, MAX_COMMENT);
    if (!text) return send(res, 400, { error: '评论不能为空' });
    const parentId = body.parent_id ?? null;
    if (parentId !== null && (!Number.isSafeInteger(parentId) || parentId <= 0)) return send(res, 400, { error: '无效的回复评论' });
    const target = parentId === null ? null : findReplyTarget(db, postId, parentId);
    if (parentId !== null && !target) return send(res, 404, { error: '要回复的评论不存在或已下架，请刷新评论后重试' });
    const threadId = target ? (target.thread_id || target.id) : null;
    const name = req.siteUser.username;
    const now = Date.now();
    const r = db.prepare(
      'INSERT INTO comments(post_id,text,name,ip,created_at,user_id,parent_id,thread_id) VALUES(?,?,?,?,?,?,?,?)'
    ).run(postId, text, name, ip, now, req.siteUser.id, parentId, threadId);
    const comment = db.prepare('SELECT id,text,name,created_at,parent_id,thread_id FROM comments WHERE id=?').get(r.lastInsertRowid);
    comment.reply_to_name = target?.name || null;
    return send(res, 200, { comment });
  }

  /* 签到状态 */
  if (req.method === 'GET' && url.pathname === '/api/checkin') {
    const row = db.prepare('SELECT streak,total,last_checkin FROM checkins WHERE ip=?').get(ip);
    const now = Date.now();
    if (!row) return send(res, 200, { checkedToday: false, streak: 0, total: 0 });
    return send(res, 200, {
      checkedToday: isSameDay(row.last_checkin, now),
      streak: row.streak, total: row.total
    });
  }

  /* 签到 */
  if (req.method === 'POST' && url.pathname === '/api/checkin') {
    if (limited('ck' + ip, 3, 60_000)) return send(res, 429, { error: '操作太快啦～' });
    const now = Date.now();
    const row = db.prepare('SELECT streak,total,last_checkin FROM checkins WHERE ip=?').get(ip);
    if (row) {
      if (isSameDay(row.last_checkin, now)) {
        return send(res, 200, { checkedToday: true, streak: row.streak, total: row.total, msg: '今天已经签过到啦' });
      }
      const newStreak = isYesterday(row.last_checkin, now) ? row.streak + 1 : 1;
      const newTotal = row.total + 1;
      db.prepare('UPDATE checkins SET streak=?, total=?, last_checkin=? WHERE ip=?')
        .run(newStreak, newTotal, now, ip);
      return send(res, 200, { checkedToday: true, streak: newStreak, total: newTotal });
    }
    db.prepare('INSERT INTO checkins(ip,streak,total,last_checkin) VALUES(?,1,1,?)').run(ip, now);
    return send(res, 200, { checkedToday: true, streak: 1, total: 1 });
  }

  return send(res, 404, { error: 'not found' });
}

const users = createUserAuth({db,origin:SITE_ORIGIN,localHttp,trustProxy:TRUST_PROXY});
const admin = createAdminService({ db, dataDir: DATA, publicDir: PUBLIC, origin: SITE_ORIGIN, allowLocalHttp: localHttp, trustProxy: TRUST_PROXY, automaticTopic: todayTopic });

ensureDiscussions(db);
const spaces=createSpaces({db,users});
const analytics=createAnalytics({db,origin:SITE_ORIGIN,localHttp});
/* ---------- 服务 ---------- */
async function handler(req, res) {
  try {
  if (await admin.handle(req, res)) return;
  if(new URL(req.url,'http://local').pathname==='/api/visit'&&limited('visit:'+clientIp(req),120,60000))return send(res,429,{error:'请求过多'});
  if (await analytics.handle(req,res)) return;
  if (await users.handle(req, res)) return;
  if (await spaces.handle(req,res)) return;
  if (!users.authorizeWrite(req, res)) return;
  if (admin.handlePublic(req, res)) return;
  const url = new URL(req.url, 'http://x');
  if(req.method==='GET'&&url.pathname==='/api/discussions'){try{return send(res,200,readDiscussions(db,url));}catch{return send(res,400,{error:'筛选条件无效'});}}
  if(['/plaza','/plaza/'].includes(url.pathname)&&['GET','HEAD'].includes(req.method))return serveFile(res,path.join(PUBLIC,'plaza.html'));
  if (url.pathname.startsWith('/api/')) return api(req, res, url).catch(e => send(res, 500, { error: String(e.message || e) }));
  if (url.pathname.startsWith('/uploads/')) {
    const f = path.normalize(path.join(UPLOADS, url.pathname.slice(9)));
    if (!f.startsWith(UPLOADS + path.sep)) return send(res, 403, 'forbidden');
    return serveFile(res, f);
  }
  if((['/space','/space/'].includes(url.pathname)||/^\/u\/[a-zA-Z0-9_]{3,20}\/?$/.test(url.pathname))&&['GET','HEAD'].includes(req.method))return serveFile(res,path.join(PUBLIC,'space.html'));
  const postPage = /^\/post\/(\d+)\/?$/.exec(url.pathname);
  if (postPage && ['GET','HEAD'].includes(req.method)) {
    const id = Number(postPage[1]);
    const post = Number.isSafeInteger(id) && db.prepare(`SELECT ${POST_FIELDS} FROM posts p WHERE p.id=? AND NOT EXISTS(SELECT 1 FROM admin_archive a WHERE a.kind='post' AND a.item_id=p.id)`).get(id);
    const html = renderPostShareHtml(await readFile(path.join(PUBLIC,'post.html'),'utf8'),post,SITE_ORIGIN);
    res.writeHead(post?200:404,{'Content-Type':'text/html; charset=utf-8','Content-Length':Buffer.byteLength(html),'Cache-Control':'no-cache'});
    return res.end(req.method==='HEAD'?undefined:html);
  }
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const f = path.normalize(path.join(PUBLIC, p));
  if (!f.startsWith(PUBLIC + path.sep)) return send(res, 403, 'forbidden');
  return serveFile(res, f);
  } catch (e) {
    if (!res.headersSent) send(res, 500, { error: '服务暂未完成请求，请稍后重试' }); else res.end();
  }
}

http.createServer(handler).listen(PORT, HOST, () => console.log('随手记 on :' + PORT));
for (const p of EXTRA_PORTS) http.createServer(handler).listen(p, HOST, () => console.log('随手记 extra on :' + p));
