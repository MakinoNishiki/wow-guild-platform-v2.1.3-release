// Build a production-safe staging transaction; does not connect or execute SQL.
// SQL46 defines the final default. Keep legacy until candidate139 is deployed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const source=fs.readFileSync('sql/46_req195_person_attendance.sql','utf8');
if((source.match(/^BEGIN;$/gm)||[]).length!==1||(source.match(/^COMMIT;$/gm)||[]).length!==1)throw Error('Unexpected transaction boundaries');
const snapshot=()=>`SELECT 'activities' label,count(*) qty,md5(coalesce(string_agg((to_jsonb(t)-'attendance_mode')::text,'' ORDER BY (to_jsonb(t)-'attendance_mode')::text),'')) digest FROM public.activities t
UNION ALL SELECT 'raid_members',count(*),md5(coalesce(string_agg((to_jsonb(t)-'person_id')::text,'' ORDER BY (to_jsonb(t)-'person_id')::text),'')) FROM public.raid_members t
UNION ALL SELECT 'activity_attendance',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) FROM public.activity_attendance t
UNION ALL SELECT 'loot_records',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) FROM public.loot_records t`;
const pre=`BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='90s';
LOCK TABLE public.activities,public.raid_members,public.activity_attendance,public.loot_records IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF to_regclass('public.guild_people') IS NOT NULL OR to_regclass('public.guild_person_attendance') IS NOT NULL THEN RAISE EXCEPTION 'Already migrated: inspect state instead of rerunning staging'; END IF;
END $$;
CREATE TEMP TABLE req195_before ON COMMIT DROP AS ${snapshot()};
`;
const post=`
-- Atomic staging override: old website remains live until deployment.
ALTER TABLE public.activities ALTER COLUMN attendance_mode SET DEFAULT 'legacy';
CREATE TEMP TABLE req195_after ON COMMIT DROP AS ${snapshot()};
DO $$ BEGIN
 IF EXISTS(SELECT * FROM req195_before EXCEPT SELECT * FROM req195_after) OR EXISTS(SELECT * FROM req195_after EXCEPT SELECT * FROM req195_before) THEN RAISE EXCEPTION 'Existing business rows changed'; END IF;
 IF EXISTS(SELECT 1 FROM activities WHERE attendance_mode<>'legacy') OR EXISTS(SELECT 1 FROM raid_members WHERE person_id IS NOT NULL) THEN RAISE EXCEPTION 'Unexpected historical conversion'; END IF;
 IF EXISTS(SELECT 1 FROM guild_people) OR EXISTS(SELECT 1 FROM guild_person_attendance) THEN RAISE EXCEPTION 'Unexpected new business data'; END IF;
 IF has_function_privilege('anon','public.req195_people_write(uuid,uuid,text,jsonb)','execute') OR has_function_privilege('authenticated','public.req195_people_write(uuid,uuid,text,jsonb)','execute') OR NOT has_function_privilege('service_role','public.req195_people_write(uuid,uuid,text,jsonb)','execute') THEN RAISE EXCEPTION 'RPC permission mismatch'; END IF;
 IF (SELECT count(*) FROM pg_class WHERE oid IN ('public.guild_people'::regclass,'public.guild_person_attendance'::regclass) AND relrowsecurity)<>2 THEN RAISE EXCEPTION 'RLS missing'; END IF;
END $$;
SELECT 'original_fields_unchanged' result,* FROM req195_after ORDER BY label;
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT table_name,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='activities' AND column_name='attendance_mode';
SELECT (SELECT count(*) FROM guild_people) people,(SELECT count(*) FROM guild_person_attendance) person_attendance;
`;
const out=path.join(process.env.TEMP,'wb-req195-staged.sql');
const sql=source.replace(/^BEGIN;$/m,()=>pre).replace(/^COMMIT;$/m,()=>post);
fs.writeFileSync(out,sql);
console.log(JSON.stringify({file:out,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),stagedSha256:crypto.createHash('sha256').update(sql).digest('hex')}));
