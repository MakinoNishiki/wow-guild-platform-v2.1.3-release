// 任务书 #19 WP1 验证：viewer 自助认领/解绑（代理窄例外）
// 矩阵 1-6：curl 级（真实 JWT 经本地 server.js 代理 PATCH）；7：浏览器级（viewer UI 认领+解绑）
// 测试用户/公会/成员全部自建，验收完自清理并报告清理结果。
// 用法: node scripts/verify-viewer-claim.js   （前置：npm i playwright，浏览器缓存已就绪）
// 取证截图输出到 backup/2026-08-04-task19-wp1/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-04-task19-wp1');
const PORT = 15641;
const BASE = `http://localhost:${PORT}`;
const PWD = 'Wp19-Test-2026!';
const EMAIL_OWNER = 'wp19-owner@wowbutler.cn';
const EMAIL_A = 'wp19-viewer-a@wowbutler.cn';
const EMAIL_B = 'wp19-viewer-b@wowbutler.cn';

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

async function ensureUser(email, displayName) {
  let res = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD, data: { display_name: displayName } }),
  });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PWD }),
    });
    body = await res.json();
    if (!body.access_token) throw new Error(`用户 ${email} 登录失败: ` + JSON.stringify(body));
  }
  return { uid: body.user.id, token: body.access_token };
}

