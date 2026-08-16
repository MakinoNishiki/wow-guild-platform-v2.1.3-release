-- ============================================================
-- 增量 SQL 29（S2 批次）：塞塔里斯残桩修复+残项订正（纯数据订正，schema 不动）
-- 编号申报：S2 批次自带序号（24~29），与仓库既有 29_req092_icon_id 撞号，后缀区分不覆盖
--   （24_s2_loot_import 与 24_bug062 并立先例）。
-- 内容（运营 2026-08-16 裁定，截图取证转录）：
--   ① DELETE 2 行（dungeon_loot，S2）：
--      - 塞塔里斯神庙/米利克萨/防咬手套（159437）——普通难度专属件（ilvl 63 单档实证），非大米池；
--      - 密谋小径/利希尔·烬怒/黎明之刃的战刃（258045）——外观解锁件（effect=「使用：将此外观
--        添加到你的战团收藏中。」），与已排除的面具/装饰同族，运营裁定删除；
--   ② UPDATE 7 行（dungeon_loot，塞塔里斯神庙/塞塔里斯的化身，均 292 勇士 1/6 档）：
--      official_item_id 置换 + primary/secondary_stats 键名数组与 values 同步订正
--      （icon_id 已一致不动；ilvl 已 292 不动）；
--   ③ UPDATE 1 行（boss_loot，烈毒之渊/乌拉特克/蛰伏盘蛇珍玩 270909）：ilvl 344→324——
--      运营游戏内 tooltip 截图实证=物品等级 324；兑换物装等以 EJ 自有档轨（285/298/311/324）
--      为准，后二 BOSS 的 344 档轨不适用于兑换物。
--      【同误标自查结论（执行前实跑）】slot='套装兑换物' 且 ilvl=344 全库仅此 1 件 ✅；
--      其余兑换物（圣像/雕像/遗物/残骸/神像系，effect 含「制造一件」）ilvl 均为 321/324 正确档轨；
--      盘卷祭坛无兑换物掉落 ✅（其 344 行「妖术领主的厄运神像」为饰品非兑换物，不误伤）。
--      口径出入申报：任务书自查条件「ilvl=344 且 effect 含制造一件」实测 0 行——因蛰伏盘蛇
--      珍玩 effect 为空串，按 slot 口径「仅此 1 件」成立。
--   ④ 前置自查（必答）：S2 录库对账匹配键 = instance+boss+item_name
--      （scripts/wjdc_convert.py _cmp_key：boss_loot=(boss_id,item_name)、
--      dungeon_loot=(dungeon_id,boss_id,item_name)），official_item_id 仅为 _CMP_FIELDS
--      八键比对字段之一（变更检测），非匹配键——置换 ID 不会导致重跑插重（重跑对账记「变更」
--      而非「新增」）。转换器只产文件不落库，装载走顾问侧服务通道，其匹配键仓库内不可见，
--      已在送审报告标注请顾问侧复核确认。
-- 执行纪律（同批次既定流程）：
--   ① 执行前备份四表（pg_dump）+ 10 行目标全行行级 JSON（DELETE 2 行可原样回插）；
--   ② SSH + docker exec psql（supabase_admin）整文件执行，单事务，ON_ERROR_STOP；
--   ③ NOTIFY pgrst 在 COMMIT 前（纯值更新不涉 schema，按纪律照发）；
--   ④ 复核：塞塔里斯 33 / 密谋小径 24 / S2 大米 205；烈毒 344×26、324×37；
--      RPC 总量 626、当前赛季 318；S1/潮缚/至暗零触碰。
-- 回滚说明：
--   -- ① DELETE 2 行回插：全行原值见 backup/2026-08-16-sql29/sql29_deleted_rows_20260816.json
--   --   （含 id 全列，按行 INSERT 回去即可）；
--   -- ② 7 行旧值回写（official_item_id/stats/values 订正前原值）：
--   UPDATE dungeon_loot SET official_item_id='159374', primary_stats='{敏捷,智力}', primary_values='{"敏捷": 11}', secondary_stats=NULL, secondary_values=NULL WHERE item_name='塞塔里斯的尖牙头盔' AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙');
--   UPDATE dungeon_loot SET official_item_id='159318', primary_stats='{敏捷,智力}', primary_values='{"敏捷": 11}', secondary_stats=NULL, secondary_values=NULL WHERE item_name='蛇行神灵兜帽' AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙');
--   UPDATE dungeon_loot SET official_item_id='159439', primary_stats='{智力,力量}', primary_values='{"智力": 8}', secondary_stats=NULL, secondary_values=NULL WHERE item_name='克拉西斯封印者肩铠' AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙');
--   UPDATE dungeon_loot SET official_item_id='159254', primary_stats='{智力}', primary_values='{"智力": 8}', secondary_stats=NULL, secondary_values=NULL WHERE item_name='巢穴净化者护肩' AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙');
--   UPDATE dungeon_loot SET official_item_id='159370', primary_stats='{敏捷,智力}', primary_values='{"敏捷": 11}', secondary_stats=NULL, secondary_values=NULL WHERE item_name='堕落妖术师法衣' AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙');
--   UPDATE dungeon_loot SET official_item_id='159424', primary_stats='{智力,力量}', primary_values='{"智力": 11}', secondary_stats=NULL, secondary_values=NULL WHERE item_name='沙漠卫士胸甲' AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙');
--   UPDATE dungeon_loot SET official_item_id='159257', primary_stats='{智力}', primary_values='{"智力": 11}', secondary_stats=NULL, secondary_values=NULL WHERE item_name='重生巨蛇长袍' AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙');
--   -- ③ 珍玩 ilvl 回写：
--   UPDATE boss_loot SET ilvl=344 WHERE official_item_id=270909;
--   NOTIFY pgrst, 'reload schema';
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

