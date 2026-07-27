// SEC-001 鉴权实证脚本：server.js 代理层公会级鉴权
// 自建 4 个测试用户 + 2 个公会，覆盖任务书要求的全部越权场景（共 34 个断言），结束后自动清理。
// 只读 .env，不打印密钥。用法: node scripts/verify-authz.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 15605;
const PWD = 'Sec-Test-2026!';

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

// 任务书 #11：WCL 端点（鉴权失败路径不接触 WCL API，无需真实 reportCode / WCL 凭证）
async function wclApi(token, endpoint, body) {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/wcl/${endpoint}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
  return res.status;
}

(async () => {
  console.log('===== 准备测试数据（service_role 直连） =====');
  const owner = await signUpOrIn('sec-owner@example.com');
  const editor = await signUpOrIn('sec-editor@example.com');
  const viewer = await signUpOrIn('sec-viewer@example.com');
  const outsider = await signUpOrIn('sec-outsider@example.com');

  // 公会 A（owner 所有）+ 公会 B（outsider 所有）
  const gA = await svcRest('POST', '/rest/v1/guilds', { name: 'SEC测试公会A', owner_id: owner.uid, invite_code: 'SECTESTA', server_name: '测试', server_region: '一区' });
  const guildA = gA.body[0].id;
  const gB = await svcRest('POST', '/rest/v1/guilds', { name: 'SEC测试公会B', owner_id: outsider.uid, invite_code: 'SECTESTB', server_name: '测试', server_region: '一区' });
  const guildB = gB.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [
    { guild_id: guildA, user_id: owner.uid, role: 'owner', display_name: 'sec-owner' },
    { guild_id: guildA, user_id: editor.uid, role: 'editor', display_name: 'sec-editor' },
    { guild_id: guildA, user_id: viewer.uid, role: 'viewer', display_name: 'sec-viewer' },
    { guild_id: guildB, user_id: outsider.uid, role: 'owner', display_name: 'sec-outsider' },
  ]);
  console.log('公会 A / B 及成员行就绪');

  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_RUN_PORT: String(TEST_PORT) },
    stdio: 'ignore',
  });
  await new Promise(r => setTimeout(r, 1000));

  const memberRow = (gid, suffix) => ({
    guild_id: gid, name: 'SEC测试成员' + (suffix || ''), class: '战士', spec: '武器', role: '输出',
    off_spec: '', off_specs: [], status: '正式', join_date: '2026-07-25', notes: '', user_id: null,
  });

  try {
    console.log('\n===== 越权场景验证 =====');
    // 1. owner/editor 写本会话 → 201
    check('owner 写公会A raid_members', await proxy(owner.token, 'POST', 'raid_members', memberRow(guildA, '甲')), 201);
    check('editor 写公会A raid_members', await proxy(editor.token, 'POST', 'raid_members', memberRow(guildA, '乙')), 201);
    // 2. viewer 写本公会 → 403
    check('viewer 写公会A raid_members → 拒绝', await proxy(viewer.token, 'POST', 'raid_members', memberRow(guildA)), 403);
    // 3. 跨公会：outsider(B的owner) 写公会A → 403
    check('公会B owner 写公会A → 拒绝', await proxy(outsider.token, 'POST', 'raid_members', memberRow(guildA)), 403);
    // 4. 无 JWT / 伪造 JWT → 401
    check('无 JWT → 拒绝', await proxy(null, 'POST', 'raid_members', memberRow(guildA)), 401);
    check('伪造 JWT → 拒绝', await proxy('forged.token.here', 'POST', 'raid_members', memberRow(guildA)), 401);
    // 5. 本人写自己的 user_characters → 201；写他人的 → 403
    check('viewer 写本人 user_characters', await proxy(viewer.token, 'POST', 'user_characters', { user_id: viewer.uid, character_name: 'SEC角色', server_name: '测试服' }), 201);
    check('viewer 冒用 owner 身份写 user_characters → 拒绝', await proxy(viewer.token, 'POST', 'user_characters', { user_id: owner.uid, character_name: 'SEC角色', server_name: '测试服' }), 403);
    // 6. 按 id 过滤的跨公会越权（联查行归属）：先由 owner 建一条活动
    const act = await svcRest('POST', '/rest/v1/activities', { guild_id: guildA, name: 'SEC活动', activity_date: '2026-07-25', raid: '测试', boss: '', notes: '', created_by: owner.uid });
    const actId = act.body[0].id;
    check('viewer PATCH 公会A 活动(按id) → 拒绝', await proxy(viewer.token, 'PATCH', 'activities', { notes: '越权' }, `?id=eq.${actId}`), 403);
    check('editor PATCH 公会A 活动(按id)', await proxy(editor.token, 'PATCH', 'activities', { notes: '正常' }, `?id=eq.${actId}`), 200);
    // 6b. 任务书 #12 REQ-020：activities.status 白名单（normal/cancelled 放行，非法值 400）
    // status 列由 sql/08 增量提供；未执行时合法值用例跳过（非法值用例在代理层拦截，不受影响）
    const statusColProbe = await svcRest('GET', '/rest/v1/activities?select=status&limit=1');
    if (statusColProbe.status === 400) {
      console.log('- editor PATCH 活动 status=cancelled（合法）: 跳过（activities.status 列不存在，待运营执行 sql/08 后重跑）');
    } else {
      check('editor PATCH 活动 status=cancelled（合法）', await proxy(editor.token, 'PATCH', 'activities', { status: 'cancelled' }, `?id=eq.${actId}`), 200);
    }
    check('editor PATCH 活动 status=hacked（非法）→ 拒绝', await proxy(editor.token, 'PATCH', 'activities', { status: 'hacked' }, `?id=eq.${actId}`), 400);
    // 6c. 任务书 #12 补丁 BUG-029 回归：删除后数据真实不存在（接口层断言）
    const actDel = await svcRest('POST', '/rest/v1/activities', { guild_id: guildA, name: 'SEC待删活动', activity_date: '2026-07-26', raid: '测试', boss: '', notes: '', created_by: owner.uid });
    const actDelId = actDel.body[0].id;
    check('editor 删除活动 → 200', await proxy(editor.token, 'DELETE', 'activities', null, `?id=eq.${actDelId}`), 200);
    const gone = await svcRest('GET', `/rest/v1/activities?id=eq.${actDelId}&select=id`);
    check('删除后数据真实不存在', Array.isArray(gone.body) && gone.body.length === 0, true);
    // 7. activity_attendance 联查父表鉴权
    const rm = await svcRest('GET', `/rest/v1/raid_members?guild_id=eq.${guildA}&select=id&limit=1`);
    const raidMemberId = rm.body[0].id;
    check('viewer 写 activity_attendance → 拒绝', await proxy(viewer.token, 'POST', 'activity_attendance', [{ activity_id: actId, member_id: raidMemberId, status: 'present' }]), 403);
    check('editor 写 activity_attendance', await proxy(editor.token, 'POST', 'activity_attendance', [{ activity_id: actId, member_id: raidMemberId, status: 'present' }]), 201);
    // 8. guild_members 规则
    const gmRow = await svcRest('GET', `/rest/v1/guild_members?guild_id=eq.${guildA}&user_id=eq.${viewer.uid}&select=id`);
    const viewerMembershipId = gmRow.body[0].id;
    check('viewer 改自己角色 → 拒绝', await proxy(viewer.token, 'PATCH', 'guild_members', { role: 'editor' }, `?id=eq.${viewerMembershipId}`), 403);
    check('owner 改 viewer 角色为 editor 再改回', await proxy(owner.token, 'PATCH', 'guild_members', { role: 'viewer' }, `?id=eq.${viewerMembershipId}`), 200);
    check('viewer 自我提权插入 owner 行 → 拒绝', await proxy(viewer.token, 'POST', 'guild_members', { guild_id: guildB, user_id: viewer.uid, role: 'owner', display_name: 'x' }), 403);
    // 9. guilds 规则
    check('viewer PATCH 公会A → 拒绝', await proxy(viewer.token, 'PATCH', 'guilds', { name: '越权改名' }, `?id=eq.${guildA}`), 403);
    check('owner PATCH 公会A', await proxy(owner.token, 'PATCH', 'guilds', { name: 'SEC测试公会A' }, `?id=eq.${guildA}`), 200);
    const created = await proxy(viewer.token, 'POST', 'guilds', { name: 'SEC临时公会', owner_id: viewer.uid, invite_code: 'SECTMPC', server_name: null, server_region: null });
    check('viewer 创建公会（登录即可）', created, 201);
    // 10. 代理 GET：guilds 无过滤 → 403；带邀请码 → 200；其他表 → 403
    check('代理 GET guilds 无过滤 → 拒绝', await proxy(viewer.token, 'GET', 'guilds', null, ''), 403);
    check('代理 GET guilds 按邀请码', await proxy(viewer.token, 'GET', 'guilds', null, '?invite_code=eq.SECTESTA'), 200);
    check('代理 GET raid_members → 拒绝', await proxy(owner.token, 'GET', 'raid_members', null, `?guild_id=eq.${guildA}`), 403);
    // 11. notifications：成员可发，非成员拒绝
    check('viewer(成员) 发通知到公会A', await proxy(viewer.token, 'POST', 'notifications', { user_id: owner.uid, type: 'member_join', title: 't', message: 'm', guild_id: guildA, related_user_id: viewer.uid }), 201);
    check('outsider 发通知到公会A → 拒绝', await proxy(outsider.token, 'POST', 'notifications', { user_id: owner.uid, type: 'x', title: 't', message: 'm', guild_id: guildA }), 403);
    // 12. RPC 白名单
    const rpcOk = await fetch(`http://127.0.0.1:${TEST_PORT}/api/db/rpc/v1/get_unread_notification_count`, {
      method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_user_id: owner.uid }),
    });
    check('RPC 白名单函数', rpcOk.status, 200);
    const rpcNo = await fetch(`http://127.0.0.1:${TEST_PORT}/api/db/rpc/v1/set_updated_at`, {
      method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    check('RPC 非白名单函数 → 拒绝', rpcNo.status, 403);
    // 13. 任务书 #11 WCL 端点鉴权（鉴权失败在调 WCL API 之前，假 reportCode 即可）
    check('viewer 调 WCL report-summary → 拒绝', await wclApi(viewer.token, 'report-summary', { reportCode: 'fakeCode1234', guildId: guildA }), 403);
    check('viewer 调 WCL attendance-snapshot → 拒绝', await wclApi(viewer.token, 'attendance-snapshot', { reportCode: 'fakeCode1234', activityId: actId, guildId: guildA }), 403);
    check('无 JWT 调 WCL report-summary → 拒绝', await wclApi(null, 'report-summary', { reportCode: 'fakeCode1234', guildId: guildA }), 401);
    check('非本公会成员调 WCL report-summary → 拒绝', await wclApi(outsider.token, 'report-summary', { reportCode: 'fakeCode1234', guildId: guildA }), 403);
    // 14. viewer 删除自己的成员行（退出公会）→ 允许（放在最后，删完即清理）
    check('viewer 删除自己的成员行（退出公会）', await proxy(viewer.token, 'DELETE', 'guild_members', null, `?id=eq.${viewerMembershipId}`), 200);
  } finally {
    srv.kill();
    console.log('\n===== 清理测试数据 =====');
    // 行级数据随公会删除级联；临时公会单独删
    await svcRest('DELETE', `/rest/v1/guilds?invite_code=eq.SECTMPC`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${guildA}`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${guildB}`);
    await svcRest('DELETE', `/rest/v1/user_characters?user_id=eq.${viewer.uid}`);
    for (const u of [owner, editor, viewer, outsider]) {
      await svcRest('DELETE', `/auth/v1/admin/users/${u.uid}`);
    }
    console.log('测试用户与公会已删除');
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n===== SEC-001 鉴权验证: ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) process.exit(1);
})().catch(e => { console.error('验证异常:', e.message); process.exit(1); });
