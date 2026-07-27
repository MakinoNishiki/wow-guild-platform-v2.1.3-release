// 任务书 #11 端到端冒烟：server.js /api/wcl/* 端点真实返回结构验证
// 自建 1 个测试用户 + 1 个公会，用真实公开报告验证响应结构，结束后自动清理。
// 用法: WCL_CLIENT_ID=xxx WCL_CLIENT_SECRET=yyy node scripts/verify-wcl-endpoints.js
// （WCL 凭证从环境变量传入，只读 .env 的 Supabase 配置，不打印密钥）
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 15606;
const PWD = 'Wcl-Smoke-2026!';
const REPORT_URL = 'https://cn.warcraftlogs.com/reports/7wYFJH9RyxzBnVXv';

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
function check(name, cond, detail) {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${name}${detail !== undefined ? `（${detail}）` : ''}`);
}

async function svcRest(method, restPath, body) {
  const res = await fetch(`${URL}${restPath}`, {
    method, headers: SVC, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function signUpOrIn(email) {
  const su = await fetch(`${URL}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD, data: { display_name: 'wcl-smoke' } }),
  });
  const sb = await su.json();
  if (sb.access_token) return { token: sb.access_token, uid: sb.user.id };
  const li = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD }),
  });
  const lb = await li.json();
  if (!lb.access_token) throw new Error(`无法获取会话: ${JSON.stringify(lb)}`);
  return { token: lb.access_token, uid: lb.user.id };
}

async function wclApi(token, endpoint, body) {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/wcl/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

(async () => {
  if (!process.env.WCL_CLIENT_ID || !process.env.WCL_CLIENT_SECRET) {
    console.error('缺少 WCL_CLIENT_ID / WCL_CLIENT_SECRET 环境变量');
    process.exit(1);
  }
  console.log('===== 准备测试数据 =====');
  const owner = await signUpOrIn('wcl-smoke@example.com');
  const g = await svcRest('POST', '/rest/v1/guilds', { name: 'WCL冒烟测试公会', owner_id: owner.uid, invite_code: 'WCLSMKT', server_name: '测试', server_region: '一区' });
  const guildId = g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: owner.uid, role: 'owner', display_name: 'wcl-smoke' }]);

  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, DEPLOY_RUN_PORT: String(TEST_PORT) },
    stdio: 'ignore',
  });
  await new Promise(r => setTimeout(r, 1000));

  let actId = null;
  try {
    console.log('\n===== report-summary（真实公开报告） =====');
    const rs = await wclApi(owner.token, 'report-summary', { reportCode: REPORT_URL, guildId });
    check('完整 URL 入参 → 200', rs.status === 200, rs.status);
    check('返回标题', typeof rs.body.title === 'string' && rs.body.title.length > 0, rs.body.title);
    check('bossFightTotal = 9（阶段0实测）', rs.body.bossFightTotal === 9, rs.body.bossFightTotal);
    check('players = 20 人（阶段0实测）', Array.isArray(rs.body.players) && rs.body.players.length === 20, rs.body.players && rs.body.players.length);
    const p0 = (rs.body.players || [])[0] || {};
    check('player 结构含 name/server/subType/bossFights',
      typeof p0.name === 'string' && 'server' in p0 && typeof p0.subType === 'string' && typeof p0.bossFights === 'number',
      JSON.stringify(p0));
    const sample = (rs.body.players || []).find(p => p.name === '群伯龙');
    check('样例角色 群伯龙 subType=Paladin', sample && sample.subType === 'Paladin', sample && `${sample.subType}/${sample.server}/bossFights=${sample.bossFights}`);
    const full = (rs.body.players || []).filter(p => p.bossFights === rs.body.bossFightTotal).length;
    const partial = (rs.body.players || []).filter(p => p.bossFights > 0 && p.bossFights < rs.body.bossFightTotal).length;
    check('存在全勤与部分参战角色（前端①②区有数据）', full > 0, `全勤=${full} 部分=${partial}`);

    console.log('\n===== report-summary（纯 code 入参） =====');
    const rs2 = await wclApi(owner.token, 'report-summary', { reportCode: '7wYFJH9RyxzBnVXv', guildId });
    check('纯 code 入参 → 200 且标题一致', rs2.status === 200 && rs2.body.title === rs.body.title, rs2.status);

    console.log('\n===== 错误路径 =====');
    const bad = await wclApi(owner.token, 'report-summary', { reportCode: 'not-a-code!!', guildId });
    check('非法 reportCode → 400 + 中文提示', bad.status === 400 && typeof bad.body.message === 'string', `${bad.status} ${bad.body.message}`);
    const missing = await wclApi(owner.token, 'report-summary', { reportCode: 'AAAAbbbbCCCCdddd', guildId });
    check('不存在的报告 → 502 + 中文提示', missing.status === 502 && typeof missing.body.message === 'string', `${missing.status} ${missing.body.message}`);

    console.log('\n===== attendance-snapshot =====');
    const act = await svcRest('POST', '/rest/v1/activities', { guild_id: guildId, name: 'WCL冒烟活动', activity_date: '2026-07-25', raid: '测试', boss: '', notes: '', created_by: owner.uid });
    actId = act.body[0].id;
    // wcl_snapshot 列由 sql/07 增量提供；未执行时快照数据类断言跳过（鉴权类断言不受影响）
    const colProbe = await svcRest('GET', '/rest/v1/activities?select=wcl_snapshot&limit=1');
    const hasSnapshotCol = colProbe.status !== 400;
    if (!hasSnapshotCol) console.log('（activities.wcl_snapshot 列不存在，跳过快照数据断言——待运营执行 sql/07 后重跑本脚本）');
    const snap = await wclApi(owner.token, 'attendance-snapshot', { reportCode: REPORT_URL, activityId: actId, guildId });
    if (hasSnapshotCol) {
      check('快照端点 → 200', snap.status === 200, snap.status);
      check('无快照时 hasSnapshot=false / existingSnapshot=null', snap.body.hasSnapshot === false && snap.body.existingSnapshot === null, `hasSnapshot=${snap.body.hasSnapshot}`);
      check('快照端点同样返回玩家列表', Array.isArray(snap.body.players) && snap.body.players.length === 20, snap.body.players && snap.body.players.length);
    }
    const wrongGuild = await wclApi(owner.token, 'attendance-snapshot', { reportCode: REPORT_URL, activityId: actId, guildId: '00000000-0000-0000-0000-000000000000' });
    check('activity 与 guildId 不符 → 403', wrongGuild.status === 403, wrongGuild.status);
  } finally {
    srv.kill();
    console.log('\n===== 清理测试数据 =====');
    if (actId) await svcRest('DELETE', `/rest/v1/activities?id=eq.${actId}`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
    await svcRest('DELETE', `/auth/v1/admin/users/${owner.uid}`);
    console.log('测试用户与公会已删除');
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n===== WCL 端点冒烟: ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) process.exit(1);
})().catch(e => { console.error('验证异常:', e.message); process.exit(1); });
