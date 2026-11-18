-- REQ-203 补丁2。依赖 SQL50，兼容四图客户端。保留原作品、截图顺序与访问权限。
-- 回退前检查是否存在超过四张的作品；如有则保留此兼容迁移和数据。
-- 如需恢复旧上限，在没有超过四张的作品时恢复 SQL50 的对应约束和 v2 保存函数。
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
ALTER TABLE public.housing_builds
    DROP CONSTRAINT housing_builds_sharing_settings,
    ADD CONSTRAINT housing_builds_sharing_settings CHECK (
        (NOT code_public OR blueprint_code IS NOT NULL) AND (NOT allow_copy OR code_public)
        AND cardinality(image_ids) <= 8
    );

CREATE OR REPLACE FUNCTION public.save_housing_build_v2(
    p_author uuid, p_id uuid, p_revision integer, p_title text, p_description text,
    p_code text, p_code_public boolean, p_allow_copy boolean, p_published boolean, p_screenshots jsonb
) RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    existing public.housing_builds%ROWTYPE;
    ids uuid[];
    photo jsonb;
    photo_id uuid;
    bytes bytea;
    created boolean := false;
    same_values boolean;
BEGIN
    IF jsonb_typeof(p_screenshots) IS DISTINCT FROM 'array' OR jsonb_array_length(p_screenshots) > 8 THEN
        RAISE EXCEPTION '每件作品最多可上传八张截图';
    END IF;
    ids := ARRAY(SELECT (s->>'id')::uuid FROM jsonb_array_elements(p_screenshots) s);
    IF cardinality(ids) <> (SELECT count(DISTINCT v) FROM unnest(ids) v) THEN
        RAISE EXCEPTION '截图编号缺失或重复';
    END IF;

    IF p_revision = 0 THEN
        INSERT INTO public.housing_builds(id, author_id, title, description, blueprint_code, code_public, allow_copy, published, image_ids)
        VALUES (p_id, p_author, p_title, p_description, p_code, p_code_public, p_allow_copy, p_published, ids)
        ON CONFLICT (id) DO NOTHING;
        created := FOUND;
    END IF;
    SELECT * INTO existing FROM public.housing_builds WHERE id=p_id AND author_id=p_author FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '作品不可编辑'; END IF;
    same_values := (existing.title, existing.description, existing.blueprint_code, existing.code_public, existing.allow_copy, existing.published, existing.image_ids)
        IS NOT DISTINCT FROM (p_title, p_description, p_code, p_code_public, p_allow_copy, p_published, ids);
    IF NOT same_values AND existing.revision <> p_revision THEN
        RAISE EXCEPTION '作品已更新，请重新打开后核对';
    END IF;

    -- 图片编号全局唯一且内容不可替换。网络重试可以携带原字节；
    -- 只传编号代表保留本作品现有图片，不能借用其他人的截图。
    FOR photo IN SELECT value FROM jsonb_array_elements(p_screenshots) LOOP
        photo_id := (photo->>'id')::uuid;
        IF photo ? 'data' THEN
            bytes := decode(photo->>'data', 'base64');
            INSERT INTO public.housing_build_images(id,build_id,jpeg) VALUES(photo_id,p_id,bytes)
            ON CONFLICT (id) DO NOTHING;
            IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.housing_build_images WHERE id=photo_id AND build_id=p_id AND jpeg=bytes) THEN
                RAISE EXCEPTION '截图已更改，请重新选择图片';
            END IF;
        ELSIF NOT EXISTS (SELECT 1 FROM public.housing_build_images WHERE id=photo_id AND build_id=p_id) THEN
            RAISE EXCEPTION '未找到作品的这张截图，请重新选择图片';
        END IF;
    END LOOP;
    IF created OR same_values THEN RETURN existing.revision; END IF;
    DELETE FROM public.housing_build_images WHERE build_id=p_id AND NOT (id=ANY(ids));
    UPDATE public.housing_builds SET title=p_title, description=p_description, blueprint_code=p_code,
        code_public=p_code_public, allow_copy=p_allow_copy, published=p_published, image_ids=ids,
        revision=revision+1, updated_at=now() WHERE id=p_id;
    RETURN existing.revision + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.save_housing_build_v2(uuid,uuid,integer,text,text,text,boolean,boolean,boolean,jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_housing_build_v2(uuid,uuid,integer,text,text,text,boolean,boolean,boolean,jsonb)
    TO service_role;

-- 公众目录只提供展示字段。两个旧原码列仅保留给滚动发布中的旧服务。
-- 新服务通过已发布且作者同时允许分享和复制的作品，单件取码。
REVOKE SELECT ON public.housing_build_gallery FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, title, description, updated_at, author_name, code_public, allow_copy, image_ids)
    ON public.housing_build_gallery TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
