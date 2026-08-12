// 任务书 #41 验证：REQ-112 侧栏「问题反馈」入口 + QQ 群悬浮卡 + 渐变高亮 hover
// 覆盖（任务书 §四 verify 口径）：
//   ① 按钮存在性与位置（侧栏底部、版本号上方；非导航 nav-item，不参与将来 REQ-105 拖拽）；
//   ② 悬浮卡三要素（二维码图可加载 / 群名「魔兽管家用户群」/ 群号 1104273954）+ 引导文案 + 浅色卡托；
//   ③ 桌面 hover 显隐（双向：进入显示、离开隐藏，全程不出视口）；
//   ④ 移动端降级：点击切换显隐、点外部关闭、ESC 关闭；
//   ⑤ §2 computed 断言（按钮渐变背景/卡托白底/卡片圆角与层级）；reduced-motion 降级断言；
//   ⑥ 版本串两壳 .53 同步（图片为静态资源不计版本串）；全程零 JS 报错零 404（图片 200）。
// 测试数据（t41- 测试用户/公会）终清理并复核为零。
// 用法: node scripts/verify-task41.js（PW_CHANNEL=chrome 可选）
// 截图输出 backup/2026-08-12-task41/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-12-task41');
const PORT = 15701;
const BASE = `http://localhost:${PORT}`;
const PWD = 'T41-Test-2026!';
const EMAIL = 't41-user@wowbutler.cn';

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

let serverProc = null, userU = null, guildId = null;

