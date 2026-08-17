/* ════════════════════════════════════════════════════════════════════════
   BUYER OFFER DISMISSAL — the collector clears a finished card from their
   own My Offers view.

   THE MISCONCEPTION THIS FILE EXISTS TO KILL

     Dismissing a card is not a lifecycle event.

   Nothing about the purchase request changes. Its status stays what it was,
   its closure_cause stays what it was, its history stays where it is, and
   the seller and the founder see exactly what they saw before. The only
   thing that changes is whether ONE person is still looking at it.

   So this writes a column, not an event. It deliberately does NOT append to
   purchase_request_events, whose entire vocabulary is lifecycle transitions
   carrying prior_status -> resulting_status. There is no transition here.
   This is the same call Stage 6 made when it kept the seller's removal
   reason off listing_decision_events: a table whose words mean one kind of
   thing must not be taught to mean another. Overloading a state vocabulary
   is precisely how 'cancelled' came to mean two different things and cost
   this project a whole flight to unpick.

   PRESERVATION IS NOT VISIBILITY. The record is permanent; its presence on
   one working surface is not.

   WHY AN RPC, AND WHAT THE GRANT AUDIT ACTUALLY SAID

   Measured before designing this: purchase_requests has NO update grant and
   NO update policy for anon or authenticated. Its only policies are
   "insert own" and "select own". A client session therefore cannot write
   this column by any path, and the correct answer is a controlled function
   rather than a new UPDATE grant — the same door withdraw_purchase_request
   uses. No table permission is loosened by this migration.

   ⚠ ELIGIBILITY IS DELIBERATELY NARROW. Only the two outcomes Jason
   authorised: a request the seller declined, and a request closed because
   the seller removed the listing. 'expired' and 'superseded' are also
   terminal and were explicitly NOT included. Widening this set is a product
   decision, not a refactor.

   PFC274 = 62 — app/api/evaluate/route.ts is untouched.
   ════════════════════════════════════════════════════════════════════════ */

-- ── 1. The buyer's own view state, on the buyer's own request ────────────
/* One buyer per request, so the fact belongs on the row — no join table.
   NULL means "still in my view", which is the correct default for every
   existing row and needs no backfill. */
ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS buyer_dismissed_at timestamptz;

COMMENT ON COLUMN public.purchase_requests.buyer_dismissed_at IS
  'When the BUYER cleared this finished request from their own My Offers view. A view preference, not a lifecycle fact: status, closure_cause and history are untouched, and the seller and founder surfaces ignore it entirely. NULL = still shown. Written only by dismiss_purchase_request().';

-- ── 2. The controlled write ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dismiss_purchase_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_req    public.purchase_requests%ROWTYPE;
  v_now    timestamptz;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_req FROM public.purchase_requests
   WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  /* Named Security Gate (v2.86): a caller who is not the owning buyer
     receives not_found, never not_allowed. Errors must not reveal whether
     another person's request exists — this endpoint is probeable by anyone
     with an id. The seller is a stranger to this control by design; it is
     the buyer's view, not the request's state. */
  IF v_req.buyer_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  /* Exactly the two authorised outcomes. A pending or accepted request is
     live correspondence between two people and must not be clearable, and
     expired/superseded were deliberately excluded. */
  IF NOT (
       v_req.status = 'declined'
    OR (v_req.status = 'cancelled'
        AND v_req.closure_cause = 'listing_removed_by_seller')
  ) THEN
    RAISE EXCEPTION 'not_dismissible:%', v_req.status;
  END IF;

  /* Idempotent: a double submit, a retry, or a second device returns the
     original timestamp rather than moving it. */
  IF v_req.buyer_dismissed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'request_id',         p_request_id,
      'buyer_dismissed_at', v_req.buyer_dismissed_at,
      'already_dismissed',  true
    );
  END IF;

  v_now := now();

  /* ⚠ updated_at is deliberately NOT touched. It marks changes to the
     request itself, and the seller's workspace reads it as such. A buyer
     tidying their own list must not surface to the seller as activity on
     their offer. */
  UPDATE public.purchase_requests
     SET buyer_dismissed_at = v_now
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'request_id',         p_request_id,
    'buyer_dismissed_at', v_now,
    'already_dismissed',  false
  );
END $function$;

REVOKE ALL ON FUNCTION public.dismiss_purchase_request(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_purchase_request(uuid) TO authenticated;

COMMENT ON FUNCTION public.dismiss_purchase_request(uuid) IS
  'Buyer clears a finished request from their own My Offers view. Sets buyer_dismissed_at and nothing else: no status change, no closure_cause change, no lifecycle event, no effect on seller/admin/audit surfaces. Eligible only for declined, or cancelled with closure_cause=listing_removed_by_seller. Non-owners receive not_found. Idempotent. PFC274 = 62.';
