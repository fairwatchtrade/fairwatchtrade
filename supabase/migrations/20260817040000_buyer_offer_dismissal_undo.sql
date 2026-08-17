/* ════════════════════════════════════════════════════════════════════════
   UNDO A BUYER DISMISSAL — the collector puts a card back.

   The companion to dismiss_purchase_request(), and deliberately its exact
   mirror: same owner gate, same not_found-for-strangers rule, same
   SECURITY DEFINER posture, same absence of any lifecycle effect. It clears
   one column. Nothing else in the database moves.

   WHY THIS IS NOT A NEW CAPABILITY

   Dismissal was never destructive — the request, its status, its cause and
   its history were all untouched, and only one person's view changed. So
   undoing it cannot be destructive either: this restores visibility that was
   only ever hidden. There is no archive being reopened, no state being
   rewound, and no "Dismissed Offers" collection for a row to be rescued
   from. The row never went anywhere.

   That is also why Undo needs no expiry in the database. It is a UI
   convenience with a short life on screen; if the buyer misses it, the
   dismissal simply stays persisted exactly as it already is. Nothing here
   knows or cares how long the button was visible.

   ⚠ NO STATUS ELIGIBILITY CHECK, AND THAT IS CORRECT. dismiss_ already
   refused anything but declined / listing-removed, and terminal states do
   not change. Re-testing eligibility here would add a second copy of a rule
   that can only drift from the first — the guard that matters is ownership,
   and that is enforced.

   PFC274 = 62 — app/api/evaluate/route.ts is untouched.
   ════════════════════════════════════════════════════════════════════════ */

CREATE OR REPLACE FUNCTION public.restore_purchase_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_req    public.purchase_requests%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_req FROM public.purchase_requests
   WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  /* Named Security Gate (v2.86), identical to dismiss_: a caller who is not
     the owning buyer receives not_found, never not_allowed. The seller has
     no business restoring a card to somebody else's list, and must not learn
     from the error that the request exists. */
  IF v_req.buyer_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  /* Idempotent both ways: undoing something already visible is a no-op, not
     an error. A double-tap on Undo, or a second device, lands here. */
  IF v_req.buyer_dismissed_at IS NULL THEN
    RETURN jsonb_build_object(
      'request_id',      p_request_id,
      'restored',        false,
      'already_visible', true
    );
  END IF;

  /* updated_at deliberately untouched, for the same reason as dismiss_: the
     seller's workspace reads it as activity on the offer, and this is not
     activity on the offer. */
  UPDATE public.purchase_requests
     SET buyer_dismissed_at = NULL
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'request_id',      p_request_id,
    'restored',        true,
    'already_visible', false
  );
END $function$;

REVOKE ALL ON FUNCTION public.restore_purchase_request(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.restore_purchase_request(uuid) TO authenticated;

COMMENT ON FUNCTION public.restore_purchase_request(uuid) IS
  'Buyer returns a card they cleared to their own My Offers view. Clears buyer_dismissed_at and nothing else: no status change, no closure_cause change, no lifecycle event, no effect on seller/admin/audit surfaces. Non-owners receive not_found. Idempotent. Mirror of dismiss_purchase_request(). PFC274 = 62.';
