// 任务书 #52 WP2 验收（REQ-137 一期收尾·首页双入口耦合 + REQ-138 无公会遮罩主次调换）
// 覆盖（任务书 WP2 验收口径）：
//   A. 静态断言：①dashboard 双卡（#statsGrid 之前、跳转目标 attendance/decor、文案逐字）；
//      ②登录墙公示链接行（authError 之后、decor.html+data.html 两枚、target=_blank）；
//      ③遮罩新主次（邀请码第一区块+引导文案/创建降次级/提示语/按钮定级/区块零 emoji）；
//      ④changelog 两条 #52 条目；⑤版本串 20260919.69 三壳计数+旧串零残留；⑥node --check；
//      ⑦css 锚点（.entry-cards/.auth-public-links/.auth-field-hint）；⑧WP1 组头/预留位不回归抽查。
//   B. 登录壳真浏览器（自建 T052W2 用户：E=owner / F=editor / G=viewer 同会，D=无公会新用户，H=建会回归用户）：
//      B1 登录墙链接行可见+href 断言（未登录态）；B2 D 真走遮罩新主次：区块序/文案/按钮类断言 +
//         错误邀请码提示+表单不关 + **正确邀请码主链路加入成功**（E 会）；B3 H 建会流程回归不破；
//      B4 owner 双卡可见+位于统计卡前+两卡真点击跳转落地正确（decor 懒挂载触发/attendance active）
//         +桌面/768 纵排截图；B5 editor/viewer 各登一张（卡片全角色可见，viewer 有 viewer-mode 类）；
//      B6 零 JS 错误零 4xx/5xx（白名单同 WP1）；C. 全部测试数据清零复核。
// 用法: node scripts/verify-task52-wp2.js（PW_CHANNEL=chrome 可选）
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-09-19-task52-wp2');
const PORT = 15053;
const BASE = `http://127.0.0.1:${PORT}`;
const PWD = 'T052W2-Test-2026!';
const VER = '20260919.69';
const EMAILS = { E: 't052w2-e@wowbutler.cn', F: 't052w2-f@wowbutler.cn', G: 't052w2-g@wowbutler.cn', D: 't052w2-d@wowbutler.cn', H: 't052w2-h@wowbutler.cn' };
const INVITE = 'T52W2E' + Date.now().toString(36).slice(-2).toUpperCase();

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

let serverProc = null;
const uid = {}, gid = {};

