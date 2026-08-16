/* ════════════════════════════════════════════════════════════════════════
   PRE-STAGE-5 SEAM CHECKS 1 AND 2. No FK altered, no row deleted.

   1. DURABLE IDENTITY CAPTURE NOW FAILS CLOSED

   Stage 2's trigger failed SOFT: an uncapturable identity still wrote the
   row and left Stage 4 to notice afterwards. That was correct while nothing
   could be deleted, and wrong the moment FKs start moving — the orphan it
   permits is exactly what a purge would then make permanent. A durable row
   that would depend solely on the live listing must not come into existence.

   ⚠ REQUIRED IDENTITY IS brand + reference, NOT model. Measured on
   production: listings.brand and listings.reference are NOT NULL,
   listings.model is NULLABLE. Requiring model would reject legitimate
   watches that genuinely have no model name — inventing a requirement the
   data does not support, which is the same sin as fabricating identity.

   A NULL listing_id passes untouched. Those are legitimate no-listing
   subjects (auction-lot identity cases, dealer-relationship threads) and the
   order forbids fabricating identity for them.

   UPDATE is guarded as well as INSERT, so identity cannot be nulled out
   after the fact.

   The error is named and diagnosable rather than a bare constraint
   violation: it reports table, listing_id, whether the listing resolved at
   all, and which fields were missing.

   PROVEN 2026-08-16 by controlled failure, using a listing_id that resolves
   to nothing (BEFORE INSERT fires ahead of FK validation, so the guard
   speaks first and nothing is written):

     durable_identity_capture_failed: table=listing_decision_events
     listing_id=11111111-... listing_found=<NULL> missing=brand,reference

   2. service_role LOSES DIRECT PHYSICAL DELETION AUTHORITY

   Searched before changing: no server route, RPC or script deletes a listing
   via the service key — only lib/supabase/service.ts and
   scripts/enrich-vault.ts use that role at all, and neither deletes
   listings. postgres retains administrative authority, and the Stage 9 purge
   RPC will be SECURITY DEFINER owned by postgres, so it needs no caller
   privilege.

   After this, physical deletion of a listing is reachable by no application
   role at all.
   ════════════════════════════════════════════════════════════════════════ */

CREATE OR REPLACE FUNCTION public.capture_listing_subject_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_brand text; v_model text; v_reference text; v_found boolean := false;
BEGIN
  IF NEW.listing_id IS NULL THEN RETURN NEW; END IF;

  SELECT l.brand, l.model, l.reference, true
    INTO v_brand, v_model, v_reference, v_found
    FROM public.listings l WHERE l.id = NEW.listing_id;

  NEW.listing_brand     := coalesce(NEW.listing_brand, v_brand);
  NEW.listing_model     := coalesce(NEW.listing_model, v_model);
  NEW.listing_reference := coalesce(NEW.listing_reference, v_reference);

  IF NEW.listing_brand IS NULL OR NEW.listing_reference IS NULL THEN
    RAISE EXCEPTION
      'durable_identity_capture_failed: table=% listing_id=% listing_found=% missing=%',
      TG_TABLE_NAME, NEW.listing_id, v_found,
      concat_ws(',',
        CASE WHEN NEW.listing_brand IS NULL THEN 'brand' END,
        CASE WHEN NEW.listing_reference IS NULL THEN 'reference' END)
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.capture_listing_subject_identity() FROM PUBLIC, anon, authenticated;

/* BEFORE UPDATE guards on all eight durable tables. The Stage 2 INSERT
   triggers already exist; these stop identity being nulled out later. */
DROP TRIGGER IF EXISTS capture_subject_identity_upd ON public.transactions;
CREATE TRIGGER capture_subject_identity_upd BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.capture_listing_subject_identity();

DROP TRIGGER IF EXISTS capture_subject_identity_upd ON public.listing_decision_events;
CREATE TRIGGER capture_subject_identity_upd BEFORE UPDATE ON public.listing_decision_events
  FOR EACH ROW EXECUTE FUNCTION public.capture_listing_subject_identity();

DROP TRIGGER IF EXISTS capture_subject_identity_upd ON public.listing_currency_events;
CREATE TRIGGER capture_subject_identity_upd BEFORE UPDATE ON public.listing_currency_events
  FOR EACH ROW EXECUTE FUNCTION public.capture_listing_subject_identity();

DROP TRIGGER IF EXISTS capture_subject_identity_upd ON public.dealer_accelerator_lifecycle_events;
CREATE TRIGGER capture_subject_identity_upd BEFORE UPDATE ON public.dealer_accelerator_lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION public.capture_listing_subject_identity();

DROP TRIGGER IF EXISTS capture_subject_identity_upd ON public.listing_integrity_evidence;
CREATE TRIGGER capture_subject_identity_upd BEFORE UPDATE ON public.listing_integrity_evidence
  FOR EACH ROW EXECUTE FUNCTION public.capture_listing_subject_identity();

DROP TRIGGER IF EXISTS capture_subject_identity_upd ON public.listing_integrity_reviews;
CREATE TRIGGER capture_subject_identity_upd BEFORE UPDATE ON public.listing_integrity_reviews
  FOR EACH ROW EXECUTE FUNCTION public.capture_listing_subject_identity();

DROP TRIGGER IF EXISTS capture_subject_identity_upd ON public.strikes;
CREATE TRIGGER capture_subject_identity_upd BEFORE UPDATE ON public.strikes
  FOR EACH ROW EXECUTE FUNCTION public.capture_listing_subject_identity();

DROP TRIGGER IF EXISTS capture_subject_identity_upd ON public.identity_resolution_case;
CREATE TRIGGER capture_subject_identity_upd BEFORE UPDATE ON public.identity_resolution_case
  FOR EACH ROW EXECUTE FUNCTION public.capture_listing_subject_identity();

-- Seam check 2.
REVOKE DELETE   ON public.listings FROM service_role;
REVOKE TRUNCATE ON public.listings FROM service_role;

-- PFC274 = 62 — app/api/evaluate/route.ts is untouched.
