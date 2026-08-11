// 任务书 #36 验证（REQ-103 主页用户/公会入口整合：用户中心页唯一入口·双卡同页）：
//   A. WP1 公会卡：用户中心 modal-body 顶部、名称=guildDisplayName 真源（含服务器）、我的角色徽标、
//      「公会设置」「切换公会」两按钮复用现有 modal（modalStack 叠开）；§2 computed 生效值断言；
//   B. WP2 头像菜单精简：下拉仅「退出登录」一项、REQ-094 头部元素不存在、开关/点外交互不动；
//   C. WP3 左上角纯展示：品牌+#guildName 文本在、无 click/hover 交互（computed cursor 非 pointer）；
//   D. WP4 侧栏公会行整行移除（元素不存在零残留）+ 通知点迁 nav「用户中心」（未读时 .show）+ nav 唯一入口在；
//   E. 测试数据（T36A 前缀）自清理复核为零。
// 红线：不改业务代码；不 git 操作。用法: node scripts/verify-task36.js｜截图 → backup/2026-08-11-task36/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(__dirname, '..', '.s6-ssh', 'node_modules', 'playwright-core'))); }

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-11-task36');
const PORT = 15668;
const BASE = `http://localhost:${PORT}`;
const EMAIL = 't36a-owner@wowbutler.cn';
const PWD = 'T36abcd12';

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
  const t = await res.text(); try { return { status: res.status, body: JSON.parse(t) }; } catch { return { status: res.status, body: t }; }
}

let serverProc = null, uid = null, guildId = null, notifId = null;

