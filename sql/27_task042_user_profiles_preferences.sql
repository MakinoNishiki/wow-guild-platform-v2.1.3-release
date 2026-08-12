-- 增量 SQL 27：任务书 #42 WP0 用户偏好统一列（REQ-105 导航拖拽排序 / REQ-107 日历密度切换）
-- 定案口径（2026-08-11 运营裁）：user_profiles 加 preferences jsonb 单列，UI 偏好统装一列、一次迁移多处用。
-- 执行纪律（同 sql/25/26 先例）：备份 user_profiles → SSH + docker exec（supabase_admin）→ NOTIFY pgrst ×2 → 复核
-- 回滚：ALTER TABLE user_profiles DROP COLUMN IF EXISTS preferences;

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN user_profiles.preferences IS 'UI 偏好统一列（任务书 #42）：nav_order=侧栏导航顺序（页签 key 数组）、calendar_density=考勤日历密度（compact=紧凑默认/comfortable=舒适）等键，逐键增量读写';

-- RLS 核查（sql/02_rls.sql §user_profiles）：select_own / update_own / insert_auth 三条策略均按行级
-- （user_id = auth.uid()）判定，无列级权限白名单——新列自然被既有策略覆盖，无需新增/变更策略。

-- 执行后复核：
--   SELECT count(*) FROM user_profiles WHERE preferences IS NULL;   -- 应为 0
--   SELECT column_name, data_type, column_default FROM information_schema.columns
--     WHERE table_name='user_profiles' AND column_name='preferences'; -- jsonb / '{}'::jsonb
