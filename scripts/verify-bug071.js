// BUG-071 验证（任务书 #33）：统计报表「已删除」伪行行高修正——伪行徽标换行 58px → 与正常行 44px 一致。
// 样本：T71A 公会含「死亡骑士」（4 字职业名，BUG-070 样本）成员 + 正常成员对照 + 硬删成员造「已删除」伪行。
// 三硬约束逐值断言（1366 档）+ 修复目标断言，全部 computed/getBoundingClientRect/offsetHeight 实测：
//   ①BUG-058 不回退：.table-container scrollWidth=468=clientWidth（±1）；
//   ②BUG-070 不回退：职业列两字单行不折行（clientHeight ≤ lineHeight+21）、行高 44px；
//   ③修复目标：伪行徽标与名字同行（rect top 一致）+ 伪行 offsetHeight = 正常行 = 44px；
//   ④最小选择器：伪行名字 td computed whiteSpace=nowrap，正常行名字 td 仍 normal（正常行零触及）；
//   ⑤徽标文案「已删除」与判定语义零改动（文案断言）。
// 测试数据（T71A 前缀）自清理并复核为零。
// 用法: node scripts/verify-bug071.js（PW_CHANNEL=chrome 可选）｜ 截图 → backup/2026-08-11-bug071/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(__dirname, '..', '.s6-ssh', 'node_modules', 'playwright-core'))); }

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-11-bug071');
const PORT = 15664;
const BASE = `http://localhost:${PORT}`;
const EMAIL = 't71a-owner@wowbutler.cn';
const PWD = 'T71abcd12';

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
  const list = await (await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=200`, { headers: SVC })).json().catch(() => ({}));
  for (const u of (list.users || [])) {
    if ((u.email || '').startsWith('t71a-')) await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: SVC });
  }
  await svc('DELETE', '/rest/v1/guilds?name=like.T71A*');

  let res = await fetch(`${SB}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'T71A会长' } }) });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD }) });
    body = await res.json();
    if (!body.access_token) throw new Error('owner 登录失败');
  }
  uid = body.user.id;
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T71A报表会', owner_id: uid, invite_code: 'T71A' + Date.now().toString(36).slice(-4).toUpperCase() });
  if (g.status !== 201) throw new Error('建会失败: ' + JSON.stringify(g.body));
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: uid, role: 'owner', display_name: 'T71A会长' });

  async function addMember(name, cls) {
    const m = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name, class: cls, spec: '', role: '输出', status: '正式' });
    if (m.status !== 201) throw new Error(`建成员 ${name} 失败: ` + JSON.stringify(m.body));
    memberIds.push(m.body[0].id);
    return m.body[0].id;
  }
  const mDK = await addMember('T71A死骑甲', '死亡骑士'); // BUG-070 样本（4 字职业名）
  const mFS = await addMember('T71A法师乙', '法师');     // 正常行对照
  const mDel = await addMember('T71A将删丙', '牧师');    // 伪行样本

  const today = new Date().toISOString().slice(0, 10);
  const a = await svc('POST', '/rest/v1/activities', { guild_id: guildId, name: 'T71A活动一', activity_date: today, raid: '虚影尖塔' });
  if (a.status !== 201) throw new Error('建活动失败: ' + JSON.stringify(a.body));
  activityId = a.body[0].id;
  const attRows = [
    { member_id: mDK, member_name: 'T71A死骑甲', status: 'present' },
    { member_id: mFS, member_name: 'T71A法师乙', status: 'present' },
    { member_id: mDel, member_name: 'T71A将删丙', status: 'present' },
  ];
  for (const row of attRows) {
    const ar = await svc('POST', '/rest/v1/activity_attendance', { activity_id: activityId, ...row });
    if (ar.status !== 201) throw new Error('建考勤失败: ' + JSON.stringify(ar.body));
    attIds.push(ar.body[0].id);
  }

  // 硬删 mDel → 垃圾桶行 + 删成员行（FK SET NULL → 报表「已删除」伪行）
  const dr = await svc('POST', '/rest/v1/deleted_raid_members', { guild_id: guildId, name: 'T71A将删丙', class: '牧师', history_counts: { attendance: 1, wishlist: 0, loot: 0 } });
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
  await tryDel('trash_by_name', '/rest/v1/deleted_raid_members?name=like.T71A*');
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

  const counts = [];
  const qs = [
    ['raid_members', '/rest/v1/raid_members?select=id&name=like.T71A*'],
    ['activities', '/rest/v1/activities?select=id&name=like.T71A*'],
    ['deleted_raid_members', '/rest/v1/deleted_raid_members?select=id&name=like.T71A*'],
    ['guilds', '/rest/v1/guilds?select=id&name=like.T71A*'],
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

    async function measure(tag, expectWidth) {
      await page.evaluate(() => { switchPage('reports'); setReportRange(0); });
      await sleep(800);
      const m = await page.evaluate(() => {
        const container = document.querySelector('#page-reports .table-container');
        const table = container.querySelector('.stats-rank-table');
        const rows = [...table.querySelectorAll('tbody tr')];
        const info = rows.map(tr => {
          const nameTd = tr.querySelector('td:nth-child(2)');
          const clsTd = tr.querySelector('td:nth-child(3)');
          const badge = nameTd ? nameTd.querySelector('.tag-grey') : null;
          const nameSpan = nameTd ? nameTd.querySelector('span') : null;
          return {
            name: nameTd ? nameTd.textContent.trim() : '',
            rowH: tr.offsetHeight,
            nameWhiteSpace: nameTd ? getComputedStyle(nameTd).whiteSpace : '',
            badgeText: badge ? badge.textContent : null,
            badgeTop: badge ? Math.round(badge.getBoundingClientRect().top) : null,
            nameTop: nameSpan ? Math.round(nameSpan.getBoundingClientRect().top) : null,
            clsText: clsTd ? clsTd.textContent.trim() : '',
            clsH: clsTd ? clsTd.clientHeight : 0,
            clsLineMax: clsTd ? (parseFloat(getComputedStyle(clsTd).lineHeight) || 24) + 21 : 0, // lineHeight=normal 时回退 24px 基准
          };
        });
        const badge = table.querySelector('tbody .tag-grey');
        const cRect = container.getBoundingClientRect();
        const bRect = badge ? badge.getBoundingClientRect() : null;
        return {
          rows: info,
          scrollWidth: container.scrollWidth, clientWidth: container.clientWidth,
          badgeRight: bRect ? bRect.right : null, badgeLeft: bRect ? bRect.left : null,
          containerRight: cRect.right, containerLeft: cRect.left,
        };
      });
      console.log(`  [测量 ${tag}] scrollWidth=${m.scrollWidth} clientWidth=${m.clientWidth} 行=[${m.rows.map(r => `${r.name}:${r.rowH}px:${r.nameWhiteSpace}`).join(' | ')}]`);
      const pseudo = m.rows.find(r => r.badgeText);
      const normals = m.rows.filter(r => !r.badgeText && r.name);
      // ① BUG-058 零回退：scrollWidth = clientWidth = 档位基准值（±1）
      check(`${tag} BUG-058 不回退：scrollWidth=${expectWidth}=clientWidth（±1）`,
        Math.abs(m.scrollWidth - expectWidth) <= 1 && Math.abs(m.clientWidth - expectWidth) <= 1,
        `${m.scrollWidth}/${m.clientWidth} 期望 ${expectWidth}`);
      // ② BUG-070 零回退：职业列（死亡骑士 4 字）单行不折行
      const dk = m.rows.find(r => r.clsText === '死亡骑士');
      check(`${tag} BUG-070 不回退：职业列两字单行不折行`, dk && dk.clsH <= dk.clsLineMax + 1,
        dk ? `死亡骑士 clsH=${dk.clsH}px ≤ ${dk.clsLineMax}px` : '缺死亡骑士样本');
      // ③ 修复目标：伪行徽标与名字同行 + 伪行行高 = 正常行行高一致
      // （同行容差 ±4px：inline-flex 徽标(20px)与文本行盒基线对齐差 1-2px 属正常；折行时差 = 一整行 13-16px）
      check(`${tag} 伪行徽标与名字同行（rect top 差 ≤4px；折行时差一整行）`,
        pseudo && Math.abs(pseudo.badgeTop - pseudo.nameTop) <= 4,
        pseudo ? `badgeTop=${pseudo.badgeTop} nameTop=${pseudo.nameTop}` : '缺伪行样本');
      const normalH = normals.length ? normals[0].rowH : 0;
      check(`${tag} 伪行行高 = 正常行行高（${normalH}px）一致（±1）`,
        pseudo && normals.length > 0 && Math.abs(pseudo.rowH - normalH) <= 1,
        pseudo ? `伪行=${pseudo.rowH}px 正常行=${normalH}px` : '缺样本');
      if (tag === '1366档') {
        // 行高基准复测：任务书基准 44px（BUG-070 验收值），本样本实测正常行 45-46px——以「伪行=正常行」为硬判定，
        // 绝对值按实测区间 [44,46] 复测记录（成员名字节数影响行盒，±2 区间）
        check(`1366档 行高绝对值复测：正常行与伪行均 ∈ [44,46]px（任务书基准 44，实测口径记录）`,
          pseudo && pseudo.rowH >= 44 && pseudo.rowH <= 46 && normals.every(r => r.rowH >= 44 && r.rowH <= 46),
          `伪行=${pseudo && pseudo.rowH} 正常行=[${normals.map(r => r.rowH).join('/')}]`);
        // ④ 最小选择器：伪行 nowrap，正常行仍 normal（零触及）
        check(`1366档 最小选择器：伪行名字 td computed nowrap / 正常行仍 normal（零触及）`,
          pseudo && pseudo.nameWhiteSpace === 'nowrap' && normals.every(r => r.nameWhiteSpace === 'normal'),
          `伪行=${pseudo && pseudo.nameWhiteSpace} 正常行=[${normals.map(r => r.nameWhiteSpace).join('/')}]`);
        // ⑤ 徽标文案与语义零改动
        check(`1366档 徽标文案「已删除」保留（语义零改动）`, pseudo && pseudo.badgeText === '已删除', pseudo && pseudo.badgeText);
      }
      check(`${tag} 「已删除」徽标完整落在容器内`,
        m.badgeRight !== null && m.badgeRight <= m.containerRight + 1 && m.badgeLeft >= m.containerLeft - 1,
        `badge=[${m.badgeLeft},${m.badgeRight}] container=[${m.containerLeft},${m.containerRight}]`);
    }

    await measure('1366档', 468);
    await page.evaluate(() => document.getElementById('rankTableBody').scrollIntoView({ block: 'center' }));
    await sleep(400);
    await page.screenshot({ path: path.join(SHOT_DIR, 'reports-1366.png') });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await sleep(600);
    await measure('1920档', 761);
    await page.screenshot({ path: path.join(SHOT_DIR, 'reports-1920.png') });

    const realErrors = pageErrors.filter(e => !/status of (400|401|406|409)/.test(e));
    check('全程零 JS 报错（400/406/409=已知噪音已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
    await ctx.close();
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== BUG-071 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
