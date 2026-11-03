import crypto from 'node:crypto';

const DAY = 86400000;
const dayOf = now => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const cookieName = local => local ? 'sj_growth_local' : '__Host-sj_growth';
const rawCookie = (req, local) => {
  const raw = String(req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName(local) + '='))?.slice(cookieName(local).length + 1);
  return /^[a-f0-9]{32}$/.test(raw || '') ? raw : null;
};

// Store categories only: never retain a room token, username, full URL or referrer.
export function growthEntry(path) {
  if (['/', '/index.html'].includes(path)) return 'home';
  if (['/feedback', '/feedback/', '/game-feedback.html'].includes(path)) return 'feedback';
  if (/^\/games\/?$/.test(path) || path === '/games.html') return 'games';
  if (/^\/draw\/[a-f0-9]{32}\/?$/.test(path)) return 'draw_invite';
  if (['/draw', '/draw/', '/draw-game.html'].includes(path)) return 'draw';
  if (/^\/play\/[a-f0-9]{32}\/?$/.test(path)) return 'word_invite';
  if (['/play', '/play/', '/word-game.html'].includes(path)) return 'word';
  if (/^\/plaza\/?$/.test(path) || path === '/plaza.html') return 'plaza';
  if (/^\/post\/[1-9]\d{0,9}\/?$/.test(path)) return 'post';
  if (/^\/u\/[a-zA-Z0-9_]{3,20}\/?$/.test(path) || ['/space', '/space/', '/space.html'].includes(path)) return 'space';
  if (['/friends', '/friends/', '/friends.html'].includes(path)) return 'friends';
  return null;
}

export function growthChannel(url, referrer, origin) {
  const marked = url.searchParams.get('utm_source') || url.searchParams.get('source');
  if (marked) return 'link:' + (['qq', 'wechat', 'xiaohongshu', 'campus', 'github', 'direct', 'other'].includes(marked.toLowerCase()) ? marked.toLowerCase() : 'other');
  try {
    const ref = new URL(referrer);
    if (!['http:', 'https:'].includes(ref.protocol) || ref.origin === origin) return 'unknown';
    const host = ref.hostname.toLowerCase(), matches = domain => host === domain || host.endsWith('.' + domain);
    if (matches('xiaohongshu.com') || matches('xhslink.com')) return 'ref:xiaohongshu';
    if (matches('weixin.qq.com') || matches('weixin110.qq.com')) return 'ref:wechat';
    if (matches('qq.com')) return 'ref:qq';
    if (matches('github.com')) return 'ref:github';
    if (['baidu.com', 'bing.com', 'google.com', 'sogou.com', 'so.com'].some(matches)) return 'ref:search';
    return 'ref:other';
  } catch { return 'unknown'; }
}

export function ensureGrowthMetrics(db, now = Date.now()) {
  db.exec(`CREATE TABLE IF NOT EXISTS growth_meta(key TEXT PRIMARY KEY,value INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS growth_visits(visitor_hash TEXT PRIMARY KEY,first_at INTEGER NOT NULL,entry TEXT NOT NULL,channel TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS growth_visits_date ON growth_visits(first_at);
    CREATE TABLE IF NOT EXISTS growth_registrations(user_id INTEGER PRIMARY KEY,visitor_hash TEXT UNIQUE,first_at INTEGER,entry TEXT NOT NULL,channel TEXT NOT NULL,registration_entry TEXT NOT NULL,registered_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS growth_game_users(user_id INTEGER PRIMARY KEY,first_at INTEGER NOT NULL,community_after_at INTEGER);
    CREATE TABLE IF NOT EXISTS growth_game_daily(user_id INTEGER NOT NULL,day TEXT NOT NULL,guesses INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,day));`);
  db.prepare("INSERT OR IGNORE INTO growth_meta VALUES('started_at',?)").run(now);
}

