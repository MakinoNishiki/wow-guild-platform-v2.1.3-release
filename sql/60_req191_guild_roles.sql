-- REQ-191. Apply after 45, 46, 47, 58 and 59 in the same release as the capability-aware server.
-- Before rollout export schema, grants, policies, touched functions and guild_members.
-- Rollback: restore the previous server and catalog definitions/grants from this backup.
-- Export guild_roles and membership assignments before removing the new column and table.
BEGIN;

CREATE TABLE IF NOT EXISTS public.guild_roles (
    guild_id uuid NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
    role_key text NOT NULL CHECK (role_key IN ('owner','editor','viewer') OR
        role_key ~ '^custom-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 16 AND name = btrim(name)),
    piece text NOT NULL CHECK (piece IN ('king','queen','rook','bishop','knight','pawn')),
    permissions jsonb NOT NULL CHECK (jsonb_typeof(permissions) = 'object'),
    revision integer NOT NULL CHECK (revision > 0),
    PRIMARY KEY (guild_id,role_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS guild_roles_name_uniq
    ON public.guild_roles (guild_id,lower(normalize(name,NFKC)));
ALTER TABLE public.guild_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guild_roles FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.guild_members ADD COLUMN IF NOT EXISTS custom_role_key text
    CHECK (custom_role_key IS NULL OR (custom_role_key LIKE 'custom-%' AND role='viewer'));
DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_constraint WHERE conname='guild_members_custom_role_fk'
                   AND conrelid='public.guild_members'::regclass) THEN
        ALTER TABLE public.guild_members ADD CONSTRAINT guild_members_custom_role_fk
            FOREIGN KEY (guild_id,custom_role_key) REFERENCES public.guild_roles(guild_id,role_key);
    END IF;
END $$;

-- Virtual base roles also serve newly created guilds. All 17 rights on a new custom role start disabled.
CREATE OR REPLACE FUNCTION public.req191_defaults(p_key text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
    SELECT jsonb_object_agg(action, CASE
      WHEN p_key='owner' THEN true
      WHEN p_key='editor' THEN action NOT IN ('wcl','settings','remove','claim-mode')
      WHEN p_key='viewer' THEN action IN ('submit','claim','stats')
      ELSE false END)
    FROM unnest(ARRAY['edit-card','wcl','video','publish','withdraw','submit','review','allocate','settings',
        'remove','claim-mode','claim','assign-claim','attendance','find-wcl','wishlist','stats']) AS keys(action)
$$;

CREATE OR REPLACE FUNCTION public.req191_catalog(p_guild uuid)
RETURNS TABLE (key text,name text,piece text,permissions jsonb,revision integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
    WITH bases(key,name,piece) AS (VALUES ('owner','会长','king'),('editor','公会编辑','knight'),('viewer','团员','pawn'))
    SELECT b.key,coalesce(r.name,b.name),b.piece,coalesce(r.permissions,public.req191_defaults(b.key)),coalesce(r.revision,0)
    FROM bases b LEFT JOIN public.guild_roles r ON r.guild_id=p_guild AND r.role_key=b.key
    UNION ALL
    SELECT r.role_key,r.name,r.piece,r.permissions,r.revision FROM public.guild_roles r
    WHERE r.guild_id=p_guild AND r.role_key LIKE 'custom-%'
$$;

CREATE OR REPLACE FUNCTION public.req191_has_permission(p_guild uuid,p_user uuid,p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
    SELECT coalesce((SELECT (coalesce(r.permissions,public.req191_defaults(coalesce(m.custom_role_key,m.role)))
                      ->>p_permission)::boolean
      FROM public.guild_members m LEFT JOIN public.guild_roles r
        ON r.guild_id=m.guild_id AND r.role_key=coalesce(m.custom_role_key,m.role)
      WHERE m.guild_id=p_guild AND m.user_id=p_user),false)
$$;

CREATE OR REPLACE FUNCTION public.req191_my_permission(p_guild uuid,p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
    SELECT public.req191_has_permission(p_guild,auth.uid(),p_permission)
$$;

CREATE OR REPLACE FUNCTION public.req191_read_roles(p_guild uuid,p_user uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE mine text;
BEGIN
    SELECT coalesce(custom_role_key,role) INTO mine FROM public.guild_members WHERE guild_id=p_guild AND user_id=p_user;
    IF mine IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='仅本公会成员可查看角色'; END IF;
    RETURN jsonb_build_object('ownRole',mine,'roles',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY CASE key WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 WHEN 'viewer' THEN 2 ELSE 3 END,name,key)
        FROM public.req191_catalog(p_guild) r
    ),'assignments',(
        SELECT jsonb_agg(jsonb_build_object('user_id',user_id,'key',coalesce(custom_role_key,role)) ORDER BY user_id)
        FROM public.guild_members WHERE guild_id=p_guild
    ));
END $$;

-- The guild row serializes default-name conflicts, concurrent saves and assignments.
CREATE OR REPLACE FUNCTION public.req191_lock_creator(p_guild uuid,p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
    PERFORM 1 FROM public.guilds g JOIN public.guild_members m ON m.guild_id=g.id AND m.user_id=g.owner_id
      WHERE g.id=p_guild AND g.owner_id=p_user AND m.role='owner' FOR UPDATE OF g FOR SHARE OF m;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='仅本会创建者可管理角色和分配成员'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.req191_save_role(p_guild uuid,p_user uuid,p_key text,p_name text,
    p_piece text,p_permissions jsonb,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
    target text := coalesce(p_key,'custom-'||gen_random_uuid()::text);
    prev record;
    saved_revision integer;
    predefined boolean := target IN ('owner','editor','viewer');
BEGIN
    PERFORM public.req191_lock_creator(p_guild,p_user);
    p_name := btrim(p_name);
    IF p_name IS NULL OR char_length(p_name) NOT BETWEEN 1 AND 16 OR p_name ~ '[[:cntrl:]]'
       OR p_piece IS NULL OR p_piece NOT IN ('king','queen','rook','bishop','knight','pawn')
       OR p_revision IS NULL OR p_revision NOT BETWEEN 0 AND 2147483646 OR (NOT predefined AND
          target !~ '^custom-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
       OR (predefined AND p_piece IS DISTINCT FROM CASE target WHEN 'owner' THEN 'king' WHEN 'editor' THEN 'knight' ELSE 'pawn' END)
       OR jsonb_typeof(p_permissions) IS DISTINCT FROM 'object' THEN
       RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='角色名称、棋子或版本无效';
    END IF;
    IF (SELECT count(*) FROM jsonb_each(p_permissions)) <> 17 OR EXISTS (
       SELECT 1 FROM jsonb_each(p_permissions) v WHERE jsonb_typeof(v.value)<>'boolean'
           OR NOT (public.req191_defaults(target) ? v.key)) THEN
       RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='请提交完整的角色权限配置';
    END IF;
    SELECT * INTO prev FROM public.req191_catalog(p_guild) WHERE key=target;
    IF FOUND AND prev.revision=p_revision+1 AND prev.name=p_name AND prev.piece=p_piece AND prev.permissions=p_permissions THEN
        RETURN jsonb_build_object('ok',true,'key',target,'revision',prev.revision);
    END IF;
    IF coalesce(prev.revision,0)<>p_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='角色已被修改，请刷新后重试'; END IF;
    IF EXISTS (SELECT FROM public.req191_catalog(p_guild) r WHERE r.key<>target AND
                lower(normalize(r.name,NFKC))=lower(normalize(p_name,NFKC))) THEN
        RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='公会中已有同名角色';
    END IF;
    INSERT INTO public.guild_roles(guild_id,role_key,name,piece,permissions,revision)
        VALUES(p_guild,target,p_name,p_piece,p_permissions,p_revision+1)
        ON CONFLICT (guild_id,role_key) DO UPDATE SET name=excluded.name,piece=excluded.piece,
            permissions=excluded.permissions,revision=excluded.revision RETURNING revision INTO saved_revision;
    RETURN jsonb_build_object('ok',true,'key',target,'revision',saved_revision);
END $$;

CREATE OR REPLACE FUNCTION public.req191_assign_role(p_guild uuid,p_user uuid,p_membership uuid,p_key text,p_expected text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member public.guild_members%ROWTYPE;
BEGIN
    PERFORM public.req191_lock_creator(p_guild,p_user);
    SELECT * INTO member FROM public.guild_members WHERE id=p_membership AND guild_id=p_guild FOR UPDATE;
    IF NOT FOUND OR member.user_id=p_user OR member.role='owner' OR p_key='owner' THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='该成员无法分配此角色';
    END IF;
    IF p_expected IS NULL OR NOT EXISTS(SELECT FROM public.req191_catalog(p_guild) WHERE key=p_key) THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='公会角色或原身份无效';
    END IF;
    IF p_key=coalesce(member.custom_role_key,member.role) THEN RETURN jsonb_build_object('ok',true); END IF;
    IF coalesce(member.custom_role_key,member.role)<>p_expected THEN
        RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='成员身份已变化，请刷新后再分配';
    END IF;
    UPDATE public.guild_members SET role=CASE WHEN p_key='editor' THEN 'editor' ELSE 'viewer' END,
        custom_role_key=CASE WHEN p_key LIKE 'custom-%' THEN p_key END WHERE id=p_membership;
    RETURN jsonb_build_object('ok',true);
END $$;

REVOKE ALL ON FUNCTION public.req191_defaults(text),public.req191_catalog(uuid),
    public.req191_has_permission(uuid,uuid,text),public.req191_my_permission(uuid,text),public.req191_lock_creator(uuid,uuid),
    public.req191_read_roles(uuid,uuid),public.req191_save_role(uuid,uuid,text,text,text,jsonb,integer),
    public.req191_assign_role(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.req191_has_permission(uuid,uuid,text),public.req191_read_roles(uuid,uuid),
    public.req191_save_role(uuid,uuid,text,text,text,jsonb,integer),public.req191_assign_role(uuid,uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.req191_my_permission(uuid,text) TO authenticated;

-- Every production business write goes through the trusted application proxy. Historic editor RLS
-- must never permit a disallowed edit via a direct REST write. Membership SELECT is preserved.
DO $$
DECLARE tbl text; cols text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['guilds','guild_members','raid_members','activities','activity_attendance','loots',
      'loot_records','wishlists','claim_requests','loot_drops','guild_invite_codes','deleted_raid_members'] LOOP
    IF to_regclass('public.'||tbl) IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES ON public.%I FROM PUBLIC,anon,authenticated',tbl);
      SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute
        WHERE attrelid=to_regclass('public.'||tbl) AND attnum>0 AND NOT attisdropped;
      EXECUTE format('REVOKE INSERT (%s),UPDATE (%s),REFERENCES (%s) ON public.%I FROM PUBLIC,anon,authenticated',cols,cols,cols,tbl);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS loot_observations_read ON public.loot_drop_observations;
CREATE POLICY loot_observations_read ON public.loot_drop_observations FOR SELECT TO authenticated USING (
    public.is_guild_member(guild_id) AND (submitter_user_id=auth.uid() OR public.req191_my_permission(guild_id,'review'))
);
DROP POLICY IF EXISTS req199_read ON public.loot_event_evidence;
CREATE POLICY req199_read ON public.loot_event_evidence FOR SELECT TO authenticated USING (
    public.is_guild_member(guild_id) AND (submitter_user_id=auth.uid() OR public.req191_my_permission(guild_id,'review'))
);
DROP POLICY IF EXISTS claim_requests_select_editor ON public.claim_requests;
CREATE POLICY claim_requests_select_editor ON public.claim_requests FOR SELECT TO authenticated
   USING (public.req191_my_permission(guild_id,'assign-claim'));

-- Lock the guild metadata and the user's active membership while a write RPC makes its decision.
CREATE OR REPLACE FUNCTION public.req191_lock_member(p_guild uuid,p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
    PERFORM 1 FROM public.guilds g JOIN public.guild_members m ON m.guild_id=g.id
        WHERE g.id=p_guild AND m.user_id=p_user FOR SHARE OF g,m;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='仅本公会成员可办理此操作'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.req191_lock_member(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.req191_lock_member(uuid,uuid) TO service_role;

-- Carry forward the previous transaction bodies, changing only the authorization at each write.

CREATE OR REPLACE FUNCTION public.req191_submit_loot(p_guild uuid,p_user uuid,p_activity uuid,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r jsonb; old public.loot_drop_observations; d public.loot_drops; ids uuid[]; did uuid; eligible boolean;
  v_new int:=0; v_merged int:=0; v_repeat int:=0; v_ignored int:=0; out_ids jsonb:='[]'; reason text;
BEGIN
  -- Fresh membership check inside the same transaction; HTTP cache never grants final write rights.
    PERFORM public.req191_lock_member(p_guild,p_user);
    IF NOT public.req191_has_permission(p_guild,p_user,'submit') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='当前公会身份没有此操作权限'; END IF;
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
    PERFORM public.req191_lock_member(p_guild,p_user);
    IF NOT public.req191_has_permission(p_guild,p_user,'review') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='当前公会身份没有此操作权限'; END IF;
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

CREATE OR REPLACE FUNCTION public.req195_people_write(p_actor uuid,p_guild uuid,p_action text,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE member_row record; r jsonb; target uuid; aid uuid; ids uuid[]; chars uuid[]; snapshot jsonb; mode text; pname text; seen uuid[]:='{}';
BEGIN
 -- Serialize relationship changes and attendance snapshots within one guild.
 PERFORM 1 FROM guilds WHERE id=p_guild FOR UPDATE;
    PERFORM public.req191_lock_member(p_guild,p_actor);
    IF NOT public.req191_has_permission(p_guild,p_actor,CASE WHEN p_action='link' THEN 'assign-claim' ELSE 'attendance' END) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='当前公会身份没有此操作权限'; END IF;
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

create or replace function public.req199_submit_loot(p_guild uuid,p_user uuid,p_activity uuid,p_rows jsonb,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb; prior public.loot_event_evidence; receipt jsonb; n integer:=0;
begin
    PERFORM public.req191_lock_member(p_guild,p_user);
    IF NOT public.req191_has_permission(p_guild,p_user,'submit') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='当前公会身份没有此操作权限'; END IF;
 if jsonb_typeof(p_rows)<>'array' or jsonb_typeof(p_evidence)<>'array' or jsonb_array_length(p_rows)>200 or jsonb_array_length(p_evidence)>500 then raise exception '提交批次无效'; end if;
 perform pg_advisory_xact_lock(hashtextextended('req191:'||p_guild::text,0));
 if jsonb_array_length(p_rows)>0 then
   receipt:=req191_submit_loot(p_guild,p_user,p_activity,p_rows);
 else
   receipt:=jsonb_build_object('ids','[]'::jsonb,'created',0,'merged',0,'repeated',0,'ignored',0);
 end if;
 for r in select value from jsonb_array_elements(p_evidence) loop
   select * into prior from loot_event_evidence where guild_id=p_guild and collector_source_id=r->>'collector_source_id' and source_event_id=r->>'source_event_id';
   if found then
     if prior.content_hash<>r->>'content_hash' then raise exception '同一观察事件内容冲突，请保留原文核对'; end if;
   else
     insert into loot_event_evidence(guild_id,submitter_user_id,collector_source_id,source_event_id,kind,content_hash,payload)
     values(p_guild,p_user,r->>'collector_source_id',r->>'source_event_id',r->>'kind',r->>'content_hash',r->'payload');
     n:=n+1;
   end if;
 end loop;
 return receipt||jsonb_build_object('evidenceSaved',n,'evidenceCount',jsonb_array_length(p_evidence));
end;$$;

CREATE OR REPLACE FUNCTION public.req212_save_card(p_guild uuid, p_user uuid, p_revision integer, p_card jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    saved public.guild_recruitment_cards%ROWTYPE;
BEGIN
    PERFORM public.req191_lock_member(p_guild,p_user);
    IF NOT public.req191_has_permission(p_guild,p_user,'edit-card') THEN
        RAISE EXCEPTION '当前公会身份无权编辑招募资料' USING ERRCODE = '42501';
    END IF;
    IF p_revision IS NULL OR p_revision < 0 OR p_revision >= 2147483647 OR
       jsonb_typeof(p_card) IS DISTINCT FROM 'object' OR octet_length(p_card::text) > 98304 THEN
        RAISE EXCEPTION '招募卡内容或修订号无效' USING ERRCODE = '22023';
    END IF;
    IF p_revision = 0 THEN
        INSERT INTO public.guild_recruitment_cards (guild_id, revision, card)
            VALUES (p_guild, 1, p_card) ON CONFLICT (guild_id) DO NOTHING;
    END IF;
    SELECT * INTO saved FROM public.guild_recruitment_cards WHERE guild_id = p_guild FOR UPDATE;
    -- 首次创建以及刚完成同一次提交但客户端未收到响应时，都返回同一修订。
    IF saved.revision = p_revision + 1 AND saved.card = p_card THEN
        RETURN jsonb_build_object('card', saved.card, 'revision', saved.revision);
    END IF;
    IF saved.revision IS DISTINCT FROM p_revision THEN
        RAISE EXCEPTION '其他页面已保存新版本，请重新读取后再修改' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.guild_recruitment_cards SET card = p_card, revision = revision + 1
        WHERE guild_id = p_guild RETURNING * INTO saved;
    RETURN jsonb_build_object('card', saved.card, 'revision', saved.revision);
END;
$$;

CREATE OR REPLACE FUNCTION public.req191_fight_annotations(p_snapshot jsonb,p_field text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
    SELECT coalesce(jsonb_object_agg(k->>'fightId',k->p_field),'{}'::jsonb)
    FROM jsonb_array_elements(p_snapshot->'kills') kills(k)
    WHERE jsonb_typeof(k->p_field)='array' AND k->p_field<>'[]'::jsonb
$$;
REVOKE ALL ON FUNCTION public.req191_fight_annotations(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.req190_save_report(
    p_guild uuid, p_activity uuid, p_user uuid, p_version integer, p_action text,
    p_source jsonb, p_snapshot jsonb, p_message text, p_request text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    activity public.activities%ROWTYPE;
    previous public.guild_battle_reports%ROWTYPE;
    new_status text;
    changes text[];
    recent_history jsonb;
BEGIN
    IF p_version IS NULL OR p_version < 0 OR p_action IS NULL OR p_action NOT IN ('draft','publish','withdraw','invalidate')
        OR p_request IS NULL OR p_request !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION '战报操作无效' USING ERRCODE = '22023';
    END IF;
    PERFORM public.req191_lock_member(p_guild,p_user);
    IF NOT (CASE p_action
        WHEN 'publish' THEN public.req191_has_permission(p_guild,p_user,'publish')
        WHEN 'withdraw' THEN public.req191_has_permission(p_guild,p_user,'withdraw')
        ELSE public.req191_has_permission(p_guild,p_user,'video') OR public.req191_has_permission(p_guild,p_user,'publish')
      END) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='当前公会身份无权执行本次战报操作'; END IF;
    SELECT * INTO activity FROM public.activities WHERE id=p_activity AND guild_id=p_guild FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '此活动不属于当前公会'; END IF;
    IF p_action IN ('draft','publish') THEN
        IF activity.status IS DISTINCT FROM 'normal' OR public.req190_activity_source(activity) IS DISTINCT FROM p_source
            OR nullif(btrim(concat(activity.wcl_report_code,activity.wcl_url)), '') IS NULL THEN
            RAISE EXCEPTION '活动或日志已变更，请重新预览';
        END IF;
        IF jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object'
            OR jsonb_typeof(p_snapshot->'kills') IS DISTINCT FROM 'array' OR p_message IS NULL
            OR char_length(p_message) > 500 THEN
            RAISE EXCEPTION '战报内容无效' USING ERRCODE='22023';
        END IF;
        IF jsonb_array_length(p_snapshot->'kills') = 0 THEN RAISE EXCEPTION '未核实有效击杀'; END IF;
    END IF;
    new_status := CASE WHEN p_action IN ('publish','invalidate') THEN 'published' ELSE 'draft' END;
    SELECT * INTO previous FROM public.guild_battle_reports WHERE guild_id=p_guild AND activity_id=p_activity FOR UPDATE;
    IF p_action IN ('draft','publish') AND NOT public.req191_has_permission(p_guild,p_user,'video')
        AND public.req191_fight_annotations(p_snapshot,'videos') IS DISTINCT FROM public.req191_fight_annotations(previous.snapshot,'videos') THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='当前公会身份无权编辑击杀录像';
    END IF;
    IF p_action='draft' AND NOT public.req191_has_permission(p_guild,p_user,'publish') AND
       (p_message IS DISTINCT FROM coalesce(previous.message,'') OR
        public.req191_fight_annotations(p_snapshot,'honors') IS DISTINCT FROM public.req191_fight_annotations(previous.snapshot,'honors')) THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='编辑战报寄语与成就需要战报发布权限';
    END IF;
    -- 仅服务端确认为原来源失效时执行。并行的旧核验不能影响已重发、撤回或换来源的版本。
    IF p_action='invalidate' AND (NOT FOUND OR previous.status<>'published' OR previous.evidence_invalidated
        OR previous.version<>p_version OR previous.id::text IS DISTINCT FROM p_source->>'reportId'
        OR nullif(p_source->>'reportCode','') IS NULL
        OR previous.snapshot->>'reportCode' IS DISTINCT FROM p_source->>'reportCode') THEN RETURN 0; END IF;
    IF NOT FOUND THEN
        IF p_action='withdraw' OR p_version<>0 THEN RAISE EXCEPTION '战报不存在，请重新打开'; END IF;
        INSERT INTO public.guild_battle_reports
            (guild_id,activity_id,status,version,snapshot,activity_source,message,published_at,last_actor,last_request)
        VALUES (p_guild,p_activity,new_status,1,p_snapshot,p_source,p_message,
                CASE WHEN new_status='published' THEN now() END,p_user,p_request);
        RETURN 1;
    END IF;
    -- 上次相同请求的响应丢失可安全重试；之后发生过任何一次编辑则报版本冲突。
    IF previous.last_request=p_request AND previous.last_actor=p_user AND previous.version=p_version+1 THEN
        RETURN previous.version;
    END IF;
    IF previous.version<>p_version THEN RAISE EXCEPTION '战报已由其他操作更新，请重新打开后核对'; END IF;
    IF previous.status='published' AND p_action='draft' THEN RAISE EXCEPTION '请先明确撤回已发布战报'; END IF;
    IF previous.status<>'published' AND p_action='withdraw' THEN RAISE EXCEPTION '战报当前未发布'; END IF;

    -- 每场只留一份击杀明细。历史最多 30 次，仅记旧版本的来源、击杀数及本次改动项。
    changes := array_remove(ARRAY[
        CASE WHEN new_status <> previous.status THEN 'status' END,
        CASE WHEN p_action='invalidate' OR (p_action='publish' AND previous.evidence_invalidated) THEN 'evidenceStatus' END,
        CASE WHEN p_action IN ('draft','publish') AND p_message <> previous.message THEN 'message' END,
        CASE WHEN p_action IN ('draft','publish') AND p_source <> previous.activity_source THEN 'activitySource' END,
        CASE WHEN p_action IN ('draft','publish') AND (p_snapshot - 'verifiedAt') <> (previous.snapshot - 'verifiedAt')
             THEN 'evidence' END], NULL);
    SELECT coalesce(jsonb_agg(entry ORDER BY seq),'[]'::jsonb) INTO recent_history
      FROM jsonb_array_elements(previous.history) WITH ORDINALITY AS h(entry,seq)
      WHERE seq > jsonb_array_length(previous.history)-29;
    UPDATE public.guild_battle_reports SET status=new_status, version=version+1,
        evidence_invalidated=(p_action='invalidate'),
        snapshot=CASE WHEN p_action IN ('withdraw','invalidate') THEN previous.snapshot ELSE p_snapshot END,
        activity_source=CASE WHEN p_action IN ('withdraw','invalidate') THEN previous.activity_source ELSE p_source END,
        message=CASE WHEN p_action IN ('withdraw','invalidate') THEN previous.message ELSE p_message END,
        published_at=CASE WHEN p_action='invalidate' THEN previous.published_at WHEN new_status='published' THEN now() END,
        updated_at=now(), last_actor=p_user, last_request=p_request,
        history=recent_history || jsonb_build_array(jsonb_build_object('version',previous.version,
            'status',previous.status,'actor',previous.last_actor,'at',previous.updated_at,
            'reportCode',previous.snapshot->>'reportCode','sourceRevision',previous.snapshot->'sourceRevision',
            'verifiedAt',previous.snapshot->>'verifiedAt',
            'kills',jsonb_array_length(previous.snapshot->'kills'),'changedFields',changes))
    WHERE id=previous.id;
    RETURN previous.version+1;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