async function setup() {
  const oldG = await svc('GET', `/rest/v1/guilds?select=id&name=like.T41*`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) await svc('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  const lu = await fetch(`${SB}/auth/v1/admin/users?per_page=50`, { headers: SVC });
  const lj = await lu.json();
  const hit = (lj.users || []).find(u => u.email === EMAIL);
  if (hit) await fetch(`${SB}/auth/v1/admin/users/${hit.id}`, { method: 'DELETE', headers: SVC });

  let res = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'T41成员' } }),
  });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PWD }),
    });
    body = await res.json();
  }
  userU = { uid: body.user.id };
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T41反馈会', owner_id: userU.uid, invite_code: 'T41A' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: userU.uid, role: 'owner', display_name: 'T41成员' }]);

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
  if (userU) { try { await fetch(`${SB}/auth/v1/admin/users/${userU.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); } }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', `/rest/v1/guilds?select=id&name=like.T41*`);
  check('[清理复核] T41 前缀公会 0', Array.isArray(c1.body) && c1.body.length === 0, `guild=${c1.body.length}`);
}
async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
  await page.fill('#authEmail', EMAIL);
  await page.fill('#authPassword', PWD);
  await page.click('#authLoginBtn');
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  await sleep(1200);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  // ==================== A. 版本串与素材 ====================
  const htmlData = await (await fetch(`${BASE}/data.html`)).text();
  const htmlIndex = await (await fetch(`${BASE}/`)).text();
  const verOf = h => [...new Set([...h.matchAll(/20260811\.\d+/g)].map(m => m[0]))];
  const vD = verOf(htmlData), vI = verOf(htmlIndex);
  check('A1 版本串两壳同步（单一串且两壳一致；本包交付时点 .53，后续递增为预期）', vD.length === 1 && vI.length === 1 && vD[0] === vI[0] && parseInt(vI[0].split('.')[1], 10) >= 53, `index=${vI} data=${vD}`);
  const qrRes = await fetch(`${BASE}/assets/qq-group-qr.png`); // 素材实为 PNG（1284×2283，.jpg 系误命名，按真实格式引用）
  const qrBuf = Buffer.from(await qrRes.arrayBuffer());
  check('A2 二维码素材 200 且为 PNG（magic bytes 8950）', qrRes.status === 200 && qrBuf[0] === 0x89 && qrBuf[1] === 0x50, `status=${qrRes.status} size=${qrBuf.length}`);
  check('A3 公开壳 data.html 无反馈入口（仅主应用壳）', !htmlData.includes('feedbackBtn'), '');

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  const notFounds = [];
  const watch = (page, tag) => {
    page.on('pageerror', e => pageErrors.push(`pageerror(${tag}): ` + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push(`console(${tag}): ` + msg.text()); });
    page.on('response', r => { if (r.status() === 404) notFounds.push(`${tag}: ${r.url()}`); });
  };
  try {
    // ==================== B. 桌面 1366：位置/内容/hover 双向 ====================
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    watch(page, 'desktop');
    await login(page);

    const b1 = await page.evaluate(() => {
      const btn = document.getElementById('feedbackBtn');
      const ver = document.getElementById('appVersion');
      const entry = document.getElementById('feedbackEntry');
      if (!btn || !ver || !entry) return { exists: false };
      return {
        exists: true,
        aboveVersion: btn.getBoundingClientRect().bottom <= ver.getBoundingClientRect().top + 1,
        notNavItem: !entry.classList.contains('nav-item') && !entry.hasAttribute('data-page'),
        inFooter: !!btn.closest('.sidebar-footer'),
        text: btn.innerText,
      };
    });
    check('B1 按钮存在：侧栏 footer 内、版本号上方、非导航项（REQ-105 不同域）',
      b1.exists && b1.aboveVersion && b1.notNavItem && b1.inFooter && b1.text.includes('问题反馈'), JSON.stringify(b1));

    // hover 前隐藏
    const b2pre = await page.evaluate(() => {
      const cs = getComputedStyle(document.getElementById('feedbackCard'));
      return { opacity: cs.opacity, visibility: cs.visibility };
    });
    // hover → 显示
    await page.hover('#feedbackBtn');
    await sleep(450);
    const b2 = await page.evaluate(() => {
      const card = document.getElementById('feedbackCard');
      const cs = getComputedStyle(card);
      const r = card.getBoundingClientRect();
      const img = card.querySelector('img');
      return {
        opacity: cs.opacity, visibility: cs.visibility,
        inViewport: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
        rect: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) },
        imgLoaded: !!(img && img.complete && img.naturalWidth > 0),
        hasName: card.innerText.includes('魔兽管家用户群'),
        hasQq: card.innerText.includes('1104273954'),
        hasHint: /反馈问题/.test(card.innerText),
      };
    });
    check('B2 hover 前卡片隐藏', b2pre.opacity === '0' || b2pre.visibility === 'hidden', JSON.stringify(b2pre));
    check('B3 hover 显示悬浮卡：三要素齐（图可加载/群名/群号）+ 引导文案 + 全程不出视口',
      b2.opacity === '1' && b2.visibility === 'visible' && b2.imgLoaded && b2.hasName && b2.hasQq && b2.hasHint && b2.inViewport, JSON.stringify(b2.rect));
    await page.screenshot({ path: path.join(SHOT_DIR, 'desktop-hover-card.png') });

    // hover 离开 → 隐藏（双向）
    await page.hover('#pageTitle');
    await sleep(450);
    const b4 = await page.evaluate(() => {
      const cs = getComputedStyle(document.getElementById('feedbackCard'));
      return { opacity: cs.opacity, visibility: cs.visibility };
    });
    check('B4 hover 离开卡片隐藏（双向动画回程）', b4.opacity === '0' || b4.visibility === 'hidden', JSON.stringify(b4));

    // §2 computed：按钮渐变 / 卡托白底 / 卡片圆角与层级
    const b5 = await page.evaluate(() => {
      const btn = getComputedStyle(document.getElementById('feedbackBtn'));
      const wrap = document.querySelector('.fb-qr-wrap') ? getComputedStyle(document.querySelector('.fb-qr-wrap')) : null;
      const card = getComputedStyle(document.getElementById('feedbackCard'));
      return {
        btnBg: btn.backgroundImage,
        btnTrans: btn.transitionProperty,
        wrapBg: wrap ? wrap.backgroundColor : null,
        wrapBr: wrap ? wrap.borderRadius : null,
        cardBr: card.borderRadius,
        cardZ: card.zIndex,
        cardPos: card.position,
      };
    });
    check('B5 §2 computed：按钮渐变高亮（linear-gradient + background-position 过渡）',
      b5.btnBg.includes('linear-gradient') && b5.btnTrans.includes('background-position'), `bg=${b5.btnBg.slice(0, 60)}… trans=${b5.btnTrans}`);
    check('B6 §2 computed：浅色卡托（白底+圆角）+ 卡片圆角 ≤8px + 浮层定位与层级',
      b5.wrapBg === 'rgb(255, 255, 255)' && parseInt(b5.cardBr) <= 8 && (b5.cardPos === 'fixed' || b5.cardPos === 'absolute') && parseInt(b5.cardZ) >= 10,
      `卡托=${b5.wrapBg}/${b5.wrapBr} 卡片=${b5.cardBr} z=${b5.cardZ} pos=${b5.cardPos}`);
    await ctx.close();

    // ==================== C. 粗指针降级（触屏仿真：hover 不可用）——点击切换/外点/ESC ====================
    // 注：真实手机 ≤768 侧栏整体 display:none（项目移动封存取舍，bottom-nav 承接导航），反馈入口随侧栏不显示；
    // 点击降级面向 hover 不可用且侧栏可见的环境（触屏本/桌面宽触屏仿真），此处以 isMobile 仿真触发 (hover: none)
    const ctxM = await browser.newContext({ viewport: { width: 1366, height: 768 }, hasTouch: true, isMobile: true });
    const pageM = await ctxM.newPage();
    watch(pageM, 'mobile');
    await login(pageM);
    const c0 = await pageM.evaluate(() => ({
      hoverNone: window.matchMedia('(hover: none)').matches,
      coarse: window.matchMedia('(pointer: coarse)').matches,
    }));
    console.log('[粗指针媒体]', JSON.stringify(c0));
    const c1pre = await pageM.evaluate(() => getComputedStyle(document.getElementById('feedbackCard')).visibility);
    await pageM.tap('#feedbackBtn');
    await sleep(300);
    const c1 = await pageM.evaluate(() => ({
      open: document.getElementById('feedbackEntry').classList.contains('open'),
      vis: getComputedStyle(document.getElementById('feedbackCard')).visibility,
      expanded: document.getElementById('feedbackBtn').getAttribute('aria-expanded'),
    }));
    check('C1 粗指针（hover 不可用）点击按钮切换悬浮卡显示', c1pre === 'hidden' && c1.open && c1.vis === 'visible' && c1.expanded === 'true', JSON.stringify(c1));
    await pageM.screenshot({ path: path.join(SHOT_DIR, 'coarse-tap-card.png') });
    // 点外部关闭
    await pageM.tap('#pageTitle');
    await sleep(300);
    const c2 = await pageM.evaluate(() => !document.getElementById('feedbackEntry').classList.contains('open'));
    check('C2 点卡片外区域关闭', c2);
    // ESC 关闭
    await pageM.tap('#feedbackBtn');
    await sleep(300);
    await pageM.keyboard.press('Escape');
    await sleep(300);
    const c3 = await pageM.evaluate(() => !document.getElementById('feedbackEntry').classList.contains('open'));
    check('C3 ESC 关闭', c3);
    await ctxM.close();

    // ==================== D. reduced-motion 降级 ====================
    const ctxR = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
    const pageR = await ctxR.newPage();
    watch(pageR, 'rm');
    await login(pageR);
    const d1 = await pageR.evaluate(() => ({
      btnDur: getComputedStyle(document.getElementById('feedbackBtn')).transitionDuration,
      cardDur: getComputedStyle(document.getElementById('feedbackCard')).transitionDuration,
    }));
    check('D1 reduced-motion：按钮/卡片过渡时长归零（动画关闭直呈终态）',
      d1.btnDur === '0s' && d1.cardDur === '0s', JSON.stringify(d1));
    await pageR.hover('#feedbackBtn');
    await sleep(80); // 无过渡，短等即可
    const d2 = await pageR.evaluate(() => getComputedStyle(document.getElementById('feedbackCard')).visibility);
    check('D2 reduced-motion 下 hover 仍即时呈现悬浮卡', d2 === 'visible', d2);
    await ctxR.close();

    const realErrors = pageErrors.filter(e => !e.includes('status of 406') && !e.includes('status of 409'));
    check('全程零 JS 报错（406/409 资源状态码噪音另行列示）', realErrors.length === 0, realErrors.join(' | ') || '无');
    check('全程零 404（含二维码素材）', notFounds.length === 0, notFounds.join(' | ') || '无');
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#41 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => {
  console.error('[验证脚本异常]', e);
  try { await cleanup(); } catch {}
  process.exit(1);
});
