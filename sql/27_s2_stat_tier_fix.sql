-- ============================================================
-- 增量 SQL 27（S2 批次）：数值同档订正（BUG-101，P1）
-- 编号申报：S2 批次自带序号（24=导入/25=至暗回滚/26=装等列/27=本订正），与仓库既有
--   27_task042_user_profiles_preferences 撞号，后缀区分不覆盖（24/25/26 撞号先例在案）。
-- 背景：运营截图+顾问 RPC 实证——公示页卡片属性 chips 显示的是导出件
--   primary_values/secondary_values（裸基底 219 级模板值，如觉醒外衣 敏捷65），
--   正确史诗档值在同行 primary_tiers->'mythic'/secondary_tiers->'mythic'。
--   「装等 318 配基底 65」=运营明令禁止的 Frankenstein 态，与同档绑定硬性前提
--   （REQ-116：装等显示档与数值必须同档）直接冲突，本订正使数值归位史诗档。
-- 内容（四条 UPDATE，范围仅 S2）：
--   boss_loot/dungeon_loot × 主/副属性：*_values ← *_tiers->'mythic'，
--   WHERE 条件=mythic 键存在；boss_loot 限烈毒之渊/潮缚石窟，dungeon_loot 限 S2 八本。
--   S1 行不动——dry-run 实证 S1 全库无任何 mythic 键（0 行），无档可回填，
--   随批报备运营裁（是否另立回填批次）。
-- 跳过清单（塞塔里斯神庙 8 件，仅 legacy normal 档，WHERE 天然跳过、本批不动，
--   待 1.0.27 probe/游戏内取证补订）：
--   防咬手套（米利克萨）；克拉西斯封印者肩铠/堕落妖术师法衣/塞塔里斯的尖牙头盔/
--   巢穴净化者护肩/沙漠卫士胸甲/蛇行神灵兜帽/重生巨蛇长袍（塞塔里斯的化身）。
-- 预期行数（dry-run 2026-08-16 实测对账）：主属性 80+181=261、副属性 83+173=256。
-- 零触碰字段：effect / venomcurse / ilvl 及其余一切列。
-- 执行纪律（迁移全套）：
--   ① 执行前备份：四表 pg_dump 全量 + 受影响行行级 JSON（id+旧 values，可原样回插），
--      落 backup/2026-08-16-sql27/；
--   ② SSH + docker exec psql（supabase_admin 角色）整文件执行，单事务（BEGIN/COMMIT 在文件内）；
--   ③ NOTIFY pgrst 在 COMMIT 前（纯 DML 照批次纪律）；
--   ④ 硬门验证（订正后 SELECT，对不上停工）：觉醒外衣=敏捷162/智力162/急速130/精通58；
--      觉醒恐牙胸甲=敏捷207/智力207/爆击209；大米任抽一件贴值；
--      跳过清单 8 件 values 原样保留；S1 行零触碰（全库 S1 无 mythic 键，结构性保证）。
-- 回滚说明：
--   由 backup/2026-08-16-sql27/ 行级 JSON（s2_boss_loot_values_20260816.json /
--   s2_dungeon_loot_values_20260816.json，含 id 与订正前 values 原值）逐行 UPDATE 回插：
--     UPDATE boss_loot SET primary_values=r.p, secondary_values=r.s ... WHERE id=r.id;
--   或整表回滚：pg_dump 全量备份 backup_before_sql27_20260816.sql 恢复两表；
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

BEGIN;

-- 1. boss_loot 主属性（烈毒之渊/潮缚石窟，预期 80 行）
update public.boss_loot bl set primary_values = bl.primary_tiers->'mythic'
  from game_bosses gb
 where bl.boss_id = gb.id
   and gb.raid_id in (select id from game_raids where name in ('烈毒之渊','潮缚石窟'))
   and bl.primary_tiers ? 'mythic';

-- 2. boss_loot 副属性（预期 83 行）
update public.boss_loot bl set secondary_values = bl.secondary_tiers->'mythic'
  from game_bosses gb
 where bl.boss_id = gb.id
   and gb.raid_id in (select id from game_raids where name in ('烈毒之渊','潮缚石窟'))
   and bl.secondary_tiers ? 'mythic';

-- 3. dungeon_loot 主属性（S2 八本，预期 181 行）
update public.dungeon_loot dl set primary_values = dl.primary_tiers->'mythic'
 where dl.dungeon_id in (select id from game_dungeons
                          where season_id = (select id from game_seasons where name = 'S2'))
   and dl.primary_tiers ? 'mythic';

-- 4. dungeon_loot 副属性（预期 173 行）
update public.dungeon_loot dl set secondary_values = dl.secondary_tiers->'mythic'
 where dl.dungeon_id in (select id from game_dungeons
                          where season_id = (select id from game_seasons where name = 'S2'))
   and dl.secondary_tiers ? 'mythic';

-- 重载 PostgREST schema 缓存（批次纪律；纯 DML 照走）
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- 执行后复核 SQL（SSH + docker exec psql 内逐条执行核对）：
--   -- ①硬门：觉醒外衣（期望 敏捷162/智力162/急速130/精通58）
--   select primary_values::text, secondary_values::text from boss_loot where item_name='觉醒外衣';
--   -- ①硬门：觉醒恐牙胸甲（期望 敏捷207/智力207/爆击209）
--   select primary_values::text, secondary_values::text from boss_loot where item_name='觉醒恐牙胸甲';
--   -- ②跳过清单 8 件原样（与 dry-run 贴值逐件一致）
--   select item_name, primary_values::text, secondary_values::text from dungeon_loot
--    where item_name in ('防咬手套','克拉西斯封印者肩铠','堕落妖术师法衣','塞塔里斯的尖牙头盔',
--      '巢穴净化者护肩','沙漠卫士胸甲','蛇行神灵兜帽','重生巨蛇长袍') order by 1;
--   -- ③values 仍存基底值的 S2 行盘点（应仅剩跳过清单 8 件+无 mythic 档品类）
--   select count(*) from boss_loot bl join game_bosses gb on gb.id=bl.boss_id
--    where gb.raid_id in (select id from game_raids where name in ('烈毒之渊','潮缚石窟'))
--      and not bl.primary_tiers ? 'mythic';
-- ============================================================
