/* ════════════════════════════════════════════════════════════════════════
   TRADE OFFERS — THE COMPLETION PATH

   ⚠ READ THIS BEFORE ADDING ANY TRADE STATE WRITER.

   THE MISCONCEPTION THIS FILE EXISTS TO KILL

   "Trade completion was never built, so build the climb from bound to
   completed." That was the premise of the build order and it is wrong by
   half. The climb already existed:

     · record_physical_watch_transfer_event() ends by calling
       recompute_trade_transfer_status();
     · that function DERIVES leg_status = 'transferred' from the existence of
       a live transfer, and derives trade_deals.status - settling on one live
       transfer, completed + completed_at on two - and reverses both when a
       transfer is retracted;
     · trade_leg_transferred_guard (06E, same file as the producer) raises
       leg_status_transferred_requires_governed_transfer_event on ANY write of
       'transferred' outside that seam.

   So `transferred` and `completed` are CACHE, not state. Nothing here may
   author them. What was actually missing was a CALLER: the producer had
   never once been invoked by the application. Everything below either calls
   it or handles the states it deliberately does not own.

   ── ONE COLUMN, TWO WRITE DISCIPLINES ─────────────────────────────────

   leg_status now carries both derived and authored values, and the boundary
   matters:

     transferred  DERIVED  — only recompute may write it, only from events
     cancelled    AUTHORED — no transfer occurred, so no event can imply it
     in_transit   AUTHORED — "I posted it" is not a transfer claim

   `in_transit` is safe from the recomputer, and this was checked rather than
   assumed. Its first update touches only legs that HAVE a live transfer; its
   second touches only rows already reading 'transferred'. A leg sitting at
   in_transit with no event matches neither, so the other leg's confirmation
   landing cannot silently erase a Sent.

   ⚠ ONE EDGE, RECORDED HONESTLY: retraction returns a leg to 'bound', never
   to 'in_transit'. A retracted leg therefore loses its Sent marker. That is
   the founder exception path and the loss is cosmetic - no transfer event
   ever existed for Sent - but do not be surprised by it.

   ── WHY SENT WRITES NO EVENT ──────────────────────────────────────────

   The producer refuses a sender: only_the_recipient_may_confirm_receipt.
   Sent must not smuggle a transfer claim past that rule through a side door.
   Saying "I posted it" is honest and useful - two watches are in motion with
   no escrow, and the anxiety is whether the other one actually left - but it
   is not receipt, and it never touches the bead.

   Sent is therefore ADVISORY, NEVER A GATE. bound → transferred stays legal,
   because two collectors meeting in person is a real trade and a flow that
   demanded a postage step would be lying about how the watch moved.

   PFC274 = 62 — Canary path untouched.
   ════════════════════════════════════════════════════════════════════════ */

/* ── §3 · the event log learns how a deal ends ──────────────────────────
   The log stopped at acceptance: proposed | accepted | declined | withdrawn
   | superseded. A deal that completes or is cancelled had no word for
   itself. Two values, named plainly, and nothing else. */
ALTER TABLE public.trade_offer_events
  DROP CONSTRAINT IF EXISTS trade_offer_events_event_type_check;

ALTER TABLE public.trade_offer_events
  ADD CONSTRAINT trade_offer_events_event_type_check CHECK (
    event_type = ANY (ARRAY[
      'proposed', 'accepted', 'declined', 'withdrawn', 'superseded',
      'completed', 'cancelled'
    ])
  );


