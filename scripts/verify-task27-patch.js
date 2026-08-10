// 任务书 #27-补丁 验证（BUG-057/058/059）：
//   A. BUG-057：装备分配/心愿单两面板「从装备库选择」后 大类/部位 按库内 slot/item_type 回填
//      （resolvePickerCategorySlot 统一解析），含 饰品/单手锤 正例与 杂项/垃圾 负例（保持表单原值）。
//   B. BUG-058：统计报表 1366×768 与 1920×1080 下出勤率排名表无横向滚动（getComputedStyle 生效值断言），
//      含硬删成员灰色「已删除」伪行徽标完整落在容器内。
//   C. BUG-059（方案 C 修复后验证）：离队/同名碰撞新预期 + 写入链路补 character_id（UI 主链路）
//      + id 优先渲染零碰撞 + deletedMemberNames 刷新链路（B 回退仍用）。
// 测试数据（T27P 前缀：主数据/公会/成员/活动/考勤/装备/垃圾桶/用户）自清理并复核为零。
// 用法: node scripts/verify-task27-patch.js（PW_CHANNEL=chrome 可选）｜ 截图 → backup/2026-08-10-task27-patch/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(__dirname, '..', '.s6-ssh', 'node_modules', 'playwright-core'))); }

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-10-task27-patch');
const PORT = 15660;
const BASE = `http://localhost:${PORT}`;
const PWD = 'T27p-Test-2026!';
const EMAIL = 't27p-owner@wowbutler.cn';

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
const recon = []; // BUG-059 侦察观测
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail !== undefined ? `（${detail}）` : ''}`);
}
function note(text) { recon.push(text); console.log('  [侦察] ' + text); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function svc(method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); try { return { status: res.status, body: JSON.parse(t) }; } catch { return { status: res.status, body: t }; }
}

let serverProc = null, owner = null, guildId = null;
let testRaidId = null, testBossId = null;
let memberAct1Id = null; // C(d) 写入链路断言用（活跃成员 T27P报表甲）
const lootIds = [];          // boss_loot
const memberIds = [];        // raid_members（现存行）
const attIds = [];           // activity_attendance
const lootRecordIds = [];    // loot_records
const deletedRowIds = [];    // deleted_raid_members
let activityId = null;

// 预清理：上一轮崩溃残留的 T27P 数据（按前缀/名删，guilds 级联清公会域数据）
async function preClean() {
  await svc('DELETE', '/rest/v1/guilds?name=like.T27P*');
  await svc('DELETE', '/rest/v1/boss_loot?item_name=like.T27P*');
  await svc('DELETE', '/rest/v1/game_bosses?name=like.T27P*');
  await svc('DELETE', '/rest/v1/game_raids?name=like.T27P*');
  // 残留测试用户（邮箱固定）：查到即删
  const u = await svc('GET', `/rest/v1/guilds?select=id&name=like.T27P*`);
  void u;
}

async function setup() {
  await preClean();
  const cs = await svc('GET', '/rest/v1/game_seasons?select=id,name,is_current,start_date&order=start_date.asc');
  const cur = cs.body.find(s => s.is_current) || cs.body[cs.body.length - 1];

  // 测试主数据：团本 + BOSS + 三件掉落（①饰品/其它 镜像线上「艾林先知的凝视」形态；②单手/单手锤；③杂项/垃圾 负例）
  const r = await svc('POST', '/rest/v1/game_raids', { name: 'T27P测试渊', season_id: cur.id, type: 'raid', sort_order: 99 });
  if (r.status !== 201) throw new Error('建测试团本失败: ' + JSON.stringify(r.body));
  testRaidId = r.body[0].id;
  const b = await svc('POST', '/rest/v1/game_bosses', { raid_id: testRaidId, name: 'T27P一号王', boss_order: 1 });
  if (b.status !== 201) throw new Error('建测试 BOSS 失败: ' + JSON.stringify(b.body));
  testBossId = b.body[0].id;
  const lootsToCreate = [
    { item_name: 'T27P测试饰品', slot: '饰品', item_type: '其它' },
    { item_name: 'T27P测试之锤', slot: '单手', item_type: '单手锤' },
    { item_name: 'T27P测试杂项', slot: '杂项', item_type: '垃圾' },
  ];
  for (const l of lootsToCreate) {
    const res = await svc('POST', '/rest/v1/boss_loot', { boss_id: testBossId, ...l, primary_stats: ['力量'], secondary_stats: ['爆击'] });
    if (res.status !== 201) throw new Error('建测试掉落失败: ' + JSON.stringify(res.body));
    lootIds.push(res.body[0].id);
  }

  // 测试用户 + 公会
  let res = await fetch(`${SB}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'T27P会长' } }) });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD }) });
    body = await res.json();
    if (!body.access_token) throw new Error('owner 登录失败');
  }
  owner = { uid: body.user.id };
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T27P补丁会', owner_id: owner.uid, invite_code: 'T27P' + Date.now().toString(36).slice(-4).toUpperCase() });
  if (g.status !== 201) throw new Error('建会失败: ' + JSON.stringify(g.body));
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: owner.uid, role: 'owner', display_name: 'T27P会长' });

  // 成员：报表用 3 活跃 + C(a) 纯离队 + C(b) 同名甲（稍后硬删）
  async function addMember(name, cls, status) {
    const m = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name, class: cls, spec: '', role: '输出', status });
    if (m.status !== 201) throw new Error(`建成员 ${name} 失败: ` + JSON.stringify(m.body));
    memberIds.push(m.body[0].id);
    return m.body[0].id;
  }
  const mAct1 = await addMember('T27P报表甲', '战士', '正式');
  memberAct1Id = mAct1;
  const mAct2 = await addMember('T27P报表乙', '法师', '正式');
  const mAct3 = await addMember('T27P报表丙', '牧师', '正式');
  const mDeparted = await addMember('T27P离队某', '盗贼', '离队'); // C(a)：纯离队
  const mSameA = await addMember('T27P同名甲', '圣骑士', '正式');   // C(b)：待硬删

  // 活动 + 考勤（member_name 快照双写；同名甲的考勤行供硬删后伪行用）
  const today = new Date().toISOString().slice(0, 10);
  const a = await svc('POST', '/rest/v1/activities', { guild_id: guildId, name: 'T27P活动一', activity_date: today, raid: 'T27P测试渊', boss: 'T27P一号王' });
  if (a.status !== 201) throw new Error('建活动失败: ' + JSON.stringify(a.body));
  activityId = a.body[0].id;
  // DB 层 status 为英文词汇（cloud.js mapStatusToDb：present/absent/late/backup/leave）
  const attRows = [
    { member_id: mAct1, member_name: 'T27P报表甲', status: 'present' },
    { member_id: mAct2, member_name: 'T27P报表乙', status: 'absent' },
    { member_id: mAct3, member_name: 'T27P报表丙', status: 'late' },
    { member_id: mSameA, member_name: 'T27P同名甲', status: 'present' },
  ];
  for (const row of attRows) {
    const ar = await svc('POST', '/rest/v1/activity_attendance', { activity_id: activityId, ...row });
    if (ar.status !== 201) throw new Error('建考勤失败: ' + JSON.stringify(ar.body));
    attIds.push(ar.body[0].id);
  }

  // 装备记录：C(a) 离队成员一条；C(b) 同名甲（A）一条
  async function addLoot(itemName, memberName) {
    const lr = await svc('POST', '/rest/v1/loot_records', {
      guild_id: guildId, item_name: itemName, member_name: memberName, character_id: null,
      item_stats: { assignedTo: memberName, status: '已分配', priority: 'P2' },
      raid_name: 'T27P测试渊', boss_name: 'T27P一号王', obtained_date: today,
    });
    if (lr.status !== 201) throw new Error(`建装备记录 ${itemName} 失败: ` + JSON.stringify(lr.body));
    lootRecordIds.push(lr.body[0].id);
  }
  await addLoot('T27P装备-离队', 'T27P离队某');
  await addLoot('T27P装备-同名旧', 'T27P同名甲');
  void mDeparted;

  // 硬删同名甲 A：垃圾桶插行 + 删 raid_members 行（FK SET NULL 应自动置空考勤 member_id）
  const dr = await svc('POST', '/rest/v1/deleted_raid_members', { guild_id: guildId, name: 'T27P同名甲', class: '圣骑士', history_counts: { attendance: 1, wishlist: 0, loot: 1 } });
  if (dr.status !== 201) throw new Error('建垃圾桶行失败: ' + JSON.stringify(dr.body));
  deletedRowIds.push(dr.body[0].id);
  const del = await svc('DELETE', `/rest/v1/raid_members?id=eq.${mSameA}`);
  if (del.status !== 204 && del.status !== 200) throw new Error('硬删成员失败: ' + JSON.stringify(del.body));
  memberIds.splice(memberIds.indexOf(mSameA), 1);
  // 确认 FK SET NULL 生效；未生效则手动置空（任务允许）
  const attCheck = await svc('GET', `/rest/v1/activity_attendance?id=eq.${attIds[3]}&select=id,member_id,member_name`);
  const attRow = Array.isArray(attCheck.body) ? attCheck.body[0] : null;
  if (attRow && attRow.member_id !== null) {
    await svc('PATCH', `/rest/v1/activity_attendance?id=eq.${attIds[3]}`, { member_id: null });
    note(`FK SET NULL 未自动生效，已手动 UPDATE 置空（原 member_id=${attRow.member_id}）`);
  } else {
    note(`FK SET NULL 自动生效：硬删后考勤行 member_id=null，member_name 快照保留（${attRow && attRow.member_name}）`);
  }

  // C(b) 同名碰撞：再建同名成员 B2（离队）+ 其装备记录
  const mSameB2 = await addMember('T27P同名甲', '德鲁伊', '离队');
  void mSameB2;
  await addLoot('T27P装备-同名新', 'T27P同名甲');

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r2 = await fetch(`${BASE}/api/supabase-config`); if (r2.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  const steps = [];
  const tryDel = async (label, p) => { try { const r = await svc('DELETE', p); steps.push(`${label}:${r.status}`); } catch { steps.push(`${label}:ERR`); } };
  if (attIds.length) await tryDel('att', `/rest/v1/activity_attendance?id=in.(${attIds.join(',')})`);
  if (lootRecordIds.length) await tryDel('loot_records', `/rest/v1/loot_records?id=in.(${lootRecordIds.join(',')})`);
  if (activityId) await tryDel('activity', `/rest/v1/activities?id=eq.${activityId}`);
  if (memberIds.length) await tryDel('members', `/rest/v1/raid_members?id=in.(${memberIds.join(',')})`);
  if (deletedRowIds.length) await tryDel('trash', `/rest/v1/deleted_raid_members?id=in.(${deletedRowIds.join(',')})`);
  await tryDel('trash_by_name', '/rest/v1/deleted_raid_members?name=like.T27P*');
  if (guildId) {
    await tryDel('guild_members', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
    await tryDel('guild', `/rest/v1/guilds?id=eq.${guildId}`);
  }
  await tryDel('boss_loot', '/rest/v1/boss_loot?item_name=like.T27P*');
  if (testBossId) await tryDel('boss', `/rest/v1/game_bosses?id=eq.${testBossId}`);
  if (testRaidId) await tryDel('raid', `/rest/v1/game_raids?id=eq.${testRaidId}`);
  if (owner) { try { await fetch(`${SB}/auth/v1/admin/users/${owner.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); } }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));

  // 复核为零
  const checks = [
    ['raid_members', '/rest/v1/raid_members?select=id&name=like.T27P*'],
    ['loot_records', '/rest/v1/loot_records?select=id&item_name=like.T27P*'],
    ['activities', '/rest/v1/activities?select=id&name=like.T27P*'],
    ['guilds', '/rest/v1/guilds?select=id&name=like.T27P*'],
    ['game_raids', '/rest/v1/game_raids?select=id&name=like.T27P*'],
    ['game_bosses', '/rest/v1/game_bosses?select=id&name=like.T27P*'],
    ['boss_loot', '/rest/v1/boss_loot?select=id&item_name=like.T27P*'],
    ['deleted_raid_members', '/rest/v1/deleted_raid_members?select=id&name=like.T27P*'],
  ];
  const counts = [];
  for (const [label, p] of checks) {
    const c = await svc('GET', p);
    counts.push([label, Array.isArray(c.body) ? c.body.length : '?']);
  }
  // 公会域级联复核：考勤/公会成员按外键查（公会已删，应为 0）
  const cAtt = activityId ? await svc('GET', `/rest/v1/activity_attendance?select=id&activity_id=eq.${activityId}`) : { body: [] };
  counts.push(['activity_attendance(by activity)', Array.isArray(cAtt.body) ? cAtt.body.length : '?']);
  const cGm = guildId ? await svc('GET', `/rest/v1/guild_members?select=id&guild_id=eq.${guildId}`) : { body: [] };
  counts.push(['guild_members(by guild)', Array.isArray(cGm.body) ? cGm.body.length : '?']);
  let userGone = '?';
  if (owner) {
    const ur = await fetch(`${SB}/auth/v1/admin/users/${owner.uid}`, { headers: SVC });
    userGone = ur.status === 404 ? 0 : `HTTP ${ur.status}`;
  }
  counts.push(['auth 用户', userGone]);
  console.log('[清理复核] ' + counts.map(([l, n]) => `${l}=${n}`).join(' | '));
  check('测试数据清零复核（全 0）', counts.every(([, n]) => n === 0), counts.map(([, n]) => n).join('/'));
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

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

    // ==================== A. BUG-057 两面板回填 ====================
    // 打开表单 → （可选哨兵值）→ 开 picker → 搜索 T27P → 按装备名点卡 → 确认
    async function pickFromDb(openFormFn, mode, itemName, sentinelFn) {
      await page.evaluate(fn => window[fn](), openFormFn);
      await sleep(500);
      if (sentinelFn) await page.evaluate(sentinelFn);
      await page.evaluate(m => openItemDbPicker(m), mode);
      await sleep(1200);
      await page.fill('#itemDbSearch', 'T27P');
      await sleep(600);
      const clicked = await page.evaluate(name => {
        const card = [...document.querySelectorAll('#itemDbList .item-card')]
          .find(c => c.querySelector('.item-card-name').textContent.trim() === name);
        if (!card) return false;
        card.click();
        return true;
      }, itemName);
      if (!clicked) throw new Error(`picker 中未找到装备卡：${itemName}`);
      await sleep(300);
      await page.click('#itemDbConfirmBtn');
      await sleep(600);
    }
    const readForm = (catId, slotId) => page.evaluate(([c, s]) => ({
      cat: document.getElementById(c).value, slot: document.getElementById(s).value,
    }), [catId, slotId]);

    // ---- 心愿单面板 ----
    await pickFromDb('wishlistShowModal', 'wishlist', 'T27P测试饰品');
    let f = await readForm('wishlistCategory', 'wishlistSlot');
    check('A1 心愿单面板：饰品（slot=饰品/item_type=其它）→ 大类=饰品 部位=饰品', f.cat === '饰品' && f.slot === '饰品', `cat=${f.cat} slot=${f.slot}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'wishlist-pick-trinket.png') });

    await pickFromDb('wishlistShowModal', 'wishlist', 'T27P测试之锤');
    f = await readForm('wishlistCategory', 'wishlistSlot');
    check('A2 心愿单面板：之锤（slot=单手/item_type=单手锤）→ 大类=武器 部位=单手锤', f.cat === '武器' && f.slot === '单手锤', `cat=${f.cat} slot=${f.slot}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'wishlist-pick-hammer.png') });

    // 负例：哨兵 首饰/颈部，选杂项后必须保持原值
    await pickFromDb('wishlistShowModal', 'wishlist', 'T27P测试杂项', () => {
      document.getElementById('wishlistCategory').value = '首饰';
      wishlistUpdateSlotOptions('颈部');
    });
    f = await readForm('wishlistCategory', 'wishlistSlot');
    check('A3 心愿单面板负例：杂项/垃圾 不改动表单（保持哨兵 首饰/颈部）', f.cat === '首饰' && f.slot === '颈部', `cat=${f.cat} slot=${f.slot}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'wishlist-pick-negative.png') });
    await page.evaluate(() => closeModal('wishlistModal'));
    await sleep(400);

    // ---- 装备分配面板 ----
    await pickFromDb('lootShowModal', 'loot', 'T27P测试饰品');
    f = await readForm('lootCategory', 'lootSlot');
    check('A4 装备分配面板：饰品 → 大类=饰品 部位=饰品', f.cat === '饰品' && f.slot === '饰品', `cat=${f.cat} slot=${f.slot}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'loot-pick-trinket.png') });

    await pickFromDb('lootShowModal', 'loot', 'T27P测试之锤');
    f = await readForm('lootCategory', 'lootSlot');
    check('A5 装备分配面板：之锤 → 大类=武器 部位=单手锤', f.cat === '武器' && f.slot === '单手锤', `cat=${f.cat} slot=${f.slot}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'loot-pick-hammer.png') });

    await pickFromDb('lootShowModal', 'loot', 'T27P测试杂项', () => {
      document.getElementById('lootCategory').value = '防具';
      lootUpdateSlotOptions('头部');
    });
    f = await readForm('lootCategory', 'lootSlot');
    check('A6 装备分配面板负例：杂项/垃圾 不改动表单（保持哨兵 防具/头部）', f.cat === '防具' && f.slot === '头部', `cat=${f.cat} slot=${f.slot}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'loot-pick-negative.png') });
    await page.evaluate(() => closeModal('lootModal'));
    await sleep(400);

    // ==================== B. BUG-058 报表无横滚 ====================
    async function reportsAssert(tag) {
      await page.evaluate(() => { switchPage('reports'); setReportRange(0); });
      await sleep(800);
      const m = await page.evaluate(() => {
        const container = document.querySelector('#page-reports .table-container');
        const table = container.querySelector('.stats-rank-table');
        const td = table.querySelector('tbody td');
        const badge = table.querySelector('tbody .tag-grey');
        const csTable = getComputedStyle(table);
        const csTd = td ? getComputedStyle(td) : null;
        const cRect = container.getBoundingClientRect();
        const bRect = badge ? badge.getBoundingClientRect() : null;
        return {
          scrollWidth: container.scrollWidth, clientWidth: container.clientWidth,
          minWidth: csTable.minWidth, tdPadding: csTd ? csTd.padding : null,
          hasBadge: !!badge,
          badgeRight: bRect ? bRect.right : null, badgeLeft: bRect ? bRect.left : null,
          containerRight: cRect.right, containerLeft: cRect.left,
        };
      });
      console.log(`  [测量 ${tag}] scrollWidth=${m.scrollWidth} clientWidth=${m.clientWidth} minWidth=${m.minWidth} tdPadding=${m.tdPadding} badge=[${m.badgeLeft},${m.badgeRight}] container=[${m.containerLeft},${m.containerRight}]`);
      check(`B-${tag} 排名表无横向滚动（scrollWidth<=clientWidth）`, m.scrollWidth <= m.clientWidth, `${m.scrollWidth}<=${m.clientWidth}`);
      if (tag === '1366') {
        check('B-1366 表 min-width 生效值=0px', m.minWidth === '0px', m.minWidth);
        check('B-1366 单元格 padding 生效值=10px 8px', m.tdPadding === '10px 8px', m.tdPadding);
      }
      check(`B-${tag} 「已删除」伪行徽标存在且完整落在容器内`, m.hasBadge && m.badgeRight <= m.containerRight + 1 && m.badgeLeft >= m.containerLeft - 1,
        m.hasBadge ? `badge.right=${m.badgeRight} container.right=${m.containerRight}` : '徽标缺失');
    }
    await reportsAssert('1366');
    await page.screenshot({ path: path.join(SHOT_DIR, 'reports-1366.png') });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await sleep(600);
    await reportsAssert('1920');
    await page.screenshot({ path: path.join(SHOT_DIR, 'reports-1920.png') });

    // ==================== C. BUG-059（任务书 #27-补丁2 方案 C 修复后验证） ====================
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.evaluate(() => switchPage('loot'));
    await sleep(800);
    async function lootAssignedText(itemName) {
      return page.evaluate(name => {
        const row = [...document.querySelectorAll('#lootTableBody tr')]
          .find(tr => tr.querySelector('.loot-name') && tr.querySelector('.loot-name').textContent.trim() === name);
        if (!row) return null;
        return row.children[8].textContent.trim();
      }, itemName);
    }
    // (a) 纯离队：id NULL、名字仅命中离队成员 → （已离队）（预期不变）
    const txtA = await lootAssignedText('T27P装备-离队');
    note(`C(a) 纯离队：「T27P装备-离队」分配人列实际显示 = ${JSON.stringify(txtA)}（预期「T27P离队某（已离队）」，不变）`);
    check('C(a) 纯离队行显示（已离队）', txtA === 'T27P离队某（已离队）', txtA);

    // (b) 同名碰撞：修复后 id 空 → 名字匹配放行离队命中 → 两行均命中在册离队 B2 → （已离队）。
    // 已知限制（运营裁定在案）：同名一删一留的存量 NULL 行以在册成员为准——A 的存量行随 B2 显（已离队），
    // 不再按垃圾桶名单误显（已删除）。原「两行同显已删除」的 BUG 预期作废。
    const txtOld = await lootAssignedText('T27P装备-同名旧');
    const txtNew = await lootAssignedText('T27P装备-同名新');
    note(`C(b) 同名碰撞（修复后）：A 的行「T27P装备-同名旧」= ${JSON.stringify(txtOld)}；B2 的行「T27P装备-同名新」= ${JSON.stringify(txtNew)}（新预期两行均「（已离队）」；A 存量行以在册成员为准为已知限制）`);
    check('C(b) 同名碰撞修复：两行均显（已离队）（以在册成员为准，已知限制在案）',
      txtOld === 'T27P同名甲（已离队）' && txtNew === 'T27P同名甲（已离队）', `旧=${txtOld} 新=${txtNew}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'loot-bug059-same-name.png') });

    // (d) 写入链路补 id（真浏览器 UI 主链路：添加装备 → 保存 → service API 查 character_id）
    async function saveLootViaUI(itemName, assignee) {
      await page.evaluate(() => lootShowModal());
      await sleep(500);
      await page.fill('#lootName', itemName);
      if (assignee) await page.selectOption('#lootAssignedTo', assignee);
      await page.click('#lootSaveBtn');
      await page.waitForSelector('.toast.success', { timeout: 15000 }); // 保存成功 toast（装备已添加/已更新）
      await sleep(1500); // cloudCrud reload + render
    }
    async function svcGetLoot(itemName) {
      const r = await svc('GET', `/rest/v1/loot_records?select=id,character_id,member_name&item_name=eq.${encodeURIComponent(itemName)}`);
      const row = Array.isArray(r.body) && r.body[0] ? r.body[0] : null;
      if (row && !lootRecordIds.includes(row.id)) lootRecordIds.push(row.id);
      return row;
    }
    // d1 新建：分配人下拉选活跃成员 → character_id 补写
    await saveLootViaUI('T27P装备-UI新增', 'T27P报表甲');
    const d1Row = await svcGetLoot('T27P装备-UI新增');
    check('C(d1) UI 新建装备（分配人=活跃成员）→ character_id 补写为该成员 id',
      !!d1Row && d1Row.character_id === memberAct1Id, `character_id=${d1Row && d1Row.character_id} 期望=${memberAct1Id}`);
    const d1List = await lootAssignedText('T27P装备-UI新增');
    check('C(d1) 列表出现该行且分配人列含成员名（主链路实测）', !!(d1List && d1List.includes('T27P报表甲')), d1List);
    // d2 编辑该行（不改分配人）→ character_id 保留不丢
    await page.evaluate(() => { const l = appData.loots.find(x => x.name === 'T27P装备-UI新增'); lootEdit(l.id); });
    await sleep(600);
    await page.click('#lootSaveBtn');
    await page.waitForSelector('.toast.success', { timeout: 15000 });
    await sleep(1500);
    const d2Row = await svcGetLoot('T27P装备-UI新增');
    check('C(d2) 编辑保存（不改分配人）→ character_id 保留不丢',
      !!d2Row && d2Row.character_id === memberAct1Id, `character_id=${d2Row && d2Row.character_id}`);
    // d3 新建不选分配人（留空）→ 保存成功且 character_id 为 null
    await saveLootViaUI('T27P装备-无分配', null);
    const d3Row = await svcGetLoot('T27P装备-无分配');
    check('C(d3) 新建不选分配人 → 保存成功且 character_id 为 null',
      !!d3Row && d3Row.character_id === null, `character_id=${d3Row && d3Row.character_id}`);

    // (e) id 优先渲染（同名零碰撞）：成员 C（离队）+ 同名垃圾桶行 + character_id 有效 FK 的 loot 行
    // → id 命中离队成员，显示（已离队），id 优先压过垃圾桶同名
    const mC = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name: 'T27P同名乙', class: '术士', spec: '', role: '输出', status: '离队' });
    if (mC.status !== 201) throw new Error('C(e) 建成员失败: ' + JSON.stringify(mC.body));
    memberIds.push(mC.body[0].id);
    const trC = await svc('POST', '/rest/v1/deleted_raid_members', { guild_id: guildId, name: 'T27P同名乙', class: '术士', history_counts: {} });
    if (trC.status === 201) deletedRowIds.push(trC.body[0].id);
    const lrC = await svc('POST', '/rest/v1/loot_records', {
      guild_id: guildId, item_name: 'T27P装备-ID优先', member_name: 'T27P同名乙', character_id: mC.body[0].id,
      item_stats: { assignedTo: 'T27P同名乙', status: '已分配', priority: 'P2' },
      obtained_date: new Date().toISOString().slice(0, 10),
    });
    if (lrC.status !== 201) throw new Error('C(e) 建装备记录失败: ' + JSON.stringify(lrC.body));
    lootRecordIds.push(lrC.body[0].id);
    // 成员 C 是登录后旁路建的，需重拉成员表（否则 appData.members 无 C，id 查找必落空）
    await page.evaluate(async () => { await window.CloudSync.reloadData('members'); await window.CloudSync.reloadData('loots'); switchPage('loot'); });
    await sleep(1000);
    const txtE = await lootAssignedText('T27P装备-ID优先');
    note(`C(e) id 优先渲染：「T27P装备-ID优先」（character_id=在册离队成员 C，垃圾桶有同名行）实际显示 = ${JSON.stringify(txtE)}（预期「T27P同名乙（已离队）」——id 优先压过垃圾桶同名）`);
    check('C(e) id 优先渲染：character_id 命中离队成员（垃圾桶有同名）→（已离队）', txtE === 'T27P同名乙（已离队）', txtE);
    await page.screenshot({ path: path.join(SHOT_DIR, 'loot-bug059-id-priority.png') });
    // 注：「id 定位不到 → 已删除」分支本库不可构造（FK 约束禁止悬挂 id，删成员即 SET NULL），不做断言。

    // (c) deletedMemberNames 链路（B 回退仍使用该 Set，断言保持）
    const c1 = await page.evaluate(() => ({
      isSet: window.appData.deletedMemberNames instanceof Set,
      has: window.appData.deletedMemberNames && window.appData.deletedMemberNames.has('T27P同名甲'),
    }));
    check('C(c) appData.deletedMemberNames 为 Set 且含硬删名「T27P同名甲」', c1.isSet && c1.has, JSON.stringify(c1));
    // service API 旁路插一行垃圾桶，不刷新页面只切页签 → 不应更新
    const probe = await svc('POST', '/rest/v1/deleted_raid_members', { guild_id: guildId, name: 'T27P垃圾桶探测', class: '战士', history_counts: {} });
    if (probe.status === 201) deletedRowIds.push(probe.body[0].id);
    await page.evaluate(() => { switchPage('members'); });
    await sleep(600);
    await page.evaluate(() => { switchPage('loot'); });
    await sleep(600);
    const c2 = await page.evaluate(() => window.appData.deletedMemberNames.has('T27P垃圾桶探测'));
    note(`C(c) 旁路插 deleted_raid_members 行后仅切页签：deletedMemberNames 含探测名 = ${c2}（预期 false——仅 reloadLootRecords 时刷新）`);
    check('C(c) 不刷新只切页签：垃圾桶名单不更新（仅在 reloadLootRecords 刷新）', c2 === false, `has=${c2}`);
    await page.evaluate(async () => { await window.CloudSync.reloadData('loots'); });
    await sleep(800);
    const c3 = await page.evaluate(() => window.appData.deletedMemberNames.has('T27P垃圾桶探测'));
    note(`C(c) reloadData('loots') 后：deletedMemberNames 含探测名 = ${c3}（预期 true）`);
    check('C(c) reloadData(\'loots\') 后垃圾桶名单更新', c3 === true, `has=${c3}`);

    // 406=既有噪音；400=REQ-094 新增 ensureTagNum 对未迁移 tag_num 列的 PostgREST 探测噪音（sql/25 待运营执行，console.warn 已吞错误，迁移后自然消失）
    const realErrors = pageErrors.filter(e => !/status of (400|406)/.test(e));
    check('全程零 JS 报错（406=既有噪音、400=tag_num 未迁移探测噪音，均已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
    await ctx.close();
  } finally {
    await browser.close();
  }

  await cleanup();

  console.log('\n===== BUG-059 侦察观测汇总 =====');
  recon.forEach(t => console.log('  - ' + t));

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#27-补丁 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
