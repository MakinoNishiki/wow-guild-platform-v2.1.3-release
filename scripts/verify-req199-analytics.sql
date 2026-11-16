-- ISOLATED TEST ONLY. Transaction rolls back every synthetic event.
begin;
insert into public.analytics_events(ts,event,page,vid,ref_dom) values
 ('2001-01-01 01:00+08','page_view','index:decor','req199-a','example.com'),
 ('2001-01-01 02:00+08','page_view','index:decor','req199-b',null),
 ('2001-01-01 02:00+08','tab_click','index:decor','req199-a','example.com'),
 ('2001-01-01 02:00+08','decor_plan_add','index:decor','req199-a','example.com');
do $$ declare r jsonb; begin
 r:=public.analytics_overview('2001-01-01 00:00+08','2001-01-02 00:00+08','day','all');
 if r->'cards'<> '{"pv":2,"uv":2,"dau_avg":2}'::jsonb then raise exception 'cards mismatch %',r->'cards'; end if;
 if jsonb_array_length(r->'series')<>1 or (r->'series'->0->>'pv')::int<>2 then raise exception 'series mismatch'; end if;
 if (r->'nav'->0->>'clicks')::int<>1 or (r->'pages'->0->>'pv')::int<>2 then raise exception 'nav/pages mismatch'; end if;
 if jsonb_array_length(r->'events')<>3 or jsonb_array_length(r->'refs')<>2 then raise exception 'events/refs mismatch'; end if;
 r:=public.analytics_overview('2001-01-01 00:00+08','2001-01-02 00:00+08','day','index:loot');
 if (r->'cards'->>'pv')::int<>0 then raise exception 'empty filter mismatch'; end if;
 if has_function_privilege('authenticated','public.analytics_overview(timestamptz,timestamptz,text,text)','execute') then raise exception 'analytics exposed'; end if;
 if has_function_privilege('authenticated','public.req199_submit_loot(uuid,uuid,uuid,jsonb,jsonb)','execute') then raise exception 'evidence RPC exposed'; end if;
 raise notice 'PASS analytics cards, half-open buckets, page filter, nav, refs, events and RPC ACL';
end $$;
rollback;
