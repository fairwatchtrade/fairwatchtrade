/* ════════════════════════════════════════════════════════════════════════
   DEALER ATTESTED ACTS — the three confirmations become a server requirement

   WHAT THIS CLOSES

   v5.11 cut the submission ceremony from six checkboxes to three, on the
   finding that the RPC never inspected any of them. It cut the right ones,
   but it left the finding itself standing: the three survivors still gated
   only the React button. Anything that reached the route without the
   workspace — the ordinary Listings tab, a replayed request, curl — skipped
   the attestation entirely and still earned a fingerprint stamp.

   A confirmation the server does not require is not an attestation. It is a
   habit the interface asks for.

   After this migration an IMPORTED listing cannot enter pending_review
   unless the caller asserts all three acts, and the acts are recorded on the
   row alongside the attestation they belong to.

   WHAT IS DELIBERATELY NOT CHANGED

   The fingerprint. Not one byte of the 14-frame canonical text moves, so
   every fingerprint minted before this migration stays verifiable by the
   same lib/attestation.ts it always was. The acts ride BESIDE the
   fingerprint, never inside it — the alternative (a v3 frame) would mean a
   third canonical version mirrored byte-for-byte in TypeScript, and
   retyping machinery that has been proven four times through a real dealer
   account, to record something the frame does not need to carry.

   WHY DROP AND CREATE RATHER THAN CREATE OR REPLACE

   CREATE OR REPLACE cannot add a parameter. Adding an overload instead
   would leave submit_listing_for_review(uuid) alive as an unattested door
   into the same transition — precisely the hole being closed — and a
   one-argument call would then be ambiguous. So the single-argument form is
   dropped and the two-argument form replaces it outright. DROP discards the
   function's grants, so they are re-issued below verbatim.

   WHAT THE SERVER CAN AND CANNOT VERIFY

   It can verify that the act was performed, by this caller, against this
   exact listing state — the acts are written in the same transaction and at
   the same instant as the fingerprint that binds the payload. It cannot
   verify that the claim is TRUE. No schema can. The photographs really
   showing the watch is a fact only the dealer holds; what this records is
   that they were asked, and answered, about this specific submission.

   ORDINARY SELLERS ARE UNAFFECTED. p_attested_acts defaults to NULL and is
   read only on the imported path. A manual draft submits exactly as before —
   the route is shared with AccountDashboard, which sends no body at all.

   An IMPORTED draft submitted from the ordinary Listings tab now fails with
   attestation_required rather than quietly succeeding. That is the intended
   consequence, not a regression: imported drafts are submitted from the
   Imported Drafts workspace, which is where the three confirmations live.

   PFC274 = 62 — app/api/evaluate/route.ts is untouched.

   Rollback: supabase/migrations/20260815233000_dealer_attested_acts.rollback.sql
   ════════════════════════════════════════════════════════════════════════ */

-- ── 1. Where the acts live ─────────────────────────────────────────────
-- Current state, matching dealer_attested_at/_by/_fingerprint: a
-- resubmission overwrites it. HISTORY is the lifecycle event in §4, which
-- is append-only and survives the overwrite.
--
-- No UPDATE grant is issued for this column. v2.21 revoked table-level
-- UPDATE on listings from authenticated and granted an explicit whitelist
-- of commercial-truth columns; a new column therefore arrives unwritable by
-- any client session, which is the correct default for an attestation
-- record. The SECURITY DEFINER function below is the only writer.
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS dealer_attested_acts jsonb;

COMMENT ON COLUMN public.listings.dealer_attested_acts IS
  'Which attestation acts the dealer performed at the most recent submission, and under which act-set version. Written only by submit_listing_for_review(). Beside the fingerprint, never inside it. Current state — the append-only history is dealer_accelerator_lifecycle_events.listing_submitted_for_review.';

-- ── 2. The transition, now attested ────────────────────────────────────
DROP FUNCTION IF EXISTS public.submit_listing_for_review(uuid);

