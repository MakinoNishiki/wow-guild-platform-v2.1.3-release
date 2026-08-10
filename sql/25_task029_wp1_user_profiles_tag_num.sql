-- ============================================================
-- 增量 SQL 25：任务书 #29 WP1 玩家ID（REQ-094 A 组）——user_profiles.tag_num
-- 日期：2026-08-10
-- 内容：
--   1. user_profiles 加 tag_num 列（integer，10000-99999，BattleTag 数字段）
--   2. 存量账号批量补发：缺资料行的 auth.users 先建行，再为全部 tag_num 空行
--      分配不重复随机数（应用端 ensureTagNum 同口径兜底，本迁移先一次性补齐）
--   3. tag_num 唯一约束（唯一索引；NULL 不参验，未分配行不受阻）
--   4. NOTIFY pgrst 重载 schema 缓存
-- 交付口径：本文件只产出不执行——由运营按迁移纪律执行
--   （备份 user_profiles → SSH + docker exec psql（supabase_admin）→ 执行 → 核验）
-- 执行后核验：
--   SELECT count(*) FROM user_profiles WHERE tag_num IS NULL;   -- 应为 0
--   SELECT tag_num, count(*) FROM user_profiles GROUP BY 1 HAVING count(*)>1; -- 应为 0 行
-- ============================================================

-- 1. 加列（幂等）+ 取值范围 CHECK（BattleTag 数字段恒 5 位）
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS tag_num integer;
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS ck_user_profiles_tag_num_range;
ALTER TABLE user_profiles ADD CONSTRAINT ck_user_profiles_tag_num_range
  CHECK (tag_num IS NULL OR (tag_num >= 10000 AND tag_num <= 99999));

-- 2a. 存量账号批量补发·第一步：auth.users 中缺 user_profiles 行的先建行
--     （display_name 取注册时 user_metadata 快照，仅作存量回退展示，不再是显示名真源）
INSERT INTO user_profiles (user_id, display_name)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'display_name', '')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM user_profiles p WHERE p.user_id = u.id);

-- 2b. 第二步：为全部 tag_num 空行分配不重复随机数（10000-99999）
DO $$
DECLARE
  r RECORD;
  cand int;
  tries int;
BEGIN
  FOR r IN SELECT user_id FROM user_profiles WHERE tag_num IS NULL LOOP
    tries := 0;
    LOOP
      cand := floor(10000 + random() * 90000)::int;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM user_profiles WHERE tag_num = cand);
      tries := tries + 1;
      IF tries > 100 THEN
        RAISE EXCEPTION 'tag_num 分配重试超限（user_id=%），请检查占用情况', r.user_id;
      END IF;
    END LOOP;
    UPDATE user_profiles SET tag_num = cand WHERE user_id = r.user_id;
  END LOOP;
END $$;

-- 3. 唯一约束（唯一索引；PG 唯一索引下多行 NULL 不冲突，未分配行不受阻）
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_profiles_tag_num ON user_profiles (tag_num);

-- 4. 重载 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 回滚说明：
--   DROP INDEX IF EXISTS uq_user_profiles_tag_num;
--   ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS ck_user_profiles_tag_num_range;
--   ALTER TABLE user_profiles DROP COLUMN IF EXISTS tag_num;
--   -- 2a 为补发的资料行如需一并回滚（通常不必，行本身无害）：
--   -- DELETE FROM user_profiles WHERE display_name = '' AND user_id IN (SELECT id FROM auth.users);
--   NOTIFY pgrst, 'reload schema';
-- ============================================================
