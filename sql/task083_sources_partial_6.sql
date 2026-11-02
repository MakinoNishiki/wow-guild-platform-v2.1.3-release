-- #83补丁3：6件家具已知掉落/宝藏；采集原文作为待核说明；未执行。
-- 只改sources，复用已上线context展示；不重跑补丁2或全目录SQL。
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL standard_conforming_strings=on;
LOCK TABLE public.decor_catalog IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE task083_partial6(record_id integer PRIMARY KEY, item_id integer,
 run_id text NOT NULL, source_text text NOT NULL, sources jsonb NOT NULL) ON COMMIT DROP;
INSERT INTO task083_partial6 VALUES
(1433,244350,'20261102-224408','|cFFFFD200掉落：|r世界生物|n|n|cFFFFD200宝藏：|r世界|cffA335EE古代储物箱掉落|n|n|cFFFFD200采集：|r世界错放的宝藏节点','[{"type": "drop", "drop": "世界生物", "zones": []}, {"type": "treasure", "treasure": "世界古代储物箱掉落", "zones": [], "context": [{"label": "待核实来源", "value": "采集：世界错放的宝藏节点"}]}]'::jsonb),
(8992,252044,'20261102-224408','|cFFFFD200掉落：|r世界生物|n|n|cFFFFD200宝藏：|r世界|cffA335EE古代储物箱掉落|n|n|cFFFFD200采集：|r世界错放的宝藏节点','[{"type": "drop", "drop": "世界生物", "zones": []}, {"type": "treasure", "treasure": "世界古代储物箱掉落", "zones": [], "context": [{"label": "待核实来源", "value": "采集：世界错放的宝藏节点"}]}]'::jsonb),
(15161,263321,'20261102-224408','|cFFFFD200掉落：|r世界生物|n|n|cFFFFD200宝藏：|r世界|cffA335EE古代储物箱掉落|n|n|cFFFFD200采集：|r世界错放的宝藏节点','[{"type": "drop", "drop": "世界生物", "zones": []}, {"type": "treasure", "treasure": "世界古代储物箱掉落", "zones": [], "context": [{"label": "待核实来源", "value": "采集：世界错放的宝藏节点"}]}]'::jsonb),
(15491,264256,'20261102-224408','|cFFFFD200掉落：|r世界生物|n|n|cFFFFD200宝藏：|r世界|cffA335EE古代储物箱掉落|n|n|cFFFFD200采集：|r世界错放的宝藏节点','[{"type": "drop", "drop": "世界生物", "zones": []}, {"type": "treasure", "treasure": "世界古代储物箱掉落", "zones": [], "context": [{"label": "待核实来源", "value": "采集：世界错放的宝藏节点"}]}]'::jsonb),
(15748,264484,'20261102-224408','|cFFFFD200掉落：|r世界生物|n|n|cFFFFD200宝藏：|r世界|cffA335EE古代储物箱掉落|n|n|cFFFFD200采集：|r世界错放的宝藏节点','[{"type": "drop", "drop": "世界生物", "zones": []}, {"type": "treasure", "treasure": "世界古代储物箱掉落", "zones": [], "context": [{"label": "待核实来源", "value": "采集：世界错放的宝藏节点"}]}]'::jsonb),
(25129,284359,'20261102-224408','|cFFFFD200掉落：|r世界生物|n|n|cFFFFD200宝藏：|r世界|cffA335EE古代储物箱掉落|n|n|cFFFFD200采集：|r世界错放的宝藏节点','[{"type": "drop", "drop": "世界生物", "zones": []}, {"type": "treasure", "treasure": "世界古代储物箱掉落", "zones": [], "context": [{"label": "待核实来源", "value": "采集：世界错放的宝藏节点"}]}]'::jsonb);
SELECT to_jsonb(d) AS backup_before FROM public.decor_catalog d
JOIN task083_partial6 e USING(record_id) ORDER BY d.record_id;
DO $$ BEGIN
 IF (SELECT count(*) FROM task083_partial6) <> 6 OR EXISTS(
   SELECT 1 FROM task083_partial6 e LEFT JOIN public.decor_catalog d USING(record_id)
   WHERE d.record_id IS NULL OR d.item_id IS DISTINCT FROM e.item_id
   OR d.run_id IS DISTINCT FROM e.run_id OR d.source_text IS DISTINCT FROM e.source_text
   OR NOT(d.sources IS NULL OR d.sources='[]'::jsonb OR d.sources=e.sources)) THEN
   RAISE EXCEPTION 'followup: missing row, identity/run/raw mismatch or curated source conflict';
 END IF;
END $$;
UPDATE public.decor_catalog d SET sources=e.sources FROM task083_partial6 e
WHERE d.record_id=e.record_id AND d.sources IS DISTINCT FROM e.sources;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM task083_partial6 e LEFT JOIN public.decor_catalog d USING(record_id)
   WHERE d.sources IS DISTINCT FROM e.sources) THEN
   RAISE EXCEPTION 'followup: post-write mismatch; rollback';
 END IF;
END $$;
SELECT d.record_id,d.name,d.sources FROM public.decor_catalog d
JOIN task083_partial6 e USING(record_id) ORDER BY d.record_id;
COMMIT;
-- 回滚：按执行前 backup_before 的 record_id 有条件恢复 sources；禁止全表清空。
