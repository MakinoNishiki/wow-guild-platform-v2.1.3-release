// 任务书 #18 WP1 浏览器实测（playwright chromium，headless）
// 覆盖：成员管理「离队/删除」分离 + 真删除历史计数护栏
//   A. 零历史成员：🗑 可彻底删除，删后库中 raid_members/attendance/wishlists/loot 无残留
//   B. 有历史成员（考勤1+心愿1+装备1）：🗑 必被拦截，弹窗计数文案准确，数据不动
//   C. 离队按钮维持软删除语义（status=离队，行保留，出现恢复按钮）
//   D. viewer 登录看不到操作按钮（.action-btns 被 viewer-mode 隐藏）
// 用法: node scripts/verify-member-hard-delete.js   （前置：npm i playwright，浏览器缓存已就绪）
// 取证截图输出到 backup/2026-08-04-task18-wp1/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-04-task18-wp1');
const PORT = 15631;
const BASE = `http://localhost:${PORT}`;
const EMAIL = 'wp1-owner@wowbutler.cn';
const EMAIL2 = 'wp1-viewer@wowbutler.cn';
const PWD = 'Wp1-Test-2026!';

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
  return body.user.id;
}

let serverProc = null;
let ownerUid = null, viewerUid = null, testGuildId = null;
let histMemberId = null, zeroMemberName = 'WP1零史', histMemberName = 'WP1有史', leaveMemberName = 'WP1离队';

async function setup() {
  ownerUid = await ensureUser(EMAIL, 'WP1会长');
  viewerUid = await ensureUser(EMAIL2, 'WP1看客');
  const g = await svc('POST', '/rest/v1/guilds', { name: 'WP1验收会', owner_id: ownerUid, invite_code: 'WP1A' + Date.now().toString(36).slice(-4).toUpperCase() });
  if (g.status !== 201) throw new Error('建会失败: ' + JSON.stringify(g.body));
  testGuildId = g.body[0].id;
  let gm = await svc('POST', '/rest/v1/guild_members', { guild_id: testGuildId, user_id: ownerUid, role: 'owner', display_name: 'WP1会长' });
  if (gm.status !== 201) throw new Error('owner 入会失败: ' + JSON.stringify(gm.body));
  gm = await svc('POST', '/rest/v1/guild_members', { guild_id: testGuildId, user_id: viewerUid, role: 'viewer', display_name: 'WP1看客' });
  if (gm.status !== 201) throw new Error('viewer 入会失败: ' + JSON.stringify(gm.body));

  // 有历史成员：成员 + 1 考勤 + 1 心愿 + 1 装备（assignedTo 名字口径）
  const m = await svc('POST', '/rest/v1/raid_members', { guild_id: testGuildId, name: histMemberName, class: '战士', spec: '防护', status: '正式' });
  if (m.status !== 201) throw new Error('建有史成员失败: ' + JSON.stringify(m.body));
  histMemberId = m.body[0].id;
  const act = await svc('POST', '/rest/v1/activities', { guild_id: testGuildId, name: 'WP1考勤源', activity_date: '2026-08-04', raid: 'WP1团', status: 'normal' });
  if (act.status !== 201) throw new Error('建活动失败: ' + JSON.stringify(act.body));
  const att = await svc('POST', '/rest/v1/activity_attendance', { activity_id: act.body[0].id, member_id: histMemberId, status: 'present' });
  if (att.status !== 201) throw new Error('建考勤失败: ' + JSON.stringify(att.body));
  const wish = await svc('POST', '/rest/v1/wishlists', { guild_id: testGuildId, member_id: histMemberId, items: [{ itemName: 'WP1心愿剑', priority: 'P1' }] });
  if (wish.status !== 201) throw new Error('建心愿失败: ' + JSON.stringify(wish.body));
  const loot = await svc('POST', '/rest/v1/loot_records', { guild_id: testGuildId, item_name: 'WP1装备斧', item_stats: { assignedTo: histMemberName } });
  if (loot.status !== 201) throw new Error('建装备失败: ' + JSON.stringify(loot.body));

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  try { await svc('DELETE', `/rest/v1/loot_records?guild_id=eq.${testGuildId}`); } catch {}
  try { await svc('DELETE', `/rest/v1/activities?guild_id=eq.${testGuildId}`); } catch {}
  try { await svc('DELETE', `/rest/v1/raid_members?guild_id=eq.${testGuildId}`); } catch {}
  try { await svc('DELETE', `/rest/v1/guilds?id=eq.${testGuildId}`); } catch (e) { console.error('删公会失败', e); }
  for (const uid of [ownerUid, viewerUid]) {
    try { if (uid) await fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: SVC }); } catch (e) { console.error('删用户失败', e); }
  }
  if (serverProc) serverProc.kill();
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

async function addMemberViaUI(page, name) {
  await page.click('button:has-text("+ 添加成员")');
  await page.waitForSelector('#memberModal.show', { timeout: 10000 });
  await page.fill('#memberName', name);
  await page.selectOption('#memberClass', '法师');
  await page.click('#memberSaveBtn');
  await page.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
  await sleep(1800);
}

