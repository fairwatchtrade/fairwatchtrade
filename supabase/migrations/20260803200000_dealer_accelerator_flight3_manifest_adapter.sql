-- ════════════════════════════════════════════════════════════════════════
-- DEALER ACCELERATOR FLIGHT 3 — STATIC-MANIFEST ADAPTER (DATABASE LAYER)
-- supabase/migrations/20260803200000_dealer_accelerator_flight3_manifest_adapter.sql
--
-- Built strictly to Dealer_Accelerator_Flight3_Adapter_Contract_2026-08-03_v7.md,
-- then corrected to v8 (Layout, 2026-08-04) after the authorised runtime
-- proof. Every change below is named in the contract's §17 bounded-amendment
-- inventory; nothing else is touched. Production application is NOT
-- authorized by this file's existence.
--
-- Governing correction (Layout, law): every fact needed to recover after a
-- crash must already exist durably before the crash window it is meant to
-- recover from.
--
-- v8 corrections, both from runtime findings this file's v7 text carried:
--   D1 · §9.3 serialization — record_manifest_line locked the manifest
--        CAPTURE row. That row can never be locked by the only role that
--        runs the function, so the function could never execute at all.
--        The governing BATCH row is now the serialization point.
--   F2 · the rejection-reason pairing CHECK is renamed to
--        dealer_accelerator_preflight_rejection_reason_check (50 chars);
--        the v7 name was 76 and Postgres stored it silently truncated.
--        The constraint's logic is unchanged.
--   F4 · the four new tables' `revoke all` now names service_role, as the
--        spine and Flight 2 both do. Without it Supabase's default
--        privileges left the APPLICATION role holding INSERT/UPDATE/
--        DELETE/TRUNCATE on every evidence table. service_role's intended
--        privilege — SELECT, and only SELECT — is re-granted below.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ══ §17 New objects · btree_gist (an extension is schema, not infra) ═════
create extension if not exists btree_gist with schema extensions;

-- ══ §17.1 · batches: BOTH status-coupled CHECKs gain the two new states ══
alter table public.dealer_accelerator_batches
  drop constraint dealer_accelerator_batches_status_check;
alter table public.dealer_accelerator_batches
  add constraint dealer_accelerator_batches_status_check
  check (status in ('queued', 'running', 'completed', 'completed_with_exceptions',
                    'failed', 'cancel_requested', 'cancelled'));

alter table public.dealer_accelerator_batches
  drop constraint dealer_accelerator_batches_status_truth_check;
alter table public.dealer_accelerator_batches
  add constraint dealer_accelerator_batches_status_truth_check
  check (
    (status = 'queued'
      and completed_at is null and failed_at is null and fatal_error_code is null)
    or
    (status = 'running'
      and started_at is not null and completed_at is null
      and failed_at is null and fatal_error_code is null)
    or
    (status in ('completed', 'completed_with_exceptions')
      and started_at is not null and completed_at is not null
      and failed_at is null and fatal_error_code is null)
    or
    (status = 'failed'
      and completed_at is null and failed_at is not null and fatal_error_code is not null)
    or
    -- cancel_requested: started_at may be null (cancelled from queued) or
    -- set (from running); no terminal facts yet.
    (status = 'cancel_requested'
      and completed_at is null and failed_at is null and fatal_error_code is null)
    or
    -- cancelled: identical timestamp truth, and it is terminal.
    (status = 'cancelled'
      and completed_at is null and failed_at is null and fatal_error_code is null)
  );

-- ══ §17.2 · batches: initialization-lease pair (mirrors item lease) ══════
alter table public.dealer_accelerator_batches
  add column initialization_lease_token uuid,
  add column initialization_lease_expires_at timestamptz;
alter table public.dealer_accelerator_batches
  add constraint dealer_accelerator_batches_init_lease_pair_check
  check ((initialization_lease_token is null) = (initialization_lease_expires_at is null));

-- ══ §17.5 + §17.8 · lifecycle event vocabulary ═══════════════════════════
alter table public.dealer_accelerator_lifecycle_events
  drop constraint dealer_accelerator_lifecycle_events_type_check;
