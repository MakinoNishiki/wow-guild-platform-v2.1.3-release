// 任务书 #39 验证：REQ-113 副本掉落页签数据即时刷新根治（脏标记 + activate 重拉）
// 覆盖（任务书 §四 verify 口径）：
//   ① 数据中心编辑保存 → window.__dpLootDirty 置位（mdWrite/mdUpsert 统一口）；
//   ② activate 检测脏标记 → 重拉（RPC+字典表请求计数断言）→ 新值渲染 → 清标记；
//   ③ 筛选态守恒：搜索词/主属性 chip/平铺命中数/折叠记忆（sessionStorage）重拉后全保留；
//   ④ 无脏标记 activate 零请求（掉落页 9 端点计数器断言）；
//   ⑤ 失败路径：RPC 断网下重拉失败 → toast 提示 + 旧数据保留（不白屏）+ 标记留存，恢复后重试成功；
//   ⑥ 公开壳 data.html 无编辑入口不在脏标记链路（一句话说明 + 基线卡数断言）；
//   ⑦ 公示页 308 基线零漂移；版本串两壳 .51 同步；全程零 JS 报错零 404。
// 测试数据（T39 前缀掉落行 + t39- 测试用户/公会）终清理并复核为零。
// 用法: node scripts/verify-task39.js（PW_CHANNEL=chrome 可选）
// 截图输出 backup/2026-08-12-task39/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-12-task39');
const PORT = 15681;
const BASE = `http://localhost:${PORT}`;
const PWD = 'T39-Test-2026!';
const EMAIL_SUPER = 't39-super@wowbutler.cn';
const ITEM_1 = 'T39刷新测试之刃';
const ITEM_2 = 'T39刷新测试之刃改';
const FX_1 = '装备：T39 初始特效文本。';
const FX_2 = '装备：T39 编辑后特效文本，用于重拉可见性断言。';
const BASELINE = { total: 308, raid: 104, dungeon: 204 }; // sql/24 R13 口径基线（公示页 308 零回归硬约束）

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
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  return { status: res.status, body: await res.json() };
}

// 掉落页数据端点（9 路：公开 RPC + 8 张被消费字典表），请求计数只盯这些——通知 RPC 等无关流量不计
const DP_REQ = /(get_public_loot_detail|\/game_seasons|\/game_raids|\/game_bosses|\/tier_sets|\/game_dungeons|\/game_classes|\/game_specs)/;

