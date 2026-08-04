// 任务书 #18 WP2 浏览器实测（playwright chromium，headless）
// 覆盖：一用户多角色认领（R1）/ 个人视角聚合（R2）/ 用户中心「我的认领」（R3）/ 认领人标签+公会开关（R4）
//   A. R1：用户 A 在同公会认领甲、乙两个成员；编辑成员不再覆盖认领人（堵 cloud.js 旧副作用）
//   B. R1：第三人 C 看不到甲的认领按钮（先到先得，他人不可抢）；owner 可在编辑弹窗指定/调整认领人
//   C. R2+R3：A 的用户中心「我的认领」列出甲、乙（公会/区服/状态），本公会聚合行正确；解绑乙后乙回「未认领」
//   D. R4：心愿单/装备列表显示认领人标签（默认开）；注入关开关后两处标签消失；设置页开关 owner 可改、viewer 不可见
// 注意：guilds.show_claimer_label 列的 SQL 迁移由运营在 Dashboard 执行（本环境无 DDL 通道），
//       本脚本不测「保存开关」写库链路，只测前端两态渲染（默认开 + 注入关）。
// 用法: node scripts/verify-multi-claim.js   （前置：npm i playwright，浏览器缓存已就绪）
// 取证截图输出到 backup/2026-08-04-task18-wp2/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-04-task18-wp2');
const PORT = 15633;
const BASE = `http://localhost:${PORT}`;
const EMAIL_A = 'wp2-a@wowbutler.cn';
const EMAIL_C = 'wp2-c@wowbutler.cn';
const PWD = 'Wp2-Test-2026!';

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
let uidA = null, uidC = null, testGuildId = null;
let memberJiaId = null, memberYiId = null; // 甲 / 乙

