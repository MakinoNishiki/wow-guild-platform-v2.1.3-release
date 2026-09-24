// 任务书 #58-WP2-3 验证：埋点白名单扩至 14 + TRACK_PAGE_RE 连字符修复 + 文档回写
// A 静态：TRACK_EVENTS 14 事件逐一核对 / TRACK_PAGE_RE 新口径 / 前端三挂点名核对 /
//   开发规范第七章事件表 14 行+regex 口径注记 / REQ-137 台账补记 / 版本串 / 红线零改动 / node --check / server-security 回归。
// B 实测（起 server 直 POST /api/track，service key 复核 analytics_events）：
//   B1 三新事件入库（props 逐键一致）；B2 index:decor-plan PV 入库（吞没修复实证）+ decor/data/index:dashboard 旧口径不回归；
//   B3 负向：下划线页签/未登记事件/裸页签三吞零入库。
// C 清零：测试事件行删除 + 残留自检报数。
// 用法: node scripts/verify-task58-wp2-3.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 15664;
const BASE = `http://127.0.0.1:${PORT}`;
const VER = '20260923.77';
const VER_PREV = '20260923.76';
const VID = 'verify-t58wp23-' + Date.now().toString(36);

const EVENTS_14 = ['page_view', 'user_register', 'guild_create', 'guild_join', 'attendance_save', 'loot_assign', 'wishlist_add', 'smart_import',
  'decor_plan_add', 'decor_plan_save', 'decor_plan_export_text',
  'decor_plan_create', 'decor_plan_switch', 'decor_plan_export_image'];

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const SVC = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };

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
    try { const r = await fetch(BASE + '/index.html'); if (r.ok) return; } catch { /* 未起 */ }
    await sleep(300);
  }
  throw new Error('server 启动超时');
}
async function postTrack(payload) {
  const res = await fetch(BASE + '/api/track', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  return res.status;
}
async function fetchRows() {
  const r = await svcRest('GET', `/rest/v1/analytics_events?select=event,page,props&vid=eq.${VID}`);
  return Array.isArray(r.body) ? r.body : [];
}
async function waitRows(minN) {
  for (let i = 0; i < 20; i++) {
    const rows = await fetchRows();
    if (rows.length >= minN) return rows;
    await sleep(400);
  }
  return fetchRows();
}

// ==================== A 静态断言 ====================
function staticAsserts() {
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const dd = fs.readFileSync(path.join(ROOT, 'js/decorData.js'), 'utf8');
  const spec = fs.readFileSync(path.join(ROOT, 'docs/开发规范.md'), 'utf8');
  const ledger = fs.readFileSync(path.join(ROOT, 'docs/问题与需求清单.md'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const decor = fs.readFileSync(path.join(ROOT, 'decor.html'), 'utf8');

  const mEvt = srv.match(/const TRACK_EVENTS = \[([\s\S]*?)\];/);
  const listed = mEvt ? (mEvt[1].match(/"([a-z_]+)"/g) || []).map(s => s.slice(1, -1)) : [];
  check('A1 server.js TRACK_EVENTS = 14 事件（含 WP2-3 新增三事件，顺序逐一核对）',
    JSON.stringify(listed) === JSON.stringify(EVENTS_14),
    `库内=${listed.length} 缺=${EVENTS_14.filter(e => !listed.includes(e)).join(',') || '无'}`);
  check('A2 TRACK_PAGE_RE 放行连字符（index:[a-z-]+，修复 index:decor-plan PV 吞没）+ 看板 ANALYTICS_PAGE_RE 同口径',
    /const TRACK_PAGE_RE = \/\^\(decor\|data\|index:\[a-z-\]\+\)\$\//.test(srv) &&
    /const ANALYTICS_PAGE_RE = \/\^\(all\|index\|decor\|data\|index:\[a-z-\]\+\)\$\//.test(srv));
  check('A3 前端三挂点与 whitelist 名逐一核对（decorData.js create/switch/export_image×2）',
    /WBTrack\.event\('decor_plan_create', \{\}\)/.test(dd) &&
    /WBTrack\.event\('decor_plan_switch', \{ plan_count: plan\.plans\.length \}\)/.test(dd) &&
    (dd.match(/WBTrack\.event\('decor_plan_export_image', \{ skin: exportSkin \}\)/g) || []).length === 2);
  const tableRows = (spec.match(/^\| [a-z_]+ \|/gm) || []).map(l => l.slice(2, l.indexOf(' |', 2)));
  check('A4 开发规范第七章事件表 14 行与白名单一一对应 + regex 口径注记在场',
    JSON.stringify(tableRows) === JSON.stringify(EVENTS_14) &&
    /decor_plan_create \| 新建方案成功/.test(spec) &&
    /decor_plan_switch \| 方案下拉切换成功/.test(spec) && /\{plan_count: 方案总数\}/.test(spec) &&
    /decor_plan_export_image \| 导出图片动作一次/.test(spec) && /\{skin: 'gold'\/'alliance'\/'horde'\}/.test(spec) &&
    /TRACK_PAGE_RE = \/\^\(decor\|data\|index:\[a-z-\]\+\)\$\//.test(spec) && /吞 `index:decor-plan` PV，已修/.test(spec),
    `表内=${tableRows.length} 行`);
  check('A5 REQ-137 台账行补记 WP2 段（三工作包 + 白名单 14 + PV 吞没修复）',
    /#58-WP2 三工作包已实现待验收/.test(ledger) && /WP2-3 埋点白名单扩至 14 事件/.test(ledger) &&
    !/WP2 形态B\/批量管理\/多方案\/图片模式未启动/.test(ledger));
  const countStr = (s, v) => (s.match(new RegExp(v.replace(/\./g, '\\.'), 'g')) || []).length;
  check(`A6 版本串 ${VER}（index×15/decor×6）+ 旧串（${VER_PREV}）零残留`,
    countStr(index, VER) === 15 && countStr(decor, VER) === 6 &&
    countStr(index, VER_PREV) === 0 && countStr(decor, VER_PREV) === 0);
  const porcelain = spawnSync('git', ['-c', 'core.quotepath=false', 'status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const allowed = new Set(['server.js', 'index.html', 'decor.html', 'docs/开发规范.md', 'docs/问题与需求清单.md',
    'scripts/verify-task58-wp2-3.js', 'docs/TASK-058-WP2-3-修改报告.md']);
  const touched = porcelain.map(l => l.slice(3).replace(/"/g, ''));
  check('A7 红线零越界：改动仅限本 WP 白名单（track.js/app.js/decorData.js/cloud.js/css/sql/data.html 零触碰）',
    touched.length > 0 && touched.every(f => allowed.has(f)),
    `diff 清单=${touched.join(',')}`);
  for (const f of ['server.js', 'scripts/verify-task58-wp2-3.js']) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    check('A8 node --check ' + f, r.status === 0, r.status === 0 ? '' : r.stderr.trim().split('\n')[0]);
  }
  const t = spawnSync(process.execPath, ['--test', 'test/server-security.test.js'], { cwd: ROOT, encoding: 'utf8' });
  check('A9 node --test server-security 回归', t.status === 0, (t.stdout.match(/# pass \d+|ℹ pass \d+/) || [''])[0]);
}

// ==================== B 实测（/api/track 直 POST + 库内复核） ====================
async function liveAsserts() {
  await startServer();
  console.log('--- 服务器已起（端口 ' + PORT + '） ---');

  // B1：三新事件入库（props 逐键一致）
  const shots = [
    { event: 'decor_plan_create', page: 'index:decor-plan', props: {} },
    { event: 'decor_plan_switch', page: 'index:decor-plan', props: { plan_count: 2 } },
    { event: 'decor_plan_export_image', page: 'index:decor-plan', props: { skin: 'horde' } },
  ];
  const codes = [];
  for (const s of shots) codes.push(await postTrack({ ...s, uid: null, vid: VID, ref_dom: null }));
  let rows = await waitRows(3);
  const byEvent = ev => rows.find(r => r.event === ev);
  check('B1 三新事件全部 204 且库内在场（props 逐键一致）',
    codes.every(c => c === 204) &&
    byEvent('decor_plan_create') && JSON.stringify(byEvent('decor_plan_create').props) === '{}' &&
    byEvent('decor_plan_switch') && JSON.stringify(byEvent('decor_plan_switch').props) === '{"plan_count":2}' &&
    byEvent('decor_plan_export_image') && JSON.stringify(byEvent('decor_plan_export_image').props) === '{"skin":"horde"}',
    `HTTP=${codes.join('/')} 库内事件=${rows.map(r => r.event).join(',') || '无'}`);

  // B2：index:decor-plan PV 入库（吞没修复实证）+ 旧口径三壳不回归
  const pvCodes = [];
  for (const page of ['index:decor-plan', 'decor', 'data', 'index:dashboard']) {
    pvCodes.push(await postTrack({ event: 'page_view', page, uid: null, vid: VID, ref_dom: null }));
  }
  rows = await waitRows(7);
  const pvPages = rows.filter(r => r.event === 'page_view').map(r => r.page).sort();
  check('B2 index:decor-plan PV 入库（regex 修复实证）+ decor/data/index:dashboard 旧口径不回归',
    pvCodes.every(c => c === 204) &&
    JSON.stringify(pvPages) === JSON.stringify(['data', 'decor', 'index:dashboard', 'index:decor-plan']),
    `HTTP=${pvCodes.join('/')} 库内PV=${pvPages.join(',') || '无'}`);

  // B3 负向：下划线页签 / 未登记事件 / 裸页签 → 恒 204 但零入库
  const before = rows.length;
  const ngCodes = [];
  ngCodes.push(await postTrack({ event: 'page_view', page: 'index:decor_plan', uid: null, vid: VID, ref_dom: null }));
  ngCodes.push(await postTrack({ event: 'decor_plan_hack', page: 'index:decor-plan', uid: null, vid: VID, ref_dom: null }));
  ngCodes.push(await postTrack({ event: 'page_view', page: 'decor-plan', uid: null, vid: VID, ref_dom: null }));
  await sleep(1200);
  rows = await fetchRows();
  check('B3 负向三吞：index:decor_plan（下划线）/ decor_plan_hack（未登记）/ decor-plan（裸页签）恒 204 零入库',
    ngCodes.every(c => c === 204) && rows.length === before,
    `HTTP=${ngCodes.join('/')} 库内行数 ${before}→${rows.length}`);
}

// ==================== C 清零（测试残留自检报数） ====================
async function cleanupAsserts() {
  const rows = await fetchRows();
  await svcRest('DELETE', `/rest/v1/analytics_events?vid=eq.${VID}`);
  const left = await fetchRows();
  check('C1 测试事件行清零 + 残留自检报数', left.length === 0,
    `删除前=${rows.length} 行，残留=${left.length}`);
}

(async () => {
  console.log('===== A 静态断言 =====');
  staticAsserts();
  console.log('===== B 实测（白名单三事件入库 + PV regex 修复 + 负向三吞） =====');
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
