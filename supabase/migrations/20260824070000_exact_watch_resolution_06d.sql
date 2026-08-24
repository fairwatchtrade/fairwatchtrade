-- ════════════════════════════════════════════════════════════════════════
-- EXACT-WATCH RESOLUTION — what FairWatchTrade currently concludes
-- supabase/migrations/20260824070000_exact_watch_resolution_06d.sql
--
-- THE MISCONCEPTION THIS MIGRATION EXISTS TO KILL:
--
--   The decision log is truth about what FWT CONCLUDED. A resolved identity
--   is only a durable ADDRESS for one such conclusion. Neither may rewrite
--   the original physical-watch beads.
--
-- 06B minted one immutable bead per listing. Those beads are permanent
-- historical anchors: a later belief about identity must never delete one,
-- move 06C observations off one, or rewrite listings.physical_watch_id.
-- This round adds a layer ABOVE them that can say "we currently believe
-- these two beads are the same object" — and can say the opposite, and can
-- withdraw either statement — without touching what came before.
--
-- ── WHY PAIRWISE, APPEND-ONLY ──────────────────────────────────────────
-- Identity beliefs change. Recording them as edges between immutable beads
-- means a change is a new row, never an edit. The graph at any generation
-- is reconstructible; nothing is lost when we turn out to be wrong.
--
-- ── THE THREE OUTCOMES, AND WHY RETRACTED IS NOT NON-MATCH ─────────────
--   CONFIRMED_SAME_WATCH  these beads are one object
--   EXPLICIT_NON_MATCH    these beads are NOT one object
--   RETRACTED             we withdraw what we previously said; we now
--                         assert NEITHER
--
-- UNRESOLVED is not an outcome. It is the ABSENCE of an effective
-- substantive decision. A RETRACTED row is durable and sits as the chain
-- head, while the pair's effective state is unresolved — so:
--
--   CHAIN HEAD ≠ EFFECTIVE IDENTITY EDGE
--
-- That distinction is the single most misreadable thing in this schema.
-- The head is the latest EVENT. The effective edge is what we currently
-- BELIEVE, and a retraction head means we believe nothing about that pair.
--
-- ── WHY THERE IS NO is_current COLUMN ──────────────────────────────────
-- Deliberately absent. A flag on a historical row is a thing that drifts
-- from the log it is supposed to summarize, and flipping it would be an
-- edit to history. The chain head is DERIVED: the row nothing supersedes.
--
-- ── CONFLICT IS DERIVED, NEVER STORED ──────────────────────────────────
-- A = B, B = C, A ≠ C is a contradiction. It is computed from the full
-- closure after every change — not from the newly written pair alone,
-- because a non-match can become a contradiction the moment two previously
-- separate components merge somewhere else entirely.
--
-- Nothing here resolves a contradiction by discarding an edge. Every row is
-- preserved, no current identity is served for that component, and only a
-- founder retracting a specific decision can clear it.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · Vocabulary ──────────────────────────────────────────────────────
-- PROBABLE_LINK is deliberately absent. Candidates are advisory and
-- recomputable; storing a maybe as durable identity truth is how a
-- suggestion quietly becomes a fact.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'watch_resolution_outcome') then
    create type public.watch_resolution_outcome as enum (
      'CONFIRMED_SAME_WATCH',
      'EXPLICIT_NON_MATCH',
      'RETRACTED'
    );
  end if;
end $$;

-- ── 2 · The committed total order ───────────────────────────────────────
-- A generation identifies ONE committed, totally ordered resolution state.
-- A timestamp, a UUID sort, or a row count would not: none of them tells
-- you which decisions were committed together, and none survives clock
-- skew or concurrent writers. The adjudication writer takes an advisory
-- lock, so generation N genuinely means "replay every decision up to N and
-- you have the graph that produced N".
create sequence if not exists public.watch_resolution_generation_seq as bigint start 1;

