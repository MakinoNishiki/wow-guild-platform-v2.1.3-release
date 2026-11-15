-- REQ195 approved 2026-11-16. Isolated test first; production requires separate authorization.
-- Rollback: with person attendance present, NEVER deploy an old reader: it would show missing/absent data.
-- Disable new writes, retain compatible reads, and fix forward. Preserve all tables/snapshots.
-- Only if new business tables are confirmed empty may the operator restore activities.attendance_mode
-- DEFAULT 'legacy' and deploy the old application. Structure/data must not be blindly dropped.
BEGIN;
CREATE TABLE IF NOT EXISTS public.guild_people (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), guild_id uuid NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80), user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,guild_id)
);
ALTER TABLE public.guild_people ADD COLUMN IF NOT EXISTS request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS guild_people_request_unique ON public.guild_people(guild_id,request_id) WHERE request_id IS NOT NULL;
ALTER TABLE public.raid_members ADD COLUMN IF NOT EXISTS person_id uuid;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS attendance_mode text NOT NULL DEFAULT 'legacy' CHECK(attendance_mode IN ('legacy','person'));
ALTER TABLE public.activities ALTER COLUMN attendance_mode SET DEFAULT 'person';
CREATE UNIQUE INDEX IF NOT EXISTS activities_id_guild_unique ON public.activities(id,guild_id);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='raid_member_person_guild_fk') THEN
 ALTER TABLE public.raid_members ADD CONSTRAINT raid_member_person_guild_fk FOREIGN KEY(person_id,guild_id) REFERENCES public.guild_people(id,guild_id);
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.guild_person_attendance (
 activity_id uuid NOT NULL, person_id uuid NOT NULL, guild_id uuid NOT NULL,
 person_name text NOT NULL, status text NOT NULL CHECK(status IN ('出席','缺席','迟到','替补','请假')),
 characters jsonb NOT NULL DEFAULT '[]', source text NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','wcl','legacy_conversion')),
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(activity_id,person_id),
 FOREIGN KEY(activity_id,guild_id) REFERENCES public.activities(id,guild_id) ON DELETE CASCADE,
 FOREIGN KEY(person_id,guild_id) REFERENCES public.guild_people(id,guild_id)
);
ALTER TABLE public.guild_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guild_person_attendance ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.guild_people,public.guild_person_attendance TO authenticated;
GRANT ALL ON public.guild_people,public.guild_person_attendance TO service_role;
DROP POLICY IF EXISTS people_read ON public.guild_people;
CREATE POLICY people_read ON public.guild_people FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.guild_members gm WHERE gm.guild_id=guild_people.guild_id AND gm.user_id=auth.uid()));
DROP POLICY IF EXISTS person_attendance_read ON public.guild_person_attendance;
CREATE POLICY person_attendance_read ON public.guild_person_attendance FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.guild_members gm WHERE gm.guild_id=guild_person_attendance.guild_id AND gm.user_id=auth.uid()));

