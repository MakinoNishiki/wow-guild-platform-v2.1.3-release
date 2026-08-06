-- ============================================================
-- 增量 SQL 17：任务书 #27 WP2 成员彻底删除放开（历史保全 + 垃圾桶）
-- 日期：2026-08-06
-- 内容：
--   1. activity_attendance：加 member_name 快照列并按 member_id 回填现名；
--      member_id 外键重建为 ON DELETE SET NULL（原 CASCADE + NOT NULL，需先放行 NULL）
--   2. loot_records（装备分配真实表，AGENTS.md 旧名 loots 已漂移，真实库 loots 不存在）：
--      加 member_name 快照列并回填（character_id 关联 raid_members 优先，
--      历史上 character_id 恒 NULL，回退 item_stats->>assignedTo）；
--      character_id 外键基线已是 ON DELETE SET NULL（2026-08-06 实测），重建为锁定防漂移
--      旧表 loots：真实库已移除（2026-08-06 实测 404），存在才同口径处理
--   3. wishlists 维持 ON DELETE CASCADE（心愿为成员私有数据，随人走），不改动
--   4. 新表 deleted_raid_members（垃圾桶：原成员快照 + history_counts）+ RLS
--      （公会成员可读、owner/editor 可写；应用写路径走 server.js 代理通用分支）
--   5. NOTIFY pgrst 重载 schema 缓存
-- 执行方式：SSH + docker exec psql（supabase_admin），幂等可重复执行
-- 执行前备份：activity_attendance / loots / raid_members 三表 JSON 导出
--   → backup/2026-08-06-task27-pre-migration/
-- ============================================================

-- 1. activity_attendance：快照列 + 回填 + 外键重建
ALTER TABLE activity_attendance ADD COLUMN IF NOT EXISTS member_name text;

UPDATE activity_attendance a SET member_name = m.name
  FROM raid_members m
  WHERE a.member_id = m.id AND (a.member_name IS NULL OR a.member_name = '');

ALTER TABLE activity_attendance ALTER COLUMN member_id DROP NOT NULL;
ALTER TABLE activity_attendance DROP CONSTRAINT IF EXISTS activity_attendance_member_id_fkey;
ALTER TABLE activity_attendance ADD CONSTRAINT activity_attendance_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES raid_members(id) ON DELETE SET NULL;

-- 2a. loot_records：快照列 + 回填 + 外键重建（装备分配真实表）
ALTER TABLE loot_records ADD COLUMN IF NOT EXISTS member_name text;

UPDATE loot_records l SET member_name = COALESCE(
    (SELECT m.name FROM raid_members m WHERE m.id = l.character_id),
    NULLIF(l.item_stats->>'assignedTo', ''),
    '')
  WHERE l.member_name IS NULL OR l.member_name = '';

ALTER TABLE loot_records DROP CONSTRAINT IF EXISTS loot_records_character_id_fkey;
ALTER TABLE loot_records ADD CONSTRAINT loot_records_character_id_fkey
  FOREIGN KEY (character_id) REFERENCES raid_members(id) ON DELETE SET NULL;

-- 2b. 旧表 loots（真实库已移除——存在才同口径处理，不存在跳过）
DO $$
BEGIN
  IF to_regclass('public.loots') IS NOT NULL THEN
    ALTER TABLE loots ADD COLUMN IF NOT EXISTS member_name text;
    UPDATE loots l SET member_name = m.name
      FROM raid_members m
      WHERE l.member_id = m.id AND (l.member_name IS NULL OR l.member_name = '');
    ALTER TABLE loots DROP CONSTRAINT IF EXISTS loots_member_id_fkey;
    ALTER TABLE loots ADD CONSTRAINT loots_member_id_fkey
      FOREIGN KEY (member_id) REFERENCES raid_members(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. 垃圾桶表
CREATE TABLE IF NOT EXISTS deleted_raid_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  name text NOT NULL,
  class text,
  spec text,
  off_spec text,
  off_specs text[],
  role text,
  status text,
  join_date date,
  notes text,
  user_id uuid,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid,
  history_counts jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deleted_raid_members_guild ON deleted_raid_members(guild_id);

ALTER TABLE deleted_raid_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deleted_members_select ON deleted_raid_members;
CREATE POLICY deleted_members_select ON deleted_raid_members
  FOR SELECT TO authenticated USING (is_guild_member(guild_id));

DROP POLICY IF EXISTS deleted_members_insert ON deleted_raid_members;
CREATE POLICY deleted_members_insert ON deleted_raid_members
  FOR INSERT TO authenticated WITH CHECK (is_guild_editor(guild_id));

-- 5. 重载 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 回滚说明：
--   DROP TABLE IF EXISTS deleted_raid_members;
--   ALTER TABLE activity_attendance DROP CONSTRAINT IF EXISTS activity_attendance_member_id_fkey;
--   ALTER TABLE activity_attendance ADD CONSTRAINT activity_attendance_member_id_fkey
--     FOREIGN KEY (member_id) REFERENCES raid_members(id) ON DELETE CASCADE;
--   -- 恢复 NOT NULL 前必须先处置已被 SET NULL 的行（删除或逐行指定归属）：
--   -- DELETE FROM activity_attendance WHERE member_id IS NULL;
--   ALTER TABLE activity_attendance ALTER COLUMN member_id SET NOT NULL;
--   ALTER TABLE activity_attendance DROP COLUMN IF EXISTS member_name;
--   ALTER TABLE loot_records DROP COLUMN IF EXISTS member_name;
--   -- loot_records.character_id 基线即 SET NULL，无需还原
--   ALTER TABLE loots DROP COLUMN IF EXISTS member_name;
--   -- loots.member_id 基线即 SET NULL，无需还原
--   NOTIFY pgrst, 'reload schema';
-- ============================================================
