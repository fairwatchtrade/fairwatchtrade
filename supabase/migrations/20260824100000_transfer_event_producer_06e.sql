-- ════════════════════════════════════════════════════════════════════════
-- TRANSFER EVENT PRODUCER — what actually happened to the physical watch
-- supabase/migrations/20260824100000_transfer_event_producer_06e.sql
--
-- THE MISCONCEPTION THIS MIGRATION EXISTS TO KILL:
--
--   A transfer event records what happened to the object. It is not what
--   the Trade hoped would happen.
--
--   THE EVENT IS TRUTH. STATUS IS CACHE.
--
-- An offer is not a transfer. Acceptance is not a transfer. A binding deal
-- is not a transfer. A shipping label, a carrier scan, a payment intent, a
-- message saying "posted it this morning" — none of them is a transfer.
-- Nothing in this file infers one from any of them.
--
-- ── THE TWO WAYS HISTORY MAY BE CREATED, AND WHY ONLY TWO ──────────────
--   party_confirmed_recipient  the RECIPIENT personally asserted they
--                              received it. The strongest single-party
--                              direct provenance available, because the
--                              recipient is the party positioned to
--                              witness the far side of the transfer.
--   founder_asserted           the founder recorded that the transfer
--                              occurred, on the evidence available.
--
-- Sender-alone assertion is absent, deliberately and permanently. "I sent
-- it" is a claim about an intention and a parcel; it is not knowledge that
-- the object arrived, and a marketplace that lets the sending party close
-- its own transfer history has built a fraud surface, not a record.
--
-- ── PROVENANCE STRENGTH IS NOT AUTHORITY ───────────────────────────────
-- founder_asserted carries higher GOVERNANCE authority and, absent separate
-- evidence, WEAKER first-person evidence than the recipient's own
-- confirmation. It does not mean the founder witnessed the handoff, that
-- the platform verified anything, or that a carrier proved the correct
-- watch was inside the box. The class records who asserted and on what
-- footing — nothing stronger is available in V1 and nothing here pretends
-- otherwise.
--
-- ── WHY leg_status IS NOT THE RECORD ───────────────────────────────────
-- A status column is a summary. Summaries get patched, and a patched
-- summary is indistinguishable from a real event. So the event is primary
-- and the leg's status is recomputed from it — never authored beside it. A
-- trigger below refuses any write that sets a leg to 'transferred' outside
-- the governed seam, because the one thing worse than a missing record is
-- a status that claims a record exists.
--
-- ── WHY NO resolved_watch_id AND NO CONFLICT FLAG ON THE EVENT ─────────
-- Both would be a second copy of something 06D already knows and can
-- recompute. Identity understanding legitimately changes after a transfer;
-- a stored resolved id would freeze an answer that later became wrong, and
-- a stored conflict boolean would freeze a question. The event stamps the
-- decision generation instead, and the as-of resolver reconstructs the
-- identity state that was current at that moment, whenever it is asked.
--
-- A real transfer is never invalidated by uncertain exact-watch resolution.
-- Identity uncertainty must not erase real-world history.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ═════ PART 1 · 06D AS-OF-GENERATION REPLAY ═════════════════════════════
-- The hard prerequisite. An event stamps a generation; something has to be
-- able to answer what identity looked like AT that generation, forever.
--
-- The existing 06D functions become thin wrappers over these, so there is
-- exactly ONE closure implementation rather than a current one and a
-- historical one that can drift apart.

create or replace function public.physical_watch_effective_decisions_as_of(p_generation bigint)
returns table (
  left_physical_watch_id uuid,
  right_physical_watch_id uuid,
  outcome public.watch_resolution_outcome
)
language sql stable set search_path = '' as $fn$
  /* The chain head AS OF a generation is the highest-generation row in each
     chain at or below it — not the row nothing supersedes today, because
     today's head may not have existed yet. A RETRACTED head is filtered
     out here exactly as in the current view: withdrawal asserts nothing. */
  with ranked as (
    select d.*,
           row_number() over (
             partition by d.chain_root_id
             order by d.decision_generation desc
           ) as rn
    from public.physical_watch_resolution_decisions d
    where d.decision_generation <= p_generation
  )
  select left_physical_watch_id, right_physical_watch_id, outcome
  from ranked
  where rn = 1 and outcome <> 'RETRACTED'
