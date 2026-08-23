-- ═══════════════════════════════════════════════════════════════════════
-- TRADE OFFERS V1 — a governed offer whose consideration is another watch
--
-- THE MISCONCEPTION THIS FILE EXISTS TO KILL:
-- "A trade is a purchase for $0." It is not, and writing 0 would be a lie —
-- an even trade has no cash consideration at all. purchase_requests is
-- structurally a CASH offer object (listing_price and
-- proposed_purchase_price are both NOT NULL, buyer/seller are asymmetric,
-- its unique indexes are one-listing semantics) and it stays exactly that.
-- Trade gets a sibling. Nothing here modifies purchase_requests,
-- accept_purchase_request(), or their indexes.
--
-- ── FOUNDER RULING: OPTION A — ONE DEAL, TWO LEGS ─────────────────────
-- An accepted trade is ONE deal that owns acceptance, settlement,
-- cancellation and completion, plus TWO directional watch-transfer legs
-- that each own their own physical-object truth (custody, shipping,
-- verification, transfer, and later Passport-relevant events). It is
-- deliberately NOT two independent transaction rows pretending to be
-- separate deals, and optional cash is consideration inside the parent
-- deal — never a third transaction.
--
-- ── CASH DIRECTION IS NEVER A SIGNED NUMBER ───────────────────────────
-- none / proposer_pays / recipient_pays, with the amount stored
-- separately. NULL and 0 must never be abused to mean "trade": the CHECK
-- below makes 'none' carry no amount and a paying direction carry one.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1 · Seller posture: one explicit listing-level declaration ──────────
alter table public.listings
  add column if not exists open_to_trades boolean not null default false;

comment on column public.listings.open_to_trades is
  'Seller declares this watch may receive trade proposals. Binary in V1 — no preference taxonomy. Governed state, never description text.';

-- ── 2 · The offer ───────────────────────────────────────────────────────
create table if not exists public.trade_offers (
  id            uuid primary key default gen_random_uuid(),

  /* TWO WATCH ROLES, never inferred from buyer/seller columns. The deal
     must stay readable after ownership changes, which is exactly when
     "who was the buyer" stops being a reliable way to tell the watches
     apart. */
  target_listing_id  uuid not null references public.listings (id) on delete restrict,
  offered_listing_id uuid not null references public.listings (id) on delete restrict,

  proposer_id  uuid not null references auth.users (id) on delete restrict,
  recipient_id uuid not null references auth.users (id) on delete restrict,

  status text not null default 'pending'
         check (status in ('pending', 'accepted', 'declined', 'superseded', 'withdrawn')),

  cash_direction text not null default 'none'
         check (cash_direction in ('none', 'proposer_pays', 'recipient_pays')),
  cash_amount   numeric(12,2) check (cash_amount is null or cash_amount > 0),
  cash_currency text,

  note text check (note is null or char_length(note) <= 500),

  /* Identity snapshots, the purchase_requests convention: the offer must
     still read correctly after a listing's own fields move on. */
  target_brand    text,
  target_model    text,
  target_reference text,
  offered_brand   text,
  offered_model   text,
  offered_reference text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  /* An even trade carries no cash. A directed trade carries an amount and
     a currency. Neither NULL nor 0 is allowed to mean "trade". */
  constraint trade_offers_cash_pair_check check (
    (cash_direction = 'none' and cash_amount is null and cash_currency is null)
    or (cash_direction <> 'none' and cash_amount is not null and cash_currency is not null)
  ),
  /* A watch cannot be traded for itself, and a collector cannot trade with
     themselves. */
  constraint trade_offers_distinct_watches_check check (target_listing_id <> offered_listing_id),
  constraint trade_offers_distinct_parties_check check (proposer_id <> recipient_id)
);

create index if not exists trade_offers_target_idx  on public.trade_offers (target_listing_id, created_at desc);
create index if not exists trade_offers_offered_idx on public.trade_offers (offered_listing_id, created_at desc);
create index if not exists trade_offers_proposer_idx on public.trade_offers (proposer_id, created_at desc);
create index if not exists trade_offers_recipient_idx on public.trade_offers (recipient_id, created_at desc);

