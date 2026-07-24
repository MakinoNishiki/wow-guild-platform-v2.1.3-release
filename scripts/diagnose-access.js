// 任务书 #3 诊断脚本：准入链路（创建公会 / 加入公会 / 返回登录）
// 只读 .env，禁止打印密钥；测试数据保留不删。
// 用法: node scripts/diagnose-access.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 15601;
const TEST_EMAIL = 'test-diag@example.com';
const TEST_PASSWORD = 'Test-Diag-2026!';

// 代码（cloud.js）实际写入/读取的字段清单
const EXPECTED = {
  guilds: ['id', 'name', 'owner_id', 'invite_code', 'server_name', 'server_region', 'created_at', 'updated_at'],
  guild_members: ['id', 'guild_id', 'user_id', 'role', 'display_name', 'created_at', 'updated_at'],
  raid_members: ['id', 'guild_id', 'name', 'class', 'spec', 'role', 'off_spec', 'off_specs', 'status', 'join_date', 'notes', 'user_id', 'created_at', 'updated_at'],
  activities: ['id', 'guild_id', 'name', 'activity_date', 'raid', 'boss', 'notes', 'created_by', 'created_at', 'updated_at'],
  activity_attendance: ['id', 'activity_id', 'member_id', 'status', 'notes', 'created_at', 'updated_at'],
  loot_records: ['id', 'guild_id', 'character_id', 'assigned_by', 'item_name', 'item_category', 'item_slot', 'item_level', 'item_stats', 'raid_name', 'boss_name', 'difficulty', 'obtained_date', 'season', 'distribution_method', 'player_action', 'roll_value', 'is_wishlist', 'rule_note', 'decision_note', 'note', 'created_at', 'updated_at'],
  wishlists: ['id', 'guild_id', 'member_id', 'items', 'created_at', 'updated_at'],
  notifications: ['id', 'user_id', 'guild_id', 'type', 'title', 'message', 'is_read', 'related_user_id', 'created_at'],
  user_profiles: ['user_id', 'display_name', 'created_at', 'updated_at'],
  user_characters: ['id', 'user_id', 'character_name', 'server_name', 'server_region', 'armory_url', 'faction', 'class', 'spec', 'level', 'item_level', 'race', 'guild_name', 'created_at', 'updated_at'],
};

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const URL = (env.SUPABASE_URL || '').replace(/\/+$/, '');
  const ANON = env.SUPABASE_ANON_KEY;
  const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !ANON || !SERVICE) { console.error('.env 缺少 SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY'); process.exit(1); }
  console.log('目标库:', URL, '\n');

  // ========== 步骤 1：抓取 OpenAPI 元数据，对比表结构 ==========
  console.log('===== 1. 表结构对比（OpenAPI 元数据 vs 代码字段清单） =====');
  const specRes = await fetch(`${URL}/rest/v1/`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  if (!specRes.ok) { console.log('获取元数据失败: HTTP', specRes.status); process.exit(1); }
  const spec = await specRes.json();
  const defs = (spec && spec.definitions) || {};
  let schemaMismatch = false;
  for (const [table, expectedCols] of Object.entries(EXPECTED)) {
    if (!defs[table]) {
      console.log(`✗ 表 ${table} 不存在！`);
      schemaMismatch = true;
      continue;
    }
    const actualCols = Object.keys(defs[table].properties || {});
    const missing = expectedCols.filter(c => !actualCols.includes(c));
    const extra = actualCols.filter(c => !expectedCols.includes(c));
    if (missing.length || extra.length) {
      schemaMismatch = true;
      console.log(`✗ ${table}: 缺字段 [${missing.join(', ') || '无'}] 多字段 [${extra.join(', ') || '无'}]`);
    } else {
      console.log(`✓ ${table}: 字段一致 (${actualCols.length} 列)`);
    }
  }
  // 检查是否存在已废弃表
  for (const legacy of ['loots', 'guild_invite_codes', 'feishu_configs']) {
    if (defs[legacy]) console.log(`ℹ 存在遗留表 ${legacy}（基线不要求，不影响）`);
  }

  // ========== 步骤 2：注册测试用户，拿 JWT ==========
  console.log('\n===== 2. 注册测试用户 =====');
  let token = null;
  const signupRes = await fetch(`${URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, data: { display_name: 'test-diag' } }),
  });
  const signupBody = await signupRes.json();
  console.log('注册 HTTP', signupRes.status);
  if (signupBody.access_token) {
    token = signupBody.access_token;
    console.log('注册成功，直接获得会话（邮箱验证已关闭）');
  } else {
    console.log('注册未返回会话，尝试密码登录...');
    const loginRes = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    const loginBody = await loginRes.json();
    console.log('登录 HTTP', loginRes.status);
    if (loginBody.access_token) {
      token = loginBody.access_token;
      console.log('登录成功，获得 JWT');
    } else {
      console.log('登录失败:', JSON.stringify(loginBody));
      console.log('（可能原因：该用户已存在但密码不同，或邮箱验证开启且未验证）');
    }
  }

  // ========== 步骤 3：启动 server.js，带 JWT 走写入代理创建公会 ==========
  if (token) {
    console.log('\n===== 3. 通过 server.js 代理创建公会 =====');
    const srv = spawn('node', ['server.js'], {
      cwd: ROOT,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_RUN_PORT: String(TEST_PORT) },
      stdio: 'ignore',
    });
    await new Promise(r => setTimeout(r, 1000));
    try {
      const guildRow = {
        name: '诊断测试公会',
        owner_id: signupBody.user ? signupBody.user.id : (JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).sub),
        invite_code: 'DIAG0001',
        server_name: '测试服务器',
        server_region: '一区',
      };
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/db/rest/v1/guilds`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(guildRow),
      });
      const text = await res.text();
      console.log('代理创建公会 HTTP', res.status);
      console.log('响应体:', text.slice(0, 800));
      if (res.ok) {
        // 继续测试 guild_members 写入（创建者成为 owner）
        const guild = JSON.parse(text)[0];
        const gmRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/db/rest/v1/guild_members`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ guild_id: guild.id, user_id: guildRow.owner_id, role: 'owner', display_name: 'test-diag' }),
        });
        const gmText = await gmRes.text();
        console.log('代理写入 guild_members HTTP', gmRes.status);
        console.log('响应体:', gmText.slice(0, 800));
      }
    } finally {
      srv.kill();
    }
  } else {
    console.log('\n===== 3. 跳过（无 JWT） =====');
  }

  console.log('\n===== 诊断结论摘要 =====');
  console.log('表结构是否匹配代码:', schemaMismatch ? '✗ 存在不匹配（见上）' : '✓ 完全匹配');
  console.log('测试数据已保留（用户', TEST_EMAIL, '，公会 诊断测试公会/DIAG0001），供运营核对。');
}

main().catch(e => { console.error('诊断脚本异常:', e.message); process.exit(1); });