/* ── SENT ── sender-only, authored, no transfer event ─────────────────── */
CREATE OR REPLACE FUNCTION public.mark_trade_leg_sent(
  p_leg_id uuid,
  p_sent   boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_leg    public.trade_deal_legs%ROWTYPE;
  v_deal   public.trade_deals%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  /* Deal then leg — the producer's lock order, kept identical so the two
     writers can never deadlock against each other. */
  SELECT d.* INTO v_deal FROM public.trade_deals d
   WHERE d.id = (SELECT trade_deal_id FROM public.trade_deal_legs WHERE id = p_leg_id)
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  SELECT l.* INTO v_leg FROM public.trade_deal_legs l WHERE l.id = p_leg_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  /* THE ONLY NEW AUTHORIZATION IN THIS ROUND. Everything about receipt is
     the producer's business; this one sentence is mine. */
  IF v_leg.from_user_id <> v_caller THEN
    RAISE EXCEPTION 'only_the_sender_may_mark_sent';
  END IF;

  IF v_deal.status = 'cancelled' THEN RAISE EXCEPTION 'deal_cancelled'; END IF;
  IF v_leg.leg_status = 'transferred' THEN RAISE EXCEPTION 'leg_already_transferred'; END IF;
  IF v_leg.leg_status = 'cancelled'   THEN RAISE EXCEPTION 'leg_cancelled'; END IF;

  IF p_sent THEN
    /* Idempotent by state, not by key: already in_transit is success, not a
       second Sent. */
    IF v_leg.leg_status = 'bound' THEN
      UPDATE public.trade_deal_legs SET leg_status = 'in_transit' WHERE id = p_leg_id;
    END IF;
  ELSE
    /* Undo. A mistaken Sent is a UI slip, not a claim about the world, so
       the sender may take it back - but only while it is still just a claim
       about postage. */
    IF v_leg.leg_status = 'in_transit' THEN
      UPDATE public.trade_deal_legs SET leg_status = 'bound' WHERE id = p_leg_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'leg_id',      p_leg_id,
    'leg_status',  (SELECT leg_status FROM public.trade_deal_legs WHERE id = p_leg_id),
    'deal_status', v_deal.status,
    'transfer_event_written', false
  );
END $function$;


