// 任务书 #44 验证：BUG-078 导航跨账号串号 + BUG-079 日历「回到今天」+ REQ-115 面板减重
// 覆盖（任务书 §红线 verify 口径）：
//   A. 版本串两壳 .56 同步 + 静态断言（回到今天文案 / 用户维度键 / 减重规则落码）；
//   B. BUG-078 双样本同浏览器换号（同 page 零刷新，复现 B11 场景）：
//      A 调序→写库→退出（真点击头像菜单「退出登录」）→导航回默认序+本地缓存/旧全局键清除→
//      B 同页登录=默认序（加载完成前默认序不抢跑，无 A 序闪现）→B 退出→A 再登录=自己的序；
//   C. BUG-079 真浏览器：考勤日历按钮文案「回到今天」+ 点击回当月主链路；
//   D. REQ-115 computed 断言（§2 口径）：双壳 × 1920 面板态（bottom:auto/264px/z=10/框体四边闭合/
//      max-height 公式/超出才内部滚动/底部余量守恒）+ 双壳 × 1366 折叠顶栏态零回退（sticky 不动）；
//   E. 全程零 JS 报错零 404；T44 前缀测试数据终清理并复核为零。
// 用法: node scripts/verify-task44.js（PW_CHANNEL=chrome 可选）
// 截图输出 backup/2026-08-13-task44/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-13-task44');
const PORT = 15712;
const BASE = `http://localhost:${PORT}`;
const PWD = 'T44-Test-2026!';
const EMAIL_A = 't44-a@wowbutler.cn';
const EMAIL_B = 't44-b@wowbutler.cn';
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
  const oldG = await svc('GET', `/rest/v1/guilds?select=id&name=like.T44*`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) await svc('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  const lu = await fetch(`${SB}/auth/v1/admin/users?per_page=50`, { headers: SVC });
  const lj = await lu.json();
  for (const email of [EMAIL_A, EMAIL_B]) {
    const hit = (lj.users || []).find(u => u.email === email);
    if (hit) await fetch(`${SB}/auth/v1/admin/users/${hit.id}`, { method: 'DELETE', headers: SVC });
  }

  userA = await makeUser(EMAIL_A, 'T44甲');
  userB = await makeUser(EMAIL_B, 'T44乙');
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T44串号会', owner_id: userA.uid, invite_code: 'T44A' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', [
    { guild_id: guildId, user_id: userA.uid, role: 'owner', display_name: 'T44甲' },
    { guild_id: guildId, user_id: userB.uid, role: 'editor', display_name: 'T44乙' },
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
  for (const u of [userA, userB]) {
    if (u) { try { await fetch(`${SB}/auth/v1/admin/users/${u.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); } }
  }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', `/rest/v1/guilds?select=id&name=like.T44*`);
  check('[清理复核] T44 前缀公会全 0', Array.isArray(c1.body) && c1.body.length === 0, `guild=${Array.isArray(c1.body) ? c1.body.length : '?'}`);
}

async function login(page, email, settle = true) {
  await page.fill('#authEmail', email);
  await page.fill('#authPassword', PWD);
  await page.click('#authLoginBtn');
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  if (settle) await sleep(1800); // 等 loadUserPreferences 落定
}
async function logout(page) {
  await page.click('#userMenu'); // 头像菜单
  await page.waitForSelector('#userMenuDropdown', { state: 'visible', timeout: 8000 });
  await page.click('#userMenuDropdown .user-menu-item-danger'); // 真点击「退出登录」
  await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
  await sleep(800); // 等 onUserSignedOut 三清落定
}
async function navOrderOf(page) {
  return page.evaluate(() => [...document.querySelectorAll('.nav-menu .nav-item')].map(it => it.dataset.page || it.dataset.navkey || ''));
}
// 合成 HTML5 DnD：把 srcKey 项拖到 dstKey 项之前（同 verify-task42 口径）
async function dragNavBefore(page, srcKey, dstKey) {
  await page.evaluate(({ srcKey, dstKey }) => {
    const sel = k => [...document.querySelectorAll('.nav-menu .nav-item')].find(it => (it.dataset.page || it.dataset.navkey) === k);
    const src = sel(srcKey), dst = sel(dstKey);
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    const r = dst.getBoundingClientRect();
    document.querySelector('.nav-menu').dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt, clientY: r.top + 2, clientX: r.left + 10 }));
    src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  }, { srcKey, dstKey });
  await sleep(1200);
}
async function lsKeys(page) {
  return page.evaluate(() => Object.keys(localStorage).sort());
}
// REQ-115 面板态 computed 采集（§2 computed 口径）
async function panelSnapshot(page, scope) {
  return page.evaluate((scopeSel) => {
    const el = document.querySelector(scopeSel + ' .dp-filterbar');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      position: cs.position, bottom: cs.bottom, width: r.width, zIndex: cs.zIndex,
      height: r.height, rectTop: r.top, rectBottom: r.bottom, innerH: window.innerHeight,
      maxHeight: parseFloat(cs.maxHeight), overflowY: cs.overflowY,
      bTop: cs.borderTopWidth, bBottom: cs.borderBottomWidth, bLeft: cs.borderLeftWidth, bRight: cs.borderRightWidth,
      radius: cs.borderTopLeftRadius, bg: cs.backgroundColor,
      scrollH: el.scrollHeight, clientH: el.clientHeight,
      marginRightMain: getComputedStyle(document.querySelector(scopeSel + ' .dp-main')).marginRight,
    };
  }, scope);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  // ==================== A. 版本串 + 静态断言 ====================
  const htmlData = await (await fetch(`${BASE}/data.html`)).text();
  const htmlIndex = await (await fetch(`${BASE}/`)).text();
  const verOf = h => [...new Set([...h.matchAll(/20260811\.\d+/g)].map(m => m[0]))];
  const vD = verOf(htmlData), vI = verOf(htmlIndex);
  check('A1 版本串两壳同步（单一串且两壳一致；本包 .56）', vD.length === 1 && vI.length === 1 && vD[0] === vI[0] && vI[0] === '20260811.56', `index=${vI} data=${vD}`);
  const a2 = htmlIndex.includes('onclick="goToToday()">回到今天</button>') && !htmlIndex.includes('onclick="goToToday()">今天</button>');
  check('A2 BUG-079 静态：日历按钮「回到今天」且旧文案零残留', a2);
  const cloudSrc = fs.readFileSync(path.join(ROOT, 'js', 'cloud.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(ROOT, 'css', 'data-public.css'), 'utf8');
  check('A3 BUG-078 静态：last_guild 用户维度键 + 旧全局键读写零残留',
    cloudSrc.includes('wow_raid_last_guild:') && !cloudSrc.includes("localStorage.getItem('wow_raid_last_guild')") && !cloudSrc.includes("localStorage.setItem('wow_raid_last_guild'") && !appSrc.includes("localStorage.getItem('wow_raid_last_guild')"));
  check('A4 REQ-115 静态：面板态 bottom 拉满已删 + max-height 公式落码（双壳）',
    cssSrc.includes('max-height: calc(100vh - var(--dp-panel-top, 0px) - 24px)') && cssSrc.includes('max-height: calc(100vh - var(--dp-panel-top, 56px) - 24px)'));

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  const notFounds = [];
  const watch = (page, tag) => {
    page.setDefaultTimeout(30000); // 动作/等待有界：异常 30s 快报不悬挂
    page.on('pageerror', e => pageErrors.push(`pageerror(${tag}): ` + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push(`console(${tag}): ` + msg.text()); });
    page.on('response', r => { if (r.status() === 404) notFounds.push(`${tag}: ${r.url()}`); });
  };
  try {
    // ==================== B. BUG-078 双样本同浏览器换号（同 page 零刷新 = B11 场景） ====================
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    watch(page, 'nav');

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
    await page.evaluate(() => localStorage.setItem('wow_raid_last_guild', 'legacy-junk-guild-id')); // 旧全局键残留种子

    // ---- A 登录：默认序 → 调序 ----
    await login(page, EMAIL_A);
    const b1 = await navOrderOf(page);
    check('B1 A 首登默认序=DOM 原序（11 项）', JSON.stringify(b1) === JSON.stringify(DEFAULT_ORDER), JSON.stringify(b1));
    const keysA = await lsKeys(page);
    check('B2 登录后 last_guild 用户维度键写入 + 旧全局键读前清除',
      keysA.includes(`wow_raid_last_guild:${userA.uid}`) && !keysA.includes('wow_raid_last_guild'), keysA.filter(k => k.startsWith('wow_raid')).join(','));

    await dragNavBefore(page, 'members', 'dashboard');
    const b3 = await navOrderOf(page);
    const aOrder = ['members', 'dashboard', ...DEFAULT_ORDER.filter(k => k !== 'members' && k !== 'dashboard')];
    check('B3 A 调序落定（members→dashboard 前）', JSON.stringify(b3) === JSON.stringify(aOrder), JSON.stringify(b3.slice(0, 3)));
    const prefA = await readPrefs(userA.uid);
    check('B4 A 序写库一致（服务端隔离正常，B14 口径）', prefA && JSON.stringify(prefA.nav_order) === JSON.stringify(b3), JSON.stringify(prefA && prefA.nav_order && prefA.nav_order.slice(0, 3)));

    // ---- A 退出：导航回默认序 + 三清 ----
    await logout(page);
    const b5 = await navOrderOf(page);
    check('B5 A 退出后导航 DOM 回默认序（无偏好不早退，落默认序快照）', JSON.stringify(b5) === JSON.stringify(DEFAULT_ORDER), JSON.stringify(b5.slice(0, 3)));
    const keysOut = await lsKeys(page);
    check('B6 退出清本地缓存：wow_raid_attendance_data 已删、旧全局键零残留',
      !keysOut.includes('wow_raid_attendance_data') && !keysOut.includes('wow_raid_last_guild'), keysOut.filter(k => k.startsWith('wow_raid')).join(',') || '（无 wow_raid 键）');

    // ---- B 同页登录（零刷新 = 串号实证路径）：默认序 ----
    await page.fill('#authEmail', EMAIL_B);
    await page.fill('#authPassword', PWD);
    await page.click('#authLoginBtn');
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    const b7early = await navOrderOf(page); // 偏好加载完成前即刻读
    check('B7 B 登录加载完成前默认序不抢跑（无 A 序闪现）', JSON.stringify(b7early) === JSON.stringify(DEFAULT_ORDER), JSON.stringify(b7early.slice(0, 3)));
    await sleep(1800);
    const b7 = await navOrderOf(page);
    check('B8 串号修复核心：A 调序→退出→B 同页登录=默认序', JSON.stringify(b7) === JSON.stringify(DEFAULT_ORDER), JSON.stringify(b7.slice(0, 3)));

    // ---- B 退出 → A 再登录：自己的序 ----
    await logout(page);
    await login(page, EMAIL_A);
    const b9 = await navOrderOf(page);
    check('B9 A 再登录=自己的序（服务端偏好加载后应用）', JSON.stringify(b9) === JSON.stringify(aOrder), JSON.stringify(b9.slice(0, 3)));

    // ==================== C. BUG-079 回到今天主链路（真浏览器点击） ====================
    await page.click('.nav-item[data-page="attendance"]');
    await sleep(600);
    await page.evaluate(() => { document.querySelectorAll('#page-attendance .view-tab')[0].click(); }); // 日历视图
    await sleep(800);
    const c1 = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('#calendarView button')].find(b => b.getAttribute('onclick') === 'goToToday()');
      return btn ? btn.textContent.trim() : null;
    });
    check('C1 日历按钮文案=「回到今天」', c1 === '回到今天', `实际=${c1}`);
    await page.evaluate(() => changeMonth(2)); // 先翻走两个月
    await sleep(400);
    const before = await page.evaluate(() => document.getElementById('calendarMonth').textContent);
    await page.evaluate(() => { [...document.querySelectorAll('#calendarView button')].find(b => b.getAttribute('onclick') === 'goToToday()').click(); });
    await sleep(400);
    const after = await page.evaluate(() => document.getElementById('calendarMonth').textContent);
    const nowExp = new Date();
    const expMonth = `${nowExp.getFullYear()}年${nowExp.getMonth() + 1}月`;
    const afterNorm = after.replace(/\s/g, '');
    check('C2 点击「回到今天」日历回当月（主链路）', before !== after && afterNorm.includes(expMonth), `翻走=${before} → 回=${after}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'calendar-back-to-today-1366.png'), fullPage: false });
    await ctx.close();

    // ==================== D. REQ-115 面板减重（computed 断言，双壳 × 1920/1366） ====================
    // ---- D1 公开壳 1920（≥1400 面板态） ----
    const ctxP = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const pageP = await ctxP.newPage();
    watch(pageP, 'public1920');
    await pageP.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
    await pageP.waitForSelector('.data-public-body .dp-filterbar', { state: 'visible', timeout: 20000 });
    await sleep(1500);
    const d1 = await panelSnapshot(pageP, '.data-public-body');
    // Chrome 对定位元素 inset 返回使用值（bottom:auto 算不出 'auto' 字符串），减重改几何实证：
    // 内容放得下时面板底边距 viewport 底 >12px（不再拉满）；内容溢出时才贴 max-height（余量=12）
    const d1gap = d1 && (d1.innerH - d1.rectBottom);
    const d1notStretched = d1 && (d1.scrollH <= d1.clientH ? d1gap > 13 : Math.abs(d1gap - 12) < 1.5);
    check('D1 公开壳 1920：面板 fixed + 底部不拉满（height:auto 减重几何实证）+ 264px + z=10',
      d1 && d1.position === 'fixed' && d1notStretched && Math.abs(d1.width - 264) < 1 && d1.zIndex === '10',
      d1 && `pos=${d1.position} 底部余量=${d1gap.toFixed(1)} w=${d1.width} z=${d1.zIndex}`);
    check('D2 公开壳 1920：max-height=100vh−顶部偏移−底部余量（公式实测一致）',
      d1 && Math.abs(d1.maxHeight - (d1.innerH - d1.rectTop - 12)) < 2, d1 && `maxH=${d1.maxHeight} 期望≈${(d1.innerH - d1.rectTop - 12).toFixed(1)}`);
    const d1shrink = d1.scrollH <= d1.clientH ? d1.height < d1.maxHeight - 1 : Math.abs(d1.clientH - d1.maxHeight) < 2;
    check('D3 公开壳 1920：高度随内容收缩，超出 max-height 才内部滚动（overflow-y:auto）',
      d1 && d1shrink && d1.overflowY === 'auto',
      d1 && `h=${d1.height.toFixed(0)} maxH=${d1.maxHeight.toFixed(0)} scrollH=${d1.scrollH} clientH=${d1.clientH}（${d1.scrollH <= d1.clientH ? '收缩分支' : '溢出滚动分支'}）`);
    check('D4 公开壳 1920：框体四边闭合不裁切（四边框 1px + 圆角 + 底色）+ 底部余量守恒',
      d1 && ['bTop', 'bBottom', 'bLeft', 'bRight'].every(k => d1[k] === '1px') && parseFloat(d1.radius) >= 8 && d1.bg !== 'rgba(0, 0, 0, 0)' && d1.rectBottom <= d1.innerH - 12 + 1.5,
      d1 && `b=${d1.bTop}/${d1.bBottom}/${d1.bLeft}/${d1.bRight} r=${d1.radius} bottom余量=${(d1.innerH - d1.rectBottom).toFixed(1)}`);
    await pageP.screenshot({ path: path.join(SHOT_DIR, 'panel-public-1920.png'), fullPage: false });

    // ---- D2 登录壳 1920（#page-lootdrop 面板态） ----
    const pageL = await ctxP.newPage();
    watch(pageL, 'login1920');
    await pageL.goto(BASE, { waitUntil: 'networkidle' });
    await pageL.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
    await login(pageL, EMAIL_A);
    await pageL.click('.nav-item[data-page="lootdrop"]');
    await pageL.waitForSelector('#page-lootdrop .dp-filterbar', { state: 'visible', timeout: 20000 });
    await sleep(1500);
    const d5 = await panelSnapshot(pageL, '#page-lootdrop');
    const d5gap = d5 && (d5.innerH - d5.rectBottom);
    const d5notStretched = d5 && (d5.scrollH <= d5.clientH ? d5gap > 13 : Math.abs(d5gap - 12) < 1.5);
    check('D5 登录壳 1920：面板 fixed + 底部不拉满（减重几何实证）+ 264px + z=10',
      d5 && d5.position === 'fixed' && d5notStretched && Math.abs(d5.width - 264) < 1 && d5.zIndex === '10',
      d5 && `pos=${d5.position} 底部余量=${d5gap.toFixed(1)} w=${d5.width} z=${d5.zIndex}`);
    check('D6 登录壳 1920：max-height 公式实测一致 + 底部余量守恒',
      d5 && Math.abs(d5.maxHeight - (d5.innerH - d5.rectTop - 12)) < 2 && d5.rectBottom <= d5.innerH - 12 + 1.5,
      d5 && `maxH=${d5.maxHeight.toFixed(1)} bottom余量=${(d5.innerH - d5.rectBottom).toFixed(1)}`);
    const d5shrink = d5.scrollH <= d5.clientH ? d5.height < d5.maxHeight - 1 : Math.abs(d5.clientH - d5.maxHeight) < 2;
    check('D7 登录壳 1920：高度随内容收缩/超出才内部滚动 + 卡片区让位 292 不动',
      d5 && d5shrink && d5.overflowY === 'auto' && Math.abs(parseFloat(d5.marginRightMain) - 292) < 1,
      d5 && `h=${d5.height.toFixed(0)} maxH=${d5.maxHeight.toFixed(0)} mainMR=${d5.marginRightMain}（${d5.scrollH <= d5.clientH ? '收缩分支' : '溢出滚动分支'}）`);
    await pageL.screenshot({ path: path.join(SHOT_DIR, 'panel-login-1920.png'), fullPage: false });
    await ctxP.close();

    // ---- D3 双壳 1366（<1400 折叠顶栏态零回退） ----
    const ctxM = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageM = await ctxM.newPage();
    watch(pageM, 'public1366');
    await pageM.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
    await pageM.waitForSelector('.data-public-body .dp-filterbar', { state: 'visible', timeout: 20000 });
    await sleep(1200);
    const d8 = await pageM.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.data-public-body .dp-filterbar'));
      return { position: cs.position, maxWidth: cs.maxWidth };
    });
    check('D8 公开壳 1366：折叠顶栏态零回退（sticky 吸顶不动，非 fixed 面板）',
      d8.position === 'sticky', `pos=${d8.position}`);
    await pageM.screenshot({ path: path.join(SHOT_DIR, 'topbar-public-1366.png'), fullPage: false });

    const pageM2 = await ctxM.newPage();
    watch(pageM2, 'login1366');
    await pageM2.goto(BASE, { waitUntil: 'networkidle' });
    await pageM2.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
    await login(pageM2, EMAIL_A);
    await pageM2.click('.nav-item[data-page="lootdrop"]');
    await pageM2.waitForSelector('#page-lootdrop .dp-filterbar', { state: 'visible', timeout: 20000 });
    await sleep(1200);
    const d9 = await pageM2.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('#page-lootdrop .dp-filterbar'));
      return { position: cs.position, top: cs.top };
    });
    check('D9 登录壳 1366：折叠顶栏态零回退（sticky top=56 让开 topbar）',
      d9.position === 'sticky' && parseFloat(d9.top) === 56, `pos=${d9.position} top=${d9.top}`);
    await pageM2.screenshot({ path: path.join(SHOT_DIR, 'topbar-login-1366.png'), fullPage: false });
    await ctxM.close();

    const realErrors = pageErrors.filter(e => !e.includes('status of 406') && !e.includes('status of 409'));
    check('全程零 JS 报错（406/409 噪音另行列示）', realErrors.length === 0, realErrors.join(' | ') || '无');
    check('全程零 404', notFounds.length === 0, notFounds.join(' | ') || '无');
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#44 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => {
  console.error('[验证脚本异常]', e);
  try { await cleanup(); } catch {}
  process.exit(1);
});
