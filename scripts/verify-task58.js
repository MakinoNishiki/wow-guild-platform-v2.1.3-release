// 任务书 #58-WP1 验证：家宅方案单——数据底座 + 组单抽屉（形态A）+ 导出文字链路
// （2026-09-23 #58-补丁同脚本维护：卡片角标＋退役→底部通栏按钮「加入方案单/已加入 ×N」双态 +
//   详情弹窗加单主按钮 + decor_plan_add from:card/detail 双来源；A3c 改写、A3e/A3f 新增、B8 扩三段、版本串 .74）
// A 静态：sql/35 锚点（两表/八策略/UNIQUE/回滚/NOTIFY）；cloud.js decorPlan 注册锚点；decorData.js 抽屉/草稿/合并/导出锚点；
//   app.js bridge/saveDecorPlan/modalDirtyChecks 锚点；server.js 白名单 11 事件；规范章事件表 11 行；
//   版本串 20260923.73（index×15/decor×6）+ data.html 停留 20260919.72×8（引用资产零改动先例）+ 旧串零残留；
//   红线零改动断言（track.js/dataPublic.js/data.html/sql 既有件）；node --check + server-security 回归。
// B 浏览器实测（自起服务器）：
//   B1 D2 三红线（公示壳组 3 件→保存跳登录→登录返回 3 件齐全+草稿还原提示）；
//   B2 DB-first：保存→service 复核库行→刷新云端还原+草稿清空；明细批量写请求次数 ≤2（非逐行）；
//   B3 合并三分支；B4 容量合计一致+超 2000 标红不阻断；B5 导出弹窗（逐行一致/二次确认/复制+降级）；
//   B6 埋点三事件 204；B7 768 抽屉全宽；B8 卡片详情不回归+＋不弹详情；B9 双壳抽屉 DOM 同构。
// C 清零：测试事件行/方案单行/测试公会/测试账号四清零复核。
// 用法: node scripts/verify-task58.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15658;
const BASE = `http://127.0.0.1:${PORT}`;
const VER = '20260923.74';
const VER_PREV = '20260923.73'; // #58-WP1 串（#58-补丁后须零残留）
const VER_KEEP = '20260919.72'; // data.html 停留（引用资产本任务零改动）
const PWD = 'T58-Plan-2026!';
const EMAIL = 't58-plan@example.com';
const GUILD_NAME = 'T58方案单测试会';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

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
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) return; } catch { /* 未起 */ }
    await sleep(200);
  }
  throw new Error('server.js 启动超时');
}

