-- Public discover cards. Favorite membership is bound to the server-verified account.
BEGIN;
CREATE OR REPLACE FUNCTION public.discover_housing_works(p_mode text,p_tag text,p_actor uuid,p_page int)
RETURNS TABLE(id uuid,title text,description text,author_name text,updated_at timestamptz,
  image_ids uuid[],preset_tags text[],custom_tags text[],recent7d bigint)
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT g.id,g.title,g.description,g.author_name,g.updated_at,g.image_ids,g.preset_tags,g.custom_tags,
         coalesce(t.recent7d,0)::bigint
    FROM public.housing_build_gallery g
    LEFT JOIN public.housing_build_community_totals t ON t.work_id=g.id
    WHERE p_mode IN ('latest','hot','favorites')
      AND (p_tag='' OR p_tag=ANY(g.preset_tags) OR p_tag=ANY(g.custom_tags))
      AND (p_mode<>'hot' OR t.recent7d>0)
      AND (p_mode<>'favorites' OR EXISTS (
        SELECT 1 FROM public.housing_build_reactions r WHERE r.work_id=g.id AND r.user_id=p_actor AND r.kind='favorite'))
    ORDER BY CASE WHEN p_mode='hot' THEN coalesce(t.recent7d,0) END DESC,g.updated_at DESC,g.id
    LIMIT 25 OFFSET (24 * greatest(0,least(1000000,p_page)));
$$;
REVOKE ALL ON FUNCTION public.discover_housing_works(text,text,uuid,int) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.discover_housing_works(text,text,uuid,int) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