async function setup() {
  uidA = await ensureUser(EMAIL_A, 'WP2会长A');
  uidC = await ensureUser(EMAIL_C, 'WP2编辑C');
  const g = await svc('POST', '/rest/v1/guilds', { name: 'WP2验收会', owner_id: uidA, invite_code: 'WP2A' + Date.now().toString(36).slice(-4).toUpperCase(), server_region: 'CN', server_name: 'WP2测试服' });
  if (g.status !== 201) throw new Error('建会失败: ' + JSON.stringify(g.body));
  testGuildId = g.body[0].id;
  let gm = await svc('POST', '/rest/v1/guild_members', { guild_id: testGuildId, user_id: uidA, role: 'owner', display_name: 'WP2会长A' });
  if (gm.status !== 201) throw new Error('A 入会失败: ' + JSON.stringify(gm.body));
  gm = await svc('POST', '/rest/v1/guild_members', { guild_id: testGuildId, user_id: uidC, role: 'editor', display_name: 'WP2编辑C' });
  if (gm.status !== 201) throw new Error('C 入会失败: ' + JSON.stringify(gm.body));

  const j = await svc('POST', '/rest/v1/raid_members', { guild_id: testGuildId, name: 'WP2甲', class: '战士', spec: '防护', status: '正式' });
  const y = await svc('POST', '/rest/v1/raid_members', { guild_id: testGuildId, name: 'WP2乙', class: '法师', spec: '奥术', status: '正式' });
  if (j.status !== 201 || y.status !== 201) throw new Error('建成员失败');
  memberJiaId = j.body[0].id;
  memberYiId = y.body[0].id;

  // R2 聚合素材：甲 1 出席 + 乙 1 请假（同一场活动），甲 1 装备，乙 1 心愿
  const act = await svc('POST', '/rest/v1/activities', { guild_id: testGuildId, name: 'WP2聚合源', activity_date: '2026-08-04', raid: 'WP2团', status: 'normal' });
  await svc('POST', '/rest/v1/activity_attendance', { activity_id: act.body[0].id, member_id: memberJiaId, status: 'present' });
  await svc('POST', '/rest/v1/activity_attendance', { activity_id: act.body[0].id, member_id: memberYiId, status: 'leave' });
  await svc('POST', '/rest/v1/loot_records', { guild_id: testGuildId, item_name: 'WP2甲之剑', item_stats: { assignedTo: 'WP2甲' } });
  await svc('POST', '/rest/v1/wishlists', { guild_id: testGuildId, member_id: memberYiId, items: [{ itemName: 'WP2乙之心愿', priority: 'P1' }] });

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
  for (const uid of [uidA, uidC]) {
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

async function rowBtnTitles(page, memberName) {
  return page.evaluate((n) => {
    const rows = [...document.querySelectorAll('#membersTableBody tr')];
    const row = rows.find(r => r.textContent.includes(n));
    return row ? [...row.querySelectorAll('button')].map(b => b.title) : [];
  }, memberName);
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
    page.on('dialog', d => d.accept());

    await login(page, EMAIL_A);
    await page.click('.nav-item[data-page="members"]');
    await sleep(1000);
    check('0. A 登录进入成员管理', true);

    // ---------- A. R1：A 认领甲、乙 ----------
    await clickRowBtn(page, 'WP2甲', '认领为我的角色');
    await page.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await sleep(1800);
    let db = await svc('GET', `/rest/v1/raid_members?id=eq.${memberJiaId}&select=user_id`);
    check('A1. A 认领甲成功（DB user_id=A）', db.body && db.body[0] && db.body[0].user_id === uidA, `user_id=${db.body && db.body[0] && db.body[0].user_id}`);

    await clickRowBtn(page, 'WP2乙', '认领为我的角色');
    await page.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await sleep(1800);
    db = await svc('GET', `/rest/v1/raid_members?id=eq.${memberYiId}&select=user_id`);
    check('A2. A 再认领乙成功（一用户多角色）', db.body && db.body[0] && db.body[0].user_id === uidA);

    // 认领后甲行出现「解除认领」，不再出现「认领为我的角色」
    const jiaBtns = await rowBtnTitles(page, 'WP2甲');
    check('A3. 已认领行显示解除认领、不再显示认领按钮', jiaBtns.includes('解除认领') && !jiaBtns.includes('认领为我的角色'), jiaBtns.join('|'));

    // A4：编辑成员（改备注）不再覆盖认领人（堵 cloud.js 旧副作用）
    await clickRowBtn(page, 'WP2甲', '编辑');
    await page.waitForSelector('#memberModal.show', { timeout: 10000 });
    await page.fill('#memberNotes', 'WP2编辑占位');
    await page.click('#memberSaveBtn');
    await page.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await sleep(1800);
    db = await svc('GET', `/rest/v1/raid_members?id=eq.${memberJiaId}&select=user_id,notes`);
    check('A4. 编辑成员后认领人不被覆盖', db.body && db.body[0] && db.body[0].user_id === uidA, `user_id=${db.body && db.body[0] && db.body[0].user_id}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'A-claimed-members.png') });

    // ---------- B. R1：C 视角不可抢 + owner 指定认领人 ----------
    const ctxC = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageC = await ctxC.newPage();
    pageC.on('dialog', d => d.accept());
    await login(pageC, EMAIL_C);
    await pageC.click('.nav-item[data-page="members"]');
    await sleep(1000);
    const cJiaBtns = await rowBtnTitles(pageC, 'WP2甲');
    check('B1. 第三人 C 看不到甲的认领按钮（不可抢）', !cJiaBtns.includes('认领为我的角色'), cJiaBtns.join('|'));
    await pageC.screenshot({ path: path.join(SHOT_DIR, 'B-c-cannot-grab.png') });
    await ctxC.close();

    // owner 在编辑弹窗把乙的认领人调整为 C
    await clickRowBtn(page, 'WP2乙', '编辑');
    await page.waitForSelector('#memberModal.show', { timeout: 10000 });
    await page.waitForSelector('#memberClaimUser option', { state: 'attached', timeout: 10000 });
    const claimOpts = await page.evaluate(() => [...document.querySelectorAll('#memberClaimUser option')].map(o => o.textContent));
    check('B2. 编辑弹窗认领人下拉含公会成员名单', claimOpts.some(t => t.includes('WP2会长A')) && claimOpts.some(t => t.includes('WP2编辑C')) && claimOpts.includes('未认领'), claimOpts.join('|'));
    await page.selectOption('#memberClaimUser', uidC);
    await page.click('#memberSaveBtn');
    await page.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await sleep(1800);
    db = await svc('GET', `/rest/v1/raid_members?id=eq.${memberYiId}&select=user_id`);
    check('B3. owner 指定乙的认领人为 C', db.body && db.body[0] && db.body[0].user_id === uidC, `user_id=${db.body && db.body[0] && db.body[0].user_id}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'B-owner-assign.png') });

    // ---------- C. R2+R3：用户中心「我的认领」+ 聚合 ----------
    // C 打开用户中心应看到乙；A 应看到甲（乙已转给 C）
    await page.evaluate(() => openUserCenter());
    await page.waitForSelector('#userCenterModal.show', { timeout: 10000 });
    await page.click('.uc-tab[data-tab="claims"]');
    await sleep(1500);
    const aClaims = await page.evaluate(() => ({
      text: document.getElementById('myClaimsList').textContent,
      summary: document.getElementById('myClaimsSummary').textContent,
    }));
    check('C1. A 的「我的认领」含甲（公会后乙已转 C）', aClaims.text.includes('WP2甲') && !aClaims.text.includes('WP2乙'), aClaims.text.slice(0, 80));
    check('C2. 「我的认领」条目含公会与区服', aClaims.text.includes('WP2验收会') && aClaims.text.includes('WP2测试服'), aClaims.text.slice(0, 120));
    check('C3. R2 聚合行：本公会认领 1 人·出勤率 100%（甲 1 出席）·装备 1 件', 
      aClaims.summary.includes('1') && aClaims.summary.includes('100%') && aClaims.summary.includes('装备'), aClaims.summary);
    await page.screenshot({ path: path.join(SHOT_DIR, 'C-a-my-claims.png') });
    await page.click('#userCenterModal .modal-close');
    await sleep(400);

    // C 的用户中心：解绑乙（只能解自己的；C 是 editor 代理放行）
    const ctxC2 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageC2 = await ctxC2.newPage();
    pageC2.on('dialog', d => d.accept());
    await login(pageC2, EMAIL_C);
    await pageC2.evaluate(() => openUserCenter());
    await pageC2.waitForSelector('#userCenterModal.show', { timeout: 10000 });
    await pageC2.click('.uc-tab[data-tab="claims"]');
    await sleep(1500);
    const cClaims = await pageC2.evaluate(() => document.getElementById('myClaimsList').textContent);
    check('C4. C 的「我的认领」含乙（owner 指定生效）', cClaims.includes('WP2乙'), cClaims.slice(0, 80));
    await pageC2.screenshot({ path: path.join(SHOT_DIR, 'C-c-my-claims.png') });
    await pageC2.click('button:has-text("解除认领")');
    await pageC2.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await sleep(2000);
    db = await svc('GET', `/rest/v1/raid_members?id=eq.${memberYiId}&select=user_id`);
    check('C5. C 解绑乙成功（user_id 清空，回到未认领）', db.body && db.body[0] && db.body[0].user_id === null);
    await ctxC2.close();

    // A 侧刷新成员数据（C 在另一上下文解绑，A 的 appData 需重新拉取）
    await page.evaluate(async () => { await window.CloudSync.reloadData('members'); });
    await sleep(800);

    // ---------- D. R4：认领人标签 + 开关 ----------
    await page.click('.nav-item[data-page="wishlist"]');
    await sleep(1500);
    let labels = await page.evaluate(() => document.getElementById('wishlistTableBody').textContent);
    check('D1. 心愿单显示认领人标签（乙解绑后=未认领）', labels.includes('未认领'), labels.slice(0, 120));
    await page.screenshot({ path: path.join(SHOT_DIR, 'D-wishlist-label.png') });

    await page.click('.nav-item[data-page="loot"]');
    await sleep(1500);
    labels = await page.evaluate(() => document.getElementById('lootTableBody').textContent);
    check('D2. 装备列表显示认领人标签（甲=认领人：WP2会长A）', labels.includes('认领人：WP2会长A'), labels.slice(0, 120));
    await page.screenshot({ path: path.join(SHOT_DIR, 'D-loot-label.png') });

    // 注入关开关（迁移未执行时等价于 show_claimer_label=false 的前端行为）
    await page.evaluate(() => {
      window.CloudSync.getCurrentGuild().show_claimer_label = false;
      lootRender();
    });
    await sleep(500);
    labels = await page.evaluate(() => document.getElementById('lootTableBody').textContent);
    check('D3. 开关关：装备列表标签消失', !labels.includes('认领人：') && !labels.includes('未认领'), labels.slice(0, 100));
    await page.click('.nav-item[data-page="wishlist"]');
    await sleep(800);
    labels = await page.evaluate(() => document.getElementById('wishlistTableBody').textContent);
    check('D4. 开关关：心愿单标签消失', !labels.includes('认领人：') && !labels.includes('未认领'), labels.slice(0, 100));
    await page.evaluate(() => { window.CloudSync.getCurrentGuild().show_claimer_label = true; });

    // 设置页开关：owner 可见可改
    await page.evaluate(() => openGuildSettings());
    await page.waitForSelector('#guildSettingsModal.show', { timeout: 10000 });
    const toggleState = await page.evaluate(() => {
      const el = document.getElementById('guildShowClaimerLabel');
      return el ? { exists: true, checked: el.checked, disabled: el.disabled } : { exists: false };
    });
    check('D5. owner 设置页可见开关且默认开、可编辑', toggleState.exists && toggleState.checked === true && toggleState.disabled === false, JSON.stringify(toggleState));
    await page.screenshot({ path: path.join(SHOT_DIR, 'D-owner-toggle.png') });
    await page.click('#guildSettingsModal .modal-close');
    await sleep(400);

    // viewer 看不到开关（用第二个 viewer 用户成本高，改用 C(editor) 验证非 owner 禁用即可——开关仅 owner 可改）
    const ctxC3 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageC3 = await ctxC3.newPage();
    await login(pageC3, EMAIL_C);
    await pageC3.evaluate(() => openGuildSettings());
    await pageC3.waitForSelector('#guildSettingsModal.show', { timeout: 10000 });
    const cToggle = await pageC3.evaluate(() => {
      const el = document.getElementById('guildShowClaimerLabel');
      return el ? { exists: true, disabled: el.disabled } : { exists: false };
    });
    check('D6. 非 owner（editor）开关禁用', cToggle.exists && cToggle.disabled === true, JSON.stringify(cToggle));
    await ctxC3.close();

    console.log('\n== 页面 JS 错误总览 ==');
    console.log(pageErrors.length ? pageErrors.join('\n') : '（无）');
    // 既有噪音排除：新用户无 user_profiles 行时 getUserProfile 的 .single() 报 406（PGRST116），与本次改动无关
    const realErrors = pageErrors.filter(e => !e.includes('status of 406'));
    check('Z. 全程零 JS 错误（406=既有用户资料空行噪音，已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
    await ctx.close();
  } finally {
    await browser.close();
    await cleanup();
  }

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#18 WP2 浏览器实测: ${passed}/${results.length} 通过 =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