// ---------- A. 静态断言 ----------
function staticChecks() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'css', 'main.css'), 'utf8');
  const decor = fs.readFileSync(path.join(ROOT, 'decor.html'), 'utf8');
  const data = fs.readFileSync(path.join(ROOT, 'data.html'), 'utf8');

  // A1 双卡
  const dash = html.split('id="page-dashboard"')[1].split('<!-- 成员管理 -->')[0];
  check('A1a 双卡位于 statsGrid 之前', dash.indexOf('class="entry-cards"') > -1 && dash.indexOf('class="entry-cards"') < dash.indexOf('id="statsGrid"'));
  const cards = [...dash.matchAll(/<div class="card entry-card" onclick="switchPage\('(\w+)'\)">/g)].map(m => m[1]);
  check('A1b 双卡恰好两张且跳转=attendance/decor', JSON.stringify(cards) === JSON.stringify(['attendance', 'decor']), cards.join('/'));
  check('A1c 双卡文案逐字', dash.includes('公会团队管理') && dash.includes('考勤、装备、心愿单——团长每晚的行政工作，十分钟打完')
    && dash.includes('>家宅</div>') && dash.includes('2062 件家宅装饰全量目录，来源筛选一键到位') && (dash.match(/进入 →/g) || []).length === 2);

  // A2 登录墙公示链接行
  const overlay = html.split('id="authOverlay"')[1].split('class="app-container"')[0];
  check('A2a 公示链接行在 authError 之后', overlay.indexOf('class="auth-public-links"') > overlay.indexOf('id="authError"'));
  check('A2b 链接两枚=decor.html/data.html 新 Tab', overlay.includes('无需登录：<a href="decor.html" target="_blank" rel="noopener">家宅图鉴公示</a> · <a href="data.html" target="_blank" rel="noopener">副本掉落公示</a>'));

  // A3 遮罩新主次（REQ-138）
  const gf = html.split('id="authGuildForm"')[1].split('id="authError"')[0];
  check('A3a 提示语=加入公会后即可使用全部功能', gf.includes('<p class="auth-guild-hint">加入公会后即可使用全部功能</p>'));
  check('A3b 邀请码区块在第一字段位（主路径）', gf.indexOf('id="joinInviteCode"') < gf.indexOf('id="newGuildName"'));
  check('A3c 引导文案两句在场', gf.includes('团员请向会长索取 8 位邀请码') && gf.includes('你是会长？创建新公会'));
  check('A3d 按钮定级=加入 btn-primary / 创建 btn-ghost / 返回 btn-ghost',
    /<button class="btn btn-primary auth-btn" onclick="handleJoinGuild\(\)">加入公会<\/button>/.test(gf)
    && /<button class="btn btn-ghost auth-btn" onclick="handleCreateGuild\(\)">创建公会<\/button>/.test(gf)
    && /<button class="btn btn-ghost auth-btn" onclick="showLoginForm\(\)">返回登录<\/button>/.test(gf));
  check('A3e 遮罩区块零 emoji（文案纪律）', !/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u.test(gf));
  check('A3f 输入框 id/onclick 全保留（JS 零逻辑变更前提）', ['newGuildName', 'serverRegion', 'serverNameInput', 'joinInviteCode'].every(id => gf.includes(`id="${id}"`))
    && gf.includes('handleCreateGuild()') && gf.includes('handleJoinGuild()'));

  // A4 changelog 两条 #52 条目
  check('A4a changelog 收官两条在场', app.includes("id: 'v3.2.0-task52-home-entry'") && app.includes("id: 'v3.2.0-task52-nav-groups'"));
  check('A4b 四维分类合法（新增功能+模块调整）', /v3\.2\.0-task52-home-entry'[\s\S]*?typeLabel: '新增功能'/.test(app) && /v3\.2\.0-task52-nav-groups'[\s\S]*?typeLabel: '模块调整'/.test(app));

  // A5 版本串三壳 .69
  const cnt = (s, sub) => s.split(sub).length - 1;
  check('A5a index.html .69×14', cnt(html, VER) === 14, cnt(html, VER));
  check('A5b decor.html .69×5', cnt(decor, VER) === 5, cnt(decor, VER));
  check('A5c data.html .69×7', cnt(data, VER) === 7, cnt(data, VER));
  check('A5d 旧串零残留（.68/.65）', cnt(html, '20260919.68') + cnt(decor, '20260919.68') + cnt(data, '20260919.68') + cnt(data, '20260918.65') === 0);

  // A6 node --check
  const nc = spawnSync('node', ['--check', path.join(ROOT, 'js', 'app.js')]);
  check('A6 node --check js/app.js', nc.status === 0, nc.status);

  // A7 css 锚点
  check('A7a .entry-cards 双列+768 纵排', /\.entry-cards \{[\s\S]*?grid-template-columns: 1fr 1fr/.test(css) && /@media \(max-width: 768px\) \{\s*\.entry-cards \{ grid-template-columns: 1fr; \}/.test(css));
  check('A7b .entry-card :active 缩放+hover 提亮', /\.entry-card:active \{\s*transform: scale\(0\.97\)/.test(css) && /\.entry-card:hover \{[\s\S]*?var\(--bg-tertiary\)/.test(css));
  check('A7c .auth-public-links/.auth-field-hint 在场', css.includes('.auth-public-links {') && css.includes('.auth-field-hint {'));

  // A8 WP1 面不回归抽查
  check('A8 WP1 不回归（组头两枚+预留位+changelog 沉底）',
    (html.match(/class="nav-group-label"/g) || []).length === 2 && html.includes('id="navPets"')
    && html.indexOf('id="navPets"') < html.indexOf('data-page="changelog"') && html.indexOf('data-page="changelog"') < html.indexOf('data-navkey="usercenter"'));
}

// ---------- B. 浏览器实测 ----------
async function signUpOrIn(email, name) {
  const su = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD, data: { display_name: name } }),
  });
  const sb = await su.json();
  if (sb.access_token) return { token: sb.access_token, uid: sb.user.id };
  const li = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD }),
  });
  const lb = await li.json();
  if (!lb.access_token) throw new Error(`无法获取 ${email} 会话: ${JSON.stringify(lb)}`);
  return { token: lb.access_token, uid: lb.user.id };
}