alter table public.dealer_accelerator_lifecycle_events
  add constraint dealer_accelerator_lifecycle_events_type_check
  check (
    event_type in (
      'source_authorized', 'source_suspended', 'source_reauthorized', 'source_revoked',
      'source_item_registered',
      'batch_created', 'batch_started', 'batch_completed',
      'batch_completed_with_exceptions', 'batch_failed', 'batch_retry_queued',
      'item_registered', 'observation_recorded', 'item_readied', 'item_blocked',
      'item_unblocked', 'item_lease_claimed', 'item_lease_recovered',
      'item_retry_scheduled', 'item_retry_exhausted',
      'payload_recorded',
      'photograph_declared', 'photograph_retrieved', 'photograph_retrieval_failed',
      'extraction_recorded',
      -- Flight 3 (§17.5):
      'batch_cancel_requested', 'batch_cancelled',
      'batch_initialization_lease_claimed', 'batch_initialization_lease_recovered',
      -- Flight 3 (§17.8, the photograph terminal disposition's event):
      'photograph_retrieval_terminal'
    )
  );

-- ══ §17.7 · photographs: retrieval_terminal joins the monotonic graph ════
-- declared → retrieved | retrieval_failed | retrieval_terminal
-- retrieval_failed → retrieved | retrieval_terminal
-- retrieved and retrieval_terminal are terminal.
alter table public.dealer_accelerator_photographs
  drop constraint dealer_accelerator_photographs_retrieval_state_check;
alter table public.dealer_accelerator_photographs
  add constraint dealer_accelerator_photographs_retrieval_state_check
  check (retrieval_state in ('declared', 'retrieved', 'retrieval_failed', 'retrieval_terminal'));

alter table public.dealer_accelerator_photographs
  drop constraint dealer_accelerator_photographs_retrieval_truth_check;
alter table public.dealer_accelerator_photographs
  add constraint dealer_accelerator_photographs_retrieval_truth_check
  check (
    (retrieval_state = 'retrieved'
      and retrieved_at is not null and content_hash is not null
      and storage_path is not null and authorization_event_id_at_retrieval is not null)
    or
    -- retrieval_terminal keeps ALL FOUR success columns null (§13).
    (retrieval_state <> 'retrieved'
      and retrieved_at is null and content_hash is null
      and storage_path is null and authorization_event_id_at_retrieval is null)
  );

-- ══ §6.1 · dealer_accelerator_manifest_captures (insert-only, 1/batch) ═══
-- Every row is a COMPLETED capture fact: fetched, hashed, archived,
-- verified — unconditionally — or no row exists. No capture_state column.
create table public.dealer_accelerator_manifest_captures (
  id                        uuid        not null default gen_random_uuid(),
  batch_id                  uuid        not null,
  source_id                 uuid        not null,
  dealer_profile_id         uuid        not null,
  adapter_version           text        not null,
  declared_manifest_version text        not null,
  requested_url             text        not null,
  resolved_url              text        not null,
  content_hash              text        not null,
  storage_path              text        not null,
  byte_length               bigint      not null,
  response_content_type     text        not null,
  fetched_at                timestamptz not null,
  verified_at               timestamptz not null,
  authorization_event_id    bigint      not null,
  response_etag             text,
  response_last_modified    text,
  created_at                timestamptz not null default now(),

  constraint dealer_accelerator_manifest_captures_pkey primary key (id),
  constraint dealer_accelerator_manifest_captures_batch_key unique (batch_id),
  constraint dealer_accelerator_manifest_captures_chain_key
    unique (id, batch_id, source_id, dealer_profile_id),
  constraint dealer_accelerator_manifest_captures_batch_fk
    foreign key (batch_id, source_id, dealer_profile_id)
    references public.dealer_accelerator_batches (id, source_id, dealer_profile_id)
    on delete restrict,
  constraint dealer_accelerator_manifest_captures_auth_event_fk
    foreign key (authorization_event_id, source_id)
    references public.dealer_accelerator_lifecycle_events (id, source_id)
    on delete restrict,
  constraint dealer_accelerator_manifest_captures_hash_check
    check (content_hash ~ '^[0-9a-f]{64}$'),
  -- byte_length > 0 is deliberately NOT required: a zero-byte document is
  -- archived and captured, then rejected at preflight (empty_manifest).
  constraint dealer_accelerator_manifest_captures_length_check
    check (byte_length >= 0),
  constraint dealer_accelerator_manifest_captures_nonblank_check
    check (btrim(adapter_version) <> '' and btrim(declared_manifest_version) <> ''
       and btrim(requested_url) <> '' and btrim(resolved_url) <> ''
       and btrim(storage_path) <> '' and btrim(response_content_type) <> '')
);

-- ══ §6.2 · dealer_accelerator_manifest_preflight_results (1/capture) ═════
create table public.dealer_accelerator_manifest_preflight_results (
  id                    uuid        not null default gen_random_uuid(),
  manifest_capture_id   uuid        not null,
  batch_id              uuid        not null,
  source_id             uuid        not null,
  dealer_profile_id     uuid        not null,
  disposition           text        not null,
  rejection_reason      text,
  rejection_line_number integer,
  preflight_version     text        not null,
  completed_at          timestamptz not null,
  created_at            timestamptz not null default now(),

  constraint dealer_accelerator_manifest_preflight_results_pkey primary key (id),
  constraint dealer_accelerator_manifest_preflight_results_capture_key
    unique (manifest_capture_id),
  constraint dealer_accelerator_manifest_preflight_results_capture_fk
    foreign key (manifest_capture_id, batch_id, source_id, dealer_profile_id)
    references public.dealer_accelerator_manifest_captures
      (id, batch_id, source_id, dealer_profile_id)
    on delete restrict,
  constraint dealer_accelerator_manifest_preflight_results_disposition_check
    check (disposition in ('accepted', 'rejected')),
  -- §6.2 / §17.9 — the named rejection-reason pairing CHECK, exact. The
  -- name is deliberately short: PostgreSQL truncates identifiers at 63
  -- characters, and the v7 name (76) was silently stored truncated, so the
  -- contract name and the catalogue name disagreed (runtime finding F2).
  constraint dealer_accelerator_preflight_rejection_reason_check
    check ((disposition = 'rejected') =
           (rejection_reason is not null and rejection_reason <> '')),
  constraint dealer_accelerator_manifest_preflight_results_line_check
    check (rejection_line_number is null or rejection_line_number >= 1),
  constraint dealer_accelerator_manifest_preflight_results_version_check
    check (btrim(preflight_version) <> '')
);

-- ══ §9 · dealer_accelerator_manifest_lines (insert-only) ═════════════════
create table public.dealer_accelerator_manifest_lines (
  id                  uuid        not null default gen_random_uuid(),
  manifest_capture_id uuid        not null,
  batch_id            uuid        not null,
  batch_item_id       uuid        not null,
  source_item_id      uuid        not null,
  source_id           uuid        not null,
  dealer_profile_id   uuid        not null,
  line_number         integer     not null,
  byte_start          bigint      not null,
  byte_end            bigint      not null,
  framing             text        not null,
  declared_item_id    text        not null,
  observation_id      uuid        not null,
  created_at          timestamptz not null default now(),

  constraint dealer_accelerator_manifest_lines_pkey primary key (id),
  constraint dealer_accelerator_manifest_lines_capture_line_key
    unique (manifest_capture_id, line_number),
  constraint dealer_accelerator_manifest_lines_capture_item_key
    unique (manifest_capture_id, declared_item_id),
  constraint dealer_accelerator_manifest_lines_capture_fk
    foreign key (manifest_capture_id, batch_id, source_id, dealer_profile_id)
    references public.dealer_accelerator_manifest_captures
      (id, batch_id, source_id, dealer_profile_id)
    on delete restrict,
  constraint dealer_accelerator_manifest_lines_source_item_fk
    foreign key (source_item_id, source_id, dealer_profile_id)
    references public.dealer_accelerator_source_items (id, source_id, dealer_profile_id)
    on delete restrict,
  -- Fully chain-bound: carrying batch_item_id here exists precisely so this
  -- FK needs ZERO new constraints on the observations table (§9.2).
  constraint dealer_accelerator_manifest_lines_observation_fk
    foreign key (observation_id, batch_item_id, batch_id, source_item_id, source_id, dealer_profile_id)
    references public.dealer_accelerator_observations
      (id, batch_item_id, batch_id, source_item_id, source_id, dealer_profile_id)
    on delete restrict,
  constraint dealer_accelerator_manifest_lines_range_check
    check (byte_start >= 0 and byte_start < byte_end),
  constraint dealer_accelerator_manifest_lines_framing_check
    check (framing in ('lf', 'crlf', 'none')),
  constraint dealer_accelerator_manifest_lines_line_number_check
    check (line_number >= 1),
  -- Database backstop against overlap. Ordering, contiguity and framing
  -- correctness are proven by the recording function (§9.3), not here.
  constraint dealer_accelerator_manifest_lines_no_overlap
    exclude using gist (manifest_capture_id with =,
                        int8range(byte_start, byte_end) with &&)
);

-- ══ §15 · dealer_accelerator_source_origins (chain-bound governance) ═════
-- Hostnames are stored ALREADY-CANONICAL (lowercase, punycoded, no trailing
-- dot); the approval function REFUSES non-canonical input rather than
-- transforming it. IP literals can never enter (CHECKed and re-refused at
-- fetch time by the adapter). Event FKs reference EXISTING source
-- authorization events — origin governance mints no new event vocabulary,
-- which keeps §17's amendment inventory exact.
create table public.dealer_accelerator_source_origins (
  id                     uuid        not null default gen_random_uuid(),
  source_id              uuid        not null,
  dealer_profile_id      uuid        not null,
  purpose                text        not null,
  scheme                 text        not null default 'https',
  hostname               text        not null,
  port                   integer     not null default 443,
  path_prefix            text        not null,
  state                  text        not null default 'approved',
  authorization_event_id bigint      not null,
  revocation_event_id    bigint,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint dealer_accelerator_source_origins_pkey primary key (id),
  constraint dealer_accelerator_source_origins_identity_key
    unique (source_id, purpose, hostname, port, path_prefix),
  constraint dealer_accelerator_source_origins_source_fk
    foreign key (source_id, dealer_profile_id)
    references public.dealer_accelerator_sources (id, dealer_profile_id)
    on delete restrict,
  constraint dealer_accelerator_source_origins_auth_event_fk
    foreign key (authorization_event_id, source_id)
    references public.dealer_accelerator_lifecycle_events (id, source_id)
    on delete restrict,
  constraint dealer_accelerator_source_origins_revocation_event_fk
    foreign key (revocation_event_id, source_id)
    references public.dealer_accelerator_lifecycle_events (id, source_id)
    on delete restrict,
  constraint dealer_accelerator_source_origins_purpose_check
    check (purpose in ('manifest', 'photographs')),
  constraint dealer_accelerator_source_origins_scheme_check
    check (scheme = 'https'),
  constraint dealer_accelerator_source_origins_hostname_check
    check (
      hostname <> '' and hostname = lower(hostname)
      and hostname !~ '\*'            -- no wildcards, ever
      and hostname !~ '\.$'           -- stored form carries no trailing dot
      and hostname ~ '^[a-z0-9.-]+$'  -- punycoded ASCII form only
      and hostname !~ '^[0-9.]+$'     -- no IPv4 literal
      and hostname !~ ':'             -- no IPv6 literal
    ),
  constraint dealer_accelerator_source_origins_port_check
    check (port between 1 and 65535),
  constraint dealer_accelerator_source_origins_path_check
    check (path_prefix ~ '^/'),
  constraint dealer_accelerator_source_origins_state_check
    check (state in ('approved', 'revoked')),
  -- revocation truth: a revoked origin names its revocation event; an
  -- approved one carries none.
  constraint dealer_accelerator_source_origins_revocation_truth_check
    check ((state = 'revoked') = (revocation_event_id is not null))
);

-- ══ RLS + table privileges (spine discipline, applied to 4 new tables) ═══
alter table public.dealer_accelerator_manifest_captures          enable row level security;
alter table public.dealer_accelerator_manifest_preflight_results enable row level security;
alter table public.dealer_accelerator_manifest_lines             enable row level security;
alter table public.dealer_accelerator_source_origins             enable row level security;

-- service_role is named EXPLICITLY, exactly as the spine (lines 526-531) and
-- Flight 2 (lines 379-381) name it. Supabase ships
-- `alter default privileges in schema public grant all on tables to
-- service_role`, so a newly created table arrives with service_role holding
-- INSERT/UPDATE/DELETE/TRUNCATE unless that grant is revoked by name. Leaving
-- it in place would have let the application role — which IS service_role —
-- rewrite and truncate evidence directly, bypassing the writer functions, the
-- geometry law and "a rollback never deletes evidence" (runtime finding F4).
-- The intended service_role privilege is re-granted below: SELECT, nothing more.
revoke all on table public.dealer_accelerator_manifest_captures          from public, anon, authenticated, service_role;
revoke all on table public.dealer_accelerator_manifest_preflight_results from public, anon, authenticated, service_role;
revoke all on table public.dealer_accelerator_manifest_lines             from public, anon, authenticated, service_role;
revoke all on table public.dealer_accelerator_source_origins             from public, anon, authenticated, service_role;

grant select, insert on public.dealer_accelerator_manifest_captures          to dealer_accelerator_writer;
grant select, insert on public.dealer_accelerator_manifest_preflight_results to dealer_accelerator_writer;
grant select, insert on public.dealer_accelerator_manifest_lines             to dealer_accelerator_writer;
grant select, insert, update on public.dealer_accelerator_source_origins    to dealer_accelerator_writer;
grant select on public.dealer_accelerator_manifest_captures,
               public.dealer_accelerator_manifest_preflight_results,
               public.dealer_accelerator_manifest_lines,
               public.dealer_accelerator_source_origins
  to service_role;

create policy dealer_accelerator_manifest_captures_writer_select on public.dealer_accelerator_manifest_captures for select to dealer_accelerator_writer using (true);
create policy dealer_accelerator_manifest_captures_writer_insert on public.dealer_accelerator_manifest_captures for insert to dealer_accelerator_writer with check (true);
create policy dealer_accelerator_manifest_preflight_results_writer_select on public.dealer_accelerator_manifest_preflight_results for select to dealer_accelerator_writer using (true);
create policy dealer_accelerator_manifest_preflight_results_writer_insert on public.dealer_accelerator_manifest_preflight_results for insert to dealer_accelerator_writer with check (true);
create policy dealer_accelerator_manifest_lines_writer_select on public.dealer_accelerator_manifest_lines for select to dealer_accelerator_writer using (true);
create policy dealer_accelerator_manifest_lines_writer_insert on public.dealer_accelerator_manifest_lines for insert to dealer_accelerator_writer with check (true);
create policy dealer_accelerator_source_origins_writer_select on public.dealer_accelerator_source_origins for select to dealer_accelerator_writer using (true);
create policy dealer_accelerator_source_origins_writer_insert on public.dealer_accelerator_source_origins for insert to dealer_accelerator_writer with check (true);
create policy dealer_accelerator_source_origins_writer_update on public.dealer_accelerator_source_origins for update to dealer_accelerator_writer using (true) with check (true);

-- ══ §5.2 · batch initialization lease claim ══════════════════════════════
create or replace function public.dealer_accelerator_claim_batch_initialization_lease(
  p_batch_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer,
  p_actor_kind text,
  p_actor_user_id uuid
)
returns public.dealer_accelerator_batches
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_batch public.dealer_accelerator_batches;
  v_actor text := btrim(coalesce(p_actor_kind, ''));
  v_recovered boolean;
  v_expiry timestamptz;
begin
  if v_actor not in ('system', 'worker') then
    raise exception 'lease_actor_must_be_system_or_worker';
  end if;
  if p_lease_token is null then raise exception 'lease_token_required'; end if;
  if p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 86400 then
    raise exception 'lease_seconds_out_of_range';
  end if;

  select * into v_batch from public.dealer_accelerator_batches
   where id = p_batch_id for update;
  if not found then raise exception 'batch_not_found'; end if;

  -- Claimable ONLY while running (v7 correction 3): queued has no work to
  -- initialize; cancel_requested and all terminals refuse — the same status
  -- gate that stops item leases.
  if v_batch.status <> 'running' then
    raise exception 'batch_not_initialization_eligible:%', v_batch.status;
  end if;

  if v_batch.initialization_lease_token is not null
     and v_batch.initialization_lease_expires_at > clock_timestamp() then
    if v_batch.initialization_lease_token = p_lease_token then
      -- Same-token renewal: return current state, NO event (precision
      -- correction 4 — identical to claim_item_lease's proven early return).
      return v_batch;
    end if;
    raise exception 'batch_initialization_already_leased';
  end if;

  v_recovered := v_batch.initialization_lease_token is not null;
  v_expiry := clock_timestamp() + make_interval(secs => p_lease_seconds);

  update public.dealer_accelerator_batches
     set initialization_lease_token = p_lease_token,
         initialization_lease_expires_at = v_expiry,
         updated_at = now()
   where id = v_batch.id
  returning * into v_batch;

  insert into public.dealer_accelerator_lifecycle_events (
    batch_id, dealer_profile_id, entity_kind, event_type,
    prior_state, resulting_state, actor_kind, actor_user_id, metadata
  ) values (
    v_batch.id, v_batch.dealer_profile_id, 'batch',
    case when v_recovered then 'batch_initialization_lease_recovered'
         else 'batch_initialization_lease_claimed' end,
    v_batch.status, v_batch.status, v_actor, p_actor_user_id,
    jsonb_build_object('lease_expires_at', v_expiry, 'recovered', v_recovered)
  );

  return v_batch;
end
$fn$;

-- ══ §5.2 · cooperative initialization-lease surrender (eventless) ════════
create or replace function public.dealer_accelerator_surrender_batch_initialization_lease(
  p_batch_id uuid,
  p_lease_token uuid,
  p_actor_kind text,
  p_actor_user_id uuid
)
returns public.dealer_accelerator_batches
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_batch public.dealer_accelerator_batches;
  v_actor text := btrim(coalesce(p_actor_kind, ''));
begin
  if v_actor not in ('system', 'worker') then
    raise exception 'lease_actor_must_be_system_or_worker';
  end if;
  if p_lease_token is null then raise exception 'lease_token_required'; end if;

  select * into v_batch from public.dealer_accelerator_batches
   where id = p_batch_id for update;
  if not found then raise exception 'batch_not_found'; end if;

  if v_batch.initialization_lease_token is null then
    raise exception 'batch_initialization_not_leased';
  end if;
  if v_batch.initialization_lease_token <> p_lease_token then
    raise exception 'batch_initialization_lease_token_mismatch';
  end if;

  -- Clears ONLY the lease pair. No status transition, and deliberately NO
  -- event: surrender records nothing beyond relinquishing temporary work
  -- ownership (Layout bounded correction 2).
  update public.dealer_accelerator_batches
     set initialization_lease_token = null,
         initialization_lease_expires_at = null,
         updated_at = now()
   where id = v_batch.id
  returning * into v_batch;

  return v_batch;
end
$fn$;

-- ══ §10 · cooperative item-lease surrender (eventless) ═══════════════════
create or replace function public.dealer_accelerator_surrender_item_lease(
  p_batch_item_id uuid,
  p_lease_token uuid,
  p_actor_kind text,
  p_actor_user_id uuid
)
returns public.dealer_accelerator_batch_items
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_item public.dealer_accelerator_batch_items;
  v_actor text := btrim(coalesce(p_actor_kind, ''));
begin
  if v_actor not in ('system', 'worker') then
    raise exception 'lease_actor_must_be_system_or_worker';
  end if;
  if p_lease_token is null then raise exception 'lease_token_required'; end if;

  -- Same lock ordering as lease claim and cancellation: parent batch row
  -- first, then the item row (§10).
  perform 1 from public.dealer_accelerator_batches b
    join public.dealer_accelerator_batch_items i on i.batch_id = b.id
   where i.id = p_batch_item_id
   for update of b;

  select * into v_item from public.dealer_accelerator_batch_items
   where id = p_batch_item_id for update;
  if not found then raise exception 'item_not_found'; end if;

  if v_item.lease_token is null then
    raise exception 'item_not_leased';
  end if;
  if v_item.lease_token <> p_lease_token then
    raise exception 'item_lease_token_mismatch';
  end if;

  update public.dealer_accelerator_batch_items
     set lease_token = null,
         lease_expires_at = null,
         updated_at = now()
   where id = v_item.id
  returning * into v_item;

  return v_item;
end
$fn$;

-- ══ §17.4 · claim_item_lease: parent-batch running gate ══════════════════
-- Repository truth (twice-verified): the committed function had no batch
-- reference — this closes a never-guarded gap. The batch row is locked
-- FIRST, in the same ordering the cancellation path uses, so the
-- cancellation-vs-lease race is serialized by ordinary row locking.
create or replace function public.dealer_accelerator_claim_item_lease(
  p_item_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer,
  p_actor_kind text,
  p_actor_user_id uuid
)
returns public.dealer_accelerator_batch_items
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_item public.dealer_accelerator_batch_items;
  v_batch_status text;
  v_actor text := btrim(coalesce(p_actor_kind, ''));
  v_recovered boolean;
  v_expiry timestamptz;
begin
  if v_actor not in ('system', 'worker') then
    raise exception 'lease_actor_must_be_system_or_worker';
  end if;
  if p_lease_token is null then raise exception 'lease_token_required'; end if;
  if p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 86400 then
    raise exception 'lease_seconds_out_of_range';
  end if;

  select b.status into v_batch_status
    from public.dealer_accelerator_batches b
    join public.dealer_accelerator_batch_items i on i.batch_id = b.id
   where i.id = p_item_id
   for update of b;
  if not found then raise exception 'item_not_found'; end if;
  if v_batch_status <> 'running' then
    raise exception 'batch_not_running:%', v_batch_status;
  end if;

  select * into v_item from public.dealer_accelerator_batch_items
   where id = p_item_id for update;
  if v_item.status not in ('discovered', 'ready') then
    raise exception 'item_not_lease_eligible:%', v_item.status;
  end if;
  if v_item.next_attempt_at is not null and v_item.next_attempt_at > clock_timestamp() then
    raise exception 'item_retry_not_due';
  end if;

  if v_item.lease_token is not null and v_item.lease_expires_at > clock_timestamp() then
    if v_item.lease_token = p_lease_token then
      return v_item;
    end if;
    raise exception 'item_already_leased';
  end if;

  v_recovered := v_item.lease_token is not null;
  v_expiry := clock_timestamp() + make_interval(secs => p_lease_seconds);

  update public.dealer_accelerator_batch_items
     set lease_token = p_lease_token,
         lease_expires_at = v_expiry,
         updated_at = now()
   where id = v_item.id
  returning * into v_item;

  insert into public.dealer_accelerator_lifecycle_events (
    batch_item_id, dealer_profile_id, entity_kind, event_type,
    prior_state, resulting_state, actor_kind, actor_user_id, metadata
  ) values (
    v_item.id, v_item.dealer_profile_id, 'item',
    case when v_recovered then 'item_lease_recovered' else 'item_lease_claimed' end,
    v_item.status, v_item.status, v_actor, p_actor_user_id,
    jsonb_build_object('lease_expires_at', v_expiry, 'recovered', v_recovered)
  );

  return v_item;
end
$fn$;

-- ══ §17.3 · transition_batch: cancellation edges + quiescence proof ══════
create or replace function public.dealer_accelerator_transition_batch(
  p_batch_id uuid,
  p_next_status text,
  p_fatal_error_code text,
  p_actor_kind text,
  p_actor_user_id uuid,
  p_reason_code text
)
returns public.dealer_accelerator_batches
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_batch public.dealer_accelerator_batches;
  v_prior text;
  v_next text := btrim(coalesce(p_next_status, ''));
  v_fatal text := nullif(btrim(coalesce(p_fatal_error_code, '')), '');
  v_actor text := btrim(coalesce(p_actor_kind, ''));
  v_reason text := nullif(btrim(coalesce(p_reason_code, '')), '');
  v_event_type text;
  v_source_state text;
  v_live_leases int;
begin
  if v_actor not in ('system', 'founder', 'dealer', 'worker') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_actor in ('founder', 'dealer') and p_actor_user_id is null then
    raise exception 'human_actor_required';
  end if;

  select * into v_batch from public.dealer_accelerator_batches
   where id = p_batch_id for update;
  if not found then raise exception 'batch_not_found'; end if;

  v_prior := v_batch.status;
  if not (
    (v_prior = 'queued' and v_next in ('running', 'failed', 'cancel_requested'))
    or
    (v_prior = 'running' and v_next in ('completed', 'completed_with_exceptions',
                                        'failed', 'cancel_requested'))
    or
    (v_prior = 'cancel_requested' and v_next = 'cancelled')
    or
    (v_prior = 'failed' and v_next = 'queued')
  ) then
    raise exception 'invalid_batch_transition:%->%', v_prior, v_next;
  end if;

  if v_next = 'failed' and v_fatal is null then
    raise exception 'fatal_error_code_required';
  elsif v_next <> 'failed' and v_fatal is not null then
    raise exception 'fatal_error_code_not_allowed';
  end if;

  if v_next = 'running' then
    select authorization_state into v_source_state
      from public.dealer_accelerator_sources
     where id = v_batch.source_id for update;
    if v_source_state <> 'authorized' then
      raise exception 'source_not_authorized:%', v_source_state;
    end if;
  end if;

  -- §5.3 terminalization proof: the DATABASE proves quiescence; the worker
  -- is not trusted. Inside this one transaction, with the batch row locked:
  -- the initialization lease must be null or expired, and no item of this
  -- batch may hold an unexpired lease.
  if v_next = 'cancelled' then
    if v_batch.initialization_lease_token is not null
       and v_batch.initialization_lease_expires_at > clock_timestamp() then
      raise exception 'cancellation_pending_active_leases';
    end if;
    select count(*) into v_live_leases
      from public.dealer_accelerator_batch_items
     where batch_id = v_batch.id
       and lease_token is not null
       and lease_expires_at > clock_timestamp();
    if v_live_leases > 0 then
      raise exception 'cancellation_pending_active_leases';
    end if;
  end if;

  v_event_type := case
    when v_next = 'running' then 'batch_started'
    when v_next = 'completed' then 'batch_completed'
    when v_next = 'completed_with_exceptions' then 'batch_completed_with_exceptions'
    when v_next = 'failed' then 'batch_failed'
    when v_next = 'cancel_requested' then 'batch_cancel_requested'
    when v_next = 'cancelled' then 'batch_cancelled'
    else 'batch_retry_queued'
  end;

  update public.dealer_accelerator_batches
     set status = v_next,
         fatal_error_code = case when v_next = 'failed' then v_fatal else null end,
         started_at = case
           when v_next = 'running' then coalesce(started_at, now())
           else started_at
         end,
         completed_at = case
           when v_next in ('completed', 'completed_with_exceptions') then now()
           else null
         end,
         failed_at = case when v_next = 'failed' then now() else null end,
         -- §5.2: terminalization clears the initialization lease, exactly as
         -- transition_item clears item leases on terminal transitions.
         initialization_lease_token = case
           when v_next in ('completed', 'completed_with_exceptions', 'failed', 'cancelled')
           then null else initialization_lease_token
         end,
         initialization_lease_expires_at = case
           when v_next in ('completed', 'completed_with_exceptions', 'failed', 'cancelled')
           then null else initialization_lease_expires_at
         end,
         updated_at = now()
   where id = v_batch.id
  returning * into v_batch;

  insert into public.dealer_accelerator_lifecycle_events (
    batch_id, dealer_profile_id, entity_kind, event_type,
    prior_state, resulting_state, actor_kind, actor_user_id, reason_code
  ) values (
    v_batch.id, v_batch.dealer_profile_id, 'batch', v_event_type,
    v_prior, v_next, v_actor, p_actor_user_id, v_reason
  );

  return v_batch;
end
$fn$;

-- ══ §10 · cancellation-request function (idempotence lives HERE) ═════════
-- queued|running → cancel_requested: ONE event, via transition_batch.
-- already cancel_requested: IDEMPOTENT NO-OP — existing state, no event, no
-- exception. Terminal: truthful REJECTION. Convergence and rejection are
-- different contracts; both are stated (§10 correction 4).
create or replace function public.dealer_accelerator_request_batch_cancellation(
  p_batch_id uuid,
  p_actor_kind text,
  p_actor_user_id uuid,
  p_reason_code text
)
returns public.dealer_accelerator_batches
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_batch public.dealer_accelerator_batches;
begin
  select * into v_batch from public.dealer_accelerator_batches
   where id = p_batch_id for update;
  if not found then raise exception 'batch_not_found'; end if;

  if v_batch.status = 'cancel_requested' then
    return v_batch;                                   -- idempotent no-op
  end if;
  if v_batch.status in ('completed', 'completed_with_exceptions', 'failed', 'cancelled') then
    raise exception 'batch_already_terminal:%', v_batch.status;
  end if;

  -- The batch row lock is already held; transition_batch re-locks the same
  -- row inside this transaction, which is a no-op re-acquire.
  return public.dealer_accelerator_transition_batch(
    p_batch_id, 'cancel_requested', null, p_actor_kind, p_actor_user_id, p_reason_code);
end
$fn$;

-- ══ §7 · manifest capture recorder (idempotent, conflict-lawed) ══════════
-- The proven spine idiom (record_observation / create_or_get_batch) applied
-- to a fourth table: lock the batch row, select the existing capture,
-- compare hashes (conflict on mismatch, return on match), insert only if
-- absent, unique_violation recovery for the simultaneous-insert race.
create or replace function public.dealer_accelerator_record_manifest_capture(
  p_batch_id uuid,
  p_requested_url text,
  p_resolved_url text,
  p_content_hash text,
  p_storage_path text,
  p_byte_length bigint,
  p_response_content_type text,
  p_fetched_at timestamptz,
  p_verified_at timestamptz,
  p_authorization_event_id bigint,
  p_response_etag text,
  p_response_last_modified text,
  p_actor_kind text,
  p_actor_user_id uuid
)
returns public.dealer_accelerator_manifest_captures
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_batch public.dealer_accelerator_batches;
  v_cap public.dealer_accelerator_manifest_captures;
  v_hash text := lower(btrim(coalesce(p_content_hash, '')));
  v_actor text := btrim(coalesce(p_actor_kind, ''));
begin
  if v_actor not in ('system', 'worker') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'content_hash_must_be_sha256_hex';
  end if;
  if p_byte_length is null or p_byte_length < 0 then
    raise exception 'byte_length_invalid';
  end if;
  if p_fetched_at is null or p_verified_at is null or p_verified_at < p_fetched_at then
    raise exception 'capture_timestamps_invalid';
  end if;

  select * into v_batch from public.dealer_accelerator_batches
   where id = p_batch_id for update;
  if not found then raise exception 'batch_not_found'; end if;
  if v_batch.status <> 'running' then
    raise exception 'batch_not_running:%', v_batch.status;
  end if;

  select * into v_cap from public.dealer_accelerator_manifest_captures
   where batch_id = v_batch.id;
  if found then
    if v_cap.content_hash = v_hash then
      return v_cap;                                    -- settled convergence
    end if;
    -- §7: same declared version + DIFFERENT bytes — truthful failure. The
    -- hash comparison is never hidden inside the idempotency key.
    raise exception 'manifest_version_content_conflict';
  end if;

  begin
    insert into public.dealer_accelerator_manifest_captures (
      batch_id, source_id, dealer_profile_id,
      adapter_version, declared_manifest_version,
      requested_url, resolved_url, content_hash, storage_path, byte_length,
      response_content_type, fetched_at, verified_at,
      authorization_event_id, response_etag, response_last_modified
    ) values (
      v_batch.id, v_batch.source_id, v_batch.dealer_profile_id,
      -- §5.1 binding law: declared_manifest_version IS source_snapshot_key,
      -- adapter_version is its own typed column. One value, one column.
      v_batch.adapter_version, v_batch.source_snapshot_key,
      p_requested_url, p_resolved_url, v_hash, p_storage_path, p_byte_length,
      p_response_content_type, p_fetched_at, p_verified_at,
      p_authorization_event_id, p_response_etag, p_response_last_modified
    ) returning * into v_cap;
  exception when unique_violation then
    select * into v_cap from public.dealer_accelerator_manifest_captures
     where batch_id = v_batch.id;
    if v_cap.content_hash <> v_hash then
      raise exception 'manifest_version_content_conflict';
    end if;
  end;

  return v_cap;
end
$fn$;

-- ══ §6.2 · preflight result recorder (one per capture, idempotent) ═══════
create or replace function public.dealer_accelerator_record_manifest_preflight_result(
  p_manifest_capture_id uuid,
  p_disposition text,
  p_rejection_reason text,
  p_rejection_line_number integer,
  p_preflight_version text,
  p_completed_at timestamptz,
  p_actor_kind text,
  p_actor_user_id uuid
)
returns public.dealer_accelerator_manifest_preflight_results
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_cap public.dealer_accelerator_manifest_captures;
  v_res public.dealer_accelerator_manifest_preflight_results;
  v_disp text := btrim(coalesce(p_disposition, ''));
  v_actor text := btrim(coalesce(p_actor_kind, ''));
begin
  if v_actor not in ('system', 'worker') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_disp not in ('accepted', 'rejected') then
    raise exception 'invalid_disposition';
  end if;

  select * into v_cap from public.dealer_accelerator_manifest_captures
   where id = p_manifest_capture_id;
  if not found then raise exception 'manifest_capture_not_found'; end if;

  -- Serialize on the batch row — the spine's one-row discipline.
  perform 1 from public.dealer_accelerator_batches
   where id = v_cap.batch_id for update;

  select * into v_res from public.dealer_accelerator_manifest_preflight_results
   where manifest_capture_id = v_cap.id;
  if found then
    if v_res.disposition = v_disp then
      return v_res;                                    -- settled convergence
    end if;
    raise exception 'preflight_result_conflict:%->%', v_res.disposition, v_disp;
  end if;

  begin
    insert into public.dealer_accelerator_manifest_preflight_results (
      manifest_capture_id, batch_id, source_id, dealer_profile_id,
      disposition, rejection_reason, rejection_line_number,
      preflight_version, completed_at
    ) values (
      v_cap.id, v_cap.batch_id, v_cap.source_id, v_cap.dealer_profile_id,
      v_disp, nullif(btrim(coalesce(p_rejection_reason, '')), ''),
      p_rejection_line_number, p_preflight_version,
      coalesce(p_completed_at, now())
    ) returning * into v_res;
  exception when unique_violation then
    select * into v_res from public.dealer_accelerator_manifest_preflight_results
     where manifest_capture_id = v_cap.id;
    if v_res.disposition <> v_disp then
      raise exception 'preflight_result_conflict:%->%', v_res.disposition, v_disp;
    end if;
  end;

  return v_res;
end
$fn$;

-- ══ §9.3 · manifest line recorder — geometry law, function-enforced ══════
create or replace function public.dealer_accelerator_record_manifest_line(
  p_manifest_capture_id uuid,
  p_line_number integer,
  p_byte_start bigint,
  p_byte_end bigint,
  p_framing text,
  p_declared_item_id text,
  p_observation_id uuid,
  p_actor_kind text,
  p_actor_user_id uuid
)
returns public.dealer_accelerator_manifest_lines
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_cap public.dealer_accelerator_manifest_captures;
  v_prev public.dealer_accelerator_manifest_lines;
  v_line public.dealer_accelerator_manifest_lines;
  v_obs public.dealer_accelerator_observations;
  v_batch_id uuid;
  v_payload_len bigint;
  v_framing text := btrim(coalesce(p_framing, ''));
  v_framing_len int;
  v_actor text := btrim(coalesce(p_actor_kind, ''));
begin
  if v_actor not in ('system', 'worker') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_framing not in ('lf', 'crlf', 'none') then
    raise exception 'invalid_framing';
  end if;
  if p_declared_item_id is null or p_declared_item_id !~ '[^\s]' then
    -- validity is a TEST, never a transformation (§4); the Unicode
    -- White_Space set is enforced adapter-side at preflight, this is the
    -- database's coarse backstop.
    raise exception 'declared_item_id_invalid';
  end if;

  -- ── §9.3 serialization law (v8, replacing v7's capture-row lock) ──────
  -- The GOVERNING BATCH ROW is the serialization point, taken FIRST — the
  -- same row, in the same order, that create_or_get_batch,
  -- transition_batch, request_batch_cancellation, claim_item_lease,
  -- record_manifest_capture and record_manifest_preflight_result all take.
  -- Locking the capture row instead was v7's law and could never execute:
  -- captures and lines are insert-only, the writer holds SELECT + INSERT
  -- and nothing more, and EVERY row-lock strength (FOR UPDATE, FOR NO KEY
  -- UPDATE, FOR SHARE, FOR KEY SHARE) requires UPDATE privilege — so every
  -- call died with permission denied (runtime finding D1). Holding the
  -- batch row is strictly stronger anyway: it serialises every writer for
  -- this batch, which is the whole population that can touch these lines.
  select batch_id into v_batch_id
    from public.dealer_accelerator_manifest_captures
   where id = p_manifest_capture_id;
  if not found then raise exception 'manifest_capture_not_found'; end if;

  perform 1 from public.dealer_accelerator_batches
   where id = v_batch_id for update;

  -- Re-read the capture under the batch lock and validate it. The row is
  -- immutable (insert-only, no update path exists for any role), so this
  -- read is the validated snapshot every later bound is measured against.
  select * into v_cap from public.dealer_accelerator_manifest_captures
   where id = p_manifest_capture_id;
  if not found then raise exception 'manifest_capture_not_found'; end if;
  if v_cap.batch_id is distinct from v_batch_id then
    raise exception 'manifest_capture_not_found';
  end if;

  -- idempotent replay: the same line already recorded → return it
  select * into v_line from public.dealer_accelerator_manifest_lines
   where manifest_capture_id = v_cap.id and line_number = p_line_number;
  if found then
    if v_line.byte_start = p_byte_start and v_line.byte_end = p_byte_end
       and v_line.framing = v_framing and v_line.observation_id = p_observation_id
       and v_line.declared_item_id = p_declared_item_id then
      return v_line;
    end if;
    raise exception 'manifest_line_conflict:%', p_line_number;
  end if;

  -- contiguity from 1: inserting line n requires line n-1 (except n = 1)
  if p_line_number < 1 then raise exception 'line_number_invalid'; end if;
  if p_line_number = 1 then
    if p_byte_start <> 0 then
      raise exception 'first_line_must_start_at_zero';
    end if;
  else
    -- The predecessor is read, not locked. It cannot change under us: the
    -- batch row is held above, so no concurrent recorder for this batch can
    -- be inside this function, and manifest_lines is insert-only — a
    -- recorded line is never updated or deleted by any role. (It also
    -- cannot be locked: see the D1 note above.) The unique
    -- (manifest_capture_id, line_number) and the GiST no-overlap exclusion
    -- remain the database's own backstops beneath this reasoning.
    select * into v_prev from public.dealer_accelerator_manifest_lines
     where manifest_capture_id = v_cap.id and line_number = p_line_number - 1;
    if not found then
      raise exception 'line_out_of_order:%', p_line_number;
    end if;
    v_framing_len := case v_prev.framing when 'lf' then 1 when 'crlf' then 2 else 0 end;
    if p_byte_start <> v_prev.byte_end + v_framing_len then
      raise exception 'line_not_contiguous:%', p_line_number;
    end if;
    if v_prev.framing = 'none' then
      -- none is permitted ONLY for the final line; a successor proves the
      -- predecessor was not final.
      raise exception 'framing_none_not_final:%', p_line_number - 1;
    end if;
  end if;

  v_framing_len := case v_framing when 'lf' then 1 when 'crlf' then 2 else 0 end;
  if v_framing = 'none' and p_byte_end <> v_cap.byte_length then
    raise exception 'framing_none_requires_manifest_end';
  end if;
  if p_byte_end + v_framing_len > v_cap.byte_length then
    -- the cross-table bound Postgres cannot express as a single-table CHECK
    raise exception 'byte_range_exceeds_manifest';
  end if;

  -- the slice IS the payload, provably: the span length must equal the
  -- observation payload's byte length (the payload bytes and their hash are
  -- already bound one-to-one by Flight 2; the adapter verifies the slice
  -- hash against the archived object before calling; Storage re-verifies
  -- forever).
  select o.* into v_obs from public.dealer_accelerator_observations o
   where o.id = p_observation_id;
  if not found then raise exception 'observation_not_found'; end if;
  select octet_length(payload_bytes) into v_payload_len
    from public.dealer_accelerator_observation_payloads
   where observation_id = p_observation_id;
  if not found then raise exception 'observation_payload_not_found'; end if;
  if (p_byte_end - p_byte_start) <> v_payload_len then
    raise exception 'line_span_does_not_match_payload_length';
  end if;

  insert into public.dealer_accelerator_manifest_lines (
    manifest_capture_id, batch_id, batch_item_id, source_item_id,
    source_id, dealer_profile_id, line_number, byte_start, byte_end,
    framing, declared_item_id, observation_id
  ) values (
    v_cap.id, v_cap.batch_id, v_obs.batch_item_id, v_obs.source_item_id,
    v_cap.source_id, v_cap.dealer_profile_id, p_line_number, p_byte_start,
    p_byte_end, v_framing, p_declared_item_id, p_observation_id
  ) returning * into v_line;

  return v_line;
end
$fn$;

-- ══ §15 · origin governance writers (eventless; FKs name source events) ══
create or replace function public.dealer_accelerator_approve_source_origin(
  p_source_id uuid,
  p_purpose text,
  p_hostname text,
  p_port integer,
  p_path_prefix text,
  p_authorization_event_id bigint,
  p_actor_kind text,
  p_actor_user_id uuid
)
returns public.dealer_accelerator_source_origins
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_src record;
  v_row public.dealer_accelerator_source_origins;
  v_actor text := btrim(coalesce(p_actor_kind, ''));
begin
  if v_actor not in ('system', 'founder') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_actor = 'founder' and p_actor_user_id is null then
    raise exception 'human_actor_required';
  end if;

  select * into v_src from public.dealer_accelerator_sources
   where id = p_source_id for update;
  if not found then raise exception 'source_not_found'; end if;
  if v_src.authorization_state <> 'authorized' then
    raise exception 'source_not_authorized:%', v_src.authorization_state;
  end if;

  -- The table CHECKs refuse non-canonical hostnames (uppercase, wildcard,
  -- trailing dot, IP literal, non-ASCII); refusal, never transformation.
  insert into public.dealer_accelerator_source_origins (
    source_id, dealer_profile_id, purpose, hostname, port, path_prefix,
    authorization_event_id
  ) values (
    v_src.id, v_src.dealer_profile_id, p_purpose, p_hostname,
    coalesce(p_port, 443), coalesce(p_path_prefix, '/'),
    p_authorization_event_id
  ) returning * into v_row;

  return v_row;
end
$fn$;

create or replace function public.dealer_accelerator_revoke_source_origin(
  p_origin_id uuid,
  p_revocation_event_id bigint,
  p_actor_kind text,
  p_actor_user_id uuid
)
returns public.dealer_accelerator_source_origins
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row public.dealer_accelerator_source_origins;
  v_actor text := btrim(coalesce(p_actor_kind, ''));
begin
  if v_actor not in ('system', 'founder') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_actor = 'founder' and p_actor_user_id is null then
    raise exception 'human_actor_required';
  end if;

  select * into v_row from public.dealer_accelerator_source_origins
   where id = p_origin_id for update;
  if not found then raise exception 'origin_not_found'; end if;
  if v_row.state = 'revoked' then
    return v_row;                                      -- idempotent
  end if;

  update public.dealer_accelerator_source_origins
     set state = 'revoked',
         revocation_event_id = p_revocation_event_id,
         updated_at = now()
   where id = v_row.id
  returning * into v_row;

  return v_row;
end
$fn$;

-- ══ §13 · photograph terminal disposition (sibling function + event) ═════
create or replace function public.dealer_accelerator_record_photograph_retrieval_terminal(
  p_photograph_id uuid,
  p_reason_code text,
  p_actor_kind text,
  p_actor_user_id uuid
)
returns public.dealer_accelerator_photographs
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_photo public.dealer_accelerator_photographs;
  v_reason text := btrim(coalesce(p_reason_code, ''));
  v_actor text := btrim(coalesce(p_actor_kind, ''));
  v_prior text;
begin
  if v_actor not in ('system', 'founder', 'dealer', 'worker') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_actor in ('founder', 'dealer') and p_actor_user_id is null then
    raise exception 'human_actor_required';
  end if;
  if v_reason = '' then raise exception 'reason_code_required'; end if;

  select * into v_photo from public.dealer_accelerator_photographs
   where id = p_photograph_id for update;
  if not found then raise exception 'photograph_not_found'; end if;

  if v_photo.retrieval_state = 'retrieved' then
    raise exception 'photograph_already_retrieved';
  end if;
  if v_photo.retrieval_state = 'retrieval_terminal' then
    return v_photo;                                    -- idempotent replay
  end if;

  v_prior := v_photo.retrieval_state;

  update public.dealer_accelerator_photographs
     set retrieval_state = 'retrieval_terminal',
         updated_at = now()
   where id = v_photo.id
  returning * into v_photo;

  insert into public.dealer_accelerator_lifecycle_events (
    observation_id, dealer_profile_id, entity_kind, event_type,
    prior_state, resulting_state, actor_kind, actor_user_id, reason_code,
    metadata
  ) values (
    v_photo.observation_id, v_photo.dealer_profile_id, 'observation',
    'photograph_retrieval_terminal', v_prior, 'retrieval_terminal',
    v_actor, p_actor_user_id, v_reason,
    jsonb_build_object('photograph_id', v_photo.id,
                       'sequence_index', v_photo.sequence_index)
  );

  return v_photo;
end
$fn$;

-- ══ Ownership + §15.1 function execution boundary ════════════════════════
-- Every new function: owned by the writer (never revoke the writer's own
-- execute — Bridge-flight law), and EXECUTE explicitly revoked from PUBLIC,
-- anon AND authenticated BY NAME (a bare revoke-from-public is insufficient
-- because Supabase default privileges grant EXECUTE to anon/authenticated
-- directly). service_role keeps the application call path.
do $do$
declare f text;
begin
  foreach f in array array[
    'dealer_accelerator_claim_batch_initialization_lease(uuid,uuid,integer,text,uuid)',
    'dealer_accelerator_surrender_batch_initialization_lease(uuid,uuid,text,uuid)',
    'dealer_accelerator_surrender_item_lease(uuid,uuid,text,uuid)',
    'dealer_accelerator_claim_item_lease(uuid,uuid,integer,text,uuid)',
    'dealer_accelerator_transition_batch(uuid,text,text,text,uuid,text)',
    'dealer_accelerator_request_batch_cancellation(uuid,text,uuid,text)',
    'dealer_accelerator_record_manifest_capture(uuid,text,text,text,text,bigint,text,timestamptz,timestamptz,bigint,text,text,text,uuid)',
    'dealer_accelerator_record_manifest_preflight_result(uuid,text,text,integer,text,timestamptz,text,uuid)',
    'dealer_accelerator_record_manifest_line(uuid,integer,bigint,bigint,text,text,uuid,text,uuid)',
    'dealer_accelerator_approve_source_origin(uuid,text,text,integer,text,bigint,text,uuid)',
    'dealer_accelerator_revoke_source_origin(uuid,bigint,text,uuid)',
    'dealer_accelerator_record_photograph_retrieval_terminal(uuid,text,text,uuid)'
  ] loop
    execute format('alter function public.%s owner to dealer_accelerator_writer', f);
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end
$do$;

-- ══ Postconditions ═══════════════════════════════════════════════════════
do $do$
declare v int;
begin
  select count(*) into v from pg_tables where schemaname = 'public' and tablename in
    ('dealer_accelerator_manifest_captures', 'dealer_accelerator_manifest_preflight_results',
     'dealer_accelerator_manifest_lines', 'dealer_accelerator_source_origins');
  if v <> 4 then raise exception 'POSTCONDITION FAILED: expected 4 new tables, found %', v; end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    cross join lateral (values ('anon'), ('authenticated')) roles(r)
    where n.nspname = 'public'
      and p.proname in ('dealer_accelerator_claim_batch_initialization_lease',
                        'dealer_accelerator_surrender_batch_initialization_lease',
                        'dealer_accelerator_surrender_item_lease',
                        'dealer_accelerator_claim_item_lease',
                        'dealer_accelerator_transition_batch',
                        'dealer_accelerator_request_batch_cancellation',
                        'dealer_accelerator_record_manifest_capture',
                        'dealer_accelerator_record_manifest_preflight_result',
                        'dealer_accelerator_record_manifest_line',
                        'dealer_accelerator_approve_source_origin',
                        'dealer_accelerator_revoke_source_origin',
                        'dealer_accelerator_record_photograph_retrieval_terminal')
      and has_function_privilege(roles.r, p.oid, 'execute')
  ) then
    raise exception 'POSTCONDITION FAILED: anon/authenticated can execute a Flight 3 function';
  end if;

  if not exists (select 1 from pg_extension where extname = 'btree_gist') then
    raise exception 'POSTCONDITION FAILED: btree_gist not installed';
  end if;

  raise notice 'Flight 3 database layer applied — §17 inventory complete.';
end
$do$;

commit;
