-- REQ-207 作品社区。依赖 SQL49—54。普通账号没有直连读写权限。
BEGIN;
ALTER TABLE public.housing_builds ADD COLUMN IF NOT EXISTS moderation_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.housing_builds DROP CONSTRAINT IF EXISTS housing_builds_moderation_guard;
ALTER TABLE public.housing_builds ADD CONSTRAINT housing_builds_moderation_guard CHECK (NOT moderation_hidden OR NOT published);

CREATE TABLE IF NOT EXISTS public.housing_build_reactions (
  work_id uuid NOT NULL REFERENCES public.housing_builds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('like','favorite')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(work_id,user_id,kind)
);
CREATE INDEX IF NOT EXISTS housing_reactions_user_idx ON public.housing_build_reactions(user_id,kind,created_at DESC);
CREATE TABLE IF NOT EXISTS public.housing_build_comments (
  id uuid PRIMARY KEY,
  work_id uuid NOT NULL REFERENCES public.housing_builds(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK(char_length(btrim(body)) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','removed','hidden')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS housing_comments_work_idx ON public.housing_build_comments(work_id,created_at,id);
CREATE INDEX IF NOT EXISTS housing_comments_author_idx ON public.housing_build_comments(author_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.housing_community_reports (
  id uuid PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_id uuid NOT NULL REFERENCES public.housing_builds(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.housing_build_comments(id),
  reason text NOT NULL CHECK(reason IN ('spam','abuse','unsafe','copyright','other')),
  details text NOT NULL DEFAULT '' CHECK(char_length(details)<=1000),
  target_text text NOT NULL,
  work_title text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved','rejected')),
  decision text,
  note text NOT NULL DEFAULT '' CHECK(char_length(note)<=500),
  handled_by uuid REFERENCES auth.users(id),
  handled_at timestamptz,
  history jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS housing_report_pending_unique ON public.housing_community_reports(reporter_id,work_id,coalesce(comment_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE status='pending';
CREATE INDEX IF NOT EXISTS housing_report_queue_idx ON public.housing_community_reports(status,created_at,id);
CREATE TABLE IF NOT EXISTS public.housing_community_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id uuid NOT NULL REFERENCES public.housing_community_reports(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,report_id,kind)
);
CREATE INDEX IF NOT EXISTS housing_notifications_user_idx ON public.housing_community_notifications(user_id,created_at DESC);
ALTER TABLE public.housing_build_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.housing_build_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.housing_community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.housing_community_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.housing_build_reactions,public.housing_build_comments,public.housing_community_reports,public.housing_community_notifications FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.housing_build_reactions,public.housing_build_comments,public.housing_community_reports,public.housing_community_notifications TO service_role;

CREATE OR REPLACE VIEW public.housing_build_community_totals WITH(security_barrier=true) AS
SELECT b.id AS work_id,
  coalesce(r.likes,0)::integer AS likes,coalesce(r.favorites,0)::integer AS favorites,
  coalesce(c.comments,0)::integer AS comments,
  (coalesce(r.recent,0)+coalesce(c.recent,0))::integer AS recent7d
FROM public.housing_builds b
LEFT JOIN (SELECT work_id,count(*) FILTER(WHERE kind='like') AS likes,count(*) FILTER(WHERE kind='favorite') AS favorites,
  count(*) FILTER(WHERE created_at>=now()-interval '7 days') AS recent FROM public.housing_build_reactions GROUP BY work_id) r ON r.work_id=b.id
LEFT JOIN (SELECT work_id,count(*) AS comments,count(*) FILTER(WHERE created_at>=now()-interval '7 days') AS recent
  FROM public.housing_build_comments WHERE status='visible' GROUP BY work_id) c ON c.work_id=b.id
WHERE b.published AND NOT b.moderation_hidden;
CREATE OR REPLACE VIEW public.housing_community_comment_list WITH(security_barrier=true) AS
SELECT c.id,c.work_id,c.author_id,c.body,c.status,c.created_at,
 coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),'魔兽玩家') AS author_name
FROM public.housing_build_comments c JOIN auth.users u ON u.id=c.author_id
JOIN public.housing_builds b ON b.id=c.work_id
WHERE b.published AND NOT b.moderation_hidden AND c.status='visible';
REVOKE ALL ON public.housing_build_community_totals,public.housing_community_comment_list FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.housing_build_community_totals,public.housing_community_comment_list TO service_role;

CREATE OR REPLACE FUNCTION public.housing_community_action(p_actor uuid,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE
 w public.housing_builds%ROWTYPE;
 c public.housing_build_comments%ROWTYPE;
 r public.housing_community_reports%ROWTYPE;
 key uuid := (p_data->>'id')::uuid;
 wid uuid := (p_data->>'work_id')::uuid;
 cid uuid := (p_data->>'comment_id')::uuid;
 decision text := p_data->>'decision';
 notice text;
 count_rows integer;
BEGIN
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor) THEN RAISE EXCEPTION '请先登录'; END IF;
 IF p_action='read' THEN
   UPDATE public.housing_community_notifications SET is_read=true WHERE user_id=p_actor AND (key IS NULL OR id=key);
   RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_action='moderate' THEN
   IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor AND raw_app_meta_data->>'role'='superadmin') THEN RAISE EXCEPTION '仅平台管理员可处理举报'; END IF;
   SELECT * INTO r FROM public.housing_community_reports WHERE id=key FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION '举报不存在'; END IF;
   IF decision NOT IN ('dismiss','hide_comment','hide_work','restore_comment','restore_work') OR decision IS NULL THEN RAISE EXCEPTION '处理方式无效'; END IF;
   IF char_length(btrim(coalesce(p_data->>'note',''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION '请填写处理说明'; END IF;
   IF r.decision=decision AND r.note=p_data->>'note' THEN RETURN jsonb_build_object('id',r.id,'status',r.status); END IF;
   IF r.status<>'pending' AND decision NOT IN ('restore_comment','restore_work') THEN RAISE EXCEPTION '举报已经处理，请刷新核对'; END IF;
   IF decision IN ('restore_comment','restore_work') AND r.status='pending' THEN RAISE EXCEPTION '尚无处理结果可以恢复'; END IF;
   SELECT * INTO w FROM public.housing_builds WHERE id=r.work_id FOR UPDATE;
   IF decision='hide_work' THEN
     IF w.moderation_hidden THEN RAISE EXCEPTION '作品已被下架，请核对已有处理记录'; END IF;
     UPDATE public.housing_builds SET moderation_hidden=true,published=false,revision=revision+1,updated_at=now() WHERE id=w.id;
   ELSIF decision='restore_work' THEN
     IF r.decision<>'hide_work' THEN RAISE EXCEPTION '该举报未下架作品'; END IF;
     UPDATE public.housing_builds SET moderation_hidden=false,revision=revision+1,updated_at=now() WHERE id=w.id;
   ELSIF decision IN ('hide_comment','restore_comment') THEN
     IF r.comment_id IS NULL THEN RAISE EXCEPTION '该举报未关联留言'; END IF;
     IF decision='restore_comment' AND r.decision<>'hide_comment' THEN RAISE EXCEPTION '该举报未隐藏留言'; END IF;
     IF decision='hide_comment' AND EXISTS(SELECT 1 FROM public.housing_build_comments WHERE id=r.comment_id AND status='hidden') THEN RAISE EXCEPTION '留言已被隐藏，请核对已有处理记录'; END IF;
     UPDATE public.housing_build_comments SET status=CASE WHEN decision='hide_comment' THEN 'hidden' ELSE 'visible' END
       WHERE id=r.comment_id AND status<>'removed';
     IF NOT FOUND THEN RAISE EXCEPTION '留言已由作者删除，不能恢复'; END IF;
   END IF;
   UPDATE public.housing_community_reports SET status=CASE WHEN decision='dismiss' THEN 'rejected' ELSE 'resolved' END,
     decision=decision,note=p_data->>'note',handled_by=p_actor,handled_at=now(),
     history=history||jsonb_build_array(jsonb_build_object('decision',decision,'note',p_data->>'note','at',now(),'by',p_actor))
     WHERE id=key RETURNING * INTO r;
   notice := CASE decision WHEN 'dismiss' THEN '举报未采纳' WHEN 'hide_work' THEN '作品已下架' WHEN 'hide_comment' THEN '留言已隐藏'
     WHEN 'restore_work' THEN '作品下架限制已解除，作者可重新发布' ELSE '留言已恢复' END;
   INSERT INTO public.housing_community_notifications(user_id,report_id,kind,title,message)
     VALUES(r.reporter_id,r.id,'decision-'||jsonb_array_length(r.history),'举报处理结果',r.work_title||'：'||notice||'。说明：'||r.note);
   IF decision<>'dismiss' THEN
     IF r.comment_id IS NOT NULL AND decision IN ('hide_comment','restore_comment') THEN
       SELECT * INTO c FROM public.housing_build_comments WHERE id=r.comment_id;
     END IF;
     IF coalesce(c.author_id,w.author_id)<>r.reporter_id THEN
       INSERT INTO public.housing_community_notifications(user_id,report_id,kind,title,message)
         VALUES(coalesce(c.author_id,w.author_id),r.id,'decision-'||jsonb_array_length(r.history),'社区内容处理通知',r.work_title||'：'||notice||'。说明：'||r.note);
     END IF;
   END IF;
   RETURN jsonb_build_object('id',r.id,'status',r.status);
 END IF;
 -- Serialize per-account submissions across works so concurrent requests cannot bypass the rate check.
 IF p_action IN ('comment','report') THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text,207)); END IF;
 SELECT * INTO w FROM public.housing_builds WHERE id=wid FOR UPDATE;
 IF NOT FOUND OR NOT w.published OR w.moderation_hidden THEN RAISE EXCEPTION '作品已撤回或暂不可互动'; END IF;
 IF p_action='react' THEN
   IF p_data->>'kind' NOT IN ('like','favorite') OR jsonb_typeof(p_data->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION '互动参数无效'; END IF;
   IF (p_data->>'active')::boolean THEN
     INSERT INTO public.housing_build_reactions(work_id,user_id,kind) VALUES(wid,p_actor,p_data->>'kind') ON CONFLICT DO NOTHING;
   ELSE DELETE FROM public.housing_build_reactions WHERE work_id=wid AND user_id=p_actor AND kind=p_data->>'kind'; END IF;
   RETURN jsonb_build_object('ok',true);
 ELSIF p_action='comment' THEN
   SELECT * INTO c FROM public.housing_build_comments WHERE id=key;
   IF FOUND THEN
     IF c.author_id=p_actor AND c.work_id=wid AND c.body=p_data->>'body' THEN RETURN jsonb_build_object('id',c.id); END IF;
     RAISE EXCEPTION '留言已更改，请刷新后重试';
   END IF;
   IF (SELECT count(*) FROM public.housing_build_comments WHERE author_id=p_actor AND created_at>now()-interval '1 minute')>=5 THEN RAISE EXCEPTION '留言过于频繁，请一分钟后再试'; END IF;
   INSERT INTO public.housing_build_comments(id,work_id,author_id,body) VALUES(key,wid,p_actor,p_data->>'body');
   RETURN jsonb_build_object('id',key);
 ELSIF p_action='remove-comment' THEN
   UPDATE public.housing_build_comments SET status='removed' WHERE id=key AND work_id=wid AND author_id=p_actor;
   IF NOT FOUND THEN RAISE EXCEPTION '只能删除自己的留言'; END IF;
   RETURN jsonb_build_object('id',key);
 ELSIF p_action='report' THEN
   SELECT * INTO r FROM public.housing_community_reports WHERE id=key;
   IF FOUND THEN
     IF r.reporter_id=p_actor AND r.work_id=wid AND r.comment_id IS NOT DISTINCT FROM cid THEN RETURN jsonb_build_object('id',r.id); END IF;
     RAISE EXCEPTION '举报编号已使用，请刷新重试';
   END IF;
   IF cid IS NOT NULL THEN
     SELECT * INTO c FROM public.housing_build_comments WHERE id=cid AND work_id=wid AND status='visible';
     IF NOT FOUND THEN RAISE EXCEPTION '留言已不可见，请刷新后核对'; END IF;
   END IF;
   SELECT * INTO r FROM public.housing_community_reports WHERE reporter_id=p_actor AND work_id=wid AND comment_id IS NOT DISTINCT FROM cid AND status='pending';
   IF FOUND THEN RETURN jsonb_build_object('id',r.id); END IF;
   IF (SELECT count(*) FROM public.housing_community_reports WHERE reporter_id=p_actor AND created_at>now()-interval '1 hour')>=10 THEN RAISE EXCEPTION '举报过于频繁，请稍后再试'; END IF;
   INSERT INTO public.housing_community_reports(id,reporter_id,work_id,comment_id,reason,details,target_text,work_title)
     VALUES(key,p_actor,wid,cid,p_data->>'reason',coalesce(p_data->>'details',''),coalesce(c.body,w.description),w.title);
   INSERT INTO public.housing_community_notifications(user_id,report_id,kind,title,message)
     VALUES(p_actor,key,'submitted','举报已收到','我们已收到你对《'||w.title||'》的举报，处理后会在此通知你。');
   RETURN jsonb_build_object('id',key);
 END IF;
 RAISE EXCEPTION '未知的社区操作';
END;
$$;
REVOKE ALL ON FUNCTION public.housing_community_action(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.housing_community_action(uuid,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
