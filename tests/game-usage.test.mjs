import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {createGameUsage,readGameUsage} from '../scripts/game-usage.mjs';

test('game usage ranks active players, deduplicates actions and uses Beijing calendar days', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('CREATE TABLE site_users(id INTEGER PRIMARY KEY, disabled INTEGER NOT NULL); INSERT INTO site_users VALUES(1,0),(2,0),(3,1)');
  const now = Date.parse('2026-11-22T08:00:00+08:00');
  const windowStart = Date.parse('2026-11-16T00:00:00+08:00');
  const usage = createGameUsage(db,windowStart-1);
  createGameUsage(db,now);
  usage.play('word','earlier-room',1,1,windowStart-1);
  usage.play('mahjong','discard-room',1,1,now);
  usage.play('mahjong','discard-room',2,1,now);
  usage.play('word','current-room',1,1,windowStart);
  usage.play('word','current-room',1,1,now);
  usage.play('word','current-room',1,2,now);
  usage.play('word','current-room',1,3,now);
  usage.finish('word','current-room',1,now);
  usage.finish('word','current-room',1,now+1);
  usage.finish('landlord','bot-only',1,now);

  const week = readGameUsage(db,7,now);
  assert.equal(week.startedAt,windowStart-1);
  assert.deepEqual(week.games.map(({game,players,matches,completed})=>[game,players,matches,completed]),[
    ['word',2,1,1],['mahjong',1,2,0],['draw',0,0,0],['landlord',0,0,0]
  ]);
  assert.equal(readGameUsage(db,30,now).games[0].matches,2);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM game_usage_players').get().count,6);
});
