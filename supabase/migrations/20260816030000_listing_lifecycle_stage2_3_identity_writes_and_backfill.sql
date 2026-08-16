/* ════════════════════════════════════════════════════════════════════════
   LISTING LIFECYCLE — STAGES 2 AND 3
   §2 new durable writes are born independently meaningful
   §3 existing production rows are backfilled from live listings

   STILL NON-DESTRUCTIVE. No FK is altered. No row is deleted. History is
   never rewritten — only the previously-absent identity columns are filled.

   ── WHY TRIGGERS RATHER THAN EDITING EVERY CALLER ─────────────────────

   Eight tables must capture subject identity at write time, and their
   inserts are spread across admin routes, RPCs, the Aubrey pipeline, the
   accelerator chain and a lifecycle trigger. Editing each caller would work
   until the next caller is written by someone who does not know the rule —
   and a durable record born without identity is invisible until the day the
   listing is purged and it turns into an orphan.

   A BEFORE INSERT trigger cannot be forgotten by a future writer. This is
   the same reasoning v5.11 used to put the submission lifecycle event on a
   trigger rather than inside the RPC: put the guarantee where the write
   physically happens.

   The trigger is deliberately NON-OVERRIDING. It fills a column only when
   the caller left it NULL, so a caller that already knows better — the way
   purchase_requests has snapshotted identity since v2.27 — keeps its own
   value. It also fails soft: if the listing cannot be read the insert still
   proceeds, because a durable record blocked at write time is a worse
   outcome than one that Stage 4 will flag as missing identity.

   ── WHAT IS NOT COPIED ───────────────────────────────────────────────

   brand, model, reference. Nothing else. No gallery, description, specs,
   details payload, addenda, presentation or wizard state (§5).
   ════════════════════════════════════════════════════════════════════════ */

-- ═══════════════ STAGE 2 — write paths ═══════════════

CREATE OR REPLACE FUNCTION public.capture_listing_subject_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_brand text; v_model text; v_reference text;
BEGIN
  IF NEW.listing_id IS NULL THEN RETURN NEW; END IF;

  -- Caller-supplied identity always wins; this only fills silence.
  IF NEW.listing_brand IS NOT NULL
     AND NEW.listing_model IS NOT NULL
     AND NEW.listing_reference IS NOT NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT l.brand, l.model, l.reference
      INTO v_brand, v_model, v_reference
      FROM public.listings l
     WHERE l.id = NEW.listing_id;
  EXCEPTION WHEN OTHERS THEN
    /* Fail soft, deliberately. A durable record that cannot be written is
       worse than one Stage 4 will report as missing identity. */
    RETURN NEW;
  END;

  NEW.listing_brand     := coalesce(NEW.listing_brand, v_brand);
  NEW.listing_model     := coalesce(NEW.listing_model, v_model);
  NEW.listing_reference := coalesce(NEW.listing_reference, v_reference);
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.capture_listing_subject_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS capture_subject_identity ON public.transactions;
CREATE TRIGGER capture_subject_identity BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.capture_listing_subject_identity();

DROP TRIGGER IF EXISTS capture_subject_identity ON public.listing_decision_events;
CREATE TRIGGER capture_subject_identity BEFORE INSERT ON public.listing_decision_events
  FOR EACH ROW EXECUTE FUNCTION public.capture_listing_subject_identity();

DROP TRIGGER IF EXISTS capture_subject_identity ON public.listing_currency_events;
CREATE TRIGGER capture_subject_identity BEFORE INSERT ON public.listing_currency_events
  FOR EACH ROW EXECUTE FUNCTION public.capture_listing_subject_identity();

DROP TRIGGER IF EXISTS capture_subject_identity ON public.dealer_accelerator_lifecycle_events;
CREATE TRIGGER capture_subject_identity BEFORE INSERT ON public.dealer_accelerator_lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION public.capture_listing_subject_identity();

DROP TRIGGER IF EXISTS capture_subject_identity ON public.listing_integrity_evidence;
CREATE TRIGGER capture_subject_identity BEFORE INSERT ON public.listing_integrity_evidence
  FOR EACH ROW EXECUTE FUNCTION public.capture_listing_subject_identity();

DROP TRIGGER IF EXISTS capture_subject_identity ON public.listing_integrity_reviews;
CREATE TRIGGER capture_subject_identity BEFORE INSERT ON public.listing_integrity_reviews
  FOR EACH ROW EXECUTE FUNCTION public.capture_listing_subject_identity();

DROP TRIGGER IF EXISTS capture_subject_identity ON public.strikes;
CREATE TRIGGER capture_subject_identity BEFORE INSERT ON public.strikes
  FOR EACH ROW EXECUTE FUNCTION public.capture_listing_subject_identity();

DROP TRIGGER IF EXISTS capture_subject_identity ON public.identity_resolution_case;
CREATE TRIGGER capture_subject_identity BEFORE INSERT ON public.identity_resolution_case
  FOR EACH ROW EXECUTE FUNCTION public.capture_listing_subject_identity();

/* ── message_threads.thread_kind (§14) ────────────────────────────────
   Classification becomes a stored fact at birth. A thread created with a
   listing is a listing thread forever, regardless of what later happens to
   that foreign key. Caller-supplied value wins, so a deliberate dealer
   thread that happens to cite a listing is not overridden. */
