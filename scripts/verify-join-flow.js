// 任务书 #3 复测脚本：加入公会全链路（用户B 注册 → 邀请码查询 → 代理写入成员 → RLS 直连读取）
// 只读 .env，不打印密钥；测试数据保留不删。
// 用法: node scripts/verify-join-flow.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 15602;

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;

(async () => {
  // 注册用户 B
  const su = await fetch(URL + '/auth/v1/signup', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test-diag-b@example.com', password: 'Test-Diag-2026!', data: { display_name: 'test-diag-b' } }),
  });
  const sb = await su.json();
  let token = sb.access_token, uid = sb.user && sb.user.id;
  if (!token) {
    const li = await fetch(URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test-diag-b@example.com', password: 'Test-Diag-2026!' }),
    });
    const lb = await li.json();
    token = lb.access_token; uid = lb.user && lb.user.id;
  }
  if (!token) { console.log('用户B注册/登录失败'); process.exit(1); }
  console.log('用户B已就绪');

  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_RUN_PORT: String(TEST_PORT) },
    stdio: 'ignore',
  });
  await new Promise(r => setTimeout(r, 1000));
  try {
    // 模拟 cloud.js joinGuild：先按邀请码查公会
    const q = await fetch(`http://127.0.0.1:${TEST_PORT}/api/db/rest/v1/guilds?invite_code=eq.DIAG0001`, {
      headers: { Authorization: 'Bearer ' + token },
    });
    const guilds = await q.json();
    console.log('按邀请码查询 HTTP', q.status, '命中:', Array.isArray(guilds) ? guilds.length : 0, '个公会');
    if (!Array.isArray(guilds) || !guilds.length) process.exit(1);

    // 写入 viewer 成员行
    const ins = await fetch(`http://127.0.0.1:${TEST_PORT}/api/db/rest/v1/guild_members`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ guild_id: guilds[0].id, user_id: uid, role: 'viewer', display_name: 'test-diag-b' }),
    });
    const ib = await ins.json();
    console.log('加入公会 HTTP', ins.status, '角色:', Array.isArray(ib) && ib[0] ? ib[0].role : '-');

    // 直连读取验证 RLS：用户B（viewer）应能读到该公会成员列表
    const rl = await fetch(`${URL}/rest/v1/guild_members?guild_id=eq.${guilds[0].id}&select=role,display_name`, {
      headers: { apikey: ANON, Authorization: 'Bearer ' + token },
    });
    const rows = await rl.json();
    console.log('RLS 读取成员列表 HTTP', rl.status, '可见成员数:', Array.isArray(rows) ? rows.length : '-');
  } finally {
    srv.kill();
  }
  console.log('加入链路复测完成，测试数据保留');
})().catch(e => { console.error('复测异常:', e.message); process.exit(1); });
