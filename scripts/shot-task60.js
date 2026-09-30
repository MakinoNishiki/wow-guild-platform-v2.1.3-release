// 任务书 #60 WP1 送审截图：看板页筛 18 项 + nav 排行中文 label（真浏览器真数据，测试用户/公会后清理）
// 链路：service_role 造测试管理员（superadmin）+ 测试公会 → 自起 server（注入 ANALYTICS_ADMIN_UIDS）
//   → playwright 经 ?auth=login 登录 → 数据中心 → 访问统计 → 页筛 size=18 展开截图 + nav 排行面板截图
// 数据：近 30 天真实埋点含 index:home/team-guide/decor-plan/community，零测试事件注入。
// 用法: node scripts/shot-task60.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15660;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(ROOT, 'backup', '2026-09-30-task60');
const PWD = 'T60-Shot-2026!';
const EMAIL = 't60-shot@example.com';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const SVC = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };

async function svc(method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, {
    method, headers: { ...SVC, Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

let serverProc = null, uid = null, guildId = null, browser = null;

async function cleanup() {
  if (browser) await browser.close().catch(() => {});
  if (serverProc) serverProc.kill();
  if (guildId) {
    await svc('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
    await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
    const chk = await svc('GET', `/rest/v1/guilds?id=eq.${guildId}&select=id`);
    console.log('清理复核：测试公会残留=' + (Array.isArray(chk.body) ? chk.body.length : '?'));
  }
  if (uid) {
    await svc('DELETE', `/auth/v1/admin/users/${uid}`);
    const chk = await svc('GET', `/auth/v1/admin/users/${uid}`);
    console.log('清理复核：测试用户在场=' + (chk.status === 200 ? '是(异常!)' : '否'));
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // ---- 测试管理员就位（已存在则复用并强制重置密码） ----
  const created = await svc('POST', '/auth/v1/admin/users', { email: EMAIL, password: PWD, email_confirm: true });
  if (created.status === 200 || created.status === 201) {
    uid = created.body.id;
  } else {
    const list = await svc('GET', '/auth/v1/admin/users?page=1&per_page=1000');
    const found = (list.body.users || []).find(u => u.email === EMAIL);
    if (!found) throw new Error('测试用户创建失败且未找到既有：' + JSON.stringify(created.body).slice(0, 200));
    uid = found.id;
    await svc('PUT', `/auth/v1/admin/users/${uid}`, { password: PWD });
  }
  await svc('PUT', `/auth/v1/admin/users/${uid}`, { app_metadata: { role: 'superadmin' } });
  console.log('测试管理员就位 uid=' + uid.slice(0, 6) + '…（掩码）');

  const g = await svc('POST', '/rest/v1/guilds', { name: 'T60截图公会', owner_id: uid, invite_code: 'T60SHOT1', server_name: '测试', server_region: '一区' });
  guildId = g.body && g.body[0] && g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: uid, role: 'owner', display_name: 't60-shot' }]);

  // ---- 起 server ----
  serverProc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_RUN_PORT: String(PORT), ANALYTICS_ADMIN_UIDS: uid },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch { /* 未起 */ }
    await new Promise(r => setTimeout(r, 200));
  }
  console.log('服务器已起 端口 ' + PORT);

  // ---- 浏览器：登录 → 数据中心 → 访问统计 ----
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1500 }, locale: 'zh-CN', deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await pg.goto(`${BASE}/?auth=login`, { waitUntil: 'load' });
  await pg.waitForSelector('#authEmail', { state: 'visible', timeout: 15000 });
  await pg.fill('#authEmail', EMAIL);
  await pg.fill('#authPassword', PWD);
  await pg.click('#authLoginBtn');
  // 新 IA（任务书 #59）：登录落首页，侧栏隐藏；走一级 tab「团队管理」→ 二级 pill「数据中心」（超管门禁 pill 与 #navDatacenter 同源）
  await pg.waitForSelector('.ia-tab[data-ia-tab="team"]', { state: 'visible', timeout: 40000 });
  await pg.waitForFunction(() => !!(window.MasterData && MasterData.isSuperadmin && MasterData.isSuperadmin()), { timeout: 40000 });
  await pg.evaluate(() => updateCloudUI());
  await pg.click('.ia-tab[data-ia-tab="team"]');
  await pg.waitForSelector('#iaPillDatacenter', { state: 'visible', timeout: 15000 });
  const dbg = await pg.evaluate(() => ({
    isSuper: !!(window.MasterData && MasterData.isSuperadmin()),
    appMeta: (window.CloudSync && CloudSync.getCachedUser() && CloudSync.getCachedUser().app_metadata) || null,
  }));
  console.log('登录后状态：' + JSON.stringify(dbg));
  await pg.click('#iaPillDatacenter');
  await pg.click('.view-tab[data-mdtab="analytics"]');
  await pg.waitForSelector('.anx-cards .anx-card-num', { timeout: 20000 });
  await pg.waitForTimeout(300);

  // ---- 截图 1：页筛 18 项（size=18 展开原生 select 全部选项，真实 DOM 零 mock） ----
  const optInfo = await pg.evaluate(() => {
    const sel = document.getElementById('anxPage');
    const opts = [...sel.options].map(o => `${o.value} | ${o.textContent}`);
    sel.size = sel.options.length;
    return opts;
  });
  console.log('页筛选项 ' + optInfo.length + ' 项：');
  optInfo.forEach(o => console.log('  ' + o));
  await pg.waitForTimeout(150);
  const controls = await pg.locator('.anx-controls').boundingBox();
  const selBox = await pg.locator('#anxPage').boundingBox();
  const clip = {
    x: Math.min(controls.x, selBox.x),
    y: Math.min(controls.y, selBox.y),
    width: Math.max(controls.x + controls.width, selBox.x + selBox.width) - Math.min(controls.x, selBox.x),
    height: Math.max(controls.y + controls.height, selBox.y + selBox.height) - Math.min(controls.y, selBox.y),
  };
  await pg.screenshot({ path: path.join(OUT, 'shot-1-pagefilter-18.png'), clip });

  // ---- 截图 2：nav 排行面板（新页签中文 label） ----
  await pg.evaluate(() => { const sel = document.getElementById('anxPage'); sel.size = 1; });
  const navTexts = await pg.evaluate(() => {
    const panel = [...document.querySelectorAll('.anx-panel')].find(p => p.textContent.includes('导航 TAB 排行'));
    return panel ? panel.textContent.replace(/\s+/g, ' ').slice(0, 400) : '(未找到面板)';
  });
  console.log('nav 面板文本：' + navTexts);
  const navPanel = pg.locator('.anx-panel', { hasText: '导航 TAB 排行' });
  await navPanel.screenshot({ path: path.join(OUT, 'shot-2-nav-labels.png') });

  // ---- 截图 3：整页上下文（控制条+四面板，供送审全貌） ----
  await pg.screenshot({ path: path.join(OUT, 'shot-3-board-full.png'), fullPage: false });

  console.log('JS 报错数=' + errs.length + (errs.length ? ' → ' + errs.join(' | ') : ''));
  console.log('截图落盘：' + OUT);
  await cleanup();
  process.exit(errs.length ? 1 : 0);
})().catch(async e => { console.error('异常：' + e.message); await cleanup(); process.exit(1); });
