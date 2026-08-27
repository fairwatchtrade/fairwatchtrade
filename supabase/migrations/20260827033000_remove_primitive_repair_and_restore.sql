/* ════════════════════════════════════════════════════════════════════════
   REMOVE PRIMITIVE REPAIR — the governed inverse, and provenance at the
   mutation boundary                                                (v6.89)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "Remove is reversible because the row is still there."

   It was not. remove_listing() drove a listing to 'removed' and NOTHING in
   the product could bring it back: the function raises already_removed on a
   second call, the status route's four review actions do not accept a
   removed listing, and no other governed path writes that column. The row
   survived; the listing did not. Settled FWT law says:

     Remove = reversible, off-market.
     Delete = irreversible purge when safe.

   so a one-way Remove was a product-primitive defect, not a naming problem.
   This migration closes it before any assistant is allowed near the verb.

   ── WHY RESTORE TARGETS pending_review, AND NEVER THE PRIOR STATUS ──────

   Restore returns a listing to the market PIPELINE, never to the market.

   'pending_review' is the one state lib/listingPublicationGate accepts as a
   lawful prior status, so a restored listing reaches Browse only by the same
   door every other listing uses: an explicit recorded founder approval.
   Restoring to the PRIOR status would have put a formerly-published listing
   straight back to 'published' with no adjudication — a second publication
   writer, which is exactly the defect v6.34 was written to remove. One
   canonical restore state is therefore not a simplification; it is the
   property that keeps publication a decision.

   The removal columns on the listing are the CURRENT-ACTIONABLE mirror and
   are cleared on restore, exactly as rejection_reason is cleared on every
   non-rejection transition. The removal itself is not erased: it is an
   immutable REMOVED row in listing_lifecycle_events, and the restore adds a
   RESTORED row beside it. History accumulates; only the mirror resets.

   ── BUYER REQUESTS ARE NOT RESURRECTED ──────────────────────────────────

   Removing a listing cancels its pending purchase requests and tells those
   buyers. That cancellation is historical truth about something a buyer
   experienced. Restore does NOT reopen it: re-creating a purchase request
   would be the platform inventing buyer intent that no buyer expressed. A
   buyer who still wants the watch asks again, and that asking is real.

   ── PROVENANCE LIVES INSIDE THE MUTATION, NOT BESIDE IT ─────────────────

   authorized_by / executed_via / machinery are written by the governed RPC
   itself, so no caller can mutate a listing and skip its own provenance.

   executed_via is NEVER a request field. It is a hardcoded argument at each
   of exactly two entry points, and the non-forgeability comes from the GRANT
   boundary rather than from validation:

     remove_listing()            — EXECUTE to authenticated; always 'direct'
     remove_listing_assistant()  — EXECUTE to service_role ONLY; 'assistant'

   A browser holding the founder's session authenticates as `authenticated`
   and therefore cannot invoke the assistant entry point at all, whatever it
   puts in its body. Both wrappers call one shared core, so the two paths can
   never drift into two different removals.

   PFC274 = 62 — Canary path untouched.
   ════════════════════════════════════════════════════════════════════════ */

-- ═════ 1 · LIFECYCLE ATTRIBUTION ═════════════════════════════════════════

alter table public.listing_lifecycle_events
  add column authorized_by uuid,
  add column executed_via  text,
  add column machinery     text;

alter table public.listing_lifecycle_events
  add constraint lle_authorized_by_fk
    foreign key (authorized_by) references auth.users(id) on delete restrict;

alter table public.listing_lifecycle_events
  add constraint lle_executed_via_check
    check (executed_via is null or executed_via in ('direct', 'assistant'));

alter table public.listing_lifecycle_events
  add constraint lle_assistant_requires_authorizer_check
    check (executed_via <> 'assistant' or authorized_by is not null);

