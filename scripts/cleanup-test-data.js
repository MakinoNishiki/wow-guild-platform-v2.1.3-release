// DEBT-004 清理脚本：删除诊断测试数据
// 目标：诊断测试公会（邀请码 DIAG0001）及其全部关联数据（级联），
//       测试账号 test-diag@example.com / test-diag-b@example.com。
//
// ⚠ 本脚本由运营确认后手动执行：node scripts/cleanup-test-data.js --yes
// 不带 --yes 时只做预演（列出将删除的内容，不实际删除）。
// 密钥只从 .env 读取，不打印。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEST_EMAILS = ['test-diag@example.com', 'test-diag-b@example.com'];
const TEST_INVITE_CODE = 'DIAG0001';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = (env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const HEADERS = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

const DRY_RUN = !process.argv.includes('--yes');

async function rest(path, method = 'GET') {
  const res = await fetch(`${URL}${path}`, { method, headers: HEADERS });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

(async () => {
  if (!URL || !SERVICE) { console.error('.env 缺少配置'); process.exit(1); }
  console.log(DRY_RUN ? '===== 预演模式（不实际删除，加 --yes 才执行）=====' : '===== 执行清理 =====');

  // 1. 查找测试公会
  const g = await rest(`/rest/v1/guilds?invite_code=eq.${TEST_INVITE_CODE}&select=id,name`);
  const guilds = Array.isArray(g.body) ? g.body : [];
  if (guilds.length === 0) {
    console.log('未找到邀请码为', TEST_INVITE_CODE, '的公会，跳过公会删除');
  } else {
    const guild = guilds[0];
    // 统计关联数据（仅供报告）
    for (const [table, label] of [['guild_members', '成员权限'], ['raid_members', '角色成员'], ['activities', '活动'], ['loot_records', '装备'], ['wishlists', '心愿单'], ['notifications', '通知']]) {
      const r = await rest(`/rest/v1/${table}?guild_id=eq.${guild.id}&select=id`);
      console.log(`  公会「${guild.name}」关联${label}: ${Array.isArray(r.body) ? r.body.length : '?'} 行（将随公会级联删除）`);
    }
    if (!DRY_RUN) {
      const del = await rest(`/rest/v1/guilds?id=eq.${guild.id}`, 'DELETE');
      console.log(`删除公会 HTTP ${del.status}（guild_members/raid_members/activities/activity_attendance/loot_records/wishlists/notifications 均 ON DELETE CASCADE）`);
    } else {
      console.log(`[预演] 将删除公会「${guild.name}」(${guild.id})，关联数据级联删除`);
    }
  }

  // 2. 删除测试账号（Admin API，级联 user_profiles/user_characters/guild_members/notifications）
  for (const email of TEST_EMAILS) {
    const users = await rest(`/auth/v1/admin/users?page=1&per_page=50&filter=${encodeURIComponent(email)}`);
    const list = (users.body && users.body.users) || [];
    const target = list.find(u => u.email === email);
    if (!target) {
      console.log(`未找到账号 ${email}，跳过`);
      continue;
    }
    if (!DRY_RUN) {
      const del = await rest(`/auth/v1/admin/users/${target.id}`, 'DELETE');
      console.log(`删除账号 ${email} HTTP ${del.status}`);
    } else {
      console.log(`[预演] 将删除账号 ${email} (${target.id})`);
    }
  }

  console.log(DRY_RUN ? '\n预演完成。确认无误后执行: node scripts/cleanup-test-data.js --yes' : '\n清理完成。');
})().catch(e => { console.error('清理异常:', e.message); process.exit(1); });
