-- REQ-176: 3 room unlocks verified in the in-game House Level panel.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL standard_conforming_strings=on;
LOCK TABLE public.decor_catalog IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE req176_room_levels3(record_id integer PRIMARY KEY, item_id integer,
 run_id text NOT NULL, source_text text NOT NULL, sources jsonb NOT NULL) ON COMMIT DROP;
INSERT INTO req176_room_levels3 VALUES
(11,NULL,'20261102-224408','','[{"type": "unlock", "unlock": "住宅等级 2 解锁", "context": [{"label": "说明", "value": "提升住宅等级后获得对应房间"}]}]'::jsonb),
(15,NULL,'20261102-224408','','[{"type": "unlock", "unlock": "住宅等级 4 解锁", "context": [{"label": "说明", "value": "提升住宅等级后获得对应房间"}]}]'::jsonb),
(12,NULL,'20261102-224408','','[{"type": "unlock", "unlock": "住宅等级 5 解锁", "context": [{"label": "说明", "value": "提升住宅等级后获得对应房间"}]}]'::jsonb);
SELECT to_jsonb(d) AS backup_before FROM public.decor_catalog d
JOIN req176_room_levels3 e USING(record_id) ORDER BY d.record_id;
DO $$ BEGIN
 IF (SELECT count(*) FROM req176_room_levels3) <> 3 OR EXISTS(
   SELECT 1 FROM req176_room_levels3 e LEFT JOIN public.decor_catalog d USING(record_id)
   WHERE d.record_id IS NULL OR d.entry_type IS DISTINCT FROM 2 OR d.item_id IS DISTINCT FROM e.item_id
   OR d.run_id IS DISTINCT FROM e.run_id OR d.source_text IS DISTINCT FROM e.source_text
   OR NOT(d.sources IS NULL OR d.sources='[]'::jsonb OR d.sources=e.sources)) THEN
   RAISE EXCEPTION 'followup: missing row, identity/run/raw mismatch or curated source conflict';
 END IF;
END $$;
UPDATE public.decor_catalog d SET sources=e.sources FROM req176_room_levels3 e
WHERE d.record_id=e.record_id AND d.sources IS DISTINCT FROM e.sources;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM req176_room_levels3 e LEFT JOIN public.decor_catalog d USING(record_id)
   WHERE d.sources IS DISTINCT FROM e.sources) THEN
   RAISE EXCEPTION 'followup: post-write mismatch; rollback';
 END IF;
END $$;
SELECT d.record_id,d.name,d.sources FROM public.decor_catalog d
JOIN req176_room_levels3 e USING(record_id) ORDER BY d.record_id;
COMMIT;
-- 回滚：按执行前 backup_before 的 record_id 有条件恢复 sources；禁止全表清空。
