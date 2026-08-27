/* ════════════════════════════════════════════════════════════════════════
   TERMINAL TRADE OFFER DELETE DEPENDENCY INTEGRITY              (v6.93)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "A trade offer needs its listing rows forever, so any listing that was
      ever in a trade can never be permanently deleted."

   No. Founder law splits the vocabulary by what the offer still IS:

     · accepted          → the offer that became a real trade. Hard-blocks
                           Delete, and its listing references never detach.
     · pending           → an open proposal. Hard-blocks Delete while open.
     · declined / superseded / withdrawn → HISTORY. A dead proposal must not
                           immortalize an obsolete listing, and the listing
                           must not drag the history to the grave with it.

     Do not preserve the listing merely to preserve Trade Offer history.
     Do not delete Trade Offer history merely to permit listing deletion.

   The resolution: terminal offers carry their own durable identity
   (brand/model/reference snapshots existed since V1; public codes join them
   here), so their listing references may DETACH (SET NULL) when the listing
   is purged — the history survives, legible, on its own feet.

   ── TERMINAL MUST ACTUALLY MEAN TERMINAL — AND FIRST ────────────────────

   Detachment is only safe because a detached offer can never wake up. The
   status CHECK constrains values, not transitions: at the database level a
   declined offer could be UPDATEd back to pending — and after this
   migration, that would be a pending offer with NULL listing ids. So the
   transition guard lands BEFORE nullability, and it is table-level because
   decline/withdraw/supersede are plain UPDATEs from two different writers,
   not one governed RPC, and a CHECK cannot see OLD.status.

   'accepted' is deliberately NOT in the immutable set: it remains a hard
   Delete blocker, but the round refuses to freeze a state the Trade Deal
   settlement path may someday need to move. (Today NO transition out of
   accepted exists anywhere in the repo — deal progress lives entirely on
   trade_deals/trade_deal_legs — so nothing is lost either way.)

   ── TWO GATES, NEITHER TRUSTING THE OTHER ───────────────────────────────

     1. listing_delete_eligibility() refuses accepted/pending before the
        destructive call (governed truth, shipped v6.89);
     2. the non-terminal-requires-listings CHECK below makes the orphan
        structurally impossible: a bypassing DELETE fires SET NULL into a
        non-terminal row, violates the CHECK, and the whole delete aborts.

   ── WHAT THIS ROUND DELIBERATELY DOES NOT TOUCH ─────────────────────────

     · TRADE DEALS. trade_deal_legs.listing_id stays NOT NULL RESTRICT and
       trade_deal_history stays a Delete blocker — a deal is a settlement
       object with physical legs, not a proposal, and is not governed by
       this ruling.
     · The one live accepted production offer. No statement here rewrites,
       detaches, or backfills it — snapshot capture for pre-existing rows
       happens truthfully at the moment an offer becomes terminal, while
       its listings still exist, never as invented at-proposal history.

   POINT OF NO RETURN: once the first legitimate terminal offer survives a
   listing deletion with a NULL reference, restoring NOT NULL is no longer a
   simple rollback. Until that first detach, this migration reverses
   cleanly (drop triggers/CHECK, re-point FKs, drop columns, re-add the
   blocker append).

   PFC274 = 62 — Canary path untouched.
   ════════════════════════════════════════════════════════════════════════ */

-- ═════ 1 · TERMINAL STATES BECOME STRUCTURALLY TERMINAL ══════════════════

create or replace function public.trade_offer_terminal_states_are_immutable()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  raise exception 'terminal_offer_immutable: % -> %', OLD.status, NEW.status;
end
$fn$;

revoke all on function public.trade_offer_terminal_states_are_immutable()
  from public, anon, authenticated, service_role;

/* Fires only on a genuine attempt to LEAVE a terminal state. The FK's
   SET NULL cascade and ordinary column touches keep status unchanged and
   never wake it. Named to sort before trg_trade_offers_updated_at so the
   refusal lands before any bookkeeping trigger runs. */
drop trigger if exists trade_offers_terminal_immutable on public.trade_offers;
create trigger trade_offers_terminal_immutable
  before update of status on public.trade_offers
  for each row
  when (OLD.status in ('declined', 'superseded', 'withdrawn')
        and NEW.status is distinct from OLD.status)
  execute function public.trade_offer_terminal_states_are_immutable();

