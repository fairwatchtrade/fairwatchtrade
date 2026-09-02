/* ════════════════════════════════════════════════════════════════════════
   TRADE V1 AUTHORITY REPAIR — SLICE 1                            (v8.17)

   Two live authority defects. Both were exploitable through the ordinary
   product path by an ordinary signed-in collector.

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "The route already checks all of this, so the database does not have to."

   A route check is a convenience. It is not a security boundary, because a
   route check can be raced, and because a route that reads a row and then
   writes based on what it read has proven nothing about the moment of the
   write. Both defects below lived in exactly that gap.

   ── DEFECT A — private-listing proposal admission ──────────────────────

   A `private_active` listing is offered to ONE authorized buyer. Trade
   proposal creation had no governed mutation at all: /api/trade-offers
   POST read both listings with the SERVICE client (RLS bypassed), checked
   them in TypeScript, and then inserted. `isTradeable()` accepts
   `private_active` deliberately - that is how a watch not publicly for sale
   takes part in a trade - but nothing anywhere compared the caller to
   `private_buyer_id`.

   So any signed-in collector holding a private listing's id could propose
   against someone else's private watch. The designated-buyer rule existed
   in RLS for reading and nowhere at all for this write.

   There were also no locks. Target status was read, then written against,
   with an open window in between.

   ── DEFECT B — replay evaluated before authorization ───────────────────

   record_physical_watch_transfer_event checked `idempotency_key` as its
   FIRST action - before the deal lock, before the leg lock, before proving
   the leg belongs to the deal, and before the authorization branch that
   decides whether this actor may assert this event at all.

   The key is client-supplied. So a replay hit returned another actor's
   successful event to a caller who was never authorized to perform it.

   It is worse than a guessing attack, because the keys are not secret.
   confirm_trade_leg_receipt derives its key as:

       'trade_leg_receipt:' || p_leg_id

   which is fully determined by the leg id. Anyone who could reach a leg id
   could reconstruct the recipient's exact key and read back the recipient's
   confirmation event, with `idempotent_replay: true`, having proven nothing.

   THE RULE, WRITTEN POSITIVELY:

     A replay means THIS EXACT AUTHORIZED ACTOR ALREADY PERFORMED THIS
     EXACT AUTHORIZED ACTION.

     It does not mean someone already used this string.

   ── WHAT IS DELIBERATELY NOT CHANGED HERE ──────────────────────────────

   · TRANSFERRED remains recipient-only. Pre-completion TRANSFER_RETRACTED
     authority is unchanged. No post-completion refusal is added.
   · accept_trade_offer() is untouched. Acceptance is recipient-only and the
     recipient IS the private listing's owner, so no cross-actor hole exists
     there. Its lock discipline is the pattern this file follows.
   · No historical rows are migrated, edited or deleted.
   · No RLS policy and no table grant is altered.
   · Scoring and the Canary path are untouched.
   ════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════
   DEFECT A — propose_trade_offer()

   Proposal creation becomes a governed mutation for the first time. One
   transaction: lock both listings in deterministic order, revalidate every
   admission rule against the LOCKED rows, insert the offer, and author its
   trade_offer_events row.

   TARGET vs CONSIDERATION - the distinction that makes this correct:

     TARGET (the watch being proposed FOR, someone else's):
       published                                   -> eligible
       private_active AND caller = private_buyer_id -> eligible
       private_active AND caller <> private_buyer_id -> REFUSED

     OFFERED (the caller's own watch, put up as consideration):
       the designated-buyer gate does NOT apply. An owner may offer their
       own private_active watch before it is committed. It is theirs; the
       private designation governs who may acquire it, not whether its owner
       may put it on the table. Competing use after commitment is already
       refused by the accepted-offer and accepted-request checks in
       accept_trade_offer().

   Applying the target gate to the offered watch would be the easy mistake
   and would silently forbid a legitimate, already-governed move.
   ══════════════════════════════════════════════════════════════════════ */

