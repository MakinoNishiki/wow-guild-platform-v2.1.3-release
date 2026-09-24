// 任务书 #59 WP1（门户化 IA 骨架）真浏览器验收——验证代理自建脚本，不触碰产品源码
// 前置：node server.js 已在 :18659 运行；verify-task59-wp1-setup.js setup 已建测试用户
// 用法: node scripts/verify-task59-wp1.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT = path.join(ROOT, 'backup', '2026-09-24-task59-wp1');
const BASE = 'http://127.0.0.1:18659';
const CTX = JSON.parse(fs.readFileSync(path.join(__dirname, '.task59-wp1-ctx.json'), 'utf8'));
const VID_TAB = 'wp1-verify-tab-' + Date.now();
const VID_PUB = 'wp1-verify-pub-' + Date.now();

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB_URL = env.SUPABASE_URL.replace(/\/+$/, '');
const SVC = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };

const results = [];
const consoleErrors = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' —— ' + detail : ''}`);
}
function watchConsole(page, tag) {
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push({ ctx: tag, type: 'console.error', text: msg.text().slice(0, 300) });
  });
  page.on('pageerror', err => consoleErrors.push({ ctx: tag, type: 'pageerror', text: String(err).slice(0, 300) }));
}
async function shot(page, name) {
  const p = path.join(SHOT, name);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function hashIs(page, expected, timeout = 8000) {
  try {
    await page.waitForFunction(h => location.hash === h, expected, { timeout });
    return true;
  } catch { return false; }
}
async function pageActive(page, id) {
  return page.evaluate(pid => {
    const el = document.getElementById(pid);
    return !!(el && el.classList.contains('active'));
  }, id);
}
async function visible(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }, selector);
}
async function login(page, email) {
  await page.click('#iaLoginBtn');
  await page.waitForSelector('#authOverlay', { state: 'visible' });
  await page.fill('#authEmail', email);
  await page.fill('#authPassword', CTX.pwd);
  await page.click('#authLoginBtn');
  await page.waitForFunction(() => {
    const o = document.getElementById('authOverlay');
    return o && getComputedStyle(o).display === 'none';
  }, null, { timeout: 30000 });
}
async function svcGet(p) {
  const r = await fetch(`${SB_URL}${p}`, { headers: SVC });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function svcDel(p) {
  const r = await fetch(`${SB_URL}${p}`, { method: 'DELETE', headers: SVC });
  return r.status;
}

(async () => {
  const browser = await chromium.launch();

  // ============ 1A. 游客三态走查 ============
  console.log('\n===== 1A 游客态 =====');
  const ctxG = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const pg = await ctxG.newPage();
  watchConsole(pg, 'guest');
  await pg.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  check('游客 / 落地 hash=#/home', await hashIs(pg, '#/home'), '实际=' + await pg.evaluate(() => location.hash));
  await pg.waitForSelector('#page-home.active .home-entry-card', { timeout: 15000 });
  check('游客 home: hero+双入口卡', (await pg.locator('#page-home .home-entry-card').count()) === 2);
  check('游客 home: 无需登录快捷行', await visible(pg, '#page-home .home-quick'));
  check('游客 home: QQ 悬浮钮显示', await visible(pg, '#homeQqFloat'));
  check('游客 home: 右上登录/注册按钮', await visible(pg, '#iaLoginBtn'));
  check('游客 home: 用户中心按钮隐藏', !(await visible(pg, '#iaUserCenterBtn')));
  await shot(pg, '01-guest-home.png');

  // ---- 2. QQ 悬浮钮两态（先于任何家宅页访问——全新会话首页无方案单抽屉钮遮挡） ----
  console.log('\n===== 2 QQ 悬浮钮（全新会话首页） =====');
  check('QQ 默认态浮层隐藏', !(await visible(pg, '.home-qq-pop')));
  await shot(pg, '08-qq-default.png');
  await pg.hover('.home-qq-btn');
  await sleep(300);
  check('QQ hover 浮层可见', await visible(pg, '.home-qq-pop'));
  check('QQ 浮层含群号', (await pg.locator('.home-qq-num').textContent().catch(() => '')).includes('1104273954'));
  check('QQ 浮层含二维码图', await visible(pg, '.home-qq-qr img'));
  await shot(pg, '09-qq-hover.png');
  await pg.mouse.move(800, 450); // 移开复位

  await pg.click('button[data-ia-tab="house"]');
  check('游客 点家宅房屋 tab → #/house/decor', await hashIs(pg, '#/house/decor'));
  await pg.waitForSelector('#page-decor .dh-card', { timeout: 90000 });
  const cardCount = await pg.locator('#page-decor .dh-card').count();
  check('游客 图鉴 anon 渲染出卡片', cardCount > 0, `卡片数=${cardCount}`);
  check('游客 图鉴: QQ 钮已隐藏', !(await visible(pg, '#homeQqFloat')));
  await shot(pg, '02-guest-house-decor.png');

  await pg.click('button[data-ia-key="decor-plan"]');
  check('游客 点方案单 pill → #/house/plan', await hashIs(pg, '#/house/plan'));
  await pg.waitForSelector('#page-decor-plan.active .dh-pp', { timeout: 30000 });
  await shot(pg, '03-guest-house-plan.png');

  await pg.click('button[data-ia-key="community"]');
  check('游客 点社区 pill → #/house/community', await hashIs(pg, '#/house/community'));
  check('游客 社区占位卡渲染', await pageActive(pg, 'page-community'));
  await shot(pg, '04-guest-community.png');

  await pg.click('button[data-ia-tab="team"]');
  check('游客 点团队管理 tab → #/team', await hashIs(pg, '#/team'));
  check('游客 team-guide 引导卡 active', await pageActive(pg, 'page-team-guide'));
  check('游客 引导卡游客行(登录/注册)显示', await visible(pg, '#iaGuideGuestRow'));
  check('游客 引导卡无公会行隐藏', !(await visible(pg, '#iaGuideNoguildRow')));
  check('游客 团队 subnav 显示', await visible(pg, '#iaSubnavTeam'));
  await shot(pg, '05-guest-team-guide.png');

  await pg.evaluate(() => { location.hash = '#/team/members'; });
  await sleep(600);
  check('游客 直开 #/team/members hash 保持不改写', await pg.evaluate(() => location.hash) === '#/team/members');
  check('游客 #/team/members 守卫落引导卡', await pageActive(pg, 'page-team-guide'));
  await shot(pg, '06-guest-team-members-guard.png');

  await pg.evaluate(() => { location.hash = '#/team/lootdrop'; });
  await sleep(600);
  check('游客 直开 #/team/lootdrop hash 保持', await pg.evaluate(() => location.hash) === '#/team/lootdrop');
  await pg.waitForSelector('#page-lootdrop.active .dp-item', { timeout: 60000 });
  check('游客 副本掉落放行渲染', (await pg.locator('#page-lootdrop .dp-item').count()) > 0);
  await shot(pg, '07-guest-lootdrop.png');

  // ============ 2b. BUG 取证：浏览过家宅页后回 #/home，方案单抽屉钮与 QQ 钮同角重叠 ============
  console.log('\n===== 2b QQ/方案单抽屉钮重叠取证 =====');
  await pg.evaluate(() => { location.hash = '#/home'; });
  await sleep(500);
  const overlap = await pg.evaluate(() => {
    const qq = document.querySelector('#homeQqFloat .home-qq-btn');
    const tg = document.getElementById('dhPlanToggle');
    if (!qq || !tg) return { qqVisible: !!qq, toggleExists: !!tg };
    const a = qq.getBoundingClientRect(), b = tg.getBoundingClientRect();
    const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    // 指针命中最顶元素
    const top = document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2);
    return {
      toggleExists: true,
      qqRect: { x: Math.round(a.x), y: Math.round(a.y), w: Math.round(a.width), h: Math.round(a.height) },
      toggleRect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
      overlapArea: Math.round(ix * iy),
      hitAtQqCenter: top ? (top.id || top.className || top.tagName) : null,
    };
  });
  console.log('  [重叠取证] ' + JSON.stringify(overlap));
  check('BUG取证: 浏览家宅页后回首页 QQ 钮与抽屉钮同角重叠且指针被抽屉钮拦截',
    !!(overlap && overlap.toggleExists && overlap.overlapArea > 0 && !String(overlap.hitAtQqCenter).includes('home-qq')),
    `重叠面积=${overlap && overlap.overlapArea}px², QQ中心命中=${overlap && overlap.hitAtQqCenter}`);
  await shot(pg, '24-bug-qq-plan-toggle-overlap.png');
  let hoverBlocked = false;
  try { await pg.hover('.home-qq-btn', { timeout: 3000 }); } catch { hoverBlocked = true; }
  check('BUG取证: 此状态下 hover QQ 钮被 actionable 拦截', hoverBlocked, hoverBlocked ? 'hover 超时（被 #dhPlanToggle 拦截）' : 'hover 意外成功');

  // ============ 1B. 登录无公会（用户 B） ============
  console.log('\n===== 1B 用户B（无公会） =====');
  const ctxB = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const pb = await ctxB.newPage();
  watchConsole(pb, 'userB');
  await pb.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await hashIs(pb, '#/home');
  await pb.waitForSelector('#iaLoginBtn', { state: 'visible', timeout: 15000 });
  await login(pb, 'wp1-b@example.com');
  await sleep(1200);
  check('用户B 登录后落 #/home', await pb.evaluate(() => location.hash) === '#/home', '实际=' + await pb.evaluate(() => location.hash));
  check('用户B 登录后用户中心按钮显示', await visible(pb, '#iaUserCenterBtn'));
  await shot(pb, '10-userB-home.png');
  await pb.click('button[data-ia-tab="team"]');
  await sleep(400);
  check('用户B 团队 tab 落引导卡', await pageActive(pb, 'page-team-guide'));
  check('用户B 引导卡无公会行(加入/创建公会)显示', await visible(pb, '#iaGuideNoguildRow'));
  check('用户B 引导卡游客行隐藏', !(await visible(pb, '#iaGuideGuestRow')));
  await shot(pb, '11-userB-team-guide.png');
  await pb.click('#iaGuideNoguildRow button');
  await pb.waitForSelector('#authOverlay', { state: 'visible' });
  check('用户B 点加入/创建公会 → 公会表单遮罩打开', await visible(pb, '#authGuildForm'));
  await shot(pb, '12-userB-guild-form.png');
  await pb.reload({ waitUntil: 'domcontentloaded' }); // 关遮罩收尾

  // ============ 1C. 公会成员（用户 A） ============
  console.log('\n===== 1C 用户A（公会 owner） =====');
  const ctxA = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const pa = await ctxA.newPage();
  watchConsole(pa, 'userA');
  await pa.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await hashIs(pa, '#/home');
  await pa.waitForSelector('#iaLoginBtn', { state: 'visible', timeout: 15000 });
  await login(pa, 'wp1-a@example.com');
  const aLoginHash = await pa.evaluate(() => location.hash);
  console.log(`  [用户A] 游客态浏览后登录落地 hash=${aLoginHash}（设计注释="当前 hash 有效则尊重"；空 hash 默认分支见下条）`);
  check('用户A 游客浏览后登录：停留 #/home（hash 尊重现状记录）', aLoginHash === '#/home');
  // 空 hash 默认分支实证：同会话直开无 hash 根路径（会话恢复等价路径）
  await pa.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  check('用户A 空 hash 落地 #/team/dashboard', await hashIs(pa, '#/team/dashboard', 15000), '实际=' + await pa.evaluate(() => location.hash));
  await pa.waitForSelector('#page-dashboard.active', { timeout: 15000 });
  check('用户A 仪表盘渲染', await visible(pa, '#page-dashboard .stats-grid'));
  check('用户A 数据中心 pill 对非超管隐藏', !(await visible(pa, '#iaPillDatacenter')));
  await shot(pa, '13-userA-dashboard.png');

  const pillTour = [
    { key: 'members', pageId: 'page-members', shot: '14-userA-members.png' },
    { key: 'attendance', pageId: 'page-attendance' },
    { key: 'loot', pageId: 'page-loot', shot: '15-userA-loot.png' },
    { key: 'wishlist', pageId: 'page-wishlist' },
    { key: 'reports', pageId: 'page-reports' },
    { key: 'data', pageId: 'page-data' },
    { key: 'lootdrop', pageId: 'page-lootdrop', shot: '16-userA-lootdrop.png', wait: '#page-lootdrop .dp-item' },
    { key: 'changelog', pageId: 'page-changelog' },
  ];
  for (const t of pillTour) {
    await pa.click(`button[data-ia-key="${t.key}"]`);
    const okHash = await hashIs(pa, '#/team/' + t.key);
    if (t.wait) await pa.waitForSelector(t.wait, { timeout: 60000 }).catch(() => {});
    await sleep(500);
    const okActive = await pageActive(pa, t.pageId);
    check(`用户A pill ${t.key} 可达`, okHash && okActive, `hash=${okHash} active=${okActive}`);
    if (t.shot) await shot(pa, t.shot);
  }

  // ============ 3. tab_click 入库实证 ============
  console.log('\n===== 3 tab_click 埋点 =====');
  const ctxT = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await ctxT.addInitScript(vid => { try { localStorage.setItem('wb_vid', vid); } catch (e) {} }, VID_TAB);
  const pt = await ctxT.newPage();
  watchConsole(pt, 'track');
  await pt.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await hashIs(pt, '#/home');
  await pt.waitForSelector('#iaTopbar', { timeout: 15000 });
  await pt.click('button[data-ia-tab="house"]'); // level:1 house
  await sleep(300);
  await pt.click('button[data-ia-key="decor"]'); // level:2 decor
  await sleep(300);
  await pt.click('button[data-ia-tab="team"]'); // level:1 team
  await sleep(300);
  await pt.click('button[data-ia-key="members"]'); // level:2 members（守卫落引导卡也发）
  await sleep(2500); // 等 sendBeacon 落库
  const evRows = await svcGet(`/rest/v1/analytics_events?vid=eq.${VID_TAB}&event=eq.tab_click&select=props,page`);
  const combos = new Set((Array.isArray(evRows.body) ? evRows.body : []).map(r => `L${r.props && r.props.level}:${r.props && r.props.key}`));
  const need = ['L1:team', 'L1:house', 'L2:decor', 'L2:members'];
  check('tab_click 入库 ≥4 行', Array.isArray(evRows.body) && evRows.body.length >= 4, `行数=${Array.isArray(evRows.body) ? evRows.body.length : '查询失败:' + JSON.stringify(evRows.body).slice(0, 120)}`);
  check('tab_click props 覆盖四组合', need.every(n => combos.has(n)), '实得=' + [...combos].join(','));
  const pvRows = await svcGet(`/rest/v1/analytics_events?vid=eq.${VID_TAB}&event=eq.page_view&select=page`);
  console.log(`  [埋点] vid=${VID_TAB} tab_click=${Array.isArray(evRows.body) ? evRows.body.length : 0} 行, page_view=${Array.isArray(pvRows.body) ? pvRows.body.length : 0} 行, props=${[...combos].join(' | ')}`);
  const delTab = await svcDel(`/rest/v1/analytics_events?vid=eq.${VID_TAB}`);
  const leftTab = await svcGet(`/rest/v1/analytics_events?vid=eq.${VID_TAB}&select=id`);
  check('tab_click 测试行清理', delTab < 300 && Array.isArray(leftTab.body) && leftTab.body.length === 0, `DELETE status=${delTab}`);

  // ============ 4. D2 红线回归（组单→保存登录墙→登录→草稿不丢） ============
  console.log('\n===== 4 D2 红线回归 =====');
  const ctxD = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const pd = await ctxD.newPage();
  watchConsole(pd, 'd2');
  await pd.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await hashIs(pd, '#/home');
  await pd.click('button[data-ia-tab="house"]');
  await pd.waitForSelector('#page-decor .dh-card [data-add]', { timeout: 90000 });
  const addBtn = pd.locator('#page-decor .dh-card [data-add]').first();
  const rid = await addBtn.getAttribute('data-add');
  await addBtn.click();
  await sleep(400);
  const draft = await pd.evaluate(() => localStorage.getItem('wb_decor_plan_draft'));
  check('D2 加入方案单 → 草稿 localStorage 有内容', !!draft && draft.includes(rid), `record_id=${rid}`);
  await pd.click('button[data-ia-key="decor-plan"]');
  await pd.waitForSelector('#page-decor-plan.active .dh-pp', { timeout: 30000 });
  const totalBefore = await pd.locator('#dhPpTotal').textContent();
  check('D2 方案单页组单件数(登录前)=1', String(totalBefore).trim() === '1', '实际=' + totalBefore);
  await shot(pd, '17-d2-plan-guest.png');
  // 抽屉 → 保存 → 登录墙 toast
  await pd.click('#dhPlanToggle');
  await pd.click('#dhPlanSave');
  await pd.waitForSelector('#dhPlanToast.show', { timeout: 5000 });
  const toastText = await pd.locator('#dhPlanToast').textContent();
  check('D2 未登录保存 → 登录墙 toast', toastText.includes('保存方案单需要登录'), '文案=' + toastText);
  await shot(pd, '18-d2-save-toast.png');
  // 900ms 后跳 index.html（#58 既有行为）——记录实际行为
  await pd.waitForLoadState('domcontentloaded').catch(() => {});
  await sleep(2500);
  const afterSaveHash = await pd.evaluate(() => location.hash);
  console.log(`  [D2] 保存提示后跳转落地 hash=${afterSaveHash || '(空)'} url=${pd.url()}`);
  // 登录用户 A
  await pd.waitForSelector('#iaLoginBtn', { state: 'visible', timeout: 20000 });
  await hashIs(pd, '#/home').catch(() => {});
  await login(pd, 'wp1-a@example.com');
  await sleep(1500);
  const afterLoginHash = await pd.evaluate(() => location.hash);
  console.log(`  [D2] 登录后落地 hash=${afterLoginHash}（记录实际行为：${afterLoginHash === '#/house/plan' ? '自动回方案单页' : '未自动回，需手动导航'}）`);
  if (afterLoginHash !== '#/house/plan') {
    await pd.evaluate(() => { location.hash = '#/house/plan'; });
  }
  await pd.waitForSelector('#page-decor-plan.active .dh-pp', { timeout: 60000 });
  await sleep(800);
  const totalAfter = await pd.locator('#dhPpTotal').textContent().catch(() => '(无)');
  check('D2 登录后组单件数与登录前一致', String(totalAfter).trim() === String(totalBefore).trim(), `前=${totalBefore} 后=${totalAfter}`);
  const notice = await pd.locator('.dh-pp-notice').textContent().catch(() => '');
  console.log(`  [D2] 登录后方案单提示条=${notice || '(无)'}`);
  await shot(pd, '19-d2-plan-after-login.png');

  // ============ 5. 旧 hash 兼容 ============
  console.log('\n===== 5 旧 hash 兼容 =====');
  const ctxL = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const pl = await ctxL.newPage();
  watchConsole(pl, 'legacy');
  await pl.goto(BASE + '/#page-decor', { waitUntil: 'domcontentloaded' });
  check('旧 hash #page-decor → #/house/decor', await hashIs(pl, '#/house/decor', 10000), '实际=' + await pl.evaluate(() => location.hash));
  await pl.waitForSelector('#page-decor .dh-card', { timeout: 90000 });
  check('旧 hash 重定向后图鉴渲染', (await pl.locator('#page-decor .dh-card').count()) > 0);
  await shot(pl, '20-legacy-decor.png');
  await pl.goto(BASE + '/#page-dashboard', { waitUntil: 'domcontentloaded' });
  check('旧 hash #page-dashboard(游客) → #/team/dashboard', await hashIs(pl, '#/team/dashboard', 10000), '实际=' + await pl.evaluate(() => location.hash));
  await sleep(600);
  check('游客 #/team/dashboard 守卫落引导卡且 hash 保持', (await pageActive(pl, 'page-team-guide')) && (await pl.evaluate(() => location.hash)) === '#/team/dashboard');
  await shot(pl, '21-legacy-dashboard-guard.png');

  // ============ 6. 公示壳回归 ============
  console.log('\n===== 6 公示壳回归 =====');
  const ctxP = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await ctxP.addInitScript(vid => { try { localStorage.setItem('wb_vid', vid); } catch (e) {} }, VID_PUB);
  const pp = await ctxP.newPage();
  watchConsole(pp, 'public');
  await pp.goto(BASE + '/decor.html', { waitUntil: 'domcontentloaded' });
  await pp.waitForSelector('.dh-card', { timeout: 90000 });
  check('decor.html 公示壳渲染', (await pp.locator('.dh-card').count()) > 0);
  await shot(pp, '22-public-decor.png');
  await pp.goto(BASE + '/data.html', { waitUntil: 'domcontentloaded' });
  await pp.waitForSelector('.dp-item', { timeout: 90000 });
  check('data.html 公示壳渲染', (await pp.locator('.dp-item').count()) > 0);
  await shot(pp, '23-public-data.png');
  await sleep(2000);
  const pubPv = await svcGet(`/rest/v1/analytics_events?vid=eq.${VID_PUB}&event=eq.page_view&select=page`);
  const pubPages = new Set((Array.isArray(pubPv.body) ? pubPv.body : []).map(r => r.page));
  check('公示壳 page_view 旧口径入库 (decor+data)', pubPages.has('decor') && pubPages.has('data'), '实得=' + [...pubPages].join(','));
  const delPub = await svcDel(`/rest/v1/analytics_events?vid=eq.${VID_PUB}`);
  const leftPub = await svcGet(`/rest/v1/analytics_events?vid=eq.${VID_PUB}&select=id`);
  check('公示壳测试行清理', delPub < 300 && Array.isArray(leftPub.body) && leftPub.body.length === 0, `DELETE status=${delPub}`);

  await browser.close();

  // ============ 汇总 ============
  console.log('\n===== console 错误清单 =====');
  if (!consoleErrors.length) console.log('(全程零 console.error / pageerror)');
  consoleErrors.forEach(e => console.log(`[${e.ctx}] ${e.type}: ${e.text}`));

  const failed = results.filter(r => !r.ok);
  console.log(`\n===== 任务书 #59 WP1 验收: ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) { failed.forEach(f => console.log('失败项: ' + f.name)); process.exit(1); }
})().catch(e => { console.error('验收脚本异常:', e); process.exit(2); });