/* One accepted trade per watch, on EITHER side. The purchase_requests
   precedent (one accepted per listing) expressed for a two-object deal:
   a watch already promised in an accepted trade cannot be promised again. */
create unique index if not exists trade_offers_one_accepted_per_target
  on public.trade_offers (target_listing_id) where (status = 'accepted');
create unique index if not exists trade_offers_one_accepted_per_offered
  on public.trade_offers (offered_listing_id) where (status = 'accepted');
/* One live proposal per proposer per target — a second is a replacement,
   not a pile-up. Mirrors purchase_requests_one_pending_per_buyer. */
create unique index if not exists trade_offers_one_pending_per_proposer
  on public.trade_offers (target_listing_id, proposer_id) where (status = 'pending');

alter table public.trade_offers enable row level security;

/* Both parties to a trade see it; nobody else does. */
drop policy if exists trade_offers_select_party on public.trade_offers;
create policy trade_offers_select_party on public.trade_offers
  for select using (proposer_id = auth.uid() or recipient_id = auth.uid());

/* Creation is server-side only (the route validates both watches and the
   seller's posture first). No client INSERT policy exists. */

comment on table public.trade_offers is
  'Governed offer whose consideration is another governed watch. Sibling to purchase_requests, which remains a clean cash-offer object and is untouched.';

-- ── 3 · Append-only lifecycle history (purchase_request_events pattern) ──
create table if not exists public.trade_offer_events (
  id             uuid primary key default gen_random_uuid(),
  trade_offer_id uuid not null references public.trade_offers (id) on delete cascade,
  event_type     text not null
                 check (event_type in ('proposed','accepted','declined','withdrawn','superseded')),
  actor_user_id  uuid references auth.users (id) on delete set null,
  prior_status   text,
  resulting_status text not null,
  /* The accepted consideration, frozen. History must be able to say what
     was actually agreed even after the offer row's own fields move on. */
  metadata       jsonb not null default '{}',
  occurred_at    timestamptz not null default now()
);

create index if not exists trade_offer_events_offer_idx
  on public.trade_offer_events (trade_offer_id, occurred_at desc);

alter table public.trade_offer_events enable row level security;

drop policy if exists trade_offer_events_select_party on public.trade_offer_events;
create policy trade_offer_events_select_party on public.trade_offer_events
  for select using (
    exists (
      select 1 from public.trade_offers o
       where o.id = trade_offer_id
         and (o.proposer_id = auth.uid() or o.recipient_id = auth.uid())
    )
  );

comment on table public.trade_offer_events is
  'Append-only trade lifecycle history. Never rewritten; metadata freezes the consideration as accepted.';

-- ═══════════════════════════════════════════════════════════════════════
-- 4 · THE DEAL AND ITS LEGS — founder-ruled Option A
--
-- The parent owns the DEAL: acceptance, settlement, cancellation,
-- completion, and the optional cash consideration. Each leg owns ONE
-- physical watch moving in ONE direction, and is where custody, shipping,
-- verification and transfer truth will live — the shape Watch Passport
-- consumes later, without Passport owning any trade logic now.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.trade_deals (
  id             uuid primary key default gen_random_uuid(),
  trade_offer_id uuid not null unique references public.trade_offers (id) on delete restrict,

  party_a_id uuid not null references auth.users (id) on delete restrict,
  party_b_id uuid not null references auth.users (id) on delete restrict,

  /* Deal-level state. Cash settlement and completion belong to the DEAL,
     not to either watch — a trade is one agreement. */
  status text not null default 'pending'
         check (status in ('pending', 'settling', 'completed', 'cancelled')),

  cash_direction text not null
         check (cash_direction in ('none', 'proposer_pays', 'recipient_pays')),
  cash_amount   numeric(12,2) check (cash_amount is null or cash_amount > 0),
  cash_currency text,
  /* Cash rail stays nullable and unconstrained in V1: the fee/payment
     policy is an open founder decision and this column exists to hold the
     answer, not to presume it. */
  cash_rail text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,

  constraint trade_deals_cash_pair_check check (
    (cash_direction = 'none' and cash_amount is null and cash_currency is null)
    or (cash_direction <> 'none' and cash_amount is not null and cash_currency is not null)
  ),
  constraint trade_deals_distinct_parties_check check (party_a_id <> party_b_id)
);