create or replace function public.propose_trade_offer(
  p_target_listing_id  uuid,
  p_offered_listing_id uuid,
  p_cash_direction     text,
  p_cash_amount        numeric,
  p_cash_currency      text,
  p_note               text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller   uuid := auth.uid();
  v_first    uuid;
  v_second   uuid;
  v_target   public.listings%rowtype;
  v_offered  public.listings%rowtype;
  v_offer_id uuid;
  v_note     text;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;
  if p_target_listing_id is null or p_offered_listing_id is null then
    raise exception 'bad_request';
  end if;
  if p_target_listing_id = p_offered_listing_id then
    raise exception 'same_watch';
  end if;

  /* Deterministic lock order by listing id - the discipline proven in
     accept_trade_offer(). Two proposals crossing in opposite directions
     take the same two locks in the same sequence and therefore queue
     instead of deadlocking. Never lock "target then offered": that is the
     ordering that deadlocks precisely when two collectors want each
     other's watch, which is the case Trade exists for. */
  if p_target_listing_id < p_offered_listing_id then
    v_first  := p_target_listing_id;
    v_second := p_offered_listing_id;
  else
    v_first  := p_offered_listing_id;
    v_second := p_target_listing_id;
  end if;

  perform 1 from public.listings where id = v_first  for update;
  perform 1 from public.listings where id = v_second for update;

  /* Read AFTER the locks. A read taken before them describes a row that
     may already have changed by the time the insert lands. */
  select * into v_target  from public.listings where id = p_target_listing_id;
  if v_target.id is null then
    raise exception 'target_not_found';
  end if;
  select * into v_offered from public.listings where id = p_offered_listing_id;
  if v_offered.id is null then
    raise exception 'offered_not_found';
  end if;

  -- ── the target: someone else's, acquirable, open to trades ──────────
  if v_target.seller_id = v_caller then
    raise exception 'own_listing';
  end if;
  if v_target.open_to_trades is not true then
    raise exception 'not_open_to_trades';
  end if;
  if v_target.status not in ('published', 'private_active') then
    raise exception 'target_not_available:%', v_target.status;
  end if;

  /* THE DEFECT A REPAIR. A private listing admits exactly one buyer, and
     this is the only place a proposal against one can be created. `is
     distinct from` rather than `<>` on purpose: a private_active row with a
     NULL private_buyer_id designates nobody, and `<>` against NULL would
     yield NULL and fall through the guard. */
  if v_target.status = 'private_active'
     and v_target.private_buyer_id is distinct from v_caller then
    raise exception 'target_private_not_designated';
  end if;

  -- ── the offered watch: the caller's own, and equally acquirable ──────
  if v_offered.seller_id <> v_caller then
    raise exception 'offered_not_yours';
  end if;
  if v_offered.status not in ('published', 'private_active') then
    raise exception 'offered_not_available:%', v_offered.status;
  end if;
  /* Deliberately NO private_buyer_id gate here. See the header. */

  v_note := nullif(left(btrim(coalesce(p_note, '')), 500), '');

  /* Denormalised identity is copied from the LOCKED rows, not from an
     earlier read in the caller - so a terminal offer's durable identity can
     never disagree with the listing it was actually created against. */
  begin
    insert into public.trade_offers (
      target_listing_id, offered_listing_id,
      proposer_id, recipient_id, status,
      cash_direction, cash_amount, cash_currency, note,
      target_brand, target_model, target_reference,
      offered_brand, offered_model, offered_reference,
      target_public_code, offered_public_code
    ) values (
      v_target.id, v_offered.id,
      v_caller, v_target.seller_id, 'pending',
      p_cash_direction, p_cash_amount, p_cash_currency, v_note,
      v_target.brand, v_target.model, v_target.reference,
      v_offered.brand, v_offered.model, v_offered.reference,
      v_target.public_code, v_offered.public_code
    )
    returning id into v_offer_id;
  exception when unique_violation then
    -- trade_offers_one_pending_per_proposer doing its job.
    raise exception 'already_proposed';
  end;

  /* FOUNDER RULING (2026-09-02): trade_offer_events is the authoritative,
     append-only history of Trade offer lifecycle transitions, and every
     governed transition must atomically author its corresponding event.

     This insert is in the SAME transaction as the offer above. It was
     previously a separate statement issued by the route AFTER the insert
     had already committed, with its error discarded - so a failure there
     left a pending offer with no 'proposed' event and nothing said so. */
  insert into public.trade_offer_events (
    trade_offer_id, event_type, actor_user_id,
    prior_status, resulting_status, metadata
  ) values (
    v_offer_id, 'proposed', v_caller,
    null, 'pending',
    jsonb_build_object(
      'target_listing_id',  v_target.id,
      'offered_listing_id', v_offered.id,
      'cash_direction',     p_cash_direction,
      'cash_amount',        p_cash_amount,
      'cash_currency',      p_cash_currency
    )
  );

  return jsonb_build_object(
    'trade_offer_id',     v_offer_id,
    'status',             'pending',
    'recipient_id',       v_target.seller_id,
    'target_listing_id',  v_target.id,
    'offered_listing_id', v_offered.id
  );
end;
$function$;

revoke execute on function public.propose_trade_offer(uuid, uuid, text, numeric, text, text) from public, anon;
grant  execute on function public.propose_trade_offer(uuid, uuid, text, numeric, text, text) to authenticated;

comment on function public.propose_trade_offer(uuid, uuid, text, numeric, text, text) is
  'Governed Trade proposal creation. Locks both listings in deterministic id '
  'order, revalidates target/offered admission against the locked rows '
  '(private_active targets admit only private_buyer_id; the caller''s own '
  'private_active watch may be offered as consideration), inserts the offer, '
  'and atomically authors its trade_offer_events proposed row.';


/* ══════════════════════════════════════════════════════════════════════
   DEFECT B — record_physical_watch_transfer_event()

   Same signature, same authority rules, same events. ONLY the ORDER of
   operations and the definition of a replay change.

   Required order, and the reason each step sits where it does:

     1. actor and key present            - nothing can be decided without them
     2. lock the deal                    - before anything is read from it
     3. lock the leg, prove it is the deal's
     4. lock the listing, resolve the bead
     5. AUTHORIZE for the requested event type
     6. only now, evaluate replay        - scoped to the authorized action
     7. state validation, then insert

   Step 6 sits after step 5 because that is the entire defect. It also sits
   BEFORE step 7 for a reason worth stating: a legitimate retry by the real
   recipient would otherwise die on `leg_already_has_live_transfer`, which
   its own first call created. Authorization, then replay, then state.
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

  /* ── 2-4 · LOCKS AND STRUCTURE, before any decision ──────────────── */
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

  /* ── 5 · AUTHORIZATION, for the requested event type ─────────────── */
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
    /* Hoisted above the retraction's state checks as well as above replay.
       An unauthorized caller must not be able to distinguish
       `superseded_event_not_found` from `target_transfer_is_not_live` -
       those answers describe someone else's transfer. */
    if p_actor_user_id <> c_founder and p_actor_user_id <> v_leg.to_user_id then
      raise exception 'not_authorized_to_retract'; end if;
    if p_supersedes_event_id is null then raise exception 'retraction_must_supersede'; end if;

  else
    raise exception 'unsupported_event_type';
  end if;

  /* ── 6 · REPLAY, and only now ────────────────────────────────────────
     Replay identity is the TUPLE (leg, actor, event_type, key). A matching
     raw key alone proves nothing about who is calling or what they asked
     for, and returning an event on that basis is the defect.

     A key that exists under a different tuple is a CONFLICT, never a
     replay: idempotency_key carries a UNIQUE index, so the insert could not
     succeed anyway, and refusing here means the conflicting event's id is
     never disclosed to a caller who has no standing to see it. */
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

  /* ── 7 · STATE VALIDATION, then the insert ───────────────────────── */
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

  else -- TRANSFER_RETRACTED; every other value already raised above
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

  perform public.recompute_trade_transfer_status(v_deal.id);

  return jsonb_build_object('event_id', v_id, 'event_type', p_event_type,
    'physical_watch_id', v_bead, 'decision_generation', v_gen,
    'leg_status', (select leg_status from public.trade_deal_legs where id = v_leg.id),
    'deal_status', (select status from public.trade_deals where id = v_deal.id),
    'idempotent_replay', false);
end $function$;

/* Grants unchanged and restated so this file is self-describing: the
   producer stays service_role-only. It is reached through the route, never
   from a browser. */
revoke execute on function public.record_physical_watch_transfer_event(
  uuid, public.physical_watch_transfer_event_type, uuid,
  public.physical_watch_transfer_provenance, timestamp with time zone, uuid, text
) from public, anon, authenticated;
grant execute on function public.record_physical_watch_transfer_event(
  uuid, public.physical_watch_transfer_event_type, uuid,
  public.physical_watch_transfer_provenance, timestamp with time zone, uuid, text
) to service_role;
