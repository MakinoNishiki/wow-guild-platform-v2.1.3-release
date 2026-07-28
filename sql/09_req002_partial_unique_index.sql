-- ============================================================
-- 增量迁移 09：成员唯一索引改为部分索引（任务书 #12 补丁4，BUG-037）
-- 日期：2026-07-27
-- 背景：sql/04 的 uq_raid_members_guild_name 是全表 (guild_id, name) 唯一索引，
--   已离队成员（含历史英文状态 'inactive'）仍占用唯一位。软删除（REQ-042/DEC-005）
--   语义下，"撞离队同名"应走恢复链路；若用户选择不恢复，离队行也不应阻挡同名新建
--   （REQ-002 语义：同服同名**活跃**成员唯一）。
-- 内容：DROP 旧索引，重建为部分唯一索引——只对活跃成员生效。
-- 注意：raid_members 无 server 列，跨服同名目前靠"name 存为 名字-服务器"形态区分，
--   本索引维持 (guild_id, name) 列组合不变；彻底的同服唯一待 REQ-003 主数据层。
-- 前置：若库中活跃成员已存在 (guild_id, name) 重复，索引创建会失败，需先清理。
-- 执行方式：Supabase SQL Editor 整文件执行，幂等可重复执行。
-- 回滚：
--   DROP INDEX IF EXISTS uq_raid_members_guild_name;
--   CREATE UNIQUE INDEX uq_raid_members_guild_name ON raid_members (guild_id, name);
-- ============================================================

DROP INDEX IF EXISTS uq_raid_members_guild_name;

CREATE UNIQUE INDEX uq_raid_members_guild_name
  ON raid_members (guild_id, name)
  WHERE status IS DISTINCT FROM '离队' AND status IS DISTINCT FROM 'inactive';
