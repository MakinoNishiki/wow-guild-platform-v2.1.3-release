// 任务书 #59 WP2 需求 4（导航页预览稿 P1 定稿）窄验证——验证代理自建脚本
// 前置：node server.js @18659。临时无公会用户验完即删。
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const SHOT = path.join(ROOT, 'backup', '2026-09-24-task59-wp1');
const BASE = 'http://127.0.0.1:18659';
const PWD = 'Wp2p1-2026!';
const EMAIL = 'wp2p1-noguild@example.com';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const SVC = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EXPECT = {
  kicker: '一个随时会噶的魔兽站点，想到什么做什么',
  heroLight: '魔兽', heroGold: '管家',
  sub: '团队行政 · 装备管理 · 家宅宠物 —— 社区？招募？依旧在探索、在尝试……',
  cardATitle: '🏠 家宅图鉴', cardADesc: '浏览全部家宅物品与获取来源，无需登录，点开即看',
  cardBTitle: '📖 副本掉落', cardBDesc: '各副本装备掉落与分配公示页，游客直读，数据实时同源',
  chip: '免登录', arrow: '→',
  lockedLabel: '🔒 登录并加入公会后可用',
  pills: ['🔒 考勤打卡', '🔒 装备分配', '🔒 心愿单', '🔒 团队统计', '🔒 数据中心', '🔒 更新日志'],
  quickLinks: ['家宅图鉴', '副本掉落', '方案单'],
};

