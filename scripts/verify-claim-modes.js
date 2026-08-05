// 任务书 #21 WP2 验证：认领治理三档公会开关（REQ-067）
// 前置：sql/15_task021_claim_governance.sql 已在数据库执行（claim_mode 列 + claim_requests 表）。
// 覆盖：三模式 ×（viewer 认领/解绑、owner 代派/审批）全矩阵 curl + 浏览器实测，
//       approval 全生命周期（申请→审核中→批准生效/拒绝）、assign 下 viewer 403 且 owner 代派 200、
//       并发抢批不覆盖、viewer 撤回自己 pending。
// 测试用户/公会/成员/申请全部自建，验收完自清理并复核为零。
// 用法: node scripts/verify-claim-modes.js   （可选 PW_CHANNEL=chrome 使用系统 Chrome）
// 取证截图输出到 backup/2026-08-05-task21-wp2/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-05-task21-wp2');
const PORT = 15643;
const BASE = `http://localhost:${PORT}`;
const PWD = 'Wp21b-Test-2026!';
const EMAIL_OWNER = 'wp21b-owner@wowbutler.cn';
const EMAIL_A = 'wp21b-viewer-a@wowbutler.cn';
const EMAIL_B = 'wp21b-viewer-b@wowbutler.cn';

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

// 经本地代理写（浏览器 dbWrite 同路径）
async function proxy(token, method, restPath, bodyObj) {
  const res = await fetch(`${BASE}/api/db${restPath}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 200) };
}

let serverProc = null;
let owner = null, viewerA = null, viewerB = null;
let guildId = null, guild2Id = null;
let memberXId = null, memberYId = null, memberZId = null, memberWId = null;

async function setup() {
  // 前置：迁移必须已执行
  const probe = await svc('GET', '/rest/v1/claim_requests?select=id&limit=1');
  if (probe.status !== 200) {
    throw new Error('claim_requests 表不可达（HTTP ' + probe.status + '）——请先在数据库执行 sql/15_task021_claim_governance.sql 再运行本脚本');
  }
  owner = await ensureUser(EMAIL_OWNER, 'WP21B会长');
  viewerA = await ensureUser(EMAIL_A, 'WP21B甲');
  viewerB = await ensureUser(EMAIL_B, 'WP21B乙');

  const g = await svc('POST', '/rest/v1/guilds', { name: 'WP21B验收会', owner_id: owner.uid, invite_code: 'W21B' + Date.now().toString(36).slice(-4).toUpperCase() });
  if (g.status !== 201) throw new Error('建会失败: ' + JSON.stringify(g.body));
  guildId = g.body[0].id;
  for (const [u, role] of [[owner, 'owner'], [viewerA, 'viewer'], [viewerB, 'viewer']]) {
    const gm = await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: u.uid, role, display_name: 'WP21B' + role });
    if (gm.status !== 201) throw new Error('入会失败');
  }
  const x = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name: 'WP21B成员X', class: '战士', status: '正式', user_id: null });
  const y = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name: 'WP21B成员Y', class: '法师', status: '正式', user_id: viewerB.uid });
  const z = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name: 'WP21B成员Z', class: '牧师', status: '正式', user_id: null });
  if (x.status !== 201 || y.status !== 201 || z.status !== 201) throw new Error('建成员失败');
  memberXId = x.body[0].id; memberYId = y.body[0].id; memberZId = z.body[0].id;

  // 第二公会（free 模式，验证 approval 窄例外不误放 free 公会）
  const g2 = await svc('POST', '/rest/v1/guilds', { name: 'WP21B自由会', owner_id: owner.uid, invite_code: 'W21C' + Date.now().toString(36).slice(-4).toUpperCase() });
  if (g2.status !== 201) throw new Error('建第二公会失败');
  guild2Id = g2.body[0].id;
  for (const [u, role] of [[owner, 'owner'], [viewerA, 'viewer']]) {
    await svc('POST', '/rest/v1/guild_members', { guild_id: guild2Id, user_id: u.uid, role, display_name: 'WP21B' + role });
  }
  const w = await svc('POST', '/rest/v1/raid_members', { guild_id: guild2Id, name: 'WP21B成员W', class: '盗贼', status: '正式', user_id: null });
  if (w.status !== 201) throw new Error('建成员W失败');
  memberWId = w.body[0].id;

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  const steps = [];
  for (const gid of [guildId, guild2Id]) {
    if (!gid) continue;
    try { const r = await svc('DELETE', `/rest/v1/claim_requests?guild_id=eq.${gid}`); steps.push(`claim_requests:${r.status}`); } catch { steps.push('claim_requests:ERR'); }
    try { const r = await svc('DELETE', `/rest/v1/notifications?guild_id=eq.${gid}`); steps.push(`notifications:${r.status}`); } catch { steps.push('notifications:ERR'); }
    try { const r = await svc('DELETE', `/rest/v1/raid_members?guild_id=eq.${gid}`); steps.push(`raid_members:${r.status}`); } catch { steps.push('raid_members:ERR'); }
    try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${gid}`); steps.push(`guilds:${r.status}`); } catch { steps.push('guilds:ERR'); }
  }
  for (const u of [owner, viewerA, viewerB]) {
    try {
      if (u) await fetch(`${SB}/auth/v1/admin/users/${u.uid}`, { method: 'DELETE', headers: SVC });
      steps.push(`user:${u ? u.uid.slice(0, 8) : '?'}:deleted`);
    } catch { steps.push('user:ERR'); }
  }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const chk1 = await svc('GET', `/rest/v1/guilds?select=id&name=in.(WP21B验收会,WP21B自由会)`);
  const chk2 = await svc('GET', `/rest/v1/claim_requests?select=id&limit=5`);
  console.log(`[清理复核] 测试公会剩余=${Array.isArray(chk1.body) ? chk1.body.length : '?'}，claim_requests 全表剩余=${Array.isArray(chk2.body) ? chk2.body.length : '?'}`);
}