comment on function public.trade_offer_terminal_states_are_immutable() is
  'Refuses any status transition out of declined/superseded/withdrawn. Terminal must actually mean terminal — detached history can never return to an active state. accepted is deliberately not in this set.';

-- ═════ 2 · THE DURABLE IDENTITY COMPLETES: PUBLIC CODES ══════════════════

/* trade_deal_legs already snapshots listing_public_code at write time
   (20260823230000). Same fact, same capture semantics, prefixed for the
   offer's two-sided shape exactly as the existing brand/model/reference
   snapshot columns are. */
alter table public.trade_offers
  add column target_public_code  text,
  add column offered_public_code text;

comment on column public.trade_offers.target_public_code is
  'Durable FWT public code of the target listing, captured while the listing exists (at proposal for new offers; at terminal transition for rows that predate the column). Never fabricated after detachment.';
comment on column public.trade_offers.offered_public_code is
  'Durable FWT public code of the offered listing — same capture rules as target_public_code.';

/* CAPTURE AT THE TERMINAL TRANSITION — the pre-existing-row guard.

   Offers created before these columns (including the one live accepted
   offer) have NULL codes. The moment such an offer becomes terminal — the
   moment it becomes DETACHABLE — this trigger reads the still-existing
   listings and records their codes. That is durable identity preservation
   at the last moment it is truthfully possible, not pretend archaeology:
   nothing claims the value was captured at proposal time, and no migration
   statement backfills anything.

   BEFORE trigger, so the codes land in the same row version as the
   terminal status itself. */
create or replace function public.trade_offer_capture_codes_on_terminal()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if NEW.target_public_code is null and NEW.target_listing_id is not null then
    select l.public_code into NEW.target_public_code
      from public.listings l where l.id = NEW.target_listing_id;
  end if;
  if NEW.offered_public_code is null and NEW.offered_listing_id is not null then
    select l.public_code into NEW.offered_public_code
      from public.listings l where l.id = NEW.offered_listing_id;
  end if;
  return NEW;
end
$fn$;

revoke all on function public.trade_offer_capture_codes_on_terminal()
  from public, anon, authenticated, service_role;

drop trigger if exists trade_offers_capture_codes_on_terminal on public.trade_offers;
create trigger trade_offers_capture_codes_on_terminal
  before update of status on public.trade_offers
  for each row
  when (NEW.status in ('declined', 'superseded', 'withdrawn')
        and OLD.status not in ('declined', 'superseded', 'withdrawn'))
  execute function public.trade_offer_capture_codes_on_terminal();

comment on function public.trade_offer_capture_codes_on_terminal() is
  'When an offer becomes terminal, snapshots any missing public codes from the still-linked listings — the last truthful moment before the references may detach. Covers rows that predate the code columns.';

-- ═════ 3 · LISTING REFERENCES MAY DETACH — FOR TERMINAL HISTORY ONLY ═════

alter table public.trade_offers
  alter column target_listing_id  drop not null,
  alter column offered_listing_id drop not null;

alter table public.trade_offers drop constraint trade_offers_target_listing_id_fkey;
alter table public.trade_offers
  add constraint trade_offers_target_listing_id_fkey
    foreign key (target_listing_id) references public.listings(id) on delete set null;

alter table public.trade_offers drop constraint trade_offers_offered_listing_id_fkey;
alter table public.trade_offers
  add constraint trade_offers_offered_listing_id_fkey
    foreign key (offered_listing_id) references public.listings(id) on delete set null;

/* trade_offers_distinct_watches_check (target <> offered) needs no change:
   with a NULL on either side the comparison is NULL, which a CHECK treats
   as pass — and the constraint below guarantees the only rows that can
   carry a NULL are terminal history, where distinctness already did its
   job at proposal time. */

-- ═════ 4 · THE SECOND GATE: NON-TERMINAL OFFERS CANNOT BE ORPHANED ═══════

