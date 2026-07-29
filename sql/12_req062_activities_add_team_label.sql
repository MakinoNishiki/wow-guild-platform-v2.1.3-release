-- ============================================================
-- 增量迁移 12：活动「团号」字段（任务书 #14-补丁3，REQ-062）
-- 日期：2026-07-29
-- 内容：activities 加 team_label text（可空）——团号徽章（纯数字显示「N 团」，文字显示「团号：X」）。
-- 存量说明：存量行 team_label 为 NULL，前端按空值渲染（不显示徽章），无需回填。
-- 执行方式：Supabase SQL Editor 整文件执行，幂等可重复执行。
-- 回滚：ALTER TABLE activities DROP COLUMN IF EXISTS team_label;
-- ============================================================

ALTER TABLE activities ADD COLUMN IF NOT EXISTS team_label TEXT;