/* NULL is the honest value here, and it is not the same claim v6.84 made on
   listing_decision_events. That table has ONE writer, so 'direct' was a fact
   history could answer. This table is produced by a trigger standing under
   every writer of listings.status — the create path, accept_purchase_request,
   triage — and most of them declare no provenance. NULL means "this
   transition arrived through a path that does not declare execution
   provenance", which is true, where a DEFAULT 'direct' would have asserted a
   human hand behind writes nobody attributed. No backfill. */
comment on column public.listing_lifecycle_events.authorized_by is
  'Who authorized the mutation. NULL on transitions whose writer declares no provenance, and on all history - never backfilled.';
comment on column public.listing_lifecycle_events.executed_via is
  'direct or assistant, supplied by the governed RPC as a hardcoded argument. NULL when the writing path declares nothing. Never read from a request.';
comment on column public.listing_lifecycle_events.machinery is
  'The governed function responsible for the mutation, named by that function itself.';

-- ═════ 2 · RESTORED JOINS THE VOCABULARY ═════════════════════════════════

alter table public.listing_lifecycle_events drop constraint lle_event_type_check;
alter table public.listing_lifecycle_events
  add constraint lle_event_type_check
    check (event_type in ('BECAME_PUBLIC', 'BECAME_PRIVATE', 'REMOVED', 'RESTORED'));

/* RESTORED may land only in an OFF-MARKET state. This is the restore rule
   expressed as a constraint rather than as a convention: a restore that
   claimed to reach 'published' is not a typo to be corrected later, it is a
   publication with no adjudication behind it, and it can never be written. */
alter table public.listing_lifecycle_events drop constraint lle_type_matches_state_check;
alter table public.listing_lifecycle_events
  add constraint lle_type_matches_state_check
    check (
      (event_type = 'BECAME_PUBLIC'  and resulting_status = 'published')
      or (event_type = 'BECAME_PRIVATE' and resulting_status = 'private_active')
      or (event_type = 'REMOVED'        and resulting_status = 'removed')
      or (event_type = 'RESTORED'       and resulting_status in ('draft', 'pending_review'))
    );

-- ═════ 3 · THE PRODUCER LEARNS PROVENANCE ════════════════════════════════

/* Unchanged in what it records and when. It now also reads the three
   transaction-local settings the governed RPCs declare. A writer that sets
   nothing produces NULLs, which is the pre-existing behaviour made explicit
   rather than a new claim. */
create or replace function public.record_listing_lifecycle_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_prior  text;
  v_type   text;
  v_source text;
begin
  if TG_OP = 'UPDATE' then
    if OLD.status is not distinct from NEW.status then
      return null;
    end if;
    v_prior := OLD.status;
  else
    v_prior := null;
  end if;

  v_type := case NEW.status
    when 'published'      then 'BECAME_PUBLIC'
    when 'private_active' then 'BECAME_PRIVATE'
    when 'removed'        then 'REMOVED'
  end;
  if v_type is null then
    return null;
  end if;

  v_source := case
    when v_uid is null              then 'service_role'
    when v_uid = NEW.seller_id      then 'seller_session'
    else                                 'other_session'
  end;

  insert into public.listing_lifecycle_events (
    listing_id, event_type, prior_status, resulting_status,
    removal_reason_code, actor_uid, actor_source,
    authorized_by, executed_via, machinery
  ) values (
    NEW.id, v_type, v_prior, NEW.status,
    case when v_type = 'REMOVED' then NEW.removal_reason_code else null end,
    v_uid, v_source,
    nullif(current_setting('fwt.authorized_by', true), '')::uuid,
    nullif(current_setting('fwt.executed_via',  true), ''),
    nullif(current_setting('fwt.machinery',     true), '')
  );

  return null;
end
$fn$;

-- ═════ 4 · THE RESTORE EVENT ═════════════════════════════════════════════

