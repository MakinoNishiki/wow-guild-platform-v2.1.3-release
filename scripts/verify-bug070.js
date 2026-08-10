// BUG-070 验证：统计报表职业列 1366 档两字折行修复（#page-reports .stats-rank-table 第3列 nowrap）。
// 样本：T70A 公会含「死亡骑士」（4 字职业名）成员 + 考勤进入出勤率排名表；另硬删一名成员造「已删除」
// 伪行（BUG-058 场景）同表在册。双档（1366×768 / 1920×1080）生效值断言：
//   ①职业列 th/td computed whiteSpace === 'nowrap'；②职业名单行不折行（td.clientHeight ≈ lineHeight+内距基准）；
//   ③.table-container scrollWidth === clientWidth（BUG-058 零回退，历史实测 1366→468=468 / 1920→761=761）；
//   ④「已删除」徽标 boundingBox 完整落在容器内。
// 测试数据（T70A 前缀：auth 用户/公会/guild_members/raid_members/activities/activity_attendance/
// deleted_raid_members/user_profiles）自清理并复核为零。
// 用法: node scripts/verify-bug070.js（PW_CHANNEL=chrome 可选）｜ 截图 → backup/2026-08-10-bug070/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(__dirname, '..', '.s6-ssh', 'node_modules', 'playwright-core'))); }

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-10-bug070');
const PORT = 15661;
const BASE = `http://localhost:${PORT}`;
const EMAIL = 't70a-owner@wowbutler.cn';
const PWD = 'T70abcd12';

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

let serverProc = null, uid = null, guildId = null, activityId = null;
const memberIds = [], attIds = [], deletedRowIds = [];

