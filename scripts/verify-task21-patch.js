// 任务书 #21-补丁 A 验证：审核/分配模式管理者「认领自己」误拒修复
// 矩阵（按任务书 A 项验收）：
//   approval：owner 自认领 200 落库 / owner 批准自己的 pending 申请 200 / owner 批准他人申请 200 /
//             viewer 直认领 403 / viewer 申请 201 / viewer 代他人 403
//   assign：owner 自认领 200 / owner 代派 200 / viewer 全部 403
//   浏览器：approval 模式 owner 点「待认领」→ 二次确认直领（非申请弹窗）；viewer 仍走申请
// 测试数据自清理并复核为零。用法: node scripts/verify-task21-patch.js（PW_CHANNEL=chrome 可选）
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-05-task21-patch');
const PORT = 15650;
const BASE = `http://localhost:${PORT}`;
const PWD = 'Wp21c-Test-2026!';
const EMAIL_OWNER = 'wp21c-owner@wowbutler.cn';
const EMAIL_A = 'wp21c-viewer-a@wowbutler.cn';

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
    if (!body.access_token) throw new Error(`${email} 登录失败`);
  }
  return { uid: body.user.id, token: body.access_token };
}

async function proxy(token, method, restPath, bodyObj) {
  const res = await fetch(`${BASE}/api/db${restPath}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 200) };
}

let serverProc = null, owner = null, viewerA = null, guildId = null;
let memberXId = null, memberYId = null, memberZId = null;

async function setup() {
  owner = await ensureUser(EMAIL_OWNER, 'WP21C会长');
  viewerA = await ensureUser(EMAIL_A, 'WP21C甲');
  const g = await svc('POST', '/rest/v1/guilds', { name: 'WP21C补丁会', owner_id: owner.uid, invite_code: 'W21P' + Date.now().toString(36).slice(-4).toUpperCase(), claim_mode: 'approval' });
  if (g.status !== 201) throw new Error('建会失败: ' + JSON.stringify(g.body));
  guildId = g.body[0].id;
  for (const [u, role] of [[owner, 'owner'], [viewerA, 'viewer']]) {
    const gm = await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: u.uid, role, display_name: 'WP21C' + role });
    if (gm.status !== 201) throw new Error('入会失败');
  }
  const x = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name: 'WP21C成员X', class: '战士', status: '正式', user_id: null });
  const y = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name: 'WP21C成员Y', class: '法师', status: '正式', user_id: null });
  const z = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name: 'WP21C成员Z', class: '牧师', status: '正式', user_id: null });
  if (x.status !== 201 || y.status !== 201 || z.status !== 201) throw new Error('建成员失败');
  memberXId = x.body[0].id; memberYId = y.body[0].id; memberZId = z.body[0].id;

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  const steps = [];
  try { const r = await svc('DELETE', `/rest/v1/claim_requests?guild_id=eq.${guildId}`); steps.push(`claims:${r.status}`); } catch { steps.push('claims:ERR'); }
  try { const r = await svc('DELETE', `/rest/v1/notifications?guild_id=eq.${guildId}`); steps.push(`notif:${r.status}`); } catch { steps.push('notif:ERR'); }
  try { const r = await svc('DELETE', `/rest/v1/raid_members?guild_id=eq.${guildId}`); steps.push(`members:${r.status}`); } catch { steps.push('members:ERR'); }
  try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); steps.push(`guilds:${r.status}`); } catch { steps.push('guilds:ERR'); }
  for (const u of [owner, viewerA]) {
    try { if (u) await fetch(`${SB}/auth/v1/admin/users/${u.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); }
  }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const chk = await svc('GET', `/rest/v1/guilds?id=eq.${guildId}&select=id`);
  console.log(`[清理复核] guilds 剩余=${Array.isArray(chk.body) ? chk.body.length : '?'}`);
}

