-- ============================================================================
-- 迁移 #39：36件家宅装饰来源补录（任务书 #63 WP3 口径 / REQ 台账对应行待补）
-- 影响表：decor_catalog（36 行，双写 sources jsonb + source_text text）
-- 执行日期：2026-10-14
--
-- 【与上游送审稿的三处结构修正】（实查线上库 + js/decorData.js 渲染逻辑后订正）：
--   1. sources 为 jsonb **数组**（既有行全为 [{...}] 结构，前端 Array.isArray 判定），
--      送审稿的 jsonb_build_object 单对象写法会被前端判为「无来源」——改为
--      jsonb_build_array(jsonb_build_object(...))。
--   2. sources[].type 合法键为英文枚举（js/decorDict.js 来源筛选十类）：
--      vendor/quest/drop/achievement/profession/shop/treasure/event/festival_note；
--      中文「商人/任务…」进 type 会使筛选永不命中。渲染字段随 type 分工
--      （decorData.js sourceText()）：vendor 读 .vendor、quest 读 .quest、
--      drop 读 .drop、achievement 读 .achievement、profession 读 .profession，
--      本批详情文本写入对应字段（detail 自由键会渲染为空串，不采用）。
--   3. 匹配键由 name 改为 record_id（实查：'瓦德拉肯吊灯' 一名两行——
--      record_id 4172 已有来源（保留不动）/ 11163 才是目标空行；
--      '"舒哈鲁视角"画作' 库内实为中文弯引号 “舒哈鲁视角”画作 record_id 2523）。
--      全部 36 个 record_id 已逐一实查确认：name 精确吻合、sources=[]、
--      source_text=''（2026-10-14 实查打印见 backup/2026-10-14-sql39-decor-sources/）。
--
-- 【护栏】每条 UPDATE 带 `AND (sources IS NULL OR sources = '[]'::jsonb)`：
--   只补空，永不覆盖已有非空来源（任务书 #63 WP2 同款护栏口径）。
--
-- 【回滚】本批 36 行执行前状态经实查全部为 sources='[]'::jsonb、source_text=''，
--   回滚 = 对下列 36 个 record_id 重置回空（备份原件在 backup/2026-10-14-sql39-decor-sources/backup-pre.json）：
--   UPDATE decor_catalog SET sources='[]'::jsonb, source_text=''
--   WHERE record_id IN (1154,1730,2587,5796,9290,10368,751,931,925,1317,1322,1324,
--     8178,8235,8238,764,1261,14633,15290,15570,15583,15747,15851,19231,11934,
--     2324,2431,2432,2434,10887,11814,26198,26208,2523,11754,11163);
--
-- 红线遵守：仅 UPDATE sources/source_text 两列；无 DELETE/DROP/TRUNCATE。
-- ============================================================================

BEGIN;

-- 一、德拉诺之王（9件）
UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','vendor','vendor','要塞商人 Sergeant Crowler / Kelsey Steelspark，50金+100要塞资源')),
  source_text = '商人｜要塞商人 Sergeant Crowler / Kelsey Steelspark，50金+100要塞资源'
WHERE record_id = 751 AND (sources IS NULL OR sources = '[]'::jsonb);   -- 木制酒杯

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','vendor','vendor','Sha''tari Defense 声望商人 Maaria（影月谷），400金+1000埃匹希斯水晶')),
  source_text = '商人｜Sha''tari Defense 声望商人 Maaria（影月谷），400金+1000埃匹希斯水晶'
WHERE record_id = 931 AND (sources IS NULL OR sources = '[]'::jsonb);   -- 德莱尼储物箱

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','quest','quest','任务 Missive: Assault on Shattrath Harbor 奖励')),
  source_text = '任务｜任务 Missive: Assault on Shattrath Harbor 奖励'
WHERE record_id = 925 AND (sources IS NULL OR sources = '[]'::jsonb);   -- 艾洛多尔桶

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','vendor','vendor','Laughing Skull Orcs 声望商人 Kil''rip，400金+1000埃匹希斯水晶')),
  source_text = '商人｜Laughing Skull Orcs 声望商人 Kil''rip，400金+1000埃匹希斯水晶'
WHERE record_id = 1317 AND (sources IS NULL OR sources = '[]'::jsonb);  -- 德拉诺烹饪锅

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','vendor','vendor','Laughing Skull Orcs 声望商人 Kil''rip，400金+1000埃匹希斯水晶')),
  source_text = '商人｜Laughing Skull Orcs 声望商人 Kil''rip，400金+1000埃匹希斯水晶'
