-- REQ-190 全站共用一张表，以活动唯一。首次保存或发布才建行。
-- 预览不保存内容；已发布来源经重新核验确证失效，可仅暂停该版本的公开展示。
-- 回滚先导出本表（含内部修改历史），再删除函数、视图及表，最后通知 PostgREST。
BEGIN;
CREATE TABLE IF NOT EXISTS public.guild_battle_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id uuid NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
    activity_id uuid NOT NULL UNIQUE REFERENCES public.activities(id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status IN ('draft', 'published')),
    version integer NOT NULL CHECK (version > 0),
    snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
    activity_source jsonb NOT NULL,
    message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 500),
    published_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_actor uuid NOT NULL,
    last_request text NOT NULL,
    history jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(history)='array' AND jsonb_array_length(history)<=30),
    CHECK ((status = 'published') = (published_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS guild_battle_reports_public_idx ON public.guild_battle_reports
    (guild_id, published_at DESC, id) WHERE status = 'published';
ALTER TABLE public.guild_battle_reports ADD COLUMN IF NOT EXISTS evidence_invalidated boolean NOT NULL DEFAULT false;
ALTER TABLE public.guild_battle_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guild_battle_reports FROM PUBLIC, anon, authenticated, service_role;

-- 提取同一组原始列，以便保存事务及后续公开读均能察觉活动换团、取消、换日志。
CREATE OR REPLACE FUNCTION public.req190_activity_source(a public.activities)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
    SELECT jsonb_build_object('wcl_report_code', a.wcl_report_code, 'wcl_url', a.wcl_url,
           'team_label', a.team_label, 'raid', a.raid, 'status', a.status);
$$;
REVOKE ALL ON FUNCTION public.req190_activity_source(public.activities) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.req190_activity_source(public.activities) TO service_role;

-- 服务端通过此视图读。访客仅能使用带 published / verified 双重条件的专用端点。
CREATE OR REPLACE VIEW public.guild_battle_report_read WITH (security_barrier=true) AS
SELECT r.id, r.guild_id, g.name AS guild_name, r.activity_id, r.version, r.status,
       r.snapshot, r.message, r.published_at,
       CASE WHEN NOT r.evidence_invalidated AND a.status = 'normal' AND r.activity_source = public.req190_activity_source(a)
            THEN 'verified' ELSE 'changed' END AS evidence_status
FROM public.guild_battle_reports r
JOIN public.guilds g ON g.id = r.guild_id
JOIN public.activities a ON a.id = r.activity_id AND a.guild_id = r.guild_id;
REVOKE ALL ON public.guild_battle_report_read FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.guild_battle_report_read TO service_role;

-- 锁定成员身份与活动行，将授权、活动证据和单活动写入置于同一事务。
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
    PERFORM 1 FROM public.guild_members WHERE guild_id=p_guild AND user_id=p_user
        AND role IN ('owner','editor') FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION '仅本公会管理者可编辑战报' USING ERRCODE='42501'; END IF;
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
REVOKE ALL ON FUNCTION public.req190_save_report(uuid,uuid,uuid,integer,text,jsonb,jsonb,text,text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.req190_save_report(uuid,uuid,uuid,integer,text,jsonb,jsonb,text,text)
    TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
