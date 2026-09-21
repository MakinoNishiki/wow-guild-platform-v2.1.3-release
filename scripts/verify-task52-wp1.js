// 任务书 #52 WP1 验收（REQ-137 一期收尾·导航两组式，纯结构归组零行为变更 + 小宠物图鉴预留位灰态）
// 覆盖（任务书 WP1 验收口径 + 顾问闸授权边界）：
//   A. 静态断言：①index.html 组头两枚（无 .nav-item 类/onclick/data-page）+ 家宅组内项序=图鉴→宠物预留
//      + 预留位无 onclick/data-page/navkey + changelog 沉底至 usercenter 之上；②版本串 20260919.68
//      三壳计数与旧串零残留；③node --check js/app.js；④app.js 三函数适配锚点（applyNavOrder 组头重定位 /
//      refreshNavDraggable 禁用钉死 / dragend 落定重定位）+ persistNavOrder 写库链路零变更；
//      ⑤main.css .nav-group-label / .nav-item-disabled / .sidebar-title 700 锚点。
//   B. 登录壳真浏览器（自建 T052 三用户：A=owner / B=editor / C=超管，结束后自清理）：
//      B1 owner 登录：组头两枚可见、家宅组序 decor→#navPets、预留位 cursor default+draggable=false+无 onclick、
//         changelog 在 usercenter 之上、全部导航项逐一点击切换正常（含 lootdrop/decor 懒挂载）、
//         usercenter 开弹窗、零 JS 错误零 4xx/5xx（user_profiles 409 首登竞态白名单）；
//      B2 截图 desktop 侧边栏两组态（含预留位灰态）；
//      B3 拖拽回归：心愿单拖至成员管理前→落定后组头即时归位→刷新后序保持（nav_order 持久化）；
//      B4 换账号序不串（BUG-078 快照链）：同浏览器退出 A 登录 B（editor）→导航回默认序、组头归位、拖拽可用；
//      B5 ≤768 拖拽禁用（resize 390 宽全项 draggable=false）+ 窄屏截图（侧栏 display:none 已知取舍，另截 769px 组头不破位）；
//      B6 超管 C 登录：数据中心可见且位于数据管理与副本掉落之间（公会组内）；
//      C. T052 三用户/公会/偏好行清零复核；逐项 ✓/✗ 汇总，任一 ✗ 退出码 1。
// 用法: node scripts/verify-task52-wp1.js（PW_CHANNEL=chrome 可选）
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-09-19-task52-wp1');
const PORT = 15052;
const BASE = `http://127.0.0.1:${PORT}`;
const PWD = 'T052-Test-2026!';
const VER = '20260919.68';
const USERS = {
  A: { email: 't052a-owner@wowbutler.cn', role: 'owner', guild: 'T052验收会A' },
  B: { email: 't052b-editor@wowbutler.cn', role: 'editor', guild: null }, // 入 A 会
  C: { email: 't052c-admin@wowbutler.cn', role: 'owner', guild: 'T052验收会C', superadmin: true },
};

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
async function svc(method, restPath, body, extraHeaders) {
  const res = await fetch(`${SB}${restPath}`, { method, headers: { ...SVC, ...(extraHeaders || {}) }, body: body ? JSON.stringify(body) : undefined });
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

  // A1 组头两枚：文案、无 .nav-item 类、无 onclick、无 data-page/navkey
  const labelMatches = [...html.matchAll(/<div class="nav-group-label" data-nav-group="(guild|home)">([^<]+)<\/div>/g)];
  check('A1a 组头恰好两枚', labelMatches.length === 2, labelMatches.map(m => m[2]).join('/'));
  check('A1b 组头文案=公会团队管理/家宅', labelMatches.length === 2 && labelMatches[0][2] === '公会团队管理' && labelMatches[1][2] === '家宅');
  const labelBlocks = [...html.matchAll(/<div class="nav-group-label"[^>]*>/g)].map(m => m[0]);
  check('A1c 组头无 nav-item 类/onclick/data-page', labelBlocks.every(b => !/nav-item|onclick|data-page|data-navkey/.test(b)));

  // A2 家宅组内项序=图鉴→宠物预留；预留位灰态口径
  const navMenu = html.split('<nav class="nav-menu">')[1].split('</nav>')[0];
  const iDecor = navMenu.indexOf('data-page="decor"');
  const iPets = navMenu.indexOf('id="navPets"');
  const iHomeLabel = navMenu.indexOf('data-nav-group="home"');
  check('A2a 家宅组序=组头→图鉴→宠物预留', iHomeLabel > -1 && iHomeLabel < iDecor && iDecor < iPets);
  const petsBlock = navMenu.match(/<div class="nav-item-disabled" id="navPets"[^>]*>/);
  check('A2b 预留位无 onclick/data-page/data-navkey', !!petsBlock && !/onclick|data-page|data-navkey/.test(petsBlock[0]));
  check('A2c 预留位 title+aria-disabled+🐾', !!petsBlock && petsBlock[0].includes('title="数据侦察中，敬请期待"') && petsBlock[0].includes('aria-disabled="true"') && navMenu.includes('🐾'));

  // A3 归组明细与 changelog 沉底
  check('A3a 公会组 9 项 data-nav-group="guild"', (navMenu.match(/class="nav-item[^"]*"[^>]*data-nav-group="guild"/g) || []).length === 9);
  check('A3b 家宅组 1 项 data-nav-group="home"（decor）', (navMenu.match(/data-page="decor" data-nav-group="home"/g) || []).length === 1);
  const iChangelog = navMenu.indexOf('data-page="changelog"');
  const iUsercenter = navMenu.indexOf('data-navkey="usercenter"');
  check('A3c changelog 沉底=宠物预留之后、用户中心之上', iPets < iChangelog && iChangelog < iUsercenter);
  check('A3d changelog/usercenter 无组归属（不入组）', !/data-page="changelog" data-nav-group/.test(navMenu) && !/data-navkey="usercenter" data-nav-group/.test(navMenu));
  check('A3e 底部 Tab 零预留位（窄屏独立 DOM 不加）', !html.split('<nav class="bottom-nav">')[1].includes('navPets'));

  // A4 版本串三壳递增 + 旧串零残留
  const cnt = (s, sub) => s.split(sub).length - 1;
  check('A4a index.html 版本串 .68×14', cnt(html, VER) === 14, cnt(html, VER));
  check('A4b decor.html 版本串 .68×5', cnt(decor, VER) === 5, cnt(decor, VER));
  check('A4c data.html 版本串 .68×7', cnt(data, VER) === 7, cnt(data, VER));
  check('A4d 旧串零残留（.67/.65）', cnt(html, '20260919.67') + cnt(decor, '20260919.67') + cnt(data, '20260918.65') === 0);

  // A5 node --check
  const nc = spawnSync('node', ['--check', path.join(ROOT, 'js', 'app.js')]);
  check('A5 node --check js/app.js', nc.status === 0, nc.status);

  // A6 app.js 三函数适配锚点 + 写库链路零变更
  check('A6a applyNavOrder 组头随组重定位', /nav-group-label\[data-nav-group\]/.test(app) && /decorNavItem\.after\(petsSlot\)/.test(app));
  check('A6b refreshNavDraggable 组头/预留位 draggable 钉死 false', /nav-group-label, \.nav-menu \.nav-item-disabled'\)\.forEach\(el => \{ el\.draggable = false/.test(app));
  check('A6c dragend 落定先重定位再写库', /applyNavOrder\(currentNavOrder\(\)\);\s*\n\s*persistNavOrder\(\)/.test(app));
  check('A6d persistNavOrder 写库/回滚链路零变更', /await CloudSync\.savePreference\('nav_order', order\)/.test(app) && /applyNavOrder\(navOrderBeforeDrag\)/.test(app));

  // A7 main.css 锚点
  check('A7a .nav-group-label 规则在场', /\.nav-group-label \{[\s\S]*?letter-spacing: 0\.08em/.test(css));
  check('A7b .nav-item-disabled 灰态规则在场', /\.nav-item-disabled \{[\s\S]*?opacity: 0\.55/.test(css));
  check('A7c .sidebar-title 字重 700（审计①）', /\.sidebar-title \{\s*font-size: 16px;\s*font-weight: 700/.test(css));
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
  for (const k of ['A', 'B', 'C']) {
    const u = await signUpOrIn(USERS[k].email, `T052验收${k}`);
    uid[k] = u.uid;
  }
  // A/C 各自建会（owner），B 以 editor 入 A 会
  for (const k of ['A', 'C']) {
    const g = await svc('POST', '/rest/v1/guilds', { name: USERS[k].guild, owner_id: uid[k], invite_code: 'T52' + k + Date.now().toString(36).slice(-4).toUpperCase() });
    if (g.status !== 201) throw new Error(`建会${k}失败: ` + JSON.stringify(g.body));
    gid[k] = g.body[0].id;
    const gm = await svc('POST', '/rest/v1/guild_members', { guild_id: gid[k], user_id: uid[k], role: 'owner' });
    if (gm.status !== 201) throw new Error(`建会成员${k}失败: ` + JSON.stringify(gm.body));
  }
  const gb = await svc('POST', '/rest/v1/guild_members', { guild_id: gid.A, user_id: uid.B, role: 'editor' });
  if (gb.status !== 201) throw new Error('B 入会失败: ' + JSON.stringify(gb.body));
  // C 提超管（app_metadata.role='superadmin'，与运营 Dashboard 手工设置同效）
  const adm = await svc('PUT', `/auth/v1/admin/users/${uid.C}`, { app_metadata: { role: 'superadmin' } });
  if (adm.status !== 200) throw new Error('C 提超管失败: ' + JSON.stringify(adm.body));
}

async function cleanup() {
  for (const k of ['A', 'B', 'C']) {
    await svc('DELETE', `/rest/v1/user_profiles?user_id=eq.${uid[k]}`);
    await svc('DELETE', `/rest/v1/guild_members?user_id=eq.${uid[k]}`);
  }
  for (const k of ['A', 'C']) await svc('DELETE', `/rest/v1/guilds?id=eq.${gid[k]}`);
  for (const k of ['A', 'B', 'C']) await svc('DELETE', `/auth/v1/admin/users/${uid[k]}`);
  // 清零复核
  const leftG = await svc('GET', `/rest/v1/guilds?name=like.T052*&select=id`);
  const leftU = await svc('GET', `/rest/v1/guild_members?user_id=in.(${uid.A},${uid.B},${uid.C})&select=user_id`);
  const leftP = await svc('GET', `/rest/v1/user_profiles?user_id=in.(${uid.A},${uid.B},${uid.C})&select=user_id`);
  check('C1 测试公会清零', Array.isArray(leftG.body) && leftG.body.length === 0, Array.isArray(leftG.body) ? leftG.body.length : leftG.status);
  check('C2 测试成员清零', Array.isArray(leftU.body) && leftU.body.length === 0);
  check('C3 测试偏好行清零', Array.isArray(leftP.body) && leftP.body.length === 0);
}

async function login(page, email) {
  await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
  await page.fill('#authEmail', email);
  await page.fill('#authPassword', PWD);
  await page.click('#authLoginBtn');
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  await sleep(800); // 等 loadUserPreferences 落地
}

async function browserChecks() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const jsErrors = [], httpBad = [];
  page.on('pageerror', e => jsErrors.push('pageerror: ' + e.message));
  // 资源加载失败走 httpBad（带 URL 可白名单），console 的 "Failed to load resource" 无 URL 属重复报告，跳过
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) jsErrors.push('console: ' + msg.text()); });
  // 白名单：user_profiles 409 首登竞态（既有先例）；assets/icons/items/* 404=物品图标缺素材 onerror 隐藏（REQ-092 既定行为）
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('user_profiles') && !r.url().includes('assets/icons/items/')) httpBad.push(`${r.status()} ${r.url()}`); });

  // ---- B1/B2：owner A ----
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await login(page, USERS.A.email);

  const struct = await page.evaluate(() => {
    const menu = document.querySelector('.nav-menu');
    const kids = [...menu.children];
    const seq = kids.map(el => el.classList.contains('nav-group-label') ? `LABEL:${el.textContent.trim()}`
      : el.id === 'navPets' ? 'PETS' : (el.dataset.page || el.dataset.navkey || '?'));
    const labels = [...menu.querySelectorAll('.nav-group-label')];
    const pets = document.getElementById('navPets');
    return {
      seq,
      labelsVisible: labels.every(l => l.offsetParent !== null),
      labelCount: labels.length,
      pets: {
        onclick: pets.getAttribute('onclick'), draggable: pets.draggable,
        cursor: getComputedStyle(pets).cursor, hasNavItem: pets.classList.contains('nav-item'),
        title: pets.getAttribute('title'),
      },
    };
  });
  check('B1a 组头两枚可见', struct.labelsVisible && struct.labelCount === 2);
  const expectSeq = ['LABEL:公会团队管理', 'dashboard', 'members', 'attendance', 'loot', 'wishlist', 'reports', 'data', 'datacenter', 'lootdrop', 'LABEL:家宅', 'decor', 'PETS', 'changelog', 'usercenter'];
  check('B1b 侧栏序列=两组+预留位+changelog沉底', JSON.stringify(struct.seq) === JSON.stringify(expectSeq), struct.seq.join('→'));
  check('B1c 预留位灰态（无onclick/无nav-item类/draggable=false/cursor default/title）',
    !struct.pets.onclick && !struct.pets.hasNavItem && struct.pets.draggable === false && struct.pets.cursor === 'default' && struct.pets.title === '数据侦察中，敬请期待');

  // 全部导航项逐一点击切换
  const pages = ['members', 'attendance', 'loot', 'wishlist', 'reports', 'data', 'changelog', 'lootdrop', 'decor', 'dashboard'];
  let clickOk = true, clickDetail = '';
  for (const p of pages) {
    await page.click(`.nav-menu .nav-item[data-page="${p}"]`);
    await sleep(300);
    const st = await page.evaluate(pp => ({
      active: document.querySelector(`.nav-menu .nav-item[data-page="${pp}"]`).classList.contains('active'),
      pageOn: document.getElementById(`page-${pp}`).classList.contains('active'),
    }), p);
    if (!st.active || !st.pageOn) { clickOk = false; clickDetail = p; break; }
  }
  check('B1d 全部导航项逐一点击切换正常（10 页）', clickOk, clickDetail || '全过');
  // 懒挂载：lootdrop/decor 内容真实渲染
  await page.click('.nav-menu .nav-item[data-page="lootdrop"]');
  await page.waitForSelector('#page-lootdrop .dp-card, #page-lootdrop .dp-item, #page-lootdrop [class*="dp-"]', { state: 'attached', timeout: 30000 });
  await page.click('.nav-menu .nav-item[data-page="decor"]');
  await page.waitForSelector('#page-decor .dh-card', { state: 'visible', timeout: 30000 });
  check('B1e lootdrop/decor 懒挂载不受影响', true);
  // usercenter 弹窗
  await page.click('.nav-menu .nav-item[data-navkey="usercenter"]');
  await page.waitForSelector('#userCenterModal', { state: 'visible', timeout: 10000 });
  check('B1f 用户中心弹窗开合正常', true);
  await page.keyboard.press('Escape');
  await sleep(300);

  await page.click('.nav-menu .nav-item[data-page="dashboard"]');
  await page.locator('#sidebar').screenshot({ path: path.join(SHOT_DIR, '01-sidebar-desktop.png') });

  // ---- B3：拖拽回归（心愿单 → 成员管理前） ----
  const dragSeq = await page.evaluate(async () => {
    const menu = document.querySelector('.nav-menu');
    const item = menu.querySelector('.nav-item[data-page="wishlist"]');
    const target = menu.querySelector('.nav-item[data-page="members"]');
    const dt = new DataTransfer();
    item.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    menu.insertBefore(item, target); // 模拟 dragover 实时插入位
    item.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    await new Promise(r => setTimeout(r, 1500)); // 等 persistNavOrder 写库
    return [...document.querySelectorAll('.nav-menu .nav-item')].map(it => it.dataset.page || it.dataset.navkey);
  });
  const wishIdx = dragSeq.indexOf('wishlist'), memIdx = dragSeq.indexOf('members');
  check('B3a 拖拽落定：心愿单位于成员管理之前', wishIdx > -1 && memIdx > -1 && wishIdx < memIdx, dragSeq.slice(0, 4).join('→'));
  const labelPosAfterDrag = await page.evaluate(() => {
    const kids = [...document.querySelector('.nav-menu').children];
    return {
      guildLabelFirst: kids[0].classList.contains('nav-group-label'),
      homeBeforeDecor: kids.findIndex(el => el.classList.contains('nav-group-label') && el.dataset.navGroup === 'home') < kids.findIndex(el => el.dataset.page === 'decor'),
      petsAfterDecor: kids.findIndex(el => el.id === 'navPets') === kids.findIndex(el => el.dataset.page === 'decor') + 1,
    };
  });
  check('B3b 拖拽后组头即时归位+预留位紧跟图鉴', labelPosAfterDrag.guildLabelFirst && labelPosAfterDrag.homeBeforeDecor && labelPosAfterDrag.petsAfterDecor);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  await sleep(1000);
  const afterReload = await page.evaluate(() => [...document.querySelectorAll('.nav-menu .nav-item')].map(it => it.dataset.page || it.dataset.navkey));
  check('B3c 刷新后拖拽序保持（nav_order 持久化）', JSON.stringify(afterReload) === JSON.stringify(dragSeq), afterReload.slice(0, 4).join('→'));
  await page.locator('#sidebar').screenshot({ path: path.join(SHOT_DIR, '03-after-drag.png') });

  // ---- B4：换账号序不串（BUG-078 快照链）+ editor 过一遍 ----
  await page.evaluate(() => handleSignOut());
  await page.waitForSelector('#authLoginForm', { state: 'visible', timeout: 20000 });
  await login(page, USERS.B.email);
  const seqB = await page.evaluate(() => [...document.querySelector('.nav-menu').children].map(el =>
    el.classList.contains('nav-group-label') ? `LABEL:${el.dataset.navGroup}` : el.id === 'navPets' ? 'PETS' : (el.dataset.page || el.dataset.navkey)));
  const expectB = ['LABEL:guild', 'dashboard', 'members', 'attendance', 'loot', 'wishlist', 'reports', 'data', 'datacenter', 'lootdrop', 'LABEL:home', 'decor', 'PETS', 'changelog', 'usercenter'];
  check('B4a 换账号(editor)序不串=默认序', JSON.stringify(seqB) === JSON.stringify(expectB), seqB.join('→'));
  const dragB = await page.evaluate(() => document.querySelector('.nav-menu .nav-item[data-page="members"]').draggable);
  check('B4b editor 桌面拖拽可用', dragB === true);

  // ---- B5：≤768 拖拽禁用 + 窄屏形态 ----
  await page.setViewportSize({ width: 390, height: 768 });
  await sleep(400);
  const narrow = await page.evaluate(() => ({
    anyDraggable: [...document.querySelectorAll('.nav-menu .nav-item')].some(it => it.draggable),
    sidebarHidden: getComputedStyle(document.getElementById('sidebar')).display === 'none',
    bottomNav: getComputedStyle(document.querySelector('.bottom-nav')).display,
  }));
  check('B5a ≤768 全部 nav-item draggable=false', narrow.anyDraggable === false);
  check('B5b ≤768 侧栏 display:none（已知取舍-封存）+ 底部 Tab 在', narrow.sidebarHidden && narrow.bottomNav === 'flex');
  await page.screenshot({ path: path.join(SHOT_DIR, '02-narrow-390.png') });
  // 769px：侧栏在，组头不破位
  await page.setViewportSize({ width: 769, height: 768 });
  await sleep(400);
  const label769 = await page.evaluate(() => [...document.querySelectorAll('.nav-group-label')].every(l => l.offsetParent !== null && l.getBoundingClientRect().width <= 200));
  check('B5c 769px 侧栏组头不破位', label769);
  await page.locator('#sidebar').screenshot({ path: path.join(SHOT_DIR, '04-sidebar-769.png') });
  await page.setViewportSize({ width: 1366, height: 768 });

  // ---- B6：超管 C——数据中心在公会组内 ----
  await page.evaluate(() => handleSignOut());
  await page.waitForSelector('#authLoginForm', { state: 'visible', timeout: 20000 });
  await login(page, USERS.C.email);
  const seqC = await page.evaluate(() => {
    const dc = document.getElementById('navDatacenter');
    const kids = [...document.querySelector('.nav-menu').children];
    return {
      dcVisible: dc && dc.style.display !== 'none' && dc.offsetParent !== null,
      dcIdx: kids.indexOf(dc),
      dataIdx: kids.findIndex(el => el.dataset.page === 'data'),
      lootIdx: kids.findIndex(el => el.dataset.page === 'lootdrop'),
    };
  });
  check('B6 超管见数据中心且位于数据管理与副本掉落之间（公会组内）',
    seqC.dcVisible && seqC.dataIdx < seqC.dcIdx && seqC.dcIdx < seqC.lootIdx, `idx data=${seqC.dataIdx} dc=${seqC.dcIdx} loot=${seqC.lootIdx}`);
  await page.locator('#sidebar').screenshot({ path: path.join(SHOT_DIR, '05-sidebar-superadmin.png') });

  check('B7 零 JS 错误', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | ') || '无');
  check('B8 零 4xx/5xx（user_profiles 409 与物品图标 404 缺素材白名单除外）', httpBad.length === 0, httpBad.slice(0, 3).join(' | ') || '无');

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