-- ── 3 · The decision log — identity truth ───────────────────────────────
create table if not exists public.physical_watch_resolution_decisions (
  id                       uuid primary key default gen_random_uuid(),
  decision_generation      bigint not null,

  -- Canonical unordered pair. A/B and B/A are ONE pair with ONE history,
  -- and that is enforced below rather than left to caller discipline.
  left_physical_watch_id   uuid not null references public.physical_watches(id) on delete restrict,
  right_physical_watch_id  uuid not null references public.physical_watches(id) on delete restrict,

  outcome                  public.watch_resolution_outcome not null,

  -- What the founder relied on. Identifier-observation ids where identifier
  -- evidence supported the decision. No strength score: the evidence and
  -- the actor are the record, not a number that would invite a threshold.
  evidence_observation_ids uuid[] not null default '{}',
  evidence_note            text,

  reviewed_by              uuid references auth.users(id) on delete set null,
  observed_at              timestamptz,
  recorded_at              timestamptz not null default now(),

  chain_root_id            uuid not null,
  supersedes_id            uuid references public.physical_watch_resolution_decisions(id) on delete restrict,
  -- Required for RETRACTED: a withdrawal without a stated reason is
  -- indistinguishable from a mistake.
  reason                   text,

  constraint decision_pair_is_canonical check (left_physical_watch_id < right_physical_watch_id),
  constraint decision_no_self_pair      check (left_physical_watch_id <> right_physical_watch_id),
  constraint decision_retraction_needs_reason
    check (outcome <> 'RETRACTED' or (reason is not null and length(btrim(reason)) > 0)),
  constraint decision_retraction_must_supersede
    check (outcome <> 'RETRACTED' or supersedes_id is not null)
);

comment on table public.physical_watch_resolution_decisions is
  'Append-only pairwise conclusions about whether two immutable physical-watch beads are the same object. THIS IS IDENTITY TRUTH. Resolved identities are only durable addresses for conclusions recorded here. The chain head is the latest EVENT; the effective edge is what is currently believed, and a RETRACTED head means nothing is believed about that pair.';

-- Exactly one root history per canonical pair.
create unique index if not exists decision_one_root_per_pair
  on public.physical_watch_resolution_decisions (left_physical_watch_id, right_physical_watch_id)
  where supersedes_id is null;

-- A row may be superseded at most once. No forks, so "the chain head" is
-- always answerable rather than a set.
create unique index if not exists decision_supersedes_once
  on public.physical_watch_resolution_decisions (supersedes_id)
  where supersedes_id is not null;

create index if not exists decision_pair_idx
  on public.physical_watch_resolution_decisions (left_physical_watch_id, right_physical_watch_id);
create index if not exists decision_generation_idx
  on public.physical_watch_resolution_decisions (decision_generation);

-- A superseder must belong to the same canonical pair and the same chain.
-- Enforced structurally, not only in the writer: a second writer added later
-- must not be able to fork a pair's history by omission.
create or replace function public.physical_watch_decision_chain_guard()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  v_prior public.physical_watch_resolution_decisions;
begin
  if new.supersedes_id is null then
    if new.chain_root_id <> new.id then
      raise exception 'chain_root_must_be_self_for_root_decision';
    end if;
    return new;
  end if;

  select * into v_prior from public.physical_watch_resolution_decisions where id = new.supersedes_id;
  if not found then
    raise exception 'superseded_decision_not_found';
  end if;
  if v_prior.left_physical_watch_id <> new.left_physical_watch_id
     or v_prior.right_physical_watch_id <> new.right_physical_watch_id then
    raise exception 'supersession_crosses_canonical_pair';
  end if;
  if v_prior.chain_root_id <> new.chain_root_id then
    raise exception 'supersession_crosses_chain';
  end if;
  return new;
end
$fn$;

drop trigger if exists physical_watch_decision_chain_guard on public.physical_watch_resolution_decisions;
create trigger physical_watch_decision_chain_guard
  before insert on public.physical_watch_resolution_decisions
  for each row execute function public.physical_watch_decision_chain_guard();

-- History is history. No UPDATE, no DELETE, from anyone including the
-- service role — a governed correction is a new row, always.
create or replace function public.physical_watch_decisions_are_append_only()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  raise exception 'decision_log_is_append_only';
end
$fn$;

drop trigger if exists physical_watch_decisions_immutable on public.physical_watch_resolution_decisions;
create trigger physical_watch_decisions_immutable
  before update or delete on public.physical_watch_resolution_decisions
  for each row execute function public.physical_watch_decisions_are_append_only();

