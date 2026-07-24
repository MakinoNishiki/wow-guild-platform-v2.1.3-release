-- ============================================================
-- WoW Guild Platform - Supabase 数据库表结构
-- 生成日期: 2026-07-25
-- 版本: V2.1.2
-- ============================================================

-- 1. 公会表
CREATE TABLE IF NOT EXISTS guilds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_code TEXT UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 公会成员权限表
CREATE TABLE IF NOT EXISTS guild_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(guild_id, user_id)
);

-- 3. 公会邀请码表
CREATE TABLE IF NOT EXISTS guild_invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE NOT NULL,
  code TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  created_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ,
  max_uses INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. WoW 角色成员表
CREATE TABLE IF NOT EXISTS raid_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  class TEXT NOT NULL,
  spec TEXT DEFAULT '',
  role TEXT DEFAULT '输出',
  off_spec TEXT DEFAULT '',
  off_specs TEXT[] DEFAULT '{}',
  status TEXT DEFAULT '正式',
  join_date DATE DEFAULT CURRENT_DATE,
  notes TEXT DEFAULT '',
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. 考勤活动表
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  activity_date DATE NOT NULL,
  raid TEXT DEFAULT '',
  boss TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. 出勤记录表
CREATE TABLE IF NOT EXISTS activity_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID REFERENCES activities(id) ON DELETE CASCADE NOT NULL,
  member_id UUID REFERENCES raid_members(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('出席', '缺席', '迟到', '替补', '请假')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(activity_id, member_id)
);

-- 7. 装备记录表（旧表，保留作为历史备份）
CREATE TABLE IF NOT EXISTS loots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE NOT NULL,
  item_name TEXT NOT NULL,
  item_id INTEGER DEFAULT 0,
  member_id UUID REFERENCES raid_members(id) ON DELETE SET NULL,
  boss TEXT DEFAULT '',
  raid TEXT DEFAULT '',
  difficulty TEXT DEFAULT '',
  slot TEXT DEFAULT '',
  category TEXT DEFAULT '',
  item_level INTEGER DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  priority TEXT DEFAULT 'P2',
  status TEXT DEFAULT '已分配',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. 装备履历表（V2.1 新增，主表）
CREATE TABLE IF NOT EXISTS loot_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE NOT NULL,
  character_id UUID REFERENCES raid_members(id) ON DELETE SET NULL,
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
  distribution_method TEXT DEFAULT 'custom' CHECK (distribution_method IN ('roll', 'roll_rule', 'cl', 'master_loot', 'dkp', 'epgp', 'gkp', 'custom')),
  player_action TEXT DEFAULT 'none' CHECK (player_action IN ('need', 'greed', 'pass', 'none')),
  roll_value INTEGER,
  is_wishlist BOOLEAN DEFAULT false,
  rule_note TEXT DEFAULT '',
  decision_note TEXT DEFAULT '',
  note TEXT DEFAULT '',
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. 心愿单表
CREATE TABLE IF NOT EXISTS wishlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE NOT NULL,
  member_id UUID REFERENCES raid_members(id) ON DELETE CASCADE NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(guild_id, member_id)
);

-- 10. 通知表
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT DEFAULT '',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. 飞书同步配置表
CREATE TABLE IF NOT EXISTS feishu_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE NOT NULL,
  app_id TEXT DEFAULT '',
  app_secret TEXT DEFAULT '',
  bitable_app_token TEXT DEFAULT '',
  members_table_id TEXT DEFAULT '',
  activities_table_id TEXT DEFAULT '',
  records_table_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(guild_id)
);

-- 12. 用户资料表
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_guild_members_guild ON guild_members(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_user ON guild_members(user_id);
CREATE INDEX IF NOT EXISTS idx_raid_members_guild ON raid_members(guild_id);
CREATE INDEX IF NOT EXISTS idx_raid_members_user ON raid_members(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_guild ON activities(guild_id);
CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(activity_date);
CREATE INDEX IF NOT EXISTS idx_activity_attendance_activity ON activity_attendance(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_attendance_member ON activity_attendance(member_id);
CREATE INDEX IF NOT EXISTS idx_loots_guild ON loots(guild_id);
CREATE INDEX IF NOT EXISTS idx_loot_records_guild ON loot_records(guild_id);
CREATE INDEX IF NOT EXISTS idx_loot_records_character ON loot_records(character_id);
CREATE INDEX IF NOT EXISTS idx_loot_records_date ON loot_records(obtained_date);
CREATE INDEX IF NOT EXISTS idx_wishlists_guild ON wishlists(guild_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_member ON wishlists(member_id);
CREATE INDEX IF NOT EXISTS idx_notifications_guild ON notifications(guild_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_guild_invite_codes_code ON guild_invite_codes(code);
