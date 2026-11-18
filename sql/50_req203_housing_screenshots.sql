-- REQ-203 家宅作品截图、原码展示与一键复制。先执行 SQL49。
BEGIN;
ALTER TABLE public.housing_builds
    ALTER COLUMN blueprint_code DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS allow_copy boolean,
    ADD COLUMN IF NOT EXISTS image_ids uuid[] NOT NULL DEFAULT '{}';
-- 只迁移首次升级的行，重跑不改变作者后来选择的“公开但关闭按钮”。
UPDATE public.housing_builds SET allow_copy = code_public WHERE allow_copy IS NULL;
ALTER TABLE public.housing_builds
    ALTER COLUMN allow_copy SET DEFAULT false,
    ALTER COLUMN allow_copy SET NOT NULL,
    DROP CONSTRAINT IF EXISTS housing_builds_sharing_settings,
    ADD CONSTRAINT housing_builds_sharing_settings CHECK (
        (NOT code_public OR blueprint_code IS NOT NULL) AND (NOT allow_copy OR code_public)
        AND cardinality(image_ids) <= 4
    );

-- 列表只读有序 ID，下载图片时再取内容；作品删除时一起清理。
CREATE TABLE IF NOT EXISTS public.housing_build_images (
    id uuid PRIMARY KEY,
    build_id uuid NOT NULL REFERENCES public.housing_builds(id) ON DELETE CASCADE,
    jpeg bytea NOT NULL CHECK (octet_length(jpeg) BETWEEN 4 AND 179200)
);
CREATE INDEX IF NOT EXISTS housing_build_images_build_idx ON public.housing_build_images(build_id);
ALTER TABLE public.housing_build_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.housing_build_images FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON public.housing_build_images TO service_role;

CREATE OR REPLACE VIEW public.housing_build_gallery WITH (security_barrier = true) AS
SELECT b.id, b.title, b.description, b.updated_at,
       coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'), ''), '魔兽玩家') AS author_name,
       CASE WHEN b.code_public AND b.allow_copy THEN b.blueprint_code END AS blueprint_code,
       CASE WHEN b.code_public THEN b.blueprint_code END AS visible_code,
       b.code_public, b.allow_copy, b.image_ids
FROM public.housing_builds b JOIN auth.users u ON u.id = b.author_id
WHERE b.published;

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
    IF jsonb_typeof(p_screenshots) IS DISTINCT FROM 'array' OR jsonb_array_length(p_screenshots) > 4 THEN
        RAISE EXCEPTION '每件作品最多可上传四张截图';
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

-- 保留旧客户端的勾选语义。仅新版本认识的设置必须在新版编辑器中修改。
CREATE OR REPLACE FUNCTION public.save_housing_build(
    p_author uuid, p_id uuid, p_revision integer, p_title text, p_description text,
    p_code text, p_code_public boolean, p_published boolean
) RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    existing public.housing_builds%ROWTYPE;
BEGIN
    SELECT * INTO existing FROM public.housing_builds WHERE id=p_id AND author_id=p_author FOR UPDATE;
    IF FOUND AND (cardinality(existing.image_ids)>0 OR existing.code_public <> existing.allow_copy OR existing.blueprint_code IS NULL) THEN
        RAISE EXCEPTION '此作品使用新版展示设置，请刷新页面后编辑';
    END IF;
    RETURN public.save_housing_build_v2(p_author,p_id,p_revision,p_title,p_description,p_code,
        p_code_public,p_code_public,p_published,'[]'::jsonb);
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
