-- ============================================================
-- 增量迁移 35：家宅方案单（任务书 #58-WP1）
-- 内容：decor_plans（方案单头）+ decor_plan_items（方案单明细）。
--   用户行级数据：RLS 全部按 user_id = auth.uid() 行级判定，
--   明细表经 plan_id JOIN 头表归属判定；anon 无任何权限。
--   多方案能力表级预留（WP2 才开放 UI），WP1 前端只用「每用户当前一个方案」。
-- 执行方式：SSH + docker exec psql（supabase_admin 角色），幂等可重复执行
-- 执行前：纯新增表，零触碰既有表，无需备份既有数据（备份通道照走留档）
-- 执行后：NOTIFY pgrst 重载 schema 缓存 + REST 复核（匿名 401/403、登录用户仅见己行）
-- 回滚说明：
--   DROP TABLE decor_plan_items;
--   DROP TABLE decor_plans;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

CREATE TABLE IF NOT EXISTS decor_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT '我的方案单',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_decor_plans_user ON decor_plans(user_id);

CREATE TABLE IF NOT EXISTS decor_plan_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL REFERENCES decor_plans(id) ON DELETE CASCADE,
  record_id   integer NOT NULL REFERENCES decor_catalog(record_id),
  qty         smallint NOT NULL DEFAULT 1 CHECK (qty >= 1),
  added_at    timestamptz DEFAULT now(),
  UNIQUE (plan_id, record_id)
);
CREATE INDEX IF NOT EXISTS idx_decor_plan_items_plan ON decor_plan_items(plan_id);

ALTER TABLE decor_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE decor_plan_items ENABLE ROW LEVEL SECURITY;

-- decor_plans：属主全维度
CREATE POLICY select_own ON decor_plans FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY insert_own ON decor_plans FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY update_own ON decor_plans FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY delete_own ON decor_plans FOR DELETE TO authenticated USING (user_id = auth.uid());

-- decor_plan_items：经头表归属判定
CREATE POLICY select_own ON decor_plan_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM decor_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));
CREATE POLICY insert_own ON decor_plan_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM decor_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));
CREATE POLICY update_own ON decor_plan_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM decor_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));
CREATE POLICY delete_own ON decor_plan_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM decor_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));

NOTIFY pgrst, 'reload schema';
