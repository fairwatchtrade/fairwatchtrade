/* ════════════════════════════════════════════════════════════════════════
   PAUSE TAKES NO REASON.

   THE PRODUCT LAW

     Pause  = "keep the listing, stop selling it for now."
     Delete = "I'm finished with this listing permanently."

   Sibling actions. Neither is a prerequisite for the other.

   WHY THE REASON LEAVES

   Every reason in the governed set describes a watch leaving for GOOD —
   sold in my store, sold on another website, listing mistake / duplicate.
   They read wrong under Pause because they were written when Remove was the
   only exit, and the reason field was carrying the "why did this watch leave
   the market" question that belongs to the irreversible action.

   Pause does not need one. The reason IS the action: the seller cannot find
   the watch in the safe right now. Making them categorise a temporary,
   reversible toggle is friction for nothing, and every category on offer
   would have been a lie about a watch that is coming back.

   The vocabulary is not deleted — it is waiting. Delete inherits it when
   Stage 8 builds the final confirmation, which is the moment where "why did
   this leave for good" is a question actually worth asking.

   ⚠ HISTORY IS NOT REWRITTEN. p_reason_code becomes OPTIONAL, not forbidden.
   Listings paused before today keep the reason they were genuinely recorded
   with — z99216 really was taken down under the old Remove semantics with
   sold_in_store, and pretending its seller chose a reasonless Pause would be
   inventing a past. The column CHECK is untouched, so a stored reason stays
   valid and a supplied one is still validated. Only the requirement is gone.

   ⚠ THE NULL TRAP, AGAIN. The old guard read
     coalesce(p_reason_code,'') NOT IN (...)
   because a bare `NULL NOT IN (...)` evaluates to NULL rather than true and
   would have slipped past. Now that NULL is legal, the guard must short-
   circuit on it explicitly rather than coalesce it into a value that fails.
   `p_reason_code IS NOT NULL AND p_reason_code NOT IN (...)` is safe; the
   coalesce form would have started rejecting every reasonless Pause.

   Internal vocabulary — status='removed', remove_listing(), the
   listing_removed_by_seller closure cause — stays implementation detail by
   ruling. No schema-renaming exercise here.

   PFC274 = 62 — app/api/evaluate/route.ts is untouched.
   ════════════════════════════════════════════════════════════════════════ */

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
  v_listing   public.listings%ROWTYPE;
  v_now       timestamptz;
  v_closed    jsonb := '[]'::jsonb;
  v_cancelled int := 0;
  v_accepted  int := 0;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_listing FROM public.listings
   WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_listing.seller_id <> v_caller THEN RAISE EXCEPTION 'not_allowed'; END IF;

  IF v_listing.status = 'removed' THEN
    RAISE EXCEPTION 'already_removed';
  END IF;

  /* Pause applies to a watch that is on the market or on its way there. A
     draft was never public, so there is nothing to take it off. */
  IF v_listing.status NOT IN ('published', 'reserved', 'pending_review') THEN
    RAISE EXCEPTION 'not_removable:%', v_listing.status;
  END IF;

  /* Optional now. Short-circuits on NULL rather than coalescing it — see the
     header; the old coalesce form would reject every reasonless Pause. */
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
           closure_cause = 'listing_removed_by_seller',
           updated_at    = v_now
     WHERE listing_id = p_listing_id
       AND status = 'pending'
    RETURNING id, buyer_id
  ), logged AS (
    INSERT INTO public.purchase_request_events
      (purchase_request_id, event_type, actor_user_id,
       prior_status, resulting_status, metadata)
    SELECT c.id, 'listing_removed_by_seller', v_caller,
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
    'requests_cancelled',          v_cancelled,
    'closed_requests',             v_closed,
    'accepted_requests_remaining', v_accepted
  );
END $function$;

REVOKE ALL ON FUNCTION public.remove_listing(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.remove_listing(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.remove_listing(uuid, text, text) IS
  'Seller PAUSES a listing — takes the watch off the market while keeping the listing, reversibly. Reason is OPTIONAL (Pause asks for none; the exit-reason vocabulary belongs to Delete at Stage 8), but a supplied one is still validated and historical reasons are preserved. Closes PENDING purchase requests with closure_cause=listing_removed_by_seller plus one append-only event each; never touches ACCEPTED ones; writes no transaction and no notification. Deletes nothing. Internal name and status value remain implementation detail. PFC274 = 62.';
