-- ============================================================================
-- 迁移 #40：36件家宅装饰来源英文译名查补（sql/39 后续批，任务类型=数据查证落地）
-- 影响表：decor_catalog（34 行，双写 sources + source_text；11934/19231 两件
--   原文已全中文，零改动不列入）
-- 执行日期：2026-10-14
--
-- 【译名来源】全部经 Wowhead 中文站（wowhead.com/cn）页面取证，置信度=确认：
--   凯尔希·钢烁 npc=105986 / 玛瑞亚 npc=85427 / 基尔里普 npc=87015 /
--   金鳞蜥蜴 npc=1552 / 阿格拉萨 npc=267794 / 削凿者切尔 npc=241928 /
--   卡维兹·洛典（运营标注）/ “第二把交椅”袍铎+龙族装饰（本库 record_id=4172 既有行）/
--   沙塔尔防御者 faction=1710 / 嘲颅兽人 faction=1708 /
--   密报：突袭沙塔斯港口 quest=38187 / 突袭沙塔斯市中心 quest=36699 /
--   固若金汤 achievement=1153 / 剧场巡演 quest=83240 / 演员的宝箱 item=217012 等 /
--   奥术秘藏光球 item=277975 / 巅峰之箱 item=224784 /
--   胜利的斯托玛兰巅峰之箱 item=260940 / 自动拼装式家具包 item=246697 /
--   奇怪的回收品 item=168266 / 至高岭补给品（军团巅峰箱专名）
--
-- 【对 sql/39 原查证的两处事实性勘正】（取证时发现，随本批一并修正）：
--   1. record_id=1324 部落战争纹章：「Horde Battlefield Banner」是装饰品自身
--      英文名（国服=部落战场军旗），并非成就名；其来源成就实为
--      Overly Defensive=「固若金汤」（阿拉希盆地单场防守 3 座基地）。
--      → detail 改为「成就 固若金汤 奖励」。
--   2. record_id=15583/15747：Stormarion 国服官方译名=「斯托玛兰」（音译），
--      原写「风暴艾里昂」系误译 → 改为「胜利的斯托玛兰巅峰之箱（斯托玛兰突袭事件）」。
--   3. record_id=8235 泰雷多尔躺椅（2026-10-14 运营裁定销账）：sql/39 原写
--      「联盟声望商人 Scale Belly（荆棘谷海角）」系上游误判（Scale Belly=金鳞蜥蜴
--      为荆棘谷稀有野兽 npc=1552，非商人）；真实来源=沙塔尔防御者声望友善后，
--      要塞货栈（二级以上）商人 玛瑞亚 处购买——与 931 同一军需官链路互洽。
--      NPC 名取 Wowhead CN 官方写法「玛瑞亚」（npc=85427）。
--
-- 【残留译名已补齐（2026-10-14 运营终审）】Unalloyed Abundance=纯粹丰饶、
--   Sargle's Fortune=萨格尔的塔罗牌——本批落地后 34 行 source_text 零英文残留
--   （type 枚举键 vendor/drop/quest/achievement/profession 除外）。
--
-- 【回滚】本批 34 行执行前状态 = sql/39 写入值，全文见 sql/39_decor_source_36items.sql；
--   逐行回滚即用 sql/39 对应 UPDATE 重放（sources/source_text 两列）。
--
-- 红线遵守：仅 UPDATE sources/source_text 两列；无 DELETE/DROP/TRUNCATE。
-- ============================================================================

BEGIN;

-- 一、NPC 名替换（德拉诺之王 4 条）
UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','vendor','vendor','要塞商人 克劳勒中士 / 凯尔希·钢烁，50金+100要塞资源')),
  source_text = '商人｜要塞商人 克劳勒中士 / 凯尔希·钢烁，50金+100要塞资源'
WHERE record_id = 751;   -- 木制酒杯

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','vendor','vendor','沙塔尔防御者 声望商人 玛瑞亚（影月谷），400金+1000埃匹希斯水晶')),
  source_text = '商人｜沙塔尔防御者 声望商人 玛瑞亚（影月谷），400金+1000埃匹希斯水晶'
WHERE record_id = 931;   -- 德莱尼储物箱

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','vendor','vendor','嘲颅兽人 声望商人 基尔里普，400金+1000埃匹希斯水晶')),
  source_text = '商人｜嘲颅兽人 声望商人 基尔里普，400金+1000埃匹希斯水晶'
WHERE record_id IN (1317, 1322);  -- 德拉诺烹饪锅 / 黑石保险箱

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','vendor','vendor','沙塔尔防御者声望友善后，要塞货栈（二级以上）商人 玛瑞亚 处购买')),
  source_text = '商人｜沙塔尔防御者声望友善后，要塞货栈（二级以上）商人 玛瑞亚 处购买'
WHERE record_id = 8235;  -- 泰雷多尔躺椅（2026-10-14 运营裁定：Scale Belly 系误判销账）

-- 二、任务名替换
UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','quest','quest','任务 密报：突袭沙塔斯港口 奖励')),
  source_text = '任务｜任务 密报：突袭沙塔斯港口 奖励'
