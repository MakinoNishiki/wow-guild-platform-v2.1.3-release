// 任务书 #23 WP1 验证：大秘境掉落池主数据 + 字典表匿名读开放
// 覆盖：①匿名读矩阵（9 字典 200 / 7 业务表空集 / game_patches 未开放）
//       ②写矩阵：超管经代理 dungeon_loot 增改删 2xx；普通用户代理写 403；普通用户直连写 403（RLS 层）
//       ③数据中心浏览器实测：BOSS 挂副本、大秘境掉落 CRUD、批量录入（含非法行行号）
// 前置：sql/16 已执行。测试数据自清理并复核为零。
// 用法: node scripts/verify-task23-wp1.js（PW_CHANNEL=chrome 可选）
// 截图输出 backup/2026-08-05-task23-wp1/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-05-task23-wp1');
const PORT = 15647;
const BASE = `http://localhost:${PORT}`;
const PWD = 'Wp23-Test-2026!';
const EMAIL_ADMIN = 'wp23-admin@wowbutler.cn';
const EMAIL_USER = 'wp23-user@wowbutler.cn';

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

async function ensureUser(email, displayName) {
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
    if (!body.access_token) throw new Error(`${email} 登录失败`);
  }
  return { uid: body.user.id, token: body.access_token };
}

let serverProc = null, admin = null, normalUser = null, adminGuildId = null;
const DUNGEON_NAME = '毒牙祭坛';
let dungeonId = null, testBossId = null;
const createdLootIds = [];

async function setup() {
  admin = await ensureUser(EMAIL_ADMIN, 'WP23超管');
  normalUser = await ensureUser(EMAIL_USER, 'WP23路人');
  // 超管标记（生产运营账号由 Dashboard 设置；测试账号经 Admin API）
  const sa = await fetch(`${SB}/auth/v1/admin/users/${admin.uid}`, {
    method: 'PUT', headers: SVC, body: JSON.stringify({ app_metadata: { role: 'superadmin' } }),
  });
  if (sa.status !== 200) throw new Error('设置超管失败: ' + sa.status);

  const d = await svc('GET', `/rest/v1/game_dungeons?select=id&name=eq.${encodeURIComponent(DUNGEON_NAME)}`);
  if (!d.body || !d.body[0]) throw new Error('找不到副本 ' + DUNGEON_NAME);
  dungeonId = d.body[0].id;

  // 超管测试账号需有公会才能进主应用（登录后落公会入口页而非仪表盘）
  const g = await svc('POST', '/rest/v1/guilds', { name: 'WP23超管会', owner_id: admin.uid, invite_code: 'W23A' + Date.now().toString(36).slice(-4).toUpperCase() });
  if (g.status !== 201) throw new Error('建会失败');
  adminGuildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', { guild_id: adminGuildId, user_id: admin.uid, role: 'owner', display_name: 'WP23超管' });

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  const steps = [];
  try { const r = await svc('DELETE', `/rest/v1/dungeon_loot?dungeon_id=eq.${dungeonId}&item_name=like.T23*`); steps.push(`dungeon_loot:${r.status}`); } catch { steps.push('loot:ERR'); }
  if (testBossId) {
    try { const r = await svc('DELETE', `/rest/v1/game_bosses?id=eq.${testBossId}`); steps.push(`boss:${r.status}`); } catch { steps.push('boss:ERR'); }
  }
  if (adminGuildId) {
    try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${adminGuildId}`); steps.push(`guild:${r.status}`); } catch { steps.push('guild:ERR'); }
  }
  for (const u of [admin, normalUser]) {
    try { if (u) await fetch(`${SB}/auth/v1/admin/users/${u.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); }
  }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', `/rest/v1/dungeon_loot?select=id&item_name=like.T23*`);
  const c2 = await svc('GET', `/rest/v1/game_bosses?select=id&name=like.T23*`);
  console.log(`[清理复核] T23 掉落剩余=${Array.isArray(c1.body) ? c1.body.length : '?'}，T23 BOSS 剩余=${Array.isArray(c2.body) ? c2.body.length : '?'}`);
}

