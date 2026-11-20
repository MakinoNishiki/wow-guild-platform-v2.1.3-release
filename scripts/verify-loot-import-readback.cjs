// Run through verify-req203-web.cjs --loot-readback using its disposable PostgREST and Chrome.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const folder = path.resolve(__dirname, '../sql');

async function setup(db, user) {
  for (const file of ['01_tables.sql','02_rls.sql','08_activities_status_team_tag.sql','42_task075_loot_drops.sql','45_req191_loot_observations.sql','47_req199_loot_evidence.sql']) {
    await db.query(fs.readFileSync(path.join(folder, file), 'utf8'));
  }
  await db.query('grant usage on schema auth to authenticated, service_role; grant select on guilds,guild_members,loot_drops to authenticated,service_role; grant all on loot_drops,loot_drop_observations,activities to service_role');
  const {rows:[guild]} = await db.query("insert into guilds(name,owner_id,invite_code) values('回读测试',$1,'receipt') returning id", [user]);
  await db.query("insert into guild_members(guild_id,user_id,role) values($1,$2,'owner')", [guild.id,user]);
}

async function verify(page, db, base, pass) {
  await page.goto(base + '/#/team/loot');
  await page.waitForFunction(() => window.CloudSync?.getCurrentGuild()?.id);
  await page.locator('#lootViewTabs [data-lootview="drops"]').click();
  const timestamp = Math.floor(Date.now()/1000)-120;
  const rows = Array.from({length:9}, (_, i) => ({
    itemID:i < 8 ? 100+i : 107, itemName:'装备'+Math.min(7,i), playerName:'团员'+i, timestamp:timestamp+i,
    difficultyID:16, instanceName:'测试团本', bossName:'首领', collectorSourceID:'test-collector',
    sourceEventID:String(i+1), bindingStatus:'ordinary', itemLink:'|Hitem:'+Math.min(107,100+i)+':0|h[装备]|h'
  }));
  const evidence = [{...rows[8],kind:'drop',sequence:1,sourceEventID:'e1',observationKey:'drop:1',encounterID:123,encounterAt:timestamp,quantity:1,captureVersion:'1.1.0'}];
  const modal = page.locator('#lootDropImportModal');
  const open = async data => {
    await page.locator('#lootViewDrops .toolbar-right button').click();
    await page.locator('#lootDropImportText').fill(JSON.stringify(data));
    await page.getByRole('button',{name:'解析预览',exact:true}).click();
  };
  const submit = async () => {
    await page.locator('#lootDropImportConfirmBtn').click();
    await page.waitForFunction(()=>!lootDropImportSaving);
  };
  const count = async () => (await db.query('select count(*)::int n from loot_drops')).rows[0].n;
  await open(rows.slice(0,4));
  await submit();
  assert.equal(await count(),4);
  assert.equal(await modal.isVisible(),false,'四条首次提交应在回读后关闭');
  pass('真实浏览器提交四条拾取，数据库与网页均已确认');

  // Reproduce restoring a previous page cache before a cloud session becomes ready.
  await page.evaluate(() => {
    const original = CloudSync.isCloudMode;
    CloudSync.isCloudMode = () => false;
    try { loadData(); } finally { CloudSync.isCloudMode = original; }
  });
  const data = {schemaVersion:2,rows,evidence};
  await open(data);
  await submit();
  assert.equal(await count(),9);
  assert.equal(await modal.isVisible(),false,'四条历史 + 五条新拾取已入库，但界面未确认');
  assert.equal((await db.query('select count(*)::int n from loot_event_evidence')).rows[0].n,1);
  pass('历史缓存恢复后，四条旧记录、五条新记录与观察证据混合提交成功，同名两件均保留');
  // Simulate a stale SELECT result after a successful receipt. Never repeat the write automatically.
  const reads = '**/rest/v1/loot_drops?**';
  await page.route(reads, route=>route.fulfill({status:200,json:[]}));
  await open(data);
  await submit();
  assert.equal(await modal.isVisible(),true);
  assert.deepEqual(JSON.parse(await page.locator('#lootDropImportText').inputValue()),data);
  await page.unroute(reads);
  await submit();
  assert.equal(await modal.isVisible(),false);
  assert.equal(await count(),9);
  pass('回读确实缺项时保留原文，同一批重试成功，数据库仍为九条');

  const endpoint = '**/api/loot-observations/submit';
  await page.route(endpoint, async route => {
    const response = await route.fetch();
    const receipt = await response.json();
    await route.fulfill({response, json:{...receipt, ids:[]}});
  });
  await open(data);
  await submit();
  assert.equal(await modal.isVisible(),true, '有拾取时，空回执不能算成功');
  await page.unroute(endpoint);
  await submit();
  await open({schemaVersion:2,rows:[],evidence});
  await submit();
  assert.equal(await modal.isVisible(),false);
  assert.equal(await count(),9);
  pass('截短的拾取回执要求核对，只有观察证据的提交接受空拾取回执');
}
module.exports = {setup,verify};
