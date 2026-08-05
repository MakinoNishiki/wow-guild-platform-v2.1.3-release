-- ============================================================
-- 增量 SQL 15：任务书 #21 WP2 认领治理三档公会开关（REQ-067）
-- 日期：2026-08-05
-- 内容：
--   1. guilds 新增 claim_mode 列：free（自由认领，默认）/ approval（认领需审核）/ assign（仅管理者分配）
--      NOT NULL DEFAULT 'free' —— 存量公会一律默认 free，不改变任何人的现状
--   2. 新表 claim_requests：approval 模式下的认领申请
--   3. 部分唯一索引：同一 member_id 仅允许一条 pending 申请
--   4. claim_requests RLS（读）：申请人读自己的；owner/editor 读本公会的（审批列表）
--      写入一律走 server.js 代理（viewer 申请走窄例外、owner/editor 审批走通用业务分支），
--      RLS 为直连最后防线，故不开放直连写策略
-- 执行方式：Supabase SQL Editor 整文件执行，幂等可重复执行
-- 执行前：先备份（guilds 全表已导出至 backup/2026-08-05-task21-pre-migration/guilds.json）
-- 执行后：文件末尾 NOTIFY pgrst 重载 schema 缓存；
--         REST 复核：GET /rest/v1/guilds?select=id,claim_mode 应带 claim_mode 列；
--                   GET /rest/v1/claim_requests?select=id&limit=1 应返回 200（空数组）
-- 回滚说明：
--   DROP TABLE IF EXISTS claim_requests;
--   ALTER TABLE guilds DROP COLUMN IF EXISTS claim_mode;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

-- 1. guilds.claim_mode
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS claim_mode TEXT NOT NULL DEFAULT 'free';
ALTER TABLE guilds DROP CONSTRAINT IF EXISTS guilds_claim_mode_check;
ALTER TABLE guilds ADD CONSTRAINT guilds_claim_mode_check CHECK (claim_mode IN ('free','approval','assign'));

-- 2. claim_requests 表
CREATE TABLE IF NOT EXISTS claim_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES raid_members(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- 3. 部分唯一索引：同一成员同一时间只允许一条待审核申请
CREATE UNIQUE INDEX IF NOT EXISTS uq_claim_requests_pending_member
  ON claim_requests(member_id) WHERE status = 'pending';

-- 4. RLS（仅读策略；写入走代理）
ALTER TABLE claim_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claim_requests_select_own" ON claim_requests;
CREATE POLICY "claim_requests_select_own" ON claim_requests
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "claim_requests_select_editor" ON claim_requests;
CREATE POLICY "claim_requests_select_editor" ON claim_requests
  FOR SELECT USING (is_guild_editor(guild_id));

-- 5. 重载 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
