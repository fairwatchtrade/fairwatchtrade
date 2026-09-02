/* ════════════════════════════════════════════════════════════════════════
   TRADE V1 — STEP 2 OF 2: LIFECYCLE TRUTH AND AUTHORITATIVE EVENT HISTORY
   supabase/migrations/20260902160000_trade_lifecycle_truth_step_2.sql (v8.19)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "trade_offer_events is a log. Best effort is fine."

   It is not a log. Founder ruling, 2026-09-02, verbatim:

     trade_offer_events is the authoritative, append-only history of Trade
     offer lifecycle transitions. Every governed lifecycle transition must
     atomically author its corresponding event. Event history may not be
     silently skipped, edited, or deleted. Historical reconciliation must
     preserve supported truth and must never fabricate events that cannot
     be evidenced.

   Before this file, three things were true that contradict that ruling:

   · decline and withdraw were plain service-role UPDATEs from a route, with
     the event inserted afterwards in a separate statement whose error was
     discarded — a status change could exist with no history;
   · Trade acceptance superseded competing offers in bulk with NO event for
     any of them, and the deal's completion authored its event only on the
     recipient path — a founder-asserted completion left the deal completed
     and the history silent;
   · the table itself granted UPDATE, DELETE and TRUNCATE to anon,
     authenticated and service_role, and carried no trigger. Privilege was
     permission to rewrite history.

   ── THE FOUR SCOPES, AND WHERE EACH LANDS ──────────────────────────────

   A. Cross-mechanism supersession, both directions.
      Trade and Purchase Requests stay SEPARATE sibling systems. When either
      commits a watch, competing pending offers in the OTHER become truthfully
      superseded in the same transaction. Trade acceptance already retired
      pending Purchase Requests; it now also authors one `superseded` event
      per Trade offer it retires. accept_purchase_request() gains exactly one
      additive write: it retires pending Trade offers on its listing — as
      target OR as offered consideration — with one event each. Purchase
      Requests keep their own history contract (purchase_request_events is a
      cancellation ledger whose CHECK admits only resulting_status
      'cancelled'); no `superseded` vocabulary is invented for it.

   B. Post-completion retraction is a hard unilateral refusal.
      Before completion, a collector may retract their own receipt
      confirmation as a correction. Once trade_deals.status = 'completed',
      TRANSFER_RETRACTED refuses — recipient and founder alike, through this
      unilateral seam — and the refusal sits BEFORE the replay lookup so a
      stale idempotency key cannot turn a refused request into apparent
      success. The dispute/correction path is a future product, not built
      here.

   C. The private-listing commitment closure law.
      If an owner's private_active watch commits through another Trade before
      its named private buyer commits it, the private opportunity closes with
      that commitment and the named buyer is told. The governed
      private_buyer_id is captured from the LOCKED pre-commit row before the
      closure clears it, and the notification goes through the existing
      governed seam — the notifications table, exactly as
      notify_on_private_listing_activation() already does — inside the same
      transaction. No second notification system.

   D. Structural append-only history.
      Governed producers are SECURITY DEFINER functions owned by the table
      owner; they need no grant. So INSERT, UPDATE, DELETE and TRUNCATE are
      revoked from anon, authenticated AND service_role, and two triggers
      refuse UPDATE/DELETE (row) and TRUNCATE (statement) for whoever still
      could — including the owner running SQL by hand. The FK to
      trade_offers becomes RESTRICT: a cascade is a DELETE path, and history
      must outlive the row it describes.

   ── EVERY WRITER, ENUMERATED (the audit §5.1 demands) ──────────────────

   trade_offers.status writers after this file:
     propose_trade_offer()        insert pending          + proposed   (v8.17)
     resolve_trade_offer()        pending→declined/withdrawn + event   (NEW)
     accept_trade_offer()         pending→accepted        + accepted
                                  pending→superseded (bulk) + one event EACH
     accept_purchase_request()    pending→superseded (bulk) + one event EACH
   trade_offer_events producers that do NOT move trade_offers.status:
     trade_deals_completed_event  trigger, on trade_deals reaching 'completed'
                                  — authors `completed` atomically with the
                                  completion mutation, whichever path caused it
     cancel_trade_deal()          `cancelled`, atomic in its own transaction
   Removed producers:
     app/api/trade-offers/[id]    no longer updates status or inserts events
     confirm_trade_leg_receipt()  no longer authors `completed` (the trigger does)

   ── HISTORICAL RECONCILIATION — ONE ROW, FULLY EVIDENCED ───────────────
   The one real production offer predates v8.17 and carries `accepted` and
   `completed` events but no `proposed`. Every fact the founder rule
   requires is a column on that offer row: identity (id), actor
   (proposer_id), prior (null), resulting ('pending'), time (created_at).
   Nothing is inferred. It is inserted below, idempotently, with metadata
   naming it as reconciled from row columns so it can never be mistaken for
   a live-authored event. No other gap exists and nothing else is inserted.

   Slice 1 (v8.17) is preserved in full: propose_trade_offer() untouched,
   private target admission, owner-as-consideration, deterministic locks,
   proposal+event atomicity, authorization-before-replay, the replay tuple,
   idempotency_key_conflict. Acceptance additionally refuses a non-designated
   private target by the same name, so a pre-v8.17 pending offer could not
   bypass admission at the second door.

   Canary path untouched.
   ════════════════════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════════════════
   D · APPEND-ONLY STRUCTURE — first, so nothing below can be undone
   ══════════════════════════════════════════════════════════════════════ */

