-- REQ-191: approved 2026-11-13, apply to isolated test first. No production execution implied.
-- Preflight: SQL42 exists. Transaction preserves every old loot_drops row.
-- Rollback: stop submission/review routes, restore previous application, retain new tables/columns.
-- Do NOT drop evidence after writes. Old exact-time unique index cannot be restored blindly:
-- first reconcile legitimate same-second multi-item rows and export evidence; separate reviewed migration required.
BEGIN;
ALTER TABLE public.loot_drops ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL;
ALTER TABLE public.loot_drops ADD COLUMN IF NOT EXISTS player_server text;
ALTER TABLE public.loot_drops ADD COLUMN IF NOT EXISTS player_region text;
ALTER TABLE public.loot_drops ADD COLUMN IF NOT EXISTS item_link text;
ALTER TABLE public.loot_drops ADD COLUMN IF NOT EXISTS encounter_id integer;
ALTER TABLE public.loot_drops ADD COLUMN IF NOT EXISTS encounter_at timestamptz;
ALTER TABLE public.loot_drops ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1 CHECK(quantity BETWEEN 1 AND 100);
ALTER TABLE public.loot_drops ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'legacy' CHECK(review_status IN ('legacy','pending','needs_review','confirmed','ignored','merged'));
ALTER TABLE public.loot_drops ADD COLUMN IF NOT EXISTS review_reason text;
ALTER TABLE public.loot_drops ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.loot_drops ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.loot_drops ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES public.loot_drops(id);
ALTER TABLE public.loot_drops ADD COLUMN IF NOT EXISTS observation_count integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.loot_drop_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  submitter_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  collector_source_id text NOT NULL,
  source_event_id text NOT NULL,
  activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL,
  payload jsonb NOT NULL,
  canonical_drop_id uuid NOT NULL REFERENCES public.loot_drops(id) ON DELETE CASCADE,
  UNIQUE(guild_id,collector_source_id,source_event_id)
);
CREATE INDEX IF NOT EXISTS loot_observation_drop_idx ON public.loot_drop_observations(canonical_drop_id);
CREATE INDEX IF NOT EXISTS loot_drop_match_idx ON public.loot_drops(guild_id,activity_id,official_item_id,timestamp);
ALTER TABLE public.loot_drop_observations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.loot_drop_observations TO authenticated;
GRANT ALL ON public.loot_drop_observations TO service_role;
DROP POLICY IF EXISTS loot_observations_read ON public.loot_drop_observations;
CREATE POLICY loot_observations_read ON public.loot_drop_observations FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.guild_members gm WHERE gm.guild_id=loot_drop_observations.guild_id AND gm.user_id=auth.uid()
    AND (gm.role IN ('owner','editor') OR loot_drop_observations.submitter_user_id=auth.uid()))
);
-- New per-source event identity replaces the insufficient same-second uniqueness.
-- Legacy rows remain untouched; submissions can no longer directly insert loot_drops.
DROP INDEX IF EXISTS public.uq_loot_drops_event;
ALTER TABLE public.loot_records ADD COLUMN IF NOT EXISTS source_drop_id uuid REFERENCES public.loot_drops(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS loot_allocation_source_unique ON public.loot_records(source_drop_id) WHERE source_drop_id IS NOT NULL;
-- Reserved for the next accepted allocation block; generic proxy cannot write this field.
CREATE OR REPLACE FUNCTION public.req191_allocation_source_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.source_drop_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.loot_drops d WHERE d.id=NEW.source_drop_id AND d.guild_id=NEW.guild_id AND d.review_status='confirmed' AND d.quantity=1) THEN
    RAISE EXCEPTION '拾取来源必须属于当前公会且已核对为单件';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS req191_allocation_source_guard ON public.loot_records;
CREATE TRIGGER req191_allocation_source_guard BEFORE INSERT OR UPDATE ON public.loot_records FOR EACH ROW EXECUTE FUNCTION public.req191_allocation_source_guard();

