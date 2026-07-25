-- ============================================================
-- 增量迁移 04：角色名唯一约束（REQ-002）
-- 规则：同一服务器内角色名唯一；不同服务器允许重名。
-- 生成日期: 2026-07-25
-- 前置: sql/schema_baseline_v1.sql 已执行
--
-- 落点：
--   ① raid_members：公会绑定单服务器，公会内唯一即服务器内唯一
--      → (guild_id, name) 唯一索引；
--   ② user_characters：用户中心角色按 (server_name, character_name)
--      判重 → (user_id, server_name, character_name) 唯一索引。
-- 前端已在保存前拦截重名并提示，本索引为数据库层兜底。
--
-- 注意：若执行时表中已存在重复数据，索引创建会失败；
-- 需先人工清理重复行后重跑。当前新库为空，可直接执行。
--
-- 回滚：
--   DROP INDEX IF EXISTS uq_raid_members_guild_name;
--   DROP INDEX IF EXISTS uq_user_characters_server_char;
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_raid_members_guild_name
  ON raid_members (guild_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_characters_server_char
  ON user_characters (user_id, server_name, character_name);