async function setMode(mode) {
  const r = await svc('PATCH', `/rest/v1/guilds?id=eq.${guildId}`, { claim_mode: mode });
  if (r.status !== 200 && r.status !== 204) throw new Error('切换认领模式失败: ' + JSON.stringify(r.body));
}

async function getMemberUserId(memberId) {
  const r = await svc('GET', `/rest/v1/raid_members?id=eq.${memberId}&select=user_id`);
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

  // ==================== curl 矩阵 ====================
  // 0. 迁移后默认 free：公会行带 claim_mode='free'
  const g0 = await svc('GET', `/rest/v1/guilds?id=eq.${guildId}&select=claim_mode`);
  check('0. 迁移落库：存量/新建公会 claim_mode 默认 free', g0.body && g0.body[0] && g0.body[0].claim_mode === 'free', JSON.stringify(g0.body));

  // 1. free 模式 viewer 直认领 X → 200（不回归）
  let r = await proxy(viewerA.token, 'PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: viewerA.uid });
  check('1. [free] viewer甲 直认领 X → 200', r.status === 200, `HTTP ${r.status}`);
  await svc('PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: null }); // 复位

  // 2. 切 approval：viewer 直认领 X → 403 需审核
  await setMode('approval');
  r = await proxy(viewerA.token, 'PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: viewerA.uid });
  check('2. [approval] viewer甲 直写认领 X → 403 需审核', r.status === 403 && r.body.includes('审核'), `HTTP ${r.status} ${r.body}`);

  // 3. viewer 提交认领申请 X → 201
  r = await proxy(viewerA.token, 'POST', '/rest/v1/claim_requests', { guild_id: guildId, member_id: memberXId, user_id: viewerA.uid });
  check('3. [approval] viewer甲 提交申请 X → 201', r.status === 201, `HTTP ${r.status}`);
  const reqX = await svc('GET', `/rest/v1/claim_requests?member_id=eq.${memberXId}&status=eq.pending&select=id`);
  const reqXId = reqX.body && reqX.body[0] && reqX.body[0].id;

  // 4. 重复申请同一成员 → 部分唯一索引拦截
  r = await proxy(viewerA.token, 'POST', '/rest/v1/claim_requests', { guild_id: guildId, member_id: memberXId, user_id: viewerA.uid });
  check('4. [approval] 重复申请同一成员 → 非 2xx（部分唯一索引）', r.status !== 200 && r.status !== 201, `HTTP ${r.status}`);

  // 5. 申请夹带字段 → 落通用分支 403
  r = await proxy(viewerA.token, 'POST', '/rest/v1/claim_requests', { guild_id: guildId, member_id: memberZId, user_id: viewerA.uid, status: 'approved' });
  check('5. [approval] 申请夹带 status 字段 → 403', r.status === 403, `HTTP ${r.status} ${r.body}`);

  // 6. 申请已认领成员 Y → 403
  r = await proxy(viewerA.token, 'POST', '/rest/v1/claim_requests', { guild_id: guildId, member_id: memberYId, user_id: viewerA.uid });
  check('6. [approval] 申请已认领成员 Y → 403', r.status === 403, `HTTP ${r.status}`);

  // 7. 代他人申请（user_id=乙）→ 403
  r = await proxy(viewerA.token, 'POST', '/rest/v1/claim_requests', { guild_id: guildId, member_id: memberZId, user_id: viewerB.uid });
  check('7. [approval] 代他人申请 → 403', r.status === 403, `HTTP ${r.status}`);

  // 8. free 公会提交申请 → 403（窄例外仅限 approval 公会）
  r = await proxy(viewerA.token, 'POST', '/rest/v1/claim_requests', { guild_id: guild2Id, member_id: memberWId, user_id: viewerA.uid });
  check('8. [free 公会] viewer甲 提交申请 → 403', r.status === 403, `HTTP ${r.status}`);

  // 9. viewer 乙申请 Z（供撤回/拒绝用）→ 201
  r = await proxy(viewerB.token, 'POST', '/rest/v1/claim_requests', { guild_id: guildId, member_id: memberZId, user_id: viewerB.uid });
  check('9. [approval] viewer乙 提交申请 Z → 201', r.status === 201, `HTTP ${r.status}`);
  const reqZ = await svc('GET', `/rest/v1/claim_requests?member_id=eq.${memberZId}&status=eq.pending&select=id`);
  const reqZId = reqZ.body && reqZ.body[0] && reqZ.body[0].id;

  // 10. viewer 乙撤回自己 pending 申请 → 200/204
  r = await proxy(viewerB.token, 'DELETE', `/rest/v1/claim_requests?id=eq.${reqZId}`);
  check('10. [approval] viewer乙 撤回自己 pending 申请 → 2xx', r.status === 200 || r.status === 204, `HTTP ${r.status}`);
  const reqZAfter = await svc('GET', `/rest/v1/claim_requests?id=eq.${reqZId}&select=id`);
  check('10b. 撤回后申请行已删除', Array.isArray(reqZAfter.body) && reqZAfter.body.length === 0);

  // 11. viewer 甲撤回（删除）别人的申请 → 403（先让乙重新申请 Z）
  await svc('POST', '/rest/v1/claim_requests', { guild_id: guildId, member_id: memberZId, user_id: viewerB.uid });
  const reqZ2 = await svc('GET', `/rest/v1/claim_requests?member_id=eq.${memberZId}&status=eq.pending&select=id`);
  const reqZ2Id = reqZ2.body[0].id;
  r = await proxy(viewerA.token, 'DELETE', `/rest/v1/claim_requests?id=eq.${reqZ2Id}`);
  check('11. [approval] viewer甲 删他人申请 → 403', r.status === 403, `HTTP ${r.status}`);

  // 12. viewer PATCH 申请（自己审批自己）→ 403
  r = await proxy(viewerA.token, 'PATCH', `/rest/v1/claim_requests?id=eq.${reqXId}`, { status: 'approved' });
  check('12. [approval] viewer甲 PATCH 审批申请 → 403', r.status === 403, `HTTP ${r.status}`);

  // 13. owner 批准 X：写 raid_members + 申请置 approved（前端 approveClaimRequest 同序）
  r = await proxy(owner.token, 'PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: viewerA.uid });
  check('13. [approval] owner 批准写认领 X → 200', r.status === 200, `HTTP ${r.status}`);
  r = await proxy(owner.token, 'PATCH', `/rest/v1/claim_requests?id=eq.${reqXId}`, { status: 'approved', resolved_by: owner.uid, resolved_at: new Date().toISOString() });
  check('13b. owner 置申请 approved → 200', r.status === 200, `HTTP ${r.status}`);
  check('13c. 批准生效：X.user_id=甲', (await getMemberUserId(memberXId)) === viewerA.uid);

  // 14. owner 拒绝 Z 的申请 → Z 仍未认领
  r = await proxy(owner.token, 'PATCH', `/rest/v1/claim_requests?id=eq.${reqZ2Id}`, { status: 'rejected', resolved_by: owner.uid, resolved_at: new Date().toISOString() });
  check('14. [approval] owner 拒绝申请 Z → 200 且成员未认领', r.status === 200 && (await getMemberUserId(memberZId)) === null, `HTTP ${r.status}`);

  // 15. approval 模式 viewer 解绑自己仍 → 200
  r = await proxy(viewerA.token, 'PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: null });
  check('15. [approval] viewer甲 解绑自己的 X → 200（解绑不受模式限）', r.status === 200, `HTTP ${r.status}`);

  // 16. 切 assign：viewer 直认领 → 403 统一分配；owner 代派 → 200
  await setMode('assign');
  r = await proxy(viewerA.token, 'PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: viewerA.uid });
  check('16. [assign] viewer甲 直认领 X → 403 统一分配', r.status === 403 && r.body.includes('统一分配'), `HTTP ${r.status} ${r.body}`);
  r = await proxy(owner.token, 'PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: viewerA.uid, notes: 'assign代派' });
  check('16b. [assign] owner 代派 X → 200', r.status === 200, `HTTP ${r.status}`);
  check('16c. [assign] 代派落库 X.user_id=甲', (await getMemberUserId(memberXId)) === viewerA.uid);
  await svc('PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: null, notes: null }); // 复位

  // 17. assign 公会提交申请 → 403（窄例外仅限 approval）
  r = await proxy(viewerA.token, 'POST', '/rest/v1/claim_requests', { guild_id: guildId, member_id: memberXId, user_id: viewerA.uid });
  check('17. [assign] viewer甲 提交申请 → 403', r.status === 403, `HTTP ${r.status}`);

  // 18. 代理 GET claim_requests → 403（代理读仅放行 guilds）
  r = await proxy(viewerA.token, 'GET', `/rest/v1/claim_requests?guild_id=eq.${guildId}`);
  check('18. 代理读 claim_requests → 403', r.status === 403, `HTTP ${r.status}`);

  // ==================== 浏览器：approval 全生命周期 + assign 入口 ====================
  await setMode('approval');
  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  try {
    // ---- viewer 甲：申请 → 认领审核中 ----
    const ctxA = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageA = await ctxA.newPage();
    pageA.on('pageerror', e => pageErrors.push('pageerror(A): ' + e.message));
    pageA.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console(A): ' + msg.text()); });
    pageA.on('dialog', d => d.accept());
    await login(pageA, EMAIL_A);
    await pageA.click('.nav-item[data-page="members"]');
    await sleep(1200);

    await pageA.evaluate(() => {
      const rows = [...document.querySelectorAll('#membersTableBody tr')];
      const row = rows.find(r2 => r2.textContent.includes('WP21B成员X'));
      row.querySelector('.claim-pending-btn').click();
    });
    await pageA.waitForSelector('#claimConfirmModal.show', { timeout: 5000 });
    await sleep(600);
    const modalInfo = await pageA.evaluate(() => ({
      note: document.getElementById('claimConfirmApprovalNote').style.display !== 'none',
      btn: document.getElementById('claimConfirmBtn').textContent,
    }));
    check('19. [approval UI] 弹窗显示审核说明 + 按钮为「提交认领申请」', modalInfo.note && modalInfo.btn === '提交认领申请', JSON.stringify(modalInfo));
    await pageA.screenshot({ path: path.join(SHOT_DIR, '1-viewer-apply-modal.png') });
    await pageA.click('#claimConfirmBtn');
    await pageA.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await sleep(2000);
    const rowState = await pageA.evaluate(() => {
      const rows = [...document.querySelectorAll('#membersTableBody tr')];
      const row = rows.find(r2 => r2.textContent.includes('WP21B成员X'));
      return row ? row.querySelector('.claim-btns').innerText.trim() : '(行未找到)';
    });
    check('20. [approval UI] 申请后成员行显示「认领审核中」', rowState.includes('认领审核中'), rowState);
    check('20b. [approval UI] 申请未直写认领（X.user_id 仍 null）', (await getMemberUserId(memberXId)) === null);
    await pageA.screenshot({ path: path.join(SHOT_DIR, '2-viewer-pending-tag.png') });
    await ctxA.close();

    // ---- owner：审核区块 → 并发护栏 → 批准生效 ----
    const ctxO = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageO = await ctxO.newPage();
    pageO.on('pageerror', e => pageErrors.push('pageerror(O): ' + e.message));
    pageO.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console(O): ' + msg.text()); });
    pageO.on('dialog', d => d.accept());
    await login(pageO, EMAIL_OWNER);
    await pageO.click('.nav-item[data-page="members"]');
    await sleep(2000);

    const blockInfo = await pageO.evaluate(() => {
      const el = document.getElementById('claimReviewBlock');
      return { visible: el.style.display !== 'none', text: el.innerText };
    });
    check('21. [approval UI] owner 看到审核区块（角标+申请人名字）',
      blockInfo.visible && blockInfo.text.includes('待审') && blockInfo.text.includes('WP21Bviewer') && blockInfo.text.includes('WP21B成员X'),
      blockInfo.text.slice(0, 100).replace(/\n/g, ' '));
    await pageO.screenshot({ path: path.join(SHOT_DIR, '3-owner-review-block.png') });

    // 并发护栏：申请还在待审时，乙抢先认领 X（service 直改模拟），owner 点批准 → 明确报错不覆盖
    await svc('PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: viewerB.uid });
    await pageO.evaluate(() => {
      const btn = [...document.querySelectorAll('#claimReviewBlock button')].find(b => b.textContent === '批准');
      btn.click();
    });
    await pageO.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await sleep(2000);
    const guardToast = await pageO.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | '));
    check('22. [并发] 批准时成员已被抢 → 明确报错提示', guardToast.includes('已被认领') || guardToast.includes('未覆盖'), guardToast.slice(0, 120));
    check('22b. [并发] 未覆盖：X.user_id 仍为乙', (await getMemberUserId(memberXId)) === viewerB.uid);
    await pageO.screenshot({ path: path.join(SHOT_DIR, '4-approve-race-guard.png') });

    // 复位 X 未认领，重新走完整批准（申请仍是 pending）
    await svc('PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: null });
    await pageO.evaluate(async () => { await reloadClaimGovernance(); });
    await sleep(1500);
    await pageO.evaluate(() => {
      const btn = [...document.querySelectorAll('#claimReviewBlock button')].find(b => b.textContent === '批准');
      btn.click();
    });
    await pageO.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await sleep(2500);
    check('23. [approval UI] owner 批准生效：X.user_id=甲', (await getMemberUserId(memberXId)) === viewerA.uid);
    const blockAfter = await pageO.evaluate(() => document.getElementById('claimReviewBlock').style.display);
    check('23b. [approval UI] 批准后审核区块清空隐藏', blockAfter === 'none', blockAfter);
    await pageO.screenshot({ path: path.join(SHOT_DIR, '5-after-approve.png') });

    // 通知落库（申请人甲收到 claim_result 通知）
    const notif = await svc('GET', `/rest/v1/notifications?user_id=eq.${viewerA.uid}&type=eq.claim_result&select=title,message`);
    check('24. 批准结果通知落库（notifications.claim_result）',
      Array.isArray(notif.body) && notif.body.some(n => n.title === '认领申请已通过'),
      JSON.stringify(notif.body).slice(0, 120));

    // ---- owner 公会设置：三档切换持久 ----
    await pageO.evaluate(() => openGuildSettings());
    await pageO.waitForSelector('#guildSettingsModal.show', { timeout: 5000 });
    await sleep(800);
    const modeVal = await pageO.evaluate(() => ({ val: document.getElementById('guildClaimMode').value, disabled: document.getElementById('guildClaimMode').disabled }));
    check('25. [设置] owner 看到认领方式=approval 且可改', modeVal.val === 'approval' && !modeVal.disabled, JSON.stringify(modeVal));
    await pageO.selectOption('#guildClaimMode', 'assign');
    await pageO.click('#guildProfileSaveBtn');
    await pageO.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await sleep(2000);
    const gAfter = await svc('GET', `/rest/v1/guilds?id=eq.${guildId}&select=claim_mode`);
    check('25b. [设置] 保存后 guilds.claim_mode=assign 持久', gAfter.body && gAfter.body[0] && gAfter.body[0].claim_mode === 'assign', JSON.stringify(gAfter.body));
    await pageO.evaluate(() => closeModal('guildSettingsModal'));
    await ctxO.close();

    // ---- assign 模式 viewer：认领入口隐藏（不可点 + hover 说明） ----
    const ctxA2 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageA2 = await ctxA2.newPage();
    pageA2.on('pageerror', e => pageErrors.push('pageerror(A2): ' + e.message));
    pageA2.on('dialog', d => d.accept());
    // X 已被甲认领（23 步批准）；复位为未认领再验证 viewer 视角
    await svc('PATCH', `/rest/v1/raid_members?id=eq.${memberXId}`, { user_id: null });
    await login(pageA2, EMAIL_A);
    await pageA2.click('.nav-item[data-page="members"]');
    await sleep(1500);
    const assignCell = await pageA2.evaluate(() => {
      const rows = [...document.querySelectorAll('#membersTableBody tr')];
      const row = rows.find(r2 => r2.textContent.includes('WP21B成员X'));
      if (!row) return null;
      const btn = row.querySelector('.claim-btns .claim-pending-btn');
      const span = row.querySelector('.claim-btns span.tag');
      return { hasButton: !!btn, spanText: span ? span.textContent.trim() : null, spanTitle: span ? span.title : null };
    });
    check('26. [assign UI] viewer 无可点认领入口，「待认领」带归属说明 hover',
      assignCell && !assignCell.hasButton && assignCell.spanText === '待认领' && assignCell.spanTitle.includes('统一分配'),
      JSON.stringify(assignCell));
    await pageA2.screenshot({ path: path.join(SHOT_DIR, '6-assign-viewer-no-entry.png') });
    await ctxA2.close();

    const realErrors = pageErrors.filter(e => !e.includes('status of 406'));
    check('27. 全程零 JS 错误（406=既有用户资料空行噪音，已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#21 WP2 验证: ${passed}/${results.length} 通过 =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
