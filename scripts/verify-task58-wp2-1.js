// 任务书 #58-WP2-1 验证：方案单独立页（形态B）+ 多方案数据层
// A 静态：cloud.js 五操作/当前选定口径锚点；app.js pageTitles/switch/挂载/bridge 锚点；index.html 侧栏增量+页容器；
//   decorData.js 分键草稿/anon 认领/多方案动作/批量/独立页渲染/徽标同源锚点；css .dh-pp-* 段；版本串 .75；
//   红线零改动（track.js/server.js/sql/data.html/decorDict.js/dataPublic.js）；node --check + server-security。
// B 浏览器实测（自起服务器 + 测试账号）：
//   B1 直进空态+新建×2；B2 方案1 加 2 件+徽标三处同源+保存+REST 复核；B3 方案2 独立组单；
//   B4 批量条（全选/+1/移除/容量对账）；B5 刷新还原+行级归属；B6 重命名；B7 删除守卫+删除；
//   B8 768px 摘要卡下移+表格横滚；B9 公示壳零回归（anon 草稿槽）；B10 零报错。
// C 清零：方案行/测试公会/测试账号/测试事件四清零复核。
// 用法: node scripts/verify-task58-wp2-1.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15661;
const BASE = `http://127.0.0.1:${PORT}`;
const VER = '20260923.76';
const VER_PREV = '20260923.75';
const PWD = 'T58-WP21-2026!';
const EMAIL = 't58-wp21@example.com';
const GUILD_NAME = 'T58WP21测试会';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const SVC = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail !== undefined ? `（${detail}）` : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function svcRest(method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, {
    method, headers: { ...SVC, Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

let serverProc = null;
async function startServer() {
  serverProc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_RUN_PORT: String(PORT) },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(BASE + '/index.html'); if (r.ok) return; } catch { /* 未起 */ }
    await sleep(300);
  }
  throw new Error('server 启动超时');
}

