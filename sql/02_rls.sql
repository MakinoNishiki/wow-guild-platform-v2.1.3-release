-- ============================================================
-- WoW Guild Platform - Supabase RLS 策略
-- 生成日期: 2026-07-25
-- 版本: V2.1.2
-- ============================================================

-- 辅助函数：检查用户是否是公会成员
CREATE OR REPLACE FUNCTION is_guild_member(check_guild_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM guild_members
    WHERE guild_id = check_guild_id
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 辅助函数：检查用户是否是公会 owner/editor
CREATE OR REPLACE FUNCTION is_guild_editor(check_guild_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM guild_members
    WHERE guild_id = check_guild_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'editor')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 辅助函数：检查用户是否是公会 owner
CREATE OR REPLACE FUNCTION is_guild_owner(check_guild_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM guild_members
    WHERE guild_id = check_guild_id
    AND user_id = auth.uid()
    AND role = 'owner'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- guilds 表策略
-- ============================================================
ALTER TABLE guilds ENABLE ROW LEVEL SECURITY;

-- 公会成员可读取所属公会
CREATE POLICY "guilds_select_member" ON guilds
  FOR SELECT USING (is_guild_member(id));

-- 认证用户可创建公会
CREATE POLICY "guilds_insert_auth" ON guilds
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 公会 owner 可更新公会信息
CREATE POLICY "guilds_update_owner" ON guilds
  FOR UPDATE USING (is_guild_owner(id));

-- ============================================================
-- guild_members 表策略
-- ============================================================
ALTER TABLE guild_members ENABLE ROW LEVEL SECURITY;

-- 公会成员可读取公会成员列表
CREATE POLICY "guild_members_select_member" ON guild_members
  FOR SELECT USING (is_guild_member(guild_id));

-- 认证用户可加入公会（通过邀请码）
CREATE POLICY "guild_members_insert_auth" ON guild_members
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 公会 owner 可管理成员权限
CREATE POLICY "guild_members_update_owner" ON guild_members
  FOR UPDATE USING (is_guild_owner(guild_id));

-- 公会 owner 可移除成员
CREATE POLICY "guild_members_delete_owner" ON guild_members
  FOR DELETE USING (is_guild_owner(guild_id));

-- ============================================================
-- guild_invite_codes 表策略
-- ============================================================
ALTER TABLE guild_invite_codes ENABLE ROW LEVEL SECURITY;

-- 公会成员可读取邀请码
CREATE POLICY "invite_codes_select_member" ON guild_invite_codes
  FOR SELECT USING (is_guild_member(guild_id));

-- 公会 owner/editor 可创建邀请码
CREATE POLICY "invite_codes_insert_editor" ON guild_invite_codes
  FOR INSERT WITH CHECK (is_guild_editor(guild_id));

-- 公会 owner 可删除邀请码
CREATE POLICY "invite_codes_delete_owner" ON guild_invite_codes
  FOR DELETE USING (is_guild_owner(guild_id));

-- ============================================================
-- raid_members 表策略
-- ============================================================
ALTER TABLE raid_members ENABLE ROW LEVEL SECURITY;

-- 公会成员可读取角色成员
CREATE POLICY "raid_members_select_member" ON raid_members
  FOR SELECT USING (is_guild_member(guild_id));

-- 公会 owner/editor 可添加角色成员
CREATE POLICY "raid_members_insert_editor" ON raid_members
  FOR INSERT WITH CHECK (is_guild_editor(guild_id));

-- 公会 owner/editor 可更新角色成员
CREATE POLICY "raid_members_update_editor" ON raid_members
  FOR UPDATE USING (is_guild_editor(guild_id));

-- 公会 owner/editor 可删除角色成员
CREATE POLICY "raid_members_delete_editor" ON raid_members
  FOR DELETE USING (is_guild_editor(guild_id));

-- ============================================================
-- activities 表策略
-- ============================================================
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- 公会成员可读取活动
CREATE POLICY "activities_select_member" ON activities
  FOR SELECT USING (is_guild_member(guild_id));

-- 公会 owner/editor 可创建活动
CREATE POLICY "activities_insert_editor" ON activities
  FOR INSERT WITH CHECK (is_guild_editor(guild_id));

-- 公会 owner/editor 可更新活动
CREATE POLICY "activities_update_editor" ON activities
  FOR UPDATE USING (is_guild_editor(guild_id));

-- 公会 owner/editor 可删除活动
CREATE POLICY "activities_delete_editor" ON activities
  FOR DELETE USING (is_guild_editor(guild_id));

-- ============================================================
-- activity_attendance 表策略
-- ============================================================
ALTER TABLE activity_attendance ENABLE ROW LEVEL SECURITY;

-- 公会成员可读取考勤记录
CREATE POLICY "attendance_select_member" ON activity_attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM activities
      WHERE activities.id = activity_attendance.activity_id
      AND is_guild_member(activities.guild_id)
    )
  );