async function setup() {
  for (const k of Object.keys(EMAILS)) uid[k] = (await signUpOrIn(EMAILS[k], `T052W2验收${k}`)).uid;
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T052W2验收会', owner_id: uid.E, invite_code: INVITE });
  if (g.status !== 201) throw new Error('建会 E 失败: ' + JSON.stringify(g.body));
  gid.E = g.body[0].id;
  for (const [k, role] of [['E', 'owner'], ['F', 'editor'], ['G', 'viewer']]) {
    const gm = await svc('POST', '/rest/v1/guild_members', { guild_id: gid.E, user_id: uid[k], role });
    if (gm.status !== 201) throw new Error(`${k} 入会失败: ` + JSON.stringify(gm.body));
  }
  console.log(`[setup] 验收会 invite_code=${INVITE}（D 主链路加入用）`);
}

async function cleanup() {
  for (const k of Object.keys(EMAILS)) {
    await svc('DELETE', `/rest/v1/user_profiles?user_id=eq.${uid[k]}`);
    await svc('DELETE', `/rest/v1/guild_members?user_id=eq.${uid[k]}`);
  }
  const gs = await svc('GET', `/rest/v1/guilds?name=like.T052W2*&select=id`);
  for (const row of (Array.isArray(gs.body) ? gs.body : [])) await svc('DELETE', `/rest/v1/guilds?id=eq.${row.id}`);
  for (const k of Object.keys(EMAILS)) await svc('DELETE', `/auth/v1/admin/users/${uid[k]}`);
  const leftG = await svc('GET', `/rest/v1/guilds?name=like.T052W2*&select=id`);
  const leftU = await svc('GET', `/rest/v1/guild_members?user_id=in.(${Object.values(uid).join(',')})&select=user_id`);
  const leftP = await svc('GET', `/rest/v1/user_profiles?user_id=in.(${Object.values(uid).join(',')})&select=user_id`);
  check('C1 测试公会清零', Array.isArray(leftG.body) && leftG.body.length === 0, Array.isArray(leftG.body) ? leftG.body.length : leftG.status);
  check('C2 测试成员清零', Array.isArray(leftU.body) && leftU.body.length === 0);
  check('C3 测试偏好行清零', Array.isArray(leftP.body) && leftP.body.length === 0);
}

async function login(page, email) {
  await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
  await page.fill('#authEmail', email);
  await page.fill('#authPassword', PWD);
  await page.click('#authLoginBtn');
}
async function logout(page) {
  await page.evaluate(() => handleSignOut());
  await page.waitForSelector('#authOverlay', { state: 'visible', timeout: 20000 });
  // 兜底回登录表单：若上一路径停在公会表单（D 邀请码加入/H 建会），遮罩重开时它仍挂着——
  // 等价于用户点「返回登录」，真实界面本就有此出口
  await page.evaluate(() => showLoginForm());
  await page.waitForSelector('#authLoginForm', { state: 'visible', timeout: 20000 });
}

