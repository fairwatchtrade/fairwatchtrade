/* ════════════════════════════════════════════════════════════════════════
   STAGE 6A — closure attribution: WHY a purchase request closed, kept as a
   fact separate from WHAT state it closed into.

   THE MISCONCEPTION THIS FILE EXISTS TO KILL

     `cancelled` does not mean "the buyer withdrew".

   v5.30 shipped on that equivalence — its own header called 'cancelled' "the
   state the product already surfaces as Withdrawn" — and the buyer-facing
   Catalogue agrees with it in the strongest possible terms: the note under a
   cancelled offer reads "You withdrew this offer."

   So the moment a seller took a watch off the market, every buyer with a
   pending offer was told, in the first person, that they had done something
   they had not done. Lifecycle state and closure attribution are two
   different facts, and the schema only had room for one of them.

   This migration gives the second fact a home. It does not change which
   states exist, does not touch accepted requests, and does not invent
   history it cannot prove.

   WHY A COLUMN *AND* AN EVENT

   purchase_requests.closure_cause answers "why is this row closed" at read
   time, cheaply, for the surface that renders one offer in a list.
   purchase_request_events (v2.86) already answers "what happened, when, by
   whom" as append-only history. The column is current truth; the event is
   the record. The event's own primary key then does a third job — see the
   dedupe note below — which is why no new identity is invented for it.

   ⚠ NULL closure_cause ON A CANCELLED ROW MEANS "WE DO NOT KNOW", AND THAT
   IS DELIBERATE. §6 of the order forbids guessing historical causes. A
   cancelled row is backfilled only where a durable buyer_withdrew event
   proves the cause; everything else keeps NULL and renders as a neutral
   closure. Writing a cause we cannot evidence would be the same defect this
   file is repairing, pointed backwards.

   NOTIFICATIONS ARE NOT WRITTEN HERE

   remove_listing persists truth and stops. It inserts no notification —
   deliberately, so that a failed bell can never roll back a removal and a
   retried removal can never re-ring one. Emission is a separate committed-
   state read (emit_listing_removal_notifications) whose exactly-once
   property comes from a durable unique key, never from "the RPC handed me
   these ids". A caller may re-run it after a crash, a double submit, or a
   retry and it will resolve to the notifications that already exist.

   PFC274 = 62 — app/api/evaluate/route.ts is untouched.
   ════════════════════════════════════════════════════════════════════════ */

-- ── 1. Closure attribution on the request itself ──────────────────────────
ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS closure_cause text;

ALTER TABLE public.purchase_requests
  DROP CONSTRAINT IF EXISTS purchase_requests_closure_cause_check;
ALTER TABLE public.purchase_requests
  ADD CONSTRAINT purchase_requests_closure_cause_check
  CHECK (closure_cause IS NULL OR closure_cause = ANY (ARRAY[
    'buyer_withdrew', 'listing_removed_by_seller'
  ]));

COMMENT ON COLUMN public.purchase_requests.closure_cause IS
  'Why this request closed, as distinct from the status it closed into. NULL on an open request, and NULL on a cancelled request whose cause predates this column — that is honest ignorance, never a default. Buyer-facing copy must branch on this, never on status alone.';

-- ── 2. Event vocabulary gains the seller-caused closure ───────────────────
/* The v2.86 table was built with single-value CHECKs and a note saying
   future lifecycle events extend them by migration. This is that migration.
   prior_status and resulting_status are unchanged: only a PENDING request is
   closed by a removal, and it closes into 'cancelled' exactly as before. The
   state machine did not grow — only the reasons did. */
ALTER TABLE public.purchase_request_events
  DROP CONSTRAINT IF EXISTS pre_event_type_check;
ALTER TABLE public.purchase_request_events
  ADD CONSTRAINT pre_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'buyer_withdrew', 'listing_removed_by_seller'
  ]));

-- ── 3. Durable notification identity ──────────────────────────────────────
/* The dedupe key is a stored, uniquely-indexed fact on the notification row.
   It is NOT derived from a function's return value, a request id list held
   in application memory, or a timestamp window — all three survive exactly
   as long as the process that holds them, which is the failure mode the
   order names explicitly.

   Partial index: every notification predating this column has a NULL key and
   must stay insertable. Only keyed notifications are constrained. */
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_uniq
  ON public.notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

