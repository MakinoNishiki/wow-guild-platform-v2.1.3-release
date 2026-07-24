-- ============================================================
-- WoW Guild Platform - 数据库 Schema 基线 v1
-- 生成日期: 2026-07-25
--
-- 本文件为全新部署的唯一基线（baseline），取代旧版
-- sql/01_tables.sql 与 sql/02_rls.sql（旧文件保留作历史，不删除）。
--
-- 依据：js/cloud.js（数据访问层）、js/app.js（用户中心）、server.js（写入代理）
-- 的实际读写代码逐字段核对生成，与文档无关。
--
-- 适用场景：全新 Supabase 项目，在 SQL Editor 中一次性执行。
-- 包含：10 张表 + 索引 + updated_at 触发器 + RLS 辅助函数 +
--       完整 RLS 策略 + RPC 函数 get_unread_notification_count。
-- 不包含：loots（已废弃）、guild_invite_codes、feishu_configs（代码未使用）。
-- ============================================================

-- ============================================================
-- 第一部分：建表（按外键依赖顺序）
-- ============================================================

-- 1. 公会表
CREATE TABLE IF NOT EXISTS guilds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_code TEXT UNIQUE NOT NULL,
  server_name TEXT,
  server_region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 公会成员权限表
CREATE TABLE IF NOT EXISTS guild_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  display_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(guild_id, user_id)
);

-- 3. WoW 角色成员表
CREATE TABLE IF NOT EXISTS raid_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  class TEXT NOT NULL,
  spec TEXT DEFAULT '',
  role TEXT DEFAULT '输出',
  off_spec TEXT DEFAULT '',
  off_specs TEXT[] DEFAULT '{}',
  status TEXT DEFAULT '正式',
  join_date DATE DEFAULT CURRENT_DATE,
  notes TEXT DEFAULT '',
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. 考勤活动表
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  activity_date DATE NOT NULL,
  raid TEXT DEFAULT '',
  boss TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. 出勤记录表