/* This is what makes the SET NULL above safe. Deleting a listing tied to a
   pending or accepted offer fires SET NULL into a non-terminal row, this
   CHECK refuses the new row version, and the entire DELETE aborts — even
   for a caller that never consulted eligibility. Gate 1 is governed truth;
   gate 2 is the database refusing the orphan outright. */
alter table public.trade_offers
  add constraint trade_offers_non_terminal_requires_listings_check
    check (
      status in ('declined', 'superseded', 'withdrawn')
      or (target_listing_id is not null and offered_listing_id is not null)
    );

-- ═════ 5 · ELIGIBILITY: TERMINAL HISTORY STOPS BLOCKING ══════════════════

/* Identical to the v6.89 function in every respect but one: terminal
   trade-offer rows no longer append a blocker. They surface instead as an
   informational count (`terminal_trade_offers`, sibling in spirit to
   pending_requests_to_close — a consequence, not a refusal): those records
   will detach and survive independently when the listing is purged.
   accepted_trade_offer and pending_trade_offer are byte-identical to what
   shipped. trade_deal_history remains a blocker — Trade Deals are out of
   scope and their legs still RESTRICT. */
create or replace function public.listing_delete_eligibility(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
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
  v_trade_hist int;
  v_off_acc    int;
  v_off_pend   int;
  v_off_term   int;
begin
  select * into v_listing from public.listings where id = p_listing_id;
  if not found then raise exception 'not_found'; end if;

  if v_caller is not null
     and v_listing.seller_id <> v_caller
     and v_caller <> v_founder then
    raise exception 'not_found';
  end if;

  select count(*) filter (where status = 'accepted'),
         count(*) filter (where status = 'pending')
    into v_accepted, v_pending
    from public.purchase_requests
   where listing_id = p_listing_id;

  if v_accepted > 0 then
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'accepted_purchase_request', 'count', v_accepted);
  end if;

  select count(*), string_agg(distinct status, ', ' order by status)
    into v_txn, v_txn_states
    from public.transactions
   where listing_id = p_listing_id
     and status not in ('completed', 'cancelled', 'refunded');

  if v_txn > 0 then
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'active_transaction', 'count', v_txn, 'states', v_txn_states);
  end if;

  select count(*) filter (where d.status not in ('completed', 'cancelled')),
         count(*) filter (where d.status in ('completed', 'cancelled'))
    into v_trade, v_trade_hist
    from public.trade_deal_legs l
    join public.trade_deals d on d.id = l.trade_deal_id
   where l.listing_id = p_listing_id;

  if v_trade > 0 then
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'active_trade_deal', 'count', v_trade);
  end if;

  if v_trade_hist > 0 then
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'trade_deal_history', 'count', v_trade_hist);
  end if;

  select count(*) filter (where status = 'accepted'),
         count(*) filter (where status = 'pending'),
         count(*) filter (where status in ('declined', 'superseded', 'withdrawn'))
    into v_off_acc, v_off_pend, v_off_term
    from public.trade_offers
   where target_listing_id = p_listing_id
      or offered_listing_id = p_listing_id;

  if v_off_acc > 0 then
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'accepted_trade_offer', 'count', v_off_acc);
  end if;

  if v_off_pend > 0 then
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'pending_trade_offer', 'count', v_off_pend);
  end if;

  /* Terminal history is no longer a blocker — founder ruling 2026-08-27.
     The count is reported informationally below so a delete preview can say
     what will detach; deliberately NOT appended to blockers. */

  select count(*) into v_wizard
    from public.mobile_wizard_sessions
   where listing_id = p_listing_id and status = 'active';

  if v_wizard > 0 then
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'active_wizard_session', 'count', v_wizard);
  end if;

  return jsonb_build_object(
    'listing_id',                    p_listing_id,
    'public_code',                   v_listing.public_code,
    'lifecycle_state',               v_listing.status,
    'is_public',                     v_listing.status = 'published',
    'removal_reason_code',           v_listing.removal_reason_code,
    'pending_requests_to_close',     v_pending,
    'terminal_trade_offers',         coalesce(v_off_term, 0),
    'eligible_for_permanent_delete', jsonb_array_length(v_blockers) = 0,
    'blockers',                      v_blockers,
    'evaluated_at',                  now()
  );
end
$fn$;
