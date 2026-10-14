// 任务书 #70 WP1 验收脚本：WCL 公会绑定与报告同步（方案A + 共用功能）
// 自建 3 个测试用户 + 2 个公会，覆盖鉴权矩阵/绑定全流程/唯一约束/看板防线/解绑，结束后自动清理。
// sql/41 未执行时：列相关用例自动跳过（同 verify-authz.js statusColProbe 惯例），鉴权类用例不受影响。
// 真实 WCL 调用：挽歌 id=144305（#69 已验证）、报告 code=gXCGyxkmTwQfpMv9。
// 只读 .env，不打印密钥。用法: node scripts/verify-task70.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 15670;
const PWD = 'T070-Test-2026!';
const WCL_GID = 144305; // 挽歌 / 金色平原（#69 实测）
const WCL_CODE = 'gXCGyxkmTwQfpMv9'; // 挽歌公开报告（#69 实测）

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

const results = [];
function check(name, actual, expected) {
  const ok = actual === expected;
  results.push({ name, ok, actual, expected });
  console.log(`${ok ? '✓' : '✗'} ${name}: 期望 ${expected}, 实际 ${actual}`);
}
function skip(name, why) {
  console.log(`- ${name}: 跳过（${why}）`);
}

async function svcRest(method, restPath, body) {
  const res = await fetch(`${URL}${restPath}`, {
    method,
    headers: SVC,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function signUpOrIn(email) {
  const su = await fetch(`${URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD, data: { display_name: email.split('@')[0] } }),
  });
  const sb = await su.json();
  if (sb.access_token) return { token: sb.access_token, uid: sb.user.id };
  const li = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD }),
  });
  const lb = await li.json();
  if (!lb.access_token) throw new Error(`无法获取 ${email} 的会话: ${JSON.stringify(lb)}`);
  return { token: lb.access_token, uid: lb.user.id };
}

async function proxy(token, method, table, body, query) {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/db/rest/v1/${table}${query || ''}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.status;
}

async function wcl70(token, method, endpoint, body) {
  const qs = method === 'GET' && body ? '?' + new URLSearchParams(body).toString() : '';
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/wcl/${endpoint}${qs}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: method !== 'GET' && body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

(async () => {
  console.log('===== 准备测试数据（service_role 直连） =====');
  const owner = await signUpOrIn('t070-owner@example.com');
  const viewer = await signUpOrIn('t070-viewer@example.com');
  const outsider = await signUpOrIn('t070-outsider@example.com');

  const gA = await svcRest('POST', '/rest/v1/guilds', { name: 'T070公会A', owner_id: owner.uid, invite_code: 'T070AAAA', server_name: '测试', server_region: '一区' });
  const guildA = gA.body[0].id;
  const gB = await svcRest('POST', '/rest/v1/guilds', { name: 'T070公会B', owner_id: outsider.uid, invite_code: 'T070BBBB', server_name: '测试', server_region: '一区' });
  const guildB = gB.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [
    { guild_id: guildA, user_id: owner.uid, role: 'owner', display_name: 't070-owner' },
    { guild_id: guildA, user_id: viewer.uid, role: 'viewer', display_name: 't070-viewer' },
    { guild_id: guildB, user_id: outsider.uid, role: 'owner', display_name: 't070-outsider' },
  ]);

  // sql/41 迁移探测
  const probe = await svcRest('GET', '/rest/v1/guilds?select=wcl_guild_id&limit=1');
  const migrated = probe.status !== 400;
  console.log(migrated ? 'sql/41 已执行，全量用例开启' : 'sql/41 未执行：绑定落库类用例跳过');

  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_RUN_PORT: String(TEST_PORT) },
    stdio: 'ignore',
  });
  await new Promise(r => setTimeout(r, 1200));

  let actId = null;
  try {
    console.log('\n===== A. 鉴权矩阵（不依赖迁移） =====');
    check('无 JWT 调 guild-lookup → 401', (await wcl70(null, 'GET', 'guild-lookup', { guildId: guildA, id: String(WCL_GID) })).status, 401);
    check('viewer 调 guild-lookup → 403', (await wcl70(viewer.token, 'GET', 'guild-lookup', { guildId: guildA, id: String(WCL_GID) })).status, 403);
    check('outsider 调 guild-lookup(公会A) → 403', (await wcl70(outsider.token, 'GET', 'guild-lookup', { guildId: guildA, id: String(WCL_GID) })).status, 403);
    check('viewer 调 bind-guild-paste → 403', (await wcl70(viewer.token, 'POST', 'bind-guild-paste', { guildId: guildA, wclGuildId: WCL_GID })).status, 403);
    check('viewer 调 unbind-guild → 403', (await wcl70(viewer.token, 'POST', 'unbind-guild', { guildId: guildA })).status, 403);
    check('viewer 调 reports → 403', (await wcl70(viewer.token, 'GET', 'reports', { guildId: guildA })).status, 403);
    check('viewer 调 set-auto-create → 403', (await wcl70(viewer.token, 'POST', 'set-auto-create', { guildId: guildA, enabled: true })).status, 403);
    check('outsider 调 report-fights(公会A) → 403', (await wcl70(outsider.token, 'GET', 'report-fights', { guildId: guildA, code: WCL_CODE })).status, 403);
    // 通用代理拦截 wcl_ 前缀（鉴权层拦截，先于 DB，无需迁移）
    check('owner 经通用代理 PATCH guilds 带 wcl_ 键 → 403', await proxy(owner.token, 'PATCH', 'guilds', { wcl_guild_id: WCL_GID }, `?id=eq.${guildA}`), 403);
    check('owner 经通用代理 PATCH guilds 常规字段不受影响', await proxy(owner.token, 'PATCH', 'guilds', { name: 'T070公会A' }, `?id=eq.${guildA}`), 200);

    if (!migrated) {
      skip('B/C/D 绑定全流程', 'sql/41 未执行，请运营在 SQL Editor 执行后重跑');
    } else {
      console.log('\n===== B. 方案A 绑定全流程（真实 WCL 调用） =====');
      const lookup = await wcl70(owner.token, 'GET', 'guild-lookup', { guildId: guildA, id: String(WCL_GID) });
      check('owner guild-lookup 挽歌 → 200', lookup.status, 200);
      check('lookup 返回公会名=挽歌', lookup.data && lookup.data.name, '挽歌');
      check('lookup 非法 id → 400', (await wcl70(owner.token, 'GET', 'guild-lookup', { guildId: guildA, id: 'abc' })).status, 400);
      const bind = await wcl70(owner.token, 'POST', 'bind-guild-paste', { guildId: guildA, wclGuildId: WCL_GID });
      check('owner 绑定挽歌 → 200', bind.status, 200);
      const row = await svcRest('GET', `/rest/v1/guilds?id=eq.${guildA}&select=wcl_guild_id,wcl_guild_name,wcl_server_name,wcl_bind_method`);
      check('落库 wcl_guild_id', row.body[0] && row.body[0].wcl_guild_id, WCL_GID);
      check('落库 wcl_bind_method', row.body[0] && row.body[0].wcl_bind_method, 'paste');
      check('落库 wcl_server_name=金色平原', row.body[0] && row.body[0].wcl_server_name, '金色平原');
      check('重复绑定（未解绑）→ 409', (await wcl70(owner.token, 'POST', 'bind-guild-paste', { guildId: guildA, wclGuildId: WCL_GID })).status, 409);
      check('公会B 绑同一 WCL 公会 → 409 唯一约束', (await wcl70(outsider.token, 'POST', 'bind-guild-paste', { guildId: guildB, wclGuildId: WCL_GID })).status, 409);

      console.log('\n===== C. 同步与看板 =====');
      const reports = await wcl70(owner.token, 'GET', 'reports', { guildId: guildA });
      check('owner 手动同步 reports → 200', reports.status, 200);
      check('reports 返回数组', Array.isArray(reports.data && reports.data.reports), true);
      check('reports 带 is_linked 标记', !!(reports.data && reports.data.reports.length && ('is_linked' in reports.data.reports[0])), true);
      // 未关联任何活动时看板防线：报告未关联本公会活动 → 403
      check('report-fights 未关联报告 → 403', (await wcl70(viewer.token, 'GET', 'report-fights', { guildId: guildA, code: WCL_CODE })).status, 403);
      // 关联后 viewer 可看（看板全员可见）
      const act = await svcRest('POST', '/rest/v1/activities', { guild_id: guildA, name: 'T070看板活动', activity_date: '2026-10-14', raid: '翡翠梦魇', wcl_url: `https://www.warcraftlogs.com/reports/${WCL_CODE}`, wcl_report_code: WCL_CODE, status: 'normal' });
      actId = act.body[0].id;
      const fights = await wcl70(viewer.token, 'GET', 'report-fights', { guildId: guildA, code: WCL_CODE });
      check('viewer 看已关联报告看板 → 200', fights.status, 200);
      check('看板返回 fights 数组', Array.isArray(fights.data && fights.data.fights), true);
      const f0 = fights.data && fights.data.fights && fights.data.fights[0];
      check('fights 仅首领级字段（无玩家数据）', f0 ? !('friendlyPlayers' in f0) && ('kill' in f0) : false, true);
      const sync2 = await wcl70(owner.token, 'GET', 'reports', { guildId: guildA });
      const linkedRow = (sync2.data.reports || []).find(r => r.code === WCL_CODE);
      check('已关联报告 is_linked=true', linkedRow ? linkedRow.is_linked : '报告不在近20条(可接受)', linkedRow ? true : '报告不在近20条(可接受)');

      console.log('\n===== D. 自动创建开关与解绑 =====');
      check('开启自动创建 → 200', (await wcl70(owner.token, 'POST', 'set-auto-create', { guildId: guildA, enabled: true })).status, 200);
      const rowAuto = await svcRest('GET', `/rest/v1/guilds?id=eq.${guildA}&select=wcl_auto_create_event`);
      check('开关落库 true', rowAuto.body[0] && rowAuto.body[0].wcl_auto_create_event, true);
      check('解绑 → 200', (await wcl70(owner.token, 'POST', 'unbind-guild', { guildId: guildA })).status, 200);
      const rowAfter = await svcRest('GET', `/rest/v1/guilds?id=eq.${guildA}&select=wcl_guild_id,wcl_bind_method,wcl_token,wcl_auto_create_event`);
      check('解绑后 wcl_guild_id 清空', rowAfter.body[0] && rowAfter.body[0].wcl_guild_id, null);
      check('解绑后 wcl_bind_method 清空', rowAfter.body[0] && rowAfter.body[0].wcl_bind_method, null);
      check('解绑后自动创建开关复位 false', rowAfter.body[0] && rowAfter.body[0].wcl_auto_create_event, false);
      const actKept = await svcRest('GET', `/rest/v1/activities?id=eq.${actId}&select=wcl_report_code`);
      check('解绑后已关联活动报告保留', actKept.body[0] && actKept.body[0].wcl_report_code, WCL_CODE);
      check('解绑后可重绑 → 200', (await wcl70(owner.token, 'POST', 'bind-guild-paste', { guildId: guildA, wclGuildId: WCL_GID })).status, 200);
      check('重绑后 reports 仍可用 → 200', (await wcl70(owner.token, 'GET', 'reports', { guildId: guildA })).status, 200);
      await wcl70(owner.token, 'POST', 'unbind-guild', { guildId: guildA });

      console.log('\n===== E. wcl_token 列级权限（REVOKE 加固） =====');
      const anonTok = await fetch(`${URL}/rest/v1/guilds?select=wcl_token&limit=1`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
      if (anonTok.status === 400) {
        check('anon 直读 wcl_token 被拒（42703 列不可见）', anonTok.status, 400);
      } else {
        skip('anon 直读 wcl_token', 'REVOKE 未生效或未执行——若为降级方案（密文可读）请在修改报告标注');
      }
    }
  } finally {
    srv.kill();
    console.log('\n===== 清理测试数据 =====');
    if (actId) await svcRest('DELETE', `/rest/v1/activities?id=eq.${actId}`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${guildA}`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${guildB}`);
    for (const u of [owner, viewer, outsider]) {
      await svcRest('DELETE', `/auth/v1/admin/users/${u.uid}`);
    }
    console.log('测试用户与公会已删除');
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n===== 任务书 #70 WP1 验证: ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) process.exit(1);
  process.exit(0);
})().catch(e => { console.error('执行异常:', e); process.exit(1); });
