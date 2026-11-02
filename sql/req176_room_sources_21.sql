-- REQ-176: 21 evidence-backed room sources; not executed. Deploy unlock renderer first.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL standard_conforming_strings=on;
LOCK TABLE public.decor_catalog IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE req176_rooms21(record_id integer PRIMARY KEY, item_id integer,
 run_id text NOT NULL, source_text text NOT NULL, sources jsonb NOT NULL) ON COMMIT DROP;
INSERT INTO req176_rooms21 VALUES
(132,NULL,'20261102-224408','','[{"type": "vendor", "vendor": "最后的建筑师／住宅区走私商", "zones": ["创始者之角、烈风海岸"], "price": null, "reputation": null, "context": [{"label": "购买说明", "value": "本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"}, {"label": "解锁方式", "value": "购买并使用对应房间图纸后学习"}, {"label": "售价", "value": "12.1.5当前商人实价待核实"}]}]'::jsonb),
(151,NULL,'20261102-224408','','[{"type": "vendor", "vendor": "最后的建筑师／住宅区走私商", "zones": ["创始者之角、烈风海岸"], "price": null, "reputation": null, "context": [{"label": "购买说明", "value": "本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"}, {"label": "解锁方式", "value": "购买并使用对应房间图纸后学习"}, {"label": "售价", "value": "12.1.5当前商人实价待核实"}]}]'::jsonb),
(223,NULL,'20261102-224408','','[{"type": "unlock", "unlock": "住宅等级 3 解锁", "context": [{"label": "说明", "value": "提升住宅等级后获得对应房间"}]}]'::jsonb),
(233,NULL,'20261102-224408','','[{"type": "unlock", "unlock": "住宅等级 5 解锁", "context": [{"label": "说明", "value": "提升住宅等级后获得对应房间"}]}]'::jsonb),
(273,NULL,'20261102-224408','','[{"type": "vendor", "vendor": "最后的建筑师／住宅区走私商", "zones": ["创始者之角、烈风海岸"], "price": null, "reputation": null, "context": [{"label": "购买说明", "value": "本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"}, {"label": "解锁方式", "value": "购买并使用对应房间图纸后学习"}, {"label": "售价", "value": "12.1.5当前商人实价待核实"}]}]'::jsonb),
(277,NULL,'20261102-224408','','[{"type": "vendor", "vendor": "最后的建筑师／住宅区走私商", "zones": ["创始者之角、烈风海岸"], "price": null, "reputation": null, "context": [{"label": "购买说明", "value": "本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"}, {"label": "解锁方式", "value": "购买并使用对应房间图纸后学习"}, {"label": "售价", "value": "12.1.5当前商人实价待核实"}]}]'::jsonb),
(281,NULL,'20261102-224408','','[{"type": "vendor", "vendor": "最后的建筑师／住宅区走私商", "zones": ["创始者之角、烈风海岸"], "price": null, "reputation": null, "context": [{"label": "购买说明", "value": "本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"}, {"label": "解锁方式", "value": "购买并使用对应房间图纸后学习"}, {"label": "售价", "value": "12.1.5当前商人实价待核实"}]}]'::jsonb),
(282,NULL,'20261102-224408','','[{"type": "vendor", "vendor": "最后的建筑师／住宅区走私商", "zones": ["创始者之角、烈风海岸"], "price": null, "reputation": null, "context": [{"label": "购买说明", "value": "本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"}, {"label": "解锁方式", "value": "购买并使用对应房间图纸后学习"}, {"label": "售价", "value": "12.1.5当前商人实价待核实"}]}]'::jsonb),
(283,NULL,'20261102-224408','','[{"type": "vendor", "vendor": "最后的建筑师／住宅区走私商", "zones": ["创始者之角、烈风海岸"], "price": null, "reputation": null, "context": [{"label": "购买说明", "value": "本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"}, {"label": "解锁方式", "value": "购买并使用对应房间图纸后学习"}, {"label": "售价", "value": "12.1.5当前商人实价待核实"}]}]'::jsonb),
(285,NULL,'20261102-224408','','[{"type": "vendor", "vendor": "最后的建筑师／住宅区走私商", "zones": ["创始者之角、烈风海岸"], "price": null, "reputation": null, "context": [{"label": "购买说明", "value": "本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"}, {"label": "解锁方式", "value": "购买并使用对应房间图纸后学习"}, {"label": "售价", "value": "12.1.5当前商人实价待核实"}]}]'::jsonb),
(286,NULL,'20261102-224408','','[{"type": "vendor", "vendor": "最后的建筑师／住宅区走私商", "zones": ["创始者之角、烈风海岸"], "price": null, "reputation": null, "context": [{"label": "购买说明", "value": "本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"}, {"label": "解锁方式", "value": "购买并使用对应房间图纸后学习"}, {"label": "售价", "value": "12.1.5当前商人实价待核实"}]}]'::jsonb),
(287,NULL,'20261102-224408','','[{"type": "vendor", "vendor": "最后的建筑师／住宅区走私商", "zones": ["创始者之角、烈风海岸"], "price": null, "reputation": null, "context": [{"label": "购买说明", "value": "本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"}, {"label": "解锁方式", "value": "购买并使用对应房间图纸后学习"}, {"label": "售价", "value": "12.1.5当前商人实价待核实"}]}]'::jsonb),
(288,NULL,'20261102-224408','','[{"type": "vendor", "vendor": "最后的建筑师／住宅区走私商", "zones": ["创始者之角、烈风海岸"], "price": null, "reputation": null, "context": [{"label": "购买说明", "value": "本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"}, {"label": "解锁方式", "value": "购买并使用对应房间图纸后学习"}, {"label": "售价", "value": "12.1.5当前商人实价待核实"}]}]'::jsonb),
(289,NULL,'20261102-224408','','[{"type": "vendor", "vendor": "最后的建筑师／住宅区走私商", "zones": ["创始者之角、烈风海岸"], "price": null, "reputation": null, "context": [{"label": "购买说明", "value": "本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"}, {"label": "解锁方式", "value": "购买并使用对应房间图纸后学习"}, {"label": "售价", "value": "12.1.5当前商人实价待核实"}]}]'::jsonb),
(290,NULL,'20261102-224408','','[{"type": "vendor", "vendor": "最后的建筑师／住宅区走私商", "zones": ["创始者之角、烈风海岸"], "price": null, "reputation": null, "context": [{"label": "购买说明", "value": "本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"}, {"label": "解锁方式", "value": "购买并使用对应房间图纸后学习"}, {"label": "售价", "value": "12.1.5当前商人实价待核实"}]}]'::jsonb),
(292,NULL,'20261102-224408','','[{"type": "vendor", "vendor": "最后的建筑师／住宅区走私商", "zones": ["创始者之角、烈风海岸"], "price": null, "reputation": null, "context": [{"label": "购买说明", "value": "本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"}, {"label": "解锁方式", "value": "购买并使用对应房间图纸后学习"}, {"label": "售价", "value": "12.1.5当前商人实价待核实"}]}]'::jsonb),
(294,NULL,'20261102-224408','','[{"type": "vendor", "vendor": "最后的建筑师／住宅区走私商", "zones": ["创始者之角、烈风海岸"], "price": null, "reputation": null, "context": [{"label": "购买说明", "value": "本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"}, {"label": "解锁方式", "value": "购买并使用对应房间图纸后学习"}, {"label": "售价", "value": "12.1.5当前商人实价待核实"}]}]'::jsonb),
(307,NULL,'20261102-224408','','[{"type": "vendor", "vendor": "最后的建筑师／住宅区走私商", "zones": ["创始者之角、烈风海岸"], "price": null, "reputation": null, "context": [{"label": "购买说明", "value": "本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"}, {"label": "解锁方式", "value": "购买并使用对应房间图纸后学习"}, {"label": "售价", "value": "12.1.5当前商人实价待核实"}]}]'::jsonb),
(400,NULL,'20261102-224408','','[{"type": "vendor", "vendor": "最后的建筑师／住宅区走私商", "zones": ["创始者之角、烈风海岸"], "price": null, "reputation": null, "context": [{"label": "购买说明", "value": "本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"}, {"label": "解锁方式", "value": "购买并使用对应房间图纸后学习"}, {"label": "售价", "value": "12.1.5当前商人实价待核实"}]}]'::jsonb),
(401,NULL,'20261102-224408','','[{"type": "vendor", "vendor": "最后的建筑师／住宅区走私商", "zones": ["创始者之角、烈风海岸"], "price": null, "reputation": null, "context": [{"label": "购买说明", "value": "本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买"}, {"label": "解锁方式", "value": "购买并使用对应房间图纸后学习"}, {"label": "售价", "value": "12.1.5当前商人实价待核实"}]}]'::jsonb),
(439,NULL,'20261102-224408','','[{"type": "shop", "tag": "商城", "context": [{"label": "礼包", "value": "Haunted Grimtide Estate"}, {"label": "包含内容", "value": "魂萦幽潮门厅（Spirited Grimtide Foyer）"}]}]'::jsonb);
SELECT to_jsonb(d) AS backup_before FROM public.decor_catalog d
JOIN req176_rooms21 e USING(record_id) ORDER BY d.record_id;
DO $$ BEGIN
 IF (SELECT count(*) FROM req176_rooms21) <> 21 OR EXISTS(
   SELECT 1 FROM req176_rooms21 e LEFT JOIN public.decor_catalog d USING(record_id)
   WHERE d.record_id IS NULL OR d.entry_type IS DISTINCT FROM 2 OR d.item_id IS DISTINCT FROM e.item_id
   OR d.run_id IS DISTINCT FROM e.run_id OR d.source_text IS DISTINCT FROM e.source_text
   OR NOT(d.sources IS NULL OR d.sources='[]'::jsonb OR d.sources=e.sources)) THEN
   RAISE EXCEPTION 'followup: missing row, identity/run/raw mismatch or curated source conflict';
 END IF;
END $$;
UPDATE public.decor_catalog d SET sources=e.sources FROM req176_rooms21 e
WHERE d.record_id=e.record_id AND d.sources IS DISTINCT FROM e.sources;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM req176_rooms21 e LEFT JOIN public.decor_catalog d USING(record_id)
   WHERE d.sources IS DISTINCT FROM e.sources) THEN
   RAISE EXCEPTION 'followup: post-write mismatch; rollback';
 END IF;
END $$;
SELECT d.record_id,d.name,d.sources FROM public.decor_catalog d
JOIN req176_rooms21 e USING(record_id) ORDER BY d.record_id;
COMMIT;
-- 回滚：按执行前 backup_before 的 record_id 有条件恢复 sources；禁止全表清空。
