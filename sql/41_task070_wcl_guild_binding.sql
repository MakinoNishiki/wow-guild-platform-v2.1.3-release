-- ============================================================
-- 增量 SQL 41：任务书 #70 WCL 公会绑定与报告同步（guilds 加 8 列 + 唯一索引）
-- 日期：2026-10-14
-- 内容：
--   1. guilds 新增 8 列（任务书 §3.1）：
--      wcl_guild_id BIGINT        —— WCL 公会 ID（方案A/C 共用）
--      wcl_guild_name TEXT        —— WCL 公会名（绑定时快照）
--      wcl_server_name TEXT       —— WCL 服务器名
--      wcl_region TEXT DEFAULT 'cn'
--      wcl_bind_method TEXT       —— 'paste' | 'oauth' | NULL
--      wcl_token JSONB            —— 仅方案C用：{access_token, refresh_token, expires_at}
--                                   存 AES-256-GCM 密文（server.js 加密，密钥只在服务端 env）
--      wcl_bound_at TIMESTAMPTZ
--      wcl_auto_create_event BOOLEAN DEFAULT false —— 自动创建活动开关（默认关）
--   2. 部分唯一索引：同一 WCL 公会 ID 只能绑定一个管家公会
--   3. 列级权限加固：REVOKE authenticated/anon 对 wcl_token 的 SELECT——
--      密文也不出服务端；PostgREST select=* 自动排除被撤列，service_role 不受影响
--      （实施备注：若 PostgREST 对该写法行为异常，回退方案=保留密文可读，
--        密钥不离服务端仍满足"禁止明文"红线，需在修改报告标注）
-- 执行方式：Supabase SQL Editor 整文件执行，幂等可重复执行
-- 执行前备份：guilds 全表导出（运营执行前自选；本批只加列不改存量值，风险低）
-- 执行后复核：
--   GET /rest/v1/guilds?select=id,wcl_guild_id,wcl_bind_method&limit=1 应带新列
--   GET /rest/v1/guilds?select=wcl_token&limit=1 用 anon 应报 42703（列不可见即加固生效）
-- 回滚说明：
--   DROP INDEX IF EXISTS idx_guilds_wcl_guild_id;
--   ALTER TABLE guilds DROP COLUMN IF EXISTS wcl_guild_id,
--     DROP COLUMN IF EXISTS wcl_guild_name, DROP COLUMN IF EXISTS wcl_server_name,
--     DROP COLUMN IF EXISTS wcl_region, DROP COLUMN IF EXISTS wcl_bind_method,
--     DROP COLUMN IF EXISTS wcl_token, DROP COLUMN IF EXISTS wcl_bound_at,
--     DROP COLUMN IF EXISTS wcl_auto_create_event;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

-- 1. guilds 新增 8 列
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_guild_id BIGINT;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_guild_name TEXT;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_server_name TEXT;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_region TEXT DEFAULT 'cn';
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_bind_method TEXT;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_token JSONB;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_bound_at TIMESTAMPTZ;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wcl_auto_create_event BOOLEAN DEFAULT false;

-- 2. 部分唯一索引：一个 WCL 公会 ID 只能绑定一个管家公会
CREATE UNIQUE INDEX IF NOT EXISTS idx_guilds_wcl_guild_id
  ON guilds(wcl_guild_id) WHERE wcl_guild_id IS NOT NULL;

-- 3. 列级权限：wcl_token 密文不对 authenticated/anon 透出
REVOKE SELECT (wcl_token) ON guilds FROM authenticated, anon;

-- 4. 重载 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
