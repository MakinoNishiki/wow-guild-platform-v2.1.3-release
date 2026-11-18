-- REQ-203 网页家宅分享。独立于个人方案单。回滚前导出作品，再依次删除视图、函数、表。
BEGIN;
CREATE TABLE IF NOT EXISTS public.housing_builds (
    id uuid PRIMARY KEY,
    author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
    description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
    blueprint_code text NOT NULL CHECK (char_length(blueprint_code) BETWEEN 4 AND 512 AND blueprint_code ~ '^[A-Za-z0-9+/=_-]+$'),
    code_public boolean NOT NULL DEFAULT false,
    published boolean NOT NULL DEFAULT false,
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS housing_builds_gallery_idx ON public.housing_builds(updated_at DESC, id) WHERE published;
CREATE INDEX IF NOT EXISTS housing_builds_author_idx ON public.housing_builds(author_id, updated_at DESC, id);
ALTER TABLE public.housing_builds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.housing_builds FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.housing_builds TO service_role;

-- 公开读路径只提供下列字段。署名来自账号资料，缺失时使用公开昵称占位。
CREATE OR REPLACE VIEW public.housing_build_gallery WITH (security_barrier = true) AS
SELECT b.id, b.title, b.description, b.updated_at,
       coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'), ''), '魔兽玩家') AS author_name,
       CASE WHEN b.code_public THEN b.blueprint_code END AS blueprint_code
FROM public.housing_builds b JOIN auth.users u ON u.id = b.author_id
WHERE b.published;
REVOKE ALL ON public.housing_build_gallery FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.housing_build_gallery TO anon, authenticated, service_role;

-- 调用方是验证过网站会话的服务端。相同内容的重试幂等，旧版本不能覆盖另一端的编辑。
CREATE OR REPLACE FUNCTION public.save_housing_build(
    p_author uuid, p_id uuid, p_revision integer, p_title text, p_description text,
    p_code text, p_code_public boolean, p_published boolean
) RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    existing public.housing_builds%ROWTYPE;
BEGIN
    IF p_revision = 0 THEN
        INSERT INTO public.housing_builds(id, author_id, title, description, blueprint_code, code_public, published)
        VALUES(p_id, p_author, p_title, p_description, p_code, p_code_public, p_published)
        ON CONFLICT (id) DO NOTHING;
        IF FOUND THEN RETURN 1; END IF;
    END IF;
    SELECT * INTO existing FROM public.housing_builds WHERE id = p_id AND author_id = p_author FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '作品不可编辑'; END IF;
    IF (existing.title, existing.description, existing.blueprint_code, existing.code_public, existing.published)
       IS NOT DISTINCT FROM (p_title, p_description, p_code, p_code_public, p_published) THEN
        RETURN existing.revision;
    END IF;
    IF existing.revision <> p_revision THEN RAISE EXCEPTION '作品已更新，请重新打开后核对'; END IF;
    UPDATE public.housing_builds SET title=p_title, description=p_description, blueprint_code=p_code,
        code_public=p_code_public, published=p_published, revision=revision+1, updated_at=now()
    WHERE id=p_id AND author_id=p_author;
    RETURN existing.revision + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.save_housing_build(uuid,uuid,integer,text,text,text,boolean,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_housing_build(uuid,uuid,integer,text,text,text,boolean,boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
