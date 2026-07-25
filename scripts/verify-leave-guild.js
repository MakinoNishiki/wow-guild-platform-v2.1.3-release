// BUG-008 回归验证：退出公会链路（membership.id 缺失已修复）
// 模拟修复后的完整链路：用户B 直连查 membership（select id,role）→ 代理 DELETE guild_members。
// 只读 .env，不打印密钥。本脚本会让 test-diag-b 退出诊断测试公会（测试数据，无妨）。
// 用法: node scripts/verify-leave-guild.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 15604;

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;

(async () => {
  const li = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test-diag-b@example.com', password: 'Test-Diag-2026!' }),
  });
  const lb = await li.json();
  if (!lb.access_token) { console.log('用户B登录失败'); process.exit(1); }
  const token = lb.access_token;
  const uid = lb.user.id;

  // 修复后的 selectGuild 逻辑：select('id, role')
  const gm = await fetch(`${URL}/rest/v1/guild_members?user_id=eq.${uid}&select=id,role`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  const rows = await gm.json();
  if (!Array.isArray(rows) || !rows.length || !rows[0].id) {
    console.log('未查到 membership 或 id 缺失'); process.exit(1);
  }
  const membership = rows[0];
  console.log('✓ membership 查询包含 id:', !!membership.id, '角色:', membership.role);

  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_RUN_PORT: String(TEST_PORT) },
    stdio: 'ignore',
  });
  await new Promise(r => setTimeout(r, 1000));
  try {
    const del = await fetch(`http://127.0.0.1:${TEST_PORT}/api/db/rest/v1/guild_members?id=eq.${membership.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('✓ 退出公会 DELETE HTTP', del.status, del.status < 300 ? '（不再出现 uuid 语法错误）' : '');
    const check = await fetch(`${URL}/rest/v1/guild_members?user_id=eq.${uid}&select=id`, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}` },
    });
    const left = await check.json();
    console.log('✓ 退出后成员行数:', Array.isArray(left) ? left.length : '?', Array.isArray(left) && left.length === 0 ? '（已退出）' : '');
    if (del.status >= 300 || !Array.isArray(left) || left.length !== 0) process.exit(1);
  } finally {
    srv.kill();
  }
  console.log('BUG-008 回归验证通过');
})().catch(e => { console.error('验证异常:', e.message); process.exit(1); });