let serverProc = null, superU = null, guildId = null;
let currentSeasonId = null, testRaidId = null, testBossId = null;
let baseline = null;

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
  // 前置自清（上轮失败残留幂等清扫）
  await svc('DELETE', `/rest/v1/boss_loot?item_name=like.T39*`);
  await svc('DELETE', `/rest/v1/dungeon_loot?item_name=like.T39*`);
  const oldG = await svc('GET', `/rest/v1/guilds?select=id&name=like.T39*`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) await svc('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  const lu = await fetch(`${SB}/auth/v1/admin/users?per_page=50`, { headers: SVC });
  const lj = await lu.json();
  const hit = (lj.users || []).find(u => u.email === EMAIL_SUPER);
  if (hit) await fetch(`${SB}/auth/v1/admin/users/${hit.id}`, { method: 'DELETE', headers: SVC });

  const cs = await svc('GET', '/rest/v1/game_seasons?select=id,is_current,start_date&order=start_date.asc');
  const cur = cs.body.find(s => s.is_current) || cs.body[cs.body.length - 1];
  currentSeasonId = cur.id;
  const raids = await svc('GET', `/rest/v1/game_raids?select=id,type&season_id=eq.${currentSeasonId}&type=neq.world&limit=1`);
  testRaidId = raids.body[0].id;
  const bosses = await svc('GET', `/rest/v1/game_bosses?select=id&raid_id=eq.${testRaidId}&limit=1`);
  testBossId = bosses.body[0].id;

  superU = await makeUser(EMAIL_SUPER, 'T39超管');
  if ((await setSuperadmin(superU.uid)) !== 200) throw new Error('设置 superadmin 失败');
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T39刷新会', owner_id: superU.uid, invite_code: 'T39A' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: superU.uid, role: 'owner', display_name: 'T39超管' }]);

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  const steps = [];
  try { const r = await svc('DELETE', `/rest/v1/boss_loot?item_name=like.T39*`); steps.push(`boss:${r.status}`); } catch { steps.push('boss:ERR'); }
  try { const r = await svc('DELETE', `/rest/v1/dungeon_loot?item_name=like.T39*`); steps.push(`dung:${r.status}`); } catch { steps.push('dung:ERR'); }
  if (guildId) { try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); steps.push(`guild:${r.status}`); } catch { steps.push('guild:ERR'); } }
  if (superU) { try { await fetch(`${SB}/auth/v1/admin/users/${superU.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); } }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', `/rest/v1/boss_loot?select=id&item_name=like.T39*`);
  const c2 = await svc('GET', `/rest/v1/dungeon_loot?select=id&item_name=like.T39*`);
  const c3 = await svc('GET', `/rest/v1/guilds?select=id&name=like.T39*`);
  const zero = [c1, c2, c3].every(c => Array.isArray(c.body) && c.body.length === 0);
  check('[清理复核] T39 前缀掉落/公会全 0', zero, `boss=${c1.body.length} dung=${c2.body.length} guild=${c3.body.length}`);
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

// 保存点击：先清 toast 容器（消除残留 toast 提前 resolve），点保存，等本次 toast
async function clickSaveAndWaitToast(page) {
  await page.evaluate(() => { document.getElementById('toastContainer').innerHTML = ''; });
  await page.click('#mdEditorSaveBtn');
  await page.waitForFunction(() => document.getElementById('toastContainer').innerText.includes('已保存'), { timeout: 15000 });
}

// 数据中心掉落池导航到指定团本/BOSS（真实 UI select + change 事件链路）
async function dcNavToBoss(page, raidId, bossId) {
  await page.evaluate(({ raidId, bossId }) => {
    const sels = document.querySelectorAll('#mdPanel select');
    sels[0].value = raidId;
    sels[0].dispatchEvent(new Event('change'));
    const sels2 = document.querySelectorAll('#mdPanel select');
    sels2[1].value = bossId;
    sels2[1].dispatchEvent(new Event('change'));
  }, { raidId, bossId });
  await sleep(400);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  // ==================== A. 基线与版本串 ====================
  const rpc0 = await rpcPublic();
  const s1 = rpc0.body.filter(r => r.season_id === currentSeasonId);
  baseline = {
    total: s1.length,
    raid: s1.filter(r => r.source === 'raid').length,
    dungeon: s1.filter(r => r.source === 'dungeon').length,
  };
  check('A1 公示页 308 基线（S1 全部/团本/大秘境）', baseline.total === BASELINE.total && baseline.raid === BASELINE.raid && baseline.dungeon === BASELINE.dungeon,
    `实测=${baseline.total}/${baseline.raid}/${baseline.dungeon} 基线=${BASELINE.total}/${BASELINE.raid}/${BASELINE.dungeon}`);

  const htmlData = await (await fetch(`${BASE}/data.html`)).text();
  const htmlIndex = await (await fetch(`${BASE}/`)).text();
  const verOf = h => [...new Set([...h.matchAll(/20260811\.\d+/g)].map(m => m[0]))];
  const vD = verOf(htmlData), vI = verOf(htmlIndex);
  check('A2 版本串两壳同步（单一串且两壳一致；本包交付时点 .51，后续递增为预期）', vD.length === 1 && vI.length === 1 && vD[0] === vI[0] && parseInt(vI[0].split('.')[1], 10) >= 51, `index=${vI} data=${vD}`);

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  const notFounds = [];
  const watch = (page, tag) => {
    page.on('pageerror', e => pageErrors.push(`pageerror(${tag}): ` + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push(`console(${tag}): ` + msg.text()); });
    page.on('response', r => { if (r.status() === 404) notFounds.push(`${tag}: ${r.url()}`); });
    page.on('dialog', d => { console.log('[dialog] ' + d.message()); d.accept(); }); // REQ-060 确认兜底防挂死（本流程合法组合不应触发）
  };
  try {
    // ==================== B. 公开壳基线（无编辑入口，不在脏标记链路——刷新即 boot） ====================
    const ctxB = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageB = await ctxB.newPage();
    watch(pageB, 'pub-base');
    await pageB.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
    await pageB.waitForSelector('#dpMain .dp-item', { timeout: 20000 });
    await sleep(1000);
    const b0 = await pageB.evaluate(() => document.querySelectorAll('#dpMain .dp-item').length);
    check('B1 公开壳基线卡数=S1 全集（零变化）', b0 === baseline.total, `卡=${b0}`);
    await ctxB.close();

    // ==================== C. 登录壳主链路（superadmin） ====================
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    watch(page, 'app');
    // 掉落页 9 端点请求计数器
    let dpReqCount = 0;
    page.on('request', r => { if (DP_REQ.test(r.url())) dpReqCount++; });

    await login(page, EMAIL_SUPER);
    await page.click('.nav-item[data-page="lootdrop"]');
    await page.waitForSelector('#page-lootdrop .dp-item', { timeout: 20000 });
    await sleep(1200);
    const c0 = await page.evaluate(() => ({
      cards: document.querySelectorAll('#page-lootdrop #dpMain .dp-item').length,
      dirty: !!window.__dpLootDirty,
    }));
    check('C1 首次切入 boot 卡数=基线，脏标记初始为假', c0.cards === baseline.total && !c0.dirty, `卡=${c0.cards} dirty=${c0.dirty}`);

    // ---- C2 无脏标记 activate 零请求 ----
    dpReqCount = 0;
    await page.click('.nav-item[data-page="dashboard"]');
    await sleep(600);
    await page.click('.nav-item[data-page="lootdrop"]');
    await sleep(1200);
    check('C2 无脏标记切回 activate 零请求（掉落页 9 端点计数=0）', dpReqCount === 0, `请求数=${dpReqCount}`);

    // ---- C3 折叠记忆预设（浏览态折叠大秘境池区块——不得折团本池，T39 样本卡在团本池内需可见） ----
    await page.evaluate(() => {
      const head = document.querySelector('#page-lootdrop #dpMain [data-collapse="sec:dungeons"]');
      if (head) head.click();
    });
    await sleep(400);
    const c3pre = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dp23:collapsed') || '[]'));
    check('C3 折叠记忆预设写入 sessionStorage（sec:dungeons）', c3pre.includes('sec:dungeons'), JSON.stringify(c3pre));

    // ---- C4 数据中心新增掉落（真 UI 主链路）→ 脏标记置位 ----
    await page.evaluate(() => switchPage('datacenter'));
    await page.waitForSelector('.view-tab[data-mdtab="loot"]', { state: 'visible', timeout: 20000 });
    await page.click('.view-tab[data-mdtab="loot"]');
    await page.waitForSelector('#mdPanel table', { timeout: 20000 });
    await dcNavToBoss(page, testRaidId, testBossId);
    await page.click('button:has-text("+ 新增掉落")');
    await page.waitForSelector('#mdField_item_name', { state: 'visible', timeout: 10000 });
    await page.fill('#mdField_item_name', ITEM_1);
    await page.selectOption('#mdField_slot', '单手'); // 演进驱动适配（任务书 #40 词表下拉化）：「武器」退出 slot 选项，单手剑归「单手」位
    await sleep(300);
    await page.selectOption('#mdField_item_type', '单手剑');
    await page.click('#mdFieldTags_primary_stats .md-tag:has-text("力量")');
    await page.fill('#mdField_effect', FX_1);
    await clickSaveAndWaitToast(page);
    const c4 = await page.evaluate(() => !!window.__dpLootDirty);
    check('C4 数据中心新增保存成功 → __dpLootDirty 置位', c4 === true);

    // ---- C5 切回掉落页 → activate 重拉 → 新值渲染 → 清标记；折叠记忆守恒 ----
    dpReqCount = 0;
    await page.click('.nav-item[data-page="lootdrop"]');
    await page.waitForFunction((n) => {
      return [...document.querySelectorAll('#page-lootdrop #dpMain .dp-item-name')].some(x => x.textContent === n);
    }, ITEM_1, { timeout: 20000 });
    await sleep(800);
    const c5 = await page.evaluate(() => ({
      cards: document.querySelectorAll('#page-lootdrop #dpMain .dp-item').length,
      dirty: !!window.__dpLootDirty,
      collapsed: JSON.parse(sessionStorage.getItem('dp23:collapsed') || '[]'),
    }));
    check('C5 脏标记 activate 重拉：新卡渲染（团本池+1，秘境池折叠不渲染）+ 请求发生 + 标记清除',
      c5.cards === baseline.raid + 1 && dpReqCount > 0 && !c5.dirty, `卡=${c5.cards}（预期${baseline.raid + 1}） 请求=${dpReqCount} dirty=${c5.dirty}`);
    check('C6 折叠记忆守恒（重拉后 sec:dungeons 仍在折叠集）', c5.collapsed.includes('sec:dungeons'), JSON.stringify(c5.collapsed));

    // ---- C7 筛选态守恒：搜索词 + 主属性 chip + 平铺命中数 ----
    await page.fill('#page-lootdrop #dpSearch', 'T39');
    await sleep(600);
    // 演进驱动适配（任务书 #43：1366<1400 折叠顶栏态组行默认收起）：先展开组行再点 chip
    const t39rowsOpen = await page.evaluate(() => document.querySelector('#page-lootdrop #dpFilterBar').classList.contains('filters-open'));
    if (!t39rowsOpen) { await page.click('#page-lootdrop #dpFilterToggle'); await sleep(400); }
    await page.click('#page-lootdrop #dpPrimaryChips .dp-chip[data-v="力量"]');
    await sleep(600);
    const c7pre = await page.evaluate(() => ({
      flat: !document.querySelector('#page-lootdrop #dpFlatHead').hidden,
      hit: document.querySelector('#page-lootdrop #dpFlatHead').innerText,
      cards: document.querySelectorAll('#page-lootdrop #dpMain .dp-item').length,
      chipOn: document.querySelector('#page-lootdrop #dpPrimaryChips .dp-chip[data-v="力量"]').classList.contains('active'),
    }));
    check('C7 筛选预设：平铺态命中 1 件（T39 卡）+ 力量 chip 选中', c7pre.flat && c7pre.cards === 1 && c7pre.chipOn && c7pre.hit.includes('1'),
      `命中文案=${c7pre.hit} 卡=${c7pre.cards}`);

    // 数据中心再编辑（改特效文本）→ 二次置脏
    await page.evaluate(() => switchPage('datacenter'));
    await page.waitForSelector('#mdPanel table', { timeout: 20000 });
    await dcNavToBoss(page, testRaidId, testBossId);
    await page.evaluate((n) => {
      const row = [...document.querySelectorAll('#mdPanel tr')].find(tr => tr.innerText.includes(n));
      row.querySelector('button[title="编辑"]').click();
    }, ITEM_1);
    await page.waitForSelector('#mdField_effect', { state: 'visible', timeout: 10000 });
    await page.fill('#mdField_effect', FX_2);
    await clickSaveAndWaitToast(page);

    dpReqCount = 0;
    await page.click('.nav-item[data-page="lootdrop"]');
    await page.waitForFunction((fx) => {
      return [...document.querySelectorAll('#page-lootdrop #dpMain .dp-item')].some(c => c.innerText.includes(fx));
    }, FX_2, { timeout: 20000 });
    await sleep(600);
    const c7 = await page.evaluate(() => ({
      search: document.querySelector('#page-lootdrop #dpSearch').value,
      chipOn: document.querySelector('#page-lootdrop #dpPrimaryChips .dp-chip[data-v="力量"]').classList.contains('active'),
      flat: !document.querySelector('#page-lootdrop #dpFlatHead').hidden,
      cards: document.querySelectorAll('#page-lootdrop #dpMain .dp-item').length,
      dirty: !!window.__dpLootDirty,
    }));
    check('C8 重拉后筛选态守恒：搜索词/chip 选中/平铺命中 1 全保留，新特效已渲染',
      c7.search === 'T39' && c7.chipOn && c7.flat && c7.cards === 1 && !c7.dirty, JSON.stringify(c7));
    await page.screenshot({ path: path.join(SHOT_DIR, 'reload-filter-preserved.png'), fullPage: false });

    // ---- C9 失败路径：RPC 断网 → 旧数据保留 + toast + 标记留存；恢复后重试成功 ----
    await page.route('**/rpc/get_public_loot_detail', r => r.abort());
    await page.evaluate(() => switchPage('datacenter'));
    await page.waitForSelector('#mdPanel table', { timeout: 20000 });
    await dcNavToBoss(page, testRaidId, testBossId);
    await page.evaluate((n) => {
      const row = [...document.querySelectorAll('#mdPanel tr')].find(tr => tr.innerText.includes(n));
      row.querySelector('button[title="编辑"]').click();
    }, ITEM_1);
    await page.waitForSelector('#mdField_item_name', { state: 'visible', timeout: 10000 });
    await page.fill('#mdField_item_name', ITEM_2);
    await clickSaveAndWaitToast(page); // 写入走 /api/db 本地代理，不受 RPC 断流影响
    const c9dirty = await page.evaluate(() => !!window.__dpLootDirty);
    check('C9 断网前编辑保存成功（写路径不受影响）→ 脏标记置位', c9dirty === true);

    await page.evaluate(() => { document.getElementById('toastContainer').innerHTML = ''; });
    await page.click('.nav-item[data-page="lootdrop"]');
    await page.waitForFunction(() => document.getElementById('toastContainer').innerText.includes('刷新失败'), { timeout: 15000 });
    const c9 = await page.evaluate((names) => ({
      oldShown: [...document.querySelectorAll('#page-lootdrop #dpMain .dp-item-name')].some(x => x.textContent === names.old),
      newShown: [...document.querySelectorAll('#page-lootdrop #dpMain .dp-item-name')].some(x => x.textContent === names.renamed),
      dirty: !!window.__dpLootDirty,
      cards: document.querySelectorAll('#page-lootdrop #dpMain .dp-item').length,
    }), { old: ITEM_1, renamed: ITEM_2 });
    check('C10 重拉失败：toast 提示 + 旧数据保留不白屏 + 脏标记留存待重试',
      c9.oldShown && !c9.newShown && c9.dirty && c9.cards === 1, JSON.stringify(c9));

    await page.unroute('**/rpc/get_public_loot_detail');
    await page.click('.nav-item[data-page="dashboard"]');
    await sleep(400);
    await page.click('.nav-item[data-page="lootdrop"]');
    await page.waitForFunction((n) => {
      return [...document.querySelectorAll('#page-lootdrop #dpMain .dp-item-name')].some(x => x.textContent === n);
    }, ITEM_2, { timeout: 20000 });
    const c11 = await page.evaluate(() => ({
      dirty: !!window.__dpLootDirty,
      search: document.querySelector('#page-lootdrop #dpSearch').value,
    }));
    check('C11 网络恢复后重试成功：新名渲染 + 标记清除 + 搜索词仍守恒', !c11.dirty && c11.search === 'T39', JSON.stringify(c11));
    await page.screenshot({ path: path.join(SHOT_DIR, 'reload-after-recovery.png'), fullPage: false });

    await ctx.close();

    const realErrors = pageErrors.filter(e => !e.includes('status of 406') && !e.includes('status of 409')
      && !e.includes('net::ERR_FAILED') // C9 主动 abort RPC 的断流噪音
      && !e.includes('读取失败'));
    check('全程零 JS 报错（406/409/C9 主动断流噪音另行列示）', realErrors.length === 0, realErrors.join(' | ') || '无');
    check('全程零 404', notFounds.length === 0, notFounds.join(' | ') || '无');
  } finally {
    await browser.close();
  }

  await cleanup();

  // ==================== G. 清理后 308 基线还原 ====================
  const rpc1 = await rpcPublic();
  const s1After = rpc1.body.filter(r => r.season_id === currentSeasonId);
  const after = {
    total: s1After.length,
    raid: s1After.filter(r => r.source === 'raid').length,
    dungeon: s1After.filter(r => r.source === 'dungeon').length,
  };
  check('G1 清理后 308 基线还原（S1 全部/团本/大秘境）', after.total === BASELINE.total && after.raid === BASELINE.raid && after.dungeon === BASELINE.dungeon,
    `实测=${after.total}/${after.raid}/${after.dungeon}`);

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#39 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => {
  console.error('[验证脚本异常]', e);
  try { await cleanup(); } catch {}
  process.exit(1);
});