create or replace function public.trade_offer_events_append_only()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  raise exception 'trade_offer_events_append_only: % refused — Trade offer lifecycle history is authoritative and may not be edited or erased', tg_op
    using errcode = 'insufficient_privilege';
end $function$;

drop trigger if exists trade_offer_events_no_update_delete on public.trade_offer_events;
create trigger trade_offer_events_no_update_delete
  before update or delete on public.trade_offer_events
  for each row execute function public.trade_offer_events_append_only();

drop trigger if exists trade_offer_events_no_truncate on public.trade_offer_events;
create trigger trade_offer_events_no_truncate
  before truncate on public.trade_offer_events
  for each statement execute function public.trade_offer_events_append_only();

/* A cascade is a DELETE. With the row trigger above it could never succeed;
   RESTRICT makes the schema say what is true — history outlives its row. */
alter table public.trade_offer_events
  drop constraint if exists trade_offer_events_trade_offer_id_fkey;
alter table public.trade_offer_events
  add constraint trade_offer_events_trade_offer_id_fkey
  foreign key (trade_offer_id) references public.trade_offers(id) on delete restrict;

/* Privilege is not permission. Producers are SECURITY DEFINER functions
   owned by the table owner and need none of these. SELECT stays: parties
   read their own history through RLS, and privileged readers keep reading. */
revoke insert, update, delete, truncate, references, trigger
  on public.trade_offer_events from anon, authenticated, service_role;

comment on table public.trade_offer_events is
  'Authoritative, append-only history of Trade offer lifecycle transitions (founder ruling 2026-09-02). '
  'INSERT only through governed SECURITY DEFINER producers; UPDATE/DELETE/TRUNCATE refused by trigger for every role. '
  'The only path around the triggers is the table OWNER disabling them by hand outside the application - not reachable from service_role.';


/* ══════════════════════════════════════════════════════════════════════
   HISTORICAL RECONCILIATION — evidence only, idempotent
   ══════════════════════════════════════════════════════════════════════ */

insert into public.trade_offer_events
  (trade_offer_id, event_type, actor_user_id, prior_status, resulting_status, occurred_at, metadata)
select o.id, 'proposed', o.proposer_id, null, 'pending', o.created_at,
       jsonb_build_object(
         'target_listing_id',  o.target_listing_id,
         'offered_listing_id', o.offered_listing_id,
         'cash_direction',     o.cash_direction,
         'cash_amount',        o.cash_amount,
         'cash_currency',      o.cash_currency,
         'reconciled',         true,
         'reconciled_from',    'trade_offers row columns: id, proposer_id, created_at',
         'reconciled_by',      'migration 20260902160000'
       )
