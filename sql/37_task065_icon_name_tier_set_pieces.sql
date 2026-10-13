-- ============================================================================
-- 任务书 #65 WP2 / REQ-156：掉落表 icon_name 列 + tier_set_pieces 套装件表
-- 日期：2026-10-13
--
-- 背景：
--   ①icon_id 为数字 fileDataID（历史字段），与 CDN 路径不兼容；新增 icon_name
--     （字符串图标名，如 inv_helm_plate_xxx）供 Blizzard render CDN 取图。
--     两列共存，icon_id 禁止删除/修改（任务书红线）；icon_name 可空逐步填充
--     （既有 113 件有 icon_id 的装备等下次插件导出回补）。
--   ②tier_set_pieces 存套装展开件（赛季×套装×部位唯一），数据源 = 插件
--     C_TransmogSets 导出 JSON 经数据中心「套装数据导入」入口幂等导入。
--
-- 内容：
--   1. boss_loot    ADD COLUMN icon_name TEXT（可空，不动既有列/数据）
--   2. dungeon_loot ADD COLUMN icon_name TEXT（同上）
--   3. CREATE TABLE tier_set_pieces（+2 索引 + RLS 公开只读策略）
--
-- 幂等：ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS /
--       CREATE INDEX IF NOT EXISTS / DROP POLICY IF EXISTS 前置，可重复执行。
--
-- 注意：公示页公开 RPC get_public_loot_detail 为显式字段白名单——本迁移
--       不改 RPC，icon_name 不透出公示页（WP3 仅 picker 消费，走 MasterData
--       authenticated 直读）。如需公示页图标，另立批 CREATE OR REPLACE。
--
-- 执行方式（运营执行）：备份 → SSH 服务器 →
--   sudo docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < 本文件
-- 执行后复核：\d boss_loot / \d dungeon_loot / \d tier_set_pieces +
--   REST anon GET tier_set_pieces 应 200（公开只读）。
--
-- 回滚：
--   DROP TABLE IF EXISTS tier_set_pieces;
--   ALTER TABLE boss_loot DROP COLUMN IF EXISTS icon_name;
--   ALTER TABLE dungeon_loot DROP COLUMN IF EXISTS icon_name;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================

-- 1) boss_loot / dungeon_loot 增加 icon_name（与 icon_id 共存，可空逐步填充）
ALTER TABLE boss_loot ADD COLUMN IF NOT EXISTS icon_name TEXT;
COMMENT ON COLUMN boss_loot.icon_name IS '字符串图标名（Blizzard CDN 取图用）；icon_id 为数字 fileDataID 历史字段，两列共存';
ALTER TABLE dungeon_loot ADD COLUMN IF NOT EXISTS icon_name TEXT;
COMMENT ON COLUMN dungeon_loot.icon_name IS '字符串图标名（Blizzard CDN 取图用）；icon_id 为数字 fileDataID 历史字段，两列共存';

-- 2) tier_set_pieces 套装件表
CREATE TABLE IF NOT EXISTS tier_set_pieces (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    season_id UUID REFERENCES game_seasons(id) NOT NULL,
    tier_set_id UUID REFERENCES tier_sets(id) NOT NULL,
    slot TEXT NOT NULL CHECK (slot IN ('头部', '肩部', '胸部', '手部', '腿部')),
    item_name TEXT NOT NULL,
    official_item_id BIGINT,
    icon_name TEXT,
    ilvl INTEGER,
    armor_type TEXT CHECK (armor_type IN ('布甲', '皮甲', '锁甲', '板甲')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(season_id, tier_set_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_tier_set_pieces_season ON tier_set_pieces(season_id);
CREATE INDEX IF NOT EXISTS idx_tier_set_pieces_tier_set ON tier_set_pieces(tier_set_id);

-- RLS：公开只读（公示页/匿名未来消费）；写入走 server.js 代理 service_role（绕过 RLS，超管分支鉴权）
ALTER TABLE tier_set_pieces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tier_set_pieces_public_select" ON tier_set_pieces;
CREATE POLICY "tier_set_pieces_public_select" ON tier_set_pieces
  FOR SELECT USING (true);

NOTIFY pgrst, 'reload schema';