$fn$;

create or replace function public.physical_watch_components_as_of(p_generation bigint)
returns table (physical_watch_id uuid, component_id uuid)
language sql stable set search_path = '' as $fn$
  with recursive eff as (
    select * from public.physical_watch_effective_decisions_as_of(p_generation)
  ),
  pos as (
    select left_physical_watch_id as l, right_physical_watch_id as r
    from eff where outcome = 'CONFIRMED_SAME_WATCH'
  ),
  nodes as (
    select left_physical_watch_id as id from eff
    union select right_physical_watch_id from eff
  ),
  edges as (
    select l as a, r as b from pos union all select r as a, l as b from pos
  ),
  walk as (
    select n.id as node, n.id as reached from nodes n
    union
    select w.node, e.b from walk w join edges e on e.a = w.reached
  )
  select node, min(reached::text)::uuid from walk group by node
$fn$;

create or replace function public.physical_watch_conflicted_components_as_of(p_generation bigint)
returns table (component_id uuid)
language sql stable set search_path = '' as $fn$
  select distinct cl.component_id
  from public.physical_watch_effective_decisions_as_of(p_generation) nm
  join public.physical_watch_components_as_of(p_generation) cl
    on cl.physical_watch_id = nm.left_physical_watch_id
  join public.physical_watch_components_as_of(p_generation) cr
    on cr.physical_watch_id = nm.right_physical_watch_id
  where nm.outcome = 'EXPLICIT_NON_MATCH' and cl.component_id = cr.component_id
$fn$;

/* The current-state functions now delegate. Identical semantics — the
   committed maximum generation IS the current state — with one
   implementation of the closure instead of two. */
create or replace function public.physical_watch_components()
returns table (physical_watch_id uuid, component_id uuid)
language sql stable set search_path = '' as $fn$
  select * from public.physical_watch_components_as_of(
    (select coalesce(max(decision_generation), 0)
       from public.physical_watch_resolution_decisions))
$fn$;

create or replace function public.physical_watch_conflicted_components()
returns table (component_id uuid)
language sql stable set search_path = '' as $fn$
  select * from public.physical_watch_conflicted_components_as_of(
    (select coalesce(max(decision_generation), 0)
       from public.physical_watch_resolution_decisions))
$fn$;

/* Historical identity for one bead, as of one generation. This is what a
   later consumer asks when it wants to know what was true when an event
   was recorded — never what is true now. */