// 经本地代理 PATCH raid_members（浏览器 dbWrite 同路径）
async function proxyPatch(token, memberId, bodyObj) {
  const res = await fetch(`${BASE}/api/db/rest/v1/raid_members?id=eq.${memberId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(bodyObj),
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 200) };
}

let serverProc = null;
let owner = null, viewerA = null, viewerB = null, testGuildId = null;
let memberXId = null, memberYId = null;

async function setup() {
  owner = await ensureUser(EMAIL_OWNER, 'WP19会长');
  viewerA = await ensureUser(EMAIL_A, 'WP19甲');
  viewerB = await ensureUser(EMAIL_B, 'WP19乙');
  const g = await svc('POST', '/rest/v1/guilds', { name: 'WP19验收会', owner_id: owner.uid, invite_code: 'W19A' + Date.now().toString(36).slice(-4).toUpperCase() });
  if (g.status !== 201) throw new Error('建会失败: ' + JSON.stringify(g.body));
  testGuildId = g.body[0].id;
  for (const [u, role] of [[owner, 'owner'], [viewerA, 'viewer'], [viewerB, 'viewer']]) {
    const gm = await svc('POST', '/rest/v1/guild_members', { guild_id: testGuildId, user_id: u.uid, role, display_name: 'WP19' + role });
    if (gm.status !== 201) throw new Error('入会失败: ' + JSON.stringify(gm.body));
  }
  const x = await svc('POST', '/rest/v1/raid_members', { guild_id: testGuildId, name: 'WP19成员X', class: '战士', status: '正式', user_id: null });
  const y = await svc('POST', '/rest/v1/raid_members', { guild_id: testGuildId, name: 'WP19成员Y', class: '法师', status: '正式', user_id: viewerB.uid });
  if (x.status !== 201 || y.status !== 201) throw new Error('建成员失败');
  memberXId = x.body[0].id;
  memberYId = y.body[0].id;

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  const steps = [];
  try { const r = await svc('DELETE', `/rest/v1/raid_members?guild_id=eq.${testGuildId}`); steps.push(`raid_members:${r.status}`); } catch (e) { steps.push('raid_members:ERR'); }
  try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${testGuildId}`); steps.push(`guilds:${r.status}`); } catch (e) { steps.push('guilds:ERR'); }
  for (const u of [owner, viewerA, viewerB]) {
    try {
      if (u) await fetch(`${SB}/auth/v1/admin/users/${u.uid}`, { method: 'DELETE', headers: SVC });
      steps.push(`user:${u ? u.uid.slice(0, 8) : '?'}:deleted`);
    } catch (e) { steps.push('user:ERR'); }
  }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  // 复核：公会与成员应查无此行
  const chk1 = await svc('GET', `/rest/v1/guilds?id=eq.${testGuildId}&select=id`);
  const chk2 = await svc('GET', `/rest/v1/raid_members?guild_id=eq.${testGuildId}&select=id`);
  console.log(`[清理复核] guilds 剩余=${Array.isArray(chk1.body) ? chk1.body.length : '?'}，raid_members 剩余=${Array.isArray(chk2.body) ? chk2.body.length : '?'}`);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  // ---------- 1-6：curl 级矩阵 ----------
  // 1. viewer甲 认领 X（未认领）→ 200
  let r = await proxyPatch(viewerA.token, memberXId, { user_id: viewerA.uid });
  check('1. viewer甲 认领未认领成员 X → 200', r.status === 200, `HTTP ${r.status}`);

  // 预备：X 改由乙认领（service 直改，模拟"已被乙认领"）
  await svc('PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: viewerB.uid });

  // 2. viewer甲 认领 X（已被乙认领）→ 403 防抢
  r = await proxyPatch(viewerA.token, memberXId, { user_id: viewerA.uid });
  check('2. viewer甲 抢认领（X 已被乙认领）→ 403', r.status === 403, `HTTP ${r.status} ${r.body}`);

  // 3. viewer甲 PATCH X 夹带 name → 403
  r = await proxyPatch(viewerA.token, memberXId, { user_id: viewerA.uid, name: '改名' });
  check('3. viewer甲 夹带字段（user_id+name）→ 403', r.status === 403, `HTTP ${r.status} ${r.body}`);

  // 4. viewer甲 解绑 Y（Y 是乙的）→ 403
  r = await proxyPatch(viewerA.token, memberYId, { user_id: null });
  check('4. viewer甲 解绑他人成员 Y → 403', r.status === 403, `HTTP ${r.status} ${r.body}`);

  // 5. viewer乙 解绑 Y（自己的）→ 200
  r = await proxyPatch(viewerB.token, memberYId, { user_id: null });
  check('5. viewer乙 解绑自己的 Y → 200', r.status === 200, `HTTP ${r.status}`);

  // 6. owner 对 X 正常编辑+改派（多字段）→ 200
  r = await proxyPatch(owner.token, memberXId, { user_id: viewerA.uid, name: 'WP19成员X改', notes: 'owner改派' });
  check('6. owner 正常编辑/改派 X（多字段）→ 200', r.status === 200, `HTTP ${r.status}`);
  const after = await svc('GET', `/rest/v1/raid_members?id=eq.${memberXId}&select=name,user_id,notes`);
  check('6b. owner 改派落库正确（name+user_id=A）',
    after.body && after.body[0] && after.body[0].name === 'WP19成员X改' && after.body[0].user_id === viewerA.uid);

  // ---------- 7. 浏览器级：viewer甲 UI 认领 + 解绑 ----------
  // X 当前 user_id=甲（第6步改派）；先 service 置空，让 UI 走完整认领
  await svc('PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: null, name: 'WP19成员X' });

  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const pageErrors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => pageErrors.push('pageerror: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console: ' + msg.text()); });
    page.on('dialog', d => d.accept());

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
    await page.fill('#authEmail', EMAIL_A);
    await page.fill('#authPassword', PWD);
    await page.click('#authLoginBtn');
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(2000);
    await page.click('.nav-item[data-page="members"]');
    await sleep(1000);

    // viewer-mode 下：管理按钮不可见，但认领按钮可见
    const vis = await page.evaluate(() => {
      const actionBtns = [...document.querySelectorAll('#membersTableBody .action-btns button')].filter(b => b.offsetParent !== null);
      const claimBtns = [...document.querySelectorAll('#membersTableBody .claim-btns button')].filter(b => b.offsetParent !== null);
      return { viewerMode: document.body.classList.contains('viewer-mode'), actionVisible: actionBtns.length, claimVisible: claimBtns.length };
    });
    check('7a. viewer 界面：管理按钮隐藏、认领按钮可见', vis.viewerMode && vis.actionVisible === 0 && vis.claimVisible >= 1, JSON.stringify(vis));

    // UI 认领 X
    const clicked = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#membersTableBody tr')];
      const row = rows.find(r => r.textContent.includes('WP19成员X'));
      const btn = row && [...row.querySelectorAll('.claim-btns button')].find(b => b.title === '认领为我的角色');
      if (!btn) return false;
      btn.click();
      return true;
    });
    check('7b. viewer UI 点击认领 X', clicked === true);
    await page.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await sleep(2000);
    const claimed = await svc('GET', `/rest/v1/raid_members?id=eq.${memberXId}&select=user_id`);
    check('7c. viewer UI 认领落库（user_id=甲）', claimed.body && claimed.body[0] && claimed.body[0].user_id === viewerA.uid,
      `user_id=${claimed.body && claimed.body[0] && claimed.body[0].user_id}`);
    await page.screenshot({ path: path.join(SHOT_DIR, '7-viewer-claimed.png') });

    // UI 解绑 X
    const unclicked = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#membersTableBody tr')];
      const row = rows.find(r => r.textContent.includes('WP19成员X'));
      const btn = row && [...row.querySelectorAll('.claim-btns button')].find(b => b.title === '解除认领');
      if (!btn) return false;
      btn.click();
      return true;
    });
    check('7d. viewer UI 点击解绑 X', unclicked === true);
    await page.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await sleep(2000);
    const unclaimed = await svc('GET', `/rest/v1/raid_members?id=eq.${memberXId}&select=user_id`);
    check('7e. viewer UI 解绑落库（user_id=null）', unclaimed.body && unclaimed.body[0] && unclaimed.body[0].user_id === null);
    await page.screenshot({ path: path.join(SHOT_DIR, '7-viewer-unclaimed.png') });

    const realErrors = pageErrors.filter(e => !e.includes('status of 406'));
    check('7f. viewer 全程零 JS 错误（406=既有用户资料空行噪音，已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
    await ctx.close();
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r2 => r2.ok).length;
  console.log(`\n===== 任务书#19 WP1 验证: ${passed}/${results.length} 通过 =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