CREATE FUNCTION public.submit_listing_for_review(
  p_listing_id    uuid,
  p_attested_acts jsonb DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller       uuid := auth.uid();
  v_listing      public.listings%ROWTYPE;
  v_is_imported  boolean;
  v_prior_status text;
  v_canonical    text;
  v_fingerprint  text;
  v_acts         jsonb;
  v_missing      text[];
  v_now          timestamptz;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_listing FROM public.listings
   WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_listing.seller_id <> v_caller THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF v_listing.status NOT IN ('draft','rejected') THEN
    RAISE EXCEPTION 'invalid_transition:%', v_listing.status;
  END IF;

  -- Origin determined INTERNALLY from trusted provenance, never from caller.
  v_is_imported := EXISTS (SELECT 1 FROM public.listing_media
                            WHERE listing_id = p_listing_id
                              AND capture_source = 'dealer_import');

  IF v_is_imported THEN
    IF coalesce(v_listing.details->>'availability','') <> 'In Stock' THEN
      RAISE EXCEPTION 'not_available_for_submission';
    END IF;

    /* ── THE THREE ACTS ────────────────────────────────────────────────
       The facts FairWatchTrade cannot determine for itself and the dealer
       uniquely can. Each must be asserted true; anything else — absent,
       null, false, a string, a missing body — is a refusal, and the
       exception names exactly which ones so the interface can point at
       them rather than saying "something is wrong".

       Order is fixed so the message reads the same way every time.

       Compared as TEXT rather than cast to boolean on purpose: a cast of
       an unexpected value ('yes', 4, an array) raises invalid_text_
       representation, which would surface as a 500 and hide the real
       answer. A malformed act is not a server fault — it is a refused
       attestation, and it should read as one. */
    v_missing := ARRAY[]::text[];
    IF (p_attested_acts->>'photographs') IS DISTINCT FROM 'true' THEN
      v_missing := v_missing || 'photographs';
    END IF;
    IF (p_attested_acts->>'price') IS DISTINCT FROM 'true' THEN
      v_missing := v_missing || 'price';
    END IF;
    IF (p_attested_acts->>'condition') IS DISTINCT FROM 'true' THEN
      v_missing := v_missing || 'condition';
    END IF;
    IF array_length(v_missing, 1) IS NOT NULL THEN
      RAISE EXCEPTION 'attestation_incomplete:%', array_to_string(v_missing, ',');
    END IF;

    /* Recorded as the SET that was required and performed, with its
       version — not as three booleans that a passing gate guarantees are
       all true. Storing constants preserves a constant; storing the act
       set preserves which questions this submission actually answered,
       which is the thing that changes when the ceremony changes. */
    v_acts := jsonb_build_object(
      'version', 1,
      'acts',    jsonb_build_array('photographs','price','condition'));

    -- 13-field length-prefixed canonical text (the v1 frame body). Contract
    -- mirrored byte-for-byte in lib/attestation.ts — any change here REQUIRES
    -- a matching change there. UNCHANGED by this migration.
    -- frame(s) = octet_length_utf8(s) ':' s ; fields concatenated, no separator.
    v_canonical :=
         octet_length(convert_to(coalesce(v_listing.brand,''),'UTF8'))::text || ':' || coalesce(v_listing.brand,'')
      || octet_length(convert_to(coalesce(v_listing.model,''),'UTF8'))::text || ':' || coalesce(v_listing.model,'')
      || octet_length(convert_to(coalesce(v_listing.reference,''),'UTF8'))::text || ':' || coalesce(v_listing.reference,'')
      || octet_length(convert_to(coalesce(v_listing.year,''),'UTF8'))::text || ':' || coalesce(v_listing.year,'')
      || octet_length(convert_to(coalesce(v_listing.condition,''),'UTF8'))::text || ':' || coalesce(v_listing.condition,'')
      || octet_length(convert_to(coalesce(trim_scale(v_listing.asking_price)::text,''),'UTF8'))::text || ':' || coalesce(trim_scale(v_listing.asking_price)::text,'')
      || octet_length(convert_to(coalesce(v_listing.provenance_note,''),'UTF8'))::text || ':' || coalesce(v_listing.provenance_note,'')
      || octet_length(convert_to(coalesce(v_listing.description,''),'UTF8'))::text || ':' || coalesce(v_listing.description,'')
      || octet_length(convert_to(CASE WHEN v_listing.has_bracelet THEN 'true' ELSE 'false' END,'UTF8'))::text || ':' || CASE WHEN v_listing.has_bracelet THEN 'true' ELSE 'false' END
      || octet_length(convert_to(coalesce(v_listing.details->>'availability',''),'UTF8'))::text || ':' || coalesce(v_listing.details->>'availability','')
      || (SELECT octet_length(convert_to(s,'UTF8'))::text || ':' || s FROM (
            SELECT coalesce(string_agg(
              octet_length(convert_to(x.v,'UTF8'))::text || ':' || x.v, '' ORDER BY x.o), '') AS s
            FROM jsonb_array_elements_text(
              coalesce(v_listing.details->'includedWithWatch','[]'::jsonb)
            ) WITH ORDINALITY AS x(v,o)) t)
      || octet_length(convert_to(coalesce(v_listing.details->>'includedNotes',''),'UTF8'))::text || ':' || coalesce(v_listing.details->>'includedNotes','')
      || (SELECT octet_length(convert_to(s,'UTF8'))::text || ':' || s FROM (
            SELECT coalesce(string_agg(
              octet_length(convert_to(p.e->'photo'->>'url','UTF8'))::text || ':' || (p.e->'photo'->>'url'), '' ORDER BY p.o), '') AS s
            FROM jsonb_array_elements(coalesce(v_listing.photos,'[]'::jsonb))
            WITH ORDINALITY AS p(e,o)
            -- v2.21b: exclude missing/NULL, empty, and whitespace-only urls.
            -- '\S' = at least one non-whitespace character; NULL fails it.
            -- Surviving urls hash their ORIGINAL bytes, untrimmed.
            WHERE p.e->'photo'->>'url' ~ '\S') t);

    -- Fingerprint frame is selected by the ROW'S OWN CURRENCY (Money Truth §10):
    --   currency NULL -> v1: hash of the 13-field text above, byte-identical to
    --                   every pre-activation stamp.
    --   currency set  -> v2: the canonical Stage A implementation (version
    --                   frame + the same 13 fields + currency as field 14).
    -- A v2 stamp with NULL currency is structurally unreachable here.
    -- Contract mirrored byte-for-byte in lib/attestation.ts (both frames);
    -- any change here REQUIRES a matching change there.
    IF v_listing.asking_currency IS NULL THEN
      v_fingerprint := encode(sha256(convert_to(v_canonical,'UTF8')),'hex');
    ELSE
      v_fingerprint := public.listing_attestation_fingerprint_v2(v_listing.id);
    END IF;
  END IF;

  v_prior_status := v_listing.status;
  v_now := now();  -- captured ONCE, reused for write and return

  UPDATE public.listings SET
    status                      = 'pending_review',
    dealer_attested_at          = CASE WHEN v_is_imported THEN v_now         ELSE dealer_attested_at          END,
    dealer_attested_by          = CASE WHEN v_is_imported THEN v_caller      ELSE dealer_attested_by          END,
    dealer_attested_fingerprint = CASE WHEN v_is_imported THEN v_fingerprint ELSE dealer_attested_fingerprint END,
    dealer_attested_acts        = CASE WHEN v_is_imported THEN v_acts        ELSE dealer_attested_acts        END,
    rejection_reason            = NULL,
    -- v2.24: a resubmission answers the clarification — the active note clears.
    seller_clarification_note   = NULL
  WHERE id = p_listing_id;

  RETURN jsonb_build_object(
    'listing_id',   p_listing_id,
    'status',       'pending_review',
    'imported',     v_is_imported,
    'resubmission', v_prior_status = 'rejected',
    'attested_at',  CASE WHEN v_is_imported THEN v_now ELSE NULL END,
    'attested_acts', CASE WHEN v_is_imported THEN v_acts ELSE NULL END);
END $function$;

-- ── 3. Grants, re-issued verbatim (DROP discarded them) ────────────────
REVOKE ALL ON FUNCTION public.submit_listing_for_review(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_listing_for_review(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.submit_listing_for_review(uuid, jsonb) IS
  'Dealer submission + attestation stamp. Imported listings require all three attested acts (photographs, price, condition) or raise attestation_incomplete. Fingerprint frame selected by the row''s currency: NULL -> v1 (13 frames, legacy-identical), set -> v2 via listing_attestation_fingerprint_v2 (15 frames). Mirrored in lib/attestation.ts. The acts sit beside the fingerprint and are NOT part of the canonical text.';

-- ── 4. The history line carries the acts too ───────────────────────────
-- Same trigger, same fail-open contract (see
-- 20260815190000_dealer_submission_lifecycle_event.sql for the full
-- reasoning). One field added: what was attested, not merely that it was.
CREATE OR REPLACE FUNCTION public.log_dealer_submission_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_batch_item uuid;
BEGIN
  /* A dealer submitting their OWN listing. An admin or system transition
     into pending_review is not a dealer attestation and is not logged here
     as one. */
  IF v_caller IS NULL OR v_caller <> NEW.seller_id THEN
    RETURN NEW;
  END IF;

  /* Imported identity comes from trusted provenance, never from a caller
     claim — the same unforgeable marker the RPC and the workspace use. */
  IF NOT EXISTS (
    SELECT 1 FROM public.listing_media
     WHERE listing_id = NEW.id AND capture_source = 'dealer_import'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT bi.id INTO v_batch_item
    FROM public.dealer_accelerator_batch_items bi
   WHERE bi.listing_id = NEW.id
   ORDER BY bi.id
   LIMIT 1;

  /* No accelerator context to hang the event on. Skip it rather than abort
     a legitimate submission. */
  IF v_batch_item IS NULL THEN
    RETURN NEW;
  END IF;

  /* FAIL-OPEN, DELIBERATELY. This trigger sits on public.listings — every
     seller submission on the platform passes through it. A submission must
     never fail for want of a log entry. */
  BEGIN
  INSERT INTO public.dealer_accelerator_lifecycle_events (
    batch_item_id, dealer_profile_id, listing_id, entity_kind, event_type,
    prior_state, resulting_state, actor_kind, actor_user_id, metadata
  ) VALUES (
    v_batch_item, NEW.seller_id, NEW.id, 'item', 'listing_submitted_for_review',
    OLD.status, NEW.status, 'dealer', v_caller,
    /* The fingerprint remains the load-bearing field: a SHA-256 over the 14
       canonical frames, binding the actual payload the dealer confirmed.
       attested_acts records which questions the server REQUIRED and the
       dealer answered at this submission — append-only, so a later
       resubmission under a different act set cannot overwrite what this one
       asked. Before the acts became a server requirement this field is
       absent, and that absence is itself the truthful record. */
    jsonb_build_object(
      'availability',            NEW.details->>'availability',
      'attestation_fingerprint', NEW.dealer_attested_fingerprint,
      'fingerprint_version',     CASE WHEN NEW.asking_currency IS NULL
                                      THEN 'v1' ELSE 'v2' END,
      'attested_acts',           NEW.dealer_attested_acts,
      'ceremony',                'complete',
      'resubmission',            OLD.status = 'rejected'
    )
  );
  EXCEPTION WHEN OTHERS THEN
    /* Swallowed on purpose — see FAIL-OPEN above. */
    NULL;
  END;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.log_dealer_submission_event() FROM PUBLIC, anon, authenticated, service_role;