WHERE record_id = 1322 AND (sources IS NULL OR sources = '[]'::jsonb);  -- 黑石保险箱

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','achievement','achievement','Horde Battlefield Banner 成就奖励')),
  source_text = '成就｜Horde Battlefield Banner 成就奖励'
WHERE record_id = 1324 AND (sources IS NULL OR sources = '[]'::jsonb);  -- 部落战争纹章

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','奥金顿 首领泰隆戈尔（Teron''gor）')),
  source_text = '掉落｜奥金顿 首领泰隆戈尔（Teron''gor）'
WHERE record_id = 8178 AND (sources IS NULL OR sources = '[]'::jsonb);  -- 德莱尼搁脚凳

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','vendor','vendor','联盟声望商人 Scale Belly（荆棘谷海角）')),
  source_text = '商人｜联盟声望商人 Scale Belly（荆棘谷海角）'
WHERE record_id = 8235 AND (sources IS NULL OR sources = '[]'::jsonb);  -- 泰雷多尔躺椅

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','quest','quest','任务 Assault on the Heart of Shattrath 奖励')),
  source_text = '任务｜任务 Assault on the Heart of Shattrath 奖励'
WHERE record_id = 8238 AND (sources IS NULL OR sources = '[]'::jsonb);  -- 德莱尼农夫的篱笆

-- 二、地心之战（2件）
UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','Theater Troupe 事件宝箱 Actor''s Chest（多恩岛）')),
  source_text = '掉落｜Theater Troupe 事件宝箱 Actor''s Chest（多恩岛）'
WHERE record_id = 764 AND (sources IS NULL OR sources = '[]'::jsonb);   -- 议会护持的珠宝高脚杯

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','Undermine 10连任务奖励（随机事件）')),
  source_text = '掉落｜Undermine 10连任务奖励（随机事件）'
WHERE record_id = 1261 AND (sources IS NULL OR sources = '[]'::jsonb);  -- 非常可靠的安德麦路灯

-- 三、至暗之夜（14件，含奥术存储球批量6件）
UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','奥术存储球（Arcanostorage Sphere）')),
  source_text = '掉落｜奥术存储球（Arcanostorage Sphere）'
WHERE record_id IN (1154,1730,2587,5796,9290,10368)
  AND (sources IS NULL OR sources = '[]'::jsonb);
  -- 精湛的辛多雷墓碑 / 优雅的附魔梳妆台 / 精工真菌排式盆栽 /
  -- 辛多雷黄金迎宾 / 崇敬的深石桌 / 食人魔勇士的珍贵颅骨

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','Pinnacle Cache（午夜世界掉落）')),
  source_text = '掉落｜Pinnacle Cache（午夜世界掉落）'
WHERE record_id = 14633 AND (sources IS NULL OR sources = '[]'::jsonb); -- 虚空精灵凳子

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','vendor','vendor','商人 Agratha（Razorwind Shores），50金')),
  source_text = '商人｜商人 Agratha（Razorwind Shores），50金'
WHERE record_id = 15290 AND (sources IS NULL OR sources = '[]'::jsonb); -- 爱宠地毯

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','祖阿曼 首领纳洛拉克（Nalorakk）')),
  source_text = '掉落｜祖阿曼 首领纳洛拉克（Nalorakk）'
WHERE record_id = 15570 AND (sources IS NULL OR sources = '[]'::jsonb); -- 阿曼尼仪式祭坛

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','Victorious Stormarion Pinnacle Cache（风暴艾里昂突袭事件）')),
  source_text = '掉落｜Victorious Stormarion Pinnacle Cache（风暴艾里昂突袭事件）'
WHERE record_id = 15583 AND (sources IS NULL OR sources = '[]'::jsonb); -- 宇宙虚空引力宝珠

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','Victorious Stormarion Pinnacle Cache（风暴艾里昂突袭事件）')),
  source_text = '掉落｜Victorious Stormarion Pinnacle Cache（风暴艾里昂突袭事件）'
WHERE record_id = 15747 AND (sources IS NULL OR sources = '[]'::jsonb); -- 宇宙虚空营火

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','vendor','vendor','商人 Chel the Chip（祖阿曼），3200 Unalloyed Abundance')),
  source_text = '商人｜商人 Chel the Chip（祖阿曼），3200 Unalloyed Abundance'