create index if not exists trade_deals_party_a_idx on public.trade_deals (party_a_id, created_at desc);
create index if not exists trade_deals_party_b_idx on public.trade_deals (party_b_id, created_at desc);

alter table public.trade_deals enable row level security;

drop policy if exists trade_deals_select_party on public.trade_deals;
create policy trade_deals_select_party on public.trade_deals
  for select using (party_a_id = auth.uid() or party_b_id = auth.uid());

comment on table public.trade_deals is
  'One accepted trade. Owns deal state, optional cash consideration, settlement and completion. NOT two independent transactions — the watch-level truth lives on trade_deal_legs.';

create table if not exists public.trade_deal_legs (
  id            uuid primary key default gen_random_uuid(),
  trade_deal_id uuid not null references public.trade_deals (id) on delete cascade,

  /* ONE watch moving in ONE direction. This is the Passport-relevant
     shape: object, giver, receiver. */
  listing_id  uuid not null references public.listings (id) on delete restrict,
  from_user_id uuid not null references auth.users (id) on delete restrict,
  to_user_id   uuid not null references auth.users (id) on delete restrict,

  /* Per-object lifecycle, independent of the other leg: one watch can be
     shipped and verified while the other has not moved. Deal completion is
     the parent's business; this is the object's own progress. */
  leg_status text not null default 'bound'
         check (leg_status in ('bound', 'in_transit', 'delivered', 'verified', 'transferred', 'cancelled')),

  /* Identity snapshot, so a leg still reads truthfully as history. */
  listing_brand     text,
  listing_model     text,
  listing_reference text,
  listing_public_code text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint trade_deal_legs_distinct_parties_check check (from_user_id <> to_user_id),
  /* One leg per watch per deal — the same watch cannot move twice in one
     trade. */
  constraint trade_deal_legs_one_per_listing unique (trade_deal_id, listing_id)
);

create index if not exists trade_deal_legs_deal_idx on public.trade_deal_legs (trade_deal_id);
/* The delete-eligibility read below depends on finding legs BY LISTING. */
create index if not exists trade_deal_legs_listing_idx on public.trade_deal_legs (listing_id);

alter table public.trade_deal_legs enable row level security;

drop policy if exists trade_deal_legs_select_party on public.trade_deal_legs;
create policy trade_deal_legs_select_party on public.trade_deal_legs
  for select using (
    exists (
      select 1 from public.trade_deals d
       where d.id = trade_deal_id
         and (d.party_a_id = auth.uid() or d.party_b_id = auth.uid())
    )
  );

comment on table public.trade_deal_legs is
  'One watch moving one direction inside a trade deal. Owns custody/shipping/verification/transfer truth for that object. This is the shape Watch Passport will later consume; Passport owns no trade logic.';

create or replace function public.touch_trade_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_trade_offers_updated_at on public.trade_offers;
create trigger trg_trade_offers_updated_at before update on public.trade_offers
  for each row execute function public.touch_trade_updated_at();
drop trigger if exists trg_trade_deals_updated_at on public.trade_deals;
create trigger trg_trade_deals_updated_at before update on public.trade_deals
  for each row execute function public.touch_trade_updated_at();
drop trigger if exists trg_trade_deal_legs_updated_at on public.trade_deal_legs;
create trigger trg_trade_deal_legs_updated_at before update on public.trade_deal_legs
  for each row execute function public.touch_trade_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