WHERE record_id = 925;   -- 艾洛多尔桶

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','quest','quest','任务 突袭沙塔斯市中心 奖励')),
  source_text = '任务｜任务 突袭沙塔斯市中心 奖励'
WHERE record_id = 8238;  -- 德莱尼农夫的篱笆

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','quest','quest','任务 龙族装饰 奖励，完成后商人 “第二把交椅”袍铎 出售（75金）')),
  source_text = '任务｜任务 龙族装饰 奖励，完成后商人 “第二把交椅”袍铎 出售（75金）'
WHERE record_id = 11163; -- 瓦德拉肯吊灯（空行；4172 同名已有来源行不动）

-- 三、成就名勘正（Horde Battlefield Banner 是装饰品名，来源成就=固若金汤）
UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','achievement','achievement','成就 固若金汤 奖励')),
  source_text = '成就｜成就 固若金汤 奖励'
WHERE record_id = 1324;  -- 部落战争纹章

-- 四、宝箱/道具名替换
UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','剧场巡演 事件宝箱 演员的宝箱（多恩岛）')),
  source_text = '掉落｜剧场巡演 事件宝箱 演员的宝箱（多恩岛）'
WHERE record_id = 764;   -- 议会护持的珠宝高脚杯

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','安德麦 10连任务奖励（随机事件）')),
  source_text = '掉落｜安德麦 10连任务奖励（随机事件）'
WHERE record_id = 1261;  -- 非常可靠的安德麦路灯

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','奥术秘藏光球')),
  source_text = '掉落｜奥术秘藏光球'
WHERE record_id IN (1154,1730,2587,5796,9290,10368);
  -- 精湛的辛多雷墓碑 / 优雅的附魔梳妆台 / 精工真菌排式盆栽 /
  -- 辛多雷黄金迎宾 / 崇敬的深石桌 / 食人魔勇士的珍贵颅骨

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','巅峰之箱（午夜世界掉落）')),
  source_text = '掉落｜巅峰之箱（午夜世界掉落）'
WHERE record_id = 14633; -- 虚空精灵凳子

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','胜利的斯托玛兰巅峰之箱（斯托玛兰突袭事件）')),
  source_text = '掉落｜胜利的斯托玛兰巅峰之箱（斯托玛兰突袭事件）'
WHERE record_id IN (15583,15747);  -- 宇宙虚空引力宝珠 / 宇宙虚空营火

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','quest','quest','麦卡贡日常任务奖励（通过 自动拼装式家具包）')),
  source_text = '任务｜麦卡贡日常任务奖励（通过 自动拼装式家具包）'
WHERE record_id IN (2324,2431,2432,2434);
  -- 退役的工业化侏儒抓取者 / 自行密封的高脚桶 / 小型机械箱子 / 小型家居齿轮

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','quest','quest','麦卡贡回收日常任务奖励（通过 奇怪的回收品）')),
  source_text = '任务｜麦卡贡回收日常任务奖励（通过 奇怪的回收品）'
WHERE record_id = 11814; -- 诺莫瑞根循环窑

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','至高岭声望巅峰宝箱（至高岭补给品）')),
  source_text = '掉落｜至高岭声望巅峰宝箱（至高岭补给品）'
WHERE record_id = 11754; -- 鲜血图腾旗帜（军团巅峰箱官方专名=至高岭补给品）

-- 五、12.x NPC 名替换
UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','vendor','vendor','商人 阿格拉萨（锋刃滩），50金')),
  source_text = '商人｜商人 阿格拉萨（锋刃滩），50金'
WHERE record_id = 15290; -- 爱宠地毯

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','vendor','vendor','商人 削凿者切尔（祖阿曼），3200 纯粹丰饶')),
  source_text = '商人｜商人 削凿者切尔（祖阿曼），3200 纯粹丰饶'
WHERE record_id = 15851; -- 阿曼尼石板长椅

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','vendor','vendor','商人 卡维兹·洛典（密谋小径），收集13张 萨格尔的塔罗牌 后售价999金')),
  source_text = '商人｜商人 卡维兹·洛典（密谋小径），收集13张 萨格尔的塔罗牌 后售价999金'
WHERE record_id = 2523;  -- “舒哈鲁视角”画作

-- 六、副本首领括号英文删除（正文中文名保留）
UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','奥金顿 首领泰隆戈尔')),
  source_text = '掉落｜奥金顿 首领泰隆戈尔'
WHERE record_id = 8178;  -- 德莱尼搁脚凳

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','祖阿曼 首领纳洛拉克')),
  source_text = '掉落｜祖阿曼 首领纳洛拉克'
WHERE record_id = 15570; -- 阿曼尼仪式祭坛

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','麦卡贡行动 首领麦卡贡国王')),
  source_text = '掉落｜麦卡贡行动 首领麦卡贡国王'
WHERE record_id = 10887; -- 侏儒电磁塔

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','塞塔里斯神庙 首领塞塔里斯化身')),
  source_text = '掉落｜塞塔里斯神庙 首领塞塔里斯化身'
WHERE record_id = 26198; -- 嘶声蛇卵孵化场

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','诸王之眠 首领达萨大王')),
  source_text = '掉落｜诸王之眠 首领达萨大王'
WHERE record_id = 26208; -- 皇家侍从的棺材

COMMIT;
