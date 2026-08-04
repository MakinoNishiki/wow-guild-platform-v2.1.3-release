// 任务书 #18 WP2 迁移前手动备份：guilds 表全量导出（只读）
// 用法: node scripts/backup-guilds-pre-task18.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'backup', '2026-08-04-task18-pre-migration');

const env = {};
for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY };

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const rows = [];
  let offset = 0;
  while (true) {
    const res = await fetch(`${SB}/rest/v1/guilds?select=*`, {
      headers: { ...H, Range: `${offset}-${offset + 999}` },
    });
    if (!res.ok) throw new Error(`导出失败 HTTP ${res.status}: ` + (await res.text()).slice(0, 200));
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  const file = path.join(OUT_DIR, 'guilds.json');
  fs.writeFileSync(file, JSON.stringify(rows, null, 2), 'utf8');
  console.log(`已备份 guilds：${rows.length} 行 → ${file}`);
})().catch(e => { console.error(e); process.exit(1); });
