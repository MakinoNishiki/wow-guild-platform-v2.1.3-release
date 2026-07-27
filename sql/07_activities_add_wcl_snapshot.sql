-- ============================================================
-- 增量 SQL 07：任务书 #11 活动挂载 WCL 考勤快照
-- 日期：2026-07-27
-- 内容：activities 表新增 wcl_snapshot 列（jsonb，可空，
--       存储从 WCL 报告导入考勤时的快照数据，供后续比对差异）
-- 执行方式：Supabase SQL Editor 整文件执行，幂等可重复执行
-- 回滚说明：
--   ALTER TABLE activities DROP COLUMN IF EXISTS wcl_snapshot;
-- ============================================================

ALTER TABLE activities ADD COLUMN IF NOT EXISTS wcl_snapshot jsonb;