-- ── 4 · Resolved identities — durable addresses, never surviving beads ──
create table if not exists public.resolved_watches (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  minted_generation   bigint not null,
  retired_at          timestamptz,
  retired_generation  bigint,

  -- The materialized component this generation stood for. Bookkeeping for
  -- identity lifecycle, NOT a second attribute store for the watch: no
  -- brand, no reference, no owner, nothing about the object itself. It is
  -- here so the ledger alone is sufficient to rebuild membership.
  member_beads        uuid[] not null,
  -- Membership AND the effective positive edge set that produced it. A
  -- redundant edge added inside an already-connected component leaves
  -- membership identical while the decision topology changed — that is a
  -- new generation and must retire and remint, so the signature carries
  -- both.
  generation_signature text not null,

  constraint resolved_watch_is_multi_bead check (array_length(member_beads, 1) >= 2)
);

comment on table public.resolved_watches is
  'A durable historical address for ONE non-conflicted resolution generation. Never a surviving bead, never a replacement for physical_watch_id. Retired rows are never deleted, reused, or reactivated — a resolution can remain true as an event while ceasing to be valid as current identity authority.';

create index if not exists resolved_watches_current_idx
  on public.resolved_watches (id) where retired_at is null;

-- ── 5 · Derived current membership — a cache, and only a cache ──────────
-- Holds CURRENT memberships only. Fully rebuildable by expanding
-- member_beads of non-retired resolved_watches, which is why truncating it
-- loses nothing.
create table if not exists public.resolved_watch_members (
  physical_watch_id uuid primary key references public.physical_watches(id) on delete restrict,
  resolved_watch_id uuid not null references public.resolved_watches(id) on delete cascade
);

comment on table public.resolved_watch_members is
  'Derived index of current resolved membership. A bead has at most one current membership (primary key). Conflicted components have none. Rebuildable from resolved_watches.member_beads; never authored by hand, never written back onto listings.';

create index if not exists resolved_watch_members_resolved_idx
  on public.resolved_watch_members (resolved_watch_id);

-- The watermark this cache represents. If it disagrees with the decision
-- log, the log wins and the resolver refuses to serve.
create table if not exists public.resolved_watch_membership_state (
  only_row   boolean primary key default true,
  generation bigint not null default 0,
  constraint membership_state_singleton check (only_row)
);
insert into public.resolved_watch_membership_state (only_row, generation)
values (true, 0) on conflict (only_row) do nothing;

-- ── 6 · Derivation ──────────────────────────────────────────────────────

-- The chain head of every pair: the row nothing supersedes.
create or replace view public.physical_watch_decision_heads as
select d.*
from public.physical_watch_resolution_decisions d
where not exists (
  select 1 from public.physical_watch_resolution_decisions s where s.supersedes_id = d.id
);

comment on view public.physical_watch_decision_heads is
  'The latest EVENT per canonical pair. Not the same as the effective belief: a RETRACTED head means the pair is effectively unresolved.';

-- What is currently believed. A retraction head yields no row at all.
create or replace view public.physical_watch_effective_decisions as
select * from public.physical_watch_decision_heads where outcome <> 'RETRACTED';

comment on view public.physical_watch_effective_decisions is
  'Effective current substantive decisions. RETRACTED heads are absent by construction — withdrawal asserts nothing.';

/* Connected components over effective POSITIVE edges only.
   Component id is the smallest bead uuid reachable, so the answer never
   depends on traversal order. Every bead named by any effective decision
   appears, so a non-match endpoint with no positive edges is its own
   singleton component rather than missing. */
create or replace function public.physical_watch_components()
returns table (physical_watch_id uuid, component_id uuid)
language sql
stable
set search_path = ''
as $fn$
  with recursive pos as (
    select left_physical_watch_id as l, right_physical_watch_id as r
    from public.physical_watch_effective_decisions
    where outcome = 'CONFIRMED_SAME_WATCH'
  ),
  nodes as (
    select left_physical_watch_id as id from public.physical_watch_effective_decisions
    union
    select right_physical_watch_id from public.physical_watch_effective_decisions
  ),
  edges as (
    select l as a, r as b from pos
    union all
    select r as a, l as b from pos
  ),
  walk as (
    select n.id as node, n.id as reached from nodes n
    union
    select w.node, e.b from walk w join edges e on e.a = w.reached
  )
  -- min(uuid) does not exist in Postgres; the canonical text form orders
  -- deterministically, which is all the component label needs. Same pattern
  -- the Vault identity-constraint migration uses.
  select node, min(reached::text)::uuid from walk group by node
