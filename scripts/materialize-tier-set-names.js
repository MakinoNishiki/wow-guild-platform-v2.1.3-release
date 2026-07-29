// 任务书 #14-补丁3 第四项：套装名物化
// 把 tier_sets 中职业级行（spec_id 为 null）的套装名真实写入该职业全部专精行（S1/S2 分别处理），
// 2件/4件效果一并复制为各专精行初值（12.1 起效果按专精区分，运营后续按专精微调），
// 物化完成后删除 spec_id 为 null 的职业级占位行（删除前打印备份）。
// 幂等：spec 行已存在则仅更新套装名/效果（不覆盖人工已改的差异？——不，物化以职业级行值为准一次性铺平）。
// 用法: node scripts/materialize-tier-set-names.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const SVC = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json', Prefer: 'return=representation'
};

async function svc(method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (!res.ok) throw new Error(`${method} ${restPath} -> ${res.status} ${text}`);
  return parsed;
}

(async () => {
  const seasons = await svc('GET', '/rest/v1/game_seasons?select=id,name');
  const classes = await svc('GET', '/rest/v1/game_classes?select=id,name_zh');
  const specs = await svc('GET', '/rest/v1/game_specs?select=id,name_zh,class_id');
  const tiers = await svc('GET', '/rest/v1/tier_sets?select=*');

  const classRows = tiers.filter(t => t.set_name); // 有套装名的行（职业级 spec_id=null，或历史专精行）
  let inserted = 0, updated = 0;
  for (const season of seasons) {
    for (const cls of classes) {
      // 该 赛季×职业 的套装名来源：优先 spec_id=null 的职业级行，其次任意已有专精行
      const rows = tiers.filter(t => t.season_id === season.id && t.class_id === cls.id && t.set_name);
      if (!rows.length) continue;
      const src = rows.find(t => !t.spec_id) || rows[0];
      const classSpecs = specs.filter(s => s.class_id === cls.id);
      for (const spec of classSpecs) {
        const existing = tiers.find(t => t.season_id === season.id && t.class_id === cls.id && t.spec_id === spec.id);
        if (existing) {
          if (existing.set_name !== src.set_name || existing.bonus_2 !== src.bonus_2 || existing.bonus_4 !== src.bonus_4) {
            await svc('PATCH', `/rest/v1/tier_sets?id=eq.${existing.id}`, { set_name: src.set_name, bonus_2: src.bonus_2, bonus_4: src.bonus_4 });
            updated++;
          }
        } else {
          await svc('POST', '/rest/v1/tier_sets', { season_id: season.id, class_id: cls.id, spec_id: spec.id, set_name: src.set_name, bonus_2: src.bonus_2, bonus_4: src.bonus_4 });
          inserted++;
        }
      }
      console.log(`${season.name} ${cls.name_zh}: 「${src.set_name}」→ ${classSpecs.length} 个专精行`);
    }
  }

  // 删除职业级占位行（spec_id 为 null），先打印备份
  const orphans = tiers.filter(t => !t.spec_id);
  if (orphans.length) {
    console.log('\n== 删除 spec_id=null 职业级占位行（备份如下） ==');
    orphans.forEach(t => console.log(JSON.stringify(t)));
    await svc('DELETE', '/rest/v1/tier_sets?spec_id=is.null');
  }

  const after = await svc('GET', '/rest/v1/tier_sets?select=id');
  console.log(`\n完成：新增 ${inserted} 行、更新 ${updated} 行、删除占位行 ${orphans.length} 行；tier_sets 现共 ${after.length} 行`);
})().catch(e => { console.error(e); process.exit(1); });
