-- ============================================================
-- 增量 SQL 16：任务书 #23 WP1 大秘境掉落池 + 字典表匿名读开放
-- 日期：2026-08-05
-- 内容：
--   1. game_bosses 扩展副本归属：raid_id 改可空 + 新增 dungeon_id；
--      CHECK 二选一（raid_id 与 dungeon_id 恰有其一非空）
--   2. 新表 dungeon_loot（REQ-054 字段体系，与 boss_loot 同义；boss_id 可空 = 整体池条目）
--      唯一约束 (dungeon_id, boss_id, item_name)——NULL 陷阱处理：
--      普通唯一约束对 NULL 不去重（boss_id 为 NULL 的整体池条目可重复同名），
--      本库 PG 17.6 ≥ 15，选用 NULLS NOT DISTINCT（NULL 视为相等参与去重）；
--      备选方案（PG14 及以下）：表达式唯一索引
--      CREATE UNIQUE INDEX ... ON dungeon_loot (dungeon_id, COALESCE(boss_id, '00000000-0000-0000-0000-000000000000'::uuid), item_name);
--   3. 匿名读开放（仅限任务书清单 9 张字典表，TO anon 叠加策略，既有 authenticated 策略保留）：
--      game_seasons / game_raids / game_bosses / boss_loot / tier_sets /
--      game_dungeons / dungeon_loot / game_classes / game_specs
--      （game_patches 不在任务书清单内，不开放；业务表/用户表一律不触碰）
--   4. dungeon_loot RLS：authenticated 可读、anon 可读、写仅超管（与其余主数据表同模式）
-- 执行方式：SSH + docker exec psql（supabase_admin 角色），幂等可重复执行
-- 执行前：已备份 game_bosses 全表至 backup/2026-08-05-task23-pre-migration/game_bosses.json
-- 执行后：文件末尾 NOTIFY pgrst 重载 schema 缓存
-- 回滚说明：
--   DROP TABLE IF EXISTS dungeon_loot;
--   DO $$ DECLARE t TEXT; BEGIN FOREACH t IN ARRAY ARRAY[
--     'game_seasons','game_raids','game_bosses','boss_loot','tier_sets',
--     'game_dungeons','game_classes','game_specs'
--   ] LOOP EXECUTE format('DROP POLICY IF EXISTS master_read_anon ON %I', t); END LOOP; END $$;
--   ALTER TABLE game_bosses DROP CONSTRAINT IF EXISTS game_bosses_raid_xor_dungeon;
--   ALTER TABLE game_bosses DROP COLUMN IF EXISTS dungeon_id;
--   ALTER TABLE game_bosses ALTER COLUMN raid_id SET NOT NULL;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

-- 1. game_bosses 副本归属
ALTER TABLE game_bosses ADD COLUMN IF NOT EXISTS dungeon_id uuid REFERENCES game_dungeons(id) ON DELETE CASCADE;
ALTER TABLE game_bosses ALTER COLUMN raid_id DROP NOT NULL;
ALTER TABLE game_bosses DROP CONSTRAINT IF EXISTS game_bosses_raid_xor_dungeon;
ALTER TABLE game_bosses ADD CONSTRAINT game_bosses_raid_xor_dungeon
  CHECK ((raid_id IS NULL) <> (dungeon_id IS NULL));
CREATE INDEX IF NOT EXISTS idx_game_bosses_dungeon ON game_bosses(dungeon_id);

-- 2. dungeon_loot 表
CREATE TABLE IF NOT EXISTS dungeon_loot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dungeon_id uuid NOT NULL REFERENCES game_dungeons(id) ON DELETE CASCADE,
  boss_id uuid REFERENCES game_bosses(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  slot text,
  item_type text,
  official_item_id text,
  note text,
  effect text,
  primary_stats text[],
  secondary_stats text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dungeon_loot_dungeon ON dungeon_loot(dungeon_id);
CREATE INDEX IF NOT EXISTS idx_dungeon_loot_boss ON dungeon_loot(boss_id);
-- 唯一约束含 NULL 场景：boss_id 为 NULL 的整体池条目同本内同名装备不允许重复（PG15+ NULLS NOT DISTINCT）
CREATE UNIQUE INDEX IF NOT EXISTS uq_dungeon_loot_item
  ON dungeon_loot (dungeon_id, boss_id, item_name) NULLS NOT DISTINCT;

-- 3+4. RLS
ALTER TABLE dungeon_loot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_read ON dungeon_loot;
CREATE POLICY master_read ON dungeon_loot FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS master_write ON dungeon_loot;
CREATE POLICY master_write ON dungeon_loot FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin');

-- 匿名读（TO anon 叠加，仅限任务书清单 9 张）
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'game_seasons','game_raids','game_bosses','boss_loot','tier_sets',
    'game_dungeons','dungeon_loot','game_classes','game_specs'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS master_read_anon ON %I', t);
    EXECUTE format('CREATE POLICY master_read_anon ON %I FOR SELECT TO anon USING (true)', t);
  END LOOP;
END $$;

-- 5. 重载 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
