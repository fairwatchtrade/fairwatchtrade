/* ════════════════════════════════════════════════════════════════════════
   TRADE CANCELLATION — a closed private opportunity restores to PAUSED
   supabase/migrations/20260902180000_trade_cancel_restores_closed_private_to_paused.sql (v8.20)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "After a cancelled trade, a watch goes back to whatever it was."

   It cannot, for one case, because "whatever it was" no longer exists.
   v8.19 closes a private opportunity when the owner's private_active watch
   commits through another Trade before its named buyer acts: the
   designation is cleared and the buyer is told. If that Trade is then
   cancelled before transfer, the watch is `reserved` with a NULL
   private_buyer_id — at the row, indistinguishable from a watch that was
   always public — and the old restore sent it to `published`. That put a
   watch the owner had never offered publicly onto the public market.

   Founder ruling, 2026-09-02, the three outcomes:

     · originally public watch                   → cancelled Trade restores PUBLISHED
     · private watch acquired by its named buyer  → cancelled Trade restores PRIVATE —
                                                     that designation was never closed
     · private opportunity explicitly closed,
       buyer notified                             → cancelled Trade restores PAUSED
                                                     (`removed`) — not Published, not
                                                     back to the old invitation

   ── WHERE THE EVIDENCE COMES FROM ──────────────────────────────────────
   Nothing on the listing row records the closure — and nothing should; a
   second copy of history is the thing this product does not keep. The
   authoritative record is the winning offer's `accepted` event, whose
   metadata.private_opportunities_closed names every listing whose
   opportunity that acceptance closed. cancel_trade_deal() reads that event
   for its own offer. Append-only history deciding a lifecycle outcome is
   exactly what the history is for.

   Paused here means what Pause means elsewhere: status `removed`,
   removed_at stamped, and a note saying why — the seller's own Restore
   machinery lifts it like any other paused listing. No removal_reason_code
   is set: that vocabulary is the seller's (sold elsewhere, mistake, ...),
   none of it is true here, and the reason is optional by ruling.

   Everything else in cancel_trade_deal() is reproduced verbatim: party
   check, cancelled/completed refusals, the transfer-ledger refusal, leg and
   deal cancellation, and the `cancelled` event — which now also records
   what each listing was restored to.
   ════════════════════════════════════════════════════════════════════════ */

create or replace function public.cancel_trade_deal(p_deal_id uuid, p_reason text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_caller uuid := auth.uid();
  v_deal   public.trade_deals%ROWTYPE;
  v_live   int;
  v_released int := 0;
  v_paused   int := 0;
  v_closed_listings uuid[];
  v_restored jsonb := '[]'::jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT d.* INTO v_deal FROM public.trade_deals d WHERE d.id = p_deal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF v_caller <> v_deal.party_a_id AND v_caller <> v_deal.party_b_id THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  IF v_deal.status = 'cancelled' THEN RAISE EXCEPTION 'already_cancelled'; END IF;
  IF v_deal.status = 'completed' THEN RAISE EXCEPTION 'deal_completed'; END IF;

  PERFORM 1 FROM public.trade_deal_legs
   WHERE trade_deal_id = p_deal_id ORDER BY id FOR UPDATE;

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

  /* THE EVIDENCE. Which of this deal's listings had a private opportunity
     closed by the acceptance that created it — read from the authoritative
     accepted event, never inferred from the row. */
  SELECT coalesce(array_agg((c->>'listing_id')::uuid), '{}')
    INTO v_closed_listings
    FROM public.trade_offer_events e
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(e.metadata->'private_opportunities_closed', '[]'::jsonb)) c
   WHERE e.trade_offer_id = v_deal.trade_offer_id
     AND e.event_type = 'accepted';

  /* Three outcomes, decided per listing:
       designation still present  → private_active (never closed)
       designation closed by us   → removed (Paused)
       otherwise                  → published (was public) */
  WITH released AS (
    UPDATE public.listings li
       SET status = CASE
                      WHEN li.private_buyer_id IS NOT NULL      THEN 'private_active'
                      WHEN li.id = ANY (v_closed_listings)       THEN 'removed'
                      ELSE                                            'published'
                    END,
           removed_at = CASE
                          WHEN li.private_buyer_id IS NULL AND li.id = ANY (v_closed_listings) THEN now()
                          ELSE li.removed_at
                        END,
           removal_reason_note = CASE
                          WHEN li.private_buyer_id IS NULL AND li.id = ANY (v_closed_listings)
                            THEN 'Paused: the private opportunity for this watch closed when it committed to a trade that was later cancelled.'
                          ELSE li.removal_reason_note
                        END,
           updated_at = now()
     WHERE li.id IN (SELECT listing_id FROM public.trade_deal_legs
                      WHERE trade_deal_id = p_deal_id)
       AND li.status = 'reserved'
    RETURNING li.id, li.status
  )
  SELECT count(*),
         count(*) FILTER (WHERE status = 'removed'),
         coalesce(jsonb_agg(jsonb_build_object('listing_id', id, 'restored_to', status) ORDER BY id), '[]'::jsonb)
    INTO v_released, v_paused, v_restored
    FROM released;

  INSERT INTO public.trade_offer_events
    (trade_offer_id, event_type, actor_user_id, prior_status, resulting_status, metadata)
  VALUES
    (v_deal.trade_offer_id, 'cancelled', v_caller, v_deal.status, 'cancelled',
     jsonb_build_object(
       'trade_deal_id', p_deal_id,
       'reason', left(nullif(btrim(coalesce(p_reason, '')), ''), 320),
       'listings_restored', v_restored));

  RETURN jsonb_build_object(
    'trade_deal_id',     p_deal_id,
    'status',            'cancelled',
    'listings_released', v_released,
    'listings_paused',   v_paused,
    'transfer_events_written', 0
  );
END $function$;
