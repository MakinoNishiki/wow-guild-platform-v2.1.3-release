// 任务书 #56 WP1 验证：埋点 WP3 规范回写 + 存量七事件补挂（REQ-141）
// A 静态：规范「埋点纪律」章锚点（章题+五条+清单表 8 行逐字）；track.js/server.js/sql//main.css 零改动断言（git diff 文件名清单）；
//         app.js WBTrack.event 挂点 9 处、去重事件名恰 7 类与清单逐字一致、注释钉来源；版本串 .72 三壳 15/6/8+.71 零残留；
//         changelog 条目+台账行；node --check + server-security 回归。
// B 浏览器插桩（addInitScript 包装 sendBeacon+fetch 捕获 /api/track payload，沿袭 #54 pvcheck 捕获法）：
//   账号 A 真机注册→建会「埋点测试会」→智能导入 2 行→创建活动→添加装备→添加心愿；
//   账号 B 真机登录→邀请码加入——七事件逐一触发，断言事件名逐字/props 键不越登记键集/登录态 uid 非空（user_register 允许 null）/零 JS 报错。
// C 清零：测试事件行（双 ctx vid）service_role 删除复核为零；测试公会 G1（含考勤/装备/心愿/成员行）删除复核为零；
//   双测试 auth 用户删除复核。清理输出全量贴回报。
// 【申报】UI 无删除公会入口（deleteGuildCloud 在 app.js 零调用点，死功能在案）——任务书「经 UI 删除测试公会」不可达，
//   C 组公会清理走 service_role 先例通道（#54 B5/#55 B5 同款），业务行清零复核口径不变。
// 用法: node scripts/verify-task56.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15656;
const BASE = `http://127.0.0.1:${PORT}`;
const VER = '20260919.72';
const VER_OLD = '20260919.71';
const PWD = 'T56-Evt-2026!';
const EMAIL_A = 't56-a@example.com';
const EMAIL_B = 't56-b@example.com';
const GUILD_NAME = '埋点测试会';

const REGISTERED = {
  user_register: [], guild_create: [], guild_join: [],
  attendance_save: ['marked'], loot_assign: ['count'], wishlist_add: [],
  smart_import: ['import_type', 'rows'],
};

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail !== undefined ? `（${detail}）` : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function svcRest(method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, {
    method, headers: { ...SVC, Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

let serverProc = null;
async function startServer() {
  serverProc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_RUN_PORT: String(PORT) },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) return; } catch { /* 未起 */ }
    await sleep(200);
  }
  throw new Error('server.js 启动超时');
}

