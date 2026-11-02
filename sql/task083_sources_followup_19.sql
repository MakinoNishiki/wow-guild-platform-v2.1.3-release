-- #83 补丁2：19条来源分类，未执行；9条待核不触碰。
-- 先发布支持 source_label/context 的前端，再执行本补丁。
-- 仅更新 sources，不改原文/价格/tags/其他游戏字段；不叠加旧全目录SQL。
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL standard_conforming_strings=on;
LOCK TABLE public.decor_catalog IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE task083_followup(record_id integer PRIMARY KEY, item_id integer,
 run_id text NOT NULL, source_text text NOT NULL, sources jsonb NOT NULL) ON COMMIT DROP;
INSERT INTO task083_followup VALUES
(764,245294,'20261102-224408','|cFFFFD200活动：|r剧场巡演|n|cFFFFD200宝藏：|r业余演员的宝箱、杰出演员的宝箱|n|cFFFFD200地区：|r多恩岛|n|n','[{"type": "event", "event": "剧场巡演", "source_label": "活动"}, {"type": "treasure", "treasure": "业余演员的宝箱、杰出演员的宝箱", "zones": ["多恩岛"]}]'::jsonb),
(925,241043,'20261102-224408','|cFFFFD200要塞任务：|r突袭沙塔斯港口|n|cFFFFD200地区：|r塔拉多|n','[{"type": "quest", "quest": "突袭沙塔斯港口", "zones": ["塔拉多"], "source_label": "要塞任务"}]'::jsonb),
(1154,253481,'20261102-224408','|cFFFFD200周常任务：|r精选之礼|n|cFFFFD200物品：|r奥术秘藏光球|n|cFFFFD200地区：|r创始者之角、烈风海岸','[{"type": "quest", "quest": "精选之礼", "zones": ["创始者之角、烈风海岸"], "source_label": "周常任务", "context": [{"label": "物品", "value": "奥术秘藏光球"}]}]'::jsonb),
(1261,245320,'20261102-224408','|cFFFFD200活动：|r货运与接收|n|cFFFFD200工作：|r法定休假|n|cFFFFD200地区：|r安德麦','[{"type": "event", "event": "货运与接收", "zones": ["安德麦"], "source_label": "活动", "context": [{"label": "工作", "value": "法定休假"}]}]'::jsonb),
(1674,244852,'20261102-224408','|cFFFFD200成就：|r上痛！上诅咒！上钉刺！（25人）|n|cFFFFD200分类：|r巫妖王团队|n|n|cFFFFD200物品：|r货真价实、如假包换的龙母的徽记|n|cFFFFD200商人出售：|r埃克斯勒|n|cFFFFD200地区：|r尘泥沼泽|n|cFFFFD200价格：|r250|TINTERFACE\MONEYFRAME\UI-GOLDICON.BLP:0|t|n','[{"type": "achievement", "achievement": "上痛！上诅咒！上钉刺！（25人）", "category": "巫妖王团队", "context": [{"label": "物品", "value": "货真价实、如假包换的龙母的徽记"}]}, {"type": "vendor", "vendor": "埃克斯勒", "zones": ["尘泥沼泽"], "price": [{"gold": 250}], "reputation": null}]'::jsonb),
(1730,245539,'20261102-224408','|cFFFFD200周常任务：|r精选之礼|n|cFFFFD200物品：|r奥术秘藏光球|n|cFFFFD200地区：|r创始者之角、烈风海岸','[{"type": "quest", "quest": "精选之礼", "zones": ["创始者之角、烈风海岸"], "source_label": "周常任务", "context": [{"label": "物品", "value": "奥术秘藏光球"}]}]'::jsonb),
(2324,246481,'20261102-224408','|cFFFFD200活动：|r日常任务|n|cFFFFD200物品：|r自动拼装式家具包|n|cFFFFD200地区：|r麦卡贡','[{"type": "event", "event": "日常任务", "zones": ["麦卡贡"], "source_label": "活动", "context": [{"label": "物品", "value": "自动拼装式家具包"}]}]'::jsonb),
(2431,246599,'20261102-224408','|cFFFFD200活动：|r日常任务|n|cFFFFD200物品：|r自动拼装式家具包|n|cFFFFD200地区：|r麦卡贡','[{"type": "event", "event": "日常任务", "zones": ["麦卡贡"], "source_label": "活动", "context": [{"label": "物品", "value": "自动拼装式家具包"}]}]'::jsonb),
(2432,246600,'20261102-224408','|cFFFFD200活动：|r日常任务|n|cFFFFD200物品：|r自动拼装式家具包|n|cFFFFD200地区：|r麦卡贡','[{"type": "event", "event": "日常任务", "zones": ["麦卡贡"], "source_label": "活动", "context": [{"label": "物品", "value": "自动拼装式家具包"}]}]'::jsonb),
(2434,246602,'20261102-224408','|cFFFFD200活动：|r日常任务|n|cFFFFD200物品：|r自动拼装式家具包|n|cFFFFD200地区：|r麦卡贡','[{"type": "event", "event": "日常任务", "zones": ["麦卡贡"], "source_label": "活动", "context": [{"label": "物品", "value": "自动拼装式家具包"}]}]'::jsonb),
(2587,246958,'20261102-224408','|cFFFFD200周常任务：|r精选之礼|n|cFFFFD200物品：|r奥术秘藏光球|n|cFFFFD200地区：|r创始者之角、烈风海岸','[{"type": "quest", "quest": "精选之礼", "zones": ["创始者之角、烈风海岸"], "source_label": "周常任务", "context": [{"label": "物品", "value": "奥术秘藏光球"}]}]'::jsonb),
(5796,249923,'20261102-224408','|cFFFFD200周常任务：|r精选之礼|n|cFFFFD200物品：|r奥术秘藏光球|n|cFFFFD200地区：|r创始者之角、烈风海岸','[{"type": "quest", "quest": "精选之礼", "zones": ["创始者之角、烈风海岸"], "source_label": "周常任务", "context": [{"label": "物品", "value": "奥术秘藏光球"}]}]'::jsonb),
(8176,251329,'20261102-224408','|cFFFFD200要塞任务：|r突击索克雷萨高地|n|cFFFFD200地区：|r影月谷','[{"type": "quest", "quest": "突击索克雷萨高地", "zones": ["影月谷"], "source_label": "要塞任务"}]'::jsonb),
(8238,251547,'20261102-224408','|cFFFFD200要塞任务：|r突袭沙塔斯市中心|n|cFFFFD200地区：|r塔拉多|n','[{"type": "quest", "quest": "突袭沙塔斯市中心", "zones": ["塔拉多"], "source_label": "要塞任务"}]'::jsonb),
(9290,253397,'20261102-224408','|cFFFFD200周常任务：|r精选之礼|n|cFFFFD200物品：|r奥术秘藏光球|n|cFFFFD200地区：|r创始者之角、烈风海岸','[{"type": "quest", "quest": "精选之礼", "zones": ["创始者之角、烈风海岸"], "source_label": "周常任务", "context": [{"label": "物品", "value": "奥术秘藏光球"}]}]'::jsonb),
(10368,254561,'20261102-224408','|cFFFFD200周常任务：|r精选之礼|n|cFFFFD200物品：|r奥术秘藏光球|n|cFFFFD200地区：|r创始者之角、烈风海岸','[{"type": "quest", "quest": "精选之礼", "zones": ["创始者之角、烈风海岸"], "source_label": "周常任务", "context": [{"label": "物品", "value": "奥术秘藏光球"}]}]'::jsonb),
(11455,257353,'20261102-224408','|cFFFFD200成就：|r地心寻魂|n|cFFFFD200分类：|r特色更新|n|n|cFFFFD200物品：|r伪造的迦拉克隆幽暗之心|n|cFFFFD200商人出售：|r斯塔克斯·紧身|n|cFFFFD200地区：|r安德麦|n|cFFFFD200价格：|r15000|Hcurrency:2815|h|TInterface\ICONS\SPELL_AZERITE_ESSENCE14.BLP:0|t|h','[{"type": "achievement", "achievement": "地心寻魂", "category": "特色更新", "context": [{"label": "物品", "value": "伪造的迦拉克隆幽暗之心"}]}, {"type": "vendor", "vendor": "斯塔克斯·紧身", "zones": ["安德麦"], "price": [{"currency_id": 2815, "amount": 15000}], "reputation": null}]'::jsonb),
(15583,264343,'20261102-224408','|cFFFFD200活动：|r斯托玛兰突袭战|n|cFFFFD200宝藏：|r胜利的斯托玛兰巅峰之箱|n|cFFFFD200地区：|r虚影风暴','[{"type": "event", "event": "斯托玛兰突袭战", "source_label": "活动"}, {"type": "treasure", "treasure": "胜利的斯托玛兰巅峰之箱", "zones": ["虚影风暴"]}]'::jsonb),
(15747,264483,'20261102-224408','|cFFFFD200活动：|r斯托玛兰突袭战|n|cFFFFD200宝藏：|r胜利的斯托玛兰巅峰之箱|n|cFFFFD200地区：|r虚影风暴','[{"type": "event", "event": "斯托玛兰突袭战", "source_label": "活动"}, {"type": "treasure", "treasure": "胜利的斯托玛兰巅峰之箱", "zones": ["虚影风暴"]}]'::jsonb);
SELECT to_jsonb(d) AS backup_before FROM public.decor_catalog d
JOIN task083_followup e USING(record_id) ORDER BY d.record_id;
DO $$ BEGIN
 IF (SELECT count(*) FROM task083_followup) <> 19 OR EXISTS(
   SELECT 1 FROM task083_followup e LEFT JOIN public.decor_catalog d USING(record_id)
   WHERE d.record_id IS NULL OR d.item_id IS DISTINCT FROM e.item_id
   OR d.run_id IS DISTINCT FROM e.run_id OR d.source_text IS DISTINCT FROM e.source_text
   OR NOT(d.sources IS NULL OR d.sources='[]'::jsonb OR d.sources=e.sources)) THEN
   RAISE EXCEPTION 'followup: missing row, identity/run/raw mismatch or curated source conflict';
 END IF;
END $$;
UPDATE public.decor_catalog d SET sources=e.sources FROM task083_followup e
WHERE d.record_id=e.record_id AND d.sources IS DISTINCT FROM e.sources;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM task083_followup e LEFT JOIN public.decor_catalog d USING(record_id)
   WHERE d.sources IS DISTINCT FROM e.sources) THEN
   RAISE EXCEPTION 'followup: post-write mismatch; rollback';
 END IF;
END $$;
SELECT d.record_id,d.name,d.sources FROM public.decor_catalog d
JOIN task083_followup e USING(record_id) ORDER BY d.record_id;
COMMIT;
-- 回滚：按执行前 backup_before 的 record_id 有条件恢复 sources；禁止全表清空。