export function createGrowthTracking({db, users, origin, localHttp = false}) {
  ensureGrowthMetrics(db);
  let lastClean = 0;
  return {capture(req, res, url) {
    const entry = growthEntry(url.pathname);
    if (!entry || req.method !== 'GET' || users.currentUser(req) || /bot|crawler|spider|headless|preview|facebookexternalhit/i.test(req.headers['user-agent'] || '') || /prefetch|prerender/i.test(String(req.headers.purpose || '') + String(req.headers['sec-purpose'] || '')) || ['iframe', 'frame'].includes(req.headers['sec-fetch-dest'])) return;
    const now = Date.now();
    if (now - lastClean > DAY) {
      db.prepare('DELETE FROM growth_visits WHERE first_at<?').run(now - 90 * DAY);
      db.prepare('DELETE FROM growth_game_daily WHERE day<?').run(dayOf(now - 90 * DAY));
      lastClean = now;
    }
    const raw = rawCookie(req, localHttp);
    if (raw && db.prepare('SELECT 1 FROM growth_visits WHERE visitor_hash=? AND first_at>=?').get(hash(raw), now - 7 * DAY)) return;
    const value = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT INTO growth_visits VALUES(?,?,?,?)').run(hash(value), now, entry, growthChannel(url, req.headers.referer, origin));
    const cookie = `${cookieName(localHttp)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${localHttp ? '' : '; Secure'}`;
    const previous = res.getHeader('Set-Cookie');
    res.setHeader('Set-Cookie', previous ? [].concat(previous, cookie) : cookie);
  }};
}

export function recordGrowthRegistration(db, req, userId, {origin, localHttp = false}, now = Date.now()) {
  const raw = rawCookie(req, localHttp);
  const visit = raw && db.prepare('SELECT * FROM growth_visits v WHERE visitor_hash=? AND first_at BETWEEN ? AND ? AND NOT EXISTS(SELECT 1 FROM growth_registrations r WHERE r.visitor_hash=v.visitor_hash)').get(hash(raw), now - 7 * DAY, now);
  let entry = 'unknown';
  try { const ref = new URL(req.headers.referer); if (ref.origin === origin) entry = growthEntry(ref.pathname) || 'unknown'; } catch {}
  db.prepare('INSERT OR IGNORE INTO growth_registrations VALUES(?,?,?,?,?,?,?)').run(userId, visit ? visit.visitor_hash : null, visit ? visit.first_at : null, visit ? visit.entry : 'unknown', visit ? visit.channel : 'unknown', entry, now);
}

export function recordGrowthGuess(db, userId, now = Date.now()) {
  db.prepare('INSERT OR IGNORE INTO growth_game_users(user_id,first_at) VALUES(?,?)').run(userId, now);
  db.prepare('INSERT INTO growth_game_daily VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET guesses=guesses+1').run(userId, dayOf(now));
}

export function recordGrowthCommunity(db, userId, now = Date.now()) {
  db.prepare('UPDATE growth_game_users SET community_after_at=? WHERE user_id=? AND first_at<=? AND community_after_at IS NULL').run(now, userId, now);
}

