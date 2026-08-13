-- 增量 SQL 28：任务书 #45 WP1 成员服务器字段+同名口径升级（REQ-095，REQ-002 语义完整落地，BUG-060 根治）
-- 定案口径（2026-08-10 运营全定）：
--   ① raid_members 加 server text 可空默认 NULL——存量不回填公会主服，留空待用户补录/导入写入；
--   ② 唯一索引重建为 (guild_id, name, COALESCE(server,'')) 活跃 partial（同服同名拦、跨服同名放行、空与空比），
--      旧 (guild_id,name) 活跃 partial（sql/09）退役；游戏现行设定同公会允许同名、前提不同服务器。
-- 执行纪律（同 sql/26/27 先例）：备份 raid_members → SSH + docker exec（supabase_admin）→ NOTIFY pgrst ×2 → 前后行数复核
-- ⚠ 前置核查：若库中活跃成员已存在 (guild_id, name, COALESCE(server,'')) 重复（同服同名活跃并存），索引创建会失败，需先清理。
-- 回滚：
--   DROP INDEX IF EXISTS uq_raid_members_guild_name;
--   CREATE UNIQUE INDEX uq_raid_members_guild_name ON raid_members (guild_id, name)
--     WHERE status IS DISTINCT FROM '离队' AND status IS DISTINCT FROM 'inactive';
--   ALTER TABLE raid_members DROP COLUMN IF EXISTS server;

ALTER TABLE raid_members ADD COLUMN IF NOT EXISTS server text;

COMMENT ON COLUMN raid_members.server IS '成员服务器（任务书 #45 / REQ-095）：可空，空=同服/未填口径；与 name 组成 (guild_id,name,COALESCE(server,'''')) 活跃唯一键——同服同名拦、跨服同名放行（BUG-060 根治）。存量不回填，留空待补录/导入写入';

DROP INDEX IF EXISTS uq_raid_members_guild_name;

CREATE UNIQUE INDEX uq_raid_members_guild_name
  ON raid_members (guild_id, name, COALESCE(server, ''))
  WHERE status IS DISTINCT FROM '离队' AND status IS DISTINCT FROM 'inactive';

-- RLS 核查（sql/02_rls.sql §raid_members）：策略均按行级（guild_id 成员资格/角色）判定，无列级白名单——
-- 新列自然被既有策略覆盖，无需新增/变更策略。server.js 代理对 raid_members 为表级鉴权行透传，无需改动。

-- PostgREST schema cache 刷新（执行两遍保险，同先例）：
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload schema';

-- 执行后复核：
--   SELECT count(*) FROM raid_members;                                  -- 与迁移前一致（加列不动行）
--   SELECT count(*) FROM raid_members WHERE server IS NOT NULL;          -- 应为 0（存量不回填口径）
--   SELECT indexdef FROM pg_indexes WHERE indexname='uq_raid_members_guild_name';
--     -- 应含 (guild_id, name, COALESCE(server, ''::text)) 与 WHERE 活跃 partial 子句
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--     WHERE table_name='raid_members' AND column_name='server';          -- text / YES
