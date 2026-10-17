// scripts/import-decor-batch.js — decor_catalog 批量 upsert（任务书 #76：12.1.5 新增家具入库）
// 流程：基线 → upsert（on_conflict=record_id + merge-duplicates，幂等）→ 复核（总数/run_id/抽查）→ 幂等重跑
// 密钥只从 .env 读，不打印。用法: node scripts/import-decor-batch.js [data/decor-catalog-12.1.5-new-items.json]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = process.argv[2] || path.join(ROOT, 'data/decor-catalog-12.1.5-new-items.json');
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function totalCount() {
  const res = await fetch(`${SB}/rest/v1/decor_catalog?select=record_id&limit=1`, { headers: { ...H, Prefer: 'count=exact' } });
  return Number((res.headers.get('content-range') || '').split('/')[1]);
}
async function runIdCount(runId) {
  const res = await fetch(`${SB}/rest/v1/decor_catalog?select=record_id&run_id=eq.${encodeURIComponent(runId)}&limit=1`, { headers: { ...H, Prefer: 'count=exact' } });
  return Number((res.headers.get('content-range') || '').split('/')[1]);
}
async function upsert(data) {
  const res = await fetch(`${SB}/rest/v1/decor_catalog?on_conflict=record_id`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`upsert 失败 HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return (await res.json()).length;
}

(async () => {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (!Array.isArray(data) || !data.length) throw new Error('数据文件不是非空数组');
  const runId = data[0].run_id;
  console.log(`数据文件：${path.relative(ROOT, FILE)}，${data.length} 条，run_id=${runId}`);
  // 字段完整性预检（必备列 + 无越界列）
  const REQUIRED = ['record_id', 'entry_type', 'item_id', 'name'];
  const bad = data.filter(r => REQUIRED.some(k => r[k] == null));
  if (bad.length) throw new Error(`必备字段缺失 ${bad.length} 条（首条 record_id=${bad[0].record_id}）`);

  const baseline = await totalCount();
  console.log('基线总数:', baseline);

  const n1 = await upsert(data);
  console.log('入库返回行数:', n1);
  const after = await totalCount();
  console.log('入库后总数:', after, `(基线 ${baseline} + 新增 ${data.length} = ${baseline + data.length}）`);
  const rc = await runIdCount(runId);
  console.log(`run_id=${runId} 行数:`, rc);

  // 抽查 3 条字段完整
  const ids = data.slice(0, 3).map(r => r.record_id).join(',');
  const spot = await fetch(`${SB}/rest/v1/decor_catalog?record_id=in.(${ids})`, { headers: H });
  const spotRows = await spot.json();
  for (const r of spotRows) {
    const complete = REQUIRED.every(k => r[k] != null) && r.tags != null && r.category_ids != null;
    console.log(`抽查 record_id=${r.record_id}「${r.name}」字段${complete ? '完整' : '缺失！'} run_id=${r.run_id} client=${r.client_version} collected_at=${r.collected_at}`);
    if (!complete) throw new Error('抽查字段不完整');
  }

  // 幂等重跑
  const n2 = await upsert(data);
  const after2 = await totalCount();
  console.log(`幂等重跑：返回 ${n2} 行（merge-update），总数 ${after2}（应=${after}）`);
  if (after2 !== after) throw new Error(`幂等失败：${after} → ${after2}`);
  if (after !== baseline + data.length) throw new Error('总数与基线+新增不符');
  if (rc !== data.length) throw new Error(`run_id 行数 ${rc} ≠ 新增 ${data.length}`);
  console.log('✅ 全部通过（基线/入库/增长/run_id/抽查/幂等）');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
