// 任务书 #24 WP1 验证（BUG-013）：装备分配/心愿单两面板 选定装备库装备后「掉落BOSS」按
// REQ-063 同链路（boss_loot→game_bosses）精确回填；缺 BOSS 数据留空负例；REQ-063 赛季回填回归。
// 测试数据（T24A 前缀：团本/BOSS/掉落/公会/用户）自清理并复核为零。
// 用法: node scripts/verify-task24-wp1.js（PW_CHANNEL=chrome 可选）｜ 截图 → backup/2026-08-05-task24-wp1/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(__dirname, '..', '.s6-ssh', 'node_modules', 'playwright-core'))); }

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-05-task24-wp1');
const PORT = 15653;
const BASE = `http://localhost:${PORT}`;
const PWD = 'T24a-Test-2026!';
const EMAIL = 't24a-owner@wowbutler.cn';

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
  const t = await res.text(); try { return { status: res.status, body: JSON.parse(t) }; } catch { return { status: res.status, body: t }; }
}

let serverProc = null, owner = null, guildId = null;
let testRaidId = null, testBossId = null, seasonName = '';

async function setup() {
  const cs = await svc('GET', '/rest/v1/game_seasons?select=id,name,is_current,start_date&order=start_date.asc');
  const cur = cs.body.find(s => s.is_current) || cs.body[cs.body.length - 1];
  seasonName = cur.name;

  // 测试团本 + BOSS + 掉落（挂在当前赛季，登录时 MasterData 一并加载）
  const r = await svc('POST', '/rest/v1/game_raids', { name: 'T24A测试渊', season_id: cur.id, type: 'raid', sort_order: 99 });
  if (r.status !== 201) throw new Error('建测试团本失败: ' + JSON.stringify(r.body));
  testRaidId = r.body[0].id;
  const b = await svc('POST', '/rest/v1/game_bosses', { raid_id: testRaidId, name: 'T24A一号王', boss_order: 1 });
  if (b.status !== 201) throw new Error('建测试 BOSS 失败: ' + JSON.stringify(b.body));
  testBossId = b.body[0].id;
  const l = await svc('POST', '/rest/v1/boss_loot', { boss_id: testBossId, item_name: 'T24A测试之刃', slot: '武器', item_type: '单手剑', primary_stats: ['力量'], secondary_stats: ['暴击'] });
  if (l.status !== 201) throw new Error('建测试掉落失败: ' + JSON.stringify(l.body));

  let res = await fetch(`${SB}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'T24A会长' } }) });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD }) });
    body = await res.json();
    if (!body.access_token) throw new Error('owner 登录失败');
  }
  owner = { uid: body.user.id };
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T24A回填会', owner_id: owner.uid, invite_code: 'T24A' + Date.now().toString(36).slice(-4).toUpperCase() });
  if (g.status !== 201) throw new Error('建会失败: ' + JSON.stringify(g.body));
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: owner.uid, role: 'owner', display_name: 'T24A会长' });

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r2 = await fetch(`${BASE}/api/supabase-config`); if (r2.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  const steps = [];
  try { const r = await svc('DELETE', `/rest/v1/boss_loot?item_name=like.T24A*`); steps.push(`loot:${r.status}`); } catch { steps.push('loot:ERR'); }
  if (testBossId) { try { const r = await svc('DELETE', `/rest/v1/game_bosses?id=eq.${testBossId}`); steps.push(`boss:${r.status}`); } catch { steps.push('boss:ERR'); } }
  if (testRaidId) { try { const r = await svc('DELETE', `/rest/v1/game_raids?id=eq.${testRaidId}`); steps.push(`raid:${r.status}`); } catch { steps.push('raid:ERR'); } }
  if (guildId) { try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); steps.push(`guild:${r.status}`); } catch { steps.push('guild:ERR'); } }
  if (owner) { try { await fetch(`${SB}/auth/v1/admin/users/${owner.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); } }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', '/rest/v1/boss_loot?select=id&item_name=like.T24A*');
  const c2 = await svc('GET', '/rest/v1/game_bosses?select=id&name=like.T24A*');
  const c3 = await svc('GET', '/rest/v1/game_raids?select=id&name=like.T24A*');
  const c4 = await svc('GET', '/rest/v1/guilds?select=id&name=like.T24A*');
  const n = [c1, c2, c3, c4].map(c => (Array.isArray(c.body) ? c.body.length : '?'));
  console.log(`[清理复核] T24A 掉落=${n[0]} BOSS=${n[1]} 团本=${n[2]} 公会=${n[3]}`);
  check('测试数据清零复核（全 0）', n.every(x => x === 0), n.join('/'));
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

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
    await page.fill('#authEmail', EMAIL);
    await page.fill('#authPassword', PWD);
    await page.click('#authLoginBtn');
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(2500);

    // 从装备库选 T24A 测试装备（两面板共用选取动作）
    async function pickFromDb(openFormFn, mode) {
      await page.evaluate(fn => window[fn](), openFormFn);
      await sleep(500);
      await page.evaluate(m => openItemDbPicker(m), mode);
      await sleep(1200);
      await page.fill('#itemDbSearch', 'T24A');
      await sleep(500);
      const found = await page.evaluate(() => document.querySelectorAll('#itemDbList .item-card').length);
      if (found !== 1) throw new Error(`picker 搜索 T24A 应得 1 条，实际 ${found}`);
      await page.evaluate(() => { document.querySelector('#itemDbList .item-card').click(); });
      await sleep(300);
      await page.click('#itemDbConfirmBtn');
      await sleep(600);
    }

    // ---- 装备分配面板 ----
    await pickFromDb('lootShowModal', 'loot');
    const lootState = await page.evaluate(() => ({
      name: document.getElementById('lootName').value,
      raid: document.getElementById('lootRaid').value,
      boss: document.getElementById('lootBoss').value,
      season: document.getElementById('lootSeason').value,
      pickerBossId: selectedDbItem ? selectedDbItem.bossId || null : null,
    }));
    check('装备分配面板：选定后「掉落BOSS」精确回填', lootState.boss === 'T24A一号王', `boss=${lootState.boss}`);
    check('装备分配面板：picker 条目携带 bossId（主数据链路）', !!lootState.pickerBossId, `bossId=${lootState.pickerBossId}`);
    check('装备分配面板：团本回填', lootState.raid === 'T24A测试渊', `raid=${lootState.raid}`);
    check('REQ-063 回归：装备分配面板「赛季」回填不回归', lootState.season === seasonName, `season=${lootState.season}（期望 ${seasonName}）`);
    check('装备分配面板：装备名回填', lootState.name === 'T24A测试之刃', `name=${lootState.name}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'loot-form-boss-autofill.png') });
    await page.evaluate(() => closeModal('lootModal'));
    await sleep(400);

    // ---- 心愿单面板 ----
    await pickFromDb('wishlistShowModal', 'wishlist');
    const wishState = await page.evaluate(() => ({
      name: document.getElementById('wishlistItemName').value,
      raid: document.getElementById('wishlistRaid').value,
      boss: document.getElementById('wishlistBoss').value,
    }));
    check('心愿单面板：选定后「掉落BOSS」精确回填', wishState.boss === 'T24A一号王', `boss=${wishState.boss}`);
    check('心愿单面板：团本回填', wishState.raid === 'T24A测试渊', `raid=${wishState.raid}`);
    check('心愿单面板：装备名回填', wishState.name === 'T24A测试之刃', `name=${wishState.name}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'wishlist-form-boss-autofill.png') });
    await page.evaluate(() => closeModal('wishlistModal'));
    await sleep(300);

    // ---- 负例：缺 BOSS 数据留空不报错（bossId 不存在 + 无兜底名 → ''；赛季链路同类）----
    const neg = await page.evaluate((rid) => ({
      bossGone: resolveItemDbBossName({ bossId: '00000000-0000-0000-0000-000000000000', raidId: rid, boss: '' }),
      bossNoId: resolveItemDbBossName({ boss: '' }),
      seasonGone: resolveItemDbSeasonName({ raidId: '00000000-0000-0000-0000-000000000000' }, ''),
      bossLegacy: resolveItemDbBossName({ boss: '旧库BOSS' }),
    }), testRaidId);
    check('负例：bossId 不存在且无兜底名 → 留空不报错', neg.bossGone === '' && neg.bossNoId === '', JSON.stringify(neg));
    check('负例：REQ-063 赛季链路缺数据 → 留空不报错（回归）', neg.seasonGone === '', `season='${neg.seasonGone}'`);
    check('回退路径：无 bossId 时用 item.boss 兜底（内置库/历史引用不回归）', neg.bossLegacy === '旧库BOSS', `boss=${neg.bossLegacy}`);

    const realErrors = pageErrors.filter(e => !e.includes('status of 406'));
    check('全程零 JS 报错（406=既有噪音已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
    await ctx.close();
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#24 WP1 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
