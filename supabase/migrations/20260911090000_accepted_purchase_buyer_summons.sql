-- ═══════════════════════════════════════════════════════════════════════════
-- ACCEPTED PURCHASE CONTINUITY — the buyer acceptance summons (2026-09-11)
--
-- THE ONE THING THIS MIGRATION CHANGES:
--   after a successful pending → accepted transition, accept_purchase_request()
--   also writes ONE in-product notification to the BUYER, addressed from the
--   locked request row, deep-linked to the accepted purchase in the Shopping
--   Bag by the transaction id the same statement block just minted.
--
-- WHAT IT DOES NOT CHANGE (frozen transaction spine):
--   the canonical lock order, the seller / pending / sibling checks, the
--   'superseded' sibling semantics, competing Trade supersession and its
--   events, the single transactions INSERT with its amount + currency truth
--   pair, the listing → 'reserved' write, the return payload. Every one of
--   those statements is byte-identical to the Stripe Step 1 definition.
--
-- FAIL-OPEN, BOUNDED:
--   the notification INSERT sits in its own BEGIN … EXCEPTION WHEN OTHERS
--   THEN NULL block, the established shape for every bell in this schema
--   (purchase_request bells, withdraw, Dealer Accelerator lifecycle). A
--   failed notification never rolls back an acceptance. Nothing about the
--   notification can alter acceptance locking, semantics, transaction
--   creation, supersession or reservation, because it runs AFTER all of
--   them and touches only public.notifications.
--
-- RECIPIENT AUTHORITY:
--   v_request is the row SELECTed under the listing lock; its buyer_id is
--   the recipient. No caller-supplied identity is involved anywhere in this
--   function (its only argument is the request id).
--
-- DEDUPE:
--   'purchase_accepted:<request_id>' on the existing unique dedupe_key
--   index, so a replayed or re-run acceptance (impossible today — the
--   function refuses a non-pending request — but cheap to guarantee) can
--   never double-summon.
--
-- notifications.transaction_id is the deep-link key. The Bag is addressed
-- by transaction (Stripe correlation uses the same id), and the bell's
-- routing law sends type = 'purchase_accepted' to /shopping-bag?transaction=.
-- Nullable, FK to transactions, RESTRICT: a transaction with a summons on
-- record is history, not something to delete out from under it.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.notifications
  add column if not exists transaction_id uuid references public.transactions (id) on delete restrict;

create index if not exists notifications_transaction_id_idx
  on public.notifications (transaction_id)
  where transaction_id is not null;

comment on column public.notifications.transaction_id is
  'Deep-link key for buyer-side purchase notifications (type purchase_accepted). Written only by database-owned acceptance code; never client-authored.';

