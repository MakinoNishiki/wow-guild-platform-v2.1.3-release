-- ============================================================
-- 增量 SQL 26（S2 批次）：装等 ilvl 列 + S2 静态表（REQ-116 提前落地，原规划 sql/30/31 编号作废）
-- 编号申报：S2 批次自带序号（24=数据导入/25=至暗回滚/26=本装等列），与仓库既有
--   26_req110_venomcurse 撞号，后缀区分不覆盖（24_s2_loot_import 与 24_bug062 并立先例）。
-- 内容：
--   1. boss_loot / dungeon_loot 各加一列：ilvl int null 默认 NULL —— 物品等级；
--      【同档绑定（运营硬性前提，钉死）】装等显示档与 effect 数值必须同档——禁止
--      「装等取 A 档、数值取 B 档」的混搭路径。当前单值结构天然满足：团本 effect=史诗档
--      实测文本、ilvl=史诗档静态表值；日后若拆档（多难度 ilvl_tiers），effect/tiers 取值
--      档必须与 ilvl 档联动切换，单列单档语义不得走样；
--   2. S2 静态表 UPDATE（存量 S1 行全部保持 NULL 不回填）：
--      - 烈毒之渊按 BOSS 位次（game_bosses.boss_order）：1号=318、2-3号=321、4-6号=324、7-8号=344
--        【硬门已过】UPDATE 前 dry-run 位次↔boss_id↔BOSS名映射已核（2026-08-16）：
--        1号盘魂者内克扎莉(13件) 2号陵寝哨兵(12) 3号迷失的探险者(13) 4号万毒邪祟者瓦什尼克(12)
--        5号斯索拉克(12) 6号双子毒牙(12) 7号盘卷祭坛(14) 8号乌拉特克(13)——锚点 7/8 号对得上 344；
--      - 潮缚石窟全部=318（1 BOSS 尼姆瑞莎·唤波者 12 件）；
--      - dungeon_loot 仅 S2 八本=311（34+26+25+24+20+22+22+34=207 行；S1 221 行保持 NULL）；
--   3. get_public_loot_detail() 两分支 jsonb_build_object 白名单各加一行透出 ilvl——
--      该 RPC 为显式字段白名单（非 SELECT *），加列必须改函数（公示页「物品等级 X」
--      渲染依赖本透出）；函数体其余部分与 sql/29（REQ-092 icon_id 版）逐字一致：
--      杂项/装饰品/幻化排除、世界BOSS 黑名单剔除、lair 巢穴保留全部不动。
-- 执行纪律（同批次既定流程）：
--   ① 执行前备份四表（pg_dump -t boss_loot -t dungeon_loot -t game_bosses -t game_raids）；
--   ② SSH + docker exec psql（supabase_admin 角色）整文件执行，单事务（BEGIN/COMMIT 在文件内），
--      幂等可重复执行（add column if not exists / create or replace / 静态 UPDATE 同值重复无副作用）；
--   ③ NOTIFY pgrst 在 COMMIT 前（连发两次确保生效）；
--   ④ 复核：三实例 ilvl 分布（烈毒 318×13/321×25/324×36/344×27、潮缚 318×12）、
--      S1 行全 NULL、S2 大米八本 311×207、RPC 透出 ilvl 键、公示页件数 320 零漂移。
-- 回滚说明：
--   ALTER TABLE boss_loot DROP COLUMN IF EXISTS ilvl;
--   ALTER TABLE dungeon_loot DROP COLUMN IF EXISTS ilvl;
--   重执行 sql/29_req092_icon_id.sql（恢复 RPC 至 icon_id 版口径）；
--   NOTIFY pgrst, 'reload schema';
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

BEGIN;

-- 1. 两表加列（int、可空、默认 NULL）
alter table public.boss_loot add column if not exists ilvl int;
alter table public.dungeon_loot add column if not exists ilvl int;

comment on column public.boss_loot.ilvl is '物品等级（REQ-116）：史诗档静态表值，可空默认 NULL（S1 存量不回填）。同档绑定钉死：装等显示档与 effect 数值必须同档，禁止混搭取档';
comment on column public.dungeon_loot.ilvl is '物品等级（REQ-116）：史诗档静态表值，可空默认 NULL（S1 存量不回填）。同档绑定钉死：装等显示档与 effect 数值必须同档，禁止混搭取档';

