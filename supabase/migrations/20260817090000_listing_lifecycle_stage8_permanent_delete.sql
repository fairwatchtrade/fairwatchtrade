/* ════════════════════════════════════════════════════════════════════════
   STAGE 8 — GOVERNED PERMANENT DELETE. This one actually deletes.

   Delete means delete. No soft-delete graveyard, no live row kept "for
   history", no secret Pause on the way past.

   ── WHAT THE FOREIGN KEYS ALREADY DECIDED ───────────────────────────────

   Stage 5 engineered the retention policy INTO the FK matrix, so a single
   DELETE performs the whole governed purge. Measured, not assumed:

     CASCADE — listing-owned, dies with it
       listing_media, listing_addenda, listing_drafts,
       listing_collector_dossiers, mobile_wizard_sessions, saved_watches,
       saved_search_matches, dealer_accelerator_batch_items

     SET NULL — survives, carrying its own Stage 1 identity snapshot
       purchase_requests, message_threads, notifications

     NO FK — fully durable
       transactions, listing_decision_events, listing_currency_events,
       listing_integrity_evidence, listing_integrity_reviews, strikes,
       identity_resolution_case, dealer_accelerator_lifecycle_events,
       listing_deletion_tombstone

   The buyer's purchase request therefore SURVIVES with listing_id set to
   NULL and its brand/model/reference intact — which is exactly why v2.27
   snapshotted them and why My Offers already prefers the snapshot over the
   join. Nothing downstream has to change for a listing to stop existing.

   ── PENDING REQUESTS ARE NO LONGER A BLOCKER ────────────────────────────

   A merely pending offer must not keep an unwanted listing alive forever.
   Removed from the canonical eligibility set; the delete closes them
   instead, permanently, with their own truthful cause.

   ⚠ ACCEPTED REQUESTS STILL BLOCK, and must never be silently cancelled to
   make a delete pass. That is a live obligation between two people.

   ── THE DELETE HAS ITS OWN VOCABULARY ───────────────────────────────────

   closure_cause / event_type gain 'listing_deleted_by_seller'. Reusing
   listing_removed_by_seller would record that the seller chose Pause when
   they chose Delete — fabricated history, and the exact class of lie this
   lane spent two flights removing. Existing rows are untouched.

   ── TOCTOU ──────────────────────────────────────────────────────────────

   A Stage 7 all-clear is never authority. This function locks the listing
   AND its purchase requests, then re-runs the canonical eligibility inside
   that boundary. If a blocker appeared in between it returns the current
   truth and deletes nothing — no partial mutation, listing untouched.

   ── ⚠ MEDIA IS REFERENCE-COUNTED, AND THIS IS NOT THEORETICAL ───────────

   Measured in production before designing this: listing_media has 105 rows
   and zero shared storage paths — but listings.photos jsonb has THREE URLs
   shared between different listings. k26573 (Omega, published) shares two
   photographs with p53665 (H. Moser, published) and one with f25723.

   Deleting a listing's blobs by simply reading its own photo list would
   therefore have destroyed photographs belonging to a live published
   listing. On the first real purge.

   So candidate URLs are collected BEFORE the row is deleted, and the
   orphan set is computed AFTER it, against what actually survives. Only
   URLs no remaining listing references are returned for blob deletion. This
   is also what makes a retry safe: a second run finds the row already gone
   and returns nothing.

   PFC274 = 62 — app/api/evaluate/route.ts is untouched.
   ════════════════════════════════════════════════════════════════════════ */

-- ── 1. Delete-specific closure vocabulary ────────────────────────────────
ALTER TABLE public.purchase_requests
  DROP CONSTRAINT IF EXISTS purchase_requests_closure_cause_check;
ALTER TABLE public.purchase_requests
  ADD CONSTRAINT purchase_requests_closure_cause_check
  CHECK (closure_cause IS NULL OR closure_cause = ANY (ARRAY[
    'buyer_withdrew', 'listing_removed_by_seller', 'listing_deleted_by_seller'
  ]));

ALTER TABLE public.purchase_request_events
  DROP CONSTRAINT IF EXISTS pre_event_type_check;
ALTER TABLE public.purchase_request_events
  ADD CONSTRAINT pre_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'buyer_withdrew', 'listing_removed_by_seller', 'listing_deleted_by_seller'
  ]));

