// 任务书 #27 WP2 迁移前备份：activity_attendance / loots / raid_members 三表 JSON 导出
// 输出：backup/2026-08-06-task27-pre-migration/<table>.json（service role 只读导出，零写入）
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'backup', '2026-08-06-task27-pre-migration');
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const SVC = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const table of ['activity_attendance', 'loot_records', 'loots', 'raid_members']) {
    let rows = [], from = 0;
    while (true) { // 分页全量
      const res = await fetch(`${SB}/rest/v1/${table}?select=*&offset=${from}&limit=1000`, { headers: SVC });
      if (res.status === 404) { console.log(`${table}: 表不存在（真实库已移除），跳过`); rows = null; break; }
      if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
      const batch = await res.json();
      rows = rows.concat(batch);
      if (batch.length < 1000) break;
      from += 1000;
    }
    if (rows === null) continue;
    fs.writeFileSync(path.join(OUT, `${table}.json`), JSON.stringify(rows, null, 2), 'utf8');
    console.log(`${table}: ${rows.length} 行已导出`);
  }
  console.log('备份目录:', OUT);
})().catch(e => { console.error(e); process.exit(1); });
