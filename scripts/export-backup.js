// 一次性数据抢救导出脚本（只读）
// 从 .env 读取 Supabase 连接信息，导出全部业务表到 backup/2026-07-25/
// 用法: node scripts/export-backup.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'backup', '2026-07-25');
const PAGE_SIZE = 1000;

const TABLES = [
  'guilds',
  'guild_members',
  'raid_members',
  'activities',
  'activity_attendance',
  'loot_records',
  'wishlists',
  'notifications',
  'user_profiles',
  'user_characters',
];

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

async function fetchTable(baseUrl, key, table) {
  const rows = [];
  let offset = 0;
  while (true) {
    const url = `${baseUrl}/rest/v1/${table}?select=*`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${offset}-${offset + PAGE_SIZE - 1}`,
      },
    });
    if (res.status === 404) {
      return { skipped: true, reason: `HTTP 404 (表不存在)` };
    }
    if (!res.ok) {
      const body = await res.text();
      // 不打印 body 全文，避免泄露敏感信息
      return { skipped: true, reason: `HTTP ${res.status} (响应长度 ${body.length} 字节)` };
    }
    const page = await res.json();
    if (!Array.isArray(page)) {
      return { skipped: true, reason: '响应不是 JSON 数组' };
    }
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return { skipped: false, rows };
}

(async () => {
  const env = loadEnv();
  const baseUrl = env.SUPABASE_URL && env.SUPABASE_URL.replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) {
    console.error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY，终止。');
    process.exit(1);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const summary = { exportedAt: new Date().toISOString(), tables: {} };
  let totalRows = 0;

  for (const table of TABLES) {
    try {
      const result = await fetchTable(baseUrl, key, table);
      if (result.skipped) {
        summary.tables[table] = { status: 'skipped', reason: result.reason };
        console.log(`跳过 ${table}: ${result.reason}`);
        continue;
      }
      const file = path.join(BACKUP_DIR, `${table}.json`);
      fs.writeFileSync(file, JSON.stringify(result.rows, null, 2), 'utf8');
      summary.tables[table] = { status: 'ok', rows: result.rows.length };
      totalRows += result.rows.length;
      console.log(`导出 ${table}: ${result.rows.length} 行`);
    } catch (err) {
      summary.tables[table] = { status: 'error', reason: err.message };
      console.log(`失败 ${table}: ${err.message}`);
    }
  }

  summary.totalRows = totalRows;
  fs.writeFileSync(path.join(BACKUP_DIR, '_summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\n完成。总行数: ${totalRows}，备份目录: backup/2026-07-25/`);
})().catch((err) => {
  console.error('脚本异常终止:', err.message);
  process.exit(1);
});