-- 注意：status 存英文代码（cloud.js mapStatusToDb 的映射结果），
-- 与旧版 01_tables.sql 的中文 CHECK 约束不同，此处以代码为准。
CREATE TABLE IF NOT EXISTS activity_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES raid_members(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'present'
    CHECK (status IN ('present', 'absent', 'late', 'backup', 'leave')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(activity_id, member_id)
);

-- 6. 装备履历表
CREATE TABLE IF NOT EXISTS loot_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  character_id UUID REFERENCES raid_members(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  item_category TEXT DEFAULT '',
  item_slot TEXT DEFAULT '',
  item_level INTEGER DEFAULT 0,
  item_stats JSONB DEFAULT '{}',
  raid_name TEXT DEFAULT '',
  boss_name TEXT DEFAULT '',
  difficulty TEXT DEFAULT '',
  obtained_date DATE DEFAULT CURRENT_DATE,
  season TEXT DEFAULT '',
  distribution_method TEXT DEFAULT 'custom'
    CHECK (distribution_method IN ('roll', 'roll_rule', 'cl', 'master_loot', 'dkp', 'epgp', 'gkp', 'custom')),
  player_action TEXT DEFAULT 'none'
    CHECK (player_action IN ('need', 'greed', 'pass', 'none')),
  roll_value INTEGER,
  is_wishlist BOOLEAN DEFAULT false,
  rule_note TEXT DEFAULT '',
  decision_note TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. 心愿单表（每个成员一行，items 为该成员的心愿单条目数组）
CREATE TABLE IF NOT EXISTS wishlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES raid_members(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(guild_id, member_id)
);

-- 8. 通知表
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT DEFAULT '',
  is_read BOOLEAN DEFAULT false,
  related_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. 用户资料表
-- 注意：主键即 user_id（cloud.js 的 upsert 以 user_id 为冲突键，
-- 且查询条件为 .eq('user_id', ...)），与旧版 01_tables.sql 的
-- id/nickname 结构不同，此处以代码为准。
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. 用户角色表（用户中心 - 我的角色）
CREATE TABLE IF NOT EXISTS user_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  server_name TEXT NOT NULL,
  server_region TEXT DEFAULT 'CN',
  armory_url TEXT DEFAULT '',
  faction TEXT DEFAULT '',
  class TEXT DEFAULT '',
  spec TEXT DEFAULT '',
  level INTEGER,
  item_level INTEGER,
  race TEXT DEFAULT '',
  guild_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 第二部分：updated_at 自动更新触发器
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guilds_updated_at
  BEFORE UPDATE ON guilds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_guild_members_updated_at
  BEFORE UPDATE ON guild_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_raid_members_updated_at
  BEFORE UPDATE ON raid_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_activity_attendance_updated_at
  BEFORE UPDATE ON activity_attendance
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_loot_records_updated_at
  BEFORE UPDATE ON loot_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_wishlists_updated_at
  BEFORE UPDATE ON wishlists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_characters_updated_at
  BEFORE UPDATE ON user_characters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 第三部分：索引（常用查询字段）
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_guild_members_guild ON guild_members(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_user ON guild_members(user_id);
CREATE INDEX IF NOT EXISTS idx_raid_members_guild ON raid_members(guild_id);
CREATE INDEX IF NOT EXISTS idx_raid_members_user ON raid_members(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_guild ON activities(guild_id);
CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(activity_date);
CREATE INDEX IF NOT EXISTS idx_activity_attendance_activity ON activity_attendance(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_attendance_member ON activity_attendance(member_id);
CREATE INDEX IF NOT EXISTS idx_loot_records_guild ON loot_records(guild_id);
CREATE INDEX IF NOT EXISTS idx_loot_records_character ON loot_records(character_id);
CREATE INDEX IF NOT EXISTS idx_loot_records_date ON loot_records(obtained_date);
CREATE INDEX IF NOT EXISTS idx_wishlists_guild ON wishlists(guild_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_member ON wishlists(member_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_guild ON notifications(guild_id);
CREATE INDEX IF NOT EXISTS idx_user_characters_user ON user_characters(user_id);

-- ============================================================
-- 第四部分：RLS 辅助函数
-- SECURITY DEFINER + 固定 search_path：函数内部查询 guild_members
-- 时绕过该表自身的 RLS，避免 guild_members 策略自引用造成无限递归。
-- ============================================================

-- 检查当前用户是否是公会成员（任一角色）
CREATE OR REPLACE FUNCTION is_guild_member(check_guild_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM guild_members
    WHERE guild_id = check_guild_id
    AND user_id = auth.uid()
  );
END;
$$;

-- 检查当前用户是否是公会 owner/editor
CREATE OR REPLACE FUNCTION is_guild_editor(check_guild_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM guild_members
    WHERE guild_id = check_guild_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'editor')
  );
END;
$$;

-- 检查当前用户是否是公会 owner
CREATE OR REPLACE FUNCTION is_guild_owner(check_guild_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM guild_members
    WHERE guild_id = check_guild_id
    AND user_id = auth.uid()
    AND role = 'owner'
  );
END;
$$;

-- ============================================================
-- 第五部分：RPC 函数
-- cloud.js 通过 supabaseClient.rpc('get_unread_notification_count',
-- { p_user_id }) 调用。仅允许查询本人的未读数。
-- ============================================================

CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN 0;
  END IF;
  RETURN (
    SELECT COUNT(*)::INTEGER FROM notifications
    WHERE user_id = p_user_id AND is_read = false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_unread_notification_count(UUID) TO authenticated;

-- ============================================================
-- 第六部分：RLS 策略
-- 规则总览：
--   - 公会成员（owner/editor/viewer 任一）可读所属公会数据；
--   - owner/editor 可增删改所属公会业务数据；
--   - 仅 owner 可管理公会成员角色、修改公会设置、删除公会；
--   - 任何登录用户可创建公会、可读写自己的
--     user_profiles / user_characters / notifications。
-- ============================================================

-- ---------- guilds ----------
ALTER TABLE guilds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guilds_select_member" ON guilds
  FOR SELECT USING (is_guild_member(id));

CREATE POLICY "guilds_insert_auth" ON guilds
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "guilds_update_owner" ON guilds
  FOR UPDATE USING (is_guild_owner(id));

CREATE POLICY "guilds_delete_owner" ON guilds
  FOR DELETE USING (is_guild_owner(id));

-- ---------- guild_members ----------
ALTER TABLE guild_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guild_members_select_member" ON guild_members
  FOR SELECT USING (is_guild_member(guild_id));

-- 登录用户可加入公会（创建公会时写入 owner 行 / 通过邀请码写入 viewer 行，
-- 代码中 user_id 始终为当前用户本人）
CREATE POLICY "guild_members_insert_self" ON guild_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "guild_members_update_owner" ON guild_members
  FOR UPDATE USING (is_guild_owner(guild_id));

-- owner 可移除成员；成员也可删除自己的记录（退出公会）
CREATE POLICY "guild_members_delete_owner_or_self" ON guild_members
  FOR DELETE USING (is_guild_owner(guild_id) OR user_id = auth.uid());

-- ---------- raid_members ----------
ALTER TABLE raid_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raid_members_select_member" ON raid_members
  FOR SELECT USING (is_guild_member(guild_id));

CREATE POLICY "raid_members_insert_editor" ON raid_members
  FOR INSERT WITH CHECK (is_guild_editor(guild_id));

CREATE POLICY "raid_members_update_editor" ON raid_members
  FOR UPDATE USING (is_guild_editor(guild_id));

CREATE POLICY "raid_members_delete_editor" ON raid_members
  FOR DELETE USING (is_guild_editor(guild_id));

-- ---------- activities ----------
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activities_select_member" ON activities
  FOR SELECT USING (is_guild_member(guild_id));

CREATE POLICY "activities_insert_editor" ON activities
  FOR INSERT WITH CHECK (is_guild_editor(guild_id));

CREATE POLICY "activities_update_editor" ON activities
  FOR UPDATE USING (is_guild_editor(guild_id));

CREATE POLICY "activities_delete_editor" ON activities
  FOR DELETE USING (is_guild_editor(guild_id));

-- ---------- activity_attendance ----------
ALTER TABLE activity_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_select_member" ON activity_attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM activities
      WHERE activities.id = activity_attendance.activity_id
      AND is_guild_member(activities.guild_id)
    )
  );

CREATE POLICY "attendance_insert_editor" ON activity_attendance
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM activities
      WHERE activities.id = activity_attendance.activity_id
      AND is_guild_editor(activities.guild_id)
    )
  );

CREATE POLICY "attendance_update_editor" ON activity_attendance
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM activities
      WHERE activities.id = activity_attendance.activity_id
      AND is_guild_editor(activities.guild_id)
    )
  );

CREATE POLICY "attendance_delete_editor" ON activity_attendance
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM activities
      WHERE activities.id = activity_attendance.activity_id
      AND is_guild_editor(activities.guild_id)
    )
  );

