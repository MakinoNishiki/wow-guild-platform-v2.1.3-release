-- ============================================================
-- 增量迁移 10：主数据层 V2.2（任务书 #14）——9 张游戏字典主数据表
-- 日期：2026-07-28
-- 目标：团本/BOSS/职业/专精/赛季/大米/掉落池/套装从代码常量搬进数据库，
--       此后游戏更新 = 运营在「数据中心」维护页录数据，不再发版。
-- 权限模型（运营拍板决策 #1）：全产品共用一套字典，
--   读：所有登录用户（authenticated）；
--   写：仅产品超管（app_metadata.role = 'superadmin'）。
-- 注意：应用写路径统一走 server.js 代理（service_role 绕过 RLS），
--   代理层另有超管校验；本文件 RLS 是直连通道的最后防线。
-- 取舍说明：大秘境独立成表 game_dungeons（4.7），
--   因此 game_raids.type 仅取 'raid' / 'lair' 两值，不含 'dungeon'。
-- 执行方式：Supabase SQL Editor 整文件执行，幂等可重复执行。
-- 回滚：DROP TABLE IF EXISTS boss_loot, tier_sets, game_dungeons, game_specs,
--   game_bosses, game_raids, game_seasons, game_patches, game_classes CASCADE;
-- ============================================================

-- 4.1 游戏版本
CREATE TABLE IF NOT EXISTS game_patches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT UNIQUE NOT NULL,
  name TEXT,
  release_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4.2 赛季
CREATE TABLE IF NOT EXISTS game_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  patch_id UUID REFERENCES game_patches(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- 同一时刻仅一个当前赛季（REQ-018 赛季口径权威数据源）
CREATE UNIQUE INDEX IF NOT EXISTS uq_game_seasons_current
  ON game_seasons (is_current) WHERE is_current;

-- 4.3 团本（含巢穴；大秘境独立见 4.7）
CREATE TABLE IF NOT EXISTS game_raids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  season_id UUID REFERENCES game_seasons(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'raid' CHECK (type IN ('raid', 'lair')),
  min_players INT NOT NULL DEFAULT 20,
  max_players INT NOT NULL DEFAULT 20,
  max_difficulty TEXT,
  open_date DATE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_game_raids_season ON game_raids(season_id);

-- 4.4 BOSS
CREATE TABLE IF NOT EXISTS game_bosses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raid_id UUID REFERENCES game_raids(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  boss_order INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (raid_id, boss_order)
);
CREATE INDEX IF NOT EXISTS idx_game_bosses_raid ON game_bosses(raid_id);

-- 4.5 掉落池
CREATE TABLE IF NOT EXISTS boss_loot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_id UUID REFERENCES game_bosses(id) ON DELETE CASCADE NOT NULL,
  item_name TEXT NOT NULL,
  slot TEXT,
  item_type TEXT,
  official_item_id INT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_boss_loot_boss ON boss_loot(boss_id);

-- 4.8 职业（需在 tier_sets 之前建，被引用）
CREATE TABLE IF NOT EXISTS game_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_key INT UNIQUE NOT NULL,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4.6 职业套装
CREATE TABLE IF NOT EXISTS tier_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID REFERENCES game_seasons(id) ON DELETE CASCADE NOT NULL,
  class_id UUID REFERENCES game_classes(id) ON DELETE CASCADE NOT NULL,
  set_name TEXT NOT NULL,
  bonus_2 TEXT,
  bonus_4 TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (season_id, class_id)
);

-- 4.7 大秘境（赛季轮换，独立成表——4.3 取舍）
CREATE TABLE IF NOT EXISTS game_dungeons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID REFERENCES game_seasons(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  is_new BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_game_dungeons_season ON game_dungeons(season_id);

-- 4.9 专精
CREATE TABLE IF NOT EXISTS game_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES game_classes(id) ON DELETE CASCADE NOT NULL,
  spec_key INT NOT NULL,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('TANK', 'HEALER', 'DAMAGE')),
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (class_id, spec_key)
);

-- ============================================================
-- RLS：全登录用户可读；仅超管可写
-- ============================================================
ALTER TABLE game_patches ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_raids ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_bosses ENABLE ROW LEVEL SECURITY;
ALTER TABLE boss_loot ENABLE ROW LEVEL SECURITY;
ALTER TABLE tier_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_dungeons ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_specs ENABLE ROW LEVEL SECURITY;

-- 读策略（9 表同一条，逐表建）
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'game_patches','game_seasons','game_raids','game_bosses','boss_loot',
    'tier_sets','game_dungeons','game_classes','game_specs'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS master_read ON %I', t);
    EXECUTE format(
      'CREATE POLICY master_read ON %I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS master_write ON %I', t);
    EXECUTE format(
      'CREATE POLICY master_write ON %I FOR ALL TO authenticated ' ||
      'USING ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''superadmin'') ' ||
      'WITH CHECK ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''superadmin'')', t);
  END LOOP;
END $$;
