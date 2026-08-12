// 任务书 #40 验证：REQ-114 数据中心编辑表单部位/类别词表下拉化
// 覆盖（任务书 §四 verify 口径）：
//   ① 双表单（团本掉落 mdEditLootItem / 大秘境掉落 mdEditDungeonLootItem）slot/item_type 均为纯 SELECT
//     （selectCustom 手输兜底退役），选项数 = LootTaxonomy 词表派生长度（禁第三份词表）；
//   ② 原值兜底：库内词表外旧值（slot「腰带」/item_type「图样」合成样本）作为额外选项插入并选中，不强制改写；
//   ③ 选/存/读回环：下拉选值保存 → REST 读回一致；部位↔类型联动（REQ-060 保留：用户改部位不合法已选清空）；
//   ④ 与 REQ-113 联动：改部位保存 → 副本掉落页重拉后按新部位筛选可见（B3 主链路）；
//   ⑤ 版本串两壳 .52 同步；公示页 308 基线零漂移；全程零 JS 报错零 404。
// §1 distinct 盘点表随 docs/TASK-040-修改报告.md 送审（boss_loot 190 行 / dungeon_loot 221 行全量）。
// 测试数据（T40 前缀 + t40- 测试用户/公会）终清理并复核为零。
// 用法: node scripts/verify-task40.js（PW_CHANNEL=chrome 可选）
// 截图输出 backup/2026-08-12-task40/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-12-task40');
const PORT = 15691;
const BASE = `http://localhost:${PORT}`;
const PWD = 'T40-Test-2026!';
const EMAIL_SUPER = 't40-super@wowbutler.cn';
const ITEM_1 = 'T40词表测试之刃';
const ITEM_FB = 'T40兜底旧值之带';
const ITEM_DG = 'T40大秘境词表之戒';
const BASELINE = { total: 308, raid: 104, dungeon: 204 };

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail !== undefined ? `（${detail}）` : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function svc(method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}
async function rpcPublic() {
  const res = await fetch(`${SB}/rest/v1/rpc/get_public_loot_detail`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: '{}',
  });
  return { status: res.status, body: await res.json() };
}

let serverProc = null, superU = null, guildId = null;
let currentSeasonId = null, testRaidId = null, testBossId = null, testDungeonId = null;

async function makeUser(email, displayName) {
  let res = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD, data: { display_name: displayName } }),
  });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PWD }),
    });
    body = await res.json();
  }
  return { uid: body.user.id, token: body.access_token };
}
async function setSuperadmin(uid) {
  const res = await fetch(`${SB}/auth/v1/admin/users/${uid}`, {
    method: 'PUT', headers: SVC, body: JSON.stringify({ app_metadata: { role: 'superadmin' } }),
  });
  return res.status;
}