async function setup() {
  // 预清理上轮残留
  const list = await (await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=200`, { headers: SVC })).json().catch(() => ({}));
  for (const u of (list.users || [])) {
    if ((u.email || '').startsWith('t70a-')) await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: SVC });
  }
  await svc('DELETE', '/rest/v1/guilds?name=like.T70A*');

  // 测试账号 + 公会
  let res = await fetch(`${SB}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'T70A会长' } }) });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD }) });
    body = await res.json();
    if (!body.access_token) throw new Error('owner 登录失败');
  }
  uid = body.user.id;
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T70A报表会', owner_id: uid, invite_code: 'T70A' + Date.now().toString(36).slice(-4).toUpperCase() });
  if (g.status !== 201) throw new Error('建会失败: ' + JSON.stringify(g.body));
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: uid, role: 'owner', display_name: 'T70A会长' });

  // 成员：死亡骑士（4 字职业名，BUG-070 样本）+ 法师对照 + 待硬删成员（伪行样本）
  async function addMember(name, cls) {
    const m = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name, class: cls, spec: '', role: '输出', status: '正式' });
    if (m.status !== 201) throw new Error(`建成员 ${name} 失败: ` + JSON.stringify(m.body));
    memberIds.push(m.body[0].id);
    return m.body[0].id;
  }
  const mDK = await addMember('T70A死骑甲', '死亡骑士');
  const mFS = await addMember('T70A法师乙', '法师');
  const mDel = await addMember('T70A将删丙', '牧师');

  // 活动 + 考勤（DB 层英文状态；member_name 快照双写）
  const today = new Date().toISOString().slice(0, 10);
  const a = await svc('POST', '/rest/v1/activities', { guild_id: guildId, name: 'T70A活动一', activity_date: today, raid: '虚影尖塔' });
  if (a.status !== 201) throw new Error('建活动失败: ' + JSON.stringify(a.body));
  activityId = a.body[0].id;
  const attRows = [
    { member_id: mDK, member_name: 'T70A死骑甲', status: 'present' },
    { member_id: mFS, member_name: 'T70A法师乙', status: 'absent' },
    { member_id: mDel, member_name: 'T70A将删丙', status: 'present' },
  ];
  for (const row of attRows) {
    const ar = await svc('POST', '/rest/v1/activity_attendance', { activity_id: activityId, ...row });
    if (ar.status !== 201) throw new Error('建考勤失败: ' + JSON.stringify(ar.body));
    attIds.push(ar.body[0].id);
  }

  // 硬删 mDel → 垃圾桶行 + 删成员行（FK SET NULL → 报表灰色「已删除」伪行）
  const dr = await svc('POST', '/rest/v1/deleted_raid_members', { guild_id: guildId, name: 'T70A将删丙', class: '牧师', history_counts: { attendance: 1, wishlist: 0, loot: 0 } });
  if (dr.status !== 201) throw new Error('建垃圾桶行失败: ' + JSON.stringify(dr.body));
  deletedRowIds.push(dr.body[0].id);
  await svc('DELETE', `/rest/v1/raid_members?id=eq.${mDel}`);
  memberIds.splice(memberIds.indexOf(mDel), 1);

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
  if (activityId) await tryDel('activity', `/rest/v1/activities?id=eq.${activityId}`);
  if (memberIds.length) await tryDel('members', `/rest/v1/raid_members?id=in.(${memberIds.join(',')})`);
  if (deletedRowIds.length) await tryDel('trash', `/rest/v1/deleted_raid_members?id=in.(${deletedRowIds.join(',')})`);
  await tryDel('trash_by_name', '/rest/v1/deleted_raid_members?name=like.T70A*');
  if (guildId) {
    await tryDel('guild_members', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
    await tryDel('guild', `/rest/v1/guilds?id=eq.${guildId}`);
  }
  if (uid) {
    await tryDel('profiles', `/rest/v1/user_profiles?user_id=eq.${uid}`);
    try { await fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); }
  }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));

  // 复核为零
  const counts = [];
  const qs = [
    ['raid_members', '/rest/v1/raid_members?select=id&name=like.T70A*'],
    ['activities', '/rest/v1/activities?select=id&name=like.T70A*'],
    ['deleted_raid_members', '/rest/v1/deleted_raid_members?select=id&name=like.T70A*'],
    ['guilds', '/rest/v1/guilds?select=id&name=like.T70A*'],
  ];
  for (const [label, p] of qs) {
    const c = await svc('GET', p);
    counts.push([label, Array.isArray(c.body) ? c.body.length : '?']);
  }
  const cGm = guildId ? await svc('GET', `/rest/v1/guild_members?select=id&guild_id=eq.${guildId}`) : { body: [] };
  counts.push(['guild_members', Array.isArray(cGm.body) ? cGm.body.length : '?']);
  if (uid) {
    const cp = await svc('GET', `/rest/v1/user_profiles?select=user_id&user_id=eq.${uid}`);
    counts.push(['user_profiles', Array.isArray(cp.body) ? cp.body.length : '?']);
    const ur = await fetch(`${SB}/auth/v1/admin/users/${uid}`, { headers: SVC });
    counts.push(['auth 用户', ur.status === 404 ? 0 : `HTTP ${ur.status}`]);
  }
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

    async function measure(tag) {
      await page.evaluate(() => { switchPage('reports'); setReportRange(0); });
      await sleep(800);
      const m = await page.evaluate(() => {
        const container = document.querySelector('#page-reports .table-container');
        const table = container.querySelector('.stats-rank-table');
        const th3 = table.querySelector('thead th:nth-child(3)');
        const tds3 = [...table.querySelectorAll('tbody td:nth-child(3)')];
        // 折行实测：单元格内容高 vs 单行基准（computed line-height；padding 10px×2 + border 1px）
        const cellInfo = tds3.map(td => {
          const cs = getComputedStyle(td);
          return {
            text: td.textContent.trim(),
            whiteSpace: cs.whiteSpace,
            clientHeight: td.clientHeight,
            lineHeight: parseFloat(cs.lineHeight),
            singleLineMax: parseFloat(cs.lineHeight) + 21, // padding 20 + border 1 + 容差 0
          };
        });
        const badge = table.querySelector('tbody .tag-grey');
        const cRect = container.getBoundingClientRect();
        const bRect = badge ? badge.getBoundingClientRect() : null;
        return {
          thWhiteSpace: getComputedStyle(th3).whiteSpace,
          cells: cellInfo,
          scrollWidth: container.scrollWidth, clientWidth: container.clientWidth,
          hasBadge: !!badge,
          badgeRight: bRect ? bRect.right : null, badgeLeft: bRect ? bRect.left : null,
          containerRight: cRect.right, containerLeft: cRect.left,
        };
      });
      console.log(`  [测量 ${tag}] scrollWidth=${m.scrollWidth} clientWidth=${m.clientWidth} th.whiteSpace=${m.thWhiteSpace} 职业列=[${m.cells.map(c => `${c.text}:${c.whiteSpace}:${c.clientHeight}px`).join(' | ')}]`);
      check(`${tag} 职业列 th/td computed whiteSpace 全为 nowrap`,
        m.thWhiteSpace === 'nowrap' && m.cells.length > 0 && m.cells.every(c => c.whiteSpace === 'nowrap'),
        `th=${m.thWhiteSpace} cells=${m.cells.map(c => c.whiteSpace).join('/')}`);
      const wrapped = m.cells.filter(c => c.clientHeight > c.singleLineMax + 1);
      check(`${tag} 职业名单行不折行（clientHeight ≤ lineHeight+21）`, wrapped.length === 0,
        wrapped.length ? `折行: ${wrapped.map(c => `${c.text}=${c.clientHeight}px>${c.singleLineMax}px`).join(',')}` : m.cells.map(c => `${c.text}=${c.clientHeight}px`).join(' '));
      check(`${tag} 排名表无横向滚动（scrollWidth<=clientWidth，BUG-058 零回退）`, m.scrollWidth <= m.clientWidth + 1, `${m.scrollWidth}<=${m.clientWidth}`);
      check(`${tag} 「已删除」徽标完整落在容器内`, m.hasBadge && m.badgeRight <= m.containerRight + 1 && m.badgeLeft >= m.containerLeft - 1,
        m.hasBadge ? `badge=[${m.badgeLeft},${m.badgeRight}] container=[${m.containerLeft},${m.containerRight}]` : '徽标缺失');
    }

    await measure('1366档');
    await page.screenshot({ path: path.join(SHOT_DIR, 'reports-1366.png') });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await sleep(600);
    await measure('1920档');
    await page.screenshot({ path: path.join(SHOT_DIR, 'reports-1920.png') });

    // 400/406=既有噪音、409=tag_num 唯一冲突重试探测（REQ-094）
    const realErrors = pageErrors.filter(e => !/status of (400|401|406|409)/.test(e));
    check('全程零 JS 报错（400/406/409=已知噪音已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
    await ctx.close();
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== BUG-070 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
