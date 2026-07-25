// TODO-002 / DROP feishu_configs 前置只读诊断（不写库）：
// 1) activities 中 start_time 为 NULL 或空串的行数（回填目标范围）
// 2) feishu_configs 表是否存在、行数
// 3) 扫描全部候选遗留表的存在性与行数，供"零引用遗留表"报告
// 用法: node scripts/diagnose-db-cleanup.js
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

async function tryGet(restPath) {
  const res = await fetch(`${URL}${restPath}`, { headers: SVC });
  if (res.status === 404 || res.status === 400) return { exists: false, status: res.status };
  if (!res.ok) return { exists: 'unknown', status: res.status, err: await res.text() };
  return { exists: true, rows: await res.json() };
}

async function main() {
  // 1) 回填目标行数
  const acts = await tryGet('/rest/v1/activities?select=id,start_time,end_time,activity_date');
  if (acts.exists === true) {
    const nullTime = acts.rows.filter(a => a.start_time === null || a.start_time === '');
    console.log(`[1] activities 总行数: ${acts.rows.length}`);
    console.log(`    start_time 为 NULL/空 的行数（回填目标）: ${nullTime.length}`);
    console.log(`    涉及日期: ${JSON.stringify(nullTime.map(a => a.activity_date).sort())}`);
    const withTime = acts.rows.filter(a => a.start_time && a.start_time !== '');
    console.log(`    已有时间的行数（不动）: ${withTime.length}`);
  } else {
    console.log('[1] activities 读取失败', acts.status);
  }

  // 2) feishu_configs
  const fc = await tryGet('/rest/v1/feishu_configs?select=id');
  console.log(`\n[2] feishu_configs: ${fc.exists === true ? `存在，行数 ${fc.rows.length}` : fc.exists === false ? `不存在（HTTP ${fc.status}）` : `状态未知 ${fc.status}`}`);

  // 3) 遗留表候选扫描（sql/01_tables.sql 有但代码零引用的表）
  const candidates = ['loots', 'guild_invite_codes', 'feishu_configs', 'guilds', 'guild_members', 'raid_members', 'activities', 'activity_attendance', 'loot_records', 'wishlists', 'notifications', 'user_profiles', 'user_characters'];
  console.log('\n[3] 表存在性扫描:');
  for (const t of candidates) {
    const r = await tryGet(`/rest/v1/${t}?select=*&limit=1`);
    if (r.exists === true) {
      // 只取 count
      const cnt = await fetch(`${URL}/rest/v1/${t}?select=id`, { headers: { ...SVC, Prefer: 'count=exact', Range: '0-0' } });
      const range = cnt.headers.get('content-range') || '';
      console.log(`    ${t}: 存在，${range.split('/')[1] || '?'} 行`);
    } else {
      console.log(`    ${t}: ${r.exists === false ? `不存在（HTTP ${r.status}）` : `状态未知 ${r.status}`}`);
    }
  }
}

main().catch(e => { console.error('诊断失败:', e.message); process.exit(1); });
