// 任务书 #22 WP3 验证：验收附带项四项
// ① 认领方式三档说明分段（4 行）  ② 静态资源 ?v= 版本串  ③ 公会设置吸附保存栏+未保存提示
// ④ 改名同步公会快照：窄例外矩阵（本人改 200/代他人 403/夹带 403/改其他字段 403）+ 浏览器改名→他人视角新名
// 测试数据自建自清理并复核为零。用法: node scripts/verify-task22-wp3.js（PW_CHANNEL=chrome 可选）
// 截图输出 backup/2026-08-05-task22-wp3/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-05-task22-wp3');
const PORT = 15646;
const BASE = `http://localhost:${PORT}`;
const PWD = 'Wp22c-Test-2026!';
const EMAIL_OWNER = 'wp22c-owner@wowbutler.cn';
const EMAIL_U = 'wp22c-viewer@wowbutler.cn';

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

let serverProc = null, owner = null, viewerU = null, guildId = null, memberXId = null;
let gmOwnerId = null, gmViewerId = null;

async function setup() {
  owner = await ensureUser(EMAIL_OWNER, 'WP3会长');
  viewerU = await ensureUser(EMAIL_U, 'WP3旧名');
  const g = await svc('POST', '/rest/v1/guilds', { name: 'WP3附带会', owner_id: owner.uid, invite_code: 'W22C' + Date.now().toString(36).slice(-4).toUpperCase() });
  if (g.status !== 201) throw new Error('建会失败');
  guildId = g.body[0].id;
  const gm1 = await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: owner.uid, role: 'owner', display_name: 'WP3会长' });
  const gm2 = await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: viewerU.uid, role: 'viewer', display_name: 'WP3旧名' });
  if (gm1.status !== 201 || gm2.status !== 201) throw new Error('入会失败');
  gmOwnerId = gm1.body[0].id;
  gmViewerId = gm2.body[0].id;
  const x = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name: 'WP3成员X', class: '战士', status: '正式', user_id: viewerU.uid });
  if (x.status !== 201) throw new Error('建成员失败');
  memberXId = x.body[0].id;

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  const steps = [];
  try { const r = await svc('DELETE', `/rest/v1/raid_members?guild_id=eq.${guildId}`); steps.push(`members:${r.status}`); } catch { steps.push('members:ERR'); }
  try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); steps.push(`guilds:${r.status}`); } catch { steps.push('guilds:ERR'); }
  for (const u of [owner, viewerU]) {
    try { if (u) await fetch(`${SB}/auth/v1/admin/users/${u.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); }
  }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const chk = await svc('GET', `/rest/v1/guilds?id=eq.${guildId}&select=id`);
  console.log(`[清理复核] guilds 剩余=${Array.isArray(chk.body) ? chk.body.length : '?'}`);
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

  // ==================== ④ 窄例外 curl 矩阵 ====================
  let r = await proxy(viewerU.token, 'PATCH', `/rest/v1/guild_members?id=eq.${gmViewerId}`, { display_name: 'WP3新名' });
  check('④-1. 本人改自己行 display_name → 200', r.status === 200, `HTTP ${r.status}`);
  const gmAfter = await svc('GET', `/rest/v1/guild_members?id=eq.${gmViewerId}&select=display_name,role`);
  check('④-1b. 落库正确（display_name 更新、role 不动）', gmAfter.body && gmAfter.body[0] && gmAfter.body[0].display_name === 'WP3新名' && gmAfter.body[0].role === 'viewer', JSON.stringify(gmAfter.body));
  await svc('PATCH', `/rest/v1/guild_members?id=eq.${gmViewerId}`, { display_name: 'WP3旧名' }); // 复位

  r = await proxy(viewerU.token, 'PATCH', `/rest/v1/guild_members?id=eq.${gmOwnerId}`, { display_name: '篡改会长' });
  check('④-2. 代他人改 display_name → 403', r.status === 403, `HTTP ${r.status}`);

  r = await proxy(viewerU.token, 'PATCH', `/rest/v1/guild_members?id=eq.${gmViewerId}`, { display_name: 'WP3夹带', role: 'editor' });
  check('④-3. 夹带 role 字段 → 403', r.status === 403, `HTTP ${r.status}`);

  r = await proxy(viewerU.token, 'PATCH', `/rest/v1/guild_members?id=eq.${gmViewerId}`, { role: 'editor' });
  check('④-4. 只改其他字段（role 自我提权）→ 403', r.status === 403, `HTTP ${r.status}`);

  r = await proxy(owner.token, 'PATCH', `/rest/v1/guild_members?id=eq.${gmViewerId}`, { role: 'editor' });
  check('④-5. 回归：owner 变更成员角色 → 200（原分支不受影响）', r.status === 200, `HTTP ${r.status}`);
  await svc('PATCH', `/rest/v1/guild_members?id=eq.${gmViewerId}`, { role: 'viewer' }); // 复位

  // ==================== 浏览器：①②③ + ④ E2E ====================
  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  try {
    // ---- owner 侧：① 说明分段 / ② 版本串 / ③ 吸附保存栏 ----
    const ctxO = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageO = await ctxO.newPage();
    pageO.on('pageerror', e => pageErrors.push('pageerror(O): ' + e.message));
    pageO.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console(O): ' + msg.text()); });
    pageO.on('dialog', d => d.accept());
    await login(pageO, EMAIL_OWNER);

    // ② 静态资源版本串：本地 js/css 引用全带 ?v=
    const refs = await pageO.evaluate(() => {
      const sel = 'script[src^="js/"], script[src^="assets/"], link[rel="stylesheet"]';
      return [...document.querySelectorAll(sel)].map(el => el.src || el.href);
    });
    const noVersion = refs.filter(u => !u.includes('?v='));
    check('② 本地 js/css 引用全部携带 ?v= 版本串', refs.length >= 6 && noVersion.length === 0, noVersion.join(' | ') || `${refs.length} 个引用全带版本`);

    await pageO.evaluate(() => openGuildSettings());
    await pageO.waitForSelector('#guildSettingsModal.show', { timeout: 5000 });
    await sleep(800);

    // ① 认领方式说明分段（4 行）
    const hintLines = await pageO.evaluate(() => {
      const sel = document.getElementById('guildClaimMode');
      const box = sel && sel.parentElement.querySelector('div[style]');
      if (!box) return null;
      return [...box.children].map(c => c.textContent.trim());
    });
    check('① 认领方式说明分段为 4 行', hintLines && hintLines.length === 4 && hintLines[0].startsWith('自由认领：') && hintLines[3].includes('不影响已存在'), JSON.stringify(hintLines));

    // ③ 吸附保存栏：底部栏存在；改动 → 提示出现；底栏保存 → 提示消失且持久
    const footer = await pageO.evaluate(() => {
      const f = document.querySelector('#guildSettingsModal .guild-settings-footer');
      const hint = document.getElementById('guildSettingsDirtyHint');
      return { footer: !!f, hintInit: hint ? hint.style.display : '(无)' };
    });
    check('③ 底部保存栏存在、初始无未保存提示', footer.footer && footer.hintInit === 'none', JSON.stringify(footer));
    await pageO.selectOption('#guildClaimMode', 'approval');
    await sleep(400);
    const hintAfterEdit = await pageO.evaluate(() => document.getElementById('guildSettingsDirtyHint').style.display);
    check('③ 改动认领方式后「有未保存的修改」提示出现', hintAfterEdit !== 'none', hintAfterEdit);
    await pageO.screenshot({ path: path.join(SHOT_DIR, '1-settings-sticky-footer-dirty.png') });
    await pageO.click('#guildSettingsModal .guild-settings-footer .btn-primary');
    await pageO.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await sleep(2000);
    const afterSave = await pageO.evaluate(() => document.getElementById('guildSettingsDirtyHint').style.display);
    const gMode = await svc('GET', `/rest/v1/guilds?id=eq.${guildId}&select=claim_mode`);
    check('③ 底栏保存生效：提示消失 + claim_mode=approval 持久', afterSave === 'none' && gMode.body && gMode.body[0] && gMode.body[0].claim_mode === 'approval', `hint=${afterSave} mode=${gMode.body && gMode.body[0] && gMode.body[0].claim_mode}`);
    // 复位 free，避免影响后续
    await pageO.selectOption('#guildClaimMode', 'free');
    await pageO.click('#guildSettingsModal .guild-settings-footer .btn-primary');
    await sleep(2000);
    await pageO.evaluate(() => closeModal('guildSettingsModal'));
    await ctxO.close();

    // ---- ④ E2E：viewer 改名 → 本人快照同步 → owner 视角认领人标签显示新名 ----
    const ctxU = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageU = await ctxU.newPage();
    pageU.on('pageerror', e => pageErrors.push('pageerror(U): ' + e.message));
    pageU.on('dialog', d => d.accept());
    await login(pageU, EMAIL_U);
    await pageU.click('#userMenuTrigger');
    await sleep(300);
    await pageU.evaluate(() => userMenuAction('center'));
    await pageU.waitForSelector('#userCenterModal.show', { timeout: 5000 });
    await sleep(1200);
    await pageU.fill('#ucDisplayName', 'WP3新名');
    await pageU.click('button[onclick="saveUserProfile()"]');
    await sleep(3000); // alert 自动接受
    const gmSync = await svc('GET', `/rest/v1/guild_members?id=eq.${gmViewerId}&select=display_name`);
    check('④-E2E. 用户中心改名后本人公会快照即时同步', gmSync.body && gmSync.body[0] && gmSync.body[0].display_name === 'WP3新名', JSON.stringify(gmSync.body));
    await ctxU.close();

    // owner 视角：成员 X 的认领人标签显示新名
    const ctxO2 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageO2 = await ctxO2.newPage();
    pageO2.on('pageerror', e => pageErrors.push('pageerror(O2): ' + e.message));
    pageO2.on('dialog', d => d.accept());
    await login(pageO2, EMAIL_OWNER);
    await pageO2.click('.nav-item[data-page="members"]');
    await sleep(2000);
    const claimerText = await pageO2.evaluate(() => {
      const rows = [...document.querySelectorAll('#membersTableBody tr')];
      const row = rows.find(r2 => r2.textContent.includes('WP3成员X'));
      return row ? row.querySelector('.claim-btns').innerText.trim() : '(行未找到)';
    });
    check('④-E2E. owner 视角「认领人：WP3新名」（他人视角新名）', claimerText.includes('认领人：WP3新名'), claimerText);
    await pageO2.screenshot({ path: path.join(SHOT_DIR, '2-owner-view-new-name.png') });
    await ctxO2.close();

    const realErrors = pageErrors.filter(e => !e.includes('status of 406'));
    check('全程零 JS 错误（406=既有用户资料空行噪音，已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#22 WP3 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