create or replace function public.accept_purchase_request(p_request_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_caller         uuid := auth.uid();
  v_listing_id     uuid;
  v_listing_status text;
  v_request        public.purchase_requests%rowtype;
  v_transaction_id uuid;
  v_superseded_offers uuid[];
  v_label          text;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select listing_id into v_listing_id
  from public.purchase_requests
  where id = p_request_id;

  if v_listing_id is null then
    raise exception 'not_found';
  end if;

  /* CANONICAL LOCK ORDER — the listing row first, before any sibling row of
     either mechanism. Trade acceptance locks its listings first as well, so
     neither function can hold a sibling lock while waiting on a listing the
     other holds. */
  select status into v_listing_status
  from public.listings
  where id = v_listing_id
  for update;

  if v_listing_status is null then
    raise exception 'not_found';
  end if;

  if v_listing_status not in ('published', 'private_active') then
    raise exception 'listing_not_available';
  end if;

  perform 1
  from public.purchase_requests
  where listing_id = v_listing_id
  for update;

  /* THE ADDITIVE TRADE-AWARE WRITE. Lock the competing pending Trade offers
     on this listing - as the watch being traded FOR, or as the watch put up
     as consideration - after the listing and the sibling requests. */
  perform 1
  from public.trade_offers
  where status = 'pending'
    and (target_listing_id = v_listing_id or offered_listing_id = v_listing_id)
  for update;

  select * into v_request
  from public.purchase_requests
  where id = p_request_id;

  if not found then
    raise exception 'not_found';
  end if;

  if v_request.seller_id <> v_caller then
    raise exception 'not_allowed';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'already_resolved:%', v_request.status;
  end if;

  if exists (
    select 1 from public.purchase_requests
    where listing_id = v_listing_id and status = 'accepted'
  ) then
    raise exception 'listing_already_accepted';
  end if;

  update public.purchase_requests
  set status = 'accepted', updated_at = now()
  where id = p_request_id;

  update public.purchase_requests
  set status = 'superseded', updated_at = now()
  where listing_id = v_listing_id
    and id <> p_request_id
    and status = 'pending';

  /* Competing Trade offers lose, each with its own authoritative event, in
     this transaction. Nothing else about Trade is read or changed here. */
  with losers as (
    update public.trade_offers
       set status = 'superseded', updated_at = now()
     where status = 'pending'
       and (target_listing_id = v_listing_id or offered_listing_id = v_listing_id)
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_superseded_offers from losers;

  if array_length(v_superseded_offers, 1) > 0 then
    insert into public.trade_offer_events
      (trade_offer_id, event_type, actor_user_id, prior_status, resulting_status, metadata)
    select unnest(v_superseded_offers), 'superseded', v_caller, 'pending', 'superseded',
           jsonb_build_object(
             'cause', 'purchase_request_accepted',
             'purchase_request_id', p_request_id,
             'listing_id', v_listing_id
           );
  end if;

  /* Stripe Step 1 (2026-09-10): the accepted amount and its currency are one
     truth pair, written in the same statement. Nothing else here changed. */
  insert into public.transactions
    (purchase_request_id, listing_id, buyer_id, seller_id, final_purchase_price, final_purchase_currency, rail, status)
  values
    (v_request.id, v_request.listing_id, v_request.buyer_id, v_request.seller_id,
     v_request.proposed_purchase_price, v_request.proposed_currency, null, 'pending')
  returning id into v_transaction_id;

  update public.listings
  set status = 'reserved', updated_at = now()
  where id = v_listing_id;

  /* ── THE BUYER ACCEPTANCE SUMMONS (2026-09-11) — bounded, additive, fail-open.
     Recipient = the locked request row's buyer. Deep link = the transaction
     this block just minted. Runs after every commercial write above and can
     roll back none of them: an exception here is swallowed and acceptance
     stands. The Shopping Bag itself derives from the transaction, so the
     buyer's continuation exists whether or not this row does. ── */
  begin
    v_label := coalesce(
      nullif(trim(coalesce(v_request.listing_brand, '') || ' ' || coalesce(v_request.listing_model, '')), ''),
      'your watch');
    insert into public.notifications
      (user_id, type, message, listing_id, purchase_request_id, transaction_id, dedupe_key)
    values
      (v_request.buyer_id,
       'purchase_accepted',
       'Offer accepted — ' || v_label || ' is yours to continue. Open your Shopping Bag.',
       v_request.listing_id,
       v_request.id,
       v_transaction_id,
       'purchase_accepted:' || v_request.id::text)
    /* notifications_dedupe_key_uniq is a PARTIAL unique index (where
       dedupe_key is not null); ON CONFLICT can only infer it when the same
       predicate is spelled here. Without it Postgres raises, the exception
       block below swallows the raise, and the summons silently never
       lands — which is exactly the shape the fail-open block must not hide. */
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  exception when others then
    null; -- the summons must never block, alter or roll back the acceptance
  end;

  return jsonb_build_object(
    'request_id', p_request_id,
    'status', 'accepted',
    'transaction_id', v_transaction_id,
    'listing_status', 'reserved',
    'superseded_trade_offers', coalesce(array_length(v_superseded_offers, 1), 0)
  );
end;
$function$;