-- ── 2. Pending stops blocking; everything else about eligibility stands ──
CREATE OR REPLACE FUNCTION public.listing_delete_eligibility(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_listing    public.listings%ROWTYPE;
  v_blockers   jsonb := '[]'::jsonb;
  v_accepted   int;
  v_pending    int;
  v_txn        int;
  v_txn_states text;
  v_wizard     int;
BEGIN
  SELECT * INTO v_listing FROM public.listings WHERE id = p_listing_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF v_caller IS NOT NULL AND v_listing.seller_id <> v_caller THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  SELECT count(*) FILTER (WHERE status = 'accepted'),
         count(*) FILTER (WHERE status = 'pending')
    INTO v_accepted, v_pending
    FROM public.purchase_requests
   WHERE listing_id = p_listing_id;

  /* A live obligation between two people. Never silently cancelled to make
     a delete pass. */
  IF v_accepted > 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'accepted_purchase_request', 'count', v_accepted);
  END IF;

  /* ⚠ pending is deliberately NOT a blocker. It was one while this function
     only had to describe a Pause; for Delete it would let any stranger's
     unanswered offer keep a seller's unwanted listing alive indefinitely.
     The delete closes them permanently instead, with their own cause. */

  SELECT count(*), string_agg(DISTINCT status, ', ' ORDER BY status)
    INTO v_txn, v_txn_states
    FROM public.transactions
   WHERE listing_id = p_listing_id
     AND status NOT IN ('completed', 'cancelled', 'refunded');

  IF v_txn > 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'active_transaction', 'count', v_txn, 'states', v_txn_states);
  END IF;

  SELECT count(*) INTO v_wizard
    FROM public.mobile_wizard_sessions
   WHERE listing_id = p_listing_id AND status = 'active';

  IF v_wizard > 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'active_wizard_session', 'count', v_wizard);
  END IF;

  RETURN jsonb_build_object(
    'listing_id',                    p_listing_id,
    'public_code',                   v_listing.public_code,
    'lifecycle_state',               v_listing.status,
    'is_public',                     v_listing.status = 'published',
    'removal_reason_code',           v_listing.removal_reason_code,
    /* Not a blocker — a consequence, so the confirmation can say how many
       people are about to have their offer closed. */
    'pending_requests_to_close',     v_pending,
    'eligible_for_permanent_delete', jsonb_array_length(v_blockers) = 0,
    'blockers',                      v_blockers,
    'evaluated_at',                  now()
  );
END $function$;

