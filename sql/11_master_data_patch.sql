-- ============================================================
-- 增量迁移 11：主数据补丁（任务书 #14-补丁，REQ-053/054）
-- 日期：2026-07-29
-- 内容：
--   ① REQ-053：tier_sets 加 spec_id（套装按 赛季×职业×专精 展开，12.1 套装效果按专精区分），
--      唯一约束从 (season_id, class_id) 改为 (season_id, class_id, spec_id)；
--   ② REQ-054：boss_loot 加 effect / primary_stats / secondary_stats 三列（wowhead tooltip 结构）。
-- 存量说明：tier_sets 当前仅为测试数据，DROP 重建唯一约束即可；
--   若届时已有正式数据，请先备份后执行（回滚见末尾）。
-- 执行方式：Supabase SQL Editor 整文件执行，幂等可重复执行。
-- 回滚：
--   ALTER TABLE tier_sets DROP CONSTRAINT IF EXISTS tier_sets_season_id_class_id_spec_id_key;
--   ALTER TABLE tier_sets DROP COLUMN IF EXISTS spec_id;
--   ALTER TABLE tier_sets ADD CONSTRAINT tier_sets_season_id_class_id_key UNIQUE (season_id, class_id);
--   ALTER TABLE boss_loot DROP COLUMN IF EXISTS effect, DROP COLUMN IF EXISTS primary_stats, DROP COLUMN IF EXISTS secondary_stats;
-- ============================================================

-- ① REQ-053：tier_sets 按专精展开
ALTER TABLE tier_sets ADD COLUMN IF NOT EXISTS spec_id UUID REFERENCES game_specs(id) ON DELETE CASCADE;

-- 唯一约束切换：删旧 (season_id, class_id)，建新 (season_id, class_id, spec_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tier_sets_season_id_class_id_key'
  ) THEN
    ALTER TABLE tier_sets DROP CONSTRAINT tier_sets_season_id_class_id_key;
  END IF;
END $$;

ALTER TABLE tier_sets
  ADD CONSTRAINT tier_sets_season_id_class_id_spec_id_key UNIQUE (season_id, class_id, spec_id);

-- ② REQ-054：boss_loot 字段体系升级
ALTER TABLE boss_loot ADD COLUMN IF NOT EXISTS effect TEXT;
ALTER TABLE boss_loot ADD COLUMN IF NOT EXISTS primary_stats TEXT[];
ALTER TABLE boss_loot ADD COLUMN IF NOT EXISTS secondary_stats TEXT[];
