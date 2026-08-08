-- ============================================================
-- 增量 SQL 22：任务书 #28 WP3-v3（R9）——公开 RPC 增排装饰品/幻化
-- 日期：2026-08-08（运营 WP3-v3 整包 R9）
-- 内容：
--   get_public_loot_detail() 两处 where 增排 item_type IN ('装饰品','幻化')——
--   住宅装饰/幻化类非装备掉落不进公示页（当前全库仅 1 件：孢子大王的蕈菇盖，团本·孢陨幽境·腐沼）；
--   套装兑换物（鸣响虚空珍玩）保留不排除；「装饰」item_type（27 行住宅物件）不在本批口径，不动。
--   排除后基线（顾问已按线上数据复核）：S1 视图 全部 340 / 团本 136 / 大秘境 204（跨赛季全集 342）。
--   表内数据不删——仅 RPC 输出过滤；杂项排除（sql/21）与字段白名单不变。
-- 执行方式：SSH + docker exec psql（supabase_admin 角色），幂等可重复执行（create or replace）
-- 执行后：文件末尾 NOTIFY pgrst 重载 schema 缓存
-- REST 复核口径：anon POST /rest/v1/rpc/get_public_loot_detail → 跨赛季全集 342 行；
--   item_type ∈ {装饰品, 幻化} 零行；鸣响虚空珍玩仍在；其余字段与 sql/21 一致。
-- 回滚说明：
--   重执行 sql/21_task028_public_loot_rpc.sql（恢复原 where 口径）；
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
      and bl.item_type not in ('装饰品', '幻化')  -- WP3-v3 R9
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
      and dl.item_type not in ('装饰品', '幻化')  -- WP3-v3 R9
  ) x;
$$;

revoke all on function public.get_public_loot_detail() from public;
grant execute on function public.get_public_loot_detail() to anon, authenticated;

-- 重载 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
