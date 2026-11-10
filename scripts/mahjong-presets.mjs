import {normalizeRules} from './mahjong-engine.mjs';

const fail=(status,message)=>Object.assign(Error(message),{status}),PAGE=12,HOUR=3600000;
function inputPreset(input){
  if(!/^[a-f0-9]{32}$/.test(input.opId||''))throw fail(400,'发布凭据无效，请重新提交');
  if(input.description!==undefined&&typeof input.description!=='string')throw fail(400,'说明格式无效');
  const description=(input.description||'').trim().normalize('NFC');
  if([...description].length>20||/[\p{Cc}\p{Cf}\p{Cs}]/u.test(description))throw fail(400,'文字说明最多20字，请使用一行文字');
  return {opId:input.opId,description,rules:normalizeRules(input.rules)};
}

export function createMahjongPresets({db,users,clock=Date.now,body,send,transaction}){
  db.exec(`CREATE TABLE IF NOT EXISTS mahjong_rule_presets(
    id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,op_id TEXT NOT NULL,
    description TEXT NOT NULL,rules TEXT NOT NULL,created_at INTEGER NOT NULL,removed_at INTEGER,
    UNIQUE(user_id,op_id));
    CREATE INDEX IF NOT EXISTS mahjong_presets_owner ON mahjong_rule_presets(user_id,removed_at);
    CREATE INDEX IF NOT EXISTS mahjong_presets_recent ON mahjong_rule_presets(removed_at,id DESC);`);
  const view=(row,user)=>({id:row.id,author:{id:row.user_id,username:row.author_name},description:row.description,rules:JSON.parse(row.rules),createdAt:row.created_at,canRemove:row.user_id===user?.id});
  const lookup=id=>db.prepare('SELECT p.*,u.username AS author_name FROM mahjong_rule_presets p JOIN site_users u ON u.id=p.user_id AND u.disabled=0 WHERE p.id=? AND p.removed_at IS NULL').get(id);
  return {async handle(req,res,path){
    if(path!=='/api/mahjong/presets'&&!path.startsWith('/api/mahjong/presets/'))return false;
    const match=/^\/api\/mahjong\/presets(?:\/([1-9]\d{0,14})(?:\/(remove))?)?\/?$/.exec(path);if(!match)throw fail(404,'没有找到这个规则方案');
    if(!['GET','POST'].includes(req.method))throw fail(405,'不支持此操作');
    const id=match[1]?Number(match[1]):null,action=match[2],user=req.method==='POST'?users.requireUser(req):users.currentUser(req);
    if(req.method==='GET'){
      if(action)throw fail(405,'请通过按钮下架方案');
      if(id){const row=lookup(id);if(!row)throw fail(404,'这个规则方案已下架或不存在');send(res,200,{preset:view(row,user)});return true;}
      const before=new URL(req.url,'http://local').searchParams.get('before');if(before!==null&&!/^[1-9]\d{0,14}$/.test(before))throw fail(400,'分页位置无效');
      const rows=db.prepare('SELECT p.*,u.username AS author_name FROM mahjong_rule_presets p JOIN site_users u ON u.id=p.user_id AND u.disabled=0 WHERE p.removed_at IS NULL AND p.id<? ORDER BY p.id DESC LIMIT ?').all(before?Number(before):Number.MAX_SAFE_INTEGER,PAGE+1);
      send(res,200,{presets:rows.slice(0,PAGE).map(r=>view(r,user)),nextCursor:rows.length>PAGE?rows[PAGE-1].id:null});return true;
    }
    if(id){
      if(action!=='remove')throw fail(404,'请选择规则方案操作');await body(req);
      transaction(()=>{const row=db.prepare('SELECT user_id FROM mahjong_rule_presets WHERE id=?').get(id);if(!row)throw fail(404,'规则方案不存在');if(row.user_id!==user.id)throw fail(403,'只能下架自己发布的方案');db.prepare('UPDATE mahjong_rule_presets SET removed_at=COALESCE(removed_at,?) WHERE id=?').run(clock(),id);});
      send(res,200,{removed:true});return true;
    }
    const input=inputPreset(await body(req)),rules=JSON.stringify(input.rules);let row,duplicate=false;
    transaction(()=>{
      const old=db.prepare('SELECT * FROM mahjong_rule_presets WHERE user_id=? AND op_id=?').get(user.id,input.opId);
      if(old){if(old.rules!==rules||old.description!==input.description)throw fail(409,'这次发布凭据已使用，请重新编辑后提交');if(old.removed_at!==null)throw fail(409,'这个方案已经下架，请重新发布');row=lookup(old.id);duplicate=true;return;}
      if(db.prepare('SELECT COUNT(*) AS n FROM mahjong_rule_presets WHERE user_id=? AND removed_at IS NULL').get(user.id).n>=10)throw fail(409,'每人最多公开10个规则方案，请先下架不再使用的方案');
      if(db.prepare('SELECT COUNT(*) AS n FROM mahjong_rule_presets WHERE user_id=? AND created_at>?').get(user.id,clock()-HOUR).n>=6)throw fail(429,'一小时最多发布6个方案，请稍后再试');
      const inserted=db.prepare('INSERT INTO mahjong_rule_presets(user_id,op_id,description,rules,created_at) VALUES(?,?,?,?,?)').run(user.id,input.opId,input.description,rules,clock());row=lookup(Number(inserted.lastInsertRowid));
    });send(res,duplicate?200:201,{preset:view(row,user),duplicate});return true;
  }};
}