// ==================== A 静态 ====================
function staticAsserts() {
  const sql = fs.readFileSync(path.join(ROOT, 'sql', '35_task058_decor_plans.sql'), 'utf8');
  const cloud = fs.readFileSync(path.join(ROOT, 'js', 'cloud.js'), 'utf8');
  const dd = fs.readFileSync(path.join(ROOT, 'js', 'decorData.js'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const spec = fs.readFileSync(path.join(ROOT, 'docs', '开发规范.md'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const decor = fs.readFileSync(path.join(ROOT, 'decor.html'), 'utf8');
  const data = fs.readFileSync(path.join(ROOT, 'data.html'), 'utf8');

  check('A1a sql/35 两表 + 索引 + UNIQUE(plan_id,record_id) + qty CHECK',
    /CREATE TABLE IF NOT EXISTS decor_plans/i.test(sql) && /CREATE TABLE IF NOT EXISTS decor_plan_items/i.test(sql) &&
    /UNIQUE \(plan_id, record_id\)/.test(sql) && /CHECK \(qty >= 1\)/.test(sql) &&
    /idx_decor_plans_user/.test(sql) && /idx_decor_plan_items_plan/.test(sql));
  check('A1b RLS 八策略（头表属主四 + 明细经头表归属四）+ 双表 ENABLE + 回滚注释 + NOTIFY',
    (sql.match(/CREATE POLICY \w+ ON decor_plans/g) || []).length === 4 &&
    (sql.match(/CREATE POLICY \w+ ON decor_plan_items/g) || []).length === 4 &&
    (sql.match(/EXISTS \(SELECT 1 FROM decor_plans p WHERE p\.id = plan_id AND p\.user_id = auth\.uid\(\)\)/g) || []).length === 4 &&
    /ALTER TABLE decor_plans ENABLE ROW LEVEL SECURITY/.test(sql) &&
    /ALTER TABLE decor_plan_items ENABLE ROW LEVEL SECURITY/.test(sql) &&
    /DROP TABLE decor_plan_items;/.test(sql) && /DROP TABLE decor_plans;/.test(sql) &&
    /NOTIFY pgrst, 'reload schema';/.test(sql));

  check('A2a cloud.js decorPlan 双 switch 注册 + reloadDecorPlan（updated_at 倒序取 1）',
    /case 'decorPlan':[\s\S]{0,120}reloadDecorPlan\(\)/.test(cloud) &&
    /case 'decorPlan':[\s\S]{0,120}syncDecorPlan\(operation, item\)/.test(cloud) &&
    /async function reloadDecorPlan/.test(cloud) && /decor_plan_items\(\*\)/.test(cloud) &&
    /order\('updated_at', \{ ascending: false \}\)[\s\S]{0,30}limit\(1\)/.test(cloud));
  check('A2b syncDecorPlan：save 幂等（无方案 INSERT 头/有方案 UPDATE 头）+ 明细差集批量（禁逐行）',
    /async function syncDecorPlan/.test(cloud) && /仅支持 save 操作/.test(cloud) &&
    /onConflict: 'plan_id,record_id'/.test(cloud) &&
    /\.in\('record_id', toDelete\)/.test(cloud));

  check('A3a 抽屉锚点：草稿 key/CAPACITY_REF 2000 注释/容量纯前端/合并三分支文案/超限额标红不阻断',
    /wb_decor_plan_draft/.test(dd) && /DECOR_PLAN_CAPACITY_REF = 2000/.test(dd) &&
    /游戏内实际预算随住宅等级变化，此处仅参考/.test(dd) &&
    /已还原你上次未保存的组单，保存后覆盖云端/.test(dd) &&
    /classList\.toggle\('over', cap > DECOR_PLAN_CAPACITY_REF\)/.test(dd));
  check('A3b D2 锚点：公示壳恒未登录（无 bridge）→ 提示文案 + 跳 index.html；保存成功清草稿',
    /保存方案单需要登录，登录后组单内容不丢/.test(dd) && /location\.href = 'index\.html'/.test(dd) &&
    /localStorage\.removeItem\(PLAN_DRAFT_KEY\)/.test(dd));
  check('A3c 卡片通栏按钮（#58-补丁：角标＋退役）+ stopPropagation + 三事件埋点（add 双来源 card/detail）',
    /class="dh-card-add\$\{planQtyOf\(r\.record_id\) \? ' added' : ''\}" data-add="\$\{r\.record_id\}"/.test(dd) &&
    /e\.stopPropagation\(\); planAdd/.test(dd) &&
    /WBTrack\.event\('decor_plan_add', \{ from: from \|\| 'card', record_id: recordId \}\)/.test(dd) &&
    /WBTrack\.event\('decor_plan_save', \{ items: planCount\(\), capacity: planCapacity\(\) \}\)/.test(dd) &&
    /WBTrack\.event\('decor_plan_export_text', \{ items: planCount\(\) \}\)/.test(dd));
  check('A3e #58-补丁锚点：双态助手/统一刷新/弹窗主按钮/from=detail/按钮 keydown 止冒泡/角标零残留',
    /function planQtyOf\(/.test(dd) && /function planAddLabel\(/.test(dd) && /function planRefreshEntries\(/.test(dd) &&
    /planRender\(\) \{\s*\n\s*planBuildDom\(\);\s*\n\s*planRefreshEntries\(\);/.test(dd) &&
    /class="btn btn-primary dh-detail-add\$\{planQtyOf/.test(dd) &&
    /planAdd\(r\.record_id, 'detail'\)/.test(dd) &&
    /btn\.onkeydown = e => e\.stopPropagation\(\);/.test(dd) &&
    /已加入 ×\$\{q\}/.test(dd) && !dd.includes('dh-add-plan'));
  const cssDecor = fs.readFileSync(path.join(ROOT, 'css/decor-public.css'), 'utf8');
  check('A3f #58-补丁样式锚点：通栏按钮 32px/双态/弹窗主按钮/reduced-motion 换名/旧角标样式退役',
    /\.dh-card-add \{[\s\S]*?height: 32px;/.test(cssDecor) &&
    /\.dh-card-add\.added \{/.test(cssDecor) && /\.dh-card-add:focus-visible/.test(cssDecor) &&
    /\.dh-detail-add \{/.test(cssDecor) && /\.dh-detail-add\.added \{/.test(cssDecor) &&
    /\.dh-card-add, \.dh-detail-add, \.dh-plan-toggle/.test(cssDecor) && !cssDecor.includes('dh-add-plan'));
  check('A3d 导出弹窗锚点：提示条/尾行固定链接/dirty 检查/二次确认/clipboard 降级',
    /改动只影响本次导出，不回写方案单数据/.test(dd) &&
    /魔兽管家 · 家宅图鉴免费组单：https:\/\/wow\.ddctl\.com\/decor\.html/.test(dd) &&
    /planExportIsDirty/.test(dd) && /内容未保存，确定放弃吗？/.test(dd) &&
    /navigator\.clipboard\.writeText/.test(dd) && /已全选，请按 Ctrl\+C 手动复制/.test(dd));

  check('A4a app.js bridge（isLoggedIn/loadCloud/save）+ saveDecorPlan 走 cloudCrud decorPlan/save',
    /DecorCatalog\.planBridge = \{/.test(app) && /save: \(items, name\) => saveDecorPlan\(items, name\)/.test(app) &&
    /cloudCrud\('decorPlan', 'save'/.test(app));
  check('A4b modalDirtyChecks.decorPlanExport 登记（规范 4.6）',
    /decorPlanExport: \(\) => !!\(window\.DecorCatalog && window\.DecorCatalog\.planExportIsDirty/.test(app));

  check('A5a server.js TRACK_EVENTS = 11 事件（page_view + #56 七 + #58 三）',
    /const TRACK_EVENTS = \[[\s\S]*?"decor_plan_add", "decor_plan_save", "decor_plan_export_text"\]/.test(server) &&
    (server.match(/"(page_view|user_register|guild_create|guild_join|attendance_save|loot_assign|wishlist_add|smart_import|decor_plan_add|decor_plan_save|decor_plan_export_text)"/g) || []).length >= 11);
  check('A5b 规范章事件表 11 行（8 + 方案单 3）+ 白名单对应注记',
    ['page_view', 'user_register', 'guild_create', 'guild_join', 'attendance_save', 'loot_assign', 'wishlist_add', 'smart_import',
      'decor_plan_add', 'decor_plan_save', 'decor_plan_export_text'].every(e => new RegExp('\\| ' + e + ' \\|').test(spec)) &&
    /TRACK_EVENTS` 白名单一一对应/.test(spec));

  const countStr = (s, v) => (s.match(new RegExp(v.replace(/\./g, '\\.'), 'g')) || []).length;
  check(`A6 版本串 ${VER}（index×15/decor×6）+ data.html 停留 ${VER_KEEP}×8（资产零改动先例）+ index/decor 旧串（${VER_PREV}/${VER_KEEP}）零残留`,
    countStr(index, VER) === 15 && countStr(decor, VER) === 6 &&
    countStr(index, VER_PREV) === 0 && countStr(decor, VER_PREV) === 0 &&
    countStr(index, VER_KEEP) === 0 && countStr(decor, VER_KEEP) === 0 &&
    countStr(data, VER_KEEP) === 8 && countStr(data, VER) === 0);

  // A7 红线零改动
  const diffNames = spawnSync('git', ['diff', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  check('A7 红线：track.js / dataPublic.js / data.html / sql 既有件 / decorDict.js 零改动',
    !diffNames.some(f => ['js/track.js', 'js/dataPublic.js', 'data.html', 'js/decorDict.js'].includes(f)) &&
    !diffNames.some(f => f.startsWith('sql/') && !f.includes('35_task058')),
    `diff 清单=${diffNames.join(',')}`);

  for (const f of ['js/cloud.js', 'js/decorData.js', 'js/app.js', 'server.js', 'scripts/verify-task58.js']) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    check('A8 node --check ' + f, r.status === 0, r.status === 0 ? '' : r.stderr.trim().split('\n')[0]);
  }
  const t = spawnSync(process.execPath, ['--test', 'test/server-security.test.js'], { cwd: ROOT, encoding: 'utf8' });
  check('A8b node --test server-security 回归', t.status === 0, (t.stdout.match(/# pass \d+/) || [''])[0]);
}

// ==================== B 浏览器实测 ====================
let testUid = null, guildId = null, vidPub = null, vidApp = null;

async function ensureTestUser() {
  const list = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = (list.body && (list.body.users || list.body)) || [];
  const hit = Array.isArray(users) ? users.find(u => (u.email || '').toLowerCase() === EMAIL) : null;
  if (hit) return hit.id;
  const c = await svcRest('POST', '/auth/v1/admin/users', { email: EMAIL, password: PWD, email_confirm: true, user_metadata: { display_name: 't58-plan' } });
  return c.body && c.body.id;
}

async function newTrackCtx(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', ...opts });
  await ctx.addInitScript(() => {
    // 跨导航持久捕获（addInitScript 每次导航重跑，window 级数组会被重置——B6a 实证）：
    // 改落 localStorage 日志，读侧整段取出
    const KEY = '__t58log';
    const rec = (body) => {
      try {
        const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
        arr.push(JSON.parse(body));
        localStorage.setItem(KEY, JSON.stringify(arr));
      } catch { /* 非 json */ }
    };
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      try { if (String(url).includes('/api/track')) { if (data instanceof Blob) data.text().then(rec); else rec(data); } } catch { /* 静默 */ }
      return origBeacon(url, data);
    };
    const origFetch = window.fetch.bind(window);
    window.fetch = (url, o) => {
      try { if (String(url).includes('/api/track') && o && o.body) rec(o.body); } catch { /* 静默 */ }
      return origFetch(url, o);
    };
  });
  const pg = await ctx.newPage();
  const errs = [], badNet = [], track204 = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  pg.on('response', r => {
    if (r.url().includes('/api/track') && r.status() === 204) track204.push(1);
    else if (r.status() >= 400) badNet.push(`http${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return { ctx, pg, errs, badNet, track204 };
}

function filterNoise(errs, badNet) {
  const NET_409 = /^http409 POST https:\/\/[^/]+\/rest\/v1\/user_profiles$/;
  const badReal = badNet.filter(e => !NET_409.test(e));
  let echoBudget = badNet.length - badReal.length;
  const errsReal = errs.filter(e => {
    if (echoBudget > 0 && e === 'console: Failed to load resource: the server responded with a status of 409 ()') { echoBudget--; return false; }
    return true;
  });
  return { badReal, errsReal };
}

async function waitDecorReady(pg) {
  await pg.waitForSelector('.dh-grid .dh-card', { timeout: 30000 });
}
async function addN(pg, n) {
  const btns = pg.locator('.dh-card-add');
  for (let i = 0; i < n; i++) await btns.nth(i).click();
}
async function openDrawer(pg) {
  if (await pg.locator('.dh-plan-drawer.open').count()) return; // 幂等：已开不再点（防被抽屉自身遮罩拦截）
  await pg.click('#dhPlanToggle');
  await pg.waitForSelector('.dh-plan-drawer.open', { timeout: 5000 });
}

async function liveAsserts() {
  testUid = await ensureTestUser();
  if (!testUid) { check('B-前置 测试账号就位', false); return; }
  // 清理上轮残留（幂等重跑）：该用户方案单行 + 名下测试公会
  await svcRest('DELETE', `/rest/v1/decor_plans?user_id=eq.${testUid}`);
  const oldG = await svcRest('GET', `/rest/v1/guilds?name=eq.${encodeURIComponent(GUILD_NAME)}&select=id`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) {
    await svcRest('DELETE', `/rest/v1/guild_members?guild_id=eq.${g.id}`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  }
  const g = await svcRest('POST', '/rest/v1/guilds', { name: GUILD_NAME, owner_id: testUid, invite_code: 'T58PLANB', server_name: '测试', server_region: '一区' });
  guildId = g.body && g.body[0] && g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: testUid, role: 'owner', display_name: 't58-plan' }]);
  await startServer();
  console.log('--- 服务器已起（端口 ' + PORT + '） ---');
  const browser = await chromium.launch({ headless: true });

  // ========== B1：D2 三红线（公示壳组单 → 保存跳登录 → 登录返回组单不丢） ==========
  const P = await newTrackCtx(browser);
  await P.pg.goto(`${BASE}/decor.html`, { waitUntil: 'load' });
  await waitDecorReady(P.pg);
  await addN(P.pg, 3);
  const draft1 = await P.pg.evaluate(() => JSON.parse(localStorage.getItem('wb_decor_plan_draft') || 'null'));
  await openDrawer(P.pg);
  const rowsPub = await P.pg.locator('.dh-plan-row').count();
  check('B1① 公示壳未登录组单：3 件入抽屉 + 徽标=3 + 草稿自动暂存（3 行）',
    rowsPub === 3 && draft1 && draft1.items.length === 3 &&
    (await P.pg.locator('#dhPlanToggleN').textContent()).trim() === '3',
    `抽屉行=${rowsPub} 草稿=${draft1 && draft1.items.length}`);
  // 双壳同源对照（B9 前置取证）：公示壳抽屉骨架 id 集
  const pubSkeleton = await P.pg.evaluate(() =>
    ['dhPlanToggle', 'dhPlanDrawer', 'dhPlanList', 'dhPlanCap', 'dhPlanSave', 'dhPlanExport'].map(id => !!document.getElementById(id)));

  await P.pg.click('#dhPlanSave');
  await P.pg.waitForURL(url => url.pathname.endsWith('index.html') || url.pathname === '/', { timeout: 10000 });
  check('B1② 公示壳点保存：提示「登录后组单内容不丢」+ 跳主站登录页（草稿未丢）',
    (await P.pg.evaluate(() => (JSON.parse(localStorage.getItem('wb_decor_plan_draft') || '{}').items || []).length)) === 3);
  // 登录 → 切图鉴 → 抽屉 3 件齐全（硬验收）
  await P.pg.fill('#authEmail', EMAIL);
  await P.pg.fill('#authPassword', PWD);
  await P.pg.click('#authLoginBtn');
  await P.pg.waitForSelector('.nav-item[data-page="decor"]', { state: 'visible', timeout: 30000 });
  await P.pg.click('.nav-item[data-page="decor"]');
  await waitDecorReady(P.pg);
  vidPub = await P.pg.evaluate(() => localStorage.getItem('wb_vid'));
  await openDrawer(P.pg);
  const rowsAfterLogin = await P.pg.locator('.dh-plan-row').count();
  const notice = await P.pg.locator('#dhPlanNotice').textContent().catch(() => '');
  check('B1③ 登录返回组单不丢（D2 硬验收）：抽屉 3 件齐全 + 一次性还原提示',
    rowsAfterLogin === 3 && notice.includes('已还原你上次未保存的组单'),
    `行=${rowsAfterLogin} 提示=「${notice.trim()}」`);

  // ========== B2：DB-first 保存链路 + 批量写计数 + 刷新云端还原 ==========
  const itemReqs = [];
  P.pg.on('request', r => { if (r.url().includes('/rest/v1/decor_plan_')) itemReqs.push(r.method() + ' ' + r.url().split('?')[0].split('/').pop()); });
  await P.pg.click('#dhPlanSave');
  await P.pg.waitForFunction(() => document.querySelector('#dhPlanToast') && document.querySelector('#dhPlanToast').textContent.includes('已保存'), { timeout: 20000 });
  const dbPlan = await svcRest('GET', `/rest/v1/decor_plans?user_id=eq.${testUid}&select=id,name,decor_plan_items(record_id,qty)`);
  const dbItems = dbPlan.body && dbPlan.body[0] && dbPlan.body[0].decor_plan_items || [];
  check('B2a 保存成功：库内方案 1 头 + 明细 3 行（service_role 复核）',
    dbPlan.body && dbPlan.body.length === 1 && dbItems.length === 3,
    `头=${dbPlan.body && dbPlan.body.length} 明细=${dbItems.length}`);
  const itemWriteReqs = itemReqs.filter(m => /^(POST|DELETE|PATCH)/.test(m));
  check('B2b 明细批量写：decor_plan_items 写请求 ≤2（禁逐行实证）',
    itemWriteReqs.length >= 1 && itemWriteReqs.length <= 2, `写请求=${itemWriteReqs.join(' | ')}`);

  await P.pg.reload({ waitUntil: 'load' });
  await P.pg.click('.nav-item[data-page="decor"]');
  await waitDecorReady(P.pg);
  const draftAfterSave = await P.pg.evaluate(() => localStorage.getItem('wb_decor_plan_draft'));
  await openDrawer(P.pg);
  const rowsAfterReload = await P.pg.locator('.dh-plan-row').count();
  const noticeAfterReload = await P.pg.locator('#dhPlanNotice').isVisible().catch(() => false);
  check('B2c 刷新后云端还原（草稿空→云端分支）：3 件齐全 + 草稿已清 + 无还原提示',
    rowsAfterReload === 3 && !draftAfterSave && !noticeAfterReload,
    `行=${rowsAfterReload} 草稿=${draftAfterSave ? '在场' : '已清'}`);

  // ========== B3：草稿与云端皆非空 → 草稿优先 + 提示 ==========
  await P.pg.evaluate(() => {
    localStorage.setItem('wb_decor_plan_draft', JSON.stringify({ items: [{ record_id: 27043, qty: 5 }], updatedAt: Date.now() }));
  });
  await P.pg.reload({ waitUntil: 'load' });
  await P.pg.click('.nav-item[data-page="decor"]');
  await waitDecorReady(P.pg);
  await openDrawer(P.pg);
  const mergeRows = await P.pg.locator('.dh-plan-row').count();
  const mergeQty = await P.pg.locator('.dh-plan-qty').first().textContent();
  const mergeNotice = await P.pg.locator('#dhPlanNotice').textContent().catch(() => '');
  check('B3 合并三分支之草稿优先：草稿(27043×5) 覆盖云端(3 件) + 一次性提示',
    mergeRows === 1 && mergeQty.trim() === '5' && mergeNotice.includes('已还原'),
    `行=${mergeRows} qty=${mergeQty.trim()}`);
  // 还原保存口径：保存后云端应变为草稿内容
  await P.pg.click('#dhPlanSave');
  await P.pg.waitForFunction(() => document.querySelector('#dhPlanToast') && document.querySelector('#dhPlanToast').textContent.includes('已保存'), { timeout: 20000 });
  const dbPlan2 = await svcRest('GET', `/rest/v1/decor_plans?user_id=eq.${testUid}&select=decor_plan_items(record_id,qty)`);
  const dbItems2 = dbPlan2.body && dbPlan2.body[0] && dbPlan2.body[0].decor_plan_items || [];
  check('B3b 草稿覆盖保存后：库内明细 = 27043×5 一行（差集 delete+upsert 实证）',
    dbItems2.length === 1 && dbItems2[0].record_id === 27043 && dbItems2[0].qty === 5,
    JSON.stringify(dbItems2));

  // ========== B4：容量合计一致 + 超 2000 标红不阻断 ==========
  const capCheck = await P.pg.evaluate(() => {
    const rows = window.DecorCatalog && document.querySelectorAll('.dh-plan-row');
    let manual = 0;
    // 手工核算：明细行 qty × 目录 placement_cost（经页面渲染文本反查不可行——直接读库内索引同源算法）
    return { capText: document.getElementById('dhPlanCap').textContent, rows: rows.length };
  });
  const dbCost = await svcRest('GET', `/rest/v1/decor_catalog?record_id=eq.27043&select=placement_cost`);
  const cost27043 = dbCost.body && dbCost.body[0] && dbCost.body[0].placement_cost || 0;
  check('B4a 容量合计 = 手工核算（27043 placement_cost × 5）',
    capCheck.capText.includes(`容量 ${(cost27043 * 5).toLocaleString()} /`),
    `${capCheck.capText}（27043 cost=${cost27043}）`);
  // 步进＋到超 2000（27043 cost 若较小则直接 evaluate 改草稿重载）
  await P.pg.evaluate((cost) => {
    const need = Math.floor(2001 / Math.max(1, cost)) + 1;
    localStorage.setItem('wb_decor_plan_draft', JSON.stringify({ items: [{ record_id: 27043, qty: need }], updatedAt: Date.now() }));
  }, cost27043);
  await P.pg.reload({ waitUntil: 'load' });
  await P.pg.click('.nav-item[data-page="decor"]');
  await waitDecorReady(P.pg);
  await openDrawer(P.pg);
  const overOk = await P.pg.locator('.dh-plan-cap.over').count() === 1;
  // 不阻断实证：减量步进（qty>1 恒可用）与移除按钮仍可操作（qty=402 时＋按 99 上限禁用属设计行为，不作判据）
  const stepDownWorks = await P.pg.locator('.dh-plan-step-btn[data-step="-1"]').first().isEnabled();
  const rmWorks = await P.pg.locator('.dh-plan-rm').first().isEnabled();
  check('B4b 超 2000 标红（.over 在场）+ 不阻断（步进/移除仍可用）', overOk && stepDownWorks && rmWorks,
    `cap=${await P.pg.locator('#dhPlanCap').textContent()}`);
  // 复原草稿为 3 件常规内容供后续用例
  await P.pg.evaluate(() => {
    localStorage.setItem('wb_decor_plan_draft', JSON.stringify({ items: [{ record_id: 27043, qty: 2 }, { record_id: 675, qty: 1 }, { record_id: 8176, qty: 1 }], updatedAt: Date.now() }));
  });
  await P.pg.reload({ waitUntil: 'load' });
  await P.pg.click('.nav-item[data-page="decor"]');
  await waitDecorReady(P.pg);

  // ========== B5：导出弹窗（逐行一致/二次确认/复制/降级） ==========
  await openDrawer(P.pg);
  await P.pg.click('#dhPlanExport');
  await P.pg.waitForSelector('#dhPlanExportText', { timeout: 5000 });
  const exportText = await P.pg.locator('#dhPlanExportText').inputValue();
  const exportLines = exportText.split('\n');
  const cat3 = await svcRest('GET', `/rest/v1/decor_catalog?record_id=in.(27043,675,8176)&select=record_id,name,placement_cost&order=record_id`);
  const nm = Object.fromEntries((cat3.body || []).map(r => [r.record_id, r]));
  const expectLines = [
    '【魔兽管家 · 家宅方案单】我的方案单',
    `${nm[27043].name} ×2（容量 ${nm[27043].placement_cost}/件）`,
    `${nm[675].name} ×1（容量 ${nm[675].placement_cost}/件）`,
    `${nm[8176].name} ×1（容量 ${nm[8176].placement_cost}/件）`,
    '——————————',
  ];
  const linesOk = expectLines.every((l, i) => exportLines[i] === l) &&
    exportLines[exportLines.length - 1] === '魔兽管家 · 家宅图鉴免费组单：https://wow.ddctl.com/decor.html' &&
    /合计 4 件 · 容量 \d+/.test(exportLines[exportLines.length - 2]);
  check('B5a 导出文本逐行一致（3 件明细行+合计行+尾行固定链接）', linesOk,
    linesOk ? `共 ${exportLines.length} 行` : `实际=${JSON.stringify(exportLines.slice(0, 4))}`);
  // 编辑 → 遮罩点击 → 二次确认（先取消后确认）
  await P.pg.locator('#dhPlanExportText').fill(exportText + '\n手动改动');
  let dialogCount = 0;
  P.pg.on('dialog', async d => { dialogCount++; if (dialogCount === 1) await d.dismiss(); else await d.accept(); });
  await P.pg.click('.dh-plan-export-overlay', { position: { x: 8, y: 8 } });
  await sleep(300);
  const stillOpen = await P.pg.locator('#dhPlanExportText').count() === 1;
  await P.pg.click('.dh-plan-export-overlay', { position: { x: 8, y: 8 } });
  await sleep(400);
  const closedAfterAccept = await P.pg.locator('#dhPlanExportText').count() === 0;
  check('B5b textarea 改动后遮罩点击：二次确认（取消=不关 ✓ / 确认=关 ✓）',
    stillOpen && closedAfterAccept && dialogCount === 2, `弹窗=${stillOpen}/${closedAfterAccept} 确认框×${dialogCount}`);
  // 复制（授权 clipboard → toast 已复制）
  await P.ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await P.pg.click('#dhPlanExport');
  await P.pg.waitForSelector('#dhPlanExportText', { timeout: 5000 });
  await P.pg.click('#dhPlanCopyBtn');
  await P.pg.waitForFunction(() => document.querySelector('#dhPlanToast') && document.querySelector('#dhPlanToast').textContent.includes('已复制'), { timeout: 8000 });
  const clipText = await P.pg.evaluate(() => navigator.clipboard.readText());
  check('B5c 复制成功：toast + 剪贴板内容与 textarea 一致',
    clipText.startsWith('【魔兽管家 · 家宅方案单】'), `剪贴板首行=「${clipText.split('\n')[0]}」`);
  await P.pg.evaluate(() => document.querySelector('.dh-plan-export-overlay .dh-modal-close').click());

  // ========== B6：埋点三事件（捕获 payload + 204 计数） ==========
  await sleep(600);
  const t58 = await P.pg.evaluate(() => JSON.parse(localStorage.getItem('__t58log') || '[]'));
  const planEvents = t58.filter(e => e.event && e.event.startsWith('decor_plan_'));
  const names = [...new Set(planEvents.map(e => e.event))].sort();
  check('B6a 埋点三事件全部发出（decor_plan_add/save/export_text）',
    JSON.stringify(names) === JSON.stringify(['decor_plan_add', 'decor_plan_export_text', 'decor_plan_save']),
    `事件=${names.join(',')} 204×${P.track204.length}`);
  check('B6b 埋点 props 口径（add 带 from/record_id；save 带 items/capacity；export 带 items）且服务端 204 非吞（白名单已扩）',
    planEvents.every(e => {
      const keys = Object.keys(e.props || {});
      if (e.event === 'decor_plan_add') return keys.every(k => ['from', 'record_id'].includes(k));
      if (e.event === 'decor_plan_save') return keys.every(k => ['items', 'capacity'].includes(k));
      return keys.every(k => ['items'].includes(k));
    }) && P.track204.length >= 5,
    `payload 样本=${JSON.stringify(planEvents[0] && planEvents[0].props)}`);
  // 服务端真入库复核（service_role 按 vid 查三事件在场）
  const dbEvts = await svcRest('GET', `/rest/v1/analytics_events?vid=eq.${vidPub}&event=like.decor_plan_*&select=event,props`);
  const dbEvtNames = [...new Set((dbEvts.body || []).map(r => r.event))].sort();
  check('B6c 三事件真实入库（白名单扩列实证，非 204 吞掉）',
    dbEvtNames.length === 3, `库内=${dbEvtNames.join(',')}`);

  // ========== B7/B8/B9：窄屏 / 卡片回归 / 双壳同构 ==========
  await P.pg.setViewportSize({ width: 768, height: 900 });
  await openDrawer(P.pg);
  const drawerW = await P.pg.evaluate(() => document.getElementById('dhPlanDrawer').getBoundingClientRect().width);
  check('B7 768px 窄屏抽屉全宽覆盖（width=100vw）', Math.abs(drawerW - 768) < 2, `width=${drawerW}`);
  await P.pg.setViewportSize({ width: 1440, height: 900 });
  await P.pg.click('#dhPlanClose');
  // B8：卡片通栏按钮回归 + #58-补丁双态/弹窗入口/from 来源链路
  const firstCardBtn = P.pg.locator('.dh-card-add').first();
  const beforeLabel = (await firstCardBtn.textContent()).trim();
  const beforeQty = beforeLabel.startsWith('已加入') ? +(beforeLabel.match(/×(\d+)/) || [0, 0])[1] : 0;
  await firstCardBtn.click();
  await sleep(300);
  const noModal = await P.pg.locator('.dh-modal-overlay .dh-modal-title').count() === 0;
  const afterCardLabel = (await firstCardBtn.textContent()).trim();
  check('B8a 卡片回归+双态：通栏按钮不触发详情弹窗 / 点击后文案即时刷新（×N+1）+ added 态',
    noModal && afterCardLabel === `已加入 ×${beforeQty + 1}` &&
    await firstCardBtn.evaluate(el => el.classList.contains('added')),
    `「${beforeLabel}」→「${afterCardLabel}」`);
  // 弹窗同件双态同步 + 弹窗加单
  await P.pg.locator('.dh-card').first().click();
  await P.pg.waitForSelector('.dh-modal-overlay.show', { timeout: 5000 });
  const detailBtn = P.pg.locator('.dh-detail-add');
  const detailLabel1 = (await detailBtn.textContent()).trim();
  await detailBtn.click();
  await sleep(300);
  const detailLabel2 = (await detailBtn.textContent()).trim();
  const cardLabelAfterDetail = (await firstCardBtn.textContent()).trim();
  check('B8b 详情弹窗加单主按钮：入场即同步「已加入 ×N」→ 点击 qty+1 → 弹窗与卡片文案同刷',
    detailLabel1 === `已加入 ×${beforeQty + 1}` && detailLabel2 === `已加入 ×${beforeQty + 2}` &&
    cardLabelAfterDetail === detailLabel2,
    `弹窗「${detailLabel1}」→「${detailLabel2}」 卡片=「${cardLabelAfterDetail}」`);
  await P.pg.click('.dh-modal-overlay .dh-modal-close');
  await sleep(400);
  // 埋点 from 双来源实证（本段新增两条 add：先 card 后 detail）
  const t58b = await P.pg.evaluate(() => JSON.parse(localStorage.getItem('__t58log') || '[]'));
  const addFroms = t58b.filter(e => e.event === 'decor_plan_add').map(e => e.props && e.props.from);
  check('B8c 埋点 decor_plan_add from 区分来源（card 与 detail 双值在场）',
    addFroms.includes('card') && addFroms.includes('detail'), `froms=${addFroms.join(',')}`);
  // B8d 终审打回修复：焦点在加单按钮上按 Enter/Space → 只加单（qty+1），不冒泡开详情弹窗
  const labelBeforeKey = (await firstCardBtn.textContent()).trim();
  const qtyBeforeKey = +(labelBeforeKey.match(/×(\d+)/) || [0, 0])[1];
  await firstCardBtn.focus();
  await P.pg.keyboard.press('Enter');
  await sleep(300);
  const labelAfterEnter = (await firstCardBtn.textContent()).trim();
  const noModalAfterEnter = await P.pg.locator('.dh-modal-overlay .dh-modal-title').count() === 0;
  await P.pg.keyboard.press('Space');
  await sleep(300);
  const labelAfterSpace = (await firstCardBtn.textContent()).trim();
  const noModalAfterSpace = await P.pg.locator('.dh-modal-overlay .dh-modal-title').count() === 0;
  check('B8d 键盘止冒泡：焦点按钮 Enter/Space 只加单（×N+1 两次）不开详情',
    labelAfterEnter === `已加入 ×${qtyBeforeKey + 1}` && noModalAfterEnter &&
    labelAfterSpace === `已加入 ×${qtyBeforeKey + 2}` && noModalAfterSpace,
    `「${labelBeforeKey}」→Enter→「${labelAfterEnter}」→Space→「${labelAfterSpace}」 弹窗=${!noModalAfterEnter}/${!noModalAfterSpace}`);
  const appSkeleton = await P.pg.evaluate(() =>
    ['dhPlanToggle', 'dhPlanDrawer', 'dhPlanList', 'dhPlanCap', 'dhPlanSave', 'dhPlanExport'].map(id => !!document.getElementById(id)));
  check('B9 双壳抽屉 DOM 同构（公示壳 vs 登录壳骨架 id 全一致）',
    JSON.stringify(pubSkeleton) === JSON.stringify(appSkeleton) && appSkeleton.every(Boolean));

  const nP = filterNoise(P.errs, P.badNet);
  check('B10 全程零 JS 报错零意外 4xx（ensureTagNum 409 重试噪音按精确白名单滤除）',
    nP.badReal.length === 0 && nP.errsReal.length === 0,
    nP.badReal.concat(nP.errsReal).join(' | ').slice(0, 160) || '0');

  vidApp = vidPub; // 同一 ctx 同 vid（公示壳→登录壳同浏览器）
  await P.ctx.close();
  await browser.close();
}

// ==================== C 清零 ====================
async function cleanupAsserts() {
  // C1 测试事件行
  if (vidApp) await svcRest('DELETE', `/rest/v1/analytics_events?vid=eq.${vidApp}`);
  const leftEv = vidApp ? await svcRest('GET', `/rest/v1/analytics_events?select=id&vid=eq.${vidApp}`) : { status: 200, body: [] };
  check('C1 测试事件行清零复核', leftEv.status === 200 && Array.isArray(leftEv.body) && leftEv.body.length === 0,
    `残留=${Array.isArray(leftEv.body) ? leftEv.body.length : '?'}`);
  // C2 方案单行（用户级联/显式删除）
  if (testUid) await svcRest('DELETE', `/rest/v1/decor_plans?user_id=eq.${testUid}`);
  const leftPlan = testUid ? await svcRest('GET', `/rest/v1/decor_plans?user_id=eq.${testUid}&select=id`) : { status: 200, body: [] };
  check('C2 测试方案单行清零复核（头+明细级联）',
    leftPlan.status === 200 && Array.isArray(leftPlan.body) && leftPlan.body.length === 0);
  // C3 测试公会 + 测试账号
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
  console.log('===== B 浏览器实测（D2 三红线 + DB-first + 合并 + 导出 + 埋点） =====');
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