CREATE OR REPLACE FUNCTION public.req195_people_write(p_actor uuid,p_guild uuid,p_action text,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE member_row record; r jsonb; target uuid; aid uuid; ids uuid[]; chars uuid[]; snapshot jsonb; mode text; pname text; seen uuid[]:='{}';
BEGIN
 -- Serialize relationship changes and attendance snapshots within one guild.
 PERFORM 1 FROM guilds WHERE id=p_guild FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM guild_members WHERE guild_id=p_guild AND user_id=p_actor AND role IN ('owner','editor')) THEN RAISE EXCEPTION '仅公会管理者可修改团员与考勤'; END IF;
 IF p_action='ensure' THEN
  FOR member_row IN SELECT * FROM raid_members WHERE guild_id=p_guild AND person_id IS NULL AND status NOT IN ('离队','inactive') FOR UPDATE LOOP
   INSERT INTO guild_people(guild_id,name,user_id) VALUES(p_guild,member_row.name,member_row.user_id) RETURNING id INTO target;
   UPDATE raid_members SET person_id=target WHERE id=member_row.id;
  END LOOP;
 ELSIF p_action='link' THEN
  SELECT array_agg(DISTINCT v::uuid) INTO ids FROM jsonb_array_elements_text(p_body->'memberIds') v;
  IF coalesce(cardinality(ids),0)=0 OR cardinality(ids)>200 THEN RAISE EXCEPTION '请选择需要关联的角色'; END IF;
  IF (SELECT count(*) FROM raid_members WHERE id=ANY(ids) AND guild_id=p_guild AND status NOT IN ('离队','inactive'))<>cardinality(ids) THEN RAISE EXCEPTION '角色已离队或不属于当前公会'; END IF;
  pname:=trim(p_body->>'name');
  IF pname IS NULL OR length(pname) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION '团员称呼须为1至80字'; END IF;
  target:=nullif(p_body->>'personId','')::uuid;
  IF target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM guild_people WHERE id=target AND guild_id=p_guild) THEN RAISE EXCEPTION '团员不属于当前公会'; END IF;
  IF EXISTS(SELECT 1 FROM raid_members WHERE id=ANY(ids) AND person_id IS NOT NULL AND person_id IS DISTINCT FROM target) AND coalesce((p_body->>'allowReassign')::boolean,false)=false THEN RAISE EXCEPTION '角色已有归属，请确认调整关系'; END IF;
  IF target IS NULL THEN
   IF nullif(p_body->>'requestId','') IS NULL THEN RAISE EXCEPTION '缺少保存编号，请重新打开'; END IF;
   SELECT id INTO target FROM guild_people WHERE guild_id=p_guild AND request_id=(p_body->>'requestId')::uuid;
   IF target IS NOT NULL THEN RETURN jsonb_build_object('id',target,'repeated',true); END IF;
   INSERT INTO guild_people(guild_id,name,request_id) VALUES(p_guild,pname,(p_body->>'requestId')::uuid) RETURNING id INTO target;
  ELSE UPDATE guild_people SET name=pname,status='active' WHERE id=target; END IF;
  UPDATE raid_members SET person_id=target WHERE id=ANY(ids);
  -- Retain old persons for historical snapshots, but no longer offer empty identities in new attendance.
  UPDATE guild_people p SET status='inactive' WHERE guild_id=p_guild AND NOT EXISTS(SELECT 1 FROM raid_members m WHERE m.person_id=p.id AND m.status NOT IN ('离队','inactive'));
  RETURN jsonb_build_object('id',target);
 ELSIF p_action='save' THEN
  aid:=(p_body->>'activityId')::uuid;
  SELECT attendance_mode INTO mode FROM activities WHERE id=aid AND guild_id=p_guild AND status<>'cancelled' FOR UPDATE;
  IF mode IS NULL THEN RAISE EXCEPTION '活动不存在、已取消或不属于当前公会'; END IF;
  IF mode='legacy' AND coalesce((p_body->>'convertLegacy')::boolean,false)=false THEN RAISE EXCEPTION '旧考勤需预览并确认转换'; END IF;
  IF jsonb_typeof(p_body->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(p_body->'rows')>500 THEN RAISE EXCEPTION '考勤格式无效'; END IF;
  -- Validate the final batch, including untouched stored rows, before writing anything.
  -- A character cannot be counted for two people in one activity after relationship changes.
  IF EXISTS(
   WITH replaced AS (SELECT (value->>'person_id')::uuid id FROM jsonb_array_elements(p_body->'rows')),
   evidence AS (
    SELECT (incoming_row.value->>'person_id')::uuid pid,c.value::uuid cid
    FROM jsonb_array_elements(p_body->'rows') incoming_row CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(incoming_row.value->'character_ids','[]')) c
    UNION ALL
    SELECT old.person_id,(c.value->>'id')::uuid FROM guild_person_attendance old
    CROSS JOIN LATERAL jsonb_array_elements(old.characters) c
    WHERE old.activity_id=aid AND NOT EXISTS(SELECT 1 FROM replaced WHERE replaced.id=old.person_id)
   ) SELECT 1 FROM evidence GROUP BY cid HAVING count(DISTINCT pid)>1
  ) THEN RAISE EXCEPTION '同一场活动的参战角色已归属于另一团员，请核对历史归属后整体更正'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_body->'rows') LOOP
   target:=(r->>'person_id')::uuid;
   SELECT name INTO pname FROM guild_people WHERE id=target AND guild_id=p_guild;
   IF pname IS NULL OR target=ANY(seen) THEN RAISE EXCEPTION '团员不属于当前公会或重复'; END IF;
   seen:=array_append(seen,target);
   IF r->>'status' IS NULL OR r->>'status' NOT IN ('出席','缺席','迟到','替补','请假') THEN RAISE EXCEPTION '考勤状态无效'; END IF;
   SELECT coalesce(array_agg(DISTINCT v::uuid),'{}') INTO chars FROM jsonb_array_elements_text(coalesce(r->'character_ids','[]')) v;
   IF EXISTS(SELECT 1 FROM unnest(chars) cid WHERE NOT EXISTS(SELECT 1 FROM raid_members WHERE id=cid AND guild_id=p_guild AND person_id=target) AND NOT EXISTS(SELECT 1 FROM guild_person_attendance old,jsonb_array_elements(old.characters) c WHERE old.activity_id=aid AND old.person_id=target AND c->>'id'=cid::text)) THEN RAISE EXCEPTION '参战角色不属于该团员'; END IF;
   IF r->>'status' IN ('缺席','请假') AND cardinality(chars)>0 THEN RAISE EXCEPTION '缺席或请假不能同时记录实际参战角色'; END IF;
   SELECT coalesce(jsonb_agg(coalesce((SELECT c FROM guild_person_attendance old,jsonb_array_elements(old.characters) c WHERE old.activity_id=aid AND old.person_id=target AND c->>'id'=cid::text LIMIT 1),(SELECT jsonb_build_object('id',id,'name',name,'server',coalesce(server,'')) FROM raid_members WHERE id=cid)) ORDER BY cid),'[]') INTO snapshot FROM unnest(chars) cid;
   INSERT INTO guild_person_attendance(activity_id,person_id,guild_id,person_name,status,characters,source,updated_by)
   VALUES(aid,target,p_guild,pname,r->>'status',snapshot,CASE WHEN mode='legacy' THEN 'legacy_conversion' WHEN p_body->>'source'='wcl' THEN 'wcl' ELSE 'manual' END,p_actor)
   ON CONFLICT(activity_id,person_id) DO UPDATE SET status=excluded.status,characters=excluded.characters,source=excluded.source,updated_by=p_actor,updated_at=now();
  END LOOP;
  UPDATE activities SET attendance_mode='person' WHERE id=aid;
 ELSE RAISE EXCEPTION '操作无效'; END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.req195_people_write(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.req195_people_write(uuid,uuid,text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.req195_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF current_user NOT IN ('postgres','supabase_admin','service_role') THEN
  IF TG_TABLE_NAME='raid_members' THEN
   IF (TG_OP='INSERT' AND NEW.person_id IS NOT NULL) OR (TG_OP='UPDATE' AND NEW.person_id IS DISTINCT FROM OLD.person_id) THEN RAISE EXCEPTION '团员关联请使用专用入口'; END IF;
  ELSE
   IF TG_OP='UPDATE' AND NEW.attendance_mode IS DISTINCT FROM OLD.attendance_mode THEN RAISE EXCEPTION '考勤口径请使用专用入口'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS req195_member_guard ON public.raid_members;
CREATE TRIGGER req195_member_guard BEFORE INSERT OR UPDATE ON public.raid_members FOR EACH ROW EXECUTE FUNCTION public.req195_identity_guard();
DROP TRIGGER IF EXISTS req195_activity_guard ON public.activities;
CREATE TRIGGER req195_activity_guard BEFORE INSERT OR UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.req195_identity_guard();
CREATE OR REPLACE FUNCTION public.req195_person_status_refresh() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_person uuid; new_person uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN old_person:=OLD.person_id; END IF;
 IF TG_OP<>'DELETE' THEN new_person:=NEW.person_id; END IF;
 UPDATE guild_people p SET status=CASE WHEN EXISTS(SELECT 1 FROM raid_members m WHERE m.person_id=p.id AND m.status NOT IN ('离队','inactive')) THEN 'active' ELSE 'inactive' END
 WHERE p.id=old_person OR p.id=new_person;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS req195_person_status_refresh ON public.raid_members;
CREATE TRIGGER req195_person_status_refresh AFTER INSERT OR UPDATE OF status,person_id OR DELETE ON public.raid_members FOR EACH ROW EXECUTE FUNCTION public.req195_person_status_refresh();
NOTIFY pgrst,'reload schema';
COMMIT;