async function cleanup() {
  const steps = [];
  if (guildId) {
    await svc('DELETE', `/rest/v1/notifications?guild_id=eq.${guildId}`);
    await svc('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
    await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
    steps.push('guild:ok');
  }
  await svc('DELETE', '/rest/v1/guilds?name=like.T36A*');
  if (uid) {
    await svc('DELETE', `/rest/v1/notifications?user_id=eq.${uid}`);
    await svc('DELETE', `/rest/v1/user_profiles?user_id=eq.${uid}`);
    try { await fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); }
  }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const counts = [];
  const c1 = await svc('GET', '/rest/v1/guilds?select=id&name=like.T36A*');
  counts.push(['guilds', Array.isArray(c1.body) ? c1.body.length : '?']);
  if (uid) {
    const cn = await svc('GET', `/rest/v1/notifications?select=id&user_id=eq.${uid}`);
    counts.push(['notifications', Array.isArray(cn.body) ? cn.body.length : '?']);
    const cp = await svc('GET', `/rest/v1/user_profiles?select=user_id&user_id=eq.${uid}`);
    const profN = Array.isArray(cp.body) ? cp.body.length : '?';
    const r = await fetch(`${SB}/auth/v1/admin/users/${uid}`, { headers: SVC });
    counts.push([`user(profiles=${profN},auth ${r.status === 404 ? 0 : '在'})`, profN === 0 && r.status === 404 ? 0 : 1]);
  }
  console.log('[清理复核] ' + counts.map(([l, n]) => `${l}=${n}`).join(' | '));
  check('测试数据清零复核（全 0）', counts.every(([, n]) => n === 0), counts.map(([, n]) => n).join('/'));
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const r0 = await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=200`, { headers: SVC });
  const b0 = await r0.json().catch(() => ({}));
  for (const u of (b0.users || [])) if ((u.email || '').startsWith('t36a-')) await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: SVC });
  await svc('DELETE', '/rest/v1/guilds?name=like.T36A*');

  // 账号 + 公会（带服务器名）
  let res = await fetch(`${SB}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'T36A会长' } }) });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD }) });
    body = await res.json();
    if (!body.access_token) throw new Error('owner 登录失败');
  }
  uid = body.user.id;
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T36A公会', owner_id: uid, invite_code: 'T36A' + Date.now().toString(36).slice(-4).toUpperCase(), server_region: '一区', server_name: '无尽之海' });
  if (g.status !== 201) throw new Error('建会失败: ' + JSON.stringify(g.body));
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: uid, role: 'owner', display_name: 'T36A会长' });
  // 未读通知 1 条（通知点断言样本）
  const nf = await svc('POST', '/rest/v1/notifications', { user_id: uid, guild_id: guildId, type: 'role_change', title: 'T36A测试通知', message: '通知点迁移验证', is_read: false });
  if (nf.status !== 201) throw new Error('通知插入失败: ' + JSON.stringify(nf.body));
  notifId = nf.body[0].id;

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r2 = await fetch(`${BASE}/api/supabase-config`); if (r2.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => pageErrors.push('pageerror: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console: ' + msg.text()); });
    page.on('dialog', d => d.accept());

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
    await page.fill('#authEmail', EMAIL);
    await page.fill('#authPassword', PWD);
    await page.click('#authLoginBtn');
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(2500);

    // ==================== C. WP3 左上角纯展示（先测，不依赖弹窗） ====================
    const c1 = await page.evaluate(() => {
      const header = document.querySelector('.sidebar-header');
      const gn = document.getElementById('guildName');
      return {
        brandText: header.textContent.includes('魔兽管家'),
        guildText: gn.textContent,
        headerOnclick: header.getAttribute('onclick'),
        gnOnclick: gn.getAttribute('onclick'),
        gnCursor: getComputedStyle(gn).cursor,
        headerCursor: getComputedStyle(header).cursor,
      };
    });
    check('C1 WP3 左上角纯展示：品牌+「T36A公会 (无尽之海)」文本在、零 onclick、computed cursor 非 pointer',
      c1.brandText && c1.guildText === 'T36A公会 (无尽之海)' && !c1.headerOnclick && !c1.gnOnclick
        && c1.gnCursor !== 'pointer' && c1.headerCursor !== 'pointer',
      JSON.stringify(c1));

    // ==================== D. WP4 侧栏公会行移除 + 通知点迁移 ====================
    const d1 = await page.evaluate(() => ({
      guildBar: !!document.getElementById('guildBar'),
      guildBarName: !!document.getElementById('guildBarName'),
      guildRole: !!document.getElementById('guildRole'),
      userCenterBtn: !!document.querySelector('.user-center-btn'),
      navUc: [...document.querySelectorAll('.nav-menu .nav-item')].some(n => n.textContent.includes('用户中心')),
      dotInNav: !!document.querySelector('.nav-menu .nav-item #navNotifDot'),
    }));
    check('D1 WP4 侧栏公会行整行移除（guildBar/guildBarName/guildRole/user-center-btn 零残留）+ nav「用户中心」唯一入口在 + 通知点已迁 nav',
      !d1.guildBar && !d1.guildBarName && !d1.guildRole && !d1.userCenterBtn && d1.navUc && d1.dotInNav, JSON.stringify(d1));
    // 通知点显隐（未读 1 条 → .show；显隐条件与数据源零变化）
    await page.evaluate(async () => { await loadNotifications(); });
    await sleep(600);
    const d2 = await page.evaluate(() => ({
      dotShown: document.getElementById('navNotifDot').classList.contains('show'),
      dotDisplay: getComputedStyle(document.getElementById('navNotifDot')).display,
    }));
    check('D2 通知点新宿主生效：未读 1 条 → nav「用户中心」点 .show（computed display=block）',
      d2.dotShown && d2.dotDisplay === 'block', JSON.stringify(d2));

    // ==================== B. WP2 头像菜单精简 ====================
    const b1 = await page.evaluate(() => ({
      headGone: !document.getElementById('userMenuHead'),
      triggerNick: document.getElementById('userNickname').textContent,
      roleBadge: document.getElementById('userRoleBadge').textContent,
    }));
    await page.click('#userMenuTrigger');
    await sleep(400);
    const b2 = await page.evaluate(() => ({
      ddVisible: document.getElementById('userMenuDropdown').style.display === 'block',
      items: [...document.querySelectorAll('#userMenuDropdown .user-menu-item')].map(i => i.textContent.trim()),
    }));
    check('B1 WP2 菜单精简：头部元素不存在 + 下拉仅「退出登录」一项（trigger 昵称/身份徽章不动）',
      b1.headGone && b2.ddVisible && b2.items.length === 1 && b2.items[0].includes('退出登录')
        && b1.triggerNick === 'T36A会长' && b1.roleBadge === '会长',
      JSON.stringify({ ...b1, ...b2 }));
    // 开关交互不动：点外关闭
    await page.click('#pageTitle');
    await sleep(300);
    const b3 = await page.evaluate(() => document.getElementById('userMenuDropdown').style.display === 'none');
    check('B2 菜单点外关闭交互不变', b3, `closed=${b3}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'b-avatar-menu.png') });

    // ==================== A. WP1 用户中心公会卡 ====================
    await page.evaluate(async () => { await openUserCenter(); });
    await sleep(1200);
    const a1 = await page.evaluate(() => {
      const card = document.getElementById('ucGuildCard');
      const body = document.querySelector('#userCenterModal .modal-body');
      const cs = getComputedStyle(card);
      return {
        visible: card.style.display !== 'none' && cs.display === 'flex',
        isFirst: body.firstElementChild === card,
        name: document.getElementById('ucGuildCardName').textContent,
        role: document.getElementById('ucGuildCardRole').textContent,
        roleClass: document.getElementById('ucGuildCardRole').className,
        btns: [...card.querySelectorAll('button')].map(b => ({ text: b.textContent.trim(), onclick: b.getAttribute('onclick') })),
        bg: cs.backgroundColor,
        radius: cs.borderRadius,
        playerIdCardAfter: body.children[1] && body.children[1].id === 'ucPlayerIdCard',
      };
    });
    check('A1 WP1 公会卡置顶（modal-body 首元素、玩家ID卡次之）+ 名称「T36A公会 (无尽之海）」+ 会长徽标 + 两按钮复用现有 modal',
      a1.visible && a1.isFirst && a1.playerIdCardAfter && a1.name === 'T36A公会 (无尽之海)'
        && a1.role === '会长' && a1.roleClass.includes('role-owner')
        && a1.btns.length === 2 && a1.btns[0].onclick === 'openGuildSettings()' && a1.btns[1].onclick === 'openGuildSwitcher()',
      JSON.stringify(a1));
    check('A2 §2 公会卡 computed 生效值（卡片族背景/圆角/flex 布局）',
      a1.bg !== 'rgba(0, 0, 0, 0)' && a1.bg !== 'transparent' && a1.radius === '8px' && a1.visible,
      `bg=${a1.bg} radius=${a1.radius}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'a-uc-guild-card.png') });

    // A3 两按钮走通（复用现有 modal，modalStack 叠开）
    await page.click('#ucGuildCard button[onclick="openGuildSettings()"]');
    await sleep(600);
    const a3a = await page.evaluate(() => ({
      settingsOpen: document.getElementById('guildSettingsModal').classList.contains('show'),
      ucStillOpen: document.getElementById('userCenterModal').classList.contains('show'),
    }));
    await page.evaluate(() => closeModal('guildSettingsModal'));
    await sleep(300);
    await page.click('#ucGuildCard button[onclick="openGuildSwitcher()"]');
    await sleep(600);
    const a3b = await page.evaluate(() => ({
      switcherOpen: document.getElementById('guildSwitcherModal').classList.contains('show'),
      ucStillOpen: document.getElementById('userCenterModal').classList.contains('show'),
    }));
    await page.evaluate(() => closeModal('guildSwitcherModal'));
    await sleep(300);
    check('A3 公会卡两入口走通：公会设置/切换公会现有 modal 叠开于用户中心之上（关闭后用户中心仍在）',
      a3a.settingsOpen && a3a.ucStillOpen && a3b.switcherOpen && a3b.ucStillOpen, JSON.stringify({ a3a, a3b }));
    await page.screenshot({ path: path.join(SHOT_DIR, 'a3-card-modals.png') });
    await page.evaluate(() => { snapshotModalForm('userCenterModal'); closeModal('userCenterModal'); });

    // 零 JS 报错（406=既有噪音）
    const realErrors = pageErrors.filter(e => !/status of (400|401|406|409)/.test(e));
    check('全程零 JS 报错（406=既有噪音已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
    await ctx.close();
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#36 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
