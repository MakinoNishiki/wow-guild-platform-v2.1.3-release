-- ============================================================
-- 增量迁移 03：activities 表增加活动开始/结束时间字段
-- 对应问题：BUG-007（活动开始/结束时间显示 --:--）
-- 生成日期: 2026-07-25
-- 前置: sql/schema_baseline_v1.sql 已执行
--
-- 背景：前端活动表单一直采集 start_time/end_time，但建表时漏了
-- 这两列，cloud.js 读取侧曾硬编码 20:00/23:00 兜底，导致考勤
-- 详情弹窗显示 --:--。本迁移补齐列，代码侧（cloud.js
-- syncActivity / loadCloudData / reloadActivities）已同步映射。
--
-- 部署顺序：必须先执行本 SQL，再上线配套前端代码，
-- 否则写入活动会因列不存在报错（PostgREST PGRST204）。
--
-- 回滚：
--   ALTER TABLE activities DROP COLUMN IF EXISTS start_time;
--   ALTER TABLE activities DROP COLUMN IF EXISTS end_time;
-- ============================================================

ALTER TABLE activities ADD COLUMN IF NOT EXISTS start_time TEXT NOT NULL DEFAULT '';
ALTER TABLE activities ADD COLUMN IF NOT EXISTS end_time TEXT NOT NULL DEFAULT '';
