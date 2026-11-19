-- Furniture favorites reuse personal plan lines. Only the service reads totals across accounts.
BEGIN;
CREATE OR REPLACE VIEW public.decor_item_totals AS
SELECT record_id, sum(likes)::bigint AS likes, sum(views)::bigint AS views, sum(favorites)::bigint AS favorites
FROM (
  SELECT record_id, count(*) AS likes, 0::bigint AS views, 0::bigint AS favorites FROM public.decor_item_likes GROUP BY record_id
  UNION ALL
  SELECT record_id, 0, sum(total)::bigint, 0 FROM public.decor_item_views GROUP BY record_id
  UNION ALL
  SELECT i.record_id, 0, 0, count(DISTINCT p.user_id)
  FROM public.decor_plan_items i JOIN public.decor_plans p ON p.id=i.plan_id GROUP BY i.record_id
) counts GROUP BY record_id;
REVOKE ALL ON public.decor_item_totals FROM public,anon,authenticated;
GRANT SELECT ON public.decor_item_totals TO service_role;

CREATE OR REPLACE FUNCTION public.favorite_decor_in_plan(p_user uuid,p_plan uuid,p_record integer,p_quantity integer)
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE target uuid;
BEGIN
  IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 99 THEN RAISE EXCEPTION '数量无效'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,57));
  IF p_plan IS NULL THEN
    SELECT id INTO target FROM public.decor_plans WHERE user_id=p_user ORDER BY updated_at DESC,id LIMIT 1 FOR UPDATE;
    IF target IS NULL THEN INSERT INTO public.decor_plans(user_id) VALUES(p_user) RETURNING id INTO target; END IF;
  ELSE
    SELECT id INTO target FROM public.decor_plans WHERE id=p_plan AND user_id=p_user FOR UPDATE;
    IF target IS NULL THEN RAISE EXCEPTION '找不到自己的这份方案单'; END IF;
  END IF;
  INSERT INTO public.decor_plan_items(plan_id,record_id,qty) VALUES(target,p_record,p_quantity)
  ON CONFLICT(plan_id,record_id) DO UPDATE SET qty=greatest(public.decor_plan_items.qty,excluded.qty);
  RETURN target;
END $$;
REVOKE ALL ON FUNCTION public.favorite_decor_in_plan(uuid,uuid,integer,integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.favorite_decor_in_plan(uuid,uuid,integer,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
