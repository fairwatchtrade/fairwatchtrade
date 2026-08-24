-- ════════════════════════════════════════════════════════════════════════
-- SENSITIVE IDENTIFIER CONTRACT — protected evidence about a physical watch
-- supabase/migrations/20260824050000_sensitive_identifier_contract_06c.sql
--
-- THE MISCONCEPTION THIS MIGRATION EXISTS TO KILL:
--
--   A serial number is EVIDENCE ABOUT a physical watch. It is not the
--   watch's identity, and it is not a column on a listing.
--
-- So there is no serial column on listings and none on physical_watches.
-- There is an observation: someone, at some time, from some source, said
-- this object carried this marking. That framing is the whole round.
--
-- ── WHAT THIS ROUND REFUSES TO DO ──────────────────────────────────────
-- It does NOT decide that two records are the same physical watch. Nothing
-- here concludes anything. Two contradictory observations of the same
-- identifier type on the same watch may coexist indefinitely, and matching
-- two watches by equal tokens is a later governed round with its own
-- resolution states. There is no verdict anywhere in this file.
--
-- ── TOKEN-ONLY, AND WHAT THAT COSTS ────────────────────────────────────
-- The equality token is a KEYED one-way construction computed in the
-- application, never here. A plain SHA256 of a serial would be a dictionary
-- lookup waiting to happen — a six-to-ten character alphanumeric space is
-- trivially enumerable — so an unkeyed digest would store the identifiers
-- in all but name.
--
-- No recoverable raw value is stored in V1. The price of that safety is
-- permanent and must be understood before anyone rotates anything:
--
--   A rotated key CANNOT re-tokenize history. There is nothing to
--   re-tokenize from.
--
-- Hence token_key_version on every row, and hence old key material must be
-- RETAINED rather than destroyed — otherwise every observation written
-- under it becomes permanently non-comparable.
--
-- ── WHY THE EQUALITY TOKEN IS NOT UNIQUE ───────────────────────────────
-- Deliberately, and this is the single most important constraint decision
-- in the file. A UNIQUE index on the token would turn the database into a
-- matching engine: it would either refuse the second observation of a
-- genuine duplicate, or imply that two physical watches sharing a token
-- must be one watch. Both are conclusions, and conclusions belong to a
-- later round with evidence behind them. The same token on two different
-- physical watches is something for a human process to evaluate — it is
-- never a database instruction to merge.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · The bounded governed vocabulary ─────────────────────────────────
-- Only markings that identify an OBJECT. Calibre, caseback type, dealer
-- SKU, listing public code and canonical reference are all deliberately
-- absent: they describe a model or a record, not this particular watch.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'watch_identifier_type') then
    create type public.watch_identifier_type as enum (
      'serial_number',
      'case_number',
      'movement_number',
      'certificate_identifier'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'identifier_source_class') then
    -- Source rights are a SEPARATE axis from truth: an internally real
    -- observation may still be unusable publicly because permission is
    -- unresolved. The classes are kept distinct rather than flattened so a
    -- later round can reason about that without re-deriving provenance.
    create type public.identifier_source_class as enum (
      'seller_stated',
      'dealer_attested',
      'auction_catalogue',
      'provider_extracted',
      'founder_entered'
    );
  end if;
end $$;

-- ── 2 · The observation ─────────────────────────────────────────────────
create table if not exists public.physical_watch_identifier_observations (
  id                   uuid primary key default gen_random_uuid(),

  -- Evidence belongs to the OBJECT, never to the listing or the account
  -- that happened to report it. RESTRICT: a physical watch carrying
  -- identifier evidence cannot be casually deleted out from under it.
  physical_watch_id    uuid not null
                       references public.physical_watches(id) on delete restrict,

  identifier_type      public.watch_identifier_type not null,

  -- Keyed, one-way, application-computed. Never a raw value, never
  -- reversible, and never public. A token is sensitive infrastructure.
  equality_token       text not null,
  normalization_version integer not null,
  token_key_version    integer not null,

  -- FUTURE ONLY. A governed later round may enable protected raw storage
  -- with an audited reveal path. The CHECK below makes it impossible to
  -- write in V1, so enabling it is a deliberate, visible act rather than a
  -- drift. Do not drop that constraint casually.
  protected_value      bytea null,

  source_class         public.identifier_source_class not null,
  -- Who the observation came FROM. Detachable: account deletion must
  -- anonymize the submitter without destroying the evidence.
  source_actor_id      uuid null references auth.users(id) on delete set null,
  source_reference     text null,

  -- Two different facts, deliberately separate. observed_at is when
  -- somebody actually looked at the watch; recorded_at is when this
  -- platform learned of it. Historical evidence is recorded long after it
  -- was observed, and collapsing these would silently backdate the record
  -- or forward-date the observation.
  observed_at          timestamptz null,
  recorded_at          timestamptz not null default now(),
  -- Attribution for the write itself. Also detachable.
  recorded_by          uuid null references auth.users(id) on delete set null,

  -- Append-only correction chain, house pattern. A correction never
  -- overwrites: it inserts a new row pointing at what it supersedes.
  supersedes_id        uuid null
                       references public.physical_watch_identifier_observations(id)
                       on delete restrict,
  chain_root_id        uuid not null,

  -- CHAIN-LOCAL MEANING ONLY. is_current means "not superseded within this
  -- chain". It does NOT mean the platform has declared this the one true
  -- identifier for the watch. Several unsuperseded, contradictory
  -- observations of the same type may coexist as evidence.
  is_current           boolean not null default true,

  constraint identifier_observation_protected_value_unused_in_v1
    check (protected_value is null),
  constraint identifier_observation_token_not_blank
    check (length(btrim(equality_token)) > 0)
);

