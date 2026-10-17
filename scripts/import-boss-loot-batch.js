// scripts/import-boss-loot-batch.js — 12.1.5 副本掉落入库（任务书 #78：基希克斯破封 + 8 大米本）
// 管道：Exporter SavedVariables → wjdc_convert.py → 范围过滤 → 入库
//   ①字典：game_raids/game_bosses 基希克斯破封/基希克斯 先查后插（S2 当前赛季）
//   ②boss_loot：基希克斯 10 件（剔装饰/垃圾）——本表无业务唯一索引，幂等=先查后插（非 upsert）
//   ③dungeon_loot：8 大米 207 件（剔装饰/配方类 17 件）——upsert on_conflict=dungeon_id,boss_id,item_name
//     （该表真实唯一索引 uq_dungeon_loot_item，通知的 on_conflict=official_item_id 两表均不可用，已按实证修正）
// 密钥只从 .env 读。用法: node scripts/import-boss-loot-batch.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'backup/2026-10-17-task78');
const DUMP = 'C:/Azeroth/World of Warcraft/_retail_/WTF/Account/208457004#1/SavedVariables/WoWButlerExporter.lua';
const RAID_NAME = '基希克斯破封';
const BOSS_NAME = '基希克斯';
const NON_EQUIP_TYPES = new Set(['装饰', '垃圾', '宠物小伙伴', '装饰品', '配方', '裁缝', '附魔', '制皮', '锻造', '珠宝加工', '环境对应兑换物']);

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };

