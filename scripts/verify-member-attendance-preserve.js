// BUG-038（任务书 #12 补丁4 追加）回归：软删除/恢复成员前后，其历史考勤状态必须不变。
// 自建测试用户/公会/成员/活动，走 server.js 代理软删除（与应用同路径），断言考勤行不受触碰。
// 用法: node scripts/verify-member-attendance-preserve.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 15607;
const PWD = 'Bug038-Test!';

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

async function svcRest(method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, {
    method, headers: SVC, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function signUpOrIn(email) {
  const su = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD, data: { display_name: 'bug038' } }),
  });
  const sb = await su.json();
  if (sb.access_token) return { token: sb.access_token, uid: sb.user.id };
  const li = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD }),
  });
  const lb = await li.json();
  if (!lb.access_token) throw new Error(`无法获取会话: ${JSON.stringify(lb)}`);
  return { token: lb.access_token, uid: lb.user.id };
}

async function proxy(token, method, table, body, query) {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/db/rest/v1/${table}${query || ''}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.status;
}

(async () => {
  console.log('===== 准备测试数据 =====');
  const owner = await signUpOrIn('bug038-verify@example.com');
  const g = await svcRest('POST', '/rest/v1/guilds', { name: 'BUG038回归公会', owner_id: owner.uid, invite_code: 'BUG038V', server_name: '测试', server_region: '一区' });
  const gid = g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: gid, user_id: owner.uid, role: 'owner', display_name: 'bug038' }]);
  const m = await svcRest('POST', '/rest/v1/raid_members', { guild_id: gid, name: '考勤保留甲', class: '战士', spec: '武器', role: '输出', status: '正式' });
  const mid = m.body[0].id;
  const a = await svcRest('POST', '/rest/v1/activities', { guild_id: gid, name: 'BUG038回归活动', activity_date: '2026-07-26', raid: '测试', boss: '', notes: '', created_by: owner.uid });
  const aid = a.body[0].id;
  await svcRest('POST', '/rest/v1/activity_attendance', [{ activity_id: aid, member_id: mid, status: 'present' }]);

  const getAtt = async () => {
    const r = await svcRest('GET', `/rest/v1/activity_attendance?activity_id=eq.${aid}&member_id=eq.${mid}&select=status`);
    return Array.isArray(r.body) && r.body[0] ? r.body[0].status : '(行不存在)';
  };

  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_RUN_PORT: String(TEST_PORT) },
    stdio: 'ignore',
  });
  await new Promise(r => setTimeout(r, 1000));

  try {
    check('初始考勤 = present', (await getAtt()) === 'present', await getAtt());

    // 软删除（应用同路径：代理 PATCH raid_members status='离队'）
    const del = await proxy(owner.token, 'PATCH', 'raid_members', { status: '离队' }, `?id=eq.${mid}`);
    check('软删除成员 → 200', del === 200, del);
    check('软删除后考勤状态不变（仍 present）', (await getAtt()) === 'present', await getAtt());

    // 恢复（代理 PATCH status='正式'）
    const res = await proxy(owner.token, 'PATCH', 'raid_members', { status: '正式' }, `?id=eq.${mid}`);
    check('恢复成员 → 200', res === 200, res);
    check('恢复后考勤状态不变（仍 present）', (await getAtt()) === 'present', await getAtt());

    // 反向：缺席行也不被成员操作触碰
    await svcRest('PATCH', `/rest/v1/activity_attendance?activity_id=eq.${aid}&member_id=eq.${mid}`, { status: 'leave' });
    await proxy(owner.token, 'PATCH', 'raid_members', { status: '离队' }, `?id=eq.${mid}`);
    check('leave（请假）状态在软删除后同样不变', (await getAtt()) === 'leave', await getAtt());
  } finally {
    srv.kill();
    console.log('\n===== 清理测试数据 =====');
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${gid}`);
    await svcRest('DELETE', `/auth/v1/admin/users/${owner.uid}`);
    console.log('测试用户与公会已删除');
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n===== BUG-038 回归: ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) process.exit(1);
})().catch(e => { console.error('验证异常:', e.message); process.exit(1); });
