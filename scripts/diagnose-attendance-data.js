// BUG-014 诊断（只读）：扫描真实数据库 activity_attendance 的异常数据形态
// 检查项：1) 同一 (activity_id, member_id) 重复行；2) 孤儿行（activity 已删）；
//         3) member_id 指向已删成员；4) 非法 status 值。
// 输出只含行数与 id 片段，不含任何个人信息。用法: node scripts/diagnose-attendance-data.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = env.SUPABASE_URL.replace(/\/+$/, '');
const SVC = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

async function getAll(restPath) {
  const out = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const res = await fetch(`${URL}${restPath}`, { headers: { ...SVC, Range: `${from}-${from + page - 1}` } });
    if (!res.ok) throw new Error(`GET ${restPath} -> ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < page) break;
    from += page;
  }
  return out;
}

async function main() {
  const att = await getAll('/rest/v1/activity_attendance?select=activity_id,member_id,status');
  const acts = await getAll('/rest/v1/activities?select=id');
  const members = await getAll('/rest/v1/raid_members?select=id');
  console.log(`activity_attendance 总行数: ${att.length}；activities: ${acts.length}；raid_members: ${members.length}`);

  const actIds = new Set(acts.map(a => a.id));
  const memberIds = new Set(members.map(m => m.id));

  // 1) 重复 (activity_id, member_id)
  const byKey = {};
  att.forEach(r => {
    const k = `${r.activity_id}|${r.member_id}`;
    (byKey[k] = byKey[k] || []).push(r.status);
  });
  const dups = Object.entries(byKey).filter(([, v]) => v.length > 1);
  console.log(`\n[1] 重复 (activity, member) 组合: ${dups.length}`);
  dups.slice(0, 10).forEach(([k, v]) => {
    const [a, m] = k.split('|');
    console.log(`  activity=${a.slice(0, 8)}… member=${m.slice(0, 8)}… 行数=${v.length} 状态=[${v.join(', ')}]`);
  });
  const conflictDups = dups.filter(([, v]) => new Set(v).size > 1);
  console.log(`  其中状态互相冲突（既出席又缺席等）: ${conflictDups.length}`);

  // 2) 孤儿行
  const orphans = att.filter(r => !actIds.has(r.activity_id));
  console.log(`\n[2] 孤儿考勤行（活动已删除）: ${orphans.length}`);

  // 3) 成员已删
  const dangling = att.filter(r => !memberIds.has(r.member_id));
  console.log(`\n[3] 成员已删除的考勤行: ${dangling.length}`);

  // 4) 非法 status
  const valid = new Set(['present', 'absent', 'late', 'backup', 'leave']);
  const bad = att.filter(r => !valid.has(r.status));
  console.log(`\n[4] 非法 status 行: ${bad.length}${bad.length ? ' 值=' + JSON.stringify([...new Set(bad.map(r => r.status))]) : ''}`);

  // 5) 重复行涉及的活动分布
  if (dups.length) {
    const dupActIds = [...new Set(dups.map(([k]) => k.split('|')[0]))];
    const actRows = await getAll(`/rest/v1/activities?id=in.(${dupActIds.join(',')})&select=id,guild_id,activity_date`);
    const guildCount = {};
    actRows.forEach(a => { guildCount[a.guild_id] = (guildCount[a.guild_id] || 0) + 1; });
    console.log(`\n[5] 含重复考勤的活动数: ${actRows.length}，涉及公会数: ${Object.keys(guildCount).length}`);
    console.log('  活动日期分布:', JSON.stringify(actRows.map(a => a.activity_date).sort()));
  }
}

main().catch(e => { console.error('诊断失败:', e.message); process.exit(1); });