COMMENT ON COLUMN public.notifications.dedupe_key IS
  'Durable exactly-once identity for a derived notification, e.g. pr_closed:<purchase_request_events.id>. A retry re-reads committed state and resolves to the existing row via the partial unique index rather than ringing a second bell. NULL for notifications written before this existed and for any bell that does not need dedupe.';

-- ── 4. Backfill — proof only, never inference ─────────────────────────────
/* A buyer_withdrew event IS durable proof of cause, so those rows can be
   filled with certainty. Everything else is left NULL on purpose: a request
   cancelled before v2.86 existed, or by any path that logged no event, has
   no surviving evidence of why, and this migration refuses to manufacture
   some. Those rows render as a neutral closure rather than as an accusation
   in either direction. */
UPDATE public.purchase_requests pr
   SET closure_cause = 'buyer_withdrew'
 WHERE pr.status = 'cancelled'
   AND pr.closure_cause IS NULL
   AND EXISTS (
     SELECT 1 FROM public.purchase_request_events e
      WHERE e.purchase_request_id = pr.id
        AND e.event_type = 'buyer_withdrew'
   );

-- ── 5. withdraw_purchase_request — persist the cause it already knew ──────
/* Re-cut whole (Law 4). The only change from v2.89 is closure_cause on the
   UPDATE. The seller bell stays inside this function untouched: it is the
   v2.89 proven cross-user pattern, it addresses one recipient fixed by data,
   and it is not what the exactly-once requirement is about. */