create or replace function public.resolve_physical_watch_as_of(
  p_bead uuid, p_generation bigint
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_component uuid; v_members uuid[]; v_conflict boolean; v_resolved uuid;
begin
  select c.component_id into v_component
  from public.physical_watch_components_as_of(p_generation) c
  where c.physical_watch_id = p_bead;

  if v_component is null then
    return jsonb_build_object(
      'bead', p_bead, 'generation', p_generation, 'state', 'UNRESOLVED',
      'members', jsonb_build_array(p_bead), 'conflicted', false,
      'resolved_watch_id', null);
  end if;

  select array_agg(c.physical_watch_id order by c.physical_watch_id) into v_members
  from public.physical_watch_components_as_of(p_generation) c
  where c.component_id = v_component;

  v_conflict := exists (
    select 1 from public.physical_watch_conflicted_components_as_of(p_generation) x
    where x.component_id = v_component);

  /* The resolved identity that was VALID at that generation: minted at or
     before it, and not yet retired by it. Retired ids stay queryable as
     historical belief, which is exactly what this answer needs. */
  if not v_conflict then
    select rw.id into v_resolved
    from public.resolved_watches rw
    where rw.minted_generation <= p_generation
      and (rw.retired_generation is null or rw.retired_generation > p_generation)
      and p_bead = any (rw.member_beads)
    order by rw.minted_generation desc
    limit 1;
  end if;

  return jsonb_build_object(
    'bead', p_bead, 'generation', p_generation,
    'state', case when v_conflict then 'CONFLICTED'
                  when v_resolved is not null then 'RESOLVED' else 'UNRESOLVED' end,
    'members', to_jsonb(v_members), 'conflicted', v_conflict,
    'resolved_watch_id', v_resolved);
end
$fn$;

-- ═════ PART 2 · LISTING BEAD IMMUTABILITY ═══════════════════════════════
-- Transfer history is about to key permanently to listings.physical_watch_id.
-- Before that happens, the bead must become unchangeable: a rewritten bead
-- would silently re-point completed history at a different object.
-- Initial population under the 06B column default is untouched.
create or replace function public.listings_physical_watch_id_is_immutable()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if old.physical_watch_id is not null
     and new.physical_watch_id is distinct from old.physical_watch_id then
    raise exception 'physical_watch_id_is_immutable';
  end if;
  return new;
end
$fn$;

drop trigger if exists listings_physical_watch_id_immutable on public.listings;
create trigger listings_physical_watch_id_immutable
  before update on public.listings
  for each row execute function public.listings_physical_watch_id_is_immutable();

-- ═════ PART 3 · THE TRANSFER EVENT ══════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_type where typname='physical_watch_transfer_event_type') then
    create type public.physical_watch_transfer_event_type as enum
      ('TRANSFERRED','TRANSFER_RETRACTED');
  end if;
  if not exists (select 1 from pg_type where typname='physical_watch_transfer_provenance') then
    -- No sender-only class. No 'verified', 'platform_verified' or
    -- 'carrier_verified' — those claim an inspection nobody performed.
    create type public.physical_watch_transfer_provenance as enum
      ('party_confirmed_recipient','founder_asserted');
  end if;
end $$;

create table if not exists public.physical_watch_transfer_events (
  id                   uuid primary key default gen_random_uuid(),

  -- Nullable from day one: 06E emits only leg-bound transfers, but a real
  -- object can change hands outside a Trade and this schema must not have
  -- to be reshaped when that becomes true.
  -- RESTRICT, not CASCADE: trade_deal_legs cascades from trade_deals, and
  -- inheriting that path would let deleting a deal erase evidence of a
  -- transfer that really happened. Deletion fails closed instead.
  trade_deal_leg_id    uuid references public.trade_deal_legs(id) on delete restrict,
  trade_deal_id        uuid references public.trade_deals(id) on delete restrict,

  -- The immutable 06B bead, read from the LOCKED listing at event time.
  physical_watch_id    uuid not null references public.physical_watches(id) on delete restrict,

  from_user_id         uuid not null references auth.users(id) on delete restrict,
  to_user_id           uuid not null references auth.users(id) on delete restrict,

  -- When it happened, if known, versus when this platform learned of it.
  occurred_at          timestamptz,
  recorded_at          timestamptz not null default now(),

  asserted_by_user_id  uuid not null references auth.users(id) on delete restrict,
  provenance_class     public.physical_watch_transfer_provenance not null,
  event_type           public.physical_watch_transfer_event_type not null,

  -- 06D watermark. NOT a resolved id and NOT a conflict flag: both would
  -- freeze an answer that identity work is allowed to revise.
  decision_generation  bigint not null,

  supersedes_event_id  uuid references public.physical_watch_transfer_events(id) on delete restrict,
  idempotency_key      text not null,

  constraint transfer_distinct_parties check (from_user_id <> to_user_id),
  constraint transfer_retraction_supersedes
    check (event_type <> 'TRANSFER_RETRACTED' or supersedes_event_id is not null),
  constraint transfer_forward_does_not_supersede
    check (event_type <> 'TRANSFERRED' or supersedes_event_id is null)
);

comment on table public.physical_watch_transfer_events is
  'Append-only record of real physical-watch ownership transfers. THE EVENT IS TRUTH; trade_deal_legs.leg_status is cache recomputed from it. Never inferred from an offer, acceptance, binding, shipment, carrier scan, payment intent, message, or a sender-alone claim.';

