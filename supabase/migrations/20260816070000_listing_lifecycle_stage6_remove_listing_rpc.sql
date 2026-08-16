/* ════════════════════════════════════════════════════════════════════════
   STAGE 6 — remove_listing(): the seller takes a watch off the market.

   NOT deletion. The listing stays the seller's, stays in their workspace,
   and keeps every byte of its data. Only its public availability ends.

   WHY AN RPC AND NOT AN UPDATE

   listings_update_own restricts seller UPDATE to draft/rejected, and v2.21's
   column whitelist leaves status, removed_at and the reason columns
   unwritable by any client session. A published listing therefore cannot be
   moved by a client at all — this is the same door submit_listing_for_review
   uses, for the same reason.

   HOW REMOVE ENDS PUBLIC AVAILABILITY

   By changing status, and nothing else. The RLS predicate
   listings_select_public_or_own already reads
   `status = 'published' OR own OR accepted-buyer`, so Browse, search, saved
   searches, the public listing route, the Catalogue and the dealer room all
   stop returning it the instant this commits. No caller has to remember a
   filter, which is what §15 asks for.

   ⚠ ACCEPTED-BUYER VISIBILITY IS DELIBERATELY PRESERVED. A buyer whose
   purchase request was accepted keeps access through that third clause.
   Taking the watch off the market must not blind the person who is
   mid-transaction on it.

   OUTSTANDING REQUESTS ARE CLOSED TRUTHFULLY

   PENDING requests become 'cancelled' — the state the product already
   surfaces as "Withdrawn" for a cancelled purchase request — because they
   can no longer be acted on and must not sit there looking actionable.

   ⚠ An ACCEPTED request is NOT touched. That is a live obligation between
   two people, and a seller taking the listing down does not unmake it. It
   survives, and it will block permanent Delete at Stage 7. This is a
   judgement call, flagged rather than buried: the alternative — cancelling
   accepted offers too — would let a seller quietly walk away from a deal by
   pressing Remove.

   NO EXTERNAL SALE BECOMES AN FWT SALE. This function writes nothing to
   transactions under any reason code, including sold_in_store and
   sold_elsewhere. It records why the watch left the market, never that
   FairWatchTrade sold it. Tax Time, sales metrics and Collector Impression
   eligibility are all downstream of transactions and therefore untouched.

   THE REASON IS PERSISTED AS FACT, not as a reviewer decision.
   removal_reason_code/_note live on the listing (Stage 1). Writing it into
   listing_decision_events would have overloaded a table whose entire
   vocabulary is adjudication — approved/rejected by a reviewer — with a
   seller action that is not a decision about the listing's merit.

   PFC274 = 62 — app/api/evaluate/route.ts is untouched.
   ════════════════════════════════════════════════════════════════════════ */

CREATE OR REPLACE FUNCTION public.remove_listing(
  p_listing_id  uuid,
  p_reason_code text,
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

  /* Remove applies to a watch that is on the market or on its way there. A
     draft was never public, so there is nothing to remove it from. */
  IF v_listing.status NOT IN ('published', 'reserved', 'pending_review') THEN
    RAISE EXCEPTION 'not_removable:%', v_listing.status;
  END IF;

  /* coalesce, not `p_reason_code IS NULL OR ...`. A bare
     `NULL NOT IN (...)` evaluates to NULL rather than true, so a null reason
     would have slipped past the guard and written a removal with no recorded
     cause. Caught while re-cutting this for the SQL editor. */
  IF coalesce(p_reason_code, '') NOT IN
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

  UPDATE public.purchase_requests
     SET status = 'cancelled', updated_at = v_now
   WHERE listing_id = p_listing_id AND status = 'pending';
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  SELECT count(*) INTO v_accepted
    FROM public.purchase_requests
   WHERE listing_id = p_listing_id AND status = 'accepted';

  RETURN jsonb_build_object(
    'listing_id',                  p_listing_id,
    'status',                      'removed',
    'removed_at',                  v_now,
    'reason_code',                 p_reason_code,
    'requests_cancelled',          v_cancelled,
    'accepted_requests_remaining', v_accepted
  );
END $function$;

REVOKE ALL ON FUNCTION public.remove_listing(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.remove_listing(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.remove_listing(uuid, text, text) IS
  'Seller takes a watch off the market. Sets status=removed with reason; cancels PENDING purchase requests; never touches ACCEPTED ones and never writes a transaction. Deletes nothing — permanent Delete is a separate governed purge.';
