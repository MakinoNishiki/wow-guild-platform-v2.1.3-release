// 任务书 #59 WP2（注册解耦 + 引导卡正式版 + auth=login 唤醒）真浏览器验收——验证代理自建脚本
// 前置：node server.js @18659；verify-task59-wp2-setup.js setup 已跑
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT = path.join(ROOT, 'backup', '2026-09-24-task59-wp1');
const BASE = 'http://127.0.0.1:18659';
const CTX_PATH = path.join(__dirname, '.task59-wp2-ctx.json');
const CTX = JSON.parse(fs.readFileSync(CTX_PATH, 'utf8'));
const TS = Date.now();
const VID_REG = 'wp2-verify-reg-' + TS;
const REG_EMAIL = `wp2-reg-${TS}@example.com`;
const REG_PWD = 'Wp2reg2026abc';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const SVC = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

const results = [];
const consoleErrors = [];
const notFoundUrls = new Set();
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' —— ' + detail : ''}`);
}
function watch(page, tag) {
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push({ ctx: tag, text: m.text().slice(0, 200) }); });
  page.on('pageerror', e => consoleErrors.push({ ctx: tag, text: 'pageerror: ' + String(e).slice(0, 200) }));
  page.on('response', r => {
    if (r.status() === 404) notFoundUrls.add(r.url().replace(/^https?:\/\/[^/]+/, ''));
    else if (r.status() >= 400) consoleErrors.push({ ctx: tag, text: `HTTP ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 160)}` });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function shot(page, name) { await page.screenshot({ path: path.join(SHOT, name) }); }
async function hashIs(page, h, timeout = 10000) {
  try { await page.waitForFunction(x => location.hash === x, h, { timeout }); return true; } catch { return false; }
}
async function pageActive(page, id) {
  return page.evaluate(pid => { const el = document.getElementById(pid); return !!(el && el.classList.contains('active')); }, id);
}
async function visible(page, sel) {
  return page.evaluate(s => { const el = document.querySelector(s); if (!el) return false; const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; }, sel);
}
async function login(page, email, pwd) {
  await page.click('#iaLoginBtn');
  await page.waitForSelector('#authOverlay', { state: 'visible' });
  await page.fill('#authEmail', email);
  await page.fill('#authPassword', pwd || CTX.pwd);
  await page.click('#authLoginBtn');
  await page.waitForFunction(() => {
    const o = document.getElementById('authOverlay');
    return o && getComputedStyle(o).display === 'none';
  }, null, { timeout: 30000 });
  await sleep(800);
}
async function svcGet(p) { const r = await fetch(`${SB}${p}`, { headers: SVC }); return { status: r.status, body: await r.json().catch(() => null) }; }
async function svcDel(p) { const r = await fetch(`${SB}${p}`, { method: 'DELETE', headers: SVC }); return r.status; }

(async () => {
  const browser = await chromium.launch();
  const VP = { viewport: { width: 1600, height: 900 } };

  // ============ 1+2. UI 真注册 → 落 #/home → 引导卡无公会版 → 邀请码链路 ============
  console.log('\n===== 1 注册解耦实测 =====');
  const ctx1 = await browser.newContext(VP);
  await ctx1.addInitScript(v => { try { localStorage.setItem('wb_vid', v); } catch (e) {} }, VID_REG);
  const p1 = await ctx1.newPage();
  watch(p1, 'reg');
  await p1.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await hashIs(p1, '#/home');
  await p1.waitForSelector('#iaLoginBtn', { state: 'visible', timeout: 15000 });
  await p1.click('#iaLoginBtn');
  await p1.waitForSelector('#authLoginForm', { state: 'visible' });
  await p1.click('text=立即注册');
  await p1.waitForSelector('#authRegisterForm', { state: 'visible' });
  await p1.fill('#regDisplayName', 'wp2-reg');
  await p1.fill('#regEmail', REG_EMAIL);
  await p1.fill('#regPassword', REG_PWD);
  await sleep(400); // 等强度门禁解锁按钮
  await shot(p1, 'wp2-01-register-form.png');
  const regBtnDisabled = await p1.evaluate(() => document.getElementById('authRegisterBtn').disabled);
  check('注册按钮强度门禁放行', !regBtnDisabled);
  await p1.click('#authRegisterBtn');
  // 双分支等待：有 session → 遮罩关闭落 #/home；无 session（邮件确认开）→ 遮罩仍在（BUG-045 既有行为）
  let needConfirm = false;
  try {
    await p1.waitForFunction(() => {
      const o = document.getElementById('authOverlay');
      return o && getComputedStyle(o).display === 'none';
    }, null, { timeout: 25000 });
  } catch { needConfirm = true; }
  if (needConfirm) {
    console.log('  [注册] signUp 无 session（邮件确认开启），走 admin 补确认后 UI 登录（如实记录）');
    const su = await fetch(`${SB}/auth/v1/admin/users?per_page=50&page=1`, { headers: SVC });
    const list = await su.json();
    const u = (list.users || []).find(x => x.email === REG_EMAIL);
    if (u) await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: 'PUT', headers: SVC, body: JSON.stringify({ email_confirm: true }) });
    await login(p1, REG_EMAIL, REG_PWD);
  }
  check('注册后不出现公会表单遮罩', !(await visible(p1, '#authGuildForm')) && !(await visible(p1, '#authOverlay')));
  check('注册后落 #/home', await p1.evaluate(() => location.hash) === '#/home', '实际=' + await p1.evaluate(() => location.hash));
  check('注册后右上用户中心按钮显示', await visible(p1, '#iaUserCenterBtn'));
  check('注册后 iaLoginBtn 隐藏', !(await visible(p1, '#iaLoginBtn')));
  check('注册后首页渲染', await pageActive(p1, 'page-home'));
  await shot(p1, 'wp2-02-register-home.png');

  console.log('\n===== 1b 引导卡无公会版（注册账号） =====');
  await p1.click('button[data-ia-tab="team"]');
  await hashIs(p1, '#/team');
  check('无公会版: team-guide 落卡', await pageActive(p1, 'page-team-guide'));
  check('无公会版: 登录行隐藏', !(await visible(p1, '#iaGuideGuestRow')));
  const nog = await p1.evaluate(() => {
    const code = document.getElementById('iaGuideInviteCode');
    const join = document.getElementById('iaGuideJoinBtn');
    const create = document.getElementById('iaGuideCreateBtn');
    return { codeDisabled: code.disabled, joinDisabled: join.disabled, createDisabled: create.disabled, joinVisible: !!join.offsetParent, codePh: code.placeholder };
  });
  check('无公会版: 三控件可用', !nog.codeDisabled && !nog.joinDisabled && !nog.createDisabled, JSON.stringify(nog));
  await shot(p1, 'wp2-03-guide-noguild.png');

  console.log('\n===== 2 邀请码加入链路 =====');
  // 错码先行
  await p1.fill('#iaGuideInviteCode', 'ZZZZZZZZ');
  await p1.click('#iaGuideJoinBtn');
  await p1.waitForSelector('#toastContainer .toast.error', { timeout: 10000 });
  const errToast = await p1.locator('#toastContainer .toast.error').first().textContent();
  check('错码 toast 报错', (errToast || '').includes('邀请码无效'), '文案=' + errToast);
  await shot(p1, 'wp2-04-join-wrong-toast.png');
  await sleep(300);
  const btnReset = await p1.evaluate(() => { const b = document.getElementById('iaGuideJoinBtn'); return { disabled: b.disabled, text: b.textContent }; });
  check('错码后按钮忙态复位', !btnReset.disabled && btnReset.text === '加入公会', JSON.stringify(btnReset));
  check('错码不落库（仍无公会，留在引导卡）', await pageActive(p1, 'page-team-guide'));
  // 正码
  await p1.fill('#iaGuideInviteCode', CTX.invite);
  await p1.click('#iaGuideJoinBtn');
  check('正码加入落 #/team/dashboard', await hashIs(p1, '#/team/dashboard', 20000), '实际=' + await p1.evaluate(() => location.hash));
  await p1.waitForSelector('#page-dashboard.active .stats-grid', { timeout: 15000 });
  check('加入后仪表盘渲染', true);
  await shot(p1, 'wp2-05-join-success-dashboard.png');

  // ============ 3. 引导卡游客版 ============
  console.log('\n===== 3 引导卡游客版 =====');
  const ctx2 = await browser.newContext(VP);
  const p2 = await ctx2.newPage();
  watch(p2, 'guest-guide');
  await p2.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await hashIs(p2, '#/home');
  await p2.click('button[data-ia-tab="team"]');
  await hashIs(p2, '#/team');
  await p2.waitForSelector('#page-team-guide.active', { timeout: 10000 });
  check('游客版: 登录行显示(登录后可加入或创建公会)', await visible(p2, '#iaGuideGuestRow') && (await p2.locator('#iaGuideGuestRow').textContent()).includes('登录后可加入或创建公会'));
  const gst = await p2.evaluate(() => {
    const code = document.getElementById('iaGuideInviteCode');
    const join = document.getElementById('iaGuideJoinBtn');
    const create = document.getElementById('iaGuideCreateBtn');
    return {
      codeDisabled: code.disabled, codeTitle: code.title,
      joinDisabled: join.disabled, joinTitle: join.title,
      createDisabled: create.disabled, createTitle: create.title,
    };
  });
  check('游客版: 三控件 disabled + title', gst.codeDisabled && gst.joinDisabled && gst.createDisabled && gst.codeTitle === '登录后可加入' && gst.createTitle === '登录后可创建', JSON.stringify(gst));
  // 主:次视觉权重同框（截图可判）+ 结构化断言：主卡=bordered 区块+primary 金钮；创建=ghost（非 primary、背景透明）
  const weight = await p2.evaluate(() => {
    const join = document.getElementById('iaGuideJoinBtn');
    const create = document.getElementById('iaGuideCreateBtn');
    return {
      joinPrimary: join.className.includes('btn-primary'),
      createPrimary: create.className.includes('btn-primary'),
      joinGradient: getComputedStyle(join).backgroundImage.includes('gradient'), // btn-primary 金渐变
      createBg: getComputedStyle(create).backgroundColor, // ghost 应透明/深色
      createColor: getComputedStyle(create).color,
      joinRowW: Math.round(document.querySelector('.ia-guide-join-row').getBoundingClientRect().width),
      createW: Math.round(create.getBoundingClientRect().width),
    };
  });
  console.log('  [权重量化] ' + JSON.stringify(weight));
  check('游客版: 主次权重结构（主卡 primary 金渐变钮，创建钮非 primary）', weight.joinPrimary && !weight.createPrimary && weight.joinGradient, JSON.stringify(weight));
  if (weight.createBg !== 'rgba(0, 0, 0, 0)') console.log('  [观察] 创建钮非真 ghost（无 btn-ghost 类），实底 ' + weight.createBg + '（.btn 基座 --bg-tertiary）——名实不符记入报告');
  await shot(p2, 'wp2-06-guide-guest.png');

  // ============ 4. 成员永不见卡 ============
  console.log('\n===== 4 成员永不见卡 =====');
  const ctx3 = await browser.newContext(VP);
  const p3 = await ctx3.newPage();
  watch(p3, 'member');
  await p3.goto(BASE + '/#/team', { waitUntil: 'domcontentloaded' });
  await p3.waitForSelector('#iaLoginBtn', { state: 'visible', timeout: 15000 });
  await login(p3, 'wp2-owner@example.com');
  check('有公会直开 #/team → replace #/team/dashboard', await hashIs(p3, '#/team/dashboard', 15000), '实际=' + await p3.evaluate(() => location.hash));
  await p3.waitForSelector('#page-dashboard.active', { timeout: 15000 });
  await shot(p3, 'wp2-07-member-team-replace.png');
  await p3.goto(BASE + '/#/team/members', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  check('有公会直开 #/team/members → 成员页渲染(非引导卡)', await pageActive(p3, 'page-members') && !(await pageActive(p3, 'page-team-guide')));
  await shot(p3, 'wp2-08-member-members.png');

  // ============ 5. D2 往返回归（登录腿 + auth=login 唤醒） ============
  console.log('\n===== 5 D2 登录腿 =====');
  const ctx4 = await browser.newContext(VP);
  const p4 = await ctx4.newPage();
  watch(p4, 'd2');
  await p4.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await hashIs(p4, '#/home');
  await p4.click('button[data-ia-tab="house"]');
  await p4.waitForSelector('#page-decor .dh-card [data-add]', { timeout: 90000 });
  const addBtns = p4.locator('#page-decor .dh-card [data-add]');
  await addBtns.nth(0).click();
  await sleep(300);
  await addBtns.nth(1).click();
  await sleep(400);
  await p4.click('button[data-ia-key="decor-plan"]');
  await p4.waitForSelector('#page-decor-plan.active .dh-pp', { timeout: 30000 });
  const totalBefore = (await p4.locator('#dhPpTotal').textContent()).trim();
  check('D2 组单 2 件(登录前)', totalBefore === '2', '实际=' + totalBefore);
  await p4.click('#dhPlanToggle');
  await p4.click('#dhPlanSave');
  await p4.waitForSelector('#dhPlanToast.show', { timeout: 5000 });
  check('D2 未登录保存 toast', (await p4.locator('#dhPlanToast').textContent()).includes('保存方案单需要登录'));
  await shot(p4, 'wp2-09-d2-save-toast.png');
  await p4.waitForNavigation({ timeout: 10000 }).catch(() => {});
  await p4.waitForLoadState('domcontentloaded');
  console.log('  [D2] 跳转落地 url=' + p4.url());
  check('D2 跳转到 index.html?auth=login 后落地 #/home', await hashIs(p4, '#/home', 15000));
  await p4.waitForSelector('#authOverlay', { state: 'visible', timeout: 15000 });
  check('D2 落地自动弹登录浮层', await visible(p4, '#authLoginForm'));
  check('D2 URL query 已抹除', await p4.evaluate(() => location.search) === '', 'search=' + await p4.evaluate(() => location.search));
  await shot(p4, 'wp2-10-d2-auth-wake.png');
  // 登录 owner → 手动回 plan
  await p4.fill('#authEmail', 'wp2-owner@example.com');
  await p4.fill('#authPassword', CTX.pwd);
  await p4.click('#authLoginBtn');
  await p4.waitForFunction(() => getComputedStyle(document.getElementById('authOverlay')).display === 'none', null, { timeout: 30000 });
  await sleep(1500);
  console.log('  [D2] 登录后落地 hash=' + await p4.evaluate(() => location.hash));
  await p4.evaluate(() => { location.hash = '#/house/plan'; });
  await p4.waitForSelector('#page-decor-plan.active .dh-pp', { timeout: 90000 });
  await sleep(800);
  const totalAfter = (await p4.locator('#dhPpTotal').textContent()).trim();
  check('D2 登录后组单件数一致', totalAfter === totalBefore, `前=${totalBefore} 后=${totalAfter}`);
  const notice = await p4.locator('.dh-pp-notice').textContent().catch(() => '');
  check('D2 还原提示条在场', (notice || '').includes('已还原'), '提示=' + (notice || '(无)'));
  await shot(p4, 'wp2-11-d2-after-login.png');

  // ============ 6. auth=login 边界 ============
  console.log('\n===== 6 auth=login 边界 =====');
  // 已登录带参：复用 p4（owner 已登录）
  await p4.goto(BASE + '/index.html?auth=login', { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  check('已登录带参: 不弹浮层', !(await visible(p4, '#authOverlay')));
  check('已登录带参: 参被抹', await p4.evaluate(() => location.search) === '');
  await shot(p4, 'wp2-12-authwake-loggedin.png');
  // 游客抹参后刷新不再弹
  const ctx5 = await browser.newContext(VP);
  const p5 = await ctx5.newPage();
  watch(p5, 'wake-guest');
  await p5.goto(BASE + '/index.html?auth=login', { waitUntil: 'domcontentloaded' });
  await p5.waitForSelector('#authOverlay', { state: 'visible', timeout: 20000 });
  check('游客带参: 弹浮层+抹参', (await p5.evaluate(() => location.search)) === '');
  await p5.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2500);
  check('游客抹参后刷新: 不再弹', !(await visible(p5, '#authOverlay')));

  // ============ 7. 登录回归（与 WP1 行为一致） ============
  console.log('\n===== 7 登录回归 =====');
  const ctx6 = await browser.newContext(VP);
  const p6 = await ctx6.newPage();
  watch(p6, 'login-reg');
  await p6.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p6.waitForSelector('#iaLoginBtn', { state: 'visible', timeout: 15000 });
  await login(p6, 'wp2-owner@example.com');
  const h6a = await p6.evaluate(() => location.hash);
  check('有公会登录: 落 #/team/dashboard 或尊重当前 hash', h6a === '#/team/dashboard' || h6a === '#/home', '实际=' + h6a);
  await shot(p6, 'wp2-13-login-owner.png');
  const ctx7 = await browser.newContext(VP);
  const p7 = await ctx7.newPage();
  watch(p7, 'login-noguild');
  await p7.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p7.waitForSelector('#iaLoginBtn', { state: 'visible', timeout: 15000 });
  await login(p7, 'wp2-noguild@example.com');
  check('无公会登录: 落 #/home', await p7.evaluate(() => location.hash) === '#/home', '实际=' + await p7.evaluate(() => location.hash));
  await shot(p7, 'wp2-14-login-noguild-home.png');

  // ============ 9. 公示壳 decor.html 保存跳转 ============
  console.log('\n===== 9 公示壳 auth=login =====');
  const ctx8 = await browser.newContext(VP);
  const p8 = await ctx8.newPage();
  watch(p8, 'public');
  await p8.goto(BASE + '/decor.html', { waitUntil: 'domcontentloaded' });
  await p8.waitForSelector('.dh-card [data-add]', { timeout: 90000 });
  await p8.locator('.dh-card [data-add]').first().click();
  await sleep(400);
  await p8.click('#dhPlanToggle');
  await p8.click('#dhPlanSave');
  await p8.waitForSelector('#dhPlanToast.show', { timeout: 5000 });
  await p8.waitForNavigation({ timeout: 10000 }).catch(() => {});
  await p8.waitForLoadState('domcontentloaded');
  console.log('  [公示壳] 跳转落地 url=' + p8.url());
  await p8.waitForSelector('#authOverlay', { state: 'visible', timeout: 25000 }); // 主站 init 异步，唤醒在云端初始化后
  check('公示壳保存 → 跳主站并自动弹登录浮层', await visible(p8, '#authLoginForm'));
  await sleep(600);
  check('公示壳落地 query 已抹除', await p8.evaluate(() => location.search) === '', 'search=' + await p8.evaluate(() => location.search));
  await shot(p8, 'wp2-15-public-auth-wake.png');

  await browser.close();

  // ============ 埋点入库实证（vid 标记） ============
  console.log('\n===== 埋点入库 =====');
  await sleep(1500);
  const ev = await svcGet(`/rest/v1/analytics_events?vid=eq.${VID_REG}&select=event,page,props`);
  const rows = Array.isArray(ev.body) ? ev.body : [];
  const ur = rows.filter(r => r.event === 'user_register').length;
  const gj = rows.filter(r => r.event === 'guild_join').length;
  check('user_register 入库', ur >= 1, `行数=${ur}`);
  check('guild_join 入库', gj >= 1, `行数=${gj}`);
  console.log(`  [埋点] vid=${VID_REG} 总行数=${rows.length}（user_register=${ur}, guild_join=${gj}, page_view=${rows.filter(r => r.event === 'page_view').length}, tab_click=${rows.filter(r => r.event === 'tab_click').length}）`);
  const delSt = await svcDel(`/rest/v1/analytics_events?vid=eq.${VID_REG}`);
  const left = await svcGet(`/rest/v1/analytics_events?vid=eq.${VID_REG}&select=id`);
  check('埋点测试行清理', delSt < 300 && Array.isArray(left.body) && left.body.length === 0, `DELETE=${delSt} 删除=${rows.length} 剩余=${Array.isArray(left.body) ? left.body.length : '?'}`);

  // 回写注册邮箱供 cleanup 删用户
  CTX.regEmail = REG_EMAIL;
  fs.writeFileSync(CTX_PATH, JSON.stringify(CTX, null, 2));

  // ============ console 干净度 ============
  console.log('\n===== console 错误清单 =====');
  if (!consoleErrors.length) console.log('(零 console.error / pageerror)');
  consoleErrors.forEach(e => console.log(`[${e.ctx}] ${e.text}`));
  const nonIcon404 = [...notFoundUrls].filter(u => !u.startsWith('/assets/icons/items/') && !u.startsWith('/assets/decor-icons/'));
  console.log(`404 资源: 共 ${notFoundUrls.size} 个去重，非图标类 ${nonIcon404.length} 个${nonIcon404.length ? ': ' + nonIcon404.join(', ') : '（全部为已知物品/装饰图标缺口噪音）'}`);

  const failed = results.filter(r => !r.ok);
  console.log(`\n===== 任务书 #59 WP2 验收: ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) { failed.forEach(f => console.log('失败项: ' + f.name)); process.exitCode = 1; }
})().catch(e => { console.error('验收脚本异常:', e); process.exitCode = 2; });
