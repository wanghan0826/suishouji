import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {ensureInvitationSchema,readInvitationAnalytics} from '../scripts/invitations.mjs';
test('channel migration preserves legacy cohorts and repeated startup preserves saved tags',()=>{const db=new DatabaseSync(':memory:'),now=Date.now();try{db.exec('CREATE TABLE site_users(id INTEGER PRIMARY KEY,disabled INTEGER);CREATE TABLE invitation_visits(visitor_hash TEXT PRIMARY KEY,inviter_id INTEGER NOT NULL,visited_at INTEGER NOT NULL,registered_user_id INTEGER UNIQUE,registered_at INTEGER,mutual_at INTEGER,first_note_at INTEGER);');db.prepare('INSERT INTO invitation_visits VALUES(?,1,?,NULL,NULL,NULL,NULL)').run('legacy',now);ensureInvitationSchema(db);ensureInvitationSchema(db);assert.equal(db.prepare('SELECT channel FROM invitation_visits').get().channel,'direct');db.prepare('UPDATE invitation_visits SET channel=?,variant=?').run('qq','b');ensureInvitationSchema(db);const result=readInvitationAnalytics(db,now);assert.deepEqual(result.groups,[{channel:'qq',variant:'b',visitors:1,registrations:0,mutual:0,notes:0}]);assert.equal(result.totals.visitors,1);}finally{db.close();}});

test('format migration preserves channel-era cohorts without inventing historical card attribution',()=>{
 const db=new DatabaseSync(':memory:'),now=Date.now();try{
  db.exec("CREATE TABLE site_users(id INTEGER PRIMARY KEY,disabled INTEGER);CREATE TABLE invitation_visits(visitor_hash TEXT PRIMARY KEY,inviter_id INTEGER NOT NULL,visited_at INTEGER NOT NULL,registered_user_id INTEGER UNIQUE,registered_at INTEGER,mutual_at INTEGER,first_note_at INTEGER,channel TEXT NOT NULL DEFAULT 'direct',variant TEXT NOT NULL DEFAULT 'default');INSERT INTO site_users VALUES(2,0);");
  db.prepare('INSERT INTO invitation_visits VALUES(?,1,?,2,?,?,?, ?,?)').run('existing-browser',now,now+1,now+2,now+3,'wechat','a');
  ensureInvitationSchema(db);ensureInvitationSchema(db);
  const row=db.prepare('SELECT * FROM invitation_visits').get();assert.equal(row.format,'unknown');assert.equal(row.channel,'wechat');assert.equal(row.variant,'a');assert.equal(row.first_note_at,now+3);assert.equal(row.registered_user_id,2);
  assert.deepEqual(readInvitationAnalytics(db,now).formats,[{format:'unknown',visitors:1,registrations:1,mutual:1,notes:1}]);
  db.prepare("UPDATE invitation_visits SET format='card'").run();ensureInvitationSchema(db);assert.equal(db.prepare('SELECT format FROM invitation_visits').get().format,'card');
 }finally{db.close();}
});

test('format summaries reconcile with totals and exclude banned conversions and out-of-window visits',()=>{
 const db=new DatabaseSync(':memory:'),now=Date.parse('2026-11-01T12:00:00+08:00');try{
  db.exec('CREATE TABLE site_users(id INTEGER PRIMARY KEY,disabled INTEGER);INSERT INTO site_users VALUES(2,0),(3,0),(4,1);');ensureInvitationSchema(db);
  const insert=db.prepare('INSERT INTO invitation_visits(visitor_hash,inviter_id,visited_at,registered_user_id,registered_at,mutual_at,first_note_at,channel,variant,format) VALUES(?,1,?,?,?,?,?,?,?,?)');
  insert.run('card-active',now,2,now,now,now,'wechat','a','card');insert.run('link-active',now,3,now,null,null,'qq','b','link');insert.run('card-anonymous',now,null,null,null,null,'direct','default','card');insert.run('card-banned',now,4,now,now,now,'wechat','a','card');insert.run('legacy',now,null,null,null,null,'direct','default','unknown');insert.run('expired',now-31*86400000,null,null,null,null,'direct','default','link');
  const result=readInvitationAnalytics(db,now);assert.deepEqual(result.totals,{visitors:5,registrations:2,mutual:1,notes:1});assert.deepEqual(result.formats,[{format:'link',visitors:1,registrations:1,mutual:0,notes:0},{format:'card',visitors:3,registrations:1,mutual:1,notes:1},{format:'unknown',visitors:1,registrations:0,mutual:0,notes:0}]);
  for(const field of Object.keys(result.totals))assert.equal(result.formats.reduce((sum,row)=>sum+row[field],0),result.totals[field]);assert.ok(!JSON.stringify(result).includes('card-active'));assert.ok(!JSON.stringify(result).includes('registered_user_id'));
 }finally{db.close();}
});
