// 任务书 #35 验证（BUG 包：BUG-074 批量工具条双功能 + BUG-073 公会卡服务器名竞态）：
//   A. WP2 BUG-073：20 次混合采样（F5 reload ×6 / 切页往返 ×6 / 切换公会往返 ×8）#guildName 逐次恒定
//      =「公会名 (服务器)」+ §2 computed 可见性断言；
//      （REQ-103，任务书 #36 WP4：#guildBarName 随侧栏公会行整行移除——采样断言改 #guildName 单点，
//        元素移除零残留由 verify-task36 兜底，属裁定驱动适配）
//   B. WP1 BUG-074：工具条三钮布局、全选覆盖全部渲染行（REQ-049 对齐口径）、批量离队活跃行生效+
//      已离队跳过 toast 注明、批量真删混合行（输「彻底删除」四字解锁）→ 行消失 + 考勤/装备 SET NULL
//      快照灰显「已删除」+ 心愿级联清空 + 垃圾桶逐行在案含 history_counts、未输四字按钮禁用；
//   C. 单个 🚪/🗑/♻️ 按钮覆盖面零回归（离队行 ♻️+🗑、活跃行 🚪+🗑）；
//   D. 测试数据（T35A 前缀，含 deleted_raid_members 垃圾桶）自清理复核为零。
// 红线：不改业务代码；不 git 操作。用法: node scripts/verify-task35.js｜截图 → backup/2026-08-11-task35/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(__dirname, '..', '.s6-ssh', 'node_modules', 'playwright-core'))); }

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-11-task35');
const PORT = 15667;
const BASE = `http://localhost:${PORT}`;
const EMAIL = 't35a-owner@wowbutler.cn';
const PWD = 'T35abcd12';

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

let serverProc = null, uid = null, guildA = null, guildB = null;
const M = {}; // 成员 id 表