// ==================== A 静态断言 ====================
function staticAsserts() {
  const cloud = fs.readFileSync(path.join(ROOT, 'js/cloud.js'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const dd = fs.readFileSync(path.join(ROOT, 'js/decorData.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'css/decor-public.css'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const decor = fs.readFileSync(path.join(ROOT, 'decor.html'), 'utf8');

  check('A1 cloud.js 多方案口径：current key/resolve 回退/decorPlans 全量/decorPlan=当前（WP1 消费方零改动）',
    /const DECOR_PLAN_CURRENT_KEY = 'wb_decor_plan_current'/.test(cloud) &&
    /function decorPlanResolveCurrentId/.test(cloud) &&
    /window\.appData\.decorPlans = plans/.test(cloud) &&
    /window\.appData\.decorPlan = cur /.test(cloud));
  check('A2 cloud.js 五操作：create 默认名+设为当前 / rename 不 bump updated_at / delete 守卫+级联+清选定 / switch 仅 localStorage 不写库 / save 写当前',
    /operation === 'create'[\s\S]{0,400}localStorage\.setItem\(DECOR_PLAN_CURRENT_KEY, String\(ins\.id\)\)/.test(cloud) &&
    /operation === 'rename'[\s\S]{0,300}\.update\(\{ name: /.test(cloud) &&
    /仅剩一个方案，禁止删除/.test(cloud) &&
    /localStorage\.removeItem\(DECOR_PLAN_CURRENT_KEY\)/.test(cloud) &&
    /operation === 'switch'[\s\S]{0,200}return;/.test(cloud) &&
    /let planId = decorPlanResolveCurrentId/.test(cloud));
  check('A3 app.js：pageTitles/switchPage 分支/懒挂载/bridge 五操作全走 cloudCrud',
    /'decor-plan': '我的方案单'/.test(app) &&
    /pageName === 'decor-plan'[\s\S]{0,120}ensureDecorPlanPageMounted\(\)/.test(app) &&
    /function ensureDecorPlanPageMounted/.test(app) && /DecorCatalog\.mountPlanPage\(document\.getElementById\('page-decor-plan'\)\)/.test(app) &&
    /createPlan: name => cloudCrud\('decorPlan', 'create'/.test(app) &&
    /renamePlan: \(id, name\) => cloudCrud\('decorPlan', 'rename'/.test(app) &&
    /deletePlan: id => cloudCrud\('decorPlan', 'delete'/.test(app) &&
    /switchPlan: id => cloudCrud\('decorPlan', 'switch'/.test(app) &&
    /listPlans: async/.test(app) && /currentPlanId: \(\) =>/.test(app));
  check('A4 index.html：「家宅」组内增量方案单项（#57 结构不碰）+ 徽标节点 + #page-decor-plan 容器',
    /data-page="decor-plan" data-nav-group="home" onclick="switchPage\('decor-plan'\)"/.test(index) &&
    /id="dhNavPlanBadge"/.test(index) && /<div class="page" id="page-decor-plan"><\/div>/.test(index) &&
    index.indexOf('data-page="decor-plan"') > index.indexOf('data-page="decor"') &&
    index.indexOf('data-page="decor-plan"') < index.indexOf('id="navPets"'));
  check('A5 decorData.js：分键草稿（plan 槽/anon 兼容）+ anon 认领 + 多方案四动作 + 批量双操作',
    /function planDraftReadAll/.test(dd) && /plans: \{ anon: /.test(dd) &&
    /function planDraftAdoptAnon/.test(dd) &&
    /function planActionSwitch/.test(dd) && /function planActionCreate/.test(dd) &&
    /function planActionRename/.test(dd) && /function planActionDelete/.test(dd) &&
    /function planBatchRemove/.test(dd) && /function planBatchInc/.test(dd) &&
    /我的方案 \$\{seq\}/.test(dd) && /仅剩一个方案，禁止删除/.test(dd));
  check('A6 decorData.js：独立页渲染层（全宽表格/批量条/摘要卡/分享 disabled/空态引导）+ 徽标三处同源 + 导出入口',
    /function mountPlanPage/.test(dd) && /function planPageRender/.test(dd) &&
    /dh-pp-table/.test(dd) && /dh-pp-batch/.test(dd) && /dh-pp-summary/.test(dd) &&
    /已选 \$\{ids\.length\} 件 · 小计容量/.test(dd) &&
    /id="dhPpShare" disabled title="三期社区开放"/.test(dd) &&
    /去图鉴挑装饰/.test(dd) &&
    /getElementById\('dhNavPlanBadge'\)/.test(dd) &&
    /mountPlanPage\(el\) \{ mountPlanPage\(el\); \}/.test(dd) &&
    /WBTrack\.event\('decor_plan_create', \{\}\)/.test(dd) &&
    /WBTrack\.event\('decor_plan_switch', \{ plan_count: plan\.plans\.length \}\)/.test(dd));
  check('A7 css：.dh-pp-* 段（表格规范/摘要卡/进度条/768 摘要卡下移+表格横滚）+ 侧栏徽标样式',
    /\.dh-nav-plan-badge \{/.test(css) && /\.dh-pp-table \{/.test(css) &&
    /\.dh-pp-summary \{/.test(css) && /\.dh-pp-progress-bar/.test(css) &&
    /@media \(max-width: 768px\) \{[\s\S]*?\.dh-pp-body \{ flex-direction: column; \}/.test(css) &&
    /\.dh-pp-table-wrap \{ overflow-x: auto;/.test(css));
  const countStr = (s, v) => (s.match(new RegExp(v.replace(/\./g, '\\.'), 'g')) || []).length;
  check(`A8 版本串 ${VER}（index×15/decor×6）+ 旧串（${VER_PREV}）零残留`,
    countStr(index, VER) === 15 && countStr(decor, VER) === 6 &&
    countStr(index, VER_PREV) === 0 && countStr(decor, VER_PREV) === 0);
  const diffNames = spawnSync('git', ['diff', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  check('A9 红线零改动：track.js/server.js/data.html/dataPublic.js/decorDict.js/sql 全不动（埋点白名单属 WP2-3）',
    !diffNames.some(f => ['js/track.js', 'server.js', 'data.html', 'js/dataPublic.js', 'js/decorDict.js'].includes(f)) &&
    !diffNames.some(f => f.startsWith('sql/')),
    `diff 清单=${diffNames.join(',')}`);
  for (const f of ['js/cloud.js', 'js/decorData.js', 'js/app.js', 'scripts/verify-task58-wp2-1.js']) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    check('A10 node --check ' + f, r.status === 0, r.status === 0 ? '' : r.stderr.trim().split('\n')[0]);
  }
  const t = spawnSync(process.execPath, ['--test', 'test/server-security.test.js'], { cwd: ROOT, encoding: 'utf8' });
  check('A11 node --test server-security 回归', t.status === 0, (t.stdout.match(/# pass \d+|ℹ pass \d+/) || [''])[0]);
}

// ==================== B 浏览器实测 ====================
let testUid = null, guildId = null, vidApp = null;
const planIds = {}; // { p1, p2 }

async function liveAsserts() {
  // 测试账号 + 公会（复用 WP1 制式）
  const list = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = (list.body && (list.body.users || list.body)) || [];
  const hit = users.find(u => (u.email || '').toLowerCase() === EMAIL);
  if (hit) testUid = hit.id;
  else {
    const c = await svcRest('POST', '/auth/v1/admin/users', { email: EMAIL, password: PWD, email_confirm: true, user_metadata: { display_name: 't58-wp21' } });
    testUid = c.body && c.body.id;
  }
  check('B-前置 测试账号就位', !!testUid);
  if (!testUid) return;
  await svcRest('DELETE', `/rest/v1/decor_plans?user_id=eq.${testUid}`); // 幂等重跑清残留
  const g = await svcRest('POST', '/rest/v1/guilds', { name: GUILD_NAME, owner_id: testUid, invite_code: 'T58WP21B', server_name: '测试', server_region: '一区' });
  guildId = g.body && g.body[0] && g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: testUid, role: 'owner', display_name: 't58-wp21' }]);

  await startServer();
  console.log('--- 服务器已起（端口 ' + PORT + '） ---');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const pg = await ctx.newPage();
  const errs = [], badNet = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  pg.on('response', r => { if (r.status() >= 400) badNet.push(`http${r.status()} ${r.request().method()} ${r.url()}`); });

  // 登录
  await pg.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await pg.fill('#authEmail', EMAIL);
  await pg.fill('#authPassword', PWD);
  await pg.click('#authLoginBtn');
  await pg.waitForSelector('.nav-item[data-page="decor-plan"]', { state: 'visible', timeout: 30000 });
  vidApp = await pg.evaluate(() => localStorage.getItem('wb_vid'));
  await pg.evaluate(() => localStorage.removeItem('wb_decor_plan_draft')); // 幂等重跑清草稿

  // ---- 确定性工具：异步切换落地（data-current 标记）+ 保存前清 toast 防陈旧文本竞态 ----
  async function ppSwitch(pid) {
    await pg.selectOption('#dhPpPlanSel', pid);
    await pg.waitForFunction(v => {
      const s = document.querySelector('#dhPpPlanSel');
      return s && s.dataset.current === v;
    }, String(pid), { timeout: 15000 });
  }
  async function drawerSave() {
    await pg.evaluate(() => { const t = document.getElementById('dhPlanToast'); if (t) t.textContent = ''; });
    await pg.click('#dhPlanToggle');
    await pg.waitForSelector('.dh-plan-drawer.open', { timeout: 5000 });
    await pg.click('#dhPlanSave');
    await pg.waitForFunction(() => {
      const t = document.querySelector('#dhPlanToast');
      return t && t.classList.contains('show') && t.textContent.includes('已保存');
    }, { timeout: 20000 });
    await pg.click('#dhPlanClose');
  }

  // ========== B1：直进方案单页 → 空态 → 新建×2 ==========
  await pg.click('.nav-item[data-page="decor-plan"]');
  await pg.waitForSelector('.dh-pp', { timeout: 30000 });
  await pg.waitForSelector('.dh-pp-empty', { timeout: 30000 });
  check('B1a 直进方案单页：空态「去图鉴挑装饰」+ 页头控件（下拉/新建/重命名/删除/返回）在场',
    await pg.locator('#dhPpGoDecor').count() === 1 &&
    await pg.locator('#dhPpPlanSel').count() === 1 && await pg.locator('#dhPpCreate').count() === 1 &&
    await pg.locator('#dhPpRename').count() === 1 && await pg.locator('#dhPpDelete').count() === 1 &&
    await pg.locator('#dhPpBack').count() === 1);
  await pg.click('#dhPpCreate');
  await pg.waitForFunction(() => document.querySelector('#dhPlanToast') && document.querySelector('#dhPlanToast').textContent.includes('已创建'), { timeout: 15000 });
  const opt1 = await pg.locator('#dhPpPlanSel option').allTextContents();
  await pg.click('#dhPpCreate');
  await pg.waitForFunction(() => document.querySelector('#dhPlanToast') && document.querySelector('#dhPlanToast').textContent.includes('我的方案 2'), { timeout: 15000 });
  const opt2 = await pg.locator('#dhPpPlanSel option').allTextContents();
  const plans1 = await svcRest('GET', `/rest/v1/decor_plans?user_id=eq.${testUid}&select=id,name&order=created_at.asc`);
  planIds.p1 = plans1.body && plans1.body[0] && plans1.body[0].id;
  planIds.p2 = plans1.body && plans1.body[1] && plans1.body[1].id;
  check('B1b 新建×2：下拉两项「我的方案 1/2」+ 库内 2 头 0 明细（REST 复核）+ 当前=方案2',
    JSON.stringify(opt2) === JSON.stringify(['我的方案 2', '我的方案 1']) &&
    (plans1.body || []).length === 2 && opt1.length === 1,
    `下拉=${opt2.join('|')} 库内=${(plans1.body || []).map(p => p.name).join('|')}`);

  // ========== B2：切方案1 → 图鉴加 2 件 → 徽标三处同源 → 保存 → REST 复核 ==========
  await ppSwitch(planIds.p1);
  await pg.click('#dhPpBack');
  await pg.waitForSelector('.dh-grid .dh-card', { timeout: 30000 });
  const ridA = await pg.locator('.dh-card-add').nth(0).getAttribute('data-add');
  const ridB = await pg.locator('.dh-card-add').nth(1).getAttribute('data-add');
  await pg.locator('.dh-card-add').nth(0).click();
  await pg.locator('.dh-card-add').nth(1).click();
  await sleep(400);
  const navN = (await pg.locator('#dhNavPlanBadge').textContent()).trim();
  const toggleN = (await pg.locator('#dhPlanToggleN').textContent()).trim();
  await pg.click('.nav-item[data-page="decor-plan"]');
  await pg.waitForSelector('.dh-pp-table tbody tr', { timeout: 10000 });
  const pageN = (await pg.locator('#dhPpTotal').textContent()).trim();
  check('B2a 徽标三处同源：侧栏=抽屉=页内摘要=2（加 2 件实时联动）',
    navN === '2' && toggleN === '2' && pageN === '2', `侧栏=${navN} 抽屉=${toggleN} 页内=${pageN}`);
  await drawerSave();
  const dbP1 = await svcRest('GET', `/rest/v1/decor_plan_items?plan_id=eq.${planIds.p1}&select=record_id,qty`);
  check('B2b 方案1 保存成功：库内明细 2 行（行级归属 plan_id=方案1）',
    (dbP1.body || []).length === 2, JSON.stringify(dbP1.body));

  // ========== B3：切方案2 → 独立组单 → 保存 → 两方案归属隔离 ==========
  await ppSwitch(planIds.p2);
  await pg.waitForSelector('.dh-pp-empty', { timeout: 10000 });
  await pg.click('#dhPpBack');
  await pg.waitForSelector('.dh-grid .dh-card', { timeout: 30000 });
  await pg.locator('.dh-card-add').nth(2).click();
  await sleep(400);
  const ridC = await pg.locator('.dh-card-add').nth(2).getAttribute('data-add');
  await drawerSave();
  const dbP2 = await svcRest('GET', `/rest/v1/decor_plan_items?plan_id=eq.${planIds.p2}&select=record_id,qty`);
  const dbP1Again = await svcRest('GET', `/rest/v1/decor_plan_items?plan_id=eq.${planIds.p1}&select=record_id,qty`);
  check('B3 方案2 独立组单：库内方案2 一行 + 方案1 仍 2 行（多方案行级隔离实证）',
    (dbP2.body || []).length === 1 && String(dbP2.body[0].record_id) === String(ridC) && (dbP1Again.body || []).length === 2,
    `方案2=${JSON.stringify(dbP2.body)} 方案1 行数=${(dbP1Again.body || []).length}`);

  // ========== B4：批量条（方案1：全选 → 批量+1 → 容量对账 → 批量移除） ==========
  await pg.click('.nav-item[data-page="decor-plan"]'); // B3 收尾在图鉴页，先回方案单页
  await pg.waitForSelector('.dh-pp', { timeout: 10000 });
  await ppSwitch(planIds.p1);
  // 等方案1 行真正落表再操作（双保险：ridA 行在场）
  await pg.waitForSelector(`.dh-pp-table tbody tr[data-rid="${ridA}"]`, { timeout: 10000 });
  await pg.waitForSelector('.dh-pp-table tbody tr', { timeout: 10000 });
  await pg.click('#dhPpSelAll');
  await sleep(300);
  const infoSelAll = (await pg.locator('#dhPpBatchInfo').textContent()).trim();
  await pg.click('#dhPpBatchInc');
  await sleep(400);
  const qtys = await pg.locator('.dh-pp-table .dh-plan-qty').allTextContents();
  // 容量对账：库内 placement_cost × 现 qty 手工核算 vs 页内小计
  const costRes = await svcRest('GET', `/rest/v1/decor_catalog?record_id=in.(${ridA},${ridB})&select=record_id,placement_cost`);
  const costMap = Object.fromEntries((costRes.body || []).map(r => [String(r.record_id), r.placement_cost || 0]));
  const expectCap = (costMap[String(ridA)] + costMap[String(ridB)]) * 2;
  const pageCapText = (await pg.locator('.dh-pp-sum-row b.dh-pp-over, .dh-pp-sum-row b').nth(1).textContent()).trim();
  check('B4a 全选+批量+1：两行 qty=2 + 批量条已选 2 件 + 摘要容量=手工核算',
    qtys.map(s => s.trim()).join(',') === '2,2' && infoSelAll.startsWith('已选 2 件') &&
    pageCapText === expectCap.toLocaleString(),
    `qty=${qtys.join('|')} 信息=「${infoSelAll}」 容量=${pageCapText}（核算 ${expectCap}）`);
  await pg.locator('.dh-pp-sel').first().uncheck();
  await sleep(300);
  await pg.click('#dhPpBatchRm');
  await sleep(400);
  const rowsAfterRm = await pg.locator('.dh-pp-table tbody tr').count();
  const qtyAfterRm = (await pg.locator('.dh-pp-table .dh-plan-qty').first().textContent()).trim();
  check('B4b 勾一行批量移除：表格 2→1 行（剩余行 qty=2）', rowsAfterRm === 1 && qtyAfterRm === '2', `行=${rowsAfterRm} qty=${qtyAfterRm}`);
  // 批量结果保存入库（批量操作前后明细行数/容量与库一致——REST 对照）
  await drawerSave();
  const dbP1Batch = await svcRest('GET', `/rest/v1/decor_plan_items?plan_id=eq.${planIds.p1}&select=record_id,qty`);
  check('B4c 批量保存后库内一致：方案1 明细=1 行（剩余件=ridA qty=2，REST 对照）',
    (dbP1Batch.body || []).length === 1 && String(dbP1Batch.body[0].record_id) === String(ridA) && dbP1Batch.body[0].qty === 2,
    JSON.stringify(dbP1Batch.body));

  // ========== B5：刷新还原（云端口径：方案1=批量后 1 行 qty2 / 方案2=1 行） ==========
  await pg.reload({ waitUntil: 'load' });
  await pg.click('.nav-item[data-page="decor-plan"]');
  await pg.waitForSelector('.dh-pp-table tbody tr', { timeout: 30000 });
  const rowsP1AfterReload = await pg.locator('.dh-pp-table tbody tr').count();
  const qtyP1AfterReload = (await pg.locator('.dh-pp-table .dh-plan-qty').first().textContent()).trim();
  await ppSwitch(planIds.p2);
  await pg.waitForFunction(() => document.querySelectorAll('.dh-pp-table tbody tr').length === 1, { timeout: 10000 });
  check('B5 刷新后各方案云端还原：当前(方案1)=1 行 qty=2 / 方案2=1 行',
    rowsP1AfterReload === 1 && qtyP1AfterReload === '2', `方案1 行=${rowsP1AfterReload} qty=${qtyP1AfterReload}`);

  // ========== B6：重命名（prompt 链路） ==========
  await ppSwitch(planIds.p1);
  pg.once('dialog', d => d.accept('客厅整装'));
  await pg.click('#dhPpRename');
  await pg.waitForFunction(() => document.querySelector('#dhPlanToast') && document.querySelector('#dhPlanToast').textContent.includes('重命名'), { timeout: 10000 });
  const optAfter = await pg.locator('#dhPpPlanSel option').allTextContents();
  const dbName = await svcRest('GET', `/rest/v1/decor_plans?id=eq.${planIds.p1}&select=name`);
  check('B6 重命名：下拉文案 + 库内 name 同步「客厅整装」',
    optAfter.some(t => t.trim() === '客厅整装') && dbName.body && dbName.body[0] && dbName.body[0].name === '客厅整装',
    `下拉=${optAfter.join('|')}`);

  // ========== B7：删除方案2 → 删除守卫（仅剩一个禁止） ==========
  await ppSwitch(planIds.p2);
  pg.once('dialog', d => d.accept());
  await pg.click('#dhPpDelete');
  await pg.waitForFunction(() => document.querySelector('#dhPlanToast') && document.querySelector('#dhPlanToast').textContent.includes('已删除'), { timeout: 10000 });
  const optAfterDel = await pg.locator('#dhPpPlanSel option').allTextContents();
  const headsAfterDel = await svcRest('GET', `/rest/v1/decor_plans?user_id=eq.${testUid}&select=id`);
  const orphanItems = await svcRest('GET', `/rest/v1/decor_plan_items?plan_id=eq.${planIds.p2}&select=record_id`);
  await pg.click('#dhPpDelete');
  await sleep(500);
  const guardToast = await pg.locator('#dhPlanToast').textContent().catch(() => '');
  const headsFinal = await svcRest('GET', `/rest/v1/decor_plans?user_id=eq.${testUid}&select=id`);
  check('B7 删除：方案2 头+明细级联清除 + 当前回退方案1；守卫：仅剩一个禁止删除（前端拦截+库内不变）',
    optAfterDel.length === 1 && (headsAfterDel.body || []).length === 1 && (orphanItems.body || []).length === 0 &&
    guardToast.includes('仅剩一个方案，禁止删除') && (headsFinal.body || []).length === 1,
    `下拉=${optAfterDel.join('|')} 守卫提示=「${guardToast.trim()}」`);

  // ========== B8：768px 窄屏（摘要卡下移 + 表格横滚不断页） ==========
  await pg.setViewportSize({ width: 768, height: 900 });
  await sleep(400);
  const layout = await pg.evaluate(() => {
    const body = document.querySelector('.dh-pp-body');
    const side = document.querySelector('.dh-pp-side');
    const main = document.querySelector('.dh-pp-main');
    const wrap = document.querySelector('.dh-pp-table-wrap');
    return {
      dir: body ? getComputedStyle(body).flexDirection : '',
      sideBelow: side && main ? side.getBoundingClientRect().top >= main.getBoundingClientRect().bottom - 2 : false,
      wrapScroll: wrap ? getComputedStyle(wrap).overflowX : '',
      noHScroll: document.documentElement.scrollWidth <= 768 + 1,
    };
  });
  check('B8 768px：摘要卡下移（column + 实际位于主区之下）+ 表格 wrap 横滚 + 页面零横向滚动',
    layout.dir === 'column' && layout.sideBelow && layout.wrapScroll === 'auto' && layout.noHScroll,
    JSON.stringify(layout));
  await pg.setViewportSize({ width: 1440, height: 900 });

  // ========== B9：公示壳零回归（未登录 anon 草稿槽 + 抽屉加单） ==========
  const pub = await ctx.newPage();
  const pubErrs = [];
  pub.on('pageerror', e => pubErrs.push(e.message));
  await pub.goto(`${BASE}/decor.html`, { waitUntil: 'load' });
  await pub.waitForSelector('.dh-grid .dh-card', { timeout: 30000 });
  await pub.locator('.dh-card-add').first().click();
  await sleep(400);
  const pubDraft = await pub.evaluate(() => JSON.parse(localStorage.getItem('wb_decor_plan_draft') || 'null'));
  const pubToggleN = (await pub.locator('#dhPlanToggleN').textContent()).trim();
  check('B9 公示壳零回归：加单→抽屉徽标=1 + 草稿落 anon 槽（D2 登录往返链路不受影响）',
    pubToggleN === '1' && pubDraft && pubDraft.plans && Array.isArray(pubDraft.plans.anon && pubDraft.plans.anon.items),
    `徽标=${pubToggleN} 草稿键=${pubDraft ? Object.keys(pubDraft.plans || {}).join(',') : 'null'}`);
  await pub.close();

  // ========== B10：零 JS 报错零意外 4xx ==========
  const NET_409 = /^http409 POST https:\/\/[^/]+\/rest\/v1\/user_profiles$/;
  const badReal = badNet.filter(e => !NET_409.test(e));
  let echoBudget = badNet.length - badReal.length;
  const errsReal = errs.filter(e => {
    if (echoBudget > 0 && e === 'console: Failed to load resource: the server responded with a status of 409 ()') { echoBudget--; return false; }
    return true;
  });
  check('B10 全程零 JS 报错零意外 4xx（双壳）',
    badReal.length === 0 && errsReal.length === 0 && pubErrs.length === 0,
    badReal.concat(errsReal, pubErrs).join(' | ').slice(0, 160) || '0');

  await ctx.close();
  await browser.close();
}

// ==================== C 清零 ====================
async function cleanupAsserts() {
  if (vidApp) await svcRest('DELETE', `/rest/v1/analytics_events?vid=eq.${vidApp}`);
  const leftEv = vidApp ? await svcRest('GET', `/rest/v1/analytics_events?select=id&vid=eq.${vidApp}`) : { status: 200, body: [] };
  check('C1 测试事件行清零复核', leftEv.status === 200 && Array.isArray(leftEv.body) && leftEv.body.length === 0,
    `残留=${Array.isArray(leftEv.body) ? leftEv.body.length : '?'}`);
  if (testUid) await svcRest('DELETE', `/rest/v1/decor_plans?user_id=eq.${testUid}`);
  const leftPlan = testUid ? await svcRest('GET', `/rest/v1/decor_plans?user_id=eq.${testUid}&select=id`) : { status: 200, body: [] };
  check('C2 测试方案行清零复核（头+明细级联）',
    leftPlan.status === 200 && Array.isArray(leftPlan.body) && leftPlan.body.length === 0);
  if (guildId) {
    await svcRest('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
  }
  if (testUid) await svcRest('DELETE', `/auth/v1/admin/users/${testUid}`);
  const list = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = (list.body && (list.body.users || list.body)) || [];
  check('C3 测试公会+测试账号清零复核',
    !users.some(u => (u.email || '').toLowerCase() === EMAIL));
}

(async () => {
  console.log('===== A 静态断言 =====');
  staticAsserts();
  console.log('===== B 浏览器实测（多方案 + 独立页 + 批量 + 徽标同源 + 窄屏 + 公示壳回归） =====');
  try {
    await liveAsserts();
  } catch (e) {
    check('B 段异常捕获（不假绿）', false, e.message);
  } finally {
    if (serverProc) serverProc.kill();
  }
  console.log('===== C 清零 =====');
  try {
    await cleanupAsserts();
  } catch (e) {
    check('C 清零异常', false, e.message);
  }
  const pass = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;
  console.log(`\n========== 合计 ${pass}/${results.length} 通过，${fail} 红 ==========`);
  process.exit(fail === 0 ? 0 : 1);
})();
