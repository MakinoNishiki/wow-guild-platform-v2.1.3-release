-- ============================================================
-- 增量 SQL 08：任务书 #12 活动状态模型（REQ-020）与分组标签
-- 日期：2026-07-27
-- 内容：activities 表新增 status 列（text，非空，默认 'normal'，
--       合法值仅 'normal' / 'cancelled'，由 server.js 代理白名单校验）
--       和 team_tag 列（text，可空，自由文本分组标签，不校验）
-- 执行方式：Supabase SQL Editor 整文件执行，幂等可重复执行
-- 回滚说明：
--   ALTER TABLE activities DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS team_tag;
-- ============================================================

ALTER TABLE activities ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'normal';
ALTER TABLE activities ADD COLUMN IF NOT EXISTS team_tag text;
