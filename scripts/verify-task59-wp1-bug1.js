// 任务书 #59 WP1 回归：BUG-1（QQ 悬浮钮 vs 方案单抽屉钮右下角碰撞）修复验证
// 前置：node server.js @18659 已启动。游客态即可，无需测试账号。
const path = require('path');
const { chromium } = require('playwright');
const SHOT = path.join(__dirname, '..', 'backup', '2026-09-24-task59-wp1');
const BASE = 'http://127.0.0.1:18659';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' —— ' + detail : ''}`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => location.hash === '#/home', null, { timeout: 10000 });
  // 触发 DecorCatalog 挂载（抽屉钮出现）
  await page.click('button[data-ia-tab="house"]');
  await page.waitForSelector('#page-decor .dh-card', { timeout: 90000 });
  await page.waitForSelector('#dhPlanToggle', { state: 'attached' });
  // 回 #/home
  await page.evaluate(() => { location.hash = '#/home'; });
  await sleep(600);

  const geo = await page.evaluate(() => {
    const qq = document.querySelector('#homeQqFloat .home-qq-btn');
    const tg = document.getElementById('dhPlanToggle');
    const r = el => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const a = qq.getBoundingClientRect(), b = tg.getBoundingClientRect();
    const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return { qq: r(qq), toggle: r(tg), overlapArea: Math.round(ix * iy), toggleVisible: getComputedStyle(tg).display !== 'none' };
  });
  console.log('  [几何] ' + JSON.stringify(geo));
  check('1. QQ 钮与抽屉钮重叠面积=0', geo.toggleVisible && geo.overlapArea === 0, `重叠=${geo.overlapArea}px² qq=${JSON.stringify(geo.qq)} toggle=${JSON.stringify(geo.toggle)}`);
  await page.screenshot({ path: path.join(SHOT, '25-fix-home-corner.png') });

  // hover 出码
  await page.hover('.home-qq-btn', { timeout: 5000 });
  await sleep(350);
  const popVisible = await page.evaluate(() => {
    const el = document.querySelector('.home-qq-pop');
    const cs = getComputedStyle(el);
    return cs.visibility === 'visible' && +cs.opacity > 0.9;
  });
  check('2. hover QQ 钮浮层正常出码', popVisible);
  const hit = await page.evaluate(() => {
    const el = document.querySelector('.home-qq-pop');
    const b = el.getBoundingClientRect();
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return el.contains(top) || top === el;
  });
  check('2b. 浮层中心命中自身（不被抽屉钮遮挡）', hit);
  await page.screenshot({ path: path.join(SHOT, '26-fix-qq-hover.png') });
  await page.mouse.move(800, 450);
  await sleep(300);

  // 点击 QQ 钮不得误开抽屉
  await page.click('.home-qq-btn', { timeout: 5000 });
  await sleep(400);
  const drawerOpen = await page.evaluate(() => {
    const d = document.getElementById('dhPlanDrawer');
    return d && d.classList.contains('open');
  });
  check('3. 点击 QQ 钮不误开方案单抽屉', !drawerOpen, drawerOpen ? '抽屉被误开' : '抽屉未展开');

  // 其他页面 QQ 钮仍隐藏
  await page.evaluate(() => { location.hash = '#/house/decor'; });
  await sleep(500);
  const hiddenOnDecor = await page.evaluate(() => getComputedStyle(document.getElementById('homeQqFloat')).display === 'none');
  await page.evaluate(() => { location.hash = '#/team/lootdrop'; });
  await sleep(500);
  const hiddenOnLootdrop = await page.evaluate(() => getComputedStyle(document.getElementById('homeQqFloat')).display === 'none');
  check('4. #/house/decor 与 #/team/lootdrop 下 QQ 钮仍隐藏', hiddenOnDecor && hiddenOnLootdrop, `decor=${hiddenOnDecor} lootdrop=${hiddenOnLootdrop}`);

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n===== BUG-1 修复回归: ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) process.exit(1);
})().catch(e => { console.error('异常:', e); process.exit(2); });
