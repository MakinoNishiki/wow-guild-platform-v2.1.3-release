-- ============================================================
-- 增量 SQL 26：任务书 #37（REQ-110 WP1）——毒咒（Venomcurse）字段支持
-- 日期：2026-08-11（前置侦察 §1 已送审放行；配色裁定绿 .dp-tag-venom）
-- 背景：12.1 物品 tooltip 品质行下新增绿色「毒咒」标签行；本包新增毒咒标签字段，
--   毒咒效果文本本身仍走现有 effect 特效字段（零新逻辑）。
-- 内容：
--   1. boss_loot / dungeon_loot 各加一列：
--        venomcurse text null 默认 NULL —— 毒咒标签，文本标签型（存「毒咒」，
--        未来其他咒直接存新值，不再加列）；
--   2. 存量零回填（S1 无毒咒装备，如实声明，全部保持 NULL）；
--   3. get_public_loot_detail() 两分支 jsonb_build_object 白名单各加一行透出
--      venomcurse——该 RPC 为显式字段白名单（非 SELECT *），加列必须改函数；
--      函数体其余部分与 sql/24（WP3-v4 R13 口径）逐字一致：杂项/装饰品/幻化排除、
--      世界BOSS 黑名单剔除、lair 巢穴保留全部不动。
-- 执行方式：SSH + docker exec psql（supabase_admin 角色），幂等可重复执行（add column if not exists / create or replace）
-- 执行后：文件末尾 NOTIFY pgrst 重载 schema 缓存
-- REST 复核口径：anon POST /rest/v1/rpc/get_public_loot_detail →
--   每行新增 venomcurse 键且值全为 null；S1 全部 308 / 团本 104 / 大秘境 204 零漂移
--   （boss_loot 190 / dungeon_loot 221 不动）。
-- 回滚说明：
--   ALTER TABLE boss_loot DROP COLUMN IF EXISTS venomcurse;
--   ALTER TABLE dungeon_loot DROP COLUMN IF EXISTS venomcurse;
--   重执行 sql/24_bug062_world_boss_type.sql（恢复 RPC 至 R13 口径）；
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

-- 1. 两表加列（text、可空、默认 NULL，文本标签型）
alter table public.boss_loot add column if not exists venomcurse text;
alter table public.dungeon_loot add column if not exists venomcurse text;

comment on column public.boss_loot.venomcurse is '毒咒标签（REQ-110）：文本标签型，存「毒咒」，可空默认 NULL；未来其他咒直接存新值不再加列';
comment on column public.dungeon_loot.venomcurse is '毒咒标签（REQ-110）：文本标签型，存「毒咒」，可空默认 NULL；未来其他咒直接存新值不再加列';

-- 2. 公开 RPC：白名单透出 venomcurse（其余与 sql/24 R13 口径逐字一致）
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