comment on column public.physical_watch_transfer_events.provenance_class is
  'How this assertion came to exist. party_confirmed_recipient is the recipient''s own first-person confirmation — the strongest direct provenance in V1. founder_asserted is administrative authority on available evidence; it carries higher governance weight and, absent separate evidence, weaker first-person evidence. Neither means FairWatchTrade verified the contents of a package.';

comment on column public.physical_watch_transfer_events.decision_generation is
  'The 06D watermark current when this event was recorded. Historical identity is reconstructed with resolve_physical_watch_as_of(), never stored — a stored resolved id would freeze an answer later identity work is allowed to revise.';

-- Retry safety. Two identical calls collapse into one row.
create unique index if not exists transfer_events_idempotency_key_idx
  on public.physical_watch_transfer_events (idempotency_key);

-- No naive UNIQUE(trade_deal_leg_id): that would make a corrected later
-- transfer structurally impossible, and correction is the whole point of an
-- append-only log. Liveness is derived; the governed function serializes on
-- the leg lock.
create unique index if not exists transfer_events_supersedes_once_idx
  on public.physical_watch_transfer_events (supersedes_event_id)
  where supersedes_event_id is not null;

create index if not exists transfer_events_leg_idx
  on public.physical_watch_transfer_events (trade_deal_leg_id);
create index if not exists transfer_events_bead_idx
  on public.physical_watch_transfer_events (physical_watch_id);

-- History is history.
create or replace function public.transfer_events_are_append_only()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  raise exception 'transfer_history_is_append_only';
end
$fn$;

drop trigger if exists transfer_events_immutable on public.physical_watch_transfer_events;
create trigger transfer_events_immutable
  before update or delete on public.physical_watch_transfer_events
  for each row execute function public.transfer_events_are_append_only();

alter table public.physical_watch_transfer_events enable row level security;
revoke all on public.physical_watch_transfer_events from anon, authenticated;

/* A TRANSFERRED that nothing has retracted. The one derivation everything
   else in this file depends on. */
create or replace view public.physical_watch_live_transfers as
select e.*
from public.physical_watch_transfer_events e
where e.event_type = 'TRANSFERRED'
  and not exists (
    select 1 from public.physical_watch_transfer_events r
    where r.supersedes_event_id = e.id and r.event_type = 'TRANSFER_RETRACTED');

revoke all on public.physical_watch_live_transfers from anon, authenticated;

-- ═════ PART 4 · leg_status MAY NOT BE AUTHORED ══════════════════════════
-- 'transferred' is reachable only through the governed seam, which sets a
-- transaction-local flag. Any other writer — a future route, a console
-- session, a well-meaning backfill — is refused.
create or replace function public.trade_leg_transferred_requires_event()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if new.leg_status = 'transferred'
     and old.leg_status is distinct from 'transferred'
     and coalesce(current_setting('fwt.transfer_seam', true), '') <> 'on' then
    raise exception 'leg_status_transferred_requires_governed_transfer_event';
  end if;
  return new;
end
$fn$;

drop trigger if exists trade_leg_transferred_guard on public.trade_deal_legs;
create trigger trade_leg_transferred_guard
  before update on public.trade_deal_legs
  for each row execute function public.trade_leg_transferred_requires_event();

-- ═════ PART 5 · THE ONE GOVERNED WRITE SEAM ════════════════════════════
-- Everything that makes a transfer assertion safe happens inside this one
-- function, in one transaction, under locks taken in a fixed order:
-- parent deal → leg → listing. Nothing else may write transfer history,
-- and nothing may author a leg into 'transferred' beside it.

