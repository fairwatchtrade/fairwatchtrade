/* ════════════════════════════════════════════════════════════════════════
   MARKETPLACE CONTROL — founder operations room foundation.

   Four bounded pieces, all additive:

   1. TRUTHFUL ADMIN CLOSURE VOCABULARY
      The governed Pause/Delete machinery records WHO ended a listing's
      availability. Until now only the seller could invoke it, so the causes
      were seller-voiced. Marketplace Control lets the founder operate a
      seller's inventory (dealer-scale bursts), and recording an admin action
      under 'listing_removed_by_seller' would fabricate history. Two new
      causes, existing rows untouched.

   2. FOUNDER AUTHORITY ON THE EXISTING CHOKE POINTS
      remove_listing(), listing_delete_eligibility() and
      delete_listing_permanently() stay the ONLY doors for their transitions —
      no parallel admin copies of destructive logic. The caller gate widens to
      exactly one additional principal: the founder UID. Every other property
      is unchanged and re-stated verbatim from the latest committed
      definitions (20260817080000 / 20260817090000): eligibility, TOCTOU
      locking, tombstone, orphan-media computation, accepted-request
      protection, no-transaction rule. The cause written for closed purchase
      requests is chosen from WHO ACTED — seller acting on their own listing
      keeps the seller cause; the founder acting on another seller's listing
      writes the admin cause. Authentication remains absolute: auth.uid()
      only, no service_role path.

   3. admin_view_preferences
      Per-user presentation/query state for Marketplace Control (last-used
      view, saved Detailed views, column layout). RLS-own. Deliberately NOT
      attached to listings and never able to change product state — it stores
      presentation preferences only, read and written by their owner.

   4. INDEXES THE ROOM'S QUERY PLAN ACTUALLY USES
      (status, created_at DESC) for the lifecycle ledger; pg_trgm GIN on
      brand/model/reference for the room's substring search. Exact
      listing-code lookup already has listings_public_code_key.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

-- ── 1. Truthful admin closure vocabulary (additive) ──────────────────────
ALTER TABLE public.purchase_requests
  DROP CONSTRAINT IF EXISTS purchase_requests_closure_cause_check;
ALTER TABLE public.purchase_requests
  ADD CONSTRAINT purchase_requests_closure_cause_check
  CHECK (closure_cause IS NULL OR closure_cause = ANY (ARRAY[
    'buyer_withdrew',
    'listing_removed_by_seller', 'listing_deleted_by_seller',
    'listing_removed_by_admin',  'listing_deleted_by_admin'
  ]));

ALTER TABLE public.purchase_request_events
  DROP CONSTRAINT IF EXISTS pre_event_type_check;
ALTER TABLE public.purchase_request_events
  ADD CONSTRAINT pre_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'buyer_withdrew',
    'listing_removed_by_seller', 'listing_deleted_by_seller',
    'listing_removed_by_admin',  'listing_deleted_by_admin'
  ]));

-- ── 2a. remove_listing — founder may act; cause follows the actor ────────
CREATE OR REPLACE FUNCTION public.remove_listing(
  p_listing_id  uuid,
  p_reason_code text DEFAULT NULL,
  p_reason_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller    uuid := auth.uid();
  v_founder   constant uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
  v_listing   public.listings%ROWTYPE;
  v_cause     text;
  v_now       timestamptz;
  v_closed    jsonb := '[]'::jsonb;
  v_cancelled int := 0;
  v_accepted  int := 0;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_listing FROM public.listings
   WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  /* The one widening: the founder may take any listing off the market from
     Marketplace Control. Everyone else remains owner-only. */
  IF v_listing.seller_id <> v_caller AND v_caller <> v_founder THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  /* The recorded cause follows WHO ACTED, never which surface posted. The
     founder pausing their own listing is still the seller acting. */
  v_cause := CASE WHEN v_listing.seller_id = v_caller
                  THEN 'listing_removed_by_seller'
                  ELSE 'listing_removed_by_admin' END;

  IF v_listing.status = 'removed' THEN
    RAISE EXCEPTION 'already_removed';
  END IF;

  /* Pause applies to a watch that is on the market or on its way there. A
     draft was never public, so there is nothing to take it off. */
  IF v_listing.status NOT IN ('published', 'reserved', 'pending_review') THEN
    RAISE EXCEPTION 'not_removable:%', v_listing.status;
  END IF;

  /* Optional. Short-circuits on NULL rather than coalescing it — a bare
     NULL NOT IN (...) evaluates to NULL and the coalesce form would reject
     every reasonless Pause. */
  IF p_reason_code IS NOT NULL
     AND p_reason_code NOT IN
         ('sold_in_store','sold_elsewhere','no_longer_for_sale','listing_mistake','other') THEN
    RAISE EXCEPTION 'invalid_reason_code';
  END IF;

  v_now := now();

  UPDATE public.listings SET
    status              = 'removed',
    removed_at          = v_now,
    removal_reason_code = p_reason_code,
    removal_reason_note = left(nullif(btrim(coalesce(p_reason_note, '')), ''), 320)
  WHERE id = p_listing_id;

  /* One statement so the close and its evidence cannot diverge. Unchanged:
     pending requests close and stay closed, accepted requests are never
     touched, and nothing is written to transactions under any reason. */
  WITH closed AS (
    UPDATE public.purchase_requests
       SET status        = 'cancelled',
           closure_cause = v_cause,
           updated_at    = v_now
     WHERE listing_id = p_listing_id
       AND status = 'pending'
    RETURNING id, buyer_id
  ), logged AS (
    INSERT INTO public.purchase_request_events
      (purchase_request_id, event_type, actor_user_id,
       prior_status, resulting_status, metadata)
    SELECT c.id, v_cause, v_caller,
           'pending', 'cancelled',
           jsonb_build_object(
             'listing_id',          p_listing_id,
             'removal_reason_code', p_reason_code)
      FROM closed c
    RETURNING id AS event_id, purchase_request_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'purchase_request_id', l.purchase_request_id,
           'buyer_id',            c.buyer_id,
           'event_id',            l.event_id)), '[]'::jsonb),
         count(*)
    INTO v_closed, v_cancelled
    FROM logged l
    JOIN closed c ON c.id = l.purchase_request_id;

  SELECT count(*) INTO v_accepted
    FROM public.purchase_requests
   WHERE listing_id = p_listing_id AND status = 'accepted';

  RETURN jsonb_build_object(
    'listing_id',                  p_listing_id,
    'status',                      'removed',
    'removed_at',                  v_now,
    'reason_code',                 p_reason_code,
    'closure_cause',               v_cause,
    'requests_cancelled',          v_cancelled,
    'closed_requests',             v_closed,
    'accepted_requests_remaining', v_accepted
  );
