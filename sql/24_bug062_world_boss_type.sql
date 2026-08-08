-- ============================================================
-- 增量 SQL 24：任务书 #28 WP3-v4（R13）——世界BOSS实例类型修正 + 公开 RPC 剔除
-- 日期：2026-08-08（运营裁定：巢穴 lair 归团队副本口径保留展示；至暗之夜为世界BOSS，不属任何副本场景，剔除）
-- 背景（BUG-062）：至暗之夜（鲁阿夏尔/索姆贝兰/普雷达萨斯/克拉格平，32 件掉落）
--   instance_type 被误标 'raid'——世界BOSS 不是副本，公示页不应展示。
-- 内容：
--   1. game_raids.type CHECK 约束扩值域：('raid','lair') → ('raid','lair','world')；
--   2. 至暗之夜 type 修正 'raid' → 'world'（数据保留，仅公示层剔除）；
--   3. get_public_loot_detail() boss_loot 分支增排 gr.type = 'world'
--      ——黑名单写法（is distinct from 'world'），不用 IN ('raid','dungeon') 白名单
--        （白名单会把 lair 巢穴误杀——运营明确禁令）；
--      lair 巢穴（孢陨幽境/潮缚石窟）原样保留，归团本口径。
-- 排除后基线（顾问已复核）：S1 视图 全部 308 / 团本 104 / 大秘境 204。
-- 执行方式：SSH + docker exec psql（supabase_admin 角色），幂等可重复执行（create or replace）
-- 执行后：文件末尾 NOTIFY pgrst 重载 schema 缓存
-- REST 复核口径：anon POST /rest/v1/rpc/get_public_loot_detail →
--   instance_type='world' 零行；至暗之夜四 BOSS 零行；孢陨幽境（lair）11 件仍在；
--   S1 全部 308 / 团本 104 / 大秘境 204；行数零漂移（boss_loot 190 / dungeon_loot 221 不动）。
-- 回滚说明：
--   UPDATE public.game_raids SET type='raid' WHERE name='至暗之夜';
--   ALTER TABLE public.game_raids DROP CONSTRAINT IF EXISTS game_raids_type_check;
--   ALTER TABLE public.game_raids ADD CONSTRAINT game_raids_type_check CHECK (type IN ('raid','lair'));
--   重执行 sql/22_task028_wp3v3_rpc_exclude_cosmetic.sql（恢复 RPC 至 R9 口径）；
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

-- 1. CHECK 约束扩值域（内联列约束默认名 game_raids_type_check）
alter table public.game_raids drop constraint if exists game_raids_type_check;
alter table public.game_raids add constraint game_raids_type_check check (type in ('raid', 'lair', 'world'));

-- 2. 至暗之夜 → world（BUG-062；数据保留，公示层剔除）
update public.game_raids set type = 'world' where name = '至暗之夜' and type <> 'world';

-- 3. 公开 RPC：增排世界BOSS（黑名单写法，lair 保留）
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
      and gr.type is distinct from 'world'        -- WP3-v4 R13：剔除世界BOSS（黑名单写法，lair 巢穴保留）
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
