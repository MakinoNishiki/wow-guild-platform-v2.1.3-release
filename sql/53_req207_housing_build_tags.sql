-- REQ-207。依赖 SQL51。存量作品取得两份空标签，旧版本继续沿原 RPC 写入。
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
ALTER TABLE public.housing_builds
  ADD COLUMN IF NOT EXISTS preset_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custom_tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.housing_builds
  DROP CONSTRAINT IF EXISTS housing_builds_tag_limits,
  ADD CONSTRAINT housing_builds_tag_limits CHECK (
    cardinality(preset_tags) <= 6 AND cardinality(custom_tags) <= 3
  );

-- 不覆盖后续版本在视图尾部追加的字段。
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.housing_build_gallery'::regclass
      AND attname = 'custom_tags' AND NOT attisdropped) THEN
    CREATE OR REPLACE VIEW public.housing_build_gallery WITH (security_barrier = true) AS
      SELECT b.id, b.title, b.description, b.updated_at,
        coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'), ''), '魔兽玩家') AS author_name,
        CASE WHEN b.code_public AND b.allow_copy THEN b.blueprint_code END AS blueprint_code,
        CASE WHEN b.code_public THEN b.blueprint_code END AS visible_code,
        b.code_public, b.allow_copy, b.image_ids, b.preset_tags, b.custom_tags
      FROM public.housing_builds b JOIN auth.users u ON u.id = b.author_id WHERE b.published;
  END IF;
END;
$migration$;
GRANT SELECT(preset_tags, custom_tags) ON public.housing_build_gallery TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_housing_build_v3(
  p_author uuid, p_id uuid, p_revision integer, p_title text, p_description text,
  p_code text, p_code_public boolean, p_allow_copy boolean, p_published boolean,
  p_screenshots jsonb, p_preset_tags text[], p_custom_tags text[]
) RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  existing public.housing_builds%ROWTYPE;
  tags_changed boolean;
  result integer;
BEGIN
  IF p_preset_tags IS NULL OR p_custom_tags IS NULL OR cardinality(p_preset_tags) > 6
      OR cardinality(p_custom_tags) > 3 OR coalesce(array_ndims(p_preset_tags),1) <> 1
      OR coalesce(array_ndims(p_custom_tags),1) <> 1 THEN
    RAISE EXCEPTION '每件作品最多可选 6 个预设标签和 3 个自定义标签';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_preset_tags || p_custom_tags) tag
       WHERE tag IS NULL OR tag ~ '^[[:space:]]|[[:space:]]$|[[:cntrl:]]' OR char_length(tag) NOT BETWEEN 1 AND 20)
      OR cardinality(p_custom_tags) <> (SELECT count(DISTINCT t) FROM unnest(p_custom_tags) t)
      OR cardinality(p_preset_tags) <> (SELECT count(DISTINCT t) FROM unnest(p_preset_tags) t) THEN
    RAISE EXCEPTION '作品标签格式有误或重复';
  END IF;
  -- 先用完整的初值抢占新作品 id，再锁行。并发首次提交和相同请求重试共用此锁。
  IF p_revision = 0 THEN
    INSERT INTO public.housing_builds(id, author_id, title, description, blueprint_code,
        code_public, allow_copy, published, image_ids, preset_tags, custom_tags)
      VALUES(p_id, p_author, p_title, p_description, p_code, p_code_public, p_allow_copy, p_published,
        ARRAY(SELECT (s->>'id')::uuid FROM jsonb_array_elements(p_screenshots) s), p_preset_tags, p_custom_tags)
      ON CONFLICT (id) DO NOTHING;
  END IF;
  SELECT * INTO existing FROM public.housing_builds WHERE id=p_id AND author_id=p_author FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '作品不可编辑'; END IF;
  tags_changed := (existing.preset_tags,existing.custom_tags) IS DISTINCT FROM (p_preset_tags,p_custom_tags);
  IF tags_changed AND existing.revision <> p_revision THEN
    RAISE EXCEPTION '作品已更新，请重新打开后核对';
  END IF;
  result := public.save_housing_build_v2(p_author,p_id,p_revision,p_title,p_description,
      p_code,p_code_public,p_allow_copy,p_published,p_screenshots);
  IF tags_changed THEN
    result := greatest(result, existing.revision + 1);
    UPDATE public.housing_builds SET preset_tags=p_preset_tags, custom_tags=p_custom_tags,
        revision=result, updated_at=now() WHERE id=p_id;
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.save_housing_build_v3(uuid,uuid,integer,text,text,text,boolean,boolean,boolean,jsonb,text[],text[])
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_housing_build_v3(uuid,uuid,integer,text,text,text,boolean,boolean,boolean,jsonb,text[],text[])
    TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
