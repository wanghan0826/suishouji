import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {growthEntry,growthChannel,ensureGrowthMetrics,createGrowthTracking,recordGrowthRegistration,recordGrowthGuess,recordGrowthCommunity,readGrowthMetrics} from '../scripts/growth-metrics.mjs';
const DAY=86400000,origin='https://suishouji.online';
function fixture(t,start=Date.now()-10*DAY){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec('CREATE TABLE site_users(id INTEGER PRIMARY KEY,created_at INTEGER,disabled INTEGER DEFAULT 0);CREATE TABLE user_follows(follower_id INTEGER,following_id INTEGER);');ensureGrowthMetrics(db,start);return db;
}
const req=(cookie='',headers={})=>({method:'GET',headers:{'user-agent':'Mozilla/5.0',cookie,...headers}});
function response(){const headers={};return {headers,getHeader:k=>headers[k],setHeader:(k,v)=>headers[k]=v};}

test('growth categories retain neither private URLs nor arbitrary channel/referrer values',()=>{
  assert.equal(growthEntry('/play/'+'a'.repeat(32)),'word_invite');assert.equal(growthEntry('/u/taid1'),'space');assert.equal(growthEntry('/post/42'),'post');
  assert.equal(growthEntry('/draw/'+'a'.repeat(32)),'draw_invite');assert.equal(growthEntry('/draw'),'draw');
  assert.equal(growthEntry('/mahjong/'+'a'.repeat(32)),'mahjong_invite');assert.equal(growthEntry('/mahjong'),'mahjong');assert.equal(growthEntry('/mahjong/private-name'),null);
  for(const path of ['/mobile-lab','/wall-demo','/api/auth/status','/admin','/assets/image.png','/play/not-a-room'])assert.equal(growthEntry(path),null);
  assert.equal(growthChannel(new URL('/play?utm_source=QQ&secret=hidden',origin),'',origin),'link:qq');
  assert.equal(growthChannel(new URL('/?source=private-value',origin),'',origin),'link:other');
  assert.equal(growthChannel(new URL('/',origin),'https://mp.weixin.qq.com/s/private',origin),'ref:wechat');
  assert.equal(growthChannel(new URL('/',origin),'https://qq.com.evil.example/private',origin),'ref:other');
  assert.equal(growthChannel(new URL('/',origin),origin+'/u/private',''+origin),'unknown');
});

test('first entry persists across internal visits; one browser claims only one account within seven days',t=>{
  const db=fixture(t),tracking=createGrowthTracking({db,users:{currentUser:()=>null},origin,localHttp:true}),res=response();
  tracking.capture(req(),res,new URL('/play/'+'b'.repeat(32)+'?source=wechat',origin));
  const cookie=res.headers['Set-Cookie'].split(';')[0],raw=cookie.split('=')[1];assert.match(res.headers['Set-Cookie'],/HttpOnly; SameSite=Lax/);
  const again=response();tracking.capture(req(cookie),again,new URL('/plaza?source=qq',origin));assert.equal(again.headers['Set-Cookie'],undefined);assert.equal(db.prepare('SELECT COUNT(*) n FROM growth_visits').get().n,1);
  recordGrowthRegistration(db,req(cookie,{referer:origin+'/play/'+'b'.repeat(32)}),1,{origin,localHttp:true});
  recordGrowthRegistration(db,req(cookie,{referer:origin+'/plaza'}),2,{origin,localHttp:true});
  recordGrowthRegistration(db,req(cookie,{referer:origin+'/plaza'}),1,{origin,localHttp:true});
  const rows=db.prepare('SELECT * FROM growth_registrations ORDER BY user_id').all();assert.equal(rows[0].entry,'word_invite');assert.equal(rows[0].channel,'link:wechat');assert.equal(rows[0].registration_entry,'word_invite');assert.equal(rows[1].entry,'unknown');assert.equal(rows[1].visitor_hash,null);assert.equal(rows[1].registration_entry,'plaza');
  assert.ok(!JSON.stringify(rows).includes(raw));assert.ok(!JSON.stringify(rows).includes('b'.repeat(32)));
});

test('growth ignores bots, hidden previews, HEAD, lab frames and signed-in visitors; expired attribution remains unknown',t=>{
  const db=fixture(t),tracking=createGrowthTracking({db,users:{currentUser:()=>null},origin});
  for(const headers of [{'user-agent':'Googlebot'},{'user-agent':'HeadlessChrome'},{'sec-fetch-dest':'iframe'},{purpose:'prefetch'},{'sec-purpose':'prerender'}]){const res=response();tracking.capture(req('',headers),res,new URL('/play',origin));assert.equal(res.headers['Set-Cookie'],undefined);}
  const head=req();head.method='HEAD';tracking.capture(head,response(),new URL('/',origin));
  createGrowthTracking({db,users:{currentUser:()=>({id:1})},origin}).capture(req(),response(),new URL('/',origin));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM growth_visits').get().n,0);
  const res=response();tracking.capture(req(),res,new URL('/play',origin));assert.match(res.headers['Set-Cookie'],/^__Host-sj_growth=.*; Secure$/);
  const cookie=res.headers['Set-Cookie'].split(';')[0];db.prepare('UPDATE growth_visits SET first_at=?').run(Date.now()-8*DAY);
  recordGrowthRegistration(db,req(cookie,{referer:'https://other.example/play'}),1,{origin});assert.equal(db.prepare('SELECT entry FROM growth_registrations').get().entry,'unknown');assert.equal(db.prepare('SELECT registration_entry FROM growth_registrations').get().registration_entry,'unknown');
  const renewed=response();tracking.capture(req(cookie),renewed,new URL('/games',origin));assert.notEqual(renewed.headers['Set-Cookie'].split(';')[0],cookie);
});

