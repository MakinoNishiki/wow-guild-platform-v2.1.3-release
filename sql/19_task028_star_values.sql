-- ============================================================
-- 增量 SQL 19：任务书 #28 WP1 星标数据链——掉落数值列
-- 日期：2026-08-07
-- 内容：
--   boss_loot / dungeon_loot 各加两列：
--     primary_values   jsonb null  —— 主属性数值表（{"智力":512}）
--     secondary_values jsonb null  —— 副属性数值表（{"爆击":300,"急速":100}）
--   只加列不改列；属性名数组列（primary_stats/secondary_stats）保留不动，向后兼容；
--   数据源：插件 1.0.5（GetItemStats 优先，tooltip 解析回退）→ wjdc_convert.py 透传。
--   无数值的行（玩具/杂项/旧格式导出）保持 NULL，WP3 星标渲染对 NULL 不加星不报错。
-- 执行方式：SSH + docker exec psql（supabase_admin 角色），幂等可重复执行
-- 执行后：文件末尾 NOTIFY pgrst 重载 schema 缓存
-- 回滚说明：
--   ALTER TABLE boss_loot DROP COLUMN IF EXISTS primary_values;
--   ALTER TABLE boss_loot DROP COLUMN IF EXISTS secondary_values;
--   ALTER TABLE dungeon_loot DROP COLUMN IF EXISTS primary_values;
--   ALTER TABLE dungeon_loot DROP COLUMN IF EXISTS secondary_values;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

ALTER TABLE boss_loot ADD COLUMN IF NOT EXISTS primary_values jsonb;
ALTER TABLE boss_loot ADD COLUMN IF NOT EXISTS secondary_values jsonb;
ALTER TABLE dungeon_loot ADD COLUMN IF NOT EXISTS primary_values jsonb;
ALTER TABLE dungeon_loot ADD COLUMN IF NOT EXISTS secondary_values jsonb;

-- 重载 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
