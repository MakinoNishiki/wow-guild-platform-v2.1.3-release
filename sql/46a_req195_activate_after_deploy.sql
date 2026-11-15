-- Run only AFTER verifying candidate139+ frontend and authenticated /api/people routes are deployed.
-- Old cached clients must be refreshed before creating a new activity.
-- Schema staging keeps legacy by design. Does not convert any existing activity.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF to_regclass('public.guild_people') IS NULL OR to_regclass('public.guild_person_attendance') IS NULL OR to_regprocedure('public.req195_people_write(uuid,uuid,text,jsonb)') IS NULL THEN RAISE EXCEPTION 'SQL46 is not ready'; END IF;
END $$;
ALTER TABLE public.activities ALTER COLUMN attendance_mode SET DEFAULT 'person';
NOTIFY pgrst,'reload schema';
COMMIT;
