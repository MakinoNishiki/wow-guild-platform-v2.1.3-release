// 任务书 #54 WP1 验证：全站埋点采集层（REQ-141）
// A 静态：sql/33 锚点、server.js /api/track 锚点、track.js 锚点、三壳引用行、版本串 .70 计数+旧串零残留、node --check
// B 实测（自起服务器，service_role 仅用于断言与清理）：
//   B0 迁移闸——analytics_events 不在场则 B/C 全段 ⏸ 阻塞（非假绿），退出码非零；
//   B1 合法 page_view → 204 + 行在场（ip_h 非空/uid null）；B2 非法 event → 204 零入库；B3 超大 props → 204 零入库；
//   B4 浏览器真跑 decor.html → 自动 PV 行（vid 持久二次访问相同）；B5 登录→切考勤→index:attendance 行带 uid；退出后公示页 uid 回 null
// C 清零：全部 t54 测试事件行删除复核零残留 + 测试用户/公会清理
// 用法: node scripts/verify-task54.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15654;
const BASE = `http://127.0.0.1:${PORT}`;
const VER_NEW = '20260919.70';
const VER_OLD = '20260919.69';
const PWD = 'T54-Track-2026!';
const TEST_EMAIL = 't54-track@example.com';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
const ANON_H = { apikey: ANON, Authorization: `Bearer ${ANON}` };

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

// service_role 轮询查行（写库经代理异步，允许短暂延迟）
async function svcQueryRows(query, { tries = 10, interval = 400, min = 1 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = await svcRest('GET', `/rest/v1/analytics_events?${query}`);
    if (r.status === 200 && Array.isArray(r.body) && r.body.length >= min) return r.body;
    await sleep(interval);
  }
  const r = await svcRest('GET', `/rest/v1/analytics_events?${query}`);
  return (r.status === 200 && Array.isArray(r.body)) ? r.body : [];
}