async function browserChecks() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const jsErrors = [], httpBad = [];
  page.on('pageerror', e => jsErrors.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) jsErrors.push('console: ' + msg.text()); });
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('user_profiles') && !r.url().includes('assets/icons/items/')) httpBad.push(`${r.status()} ${r.url()}`); });

  // ---- B1：未登录登录墙公示链接行 ----
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#authLoginForm', { state: 'visible', timeout: 20000 });
  const wall = await page.evaluate(() => {
    const row = document.querySelector('.auth-public-links');
    const links = row ? [...row.querySelectorAll('a')].map(a => ({ href: a.getAttribute('href'), target: a.target, text: a.textContent })) : [];
    return { visible: !!row && row.offsetParent !== null, text: row ? row.textContent.trim() : '', links };
  });
  check('B1a 登录墙公示链接行可见+文案', wall.visible && wall.text.includes('无需登录：'), wall.text);
  check('B1b 链接两枚=decor.html/data.html 新 Tab', wall.links.length === 2 && wall.links[0].href === 'decor.html' && wall.links[1].href === 'data.html' && wall.links.every(l => l.target === '_blank'));
  await page.locator('#authOverlay').screenshot({ path: path.join(SHOT_DIR, '03-loginwall-links.png') });

  // ---- B2：D 真走无公会遮罩（REQ-138 新主次 + 主链路邀请码加入） ----
  await login(page, EMAILS.D);
  await page.waitForSelector('#authGuildForm', { state: 'visible', timeout: 30000 });
  const mask = await page.evaluate(() => {
    const gf = document.getElementById('authGuildForm');
    const fields = [...gf.querySelectorAll('.auth-field')];
    const btns = [...gf.querySelectorAll('button')].map(b => ({ text: b.textContent.trim(), cls: b.className }));
    return {
      hint: gf.querySelector('.auth-guild-hint').textContent.trim(),
      firstFieldHasInvite: !!fields[0] && !!fields[0].querySelector('#joinInviteCode'),
      firstHint: fields[0] ? (fields[0].querySelector('.auth-field-hint') || {}).textContent : null,
      secondHint: fields[1] ? (fields[1].querySelector('.auth-field-hint') || {}).textContent : null,
      btns,
    };
  });
  check('B2a 遮罩提示语=加入公会后即可使用全部功能', mask.hint === '加入公会后即可使用全部功能', mask.hint);
  check('B2b 第一区块=邀请码+引导「团员请向会长索取 8 位邀请码」', mask.firstFieldHasInvite && mask.firstHint === '团员请向会长索取 8 位邀请码', mask.firstHint);
  check('B2c 次级引导「你是会长？创建新公会」在场', mask.secondHint === '你是会长？创建新公会', mask.secondHint);
  check('B2d 按钮序与定级=加入(primary)→创建(ghost)→返回(ghost)',
    mask.btns.length === 3 && mask.btns[0].text === '加入公会' && mask.btns[0].cls.includes('btn-primary')
    && mask.btns[1].text === '创建公会' && mask.btns[1].cls.includes('btn-ghost') && !mask.btns[1].cls.includes('btn-primary')
    && mask.btns[2].text === '返回登录' && mask.btns[2].cls.includes('btn-ghost'), mask.btns.map(b => b.text).join('→'));
  await page.locator('#authOverlay').screenshot({ path: path.join(SHOT_DIR, '04-guild-overlay-new.png') });
  // 错误邀请码：提示+表单不关
  await page.fill('#joinInviteCode', 'BADCODE9');
  await page.evaluate(() => handleJoinGuild());
  await sleep(1500);
  const wrongCode = await page.evaluate(() => ({
    err: document.getElementById('authError').textContent.trim(),
    formStillOn: document.getElementById('authGuildForm').style.display !== 'none' && document.getElementById('authOverlay').style.display !== 'none',
  }));
  check('B2e 错误邀请码=错误提示+遮罩不关', wrongCode.err.length > 0 && wrongCode.formStillOn, wrongCode.err);
  // 正确邀请码主链路：加入 E 会成功进 dashboard
  await page.fill('#joinInviteCode', INVITE);
  await page.evaluate(() => handleJoinGuild());
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  const joined = await page.evaluate(() => document.getElementById('guildName').textContent.trim());
  check('B2f 邀请码主链路加入成功（遮罩消失+进 dashboard+公会名正确）', joined === 'T052W2验收会', joined);

  // ---- B3：H 建会流程回归不破 ----
  await logout(page);
  await login(page, EMAILS.H);
  await page.waitForSelector('#authGuildForm', { state: 'visible', timeout: 30000 });
  await page.fill('#newGuildName', 'T052W2建会回归');
  await page.evaluate(() => handleCreateGuild());
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  const created = await page.evaluate(() => document.getElementById('guildName').textContent.trim());
  check('B3 创建公会次级路径回归不破', created === 'T052W2建会回归', created);

  // ---- B4：owner E 双卡可见+跳转+截图 ----
  await logout(page);
  await login(page, EMAILS.E);
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  await sleep(800);
  const cardsInfo = await page.evaluate(() => {
    const wrap = document.querySelector('#page-dashboard .entry-cards');
    const cards = [...document.querySelectorAll('#page-dashboard .entry-card')];
    const grid = document.getElementById('statsGrid');
    return {
      count: cards.length,
      beforeStats: !!wrap && !!grid && wrap.compareDocumentPosition(grid) === Node.DOCUMENT_POSITION_FOLLOWING,
      titles: cards.map(c => c.querySelector('.entry-card-title').textContent.trim()),
      statsAlive: grid.children.length,
    };
  });
  check('B4a 双卡可见+位于统计卡前+既有统计区块不受影响', cardsInfo.count === 2 && cardsInfo.beforeStats && cardsInfo.statsAlive === 4, `卡${cardsInfo.count}/统计卡${cardsInfo.statsAlive}`);
  await page.locator('#page-dashboard').screenshot({ path: path.join(SHOT_DIR, '01-dashboard-cards-desktop.png') });
  // 真点击：公会卡→考勤
  await page.evaluate(() => document.querySelectorAll('#page-dashboard .entry-card')[0].click());
  await sleep(400);
  const land1 = await page.evaluate(() => document.getElementById('page-attendance').classList.contains('active')
    && document.querySelector('.nav-menu .nav-item[data-page="attendance"]').classList.contains('active'));
  check('B4b 公会团队管理卡→考勤页落地', land1);
  await page.click('.nav-menu .nav-item[data-page="dashboard"]');
  await sleep(300);
  // 真点击：家宅卡→decor 懒挂载
  await page.evaluate(() => document.querySelectorAll('#page-dashboard .entry-card')[1].click());
  await page.waitForSelector('#page-decor .dh-card', { state: 'visible', timeout: 30000 });
  const land2 = await page.evaluate(() => document.getElementById('page-decor').classList.contains('active')
    && document.querySelector('.nav-menu .nav-item[data-page="decor"]').classList.contains('active'));
  check('B4c 家宅卡→decor 页签落地+懒挂载触发', land2);
  await page.click('.nav-menu .nav-item[data-page="dashboard"]');
  await sleep(300);
  // 768 纵排
  await page.setViewportSize({ width: 390, height: 768 });
  await sleep(400);
  const stacked = await page.evaluate(() => {
    const [c1, c2] = [...document.querySelectorAll('#page-dashboard .entry-card')].map(c => c.getBoundingClientRect());
    return c2.top >= c1.bottom - 1 && Math.abs(c1.left - c2.left) < 2;
  });
  check('B4d 768 窄屏双卡纵排', stacked);
  await page.screenshot({ path: path.join(SHOT_DIR, '02-dashboard-cards-390.png') });
  await page.setViewportSize({ width: 1366, height: 768 });
  await sleep(300);

  // ---- B5：editor / viewer 各一张（卡片全角色可见） ----
  await logout(page);
  await login(page, EMAILS.F);
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  await sleep(600);
  const fCards = await page.evaluate(() => document.querySelectorAll('#page-dashboard .entry-card').length);
  check('B5a editor 见双卡', fCards === 2);
  await page.locator('#page-dashboard').screenshot({ path: path.join(SHOT_DIR, '05-dashboard-cards-editor.png') });
  await logout(page);
  await login(page, EMAILS.G);
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  await sleep(600);
  const gInfo = await page.evaluate(() => ({
    cards: document.querySelectorAll('#page-dashboard .entry-card').length,
    viewerMode: document.body.classList.contains('viewer-mode'),
  }));
  check('B5b viewer 见双卡+viewer-mode 类在', gInfo.cards === 2 && gInfo.viewerMode);
  await page.locator('#page-dashboard').screenshot({ path: path.join(SHOT_DIR, '06-dashboard-cards-viewer.png') });

  check('B6a 零 JS 错误', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | ') || '无');
  check('B6b 零 4xx/5xx（白名单同 WP1）', httpBad.length === 0, httpBad.slice(0, 3).join(' | ') || '无');

  await browser.close();
}

// ---------- 主流程 ----------
(async () => {
  console.log('== A. 静态断言 ==');
  staticChecks();

  console.log('== B. 浏览器实测（自起服务器 :%d）==', PORT);
  serverProc = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) { up = true; break; } } catch {}
    await sleep(500);
  }
  if (!up) { check('B0 服务器启动', false); } else {
    try {
      await setup();
      await browserChecks();
    } catch (e) {
      check('B 浏览器实测流程异常中断', false, e.message);
      console.error(e);
    } finally {
      try { await cleanup(); } catch (e) { console.error('清理异常:', e.message); }
    }
  }
  if (serverProc) serverProc.kill();

  const fails = results.filter(r => !r.ok);
  console.log(`\n== 汇总：${results.length - fails.length}/${results.length} 通过 ==`);
  if (fails.length) { console.log('失败项：' + fails.map(f => f.name).join('；')); process.exit(1); }
})();
