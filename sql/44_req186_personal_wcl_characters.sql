-- REQ186: production explicitly authorized and migrated on 2026-11-06 after isolated verification.
BEGIN;
ALTER TABLE public.user_characters
 ADD COLUMN source text NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','wcl')),
 ADD COLUMN wcl_character_id bigint,
 ADD COLUMN wcl_canonical_id bigint,
 ADD COLUMN wcl_verified_at timestamptz,
 ADD COLUMN wcl_verification text NOT NULL DEFAULT 'review' CHECK(wcl_verification IN ('verified','review','revoked')),
 ADD COLUMN is_displayed boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX uq_personal_display ON public.user_characters(user_id) WHERE is_displayed;
CREATE UNIQUE INDEX uq_personal_wcl_identity ON public.user_characters(user_id,wcl_canonical_id) WHERE wcl_canonical_id IS NOT NULL;
CREATE FUNCTION public.guard_personal_wcl_fields() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_user NOT IN ('service_role','postgres','supabase_admin') THEN
  IF TG_OP='INSERT' THEN
   IF NEW.source<>'manual' OR NEW.wcl_character_id IS NOT NULL OR NEW.wcl_canonical_id IS NOT NULL OR NEW.wcl_verified_at IS NOT NULL OR NEW.wcl_verification<>'review' OR NEW.is_displayed THEN RAISE EXCEPTION 'WCL verification fields are server-managed'; END IF;
  ELSE
   IF ROW(NEW.source,NEW.wcl_character_id,NEW.wcl_canonical_id,NEW.wcl_verified_at,NEW.wcl_verification,NEW.is_displayed) IS DISTINCT FROM ROW(OLD.source,OLD.wcl_character_id,OLD.wcl_canonical_id,OLD.wcl_verified_at,OLD.wcl_verification,OLD.is_displayed) THEN RAISE EXCEPTION 'WCL verification fields are server-managed'; END IF;
   IF OLD.source='wcl' AND ROW(NEW.character_name,NEW.server_name,NEW.server_region,NEW.user_id) IS DISTINCT FROM ROW(OLD.character_name,OLD.server_name,OLD.server_region,OLD.user_id) THEN RAISE EXCEPTION 'Verified identity is server-managed'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_personal_wcl_fields BEFORE INSERT OR UPDATE ON public.user_characters FOR EACH ROW EXECUTE FUNCTION public.guard_personal_wcl_fields();
NOTIFY pgrst,'reload schema';

-- Atomic display switch; service-role endpoint supplies authenticated uid.
CREATE OR REPLACE FUNCTION public.set_personal_display(p_user uuid,p_character uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,186));
 IF p_character IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.user_characters WHERE id=p_character AND user_id=p_user) THEN RAISE EXCEPTION 'Character not owned'; END IF;
 UPDATE public.user_characters SET is_displayed=false WHERE user_id=p_user AND is_displayed;
 IF p_character IS NOT NULL THEN UPDATE public.user_characters SET is_displayed=true WHERE user_id=p_user AND id=p_character; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_personal_display(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_personal_display(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
-- Rollback after disabling REQ186 endpoints:
-- DROP TRIGGER guard_personal_wcl_fields ON public.user_characters;
-- DROP FUNCTION public.guard_personal_wcl_fields();
-- DROP INDEX public.uq_personal_display; DROP INDEX public.uq_personal_wcl_identity;
-- ALTER TABLE public.user_characters DROP COLUMN source,DROP COLUMN wcl_character_id,DROP COLUMN wcl_canonical_id,DROP COLUMN wcl_verified_at,DROP COLUMN wcl_verification,DROP COLUMN is_displayed;

COMMIT;
-- Rollback also: DROP FUNCTION public.set_personal_display(uuid,uuid);