WHERE record_id = 15851 AND (sources IS NULL OR sources = '[]'::jsonb); -- 阿曼尼石板长椅

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','profession','profession','铭文专业制造，材料：萨拉斯木料×50、狂野魔法微粒×20、词汇学家的羊皮纸×50、永歌之尘×50、光耀碎片×10、黎明水晶×3、赭黄墨水×2')),
  source_text = '制造｜铭文专业制造，材料：萨拉斯木料×50、狂野魔法微粒×20、词汇学家的羊皮纸×50、永歌之尘×50、光耀碎片×10、黎明水晶×3、赭黄墨水×2'
WHERE record_id = 19231 AND (sources IS NULL OR sources = '[]'::jsonb); -- 自然的优雅无尽法典

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','暗焰裂口 首领黑暗之主（普通/追随者难度均可掉落）')),
  source_text = '掉落｜暗焰裂口 首领黑暗之主（普通/追随者难度均可掉落）'
WHERE record_id = 11934 AND (sources IS NULL OR sources = '[]'::jsonb); -- 塑蜡大师的蜡烛架

-- 四、争霸艾泽拉斯（8件，含麦卡贡日常批量4件）
UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','quest','quest','麦卡贡日常任务奖励（通过 Self-Assembling Homeware Kit）')),
  source_text = '任务｜麦卡贡日常任务奖励（通过 Self-Assembling Homeware Kit）'
WHERE record_id IN (2324,2431,2432,2434)
  AND (sources IS NULL OR sources = '[]'::jsonb);
  -- 退役的工业化侏儒抓取者 / 自行密封的高脚桶 / 小型机械箱子 / 小型家居齿轮

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','麦卡贡行动 首领麦卡贡国王（King Mechagon）')),
  source_text = '掉落｜麦卡贡行动 首领麦卡贡国王（King Mechagon）'
WHERE record_id = 10887 AND (sources IS NULL OR sources = '[]'::jsonb); -- 侏儒电磁塔

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','quest','quest','麦卡贡回收日常任务奖励（通过 Strange Recycling Requisition）')),
  source_text = '任务｜麦卡贡回收日常任务奖励（通过 Strange Recycling Requisition）'
WHERE record_id = 11814 AND (sources IS NULL OR sources = '[]'::jsonb); -- 诺莫瑞根循环窑

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','塞塔里斯神庙 首领塞塔里斯化身（Avatar of Sethraliss）')),
  source_text = '掉落｜塞塔里斯神庙 首领塞塔里斯化身（Avatar of Sethraliss）'
WHERE record_id = 26198 AND (sources IS NULL OR sources = '[]'::jsonb); -- 嘶声蛇卵孵化场

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','诸王之眠 首领达萨大王（King Dazar）')),
  source_text = '掉落｜诸王之眠 首领达萨大王（King Dazar）'
WHERE record_id = 26208 AND (sources IS NULL OR sources = '[]'::jsonb); -- 皇家侍从的棺材

-- 五、军团再临（2件）
UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','vendor','vendor','商人 Cravitz Lorent（密谋小径），收集13张 Sargle''s Fortune 后售价999金')),
  source_text = '商人｜商人 Cravitz Lorent（密谋小径），收集13张 Sargle''s Fortune 后售价999金'
WHERE record_id = 2523 AND (sources IS NULL OR sources = '[]'::jsonb);  -- “舒哈鲁视角”画作（库内为中文弯引号）

UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','drop','drop','Highmountain 声望巅峰宝箱（至高岭宝箱）')),
  source_text = '掉落｜Highmountain 声望巅峰宝箱（至高岭宝箱）'
WHERE record_id = 11754 AND (sources IS NULL OR sources = '[]'::jsonb); -- 鲜血图腾旗帜

-- 六、巨龙时代（1件）
-- 注：'瓦德拉肯吊灯' 同名两行，仅补空行 record_id=11163；record_id=4172 已有来源，不动。
UPDATE decor_catalog SET
  sources = jsonb_build_array(jsonb_build_object('type','quest','quest','任务 Draconic Decor 奖励，完成后商人 Second Chair Pawdo 出售（75金）')),
  source_text = '任务｜任务 Draconic Decor 奖励，完成后商人 Second Chair Pawdo 出售（75金）'
WHERE record_id = 11163 AND (sources IS NULL OR sources = '[]'::jsonb); -- 瓦德拉肯吊灯（空行）

COMMIT;