create or replace function public.recompute_trade_transfer_status(p_deal_id uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_status text;
  v_legs int;
  v_live int;
begin
  select status into v_status from public.trade_deals where id = p_deal_id;

  /* leg_status is CACHE. Recomputed from live events, never authored. The
     seam flag tells the guard trigger this write came from here. */
  perform set_config('fwt.transfer_seam', 'on', true);

  update public.trade_deal_legs l
     set leg_status = 'transferred', updated_at = now()
   where l.trade_deal_id = p_deal_id
     and l.leg_status <> 'transferred'
     and exists (select 1 from public.physical_watch_live_transfers t
                 where t.trade_deal_leg_id = l.id);

  /* A retracted transfer returns the leg to the only pre-transfer state the
     Trade contract actually authors. No invented lifecycle. */
  update public.trade_deal_legs l
     set leg_status = 'bound', updated_at = now()
   where l.trade_deal_id = p_deal_id
     and l.leg_status = 'transferred'
     and not exists (select 1 from public.physical_watch_live_transfers t
                     where t.trade_deal_leg_id = l.id);

  perform set_config('fwt.transfer_seam', 'off', true);

  select count(*),
         count(*) filter (where exists (
           select 1 from public.physical_watch_live_transfers t where t.trade_deal_leg_id = l.id))
    into v_legs, v_live
  from public.trade_deal_legs l where l.trade_deal_id = p_deal_id;

  /* A cancelled deal is left alone: recording that a watch really moved
     must not silently resurrect a deal somebody cancelled. The event stands
     on its own regardless — that is the point of the event being truth. */
  if v_status = 'cancelled' then return; end if;

  if v_live >= 2 then
    update public.trade_deals set status = 'completed', completed_at = now(), updated_at = now()
     where id = p_deal_id and status is distinct from 'completed';
  elsif v_live = 1 then
    /* One real transfer with the sibling still pending, cancelled, or dead
       all land here. The parent never reads 'completed' on a half-finished
       trade, and the transfer that did happen is not erased to tidy it. */
    update public.trade_deals set status = 'settling', completed_at = null, updated_at = now()
     where id = p_deal_id and status is distinct from 'settling';
  else
    update public.trade_deals set status = 'pending', completed_at = null, updated_at = now()
     where id = p_deal_id and status in ('settling','completed');
  end if;
end $fn$;

create or replace function public.record_physical_watch_transfer_event(
  p_trade_deal_leg_id   uuid,
  p_event_type          public.physical_watch_transfer_event_type,
  p_actor_user_id       uuid,
  p_provenance_class    public.physical_watch_transfer_provenance,
  p_occurred_at         timestamptz,
  p_supersedes_event_id uuid,
  p_idempotency_key     text
)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  c_founder constant uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
  v_leg      public.trade_deal_legs;
  v_deal     public.trade_deals;
  v_bead     uuid;
  v_gen      bigint;
  v_prior    public.physical_watch_transfer_events;
  v_existing public.physical_watch_transfer_events;
  v_id       uuid := gen_random_uuid();
begin
  if p_actor_user_id is null then raise exception 'actor_required'; end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency_key_required'; end if;

  /* Retry safety BEFORE any work: an identical call returns the event it
     already created rather than creating a second one. */
  select * into v_existing from public.physical_watch_transfer_events
   where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('event_id', v_existing.id, 'event_type', v_existing.event_type,
      'idempotent_replay', true);
  end if;

  -- ── locks, in a fixed order: deal then leg then listing ─────────────
  select d.* into v_deal from public.trade_deals d
   where d.id = (select trade_deal_id from public.trade_deal_legs where id = p_trade_deal_leg_id)
   for update;
  if not found then raise exception 'deal_not_found'; end if;

  select l.* into v_leg from public.trade_deal_legs l where l.id = p_trade_deal_leg_id for update;
  if not found then raise exception 'leg_not_found'; end if;
  if v_leg.trade_deal_id <> v_deal.id then raise exception 'leg_does_not_belong_to_deal'; end if;

  -- The bead is read from the LOCKED listing, at event time, and stamped.
  select physical_watch_id into v_bead from public.listings
   where id = v_leg.listing_id for update;
  if v_bead is null then raise exception 'listing_carries_no_physical_watch_bead'; end if;

  select coalesce(max(decision_generation), 0) into v_gen
    from public.physical_watch_resolution_decisions;

  if p_event_type = 'TRANSFERRED' then
    /* AUTHORIZATION. A recipient may confirm their own receipt; a founder
       may assert on available evidence. A SENDER MAY NOT — "I posted it" is
       a claim about a parcel, not knowledge that the object arrived. */
    if p_provenance_class = 'party_confirmed_recipient' then
      if p_actor_user_id <> v_leg.to_user_id then
        raise exception 'only_the_recipient_may_confirm_receipt'; end if;
    elsif p_provenance_class = 'founder_asserted' then
      if p_actor_user_id <> c_founder then
        raise exception 'founder_authorization_required'; end if;
    else
      raise exception 'unsupported_provenance_class';
    end if;

    if exists (select 1 from public.physical_watch_live_transfers t
               where t.trade_deal_leg_id = v_leg.id) then
      raise exception 'leg_already_has_live_transfer'; end if;
    if p_supersedes_event_id is not null then
      raise exception 'a_transfer_does_not_supersede'; end if;

    insert into public.physical_watch_transfer_events (
      id, trade_deal_leg_id, trade_deal_id, physical_watch_id,
      from_user_id, to_user_id, occurred_at, asserted_by_user_id,
      provenance_class, event_type, decision_generation, idempotency_key
    ) values (
      v_id, v_leg.id, v_deal.id, v_bead,
      v_leg.from_user_id, v_leg.to_user_id, p_occurred_at, p_actor_user_id,
      p_provenance_class, 'TRANSFERRED', v_gen, p_idempotency_key);

  elsif p_event_type = 'TRANSFER_RETRACTED' then
    /* Retraction says the earlier assertion was MISTAKEN: the transfer did
       not happen. It does not mean the watch came back; that would be
       another real TRANSFERRED with the direction reversed. */
    if p_supersedes_event_id is null then raise exception 'retraction_must_supersede'; end if;

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

    if p_actor_user_id <> c_founder and p_actor_user_id <> v_leg.to_user_id then
      raise exception 'not_authorized_to_retract'; end if;

    insert into public.physical_watch_transfer_events (
      id, trade_deal_leg_id, trade_deal_id, physical_watch_id,
      from_user_id, to_user_id, occurred_at, asserted_by_user_id,
      provenance_class, event_type, decision_generation,
      supersedes_event_id, idempotency_key
    ) values (
      v_id, v_leg.id, v_deal.id, v_bead,
      v_leg.from_user_id, v_leg.to_user_id, p_occurred_at, p_actor_user_id,
      p_provenance_class, 'TRANSFER_RETRACTED', v_gen,
      p_supersedes_event_id, p_idempotency_key);
  else
    raise exception 'unsupported_event_type';
  end if;

  -- Event, leg cache and parent cache commit together or not at all.
  perform public.recompute_trade_transfer_status(v_deal.id);

  return jsonb_build_object(
    'event_id', v_id,
    'event_type', p_event_type,
    'physical_watch_id', v_bead,
    'decision_generation', v_gen,
    'leg_status', (select leg_status from public.trade_deal_legs where id = v_leg.id),
    'deal_status', (select status from public.trade_deals where id = v_deal.id),
    'idempotent_replay', false);
end $fn$;

revoke all on function public.recompute_trade_transfer_status(uuid) from public, anon, authenticated;
revoke all on function public.record_physical_watch_transfer_event(
  uuid, public.physical_watch_transfer_event_type, uuid,
  public.physical_watch_transfer_provenance, timestamptz, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_physical_watch_transfer_event(
  uuid, public.physical_watch_transfer_event_type, uuid,
  public.physical_watch_transfer_provenance, timestamptz, uuid, text) to service_role;
alter function public.record_physical_watch_transfer_event(
  uuid, public.physical_watch_transfer_event_type, uuid,
  public.physical_watch_transfer_provenance, timestamptz, uuid, text) owner to postgres;
alter function public.recompute_trade_transfer_status(uuid) owner to postgres;

commit;
