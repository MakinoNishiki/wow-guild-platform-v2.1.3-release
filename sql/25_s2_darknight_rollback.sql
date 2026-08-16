-- ============================================================
-- 增量 SQL 25（S2 批次）：至暗之夜掉落回滚（运营终裁 2026-08-16：维持「世界BOSS掉落不入库」口径）
-- 编号申报：本批 S2 序列 24=数据导入/25=本回滚/26=装等列；与仓库既有 25_task029/26_req110
--   撞号（S2 批次自带序号，24_s2_loot_import 与 24_bug062 并立先例），后缀区分不覆盖。
-- 背景：sql/24_s2_loot_import 中至暗相关改动推翻——
--   ① 至暗之夜 32 行 boss_loot 整体 DELETE（含 08-06 遗留行，本就不该在库；
--      至暗 type='world' 本就被公开 RPC 黑名单剔除，删除对公示页零视觉变化）；
--   ② game_raids 至暗之夜 season 回挂 S1（恢复 08-06 原状）；
--   ③ 维度行（game_raids/game_bosses）保留不删。
-- 执行纪律（迁移全套）：
--   ① 执行前备份：四表 pg_dump 全量 + 至暗 32 行行级 JSON 导出（backup/2026-08-16-sql25/）；
--   ② SSH + docker exec psql（supabase_admin 角色）整文件执行，单事务（BEGIN/COMMIT 在文件内）；
--   ③ NOTIFY pgrst 在 COMMIT 前（本文件为纯 DML，照批次纪律保留）；
--   ④ 复核：至暗 boss_loot=0 行；boss_loot 总数 301→269；dungeon_loot 428 不动；
--      公示页当前赛季件数 320 不变（world 本不在 RPC 值域）；至暗维度行保留、season=S1。
-- 回滚说明：
--   ① 至暗 32 行：由 backup/2026-08-16-sql25/zidian_boss_loot_rows_20260816.json 逐行重新 INSERT
--      （行级备份含全列原值，含 id，可原样回插）；
--   ② 赛季回滚：UPDATE game_raids SET season_id=(SELECT id FROM game_seasons WHERE name='S2')
--      WHERE name='至暗之夜';
--   ③ NOTIFY pgrst, 'reload schema';
-- ============================================================

BEGIN;

-- 1. 至暗之夜 32 行 boss_loot 整体删除（ID 按名解析；维度行 game_bosses 保留）
DELETE FROM boss_loot
 WHERE boss_id IN (SELECT id FROM game_bosses
                    WHERE raid_id = (SELECT id FROM game_raids WHERE name = '至暗之夜'));

-- 2. game_raids 至暗之夜 season 回挂 S1（恢复 08-06 原状；type='world' 不动）
UPDATE game_raids
   SET season_id = (SELECT id FROM game_seasons WHERE name = 'S1')
 WHERE name = '至暗之夜';

-- 重载 PostgREST schema 缓存（批次纪律；纯 DML 照走）
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- 执行后复核 SQL（SSH + docker exec psql 内逐条执行核对）：
--   -- ① 至暗 boss_loot 零行（期望 0）
--   SELECT count(*) FROM boss_loot bl JOIN game_bosses gb ON gb.id=bl.boss_id
--    WHERE gb.raid_id=(SELECT id FROM game_raids WHERE name='至暗之夜');
--   -- ② 行数漂移核对（期望 boss_loot 269 / dungeon_loot 428 / game_bosses 80 / game_raids 7）
--   SELECT 'boss_loot', count(*) FROM boss_loot UNION ALL SELECT 'dungeon_loot', count(*) FROM dungeon_loot
--    UNION ALL SELECT 'game_bosses', count(*) FROM game_bosses UNION ALL SELECT 'game_raids', count(*) FROM game_raids;
--   -- ③ 至暗维度行保留 + season 回挂 S1（期望 1 行：world|S1）
--   SELECT gr.name, gr.type, gs.name FROM game_raids gr LEFT JOIN game_seasons gs ON gs.id=gr.season_id
--    WHERE gr.name='至暗之夜';
--   -- ④ 公示页当前赛季件数（期望 320 不变）
--   SELECT count(*) FROM jsonb_array_elements(public.get_public_loot_detail()) doc
--    WHERE (doc->>'season_id')::text=(SELECT id::text FROM game_seasons WHERE is_current);
-- ============================================================