$fn$;

/* A component is conflicted when both endpoints of an effective non-match
   land inside it. Evaluated over the FULL closure — the contradiction may
   involve a pair nobody just touched. */
create or replace function public.physical_watch_conflicted_components()
returns table (component_id uuid)
language sql
stable
set search_path = ''
as $fn$
  select distinct cl.component_id
  from public.physical_watch_effective_decisions nm
  join public.physical_watch_components() cl on cl.physical_watch_id = nm.left_physical_watch_id
  join public.physical_watch_components() cr on cr.physical_watch_id = nm.right_physical_watch_id
  where nm.outcome = 'EXPLICIT_NON_MATCH'
    and cl.component_id = cr.component_id
$fn$;

/* The components that SHOULD currently hold a resolved identity, with the
   signature that decides whether an existing one still stands. */
create or replace function public.physical_watch_resolvable_components()
returns table (component_id uuid, member_beads uuid[], generation_signature text)
language sql
stable
set search_path = ''
as $fn$
  with comp as (select * from public.physical_watch_components()),
  conflicted as (select * from public.physical_watch_conflicted_components()),
  eligible as (
    select c.component_id, array_agg(c.physical_watch_id order by c.physical_watch_id) as beads
    from comp c
    where c.component_id not in (select component_id from conflicted)
    group by c.component_id
    having count(*) >= 2
  ),
  edges as (
    select cl.component_id,
           string_agg(d.left_physical_watch_id::text || '>' || d.right_physical_watch_id::text, ','
                      order by d.left_physical_watch_id, d.right_physical_watch_id) as edge_sig
    from public.physical_watch_effective_decisions d
    join comp cl on cl.physical_watch_id = d.left_physical_watch_id
    where d.outcome = 'CONFIRMED_SAME_WATCH'
    group by cl.component_id
  )
  select e.component_id,
         e.beads,
         array_to_string(e.beads, ',') || '|' || coalesce(x.edge_sig, '')
  from eligible e
  left join edges x on x.component_id = e.component_id
$fn$;

-- ── 7 · Cache rebuild — pure, lifecycle-free ───────────────────────────
-- Truncates and re-expands from the durable ledger. Mints nothing, retires
-- nothing: proving the cache is disposable is the whole point of it being
-- allowed to exist.
create or replace function public.rebuild_resolved_watch_membership()
returns bigint
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_gen bigint;
begin
  delete from public.resolved_watch_members;
  insert into public.resolved_watch_members (physical_watch_id, resolved_watch_id)
  select bead, rw.id
  from public.resolved_watches rw, unnest(rw.member_beads) as bead
  where rw.retired_at is null;

  select coalesce(max(decision_generation), 0) into v_gen
  from public.physical_watch_resolution_decisions;

  update public.resolved_watch_membership_state set generation = v_gen where only_row;
  return v_gen;
end
$fn$;

