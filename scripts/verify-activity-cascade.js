// BUG-016 前置验证（一次性）：确认真实数据库 activity_attendance.activity_id 的 ON DELETE CASCADE 已生效
// 流程：建测试公会/成员/活动/考勤 → 仅删活动 → 检查考勤行是否被级联删除 → 清理
// 用法: node scripts/verify-activity-cascade.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = env.SUPABASE_URL.replace(/\/+$/, '');
const SVC = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

async function svc(method, restPath, body) {
  const res = await fetch(`${URL}${restPath}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (res.status >= 400) throw new Error(`${method} ${restPath} -> ${res.status}: ${text}`);
  return parsed;
}

async function main() {
  const stamp = Date.now().toString(36);
  let guildId = null, memberId = null, activityId = null;
  try {
    const su = await fetch(`${URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `diag-cascade-${stamp}@example.com`, password: 'Diag-Cascade-2026!', data: {} }),
    });
    const sb = await su.json();
    const uid = sb.user.id;

    const g = await svc('POST', '/rest/v1/guilds', { name: `DIAG-CASCADE-${stamp}`, owner_id: uid, invite_code: `C${stamp}`.slice(0, 8) });
    guildId = g[0].id;
    await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: uid, role: 'owner' });
    const m = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name: 'Diag级联', class: '战士', spec: '武器', role: 'dps' });
    memberId = m[0].id;
    const a = await svc('POST', '/rest/v1/activities', { guild_id: guildId, name: 'DIAG级联', activity_date: '2026-07-20', raid: '虚影尖塔' });
    activityId = a[0].id;
    await svc('POST', '/rest/v1/activity_attendance', { activity_id: activityId, member_id: memberId, status: 'present' });

    // 只删活动，不删考勤
    await svc('DELETE', `/rest/v1/activities?id=eq.${activityId}`);

    const remaining = await svc('GET', `/rest/v1/activity_attendance?activity_id=eq.${activityId}&select=id`);
    console.log(`删除活动后残留考勤行数: ${remaining.length}`);
    console.log(remaining.length === 0
      ? '结论：ON DELETE CASCADE 已生效 ✓ 可以安全移除前端冗余的考勤删除调用'
      : '结论：级联未生效 ✗ 前端的显式考勤删除不能移除');
    process.exitCode = remaining.length === 0 ? 0 : 1;
  } finally {
    try {
      if (activityId) await svc('DELETE', `/rest/v1/activity_attendance?activity_id=eq.${activityId}`);
      if (activityId) await svc('DELETE', `/rest/v1/activities?id=eq.${activityId}`);
      if (memberId) await svc('DELETE', `/rest/v1/raid_members?id=eq.${memberId}`);
      if (guildId) {
        await svc('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
        await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
      }
      console.log('测试数据已清理');
    } catch (e) {
      console.log('清理失败（需人工检查）:', e.message);
    }
  }
}

main().catch(e => { console.error('验证失败:', e.message); process.exit(1); });
