-- REQ-212 每个公会至多一张内部招募卡。联系方式随整卡仅供当前成员阅读。
-- 上线先备份公会、会籍、通知及其授权/策略；协调 SQL 与同版应用上线，随后回读权限和实际页面。
-- SQL 就绪后新页面可保存招募资料。已打开的旧版入会页面需要刷新，才能随加入请求传递邀请凭据。
-- 回滚时先备份招募卡，配套恢复应用版本，再按备份还原 guild_members、notifications 的原授权与通知策略。
-- 移除 req212_read_card、req212_save_card、req212_join_guild 三个 RPC 后移除招募卡表并刷新 PostgREST。
BEGIN;
CREATE TABLE IF NOT EXISTS public.guild_recruitment_cards (
    guild_id uuid PRIMARY KEY REFERENCES public.guilds(id) ON DELETE CASCADE,
    revision integer NOT NULL CHECK (revision > 0),
    card jsonb NOT NULL CHECK (jsonb_typeof(card) = 'object' AND octet_length(card::text) <= 98304)
);
ALTER TABLE public.guild_recruitment_cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guild_recruitment_cards FROM PUBLIC, anon, authenticated, service_role;

-- 入会前只核验已知邀请码或收件人自己的邀请。会籍与邀请的身份字段只由服务端写。
REVOKE INSERT ON public.guild_members FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE ON public.notifications FROM PUBLIC, anon, authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;
-- 旧版 02_rls 没有本人通知 UPDATE 策略；新版基线使用同一策略名。
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS req212_notification_mark_read ON public.notifications;
CREATE POLICY req212_notification_mark_read ON public.notifications AS RESTRICTIVE
    FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (is_read IS TRUE AND user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.req212_join_guild(
    p_guild uuid, p_user uuid, p_display_name text, p_invite_code text, p_invitation uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    membership uuid;
BEGIN
    IF (p_invite_code IS NULL) = (p_invitation IS NULL) OR p_user IS NULL THEN
        RAISE EXCEPTION '请使用有效邀请码或本人收到的邀请' USING ERRCODE = '42501';
    END IF;
    IF p_invite_code IS NOT NULL THEN
        PERFORM 1 FROM public.guilds WHERE id=p_guild AND invite_code=p_invite_code FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION '邀请码无效' USING ERRCODE = '42501'; END IF;
    ELSE
        UPDATE public.notifications SET is_read=true WHERE id=p_invitation AND user_id=p_user
            AND guild_id=p_guild AND type='guild_invite' AND is_read=false;
        IF NOT FOUND THEN RAISE EXCEPTION '邀请无效或已处理' USING ERRCODE = '42501'; END IF;
    END IF;
    INSERT INTO public.guild_members (guild_id, user_id, role, display_name)
        VALUES (p_guild, p_user, 'viewer', p_display_name)
        RETURNING id INTO membership;
    RETURN membership;
END;
$$;
REVOKE ALL ON FUNCTION public.req212_join_guild(uuid,uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.req212_join_guild(uuid,uuid,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.req212_read_card(p_guild uuid, p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    saved public.guild_recruitment_cards%ROWTYPE;
BEGIN
    PERFORM 1 FROM public.guild_members WHERE guild_id = p_guild AND user_id = p_user FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '仅本公会成员可查看招募资料' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO saved FROM public.guild_recruitment_cards WHERE guild_id = p_guild;
    RETURN jsonb_build_object('card', saved.card, 'revision', coalesce(saved.revision, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.req212_save_card(p_guild uuid, p_user uuid, p_revision integer, p_card jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    saved public.guild_recruitment_cards%ROWTYPE;
BEGIN
    PERFORM 1 FROM public.guild_members WHERE guild_id = p_guild AND user_id = p_user AND role = 'owner' FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '仅本公会会长可编辑招募资料' USING ERRCODE = '42501';
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
REVOKE ALL ON FUNCTION public.req212_read_card(uuid,uuid), public.req212_save_card(uuid,uuid,integer,jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.req212_read_card(uuid,uuid), public.req212_save_card(uuid,uuid,integer,jsonb)
    TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