REVOKE ALL ON FUNCTION public.listing_delete_eligibility(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.listing_delete_eligibility(uuid) TO authenticated, service_role;

-- ── 3. The destructive operation ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_listing_permanently(
  p_listing_id  uuid,
  p_reason_code text DEFAULT NULL,
  p_reason_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_listing    public.listings%ROWTYPE;
  v_elig       jsonb;
  v_now        timestamptz;
  v_purge      uuid := gen_random_uuid();
  v_closed     jsonb := '[]'::jsonb;
  v_cancelled  int := 0;
  v_candidates text[];
  v_orphans    text[];
BEGIN
  /* Destructive, so authentication is absolute — no service_role path. */
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  /* THE DESTRUCTIVE BOUNDARY OPENS HERE. The listing is locked, and so is
     every purchase request against it, so an offer cannot be accepted
     between the eligibility re-check and the delete. */
  SELECT * INTO v_listing FROM public.listings
   WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  /* Named Security Gate: a non-owner learns nothing, not even existence. */
  IF v_listing.seller_id <> v_caller THEN RAISE EXCEPTION 'not_found'; END IF;

  PERFORM 1 FROM public.purchase_requests
   WHERE listing_id = p_listing_id FOR UPDATE;

  IF p_reason_code IS NOT NULL
     AND p_reason_code NOT IN
         ('sold_in_store','sold_elsewhere','no_longer_for_sale','listing_mistake','other') THEN
    RAISE EXCEPTION 'invalid_reason_code';
  END IF;

  /* ── TOCTOU RE-CHECK, INSIDE THE LOCK ──────────────────────────────────
     Whatever the UI was told earlier is irrelevant. Fail closed: return the
     current truth and mutate nothing. */
  v_elig := public.listing_delete_eligibility(p_listing_id);

  IF (v_elig ->> 'eligible_for_permanent_delete')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'deleted',     false,
      'reason',      'blocked',
      'eligibility', v_elig
    );
  END IF;

  v_now := now();

  /* Candidates FIRST — the cascade is about to take listing_media, and the
     row carrying photos is about to stop existing. */
  SELECT array_agg(DISTINCT u) INTO v_candidates
    FROM (
      SELECT m.storage_path AS u
        FROM public.listing_media m
       WHERE m.listing_id = p_listing_id AND m.storage_path IS NOT NULL
      UNION
      SELECT e -> 'photo' ->> 'url'
        FROM jsonb_array_elements(coalesce(v_listing.photos, '[]'::jsonb)) e
    ) s
   WHERE u IS NOT NULL AND u <> '';

  /* Pending offers close permanently, with their OWN cause. They do not
     revive if a similar watch is listed later — the request concerned this
     listing, and this listing is about to stop existing. */
  WITH closed AS (
    UPDATE public.purchase_requests
       SET status        = 'cancelled',
           closure_cause = 'listing_deleted_by_seller',
           updated_at    = v_now
     WHERE listing_id = p_listing_id
       AND status = 'pending'
    RETURNING id, buyer_id
  ), logged AS (
    INSERT INTO public.purchase_request_events
      (purchase_request_id, event_type, actor_user_id,
       prior_status, resulting_status, metadata)
    SELECT c.id, 'listing_deleted_by_seller', v_caller,
           'pending', 'cancelled',
           jsonb_build_object('listing_id', p_listing_id,
                              'purge_event_id', v_purge)
      FROM closed c
    RETURNING id AS event_id, purchase_request_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'purchase_request_id', l.purchase_request_id,
           'buyer_id',            c.buyer_id,
           'event_id',            l.event_id)), '[]'::jsonb),
         count(*)
    INTO v_closed, v_cancelled
    FROM logged l JOIN closed c ON c.id = l.purchase_request_id;

  /* Minimal audit truth. Deliberately NOT a listing archive — no photos, no
     description, no specs. Which watch, whose, when, why. */
  INSERT INTO public.listing_deletion_tombstone
    (listing_id, public_code, seller_id, listing_brand, listing_model,
     listing_reference, removal_reason_code, deleted_at, purge_event_id)
  VALUES
    (p_listing_id, v_listing.public_code, v_listing.seller_id,
     v_listing.brand, v_listing.model, v_listing.reference,
     p_reason_code, v_now, v_purge)
  ON CONFLICT (listing_id) DO NOTHING;

  /* THE DELETE. Cascades take everything listing-owned; SET NULL releases
     the records that carry their own identity; the no-FK tables never
     noticed. */
  DELETE FROM public.listings WHERE id = p_listing_id;

  /* ⚠ ORPHANS ONLY. Computed AFTER the delete, against what survives. A URL
     still referenced by any other listing is NOT returned, because deleting
     it would destroy a live listing's photograph — three such URLs exist in
     production today. */
  SELECT array_agg(c) INTO v_orphans
    FROM unnest(coalesce(v_candidates, ARRAY[]::text[])) AS c
   WHERE NOT EXISTS (
           SELECT 1 FROM public.listing_media m WHERE m.storage_path = c)
     AND NOT EXISTS (
           SELECT 1 FROM public.listings l,
                LATERAL jsonb_array_elements(coalesce(l.photos,'[]'::jsonb)) e
            WHERE e -> 'photo' ->> 'url' = c);

  RETURN jsonb_build_object(
    'deleted',              true,
    'listing_id',           p_listing_id,
    'public_code',          v_listing.public_code,
    'brand',                v_listing.brand,
    'model',                v_listing.model,
    'reference',            v_listing.reference,
    'reason_code',          p_reason_code,
    'purge_event_id',       v_purge,
    'deleted_at',           v_now,
    'requests_closed',      v_cancelled,
    'closed_requests',      v_closed,
    /* Safe to delete from object storage. Never a shared blob. */
    'orphan_media',         coalesce(to_jsonb(v_orphans), '[]'::jsonb),
    'media_candidates',     coalesce(array_length(v_candidates, 1), 0)
  );
END $function$;

REVOKE ALL ON FUNCTION public.delete_listing_permanently(uuid, text, text) FROM public, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_listing_permanently(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.delete_listing_permanently(uuid, text, text) IS
  'Stage 8. PHYSICALLY DELETES a seller''s listing. Locks the listing and its purchase requests, re-runs canonical eligibility inside that boundary (TOCTOU) and fails closed with zero mutation if blocked. Closes pending requests with closure_cause=listing_deleted_by_seller (never the Pause cause), writes the minimal tombstone, deletes the row so Stage 5 cascades and SET NULLs perform the governed purge, and returns ONLY blob URLs no surviving listing references. Writes no transaction: an external-sale reason never creates a FairWatchTrade sale. Seller-only; anon and service_role hold no EXECUTE. PFC274 = 62.';
