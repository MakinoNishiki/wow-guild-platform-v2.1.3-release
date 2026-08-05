// 任务书 #21 WP1 验证：认领体验四件套（浏览器主链路实测 + 两档宽度截图）
// 覆盖：①认领二次确认弹窗（文案四要点 + 取消不生效 + 确认才落库）
//       ②「待认领」明示标签（未认领行渲染、可点击）
//       ③公会设置开关用途说明 + 成员编辑弹窗代派入口说明
//       ④账号显示名单一真源（用户中心改名 → 右上角立即生效 → 刷新一致 → user_metadata 落库）
// 测试用户/公会/成员全部自建，验收完自清理并复核为零。
// 用法: node scripts/verify-task21-wp1.js
// 取证截图输出到 backup/2026-08-05-task21-wp1/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-05-task21-wp1');
const PORT = 15642;
const BASE = `http://localhost:${PORT}`;
const PWD = 'Wp21-Test-2026!';
const EMAIL_OWNER = 'wp21-owner@wowbutler.cn';

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

let serverProc = null, owner = null, testGuildId = null, memberXId = null;

async function setup() {
  let res = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL_OWNER, password: PWD, data: { display_name: 'WP21旧名' } }),
  });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL_OWNER, password: PWD }),
    });
    body = await res.json();
    if (!body.access_token) throw new Error('owner 登录失败: ' + JSON.stringify(body));
  }
  owner = { uid: body.user.id, token: body.access_token };

  const g = await svc('POST', '/rest/v1/guilds', { name: 'WP21验收会', owner_id: owner.uid, invite_code: 'W21A' + Date.now().toString(36).slice(-4).toUpperCase() });
  if (g.status !== 201) throw new Error('建会失败: ' + JSON.stringify(g.body));
  testGuildId = g.body[0].id;
  const gm = await svc('POST', '/rest/v1/guild_members', { guild_id: testGuildId, user_id: owner.uid, role: 'owner', display_name: 'WP21旧名' });
  if (gm.status !== 201) throw new Error('入会失败: ' + JSON.stringify(gm.body));
  const x = await svc('POST', '/rest/v1/raid_members', { guild_id: testGuildId, name: 'WP21成员X', class: '战士', status: '正式', user_id: null });
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
  try { const r = await svc('DELETE', `/rest/v1/raid_members?guild_id=eq.${testGuildId}`); steps.push(`raid_members:${r.status}`); } catch { steps.push('raid_members:ERR'); }
  try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${testGuildId}`); steps.push(`guilds:${r.status}`); } catch { steps.push('guilds:ERR'); }
  try {
    if (owner) await fetch(`${SB}/auth/v1/admin/users/${owner.uid}`, { method: 'DELETE', headers: SVC });
    steps.push('user:deleted');
  } catch { steps.push('user:ERR'); }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const chk1 = await svc('GET', `/rest/v1/guilds?id=eq.${testGuildId}&select=id`);
  const chk2 = await svc('GET', `/rest/v1/raid_members?guild_id=eq.${testGuildId}&select=id`);
  console.log(`[清理复核] guilds 剩余=${Array.isArray(chk1.body) ? chk1.body.length : '?'}，raid_members 剩余=${Array.isArray(chk2.body) ? chk2.body.length : '?'}`);
}

async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
  await page.fill('#authEmail', EMAIL_OWNER);
  await page.fill('#authPassword', PWD);
  await page.click('#authLoginBtn');
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  await sleep(2000);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  try {
    // ================= 1366×768 主链路 =================
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => pageErrors.push('pageerror: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console: ' + msg.text()); });
    page.on('dialog', d => d.accept());

    await login(page);
    await page.click('.nav-item[data-page="members"]');
    await sleep(1200);

    // ② 「待认领」明示标签
    const tagInfo = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#membersTableBody tr')];
      const row = rows.find(r => r.textContent.includes('WP21成员X'));
      const btn = row && row.querySelector('.claim-btns .claim-pending-btn');
      const oldIcon = row && [...row.querySelectorAll('.claim-btns button')].some(b => b.textContent.includes('🤝'));
      return btn ? { text: btn.textContent.trim(), visible: btn.offsetParent !== null, oldIcon: !!oldIcon } : null;
    });
    check('② 未认领行显示「待认领」标签（无旧🤝图标）', tagInfo && tagInfo.text === '待认领' && tagInfo.visible && !tagInfo.oldIcon, JSON.stringify(tagInfo));
    await page.screenshot({ path: path.join(SHOT_DIR, '1-members-pending-tag-1366.png') });

    // ① 认领二次确认弹窗：文案四要点 + 取消不生效
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#membersTableBody tr')];
      const row = rows.find(r => r.textContent.includes('WP21成员X'));
      row.querySelector('.claim-pending-btn').click();
    });
    await page.waitForSelector('#claimConfirmModal.show', { timeout: 5000 });
    await sleep(600); // 等 fadeIn 过渡结束再截图
    const modalText = await page.evaluate(() => document.getElementById('claimConfirmModal').innerText);
    const copyOk = modalText.includes('先到先得') && modalText.includes('我的认领') &&
      modalText.includes('随时调整或解除') && modalText.includes('解除认领') && modalText.includes('WP21成员X');
    check('① 确认弹窗文案四要点完整（含成员名）', copyOk, copyOk ? '完整' : modalText.slice(0, 120));
    await page.screenshot({ path: path.join(SHOT_DIR, '2-claim-confirm-modal-1366.png') });

    // 取消 → 不落库
    await page.click('#claimConfirmModal .modal-footer .btn:not(.btn-primary)');
    await sleep(800);
    let row0 = await svc('GET', `/rest/v1/raid_members?id=eq.${memberXId}&select=user_id`);
    check('① 取消确认：user_id 仍为 null（未认领）', row0.body && row0.body[0] && row0.body[0].user_id === null);

    // 确认 → 落库（主链路：点击→弹窗→确认→toast→列表变为认领人）
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#membersTableBody tr')];
      const row = rows.find(r => r.textContent.includes('WP21成员X'));
      row.querySelector('.claim-pending-btn').click();
    });
    await page.waitForSelector('#claimConfirmModal.show', { timeout: 5000 });
    await page.click('#claimConfirmBtn');
    await page.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await sleep(2000);
    const row1 = await svc('GET', `/rest/v1/raid_members?id=eq.${memberXId}&select=user_id`);
    check('① 确认认领落库（user_id=本人）', row1.body && row1.body[0] && row1.body[0].user_id === owner.uid);
    const afterClaim = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#membersTableBody tr')];
      const row = rows.find(r => r.textContent.includes('WP21成员X'));
      return row ? row.querySelector('.claim-btns').innerText.trim() : '(行未找到)';
    });
    check('① 认领后列表不再显示「待认领」（本人行变为解除入口）', !afterClaim.includes('待认领'), afterClaim || '空');
    await page.screenshot({ path: path.join(SHOT_DIR, '3-after-claim-1366.png') });

    // ③ 公会设置开关用途说明 + 代派入口说明
    await page.evaluate(() => openGuildSettings());
    await page.waitForSelector('#guildSettingsModal.show', { timeout: 5000 });
    await sleep(800);
    const settingsText = await page.evaluate(() => document.getElementById('guildSettingsModal').innerText);
    check('③ 公会设置：认领人标签开关用途说明在', settingsText.includes('控制心愿单与装备分配列表里是否显示每个角色背后的认领人'));
    await page.screenshot({ path: path.join(SHOT_DIR, '4-guild-settings-hint-1366.png') });
    await page.evaluate(() => closeModal('guildSettingsModal'));
    await sleep(500);

    // 成员编辑弹窗：认领人分组说明文字
    await page.evaluate(() => editMember((appData.members.find(m => m.name === 'WP21成员X') || {}).id));
    await sleep(1500);
    const claimGroupText = await page.evaluate(() => {
      const g = document.getElementById('memberClaimGroup');
      return g && g.style.display !== 'none' ? g.innerText : '(分组未显示)';
    });
    check('③ 成员编辑弹窗：代派入口说明文字在', claimGroupText.includes('管理者可在此直接为成员指定'), claimGroupText.slice(0, 60));
    await page.screenshot({ path: path.join(SHOT_DIR, '5-member-edit-claim-hint-1366.png') });
    await page.evaluate(() => closeModal('memberModal'));
    await sleep(500);

    // ④ 改名即生效（不刷新页面）：用户中心改名 → 右上角立即更新
    const nickBefore = await page.evaluate(() => document.getElementById('userNickname').textContent);
    await page.click('#userMenuTrigger');
    await sleep(300);
    await page.evaluate(() => userMenuAction('center'));
    await page.waitForSelector('#userCenterModal.show', { timeout: 5000 });
    await sleep(1500);
    const ucVal = await page.evaluate(() => document.getElementById('ucDisplayName').value);
    check('④ 用户中心显示名读自 user_metadata（=注册时旧名）', ucVal === 'WP21旧名', `值=${ucVal}`);
    await page.fill('#ucDisplayName', 'WP21新名');
    await page.click('button[onclick="saveUserProfile()"]');
    await sleep(2500); // alert 已被 dialog 监听自动接受
    const nickAfter = await page.evaluate(() => document.getElementById('userNickname').textContent);
    check('④ 改名后右上角立即生效（不刷新）', nickAfter === 'WP21新名', `${nickBefore} → ${nickAfter}`);
    await page.screenshot({ path: path.join(SHOT_DIR, '6-rename-immediate-1366.png') });

    // user_metadata 落库核验（Admin API）
    const adminRes = await fetch(`${SB}/auth/v1/admin/users/${owner.uid}`, { headers: SVC });
    const adminBody = await adminRes.json();
    check('④ user_metadata.display_name 落库 = 新名', adminBody && adminBody.user_metadata && adminBody.user_metadata.display_name === 'WP21新名',
      JSON.stringify(adminBody.user_metadata));

    // 刷新后一致
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(2000);
    const nickReload = await page.evaluate(() => document.getElementById('userNickname').textContent);
    check('④ 刷新后右上角仍为 WP21新名', nickReload === 'WP21新名', `值=${nickReload}`);
    await ctx.close();

    // ================= 1920×1080 截图 =================
    const ctx2 = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page2 = await ctx2.newPage();
    page2.on('pageerror', e => pageErrors.push('pageerror(1080p): ' + e.message));
    page2.on('dialog', d => d.accept());
    await login(page2);
    await page2.click('.nav-item[data-page="members"]');
    await sleep(1200);
    await page2.screenshot({ path: path.join(SHOT_DIR, '7-members-1920.png') });
    // 认领弹窗 1080p（成员已被本人认领，先解除再走弹窗截图）
    await page2.evaluate(async () => {
      const m = appData.members.find(m2 => m2.name === 'WP21成员X');
      await window.CloudSync.setRaidMemberClaim(m.id, null);
      await window.CloudSync.reloadData('members');
      renderMembers();
    });
    await sleep(1000);
    await page2.evaluate(() => {
      const rows = [...document.querySelectorAll('#membersTableBody tr')];
      const row = rows.find(r => r.textContent.includes('WP21成员X'));
      row.querySelector('.claim-pending-btn').click();
    });
    await page2.waitForSelector('#claimConfirmModal.show', { timeout: 5000 });
    await sleep(600); // 等 fadeIn 过渡结束再截图
    await page2.screenshot({ path: path.join(SHOT_DIR, '8-claim-confirm-modal-1920.png') });
    await ctx2.close();

    const realErrors = pageErrors.filter(e => !e.includes('status of 406'));
    check('全程零 JS 错误（406=既有用户资料空行噪音，已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#21 WP1 验证: ${passed}/${results.length} 通过 =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