CREATE OR REPLACE FUNCTION public.req191_submit_loot(p_guild uuid,p_user uuid,p_activity uuid,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r jsonb; old public.loot_drop_observations; d public.loot_drops; ids uuid[]; did uuid; eligible boolean;
  v_new int:=0; v_merged int:=0; v_repeat int:=0; v_ignored int:=0; out_ids jsonb:='[]'; reason text;
BEGIN
  -- Fresh membership check inside the same transaction; HTTP cache never grants final write rights.
  IF NOT EXISTS(SELECT 1 FROM guild_members WHERE guild_id=p_guild AND user_id=p_user) THEN RAISE EXCEPTION '无权提交该公会记录' USING ERRCODE='42501'; END IF;
  IF p_activity IS NOT NULL AND NOT EXISTS(SELECT 1 FROM activities WHERE id=p_activity AND guild_id=p_guild AND coalesce(status,'normal')='normal') THEN RAISE EXCEPTION '活动不存在、已取消或不属于当前公会'; END IF;
  IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION '每批需1至200条记录'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('req191:'||p_guild::text,0));
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    SELECT * INTO old FROM loot_drop_observations WHERE guild_id=p_guild AND collector_source_id=r->>'collector_source_id' AND source_event_id=r->>'source_event_id';
    IF FOUND THEN
      IF old.content_hash<>r->>'content_hash' OR old.activity_id IS DISTINCT FROM p_activity THEN RAISE EXCEPTION '同一采集记录内容或活动已改变，请保留原文并由管理者核对'; END IF;
      v_repeat:=v_repeat+1; out_ids:=out_ids||jsonb_build_array(old.canonical_drop_id); CONTINUE;
    END IF;
    eligible:=p_activity IS NOT NULL AND coalesce((r->>'identity_complete')::boolean,false) AND (r->>'quantity')::int=1;
    ids:='{}'; reason:='证据不足，需核对活动、服务器和首领';
    IF eligible THEN
      SELECT array_agg(id) INTO ids FROM loot_drops WHERE guild_id=p_guild AND activity_id=p_activity
        AND official_item_id=(r->>'official_item_id')::bigint AND player_name=r->>'player_name'
        AND player_server=r->>'player_server' AND player_region=r->>'player_region'
        AND difficulty_id=(r->>'difficulty_id')::int AND encounter_id=(r->>'encounter_id')::int
        AND instance_name=r->>'instance_name' AND item_link=r->>'item_link' AND ilvl=(r->>'ilvl')::int
        AND abs(extract(epoch FROM timestamp-(r->>'timestamp')::timestamptz))<=2
        AND abs(extract(epoch FROM encounter_at-(r->>'encounter_at')::timestamptz))<=2
        AND review_status NOT IN ('legacy','merged') AND quantity=1;
      reason:='新的拾取，尚未确认最终获得者';
    END IF;
    did:=NULL;
    IF cardinality(ids)=1 AND NOT EXISTS(SELECT 1 FROM loot_drop_observations WHERE canonical_drop_id=ids[1] AND collector_source_id=r->>'collector_source_id') THEN
      SELECT * INTO d FROM loot_drops WHERE id=ids[1];
      IF d.review_status<>'needs_review' THEN did:=d.id; END IF;
    END IF;
    IF did IS NULL THEN
      IF cardinality(ids)>0 THEN
        reason:='可能重复或同物品多件，请核对数量';
        UPDATE loot_drops SET review_status='needs_review',review_reason=reason WHERE id=ANY(ids) AND review_status='pending';
      END IF;
      INSERT INTO loot_drops(guild_id,activity_id,player_name,player_server,player_region,item_name,official_item_id,item_link,icon_id,quality,ilvl,slot,slot_cn,item_type,boss_name,instance_name,difficulty,difficulty_id,timestamp,encounter_id,encounter_at,quantity,source,review_status,review_reason)
      VALUES(p_guild,p_activity,r->>'player_name',r->>'player_server',r->>'player_region',r->>'item_name',(r->>'official_item_id')::bigint,r->>'item_link',(r->>'icon_id')::int,(r->>'quality')::int,(r->>'ilvl')::int,r->>'slot',r->>'slot_cn',r->>'item_type',r->>'boss_name',r->>'instance_name',r->>'difficulty',(r->>'difficulty_id')::int,(r->>'timestamp')::timestamptz,(r->>'encounter_id')::int,(r->>'encounter_at')::timestamptz,(r->>'quantity')::int,'plugin',CASE WHEN eligible AND coalesce(cardinality(ids),0)=0 THEN 'pending' ELSE 'needs_review' END,reason) RETURNING id INTO did;
      v_new:=v_new+1;
    ELSE
      IF d.review_status='ignored' THEN v_ignored:=v_ignored+1; ELSE v_merged:=v_merged+1; END IF;
    END IF;
    INSERT INTO loot_drop_observations(guild_id,submitter_user_id,collector_source_id,source_event_id,activity_id,content_hash,payload,canonical_drop_id)
      VALUES(p_guild,p_user,r->>'collector_source_id',r->>'source_event_id',p_activity,r->>'content_hash',r,did);
    UPDATE loot_drops SET observation_count=observation_count+1 WHERE id=did;
    out_ids:=out_ids||jsonb_build_array(did);
  END LOOP;
  RETURN jsonb_build_object('created',v_new,'merged',v_merged,'repeated',v_repeat,'ignored',v_ignored,'ids',out_ids);
