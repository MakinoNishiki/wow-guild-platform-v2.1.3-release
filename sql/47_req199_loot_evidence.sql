-- REQ-199. Additive, old clients continue using req191. Apply in a transaction.
begin;
create table if not exists public.loot_event_evidence (
 id uuid primary key default gen_random_uuid(),
 guild_id uuid not null references public.guilds(id) on delete cascade,
 submitter_user_id uuid not null references auth.users(id),
 collector_source_id text not null, source_event_id text not null,
 kind text not null check(kind in ('drop','trade')),
 content_hash text not null, payload jsonb not null,
 received_at timestamptz not null default now(),
 unique(guild_id,collector_source_id,source_event_id)
);
create index if not exists loot_event_evidence_lookup on public.loot_event_evidence(guild_id,kind,((payload->>'itemID')),received_at desc);
alter table public.loot_event_evidence enable row level security;
drop policy if exists req199_read on public.loot_event_evidence;
create policy req199_read on public.loot_event_evidence for select to authenticated using (
 exists(select 1 from public.guild_members m where m.guild_id=loot_event_evidence.guild_id and m.user_id=auth.uid()
 and (m.role in ('owner','editor') or loot_event_evidence.submitter_user_id=auth.uid()))
);
revoke all on public.loot_event_evidence from anon,authenticated;
grant select on public.loot_event_evidence to authenticated;
grant all on public.loot_event_evidence to service_role;
create or replace function public.req199_submit_loot(p_guild uuid,p_user uuid,p_activity uuid,p_rows jsonb,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb; prior public.loot_event_evidence; receipt jsonb; n integer:=0;
begin
 if not exists(select 1 from guild_members where guild_id=p_guild and user_id=p_user) then raise exception using errcode='42501',message='你已不在该公会'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_typeof(p_evidence)<>'array' or jsonb_array_length(p_rows)>200 or jsonb_array_length(p_evidence)>500 then raise exception '提交批次无效'; end if;
 perform pg_advisory_xact_lock(hashtextextended('req191:'||p_guild::text,0));
 if jsonb_array_length(p_rows)>0 then
   receipt:=req191_submit_loot(p_guild,p_user,p_activity,p_rows);
 else
   receipt:=jsonb_build_object('ids','[]'::jsonb,'created',0,'merged',0,'repeated',0,'ignored',0);
 end if;
 for r in select value from jsonb_array_elements(p_evidence) loop
   select * into prior from loot_event_evidence where guild_id=p_guild and collector_source_id=r->>'collector_source_id' and source_event_id=r->>'source_event_id';
   if found then
     if prior.content_hash<>r->>'content_hash' then raise exception '同一观察事件内容冲突，请保留原文核对'; end if;
   else
     insert into loot_event_evidence(guild_id,submitter_user_id,collector_source_id,source_event_id,kind,content_hash,payload)
     values(p_guild,p_user,r->>'collector_source_id',r->>'source_event_id',r->>'kind',r->>'content_hash',r->'payload');
     n:=n+1;
   end if;
 end loop;
 return receipt||jsonb_build_object('evidenceSaved',n,'evidenceCount',jsonb_array_length(p_evidence));
end;$$;
revoke all on function public.req199_submit_loot(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.req199_submit_loot(uuid,uuid,uuid,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
