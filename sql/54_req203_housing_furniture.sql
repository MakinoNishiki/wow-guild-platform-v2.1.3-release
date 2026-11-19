-- REQ-203：作者自愿家具用量、读者私有本次可用量。依赖 SQL53。
-- 回退：先停止新接口，备份新增字段/表及当前视图定义；旧 v2/v3 仍可写且保留清单。
-- 业务回退无需删数据；不自动删除用户已保存的清单或可用量。
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

CREATE OR REPLACE FUNCTION public.valid_housing_furniture(p_items jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE entry jsonb; seen integer[] := '{}'; rid integer;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(p_items)>500 THEN RETURN false; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR jsonb_typeof(entry->'record_id') IS DISTINCT FROM 'number'
        OR jsonb_typeof(entry->'quantity') IS DISTINCT FROM 'number'
        OR entry - ARRAY['record_id','quantity'] <> '{}'::jsonb THEN RETURN false; END IF;
    IF (entry->>'record_id')::numeric NOT BETWEEN 1 AND 2147483647 OR (entry->>'record_id')::numeric <> trunc((entry->>'record_id')::numeric)
        OR (entry->>'quantity')::numeric NOT BETWEEN 1 AND 9999 OR (entry->>'quantity')::numeric <> trunc((entry->>'quantity')::numeric) THEN RETURN false; END IF;
    rid := (entry->>'record_id')::integer;
    IF rid=ANY(seen) THEN RETURN false; END IF;
    seen := array_append(seen,rid);
  END LOOP;
  RETURN true;
END;
$$;
ALTER TABLE public.housing_builds ADD COLUMN IF NOT EXISTS furniture_items jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.housing_builds DROP CONSTRAINT IF EXISTS housing_builds_furniture_valid,
  ADD CONSTRAINT housing_builds_furniture_valid CHECK(public.valid_housing_furniture(furniture_items));

CREATE OR REPLACE VIEW public.housing_build_gallery WITH (security_barrier=true) AS
  SELECT b.id,b.title,b.description,b.updated_at,
    coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),'魔兽玩家') AS author_name,
    CASE WHEN b.code_public AND b.allow_copy THEN b.blueprint_code END AS blueprint_code,
    CASE WHEN b.code_public THEN b.blueprint_code END AS visible_code,
    b.code_public,b.allow_copy,b.image_ids,b.preset_tags,b.custom_tags,b.furniture_items
  FROM public.housing_builds b JOIN auth.users u ON u.id=b.author_id WHERE b.published;
