// 任务书 #14-补丁3 诊断：9 张主数据表行数 + 全表测试垃圾排查 + tier_sets 现状
// 用法: node scripts/diagnose-md-patch3.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const SVC = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

const TABLES = ['game_patches', 'game_seasons', 'game_raids', 'game_bosses', 'boss_loot', 'tier_sets', 'game_dungeons', 'game_classes', 'game_specs'];
const NAME_COLS = { game_patches: ['version', 'name'], game_seasons: ['name'], game_raids: ['name'], game_bosses: ['name'], boss_loot: ['item_name', 'slot', 'item_type', 'effect'], tier_sets: ['set_name'], game_dungeons: ['name'], game_classes: ['name_zh', 'name_en'], game_specs: ['name_zh', 'name_en'] };

async function svcGet(restPath) {
  const res = await fetch(`${SB}${restPath}`, { headers: SVC });
  const body = await res.json();
  if (!Array.isArray(body)) throw new Error(`${restPath} -> ${JSON.stringify(body)}`);
  return body;
}

(async () => {
  console.log('== 9 表行数 ==');
  const dump = {};
  for (const t of TABLES) {
    const rows = await svcGet(`/rest/v1/${t}?select=*`);
    dump[t] = rows;
    console.log(`${t}: ${rows.length}`);
  }

  console.log('\n== 全表可疑行（zzz/test/测试/asdf/qwe，不区分大小写） ==');
  let found = 0;
  for (const t of TABLES) {
    for (const row of dump[t]) {
      const hit = (NAME_COLS[t] || []).some(col => /zzz|test|测试|asdf|qwe/i.test(String(row[col] || '')));
      if (hit) { found++; console.log(`[${t}] ${JSON.stringify(row)}`); }
    }
  }
  if (!found) console.log('（无）');

  console.log('\n== game_seasons ==');
  dump.game_seasons.forEach(s => console.log(JSON.stringify(s)));

  console.log('\n== tier_sets 全量 ==');
  const cName = id => (dump.game_classes.find(c => c.id === id) || {}).name_zh || id;
  const sName = id => (dump.game_specs.find(s => s.id === id) || {}).name_zh || id;
  const seaName = id => (dump.game_seasons.find(s => s.id === id) || {}).name || id;
  dump.tier_sets.forEach(t => console.log(`${seaName(t.season_id)} | ${cName(t.class_id)} | ${sName(t.spec_id)} | 套装名=${t.set_name || '(空)'} | 2件=${t.bonus_2 || '-'} | 4件=${t.bonus_4 || '-'}`));
  if (!dump.tier_sets.length) console.log('（空表）');
})().catch(e => { console.error(e); process.exit(1); });