from public.trade_offers o
where o.created_at < timestamptz '2026-09-02 00:00:00+00'
  and not exists (
    select 1 from public.trade_offer_events e
     where e.trade_offer_id = o.id and e.event_type = 'proposed'
  );


/* ══════════════════════════════════════════════════════════════════════
   A/C · ACCEPTANCE — supersession events, private closure, admission
   ══════════════════════════════════════════════════════════════════════ */

create or replace function public.accept_trade_offer(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller  uuid := auth.uid();
  v_offer   public.trade_offers%rowtype;
  v_first   uuid;
  v_second  uuid;
  v_target  public.listings%rowtype;
  v_offered public.listings%rowtype;
  v_deal_id uuid;
  v_target_private_buyer  uuid;
  v_offered_private_buyer uuid;
  v_closed  jsonb := '[]'::jsonb;
  v_superseded_offers uuid[];
  v_superseded_requests int := 0;
  r record;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_offer from public.trade_offers where id = p_offer_id;
  if not found then
    raise exception 'not_found';
  end if;

  if v_offer.recipient_id <> v_caller then
    raise exception 'not_allowed';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'already_resolved:%', v_offer.status;
  end if;

  /* DEADLOCK PREVENTION — deterministic sorted listing-row lock order. Two
     crossing acceptances take the same two locks in the same sequence and
     queue rather than deadlock. accept_purchase_request() locks its ONE
     listing before touching any sibling row, so it can never hold a sibling
     lock while waiting on a listing this function holds — no cycle between
     the two mechanisms is possible. */
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

  if v_target.status not in ('published', 'private_active') then
    raise exception 'target_not_available:%', v_target.status;
  end if;
  if v_offered.status not in ('published', 'private_active') then
    raise exception 'offered_not_available:%', v_offered.status;
  end if;

  if v_target.seller_id <> v_offer.recipient_id then
    raise exception 'target_not_controlled_by_recipient';
  end if;
  if v_offered.seller_id <> v_offer.proposer_id then
    raise exception 'offered_not_controlled_by_proposer';
  end if;

  if v_target.open_to_trades is not true then
    raise exception 'target_not_open_to_trades';
  end if;

  /* Slice 1 admission, honoured at the second door as well. A private target
     admits only its designated buyer; the proposer is who would acquire it. */
  if v_target.status = 'private_active'
     and v_target.private_buyer_id is distinct from v_offer.proposer_id then
    raise exception 'target_private_not_designated';
  end if;

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

  /* CAPTURE THE PRE-COMMIT PRIVATE DESIGNATIONS from the locked rows, before
     any closure semantics clear them. These are the people to notify. */
  v_target_private_buyer  := case when v_target.status  = 'private_active' then v_target.private_buyer_id  end;
  v_offered_private_buyer := case when v_offered.status = 'private_active' then v_offered.private_buyer_id end;

  update public.trade_offers
     set status = 'accepted', updated_at = now()
   where id = p_offer_id;

  /* BULK SUPERSESSION IS NOT ONE ANONYMOUS EVENT. Every competing offer that
     loses gets its own row, with truthful prior/resulting status, in this
     transaction. RETURNING makes the set exact - nothing is re-queried. */
  with losers as (
    update public.trade_offers
       set status = 'superseded', updated_at = now()
     where id <> p_offer_id
       and status = 'pending'
       and (target_listing_id  in (v_target.id, v_offered.id)
         or offered_listing_id in (v_target.id, v_offered.id))
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_superseded_offers from losers;

  if array_length(v_superseded_offers, 1) > 0 then
    insert into public.trade_offer_events
      (trade_offer_id, event_type, actor_user_id, prior_status, resulting_status, metadata)
    select unnest(v_superseded_offers), 'superseded', v_caller, 'pending', 'superseded',
           jsonb_build_object(
             'cause', 'trade_offer_accepted',
             'winning_trade_offer_id', p_offer_id,
             'target_listing_id',  v_target.id,
             'offered_listing_id', v_offered.id
           );
  end if;

  /* The sibling mechanism. Purchase Requests carry a cancellation-only event
     ledger with no `superseded` vocabulary, so the status write is the
     whole of their governed truth for this transition. */
  with losing_requests as (
    update public.purchase_requests
       set status = 'superseded', updated_at = now()
     where listing_id in (v_target.id, v_offered.id)
       and status = 'pending'
    returning id
  )
  select count(*) into v_superseded_requests from losing_requests;

  insert into public.trade_deals
    (trade_offer_id, party_a_id, party_b_id, status,
     cash_direction, cash_amount, cash_currency)
  values
    (v_offer.id, v_offer.proposer_id, v_offer.recipient_id, 'pending',
     v_offer.cash_direction, v_offer.cash_amount, v_offer.cash_currency)
  returning id into v_deal_id;

  insert into public.trade_deal_legs
    (trade_deal_id, listing_id, from_user_id, to_user_id,
     listing_brand, listing_model, listing_reference, listing_public_code)
  values
    (v_deal_id, v_target.id, v_offer.recipient_id, v_offer.proposer_id,
     v_target.brand, v_target.model, v_target.reference, v_target.public_code);

  insert into public.trade_deal_legs
    (trade_deal_id, listing_id, from_user_id, to_user_id,
     listing_brand, listing_model, listing_reference, listing_public_code)
  values
    (v_deal_id, v_offered.id, v_offer.proposer_id, v_offer.recipient_id,
     v_offered.brand, v_offered.model, v_offered.reference, v_offered.public_code);

  /* PRIVATE COMMITMENT CLOSURE. For each committed watch, the person who
     ACQUIRES it in this trade is: target → proposer, offered → recipient.
     If the watch was privately offered to someone ELSE, that opportunity
     closes with this commitment: the designation is cleared in the same
     statement that reserves the row, and the named buyer is told through
     the governed seam. If the acquirer IS the named buyer, the opportunity
     is being fulfilled, not closed - nothing to close, nobody to warn. */
  for r in
    select * from (values
      (v_target.id,  v_target_private_buyer,  v_offer.proposer_id,  v_target.brand,  v_target.model),
      (v_offered.id, v_offered_private_buyer, v_offer.recipient_id, v_offered.brand, v_offered.model)
    ) as t(listing_id, private_buyer, acquirer, brand, model)
  loop
    if r.private_buyer is not null and r.private_buyer is distinct from r.acquirer then
      update public.listings
         set status = 'reserved', private_buyer_id = null, updated_at = now()
       where id = r.listing_id;

      insert into public.notifications (user_id, type, message, listing_id, dedupe_key)
      values (
        r.private_buyer,
        'private_listing_closed',
        'The private listing offered to you has closed: the '
          || r.brand || coalesce(' ' || r.model, '')
          || ' committed to another trade before you accepted it.',
        r.listing_id,
        'private_listing_closed:' || p_offer_id::text || ':' || r.listing_id::text
      );

      v_closed := v_closed || jsonb_build_object(
        'listing_id', r.listing_id, 'notified_private_buyer_id', r.private_buyer
      );
    else
      update public.listings
         set status = 'reserved', updated_at = now()
       where id = r.listing_id;
    end if;
  end loop;

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
       'cash_currency', v_offer.cash_currency,
       'superseded_trade_offers', to_jsonb(v_superseded_offers),
       'superseded_purchase_requests', v_superseded_requests,
       'private_opportunities_closed', v_closed
     ));

  return jsonb_build_object(
    'trade_offer_id', p_offer_id,
    'status', 'accepted',
    'trade_deal_id', v_deal_id,
    'target_listing_id', v_target.id,
    'offered_listing_id', v_offered.id,
    'both_listings_status', 'reserved',
    'superseded_trade_offers', coalesce(array_length(v_superseded_offers, 1), 0),
    'superseded_purchase_requests', v_superseded_requests,
    'private_opportunities_closed', jsonb_array_length(v_closed)
  );
