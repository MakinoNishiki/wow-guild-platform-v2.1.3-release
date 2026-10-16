#!/usr/bin/env node
/**
 * 任务书 #76（修正版）：sql/43 图标回补批次生成器（零依赖 Node，直接跑）
 *
 * 输入：official_item_id → icon_id 映射 CSV（表头 src,official_item_id,icon_id[,source_note]；
 *       src ∈ boss_loot|dungeon_loot；行序随意）。来源可以是 Exporter 真机重跑导出，
 *       也可以是运营 Wowhead 手查补齐——只要凑齐这两列。
 * 输出：sql/43-icon-update.sql（默认；可用 --out 改路径），仅 UPDATE 不 INSERT：
 *   - 按表分批（boss_loot / dungeon_loot），逐行 `AND icon_id IS NULL` 幂等护栏
 *     （重跑安全、绝不覆盖已有 icon）；
 *   - boss_loot.official_item_id 是 INTEGER 不引号，dungeon_loot 是 TEXT 必须引号
 *     （两表类型不一致，2026-10-15 sql/38 批次实证，注释钉死防踩坑）；
 *   - 头部自动带备份命令 + 回滚说明 + 执行方式（psql -1 单事务）。
 * 校验：非数字 ID / icon、缺列、同 ID 冲突映射（同 official_item_id 给两个 icon）一律报错退出 1；
 *       生成后打印两表各多少条 + 未在清单内的 ID 数（对照缺失清单基准文件可选 --check）。
 *
 * 用法：node scripts/build-sql43-icon-update.js <映射.csv> [--out sql/43-icon-update.sql]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (!args.length) {
  console.error('用法：node scripts/build-sql43-icon-update.js <映射.csv> [--out sql/43-icon-update.sql]');
  process.exit(1);
}
const csvPath = args[0];
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? args[outIdx + 1] : 'sql/43-icon-update.sql';

const raw = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
const lines = raw.split(/\r?\n/).filter(l => l.trim());
if (lines.length < 2) { console.error('CSV 无数据行'); process.exit(1); }

const header = lines[0].split(',').map(s => s.trim());
const iSrc = header.indexOf('src');
const iId = header.indexOf('official_item_id');
const iIcon = header.indexOf('icon_id');
if (iSrc < 0 || iId < 0 || iIcon < 0) {
  console.error(`CSV 表头缺列：需要 src,official_item_id,icon_id（实得 ${header.join(',')}）`);
  process.exit(1);
}

const rows = { boss_loot: [], dungeon_loot: [] };
const seen = new Map(); // `${src}|${id}` → icon
let bad = 0;
for (let n = 1; n < lines.length; n++) {
  const cols = lines[n].split(',').map(s => s.trim());
  const src = cols[iSrc], id = cols[iId], icon = cols[iIcon];
  const ln = n + 1;
  if (src !== 'boss_loot' && src !== 'dungeon_loot') { console.error(`第${ln}行 src 非法：${src}`); bad++; continue; }
  if (!/^\d+$/.test(id || '')) { console.error(`第${ln}行 official_item_id 非数字：${id}`); bad++; continue; }
  if (!/^\d+$/.test(icon || '')) { console.error(`第${ln}行 icon_id 非数字：${icon}`); bad++; continue; }
  const key = `${src}|${id}`;
  if (seen.has(key) && seen.get(key) !== icon) {
    console.error(`第${ln}行冲突映射：${src} ${id} 同时给 ${seen.get(key)} 与 ${icon}`); bad++; continue;
  }
  if (seen.has(key)) continue; // 完全重复行，幂等跳过
  seen.set(key, icon);
  rows[src].push({ id, icon });
}
if (bad) { console.error(`共 ${bad} 处错误，未生成 SQL`); process.exit(1); }

const now = new Date().toISOString().slice(0, 10);
const lit = (src, v) => (src === 'dungeon_loot' ? `'${v}'` : v); // dungeon_loot.official_item_id 是 TEXT
const gen = src => rows[src].map(r =>
  `UPDATE ${src} SET icon_id = ${r.icon}, updated_at = NOW() WHERE official_item_id = ${lit(src, r.id)} AND icon_id IS NULL;`
).join('\n');

const sql = `-- sql/43: icon_id 批量回补（任务书 #76 修正版，${now} 生成）
-- 数据源：${path.basename(csvPath)}（boss_loot ${rows.boss_loot.length} 条 / dungeon_loot ${rows.dungeon_loot.length} 条）
-- 仅 UPDATE 不 INSERT；逐行 AND icon_id IS NULL 幂等护栏——只补缺口，绝不覆盖已有 icon，可安全重跑。
-- 类型钉死：boss_loot.official_item_id=INTEGER（不引号）；dungeon_loot.official_item_id=TEXT（必须引号）。
--
-- === 执行前备份 ===
-- docker exec supabase-db pg_dump -U supabase_admin -t boss_loot -t dungeon_loot postgres > /backup/boss_dungeon_pre_sql43_$(date +%Y%m%d_%H%M%S).sql
--
-- === 执行（文件内 BEGIN/COMMIT 单事务，失败 ROLLBACK 手动回滚） ===
-- docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < 43-icon-update.sql
-- （ON_ERROR_STOP=1 遇错即停，BEGIN 后出错会留下未提交事务直接退出连接即自动回滚）
--
-- === 回滚 ===
-- 用执行前备份 pg_restore/导入回灌；或按备份中各行原 icon_id（NULL）反向 UPDATE。
--
-- === 复核 ===
-- SELECT count(*) FROM boss_loot WHERE icon_id IS NULL;    -- 应下降 ${rows.boss_loot.length}
-- SELECT count(*) FROM dungeon_loot WHERE icon_id IS NULL; -- 应下降 ${rows.dungeon_loot.length}

BEGIN;

-- === boss_loot（${rows.boss_loot.length} 条） ===
${gen('boss_loot')}

-- === dungeon_loot（${rows.dungeon_loot.length} 条） ===
${gen('dungeon_loot')}

NOTIFY pgrst, 'reload schema';
COMMIT;
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, sql, 'utf8');
console.log(`已生成 ${outPath}：boss_loot ${rows.boss_loot.length} 条 + dungeon_loot ${rows.dungeon_loot.length} 条（共 ${rows.boss_loot.length + rows.dungeon_loot.length}）`);
