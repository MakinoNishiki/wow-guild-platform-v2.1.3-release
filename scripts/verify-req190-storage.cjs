// 只在临时目录启动新的 PostgreSQL，不读取站点配置或接受外部数据库连接。
// 指定 WB_PG_BIN 为本地 PostgreSQL bin，NODE_PATH 指向装有 pg 的工具目录。
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const {execFileSync} = require('node:child_process');
const {randomUUID, randomBytes, createHash} = require('node:crypto');
const {Client} = require('pg');

async function main() {
  const bin = process.env.WB_PG_BIN;
  assert.ok(bin, '请指定 WB_PG_BIN');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-req190-pg-'));
  const log = path.join(temp, 'server.log'), data = path.join(temp, 'data'), pw = path.join(temp, 'pw');
  const run = (name, args) => execFileSync(path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')), args,
    {stdio:'ignore', windowsHide:true});
  const host = '127.0.0.1', password = randomBytes(24).toString('hex');
  const probe = net.createServer();
  await new Promise((resolve,reject) => probe.once('error', reject).listen(0, host, resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  let started = false;
  const clients = [];
  try {
    fs.writeFileSync(pw, password);
    run('initdb', ['-D',data,'-U','postgres','-A','scram-sha-256','--pwfile',pw,'--no-locale','--encoding=UTF8']);
    fs.unlinkSync(pw);
    run('pg_ctl', ['-D',data,'-l',log,'-o','-h '+host+' -p '+port,'-w','start']);
    started = true;
    for (let i=0; i<3; i++) {
      const client = new Client({host, port, database:'postgres',user:'postgres',password});
      await client.connect();
      clients.push(client);
    }
    const [db, manager1, manager2] = clients;
    await db.query('create role anon; create role authenticated; create role service_role bypassrls; ' +
      'create schema auth; create table auth.users(id uuid primary key)');
    const migrate = file => db.query(fs.readFileSync(path.join(__dirname, '..','sql', file),'utf8'));
    for (const file of ['01_tables.sql','05_req014_activities_add_wcl.sql','08_activities_status_team_tag.sql',
      '12_req062_activities_add_team_label.sql','58_req190_guild_reports.sql','58_req190_guild_reports.sql']) await migrate(file);
    for (const role of ['anon','authenticated','service_role']) {
      const {rows:[acl]} = await db.query("select has_table_privilege($1,'guild_battle_reports','select') as raw, " +
        "has_table_privilege($1,'guild_battle_reports','update') as edit, " +
        "has_table_privilege($1,'guild_battle_report_read','select') as read, " +
        "has_function_privilege($1,'req190_save_report(uuid,uuid,uuid,integer,text,jsonb,jsonb,text,text)','execute') as rpc", [role]);
      assert.deepEqual(acl,{raw:false,edit:false,read:role==='service_role',rpc:role==='service_role'});
    }
    console.log('PASS 迁移连续执行两次，业务表禁止直读写，服务端专用读取与写入权限正确');
    const [guild,other,activity,owner,editor,viewer] = Array.from({length:6}, () => randomUUID());
    await db.query("insert into guilds(id,name,invite_code) values ($1,'甲','one'),($2,'乙','two')",[guild,other]);
    await db.query('insert into auth.users select * from unnest($1::uuid[])',[[owner,editor,viewer]]);
    await db.query("insert into guild_members(guild_id,user_id,role) values ($1,$2,'owner'),($1,$3,'editor'),($1,$4,'viewer'),($5,$2,'owner')",
      [guild,owner,editor,viewer,other]);
    await db.query("insert into activities(id,guild_id,name,activity_date,raid,team_label,wcl_report_code) values ($1,$2,'内部活动',current_date,'团本','2','TESTCODE')",
      [activity,guild]);
    await Promise.all([manager1.query('set role service_role'),manager2.query('set role service_role')]);
    const source = {raid:'团本',status:'normal',team_label:'2',wcl_url:null,wcl_report_code:'TESTCODE'};
    const snapshot = {reportCode:'TESTCODE',kills:[{fightId:1}]};
    const base = {user:owner,guild,version:0,action:'draft',source,snapshot,message:'草稿'};
    function save(client, overrides) {
      const r = {...base, ...overrides};
      const requestHash = createHash('sha256').update(JSON.stringify(r)).digest('hex');
      return client.query('select req190_save_report($1,$2,$3,$4,$5,$6,$7,$8,$9) as version',
        [r.guild,activity,r.user,r.version,r.action,r.source,r.snapshot,r.message,requestHash]).then(v => v.rows[0].version);
    }
    const count = async () => Number((await db.query('select count(*) from guild_battle_reports')).rows[0].count);
    const published = async () => Number((await manager1.query("select count(*) from guild_battle_report_read " +
      "where status='published' and evidence_status='verified'")).rows[0].count);
    await assert.rejects(save(manager1,{user:viewer}),{code:'42501'});
    await assert.rejects(save(manager1,{guild:other}),/不属于/);
    await assert.rejects(save(manager1,{action:'withdraw'}),/不存在/);
    await assert.rejects(save(manager1,{source:{...source,wcl_report_code:'OLD'}}),/变更/);
    assert.equal(await count(),0);
    console.log('PASS viewer、跨公会、空撤回、已换日志均被拒绝，零建档');
    const duplicate = await Promise.all([save(manager1,{}),save(manager2,{})]);
    assert.deepEqual(duplicate,[1,1]);
    assert.equal(await count(),1);
    assert.equal(await published(),0);
    const changes = [{version:1,action:'publish',message:'A'}, {version:1,action:'publish',message:'B',user:editor}];
    const results = await Promise.allSettled([save(manager1,changes[0]),save(manager2,changes[1])]);
    assert.equal(results.filter(r => r.status === 'fulfilled' && r.value === 2).length,1);
    assert.equal(results.filter(r => r.status === 'rejected' && r.reason.code==='P0001').length,1);
    assert.equal(await published(),1);
    await assert.rejects(save(manager1,{}),/更新/);
    await assert.rejects(save(manager1,{version:2}),/撤回/);
    console.log('PASS 双连接同时首次保存仅一条；不同管理者竞争同一版本仅一方发布成功；旧请求不能覆盖');
    await db.query("update activities set wcl_url='https://example.invalid/new' where id=$1",[activity]);
    assert.equal(await published(),0);
    await assert.rejects(save(manager1,{version:2,action:'publish'}),/变更/);
    await db.query("update activities set status='cancelled',wcl_url=null where id=$1",[activity]);
    assert.equal(await published(),0);
    await assert.rejects(save(manager1,{version:2,action:'publish'}),/变更/);
    const withdrawal = {version:2,action:'withdraw',source:null,snapshot:null,message:''};
    assert.equal(await save(manager2,withdrawal),3);
    assert.equal(await save(manager1,withdrawal),3);
    const {rows:[row]} = await db.query('select status,published_at,snapshot,message,history from guild_battle_reports');
    assert.equal(row.status,'draft');
    assert.equal(row.published_at,null);
    assert.deepEqual(row.snapshot,snapshot);
    assert.ok(['A','B'].includes(row.message));
    assert.equal(row.history.length,2);
    assert.equal(row.history[1].kills,1);
    assert.deepEqual(row.history[1].changedFields,['status']);
    assert.ok(row.history.every(entry => !('snapshot' in entry) && !('message' in entry)));
    assert.equal(await count(),1);
    console.log('PASS 已发布记录换日志及取消后退出公开集合，仍可撤回并重试，原证据和历史完整');
    await db.query("update guild_members set role='viewer' where user_id=$1",[owner]);
    await assert.rejects(save(manager1,withdrawal),{code:'42501'});
    console.log('PASS 降权后即便重试上一次已成功操作也会重新拒绝');
    await db.query("update activities set status='normal' where id=$1",[activity]);
    for (let version=3; version<40; version++) {
      assert.equal(await save(manager2,{version,user:editor,message:'修改 '+version}),version+1);
    }
    const {rows:[saved]} = await db.query('select history from guild_battle_reports');
    assert.equal(saved.history.length,30);
    assert.deepEqual([saved.history[0].version,saved.history.at(-1).version],[10,39]);
    assert.deepEqual(saved.history.at(-1).changedFields,['message']);
    assert.equal(await count(),1);
    console.log('PASS 同一活动编辑到第 40 版，仍一行、一份详细快照，最近 30 次仅留修改摘要');
    assert.equal(await save(manager2,{version:40,user:editor,action:'publish'}),41);
    const {rows:[{id:reportId}]} = await db.query('select id from guild_battle_reports');
    const pause = {user:editor,version:41,action:'invalidate',source:{reportId,reportCode:'TESTCODE'},snapshot:null,message:''};
    assert.equal(await save(manager2,{...pause,source:{reportId,reportCode:'OTHER'}}),0);
    assert.equal(await published(),1);
    assert.equal(await save(manager2,pause),42);
    assert.equal(await published(),0);
    assert.equal(await save(manager2,pause),0);
    assert.equal(await save(manager2,{version:42,user:editor,action:'publish'}),43);
    assert.equal(await published(),1);
    assert.equal(await save(manager2,pause),0);
    assert.equal(await published(),1);
    assert.equal(await count(),1);
    console.log('PASS 确证失效只暂停同版本同来源；管理者重发后，迟到的旧核验不能撤下新版');
  } finally {
    await Promise.allSettled(clients.map(client => client.end()));
    if (started) run('pg_ctl',['-D',data,'-m','fast','-w','stop']);
    if (path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('wb-req190-pg-')) {
      fs.rmSync(temp,{recursive:true,force:true});
    }
  }
}
main().catch(err => { console.error(err.message); process.exitCode=1; });