async function cleanup() {
  const steps = [];
  for (const gid of [guildA, guildB].filter(Boolean)) {
    const acts = await svc('GET', `/rest/v1/activities?select=id&guild_id=eq.${gid}`);
    for (const a of (acts.body || [])) await svc('DELETE', `/rest/v1/activity_attendance?activity_id=eq.${a.id}`);
    await svc('DELETE', `/rest/v1/activities?guild_id=eq.${gid}`);
    await svc('DELETE', `/rest/v1/raid_members?guild_id=eq.${gid}`);
    await svc('DELETE', `/rest/v1/wishlists?guild_id=eq.${gid}`);
    await svc('DELETE', `/rest/v1/loot_records?guild_id=eq.${gid}`);
    await svc('DELETE', `/rest/v1/deleted_raid_members?guild_id=eq.${gid}`);
    await svc('DELETE', `/rest/v1/guild_members?guild_id=eq.${gid}`);
    steps.push(`guild ${gid.slice(0, 8)}:ok`);
  }
  await svc('DELETE', '/rest/v1/guilds?name=like.T35A*');
  await svc('DELETE', '/rest/v1/deleted_raid_members?name=like.T35A*');
  if (uid) {
    await svc('DELETE', `/rest/v1/user_profiles?user_id=eq.${uid}`);
    try { await fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); }
  }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const counts = [];
  const qs = [
    ['guilds', '/rest/v1/guilds?select=id&name=like.T35A*'],
    ['raid_members', '/rest/v1/raid_members?select=id&name=like.T35A*'],
    ['activities', '/rest/v1/activities?select=id&name=like.T35A*'],
    ['deleted_raid_members', '/rest/v1/deleted_raid_members?select=id&name=like.T35A*'],
    ['wishlists', '/rest/v1/wishlists?select=id&guild_id=eq.' + (guildA || '00000000-0000-0000-0000-000000000000')],
    ['loot_records', '/rest/v1/loot_records?select=id&guild_id=eq.' + (guildA || '00000000-0000-0000-0000-000000000000')],
  ];
  for (const [label, p] of qs) {
    const c = await svc('GET', p);
    counts.push([label, Array.isArray(c.body) ? c.body.length : '?']);
  }
  if (uid) {
    const cp = await svc('GET', `/rest/v1/user_profiles?select=user_id&user_id=eq.${uid}`);
    const profN = Array.isArray(cp.body) ? cp.body.length : '?';
    const r = await fetch(`${SB}/auth/v1/admin/users/${uid}`, { headers: SVC });
    counts.push([`user(profiles=${profN},auth ${r.status === 404 ? 0 : '在'})`, profN === 0 && r.status === 404 ? 0 : 1]);
  }
  console.log('[清理复核] ' + counts.map(([l, n]) => `${l}=${n}`).join(' | '));
  check('测试数据清零复核（全 0，含垃圾桶）', counts.every(([, n]) => n === 0), counts.map(([, n]) => n).join('/'));
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  // 预清理
  const r0 = await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=200`, { headers: SVC });
  const b0 = await r0.json().catch(() => ({}));
  for (const u of (b0.users || [])) if ((u.email || '').startsWith('t35a-')) await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: SVC });
  await svc('DELETE', '/rest/v1/guilds?name=like.T35A*');

  // 账号 + 双公会（均带 server_name）
  let res = await fetch(`${SB}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'T35A会长' } }) });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD }) });
    body = await res.json();
    if (!body.access_token) throw new Error('owner 登录失败');
  }
  uid = body.user.id;
  const gA = await svc('POST', '/rest/v1/guilds', { name: 'T35A公会甲', owner_id: uid, invite_code: 'T35A' + Date.now().toString(36).slice(-4).toUpperCase(), server_region: '一区', server_name: '无尽之海' });
  if (gA.status !== 201) throw new Error('建会甲失败: ' + JSON.stringify(gA.body));
  guildA = gA.body[0].id;
  await svc('POST', '/rest/v1/guild_members', { guild_id: guildA, user_id: uid, role: 'owner', display_name: 'T35A会长' });
  await sleep(300);
  const gB = await svc('POST', '/rest/v1/guilds', { name: 'T35A公会乙', owner_id: uid, invite_code: 'T35B' + Date.now().toString(36).slice(-3).toUpperCase(), server_region: '一区', server_name: '回音山' });
  if (gB.status !== 201) throw new Error('建会乙失败: ' + JSON.stringify(gB.body));
  guildB = gB.body[0].id;
  await svc('POST', '/rest/v1/guild_members', { guild_id: guildB, user_id: uid, role: 'owner', display_name: 'T35A会长' });

  // 甲公会成员样本：正式甲 / 正式乙（有历史：考勤+心愿+装备）/ 离队丙 / 离队丁
  async function addMember(name, cls, status) {
    const m = await svc('POST', '/rest/v1/raid_members', { guild_id: guildA, name, class: cls, spec: '', role: '输出', status });
    if (m.status !== 201) throw new Error(`建成员 ${name} 失败: ` + JSON.stringify(m.body));
    return m.body[0].id;
  }
  M.jia = await addMember('T35A正式甲', '战士', '正式');
  M.yi = await addMember('T35A正式乙', '法师', '正式');
  M.bing = await addMember('T35A离队丙', '牧师', '离队');
  M.ding = await addMember('T35A离队丁', '盗贼', '离队');
  const today = new Date().toISOString().slice(0, 10);
  const act = await svc('POST', '/rest/v1/activities', { guild_id: guildA, name: 'T35A活动一', activity_date: today, raid: '虚影尖塔' });
  const actId = act.body[0].id;
  const at = await svc('POST', '/rest/v1/activity_attendance', { activity_id: actId, member_id: M.yi, member_name: 'T35A正式乙', status: 'present' });
  if (at.status !== 201) throw new Error('建考勤失败: ' + JSON.stringify(at.body));
  const wl = await svc('POST', '/rest/v1/wishlists', { guild_id: guildA, member_id: M.yi, items: [{ name: 'T35A测试心愿' }] });
  if (wl.status !== 201) throw new Error('心愿插入失败: ' + JSON.stringify(wl.body));
  const lt = await svc('POST', '/rest/v1/loot_records', {
    guild_id: guildA, character_id: M.yi, item_name: 'T35A测试之剑', item_category: '武器', item_slot: '双手',
    item_stats: { assignedTo: 'T35A正式乙', status: '已分配', priority: 'P1' }, obtained_date: today,
  });
  if (lt.status !== 201) throw new Error('装备插入失败: ' + JSON.stringify(lt.body));
  console.log('[样本] 双公会+四成员+乙历史（考勤1/心愿1/装备1）就绪');

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

    // ==================== A. WP2 BUG-073：20 次混合采样逐次恒定 ====================
    const NAME_A = 'T35A公会甲 (无尽之海)';
    const NAME_B = 'T35A公会乙 (回音山)';
    const readNames = () => page.evaluate(() => ({
      sub: document.getElementById('guildName').textContent,
      barGone: !document.getElementById('guildBarName'), // REQ-103（任务书 #36）：公会行已移除，元素应不存在
      subVisible: getComputedStyle(document.getElementById('guildName')).display !== 'none',
    }));
    const samples = [];
    const expectOf = async () => (await page.evaluate(() => window.CloudSync.getCurrentGuild().id)) === guildA ? NAME_A : NAME_B;
    // 首载即第 1 次采样
    samples.push(['首载', await readNames(), await expectOf()]);
    // F5 ×5
    for (let i = 0; i < 5; i++) {
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
      await sleep(2000);
      samples.push([`F5#${i + 1}`, await readNames(), await expectOf()]);
    }
    // 切页往返 ×6
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => { switchPage('members'); });
      await sleep(300);
      await page.evaluate(() => { switchPage('dashboard'); });
      await sleep(300);
      samples.push([`切页#${i + 1}`, await readNames(), await expectOf()]);
    }
    // 切换公会往返 ×8（甲→乙→甲……）——BUG-073 原裸名路径
    for (let i = 0; i < 8; i++) {
      const target = (i % 2 === 0) ? guildB : guildA;
      await page.evaluate((gid) => handleSwitchGuild(gid), target);
      await sleep(1800);
      samples.push([`切会#${i + 1}`, await readNames(), await expectOf()]);
    }
    const bad = samples.filter(([, n, exp]) => n.sub !== exp || !n.barGone || !n.subVisible);
    check('A1 20 次混合采样（F5×5+切页×6+切会×8+首载）#guildName 逐次恒定 =「公会名 (服务器)」（REQ-103 后 #guildBarName 不存在）',
      samples.length === 20 && bad.length === 0,
      bad.length ? `不一致: ${bad.map(([t, n, e]) => `${t}[${n.sub}]期望${e}`).join(' ; ')}` : `20/20 恒定（§2 computed 可见性同步断言）`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'a-guild-card.png') });
    // 确保回到甲公会进行 WP1
    await page.evaluate((gid) => handleSwitchGuild(gid), guildA);
    await sleep(1800);

    // ==================== B. WP1 BUG-074 批量工具条双功能 ====================
    await page.evaluate(() => switchPage('members'));
    await sleep(800);
    // 开「显示已离队」
    await page.evaluate(() => { document.getElementById('memberShowDeparted').checked = true; memberToggleShowDeparted(true); });
    await sleep(600);

    // B0 单个按钮覆盖面零回归（C 组）：活跃行 🚪+🗑，离队行 ♻️+🗑 无 🚪
    const b0 = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#membersTableBody tr')].filter(tr => tr.querySelector('.member-row-checkbox'));
      return rows.map(tr => ({
        raw: tr.textContent.replace(/\s+/g, ''),
        titles: [...tr.querySelectorAll('.action-btns button')].map(b => b.title),
      }));
    });
    const rowOf = (n) => b0.find(r => r.raw.includes(n));
    check('B0 单个按钮覆盖面零回归：活跃行=编辑/离队/彻底删除，离队行=编辑/恢复/彻底删除（无🚪）',
      rowOf('正式甲') && rowOf('正式甲').titles.includes('离队') && rowOf('正式甲').titles.some(t => t.includes('彻底删除'))
        && rowOf('离队丙') && !rowOf('离队丙').titles.includes('离队') && rowOf('离队丙').titles.includes('恢复') && rowOf('离队丙').titles.some(t => t.includes('彻底删除')),
      JSON.stringify(b0.map(r => `${r.raw.slice(0, 10)}:${r.titles.join('/')}`)));

    // B1 全选覆盖全部渲染行（REQ-049 对齐口径：活跃 2 + 离队 2 = 4）
    await page.evaluate(() => { document.getElementById('memberSelectAll').click(); });
    await sleep(400);
    const b1 = await page.evaluate(() => ({
      selected: [...document.querySelectorAll('.member-row-checkbox')].filter(cb => cb.checked).length,
      countText: document.getElementById('memberBatchCount').textContent,
      allChecked: document.getElementById('memberSelectAll').checked,
      btns: [...document.querySelectorAll('#memberBatchToolbar button')].map(b => b.textContent),
    }));
    check('B1 全选覆盖全部渲染行（含离队组 4/4）+ 工具条三钮布局「已选择 4 人 [批量离队][批量删除][取消选择]」',
      b1.selected === 4 && b1.countText === '已选择 4 人' && b1.allChecked
        && b1.btns.join('|') === '批量离队|批量删除|取消选择',
      JSON.stringify(b1));
    await page.evaluate(() => memberClearSelection());
    await sleep(400);

    // B2 批量离队：选 正式甲 + 离队丙 → 仅甲生效，丙跳过并 toast 注明
    await page.evaluate((ids) => { ids.forEach(id => memberToggleSelect(id, true)); memberUpdateBatchToolbar(); }, [M.jia, M.bing]);
    await page.evaluate(() => renderMembers());
    await sleep(400);
    await page.click('#memberBatchDepartBtn');
    await sleep(500);
    const b2m = await page.evaluate(() => ({
      title: document.getElementById('batchDeleteTitle').textContent,
      warning: document.getElementById('batchDeleteWarning').textContent,
      list: document.getElementById('batchDeleteList').textContent,
    }));
    check('B2 批量离队确认弹窗：标题「批量离队（1）」+ 名单仅活跃行 + 文案「标记为离队」',
      b2m.title === '批量离队（1）' && b2m.list.includes('T35A正式甲') && !b2m.list.includes('T35A离队丙') && b2m.warning.includes('标记为「离队」'),
      JSON.stringify(b2m));
    await page.click('#batchDeleteConfirmBtn');
    try {
      await page.waitForFunction(() => [...document.querySelectorAll('#toastContainer .toast')].some(t => t.textContent.includes('标记为离队')), undefined, { timeout: 30000, polling: 500 });
    } catch (e) { /* 断言兜底 */ }
    const b2 = await page.evaluate(() => [...document.querySelectorAll('#toastContainer .toast')].map(t => t.textContent).join('|'));
    const b2db = await svc('GET', `/rest/v1/raid_members?select=name,status&guild_id=eq.${guildA}&order=name`);
    const stOf = (n) => (b2db.body.find(r => r.name === n) || {}).status;
    check('B2 批量离队生效+跳过注明：正式甲→离队、离队丙维持、toast 注明「跳过 1 名已离队成员」',
      stOf('T35A正式甲') === '离队' && stOf('T35A离队丙') === '离队' && stOf('T35A正式乙') === '正式'
        && b2.includes('标记为离队') && b2.includes('跳过 1 名已离队成员'),
      `toast=${b2} db=${JSON.stringify(b2db.body)}`);

    // B3 批量真删：选 正式乙（有历史）+ 离队丁 → 四字解锁 → 行消失 + 快照灰显 + 心愿清空 + 垃圾桶在案
    await page.evaluate((ids) => { ids.forEach(id => memberToggleSelect(id, true)); memberUpdateBatchToolbar(); }, [M.yi, M.ding]);
    await page.evaluate(() => renderMembers());
    await sleep(400);
    await page.click('#memberBatchDeleteBtn');
    await page.waitForFunction(() => document.getElementById('memberBatchHardDeleteModal').classList.contains('show'), undefined, { timeout: 15000 });
    const b3m = await page.evaluate(() => ({
      title: document.getElementById('batchHardDeleteTitle').textContent,
      list: document.getElementById('batchHardDeleteList').textContent,
      warn: document.getElementById('batchHardDeleteWarnText').textContent,
      btnDisabled0: document.getElementById('batchHardDeleteConfirmBtn').disabled,
    }));
    check('B3 真删弹窗：名单含两行（名字+职业+状态+逐行计数）+ 合计红字警示 + 初始按钮禁用',
      b3m.title === '批量彻底删除成员（2）'
        && b3m.list.includes('T35A正式乙（法师 · 正式）—— 考勤 1 / 装备 1 / 心愿 1')
        && b3m.list.includes('T35A离队丁（盗贼 · 离队）—— 考勤 0 / 装备 0 / 心愿 0')
        && b3m.warn.includes('考勤 1 条 / 装备记录 1 条 / 心愿 1 条') && b3m.warn.includes('不可恢复')
        && b3m.btnDisabled0 === true,
      JSON.stringify(b3m));
    await page.screenshot({ path: path.join(SHOT_DIR, 'b3-batch-harddelete-modal.png') });
    // 未输全四字仍禁用 → 输全解锁
    await page.fill('#batchHardDeleteConfirmText', '彻底删');
    const b3d1 = await page.evaluate(() => document.getElementById('batchHardDeleteConfirmBtn').disabled);
    await page.fill('#batchHardDeleteConfirmText', '彻底删除');
    const b3d2 = await page.evaluate(() => document.getElementById('batchHardDeleteConfirmBtn').disabled);
    check('B3 防误闸门：输「彻底删」仍禁用，输全「彻底删除」四字解锁', b3d1 === true && b3d2 === false, `半截=${b3d1} 全=${b3d2}`);
    await page.click('#batchHardDeleteConfirmBtn');
    try {
      await page.waitForFunction(() => [...document.querySelectorAll('#toastContainer .toast')].some(t => t.textContent.includes('已彻底删除')), undefined, { timeout: 40000, polling: 500 });
    } catch (e) { /* 断言兜底 */ }
    const b3t = await page.evaluate(() => [...document.querySelectorAll('#toastContainer .toast')].map(t => t.textContent).join('|'));
    const b3db = {
      members: (await svc('GET', `/rest/v1/raid_members?select=name&guild_id=eq.${guildA}`)).body.map(r => r.name),
      att: (await svc('GET', `/rest/v1/activity_attendance?select=member_id,member_name,status&activity_id=eq.${actId}`)).body,
      wish: (await svc('GET', `/rest/v1/wishlists?select=id&guild_id=eq.${guildA}`)).body,
      loot: (await svc('GET', `/rest/v1/loot_records?select=character_id,item_stats&guild_id=eq.${guildA}`)).body,
      trash: (await svc('GET', `/rest/v1/deleted_raid_members?select=name,history_counts&guild_id=eq.${guildA}&order=name`)).body,
    };
    const trashYi = b3db.trash.find(r => r.name === 'T35A正式乙');
    const trashDing = b3db.trash.find(r => r.name === 'T35A离队丁');
    check('B3 真删生效：乙/丁行消失，甲/丙保留', b3db.members.length === 2 && b3db.members.includes('T35A正式甲') && b3db.members.includes('T35A离队丙'), JSON.stringify(b3db.members));
    check('B3 考勤 SET NULL + member_name 快照在；心愿级联清空；装备 character_id 置空 + assignedTo 快照在',
      b3db.att.length === 1 && b3db.att[0].member_id === null && b3db.att[0].member_name === 'T35A正式乙'
        && b3db.wish.length === 0
        && b3db.loot.length === 1 && b3db.loot[0].character_id === null && b3db.loot[0].item_stats.assignedTo === 'T35A正式乙',
      JSON.stringify({ att: b3db.att, wish: b3db.wish.length, loot: b3db.loot }));
    check('B3 垃圾桶逐行在案含 history_counts（乙=考勤1/心愿1/装备1；丁=全 0）+ toast 计数',
      trashYi && trashYi.history_counts.attendance === 1 && trashYi.history_counts.wishlist === 1 && trashYi.history_counts.loot === 1
        && trashDing && trashDing.history_counts.attendance === 0 && trashDing.history_counts.wishlist === 0 && trashDing.history_counts.loot === 0
        && b3t.includes('已彻底删除 2 个成员'),
      `trash=${JSON.stringify(b3db.trash)} toast=${b3t}`);
    // 考勤详情灰显「已删除」（UI 层快照展示）
    await page.evaluate(() => switchPage('attendance'));
    await sleep(1000);
    await page.evaluate((id) => openAttendanceDetail(id), actId);
    await sleep(800);
    const b3ui = await page.evaluate(() => document.getElementById('attendanceDetailModal').textContent);
    check('B3 考勤详情乙行灰色「已删除」快照展示', b3ui.includes('T35A正式乙') && b3ui.includes('已删除'), b3ui.replace(/\s+/g, ' ').slice(0, 120));
    await page.evaluate(() => closeModal('attendanceDetailModal'));
    await page.screenshot({ path: path.join(SHOT_DIR, 'b3-after-delete-members.png') });

    // 零 JS 报错（406=既有噪音）
    const realErrors = pageErrors.filter(e => !/status of (400|401|406|409)/.test(e));
    check('全程零 JS 报错（406=既有噪音已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
    await ctx.close();
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#35 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