END $$;

CREATE OR REPLACE FUNCTION public.req191_review_loot(p_guild uuid,p_user uuid,p_id uuid,p_action text,p_target uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE d public.loot_drops; t public.loot_drops;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM guild_members WHERE guild_id=p_guild AND user_id=p_user AND role IN ('owner','editor')) THEN RAISE EXCEPTION '仅公会管理者可核对拾取' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('req191:'||p_guild::text,0));
  SELECT * INTO d FROM loot_drops WHERE id=p_id AND guild_id=p_guild FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '记录不存在或不属于当前公会'; END IF;
  IF d.review_status='merged' THEN RAISE EXCEPTION '记录已合并，请刷新'; END IF;
  IF EXISTS(SELECT 1 FROM loot_records WHERE source_drop_id=p_id) THEN RAISE EXCEPTION '已关联分配记录，请先核对分配'; END IF;
  IF p_action='merge' THEN
    SELECT * INTO t FROM loot_drops WHERE id=p_target AND guild_id=p_guild FOR UPDATE;
    IF NOT FOUND OR t.id=d.id OR t.review_status IN ('ignored','merged') OR d.review_status='ignored' THEN RAISE EXCEPTION '合并目标无效'; END IF;
    IF d.official_item_id IS DISTINCT FROM t.official_item_id OR d.player_name IS DISTINCT FROM t.player_name
      OR d.activity_id IS DISTINCT FROM t.activity_id OR d.difficulty_id IS DISTINCT FROM t.difficulty_id
      OR d.player_server IS DISTINCT FROM t.player_server OR d.player_region IS DISTINCT FROM t.player_region
      OR d.encounter_id IS DISTINCT FROM t.encounter_id OR d.instance_name IS DISTINCT FROM t.instance_name
      OR (coalesce(d.item_link,'')<>'' AND coalesce(t.item_link,'')<>'' AND d.item_link<>t.item_link)
      OR (d.ilvl IS NOT NULL AND t.ilvl IS NOT NULL AND d.ilvl<>t.ilvl)
      OR d.quantity<>t.quantity THEN RAISE EXCEPTION '活动、物品变体、拾取人、服务器、难度、首领和数量须一致'; END IF;
    IF EXISTS(SELECT 1 FROM loot_records WHERE source_drop_id=t.id) THEN RAISE EXCEPTION '目标已关联分配，不能合并'; END IF;
    UPDATE loot_drop_observations SET canonical_drop_id=t.id WHERE canonical_drop_id=d.id;
    UPDATE loot_drops SET observation_count=observation_count+d.observation_count WHERE id=t.id;
    UPDATE loot_drops SET review_status='merged',merged_into=t.id,observation_count=0,reviewed_by=p_user,reviewed_at=now() WHERE id=d.id;
  ELSIF p_action='activity' THEN
    IF NOT EXISTS(SELECT 1 FROM activities WHERE id=p_target AND guild_id=p_guild AND coalesce(status,'normal')='normal') THEN RAISE EXCEPTION '活动不存在、已取消或不属于当前公会'; END IF;
    IF d.review_status='ignored' THEN RAISE EXCEPTION '请先确认恢复被忽略的拾取'; END IF;
    UPDATE loot_drops SET activity_id=p_target,review_status='needs_review',review_reason='所属活动已更正，请重新核对',reviewed_by=p_user,reviewed_at=now() WHERE id=d.id;
    UPDATE loot_drop_observations SET activity_id=p_target WHERE canonical_drop_id=d.id;
  ELSIF p_action IN ('confirm','ignore') THEN
    UPDATE loot_drops SET review_status=CASE WHEN p_action='confirm' THEN 'confirmed' ELSE 'ignored' END,reviewed_by=p_user,reviewed_at=now() WHERE id=d.id;
  ELSE RAISE EXCEPTION '未知核对操作'; END IF;
  RETURN jsonb_build_object('id',p_id,'action',p_action);
END $$;
REVOKE ALL ON FUNCTION public.req191_submit_loot(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.req191_review_loot(uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.req191_submit_loot(uuid,uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.req191_review_loot(uuid,uuid,uuid,text,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