export function readGrowthMetrics(db, days = 7, now = Date.now()) {
  if (![7, 30].includes(days)) throw Object.assign(Error('请选择近7天或近30天'), {status: 400});
  const today = dayOf(now), since = dayOf(now - (days - 1) * DAY), sinceAt = Date.parse(since + 'T00:00:00+08:00');
  const startedAt = db.prepare("SELECT value FROM growth_meta WHERE key='started_at'").get().value;
  const hasTable = name => !!db.prepare('SELECT 1 FROM sqlite_master WHERE type=\'table\' AND name=?').get(name);
  const historic = hasTable('word_rooms') && hasTable('word_rounds') ? `EXISTS(SELECT 1 FROM word_rooms w JOIN word_rounds r ON r.room_token=w.token WHERE (w.host_id=u.id AND r.host_word IS NOT NULL) OR (w.guest_id=u.id AND r.guest_word IS NOT NULL))` : '0';
  const mutual = hasTable('user_follows') ? `EXISTS(SELECT 1 FROM user_follows a JOIN user_follows b ON a.follower_id=b.following_id AND a.following_id=b.follower_id JOIN site_users other ON other.id=a.following_id WHERE a.follower_id=u.id AND other.disabled=0 AND a.following_id<>u.id)` : '0';
  const cohort = db.prepare(`SELECT u.id,u.created_at,g.first_at,g.community_after_at,r.entry,r.registration_entry,(${historic} OR g.first_at<=?) played,${mutual} mutual FROM site_users u LEFT JOIN growth_game_users g ON g.user_id=u.id LEFT JOIN growth_registrations r ON r.user_id=u.id WHERE u.disabled=0 AND u.created_at BETWEEN ? AND ?`).all(now, sinceAt, now);
  const observed = cohort.filter(u => u.created_at >= startedAt), firstDay = observed.filter(u => u.first_at >= u.created_at && u.first_at <= now && dayOf(u.first_at) === dayOf(u.created_at));
  const replay = offset => {
    let eligible = 0, returned = 0, pending = 0;
    const statement = db.prepare('SELECT 1 FROM growth_game_daily WHERE user_id=? AND day=? AND guesses>0');
    for (const user of firstDay) {
      const target = dayOf(user.created_at + offset * DAY);
      if (target >= today) { pending++; continue; }
      eligible++; if (statement.get(user.id, target)) returned++;
    }
    return {eligible, returned, pending, rate: eligible ? returned / eligible : null};
  };
  const played = cohort.filter(u => u.played).length;
  const registrations = {total: cohort.length, played, playedRate: cohort.length ? played / cohort.length : null, observed: observed.length, firstDayPlayers: firstDay.length, gamePage: observed.filter(u => ['word', 'word_invite', 'games', 'draw', 'draw_invite'].includes(u.registration_entry)).length, inviteEntry: cohort.filter(u => ['word_invite','draw_invite'].includes(u.entry)).length, unattributed: cohort.filter(u => !u.entry || u.entry === 'unknown').length, communityAfter: observed.filter(u => u.first_at && u.community_after_at >= u.first_at && u.community_after_at <= now).length, mutual: cohort.filter(u => u.played && u.mutual).length};
  const batch = `FROM growth_visits v LEFT JOIN growth_registrations r ON r.visitor_hash=v.visitor_hash LEFT JOIN site_users u ON u.id=r.user_id WHERE v.first_at BETWEEN ? AND ?`;
  const entries = db.prepare(`SELECT v.entry,COUNT(*) visitors,SUM(CASE WHEN u.disabled=0 THEN 1 ELSE 0 END) registrations ${batch} GROUP BY v.entry ORDER BY visitors DESC,v.entry`).all(sinceAt, now);
  const channels = db.prepare(`SELECT v.channel,COUNT(*) visitors,SUM(CASE WHEN u.disabled=0 THEN 1 ELSE 0 END) registrations ${batch} GROUP BY v.channel ORDER BY visitors DESC,v.channel`).all(sinceAt, now);
  const registrationEntries = Object.entries(cohort.reduce((all, u) => { const key = u.registration_entry || 'unknown'; all[key] = (all[key] || 0) + 1; return all; }, {})).map(([entry, users]) => ({entry, users})).sort((a,b) => b.users-a.users);
  const trend = Array.from({length: days}, (_, i) => {const day = dayOf(now - (days - i - 1) * DAY), rows = cohort.filter(u => dayOf(u.created_at) === day); return {day, registrations: rows.length, played: rows.filter(u => u.played).length};});
  return {startedAt, days, since, registrations, retention: {day1: replay(1), day7: replay(7)}, entries, channels, registrationEntries, trend};
}
