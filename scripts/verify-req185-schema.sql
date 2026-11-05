-- Run ONLY in wowbutler-test-db-1; rollback all synthetic rows.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('01850000-0000-4000-8000-000000000001','req185-schema-one@example.com'),
 ('01850000-0000-4000-8000-000000000002','req185-schema-two@example.com');
INSERT INTO public.wcl_user_links(user_id,wcl_user_id,wcl_user_name)
 VALUES('01850000-0000-4000-8000-000000000001',91850001,'Schema fixture');
DO $$ BEGIN
 BEGIN
  INSERT INTO public.wcl_user_links(user_id,wcl_user_id,wcl_user_name)
   VALUES('01850000-0000-4000-8000-000000000002',91850001,'Duplicate');
  RAISE EXCEPTION 'WCL uniqueness missing';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  INSERT INTO public.wcl_user_links(user_id,wcl_user_id,wcl_user_name)
   VALUES('01850000-0000-4000-8000-000000000001',91850002,'Duplicate');
  RAISE EXCEPTION 'Account uniqueness missing';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 IF has_table_privilege('anon','public.wcl_user_links','SELECT') THEN RAISE EXCEPTION 'anon read allowed'; END IF;
 IF has_table_privilege('authenticated','public.wcl_user_links','INSERT') OR
    has_table_privilege('authenticated','public.wcl_user_links','UPDATE') OR
    has_table_privilege('authenticated','public.wcl_user_links','DELETE') THEN RAISE EXCEPTION 'client write allowed'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','01850000-0000-4000-8000-000000000001',true);
DO $$ BEGIN IF (SELECT count(*) FROM public.wcl_user_links) <> 1 THEN RAISE EXCEPTION 'self read failed'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','01850000-0000-4000-8000-000000000002',true);
DO $$ BEGIN IF (SELECT count(*) FROM public.wcl_user_links) <> 0 THEN RAISE EXCEPTION 'other account visible'; END IF; END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: unique WCL, unique account, anon blocked, client writes blocked, self-only RLS, rollback';
