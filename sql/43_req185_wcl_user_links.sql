-- REQ-185: owner approved isolated-test execution on 2026-11-06.
-- Production execution explicitly authorized and completed on 2026-11-06 (supabase_admin).
-- No OAuth access/refresh tokens stored. Existing character claims unchanged.
BEGIN;
CREATE TABLE public.wcl_user_links (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wcl_user_id bigint NOT NULL UNIQUE CHECK (wcl_user_id > 0),
  wcl_user_name text NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wcl_user_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wcl_user_links FROM anon, authenticated;
GRANT SELECT ON public.wcl_user_links TO authenticated;
GRANT ALL ON public.wcl_user_links TO service_role;
CREATE POLICY wcl_user_links_read_self ON public.wcl_user_links
  FOR SELECT TO authenticated USING (user_id = auth.uid());
COMMENT ON TABLE public.wcl_user_links IS
  'REQ-185: verified WCL account link; server-only writes; no OAuth tokens';
NOTIFY pgrst, 'reload schema';
COMMIT;

-- Rollback only after disabling related endpoints and preserving needed link data:
-- BEGIN;
-- DROP TABLE public.wcl_user_links;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