CREATE OR REPLACE FUNCTION public.withdraw_purchase_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_listing_id uuid;
  v_request    public.purchase_requests%rowtype;
  v_label      text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT listing_id INTO v_listing_id
  FROM public.purchase_requests
  WHERE id = p_request_id;

  IF v_listing_id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  PERFORM 1 FROM public.listings WHERE id = v_listing_id FOR SHARE;
  PERFORM 1 FROM public.purchase_requests WHERE id = p_request_id FOR UPDATE;

  SELECT * INTO v_request
  FROM public.purchase_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  -- Named Security Gate (v2.86): non-owners learn nothing, not even existence.
  IF v_request.buyer_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'already_resolved:%', v_request.status;
  END IF;

  UPDATE public.purchase_requests
  SET status        = 'cancelled',
      closure_cause = 'buyer_withdrew',
      updated_at    = now()
  WHERE id = p_request_id;

  INSERT INTO public.purchase_request_events
    (purchase_request_id, event_type, actor_user_id, prior_status, resulting_status)
  VALUES
    (p_request_id, 'buyer_withdrew', v_caller, 'pending', 'cancelled');

  -- v2.89 seller bell. Recipient fixed by DATA; fails open, never the withdrawal.
  BEGIN
    SELECT CASE WHEN l.model IS NOT NULL THEN l.brand || ' ' || l.model ELSE l.brand END
      INTO v_label FROM public.listings l WHERE l.id = v_listing_id;
    IF v_label IS NULL THEN
      v_label := coalesce(
        nullif(concat_ws(' ', v_request.listing_brand, v_request.listing_model), ''),
        'your listing');
    END IF;
    INSERT INTO public.notifications (user_id, type, message, listing_id)
    VALUES (v_request.seller_id, 'purchase_request',
            'A buyer withdrew their offer for ' || v_label, v_listing_id);
  EXCEPTION WHEN others THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'request_id',    p_request_id,
    'status',        'cancelled',
    'closure_cause', 'buyer_withdrew'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.withdraw_purchase_request(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_purchase_request(uuid) TO authenticated;

-- ── 6. remove_listing — attribute the closure, emit nothing ───────────────
/* Re-cut whole (Law 4). Changes from v5.30:
     · closed requests carry closure_cause = 'listing_removed_by_seller'
     · one append-only event per closed request, actor = the seller
     · the return value now names the closed requests and their event ids

   The return value is for the caller's convenience and for observability. It
   is explicitly NOT the exactly-once mechanism — §8's dedupe requirement is
   satisfied by the event rows this writes, which are committed durable state
   that a retry can re-read. Nothing about correct notification behaviour
   depends on the caller receiving, keeping, or acting on this payload.

   ⚠ ACCEPTED REQUESTS REMAIN UNTOUCHED, exactly as in v5.30. A live
   obligation between two people is not unmade by the seller pressing Remove,
   and the accepted buyer keeps listing visibility through the third clause of
   listings_select_public_or_own. */
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

  /* Remove applies to a watch that is on the market or on its way there. A
     draft was never public, so there is nothing to remove it from. */
  IF v_listing.status NOT IN ('published', 'reserved', 'pending_review') THEN
    RAISE EXCEPTION 'not_removable:%', v_listing.status;
  END IF;

  /* coalesce, not `p_reason_code IS NULL OR ...`. A bare `NULL NOT IN (...)`
     evaluates to NULL rather than true, so a null reason would slip past the
     guard and write a removal with no recorded cause. */
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

  /* One statement so the close and its evidence cannot diverge: a request
     cannot be cancelled without the event that explains it, because there is
     no window between them in which anything else can run. */
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
  'Seller takes a watch off the market. Sets status=removed with reason; closes PENDING purchase requests as cancelled WITH closure_cause=listing_removed_by_seller plus one append-only event each; never touches ACCEPTED ones; writes no transaction and no notification. Deletes nothing. PFC274 = 62.';

-- ── 7. Emission — derived from committed state, deduped durably ───────────
/* Separate from remove_listing on purpose (§7). Truth commits first; bells
   are a read of what committed. Consequences:

     · a notification failure cannot roll back a removal;
     · a retried emission cannot double-ring, because the unique key is the
       event row's own id and that row is already committed;
     · a caller that lost its response, crashed, or double-submitted can
       simply call this again — it re-derives everything from the database
       and returns how many bells were actually new.

   The caller passes only the listing. It cannot name recipients, cannot pass
   request ids, and cannot cause a notification for a request that has no
   committed removal event. */
CREATE OR REPLACE FUNCTION public.emit_listing_removal_notifications(
  p_listing_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller  uuid := auth.uid();
  v_seller  uuid;
  v_label   text;
  v_emitted int := 0;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT l.seller_id,
         CASE WHEN l.model IS NOT NULL THEN l.brand || ' ' || l.model ELSE l.brand END
    INTO v_seller, v_label
    FROM public.listings l WHERE l.id = p_listing_id;

  IF v_seller IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_seller <> v_caller THEN RAISE EXCEPTION 'not_allowed'; END IF;

  WITH inserted AS (
    INSERT INTO public.notifications (user_id, type, message, listing_id, dedupe_key)
    SELECT pr.buyer_id,
           'purchase_request',
           'The seller removed the listing for '
             || coalesce(
                  v_label,
                  nullif(concat_ws(' ', pr.listing_brand, pr.listing_model), ''),
                  'a watch you made an offer on')
             || '. Your purchase request is no longer active.',
           p_listing_id,
           'pr_closed:' || e.id::text
      FROM public.purchase_request_events e
      JOIN public.purchase_requests pr ON pr.id = e.purchase_request_id
     WHERE e.event_type = 'listing_removed_by_seller'
       AND pr.listing_id = p_listing_id
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_emitted FROM inserted;

  RETURN jsonb_build_object(
    'listing_id',            p_listing_id,
    'notifications_emitted', v_emitted
  );
END $function$;

REVOKE ALL ON FUNCTION public.emit_listing_removal_notifications(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.emit_listing_removal_notifications(uuid) TO authenticated;

COMMENT ON FUNCTION public.emit_listing_removal_notifications(uuid) IS
  'Buyer bells for requests closed by a seller removal, derived entirely from committed purchase_request_events. Idempotent via notifications.dedupe_key = pr_closed:<event id>; safe to retry. Seller-only. Emits nothing for a listing with no committed removal events. PFC274 = 62.';
