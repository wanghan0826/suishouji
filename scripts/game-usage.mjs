import {createHash} from 'node:crypto';

const day = 86400000;
export const gameNames = {word:'同频猜词', draw:'你画我猜', mahjong:'激战麻将', landlord:'斗地主'};
const dateOf = time => new Date(time + 8 * 3600000).toISOString().slice(0, 10);

export function createGameUsage(db, now = Date.now()) {
  db.exec(`CREATE TABLE IF NOT EXISTS game_usage_meta (started_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS game_usage_matches (
      game TEXT NOT NULL, match_key TEXT NOT NULL, started_at INTEGER NOT NULL, completed_at INTEGER,
      PRIMARY KEY (game, match_key)
    );
    CREATE INDEX IF NOT EXISTS game_usage_matches_started ON game_usage_matches(started_at, game);
    CREATE TABLE IF NOT EXISTS game_usage_players (
      day TEXT NOT NULL, game TEXT NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY(day, game, user_id)
    );`);
  db.prepare('INSERT INTO game_usage_meta SELECT ? WHERE NOT EXISTS (SELECT 1 FROM game_usage_meta)').run(now);
  const start = db.prepare('INSERT OR IGNORE INTO game_usage_matches(game,match_key,started_at) VALUES(?,?,?)');
  const play = db.prepare('INSERT OR IGNORE INTO game_usage_players VALUES(?,?,?)');
  const finish = db.prepare('UPDATE game_usage_matches SET completed_at=? WHERE game=? AND match_key=? AND completed_at IS NULL');
  const key = (token, round) => createHash('sha256').update(`${token}:${round}`).digest('hex');
  return {
    play(game, token, round, userId, at) {
      start.run(game, key(token, round), at);
      play.run(dateOf(at), game, userId);
    },
    finish(game, token, round, at) {
      finish.run(at, game, key(token, round));
    }
  };
}

export function readGameUsage(db, days, now = Date.now()) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='game_usage_meta'").get()) {
    return {startedAt:null,games:[]};
  }
  const startedAt = db.prepare('SELECT started_at FROM game_usage_meta').get().started_at;
  const since = dateOf(now - (days - 1) * day);
  const sinceAt = Date.parse(since + 'T00:00:00+08:00');
  const players = db.prepare(`SELECT p.game, COUNT(DISTINCT p.user_id) AS players
    FROM game_usage_players p JOIN site_users u ON u.id=p.user_id AND u.disabled=0
    WHERE p.day BETWEEN ? AND ? GROUP BY p.game`).all(since, dateOf(now));
  const matches = db.prepare(`SELECT game, COUNT(*) AS matches, COUNT(CASE WHEN completed_at<=? THEN 1 END) AS completed
    FROM game_usage_matches WHERE started_at BETWEEN ? AND ? GROUP BY game`).all(now, sinceAt, now);
  return {startedAt, games:Object.entries(gameNames).map(([game, name]) => ({
    game, name, players:0, matches:0, completed:0,
    ...players.find(row => row.game === game), ...matches.find(row => row.game === game)
  })).sort((a,b) => b.players-a.players || b.matches-a.matches)};
}