/* A SECOND trigger rather than a widened first one. The existing producer
   serves INSERT as well as UPDATE, and PostgreSQL forbids OLD in an INSERT
   WHEN clause — which is precisely why its own re-save filter lives in the
   function body. Restore is identified by where it CAME FROM, so its trigger
   needs OLD in the WHEN clause, and can only get it by being UPDATE-only. */
create or replace function public.record_listing_restored_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_source text;
begin
  v_source := case
    when v_uid is null         then 'service_role'
    when v_uid = NEW.seller_id then 'seller_session'
    else                            'other_session'
  end;

  insert into public.listing_lifecycle_events (
    listing_id, event_type, prior_status, resulting_status,
    removal_reason_code, actor_uid, actor_source,
    authorized_by, executed_via, machinery
  ) values (
    NEW.id, 'RESTORED', OLD.status, NEW.status,
    null, v_uid, v_source,
    nullif(current_setting('fwt.authorized_by', true), '')::uuid,
    nullif(current_setting('fwt.executed_via',  true), ''),
    nullif(current_setting('fwt.machinery',     true), '')
  );

  return null;
end
$fn$;

revoke all on function public.record_listing_restored_event()
  from public, anon, authenticated, service_role;

comment on function public.record_listing_restored_event() is
  'Produces the RESTORED lifecycle event when a listing leaves the removed state. Separate from record_listing_lifecycle_event because identifying a restore requires OLD, which an INSERT-serving trigger cannot reference.';

drop trigger if exists listings_restored_event on public.listings;
create trigger listings_restored_event
  after update of status on public.listings
  for each row
  when (OLD.status = 'removed' and NEW.status <> 'removed')
  execute function public.record_listing_restored_event();

-- ═════ 5 · REMOVE — ONE CORE, TWO HARDCODED ENTRY POINTS ═════════════════

/* The body is the shipped remove_listing() verbatim, with two changes and no
   others: the actor arrives as an argument instead of from auth.uid(), and
   the provenance the governed boundary declares is published to the
   transaction before the UPDATE so the lifecycle producer can record it.
   Cancellation of pending purchase requests, the closure cause, the event
   log and the return shape are untouched — this is a move, not a rewrite. */
create or replace function public.remove_listing_core(
  p_listing_id   uuid,
  p_reason_code  text,
  p_reason_note  text,
  p_actor        uuid,
  p_executed_via text,
  p_machinery    text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_founder   constant uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
  v_listing   public.listings%ROWTYPE;
  v_cause     text;
  v_now       timestamptz;
  v_closed    jsonb := '[]'::jsonb;
  v_cancelled int := 0;
  v_accepted  int := 0;
begin
  if p_actor is null then raise exception 'not_authenticated'; end if;
  if p_executed_via not in ('direct', 'assistant') then
    raise exception 'invalid_executed_via';
  end if;

  select * into v_listing from public.listings
   where id = p_listing_id for update;
  if not found then raise exception 'not_found'; end if;

  if v_listing.seller_id <> p_actor and p_actor <> v_founder then
    raise exception 'not_allowed';
  end if;

  v_cause := case when v_listing.seller_id = p_actor
                  then 'listing_removed_by_seller'
                  else 'listing_removed_by_admin' end;

  if v_listing.status = 'removed' then
    raise exception 'already_removed';
  end if;

  if v_listing.status not in ('published', 'reserved', 'pending_review') then
    raise exception 'not_removable:%', v_listing.status;
  end if;

  if p_reason_code is not null
     and p_reason_code not in
         ('sold_in_store','sold_elsewhere','no_longer_for_sale','listing_mistake','other') then
    raise exception 'invalid_reason_code';
  end if;

  /* Transaction-local, and consumed by the lifecycle producer below. Local
     scope matters: it dies with this transaction and can never leak into an
     unrelated statement on a pooled connection. */
  perform set_config('fwt.authorized_by', p_actor::text, true);
  perform set_config('fwt.executed_via',  p_executed_via, true);
  perform set_config('fwt.machinery',     p_machinery, true);

  v_now := now();

  update public.listings set
    status              = 'removed',
    removed_at          = v_now,
    removal_reason_code = p_reason_code,
    removal_reason_note = left(nullif(btrim(coalesce(p_reason_note, '')), ''), 320)
  where id = p_listing_id;

  with closed as (
    update public.purchase_requests
       set status        = 'cancelled',
           closure_cause = v_cause,
           updated_at    = v_now
     where listing_id = p_listing_id
       and status = 'pending'
    returning id, buyer_id
  ), logged as (
    insert into public.purchase_request_events
      (purchase_request_id, event_type, actor_user_id,
       prior_status, resulting_status, metadata)
    select c.id, v_cause, p_actor,
           'pending', 'cancelled',
           jsonb_build_object(
             'listing_id',          p_listing_id,
             'removal_reason_code', p_reason_code)
      from closed c
    returning id as event_id, purchase_request_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'purchase_request_id', l.purchase_request_id,
           'buyer_id',            c.buyer_id,
           'event_id',            l.event_id)), '[]'::jsonb),
         count(*)
    into v_closed, v_cancelled
    from logged l
    join closed c on c.id = l.purchase_request_id;

  select count(*) into v_accepted
    from public.purchase_requests
   where listing_id = p_listing_id and status = 'accepted';

  return jsonb_build_object(
    'listing_id',                  p_listing_id,
    'status',                      'removed',
    'removed_at',                  v_now,
    'reason_code',                 p_reason_code,
    'closure_cause',               v_cause,
    'requests_cancelled',          v_cancelled,
    'closed_requests',             v_closed,
    'accepted_requests_remaining', v_accepted,
    'executed_via',                p_executed_via,
    'machinery',                   p_machinery,
    'reversible',                  true,
    'restore_target_status',       'pending_review'
  );
