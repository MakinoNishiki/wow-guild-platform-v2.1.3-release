// TODO-002（已定方案 A）：旧活动时间回填
// 对 activities 表中 start_time 为 NULL 或空串的历史行，回填 start_time='20:00'、end_time='23:00'。
// 执行前后各输出一次受影响行数；不触碰已有时间的任何行。
// 用法: node scripts/backfill-activity-time.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = env.SUPABASE_URL.replace(/\/+$/, '');
const SVC = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };

const TARGET_FILTER = 'or=(start_time.is.null,start_time.eq.)';

async function countTargets() {
  const res = await fetch(`${URL}/rest/v1/activities?select=id,activity_date&${TARGET_FILTER}`, { headers: SVC });
  if (!res.ok) throw new Error(`查询失败 ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const before = await countTargets();
  console.log(`回填前 start_time 为 NULL/空 的行数: ${before.length}`);
  console.log(`涉及日期: ${JSON.stringify(before.map(r => r.activity_date).sort())}`);
  if (before.length === 0) {
    console.log('无需回填，结束。');
    return;
  }

  const res = await fetch(`${URL}/rest/v1/activities?${TARGET_FILTER}`, {
    method: 'PATCH',
    headers: { ...SVC, Prefer: 'return=representation' },
    body: JSON.stringify({ start_time: '20:00', end_time: '23:00' }),
  });
  if (!res.ok) throw new Error(`回填失败 ${res.status}: ${await res.text()}`);
  const updated = await res.json();
  console.log(`已回填行数: ${updated.length}`);

  const after = await countTargets();
  console.log(`回填后 start_time 为 NULL/空 的行数: ${after.length}`);
  console.log(after.length === 0 ? 'TODO-002 回填完成 ✓' : '仍有未回填行 ✗（需人工检查）');
  process.exitCode = after.length === 0 ? 0 : 1;
}

main().catch(e => { console.error('回填脚本失败:', e.message); process.exit(1); });