CREATE OR REPLACE FUNCTION public.capture_thread_kind()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.thread_kind IS NULL THEN
    NEW.thread_kind := CASE WHEN NEW.listing_id IS NOT NULL THEN 'listing' ELSE 'dealer' END;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.capture_thread_kind() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS capture_thread_kind ON public.message_threads;
CREATE TRIGGER capture_thread_kind BEFORE INSERT ON public.message_threads
  FOR EACH ROW EXECUTE FUNCTION public.capture_thread_kind();

-- ═══════════════ STAGE 3 — backfill existing rows ═══════════════
/* Fills ONLY the identity columns Stage 1 added, and only where they are
   NULL. Nothing else is touched: no timestamp, no outcome, no seller
   message, no fingerprint, no hash, no ordering, no status. History is not
   rewritten — it is annotated with the subject it always had.

   Rows whose listing is already gone cannot be backfilled from it and are
   left NULL to be reported by Stage 4, never guessed. */

UPDATE public.transactions t SET
  listing_brand = coalesce(t.listing_brand, l.brand),
  listing_model = coalesce(t.listing_model, l.model),
  listing_reference = coalesce(t.listing_reference, l.reference)
FROM public.listings l WHERE l.id = t.listing_id
  AND (t.listing_brand IS NULL OR t.listing_model IS NULL OR t.listing_reference IS NULL);

UPDATE public.listing_decision_events e SET
  listing_brand = coalesce(e.listing_brand, l.brand),
  listing_model = coalesce(e.listing_model, l.model),
  listing_reference = coalesce(e.listing_reference, l.reference)
FROM public.listings l WHERE l.id = e.listing_id
  AND (e.listing_brand IS NULL OR e.listing_model IS NULL OR e.listing_reference IS NULL);

UPDATE public.listing_currency_events e SET
  listing_brand = coalesce(e.listing_brand, l.brand),
  listing_model = coalesce(e.listing_model, l.model),
  listing_reference = coalesce(e.listing_reference, l.reference)
FROM public.listings l WHERE l.id = e.listing_id
  AND (e.listing_brand IS NULL OR e.listing_model IS NULL OR e.listing_reference IS NULL);

UPDATE public.dealer_accelerator_lifecycle_events e SET
  listing_brand = coalesce(e.listing_brand, l.brand),
  listing_model = coalesce(e.listing_model, l.model),
  listing_reference = coalesce(e.listing_reference, l.reference)
FROM public.listings l WHERE l.id = e.listing_id
  AND (e.listing_brand IS NULL OR e.listing_model IS NULL OR e.listing_reference IS NULL);

UPDATE public.listing_integrity_evidence v SET
  listing_brand = coalesce(v.listing_brand, l.brand),
  listing_model = coalesce(v.listing_model, l.model),
  listing_reference = coalesce(v.listing_reference, l.reference)
FROM public.listings l WHERE l.id = v.listing_id
  AND (v.listing_brand IS NULL OR v.listing_model IS NULL OR v.listing_reference IS NULL);

UPDATE public.listing_integrity_reviews r SET
  listing_brand = coalesce(r.listing_brand, l.brand),
  listing_model = coalesce(r.listing_model, l.model),
  listing_reference = coalesce(r.listing_reference, l.reference)
FROM public.listings l WHERE l.id = r.listing_id
  AND (r.listing_brand IS NULL OR r.listing_model IS NULL OR r.listing_reference IS NULL);

UPDATE public.strikes s SET
  listing_brand = coalesce(s.listing_brand, l.brand),
  listing_model = coalesce(s.listing_model, l.model),
  listing_reference = coalesce(s.listing_reference, l.reference)
FROM public.listings l WHERE l.id = s.listing_id
  AND (s.listing_brand IS NULL OR s.listing_model IS NULL OR s.listing_reference IS NULL);

/* identity_resolution_case: subject identity only.
   ⚠ RESOLVED BLOCKER — the durable Vault RESULT is NOT stored here and is
   NOT snapshotted, because it does not need to be. Proven 2026-08-16:

     · the result lives in identity_resolution_decision (outcome,
       claim_fingerprint, is_current, chain_root_id, supersedes_decision_id,
       reviewed_by/at), linked by case_id;
     · the resolved Vault target lives in identity_resolution_candidate
       (vault_reference_id, vault_variant_id, candidate_role='selected'),
       linked by decision_id;
     · NEITHER table carries any foreign key to listings — measured count 0.

   So the resolution result is ALREADY structurally independent of the
   listing. The only listing coupling in the whole subsystem is
   identity_resolution_case.listing_id. Giving the case its own subject
   identity is therefore sufficient, and inventing a result column here
   would duplicate a durable fact that already stands on its own. */
UPDATE public.identity_resolution_case c SET
  listing_brand = coalesce(c.listing_brand, l.brand),
  listing_model = coalesce(c.listing_model, l.model),
  listing_reference = coalesce(c.listing_reference, l.reference)
FROM public.listings l WHERE l.id = c.listing_id
  AND (c.listing_brand IS NULL OR c.listing_model IS NULL OR c.listing_reference IS NULL);

/* thread_kind for existing threads. A thread that HAS a listing today is a
   listing thread; one that never had one is a dealer thread. This is the
   only moment that distinction can be read directly from the FK, which is
   exactly why it is captured now rather than after constraints move. */
UPDATE public.message_threads SET
  thread_kind = CASE WHEN listing_id IS NOT NULL THEN 'listing' ELSE 'dealer' END
WHERE thread_kind IS NULL;

-- PFC274 = 62 — app/api/evaluate/route.ts is untouched.