end;
$function$;


/* ══════════════════════════════════════════════════════════════════════
   A · DECLINE / WITHDRAW become one governed mutation
   ══════════════════════════════════════════════════════════════════════ */

create or replace function public.resolve_trade_offer(p_offer_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller uuid := auth.uid();
  v_offer  public.trade_offers%rowtype;
  v_next   text;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;
  if p_action not in ('decline', 'withdraw') then
    raise exception 'unknown_action';
  end if;

  select * into v_offer from public.trade_offers where id = p_offer_id for update;
  if not found then
    raise exception 'not_found';
  end if;

  /* Decline belongs to the recipient; withdraw belongs to the proposer.
     Neither party can perform the other's act. */
  if p_action = 'decline' and v_offer.recipient_id <> v_caller then
    raise exception 'not_allowed';
  end if;
  if p_action = 'withdraw' and v_offer.proposer_id <> v_caller then
    raise exception 'not_allowed';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'already_resolved:%', v_offer.status;
  end if;

  v_next := case p_action when 'decline' then 'declined' else 'withdrawn' end;

  update public.trade_offers
     set status = v_next, updated_at = now()
   where id = p_offer_id;

  insert into public.trade_offer_events
    (trade_offer_id, event_type, actor_user_id, prior_status, resulting_status, metadata)
  values
    (p_offer_id, v_next, v_caller, 'pending', v_next, '{}'::jsonb);

  return jsonb_build_object(
    'trade_offer_id', p_offer_id,
    'status', v_next,
    'proposer_id', v_offer.proposer_id,
    'recipient_id', v_offer.recipient_id
  );
end;
$function$;

revoke execute on function public.resolve_trade_offer(uuid, text) from public, anon;
grant  execute on function public.resolve_trade_offer(uuid, text) to authenticated;

comment on function public.resolve_trade_offer(uuid, text) is
  'Governed decline (recipient) / withdraw (proposer) of a pending Trade offer: status change and its trade_offer_events row are one transaction.';


/* ══════════════════════════════════════════════════════════════════════
   A · PURCHASE REQUEST ACCEPTANCE — the one narrow additive write
   ══════════════════════════════════════════════════════════════════════ */

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

  insert into public.transactions
    (purchase_request_id, listing_id, buyer_id, seller_id, final_purchase_price, rail, status)
  values
    (v_request.id, v_request.listing_id, v_request.buyer_id, v_request.seller_id,
     v_request.proposed_purchase_price, null, 'pending')
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


/* ══════════════════════════════════════════════════════════════════════
   C(§5) · COMPLETION authors its own event, whichever path completes it
   ══════════════════════════════════════════════════════════════════════ */

create or replace function public.trade_deal_completed_authors_event()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid;
begin
  /* The transfer producer names the actor for this transaction through a
     local setting (the same mechanism as fwt.transfer_seam). Absent, the
     event is still authored - history is not optional - with a null actor. */
  begin
    v_actor := nullif(current_setting('fwt.transfer_actor', true), '')::uuid;
  exception when others then
    v_actor := null;
  end;

  /* Idempotent by construction: a completion that is somehow reached twice
     for one offer never duplicates history. */
  if not exists (
    select 1 from public.trade_offer_events
     where trade_offer_id = NEW.trade_offer_id and event_type = 'completed'
  ) then
    insert into public.trade_offer_events
      (trade_offer_id, event_type, actor_user_id, prior_status, resulting_status, metadata)
    values
      (NEW.trade_offer_id, 'completed', v_actor, 'accepted', 'completed',
       jsonb_build_object('trade_deal_id', NEW.id, 'authored_by', 'trade_deals_completed_event'));
  end if;
  return NEW;
end $function$;

drop trigger if exists trade_deals_completed_event on public.trade_deals;
create trigger trade_deals_completed_event
  after update of status on public.trade_deals
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.trade_deal_completed_authors_event();

/* The wrapper no longer authors `completed` - the trigger owns it, so the
   founder-asserted path is covered identically. Everything else unchanged. */
create or replace function public.confirm_trade_leg_receipt(p_leg_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_caller uuid := auth.uid();
  v_deal_id uuid;
  v_result jsonb;
  v_deal_status text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT trade_deal_id INTO v_deal_id FROM public.trade_deal_legs WHERE id = p_leg_id;
  IF v_deal_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  IF (SELECT status FROM public.trade_deals WHERE id = v_deal_id) = 'cancelled' THEN
    RAISE EXCEPTION 'deal_cancelled';
  END IF;

  v_result := public.record_physical_watch_transfer_event(
    p_leg_id,
    'TRANSFERRED'::public.physical_watch_transfer_event_type,
    v_caller,
    'party_confirmed_recipient'::public.physical_watch_transfer_provenance,
    now(),
    NULL,
    'trade_leg_receipt:' || p_leg_id::text
  );

  SELECT status INTO v_deal_status FROM public.trade_deals WHERE id = v_deal_id;

  RETURN v_result || jsonb_build_object('deal_status', v_deal_status);
END $function$;


/* ══════════════════════════════════════════════════════════════════════
   B · POST-COMPLETION RETRACTION REFUSAL, before replay
   ══════════════════════════════════════════════════════════════════════ */

create or replace function public.record_physical_watch_transfer_event(
  p_trade_deal_leg_id  uuid,
  p_event_type         public.physical_watch_transfer_event_type,
  p_actor_user_id      uuid,
  p_provenance_class   public.physical_watch_transfer_provenance,
  p_occurred_at        timestamp with time zone,
  p_supersedes_event_id uuid,
  p_idempotency_key    text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c_founder constant uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
  v_leg public.trade_deal_legs; v_deal public.trade_deals; v_bead uuid; v_gen bigint;
  v_prior public.physical_watch_transfer_events;
  v_existing public.physical_watch_transfer_events;
  v_id uuid := gen_random_uuid();
begin
  if p_actor_user_id is null then raise exception 'actor_required'; end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency_key_required'; end if;

  /* 2-4 . LOCKS AND STRUCTURE, before any decision */
  select d.* into v_deal from public.trade_deals d
   where d.id = (select trade_deal_id from public.trade_deal_legs where id = p_trade_deal_leg_id)
   for update;
  if not found then raise exception 'deal_not_found'; end if;

  select l.* into v_leg from public.trade_deal_legs l where l.id = p_trade_deal_leg_id for update;
  if not found then raise exception 'leg_not_found'; end if;
  if v_leg.trade_deal_id <> v_deal.id then raise exception 'leg_does_not_belong_to_deal'; end if;

  select physical_watch_id into v_bead from public.listings
   where id = v_leg.listing_id for update;
  if v_bead is null then raise exception 'listing_carries_no_physical_watch_bead'; end if;

  select coalesce(max(decision_generation), 0) into v_gen
    from public.physical_watch_resolution_decisions;

  /* 5 . AUTHORIZATION, for the requested event type */
  if p_event_type = 'TRANSFERRED' then
    if p_provenance_class = 'party_confirmed_recipient' then
      if p_actor_user_id <> v_leg.to_user_id then
        raise exception 'only_the_recipient_may_confirm_receipt'; end if;
    elsif p_provenance_class = 'founder_asserted' then
      if p_actor_user_id <> c_founder then
        raise exception 'founder_authorization_required'; end if;
    else
      raise exception 'unsupported_provenance_class';
    end if;

  elsif p_event_type = 'TRANSFER_RETRACTED' then
    if p_actor_user_id <> c_founder and p_actor_user_id <> v_leg.to_user_id then
      raise exception 'not_authorized_to_retract'; end if;
    if p_supersedes_event_id is null then raise exception 'retraction_must_supersede'; end if;

    /* 5b . THE COMPLETION BOUNDARY - part of whether this action is currently
       permitted, so it sits with authorization and BEFORE replay. Once both
       confirmations have closed the trade they are the completed transaction
       record; recipient and founder alike may not unilaterally undo one here,
       and a stale key must not turn a refused request into apparent success.
       Post-completion problems belong to a dispute/correction path that does
       not exist yet and is not invented here. */
    if v_deal.status = 'completed' then
      raise exception 'deal_completed_retraction_refused'; end if;

  else
    raise exception 'unsupported_event_type';
  end if;

  /* 6 . REPLAY, and only now - scoped to the tuple (leg, actor, event_type, key) */
  select * into v_existing from public.physical_watch_transfer_events
   where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.trade_deal_leg_id  = v_leg.id
       and v_existing.asserted_by_user_id = p_actor_user_id
       and v_existing.event_type     = p_event_type then
      return jsonb_build_object('event_id', v_existing.id, 'event_type', v_existing.event_type,
        'idempotent_replay', true);
    end if;
    raise exception 'idempotency_key_conflict';
  end if;

  /* 7 . STATE VALIDATION, then the insert */
  if p_event_type = 'TRANSFERRED' then
    if exists (select 1 from public.physical_watch_live_transfers t
               where t.trade_deal_leg_id = v_leg.id) then
      raise exception 'leg_already_has_live_transfer'; end if;
    if p_supersedes_event_id is not null then
      raise exception 'a_transfer_does_not_supersede'; end if;

    insert into public.physical_watch_transfer_events (
      id, trade_deal_leg_id, trade_deal_id, physical_watch_id,
      from_user_id, to_user_id, occurred_at, asserted_by_user_id,
      provenance_class, event_type, decision_generation, idempotency_key)
    values (v_id, v_leg.id, v_deal.id, v_bead, v_leg.from_user_id, v_leg.to_user_id,
      p_occurred_at, p_actor_user_id, p_provenance_class, 'TRANSFERRED', v_gen, p_idempotency_key);

  else
    select * into v_prior from public.physical_watch_transfer_events
     where id = p_supersedes_event_id for update;
    if not found then raise exception 'superseded_event_not_found'; end if;
    if v_prior.event_type <> 'TRANSFERRED' then
      raise exception 'only_a_transfer_may_be_retracted'; end if;
    if not exists (select 1 from public.physical_watch_live_transfers t where t.id = v_prior.id) then
      raise exception 'target_transfer_is_not_live'; end if;
    if v_prior.trade_deal_leg_id is distinct from v_leg.id
       or v_prior.trade_deal_id is distinct from v_deal.id
       or v_prior.physical_watch_id is distinct from v_bead
       or v_prior.from_user_id <> v_leg.from_user_id
       or v_prior.to_user_id <> v_leg.to_user_id then
      raise exception 'retraction_target_inconsistent'; end if;

    insert into public.physical_watch_transfer_events (
      id, trade_deal_leg_id, trade_deal_id, physical_watch_id,
      from_user_id, to_user_id, occurred_at, asserted_by_user_id,
      provenance_class, event_type, decision_generation, supersedes_event_id, idempotency_key)
    values (v_id, v_leg.id, v_deal.id, v_bead, v_leg.from_user_id, v_leg.to_user_id,
      p_occurred_at, p_actor_user_id, p_provenance_class, 'TRANSFER_RETRACTED', v_gen,
      p_supersedes_event_id, p_idempotency_key);
  end if;

  /* Name the actor for the completion trigger, then recompute. The trigger
     authors `completed` if this recompute is what completes the deal. */
  perform set_config('fwt.transfer_actor', p_actor_user_id::text, true);
  perform public.recompute_trade_transfer_status(v_deal.id);

  return jsonb_build_object('event_id', v_id, 'event_type', p_event_type,
    'physical_watch_id', v_bead, 'decision_generation', v_gen,
    'leg_status', (select leg_status from public.trade_deal_legs where id = v_leg.id),
    'deal_status', (select status from public.trade_deals where id = v_deal.id),
    'idempotent_replay', false);
end $function$;

revoke execute on function public.record_physical_watch_transfer_event(
  uuid, public.physical_watch_transfer_event_type, uuid,
  public.physical_watch_transfer_provenance, timestamp with time zone, uuid, text
) from public, anon, authenticated;
grant execute on function public.record_physical_watch_transfer_event(
  uuid, public.physical_watch_transfer_event_type, uuid,
  public.physical_watch_transfer_provenance, timestamp with time zone, uuid, text
) to service_role;