comment on table public.physical_watch_identifier_observations is
  'Protected evidence that a physical watch carried a given marking. Token-only: no recoverable raw identifier is stored. Observations are append-only and may contradict one another; nothing here concludes that two watches are the same watch.';

comment on column public.physical_watch_identifier_observations.equality_token is
  'Keyed one-way token for equality comparison only. Deliberately NOT unique — the same token on two physical watches is evidence for a later governed round to evaluate, never a database instruction to merge. Sensitive: never public, never returned to a browser, never logged.';

comment on column public.physical_watch_identifier_observations.is_current is
  'Not superseded within THIS chain. Not a platform declaration that this is the true identifier.';

comment on column public.physical_watch_identifier_observations.protected_value is
  'Reserved for a future governed round with audited reveal. A CHECK constraint keeps it NULL in V1; enabling it must be a deliberate migration, never a drift.';

-- ── 3 · Indexes ─────────────────────────────────────────────────────────
-- Lookup is scoped by everything that makes two tokens comparable at all.
-- NON-UNIQUE, on purpose — see the header.
create index if not exists identifier_observations_token_lookup_idx
  on public.physical_watch_identifier_observations
     (identifier_type, normalization_version, token_key_version, equality_token);

create index if not exists identifier_observations_watch_idx
  on public.physical_watch_identifier_observations (physical_watch_id);

-- Chain integrity: one current head per correction chain. This constrains a
-- chain to a single tip; it says nothing about how many chains a watch may
-- have, which is deliberately unlimited.
create unique index if not exists identifier_observations_one_current_per_chain
  on public.physical_watch_identifier_observations (chain_root_id)
  where is_current;

-- A superseded observation may only be superseded once — otherwise the
-- chain forks and "current" stops being answerable.
create unique index if not exists identifier_observations_supersedes_once
  on public.physical_watch_identifier_observations (supersedes_id)
  where supersedes_id is not null;

-- ── 4 · Access: structurally denied to everyone but the server ──────────
-- RLS on with ZERO policies. No public, buyer, external-AI, or seller read
-- of any kind: not the raw, not the token, not a masked value, not even an
-- existence bit. service_role bypasses RLS; nothing else gets in.
alter table public.physical_watch_identifier_observations enable row level security;

revoke all on public.physical_watch_identifier_observations from anon, authenticated;

-- ── 5 · The only write door ─────────────────────────────────────────────
-- Append-only supersession, atomic. The token is computed in the
-- application and handed in already keyed; this function never sees a raw
-- identifier, and there is no argument through which one could be passed.
create or replace function public.record_identifier_observation(
  p_physical_watch_id     uuid,
  p_identifier_type       public.watch_identifier_type,
  p_equality_token        text,
  p_normalization_version integer,
  p_token_key_version     integer,
  p_source_class          public.identifier_source_class,
  p_source_actor_id       uuid,
  p_source_reference      text,
  p_observed_at           timestamptz,
  p_supersedes_id         uuid,
  p_recorded_by           uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id     uuid := gen_random_uuid();
  v_root   uuid;
  v_prior  public.physical_watch_identifier_observations;
begin
  if p_supersedes_id is not null then
    select * into v_prior
      from public.physical_watch_identifier_observations
     where id = p_supersedes_id
     for update;

    if not found then
      raise exception 'superseded_observation_not_found';
    end if;
    -- A correction must correct the same evidence about the same object.
    if v_prior.physical_watch_id <> p_physical_watch_id then
      raise exception 'supersession_crosses_physical_watch';
    end if;
    if v_prior.identifier_type <> p_identifier_type then
      raise exception 'supersession_crosses_identifier_type';
    end if;
    if not v_prior.is_current then
      raise exception 'superseded_observation_not_current';
    end if;

    v_root := v_prior.chain_root_id;

    -- The prior row STAYS. Only its currentness changes; its token,
    -- provenance and timestamps are never rewritten.
    update public.physical_watch_identifier_observations
       set is_current = false
     where id = p_supersedes_id;
  else
    v_root := v_id;  -- a new chain roots on itself
  end if;

  insert into public.physical_watch_identifier_observations (
    id, physical_watch_id, identifier_type,
    equality_token, normalization_version, token_key_version,
    source_class, source_actor_id, source_reference,
    observed_at, recorded_by, supersedes_id, chain_root_id, is_current
  ) values (
    v_id, p_physical_watch_id, p_identifier_type,
    p_equality_token, p_normalization_version, p_token_key_version,
    p_source_class, p_source_actor_id, p_source_reference,
    p_observed_at, p_recorded_by, p_supersedes_id, v_root, true
  );

  -- The id only. This function never returns a token or a value.
  return v_id;
end
$fn$;

alter function public.record_identifier_observation(
  uuid, public.watch_identifier_type, text, integer, integer,
  public.identifier_source_class, uuid, text, timestamptz, uuid, uuid
) owner to postgres;

revoke all on function public.record_identifier_observation(
  uuid, public.watch_identifier_type, text, integer, integer,
  public.identifier_source_class, uuid, text, timestamptz, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.record_identifier_observation(
  uuid, public.watch_identifier_type, text, integer, integer,
  public.identifier_source_class, uuid, text, timestamptz, uuid, uuid
) to service_role;

commit;
