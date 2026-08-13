-- ============================================================
-- 增量 SQL 29：任务书 #46（REQ-092）——掉落图标 icon_id 字段支持
-- 日期：2026-08-13
-- 背景：插件 1.0.9 起透传 GetItemInfo 第 10 返回值（icon fileID），转换器冻结声明 v4
--   新增 icon_id 键；本包给两张掉落表加列并经公开 RPC 白名单透出，供副本掉落页
--   渲染装备图标（前端消费由 js/ 侧任务另行施工）。
-- 内容：
--   1. boss_loot / dungeon_loot 各加一列：
--        icon_id int null 默认 NULL —— WoW 图标 fileID（GetItemInfo 第 10 返回值）；
--   2. 存量零回填（S1 采集无 iconID，如实声明，全部保持 NULL）；
--   3. get_public_loot_detail() 两分支 jsonb_build_object 白名单各加一行透出
--      icon_id——该 RPC 为显式字段白名单（非 SELECT *），加列必须改函数；
--      函数体其余部分与 sql/26（REQ-110 venomcurse 版）逐字一致：杂项/装饰品/幻化排除、
--      世界BOSS 黑名单剔除、lair 巢穴保留全部不动。
-- 执行纪律（同任务书 #37/#46 既定流程）：
--   ① 执行前备份两张表（pg_dump -t boss_loot -t dungeon_loot 或等效快照）；
--   ② SSH 登录宿主机 + docker exec psql（supabase_admin 角色）执行本文件，
--      幂等可重复执行（add column if not exists / create or replace）；
--   ③ 执行后 NOTIFY pgrst 重载 schema 缓存（文件末尾已含，连发两次确保生效）；
--   ④ 复核：REST anon POST /rest/v1/rpc/get_public_loot_detail →
--      每行新增 icon_id 键且值全为 null；S1 全部 308 / 团本 104 / 大秘境 204 零漂移
--      （boss_loot 190 / dungeon_loot 221 不动）。
-- 回滚说明：
--   ALTER TABLE boss_loot DROP COLUMN IF EXISTS icon_id;
--   ALTER TABLE dungeon_loot DROP COLUMN IF EXISTS icon_id;
--   重执行 sql/26_req110_venomcurse.sql（恢复 RPC 至 venomcurse 版口径）；
--   NOTIFY pgrst, 'reload schema';
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

-- 1. 两表加列（int、可空、默认 NULL）
alter table public.boss_loot add column if not exists icon_id int;
alter table public.dungeon_loot add column if not exists icon_id int;

comment on column public.boss_loot.icon_id is '图标 fileID（REQ-092）：GetItemInfo 第 10 返回值，插件 1.0.9 起采集透传，可空默认 NULL（存量未回填）';
comment on column public.dungeon_loot.icon_id is '图标 fileID（REQ-092）：GetItemInfo 第 10 返回值，插件 1.0.9 起采集透传，可空默认 NULL（存量未回填）';

-- 2. 公开 RPC：白名单透出 icon_id（其余与 sql/26 逐字一致）
create or replace function public.get_public_loot_detail()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(x.doc order by x.season_id, x.instance_name, x.boss_order, x.item_name), '[]'::jsonb)
  from (
    select jsonb_build_object(
        'id', bl.id, 'source', 'raid',
        'item_name', bl.item_name, 'slot', bl.slot, 'item_type', bl.item_type,
        'primary_stats', bl.primary_stats, 'secondary_stats', bl.secondary_stats,
        'primary_values', bl.primary_values, 'secondary_values', bl.secondary_values,
        'primary_tiers', bl.primary_tiers, 'secondary_tiers', bl.secondary_tiers,
        'effect', bl.effect, 'note', bl.note,
        'venomcurse', bl.venomcurse,
        'icon_id', bl.icon_id,
        'boss_id', bl.boss_id, 'boss_name', gb.name,
        'instance_id', gr.id, 'instance_name', gr.name, 'instance_type', gr.type,
        'season_id', gr.season_id
      ) as doc, gr.season_id, gr.name as instance_name, gb.boss_order, bl.item_name
    from boss_loot bl
    left join game_bosses gb on gb.id = bl.boss_id
    left join game_raids  gr on gr.id = gb.raid_id
    where bl.slot <> '杂项'
      and bl.item_type not in ('装饰品', '幻化')  -- WP3-v3 R9
      and gr.type is distinct from 'world'        -- WP3-v4 R13：剔除世界BOSS（黑名单写法，lair 巢穴保留）
    union all
    select jsonb_build_object(
        'id', dl.id, 'source', 'dungeon',
        'item_name', dl.item_name, 'slot', dl.slot, 'item_type', dl.item_type,
        'primary_stats', dl.primary_stats, 'secondary_stats', dl.secondary_stats,
        'primary_values', dl.primary_values, 'secondary_values', dl.secondary_values,
        'primary_tiers', dl.primary_tiers, 'secondary_tiers', dl.secondary_tiers,
        'effect', dl.effect, 'note', dl.note,
        'venomcurse', dl.venomcurse,
        'icon_id', dl.icon_id,
        'boss_id', dl.boss_id, 'boss_name', gb.name,
        'instance_id', gd.id, 'instance_name', gd.name, 'instance_type', 'dungeon',
        'season_id', gd.season_id
      ), gd.season_id, gd.name, gb.boss_order, dl.item_name
    from dungeon_loot dl
    left join game_dungeons gd on gd.id = dl.dungeon_id
    left join game_bosses   gb on gb.id = dl.boss_id
    where dl.slot <> '杂项'
      and dl.item_type not in ('装饰品', '幻化')  -- WP3-v3 R9
  ) x;
$$;

revoke all on function public.get_public_loot_detail() from public;
grant execute on function public.get_public_loot_detail() to anon, authenticated;

-- 重载 PostgREST schema 缓存（连发两次确保生效）
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 执行后复核 SQL（SSH + docker exec psql 内逐条执行核对）：
--   -- ① 两表列在场
--   select column_name, data_type from information_schema.columns
--    where table_name in ('boss_loot','dungeon_loot') and column_name = 'icon_id';
--   -- ② 存量全 NULL、行数零漂移（期望 190 / 221）
--   select count(*) as boss_total, count(icon_id) as boss_icon_not_null from boss_loot;
--   select count(*) as dun_total,  count(icon_id) as dun_icon_not_null  from dungeon_loot;
--   -- ③ RPC 透出（应每行带 icon_id 键且全 null；总数 308 = 团本 104 + 大秘境 204）
--   select count(*) as total,
--          count(*) filter (where doc ? 'icon_id') as has_key,
--          count(*) filter (where (doc->>'icon_id') is not null) as non_null
--   from (select jsonb_array_elements(public.get_public_loot_detail()) as doc) t;
-- ============================================================