end
$fn$;

/* Reachable only through the two wrappers below, which run as this
   function's owner. Nothing else in the database may name it. */
revoke all on function public.remove_listing_core(uuid, text, text, uuid, text, text)
  from public, anon, authenticated, service_role;

comment on function public.remove_listing_core(uuid, text, text, uuid, text, text) is
  'The one Remove implementation. Never called directly: remove_listing() supplies direct, remove_listing_assistant() supplies assistant, each hardcoded at its own call site.';

/* SAME SIGNATURE AS BEFORE. Every existing caller — the seller remove route,
   the Marketplace Control bulk route — keeps working with no change, and
   keeps recording 'direct', because that is the only value this entry point
   can produce. */
create or replace function public.remove_listing(
  p_listing_id  uuid,
  p_reason_code text default null,
  p_reason_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then raise exception 'not_authenticated'; end if;
  return public.remove_listing_core(
    p_listing_id, p_reason_code, p_reason_note,
    v_caller, 'direct', 'remove_listing'
  );
end
$fn$;

comment on function public.remove_listing(uuid, text, text) is
  'Direct product Remove. Executes as the authenticated caller and always records executed_via=direct - the literal is in this body and is never read from a request.';

/* THE ASSISTANT ENTRY POINT, AND THE GRANT IS THE SECURITY PROPERTY.
   EXECUTE is held by service_role alone, so a browser carrying the founder's
   own session cannot reach this function no matter what it sends: it
   authenticates as `authenticated`, which has no privilege here. The route
   above it authenticates the founder before calling, and this function
   independently refuses any authorizer that is not the founder. */
create or replace function public.remove_listing_assistant(
  p_listing_id    uuid,
  p_reason_code   text,
  p_reason_note   text,
  p_authorized_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_founder constant uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
begin
  if p_authorized_by is null or p_authorized_by <> v_founder then
    raise exception 'not_allowed';
  end if;
  return public.remove_listing_core(
    p_listing_id, p_reason_code, p_reason_note,
    p_authorized_by, 'assistant', 'remove_listing_assistant'
  );
end
$fn$;

revoke all on function public.remove_listing_assistant(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.remove_listing_assistant(uuid, text, text, uuid)
  to service_role;

comment on function public.remove_listing_assistant(uuid, text, text, uuid) is
  'Assistant-executed Remove. EXECUTE is granted to service_role only, which is what makes executed_via=assistant unforgeable by any browser session.';

-- ═════ 6 · RESTORE — THE GOVERNED INVERSE ════════════════════════════════

/* Deliberately has no assistant twin. The Assistant may take a listing OFF
   the market under confirmation; putting one back is a founder/seller act
   through the product, and an Assistant-only undo was explicitly refused —
   an undo the Assistant owns is not the same product capability as a restore
   the product owns. When restore is wanted from the Assistant it gains a
   service_role wrapper exactly like Remove's, not a private path. */
create or replace function public.restore_listing(
  p_listing_id uuid,
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_caller    uuid := auth.uid();
  v_founder   constant uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
  v_listing   public.listings%ROWTYPE;
  v_now       timestamptz;
  v_cancelled int := 0;
begin
  if v_caller is null then raise exception 'not_authenticated'; end if;

  select * into v_listing from public.listings
   where id = p_listing_id for update;
  if not found then raise exception 'not_found'; end if;

  if v_listing.seller_id <> v_caller and v_caller <> v_founder then
    raise exception 'not_allowed';
  end if;

  if v_listing.status <> 'removed' then
    raise exception 'not_removed:%', v_listing.status;
  end if;

  /* What restore will NOT undo, counted before the write so the caller can
     state it truthfully rather than estimate it. */
  select count(*) into v_cancelled
    from public.purchase_requests
   where listing_id = p_listing_id
     and status = 'cancelled'
     and closure_cause in ('listing_removed_by_seller', 'listing_removed_by_admin');

  perform set_config('fwt.authorized_by', v_caller::text, true);
  perform set_config('fwt.executed_via',  'direct', true);
  perform set_config('fwt.machinery',     'restore_listing', true);

  v_now := now();

  /* The current-actionable removal mirror is cleared; the REMOVED lifecycle
     row is immutable and stays exactly where it is. */
  update public.listings set
    status              = 'pending_review',
    removed_at          = null,
    removal_reason_code = null,
    removal_reason_note = null
  where id = p_listing_id;

  return jsonb_build_object(
    'listing_id',                p_listing_id,
    'status',                    'pending_review',
    'restored_at',               v_now,
    'note',                      left(nullif(btrim(coalesce(p_note, '')), ''), 320),
    'requests_left_cancelled',   v_cancelled,
    'reopened_requests',         0,
    'awaiting_founder_approval', true
  );
end
$fn$;

revoke all on function public.restore_listing(uuid, text) from public, anon;
grant execute on function public.restore_listing(uuid, text) to authenticated, service_role;

comment on function public.restore_listing(uuid, text) is
  'The governed inverse of Remove. Returns a removed listing to pending_review - the market pipeline, never the market: publication still requires a recorded founder approval. Never reopens purchase requests cancelled by the removal.';

-- ═════ 7 · THE REMOVE PREVIEW — ONE SOURCE OF CONSEQUENCE TRUTH ══════════

/* Before v6.89 the room previewed Remove by filtering on status in
   TypeScript, which could say WHETHER a listing could be removed but never
   what removing it would COST. The founder confirmed a removal without being
   told how many people were about to lose a pending request.

   Both the product surface and the Assistant read this one function, so the
   sentence the founder confirms and the sentence the Assistant speaks are
   produced by the same query rather than reconstructed twice. */
create or replace function public.listing_remove_preview(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_caller    uuid := auth.uid();
  v_founder   constant uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
  v_listing   public.listings%ROWTYPE;
  v_pending   int;
  v_buyers    int;
  v_accepted  int;
  v_removable boolean;
  v_refusal   text := null;
begin
  select * into v_listing from public.listings where id = p_listing_id;
  if not found then raise exception 'not_found'; end if;

  /* A NULL caller is the trusted server reading on the founder's behalf —
     the same posture listing_delete_eligibility() takes. */
  if v_caller is not null
     and v_listing.seller_id <> v_caller
     and v_caller <> v_founder then
    raise exception 'not_found';
  end if;

  select count(*) filter (where status = 'pending'),
         count(distinct buyer_id) filter (where status = 'pending'),
         count(*) filter (where status = 'accepted')
    into v_pending, v_buyers, v_accepted
    from public.purchase_requests
   where listing_id = p_listing_id;

  v_removable := v_listing.status in ('published', 'reserved', 'pending_review');
  if not v_removable then
    v_refusal := case v_listing.status
      when 'removed'        then 'already_removed'
      when 'draft'          then 'never_on_market'
      when 'rejected'       then 'never_on_market'
      when 'private_active' then 'private_listing_machinery'
      else 'not_removable'
    end;
  end if;

  return jsonb_build_object(
    'listing_id',                  p_listing_id,
    'public_code',                 v_listing.public_code,
    'brand',                       v_listing.brand,
    'model',                       v_listing.model,
    'reference',                   v_listing.reference,
    'current_status',              v_listing.status,
    'removable',                   v_removable,
    'refusal',                     v_refusal,
    'requests_to_cancel',          coalesce(v_pending, 0),
    'buyers_notified',             coalesce(v_buyers, 0),
    'accepted_requests_remaining', coalesce(v_accepted, 0),
    'reversible',                  true,
    'restore_target_status',       'pending_review',
    'restore_reopens_requests',    false,
    'evaluated_at',                now()
  );
end
$fn$;

revoke all on function public.listing_remove_preview(uuid) from public, anon;
grant execute on function public.listing_remove_preview(uuid) to authenticated, service_role;

comment on function public.listing_remove_preview(uuid) is
  'Read-only consequence preview for Remove: who gets cancelled, who gets told, what restore will and will not undo. The product surface and the Assistant both read this rather than reconstructing consequences separately.';

-- ═════ 8 · DELETE ELIGIBILITY TELLS THE WHOLE TRUTH ══════════════════════

/* THE DEFECT: three foreign keys into listings are ON DELETE RESTRICT —
   trade_deal_legs.listing_id, trade_offers.target_listing_id and
   trade_offers.offered_listing_id — and eligibility disclosed none of them
   faithfully. It checked trade DEALS by status and never looked at
   trade_offers at all, so a listing carrying any trade-offer row was
   reported deletable and then failed at the FK inside the purge. Governed
   eligibility owes the founder the refusal BEFORE the destructive call, not
   a raw database error after it.

   Both listing roles are checked. A listing can be blocked as the watch that
   was WANTED (target) or as the watch OFFERED for it, and a check on one
   column would have been half a truth.

   The status split is a product ruling, not an age test:
     · accepted  — the offer that became a real trade. Blocks unconditionally.
     · pending   — an open proposal awaiting an answer.
     · declined / superseded / withdrawn — terminal. They carry their own
       identity snapshot (target_/offered_ brand, model, reference), so they
       stay legible without the listing row and represent no live obligation.

   Terminal rows are reported under their own code because they block for a
   DIFFERENT reason from the live ones: not a product dependency, only the
   RESTRICT itself. Relaxing that is a Trade Offers decision about another
   party's record and is deliberately NOT taken here — but it is now visible
   instead of arriving as an FK exception. Same treatment for legs of
   completed/cancelled deals, which the previous check silently excluded
   while the FK kept blocking on them. */
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

  if v_off_term > 0 then
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'trade_offer_history', 'count', v_off_term);
  end if;

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
    'eligible_for_permanent_delete', jsonb_array_length(v_blockers) = 0,
    'blockers',                      v_blockers,
    'evaluated_at',                  now()
  );
end
$fn$;
