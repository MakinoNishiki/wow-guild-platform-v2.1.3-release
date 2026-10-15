-- sql/42_task075_loot_drops.sql
-- 任务书 #75 子任务 A3 前置：公会拾取记录表（插件 WoWButlerCollector 自动采集 → 前端导入页入库）
-- 定位：拾取事件流水（谁在何时何地捡了什么），与公共字典 boss_loot/dungeon_loot 严格分离
--       （字典=EJ 采集全站共享，拾取记录=公会私有流水，治理边界见任务书修正版裁定）。
-- 执行：Supabase SQL Editor 整段执行（幂等可重跑）。
-- 回滚：DROP TABLE IF EXISTS loot_drops;（无其他对象）

CREATE TABLE IF NOT EXISTS loot_drops (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    player_name TEXT NOT NULL,          -- 拾取者角色名（插件剥服务器后缀）
    item_name TEXT NOT NULL,
    official_item_id BIGINT,            -- 与 boss_loot/dungeon_loot.official_item_id 同型（sql/37 口径）
    icon_id INTEGER,                    -- 图标 fileID 数字（插件 API 只能采到数字，接 assets/icons/items/{icon_id}.png 管道）
    quality INTEGER,                    -- 4=史诗 5=传说（插件过滤后理论只有 4/5）
    ilvl INTEGER,
    slot TEXT,                          -- 原始 equipLoc（INVTYPE_*）
    slot_cn TEXT,                       -- 中文部位（转换脚本映射产出）
    item_type TEXT,                     -- 本地化大类（武器/护甲）
    boss_name TEXT,                     -- 击杀窗归属，可空（空=非首领拾取或窗口外）
    instance_name TEXT,
    difficulty TEXT,                    -- 本地化难度名（普通/英雄/史诗…）
    difficulty_id INTEGER,
    timestamp TIMESTAMPTZ NOT NULL,     -- 拾取时刻（插件 time() → 转换 ISO）
    source TEXT DEFAULT 'plugin',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE loot_drops IS '公会拾取记录表（插件自动采集，任务书 #75）';

CREATE INDEX IF NOT EXISTS idx_loot_drops_guild ON loot_drops(guild_id);
CREATE INDEX IF NOT EXISTS idx_loot_drops_timestamp ON loot_drops(timestamp);

-- 导入幂等闸：同公会+同拾取者+同物品+同秒 = 同一拾取事件，重复导入/重复插入不翻倍
-- （NULLS NOT DISTINCT：official_item_id 理论上恒非空，防御 null 时不误放重复）
CREATE UNIQUE INDEX IF NOT EXISTS uq_loot_drops_event
  ON loot_drops(guild_id, player_name, official_item_id, timestamp) NULLS NOT DISTINCT;

-- RLS：公会成员可读；写入走 server.js 代理 service_role（绕过 RLS，公会级鉴权在代理层）
ALTER TABLE loot_drops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loot_drops_select_member" ON loot_drops;
CREATE POLICY "loot_drops_select_member" ON loot_drops
  FOR SELECT USING (is_guild_member(guild_id));

NOTIFY pgrst, 'reload schema';