async function proxy(token, method, restPath, bodyObj) {
  const res = await fetch(`${BASE}/api/db${restPath}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 200) };
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  // ==================== ① 匿名读矩阵 ====================
  const anonH = { apikey: ANON, Authorization: `Bearer ${ANON}` };
  const DICT = ['game_seasons', 'game_raids', 'game_bosses', 'boss_loot', 'tier_sets', 'game_dungeons', 'dungeon_loot', 'game_classes', 'game_specs'];
  let anonOk = true;
  for (const t of DICT) {
    const r = await fetch(`${SB}/rest/v1/${t}?select=*&limit=1`, { headers: anonH });
    if (r.status !== 200) { anonOk = false; console.log(`  anon ${t} -> ${r.status}`); }
  }
  check('① 匿名读 9 张字典表全部 200', anonOk);
  const BIZ = ['guilds', 'raid_members', 'guild_members', 'claim_requests', 'wishlists', 'loot_records', 'activity_attendance'];
  let bizSafe = true;
  for (const t of BIZ) {
    const r = await fetch(`${SB}/rest/v1/${t}?select=*&limit=1`, { headers: anonH });
    const body = await r.json().catch(() => null);
    const empty = (r.status === 403 || r.status === 401) || (Array.isArray(body) && body.length === 0);
    if (!empty) { bizSafe = false; console.log(`  anon ${t} -> ${r.status} ${JSON.stringify(body).slice(0, 80)}`); }
  }
  check('① 匿名读 7 张业务表全部 403/空集', bizSafe);
  const gp = await fetch(`${SB}/rest/v1/game_patches?select=*&limit=1`, { headers: anonH });
  const gpBody = await gp.json().catch(() => null);
  check('① game_patches 不在开放清单（403 或空集）', gp.status !== 200 || (Array.isArray(gpBody) && gpBody.length === 0), `HTTP ${gp.status}`);

  // ==================== ② 写矩阵 ====================
  // 超管经代理：增
  let r = await proxy(admin.token, 'POST', '/rest/v1/dungeon_loot', { dungeon_id: dungeonId, boss_id: null, item_name: 'T23矩阵剑', slot: '武器', item_type: '单手剑' });
  check('② 超管代理 INSERT dungeon_loot → 201', r.status === 201, `HTTP ${r.status}`);
  const insRow = await svc('GET', `/rest/v1/dungeon_loot?select=id&item_name=eq.T23矩阵剑`);
  const lootId = insRow.body && insRow.body[0] && insRow.body[0].id;
  createdLootIds.push(lootId);
  // 超管经代理：改
  r = await proxy(admin.token, 'PATCH', `/rest/v1/dungeon_loot?id=eq.${lootId}`, { slot: '头部' });
  check('② 超管代理 PATCH → 200', r.status === 200, `HTTP ${r.status}`);
  // 普通用户经代理写 → 403
  r = await proxy(normalUser.token, 'POST', '/rest/v1/dungeon_loot', { dungeon_id: dungeonId, item_name: 'T23路人剑' });
  check('② 普通用户代理 INSERT → 403', r.status === 403, `HTTP ${r.status}`);
  // 普通用户直连写（RLS 层）→ 403/401
  const direct = await fetch(`${SB}/rest/v1/dungeon_loot`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${normalUser.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dungeon_id: dungeonId, item_name: 'T23路人直连剑' }),
  });
  check('② 普通用户直连 INSERT（RLS）→ 403/401', direct.status === 403 || direct.status === 401, `HTTP ${direct.status}`);
  // 超管经代理：删
  r = await proxy(admin.token, 'DELETE', `/rest/v1/dungeon_loot?id=eq.${lootId}`);
  check('② 超管代理 DELETE → 2xx', r.status === 200 || r.status === 204, `HTTP ${r.status}`);

  // ==================== ③ 数据中心浏览器实测 ====================
  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => pageErrors.push('pageerror: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console: ' + msg.text()); });
    page.on('dialog', d => d.accept());

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
    await page.fill('#authEmail', EMAIL_ADMIN);
    await page.fill('#authPassword', PWD);
    await page.click('#authLoginBtn');
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(2500);

    // 超管可见数据中心 tab
    const dcVisible = await page.evaluate(() => {
      const el = document.getElementById('navDatacenter');
      return el && el.style.display !== 'none';
    });
    check('③ 超管可见「数据中心」tab', dcVisible === true);
    await page.click('#navDatacenter');
    await sleep(2000);

    // BOSS 区：副本分组存在 + 新增副本 BOSS
    await page.click('[data-mdtab="bosses"]');
    await sleep(1000);
    const dungeonSection = await page.evaluate(() => document.getElementById('mdPanel').innerText.includes('大秘境副本 BOSS'));
    check('③ BOSS 区出现「大秘境副本 BOSS」分组', dungeonSection === true);
    await page.evaluate((dName) => {
      const btns = [...document.querySelectorAll('#mdPanel button')];
      const sec = btns.find(b => b.textContent.includes('新增 BOSS') && b.parentElement.textContent.includes(dName));
      sec.click();
    }, DUNGEON_NAME);
    await page.waitForSelector('#mdEditorModal.show', { timeout: 5000 });
    await page.fill('#mdField_name', 'T23验收王');
    await page.click('#mdEditorSaveBtn');
    await sleep(2000);
    const bossRow = await svc('GET', `/rest/v1/game_bosses?select=id,dungeon_id&name=eq.T23验收王`);
    check('③ 副本 BOSS 落库（dungeon_id 归属）', bossRow.body && bossRow.body[0] && bossRow.body[0].dungeon_id === dungeonId, JSON.stringify(bossRow.body).slice(0, 120));
    testBossId = bossRow.body[0].id;
    await page.screenshot({ path: path.join(SHOT_DIR, '1-boss-dungeon-section.png') });

    // 大秘境掉落区：整体池新增 → 编辑 → 批量录入（含非法行）
    await page.click('[data-mdtab="dungeonloot"]');
    await sleep(1000);
    await page.evaluate(() => mdEditDungeonLootItem(null));
    await page.waitForSelector('#mdEditorModal.show', { timeout: 5000 });
    await page.fill('#mdField_item_name', 'T23整体池之刃');
    await page.click('#mdEditorSaveBtn');
    await sleep(2000);
    let lootRow = await svc('GET', `/rest/v1/dungeon_loot?select=id,boss_id&item_name=eq.T23整体池之刃`);
    check('③ 整体池新增落库（boss_id=null）', lootRow.body && lootRow.body[0] && lootRow.body[0].boss_id === null, JSON.stringify(lootRow.body));
    createdLootIds.push(lootRow.body[0].id);

    // 编辑：改部位
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('#mdPanel tr')].find(tr => tr.textContent.includes('T23整体池之刃'));
      btns.querySelector('button[title="编辑"]').click();
    });
    await page.waitForSelector('#mdEditorModal.show', { timeout: 5000 });
    await page.evaluate(() => { document.getElementById('mdField_slot').value = '头部'; });
    await page.click('#mdEditorSaveBtn');
    await sleep(2000);
    lootRow = await svc('GET', `/rest/v1/dungeon_loot?select=slot&item_name=eq.T23整体池之刃`);
    check('③ 编辑落库（slot=头部）', lootRow.body && lootRow.body[0] && lootRow.body[0].slot === '头部', JSON.stringify(lootRow.body));

    // 批量录入：2 有效 + 2 非法（未知 BOSS / 部位类型不匹配）→ 行号报错 + 入库 2 条
    await page.evaluate(() => mdOpenDungeonLootBatch());
    await page.waitForSelector('#mdEditorModal.show', { timeout: 5000 });
    await page.fill('#mdField__batch',
      `${DUNGEON_NAME},T23验收王,T23批量剑,武器,单手剑,力量,爆击、急速,装备：测试特效\n` +
      `${DUNGEON_NAME},,T23批量坠,颈部,项链,智力,,\n` +
      `${DUNGEON_NAME},不存在王,T23坏行A,武器,单手剑,,,\n` +
      `${DUNGEON_NAME},,T23坏行B,头部,单手剑,,,`);
    await page.click('#mdEditorSaveBtn'); // 解析预览
    await sleep(1000);
    const previewText = await page.evaluate(() => document.getElementById('mdLootBatchPreview').innerText);
    check('③ 批量解析：2 行有效 + 非法行报行号（3、4 行）', previewText.includes('T23批量剑') && previewText.includes('第 3') && previewText.includes('4'), previewText.slice(-80).replace(/\n/g, ' '));
    await page.screenshot({ path: path.join(SHOT_DIR, '2-batch-preview.png') });
    await page.click('#mdEditorSaveBtn'); // 确认入库
    await sleep(2500);
    const batchRows = await svc('GET', `/rest/v1/dungeon_loot?select=id,item_name,boss_id&item_name=like.T23批量*`);
    const bossRows = (batchRows.body || []).filter(x => x.boss_id === testBossId);
    const poolRows = (batchRows.body || []).filter(x => x.boss_id === null);
    check('③ 批量入库 2 条（1 条归属 BOSS + 1 条整体池）', (batchRows.body || []).length === 2 && bossRows.length === 1 && poolRows.length === 1, JSON.stringify(batchRows.body).slice(0, 150));
    (batchRows.body || []).forEach(x => createdLootIds.push(x.id));
    await page.screenshot({ path: path.join(SHOT_DIR, '3-dungeon-loot-block.png') });

    // 删除：删整体池之刃
    await page.evaluate(() => {
      const tr = [...document.querySelectorAll('#mdPanel tr')].find(t => t.textContent.includes('T23整体池之刃'));
      tr.querySelector('button[title="删除"]').click();
    });
    await sleep(2000); // confirm 自动接受
    lootRow = await svc('GET', `/rest/v1/dungeon_loot?select=id&item_name=eq.T23整体池之刃`);
    check('③ 删除生效', Array.isArray(lootRow.body) && lootRow.body.length === 0);

    const realErrors = pageErrors.filter(e => !e.includes('status of 406'));
    check('③ 数据中心全程零 JS 错误', realErrors.length === 0, realErrors.join(' | ') || '无');
    await ctx.close();
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#23 WP1 验证: ${passed}/${results.length} 通过 =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