-- ── 8 · Lifecycle reconciliation ────────────────────────────────────────
-- Retire every current resolved identity whose generation signature no
-- longer matches reality, then mint one for every eligible component that
-- lacks one. Conflict onset therefore retires without minting, and conflict
-- clearance mints a FRESH id — a retired address is never reactivated even
-- if the identical bead set returns.
create or replace function public.reconcile_resolved_watches(p_generation bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  update public.resolved_watches rw
     set retired_at = now(), retired_generation = p_generation
   where rw.retired_at is null
     and rw.generation_signature not in (
       select generation_signature from public.physical_watch_resolvable_components()
     );

  insert into public.resolved_watches (minted_generation, member_beads, generation_signature)
  select p_generation, rc.member_beads, rc.generation_signature
  from public.physical_watch_resolvable_components() rc
  where rc.generation_signature not in (
    select generation_signature from public.resolved_watches where retired_at is null
  );

  perform public.rebuild_resolved_watch_membership();
end
$fn$;

-- ── 9 · The one governed write door ─────────────────────────────────────
create or replace function public.adjudicate_physical_watch_pair(
  p_bead_a         uuid,
  p_bead_b         uuid,
  p_outcome        public.watch_resolution_outcome,
  p_reviewed_by    uuid,
  p_evidence_ids   uuid[],
  p_evidence_note  text,
  p_reason         text,
  p_observed_at    timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_left   uuid;
  v_right  uuid;
  v_head   public.physical_watch_resolution_decisions;
  v_gen    bigint;
  v_id     uuid := gen_random_uuid();
  v_root   uuid;
begin
  if p_bead_a is null or p_bead_b is null or p_bead_a = p_bead_b then
    raise exception 'invalid_pair';
  end if;

  -- Canonicalize BEFORE anything else, so a caller passing B/A operates on
  -- the same single history as one passing A/B.
  v_left  := least(p_bead_a, p_bead_b);
  v_right := greatest(p_bead_a, p_bead_b);

  -- Serialize adjudication. This is what makes the generation counter a
  -- real total order rather than an increasing number: replaying through
  -- generation N reconstructs exactly the graph that produced N.
  perform pg_advisory_xact_lock(hashtext('fwt.watch_resolution'));

  select * into v_head
  from public.physical_watch_decision_heads
  where left_physical_watch_id = v_left and right_physical_watch_id = v_right;

  if p_outcome = 'RETRACTED' then
    if not found then
      raise exception 'nothing_to_retract';
    end if;
    -- Retracting a retraction is meaningless: the pair is already
    -- unresolved, and allowing it would let the log accumulate withdrawals
    -- of withdrawals.
    if v_head.outcome = 'RETRACTED' then
      raise exception 'pair_already_unresolved';
    end if;
  end if;

  if found then
    v_root := v_head.chain_root_id;
  else
    v_root := v_id;
  end if;

  v_gen := nextval('public.watch_resolution_generation_seq');

  insert into public.physical_watch_resolution_decisions (
    id, decision_generation, left_physical_watch_id, right_physical_watch_id,
    outcome, evidence_observation_ids, evidence_note, reviewed_by,
    observed_at, chain_root_id, supersedes_id, reason
  ) values (
    v_id, v_gen, v_left, v_right,
    p_outcome, coalesce(p_evidence_ids, '{}'), p_evidence_note, p_reviewed_by,
    p_observed_at, v_root, v_head.id, p_reason
  );

  -- Decision append and lifecycle refresh are ONE generation. A reader can
  -- never observe a decision whose consequences have not been applied.
  perform public.reconcile_resolved_watches(v_gen);

  return v_id;
end
$fn$;

-- ── 10 · Read-time resolver — fails closed, never serves stale ─────────
create or replace function public.resolve_physical_watch(p_bead uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_committed bigint;
  v_cached    bigint;
  v_component uuid;
  v_members   uuid[];
  v_conflict  boolean;
  v_resolved  uuid;
begin
  select coalesce(max(decision_generation), 0) into v_committed
  from public.physical_watch_resolution_decisions;
  select generation into v_cached from public.resolved_watch_membership_state where only_row;

  -- The decision log wins. A cache row is not evidence that the cache is
  -- current, and serving a resolved id from a stale watermark would be
  -- stating an identity the platform may no longer hold.
  if v_cached is distinct from v_committed then
    return jsonb_build_object(
      'bead', p_bead,
      'state', 'STALE_CACHE',
      'committed_generation', v_committed,
      'cached_generation', v_cached,
      'resolved_watch_id', null,
      'conflicted', null
    );
  end if;

  select c.component_id into v_component
  from public.physical_watch_components() c where c.physical_watch_id = p_bead;

  if v_component is null then
    return jsonb_build_object(
      'bead', p_bead, 'state', 'UNRESOLVED', 'generation', v_committed,
      'members', jsonb_build_array(p_bead), 'resolved_watch_id', null, 'conflicted', false
    );
  end if;

  select array_agg(c.physical_watch_id order by c.physical_watch_id) into v_members
  from public.physical_watch_components() c where c.component_id = v_component;

  v_conflict := exists (
    select 1 from public.physical_watch_conflicted_components() x where x.component_id = v_component
  );

  select rm.resolved_watch_id into v_resolved
  from public.resolved_watch_members rm where rm.physical_watch_id = p_bead;

  return jsonb_build_object(
    'bead', p_bead,
    'state', case when v_conflict then 'CONFLICTED'
                  when v_resolved is not null then 'RESOLVED'
                  else 'UNRESOLVED' end,
    'generation', v_committed,
    'component_id', v_component,
    'members', to_jsonb(v_members),
    'conflicted', v_conflict,
    -- Never served while conflicted, even though the retired address
    -- remains queryable as historical belief.
    'resolved_watch_id', case when v_conflict then null else v_resolved end
  );
end
$fn$;

-- ── 11 · Access: server-only, structurally ─────────────────────────────
alter table public.physical_watch_resolution_decisions enable row level security;
alter table public.resolved_watches                    enable row level security;
alter table public.resolved_watch_members              enable row level security;
alter table public.resolved_watch_membership_state     enable row level security;

revoke all on public.physical_watch_resolution_decisions from anon, authenticated;
revoke all on public.resolved_watches                    from anon, authenticated;
revoke all on public.resolved_watch_members              from anon, authenticated;
revoke all on public.resolved_watch_membership_state     from anon, authenticated;
revoke all on public.physical_watch_decision_heads       from anon, authenticated;
revoke all on public.physical_watch_effective_decisions  from anon, authenticated;

-- Adjudication is founder-only, through the service role. No client role
-- may reach any of it: identity adjudication is not something a browser
-- gets to attempt and be refused — it is something it cannot address.
revoke all on function public.adjudicate_physical_watch_pair(uuid, uuid, public.watch_resolution_outcome, uuid, uuid[], text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.reconcile_resolved_watches(bigint) from public, anon, authenticated;
revoke all on function public.rebuild_resolved_watch_membership() from public, anon, authenticated;
revoke all on function public.resolve_physical_watch(uuid) from public, anon, authenticated;
revoke all on function public.physical_watch_components() from public, anon, authenticated;
revoke all on function public.physical_watch_conflicted_components() from public, anon, authenticated;
revoke all on function public.physical_watch_resolvable_components() from public, anon, authenticated;

grant execute on function public.adjudicate_physical_watch_pair(uuid, uuid, public.watch_resolution_outcome, uuid, uuid[], text, text, timestamptz) to service_role;
grant execute on function public.reconcile_resolved_watches(bigint) to service_role;
grant execute on function public.rebuild_resolved_watch_membership() to service_role;
grant execute on function public.resolve_physical_watch(uuid) to service_role;
grant execute on function public.physical_watch_components() to service_role;
grant execute on function public.physical_watch_conflicted_components() to service_role;
grant execute on function public.physical_watch_resolvable_components() to service_role;

alter function public.adjudicate_physical_watch_pair(uuid, uuid, public.watch_resolution_outcome, uuid, uuid[], text, text, timestamptz) owner to postgres;
alter function public.reconcile_resolved_watches(bigint) owner to postgres;
alter function public.rebuild_resolved_watch_membership() owner to postgres;
alter function public.resolve_physical_watch(uuid) owner to postgres;

-- ── 12 · Candidate generation — advisory, never a merge rule ────────────
-- Candidates are SUGGESTIONS a founder may act on. They are recomputed on
-- demand and never stored: a stored "probable link" is how a maybe quietly
-- becomes a fact, which is why PROBABLE_LINK is absent from the outcome
-- vocabulary entirely.
--
-- Equal tokens are evidence. They are not permission to merge, and nothing
-- in this function writes anything.
--
-- WHAT IS SUPPRESSED, AND WHY EACH ONE MATTERS:
--
--   · a bead internally contradictory WITHIN one comparability domain —
--     two current observation chains for the same identifier type, the same
--     normalization version and the same key version, carrying DIFFERENT
--     tokens. We do not know which is right, and cherry-picking one would
--     be a guess wearing evidence's clothes. Note the domain scoping:
--     different normalization or key versions are NON-COMPARABLE, so
--     differing tokens across them are not a contradiction at all.
--   · a pair already governed by an effective EXPLICIT_NON_MATCH — the
--     founder already answered this question.
--   · a pair already inside one confirmed component — nothing to decide.
--   · a pair whose merge would immediately pull an existing effective
--     non-match INSIDE the merged closure. That is not a new durable
--     outcome; it is fail-closed candidate behaviour. Contradictory
--     decision truth must be shown to the founder deliberately, never
--     hidden behind an ordinary "possible match" suggestion.
create or replace function public.physical_watch_identifier_candidates(p_limit integer default 100)
returns table (
  left_physical_watch_id  uuid,
  right_physical_watch_id uuid,
  identifier_type         public.watch_identifier_type,
  normalization_version   integer,
  token_key_version       integer,
  left_observation_id     uuid,
  right_observation_id    uuid,
  left_source_class       public.identifier_source_class,
  right_source_class      public.identifier_source_class
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with current_obs as (
    select o.* from public.physical_watch_identifier_observations o
    where o.is_current
  ),
  -- A domain is (bead, identifier_type, normalization_version, key_version).
  contradictory as (
    select physical_watch_id, identifier_type, normalization_version, token_key_version
    from current_obs
    group by 1,2,3,4
    having count(distinct equality_token) > 1
  ),
  usable as (
    select o.* from current_obs o
    where not exists (
      select 1 from contradictory c
      where c.physical_watch_id = o.physical_watch_id
        and c.identifier_type = o.identifier_type
        and c.normalization_version = o.normalization_version
        and c.token_key_version = o.token_key_version
    )
  ),
  -- Comparability is exact: same type, same normalization version, same key
  -- version, same token. Never across any of them.
  raw_pairs as (
    select distinct
      least(a.physical_watch_id, b.physical_watch_id)    as l,
      greatest(a.physical_watch_id, b.physical_watch_id) as r,
      a.identifier_type, a.normalization_version, a.token_key_version,
      case when a.physical_watch_id < b.physical_watch_id then a.id else b.id end as l_obs,
      case when a.physical_watch_id < b.physical_watch_id then b.id else a.id end as r_obs,
      case when a.physical_watch_id < b.physical_watch_id then a.source_class else b.source_class end as l_src,
      case when a.physical_watch_id < b.physical_watch_id then b.source_class else a.source_class end as r_src
    from usable a
    join usable b
      on b.identifier_type       = a.identifier_type
     and b.normalization_version = a.normalization_version
     and b.token_key_version     = a.token_key_version
     and b.equality_token        = a.equality_token
     and b.physical_watch_id    <> a.physical_watch_id
  ),
  comp as (select * from public.physical_watch_components()),
  eff as (select * from public.physical_watch_effective_decisions)
  select p.l, p.r, p.identifier_type, p.normalization_version, p.token_key_version,
         p.l_obs, p.r_obs, p.l_src, p.r_src
  from raw_pairs p
  where
    -- already answered
    not exists (
      select 1 from eff d
      where d.outcome = 'EXPLICIT_NON_MATCH'
        and d.left_physical_watch_id = p.l and d.right_physical_watch_id = p.r
    )
    -- already the same object
    and coalesce((select component_id from comp where physical_watch_id = p.l), p.l)
        is distinct from
        coalesce((select component_id from comp where physical_watch_id = p.r), p.r)
    -- merging these would swallow an existing non-match
    and not exists (
      select 1 from eff nm
      where nm.outcome = 'EXPLICIT_NON_MATCH'
        and (
          (coalesce((select component_id from comp where physical_watch_id = nm.left_physical_watch_id), nm.left_physical_watch_id)
             = coalesce((select component_id from comp where physical_watch_id = p.l), p.l)
           and coalesce((select component_id from comp where physical_watch_id = nm.right_physical_watch_id), nm.right_physical_watch_id)
             = coalesce((select component_id from comp where physical_watch_id = p.r), p.r))
          or
          (coalesce((select component_id from comp where physical_watch_id = nm.left_physical_watch_id), nm.left_physical_watch_id)
             = coalesce((select component_id from comp where physical_watch_id = p.r), p.r)
           and coalesce((select component_id from comp where physical_watch_id = nm.right_physical_watch_id), nm.right_physical_watch_id)
             = coalesce((select component_id from comp where physical_watch_id = p.l), p.l))
        )
    )
  order by p.l, p.r
  limit p_limit
$fn$;

revoke all on function public.physical_watch_identifier_candidates(integer) from public, anon, authenticated;
grant execute on function public.physical_watch_identifier_candidates(integer) to service_role;
alter function public.physical_watch_identifier_candidates(integer) owner to postgres;

commit;