const results = [];
const consoleErrors = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ' —— 实际=' + detail}`);
}
function diffText(label, actual, expected) {
  check(`文案逐字: ${label}`, actual === expected, JSON.stringify(actual));
  if (actual !== expected) console.log(`    期望=${JSON.stringify(expected)} 实际=${JSON.stringify(actual)}`);
}
function watch(page, tag) {
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push({ ctx: tag, text: m.text().slice(0, 200) }); });
  page.on('pageerror', e => consoleErrors.push({ ctx: tag, text: 'pageerror: ' + String(e).slice(0, 200) }));
}
async function ensureUser() {
  const su = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'wp2p1' } }),
  });
  const sb = await su.json();
  if (sb.access_token) return sb.user.id;
  const li = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PWD }),
  });
  const lb = await li.json();
  if (!lb.access_token) throw new Error('临时用户会话获取失败');
  return lb.user.id;
}

async function assertHomeContent(page, tag) {
  const t = await page.evaluate(() => {
    const txt = sel => { const el = document.querySelector(sel); return el ? el.textContent : null; };
    return {
      kicker: txt('#page-home .home-kicker'),
      heroLight: txt('#page-home .home-hero-light'),
      heroGold: txt('#page-home .home-hero-gold'),
      sub: txt('#page-home .home-hero-sub'),
      cards: [...document.querySelectorAll('#page-home .home-entry-card')].map(c => ({
        title: c.querySelector('.home-entry-title').childNodes[0].textContent.trim(),
        chip: (c.querySelector('.home-chip-free') || {}).textContent || null,
        arrow: (c.querySelector('.home-entry-arrow') || {}).textContent || null,
        desc: (c.querySelector('.home-entry-desc') || {}).textContent || null,
      })),
      lockedLabel: txt('#page-home .home-locked-label'),
      pills: [...document.querySelectorAll('#page-home .home-locked-pill')].map(p => p.textContent),
      pillOnclick: [...document.querySelectorAll('#page-home .home-locked-pill')].some(p => p.hasAttribute('onclick')),
      quickLinks: [...document.querySelectorAll('#page-home .home-quick-link')].map(b => b.textContent),
      kickerStyle: (() => { const cs = getComputedStyle(document.querySelector('#page-home .home-kicker')); return { color: cs.color, ls: cs.letterSpacing, fw: cs.fontWeight }; })(),
      heroLightColor: getComputedStyle(document.querySelector('#page-home .home-hero-light')).color,
      heroGoldColor: getComputedStyle(document.querySelector('#page-home .home-hero-gold')).color,
    };
  });
  diffText('kicker', t.kicker, EXPECT.kicker);
  diffText('主标题浅色段', t.heroLight, EXPECT.heroLight);
  diffText('主标题金色段', t.heroGold, EXPECT.heroGold);
  diffText('副标', t.sub, EXPECT.sub);
  check('导流卡=2 张', t.cards.length === 2, String(t.cards.length));
  if (t.cards.length === 2) {
    diffText('卡A标题', t.cards[0].title, EXPECT.cardATitle);
    diffText('卡A描述', t.cards[0].desc, EXPECT.cardADesc);
    diffText('卡B标题', t.cards[1].title, EXPECT.cardBTitle);
    diffText('卡B描述', t.cards[1].desc, EXPECT.cardBDesc);
    check('双卡各带免登录 chip + 右箭头', t.cards.every(c => c.chip === EXPECT.chip && c.arrow === EXPECT.arrow), JSON.stringify(t.cards.map(c => [c.chip, c.arrow])));
  }
  diffText('预告带 label', t.lockedLabel, EXPECT.lockedLabel);
  check('预告带 6 pill 文案逐字', JSON.stringify(t.pills) === JSON.stringify(EXPECT.pills), JSON.stringify(t.pills));
  check('预告带 pill 无 onclick', !t.pillOnclick);
  check('底部无需登录三链接仍在', JSON.stringify(t.quickLinks) === JSON.stringify(EXPECT.quickLinks), JSON.stringify(t.quickLinks));
  check('kicker 金色+加宽字距+加粗', t.kickerStyle.ls !== 'normal' && parseFloat(t.kickerStyle.ls) > 0 && t.kickerStyle.fw === '600' && t.kickerStyle.color !== t.heroLightColor, JSON.stringify(t.kickerStyle));
  check('主标题双色（浅色≠金色）', t.heroLightColor !== t.heroGoldColor, `light=${t.heroLightColor} gold=${t.heroGoldColor}`);
}

(async () => {
  const uid = await ensureUser();
  const browser = await chromium.launch();
  const VP = { viewport: { width: 1600, height: 900 } };

  // ---- 1 游客默认态 ----
  console.log('\n===== 1 游客 #/home =====');
  const ctx1 = await browser.newContext(VP);
  const p1 = await ctx1.newPage();
  watch(p1, 'guest');
  await p1.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p1.waitForFunction(() => location.hash === '#/home', null, { timeout: 10000 });
  await p1.waitForSelector('#page-home.active', { timeout: 10000 });
  await assertHomeContent(p1, 'guest');
  // QQ 钮仍在且不被新内容遮挡
  const qq = await p1.evaluate(() => {
    const el = document.querySelector('#homeQqFloat .home-qq-btn');
    if (!el || getComputedStyle(document.getElementById('homeQqFloat')).display === 'none') return { visible: false };
    const b = el.getBoundingClientRect();
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { visible: true, hitOwn: !!(top && (top.closest('#homeQqFloat'))) };
  });
  check('QQ 悬浮钮仍在且不被遮挡', qq.visible && qq.hitOwn, JSON.stringify(qq));
  await p1.screenshot({ path: path.join(SHOT, 'wp2p1-guest-home.png'), fullPage: true });

  // ---- 3 跳转断言（游客 context 续用） ----
  console.log('\n===== 3 跳转 =====');
  await p1.locator('#page-home .home-entry-card').nth(0).click();
  await p1.waitForFunction(() => location.hash === '#/house/decor', null, { timeout: 10000 });
  await p1.waitForSelector('#page-decor .dh-card', { timeout: 90000 });
  check('点卡A → #/house/decor 图鉴渲染', true);
  await p1.evaluate(() => { location.hash = '#/home'; });
  await p1.waitForSelector('#page-home.active', { timeout: 10000 });
  await p1.locator('#page-home .home-entry-card').nth(1).click();
  await p1.waitForFunction(() => location.hash === '#/team/lootdrop', null, { timeout: 10000 });
  await p1.waitForSelector('#page-lootdrop.active .dp-item', { timeout: 60000 });
  check('点卡B → #/team/lootdrop 掉落渲染', true);
  await p1.evaluate(() => { location.hash = '#/home'; });
  await p1.waitForSelector('#page-home.active', { timeout: 10000 });
  const beforeHash = await p1.evaluate(() => location.hash);
  await p1.locator('#page-home .home-locked-pill').first().click({ force: true });
  await sleep(400);
  check('锁定 pill 点击无路由变化', await p1.evaluate(() => location.hash) === beforeHash);

  // ---- 2 登录态同构 ----
  console.log('\n===== 2 登录无公会 #/home =====');
  const ctx2 = await browser.newContext(VP);
  const p2 = await ctx2.newPage();
  watch(p2, 'user');
  await p2.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p2.waitForSelector('#iaLoginBtn', { state: 'visible', timeout: 15000 });
  await p2.click('#iaLoginBtn');
  await p2.fill('#authEmail', EMAIL);
  await p2.fill('#authPassword', PWD);
  await p2.click('#authLoginBtn');
  await p2.waitForFunction(() => getComputedStyle(document.getElementById('authOverlay')).display === 'none', null, { timeout: 30000 });
  await sleep(800);
  await p2.evaluate(() => { location.hash = '#/home'; });
  await p2.waitForSelector('#page-home.active', { timeout: 10000 });
  await assertHomeContent(p2, 'user');
  check('登录态用户中心按钮显示', await p2.evaluate(() => { const el = document.getElementById('iaUserCenterBtn'); return el && getComputedStyle(el).display !== 'none'; }));
  await p2.screenshot({ path: path.join(SHOT, 'wp2p1-user-home.png'), fullPage: true });

  await browser.close();

  // 清理临时用户
  const d = await fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: SVC });
  const chk = await fetch(`${SB}/auth/v1/admin/users/${uid}`, { headers: SVC });
  console.log(`\n清理临时用户 ${EMAIL}: DELETE=${d.status} 复核查询=${chk.status}（404=已删）`);

  console.log('\n===== console 错误清单 =====');
  if (!consoleErrors.length) console.log('(零 console.error / pageerror)');
  consoleErrors.forEach(e => console.log(`[${e.ctx}] ${e.text}`));

  const failed = results.filter(r => !r.ok);
  console.log(`\n===== WP2 需求4 P1 验收: ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) { failed.forEach(f => console.log('失败项: ' + f.name)); process.exitCode = 1; }
})().catch(e => { console.error('异常:', e); process.exitCode = 2; });
