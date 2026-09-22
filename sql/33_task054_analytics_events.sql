-- ============================================================
-- 增量迁移 33：全站埋点事件表 analytics_events（任务书 #54 WP1，REQ-141）
-- 日期：2026-09-22
-- 内容：
--   新表 analytics_events——全站埋点采集层（路线 A 自建，方案单 v1.1 WP1）。
--   写入路径唯一 = server.js POST /api/track（service_role 转发 PostgREST，
--   白名单列组装）；RLS 启用且零策略 = anon/authenticated 全拒，
--   仅 service_role 可写可查。明文 IP 永不落库（仅存 ip_h 日盐 hash），
--   referrer 只存域（ref_dom）。
--   保留期 90 天滚动（清理逻辑在 WP2 实现，本迁移不含）。
-- 执行方式：SSH + docker exec psql（supabase_admin 角色），幂等可重复执行
-- 执行前：纯新增表，零触碰既有表，无需备份既有数据（备份通道照走留档）
-- 执行后：文件末尾 NOTIFY pgrst 重载 schema 缓存
-- 回滚说明：
--   DROP TABLE IF EXISTS public.analytics_events;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id      bigint generated always as identity primary key,
  ts      timestamptz not null default now(),          -- 服务端权威时间
  event   text not null,                               -- page_view / 自定义事件名（白名单由服务端控）
  page    text not null,                               -- decor / data / index:<页签key>
  uid     uuid,                                        -- 登录用户（溯源）；未登录为 null
  vid     text,                                        -- 访客 ID（localStorage 临时牌）
  ip_h    text,                                        -- IP+日盐 hash（明文 IP 永不落库）
  ref_dom text,                                        -- 来源域（仅 hostname，空=直接访问存 null）
  props   jsonb not null default '{}'
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_ts    ON public.analytics_events (ts desc);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event ON public.analytics_events (event, ts desc);
CREATE INDEX IF NOT EXISTS idx_analytics_events_page  ON public.analytics_events (page, ts desc);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;   -- 零策略=anon/authenticated 全拒，仅 service_role 可写可查

COMMENT ON TABLE public.analytics_events IS 'REQ-141 全站埋点事件表（任务书 #54）：保留期 90 天滚动（WP2 实现清理）';

NOTIFY pgrst, 'reload schema';