-- ---------- loot_records ----------
ALTER TABLE loot_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loot_records_select_member" ON loot_records
  FOR SELECT USING (is_guild_member(guild_id));

CREATE POLICY "loot_records_insert_editor" ON loot_records
  FOR INSERT WITH CHECK (is_guild_editor(guild_id));

CREATE POLICY "loot_records_update_editor" ON loot_records
  FOR UPDATE USING (is_guild_editor(guild_id));

CREATE POLICY "loot_records_delete_editor" ON loot_records
  FOR DELETE USING (is_guild_editor(guild_id));

-- ---------- wishlists ----------
ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wishlists_select_member" ON wishlists
  FOR SELECT USING (is_guild_member(guild_id));

CREATE POLICY "wishlists_insert_editor" ON wishlists
  FOR INSERT WITH CHECK (is_guild_editor(guild_id));

CREATE POLICY "wishlists_update_editor" ON wishlists
  FOR UPDATE USING (is_guild_editor(guild_id));

CREATE POLICY "wishlists_delete_editor" ON wishlists
  FOR DELETE USING (is_guild_editor(guild_id));

-- ---------- notifications ----------
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (user_id = auth.uid());

-- 加入/退出公会时，代码会为公会的 owner/editor 创建通知
-- （user_id 是接收者而非操作者），因此 INSERT 对登录用户放开；
-- 实际写入均经 server.js 代理（service_role），此策略为直连兜底。
CREATE POLICY "notifications_insert_auth" ON notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "notifications_delete_own" ON notifications
  FOR DELETE USING (user_id = auth.uid());

-- ---------- user_profiles ----------
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_select_own" ON user_profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_profiles_insert_own" ON user_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_profiles_update_own" ON user_profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "user_profiles_delete_own" ON user_profiles
  FOR DELETE USING (user_id = auth.uid());

-- ---------- user_characters ----------
ALTER TABLE user_characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_characters_select_own" ON user_characters
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_characters_insert_own" ON user_characters
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_characters_update_own" ON user_characters
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "user_characters_delete_own" ON user_characters
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================
-- 结束。本基线不含任何历史数据，新库从零开始使用。
-- ============================================================