GRANT SELECT(furniture_items) ON public.housing_build_gallery TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.save_housing_build_v4(
  p_author uuid,p_id uuid,p_revision integer,p_title text,p_description text,p_code text,
  p_code_public boolean,p_allow_copy boolean,p_published boolean,p_screenshots jsonb,
  p_preset_tags text[],p_custom_tags text[],p_furniture_items jsonb
) RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE existing public.housing_builds%ROWTYPE; created boolean := false; changed boolean; result integer; canonical jsonb;
BEGIN
  IF NOT public.valid_housing_furniture(p_furniture_items) THEN RAISE EXCEPTION '家具清单格式有误，请核对家具编号和用量'; END IF;
  SELECT coalesce(jsonb_agg(v ORDER BY (v->>'record_id')::integer),'[]') INTO canonical FROM jsonb_array_elements(p_furniture_items) v;
  -- 与旧保存函数共用同一行锁。新作品先写完整初值，所有后续校验均处于同一事务。
  IF p_revision=0 THEN
    INSERT INTO public.housing_builds(id,author_id,title,description,blueprint_code,code_public,allow_copy,published,image_ids,preset_tags,custom_tags,furniture_items)
      VALUES(p_id,p_author,p_title,p_description,p_code,p_code_public,p_allow_copy,p_published,
        ARRAY(SELECT (v->>'id')::uuid FROM jsonb_array_elements(p_screenshots) v),
        coalesce(p_preset_tags,'{}'),coalesce(p_custom_tags,'{}'),canonical) ON CONFLICT(id) DO NOTHING;
    created := FOUND;
  END IF;
  SELECT * INTO existing FROM public.housing_builds WHERE id=p_id AND author_id=p_author FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '作品不可编辑'; END IF;
  -- 已附清单中的历史编号允许保留；新加入的编号必须是图鉴家具，房间不能混入。
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(canonical) v
      WHERE NOT EXISTS(SELECT 1 FROM public.decor_catalog c WHERE c.entry_type=1 AND c.record_id=(v->>'record_id')::integer)
      AND (created OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(existing.furniture_items) old WHERE old->>'record_id'=v->>'record_id'))) THEN
    RAISE EXCEPTION '家具图鉴暂未收录该编号，请重新选择家具';
  END IF;
  changed := existing.furniture_items IS DISTINCT FROM canonical;
  IF changed AND existing.revision<>p_revision THEN RAISE EXCEPTION '作品已更新，请重新打开后核对'; END IF;
  IF p_preset_tags IS NULL AND p_custom_tags IS NULL THEN
    result := public.save_housing_build_v2(p_author,p_id,p_revision,p_title,p_description,p_code,p_code_public,p_allow_copy,p_published,p_screenshots);
  ELSE
    result := public.save_housing_build_v3(p_author,p_id,p_revision,p_title,p_description,p_code,p_code_public,p_allow_copy,p_published,p_screenshots,p_preset_tags,p_custom_tags);
  END IF;
  IF changed THEN
    result := greatest(result,existing.revision+1);
    UPDATE public.housing_builds SET furniture_items=canonical,revision=result,updated_at=now() WHERE id=p_id;
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.save_housing_build_v4(uuid,uuid,integer,text,text,text,boolean,boolean,boolean,jsonb,text[],text[],jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_housing_build_v4(uuid,uuid,integer,text,text,text,boolean,boolean,boolean,jsonb,text[],text[],jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.valid_housing_available(p_available jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE entry record; total integer := 0;
BEGIN
  IF jsonb_typeof(p_available) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  FOR entry IN SELECT * FROM jsonb_each(p_available) LOOP
    total := total+1;
    IF total>500 OR entry.key !~ '^[1-9][0-9]{0,9}$' OR entry.key::numeric>2147483647
      OR jsonb_typeof(entry.value) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    IF entry.value::numeric NOT BETWEEN 0 AND 9999 OR entry.value::numeric <> trunc(entry.value::numeric) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;
CREATE TABLE IF NOT EXISTS public.housing_build_supplies(
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  build_id uuid NOT NULL REFERENCES public.housing_builds(id) ON DELETE CASCADE,
  available jsonb NOT NULL DEFAULT '{}' CHECK(public.valid_housing_available(available)),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,build_id)
);
ALTER TABLE public.housing_build_supplies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.housing_build_supplies FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.housing_build_supplies TO service_role;
CREATE OR REPLACE FUNCTION public.save_housing_build_supply(p_user uuid,p_build uuid,p_revision integer,p_available jsonb)
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE work public.housing_builds%ROWTYPE; existing public.housing_build_supplies%ROWTYPE; created boolean := false;
BEGIN
  IF NOT public.valid_housing_available(p_available) OR p_revision<0 OR p_revision IS NULL THEN RAISE EXCEPTION '可用量格式有误'; END IF;
  SELECT * INTO work FROM public.housing_builds WHERE id=p_build AND (published OR author_id=p_user) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION '作品不存在或已撤回'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_available) k WHERE NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(work.furniture_items) v WHERE v->>'record_id'=k)) THEN
    RAISE EXCEPTION '作品家具清单已更改，请重新打开后核对';
  END IF;
  IF p_revision=0 THEN
    INSERT INTO public.housing_build_supplies(user_id,build_id,available) VALUES(p_user,p_build,p_available)
      ON CONFLICT(user_id,build_id) DO NOTHING;
    created := FOUND;
  END IF;
  SELECT * INTO existing FROM public.housing_build_supplies WHERE user_id=p_user AND build_id=p_build FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '可用量已更改，请重新打开后核对'; END IF;
  IF created OR existing.available=p_available THEN RETURN existing.revision; END IF;
  IF existing.revision<>p_revision THEN RAISE EXCEPTION '可用量已在另一页面更新，请重新打开后核对'; END IF;
  UPDATE public.housing_build_supplies SET available=p_available,revision=revision+1,updated_at=now() WHERE user_id=p_user AND build_id=p_build;
  RETURN existing.revision+1;
END;
$$;
REVOKE ALL ON FUNCTION public.save_housing_build_supply(uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_housing_build_supply(uuid,uuid,integer,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