// 在成员表中找到指定名字所在行的操作按钮并点击（按 title 选按钮）
async function clickRowBtn(page, memberName, btnTitle) {
  const ok = await page.evaluate(({ memberName, btnTitle }) => {
    const rows = [...document.querySelectorAll('#membersTableBody tr')];
    const row = rows.find(r => r.textContent.includes(memberName));
    if (!row) return 'no-row';
    const btn = [...row.querySelectorAll('button')].find(b => b.title === btnTitle);
    if (!btn) return 'no-btn';
    btn.click();
    return 'ok';
  }, { memberName, btnTitle });
  if (ok !== 'ok') throw new Error(`点击行按钮失败: ${ok}（${memberName} / ${btnTitle}）`);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const pageErrors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => pageErrors.push('pageerror: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console: ' + msg.text()); });
    page.on('dialog', d => d.accept()); // confirm() 一律确认

    await login(page, EMAIL);
    await page.click('.nav-item[data-page="members"]');
    await sleep(1000);
    check('0. owner 登录进入成员管理', true);

    // ---------- A. 零历史成员：可彻底删除 ----------
    await addMemberViaUI(page, zeroMemberName);
    let rowCount = await page.evaluate((n) =>
      [...document.querySelectorAll('#membersTableBody tr')].filter(r => r.textContent.includes(n)).length, zeroMemberName);
    check('A1. 零历史成员已通过 UI 创建', rowCount === 1, `行数=${rowCount}`);

    await clickRowBtn(page, zeroMemberName, '彻底删除（仅零历史成员）');
    await page.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await sleep(2000);
    rowCount = await page.evaluate((n) =>
      [...document.querySelectorAll('#membersTableBody tr')].filter(r => r.textContent.includes(n)).length, zeroMemberName);
    const dbRows = await svc('GET', `/rest/v1/raid_members?guild_id=eq.${testGuildId}&name=eq.${zeroMemberName}&select=id`);
    check('A2. 零历史成员已彻底删除（列表移除）', rowCount === 0, `行数=${rowCount}`);
    check('A3. 删后 raid_members 库中无残留', Array.isArray(dbRows.body) && dbRows.body.length === 0, `DB行数=${dbRows.body && dbRows.body.length}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'A-zero-history-deleted.png') });

    // ---------- B. 有历史成员：必被拦截，计数准确 ----------
    await clickRowBtn(page, histMemberName, '彻底删除（仅零历史成员）');
    await page.waitForSelector('#memberDeleteBlockModal.show', { timeout: 10000 });
    const blockText = await page.evaluate(() => document.getElementById('memberDeleteBlockText').textContent);
    check('B1. 有历史成员点删除被拦截（弹窗出现）', true);
    check('B2. 拦截文案计数准确（1考勤/1心愿/1装备）',
      blockText.includes('1 条考勤') && blockText.includes('1 条心愿单') && blockText.includes('1 条装备记录') && blockText.includes('离队'),
      blockText);
    await page.screenshot({ path: path.join(SHOT_DIR, 'B-blocked-with-counts.png') });
    await page.click('#memberDeleteBlockModal button:has-text("知道了")');
    await sleep(500);
    const stillThere = await svc('GET', `/rest/v1/raid_members?id=eq.${histMemberId}&select=id,status`);
    check('B3. 拦截后成员行仍在且状态未变', Array.isArray(stillThere.body) && stillThere.body.length === 1 && stillThere.body[0].status === '正式');

    // ---------- C. 离队按钮维持软删除语义 ----------
    await addMemberViaUI(page, leaveMemberName);
    await clickRowBtn(page, leaveMemberName, '离队');
    await page.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await sleep(2000);
    const leaveRow = await svc('GET', `/rest/v1/raid_members?guild_id=eq.${testGuildId}&name=eq.${leaveMemberName}&select=id,status`);
    check('C1. 离队 = status 置「离队」不真删行', Array.isArray(leaveRow.body) && leaveRow.body.length === 1 && leaveRow.body[0].status === '离队',
      `status=${leaveRow.body && leaveRow.body[0] && leaveRow.body[0].status}`);
    // 开启「显示已离队」，离队行应同时有 恢复 + 彻底删除 按钮
    await page.check('#memberShowDeparted');
    await sleep(800);
    const leaveBtns = await page.evaluate((n) => {
      const rows = [...document.querySelectorAll('#membersTableBody tr')];
      const row = rows.find(r => r.textContent.includes(n));
      return row ? [...row.querySelectorAll('button')].map(b => b.title) : [];
    }, leaveMemberName);
    check('C2. 离队行提供「恢复」与「彻底删除」', leaveBtns.includes('恢复') && leaveBtns.includes('彻底删除（仅零历史成员）'), leaveBtns.join('|'));
    await page.screenshot({ path: path.join(SHOT_DIR, 'C-departed-row-btns.png') });

    console.log('\n== owner 侧页面 JS 错误 ==');
    console.log(pageErrors.length ? pageErrors.join('\n') : '（无）');
    check('Y. owner 侧全程零 JS 错误', pageErrors.length === 0, pageErrors.join(' | ') || '无');
    await ctx.close();

    // ---------- D. viewer 无操作按钮 ----------
    const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page2 = await ctx2.newPage();
    await login(page2, EMAIL2);
    await page2.click('.nav-item[data-page="members"]');
    await sleep(1000);
    const viewerVisible = await page2.evaluate(() => {
      const btns = [...document.querySelectorAll('#membersTableBody .action-btns button')];
      const visible = btns.filter(b => b.offsetParent !== null);
      return { total: btns.length, visible: visible.length, viewerMode: document.body.classList.contains('viewer-mode') };
    });
    check('D1. viewer 处于 viewer-mode', viewerVisible.viewerMode === true);
    check('D2. viewer 看不到任何行操作按钮', viewerVisible.visible === 0, `可见=${viewerVisible.visible}/${viewerVisible.total}`);
    await page2.screenshot({ path: path.join(SHOT_DIR, 'D-viewer-no-btns.png') });
    await ctx2.close();
  } finally {
    await browser.close();
    await cleanup();
  }

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#18 WP1 浏览器实测: ${passed}/${results.length} 通过 =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