-- 公会 owner/editor 可管理考勤记录
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

-- ============================================================
-- loots 表策略（旧表，保留）
-- ============================================================
ALTER TABLE loots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loots_select_member" ON loots
  FOR SELECT USING (is_guild_member(guild_id));

CREATE POLICY "loots_insert_editor" ON loots
  FOR INSERT WITH CHECK (is_guild_editor(guild_id));

CREATE POLICY "loots_update_editor" ON loots
  FOR UPDATE USING (is_guild_editor(guild_id));

CREATE POLICY "loots_delete_editor" ON loots
  FOR DELETE USING (is_guild_editor(guild_id));

-- ============================================================
-- loot_records 表策略（V2.1 新增，主表）
-- ============================================================
ALTER TABLE loot_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loot_records_select_member" ON loot_records
  FOR SELECT USING (is_guild_member(guild_id));

CREATE POLICY "loot_records_insert_editor" ON loot_records
  FOR INSERT WITH CHECK (is_guild_editor(guild_id));

CREATE POLICY "loot_records_update_editor" ON loot_records
  FOR UPDATE USING (is_guild_editor(guild_id));

CREATE POLICY "loot_records_delete_editor" ON loot_records
  FOR DELETE USING (is_guild_editor(guild_id));

-- ============================================================
-- wishlists 表策略
-- ============================================================
ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;

-- 公会成员可读取心愿单
CREATE POLICY "wishlists_select_member" ON wishlists
  FOR SELECT USING (is_guild_member(guild_id));

-- 公会 owner/editor 可管理心愿单
CREATE POLICY "wishlists_insert_editor" ON wishlists
  FOR INSERT WITH CHECK (is_guild_editor(guild_id));

CREATE POLICY "wishlists_update_editor" ON wishlists
  FOR UPDATE USING (is_guild_editor(guild_id));

CREATE POLICY "wishlists_delete_editor" ON wishlists
  FOR DELETE USING (is_guild_editor(guild_id));

-- ============================================================
-- notifications 表策略
-- ============================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 用户可读取自己的通知
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

-- 公会 owner/editor 可发送通知
CREATE POLICY "notifications_insert_editor" ON notifications
  FOR INSERT WITH CHECK (is_guild_editor(guild_id));

-- ============================================================
-- feishu_configs 表策略
-- ============================================================
ALTER TABLE feishu_configs ENABLE ROW LEVEL SECURITY;

-- 公会 owner 可管理飞书配置
CREATE POLICY "feishu_configs_owner" ON feishu_configs
  FOR ALL USING (is_guild_owner(guild_id));

-- ============================================================
-- user_profiles 表策略
-- ============================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- 用户可读取自己的资料
CREATE POLICY "user_profiles_select_own" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- 用户可更新自己的资料
CREATE POLICY "user_profiles_update_own" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- 认证用户可创建自己的资料
CREATE POLICY "user_profiles_insert_auth" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================================
-- 注意：写入操作通过 server.js 代理完成
-- 以上 RLS 策略主要用于 SELECT 操作
-- INSERT/UPDATE/DELETE 通过 service_role key 在 server.js 中执行
-- server.js 会先验证用户 JWT，再以 service_role 写入
-- ============================================================
