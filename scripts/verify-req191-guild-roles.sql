-- Run only against an isolated PostgreSQL database after SQL60. The QA runner sets
-- wb.test_environment='isolated'. All fixture rows and changes roll back together.
BEGIN;
DO $test$
DECLARE
    guild uuid:=gen_random_uuid(); other_guild uuid:=gen_random_uuid();
    creator uuid:=gen_random_uuid(); editor uuid:=gen_random_uuid(); viewer uuid:=gen_random_uuid();
    stranger uuid:=gen_random_uuid(); reader uuid:=gen_random_uuid(); slot_id uuid:=gen_random_uuid();
    owner_slot uuid:=gen_random_uuid(); other_slot uuid:=gen_random_uuid(); res jsonb; cfg jsonb; outcome jsonb;
    role_key text:='custom-'||gen_random_uuid(); empty_grants jsonb:=public.req191_defaults('custom');
    aid uuid:=gen_random_uuid(); source jsonb; snap jsonb:='{"kills":[{"fightId":1}]}';
BEGIN
    IF current_setting('wb.test_environment',true) IS DISTINCT FROM 'isolated' THEN
        RAISE EXCEPTION 'Requires isolated fixture database';
    END IF;
    INSERT INTO auth.users(id) VALUES(creator),(editor),(viewer),(stranger),(reader);
    INSERT INTO public.guilds(id,owner_id,name,invite_code) VALUES(guild,creator,'角色测试',guild::text),(other_guild,stranger,'第二公会',other_guild::text);
    INSERT INTO public.guild_members(id,guild_id,user_id,role) VALUES
      (owner_slot,guild,creator,'owner'),(gen_random_uuid(),guild,editor,'editor'),(slot_id,guild,viewer,'viewer'),
      (other_slot,other_guild,stranger,'owner'),(gen_random_uuid(),guild,reader,'viewer');
    SET LOCAL ROLE service_role;
    ASSERT jsonb_array_length(public.req191_read_roles(guild,viewer)->'roles')=3;
    ASSERT public.req191_has_permission(guild,editor,'edit-card') AND NOT public.req191_has_permission(guild,editor,'wcl');
    ASSERT public.req191_has_permission(guild,viewer,'claim') AND NOT public.req191_has_permission(guild,stranger,'stats');
    PERFORM public.req212_save_card(guild,editor,0,'{}');
    BEGIN PERFORM public.req212_save_card(guild,viewer,1,'{"x":1}'); RAISE EXCEPTION 'viewer wrote card'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.req191_read_roles(guild,stranger); RAISE EXCEPTION 'cross guild read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.req191_save_role(guild,editor,role_key,'考勤员','rook',empty_grants,0); RAISE EXCEPTION 'editor created roles'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.req191_save_role(guild,creator,role_key,'会长','rook',empty_grants,0); RAISE EXCEPTION 'virtual name collision'; EXCEPTION WHEN unique_violation THEN NULL; END;
    BEGIN PERFORM public.req191_save_role(guild,creator,role_key,'考勤员','rook',empty_grants||'{"configure":true}',0); RAISE EXCEPTION 'unexpected permission'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    outcome:=public.req191_save_role(guild,creator,role_key,'考勤员','rook',empty_grants,0);
    ASSERT (outcome->>'revision')::integer=1;
    ASSERT public.req191_save_role(guild,creator,role_key,'考勤员','rook',empty_grants,0)=outcome;
    cfg:=empty_grants||'{"attendance":true}';
    PERFORM public.req191_save_role(guild,creator,role_key,'考勤员','queen',cfg,1);
    BEGIN PERFORM public.req191_save_role(guild,creator,role_key,'过期命名','rook',cfg,1); RAISE EXCEPTION 'stale save'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
    BEGIN PERFORM public.req191_assign_role(guild,creator,other_slot,role_key,'viewer'); RAISE EXCEPTION 'assigned cross-guild membership'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.req191_assign_role(guild,creator,owner_slot,role_key,'owner'); RAISE EXCEPTION 'owner reassignment'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.req191_assign_role(guild,creator,slot_id,'owner','viewer'); RAISE EXCEPTION 'owner assignment'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.req191_assign_role(guild,creator,slot_id,role_key,'editor'); RAISE EXCEPTION 'stale assignment'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
    PERFORM public.req191_assign_role(guild,creator,slot_id,role_key,'viewer');
    ASSERT public.req191_has_permission(guild,viewer,'attendance') AND NOT public.req191_has_permission(guild,viewer,'stats');
    ASSERT public.req191_read_roles(guild,viewer)->>'ownRole'=role_key;
    PERFORM public.req195_people_write(viewer,guild,'ensure','{}');
    BEGIN PERFORM public.req195_people_write(viewer,guild,'link','{}'); RAISE EXCEPTION 'attendance granted roster access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.req199_submit_loot(guild,viewer,NULL,'[]','[]'); RAISE EXCEPTION 'custom submit'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    PERFORM public.req199_submit_loot(guild,reader,NULL,'[]','[]');
    cfg:=empty_grants||'{"video":true}';
    PERFORM public.req191_save_role(guild,creator,role_key,'录像员','bishop',cfg,2);
    ASSERT NOT public.req191_has_permission(guild,viewer,'attendance') AND public.req191_has_permission(guild,viewer,'video');
    INSERT INTO public.activities(id,guild_id,name,activity_date,wcl_report_code,status)
        VALUES(aid,guild,'隔离战报测试',current_date,'abcdefghijklmnop','normal');
    SELECT public.req190_activity_source(a) INTO source FROM public.activities a WHERE a.id=aid;
    ASSERT public.req190_save_report(guild,aid,viewer,0,'draft',source,snap,'',repeat('a',64))=1;
    BEGIN PERFORM public.req190_save_report(guild,aid,viewer,1,'draft',source,snap,'私自修改',repeat('b',64)); RAISE EXCEPTION 'video changed message'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.req190_save_report(guild,aid,viewer,1,'publish',source,snap,'',repeat('b',64)); RAISE EXCEPTION 'video published'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    PERFORM public.req191_save_role(guild,creator,role_key,'发布员','bishop',empty_grants||'{"publish":true}',3);
    BEGIN PERFORM public.req190_save_report(guild,aid,viewer,1,'publish',source,'{"kills":[{"fightId":1,"videos":[{"url":"example"}]}]}','',repeat('b',64)); RAISE EXCEPTION 'publish edited video'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    ASSERT public.req190_save_report(guild,aid,viewer,1,'publish',source,snap,'正式发布',repeat('c',64))=2;
    BEGIN PERFORM public.req190_save_report(guild,aid,viewer,2,'withdraw',NULL,NULL,'',repeat('d',64)); RAISE EXCEPTION 'publish withdrew'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    PERFORM public.req191_assign_role(guild,creator,slot_id,'editor',role_key);
    ASSERT (SELECT role='editor' AND custom_role_key IS NULL FROM public.guild_members WHERE id=slot_id);
    ASSERT NOT has_table_privilege('authenticated','public.guild_roles','UPDATE') AND NOT has_table_privilege('authenticated','public.activities','UPDATE');
    ASSERT NOT has_column_privilege('authenticated','public.guild_members','custom_role_key','UPDATE');
    ASSERT NOT has_function_privilege('authenticated','public.req191_assign_role(uuid,uuid,uuid,text,text)','EXECUTE');
    ASSERT NOT has_function_privilege('anon','public.req191_read_roles(uuid,uuid)','EXECUTE');
    ASSERT has_function_privilege('service_role','public.req191_save_role(uuid,uuid,text,text,text,jsonb,integer)','EXECUTE');
END $test$;
ROLLBACK;
