-- ============================================================
-- 增量 SQL 21：任务书 #28 WP3 装备详情展开——掉落数据公开 RPC 化
-- 日期：2026-08-08（六案裁定：③杂项下沉服务端确认 / ④anon 直读不动确认）
-- 内容：
--   新增公开 RPC get_public_loot_detail()：boss_loot / dungeon_loot 两表合并 +
--   实例（团本/巢穴/大秘境）与 BOSS 联查预组装，jsonb 一次返回，供公示页（data.html，anon 直连）读取。
--   字段白名单输出（不含 official_item_id 等内部列）；
--   杂项排除下沉服务端（where slot <> '杂项'，裁定③；前端 isMisc 保留作防线）；
--   security invoker 不抬权——依赖 sql/16 既有 anon/authenticated 字典表读策略；
--   anon 对两表的直读权限本期不动（裁定④：数据中心读取与 verify 脚本依赖）。
--   掉落难度行（primary_tiers/secondary_tiers，sql/20）随 RPC 透传——当前全 null，
--   前端无数据不显（裁定①）；REQ-087 通道复活后录入即自动有值，RPC 无需改动。
-- 执行方式：SSH + docker exec psql（supabase_admin 角色），幂等可重复执行（create or replace）
-- 执行后：文件末尾 NOTIFY pgrst 重载 schema 缓存
-- REST 复核口径：anon POST /rest/v1/rpc/get_public_loot_detail → 数组 343 行（跨赛季全集 = 411−68 杂项；
--   公示页 S1 默认视图 = 其中 341 行，赛季过滤在前端）；逐行字段 ⊆ 白名单；slot=杂项 零行；S2 两件 instance_name=烈毒之渊。
-- 回滚说明：
--   DROP FUNCTION IF EXISTS public.get_public_loot_detail();
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

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
        'boss_id', bl.boss_id, 'boss_name', gb.name,
        'instance_id', gr.id, 'instance_name', gr.name, 'instance_type', gr.type,
        'season_id', gr.season_id
      ) as doc, gr.season_id, gr.name as instance_name, gb.boss_order, bl.item_name
    from boss_loot bl
    left join game_bosses gb on gb.id = bl.boss_id
    left join game_raids  gr on gr.id = gb.raid_id
    where bl.slot <> '杂项'
    union all
    select jsonb_build_object(
        'id', dl.id, 'source', 'dungeon',
        'item_name', dl.item_name, 'slot', dl.slot, 'item_type', dl.item_type,
        'primary_stats', dl.primary_stats, 'secondary_stats', dl.secondary_stats,
        'primary_values', dl.primary_values, 'secondary_values', dl.secondary_values,
        'primary_tiers', dl.primary_tiers, 'secondary_tiers', dl.secondary_tiers,
        'effect', dl.effect, 'note', dl.note,
        'boss_id', dl.boss_id, 'boss_name', gb.name,
        'instance_id', gd.id, 'instance_name', gd.name, 'instance_type', 'dungeon',
        'season_id', gd.season_id
      ), gd.season_id, gd.name, gb.boss_order, dl.item_name
    from dungeon_loot dl
    left join game_dungeons gd on gd.id = dl.dungeon_id
    left join game_bosses   gb on gb.id = dl.boss_id
    where dl.slot <> '杂项'
  ) x;
$$;

revoke all on function public.get_public_loot_detail() from public;
grant execute on function public.get_public_loot_detail() to anon, authenticated;

-- 重载 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
