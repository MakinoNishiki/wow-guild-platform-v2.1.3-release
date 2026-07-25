-- ============================================================
-- 增量 SQL 05：REQ-014 活动挂载 WCL 战斗日志链接
-- 日期：2026-07-26
-- 内容：activities 表新增 wcl_url / wcl_report_code 两列（均可空，一个活动一条链接）
-- 执行方式：Supabase SQL Editor 整文件执行，幂等可重复执行
-- 回滚说明：
--   ALTER TABLE activities DROP COLUMN IF EXISTS wcl_url;
--   ALTER TABLE activities DROP COLUMN IF EXISTS wcl_report_code;
-- ============================================================

ALTER TABLE activities ADD COLUMN IF NOT EXISTS wcl_url TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS wcl_report_code TEXT;
