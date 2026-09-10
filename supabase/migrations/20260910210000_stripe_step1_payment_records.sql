-- ════════════════════════════════════════════════════════════════════════
-- STRIPE STEP 1 OF 4 — Pay an accepted purchase through Stripe Sandbox
-- 20260910210000_stripe_step1_payment_records.sql
--
-- Additive only. Zero transactions exist at apply time; no row is rewritten.
--
-- What this adds, and why each part exists:
--   1. transactions.final_purchase_currency — the accepted sale's currency,
--      snapshotted ATOMICALLY beside final_purchase_price inside
--      accept_purchase_request(). Listing currency can change later; the
--      accepted sale must not drift with it. This is the one narrowly
--      authorized amendment to the otherwise frozen acceptance seam.
--   2. stripe_payment_attempts — the provider payment record, hung off the
--      FairWatchTrade transaction (never off purchase_requests). Three
--      independent truth axes: capture lifecycle, refund state, dispute
--      state. A dispute never erases a capture; a partial refund never
--      erases a dispute.
--   3. stripe_refunds — every provider refund by its own id, so several
--      refunds against one payment keep their identity and the running
--      total is derivable without replaying events.
--   4. stripe_events — durable, idempotent provider event log keyed by
--      (event_id, account context). Kept even when no user-facing state
--      changes.
--   5. stripe_apply_event() — the single atomic writer for a webhook: record
--      the event if unseen, apply at most one state transition guarded by
--      the expected prior lifecycle, upsert refunds, mark the result.
--      service_role only.
--
-- Deliberately NOT here: transactions.rail is untouched (payment truth is
-- the payment record's); transactions.status is untouched; no client role
-- can INSERT/UPDATE/DELETE any new table; no live-mode anything.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1 · accepted transaction currency, snapshotted at acceptance ─────────

alter table public.transactions
  add column if not exists final_purchase_currency text
    references public.supported_currencies (code);

comment on column public.transactions.final_purchase_currency is
  'Currency of final_purchase_price, snapshotted from the accepted purchase request''s proposed_currency in the same statement that created this row. Never re-derived from the listing.';

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

  return jsonb_build_object(
    'request_id', p_request_id,
    'status', 'accepted',
    'transaction_id', v_transaction_id,
    'listing_status', 'reserved',
    'superseded_trade_offers', coalesce(array_length(v_superseded_offers, 1), 0)
  );
end;
$function$;

-- ── 2 · the provider payment record ──────────────────────────────────────

create table if not exists public.stripe_payment_attempts (
  id                       uuid primary key default gen_random_uuid(),
  transaction_id           uuid not null references public.transactions (id) on delete restrict,
  provider                 text not null default 'stripe' check (provider = 'stripe'),
  environment              text not null check (environment in ('sandbox', 'live')),
  stripe_account_id        text,
  checkout_session_id      text,
  checkout_url             text,
  checkout_expires_at      timestamptz,
  payment_intent_id        text,
  charge_id                text,
  amount_minor             bigint not null check (amount_minor > 0),
  currency                 text not null references public.supported_currencies (code),
  lifecycle                text not null default 'pending'
                             check (lifecycle in ('pending','checkout_created','confirming','requires_capture','succeeded','failed','canceled','expired')),
  refund_state             text not null default 'none' check (refund_state in ('none','partial','full')),
  refunded_amount_minor    bigint not null default 0 check (refunded_amount_minor >= 0),
  dispute_state            text not null default 'none' check (dispute_state in ('none','open','won','lost')),
  dispute_provider_status  text,
  dispute_id               text,
  provider_status          text,
  idempotency_key          text not null unique,
  is_active                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.stripe_payment_attempts is
  'One Stripe payment attempt for a FairWatchTrade transaction. lifecycle / refund_state / dispute_state are independent truth axes. amount_minor is the provider minor-unit integer. Written only by the server.';

create unique index if not exists stripe_payment_attempts_one_active
  on public.stripe_payment_attempts (transaction_id) where is_active;
create unique index if not exists stripe_payment_attempts_session
  on public.stripe_payment_attempts (checkout_session_id) where checkout_session_id is not null;
create unique index if not exists stripe_payment_attempts_intent
  on public.stripe_payment_attempts (payment_intent_id) where payment_intent_id is not null;
create index if not exists stripe_payment_attempts_charge
  on public.stripe_payment_attempts (charge_id) where charge_id is not null;
create index if not exists stripe_payment_attempts_transaction
  on public.stripe_payment_attempts (transaction_id);

-- ── 3 · refunds, each by its provider identity ───────────────────────────

create table if not exists public.stripe_refunds (
  id                   uuid primary key default gen_random_uuid(),
  payment_attempt_id   uuid not null references public.stripe_payment_attempts (id) on delete restrict,
  refund_id            text not null unique,
  amount_minor         bigint not null check (amount_minor >= 0),
  status               text,
  provider_created_at  timestamptz,
  recorded_at          timestamptz not null default now(),
  last_event_id        text
);

-- ── 4 · the durable provider event log ───────────────────────────────────

create table if not exists public.stripe_events (
  id                   uuid primary key default gen_random_uuid(),
  event_id             text not null,
  stripe_account_id    text,
  event_type           text not null,
  livemode             boolean not null,
  object_type          text,
  object_id            text,
  provider_created_at  timestamptz,
  received_at          timestamptz not null default now(),
  payment_attempt_id   uuid references public.stripe_payment_attempts (id),
  transaction_id       uuid references public.transactions (id),
  processing_result    text not null default 'received'
                         check (processing_result in ('received','applied','ignored','unresolved','stale','duplicate','failed')),
  processing_note      text,
  payload              jsonb not null
);

comment on table public.stripe_events is
  'Every Stripe webhook event FairWatchTrade received, once per (event_id, account context). Kept even when it caused no transition. Written only by stripe_apply_event().';

create unique index if not exists stripe_events_provider_identity
  on public.stripe_events (event_id, coalesce(stripe_account_id, ''));
create index if not exists stripe_events_attempt on public.stripe_events (payment_attempt_id);

-- ── 5 · authority: server writes, owners read, nobody forges ─────────────

alter table public.stripe_payment_attempts enable row level security;
alter table public.stripe_refunds enable row level security;
alter table public.stripe_events enable row level security;

revoke all on table public.stripe_payment_attempts from anon, authenticated;
revoke all on table public.stripe_refunds from anon, authenticated;
revoke all on table public.stripe_events from anon, authenticated;

grant select on table public.stripe_payment_attempts to authenticated;
grant select on table public.stripe_refunds to authenticated;

drop policy if exists stripe_payment_attempts_read_own on public.stripe_payment_attempts;
create policy stripe_payment_attempts_read_own
  on public.stripe_payment_attempts for select to authenticated
  using (exists (
    select 1 from public.transactions t
     where t.id = transaction_id and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
  ));

drop policy if exists stripe_refunds_read_own on public.stripe_refunds;
create policy stripe_refunds_read_own
  on public.stripe_refunds for select to authenticated
  using (exists (
    select 1 from public.stripe_payment_attempts a
      join public.transactions t on t.id = a.transaction_id
     where a.id = payment_attempt_id and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
  ));

-- stripe_events: no policy, no grant. Service role only.

-- ── 6 · the one atomic webhook writer ────────────────────────────────────

create or replace function public.stripe_apply_event(
  p_event jsonb,
  p_attempt_id uuid,
  p_expected_lifecycle text,
  p_patch jsonb
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_event_row uuid;
  v_txn uuid;
  v_amount bigint;
  v_total bigint;
  v_result text;
  r jsonb;
begin
  /* 1 · record once. Provider identity is (event_id, account context). */
  insert into public.stripe_events
    (event_id, stripe_account_id, event_type, livemode, object_type, object_id,
     provider_created_at, payment_attempt_id, transaction_id, payload)
  values
    (p_event->>'event_id',
     nullif(p_event->>'stripe_account_id', ''),
     p_event->>'event_type',
     coalesce((p_event->>'livemode')::boolean, false),
     p_event->>'object_type',
     p_event->>'object_id',
     nullif(p_event->>'provider_created_at', '')::timestamptz,
     p_attempt_id,
     null,
     coalesce(p_event->'payload', '{}'::jsonb))
  on conflict (event_id, coalesce(stripe_account_id, '')) do nothing
  returning id into v_event_row;

  if v_event_row is null then
    return jsonb_build_object('result', 'duplicate');
  end if;

  /* 2 · nothing to resolve to: keep the event, say so. */
  if p_attempt_id is null then
    update public.stripe_events set processing_result = 'unresolved',
      processing_note = coalesce(p_event->>'note', 'no payment attempt matched')
     where id = v_event_row;
    return jsonb_build_object('result', 'unresolved', 'event_row_id', v_event_row);
  end if;

  select transaction_id, amount_minor into v_txn, v_amount
    from public.stripe_payment_attempts where id = p_attempt_id;

  /* 3 · recorded but semantically ignored (already succeeded, unknown type…) */
  if p_patch is null then
    update public.stripe_events set processing_result = 'ignored', transaction_id = v_txn,
      processing_note = coalesce(p_event->>'note', 'no transition')
     where id = v_event_row;
    return jsonb_build_object('result', 'ignored', 'event_row_id', v_event_row);
  end if;

  /* 4 · at most one transition, only from the lifecycle the caller saw. */
  update public.stripe_payment_attempts set
    lifecycle               = coalesce(p_patch->>'lifecycle', lifecycle),
    refund_state            = coalesce(p_patch->>'refund_state', refund_state),
    refunded_amount_minor   = coalesce((p_patch->>'refunded_amount_minor')::bigint, refunded_amount_minor),
    dispute_state           = coalesce(p_patch->>'dispute_state', dispute_state),
    dispute_provider_status = case when p_patch ? 'dispute_provider_status' then p_patch->>'dispute_provider_status' else dispute_provider_status end,
    dispute_id              = coalesce(p_patch->>'dispute_id', dispute_id),
    payment_intent_id       = coalesce(p_patch->>'payment_intent_id', payment_intent_id),
    charge_id               = coalesce(p_patch->>'charge_id', charge_id),
    provider_status         = coalesce(p_patch->>'provider_status', provider_status),
    is_active               = coalesce((p_patch->>'is_active')::boolean, is_active),
    updated_at              = now()
  where id = p_attempt_id and lifecycle = p_expected_lifecycle;

  if not found then
    update public.stripe_events set processing_result = 'stale', transaction_id = v_txn,
      processing_note = 'attempt lifecycle moved before this event applied'
     where id = v_event_row;
    return jsonb_build_object('result', 'stale', 'event_row_id', v_event_row);
  end if;

  /* 5 · refunds keep their provider identity; the total is derived, never trusted from one event. */
  for r in select * from jsonb_array_elements(coalesce(p_patch->'refunds', '[]'::jsonb)) loop
    insert into public.stripe_refunds (payment_attempt_id, refund_id, amount_minor, status, provider_created_at, last_event_id)
    values (p_attempt_id, r->>'id', coalesce((r->>'amountMinor')::bigint, 0), r->>'status',
            case when r->>'created' is not null then to_timestamp((r->>'created')::bigint) end,
            p_event->>'event_id')
    on conflict (refund_id) do update
      set amount_minor = excluded.amount_minor, status = excluded.status, last_event_id = excluded.last_event_id;
  end loop;

  if p_patch ? 'refunds' or p_patch ? 'refunded_amount_minor' then
    select coalesce(sum(amount_minor), 0) into v_total
      from public.stripe_refunds
     where payment_attempt_id = p_attempt_id and coalesce(status, 'succeeded') not in ('failed', 'canceled');
    update public.stripe_payment_attempts set
      refunded_amount_minor = greatest(refunded_amount_minor, v_total),
      refund_state = case
        when greatest(refunded_amount_minor, v_total) <= 0 then 'none'
        when greatest(refunded_amount_minor, v_total) >= v_amount then 'full'
        else 'partial' end,
      updated_at = now()
    where id = p_attempt_id;
  end if;

  v_result := 'applied';
  update public.stripe_events set processing_result = v_result, transaction_id = v_txn,
    processing_note = p_event->>'note'
   where id = v_event_row;
  return jsonb_build_object('result', v_result, 'event_row_id', v_event_row);
end;
$fn$;

revoke all on function public.stripe_apply_event(jsonb, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.stripe_apply_event(jsonb, uuid, text, jsonb) to service_role;
