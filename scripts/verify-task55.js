// 任务书 #55 WP1 验证：访问统计看板数据层（REQ-141）
// A 静态：sql/34 锚点、server.js 端点/限流/清理调度锚点、版本串 .70 三壳计数守恒（WP1 不动前端）、node --check、安全回归
// B 实测（自起服务器注入 ANALYTICS_ADMIN_UIDS=<测试管理员 uid>，service_role 仅用于断言与清理）：
//   B0 迁移闸——analytics_overview RPC 不在场则 B/C 全段 ⏸ 阻塞（非假绿），退出码非零；
//   B1 curl 矩阵：无 token 401 / 非管理员 403 / 管理员合法 200 六键 / grain:'minute' 400 / 93 天 400 / page 注入 400 / anon 直调双 RPC 401|404；
//   B2 数据正确性：5 条受控事件（东八区跨日子弹/补零桶/uv 口径/nav 剔 index:login/refs 直访归并/页面筛选）逐字断言；
//   B3 90 天清理：种 91 天前旧行 → purge 返回 ≥1 且旧行消失、近行保留；
//   B4 限流：同 uid 连发 40 次 → 出现 429（且不全是 429）。
// C 清零：props->>test='t55' 行删除复核为零 + 双测试用户清理。
// 用法: node scripts/verify-task55.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 15655;
const BASE = `http://127.0.0.1:${PORT}`;
const VER = '20260919.70';
const PWD = 'T55-Anx-2026!';
const ADMIN_EMAIL = 't55-admin@example.com';
const USER_EMAIL = 't55-user@example.com';

// 受控测试窗口：北京 2026-09-20 00:00 ~ 2026-09-22 00:00（UTC 2026-09-19T16:00Z ~ 2026-09-21T16:00Z）。
// 埋点 2026-09-22 才上线，该窗口无真实事件（B2a 前置断言钉死，污染即阻塞申报）。
const T_START = '2026-09-19T16:00:00Z';
const T_END = '2026-09-21T16:00:00Z';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
const ANON_H = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail !== undefined ? `（${detail}）` : ''}`);
}
function blocked(name, detail) {
  results.push({ name, ok: false, blocked: true });
  console.log(`⏸ ${name}【阻塞】${detail || ''}`);
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
let adminUid = null;
function startServer() {
  return new Promise((resolve, reject) => {
    serverProc = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      // 侦察闸 5 定案：同 #54 spawn env 注入先例，白名单注入测试管理员 uid
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_RUN_PORT: String(PORT), ANALYTICS_ADMIN_UIDS: adminUid },
      stdio: 'ignore',
    });
    let i = 0;
    const timer = setInterval(async () => {
      try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) { clearInterval(timer); resolve(); return; } } catch { /* 未起 */ }
      if (++i >= 50) { clearInterval(timer); reject(new Error('server.js 启动超时')); }
    }, 200);
  });
}

async function loginToken(email) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD }),
  });
  const j = await r.json().catch(() => ({}));
  return r.status === 200 && j.access_token ? j.access_token : null;
}

async function postSummary(token, payload) {
  const res = await fetch(`${BASE}/api/analytics/summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let j = null;
  try { j = JSON.parse(text); } catch { j = text; }
  return { status: res.status, body: j };
}

const VALID = { start: T_START, end: T_END, grain: 'day', page: 'all' };

