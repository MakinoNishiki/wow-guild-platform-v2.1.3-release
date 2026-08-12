// 任务书 #42 验证：REQ-105 导航拖拽排序 + REQ-107 日历密度切换（preferences jsonb 单列）
// 覆盖（任务书 §六 verify 口径）：
//   ① sql/27 迁移复核（preferences 列 REST 可见、存量零 NULL）；
//   ② preferences 读写环：savePreference 单键增量写（两键共存不互覆）、读回一致；
//   ③ nav_order 持久化（拖拽落定→REST 库内一致→F5 保持）、乱序恢复（未知 key 忽略/缺失 key 追加尾部）、
//      跨设备同步（新浏览器 profile 无 localStorage 顺序仍在）、另一账号隔离（看不到别人偏好）；
//   ④ 密度两态渲染 + 条目数守恒硬约束（两态日历格子数/活动格数/场次总数逐一相等）、写库持久化、
//      写失败 toast + 界面回滚（禁假成功）、紧凑默认（新账号无偏好即紧凑）；
//   ⑤ 降级路径：移动端（390 触屏）禁用拖拽；空偏好/坏 key 不卡死；
//   ⑥ 版本串两壳 .54；全程零 JS 报错零 404。
// 测试数据（T42 前缀活动/公会 + t42- 测试用户×2）终清理并复核为零；user_profiles 行随用户删除级联。
// 用法: node scripts/verify-task42.js（PW_CHANNEL=chrome 可选）
// 截图输出 backup/2026-08-12-task42/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-12-task42');
const PORT = 15711;
const BASE = `http://localhost:${PORT}`;
const PWD = 'T42-Test-2026!';
const EMAIL_A = 't42-a@wowbutler.cn';
const EMAIL_B = 't42-b@wowbutler.cn';
const DEFAULT_ORDER = ['dashboard', 'members', 'attendance', 'loot', 'wishlist', 'reports', 'data', 'changelog', 'datacenter', 'lootdrop', 'usercenter'];

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

let serverProc = null, userA = null, userB = null, guildId = null;

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
async function readPrefs(uid) {
  const r = await svc('GET', `/rest/v1/user_profiles?select=preferences&user_id=eq.${uid}`);
  return (Array.isArray(r.body) && r.body[0] && r.body[0].preferences) || null;
}

