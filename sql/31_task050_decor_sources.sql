-- ============================================================
-- 增量迁移 31：decor_catalog 新增 sources jsonb 派生列（任务书 #50 WP2，REQ-137）
-- 日期：2026-09-17
-- 内容：
--   decor_catalog 新增 sources jsonb 可空列——source_text 来源结构化结果
--   （数组，元素 type ∈ vendor/quest/achievement/drop/profession/treasure/
--   renown/event/shop/festival_note，schema 见任务书 #50 WP2 与
--   scripts/decor/parse_source.py 头注释）；派生列，source_text 原文列与
--   既有 19 列零触碰。
-- 执行方式：SSH + docker exec psql（supabase_admin 角色），幂等可重复执行
-- 执行前：备份 decor_catalog（同迁移纪律）；纯加列零触碰既有数据
-- 执行后：文件末尾 NOTIFY pgrst 重载 schema 缓存；
--   紧随执行数据落库产物 scripts/decor/out/decor_sources.sql
--   （parse_source.py 生成，单事务 BEGIN + 2062×UPDATE + COMMIT，
--   派生列整体覆盖写，幂等可重跑零漂移）——数据与迁移分两件的理由：
--   沿袭 #49 先例（sql/30 迁移 + out/decor_seed.sql 产物），sql/ 目录保持
--   人读可审的结构单一事实源，475KB 生成批量件不混入 schema 文件。
-- 回滚说明：
--   回滚：ALTER TABLE decor_catalog DROP COLUMN sources;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

ALTER TABLE decor_catalog ADD COLUMN IF NOT EXISTS sources jsonb;

-- 重载 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
