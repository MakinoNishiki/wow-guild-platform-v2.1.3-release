// BUG-014 诊断脚本：复现 Top5 出勤率口径问题
// 自建测试公会 + 2 成员 + 2 活动（混合考勤状态），然后用与前端完全相同的两种算法
// （getAttendanceRankings / getMemberAttendanceRate）计算出勤率并对比期望值。
// 期望（任务书口径）：出勤率 = 出勤 ÷ 应到；请假计入应到不计入出勤；替补按出勤计。
//   m1（出席×1 + 缺席×1）= 50%；m2（出席×1 + 请假×1）= 50%
// 只读 .env，不打印密钥；结束后自动清理测试数据。用法: node scripts/diagnose-attendance-rate.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = env.SUPABASE_URL.replace(/\/+$/, '');
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

async function svc(method, restPath, body) {
  const res = await fetch(`${URL}${restPath}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (res.status >= 400) throw new Error(`${method} ${restPath} -> ${res.status}: ${text}`);
  return parsed;
}

// 与 js/cloud.js 完全相同的映射
function mapStatusFromDb(status) {
  const map = { 'present': '出席', 'absent': '缺席', 'late': '迟到', 'backup': '替补', 'leave': '请假' };
  return map[status] || '出席';
}

// 与修复后 js/app.js getAttendanceStats 完全相同的算法（统一口径唯一源）
function getAttendanceStats(memberId, activities) {
  let present = 0, absent = 0, late = 0, sub = 0, leave = 0, total = 0;
  (activities || []).forEach(act => {
    const attendee = (act.attendees || []).find(a => a.member_id === memberId);
    if (!attendee) return;
    total++;
    switch (attendee.status) {
      case '出席': present++; break;
      case '缺席': absent++; break;
      case '迟到': late++; present++; break;
      case '替补': sub++; present++; break;
      case '请假': leave++; break;
    }
  });
  const rate = total > 0 ? Math.round((present / total) * 100) : 0;
  return { present, absent, late, sub, leave, total, rate };
}

// 与修复后 getAttendanceRankings 相同（Top5 / 统计报表）
function getAttendanceRankings(members, activities) {
  return members.filter(m => m.status !== '离队')
    .map(member => ({ name: member.name, ...getAttendanceStats(member.id, activities) }))
    .sort((a, b) => b.rate - a.rate || b.present - a.present);
}

// 与修复后 getMemberAttendanceRate 相同（成员列表）
function getMemberAttendanceRate(memberId, activities) {
  return getAttendanceStats(memberId, activities).rate;
}

async function main() {
  const stamp = Date.now().toString(36);
  let guildId = null;
  const memberIds = [];
  const activityIds = [];
  try {
    console.log('===== 准备测试数据（service_role 直连） =====');
    // 需要一个 owner 用户：复用任意既有 guild_members 的 user_id 不可控，直接造一个 auth 用户
    const email = `diag-rate-${stamp}@example.com`;
    const su = await fetch(`${URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Diag-Rate-2026!', data: {} }),
    });
    const sb = await su.json();
    const uid = sb.user ? sb.user.id : null;
    if (!uid) throw new Error('创建测试用户失败: ' + JSON.stringify(sb));

    const g = await svc('POST', '/rest/v1/guilds', { name: `DIAG-RATE-${stamp}`, owner_id: uid, invite_code: `R${stamp}`.slice(0, 8) });
    guildId = g[0].id;
    await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: uid, role: 'owner' });

    for (const name of ['Diag甲', 'Diag乙', 'Diag丙']) {
      const r = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name, class: '战士', spec: '武器', role: 'dps' });
      memberIds.push(r[0].id);
    }
    // 活动1：甲/乙出席（丙尚未加入，无记录）；活动2：甲缺席，乙请假，丙替补
    const actDefs = [
      { date: '2026-07-20', rows: [{ m: 0, s: 'present' }, { m: 1, s: 'present' }] },
      { date: '2026-07-22', rows: [{ m: 0, s: 'absent' }, { m: 1, s: 'leave' }, { m: 2, s: 'backup' }] },
    ];
    for (const def of actDefs) {
      const a = await svc('POST', '/rest/v1/activities', { guild_id: guildId, name: 'DIAG活动', activity_date: def.date, raid: '虚影尖塔', boss: '' });
      activityIds.push(a[0].id);
      await svc('POST', '/rest/v1/activity_attendance', def.rows.map(r => ({ activity_id: a[0].id, member_id: memberIds[r.m], status: r.s })));
    }

    console.log('===== 按 cloud.js 相同方式读取并映射 =====');
    const membersRes = await svc('GET', `/rest/v1/raid_members?guild_id=eq.${guildId}&select=*`);
    const activitiesRes = await svc('GET', `/rest/v1/activities?guild_id=eq.${guildId}&select=*`);
    const attRes = await svc('GET', `/rest/v1/activity_attendance?activity_id=in.(${activityIds.join(',')})&select=*`);
    console.log(`原始考勤行数: ${attRes.length}（期望 5）`);
    console.log('原始考勤状态值:', JSON.stringify(attRes.map(r => r.status)));

    const members = membersRes.map(m => ({ id: m.id, name: m.name, status: '正式' }));
    const activities = activitiesRes.map(a => ({
      id: a.id,
      attendees: attRes.filter(at => at.activity_id === a.id).map(at => ({ member_id: at.member_id, status: mapStatusFromDb(at.status) })),
    }));

    console.log('\n===== 算法 A：getAttendanceRankings（Top5 / 统计报表） =====');
    const rankings = getAttendanceRankings(members, activities);
    rankings.forEach(r => console.log(`${r.name}: rate=${r.rate}% (present=${r.present}, sub=${r.sub}, absent=${r.absent}, leave=${r.leave}, total=${r.total})`));

    console.log('\n===== 算法 B：getMemberAttendanceRate（成员列表） =====');
    members.forEach(m => console.log(`${m.name}: rate=${getMemberAttendanceRate(m.id, activities)}%`));

    console.log('\n===== 期望（统一口径）：甲 50%（出席1/应到2）、乙 50%（出席1/应到2，请假计入应到）、丙 100%（替补1/应到1，活动1未加入不计入应到） =====');
    const exp = { 'Diag甲': 50, 'Diag乙': 50, 'Diag丙': 100 };
    const ok = rankings.every(r => r.rate === exp[r.name]) &&
      members.every(m => getMemberAttendanceRate(m.id, activities) === exp[m.name]);
    console.log(ok ? '结论：修复后算法三处同源，输出与统一口径完全一致 ✓' : '结论：算法输出与统一口径不符 ✗（见上）');
    process.exitCode = ok ? 0 : 1;
  } finally {
    console.log('\n===== 清理测试数据 =====');
    try {
      if (activityIds.length) await svc('DELETE', `/rest/v1/activity_attendance?activity_id=in.(${activityIds.join(',')})`);
      if (activityIds.length) await svc('DELETE', `/rest/v1/activities?id=in.(${activityIds.join(',')})`);
      if (memberIds.length) await svc('DELETE', `/rest/v1/raid_members?id=in.(${memberIds.join(',')})`);
      if (guildId) {
        await svc('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
        await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
      }
      console.log('测试数据已删除（测试 auth 用户保留，无业务数据关联）');
    } catch (e) {
      console.log('清理失败（需人工检查）:', e.message);
    }
  }
}

main().catch(e => { console.error('诊断脚本失败:', e.message); process.exit(1); });