test('growth separates retained historical play from observed first-day cohorts and waits for complete retention days',t=>{
  const now=Date.parse('2026-11-20T12:00:00+08:00'),start=now-10*DAY,db=fixture(t,start);
  const add=db.prepare('INSERT INTO site_users(id,created_at,disabled) VALUES(?,?,?)');
  add.run(1,now-9*DAY,0);add.run(2,now-2*DAY,0);add.run(3,now,0);add.run(4,now-9*DAY,1);add.run(5,now-12*DAY,0);add.run(6,now-12*DAY,0);
  // Before playing does not count as a game-to-community action.
  recordGrowthCommunity(db,1,now-9*DAY);recordGrowthGuess(db,1,now-9*DAY+1000);recordGrowthCommunity(db,1,now-9*DAY+2000);recordGrowthCommunity(db,1,now-9*DAY+3000);
  recordGrowthGuess(db,1,now-8*DAY);recordGrowthGuess(db,1,now-2*DAY);recordGrowthGuess(db,2,now-2*DAY+1000);recordGrowthGuess(db,3,now+0);recordGrowthGuess(db,4,now-9*DAY+1000);
  db.exec("CREATE TABLE word_rooms(token TEXT,host_id INTEGER,guest_id INTEGER);CREATE TABLE word_rounds(room_token TEXT,host_word TEXT,guest_word TEXT);INSERT INTO word_rooms VALUES('private-token',5,6);INSERT INTO word_rounds VALUES('private-token','secret-answer',NULL);INSERT INTO user_follows VALUES(1,2),(2,1);");
  const result=readGrowthMetrics(db,30,now),n=result.registrations;
  assert.equal(n.total,5);assert.equal(n.observed,3);assert.equal(n.played,4);assert.equal(n.firstDayPlayers,3);assert.equal(n.communityAfter,1);assert.equal(n.mutual,2);assert.equal(n.unattributed,5);
  assert.deepEqual(result.retention.day1,{eligible:2,returned:1,pending:1,rate:0.5});assert.deepEqual(result.retention.day7,{eligible:1,returned:1,pending:2,rate:1});
  assert.equal(result.registrationEntries.find(r=>r.entry==='unknown').users,5);assert.equal(result.trend.length,30);assert.ok(!JSON.stringify(result).includes('secret-answer'));assert.ok(!JSON.stringify(result).includes('private-token'));
  assert.equal(readGrowthMetrics(db,7,now).registrations.total,2);assert.throws(()=>readGrowthMetrics(db,365,now),/7天或近30天/);
  // Removing old rooms cannot erase newly recorded play, but historical play becomes unconfirmable.
  db.exec('DELETE FROM word_rounds;DELETE FROM word_rooms');assert.equal(readGrowthMetrics(db,30,now).registrations.played,3);
});

test('landing conversions use visit cohorts, exclude banned signups and never count repeated visits as new arrivals',t=>{
  const now=Date.parse('2026-11-20T12:00:00+08:00'),db=fixture(t,now-20*DAY);
  db.exec(`INSERT INTO site_users VALUES(1,${now-2*DAY},0),(2,${now-DAY},1);`);
  const visits=db.prepare('INSERT INTO growth_visits VALUES(?,?,?,?)'),regs=db.prepare('INSERT INTO growth_registrations VALUES(?,?,?,?,?,?,?)');
  visits.run('one',now-8*DAY,'word_invite','link:qq');regs.run(1,'one',now-8*DAY,'word_invite','link:qq','word_invite',now-2*DAY);
  visits.run('two',now-DAY,'word','unknown');regs.run(2,'two',now-DAY,'word','unknown','word',now-DAY);visits.run('three',now-DAY,'home','unknown');
  const seven=readGrowthMetrics(db,7,now),thirty=readGrowthMetrics(db,30,now);assert.equal(seven.registrations.total,1);assert.equal(seven.registrations.inviteEntry,1);assert.equal(seven.entries.reduce((n,r)=>n+r.visitors,0),2);assert.equal(seven.entries.reduce((n,r)=>n+r.registrations,0),0);assert.equal(thirty.entries.find(r=>r.entry==='word_invite').registrations,1);
});
