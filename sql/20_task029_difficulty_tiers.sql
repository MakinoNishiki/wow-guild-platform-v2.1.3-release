-- ============================================================
-- 增量 SQL 20：任务书 #29 WP1 四难度档数据链——掉落四档数值列
-- 日期：2026-08-08
-- 内容：
--   boss_loot / dungeon_loot 各加两列：
--     primary_tiers   jsonb null  —— 主属性四档数值表（{"lfr":{"智力":512},"normal":{...},"heroic":{...},"mythic":{...}}）
--     secondary_tiers jsonb null  —— 副属性四档数值表（同构）
--   档位 key 固定英文枚举 lfr / normal / heroic / mythic；只记存在的档（某装备无随机档则无 lfr 键）。
--   只加列不改列；既有字段与 values 两列（primary_values/secondary_values，sql/19）保留不动，向后兼容。
--   大秘境口径：大秘境掉落无四难度（钥石层数缩放），dungeon_loot 两列恒 NULL，
--   其唯一数值来源仍为 primary_values/secondary_values（副本手册预览口径）。
--   数据源：插件 1.0.7（EJ 难度档循环切档 tooltip 重扫，回退方案见任务书 #29 WP1 修改报告侦察节）→ wjdc_convert.py 透传。
-- 执行方式：SSH + docker exec psql（supabase_admin 角色），幂等可重复执行
-- 执行后：文件末尾 NOTIFY pgrst 重载 schema 缓存
-- 回滚说明：
--   ALTER TABLE boss_loot DROP COLUMN IF EXISTS primary_tiers;
--   ALTER TABLE boss_loot DROP COLUMN IF EXISTS secondary_tiers;
--   ALTER TABLE dungeon_loot DROP COLUMN IF EXISTS primary_tiers;
--   ALTER TABLE dungeon_loot DROP COLUMN IF EXISTS secondary_tiers;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

ALTER TABLE boss_loot ADD COLUMN IF NOT EXISTS primary_tiers jsonb;
ALTER TABLE boss_loot ADD COLUMN IF NOT EXISTS secondary_tiers jsonb;
ALTER TABLE dungeon_loot ADD COLUMN IF NOT EXISTS primary_tiers jsonb;
ALTER TABLE dungeon_loot ADD COLUMN IF NOT EXISTS secondary_tiers jsonb;

-- 重载 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