async function setup() {
  const oldG = await svc('GET', `/rest/v1/guilds?select=id&name=like.T42*`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) await svc('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  const lu = await fetch(`${SB}/auth/v1/admin/users?per_page=50`, { headers: SVC });
  const lj = await lu.json();
  for (const email of [EMAIL_A, EMAIL_B]) {
    const hit = (lj.users || []).find(u => u.email === email);
    if (hit) await fetch(`${SB}/auth/v1/admin/users/${hit.id}`, { method: 'DELETE', headers: SVC });
  }

  userA = await makeUser(EMAIL_A, 'T42甲');
  userB = await makeUser(EMAIL_B, 'T42乙');
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T42偏好会', owner_id: userA.uid, invite_code: 'T42A' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', [
    { guild_id: guildId, user_id: userA.uid, role: 'owner', display_name: 'T42甲' },
    { guild_id: guildId, user_id: userB.uid, role: 'viewer', display_name: 'T42乙' },
  ]);
  // 本月 3 场活动（不同日），供日历条目数守恒断言
  const now = new Date();
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await svc('POST', '/rest/v1/activities', [
    { guild_id: guildId, name: 'T42活动一', activity_date: fmt(new Date(now.getFullYear(), now.getMonth(), 5)), raid: '虚影尖塔', start_time: '20:00', end_time: '23:00', status: 'normal' },
    { guild_id: guildId, name: 'T42活动二', activity_date: fmt(new Date(now.getFullYear(), now.getMonth(), 5)), raid: '虚影尖塔', start_time: '20:00', end_time: '23:00', status: 'normal' },
    { guild_id: guildId, name: 'T42活动三', activity_date: fmt(new Date(now.getFullYear(), now.getMonth(), 12)), raid: '梦境裂隙', start_time: '20:00', end_time: '23:00', status: 'normal' },
  ]);

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}
async function cleanup() {
  const steps = [];
  if (guildId) { try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); steps.push(`guild:${r.status}`); } catch { steps.push('guild:ERR'); } }
  try { const r = await svc('DELETE', `/rest/v1/activities?name=like.T42*`); steps.push(`act:${r.status}`); } catch { steps.push('act:ERR'); }
  for (const u of [userA, userB]) {
    if (u) { try { await fetch(`${SB}/auth/v1/admin/users/${u.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); } }
  }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', `/rest/v1/guilds?select=id&name=like.T42*`);
  const c2 = await svc('GET', `/rest/v1/activities?select=id&name=like.T42*`);
  check('[清理复核] T42 前缀公会/活动全 0', c1.body.length === 0 && c2.body.length === 0, `guild=${c1.body.length} act=${c2.body.length}`);
}
async function login(page, email) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
  await page.fill('#authEmail', email);
  await page.fill('#authPassword', PWD);
  await page.click('#authLoginBtn');
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  await sleep(1800); // 等 loadUserPreferences 落定
}
async function navOrderOf(page) {
  return page.evaluate(() => [...document.querySelectorAll('.nav-menu .nav-item')].map(it => it.dataset.page || it.dataset.navkey || ''));
}
// 合成 HTML5 DnD：把 srcKey 项拖到 dstKey 项之前（真实 DragEvent 链路：dragstart→dragover→dragend）
async function dragNavBefore(page, srcKey, dstKey) {
  await page.evaluate(({ srcKey, dstKey }) => {
    const sel = k => [...document.querySelectorAll('.nav-menu .nav-item')].find(it => (it.dataset.page || it.dataset.navkey) === k);
    const src = sel(srcKey), dst = sel(dstKey);
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    const r = dst.getBoundingClientRect();
    const menu = document.querySelector('.nav-menu');
    menu.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt, clientY: r.top + 2, clientX: r.left + 10 }));
    src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  }, { srcKey, dstKey });
  await sleep(1200); // 等 savePreference 落定
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  // ==================== A. 迁移复核 + 版本串 ====================
  const col = await svc('GET', '/rest/v1/user_profiles?select=preferences&limit=1');
  check('A1 sql/27 已执行：preferences 列 REST 可见', col.status === 200 && Array.isArray(col.body), `status=${col.status}`);
  const nullCnt = await svc('GET', '/rest/v1/user_profiles?select=user_id&preferences=is.null');
  check('A2 存量零 NULL（默认 {} 回填）', Array.isArray(nullCnt.body) && nullCnt.body.length === 0, `null=${Array.isArray(nullCnt.body) ? nullCnt.body.length : '?'}`);
  const htmlData = await (await fetch(`${BASE}/data.html`)).text();
  const htmlIndex = await (await fetch(`${BASE}/`)).text();
  const verOf = h => [...new Set([...h.matchAll(/20260811\.\d+/g)].map(m => m[0]))];
  const vD = verOf(htmlData), vI = verOf(htmlIndex);
  check('A3 版本串两壳同步（单一串且两壳一致；本包 .54）', vD.length === 1 && vI.length === 1 && vD[0] === vI[0] && parseInt(vI[0].split('.')[1], 10) >= 54, `index=${vI} data=${vD}`);

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  const notFounds = [];
  const watch = (page, tag) => {
    page.on('pageerror', e => pageErrors.push(`pageerror(${tag}): ` + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push(`console(${tag}): ` + msg.text()); });
    page.on('response', r => { if (r.status() === 404) notFounds.push(`${tag}: ${r.url()}`); });
  };
  try {
    // ==================== B. 导航拖拽排序（userA 桌面 1366） ====================
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    watch(page, 'nav');
    await login(page, EMAIL_A);

    const b1 = await navOrderOf(page);
    check('B1 无偏好默认序=DOM 原序（11 项含 usercenter/navkey）', JSON.stringify(b1) === JSON.stringify(DEFAULT_ORDER), JSON.stringify(b1));
    const b1b = await page.evaluate(() => ({
      fbOutside: !document.querySelector('.nav-menu #feedbackEntry'),
      fbDraggable: (document.getElementById('feedbackEntry') || {}).draggable === true,
    }));
    check('B2 「问题反馈」不在 nav-menu（不参与排序，任务书 #41 同域核查）', b1b.fbOutside && !b1b.fbDraggable, JSON.stringify(b1b));

    // 拖拽：members 提到 dashboard 之前
    await dragNavBefore(page, 'members', 'dashboard');
    const b3 = await navOrderOf(page);
    const b3expect = ['members', 'dashboard', ...DEFAULT_ORDER.filter(k => k !== 'members' && k !== 'dashboard')];
    check('B3 拖拽落定 DOM 实时重排（members→dashboard 前）', JSON.stringify(b3) === JSON.stringify(b3expect), JSON.stringify(b3.slice(0, 3)));
    const pref1 = await readPrefs(userA.uid);
    check('B4 nav_order 落定一次写库且与 DOM 一致（拖拽过程零打库）', pref1 && JSON.stringify(pref1.nav_order) === JSON.stringify(b3), JSON.stringify(pref1 && pref1.nav_order && pref1.nav_order.slice(0, 3)));

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(1800);
    const b5 = await navOrderOf(page);
    check('B5 F5 刷新后顺序保持（服务端持久化）', JSON.stringify(b5) === JSON.stringify(b3), JSON.stringify(b5.slice(0, 3)));

    // 乱序恢复：未知 key 忽略 + 缺失 key 追加尾部
    const b6w = await svc('PATCH', `/rest/v1/user_profiles?user_id=eq.${userA.uid}`, { preferences: { nav_order: ['lootdrop', 'ghost-key', 'members'] } });
    if (b6w.status >= 300) throw new Error('乱序偏好写入失败: ' + JSON.stringify(b6w.body));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(1800);
    const b6 = await navOrderOf(page);
    const b6expect = ['lootdrop', 'members', ...DEFAULT_ORDER.filter(k => k !== 'lootdrop' && k !== 'members')];
    check('B6 乱序恢复：未知 key 忽略、缺失 key 按原序追加尾部、不卡死', JSON.stringify(b6) === JSON.stringify(b6expect), JSON.stringify(b6.slice(0, 4)));

    // ==================== C. 日历密度（userA，本月 3 场活动） ====================
    await page.click('.nav-item[data-page="attendance"]');
    await sleep(600);
    await page.evaluate(() => { document.querySelectorAll('#page-attendance .view-tab')[0].click(); }); // 日历视图
    await sleep(800);
    const calSnapshot = () => page.evaluate(() => ({
      compact: document.getElementById('calendarDays').classList.contains('cal-compact'),
      dayCells: document.querySelectorAll('#calendarDays .calendar-day').length,
      actCells: document.querySelectorAll('#calendarDays .calendar-day.has-activity').length,
      totalCount: [...document.querySelectorAll('#calendarDays .day-count')].map(x => parseInt(x.textContent)).reduce((a, b) => a + b, 0),
      cellH: document.querySelector('#calendarDays .calendar-day:not(.empty)').getBoundingClientRect().height,
      btnCompact: document.querySelector('.cal-density-btn[data-density="compact"]').classList.contains('active'),
      btnComfort: document.querySelector('.cal-density-btn[data-density="comfortable"]').classList.contains('active'),
    }));
    const c1 = await calSnapshot(); // userA 在 B6 后无 calendar_density 键 → 默认紧凑
    check('C1 默认紧凑态（cal-compact 类+紧凑钮 active）', c1.compact && c1.btnCompact && !c1.btnComfort, `cellH=${c1.cellH}`);
    check('C2 紧凑态格子收密（行高 ≤56px，一屏整月目标）', c1.cellH > 0 && c1.cellH <= 56, `cellH=${c1.cellH}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'calendar-compact-1366.png'), fullPage: false });

    await page.click('.cal-density-btn[data-density="comfortable"]');
    await sleep(1200);
    const c2 = await calSnapshot();
    check('C3 切舒适态即时生效免刷新（类/按钮态翻转，格子变高）', !c2.compact && c2.btnComfort && c2.cellH > c1.cellH, `cellH=${c1.cellH}→${c2.cellH}`);
    check('C4 条目数守恒：两态格子数/活动格数/场次总数逐一相等（零裁剪）',
      c2.dayCells === c1.dayCells && c2.actCells === c1.actCells && c2.totalCount === c1.totalCount && c1.actCells === 2 && c1.totalCount === 3,
      `格子=${c1.dayCells}=${c2.dayCells} 活动格=${c1.actCells} 场次=${c1.totalCount}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'calendar-comfortable-1366.png'), fullPage: false });
    const pref2 = await readPrefs(userA.uid);
    check('C5 calendar_density 写库=comfortable 且 nav_order 键仍在（单键增量不互覆）',
      pref2 && pref2.calendar_density === 'comfortable' && Array.isArray(pref2.nav_order), JSON.stringify(pref2));

    // 刷新记忆
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(1800);
    await page.click('.nav-item[data-page="attendance"]');
    await sleep(600);
    await page.evaluate(() => { document.querySelectorAll('#page-attendance .view-tab')[0].click(); });
    await sleep(600);
    const c6 = await calSnapshot();
    check('C6 刷新后密度记忆（舒适保持）', !c6.compact && c6.btnComfort);

    // 写失败路径：断 user_profiles 写 → toast + 界面回滚紧凑
    await page.route('**/rest/v1/user_profiles*', r => r.abort());
    await page.evaluate(() => { document.getElementById('toastContainer').innerHTML = ''; });
    await page.click('.cal-density-btn[data-density="compact"]');
    await page.waitForFunction(() => document.getElementById('toastContainer').innerText.includes('保存失败'), null, { timeout: 15000 }).catch(() => {});
    const c7 = await calSnapshot();
    const c7toast = await page.evaluate(() => document.getElementById('toastContainer').innerText);
    check('C7 写失败：toast 提示 + 界面回滚旧值（回舒适态，禁假成功）', !c7.compact && c7.btnComfort && c7toast.includes('保存失败'), `toast=${c7toast} compact=${c7.compact}`);
    await page.unroute('**/rest/v1/user_profiles*');
    await ctx.close();

    // ==================== D. 跨设备同步（新 profile 零 localStorage） ====================
    const ctx2 = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page2 = await ctx2.newPage();
    watch(page2, 'device2');
    await login(page2, EMAIL_A);
    const d1 = await navOrderOf(page2);
    check('D1 跨设备：新浏览器 profile（无本地缓存）导航顺序与偏好一致', JSON.stringify(d1) === JSON.stringify(b6), JSON.stringify(d1.slice(0, 4)));
    // 1920 档紧凑一整月
    await page2.click('.nav-item[data-page="attendance"]');
    await sleep(600);
    await page2.evaluate(() => { document.querySelectorAll('#page-attendance .view-tab')[0].click(); });
    await sleep(600);
    const d2 = await page2.evaluate(() => ({
      compact: document.getElementById('calendarDays').classList.contains('cal-compact'),
      cellH: document.querySelector('#calendarDays .calendar-day:not(.empty)').getBoundingClientRect().height,
    }));
    check('D2 1920 档密度偏好同步（舒适记忆）且渲染正常', d2 && !d2.compact && d2.cellH > 52, JSON.stringify(d2));
    await page2.screenshot({ path: path.join(SHOT_DIR, 'calendar-1920-device2.png'), fullPage: false });
    await ctx2.close();

    // ==================== E. 另一账号隔离 + 紧凑默认（userB 全新账号无偏好） ====================
    const ctx3 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page3 = await ctx3.newPage();
    watch(page3, 'userB');
    await login(page3, EMAIL_B);
    const e1 = await navOrderOf(page3);
    check('E1 另一账号看不到别人偏好（默认序）', JSON.stringify(e1) === JSON.stringify(DEFAULT_ORDER), JSON.stringify(e1.slice(0, 3)));
    await page3.click('.nav-item[data-page="attendance"]');
    await sleep(600);
    await page3.evaluate(() => { document.querySelectorAll('#page-attendance .view-tab')[0].click(); });
    await sleep(600);
    const e2 = await page3.evaluate(() => ({
      compact: document.getElementById('calendarDays').classList.contains('cal-compact'),
      btnCompact: document.querySelector('.cal-density-btn[data-density="compact"]').classList.contains('active'),
    }));
    check('E2 另一账号日历紧凑默认生效', e2.compact && e2.btnCompact, JSON.stringify(e2));
    await ctx3.close();

    // ==================== F. 移动端（390 触屏）禁用拖拽 ====================
    const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const pageM = await ctxM.newPage();
    watch(pageM, 'mobile');
    await login(pageM, EMAIL_A);
    const f1 = await pageM.evaluate(() => [...document.querySelectorAll('.nav-menu .nav-item')].every(it => !it.draggable));
    check('F1 移动端/触屏禁用拖拽（draggable 全 false）', f1);
    await ctxM.close();

    const realErrors = pageErrors.filter(e => !e.includes('status of 406') && !e.includes('status of 409')
      && !e.includes('net::ERR_FAILED') // C7 主动断流噪音
      && !e.includes('日历密度保存失败')); // C7 失败路径预期 console.error
    check('全程零 JS 报错（406/409/C7 主动断流噪音另行列示）', realErrors.length === 0, realErrors.join(' | ') || '无');
    check('全程零 404', notFounds.length === 0, notFounds.join(' | ') || '无');
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#42 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => {
  console.error('[验证脚本异常]', e);
  try { await cleanup(); } catch {}
  process.exit(1);
});
