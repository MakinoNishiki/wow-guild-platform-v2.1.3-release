-- ============================================================
-- 增量 SQL 14：任务书 #18 WP2（R4）公会级「认领人标签」开关
-- 日期：2026-08-04
-- 内容：guilds 表新增 1 列
--   show_claimer_label  是否在心愿单/装备分配列表显示「认领人：XXX/未认领」标签
--                       BOOLEAN NOT NULL DEFAULT true（默认开启，存量公会自动视为开启）
-- 前置侦察结论（任务书 WP2 侦察项 1）：
--   raid_members.user_id 上无任何 UNIQUE 约束/唯一索引（仅普通索引
--   idx_raid_members_user + (guild_id,name) 唯一索引），多认领无需 DROP 约束。
-- 执行方式：Supabase SQL Editor 整文件执行，幂等可重复执行
-- 执行前：先做一次手动备份（scripts/export-backup.js 或 Dashboard 备份）
-- 回滚说明：
--   ALTER TABLE guilds DROP COLUMN IF EXISTS show_claimer_label;
-- ============================================================

ALTER TABLE guilds ADD COLUMN IF NOT EXISTS show_claimer_label BOOLEAN NOT NULL DEFAULT true;