-- 2. S2 静态表：烈毒之渊按 BOSS 位次（期望影响行数 13/25/36/27，合计 101）
update public.boss_loot bl set ilvl = 318
  from game_bosses gb
 where bl.boss_id = gb.id
   and gb.raid_id = (select id from game_raids where name = '烈毒之渊')
   and gb.boss_order = 1;
update public.boss_loot bl set ilvl = 321
  from game_bosses gb
 where bl.boss_id = gb.id
   and gb.raid_id = (select id from game_raids where name = '烈毒之渊')
   and gb.boss_order between 2 and 3;
update public.boss_loot bl set ilvl = 324
  from game_bosses gb
 where bl.boss_id = gb.id
   and gb.raid_id = (select id from game_raids where name = '烈毒之渊')
   and gb.boss_order between 4 and 6;
update public.boss_loot bl set ilvl = 344
  from game_bosses gb
 where bl.boss_id = gb.id
   and gb.raid_id = (select id from game_raids where name = '烈毒之渊')
   and gb.boss_order between 7 and 8;

-- 潮缚石窟全部 318（期望 12 行）
update public.boss_loot bl set ilvl = 318
  from game_bosses gb
 where bl.boss_id = gb.id
   and gb.raid_id = (select id from game_raids where name = '潮缚石窟');

-- dungeon_loot 仅 S2 八本 311（期望 207 行；S1 行保持 NULL）
update public.dungeon_loot set ilvl = 311
 where dungeon_id in (select id from game_dungeons
                       where season_id = (select id from game_seasons where name = 'S2'));

-- 3. 公开 RPC：白名单透出 ilvl（其余与 sql/29 逐字一致）
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
        'ilvl', bl.ilvl,
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
        'ilvl', dl.ilvl,
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

COMMIT;

-- ============================================================
-- 执行后复核 SQL（SSH + docker exec psql 内逐条执行核对）：
--   -- ① 两表列在场
--   select column_name, data_type from information_schema.columns
--    where table_name in ('boss_loot','dungeon_loot') and column_name = 'ilvl';
--   -- ② 烈毒之渊 ilvl 分布（期望 318×13 / 321×25 / 324×36 / 344×27）
--   select bl.ilvl, count(*) from boss_loot bl join game_bosses gb on gb.id=bl.boss_id
--    where gb.raid_id=(select id from game_raids where name='烈毒之渊') group by 1 order by 1;
--   -- ③ 潮缚石窟 ilvl 分布（期望 318×12）+ S1 团本行全 NULL（期望 0 非空）
--   select bl.ilvl, count(*) from boss_loot bl join game_bosses gb on gb.id=bl.boss_id
--    where gb.raid_id=(select id from game_raids where name='潮缚石窟') group by 1;
--   select count(*) from boss_loot bl join game_bosses gb on gb.id=bl.boss_id
--    join game_raids gr on gr.id=gb.raid_id
--    where gr.season_id=(select id from game_seasons where name='S1') and bl.ilvl is not null;
--   -- ④ S2 大米 311×207 / S1 大米全 NULL（期望 0 非空）
--   select dl.ilvl, count(*) from dungeon_loot dl join game_dungeons gd on gd.id=dl.dungeon_id
--    where gd.season_id=(select id from game_seasons where name='S2') group by 1;
--   select count(*) from dungeon_loot dl join game_dungeons gd on gd.id=dl.dungeon_id
--    where gd.season_id=(select id from game_seasons where name='S1') and dl.ilvl is not null;
--   -- ⑤ RPC 透出（每行带 ilvl 键；当前赛季 320 零漂移、非空 320）
--   select count(*) as total,
--          count(*) filter (where doc ? 'ilvl') as has_key,
--          count(*) filter (where (doc->>'ilvl') is not null) as non_null
--   from (select jsonb_array_elements(public.get_public_loot_detail()) as doc) t
--   where (t.doc->>'season_id')::text=(select id::text from game_seasons where is_current);
-- ============================================================