// ==================== A 静态 ====================
function staticAsserts() {
  const sql = fs.readFileSync(path.join(ROOT, 'sql', '34_task055_analytics_overview.sql'), 'utf8');
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const decor = fs.readFileSync(path.join(ROOT, 'decor.html'), 'utf8');
  const data = fs.readFileSync(path.join(ROOT, 'data.html'), 'utf8');

  // A1 sql/34 锚点
  check('A1a analytics_overview 函数（四参/p_page 默认 all/returns jsonb/security definer/stable）',
    /create or replace function public\.analytics_overview\(\s*p_start timestamptz,\s*p_end timestamptz,\s*p_grain text,\s*p_page text default 'all'\s*\) returns jsonb/i.test(sql) &&
    /security definer/i.test(sql) && /^\s*stable$/im.test(sql));
  check('A1b analytics_purge_90d 函数（returns bigint/security definer/delete 90 天/GET DIAGNOSTICS 行数）',
    /create or replace function public\.analytics_purge_90d\(\) returns bigint/i.test(sql) &&
    (sql.match(/security definer/gi) || []).length >= 2 &&
    /delete from public\.analytics_events where ts < now\(\) - interval '90 days'/i.test(sql) &&
    /get diagnostics n = row_count/i.test(sql));
  check('A1c 时区钉死东八区（Asia/Shanghai 分桶）+ 补零桶（generate_series）+ 桶 ISO 带 +08:00',
    (sql.match(/Asia\/Shanghai/g) || []).length >= 4 && /generate_series/.test(sql) &&
    sql.includes(`'+08:00'`) && /to_char\(b\.bk, 'YYYY-MM-DD"T"HH24:MI:SS'\)/.test(sql));
  check('A1d 参数校验三件套（grain 白名单/92 天上限/page 正则）+ 范围 [p_start, p_end)',
    /p_grain not in \('hour', 'day', 'week', 'month'\)/.test(sql) &&
    /p_end - p_start > interval '92 days'/.test(sql) &&
    /p_page !~ '\^\(all\|index\|decor\|data\|index:\[a-z\]\+\)\$'/.test(sql) &&
    /ae\.ts >= p_start and ae\.ts < p_end/.test(sql));
  check('A1e 口径钉点：人=coalesce(uid::text, vid)；nav 剔 index:login；refs null 归并直接访问',
    /coalesce\(ae\.uid::text, ae\.vid\) as person/.test(sql) &&
    /page like 'index:%' and page <> 'index:login'/.test(sql) &&
    /coalesce\(ref_dom, '直接访问'\)/.test(sql));
  check('A1f 返回六键（series/cards/nav/pages/refs/events；任务书枚举清单为准，"五键"系措辞笔误已申报）',
    ['series', 'cards', 'nav', 'pages', 'refs', 'events'].every(k => sql.includes(`'${k}',`)) &&
    /'dau_avg'/.test(sql) && /'clicks', t\.clicks, 'people', t\.people/.test(sql));
  check('A1g 权限：双函数 revoke public/anon/authenticated + grant execute 仅 service_role',
    /revoke all on function public\.analytics_overview\(timestamptz, timestamptz, text, text\) from public, anon, authenticated;/i.test(sql) &&
    /revoke all on function public\.analytics_purge_90d\(\) from public, anon, authenticated;/i.test(sql) &&
    (sql.match(/grant execute on function public\.analytics_\w+[\s\S]{0,80}?to service_role;/gi) || []).length === 2);
  check('A1h 幂等 + 回滚注释 + NOTIFY pgrst + 不动 analytics_events 表结构（零 ALTER）',
    /NOTIFY pgrst, 'reload schema';/.test(sql) &&
    /drop function if exists public\.analytics_overview/i.test(sql) &&
    /drop function if exists public\.analytics_purge_90d/i.test(sql) &&
    !/alter table public\.analytics_events/i.test(sql));

  // A2 server.js 锚点
  const ep = server.slice(server.indexOf('if (urlPath === "/api/analytics/summary"'));
  check('A2a 端点在场 + 两段鉴权顺序（verifyTokenCached 401 先于白名单 403 仅管理员可见）',
    ep.length > 0 &&
    ep.indexOf('verifyTokenCached(token)') > -1 &&
    ep.indexOf('verifyTokenCached(token)') < ep.indexOf('analyticsAdminUids().includes(user.id)') &&
    ep.indexOf('analyticsAdminUids().includes(user.id)') < ep.indexOf('仅管理员可见') &&
    /send\(401, \{ error: "登录状态无效，请重新登录" \}\)/.test(ep) &&
    /send\(403, \{ error: "仅管理员可见" \}\)/.test(ep));
  check('A2b 白名单走 .env ANALYTICS_ADMIN_UIDS（逗号分隔解析，uid 不落代码）',
    /process\.env\.ANALYTICS_ADMIN_UIDS \|\| ""/.test(server) &&
    /\.split\(","\)/.test(server) && !/"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/.test(server));
  check('A2c 限流：同 uid 30 次/分滑窗 Map（与 track 桶分离）+ 429',
    /const ANALYTICS_SUMMARY_RATE_PER_MIN = 30;/.test(server) &&
    /const analyticsSummaryRateBuckets = new Map\(\);/.test(server) &&
    /analyticsSummaryRateLimited\(user\.id\)/.test(ep) &&
    /send\(429, \{ error: "请求过于频繁，请稍后再试" \}\)/.test(ep));
  check('A2d body 四项校验（8KB 上限/92 天/grain 白名单/page 正则 → 400 中文）',
    /const ANALYTICS_SUMMARY_MAX_BODY_BYTES = 8 \* 1024;/.test(server) &&
    /const ANALYTICS_MAX_RANGE_MS = 92 \* 24 \* 60 \* 60 \* 1000;/.test(server) &&
    /const ANALYTICS_GRAINS = \["hour", "day", "week", "month"\];/.test(server) &&
    /const ANALYTICS_PAGE_RE = \/\^\(all\|index\|decor\|data\|index:\[a-z\]\+\)\$\//.test(server) &&
    /时间范围不能超过 92 天/.test(ep) && /页面筛选参数无效/.test(ep));
  check('A2e RPC 透传 + 失败 502 不泄露内部细节（console.error + 固定中文）',
    ep.includes('"/rest/v1/rpc/analytics_overview"') &&
    /p_start: new Date\(startMs\)\.toISOString\(\)/.test(ep) &&
    /res\.end\(result\.body\)/.test(ep) &&
    /send\(502, \{ error: "统计服务暂不可用" \}\)/.test(ep) &&
    /console\.error\(\s*"\[analytics\] 统计查询 RPC 失败/.test(ep));
  check('A2f 90 天清理调度（server.js 版，侦察闸 3 定案）：10 分钟首跑 + 24h 间隔 + 删除行数 console.log + 异常吞掉不崩进程 + unref + startServer 挂载',
    /const ANALYTICS_PURGE_FIRST_DELAY_MS = 10 \* 60 \* 1000;/.test(server) &&
    /const ANALYTICS_PURGE_INTERVAL_MS = 24 \* 60 \* 60 \* 1000;/.test(server) &&
    server.includes('"/rest/v1/rpc/analytics_purge_90d"') &&
    /console\.log\("\[analytics\] 90 天滚动清理完成，删除行数="/.test(server) &&
    /console\.error\("\[analytics\] 90 天滚动清理异常（已吞，不影响进程）:"/.test(server) &&
    /\.unref\(\)/.test(server) && /scheduleAnalyticsPurge\(\);/.test(server) &&
    server.indexOf('scheduleAnalyticsPurge();') > server.indexOf('function startServer()'));

  // A3 版本串守恒（WP1 不动前端资产：.70 计数 index×15/decor×6/data×8 零漂移）
  const countStr = (s, v) => (s.match(new RegExp(v.replace(/\./g, '\\.'), 'g')) || []).length;
  check(`A3 版本串 ${VER} 三壳计数守恒（index×15/decor×6/data×8）+ 无异版本串（WP1 不动前端）`,
    countStr(index, VER) === 15 && countStr(decor, VER) === 6 && countStr(data, VER) === 8 &&
    [index, decor, data].every(s => !(new RegExp('\\?v=(?!' + VER.replace(/\./g, '\\.') + ')\\d')).test(s)),
    `实际=${countStr(index, VER)}/${countStr(decor, VER)}/${countStr(data, VER)}`);

  // A4 语法检查 + 静态安全回归
  for (const f of ['server.js', 'scripts/verify-task55.js']) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    check('A4 node --check ' + f, r.status === 0, r.status === 0 ? '' : r.stderr.trim().split('\n')[0]);
  }
  const t = spawnSync(process.execPath, ['--test', 'test/server-security.test.js'], { cwd: ROOT, encoding: 'utf8' });
  check('A4b node --test server-security 回归（既有安全边界零行为变更）',
    t.status === 0, (t.stdout.match(/# pass \d+/) || [''])[0]);
}

// ==================== 测试用户 ====================
async function ensureTestUsers() {
  // 幂等：先按邮箱查存量（失败重跑不撞 422），没有再建
  const list = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=200');
  const users = (list.body && (list.body.users || list.body)) || [];
  const ids = {};
  for (const [key, email] of [['admin', ADMIN_EMAIL], ['user', USER_EMAIL]]) {
    const hit = Array.isArray(users) ? users.find(u => (u.email || '').toLowerCase() === email) : null;
    if (hit) { ids[key] = hit.id; continue; }
    const c = await svcRest('POST', '/auth/v1/admin/users', { email, password: PWD, email_confirm: true, user_metadata: { display_name: 't55-' + key } });
    ids[key] = c.body && c.body.id;
  }
  return ids;
}

async function deleteTestUser(uid) {
  if (!uid) return;
  await svcRest('DELETE', `/auth/v1/admin/users/${uid}`);
}

// ==================== B 实测 ====================
async function liveAsserts() {
  const ids = await ensureTestUsers();
  adminUid = ids.admin;
  const userUid = ids.user;
  check('B-前置 双测试用户就位（admin  uid=' + String(adminUid || '').slice(0, 6) + '… 掩码）', !!adminUid && !!userUid);
  if (!adminUid || !userUid) { blocked('B/C 全段', '测试用户创建失败'); return; }

  // 预清理上轮残留（幂等重跑）
  await svcRest('DELETE', `/rest/v1/analytics_events?props->>test=eq.t55`);

  await startServer();
  console.log('--- 服务器已起（端口 ' + PORT + '，注入 ANALYTICS_ADMIN_UIDS=' + String(adminUid).slice(0, 6) + '… 掩码） ---');

  const adminToken = await loginToken(ADMIN_EMAIL);
  const userToken = await loginToken(USER_EMAIL);
  check('B-前置 双用户密码登录拿 access_token', !!adminToken && !!userToken);
  if (!adminToken || !userToken) { blocked('B/C 全段', '登录失败'); return; }

  // B0 迁移闸：analytics_overview 不在场 → B/C 阻塞申报（不假绿）
  const probe = await svcRest('POST', '/rest/v1/rpc/analytics_overview', { p_start: T_START, p_end: T_END, p_grain: 'day', p_page: 'all' });
  const migrated = probe.status === 200 && probe.body && typeof probe.body === 'object' && 'series' in probe.body;
  if (!migrated) {
    blocked('B0 analytics_overview RPC 在场（sql/34 已执行）',
      `RPC 探测 HTTP ${probe.status}——迁移未执行，B/C 段全阻塞，先执行 sql/34 再复跑本脚本`);
    for (const n of ['B1 curl 矩阵', 'B2 数据正确性', 'B3 90 天清理', 'B4 限流', 'C 清零复核']) blocked(n, '依赖 B0');
    return;
  }
  check('B0 analytics_overview RPC 在场（service_role 可调，返回含 series 键）', true);

  // ---- B1 curl 矩阵 ----
  const rNoToken = await postSummary(null, VALID);
  check('B1a 无 token → 401', rNoToken.status === 401, `HTTP ${rNoToken.status}`);
  const rUser = await postSummary(userToken, VALID);
  check('B1b 登录非管理员 → 403 {error:"仅管理员可见"}',
    rUser.status === 403 && rUser.body && rUser.body.error === '仅管理员可见',
    `HTTP ${rUser.status} body=${JSON.stringify(rUser.body)}`);
  const rOk = await postSummary(adminToken, VALID);
  check('B1c 管理员合法参数 → 200 且六键齐（series/cards/nav/pages/refs/events）',
    rOk.status === 200 && rOk.body && ['series', 'cards', 'nav', 'pages', 'refs', 'events'].every(k => k in rOk.body),
    `HTTP ${rOk.status} keys=${rOk.body ? Object.keys(rOk.body).join(',') : '?'}`);
  const rGrain = await postSummary(adminToken, { ...VALID, grain: 'minute' });
  check('B1d grain:"minute" → 400', rGrain.status === 400, `HTTP ${rGrain.status} ${rGrain.body && rGrain.body.error}`);
  const r93 = await postSummary(adminToken, { start: '2026-06-01T00:00:00Z', end: '2026-09-02T00:00:00Z', grain: 'day', page: 'all' });
  check('B1e 范围 93 天 → 400', r93.status === 400, `HTTP ${r93.status} ${r93.body && r93.body.error}`);
  const rInject = await postSummary(adminToken, { ...VALID, page: 'index;drop' });
  check('B1f page:"index;drop" → 400', rInject.status === 400, `HTTP ${rInject.status} ${rInject.body && rInject.body.error}`);
  const rAnon1 = await fetch(`${SB}/rest/v1/rpc/analytics_overview`, { method: 'POST', headers: ANON_H, body: JSON.stringify({ p_start: T_START, p_end: T_END, p_grain: 'day', p_page: 'all' }) });
  check('B1g anon 直调 /rpc/analytics_overview → 401/404（revoke 实证）', [401, 404].includes(rAnon1.status), `HTTP ${rAnon1.status}`);
  const rAnon2 = await fetch(`${SB}/rest/v1/rpc/analytics_purge_90d`, { method: 'POST', headers: ANON_H, body: '{}' });
  check('B1h anon 直调 /rpc/analytics_purge_90d → 401/404（revoke 实证）', [401, 404].includes(rAnon2.status), `HTTP ${rAnon2.status}`);

  // ---- B2 数据正确性（5 条受控事件逐字断言） ----
  // B2a 前置：窗口内无非测试真实事件（埋点 2026-09-22 上线，窗口截至 北京 9-22 00:00）
  const pre = await svcRest('GET', `/rest/v1/analytics_events?select=id&ts=gte.${T_START}&ts=lt.${T_END}&props->>test=is.null`);
  const preCount = Array.isArray(pre.body) ? pre.body.length : -1;
  if (preCount !== 0) {
    blocked('B2a 测试窗口无真实事件（前置）', `窗口内非测试行=${preCount}，窗口设计被污染，B2 断言不可信，报运营定夺`);
    blocked('B2 数据正确性全段', '依赖 B2a');
  } else {
    check('B2a 测试窗口无非测试事件（前置钉死，断言可信）', true);
    const rows = [
      // 北京 9-21 00:30 —— UTC 属 9-20，东八区必须落 9-21 日桶（时区子弹）
      { event: 'page_view', page: 'index:dashboard', ts: '2026-09-20T16:30:00Z', uid: null, vid: 't55-v1', ip_h: 'a'.repeat(64), ref_dom: null, props: { test: 't55' } },
      // 北京 9-21 01:00，登录用户（uid 口径）
      { event: 'page_view', page: 'index:members', ts: '2026-09-20T17:00:00Z', uid: adminUid, vid: null, ip_h: 'b'.repeat(64), ref_dom: null, props: { test: 't55' } },
      // 北京 9-21 10:00，登录墙（nav 必须剔除）
      { event: 'page_view', page: 'index:login', ts: '2026-09-21T02:00:00Z', uid: null, vid: 't55-v2', ip_h: 'c'.repeat(64), ref_dom: null, props: { test: 't55' } },
      // 北京 9-21 11:00，家宅公示
      { event: 'page_view', page: 'decor', ts: '2026-09-21T03:00:00Z', uid: null, vid: 't55-v3', ip_h: 'd'.repeat(64), ref_dom: null, props: { test: 't55' } },
      // 北京 9-21 12:00，掉落公示，带来源域（与 r2 同 uid → uv 去重子弹）
      { event: 'page_view', page: 'data', ts: '2026-09-21T04:00:00Z', uid: adminUid, vid: null, ip_h: 'e'.repeat(64), ref_dom: 't55.example.com', props: { test: 't55' } },
    ];
    let inserted = true;
    for (const row of rows) { const r = await svcRest('POST', '/rest/v1/analytics_events', row); if (r.status !== 201) inserted = false; }
    check('B2b 受控事件 5 行入库（service_role 直插）', inserted && (await svcRest('GET', `/rest/v1/analytics_events?select=id&props->>test=eq.t55`)).body.length === 5);

    const q1 = await postSummary(adminToken, VALID);
    const s = q1.body || {};
    const buckets = (s.series || []).map(b => b.bucket);
    const pvs = (s.series || []).map(b => b.pv);
    const uvs = (s.series || []).map(b => b.uv);
    check('B2c 时区实证：UTC 9-20T16:30 落北京 9-21 日桶（三日桶 pv=[0,5,0]，UTC 切日则歪到 9-20）',
      JSON.stringify(buckets) === JSON.stringify(['2026-09-20T00:00:00+08:00', '2026-09-21T00:00:00+08:00', '2026-09-22T00:00:00+08:00']) &&
      JSON.stringify(pvs) === '[0,5,0]' && JSON.stringify(uvs) === '[0,4,0]',
      `buckets=${JSON.stringify(buckets)} pv=${JSON.stringify(pvs)} uv=${JSON.stringify(uvs)}`);
    check('B2d 补零桶实证：首末桶零事件仍出桶（折线不断）', pvs[0] === 0 && pvs[2] === 0 && (s.series || []).length === 3);
    check('B2e cards：pv=5 / uv=4（uid 去重子弹）/ dau_avg=round((0+4+0)/3)=1',
      s.cards && s.cards.pv === 5 && s.cards.uv === 4 && s.cards.dau_avg === 1, `cards=${JSON.stringify(s.cards)}`);
    const nav = s.nav || [];
    check('B2f nav：dashboard/members 各 1 次 1 人双口径，index:login 剔除',
      nav.length === 2 && nav.every(t => (t.page === 'index:dashboard' || t.page === 'index:members') && t.clicks === 1 && t.people === 1),
      `nav=${JSON.stringify(nav)}`);
    const pages = s.pages || [];
    check('B2g pages：五页面全列（含 decor/data/index:login）各 pv=1',
      pages.length === 5 && pages.every(p => p.pv === 1 && p.uv === 1) && ['decor', 'data', 'index:login', 'index:dashboard', 'index:members'].every(p => pages.some(x => x.page === p)),
      `pages=${JSON.stringify(pages)}`);
    const refs = s.refs || [];
    check('B2h refs：直接访问 pv=4/uv=4 居首 + t55.example.com pv=1',
      refs.length === 2 && refs[0].ref_dom === '直接访问' && refs[0].pv === 4 && refs[0].uv === 4 &&
      refs[1].ref_dom === 't55.example.com' && refs[1].pv === 1,
      `refs=${JSON.stringify(refs)}`);
    const evs = s.events || [];
    check('B2i events：page_view cnt=5', evs.length === 1 && evs[0].event === 'page_view' && evs[0].cnt === 5, `events=${JSON.stringify(evs)}`);

    const q2 = await postSummary(adminToken, { start: '2026-09-20T16:00:00Z', end: '2026-09-21T16:00:00Z', grain: 'hour', page: 'all' });
    const hs = (q2.body && q2.body.series) || [];
    const h00 = hs.find(b => b.bucket === '2026-09-21T00:00:00+08:00');
    const hMid = hs.find(b => b.bucket === '2026-09-21T05:00:00+08:00');
    check('B2j 小时粒度：25 桶（北京 9-21 00:00~9-22 00:00）+ 逐时落点准 + 中间空桶补零',
      hs.length === 25 && h00 && h00.pv === 1 && hMid && hMid.pv === 0 && hs.reduce((a, b) => a + b.pv, 0) === 5,
      `桶数=${hs.length} 00时pv=${h00 && h00.pv} 05时pv=${hMid && hMid.pv}`);

    const qIdx = await postSummary(adminToken, { ...VALID, page: 'index' });
    const qDecor = await postSummary(adminToken, { ...VALID, page: 'decor' });
    const qSub = await postSummary(adminToken, { ...VALID, page: 'index:members' });
    check('B2k 页面筛选三态：index=主站整壳 pv=3 / decor 精确 pv=1 / index:members 单子页 pv=1',
      qIdx.body && qIdx.body.cards.pv === 3 && qDecor.body && qDecor.body.cards.pv === 1 && qSub.body && qSub.body.cards.pv === 1 && qSub.body.cards.uv === 1,
      `index=${qIdx.body && qIdx.body.cards.pv} decor=${qDecor.body && qDecor.body.cards.pv} members=${qSub.body && qSub.body.cards.pv}`);
  }

  // ---- B3 90 天滚动清理 ----
  const old = await svcRest('POST', '/rest/v1/analytics_events',
    { event: 'page_view', page: 'decor', ts: '2026-06-01T00:00:00Z', uid: null, vid: 't55-old', ip_h: 'f'.repeat(64), ref_dom: null, props: { test: 't55' } });
  const purged = await svcRest('POST', '/rest/v1/rpc/analytics_purge_90d', {});
  const oldGone = await svcRest('GET', `/rest/v1/analytics_events?select=id&vid=eq.t55-old`);
  const kept = await svcRest('GET', `/rest/v1/analytics_events?select=id&props->>test=eq.t55`);
  check('B3 手动 purge：91 天前旧行删除（返回行数 ≥1）+ 窗口内近行全保留',
    old.status === 201 && purged.status === 200 && Number(purged.body) >= 1 &&
    Array.isArray(oldGone.body) && oldGone.body.length === 0 &&
    Array.isArray(kept.body) && kept.body.length === 5,
    `purge返回=${JSON.stringify(purged.body)} 旧行残留=${Array.isArray(oldGone.body) ? oldGone.body.length : '?'} 近行=${Array.isArray(kept.body) ? kept.body.length : '?'}`);

  // ---- B4 限流（末位跑，额度 30/分） ----
  let n200 = 0, n429 = 0;
  for (let i = 0; i < 40; i++) {
    const r = await postSummary(adminToken, VALID);
    if (r.status === 200) n200++;
    if (r.status === 429) n429++;
  }
  check('B4 限流：同 uid 30 次/分——连发 40 次出现 429 且不全是 429',
    n429 >= 1 && n200 >= 1, `200×${n200} 429×${n429}`);
}

// ==================== C 清零 ====================
async function cleanupAsserts() {
  await svcRest('DELETE', `/rest/v1/analytics_events?props->>test=eq.t55`);
  const left = await svcRest('GET', `/rest/v1/analytics_events?select=id&props->>test=eq.t55`);
  check('C1 测试事件清零复核（props->>test=t55 零残留）',
    left.status === 200 && Array.isArray(left.body) && left.body.length === 0,
    `残留=${Array.isArray(left.body) ? left.body.length : '?'}`);
  const list = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=200');
  const users = (list.body && (list.body.users || list.body)) || [];
  for (const u of (Array.isArray(users) ? users : [])) {
    if ([ADMIN_EMAIL, USER_EMAIL].includes((u.email || '').toLowerCase())) await deleteTestUser(u.id);
  }
  const list2 = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=200');
  const users2 = (list2.body && (list2.body.users || list2.body)) || [];
  const gone = !users2.some(u => [ADMIN_EMAIL, USER_EMAIL].includes((u.email || '').toLowerCase()));
  check('C2 双测试用户清理复核', gone);
}

// ==================== 主流程 ====================
(async () => {
  staticAsserts();
  try {
    await liveAsserts();
  } catch (e) {
    check('B 段异常捕获（不假绿）', false, e.message);
  } finally {
    if (serverProc) serverProc.kill();
  }
  try {
    await cleanupAsserts();
  } catch (e) {
    check('C 清零异常', false, e.message);
  }
  const pass = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok && !r.blocked).length;
  const blk = results.filter(r => r.blocked).length;
  console.log(`\n========== 合计 ${pass}/${results.length} 通过，${fail} 红，${blk} 阻塞 ==========`);
  process.exit(fail === 0 && blk === 0 ? 0 : 1);
})();
