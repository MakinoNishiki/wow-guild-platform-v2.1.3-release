-- ============================================================
-- 增量迁移 30：家宅装饰目录表 decor_catalog（任务书 #49 WP2，REQ-137）
-- 日期：2026-09-17
-- 内容：
--   新表 decor_catalog——家宅装饰全量目录（插件 WoWButlerDecor v0.2 真机采集，
--   2062 件，run 20260917-010800）；公开目录数据，无公会维度、无用户数据。
--   主键 = record_id（游戏内目录天然主键，采集侧全唯一已实证 1~28350），
--   种子装载匹配键 = record_id（INSERT ... ON CONFLICT (record_id) DO UPDATE，幂等）。
--   RLS 沿袭现有公开字典表（boss_loot/dungeon_loot 公示页读取路径）三策略：
--   authenticated 可读 / anon 可读 / 写仅超管（app_metadata.role='superadmin'）。
-- 执行方式：SSH + docker exec psql（supabase_admin 角色），幂等可重复执行
-- 执行前：纯新增表，零触碰既有表，无需备份既有数据
-- 执行后：文件末尾 NOTIFY pgrst 重载 schema 缓存
-- 回滚说明：
--   DROP TABLE decor_catalog;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

CREATE TABLE IF NOT EXISTS decor_catalog (
  record_id        integer PRIMARY KEY,
  entry_type       smallint NOT NULL DEFAULT 1,
  item_id          integer,
  name             text NOT NULL,
  icon_file_id     bigint,
  asset_id         bigint,
  model_scene_id   integer,
  quality          smallint,
  size             smallint,
  placement_cost   smallint,
  category_ids     jsonb,
  subcategory_ids  jsonb,
  source_text      text,
  tags             jsonb,
  indoors          boolean,
  outdoors         boolean,
  can_customize    boolean,
  first_acquisition_bonus smallint,
  client_version   text,      -- 采集客户端版本，如 12.1.0
  run_id           text,      -- 采集批次，如 20260917-010800
  collected_at     timestamptz DEFAULT now()
);

-- RLS：公开目录数据，与 boss_loot/dungeon_loot 同风格三策略
ALTER TABLE decor_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_read ON decor_catalog;
CREATE POLICY master_read ON decor_catalog FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS master_read_anon ON decor_catalog;
CREATE POLICY master_read_anon ON decor_catalog FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS master_write ON decor_catalog;
CREATE POLICY master_write ON decor_catalog FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin');

-- 重载 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