async function postTrack(payload, rawOverride) {
  const res = await fetch(`${BASE}/api/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawOverride !== undefined ? rawOverride : JSON.stringify(payload),
  });
  return res.status;
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
  const sql = fs.readFileSync(path.join(ROOT, 'sql', '33_task054_analytics_events.sql'), 'utf8');
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const track = fs.readFileSync(path.join(ROOT, 'js', 'track.js'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const decor = fs.readFileSync(path.join(ROOT, 'decor.html'), 'utf8');
  const data = fs.readFileSync(path.join(ROOT, 'data.html'), 'utf8');

  // A1 sql/33 锚点
  check('A1a sql/33 建表 analytics_events（identity 主键/9 列）',
    /create table if not exists public\.analytics_events/i.test(sql) &&
    /bigint generated always as identity primary key/i.test(sql) &&
    /uid\s+uuid/i.test(sql) && /ip_h\s+text/i.test(sql) && /props\s+jsonb/i.test(sql));
  check('A1b sql/33 三索引（ts/event/page）',
    /idx_analytics_events_ts/i.test(sql) && /idx_analytics_events_event/i.test(sql) && /idx_analytics_events_page/i.test(sql));
  check('A1c sql/33 RLS 启用（零策略=仅 service_role 可写可查）',
    /alter table public\.analytics_events enable row level security/i.test(sql));
  check('A1d sql/33 回滚注释 + NOTIFY pgrst 在场',
    /DROP TABLE IF EXISTS public\.analytics_events/i.test(sql) && /NOTIFY pgrst, 'reload schema';/.test(sql));

  // A2 server.js 端点锚点
  check('A2a 白名单常量 TRACK_EVENTS = ["page_view"]（顶部一处维护）',
    /const TRACK_EVENTS = \["page_view"\]/.test(server));
  check('A2b page 格式校验正则 /^(decor|data|index:[a-z]+)$/',
    server.includes('const TRACK_PAGE_RE = /^(decor|data|index:[a-z]+)$/;'));
  check('A2c ip_h = sha256(ip|YYYYMMDD|TRACK_SALT||wb-track)（明文 IP 不落库）',
    /createHash\("sha256"\)/.test(server) && /TRACK_SALT \|\| "wb-track"/.test(server));
  check('A2d 限流：同 IP ≤60/分钟 滑动窗口（进程内 Map）',
    /TRACK_RATE_LIMIT_PER_MIN = 60/.test(server) && /trackRateBuckets = new Map/.test(server));
  check('A2e 恒 204 + service_role POST /rest/v1/analytics_events + 异常 console.error 不 500',
    /urlPath === "\/api\/track" && req\.method === "POST"/.test(server) &&
    /res\.writeHead\(204, corsHeaders\)/.test(server) &&
    /"\/rest\/v1\/analytics_events"/.test(server) &&
    /\[track\] 埋点端点异常/.test(server));
  check('A2f 白名单列组装行（event/page/uid/vid/ip_h/ref_dom/props 七键）',
    /const row = \{\s*event: body\.event,\s*page: body\.page,\s*uid,\s*vid:[\s\S]*?ip_h: trackIpHash\(ip\),\s*ref_dom:[\s\S]*?props,\s*\};/.test(server));

  // A3 track.js 锚点
  check('A3a vid = localStorage wb_vid + crypto.randomUUID（降级拼接）',
    /wb_vid/.test(track) && /randomUUID/.test(track) && /Date\.now\(\)\.toString\(36\)/.test(track));
  check('A3b page 推导三分支（decor.html/data.html/index:dashboard 起始）',
    /indexOf\("decor\.html"\)/.test(track) && /indexOf\("data\.html"\)/.test(track) && /return "index:dashboard"/.test(track));
  check('A3c sendBeacon 优先 + fetch keepalive 兜底',
    /navigator\.sendBeacon\(\s*"\/api\/track"/.test(track) && /keepalive: true/.test(track));
  check('A3d switchPage 包装（判存在性+幂等+原函数执行后上报 index:<key>）',
    /typeof window\.switchPage !== "function"\) return/.test(track) &&
    /__wbTrackWrapped/.test(track) &&
    /orig\.apply\(this, arguments\)/.test(track) &&
    /reportPageView\("index:" \+ pageName\)/.test(track));
  check('A3e 静默兜底（try/catch 全链路）+ uid 读 window.__wbUid + ref_dom 只取 hostname',
    /window\.__wbUid \|\| null/.test(track) && /new URL\(document\.referrer\)\.hostname/.test(track) &&
    (track.match(/catch/g) || []).length >= 8);
  check('A3f 全局 WBTrack + event(name, props) API + 加载完成自动上报一次 PV',
    /window\.WBTrack = \{/.test(track) && /event: function \(name, props\)/.test(track) &&
    /DOMContentLoaded", boot\)/.test(track) && /reportPageView\(\);/.test(track));

  // A4 三壳引用行（track.js 在各自最后一条业务 script 之后）
  const idxScripts = [...index.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  check('A4a index.html：track.js 紧随 app.js 之后',
    idxScripts.findIndex(s => s.startsWith('js/track.js')) === idxScripts.findIndex(s => s.startsWith('js/app.js')) + 1,
    idxScripts.filter(s => s.startsWith('js/')).join(', '));
  const decorScripts = [...decor.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  check('A4b decor.html：track.js 紧随 decorData.js 之后（末位）',
    decorScripts.length === 3 && decorScripts[2].startsWith('js/track.js'), decorScripts.join(', '));
  const dataScripts = [...data.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  check('A4c data.html：track.js 紧随 dataPublic.js 之后（末位）',
    dataScripts[dataScripts.length - 1].startsWith('js/track.js'), dataScripts.join(', '));

  // A5 版本串三壳 .70 计数 + 旧串零残留
  const countStr = (s, v) => (s.match(new RegExp(v.replace(/\./g, '\\.'), 'g')) || []).length;
  check(`A5a index.html 版本串 ${VER_NEW} ×15（14 旧引用+新增 track.js 引用行）`,
    countStr(index, VER_NEW) === 15, `实际=${countStr(index, VER_NEW)}`);
  check(`A5b decor.html 版本串 ${VER_NEW} ×6`, countStr(decor, VER_NEW) === 6, `实际=${countStr(decor, VER_NEW)}`);
  check(`A5c data.html 版本串 ${VER_NEW} ×8`, countStr(data, VER_NEW) === 8, `实际=${countStr(data, VER_NEW)}`);
  check(`A5d 旧串 ${VER_OLD} 三壳零残留`,
    countStr(index, VER_OLD) === 0 && countStr(decor, VER_OLD) === 0 && countStr(data, VER_OLD) === 0);
  check('A5e 三壳全部 ?v= 一致为 .70（无异版本串；只查 ?v=数字 真实引用，注释文字不算）', [index, decor, data].every(
    s => !(new RegExp('\\?v=(?!' + VER_NEW.replace(/\./g, '\\.') + ')\\d')).test(s)));

  // A6 语法检查 + 静态安全回归
  for (const f of ['server.js', 'js/track.js', 'js/app.js', 'scripts/verify-task54.js']) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    check('A6 node --check ' + f, r.status === 0, r.status === 0 ? '' : r.stderr.trim().split('\n')[0]);
  }
  const t = spawnSync(process.execPath, ['--test', 'test/server-security.test.js'], { cwd: ROOT, encoding: 'utf8' });
  check('A7 node --test server-security 回归（静态边界零行为变更）',
    t.status === 0, (t.stdout.match(/# pass \d+/) || [''])[0]);
}

// ==================== B 实测 ====================
async function liveAsserts() {
  await startServer();
  console.log('--- 服务器已起（端口 ' + PORT + '） ---');

  // B0 迁移闸：表不在场 → B/C 全段阻塞申报（不假绿）
  const probe = await svcRest('GET', '/rest/v1/analytics_events?select=id&limit=1');
  if (probe.status !== 200) {
    blocked('B0 analytics_events 表在场（sql/33 已执行）',
      `REST 探测 HTTP ${probe.status}——迁移未执行，B/C 段全阻塞，先执行 sql/33 再复跑本脚本`);
    for (const n of ['B1 合法 page_view 入库', 'B2 非法 event 零入库', 'B3 超大 props 零入库',
      'B4 浏览器 decor.html 自动 PV + vid 持久', 'B5 登录切考勤 uid 溯源 + 退出后 uid 回 null',
      'C 清零复核零残留']) blocked(n, '依赖 B0');
    return;
  }
  check('B0a analytics_events 表在场（service_role 可查）', true);
  // B0b RLS 实证：anon 查 0 行（零策略=不可见）
  const anonProbe = await fetch(`${SB}/rest/v1/analytics_events?select=id&limit=5`, { headers: ANON_H });
  const anonRows = await anonProbe.json().catch(() => null);
  check('B0b RLS 实证：anon 查询 0 行（零策略全拒读）',
    anonProbe.status === 200 && Array.isArray(anonRows) && anonRows.length === 0,
    `HTTP ${anonProbe.status} 行数=${Array.isArray(anonRows) ? anonRows.length : '?'}`);

  // B1 合法 page_view → 204 + 行在场（ip_h 非空、uid null）
  const st1 = await postTrack({ event: 'page_view', page: 'decor', vid: 't54-vid-curl-1', props: { test: 't54' } });
  const rows1 = await svcQueryRows('select=*&vid=eq.t54-vid-curl-1');
  check('B1 合法 POST → 204 + 行在场（page=decor / ip_h 64 位 hex / uid=null / props 透传）',
    st1 === 204 && rows1.length === 1 && rows1[0].page === 'decor' &&
    /^[0-9a-f]{64}$/.test(rows1[0].ip_h || '') && rows1[0].uid === null &&
    rows1[0].props && rows1[0].props.test === 't54',
    `HTTP ${st1} 行数=${rows1.length}`);

  // B2 非法 event → 204 零入库
  const st2 = await postTrack({ event: 'hack', page: 'decor', vid: 't54-vid-hack', props: { test: 't54' } });
  await sleep(800);
  const rows2 = await svcQueryRows('select=id&vid=eq.t54-vid-hack', { tries: 1, min: 0 });
  check('B2 非法 event（hack）→ 204 但零入库', st2 === 204 && rows2.length === 0, `HTTP ${st2} 行数=${rows2.length}`);

  // B3 超大 props（>2KB）→ 204 零入库
  const st3 = await postTrack({ event: 'page_view', page: 'data', vid: 't54-vid-big', props: { test: 't54', pad: 'x'.repeat(3000) } });
  await sleep(800);
  const rows3 = await svcQueryRows('select=id&vid=eq.t54-vid-big', { tries: 1, min: 0 });
  check('B3 超大 props（>2KB）→ 204 零入库', st3 === 204 && rows3.length === 0, `HTTP ${st3} 行数=${rows3.length}`);

  // B4 浏览器真跑 decor.html：自动 PV + vid 持久（二次访问相同）
  const browser = await chromium.launch({ headless: true });
  const ctx4 = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'zh-CN' });
  const pg4 = await ctx4.newPage();
  const errs4 = [];
  pg4.on('pageerror', e => errs4.push('pageerror: ' + e.message));
  pg4.on('console', m => { if (m.type() === 'error') errs4.push('console: ' + m.text()); });
  await pg4.goto(`${BASE}/decor.html`, { waitUntil: 'load' });
  const vid4 = await pg4.evaluate(() => localStorage.getItem('wb_vid'));
  const rows4 = await svcQueryRows(`select=*&vid=eq.${encodeURIComponent(vid4)}&page=eq.decor`, { min: 1 });
  await pg4.reload({ waitUntil: 'load' });
  const vid4b = await pg4.evaluate(() => localStorage.getItem('wb_vid'));
  const rows4b = await svcQueryRows(`select=id&vid=eq.${encodeURIComponent(vid4)}&page=eq.decor`, { min: 2 });
  check('B4 浏览器 decor.html 自动 page_view 入库（vid 持久二次访问相同、ref_dom=null 直访、控制台零报错）',
    !!vid4 && vid4 === vid4b && rows4.length >= 1 && rows4b.length >= 2 &&
    rows4[0].ref_dom === null && errs4.length === 0,
    `vid=${vid4} 行数=${rows4.length}/${rows4b.length} 报错=${errs4.length}`);

  // B5 index 壳：登录测试用户 → 切考勤页 → index:attendance 行带 uid；退出后公示页 uid 回 null
  // 准备测试用户+公会（service_role，C 段清理）
  await svcRest('POST', '/auth/v1/admin/users', { email: TEST_EMAIL, password: PWD, email_confirm: true, user_metadata: { display_name: 't54-track' } });
  const li = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: PWD }),
  });
  const lb = await li.json();
  const testUid = lb.user && lb.user.id;
  if (!testUid) throw new Error('测试用户登录失败: ' + JSON.stringify(lb).slice(0, 200));
  const g = await svcRest('POST', '/rest/v1/guilds', { name: 'T54埋点测试公会', owner_id: testUid, invite_code: 'T54TRACK', server_name: '测试', server_region: '一区' });
  const guildId = g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: testUid, role: 'owner', display_name: 't54-track' }]);

  const ctx5 = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'zh-CN' });
  const pg5 = await ctx5.newPage();
  const errs5 = [];
  const badNet5 = []; // 4xx/5xx 带方法+URL 精确取证（console 的 resource 报错只是其回显）
  pg5.on('pageerror', e => errs5.push('pageerror: ' + e.message));
  pg5.on('console', m => { if (m.type() === 'error') errs5.push('console: ' + m.text()); });
  pg5.on('response', r => { if (r.status() >= 400) badNet5.push(`http${r.status()} ${r.request().method()} ${r.url()}`); });
  await pg5.goto(`${BASE}/`, { waitUntil: 'load' });
  await pg5.fill('#authEmail', TEST_EMAIL);
  await pg5.fill('#authPassword', PWD);
  await pg5.click('#authLoginBtn');
  await pg5.waitForSelector('.nav-item[data-page="attendance"]', { state: 'visible', timeout: 30000 });
  const uidInPage = await pg5.evaluate(() => window.__wbUid || null);
  await pg5.click('.nav-item[data-page="attendance"]');
  await sleep(500);
  const rows5 = await svcQueryRows(`select=*&page=eq.index:attendance&uid=eq.${testUid}`, { min: 1 });
  check('B5a 登录→切考勤页 → index:attendance 行 uid=测试用户 id（__wbUid 授权行①生效）',
    uidInPage === testUid && rows5.length >= 1 && rows5[0].uid === testUid,
    `__wbUid=${uidInPage} 行数=${rows5.length}`);

  // 退出登录（头像菜单 → 退出登录）
  await pg5.click('#userAvatar');
  await pg5.click('.user-menu-item-danger');
  await pg5.waitForSelector('#authEmail', { state: 'visible', timeout: 15000 });
  const uidAfterOut = await pg5.evaluate(() => window.__wbUid === undefined ? 'undefined' : window.__wbUid);
  // 退出后开公示页（同上下文新标签）：uid 必须为 null
  const pg5b = await ctx5.newPage();
  await pg5b.goto(`${BASE}/decor.html`, { waitUntil: 'load' });
  const vid5 = await pg5b.evaluate(() => localStorage.getItem('wb_vid'));
  const rows5b = await svcQueryRows(`select=*&vid=eq.${encodeURIComponent(vid5)}&page=eq.decor`, { min: 1 });
  // 已知噪音白名单（终审钉点⑧精度版）：只滤「POST /rest/v1/user_profiles 的 409」
  // （ensureTagNum 撞号重试，cloud.js:297-309 设计内 23505→HTTP409→重试成功，与本任务零交集），
  // console 侧的 "status of 409" 资源回显按命中条数逐条配对滤除——其他 4xx/409/该域其他状态码一律照红。
  const NET_409_PROFILES = /^http409 POST https:\/\/[^/]+\/rest\/v1\/user_profiles$/;
  const allowedNet = badNet5.filter(e => NET_409_PROFILES.test(e));
  const badNet5Real = badNet5.filter(e => !NET_409_PROFILES.test(e));
  let echoBudget = allowedNet.length;
  const errs5Real = errs5.filter(e => {
    if (echoBudget > 0 && e === 'console: Failed to load resource: the server responded with a status of 409 ()') {
      echoBudget--;
      return false;
    }
    return true;
  });
  check('B5b 退出登录（授权行②清空）后再开公示页 → uid 回 null',
    (uidAfterOut === null || uidAfterOut === 'null') && rows5b.length >= 1 && rows5b[0].uid === null &&
    badNet5Real.length === 0 && errs5Real.length === 0,
    `退出后 __wbUid=${uidAfterOut} 公示页行 uid=${rows5b[0] && rows5b[0].uid} 真实网络4xx=${badNet5Real.join(' | ') || 0} 真实报错=${errs5Real.join(' | ').slice(0, 200) || 0}（白名单滤除 ${allowedNet.length} 条精确匹配=POST user_profiles 409 及其回显）`);

  await browser.close();

  // ==================== C 清零 ====================
  const vids = ['t54-vid-curl-1', 't54-vid-hack', 't54-vid-big', vid4, vid5].filter(Boolean);
  await svcRest('DELETE', `/rest/v1/analytics_events?vid=in.(${vids.map(v => `"${v}"`).join(',')})`);
  await svcRest('DELETE', `/rest/v1/analytics_events?props->>test=eq.t54`);
  const left = await svcQueryRows('select=id&props->>test=eq.t54', { tries: 1, min: 0 });
  const left2 = await svcQueryRows(`select=id&vid=in.(${vids.map(v => `"${v}"`).join(',')})`, { tries: 1, min: 0 });
  // 测试公会/用户清理（先成员行后公会；auth 用户删除）
  await svcRest('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
  await svcRest('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
  await svcRest('DELETE', `/auth/v1/admin/users/${testUid}`);
  const userGone = await svcRest('GET', `/auth/v1/admin/users/${testUid}`);
  check('C 清零：全部 t54 测试事件行删除 + 复核零残留 + 测试用户/公会已清理',
    left.length === 0 && left2.length === 0 && (userGone.status === 404 || (userGone.body && userGone.body.code)),
    `残留=${left.length + left2.length} 用户查询 HTTP ${userGone.status}`);
}

(async () => {
  console.log('===== A 静态断言 =====');
  staticAsserts();
  console.log('===== B 实测（自起服务器 + 真浏览器） =====');
  try {
    await liveAsserts();
  } catch (e) {
    check('B 段执行异常', false, e.message);
  } finally {
    if (serverProc) serverProc.kill();
  }
  const pass = results.filter(r => r.ok).length;
  const blk = results.filter(r => r.blocked).length;
  console.log(`\n===== 汇总：${pass}/${results.length} 通过${blk ? `（其中 ${blk} 项阻塞=迁移未执行）` : ''} =====`);
  process.exit(pass === results.length ? 0 : 1);
})();
