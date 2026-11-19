-- REQ-209. Apply after the public decor catalog. Both private relations use service-only access.
-- Rollback: drop the two functions, the totals view, then the two decor_item_* tables.
begin;
create table if not exists public.decor_item_likes (
  record_id integer not null references public.decor_catalog(record_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (record_id, user_id)
);
create table if not exists public.decor_item_views (
  record_id integer not null references public.decor_catalog(record_id) on delete cascade,
  visitor_key text not null,
  last_counted_at timestamptz not null default now(),
  total bigint not null default 1 check (total > 0),
  primary key (record_id, visitor_key)
);
alter table public.decor_item_likes enable row level security;
alter table public.decor_item_views enable row level security;
revoke all on public.decor_item_likes, public.decor_item_views from public, anon, authenticated;
grant select, insert, delete on public.decor_item_likes to service_role;
grant select, insert, update on public.decor_item_views to service_role;

create or replace view public.decor_item_totals as
select record_id, sum(likes)::bigint as likes, sum(views)::bigint as views
from (
  select record_id, count(*) as likes, 0::bigint as views from public.decor_item_likes group by record_id
  union all
  select record_id, 0::bigint, sum(total)::bigint from public.decor_item_views group by record_id
) counts group by record_id;
revoke all on public.decor_item_totals from public, anon, authenticated;
grant select on public.decor_item_totals to service_role;

create or replace function public.set_decor_item_like(p_record integer, p_user uuid, p_liked boolean)
returns void language plpgsql set search_path = '' as $$
begin
  if p_liked then
    insert into public.decor_item_likes values (p_record, p_user) on conflict do nothing;
  else
    delete from public.decor_item_likes where record_id = p_record and user_id = p_user;
  end if;
end $$;
create or replace function public.record_decor_item_view(p_record integer, p_visitor text)
returns void language sql set search_path = '' as $$
  insert into public.decor_item_views(record_id,visitor_key) values (p_record,p_visitor)
  on conflict (record_id,visitor_key) do update set
    last_counted_at = now(), total = decor_item_views.total + 1
    where decor_item_views.last_counted_at <= now() - interval '30 minutes';
$$;
revoke all on function public.set_decor_item_like(integer,uuid,boolean), public.record_decor_item_view(integer,text) from public, anon, authenticated;
grant execute on function public.set_decor_item_like(integer,uuid,boolean), public.record_decor_item_view(integer,text) to service_role;
notify pgrst, 'reload schema';
commit;