// ==================== A 静态 ====================
function staticAsserts() {
  const spec = fs.readFileSync(path.join(ROOT, 'docs', '开发规范.md'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const decor = fs.readFileSync(path.join(ROOT, 'decor.html'), 'utf8');
  const data = fs.readFileSync(path.join(ROOT, 'data.html'), 'utf8');
  const ledger = fs.readFileSync(path.join(ROOT, 'docs', '问题与需求清单.md'), 'utf8');

  // A1 规范章锚点
  check('A1a 「埋点纪律」章题在场（第七章）', /## 第七章 埋点纪律（REQ-141，任务书 #56 确立）/.test(spec));
  check('A1b 五条纪律关键词（唯一入口/事件登记制/成功后触发/props 零 PII 口径/静默不阻塞）',
    /唯一入口/.test(spec) && /事件登记制/.test(spec) && /写库确认成功后触发/.test(spec) &&
    /禁止人名、公会名、装备名/.test(spec) && /静默不阻塞/.test(spec));
  const EVENTS8 = ['page_view', 'user_register', 'guild_create', 'guild_join', 'attendance_save', 'loot_assign', 'wishlist_add', 'smart_import'];
  check('A1c 事件清单表 8 行事件名逐字在场', EVENTS8.every(e => new RegExp('\\| ' + e + ' \\|').test(spec)));

  // A2 红线零改动断言（git diff 文件名清单）
  const diffNames = spawnSync('git', ['diff', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const statusSql = spawnSync('git', ['status', '--short', '--', 'sql/'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  check('A2 track.js/server.js/css(main.css 看板样式)/sql 零改动',
    !diffNames.some(f => ['js/track.js', 'server.js', 'css/main.css'].includes(f)) && statusSql === '' &&
    !diffNames.some(f => f.startsWith('sql/')),
    `diff 清单=${diffNames.join(',')}`);
  // 看板代码零改动：app.js diff 变更行不含 anxState/mdRenderAnalytics/.anx-
  const appDiff = spawnSync('git', ['diff', '-U0', '--', 'js/app.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).stdout;
  const changedLines = appDiff.split('\n').filter(l => /^[+-]/.test(l) && !/^[+-]{3}/.test(l));
  check('A2b 看板代码零改动（app.js 变更行零命中 anxState/mdRenderAnalytics/.anx-）',
    !changedLines.some(l => /anxState|mdRenderAnalytics|anx-/.test(l)));

  // A3 挂点断言
  const hooks = [...app.matchAll(/WBTrack\.event\('([a-z_]+)'/g)].map(m => m[1]);
  const uniq = [...new Set(hooks)].sort();
  check('A3a WBTrack.event 挂点 9 处（guild_join 双路径+attendance 双分支），去重事件名恰 7 类与清单逐字一致',
    hooks.length === 9 && JSON.stringify(uniq) === JSON.stringify(EVENTS8.filter(e => e !== 'page_view').sort()),
    `挂点=${hooks.length} 事件=${uniq.join(',')}`);
  check('A3b 每处挂点带 #56 注释钉来源',
    (app.match(/任务书 #56：REQ-141 WP3 埋点（事件名见 docs\/开发规范\.md 埋点纪律章）/g) || []).length === 9);

  // A4 版本串
  const countStr = (s, v) => (s.match(new RegExp(v.replace(/\./g, '\\.'), 'g')) || []).length;
  check(`A4 版本串 ${VER} 三壳计数 index×15/decor×6/data×8 + 旧串 ${VER_OLD} 零残留 + 无异版本串`,
    countStr(index, VER) === 15 && countStr(decor, VER) === 6 && countStr(data, VER) === 8 &&
    countStr(index, VER_OLD) === 0 && countStr(decor, VER_OLD) === 0 && countStr(data, VER_OLD) === 0 &&
    [index, decor, data].every(s => !(new RegExp('\\?v=(?!' + VER.replace(/\./g, '\\.') + ')\\d')).test(s)));

  // A5 changelog + 台账
  check('A5 changelog 条目 v3.2.0-task56-analytics-events（新增功能维度）+ 台账 REQ-141 行补记 #56',
    /id: 'v3\.2\.0-task56-analytics-events'/.test(app) && /#56 WP3 收官已实现待验收/.test(ledger));

  // A6 语法 + 安全回归
  for (const f of ['js/app.js', 'scripts/verify-task56.js']) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    check('A6 node --check ' + f, r.status === 0, r.status === 0 ? '' : r.stderr.trim().split('\n')[0]);
  }
  const t = spawnSync(process.execPath, ['--test', 'test/server-security.test.js'], { cwd: ROOT, encoding: 'utf8' });
  check('A6b node --test server-security 回归', t.status === 0, (t.stdout.match(/# pass \d+/) || [''])[0]);
}

// ==================== B 浏览器插桩 ====================
let uidA = null, uidB = null, guildId = null, vidA = null, vidB = null;

async function ensureUserB() {
  const list = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = (list.body && (list.body.users || list.body)) || [];
  const hit = Array.isArray(users) ? users.find(u => (u.email || '').toLowerCase() === EMAIL_B) : null;
  if (hit) return hit.id;
  const c = await svcRest('POST', '/auth/v1/admin/users', { email: EMAIL_B, password: PWD, email_confirm: true, user_metadata: { display_name: 't56-b' } });
  return c.body && c.body.id;
}

// addInitScript 捕获 /api/track payload（sendBeacon Blob 异步读 + fetch body 同步读）
async function newTrackCtx(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  await ctx.addInitScript(() => {
    window.__t56 = [];
    const rec = (body) => { try { window.__t56.push(JSON.parse(body)); } catch { /* 非 json 忽略 */ } };
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      try {
        if (String(url).includes('/api/track')) {
          if (data instanceof Blob) data.text().then(rec); else rec(data);
        }
      } catch { /* 静默 */ }
      return origBeacon(url, data);
    };
    const origFetch = window.fetch.bind(window);
    window.fetch = (url, opts) => {
      try {
        if (String(url).includes('/api/track') && opts && opts.body) rec(opts.body);
      } catch { /* 静默 */ }
      return origFetch(url, opts);
    };
  });
  const pg = await ctx.newPage();
  const errs = [], badNet = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  pg.on('response', r => { if (r.status() >= 400) badNet.push(`http${r.status()} ${r.request().method()} ${r.url()}`); });
  return { ctx, pg, errs, badNet };
}

// ensureTagNum 撞号重试 409（cloud.js:297-309 设计内噪音）：只精确滤「POST /rest/v1/user_profiles 的 409」+ 逐条配对回显
function filterNoise(errs, badNet) {
  const NET_409 = /^http409 POST https:\/\/[^/]+\/rest\/v1\/user_profiles$/;
  const badReal = badNet.filter(e => !NET_409.test(e));
  let echoBudget = badNet.length - badReal.length;
  const errsReal = errs.filter(e => {
    if (echoBudget > 0 && e === 'console: Failed to load resource: the server responded with a status of 409 ()') { echoBudget--; return false; }
    return true;
  });
  return { badReal, errsReal };
}

async function capturedEvents(pg) {
  return pg.evaluate(() => window.__t56.slice());
}

async function liveAsserts() {
  uidB = await ensureUserB();
  check('B-前置 测试账号 B 就位（uid=' + String(uidB || '').slice(0, 6) + '… 掩码）', !!uidB);
  if (!uidB) return;
  await startServer();
  console.log('--- 服务器已起（端口 ' + PORT + '） ---');
  const browser = await chromium.launch({ headless: true });

  // ---------- 账号 A：注册 → 建会 → 四业务事件 ----------
  const A = await newTrackCtx(browser);
  await A.pg.goto(`${BASE}/`, { waitUntil: 'load' });
  // 1) user_register
  await A.pg.click('text=立即注册');
  await A.pg.fill('#regDisplayName', 't56-a');
  await A.pg.fill('#regEmail', EMAIL_A);
  await A.pg.fill('#regPassword', PWD);
  await A.pg.click('#authRegisterBtn');
  await A.pg.waitForSelector('#newGuildName', { state: 'visible', timeout: 30000 });
  // 2) guild_create
  await A.pg.fill('#newGuildName', GUILD_NAME);
  await A.pg.click('button:has-text("创建公会")');
  await A.pg.waitForSelector('.nav-item[data-page="members"]', { state: 'visible', timeout: 30000 });
  vidA = await A.pg.evaluate(() => localStorage.getItem('wb_vid'));

  // 3) smart_import（粘贴两行，import_type=paste）
  await A.pg.click('.nav-item[data-page="members"]');
  await A.pg.click('button:has-text("智能导入")');
  await A.pg.waitForSelector('#importMembersText', { state: 'visible', timeout: 10000 });
  await A.pg.fill('#importMembersText', '埋点兵一,战士\n埋点兵二,法师');
  await A.pg.click('#importParseBtn');
  await A.pg.waitForSelector('#importConfirmBtn', { state: 'visible', timeout: 10000 });
  await A.pg.click('#importConfirmBtn');
  await A.pg.waitForFunction(() => document.querySelector('#importMembersModal') === null ||
    getComputedStyle(document.querySelector('#importMembersModal')).display === 'none', { timeout: 20000 });

  // 4) attendance_save（创建活动，marked=2）
  await A.pg.click('.nav-item[data-page="attendance"]');
  await A.pg.click('button:has-text("创建活动")');
  await A.pg.waitForSelector('#activityRaidName', { state: 'visible', timeout: 10000 });
  await A.pg.evaluate(() => {
    document.getElementById('activityDate').value = new Date().toISOString().slice(0, 10);
  });
  await A.pg.fill('#activityRaidName', '埋点测试团本');
  await A.pg.click('#activitySaveBtn');
  await A.pg.waitForFunction(() => getComputedStyle(document.querySelector('#activityModal')).display === 'none', { timeout: 20000 });

  // 5) loot_assign（仅填装备名，count=1）
  await A.pg.click('.nav-item[data-page="loot"]');
  await A.pg.click('button:has-text("添加装备")');
  await A.pg.waitForSelector('#lootName', { state: 'visible', timeout: 10000 });
  await A.pg.fill('#lootName', '埋点测试装备');
  await A.pg.click('#lootSaveBtn');
  await A.pg.waitForFunction(() => getComputedStyle(document.querySelector('#lootModal')).display === 'none', { timeout: 20000 });

  // 6) wishlist_add（填装备名+勾一名成员）
  await A.pg.click('.nav-item[data-page="wishlist"]');
  await A.pg.click('button:has-text("添加心愿")');
  await A.pg.waitForSelector('#wishlistItemName', { state: 'visible', timeout: 10000 });
  await A.pg.fill('#wishlistItemName', '埋点心愿装备');
  await A.pg.locator('#wishlistMemberCheckboxes input[type="checkbox"]').first().check();
  await A.pg.click('#wishlistSaveBtn');
  await A.pg.waitForFunction(() => getComputedStyle(document.querySelector('#wishlistModal')).display === 'none', { timeout: 20000 });

  await sleep(800); // sendBeacon Blob 异步读取落定
  const evtsA = await capturedEvents(A.pg);

  // ---------- 账号 B：登录 → 邀请码加入（guild_join 主路径） ----------
  const gRow = await svcRest('GET', `/rest/v1/guilds?name=eq.${encodeURIComponent(GUILD_NAME)}&select=id,invite_code`);
  guildId = gRow.body && gRow.body[0] && gRow.body[0].id;
  const inviteCode = gRow.body && gRow.body[0] && gRow.body[0].invite_code;
  check('B-前置 测试公会 G1 在库（邀请码已取得）', !!guildId && !!inviteCode, `guild=${String(guildId).slice(0, 6)}…`);

  const B = await newTrackCtx(browser);
  await B.pg.goto(`${BASE}/`, { waitUntil: 'load' });
  await B.pg.fill('#authEmail', EMAIL_B);
  await B.pg.fill('#authPassword', PWD);
  await B.pg.click('#authLoginBtn');
  await B.pg.waitForSelector('#joinInviteCode', { state: 'visible', timeout: 30000 });
  await B.pg.fill('#joinInviteCode', inviteCode);
  await B.pg.click('button:has-text("加入公会")');
  await B.pg.waitForSelector('.nav-item[data-page="members"]', { state: 'visible', timeout: 30000 });
  vidB = await B.pg.evaluate(() => localStorage.getItem('wb_vid'));
  await sleep(800);
  const evtsB = await capturedEvents(B.pg);

  await browser.close();

  // ---------- payload 断言 ----------
  const all = [...evtsA, ...evtsB];
  const byName = {};
  all.forEach(e => { (byName[e.event] = byName[e.event] || []).push(e); });
  // 七类之外不埋（page_view 为登记存量）
  const ALLOWED = ['page_view', ...Object.keys(REGISTERED)];
  check('B1 捕获事件名全部 ∈ 登记清单（七类之外一律不埋）',
    all.every(e => ALLOWED.includes(e.event)), `事件分布=${Object.keys(byName).sort().join(',')}`);
  for (const [name, keys] of Object.entries(REGISTERED)) {
    const rows = byName[name] || [];
    const propsOk = rows.every(e => e.props && Object.keys(e.props).every(k => keys.includes(k)));
    const uidOk = rows.every(e => name === 'user_register' ? true : !!e.uid);
    check(`B2 ${name}：在场 ≥1 + props 键 ⊆ {${keys.join(',') || '空'}} + ${name === 'user_register' ? 'uid 允许 null' : 'uid 非空'}`,
      rows.length >= 1 && propsOk && uidOk,
      `次数=${rows.length} 样本props=${JSON.stringify(rows[0] && rows[0].props)} uid=${rows[0] && rows[0].uid ? '非空' : 'null'}`);
  }
  check('B3 smart_import props 值口径（import_type=paste / rows=2）',
    (byName.smart_import || []).some(e => e.props.import_type === 'paste' && e.props.rows === 2),
    JSON.stringify((byName.smart_import || [])[0] && (byName.smart_import || [])[0].props));
  check('B4 attendance_save props 值口径（marked=2 = 两名导入成员在册）',
    (byName.attendance_save || []).some(e => e.props.marked === 2),
    JSON.stringify((byName.attendance_save || [])[0] && (byName.attendance_save || [])[0].props));
  check('B5 loot_assign props 值口径（count=1）',
    (byName.loot_assign || []).some(e => e.props.count === 1));

  const nA = filterNoise(A.errs, A.badNet), nB = filterNoise(B.errs, B.badNet);
  check('B6 双账号触发全程零 JS 报错零意外 4xx（ensureTagNum 409 重试噪音按精确白名单滤除）',
    nA.badReal.length === 0 && nA.errsReal.length === 0 && nB.badReal.length === 0 && nB.errsReal.length === 0,
    `A=${nA.badReal.concat(nA.errsReal).join(' | ').slice(0, 150) || 0} B=${nB.badReal.concat(nB.errsReal).join(' | ').slice(0, 150) || 0}`);
}

// ==================== C 清零 ====================
async function cleanupAsserts() {
  // C1 测试事件行（双 ctx vid）删除复核为零
  const vids = [vidA, vidB].filter(Boolean);
  if (vids.length) {
    await svcRest('DELETE', `/rest/v1/analytics_events?vid=in.(${vids.map(v => `"${v}"`).join(',')})`);
  }
  const leftEv = await svcRest('GET', `/rest/v1/analytics_events?select=id&vid=in.(${vids.map(v => `"${v}"`).join(',')})`);
  check('C1 测试事件行清零复核（双 vid 零残留）',
    leftEv.status === 200 && Array.isArray(leftEv.body) && leftEv.body.length === 0,
    `残留=${Array.isArray(leftEv.body) ? leftEv.body.length : '?'}`);

  // C2 测试公会及其业务行删除复核为零
  // 【申报】UI 无删除公会入口（deleteGuildCloud 在 app.js 零调用点）——走 service_role 先例通道（#54/#55 同款），复核口径不变
  if (guildId) {
    // 关联业务行先行（考勤/活动/装备/心愿/成员/成员关系），再删公会行
    const acts = await svcRest('GET', `/rest/v1/activities?guild_id=eq.${guildId}&select=id`);
    for (const a of (Array.isArray(acts.body) ? acts.body : [])) {
      await svcRest('DELETE', `/rest/v1/activity_attendance?activity_id=eq.${a.id}`);
    }
    for (const t of ['activities', 'loots', 'wishlists', 'raid_members', 'guild_members']) {
      await svcRest('DELETE', `/rest/v1/${t}?guild_id=eq.${guildId}`);
    }
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
    const gGone = await svcRest('GET', `/rest/v1/guilds?id=eq.${guildId}&select=id`);
    const bizLeft = [];
    for (const t of ['activities', 'loots', 'wishlists', 'raid_members', 'guild_members']) {
      const r = await svcRest('GET', `/rest/v1/${t}?guild_id=eq.${guildId}&select=id&limit=1`);
      if (Array.isArray(r.body)) bizLeft.push(...r.body.map(() => t));
    }
    check('C2 测试公会 G1 及考勤/装备/心愿/成员行业务行清零复核',
      Array.isArray(gGone.body) && gGone.body.length === 0 && bizLeft.length === 0,
      `公会残留=${Array.isArray(gGone.body) ? gGone.body.length : '?'} 业务行残留=${bizLeft.join(',') || 0}`);
  }

  // C3 双测试 auth 用户删除复核
  const list = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = (list.body && (list.body.users || list.body)) || [];
  for (const u of (Array.isArray(users) ? users : [])) {
    if ([EMAIL_A, EMAIL_B].includes((u.email || '').toLowerCase())) {
      await svcRest('DELETE', `/auth/v1/admin/users/${u.id}`);
    }
  }
  const list2 = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users2 = (list2.body && (list2.body.users || list2.body)) || [];
  check('C3 双测试 auth 用户清零复核',
    !users2.some(u => [EMAIL_A, EMAIL_B].includes((u.email || '').toLowerCase())));
}

(async () => {
  console.log('===== A 静态断言 =====');
  staticAsserts();
  console.log('===== B 浏览器插桩（七事件逐一真机触发） =====');
  try {
    await liveAsserts();
  } catch (e) {
    check('B 段异常捕获（不假绿）', false, e.message);
  } finally {
    if (serverProc) serverProc.kill();
  }
  console.log('===== C 清零 =====');
  try {
    await cleanupAsserts();
  } catch (e) {
    check('C 清零异常', false, e.message);
  }
  const pass = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;
  console.log(`\n========== 合计 ${pass}/${results.length} 通过，${fail} 红 ==========`);
  process.exit(fail === 0 ? 0 : 1);
})();