async function rest(method, restPath, body, prefer) {
  const res = await fetch(`${SB}${restPath}`, {
    method, headers: { ...H, Prefer: prefer || 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (!res.ok) throw new Error(`${method} ${restPath} → HTTP ${res.status}: ${text.slice(0, 400)}`);
  return parsed;
}
const totalCount = async (table) => Number(((await (await fetch(`${SB}/rest/v1/${table}?select=id&limit=1`, { headers: { ...H, Prefer: 'count=exact' } })).headers.get('content-range')) || '').split('/')[1]);

(async () => {
  // ① 字典：基希克斯破封 raid 先查后插
  let raids = await rest('GET', `/rest/v1/game_raids?name=eq.${encodeURIComponent(RAID_NAME)}&select=*`);
  let raid = Array.isArray(raids) && raids[0];
  if (!raid) {
    const season = await rest('GET', '/rest/v1/game_seasons?is_current=eq.true&select=id,name&limit=1');
    raid = (await rest('POST', '/rest/v1/game_raids', {
      name: RAID_NAME, season_id: season[0].id, type: 'raid',
      min_players: 20, max_players: 20, max_difficulty: '史诗',
      open_date: '2026-10-15', sort_order: 6,
    }))[0];
    console.log('① 新建 game_raids：', raid.name, raid.id, `(赛季=${season[0].name})`);
  } else {
    console.log('① 复用 game_raids：', raid.name, raid.id);
  }
  let bosses = await rest('GET', `/rest/v1/game_bosses?raid_id=eq.${raid.id}&name=eq.${encodeURIComponent(BOSS_NAME)}&select=*`);
  let boss = Array.isArray(bosses) && bosses[0];
  if (!boss) {
    boss = (await rest('POST', '/rest/v1/game_bosses', { raid_id: raid.id, name: BOSS_NAME, boss_order: 1 }))[0];
    console.log('① 新建 game_bosses：', boss.name, boss.id);
  } else {
    console.log('① 复用 game_bosses：', boss.name, boss.id);
  }

  // ② 重导字典（新 raid/boss 入列）+ 重跑转换器（基希克斯破封 不再入待匹配清单）
  const dictExp = spawnSync(process.execPath, ['backup/_pytmp/export-dict-existing.js'], { cwd: ROOT, encoding: 'utf8' });
  if (dictExp.status !== 0) throw new Error('字典重导失败：' + (dictExp.stderr || '').slice(0, 300));
  const conv = spawnSync('python', ['scripts/wjdc_convert.py', '--input', DUMP, '--dict', path.join(OUT, 'dict.json'), '--existing', path.join(OUT, 'existing.json'), '--outdir', OUT], { cwd: ROOT, encoding: 'utf8' });
  if (conv.status !== 0) throw new Error('wjdc_convert 失败：' + (conv.stderr || conv.stdout).slice(0, 400));
  const bossLoad = JSON.parse(fs.readFileSync(path.join(OUT, 'boss_loot_load.json'), 'utf8'));
  const dunLoad = JSON.parse(fs.readFileSync(path.join(OUT, 'dungeon_loot_load.json'), 'utf8'));

  const bossRows = bossLoad.filter(r => r.boss_id === boss.id && !NON_EQUIP_TYPES.has(r.item_type));
  const dunRows = dunLoad.filter(r => !NON_EQUIP_TYPES.has(r.item_type));
  const bossExcluded = bossLoad.filter(r => r.boss_id === boss.id && NON_EQUIP_TYPES.has(r.item_type));
  console.log(`② 数据集：基希克斯 ${bossRows.length} 件（剔除非装备 ${bossExcluded.length}）+ 大米 ${dunRows.length} 件（剔除非装备 ${dunLoad.length - dunRows.length}）`);
  if (bossRows.length !== 10 || dunRows.length !== 207) {
    console.log(`⚠️ 与任务书预期（10+207=217）不符，请核查后再跑（当前 ${bossRows.length}+${dunRows.length}）`);
  }

  // ③ boss_loot 基线 + 幂等先查后插（本表无业务唯一索引，不能 upsert on_conflict=official_item_id）
  const bossBaseline = await totalCount('boss_loot');
  const dunBaseline = await totalCount('dungeon_loot');
  console.log(`③ 基线：boss_loot=${bossBaseline} dungeon_loot=${dunBaseline}`);
  const existingBossRows = await rest('GET', `/rest/v1/boss_loot?boss_id=eq.${boss.id}&select=item_name`);
  const existingNames = new Set((Array.isArray(existingBossRows) ? existingBossRows : []).map(r => r.item_name));
  const toInsert = bossRows.filter(r => !existingNames.has(r.item_name));
  if (toInsert.length) {
    await rest('POST', '/rest/v1/boss_loot', toInsert);
    console.log(`③ boss_loot 新插入 ${toInsert.length} 行（跳过已存在 ${bossRows.length - toInsert.length}）`);
  } else {
    console.log('③ boss_loot 无新增（全部已存在，幂等跳过）');
  }

  // ④ dungeon_loot upsert（真实唯一索引三键）
  const dunRes = await fetch(`${SB}/rest/v1/dungeon_loot?on_conflict=dungeon_id,boss_id,item_name`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(dunRows),
  });
  if (!dunRes.ok) throw new Error(`dungeon upsert 失败 HTTP ${dunRes.status}: ${(await dunRes.text()).slice(0, 400)}`);
  const dunReturned = (await dunRes.json()).length;
  console.log(`④ dungeon_loot upsert 返回 ${dunReturned} 行（merge-duplicates）`);

  // ⑤ 复核
  const bossAfter = await totalCount('boss_loot');
  const dunAfter = await totalCount('dungeon_loot');
  console.log(`⑤ 入库后：boss_loot=${bossAfter}（基线 ${bossBaseline} + 新插 ${toInsert.length} = ${bossBaseline + toInsert.length}） dungeon_loot=${dunAfter}（基线 ${dunBaseline} + 净增 ${dunAfter - dunBaseline}）`);
  const kith = await rest('GET', `/rest/v1/boss_loot?boss_id=eq.${boss.id}&select=item_name,slot,item_type,official_item_id,ilvl,icon_id&order=item_name`);
  console.log(`⑤ 基希克斯破封在库 ${kith.length} 件：`);
  for (const r of kith) console.log(`   ${r.item_name} | ${r.slot}/${r.item_type} | itemID=${r.official_item_id} | ilvl=${r.ilvl} | icon=${r.icon_id}`);
  const spot = kith.find(r => r.item_name === '露瑟拉玛，圣光之裁');
  console.log('⑤ 抽查「露瑟拉玛，圣光之裁」:', spot ? `在库（${spot.slot}/${spot.item_type}，ilvl=${spot.ilvl}）` : '缺失！');
  if (kith.length !== 10 || !spot) throw new Error('基希克斯破封在库数或抽查不符');

  // ⑥ 幂等实测：重跑 boss 先查后插 + dungeon upsert，计数不得再变
  const existing2 = await rest('GET', `/rest/v1/boss_loot?boss_id=eq.${boss.id}&select=item_name`);
  const names2 = new Set((Array.isArray(existing2) ? existing2 : []).map(r => r.item_name));
  const toInsert2 = bossRows.filter(r => !names2.has(r.item_name));
  console.log('⑥ 幂等重跑：boss_loot 应插数 = ' + toInsert2.length + '（须=0）');
  if (toInsert2.length !== 0) throw new Error('boss 幂等失败：仍有 ' + toInsert2.length + ' 条待插');
  const dunRes2 = await fetch(`${SB}/rest/v1/dungeon_loot?on_conflict=dungeon_id,boss_id,item_name`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(dunRows),
  });
  if (!dunRes2.ok) throw new Error(`dungeon 幂等重跑失败 HTTP ${dunRes2.status}`);
  const dunAfter2 = await totalCount('dungeon_loot');
  if (dunAfter2 !== dunAfter) throw new Error(`幂等失败：dungeon_loot ${dunAfter} → ${dunAfter2}`);
  console.log('⑥ 幂等重跑：dungeon upsert 返回 ' + (await dunRes2.json()).length + ' 行（merge-update），总数不变=' + dunAfter2);
  console.log('✅ 全部完成（字典/过滤/入库/复核/幂等）');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