async function setMode(mode) {
  const r = await svc('PATCH', `/rest/v1/guilds?id=eq.${guildId}`, { claim_mode: mode });
  if (r.status !== 200 && r.status !== 204) throw new Error('切换模式失败');
}
async function memberUser(id) {
  const r = await svc('GET', `/rest/v1/raid_members?id=eq.${id}&select=user_id`);
  return r.body && r.body[0] ? r.body[0].user_id : '(行不存在)';
}
async function login(page, email) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
  await page.fill('#authEmail', email);
  await page.fill('#authPassword', PWD);
  await page.click('#authLoginBtn');
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  await sleep(2000);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  // ==================== approval 矩阵 ====================
  // 1. owner 自认领 X（修复前 403 的 BUG 路径）→ 200 落库
  let r = await proxy(owner.token, 'PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: owner.uid });
  check('A-1. [approval] owner 自认领 X → 200', r.status === 200, `HTTP ${r.status} ${r.status !== 200 ? r.body : ''}`);
  check('A-1b. 自认领落库（X.user_id=owner）', (await memberUser(memberXId)) === owner.uid);
  await svc('PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: null }); // 复位

  // 2. owner 提交自己的 pending 申请（历史遗留路径）→ 批准 → 200
  r = await proxy(owner.token, 'POST', '/rest/v1/claim_requests', { guild_id: guildId, member_id: memberXId, user_id: owner.uid });
  check('A-2. [approval] owner 自建 pending 申请 → 201', r.status === 201, `HTTP ${r.status}`);
  const reqRow = await svc('GET', `/rest/v1/claim_requests?member_id=eq.${memberXId}&status=eq.pending&select=id`);
  const reqId = reqRow.body[0].id;
  r = await proxy(owner.token, 'PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: owner.uid });
  check('A-2b. [approval] owner 批准自己的申请（写认领）→ 200', r.status === 200, `HTTP ${r.status}`);
  r = await proxy(owner.token, 'PATCH', `/rest/v1/claim_requests?id=eq.${reqId}`, { status: 'approved', resolved_by: owner.uid, resolved_at: new Date().toISOString() });
  check('A-2c. owner 置申请 approved → 200', r.status === 200, `HTTP ${r.status}`);
  await svc('PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: null }); // 复位

  // 3. viewer 申请 Y → owner 批准 → 200
  r = await proxy(viewerA.token, 'POST', '/rest/v1/claim_requests', { guild_id: guildId, member_id: memberYId, user_id: viewerA.uid });
  check('A-3. [approval] viewer 申请 Y → 201', r.status === 201, `HTTP ${r.status}`);
  const reqY = await svc('GET', `/rest/v1/claim_requests?member_id=eq.${memberYId}&status=eq.pending&select=id`);
  r = await proxy(owner.token, 'PATCH', `/rest/v1/raid_members?id=eq.${memberYId}`, { user_id: viewerA.uid });
  check('A-3b. [approval] owner 批准他人申请（写认领）→ 200', r.status === 200, `HTTP ${r.status}`);
  r = await proxy(owner.token, 'PATCH', `/rest/v1/claim_requests?id=eq.${reqY.body[0].id}`, { status: 'approved', resolved_by: owner.uid, resolved_at: new Date().toISOString() });
  check('A-3c. owner 置他人申请 approved → 200', r.status === 200, `HTTP ${r.status}`);

  // 4. viewer 直认领 Z → 403（防线不变）
  r = await proxy(viewerA.token, 'PATCH', `/rest/v1/raid_members?id=eq.${memberZId}`, { user_id: viewerA.uid });
  check('A-4. [approval] viewer 直认领 Z → 403', r.status === 403 && r.body.includes('审核'), `HTTP ${r.status}`);

  // 5. viewer 代他人申请 → 403
  r = await proxy(viewerA.token, 'POST', '/rest/v1/claim_requests', { guild_id: guildId, member_id: memberZId, user_id: owner.uid });
  check('A-5. [approval] viewer 代他人申请 → 403', r.status === 403, `HTTP ${r.status}`);

  // ==================== assign 矩阵 ====================
  await setMode('assign');
  r = await proxy(owner.token, 'PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: owner.uid });
  check('A-6. [assign] owner 自认领 X → 200', r.status === 200, `HTTP ${r.status}`);
  r = await proxy(owner.token, 'PATCH', `/rest/v1/raid_members?id=eq.${memberZId}`, { user_id: viewerA.uid, notes: 'assign代派' });
  check('A-7. [assign] owner 代派 Z → 200', r.status === 200, `HTTP ${r.status}`);
  await svc('PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: null });
  await svc('PATCH', `/rest/v1/raid_members?id=eq.${memberZId}`, { user_id: null, notes: null });
  r = await proxy(viewerA.token, 'PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: viewerA.uid });
  check('A-8. [assign] viewer 直认领 → 403', r.status === 403 && r.body.includes('统一分配'), `HTTP ${r.status}`);
  r = await proxy(viewerA.token, 'POST', '/rest/v1/claim_requests', { guild_id: guildId, member_id: memberXId, user_id: viewerA.uid });
  check('A-9. [assign] viewer 申请 → 403', r.status === 403, `HTTP ${r.status}`);
  await setMode('approval'); // 复位给浏览器段

  // ==================== 浏览器：approval 下 owner 二次确认直领 / viewer 走申请 ====================
  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  try {
    // owner：点「待认领」→ 按钮为「确认认领」（非提交申请）→ 直接落库
    const ctxO = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageO = await ctxO.newPage();
    pageO.on('pageerror', e => pageErrors.push('pageerror(O): ' + e.message));
    pageO.on('dialog', d => d.accept());
    await login(pageO, EMAIL_OWNER);
    await pageO.click('.nav-item[data-page="members"]');
    await sleep(1500);
    await pageO.evaluate(() => {
      const rows = [...document.querySelectorAll('#membersTableBody tr')];
      const row = rows.find(r2 => r2.textContent.includes('WP21C成员X'));
      row.querySelector('.claim-pending-btn').click();
    });
    await pageO.waitForSelector('#claimConfirmModal.show', { timeout: 5000 });
    const ownerBtn = await pageO.evaluate(() => ({
      btn: document.getElementById('claimConfirmBtn').textContent,
      note: document.getElementById('claimConfirmApprovalNote').style.display,
    }));
    check('B-1. [approval UI] owner 弹窗为「确认认领」（无审核说明行）', ownerBtn.btn === '确认认领' && ownerBtn.note === 'none', JSON.stringify(ownerBtn));
    await pageO.click('#claimConfirmBtn');
    await pageO.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await sleep(2000);
    check('B-1b. [approval UI] owner 直领落库（X.user_id=owner）', (await memberUser(memberXId)) === owner.uid);
    await svc('PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: null });
    await pageO.screenshot({ path: path.join(SHOT_DIR, '1-owner-direct-claim.png') });
    await ctxO.close();

    // viewer：弹窗按钮为「提交认领申请」→ 申请不直写
    const ctxA = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageA = await ctxA.newPage();
    pageA.on('pageerror', e => pageErrors.push('pageerror(A): ' + e.message));
    pageA.on('dialog', d => d.accept());
    await login(pageA, EMAIL_A);
    await pageA.click('.nav-item[data-page="members"]');
    await sleep(1500);
    await pageA.evaluate(() => {
      const rows = [...document.querySelectorAll('#membersTableBody tr')];
      const row = rows.find(r2 => r2.textContent.includes('WP21C成员X'));
      row.querySelector('.claim-pending-btn').click();
    });
    await pageA.waitForSelector('#claimConfirmModal.show', { timeout: 5000 });
    const viewerBtn = await pageA.evaluate(() => document.getElementById('claimConfirmBtn').textContent);
    check('B-2. [approval UI] viewer 弹窗仍为「提交认领申请」', viewerBtn === '提交认领申请', viewerBtn);
    await pageA.click('#claimConfirmBtn');
    await pageA.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await sleep(2000);
    check('B-2b. [approval UI] viewer 申请不直写（X.user_id=null）', (await memberUser(memberXId)) === null);
    await ctxA.close();

    const realErrors = pageErrors.filter(e => !e.includes('status of 406'));
    check('浏览器全程零 JS 错误', realErrors.length === 0, realErrors.join(' | ') || '无');
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#21-补丁 A 验证: ${passed}/${results.length} 通过 =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