-- 5 · ACCEPTANCE — atomic across BOTH watches
--
-- The core law: a trade cannot be accepted unless both governed watch
-- objects are still eligible at the moment of acceptance.
--
-- ⚠ DEADLOCK PREVENTION — THE MOST LIKELY PRODUCTION DEFECT.
-- Both listing rows are locked in deterministic sorted listing_id order.
-- Crossing trades (A offers X for Y while B offers Y for X) accepted at the
-- same instant would otherwise take the two locks in opposite orders and
-- deadlock. DO NOT "simplify" this to lock target-then-offered.
--
-- accept_purchase_request() is NOT modified and NOT generalized: it locks
-- one listing, carries one cash price, and writes one transactions row.
-- Those assumptions are correct for a cash purchase and wrong for a trade.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.accept_trade_offer(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_caller  uuid := auth.uid();
  v_offer   public.trade_offers%rowtype;
  v_first   uuid;
  v_second  uuid;
  v_target  public.listings%rowtype;
  v_offered public.listings%rowtype;
  v_deal_id uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_offer from public.trade_offers where id = p_offer_id;
  if not found then
    raise exception 'not_found';
  end if;

  -- Only the recipient of the offer may accept it.
  if v_offer.recipient_id <> v_caller then
    raise exception 'not_allowed';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'already_resolved:%', v_offer.status;
  end if;

  /* ── THE DETERMINISTIC LOCK ORDER ── */
  if v_offer.target_listing_id < v_offer.offered_listing_id then
    v_first  := v_offer.target_listing_id;
    v_second := v_offer.offered_listing_id;
  else
    v_first  := v_offer.offered_listing_id;
    v_second := v_offer.target_listing_id;
  end if;

  perform 1 from public.listings where id = v_first  for update;
  perform 1 from public.listings where id = v_second for update;

  select * into v_target  from public.listings where id = v_offer.target_listing_id;
  select * into v_offered from public.listings where id = v_offer.offered_listing_id;
  if v_target.id is null or v_offered.id is null then
    raise exception 'not_found';
  end if;

  -- Both objects must still be acquirable INSIDE this boundary.
  if v_target.status not in ('published', 'private_active') then
    raise exception 'target_not_available:%', v_target.status;
  end if;
  if v_offered.status not in ('published', 'private_active') then
    raise exception 'offered_not_available:%', v_offered.status;
  end if;

  -- Control must still be true on both sides.
  if v_target.seller_id <> v_offer.recipient_id then
    raise exception 'target_not_controlled_by_recipient';
  end if;
  if v_offered.seller_id <> v_offer.proposer_id then
    raise exception 'offered_not_controlled_by_proposer';
  end if;

  -- The seller's posture must still permit trades.
  if v_target.open_to_trades is not true then
    raise exception 'target_not_open_to_trades';
  end if;

  -- Neither watch may already be bound to a conflicting accepted deal.
  if exists (
    select 1 from public.purchase_requests
     where listing_id in (v_target.id, v_offered.id) and status = 'accepted'
  ) then
    raise exception 'listing_already_accepted';
  end if;
  if exists (
    select 1 from public.trade_offers
     where status = 'accepted'
       and (target_listing_id in (v_target.id, v_offered.id)
         or offered_listing_id in (v_target.id, v_offered.id))
  ) then
    raise exception 'listing_already_in_accepted_trade';
  end if;

  -- ── Accept, and supersede what this acceptance displaces ──
  update public.trade_offers
     set status = 'accepted', updated_at = now()
   where id = p_offer_id;

  update public.trade_offers
     set status = 'superseded', updated_at = now()
   where id <> p_offer_id
     and status = 'pending'
     and (target_listing_id  in (v_target.id, v_offered.id)
       or offered_listing_id in (v_target.id, v_offered.id));

  /* Cash purchase requests on either watch are superseded too — the watch
     is spoken for. 'superseded' is the correct terminal state here, not
     'declined': nobody rejected those offers, a different deal won. */
  update public.purchase_requests
     set status = 'superseded', updated_at = now()
   where listing_id in (v_target.id, v_offered.id)
     and status = 'pending';

  -- ── The deal, and its two directional legs ──
  insert into public.trade_deals
    (trade_offer_id, party_a_id, party_b_id, status,
     cash_direction, cash_amount, cash_currency)
  values
    (v_offer.id, v_offer.proposer_id, v_offer.recipient_id, 'pending',
     v_offer.cash_direction, v_offer.cash_amount, v_offer.cash_currency)
  returning id into v_deal_id;

  -- Leg 1 — the target watch goes to the proposer.
  insert into public.trade_deal_legs
    (trade_deal_id, listing_id, from_user_id, to_user_id,
     listing_brand, listing_model, listing_reference, listing_public_code)
  values
    (v_deal_id, v_target.id, v_offer.recipient_id, v_offer.proposer_id,
     v_target.brand, v_target.model, v_target.reference, v_target.public_code);

  -- Leg 2 — the offered watch goes to the recipient.
  insert into public.trade_deal_legs
    (trade_deal_id, listing_id, from_user_id, to_user_id,
     listing_brand, listing_model, listing_reference, listing_public_code)
  values
    (v_deal_id, v_offered.id, v_offer.proposer_id, v_offer.recipient_id,
     v_offered.brand, v_offered.model, v_offered.reference, v_offered.public_code);

  /* Both watches leave the market together. 'reserved' is the existing
     lifecycle vocabulary for "spoken for, not yet settled" — no
     traded_pending_* state is invented merely because the UI wants a label. */
  update public.listings
     set status = 'reserved', updated_at = now()
   where id in (v_target.id, v_offered.id);

  insert into public.trade_offer_events
    (trade_offer_id, event_type, actor_user_id, prior_status, resulting_status, metadata)
  values
    (v_offer.id, 'accepted', v_caller, 'pending', 'accepted',
     jsonb_build_object(
       'trade_deal_id', v_deal_id,
       'target_listing_id', v_target.id,
       'offered_listing_id', v_offered.id,
       'cash_direction', v_offer.cash_direction,
       'cash_amount', v_offer.cash_amount,
       'cash_currency', v_offer.cash_currency
     ));

  return jsonb_build_object(
    'trade_offer_id', p_offer_id,
    'status', 'accepted',
    'trade_deal_id', v_deal_id,
    'target_listing_id', v_target.id,
    'offered_listing_id', v_offered.id,
    'both_listings_status', 'reserved'
  );
end;
$function$;

revoke all on function public.accept_trade_offer(uuid) from public, anon;
grant execute on function public.accept_trade_offer(uuid) to authenticated, service_role;

comment on function public.accept_trade_offer(uuid) is
  'Atomic two-object trade acceptance. Locks both listings in deterministic sorted listing_id order to prevent crossing-trade deadlock. Creates one trade_deal and two directional trade_deal_legs. accept_purchase_request() is untouched.';

-- ── 6 · Delete-eligibility must know a watch is bound in a trade ────────
-- Without this, an offered watch bound by an accepted trade would still
-- look permanently deletable: the existing blocker counts `transactions`
-- rows, and a trade writes legs instead. Additive — every existing blocker
-- and the whole return shape are unchanged.
create or replace function public.listing_delete_eligibility(p_listing_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_founder    constant uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
  v_listing    public.listings%ROWTYPE;
  v_blockers   jsonb := '[]'::jsonb;
  v_accepted   int;
  v_pending    int;
  v_txn        int;
  v_txn_states text;
  v_wizard     int;
  v_trade      int;
BEGIN
  SELECT * INTO v_listing FROM public.listings WHERE id = p_listing_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF v_caller IS NOT NULL
     AND v_listing.seller_id <> v_caller
     AND v_caller <> v_founder THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  SELECT count(*) FILTER (WHERE status = 'accepted'),
         count(*) FILTER (WHERE status = 'pending')
    INTO v_accepted, v_pending
    FROM public.purchase_requests
   WHERE listing_id = p_listing_id;

  IF v_accepted > 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'accepted_purchase_request', 'count', v_accepted);
  END IF;

  SELECT count(*), string_agg(DISTINCT status, ', ' ORDER BY status)
    INTO v_txn, v_txn_states
    FROM public.transactions
   WHERE listing_id = p_listing_id
     AND status NOT IN ('completed', 'cancelled', 'refunded');

  IF v_txn > 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'active_transaction', 'count', v_txn, 'states', v_txn_states);
  END IF;

  /* A watch bound in a live trade deal — on EITHER leg — is spoken for. */
  SELECT count(*) INTO v_trade
    FROM public.trade_deal_legs l
    JOIN public.trade_deals d ON d.id = l.trade_deal_id
   WHERE l.listing_id = p_listing_id
     AND d.status NOT IN ('completed', 'cancelled');

  IF v_trade > 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'active_trade_deal', 'count', v_trade);
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
    'lifecycle_state',               v_listing.status,
    'is_public',                     v_listing.status = 'published',
    'removal_reason_code',           v_listing.removal_reason_code,
    'pending_requests_to_close',     v_pending,
    'eligible_for_permanent_delete', jsonb_array_length(v_blockers) = 0,
    'blockers',                      v_blockers,
    'evaluated_at',                  now()
  );
END $function$;
