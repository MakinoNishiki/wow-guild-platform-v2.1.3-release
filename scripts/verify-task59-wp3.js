// 任务书 #59 WP3（公示页重定向 + 埋点勘定）真浏览器验收——验证代理自建脚本
// 前置：node server.js @18659；verify-task59-wp3-setup.js setup 已跑
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT = path.join(ROOT, 'backup', '2026-09-24-task59-wp1');
const BASE = 'http://127.0.0.1:18659';
const CTX = JSON.parse(fs.readFileSync(path.join(__dirname, '.task59-wp3-ctx.json'), 'utf8'));
const TS = Date.now();
const V_RD_DECOR = `wp3-verify-rdd-${TS}`; // decor.html 重定向
const V_RD_DATA = `wp3-verify-rdt-${TS}`;  // data.html 重定向
const V_HOME = `wp3-verify-home-${TS}`;    // 勘定: 游客空 hash
const V_DECOR = `wp3-verify-decor-${TS}`;  // 勘定: 直开 #/house/decor
const V_DASH = `wp3-verify-dash-${TS}`;    // 勘定: 公会成员空 hash
const V_EVT = `wp3-verify-evt-${TS}`;      // 主站业务事件

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const SVC = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
const consoleErrors = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' —— ' + detail : ''}`);
}
function watch(page, tag) {
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push({ ctx: tag, text: m.text().slice(0, 160) }); });
  page.on('pageerror', e => consoleErrors.push({ ctx: tag, text: 'pageerror: ' + String(e).slice(0, 160) }));
}
async function shot(page, name, full) { await page.screenshot({ path: path.join(SHOT, name), fullPage: !!full }); }
async function svcGet(p) { const r = await fetch(`${SB}${p}`, { headers: SVC }); return { status: r.status, body: await r.json().catch(() => null) }; }
async function svcDel(p) { const r = await fetch(`${SB}${p}`, { method: 'DELETE', headers: SVC }); return r.status; }
async function vidRows(vid) {
  const r = await svcGet(`/rest/v1/analytics_events?vid=eq.${vid}&select=id,event,page,props&order=id.asc`);
  return Array.isArray(r.body) ? r.body : [];
}
async function login(page, email) {
  await page.click('#iaLoginBtn');
  await page.waitForSelector('#authOverlay', { state: 'visible' });
  await page.fill('#authEmail', email);
  await page.fill('#authPassword', CTX.pwd);
  await page.click('#authLoginBtn');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('authOverlay')).display === 'none', null, { timeout: 30000 });
  await sleep(1000);
}

(async () => {
  const browser = await chromium.launch();
  const VP = { viewport: { width: 1600, height: 900 } };

  // ============ 1+2+3. 重定向壳：跳转/透传/惰性 ============
  console.log('\n===== 1 重定向壳跳转 =====');
  for (const [file, frag, vid, sel, shotName] of [
    ['decor.html', '#/house/decor', V_RD_DECOR, '#page-decor .dh-card', 'wp3-02-decor-landing.png'],
    ['data.html', '#/team/lootdrop', V_RD_DATA, '#page-lootdrop .dp-item', 'wp3-03-data-landing.png'],
  ]) {
    const ctx = await browser.newContext(VP);
    await ctx.addInitScript(v => { try { localStorage.setItem('wb_vid', v); } catch (e) {} }, vid);
    const page = await ctx.newPage();
    watch(page, file);
    const preRedirectExternal = [];
    page.on('request', r => {
      if (page.url().includes(file) && !r.url().startsWith(BASE)) preRedirectExternal.push(r.url());
    });
    // 尝试抓跳转瞬间壳
    await page.goto(`${BASE}/${file}`, { waitUntil: 'commit' });
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    if (page.url().includes(file)) await shot(page, file === 'decor.html' ? 'wp3-01-decor-shell.png' : 'wp3-01b-data-shell.png');
    await page.waitForFunction(f => location.pathname.endsWith('/index.html') || location.pathname === '/', file, { timeout: 15000 });
    check(`${file} → 落地 index.html${frag}`, await page.evaluate(() => location.hash) === frag, 'hash=' + await page.evaluate(() => location.hash));
    await page.waitForSelector(sel, { timeout: 90000 });
    check(`${file} 落地后内容渲染`, true);
    await shot(page, shotName);
    const dataReqs = preRedirectExternal.filter(u => /rest\/v1\//.test(u));
    check(`${file} 跳转前零 PostgREST 数据请求（惰性）`, dataReqs.length === 0, dataReqs.join(',') || '跳转前外部请求=' + (preRedirectExternal.length || 0));
    await ctx.close();
  }

  console.log('\n===== 2 参数透传 =====');
  for (const [file, frag] of [['decor.html', '#/house/decor'], ['data.html', '#/team/lootdrop']]) {
    const ctx = await browser.newContext(VP);
    const page = await ctx.newPage();
    watch(page, file + '?src');
    await page.goto(`${BASE}/${file}?src=wp3test`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(f => !location.pathname.endsWith(f), file, { timeout: 15000 });
    const landed = await page.evaluate(() => ({ search: location.search, hash: location.hash }));
    check(`${file}?src=wp3test 透传`, landed.search === '?src=wp3test' && landed.hash === frag, JSON.stringify(landed));
    await ctx.close();
  }

  console.log('\n===== 2b meta refresh 静态兜底（禁 JS） =====');
  {
    const ctx = await browser.newContext({ ...VP, javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/decor.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !location.pathname.endsWith('decor.html'), null, { timeout: 8000 });
    check('禁 JS 时 meta refresh 兜底跳转', await page.evaluate(() => location.hash) === '#/house/decor', 'hash=' + await page.evaluate(() => location.hash));
    await ctx.close();
  }

  // ============ 5. D2 回归（主站壳） ============
  console.log('\n===== 5 D2 回归 =====');
  const ctxD = await browser.newContext(VP);
  const pd = await ctxD.newPage();
  watch(pd, 'd2');
  await pd.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await pd.waitForFunction(() => location.hash === '#/home', null, { timeout: 10000 });
  await pd.click('button[data-ia-tab="house"]');
  await pd.waitForSelector('#page-decor .dh-card [data-add]', { timeout: 90000 });
  await pd.locator('#page-decor .dh-card [data-add]').nth(0).click();
  await sleep(300);
  await pd.locator('#page-decor .dh-card [data-add]').nth(1).click();
  await sleep(400);
  await pd.click('button[data-ia-key="decor-plan"]');
  await pd.waitForSelector('#page-decor-plan.active .dh-pp', { timeout: 30000 });
  const d2Before = (await pd.locator('#dhPpTotal').textContent()).trim();
  await pd.click('#dhPlanToggle');
  await pd.click('#dhPlanSave');
  await pd.waitForSelector('#dhPlanToast.show', { timeout: 5000 });
  await shot(pd, 'wp3-04-d2-toast.png');
  await pd.waitForNavigation({ timeout: 10000 }).catch(() => {});
  await pd.waitForLoadState('domcontentloaded');
  await pd.waitForSelector('#authOverlay', { state: 'visible', timeout: 25000 });
  check('D2 ?auth=login 落地弹登录浮层', true);
  await shot(pd, 'wp3-05-d2-wake.png');
  await pd.fill('#authEmail', 'wp3-owner@example.com');
  await pd.fill('#authPassword', CTX.pwd);
  await pd.click('#authLoginBtn');
  await pd.waitForFunction(() => getComputedStyle(document.getElementById('authOverlay')).display === 'none', null, { timeout: 30000 });
  await sleep(1500);
  await pd.evaluate(() => { location.hash = '#/house/plan'; });
  await pd.waitForSelector('#page-decor-plan.active .dh-pp', { timeout: 90000 });
  await sleep(800);
  const d2After = (await pd.locator('#dhPpTotal').textContent()).trim();
  const d2Notice = await pd.locator('.dh-pp-notice').textContent().catch(() => '');
  check('D2 登录后草稿件数一致+还原提示', d2After === d2Before && (d2Notice || '').includes('已还原'), `前=${d2Before} 后=${d2After} 提示=${(d2Notice || '').slice(0, 20)}`);
  await shot(pd, 'wp3-06-d2-after-login.png');

  // ============ 4b. 主站业务事件（D2 同一 context 续：owner 已登录，在方案单页） ============
  console.log('\n===== 4b 主站业务事件 =====');
  await pd.evaluate(v => { localStorage.setItem('wb_vid', v); }, V_EVT);
  // decor_plan_add（游客口径 page=index:decor）：先回图鉴加一件
  await pd.evaluate(() => { location.hash = '#/house/decor'; });
  await pd.waitForSelector('#page-decor.active .dh-card [data-add]', { timeout: 90000 });
  await pd.locator('#page-decor .dh-card [data-add]').nth(2).click();
  await sleep(400);
  // 回方案单页：导出文本 + 导出图片 + 保存
  await pd.evaluate(() => { location.hash = '#/house/plan'; });
  await pd.waitForSelector('#page-decor-plan.active .dh-pp', { timeout: 60000 });
  await sleep(800);
  await pd.click('#dhPpExport');
  await pd.waitForSelector('.dh-plan-export-overlay', { state: 'visible', timeout: 10000 });
  await shot(pd, 'wp3-07-export-modal.png');
  await pd.click('#dhPlanCopyBtn'); // decor_plan_export_text
  await sleep(400);
  await pd.click('#dhExpTabImage');
  await pd.waitForSelector('#dhExpSaveImg', { state: 'visible' });
  await pd.click('#dhExpSaveImg'); // decor_plan_export_image（skin=gold）
  await sleep(1200);
  await pd.keyboard.press('Escape'); // 关导出弹窗（若 ESC 不收口则点关闭）
  if (await pd.locator('.dh-plan-export-overlay.show').count()) await pd.locator('.dh-plan-export-overlay .dh-modal-close').click().catch(() => {});
  // 保存（登录态 drawer 保存 → decor_plan_save）
  await pd.click('#dhPlanToggle');
  await pd.click('#dhPlanSave');
  await sleep(2500);

  // ============ 6. 登录遮罩双入口 ============
  console.log('\n===== 6 登录遮罩双入口 =====');
  const ctxL = await browser.newContext(VP);
  const pl = await ctxL.newPage();
  watch(pl, 'links');
  await pl.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await pl.waitForSelector('#iaLoginBtn', { state: 'visible', timeout: 15000 });
  await pl.click('#iaLoginBtn');
  await pl.waitForSelector('#authOverlay', { state: 'visible' });
  const links = await pl.evaluate(() => [...document.querySelectorAll('.auth-public-links a')].map(a => ({ href: a.getAttribute('href'), target: a.target, text: a.textContent })));
  check('遮罩双入口指向新路由', links.length === 2 && links[0].href === 'index.html#/house/decor' && links[1].href === 'index.html#/team/lootdrop' && links.every(l => l.target === '_blank'), JSON.stringify(links));
  await shot(pl, 'wp3-08-auth-links.png');

  // ============ 4d. 勘定项：首条 PV ============
  console.log('\n===== 4d 首条 PV 勘定 =====');
  // V3: 全新游客空 hash
  {
    const ctx = await browser.newContext(VP);
    await ctx.addInitScript(v => { try { localStorage.setItem('wb_vid', v); } catch (e) {} }, V_HOME);
    const page = await ctx.newPage();
    watch(page, 'v3');
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => location.hash === '#/home', null, { timeout: 10000 });
    await sleep(1500);
    await ctx.close();
  }
  // V4: 直开 #/house/decor
  {
    const ctx = await browser.newContext(VP);
    await ctx.addInitScript(v => { try { localStorage.setItem('wb_vid', v); } catch (e) {} }, V_DECOR);
    const page = await ctx.newPage();
    watch(page, 'v4');
    await page.goto(BASE + '/index.html#/house/decor', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#page-decor .dh-card', { timeout: 90000 }).catch(() => {});
    await sleep(1000);
    await ctx.close();
  }
  // V6: 登录有公会账号后空 hash 落地（先登录再换 vid 重开根路径）
  {
    const ctx = await browser.newContext(VP);
    const page = await ctx.newPage();
    watch(page, 'v6');
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#iaLoginBtn', { state: 'visible', timeout: 15000 });
    await login(page, 'wp3-owner@example.com');
    await page.evaluate(v => { localStorage.setItem('wb_vid', v); }, V_DASH);
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); // 空 hash 会话恢复
    await page.waitForFunction(() => location.hash === '#/team/dashboard', null, { timeout: 20000 });
    await sleep(1500);
    await ctx.close();
  }

  await browser.close();

  // ============ 4. 埋点核对（DB 实证） ============
  console.log('\n===== 4 埋点 DB 核对 =====');
  await sleep(2000);
  const pvOf = rows => rows.filter(r => r.event === 'page_view').map(r => r.page);
  // a. 重定向壳 PV 旧口径
  const rdDecor = await vidRows(V_RD_DECOR);
  const rdData = await vidRows(V_RD_DATA);
  check('a1. decor.html 壳 PV page=decor 入库', pvOf(rdDecor).includes('decor'), JSON.stringify(pvOf(rdDecor)));
  check('a2. decor.html 落地 index:decor 同 vid 入库', pvOf(rdDecor).includes('index:decor'), JSON.stringify(pvOf(rdDecor)));
  check('a3. data.html 壳 PV page=data 入库', pvOf(rdData).includes('data'), JSON.stringify(pvOf(rdData)));
  check('a4. data.html 落地 index:lootdrop 同 vid 入库', pvOf(rdData).includes('index:lootdrop'), JSON.stringify(pvOf(rdData)));
  // b. 主站业务事件
  const ev = await vidRows(V_EVT);
  const evOf = name => ev.filter(r => r.event === name);
  const add = evOf('decor_plan_add');
  check('b1. decor_plan_add (page=index:decor, from=card)', add.length >= 1 && add[0].page === 'index:decor' && add[0].props.from === 'card', JSON.stringify(add.map(r => [r.page, r.props])));
  const et = evOf('decor_plan_export_text');
  check('b2. decor_plan_export_text 入库', et.length >= 1, JSON.stringify(et.map(r => [r.page, r.props])));
  const ei = evOf('decor_plan_export_image');
  check('b3. decor_plan_export_image 入库 (skin=gold)', ei.length >= 1 && ei[0].props.skin === 'gold', JSON.stringify(ei.map(r => [r.page, r.props])));
  const sv = evOf('decor_plan_save');
  check('b4. decor_plan_save 入库', sv.length >= 1, JSON.stringify(sv.map(r => [r.page, r.props])));
  console.log('  [记录] decorData.js WBTrack 挂点全量=decor_plan_add/switch/create/save/export_image/export_text，无图鉴筛选埋点事件（如实记录：无此事件，不硬造）');
  // d. 勘定
  const vHome = await vidRows(V_HOME);
  check('d1. 游客空 hash 首条 PV=index:home', pvOf(vHome)[0] === 'index:home', JSON.stringify(pvOf(vHome)));
  check('d2. 游客空 hash 全程无 index:dashboard', !pvOf(vHome).includes('index:dashboard'), JSON.stringify(pvOf(vHome)));
  const vDecor = await vidRows(V_DECOR);
  check('d3. 直开 #/house/decor 首条 PV=index:decor', pvOf(vDecor)[0] === 'index:decor', JSON.stringify(pvOf(vDecor)));
  const vDash = await vidRows(V_DASH);
  check('d4. 公会成员空 hash 首条 PV=index:dashboard（旧口径不虚）', pvOf(vDash)[0] === 'index:dashboard', JSON.stringify(pvOf(vDash)));

  // ============ 8. 清理埋点测试行 ============
  console.log('\n===== 8 埋点行清理 =====');
  const allVids = [V_RD_DECOR, V_RD_DATA, V_HOME, V_DECOR, V_DASH, V_EVT];
  let totalRows = 0;
  for (const v of allVids) totalRows += (await vidRows(v)).length;
  const preSweep = await svcGet(`/rest/v1/analytics_events?vid=like.wp3-verify-*&select=id`);
  const preN = Array.isArray(preSweep.body) ? preSweep.body.length : -1;
  const delSt = await svcDel(`/rest/v1/analytics_events?vid=like.wp3-verify-*`);
  const postSweep = await svcGet(`/rest/v1/analytics_events?vid=like.wp3-verify-*&select=id`);
  const postN = Array.isArray(postSweep.body) ? postSweep.body.length : -1;
  check('埋点测试行清零', delSt < 300 && postN === 0, `删除=${preN}（逐 vid 合计 ${totalRows}）剩余=${postN}`);

  // ============ 7. console ============
  console.log('\n===== console 错误清单 =====');
  if (!consoleErrors.length) console.log('(零 console.error / pageerror)');
  consoleErrors.forEach(e => console.log(`[${e.ctx}] ${e.text}`));

  const failed = results.filter(r => !r.ok);
  console.log(`\n===== 任务书 #59 WP3 验收: ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) { failed.forEach(f => console.log('失败项: ' + f.name)); process.exitCode = 1; }
})().catch(e => { console.error('验收脚本异常:', e); process.exitCode = 2; });
