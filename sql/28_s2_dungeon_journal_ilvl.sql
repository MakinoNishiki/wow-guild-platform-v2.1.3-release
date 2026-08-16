-- ============================================================
-- 增量 SQL 28（S2 批次）：大米卡片装等对标冒险手册史诗显示档（运营终裁 2026-08-16）
-- 编号申报：S2 批次自带序号（24=数据导入/25=至暗回滚/26=装等列/27=数值同档订正/28=本件），
--   与仓库既有 28_req095_raid_members_server 撞号，后缀区分不覆盖（24_s2_loot_import 与
--   24_bug062 并立先例）。
-- 内容：
--   dungeon_loot 仅 S2 八本 ilvl：311 → 292（预期 207 行，出入必报）。
--   【口径钉死】292 = 冒险手册（Encounter Journal）史诗显示档（勇士 1/6），游戏内两截图实证；
--   与卡片数值区（sql/27 已订正为 *_tiers->'mythic' 史诗档值）同档——同档绑定前提不破。
--   插件 1.0.27 ilvl_tiers 回流后逐本复核，若某本 ≠ 292 按本微调（另起小批）。
--   boss_loot 零触碰：团本/巢穴已同档准确（烈毒 318/321/324/344、潮缚 318 维持现状）。
--   S1 大米 221 行保持 NULL 不回填。
-- 执行纪律（同批次既定流程）：
--   ① 执行前备份四表（pg_dump -t boss_loot -t dungeon_loot -t game_bosses -t game_raids）；
--   ② SSH + docker exec psql（supabase_admin 角色）整文件执行，单事务（BEGIN/COMMIT 在文件内），
--      幂等可重复执行（同值 UPDATE 无副作用）；
--   ③ NOTIFY pgrst 在 COMMIT 前（纯值更新不涉 schema，按纪律照发）；
--   ④ 复核：S2 大米 ilvl=292×207、S1 大米全 NULL、boss_loot 分布零漂移、公示页件数 320 不变。
-- 回滚说明：
--   UPDATE public.dungeon_loot SET ilvl = 311
--    WHERE dungeon_id IN (SELECT id FROM game_dungeons
--                          WHERE season_id = (SELECT id FROM game_seasons WHERE name = 'S2'));
--   NOTIFY pgrst, 'reload schema';
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

BEGIN;

-- S2 八本大米 ilvl → 292（预期 207 行；S1 行保持 NULL 不在范围内）
update public.dungeon_loot set ilvl = 292
 where dungeon_id in (select id from game_dungeons
                       where season_id = (select id from game_seasons where name = 'S2'));

-- 重载 PostgREST schema 缓存（连发两次确保生效）
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- 执行后复核 SQL（SSH + docker exec psql 内逐条执行核对）：
--   -- ① S2 大米 ilvl 分布（期望 292×207 单档）
--   select dl.ilvl, count(*) from dungeon_loot dl join game_dungeons gd on gd.id=dl.dungeon_id
--    where gd.season_id=(select id from game_seasons where name='S2') group by 1;
--   -- ② S1 大米全 NULL（期望 0 非空）
--   select count(*) from dungeon_loot dl join game_dungeons gd on gd.id=dl.dungeon_id
--    where gd.season_id=(select id from game_seasons where name='S1') and dl.ilvl is not null;
--   -- ③ boss_loot 零触碰复核：烈毒分布 318×13/321×25/324×36/344×27、潮缚 318×12 不变
--   select bl.ilvl, count(*) from boss_loot bl join game_bosses gb on gb.id=bl.boss_id
--    where gb.raid_id=(select id from game_raids where name='烈毒之渊') group by 1 order by 1;
--   -- ④ 公示页当前赛季件数（期望 320 不变）
--   select count(*) from jsonb_array_elements(public.get_public_loot_detail()) doc
--    where (doc->>'season_id')::text=(select id::text from game_seasons where is_current);
-- ============================================================
