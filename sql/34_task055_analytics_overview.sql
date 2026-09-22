-- 任务书 #55 WP1 / REQ-141：访问统计看板数据层
-- 新增两个 SECURITY DEFINER 函数：
--   analytics_overview(p_start, p_end, p_grain, p_page) —— 看板聚合（只读 analytics_events）
--   analytics_purge_90d() —— 90 天滚动清理（仅删 analytics_events 过期行）
-- 红线：不 alter analytics_events 表结构，不碰任何业务表；幂等（CREATE OR REPLACE）；回滚见文末注释。
-- 时区钉死（任务书写死，勿改）：全部分桶按东八区 Asia/Shanghai——UTC 切日会让 DAU 歪 8 小时；
-- bucket 序列化为该桶起始时刻的 ISO 串（+08:00）。折线不断：无事件时段由 generate_series 补零桶。

create or replace function public.analytics_overview(
  p_start timestamptz,
  p_end timestamptz,
  p_grain text,
  p_page text default 'all'
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- 参数校验（任一不满足即 raise exception，PostgREST 透 400）
  if p_grain is null or p_grain not in ('hour', 'day', 'week', 'month') then
    raise exception '粒度参数无效（hour/day/week/month）';
  end if;
  if p_start is null or p_end is null or p_end <= p_start then
    raise exception '结束时间必须晚于开始时间';
  end if;
  if p_end - p_start > interval '92 days' then
    raise exception '时间范围不能超过 92 天（90 天保留 + 2 天余量）';
  end if;
  if p_page is null or p_page !~ '^(all|index|decor|data|index:[a-z]+)$' then
    raise exception '页面筛选参数无效';
  end if;

  -- p_page 过滤语义：'all'=不过滤；'index'=主站整壳（page 形如 index:*）；
  -- 'decor'/'data'=精确匹配；'index:xxx'=精确匹配单子页。范围取 [p_start, p_end)。
  -- 「人」口径（方案单 v1.1）：coalesce(uid::text, vid)。
  return (
    with f as (
      select ae.ts, ae.page, ae.event, ae.ref_dom,
             coalesce(ae.uid::text, ae.vid) as person
      from public.analytics_events ae
      where ae.ts >= p_start and ae.ts < p_end
        and (p_page = 'all'
             or (p_page = 'index' and ae.page like 'index:%')
             or (p_page in ('decor', 'data') and ae.page = p_page)
             or (p_page like 'index:%' and ae.page = p_page))
    ),
    -- 趋势序列：东八区分桶 pv/uv；generate_series 造全量桶 left join 补零（折线不断）
    buckets as (
      select generate_series(
        date_trunc(p_grain, p_start at time zone 'Asia/Shanghai'),
        date_trunc(p_grain, p_end at time zone 'Asia/Shanghai'),
        ('1 ' || p_grain)::interval
      ) as bk
    ),
    series_agg as (
      select date_trunc(p_grain, ts at time zone 'Asia/Shanghai') as bk,
             count(*) as pv, count(distinct person) as uv
      from f group by 1
    ),
    series_json as (
      select coalesce(jsonb_agg(jsonb_build_object(
               'bucket', to_char(b.bk, 'YYYY-MM-DD"T"HH24:MI:SS') || '+08:00',
               'pv', coalesce(s.pv, 0),
               'uv', coalesce(s.uv, 0)
             ) order by b.bk), '[]'::jsonb) as j
      from buckets b left join series_agg s on s.bk = b.bk
    ),
    -- 三卡片：范围内总 PV、总 UV（整段 distinct 人）、日均 DAU
    -- （先按东八区日历日分桶求每日 distinct 人——零事件日计 0 参与平均——再取平均四舍五入到整数）
    day_buckets as (
      select generate_series(
        date_trunc('day', p_start at time zone 'Asia/Shanghai'),
        date_trunc('day', p_end at time zone 'Asia/Shanghai'),
        interval '1 day'
      ) as dk
    ),
    day_agg as (
      select date_trunc('day', ts at time zone 'Asia/Shanghai') as dk,
             count(distinct person) as dau
      from f group by 1
    ),
    cards_json as (
      select jsonb_build_object(
        'pv', (select count(*) from f),
        'uv', (select count(distinct person) from f),
        'dau_avg', coalesce((
          select round(avg(coalesce(d.dau, 0)))::int
          from day_buckets db left join day_agg d on d.dk = db.dk
        ), 0)
      ) as j
    ),
    -- 导航 TAB 排行：主站页签（登录墙 index:login 不是导航 TAB，剔除），次数/人数双口径，按次数降序
    nav_json as (
      select coalesce(jsonb_agg(jsonb_build_object(
               'page', t.page, 'clicks', t.clicks, 'people', t.people
             ) order by t.clicks desc, t.page), '[]'::jsonb) as j
      from (
        select page, count(*) as clicks, count(distinct person) as people
        from f
        where page like 'index:%' and page <> 'index:login'
        group by page
      ) t
    ),
    -- 分页面：全部 page 分组（含 decor/data），按 pv 降序
    pages_json as (
      select coalesce(jsonb_agg(jsonb_build_object(
               'page', t.page, 'pv', t.pv, 'uv', t.uv
             ) order by t.pv desc, t.page), '[]'::jsonb) as j
      from (
        select page, count(*) as pv, count(distinct person) as uv
        from f group by page
      ) t
    ),
    -- 来源域 TOP10：ref_dom 为 null 归并「直接访问」，按 pv 降序取前 10
    refs_json as (
      select coalesce(jsonb_agg(jsonb_build_object(
               'ref_dom', t.rd, 'pv', t.pv, 'uv', t.uv
             ) order by t.pv desc, t.rd), '[]'::jsonb) as j
      from (
        select coalesce(ref_dom, '直接访问') as rd,
               count(*) as pv, count(distinct person) as uv
        from f group by 1 order by 2 desc, 1 limit 10
      ) t
    ),
    -- 事件 TOP：按次数降序
    events_json as (
      select coalesce(jsonb_agg(jsonb_build_object(
               'event', t.event, 'cnt', t.cnt
             ) order by t.cnt desc, t.event), '[]'::jsonb) as j
      from (
        select event, count(*) as cnt from f group by event
      ) t
    )
    select jsonb_build_object(
      'series', (select j from series_json),
      'cards',  (select j from cards_json),
      'nav',    (select j from nav_json),
      'pages',  (select j from pages_json),
      'refs',   (select j from refs_json),
      'events', (select j from events_json)
    )
  );
end;
$$;

create or replace function public.analytics_purge_90d() returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  delete from public.analytics_events where ts < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 权限：仅 service_role 可执行（anon/authenticated 直调必须 401/404）
revoke all on function public.analytics_overview(timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.analytics_purge_90d() from public, anon, authenticated;
grant execute on function public.analytics_overview(timestamptz, timestamptz, text, text) to service_role;
grant execute on function public.analytics_purge_90d() to service_role;

NOTIFY pgrst, 'reload schema';

-- 回滚：
-- drop function if exists public.analytics_overview(timestamptz, timestamptz, text, text);
-- drop function if exists public.analytics_purge_90d();