BEGIN;

-- ① DELETE 2 行（id+名称双条件精确定位，id 来自 2026-08-16 执行前侦察）
DELETE FROM public.dungeon_loot
 WHERE id = '4f08801f-6f50-4ebb-969f-8a28ed7e04f9' AND item_name = '防咬手套';
DELETE FROM public.dungeon_loot
 WHERE id = '5a2407c3-0211-4747-9ac4-594dfc19ff92' AND item_name = '黎明之刃的战刃';

-- ② UPDATE 7 行（塞塔里斯神庙/塞塔里斯的化身；dungeon+boss+item_name 三重定位）
UPDATE public.dungeon_loot SET official_item_id='239035',
  primary_stats='{敏捷,智力}', primary_values='{"敏捷": 128, "智力": 128}',
  secondary_stats='{爆击,精通}', secondary_values='{"爆击": 66, "精通": 101}'
 WHERE item_name='塞塔里斯的尖牙头盔'
   AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙')
   AND boss_id=(SELECT id FROM game_bosses WHERE name='塞塔里斯的化身' AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙'));
UPDATE public.dungeon_loot SET official_item_id='239033',
  primary_stats='{敏捷,智力}', primary_values='{"敏捷": 128, "智力": 128}',
  secondary_stats='{爆击,急速}', secondary_values='{"爆击": 98, "急速": 69}'
 WHERE item_name='蛇行神灵兜帽'
   AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙')
   AND boss_id=(SELECT id FROM game_bosses WHERE name='塞塔里斯的化身' AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙'));
UPDATE public.dungeon_loot SET official_item_id='239037',
  primary_stats='{力量,智力}', primary_values='{"力量": 96, "智力": 96}',
  secondary_stats='{爆击,急速}', secondary_values='{"爆击": 41, "急速": 84}'
 WHERE item_name='克拉西斯封印者肩铠'
   AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙')
   AND boss_id=(SELECT id FROM game_bosses WHERE name='塞塔里斯的化身' AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙'));
UPDATE public.dungeon_loot SET official_item_id='239031',
  primary_stats='{智力}', primary_values='{"智力": 96}',
  secondary_stats='{爆击,急速}', secondary_values='{"爆击": 61, "急速": 64}'
 WHERE item_name='巢穴净化者护肩'
   AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙')
   AND boss_id=(SELECT id FROM game_bosses WHERE name='塞塔里斯的化身' AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙'));
UPDATE public.dungeon_loot SET official_item_id='239034',
  primary_stats='{敏捷,智力}', primary_values='{"敏捷": 128, "智力": 128}',
  secondary_stats='{全能,精通}', secondary_values='{"全能": 112, "精通": 55}'
 WHERE item_name='堕落妖术师法衣'
   AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙')
   AND boss_id=(SELECT id FROM game_bosses WHERE name='塞塔里斯的化身' AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙'));
UPDATE public.dungeon_loot SET official_item_id='239036',
  primary_stats='{力量,智力}', primary_values='{"力量": 128, "智力": 128}',
  secondary_stats='{爆击,精通}', secondary_values='{"爆击": 66, "精通": 101}'
 WHERE item_name='沙漠卫士胸甲'
   AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙')
   AND boss_id=(SELECT id FROM game_bosses WHERE name='塞塔里斯的化身' AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙'));
UPDATE public.dungeon_loot SET official_item_id='239032',
  primary_stats='{智力}', primary_values='{"智力": 128}',
  secondary_stats='{爆击,精通}', secondary_values='{"爆击": 73, "精通": 94}'
 WHERE item_name='重生巨蛇长袍'
   AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙')
   AND boss_id=(SELECT id FROM game_bosses WHERE name='塞塔里斯的化身' AND dungeon_id=(SELECT id FROM game_dungeons WHERE name='塞塔里斯神庙'));

-- ③ UPDATE 1 行（蛰伏盘蛇珍玩 270909：ilvl 344→324，兑换物 EJ 自有档轨）
UPDATE public.boss_loot SET ilvl = 324
 WHERE id = 'e0fbc1dd-d046-4665-95d5-85421b7df05e' AND item_name = '蛰伏盘蛇珍玩';

-- 重载 PostgREST schema 缓存（连发两次确保生效）
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- 执行后复核 SQL（SSH + docker exec psql 内逐条执行核对）：
--   -- ① 两件已删除（应 0 行）
--   select count(*) from dungeon_loot where id in
--     ('4f08801f-6f50-4ebb-969f-8a28ed7e04f9','5a2407c3-0211-4747-9ac4-594dfc19ff92');
--   -- ② 7 件订正后贴值
--   select item_name, official_item_id, primary_stats, primary_values, secondary_stats, secondary_values
--     from dungeon_loot dl where dl.dungeon_id=(select id from game_dungeons where name='塞塔里斯神庙')
--     and item_name in ('塞塔里斯的尖牙头盔','蛇行神灵兜帽','克拉西斯封印者肩铠','巢穴净化者护肩',
--       '堕落妖术师法衣','沙漠卫士胸甲','重生巨蛇长袍') order by 1;
--   -- ③ 珍玩 ilvl=324
--   select item_name, ilvl from boss_loot where official_item_id=270909;
--   -- ⑥ 件数：塞塔里斯 33 / 密谋小径 24 / S2 大米 205；烈毒 344×26、324×37
--   -- RPC 总量 626 / 当前赛季 318；S1/潮缚/至暗零触碰
-- ============================================================