END $function$;

REVOKE ALL ON FUNCTION public.remove_listing(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.remove_listing(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.remove_listing(uuid, text, text) IS
  'Takes a watch off the market, reversibly. Owner-only PLUS the founder (Marketplace Control); the closure cause follows who acted (listing_removed_by_seller vs listing_removed_by_admin). Reason optional; a supplied one is validated. Closes PENDING purchase requests with one append-only event each; never touches ACCEPTED ones; writes no transaction. Deletes nothing. PFC274 = 62.';

-- ── 2b. listing_delete_eligibility — founder may ask about any listing ───
CREATE OR REPLACE FUNCTION public.listing_delete_eligibility(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_founder    constant uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
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

  /* A non-owner learns nothing, not even existence — except the founder,
     who operates the marketplace. */
  IF v_caller IS NOT NULL
     AND v_listing.seller_id <> v_caller
     AND v_caller <> v_founder THEN
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

  /* pending is deliberately NOT a blocker — the delete closes them
     permanently, with their own cause. */

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
    'pending_requests_to_close',     v_pending,
    'eligible_for_permanent_delete', jsonb_array_length(v_blockers) = 0,
    'blockers',                      v_blockers,
    'evaluated_at',                  now()
  );
END $function$;

REVOKE ALL ON FUNCTION public.listing_delete_eligibility(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.listing_delete_eligibility(uuid) TO authenticated, service_role;

-- ── 2c. delete_listing_permanently — founder may act; cause follows actor ─
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
  v_founder    constant uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
  v_listing    public.listings%ROWTYPE;
  v_cause      text;
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

  /* Named Security Gate: a non-owner learns nothing, not even existence.
     The founder is the one additional authorized principal. */
  IF v_listing.seller_id <> v_caller AND v_caller <> v_founder THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  /* The recorded cause follows WHO ACTED. */
  v_cause := CASE WHEN v_listing.seller_id = v_caller
                  THEN 'listing_deleted_by_seller'
                  ELSE 'listing_deleted_by_admin' END;

  PERFORM 1 FROM public.purchase_requests
   WHERE listing_id = p_listing_id FOR UPDATE;

  IF p_reason_code IS NOT NULL
     AND p_reason_code NOT IN
         ('sold_in_store','sold_elsewhere','no_longer_for_sale','listing_mistake','other') THEN
    RAISE EXCEPTION 'invalid_reason_code';
  END IF;

  /* TOCTOU RE-CHECK, INSIDE THE LOCK. Fail closed: return the current truth
     and mutate nothing. */
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

  /* Pending offers close permanently, with the actor-truthful cause. */
  WITH closed AS (
    UPDATE public.purchase_requests
       SET status        = 'cancelled',
           closure_cause = v_cause,
           updated_at    = v_now
     WHERE listing_id = p_listing_id
       AND status = 'pending'
    RETURNING id, buyer_id
  ), logged AS (
    INSERT INTO public.purchase_request_events
      (purchase_request_id, event_type, actor_user_id,
       prior_status, resulting_status, metadata)
    SELECT c.id, v_cause, v_caller,
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

  /* ORPHANS ONLY. Computed AFTER the delete, against what survives. A URL
     still referenced by any other listing is NOT returned, because deleting
     it would destroy a live listing's photograph. */
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
    'closure_cause',        v_cause,
    'purge_event_id',       v_purge,
    'deleted_at',           v_now,
    'requests_closed',      v_cancelled,
    'closed_requests',      v_closed,
    'orphan_media',         coalesce(to_jsonb(v_orphans), '[]'::jsonb),
    'media_candidates',     coalesce(array_length(v_candidates, 1), 0)
  );
END $function$;

REVOKE ALL ON FUNCTION public.delete_listing_permanently(uuid, text, text) FROM public, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_listing_permanently(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.delete_listing_permanently(uuid, text, text) IS
  'PHYSICALLY DELETES a listing. Owner-only PLUS the founder (Marketplace Control); the closure cause follows who acted (listing_deleted_by_seller vs listing_deleted_by_admin). Locks the listing and its purchase requests, re-runs canonical eligibility inside that boundary (TOCTOU) and fails closed with zero mutation if blocked. Writes the minimal tombstone, deletes the row so the FK matrix performs the governed purge, and returns ONLY blob URLs no surviving listing references. Writes no transaction. Anon and service_role hold no EXECUTE. PFC274 = 62.';

-- ── 3. Per-user Marketplace Control presentation preferences ─────────────
CREATE TABLE IF NOT EXISTS public.admin_view_preferences (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prefs      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  /* Presentation state only — a runaway client cannot turn this into a
     document store. */
  CONSTRAINT admin_view_preferences_prefs_bounded
    CHECK (pg_column_size(prefs) <= 65536)
);

ALTER TABLE public.admin_view_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS avp_select_own ON public.admin_view_preferences;
CREATE POLICY avp_select_own ON public.admin_view_preferences
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS avp_insert_own ON public.admin_view_preferences;
CREATE POLICY avp_insert_own ON public.admin_view_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS avp_update_own ON public.admin_view_preferences;
CREATE POLICY avp_update_own ON public.admin_view_preferences
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.admin_view_preferences IS
  'Per-user Marketplace Control presentation/query preferences (last-used view, saved Detailed views, column layout). RLS-own. Never changes product state; deliberately not attached to listings.';

-- ── 4. Indexes the room''s query plan actually uses ───────────────────────
CREATE INDEX IF NOT EXISTS listings_status_created_at_idx
  ON public.listings (status, created_at DESC);

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS listings_brand_trgm_idx
  ON public.listings USING gin (brand extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS listings_model_trgm_idx
  ON public.listings USING gin (model extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS listings_reference_trgm_idx
  ON public.listings USING gin (reference extensions.gin_trgm_ops);
