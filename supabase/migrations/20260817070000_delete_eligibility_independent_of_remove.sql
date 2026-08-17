/* ════════════════════════════════════════════════════════════════════════
   REMOVE AND DELETE ARE SIBLINGS, NOT STAGES.

   THE LAW THIS ENCODES

     Remove and Delete are independent seller intentions. Neither is a
     prerequisite for the other.

   Remove means "I can't find this watch in my safe right now — take it off
   the market until I sort it out." The listing stays useful: photographs,
   description, history, all of it, and it can potentially go back up.

   Delete means "I sold it, I shipped it, and I am done with this listing."
   That is not a temporary off-market request and there is no reason to march
   the seller through Remove to express it.

   WHAT WAS WRONG

   Stage 7 shipped requiring status='removed' before eligibility could even be
   evaluated, and returned a not_removed blocker otherwise. That made the
   product's internal lifecycle sequence something a seller had to know before
   they could find Delete — a dealer who had just shipped a watch would look
   for Delete, not find it, and be told nothing. Machinery leaking into the
   product.

   The prerequisite is gone. Eligibility now evaluates the listing IN ITS
   CURRENT STATE, whatever that state is.

   ⚠ THE SAFETY PROPERTY WAS NEVER THE STATUS WORD. It is the OBLIGATIONS.
   A reserved listing was never dangerous because it said 'reserved'; it was
   dangerous because an accepted purchase request made it reserved — and that
   request is already a blocker in its own right. Every genuinely unsafe case
   is caught by an obligation check that does not care what the status column
   says:

     reserved ................. accepted_purchase_request catches it
     published, offers open ... pending_purchase_request catches it
     published, no offers ..... genuinely deletable; the seller shipped it
     draft / rejected ......... never public, no obligations
     removed .................. unchanged

   lifecycle_state is still returned, as CONTEXT for the surfaces. It is no
   longer a refusal.

   ⚠ pending_review IS NOW DELETABLE. Nothing blocks a seller from deleting a
   listing that is awaiting review. This follows from the law as stated —
   current state, no lifecycle prerequisites — and adjudication history
   survives regardless, having been detached from listings at Stage 5. It is
   flagged here because it is a product consequence rather than a technical
   one, and it is reversible by adding one blocker if the founder wants
   submissions protected mid-review.

   ⚠ A BLOCKED DELETE CHANGES NOTHING. Published stays published, removed
   stays removed. This function is still STABLE — the engine refuses writes
   inside it — so a refusal cannot have side effects even by accident.

   ⚠ AND WHEN STAGE 8 ARRIVES: it must purge DIRECTLY. It must not fabricate
   a Remove event, invent a removal reason, or pretend the seller chose
   Remove on the way past. A published listing disappears from the market
   because it was deleted, not because something secretly removed it first.
   There is no window where it is half-deleted and still on Browse, because
   the row physically stops existing.

   Everything else about Stage 7 is unchanged: read-only, repeatable, stores
   no approval, and Stage 8 must still re-evaluate under its own lock.

   PFC274 = 62 — app/api/evaluate/route.ts is untouched.
   ════════════════════════════════════════════════════════════════════════ */

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

  /* Ownership is still absolute. A signed-in caller must be the seller;
     anyone else receives not_found so the seam cannot be used to probe for
     other people's listings. auth.uid() IS NULL means service_role, which is
     how the founder's admin surface reads; anon holds no EXECUTE. */
  IF v_caller IS NOT NULL AND v_listing.seller_id <> v_caller THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  /* NO LIFECYCLE PREREQUISITE. Deliberately absent — see the header. The
     obligations below decide, and they apply in every state. */

  SELECT count(*) FILTER (WHERE status = 'accepted'),
         count(*) FILTER (WHERE status = 'pending')
    INTO v_accepted, v_pending
    FROM public.purchase_requests
   WHERE listing_id = p_listing_id;

  IF v_accepted > 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'accepted_purchase_request', 'count', v_accepted);
  END IF;

  /* On a published listing this is the ordinary case, not a broken
     invariant: someone has an offer in and is waiting for an answer.
     Deleting out from under them would be the product losing a person's
     request without telling them. */
  IF v_pending > 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'pending_purchase_request', 'count', v_pending);
  END IF;

  /* completed / cancelled / refunded are settled and carry their own Stage 1
     identity with no FK since Stage 5, so they outlive the listing intact. */
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
    /* Context for the surfaces — whether the watch is still on the market
       changes what the consequences review should say. Not a refusal. */
    'lifecycle_state',               v_listing.status,
    'is_public',                     v_listing.status = 'published',
    'removal_reason_code',           v_listing.removal_reason_code,
    'eligible_for_permanent_delete', jsonb_array_length(v_blockers) = 0,
    'blockers',                      v_blockers,
    'evaluated_at',                  now()
  );
END $function$;

REVOKE ALL ON FUNCTION public.listing_delete_eligibility(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.listing_delete_eligibility(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.listing_delete_eligibility(uuid) IS
  'Stage 7. Answers whether a listing may CURRENTLY be permanently deleted, and why not — in whatever state it is in. Remove is NOT a prerequisite: Remove and Delete are independent seller intentions. Blockers are obligations (accepted/pending purchase requests, active transactions, active capture sessions), never the lifecycle word. Read-only and STABLE, so a blocked Delete cannot change the listing. Stores no approval; Stage 8 must re-evaluate under its own lock and must purge directly rather than fabricating a Remove event. Non-owners receive not_found. PFC274 = 62.';
