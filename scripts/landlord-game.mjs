import {createHash, randomBytes} from 'node:crypto';
import {act, advanceTurn, deal, dueAt, gameError, humanSeat, newRoom, seatOf, viewRoom} from './landlord-engine.mjs';

const lifetime = 7 * 86400000;
const idle = 30 * 60000;
const route = /^\/api\/landlord(?:\/([a-f0-9]{32})(?:\/(join|start|bid|play|pass|next|leave))?)?\/?$/;

function send(res,status,data) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
}

async function readInput(req) {
  if (!String(req.headers['content-type']).startsWith('application/json')) throw gameError(415,'请求格式无效。');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw gameError(413,'请求过大。');
    chunks.push(chunk);
  }
  try {
    const input = JSON.parse(Buffer.concat(chunks));
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error();
    return input;
  } catch {
    throw gameError(400,'请求内容无效。');
  }
}

export function createLandlordGame({db, users, clock = Date.now}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS landlord_rooms(
      token TEXT PRIMARY KEY, state TEXT NOT NULL, expires INTEGER NOT NULL,
      seen INTEGER NOT NULL, due INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS landlord_rooms_due ON landlord_rooms(due);
    CREATE TABLE IF NOT EXISTS landlord_members(
      token TEXT NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY(token,user_id)
    );
    CREATE INDEX IF NOT EXISTS landlord_members_user ON landlord_members(user_id);
    CREATE TABLE IF NOT EXISTS landlord_ops(
      token TEXT NOT NULL, user_id INTEGER NOT NULL, id TEXT NOT NULL, hash TEXT NOT NULL,
      PRIMARY KEY(token,user_id,id)
    );
    CREATE TABLE IF NOT EXISTS landlord_creates(
      user_id INTEGER NOT NULL, id TEXT NOT NULL, token TEXT NOT NULL, solo INTEGER NOT NULL,
      PRIMARY KEY(user_id,id)
    );
  `);
  const getRoom = db.prepare('SELECT * FROM landlord_rooms WHERE token=?');
  const update = db.prepare('UPDATE landlord_rooms SET state=?, seen=?, due=? WHERE token=?');
  const addMember = db.prepare('INSERT OR IGNORE INTO landlord_members VALUES (?,?)');
  const enabled = db.prepare('SELECT 1 FROM site_users WHERE id=? AND disabled=0');
  const limits = new Map();
  let cleaned = 0;

  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  function load(token,now) {
    const row = getRoom.get(token);
    if (!row) throw gameError(404,'这间牌室不存在。');
    if (row.expires <= now) throw gameError(410,'这间牌室已过期。');
    return row;
  }

  function updateHost(room) {
    const active = room.seats.filter(seat => seat && !seat.bot && !seat.away);
    if (!active.length) {
      room.phase = 'closed';
      room.deadline = 0;
    } else if (!active.some(seat => seat.id === room.host)) room.host = active[0].id;
  }

  function save(token,room,seen) {
    room.version++;
    update.run(JSON.stringify(room),seen,dueAt(room),token);
  }

  function advance(token, now) {
    return transaction(() => {
      const row = load(token,now);
      const room = JSON.parse(row.state);
      if (room.phase === 'closed') return room;
      if (now - row.seen >= idle) {
        room.phase = 'closed';
        room.deadline = 0;
        save(token,room,row.seen);
        return room;
      }
      let changed = false;
      for (const player of room.seats) {
        if (player && !player.bot && !player.away && !enabled.get(player.id)) {
          if (room.phase === 'lobby') room.seats[room.seats.indexOf(player)] = null;
          else player.away = true;
          changed = true;
        }
      }
      if (changed) updateHost(room);
      if (advanceTurn(room,now) || changed) save(token,room,row.seen);
      return room;
    });
  }

  function current(token,user,now) {
    const row = load(token,now);
    let room = JSON.parse(row.state);
    if (room.phase === 'closed') return room;
    if ((row.due && row.due <= now) || now - row.seen >= idle ||
        room.seats.some(p => p && !p.bot && !p.away && !enabled.get(p.id))) room = advance(token,now);
    if (room.phase !== 'closed' && seatOf(room,user.id) >= 0 && now-row.seen >= 60000) {
      db.prepare('UPDATE landlord_rooms SET seen=? WHERE token=? AND seen<?').run(now,token,now);
    }
    return room;
  }

  function limit(user, type, now) {
    const key = user.id + ':' + type;
    let bucket = limits.get(key);
    if (!bucket || bucket.until <= now) {
      bucket = {until:now+60000, count:0};
      limits.set(key,bucket);
    }
    const max = type === 'create' ? 6 : type === 'read' ? 240 : 100;
    if (++bucket.count > max) throw gameError(429,'操作有点快，请稍等再试。');
  }

  function create(user,input,now) {
    if (typeof input.opId !== 'string' || !/^[a-f0-9]{32}$/.test(input.opId)) throw gameError(400,'操作编号无效。');
    const solo = input.solo === true;
    const token = randomBytes(16).toString('hex');
    const room = newRoom(user);
    return transaction(() => {
      const previous = db.prepare('SELECT token,solo FROM landlord_creates WHERE user_id=? AND id=?').get(user.id,input.opId);
      if (previous) {
        if (previous.solo !== Number(solo)) throw gameError(409,'这次开房编号已经用过。');
        return viewRoom(JSON.parse(load(previous.token,now).state),user.id,previous.token,now);
      }
      const rows = db.prepare(`SELECT r.state FROM landlord_rooms r
        JOIN landlord_members m ON m.token=r.token WHERE m.user_id=? AND r.expires>? AND r.seen>?`).all(user.id,now,now-idle);
      const owned = rows.map(row => JSON.parse(row.state)).filter(r => r.host === user.id && r.phase !== 'closed');
      if (owned.length >= 4) throw gameError(409,'你已经开了四间牌室，请先离开不用的牌室。');
      if (solo) {
        fillBots(room);
        deal(room,now);
      }
      db.prepare('INSERT INTO landlord_rooms VALUES (?,?,?,?,?)').run(token,JSON.stringify(room),now+lifetime,now,dueAt(room));
      addMember.run(token,user.id);
      db.prepare('INSERT INTO landlord_creates VALUES (?,?,?,?)').run(user.id,input.opId,token,Number(solo));
      return viewRoom(room,user.id,token,now);
    });
  }

  function fillBots(room) {
    room.seats = room.seats.map((seat,i) => seat || {...humanSeat(null,'练习机 '+(i+1)),bot:true});
  }

  function mutate(token, action, user, input, now) {
    if (typeof input.opId !== 'string' || !/^[a-f0-9]{32}$/.test(input.opId)) throw gameError(400,'操作编号无效。');
    const hash = createHash('sha256').update(JSON.stringify([action,input])).digest('hex');
    current(token,user,now);
    return transaction(() => {
      const room = JSON.parse(load(token,now).state);
      const replay = db.prepare('SELECT hash FROM landlord_ops WHERE token=? AND user_id=? AND id=?').get(token,user.id,input.opId);
      if (replay) {
        if (replay.hash !== hash) throw gameError(409,'这次操作编号已经用过。');
        return viewRoom(room,user.id,token,now);
      }
      if (room.phase === 'closed') throw gameError(410,'这间牌室已关闭。');
      const seat = seatOf(room,user.id);
      if (action === 'join') {
        if (seat >= 0) return viewRoom(room,user.id,token,now);
        const away = room.seats.find(p => p?.id === user.id);
        const free = room.seats.indexOf(null);
        if (away) away.away = false;
        else if (room.phase === 'lobby' && free >= 0) room.seats[free] = humanSeat(user.id,user.username);
        else throw gameError(409,'已经开局，或座位已满。');
        addMember.run(token,user.id);
      } else {
        if (seat < 0) throw gameError(403,'请先加入牌室。');
        if (action !== 'leave' && input.version !== room.version) throw gameError(409,'牌桌已更新，请重新操作。');
        if (action === 'start' || action === 'next') {
          if (room.host !== user.id) throw gameError(403,'由房主开始。');
          if (room.phase !== (action === 'start' ? 'lobby' : 'result')) throw gameError(409,'现在不能开始新一局。');
          fillBots(room);
          deal(room,now);
        } else if (action === 'leave') {
          if (room.phase === 'lobby') {
            room.seats[seat] = null;
            db.prepare('DELETE FROM landlord_members WHERE token=? AND user_id=?').run(token,user.id);
          } else room.seats[seat].away = true;
          updateHost(room);
        } else act(room,seat,action,input,now);
      }
      save(token,room,now);
      db.prepare('INSERT INTO landlord_ops VALUES (?,?,?,?)').run(token,user.id,input.opId,hash);
      return viewRoom(room,user.id,token,now);
    });
  }

  async function handle(req,res) {
    const pathname = new URL(req.url,'http://local').pathname;
    if (pathname !== '/api/landlord' && !pathname.startsWith('/api/landlord/')) return false;
    try {
      const match = route.exec(pathname);
      if (!match) throw gameError(404,'找不到这个牌室操作。');
      const [,token,action] = match;
      if (!['GET','POST'].includes(req.method) || (req.method === 'GET' && (!token || action)) ||
          (req.method === 'POST' && token && !action)) throw gameError(405,'请求方法不支持。');
      const user = req.method === 'GET' ? users.currentUser(req) : users.requireUser(req);
      if (!user) throw gameError(401,'请登录后进入斗地主牌室。');
      const now = clock();
      limit(user,req.method === 'GET' ? 'read' : token ? 'write' : 'create',now);
      if (req.method === 'GET') send(res,200,viewRoom(current(token,user,now),user.id,token,now));
      else {
        const input = await readInput(req);
        const at = clock();
        send(res,200,token ? mutate(token,action,user,input,at) : create(user,input,at));
      }
    } catch (error) {
      if (!error.status && ![5,6].includes(error.errcode)) console.error('Landlord request failed',error);
      send(res,error.status || 503,{error:error.status ? error.message : '牌桌暂时无法同步，请重试。'});
    }
    return true;
  }

  function sweep() {
    const now = clock();
    try {
      const due = db.prepare('SELECT token FROM landlord_rooms WHERE due>0 AND due<=? AND expires>? ORDER BY due LIMIT 250').all(now,now);
      for (const {token} of due) advance(token,now);
      if (now - cleaned > 3600000) {
        for (const [key,bucket] of limits) if (bucket.until <= now) limits.delete(key);
        if (db.prepare('SELECT 1 FROM landlord_rooms WHERE expires<=? LIMIT 1').get(now)) transaction(() => {
          for (const table of ['landlord_members','landlord_ops','landlord_creates']) db.prepare(`DELETE FROM ${table} WHERE token IN (SELECT token FROM landlord_rooms WHERE expires<=?)`).run(now);
          db.prepare('DELETE FROM landlord_rooms WHERE expires<=?').run(now);
        });
        cleaned = now;
      }
    } catch (error) {
      if (![5,6].includes(error.errcode)) console.error('Landlord maintenance deferred',error);
    }
  }
  const timer = setInterval(sweep,500);
  timer.unref();
  return {handle, close:() => clearInterval(timer)};
}