async function setup() {
  await svc('DELETE', `/rest/v1/boss_loot?item_name=like.T40*`);
  await svc('DELETE', `/rest/v1/dungeon_loot?item_name=like.T40*`);
  const oldG = await svc('GET', `/rest/v1/guilds?select=id&name=like.T40*`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) await svc('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  const lu = await fetch(`${SB}/auth/v1/admin/users?per_page=50`, { headers: SVC });
  const lj = await lu.json();
  const hit = (lj.users || []).find(u => u.email === EMAIL_SUPER);
  if (hit) await fetch(`${SB}/auth/v1/admin/users/${hit.id}`, { method: 'DELETE', headers: SVC });

  const cs = await svc('GET', '/rest/v1/game_seasons?select=id,is_current,start_date&order=start_date.asc');
  const cur = cs.body.find(s => s.is_current) || cs.body[cs.body.length - 1];
  currentSeasonId = cur.id;
  const raids = await svc('GET', `/rest/v1/game_raids?select=id&season_id=eq.${currentSeasonId}&type=neq.world&limit=1`);
  testRaidId = raids.body[0].id;
  const bosses = await svc('GET', `/rest/v1/game_bosses?select=id&raid_id=eq.${testRaidId}&limit=1`);
  testBossId = bosses.body[0].id;
  const d = await svc('GET', `/rest/v1/game_dungeons?select=id&season_id=eq.${currentSeasonId}&limit=1`);
  testDungeonId = d.body[0].id;

  superU = await makeUser(EMAIL_SUPER, 'T40超管');
  if ((await setSuperadmin(superU.uid)) !== 200) throw new Error('设置 superadmin 失败');
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T40词表会', owner_id: superU.uid, invite_code: 'T40A' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: superU.uid, role: 'owner', display_name: 'T40超管' }]);

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  const steps = [];
  try { const r = await svc('DELETE', `/rest/v1/boss_loot?item_name=like.T40*`); steps.push(`boss:${r.status}`); } catch { steps.push('boss:ERR'); }
  try { const r = await svc('DELETE', `/rest/v1/dungeon_loot?item_name=like.T40*`); steps.push(`dung:${r.status}`); } catch { steps.push('dung:ERR'); }
  if (guildId) { try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); steps.push(`guild:${r.status}`); } catch { steps.push('guild:ERR'); } }
  if (superU) { try { await fetch(`${SB}/auth/v1/admin/users/${superU.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); } }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', `/rest/v1/boss_loot?select=id&item_name=like.T40*`);
  const c2 = await svc('GET', `/rest/v1/dungeon_loot?select=id&item_name=like.T40*`);
  const c3 = await svc('GET', `/rest/v1/guilds?select=id&name=like.T40*`);
  const zero = [c1, c2, c3].every(c => Array.isArray(c.body) && c.body.length === 0);
  check('[清理复核] T40 前缀掉落/公会全 0', zero, `boss=${c1.body.length} dung=${c2.body.length} guild=${c3.body.length}`);
}

async function login(page, email) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
  await page.fill('#authEmail', email);
  await page.fill('#authPassword', PWD);
  await page.click('#authLoginBtn');
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  await sleep(1500);
}
async function clickSaveAndWaitToast(page) {
  await page.evaluate(() => { document.getElementById('toastContainer').innerHTML = ''; });
  await page.click('#mdEditorSaveBtn');
  await page.waitForFunction(() => document.getElementById('toastContainer').innerText.includes('已保存'), null, { timeout: 30000 });
}
async function dcNavToBoss(page, raidId, bossId) {
  await page.evaluate(({ raidId, bossId }) => {
    const sels = document.querySelectorAll('#mdPanel select');
    sels[0].value = raidId; sels[0].dispatchEvent(new Event('change'));
    const sels2 = document.querySelectorAll('#mdPanel select');
    sels2[1].value = bossId; sels2[1].dispatchEvent(new Event('change'));
  }, { raidId, bossId });
  await sleep(400);
}
async function dcNavToDungeon(page, dungeonId) {
  await page.evaluate((dungeonId) => {
    const sels = document.querySelectorAll('#mdPanel select');
    sels[0].value = dungeonId; sels[0].dispatchEvent(new Event('change'));
  }, dungeonId);
  await sleep(400);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  // ==================== A. 基线与版本串 ====================
  const rpc0 = await rpcPublic();
  const s1 = rpc0.body.filter(r => r.season_id === currentSeasonId);
  const baseline = { total: s1.length, raid: s1.filter(r => r.source === 'raid').length, dungeon: s1.filter(r => r.source === 'dungeon').length };
  check('A1 公示页 308 基线（S1 全部/团本/大秘境）', baseline.total === BASELINE.total && baseline.raid === BASELINE.raid && baseline.dungeon === BASELINE.dungeon,
    `实测=${baseline.total}/${baseline.raid}/${baseline.dungeon}`);
  const htmlData = await (await fetch(`${BASE}/data.html`)).text();
  const htmlIndex = await (await fetch(`${BASE}/`)).text();
  const verOf = h => [...new Set([...h.matchAll(/20260811\.\d+/g)].map(m => m[0]))];
  const vD = verOf(htmlData), vI = verOf(htmlIndex);
  check('A2 版本串两壳同步（单一串且两壳一致；本包交付时点 .52，后续递增为预期）', vD.length === 1 && vI.length === 1 && vD[0] === vI[0] && parseInt(vI[0].split('.')[1], 10) >= 52, `index=${vI} data=${vD}`);

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  const notFounds = [];
  const watch = (page, tag) => {
    page.on('pageerror', e => pageErrors.push(`pageerror(${tag}): ` + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push(`console(${tag}): ` + msg.text()); });
    page.on('response', r => { if (r.status() === 404) notFounds.push(`${tag}: ${r.url()}`); });
    page.on('dialog', d => { console.log('[dialog] ' + d.message()); d.accept(); });
  };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    watch(page, 'dc');
    await login(page, EMAIL_SUPER);

    // ==================== B. 团本掉落表单（新增弹窗结构断言） ====================
    await page.evaluate(() => switchPage('datacenter'));
    await page.waitForSelector('.view-tab[data-mdtab="loot"]', { state: 'visible', timeout: 20000 });
    await page.click('.view-tab[data-mdtab="loot"]');
    await page.waitForSelector('#mdPanel table', { timeout: 20000 });
    await dcNavToBoss(page, testRaidId, testBossId);
    await page.click('button:has-text("+ 新增掉落")');
    await page.waitForSelector('#mdField_slot', { state: 'visible', timeout: 10000 });

    const b1 = await page.evaluate(() => {
      const slot = document.getElementById('mdField_slot');
      const type = document.getElementById('mdField_item_type');
      return {
        slotTag: slot.tagName, typeTag: type.tagName,
        slotOpts: [...slot.options].map(o => o.value),
        typeOpts: [...type.options].map(o => o.value),
        noCustomSlot: !document.getElementById('mdField_slot_custom'),
        noCustomType: !document.getElementById('mdField_item_type_custom'),
        dcSlotLen: window.LootTaxonomy.DC_SLOT_OPTIONS.length,
        dcTypeLen: window.LootTaxonomy.DC_ITEM_TYPE_OPTIONS.length,
        dcTypeHas: window.LootTaxonomy.DC_ITEM_TYPE_OPTIONS,
        slotFromTax: JSON.stringify([...slot.options].map(o => o.value)) === JSON.stringify(window.LootTaxonomy.DC_SLOT_OPTIONS),
      };
    });
    check('B1 双字段均为纯 SELECT 且无手输框（selectCustom 退役）',
      b1.slotTag === 'SELECT' && b1.typeTag === 'SELECT' && b1.noCustomSlot && b1.noCustomType);
    check('B2 slot 选项=LootTaxonomy.DC_SLOT_OPTIONS 派生（12 部位+库内其它值，顺序一致）',
      b1.slotFromTax && b1.slotOpts.length === 19 && b1.dcSlotLen === 19, `选项=${b1.slotOpts.length} 词表=${b1.dcSlotLen}`);
    check('B3 item_type 词表=LootTaxonomy.DC_ITEM_TYPE_OPTIONS（武器15+盾牌+护甲4+杂项族13=33），表单初始选项按默认部位「头部」收拢且 ⊆ 词表',
      b1.dcTypeLen === 33 && b1.typeOpts.length === 4 && b1.typeOpts.every(o => b1.dcTypeHas.includes(o))
        && b1.dcTypeHas.includes('盾牌') && b1.dcTypeHas.includes('其它') && b1.dcTypeHas.includes('坐骑'),
      `词表=${b1.dcTypeLen} 初始=${JSON.stringify(b1.typeOpts)}`);

    // 部位↔类型联动（REQ-060 保留）：改「头部」→ 类型只剩护甲 4 项；改「杂项」→ 全量词表
    await page.selectOption('#mdField_slot', '头部');
    await sleep(300);
    const b4a = await page.evaluate(() => [...document.getElementById('mdField_item_type').options].map(o => o.value));
    check('B4 联动：部位「头部」→ 类型收为护甲 4 项', JSON.stringify(b4a) === JSON.stringify(['板甲', '锁甲', '皮甲', '布甲']), JSON.stringify(b4a));
    await page.selectOption('#mdField_slot', '杂项');
    await sleep(300);
    const b4b = await page.evaluate(() => [...document.getElementById('mdField_item_type').options].map(o => o.value).length);
    check('B5 联动：部位「杂项」（映射表外）→ 类型全量词表 33 项', b4b === 33, `选项=${b4b}`);

    // ==================== C. 选/存/读回环（新增→保存→REST 读回） ====================
    await page.fill('#mdField_item_name', ITEM_1);
    await page.selectOption('#mdField_slot', '单手');
    await sleep(300);
    await page.selectOption('#mdField_item_type', '单手剑');
    await clickSaveAndWaitToast(page);
    const c1 = await svc('GET', `/rest/v1/boss_loot?select=id,slot,item_type&item_name=eq.${encodeURIComponent(ITEM_1)}`);
    check('C1 新增保存→写读一致（slot=单手/item_type=单手剑）',
      c1.body.length === 1 && c1.body[0].slot === '单手' && c1.body[0].item_type === '单手剑', JSON.stringify(c1.body));

    // 编辑回显 + 改部位保存（REQ-113 联动主链路：副本掉落页重拉后肩部筛选可见）
    await dcNavToBoss(page, testRaidId, testBossId);
    await page.evaluate((n) => {
      const row = [...document.querySelectorAll('#mdPanel tr')].find(tr => tr.innerText.includes(n));
      row.querySelector('button[title="编辑"]').click();
    }, ITEM_1);
    await page.waitForSelector('#mdField_slot', { state: 'visible', timeout: 10000 });
    const c2pre = await page.evaluate(() => ({
      slot: document.getElementById('mdField_slot').value,
      type: document.getElementById('mdField_item_type').value,
    }));
    check('C2 编辑回显：slot/item_type 当前值已选中', c2pre.slot === '单手' && c2pre.type === '单手剑', JSON.stringify(c2pre));
    await page.selectOption('#mdField_slot', '肩部');
    await sleep(300);
    const c2mid = await page.evaluate(() => ({
      typeOpts: [...document.getElementById('mdField_item_type').options].map(o => o.value),
      typeVal: document.getElementById('mdField_item_type').value,
    }));
    check('C3 用户改部位「肩部」→ 不合法已选清空（类型收护甲 4 项且不再带单手剑）',
      c2mid.typeOpts.length === 4 && !c2mid.typeOpts.includes('单手剑'), JSON.stringify(c2mid));
    await page.selectOption('#mdField_item_type', '板甲');
    await clickSaveAndWaitToast(page);
    const c4 = await svc('GET', `/rest/v1/boss_loot?select=id,slot,item_type&item_name=eq.${encodeURIComponent(ITEM_1)}`);
    check('C4 改部位保存→写读一致（肩部/板甲）', c4.body.length === 1 && c4.body[0].slot === '肩部' && c4.body[0].item_type === '板甲', JSON.stringify(c4.body));

    // 副本掉落页重拉（REQ-113）→ 部位「肩部」三级筛选可见 T40 卡
    await page.click('.nav-item[data-page="lootdrop"]');
    await page.waitForFunction((n) => [...document.querySelectorAll('#page-lootdrop #dpMain .dp-item-name')].some(x => x.textContent === n), ITEM_1, { timeout: 30000 });
    // 演进驱动适配（任务书 #43：1366<1400 折叠顶栏态组行默认收起）：先展开组行再操作分类 chips
    const t40rowsOpen = await page.evaluate(() => document.querySelector('#page-lootdrop #dpFilterBar').classList.contains('filters-open'));
    if (!t40rowsOpen) { await page.click('#page-lootdrop #dpFilterToggle'); await sleep(400); }
    await page.evaluate(() => {
      const tab = [...document.querySelectorAll('#page-lootdrop #dpCatTabs .dp-cat-tab')].find(t => t.dataset.v === 'slot');
      tab.click();
    });
    await sleep(400);
    await page.click('#page-lootdrop #dpCatChips .dp-chip[data-v="肩部"]');
    await sleep(600);
    const c5 = await page.evaluate((n) => ({
      cards: [...document.querySelectorAll('#page-lootdrop #dpMain .dp-item-name')].map(x => x.textContent),
      hit: document.querySelector('#page-lootdrop #dpFlatHead').innerText,
    }), ITEM_1);
    check('C5 REQ-113 联动：重拉后部位「肩部」筛选命中 T40 卡', c5.cards.includes(ITEM_1), `命中=${c5.hit} 卡含=${c5.cards.includes(ITEM_1)}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'lootdrop-shoulder-filter.png'), fullPage: false });

    // ==================== D. 原值兜底（词表外旧值额外选项插入并选中） ====================
    const fbIns = await svc('POST', '/rest/v1/boss_loot', { boss_id: testBossId, item_name: ITEM_FB, slot: '腰带', item_type: '图样' });
    if (fbIns.status !== 201) throw new Error('兜底样本插入失败: ' + JSON.stringify(fbIns.body));
    await page.evaluate(() => switchPage('datacenter'));
    await page.waitForSelector('#mdPanel table', { timeout: 20000 });
    // MasterData 缓存无此行（旁路插入）——刷新缓存再进编辑
    await page.evaluate(async () => { await MasterData.refresh('boss_loot'); renderDatacenter(); });
    await dcNavToBoss(page, testRaidId, testBossId);
    await page.evaluate((n) => {
      const row = [...document.querySelectorAll('#mdPanel tr')].find(tr => tr.innerText.includes(n));
      row.querySelector('button[title="编辑"]').click();
    }, ITEM_FB);
    await page.waitForSelector('#mdField_slot', { state: 'visible', timeout: 10000 });
    const d1 = await page.evaluate(() => ({
      slotOpts: [...document.getElementById('mdField_slot').options].map(o => o.value),
      slotVal: document.getElementById('mdField_slot').value,
      typeOpts: [...document.getElementById('mdField_item_type').options].map(o => o.value),
      typeVal: document.getElementById('mdField_item_type').value,
    }));
    check('D1 原值兜底：slot「腰带」插入为额外选项并选中（词表 19+1=20）',
      d1.slotOpts.length === 20 && d1.slotOpts.includes('腰带') && d1.slotVal === '腰带', `slot=${d1.slotVal} 选项=${d1.slotOpts.length}`);
    check('D2 原值兜底：item_type「图样」插入为额外选项并选中（词表 33+1=34）',
      d1.typeOpts.length === 34 && d1.typeOpts.includes('图样') && d1.typeVal === '图样', `type=${d1.typeVal} 选项=${d1.typeOpts.length}`);
    // 不保存直接关（未编辑不触发防误关）
    await page.evaluate(() => closeModal('mdEditorModal'));
    await page.screenshot({ path: path.join(SHOT_DIR, 'fallback-options.png'), fullPage: false });

    // ==================== E. 大秘境掉落表单（双表单同步） ====================
    await page.click('.view-tab[data-mdtab="dungeonloot"]');
    await page.waitForSelector('#mdPanel table', { timeout: 20000 });
    await dcNavToDungeon(page, testDungeonId);
    await page.click('button:has-text("+ 新增掉落")');
    await page.waitForSelector('#mdField_slot', { state: 'visible', timeout: 10000 });
    const e1 = await page.evaluate(() => ({
      slotTag: document.getElementById('mdField_slot').tagName,
      typeTag: document.getElementById('mdField_item_type').tagName,
      slotOpts: [...document.getElementById('mdField_slot').options].map(o => o.value).length,
      typeOpts: [...document.getElementById('mdField_item_type').options].map(o => o.value).length,
      noCustom: !document.getElementById('mdField_slot_custom') && !document.getElementById('mdField_item_type_custom'),
    }));
    check('E1 大秘境表单同步下拉化（双 SELECT、slot 19 项、初始类型按默认部位收拢 4 项、无手输框）',
      e1.slotTag === 'SELECT' && e1.typeTag === 'SELECT' && e1.slotOpts === 19 && e1.typeOpts === 4 && e1.noCustom, JSON.stringify(e1));
    await page.fill('#mdField_item_name', ITEM_DG);
    await page.selectOption('#mdField_slot', '手指');
    await sleep(300);
    const e2opts = await page.evaluate(() => [...document.getElementById('mdField_item_type').options].map(o => o.value));
    check('E2 大秘境联动：部位「手指」→ 类型收为戒指', JSON.stringify(e2opts) === JSON.stringify(['戒指']), JSON.stringify(e2opts));
    await page.selectOption('#mdField_item_type', '戒指');
    await clickSaveAndWaitToast(page);
    const e3 = await svc('GET', `/rest/v1/dungeon_loot?select=id,slot,item_type&item_name=eq.${encodeURIComponent(ITEM_DG)}`);
    check('E3 大秘境新增保存→写读一致（手指/戒指）', e3.body.length === 1 && e3.body[0].slot === '手指' && e3.body[0].item_type === '戒指', JSON.stringify(e3.body));
    await page.screenshot({ path: path.join(SHOT_DIR, 'dungeon-form-select.png'), fullPage: false });

    await ctx.close();

    const realErrors = pageErrors.filter(e => !e.includes('status of 406') && !e.includes('status of 409'));
    check('全程零 JS 报错（406/409 资源状态码噪音另行列示）', realErrors.length === 0, realErrors.join(' | ') || '无');
    check('全程零 404', notFounds.length === 0, notFounds.join(' | ') || '无');
  } finally {
    await browser.close();
  }

  await cleanup();

  // ==================== G. 清理后 308 基线还原 ====================
  const rpc1 = await rpcPublic();
  const s1After = rpc1.body.filter(r => r.season_id === currentSeasonId);
  const after = { total: s1After.length, raid: s1After.filter(r => r.source === 'raid').length, dungeon: s1After.filter(r => r.source === 'dungeon').length };
  check('G1 清理后 308 基线还原（S1 全部/团本/大秘境）', after.total === BASELINE.total && after.raid === BASELINE.raid && after.dungeon === BASELINE.dungeon,
    `实测=${after.total}/${after.raid}/${after.dungeon}`);

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#40 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => {
  console.error('[验证脚本异常]', e);
  try { await cleanup(); } catch {}
  process.exit(1);
});