/* ── CONFIRM RECEIPT ── a thin caller, never a second authority ───────── */
CREATE OR REPLACE FUNCTION public.confirm_trade_leg_receipt(p_leg_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_deal_id uuid;
  v_offer_id uuid;
  v_result jsonb;
  v_deal_status text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT trade_deal_id INTO v_deal_id FROM public.trade_deal_legs WHERE id = p_leg_id;
  IF v_deal_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  IF (SELECT status FROM public.trade_deals WHERE id = v_deal_id) = 'cancelled' THEN
    RAISE EXCEPTION 'deal_cancelled';
  END IF;

  /* THE IDEMPOTENCY KEY IS DERIVED, NOT SUPPLIED. A double-tap is the
     expected failure here, and a client-generated key would make each tap
     look like a different intention. One leg confirmed by its recipient is
     one fact, so it gets one key forever - the producer then returns the
     original event with idempotent_replay: true rather than writing a
     second. Nothing about retry safety depends on the caller behaving. */
  v_result := public.record_physical_watch_transfer_event(
    p_leg_id,
    'TRANSFERRED'::public.physical_watch_transfer_event_type,
    v_caller,
    'party_confirmed_recipient'::public.physical_watch_transfer_provenance,
    now(),
    NULL,
    'trade_leg_receipt:' || p_leg_id::text
  );

  /* The producer already advanced the leg and, if this was the second one,
     the deal - via recompute_trade_transfer_status(). Nothing is authored
     here. This only gives the OFFER log the word for what just happened,
     which is the half the transfer machinery does not own.

     Guarded by NOT EXISTS rather than by the replay flag: the deal completes
     on whichever leg lands second, and a retry of that same leg must not
     write the completion twice. */
  SELECT status, trade_offer_id INTO v_deal_status, v_offer_id
    FROM public.trade_deals WHERE id = v_deal_id;

  IF v_deal_status = 'completed' AND NOT EXISTS (
    SELECT 1 FROM public.trade_offer_events
     WHERE trade_offer_id = v_offer_id AND event_type = 'completed'
  ) THEN
    INSERT INTO public.trade_offer_events
      (trade_offer_id, event_type, actor_user_id, prior_status, resulting_status, metadata)
    VALUES
      (v_offer_id, 'completed', v_caller, 'accepted', 'completed',
       jsonb_build_object('trade_deal_id', v_deal_id));
  END IF;

  RETURN v_result || jsonb_build_object('deal_status', v_deal_status);
END $function$;


/* ── CANCEL ── either party, both legs pre-transfer, no transfer event ── */
CREATE OR REPLACE FUNCTION public.cancel_trade_deal(
  p_deal_id uuid,
  p_reason  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_deal   public.trade_deals%ROWTYPE;
  v_live   int;
  v_released int := 0;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT d.* INTO v_deal FROM public.trade_deals d WHERE d.id = p_deal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF v_caller <> v_deal.party_a_id AND v_caller <> v_deal.party_b_id THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  IF v_deal.status = 'cancelled' THEN RAISE EXCEPTION 'already_cancelled'; END IF;
  IF v_deal.status = 'completed' THEN RAISE EXCEPTION 'deal_completed'; END IF;

  /* Locked in id order, matching every other writer on this table. */
  PERFORM 1 FROM public.trade_deal_legs
   WHERE trade_deal_id = p_deal_id ORDER BY id FOR UPDATE;

  /* THE REFUSAL THAT MATTERS. Asked of the transfer ledger rather than of
     leg_status, because leg_status is a cache and the ledger is the truth.
     Once a watch has genuinely changed hands, ordinary cancellation is over
     and recovery is founder-only through TRANSFER_RETRACTED. */
  SELECT count(*) INTO v_live
    FROM public.trade_deal_legs l
   WHERE l.trade_deal_id = p_deal_id
     AND EXISTS (SELECT 1 FROM public.physical_watch_live_transfers t
                  WHERE t.trade_deal_leg_id = l.id);
  IF v_live > 0 THEN RAISE EXCEPTION 'cannot_cancel_after_transfer'; END IF;

  UPDATE public.trade_deal_legs SET leg_status = 'cancelled'
   WHERE trade_deal_id = p_deal_id AND leg_status <> 'cancelled';

  UPDATE public.trade_deals
     SET status = 'cancelled', cancelled_at = now(), updated_at = now()
   WHERE id = p_deal_id;

  /* ⚠ THE PRIOR STATUS IS RECONSTRUCTED, NOT REMEMBERED. accept_trade_offer
     admits only 'published' or 'private_active' and overwrites both with
     'reserved', keeping no record of which. It is frozen, so it cannot be
     taught to remember. A listing carrying a private buyer was private; one
     without was published. Verified at build time: zero published or
     reserved rows carry a stray private_buyer_id, so the reconstruction is
     exact for every row that exists. If that ever stops being true, this is
     the line that quietly guesses. */
  WITH released AS (
    UPDATE public.listings li
       SET status = CASE WHEN li.private_buyer_id IS NOT NULL
                         THEN 'private_active' ELSE 'published' END,
           updated_at = now()
     WHERE li.id IN (SELECT listing_id FROM public.trade_deal_legs
                      WHERE trade_deal_id = p_deal_id)
       AND li.status = 'reserved'
    RETURNING 1
  ) SELECT count(*) INTO v_released FROM released;

  INSERT INTO public.trade_offer_events
    (trade_offer_id, event_type, actor_user_id, prior_status, resulting_status, metadata)
  VALUES
    (v_deal.trade_offer_id, 'cancelled', v_caller, v_deal.status, 'cancelled',
     jsonb_build_object(
       'trade_deal_id', p_deal_id,
       'reason', left(nullif(btrim(coalesce(p_reason, '')), ''), 320)));

  RETURN jsonb_build_object(
    'trade_deal_id',     p_deal_id,
    'status',            'cancelled',
    'listings_released', v_released,
    'transfer_events_written', 0
  );
END $function$;


REVOKE ALL ON FUNCTION public.mark_trade_leg_sent(uuid, boolean)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_trade_leg_receipt(uuid)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_trade_deal(uuid, text)           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_trade_leg_sent(uuid, boolean)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_trade_leg_receipt(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_trade_deal(uuid, text)        TO authenticated;

COMMENT ON FUNCTION public.mark_trade_leg_sent(uuid, boolean) IS
  'Sender-only advisory Sent marker. Authors leg_status in_transit, writes NO transfer event, never touches the bead, and is reversible while still in_transit. Advisory only - bound to transferred remains legal without it.';
COMMENT ON FUNCTION public.confirm_trade_leg_receipt(uuid) IS
  'Recipient confirmation of receipt. A thin caller over record_physical_watch_transfer_event with a derived idempotency key; that function owns authorization, the bead, and completion. This adds only the offer-log word for a completed deal.';
COMMENT ON FUNCTION public.cancel_trade_deal(uuid, text) IS
  'Either party may cancel while BOTH legs are pre-transfer. Refuses once the transfer ledger shows any live transfer. Cancels both legs, stamps cancelled_at, releases both listings, writes an offer event, and emits no transfer event.';
