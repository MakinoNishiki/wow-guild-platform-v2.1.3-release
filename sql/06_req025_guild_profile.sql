-- ============================================================
-- 增量 SQL 06：REQ-025 公会资料字段（一期：简介 + 分配制度 + 规则说明）
-- 日期：2026-07-26
-- 内容：guilds 表新增 3 列（均可空）
--   description     公会简介
--   loot_rule_type  分配制度枚举：roll / yixuduotan（一需多贪）/ cl / custom
--   loot_rule_text  分配规则说明（自定义文本）
-- 范围说明：字段清单（docs/公会资料模型字段清单.md）中其余字段
--   （阵营/团队类型/活动日/氛围标签等）不在本期，后续任务书另行扩展。
-- 执行方式：Supabase SQL Editor 整文件执行，幂等可重复执行
-- 回滚说明：
--   ALTER TABLE guilds DROP COLUMN IF EXISTS description;
--   ALTER TABLE guilds DROP COLUMN IF EXISTS loot_rule_type;
--   ALTER TABLE guilds DROP COLUMN IF EXISTS loot_rule_text;
-- ============================================================

ALTER TABLE guilds ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS loot_rule_type TEXT;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS loot_rule_text TEXT;

-- loot_rule_type 枚举约束（可空，非空时必须在枚举内）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guilds_loot_rule_type_check'
  ) THEN
    ALTER TABLE guilds ADD CONSTRAINT guilds_loot_rule_type_check
      CHECK (loot_rule_type IS NULL OR loot_rule_type IN ('roll', 'yixuduotan', 'cl', 'custom'));
  END IF;
END $$;
