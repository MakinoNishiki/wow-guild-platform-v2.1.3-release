// 任务书 #28 WP6-F1 值域审计：现役公示装备（308）slot × item_type 交叉分布
// 只读：anon POST /rest/v1/rpc/get_public_loot_detail（与公示页同一口径，含杂项/装饰品/世界BOSS剔除）
// 用法: node scripts/audit-wp6-slot-type.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;

(async () => {
  const res = await fetch(`${SB}/rest/v1/rpc/get_public_loot_detail`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const rows = await res.json();

  const bySource = { raid: 0, dungeon: 0 };
  const cross = {}; // slot -> item_type -> count
  const samples = {}; // slot|item_type -> [item_name]
  for (const r of rows) {
    bySource[r.source] = (bySource[r.source] || 0) + 1;
    const s = r.slot || '(null)', t = r.item_type || '(null)';
    (cross[s] = cross[s] || {})[t] = ((cross[s] || {})[t] || 0) + 1;
    const k = `${s}|${t}`;
    (samples[k] = samples[k] || []).length < 4 && samples[k].push(r.item_name);
  }

  console.log(`总数 ${rows.length} | 团本 ${bySource.raid || 0} | 大秘境 ${bySource.dungeon || 0}`);
  console.log('\nslot × item_type 交叉分布：');
  const slots = Object.keys(cross).sort();
  for (const s of slots) {
    const types = cross[s];
    const total = Object.values(types).reduce((a, b) => a + b, 0);
    console.log(`\n[slot] ${s}（共 ${total}）`);
    for (const t of Object.keys(types).sort()) {
      console.log(`   ${t}: ${types[t]}  例: ${samples[`${s}|${t}`].join('、')}`);
    }
  }

  // 重点关注：主手/副手/远程/法杖/盾牌/饰品 落法
  console.log('\n重点落法核对：');
  const focus = ['主手', '副手', '远程', '法杖', '盾牌', '饰品', '单手', '双手'];
  for (const f of focus) {
    const hitSlot = slots.filter(s => s.includes(f));
    const hitType = new Set();
    for (const s of slots) for (const t of Object.keys(cross[s])) if (t.includes(f)) hitType.add(t);
    console.log(`  "${f}": slot含=${hitSlot.length ? hitSlot.join(',') : '无'} | item_type含=${[...hitType].join(',') || '无'}`);
  }
  // 全部 item_type 值域
  const allTypes = new Set();
  for (const s of slots) for (const t of Object.keys(cross[s])) allTypes.add(t);
  console.log(`\nitem_type 全值域（${allTypes.size}）: ${[...allTypes].sort().join(' / ')}`);
  console.log(`slot 全值域（${slots.length}）: ${slots.join(' / ')}`);
})().catch(e => { console.error(e.message); process.exit(1); });
