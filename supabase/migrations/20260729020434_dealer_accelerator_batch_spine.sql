-- ============================================================================
-- Dealer Accelerator Flight 1 — durable batch spine
--
-- This migration creates only the internal source, stable source-item, batch,
-- processing-item, immutable-observation, lease/retry, and append-only
-- lifecycle rails. It does not acquire inventory, create a listing, write
-- listing media, notify a user, or touch the Vault.
--
-- Controlled function signatures:
--   dealer_accelerator_authorize_source(uuid,text,text,text,text,uuid,text,text,text)
--   dealer_accelerator_transition_source(uuid,text,uuid,text)
--   dealer_accelerator_create_or_get_batch(uuid,text,text,text,integer,text,uuid)
--   dealer_accelerator_register_or_get_item(uuid,text,text,uuid)
--   dealer_accelerator_record_observation(uuid,timestamptz,text,text,text,text,text,text,uuid)
--   dealer_accelerator_transition_batch(uuid,text,text,text,uuid,text)
--   dealer_accelerator_transition_item(uuid,text,text,text,uuid,text)
--   dealer_accelerator_claim_item_lease(uuid,uuid,integer,text,uuid)
--   dealer_accelerator_record_item_retry(uuid,uuid,text,timestamptz,boolean,text,uuid)
--
-- PFC274 = 62 — app/api/evaluate/route.ts is untouched.
-- ============================================================================

-- Dedicated, non-login writer. Application roles never receive this role.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'dealer_accelerator_writer') then
    create role dealer_accelerator_writer
      nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end
$$;

-- `create` is REQUIRED: PostgreSQL demands CREATE on the containing schema for
-- the incoming owner of `alter function ... owner to`. Do not remove it.
grant dealer_accelerator_writer to postgres;
grant usage, create on schema public to dealer_accelerator_writer;

-- Deliberately NO grant on public.profiles or auth.users. Neither is readable by
-- this role and neither needs to be:
--   · public.profiles has RLS bound to auth.uid(); a SECURITY DEFINER function
--     running as this role carries no JWT, so it would see zero rows.
--   · the auth schema is owned by supabase_admin and postgres cannot grant on
--     it — the grant would silently no-op with a WARNING, not an error.
-- Parent existence is enforced structurally instead, by the foreign keys below.
-- Referential-integrity checks run as the table owner and bypass both RLS and
-- column privileges, so they see the real rows. Do not reintroduce in-function
-- existence lookups against either table.

-- --------------------------------------------------------------------------
-- 1. Authorized dealer sources
-- --------------------------------------------------------------------------

create table public.dealer_accelerator_sources (
  id                     uuid        not null default gen_random_uuid(),
  dealer_profile_id      uuid        not null,
  source_type            text        not null,
  source_locator         text        not null,
  source_locator_key     text        not null,
  authorization_basis    text        not null,
  authorization_state    text        not null default 'authorized',
  authorized_by          uuid        not null,
  authorized_at          timestamptz not null default now(),
  suspended_at           timestamptz,
  revoked_at             timestamptz,
  retention_terms        text        not null,
  photograph_use_terms   text        not null,
  adapter_scope          text        not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint dealer_accelerator_sources_pkey
    primary key (id),
  constraint dealer_accelerator_sources_id_dealer_key
    unique (id, dealer_profile_id),
  constraint dealer_accelerator_sources_dealer_fk
    foreign key (dealer_profile_id) references public.profiles (id) on delete restrict,
  constraint dealer_accelerator_sources_authorizer_fk
    foreign key (authorized_by) references auth.users (id) on delete restrict,
  constraint dealer_accelerator_sources_type_check
    check (source_type in ('static_json_manifest', 'static_csv_manifest')),
  constraint dealer_accelerator_sources_state_check
    check (authorization_state in ('authorized', 'suspended', 'revoked')),
  constraint dealer_accelerator_sources_nonblank_check
    check (
      btrim(source_type) <> ''
      and btrim(source_locator) <> ''
      and btrim(source_locator_key) <> ''
      and btrim(authorization_basis) <> ''
      and btrim(retention_terms) <> ''
      and btrim(photograph_use_terms) <> ''
      and btrim(adapter_scope) <> ''
    ),
  constraint dealer_accelerator_sources_state_timestamps_check
    check (
      (authorization_state = 'authorized' and suspended_at is null and revoked_at is null)
      or
      (authorization_state = 'suspended' and suspended_at is not null and revoked_at is null)
      or
      (authorization_state = 'revoked' and suspended_at is null and revoked_at is not null)
    )
);

create unique index dealer_accelerator_sources_one_active_scope
  on public.dealer_accelerator_sources (
    dealer_profile_id,
    source_type,
    source_locator_key,
    adapter_scope
  )
  where authorization_state <> 'revoked';

-- --------------------------------------------------------------------------
-- 2. Stable dealer/source item identities
-- --------------------------------------------------------------------------

create table public.dealer_accelerator_source_items (
  id                 uuid        not null default gen_random_uuid(),
  source_id          uuid        not null,
  dealer_profile_id  uuid        not null,
  source_item_key    text        not null,
  created_at         timestamptz not null default now(),

  constraint dealer_accelerator_source_items_pkey
    primary key (id),
  constraint dealer_accelerator_source_items_id_dealer_key
    unique (id, dealer_profile_id),
  constraint dealer_accelerator_source_items_chain_key
    unique (id, source_id, dealer_profile_id),
  constraint dealer_accelerator_source_items_source_fk
    foreign key (source_id, dealer_profile_id)
    references public.dealer_accelerator_sources (id, dealer_profile_id)
    on delete restrict,
  constraint dealer_accelerator_source_items_source_key_check
    check (btrim(source_item_key) <> ''),
  constraint dealer_accelerator_source_items_identity_key
    unique (source_id, source_item_key)
);

-- --------------------------------------------------------------------------
-- 3. Batches
-- --------------------------------------------------------------------------

create table public.dealer_accelerator_batches (
  id                   uuid        not null default gen_random_uuid(),
  source_id            uuid        not null,
  dealer_profile_id    uuid        not null,
  adapter_version      text        not null,
  source_snapshot_key  text        not null,
  idempotency_key      text        not null,
  batch_limit          integer     not null,
  status               text        not null default 'queued',
  fatal_error_code     text,
  started_at           timestamptz,
  completed_at         timestamptz,
  failed_at            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint dealer_accelerator_batches_pkey
    primary key (id),
  constraint dealer_accelerator_batches_id_dealer_key
    unique (id, dealer_profile_id),
  constraint dealer_accelerator_batches_chain_key
    unique (id, source_id, dealer_profile_id),
  constraint dealer_accelerator_batches_source_fk
    foreign key (source_id, dealer_profile_id)
    references public.dealer_accelerator_sources (id, dealer_profile_id)
    on delete restrict,
  constraint dealer_accelerator_batches_status_check
    check (status in ('queued', 'running', 'completed', 'completed_with_exceptions', 'failed')),
  constraint dealer_accelerator_batches_nonblank_check
    check (
      btrim(adapter_version) <> ''
      and btrim(source_snapshot_key) <> ''
      and btrim(idempotency_key) <> ''
      and (fatal_error_code is null or btrim(fatal_error_code) <> '')
    ),
  constraint dealer_accelerator_batches_limit_check
    check (batch_limit > 0),
  constraint dealer_accelerator_batches_status_truth_check
    check (
      (
        status = 'queued'
        and completed_at is null
        and failed_at is null
        and fatal_error_code is null
      )
      or
      (
        status = 'running'
        and started_at is not null
        and completed_at is null
        and failed_at is null
        and fatal_error_code is null
      )
      or
      (
        status in ('completed', 'completed_with_exceptions')
        and started_at is not null
        and completed_at is not null
        and failed_at is null
        and fatal_error_code is null
      )
      or
      (
        status = 'failed'
        and completed_at is null
        and failed_at is not null
        and fatal_error_code is not null
      )
    ),
  constraint dealer_accelerator_batches_idempotency_key
    unique (source_id, idempotency_key),
  constraint dealer_accelerator_batches_snapshot_key
    unique (source_id, source_snapshot_key, adapter_version)
);

-- --------------------------------------------------------------------------
-- 4. Batch processing items
-- --------------------------------------------------------------------------

create table public.dealer_accelerator_batch_items (
  id                    uuid        not null default gen_random_uuid(),
  batch_id              uuid        not null,
  source_item_id        uuid        not null,
  source_id             uuid        not null,
  dealer_profile_id     uuid        not null,
  status                text        not null default 'discovered',
  blocked_reason_code   text,
  attempt_count         integer     not null default 0,
  lease_token           uuid,
  lease_expires_at      timestamptz,
  next_attempt_at       timestamptz,
  listing_id            uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint dealer_accelerator_batch_items_pkey
    primary key (id),
  constraint dealer_accelerator_batch_items_id_dealer_key
    unique (id, dealer_profile_id),
  constraint dealer_accelerator_batch_items_source_identity_key
    unique (id, source_item_id, source_id, dealer_profile_id),
  constraint dealer_accelerator_batch_items_chain_key
    unique (id, batch_id, source_item_id, source_id, dealer_profile_id),
  constraint dealer_accelerator_batch_items_batch_fk
    foreign key (batch_id, source_id, dealer_profile_id)
    references public.dealer_accelerator_batches (id, source_id, dealer_profile_id)
    on delete restrict,
  constraint dealer_accelerator_batch_items_source_item_fk
    foreign key (source_item_id, source_id, dealer_profile_id)
    references public.dealer_accelerator_source_items (id, source_id, dealer_profile_id)
    on delete restrict,
  constraint dealer_accelerator_batch_items_listing_fk
    foreign key (listing_id) references public.listings (id) on delete restrict,
  constraint dealer_accelerator_batch_items_status_check
    check (status in ('discovered', 'ready', 'blocked', 'draft_created')),
  constraint dealer_accelerator_batch_items_attempt_count_check
    check (attempt_count >= 0),
  constraint dealer_accelerator_batch_items_blocked_truth_check
    check (
      (status = 'blocked' and blocked_reason_code is not null and btrim(blocked_reason_code) <> '')
      or
      (status <> 'blocked' and blocked_reason_code is null)
    ),
  constraint dealer_accelerator_batch_items_listing_truth_check
    check (
      (status = 'draft_created' and listing_id is not null)
      or
      (status <> 'draft_created' and listing_id is null)
    ),
  constraint dealer_accelerator_batch_items_lease_pair_check
    check ((lease_token is null) = (lease_expires_at is null)),
  constraint dealer_accelerator_batch_items_terminal_lease_check
    check (status not in ('blocked', 'draft_created') or lease_token is null),
  constraint dealer_accelerator_batch_items_batch_item_key
    unique (batch_id, source_item_id)
);

create unique index dealer_accelerator_batch_items_one_materialized_source_item
  on public.dealer_accelerator_batch_items (source_item_id)
  where listing_id is not null;

-- --------------------------------------------------------------------------
-- 5. Immutable ingestion observations
-- --------------------------------------------------------------------------

create table public.dealer_accelerator_observations (
  id                 uuid        not null default gen_random_uuid(),
  source_item_id     uuid        not null,
  batch_item_id      uuid        not null,
  batch_id           uuid        not null,
  source_id          uuid        not null,
  dealer_profile_id  uuid        not null,
  observed_at        timestamptz not null,
  adapter_version    text        not null,
  source_version     text        not null,
  observation_hash   text        not null,
  snapshot_identity  text        not null,
  continuity_state   text        not null default 'unassessed',
  created_at         timestamptz not null default now(),

  constraint dealer_accelerator_observations_pkey
    primary key (id),
  constraint dealer_accelerator_observations_id_dealer_key
    unique (id, dealer_profile_id),
  constraint dealer_accelerator_observations_chain_key
    unique (
      id,
      batch_item_id,
      batch_id,
      source_item_id,
      source_id,
      dealer_profile_id
    ),
  constraint dealer_accelerator_observations_batch_item_fk
    foreign key (
      batch_item_id,
      batch_id,
      source_item_id,
      source_id,
      dealer_profile_id
    )
    references public.dealer_accelerator_batch_items (
      id,
      batch_id,
      source_item_id,
      source_id,
      dealer_profile_id
    )
    on delete restrict,
  constraint dealer_accelerator_observations_continuity_check
    check (
      continuity_state in (
        'unassessed',
        'confirmed_same_watch',
        'probable_same_watch',
        'ambiguous',
        'confirmed_different_watch'
      )
    ),
  constraint dealer_accelerator_observations_nonblank_check
    check (
      btrim(adapter_version) <> ''
      and btrim(source_version) <> ''
      and btrim(observation_hash) <> ''
      and btrim(snapshot_identity) <> ''
    ),
  constraint dealer_accelerator_observations_hash_format_check
    check (observation_hash ~ '^[0-9a-f]{64}$'),
  constraint dealer_accelerator_observations_hash_key
    unique (source_item_id, observation_hash),
  constraint dealer_accelerator_observations_snapshot_key
    unique (source_item_id, snapshot_identity)
);

create index dealer_accelerator_observations_source_item_idx
  on public.dealer_accelerator_observations (
    source_item_id,
    observed_at,
    created_at,
    id
  );

-- --------------------------------------------------------------------------
-- 6. Append-only lifecycle events
-- --------------------------------------------------------------------------

create table public.dealer_accelerator_lifecycle_events (
  id                  bigint generated always as identity,
  source_id           uuid,
  source_item_id      uuid,
  batch_id            uuid,
  batch_item_id       uuid,
  observation_id      uuid,
  dealer_profile_id   uuid        not null,
  listing_id          uuid,
  entity_kind         text        not null,
  event_type          text        not null,
  prior_state         text,
  resulting_state     text,
  actor_kind          text        not null,
  actor_user_id       uuid,
  reason_code         text,
  metadata            jsonb       not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),

  constraint dealer_accelerator_lifecycle_events_pkey
    primary key (id),
  constraint dealer_accelerator_lifecycle_events_source_fk
    foreign key (source_id, dealer_profile_id)
    references public.dealer_accelerator_sources (id, dealer_profile_id)
    on delete restrict,
  constraint dealer_accelerator_lifecycle_events_source_item_fk
    foreign key (source_item_id, dealer_profile_id)
    references public.dealer_accelerator_source_items (id, dealer_profile_id)
    on delete restrict,
  constraint dealer_accelerator_lifecycle_events_batch_fk
    foreign key (batch_id, dealer_profile_id)
    references public.dealer_accelerator_batches (id, dealer_profile_id)
    on delete restrict,
  constraint dealer_accelerator_lifecycle_events_item_fk
    foreign key (batch_item_id, dealer_profile_id)
    references public.dealer_accelerator_batch_items (id, dealer_profile_id)
    on delete restrict,
  constraint dealer_accelerator_lifecycle_events_observation_fk
    foreign key (observation_id, dealer_profile_id)
    references public.dealer_accelerator_observations (id, dealer_profile_id)
    on delete restrict,
  constraint dealer_accelerator_lifecycle_events_listing_fk
    foreign key (listing_id) references public.listings (id) on delete restrict,
  constraint dealer_accelerator_lifecycle_events_entity_check
    check (
      (
        entity_kind = 'source'
        and source_id is not null
        and source_item_id is null
        and batch_id is null
        and batch_item_id is null
        and observation_id is null
      )
      or
      (
        entity_kind = 'source_item'
        and source_id is null
        and source_item_id is not null
        and batch_id is null
        and batch_item_id is null
        and observation_id is null
      )
      or
      (
        entity_kind = 'batch'
        and source_id is null
        and source_item_id is null
        and batch_id is not null
        and batch_item_id is null
        and observation_id is null
      )
      or
      (
        entity_kind = 'item'
        and source_id is null
        and source_item_id is null
        and batch_id is null
        and batch_item_id is not null
        and observation_id is null
      )
      or
      (
        entity_kind = 'observation'
        and source_id is null
        and source_item_id is null
        and batch_id is null
        and batch_item_id is null
        and observation_id is not null
      )
    ),
  constraint dealer_accelerator_lifecycle_events_type_check
    check (
      event_type in (
        'source_authorized',
        'source_suspended',
        'source_reauthorized',
        'source_revoked',
        'source_item_registered',
        'batch_created',
        'batch_started',
        'batch_completed',
        'batch_completed_with_exceptions',
        'batch_failed',
        'batch_retry_queued',
        'item_registered',
        'observation_recorded',
        'item_readied',
        'item_blocked',
        'item_unblocked',
        'item_lease_claimed',
        'item_lease_recovered',
        'item_retry_scheduled',
        'item_retry_exhausted'
      )
    ),
  constraint dealer_accelerator_lifecycle_events_actor_check
    check (actor_kind in ('system', 'founder', 'dealer', 'worker')),
  constraint dealer_accelerator_lifecycle_events_human_actor_check
    check (
      actor_kind not in ('founder', 'dealer')
      or actor_user_id is not null
    ),
  constraint dealer_accelerator_lifecycle_events_actor_user_fk
    foreign key (actor_user_id) references auth.users (id) on delete restrict,
  constraint dealer_accelerator_lifecycle_events_reason_check
    check (reason_code is null or btrim(reason_code) <> ''),
  constraint dealer_accelerator_lifecycle_events_metadata_check
    check (jsonb_typeof(metadata) = 'object')
);

create index dealer_accelerator_lifecycle_events_source_idx
  on public.dealer_accelerator_lifecycle_events (source_id, created_at, id)
  where source_id is not null;
create index dealer_accelerator_lifecycle_events_source_item_idx
  on public.dealer_accelerator_lifecycle_events (source_item_id, created_at, id)
  where source_item_id is not null;
create index dealer_accelerator_lifecycle_events_batch_idx
  on public.dealer_accelerator_lifecycle_events (batch_id, created_at, id)
  where batch_id is not null;
create index dealer_accelerator_lifecycle_events_item_idx
  on public.dealer_accelerator_lifecycle_events (batch_item_id, created_at, id)
  where batch_item_id is not null;
create index dealer_accelerator_lifecycle_events_observation_idx
  on public.dealer_accelerator_lifecycle_events (observation_id, created_at, id)
  where observation_id is not null;

-- --------------------------------------------------------------------------
-- 7. RLS and direct privileges
-- --------------------------------------------------------------------------

alter table public.dealer_accelerator_sources enable row level security;
alter table public.dealer_accelerator_source_items enable row level security;
alter table public.dealer_accelerator_batches enable row level security;
alter table public.dealer_accelerator_batch_items enable row level security;
alter table public.dealer_accelerator_observations enable row level security;
alter table public.dealer_accelerator_lifecycle_events enable row level security;

revoke all on public.dealer_accelerator_sources from public, anon, authenticated, service_role;
revoke all on public.dealer_accelerator_source_items from public, anon, authenticated, service_role;
revoke all on public.dealer_accelerator_batches from public, anon, authenticated, service_role;
revoke all on public.dealer_accelerator_batch_items from public, anon, authenticated, service_role;
revoke all on public.dealer_accelerator_observations from public, anon, authenticated, service_role;
revoke all on public.dealer_accelerator_lifecycle_events from public, anon, authenticated, service_role;
revoke all on sequence public.dealer_accelerator_lifecycle_events_id_seq
  from public, anon, authenticated, service_role;

grant select on public.dealer_accelerator_sources to service_role;
grant select on public.dealer_accelerator_source_items to service_role;
grant select on public.dealer_accelerator_batches to service_role;
grant select on public.dealer_accelerator_batch_items to service_role;
grant select on public.dealer_accelerator_observations to service_role;
grant select on public.dealer_accelerator_lifecycle_events to service_role;

grant select, insert, update on public.dealer_accelerator_sources
  to dealer_accelerator_writer;
grant select, insert on public.dealer_accelerator_source_items
  to dealer_accelerator_writer;
grant select, insert, update on public.dealer_accelerator_batches
  to dealer_accelerator_writer;
grant select, insert, update on public.dealer_accelerator_batch_items
  to dealer_accelerator_writer;
grant select, insert on public.dealer_accelerator_observations
  to dealer_accelerator_writer;
grant select, insert on public.dealer_accelerator_lifecycle_events
  to dealer_accelerator_writer;
grant usage, select on sequence public.dealer_accelerator_lifecycle_events_id_seq
  to dealer_accelerator_writer;

create policy dealer_accelerator_sources_writer_select
  on public.dealer_accelerator_sources
  for select to dealer_accelerator_writer using (true);
create policy dealer_accelerator_sources_writer_insert
  on public.dealer_accelerator_sources
  for insert to dealer_accelerator_writer with check (true);
create policy dealer_accelerator_sources_writer_update
  on public.dealer_accelerator_sources
  for update to dealer_accelerator_writer using (true) with check (true);

create policy dealer_accelerator_source_items_writer_select
  on public.dealer_accelerator_source_items
  for select to dealer_accelerator_writer using (true);
create policy dealer_accelerator_source_items_writer_insert
  on public.dealer_accelerator_source_items
  for insert to dealer_accelerator_writer with check (true);

create policy dealer_accelerator_batches_writer_select
  on public.dealer_accelerator_batches
  for select to dealer_accelerator_writer using (true);
create policy dealer_accelerator_batches_writer_insert
  on public.dealer_accelerator_batches
  for insert to dealer_accelerator_writer with check (true);
create policy dealer_accelerator_batches_writer_update
  on public.dealer_accelerator_batches
  for update to dealer_accelerator_writer using (true) with check (true);

create policy dealer_accelerator_batch_items_writer_select
  on public.dealer_accelerator_batch_items
  for select to dealer_accelerator_writer using (true);
create policy dealer_accelerator_batch_items_writer_insert
  on public.dealer_accelerator_batch_items
  for insert to dealer_accelerator_writer with check (true);
create policy dealer_accelerator_batch_items_writer_update
  on public.dealer_accelerator_batch_items
  for update to dealer_accelerator_writer using (true) with check (true);

create policy dealer_accelerator_observations_writer_select
  on public.dealer_accelerator_observations
  for select to dealer_accelerator_writer using (true);
create policy dealer_accelerator_observations_writer_insert
  on public.dealer_accelerator_observations
  for insert to dealer_accelerator_writer with check (true);

create policy dealer_accelerator_lifecycle_events_writer_select
  on public.dealer_accelerator_lifecycle_events
  for select to dealer_accelerator_writer using (true);
create policy dealer_accelerator_lifecycle_events_writer_insert
  on public.dealer_accelerator_lifecycle_events
  for insert to dealer_accelerator_writer with check (true);

-- --------------------------------------------------------------------------
-- 8. Source functions
-- --------------------------------------------------------------------------

create or replace function public.dealer_accelerator_authorize_source(
  p_dealer_profile_id uuid,
  p_source_type text,
  p_source_locator text,
  p_source_locator_key text,
  p_authorization_basis text,
  p_authorized_by uuid,
  p_retention_terms text,
  p_photograph_use_terms text,
  p_adapter_scope text
)
returns public.dealer_accelerator_sources
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_source public.dealer_accelerator_sources;
  v_source_type text := btrim(coalesce(p_source_type, ''));
  v_locator text := btrim(coalesce(p_source_locator, ''));
  v_locator_key text := lower(btrim(coalesce(p_source_locator_key, '')));
  v_basis text := btrim(coalesce(p_authorization_basis, ''));
  v_retention text := btrim(coalesce(p_retention_terms, ''));
  v_photo_terms text := btrim(coalesce(p_photograph_use_terms, ''));
  v_scope text := btrim(coalesce(p_adapter_scope, ''));
begin
  -- Null is rejected here; a non-null id that does not exist is rejected by
  -- dealer_accelerator_sources_dealer_fk / _authorizer_fk on insert below.
  if p_dealer_profile_id is null then
    raise exception 'dealer_profile_not_found';
  end if;
  if p_authorized_by is null then
    raise exception 'authorized_actor_not_found';
  end if;
  if v_source_type not in ('static_json_manifest', 'static_csv_manifest') then
    raise exception 'invalid_source_type';
  end if;
  if v_locator = '' or v_locator_key = '' or v_basis = ''
     or v_retention = '' or v_photo_terms = '' or v_scope = '' then
    raise exception 'source_fields_must_be_nonblank';
  end if;

  select *
    into v_source
    from public.dealer_accelerator_sources
   where dealer_profile_id = p_dealer_profile_id
     and source_type = v_source_type
     and source_locator_key = v_locator_key
     and adapter_scope = v_scope
     and authorization_state <> 'revoked'
   for update;

  if found then
    if v_source.source_locator is distinct from v_locator
       or v_source.authorization_basis is distinct from v_basis
       or v_source.retention_terms is distinct from v_retention
       or v_source.photograph_use_terms is distinct from v_photo_terms then
      raise exception 'active_source_authorization_conflict';
    end if;
    return v_source;
  end if;

  insert into public.dealer_accelerator_sources (
    dealer_profile_id,
    source_type,
    source_locator,
    source_locator_key,
    authorization_basis,
    authorization_state,
    authorized_by,
    retention_terms,
    photograph_use_terms,
    adapter_scope
  ) values (
    p_dealer_profile_id,
    v_source_type,
    v_locator,
    v_locator_key,
    v_basis,
    'authorized',
    p_authorized_by,
    v_retention,
    v_photo_terms,
    v_scope
  )
  returning * into v_source;

  insert into public.dealer_accelerator_lifecycle_events (
    source_id,
    dealer_profile_id,
    entity_kind,
    event_type,
    resulting_state,
    actor_kind,
    actor_user_id
  ) values (
    v_source.id,
    v_source.dealer_profile_id,
    'source',
    'source_authorized',
    'authorized',
    'founder',
    p_authorized_by
  );

  return v_source;
end
$fn$;

create or replace function public.dealer_accelerator_transition_source(
  p_source_id uuid,
  p_next_state text,
  p_actor_user_id uuid,
  p_reason_code text
)
returns public.dealer_accelerator_sources
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_source public.dealer_accelerator_sources;
  v_prior text;
  v_next text := btrim(coalesce(p_next_state, ''));
  v_event_type text;
  v_reason text := nullif(btrim(coalesce(p_reason_code, '')), '');
begin
  -- Existence of a non-null actor is enforced by
  -- dealer_accelerator_lifecycle_events_actor_user_fk when the event is written.
  if p_actor_user_id is null then
    raise exception 'actor_not_found';
  end if;

  select *
    into v_source
    from public.dealer_accelerator_sources
   where id = p_source_id
   for update;
  if not found then raise exception 'source_not_found'; end if;

  v_prior := v_source.authorization_state;
  if not (
    (v_prior = 'authorized' and v_next in ('suspended', 'revoked'))
    or
    (v_prior = 'suspended' and v_next in ('authorized', 'revoked'))
  ) then
    raise exception 'invalid_source_transition:%->%', v_prior, v_next;
  end if;

  v_event_type := case
    when v_next = 'suspended' then 'source_suspended'
    when v_next = 'revoked' then 'source_revoked'
    else 'source_reauthorized'
  end;

  update public.dealer_accelerator_sources
     set authorization_state = v_next,
         authorized_at = case when v_next = 'authorized' then now() else authorized_at end,
         suspended_at = case when v_next = 'suspended' then now() else null end,
         revoked_at = case when v_next = 'revoked' then now() else null end,
         updated_at = now()
   where id = v_source.id
  returning * into v_source;

  insert into public.dealer_accelerator_lifecycle_events (
    source_id,
    dealer_profile_id,
    entity_kind,
    event_type,
    prior_state,
    resulting_state,
    actor_kind,
    actor_user_id,
    reason_code
  ) values (
    v_source.id,
    v_source.dealer_profile_id,
    'source',
    v_event_type,
    v_prior,
    v_next,
    'founder',
    p_actor_user_id,
    v_reason
  );

  return v_source;
end
$fn$;

-- --------------------------------------------------------------------------
-- 9. Batch functions
-- --------------------------------------------------------------------------

create or replace function public.dealer_accelerator_create_or_get_batch(
  p_source_id uuid,
  p_adapter_version text,
  p_source_snapshot_key text,
  p_idempotency_key text,
  p_batch_limit integer,
  p_actor_kind text,
  p_actor_user_id uuid
)
returns public.dealer_accelerator_batches
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_source public.dealer_accelerator_sources;
  v_batch public.dealer_accelerator_batches;
  v_adapter text := btrim(coalesce(p_adapter_version, ''));
  v_snapshot text := btrim(coalesce(p_source_snapshot_key, ''));
  v_idempotency text := btrim(coalesce(p_idempotency_key, ''));
  v_actor text := btrim(coalesce(p_actor_kind, ''));
begin
  if v_actor not in ('system', 'founder', 'dealer', 'worker') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_actor in ('founder', 'dealer') and p_actor_user_id is null then
    raise exception 'human_actor_required';
  end if;
  -- non-null actor existence: enforced by the lifecycle-event actor FK.
  if v_adapter = '' or v_snapshot = '' or v_idempotency = '' then
    raise exception 'batch_keys_must_be_nonblank';
  end if;
  if p_batch_limit is null or p_batch_limit <= 0 then
    raise exception 'batch_limit_must_be_positive';
  end if;

  select *
    into v_source
    from public.dealer_accelerator_sources
   where id = p_source_id
   for update;
  if not found then raise exception 'source_not_found'; end if;
  if v_source.authorization_state <> 'authorized' then
    raise exception 'source_not_authorized:%', v_source.authorization_state;
  end if;

  select *
    into v_batch
    from public.dealer_accelerator_batches
   where source_id = v_source.id
     and idempotency_key = v_idempotency
   for update;
  if found then
    if v_batch.adapter_version is distinct from v_adapter
       or v_batch.source_snapshot_key is distinct from v_snapshot
       or v_batch.batch_limit is distinct from p_batch_limit then
      raise exception 'batch_idempotency_conflict';
    end if;
    return v_batch;
  end if;

  select *
    into v_batch
    from public.dealer_accelerator_batches
   where source_id = v_source.id
     and source_snapshot_key = v_snapshot
     and adapter_version = v_adapter
   for update;
  if found then
    if v_batch.batch_limit is distinct from p_batch_limit then
      raise exception 'batch_snapshot_conflict';
    end if;
    return v_batch;
  end if;

  begin
    insert into public.dealer_accelerator_batches (
      source_id,
      dealer_profile_id,
      adapter_version,
      source_snapshot_key,
      idempotency_key,
      batch_limit
    ) values (
      v_source.id,
      v_source.dealer_profile_id,
      v_adapter,
      v_snapshot,
      v_idempotency,
      p_batch_limit
    )
    returning * into v_batch;
  exception
    when unique_violation then
      select *
        into v_batch
        from public.dealer_accelerator_batches
       where source_id = v_source.id
         and (
           idempotency_key = v_idempotency
           or (source_snapshot_key = v_snapshot and adapter_version = v_adapter)
         )
       order by (idempotency_key = v_idempotency) desc
       limit 1
       for update;
      if not found
         or v_batch.adapter_version is distinct from v_adapter
         or v_batch.source_snapshot_key is distinct from v_snapshot
         or v_batch.batch_limit is distinct from p_batch_limit then
        raise exception 'batch_key_race_conflict';
      end if;
      return v_batch;
  end;

  insert into public.dealer_accelerator_lifecycle_events (
    batch_id,
    dealer_profile_id,
    entity_kind,
    event_type,
    resulting_state,
    actor_kind,
    actor_user_id,
    metadata
  ) values (
    v_batch.id,
    v_batch.dealer_profile_id,
    'batch',
    'batch_created',
    'queued',
    v_actor,
    p_actor_user_id,
    jsonb_build_object(
      'adapter_version', v_batch.adapter_version,
      'source_snapshot_key', v_batch.source_snapshot_key,
      'batch_limit', v_batch.batch_limit
    )
  );

  return v_batch;
end
$fn$;

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
begin
  if v_actor not in ('system', 'founder', 'dealer', 'worker') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_actor in ('founder', 'dealer') and p_actor_user_id is null then
    raise exception 'human_actor_required';
  end if;
  -- non-null actor existence: enforced by the lifecycle-event actor FK.

  select *
    into v_batch
    from public.dealer_accelerator_batches
   where id = p_batch_id
   for update;
  if not found then raise exception 'batch_not_found'; end if;

  v_prior := v_batch.status;
  if not (
    (v_prior = 'queued' and v_next in ('running', 'failed'))
    or
    (v_prior = 'running' and v_next in ('completed', 'completed_with_exceptions', 'failed'))
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
    select authorization_state
      into v_source_state
      from public.dealer_accelerator_sources
     where id = v_batch.source_id
     for update;
    if v_source_state <> 'authorized' then
      raise exception 'source_not_authorized:%', v_source_state;
    end if;
  end if;

  v_event_type := case
    when v_next = 'running' then 'batch_started'
    when v_next = 'completed' then 'batch_completed'
    when v_next = 'completed_with_exceptions' then 'batch_completed_with_exceptions'
    when v_next = 'failed' then 'batch_failed'
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
         updated_at = now()
   where id = v_batch.id
  returning * into v_batch;

  insert into public.dealer_accelerator_lifecycle_events (
    batch_id,
    dealer_profile_id,
    entity_kind,
    event_type,
    prior_state,
    resulting_state,
    actor_kind,
    actor_user_id,
    reason_code,
    metadata
  ) values (
    v_batch.id,
    v_batch.dealer_profile_id,
    'batch',
    v_event_type,
    v_prior,
    v_next,
    v_actor,
    p_actor_user_id,
    coalesce(v_reason, v_fatal),
    case
      when v_next = 'failed' then jsonb_build_object('fatal_error_code', v_fatal)
      else '{}'::jsonb
    end
  );

  return v_batch;
end
$fn$;

-- --------------------------------------------------------------------------
-- 10. Stable-item, observation, and processing-item functions
-- --------------------------------------------------------------------------

create or replace function public.dealer_accelerator_register_or_get_item(
  p_batch_id uuid,
  p_source_item_key text,
  p_actor_kind text,
  p_actor_user_id uuid
)
returns public.dealer_accelerator_batch_items
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_batch public.dealer_accelerator_batches;
  v_source_item public.dealer_accelerator_source_items;
  v_item public.dealer_accelerator_batch_items;
  v_source_item_created boolean := false;
  v_key text := btrim(coalesce(p_source_item_key, ''));
  v_actor text := btrim(coalesce(p_actor_kind, ''));
begin
  if v_actor not in ('system', 'founder', 'dealer', 'worker') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_actor in ('founder', 'dealer') and p_actor_user_id is null then
    raise exception 'human_actor_required';
  end if;
  -- non-null actor existence: enforced by the lifecycle-event actor FK.
  if v_key = '' then raise exception 'source_item_key_required'; end if;

  select *
    into v_batch
    from public.dealer_accelerator_batches
   where id = p_batch_id
   for update;
  if not found then raise exception 'batch_not_found'; end if;
  if v_batch.status <> 'running' then
    raise exception 'batch_not_running:%', v_batch.status;
  end if;

  -- No row lock: this table is append-only (select+insert only), so the writer
  -- holds no UPDATE privilege and `for update` would be denied. The row is
  -- immutable once written, and the insert race below is resolved by
  -- dealer_accelerator_source_items_identity_key plus the unique_violation
  -- recovery, not by locking.
  select *
    into v_source_item
    from public.dealer_accelerator_source_items
   where source_id = v_batch.source_id
     and source_item_key = v_key;

  if not found then
    begin
      insert into public.dealer_accelerator_source_items (
        source_id,
        dealer_profile_id,
        source_item_key
      ) values (
        v_batch.source_id,
        v_batch.dealer_profile_id,
        v_key
      )
      returning * into v_source_item;
      v_source_item_created := true;
    exception
      when unique_violation then
        select *
          into v_source_item
          from public.dealer_accelerator_source_items
         where source_id = v_batch.source_id
           and source_item_key = v_key;
        if not found then
          raise exception 'source_item_key_race_conflict';
        end if;
    end;

  end if;

  if v_source_item_created then
    insert into public.dealer_accelerator_lifecycle_events (
      source_item_id,
      dealer_profile_id,
      entity_kind,
      event_type,
      resulting_state,
      actor_kind,
      actor_user_id,
      metadata
    ) values (
      v_source_item.id,
      v_source_item.dealer_profile_id,
      'source_item',
      'source_item_registered',
      'registered',
      v_actor,
      p_actor_user_id,
      jsonb_build_object('source_item_key', v_source_item.source_item_key)
    );
  end if;

  if v_source_item.dealer_profile_id <> v_batch.dealer_profile_id then
    raise exception 'source_item_parent_mismatch';
  end if;

  select *
    into v_item
    from public.dealer_accelerator_batch_items
   where batch_id = v_batch.id
     and source_item_id = v_source_item.id
   for update;
  if found then
    return v_item;
  end if;

  begin
    insert into public.dealer_accelerator_batch_items (
      batch_id,
      source_item_id,
      source_id,
      dealer_profile_id
    ) values (
      v_batch.id,
      v_source_item.id,
      v_batch.source_id,
      v_batch.dealer_profile_id
    )
    returning * into v_item;
  exception
    when unique_violation then
    select *
      into v_item
      from public.dealer_accelerator_batch_items
     where batch_id = v_batch.id
       and source_item_id = v_source_item.id
     for update;
    if not found then
      raise exception 'batch_item_key_race_conflict';
    end if;
    return v_item;
  end;

  insert into public.dealer_accelerator_lifecycle_events (
    batch_item_id,
    dealer_profile_id,
    entity_kind,
    event_type,
    resulting_state,
    actor_kind,
    actor_user_id,
    metadata
  ) values (
    v_item.id,
    v_item.dealer_profile_id,
    'item',
    'item_registered',
    'discovered',
    v_actor,
    p_actor_user_id,
    jsonb_build_object(
      'source_item_id', v_source_item.id,
      'source_item_key', v_source_item.source_item_key
    )
  );

  return v_item;
end
$fn$;

create or replace function public.dealer_accelerator_record_observation(
  p_batch_item_id uuid,
  p_observed_at timestamptz,
  p_adapter_version text,
  p_source_version text,
  p_observation_hash text,
  p_snapshot_identity text,
  p_continuity_state text,
  p_actor_kind text,
  p_actor_user_id uuid
)
returns public.dealer_accelerator_observations
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_item public.dealer_accelerator_batch_items;
  v_observation public.dealer_accelerator_observations;
  v_batch_status text;
  v_adapter text := btrim(coalesce(p_adapter_version, ''));
  v_source_version text := btrim(coalesce(p_source_version, ''));
  v_hash text := lower(btrim(coalesce(p_observation_hash, '')));
  v_snapshot text := btrim(coalesce(p_snapshot_identity, ''));
  v_continuity text := btrim(coalesce(p_continuity_state, ''));
  v_actor text := btrim(coalesce(p_actor_kind, ''));
begin
  if v_actor not in ('system', 'founder', 'dealer', 'worker') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_actor in ('founder', 'dealer') and p_actor_user_id is null then
    raise exception 'human_actor_required';
  end if;
  -- non-null actor existence: enforced by the lifecycle-event actor FK.
  if p_observed_at is null then raise exception 'observed_at_required'; end if;
  if v_adapter = '' or v_source_version = '' or v_hash = '' or v_snapshot = '' then
    raise exception 'observation_identity_fields_must_be_nonblank';
  end if;
  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'observation_hash_must_be_sha256_hex';
  end if;
  if v_continuity not in (
    'unassessed',
    'confirmed_same_watch',
    'probable_same_watch',
    'ambiguous',
    'confirmed_different_watch'
  ) then
    raise exception 'invalid_continuity_state';
  end if;
  if v_continuity = 'confirmed_same_watch' then
    raise exception 'confirmed_same_watch_requires_governed_evidence';
  end if;

  select *
    into v_item
    from public.dealer_accelerator_batch_items
   where id = p_batch_item_id
   for update;
  if not found then raise exception 'batch_item_not_found'; end if;

  select status
    into v_batch_status
    from public.dealer_accelerator_batches
   where id = v_item.batch_id
   for update;
  if v_batch_status <> 'running' then
    raise exception 'batch_not_running:%', v_batch_status;
  end if;

  -- No row lock: observations are append-only (select+insert only), so the
  -- writer holds no UPDATE privilege and `for update` would be denied. Rows are
  -- immutable; concurrent inserts are resolved by the hash/snapshot unique keys
  -- and the unique_violation recovery below.
  select *
    into v_observation
    from public.dealer_accelerator_observations
   where source_item_id = v_item.source_item_id
     and observation_hash = v_hash;
  if found then
    if v_observation.observed_at is distinct from p_observed_at
       or v_observation.adapter_version is distinct from v_adapter
       or v_observation.source_version is distinct from v_source_version
       or v_observation.snapshot_identity is distinct from v_snapshot
       or v_observation.continuity_state is distinct from v_continuity then
      raise exception 'observation_hash_conflict';
    end if;
    return v_observation;
  end if;

  select *
    into v_observation
    from public.dealer_accelerator_observations
   where source_item_id = v_item.source_item_id
     and snapshot_identity = v_snapshot;
  if found then
    raise exception 'observation_snapshot_conflict';
  end if;

  begin
    insert into public.dealer_accelerator_observations (
      source_item_id,
      batch_item_id,
      batch_id,
      source_id,
      dealer_profile_id,
      observed_at,
      adapter_version,
      source_version,
      observation_hash,
      snapshot_identity,
      continuity_state
    ) values (
      v_item.source_item_id,
      v_item.id,
      v_item.batch_id,
      v_item.source_id,
      v_item.dealer_profile_id,
      p_observed_at,
      v_adapter,
      v_source_version,
      v_hash,
      v_snapshot,
      v_continuity
    )
    returning * into v_observation;
  exception
    when unique_violation then
      select *
        into v_observation
        from public.dealer_accelerator_observations
       where source_item_id = v_item.source_item_id
         and (
           observation_hash = v_hash
           or snapshot_identity = v_snapshot
         )
       order by (observation_hash = v_hash) desc
       limit 1;
      if not found
         or v_observation.observation_hash is distinct from v_hash
         or v_observation.observed_at is distinct from p_observed_at
         or v_observation.adapter_version is distinct from v_adapter
         or v_observation.source_version is distinct from v_source_version
         or v_observation.snapshot_identity is distinct from v_snapshot
         or v_observation.continuity_state is distinct from v_continuity then
        raise exception 'observation_identity_race_conflict';
      end if;
      return v_observation;
  end;

  insert into public.dealer_accelerator_lifecycle_events (
    observation_id,
    dealer_profile_id,
    entity_kind,
    event_type,
    resulting_state,
    actor_kind,
    actor_user_id,
    metadata
  ) values (
    v_observation.id,
    v_observation.dealer_profile_id,
    'observation',
    'observation_recorded',
    v_observation.continuity_state,
    v_actor,
    p_actor_user_id,
    jsonb_build_object(
      'source_item_id', v_observation.source_item_id,
      'batch_item_id', v_observation.batch_item_id,
      'observation_hash', v_observation.observation_hash,
      'snapshot_identity', v_observation.snapshot_identity
    )
  );

  return v_observation;
end
$fn$;

create or replace function public.dealer_accelerator_transition_item(
  p_item_id uuid,
  p_next_status text,
  p_blocked_reason_code text,
  p_actor_kind text,
  p_actor_user_id uuid,
  p_reason_code text
)
returns public.dealer_accelerator_batch_items
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_item public.dealer_accelerator_batch_items;
  v_prior text;
  v_next text := btrim(coalesce(p_next_status, ''));
  v_blocked text := nullif(btrim(coalesce(p_blocked_reason_code, '')), '');
  v_actor text := btrim(coalesce(p_actor_kind, ''));
  v_reason text := nullif(btrim(coalesce(p_reason_code, '')), '');
  v_event_type text;
begin
  if v_actor not in ('system', 'founder', 'dealer', 'worker') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_actor in ('founder', 'dealer') and p_actor_user_id is null then
    raise exception 'human_actor_required';
  end if;
  -- non-null actor existence: enforced by the lifecycle-event actor FK.
  select *
    into v_item
    from public.dealer_accelerator_batch_items
   where id = p_item_id
   for update;
  if not found then raise exception 'item_not_found'; end if;

  v_prior := v_item.status;
  if v_next = 'draft_created' then
    raise exception 'draft_created_requires_materialization_bridge';
  end if;
  if not (
    (v_prior = 'discovered' and v_next in ('ready', 'blocked'))
    or
    (v_prior = 'ready' and v_next = 'blocked')
    or
    (v_prior = 'blocked' and v_next = 'ready')
  ) then
    raise exception 'invalid_item_transition:%->%', v_prior, v_next;
  end if;
  if v_next = 'blocked' and v_blocked is null then
    raise exception 'blocked_reason_required';
  elsif v_next <> 'blocked' and v_blocked is not null then
    raise exception 'blocked_reason_not_allowed';
  end if;

  v_event_type := case
    when v_next = 'blocked' then 'item_blocked'
    when v_prior = 'blocked' then 'item_unblocked'
    else 'item_readied'
  end;

  update public.dealer_accelerator_batch_items
     set status = v_next,
         blocked_reason_code = v_blocked,
         lease_token = null,
         lease_expires_at = null,
         next_attempt_at = null,
         updated_at = now()
   where id = v_item.id
  returning * into v_item;

  insert into public.dealer_accelerator_lifecycle_events (
    batch_item_id,
    dealer_profile_id,
    entity_kind,
    event_type,
    prior_state,
    resulting_state,
    actor_kind,
    actor_user_id,
    reason_code,
    metadata
  ) values (
    v_item.id,
    v_item.dealer_profile_id,
    'item',
    v_event_type,
    v_prior,
    v_next,
    v_actor,
    p_actor_user_id,
    coalesce(v_reason, v_blocked),
    jsonb_build_object('source_item_id', v_item.source_item_id)
  );

  return v_item;
end
$fn$;

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
  v_actor text := btrim(coalesce(p_actor_kind, ''));
  v_recovered boolean;
  v_expiry timestamptz;
begin
  if v_actor not in ('system', 'worker') then
    raise exception 'lease_actor_must_be_system_or_worker';
  end if;
  -- non-null actor existence: enforced by the lifecycle-event actor FK.
  if p_lease_token is null then raise exception 'lease_token_required'; end if;
  if p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 86400 then
    raise exception 'lease_seconds_out_of_range';
  end if;

  select *
    into v_item
    from public.dealer_accelerator_batch_items
   where id = p_item_id
   for update;
  if not found then raise exception 'item_not_found'; end if;
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
    batch_item_id,
    dealer_profile_id,
    entity_kind,
    event_type,
    prior_state,
    resulting_state,
    actor_kind,
    actor_user_id,
    metadata
  ) values (
    v_item.id,
    v_item.dealer_profile_id,
    'item',
    case when v_recovered then 'item_lease_recovered' else 'item_lease_claimed' end,
    v_item.status,
    v_item.status,
    v_actor,
    p_actor_user_id,
    jsonb_build_object(
      'lease_expires_at', v_expiry,
      'recovered', v_recovered
    )
  );

  return v_item;
end
$fn$;

create or replace function public.dealer_accelerator_record_item_retry(
  p_item_id uuid,
  p_lease_token uuid,
  p_reason_code text,
  p_next_attempt_at timestamptz,
  p_exhausted boolean,
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
  v_prior text;
  v_reason text := btrim(coalesce(p_reason_code, ''));
  v_actor text := btrim(coalesce(p_actor_kind, ''));
  v_attempt integer;
begin
  if v_actor not in ('system', 'worker') then
    raise exception 'retry_actor_must_be_system_or_worker';
  end if;
  -- non-null actor existence: enforced by the lifecycle-event actor FK.
  if p_lease_token is null then raise exception 'lease_token_required'; end if;
  if v_reason = '' then raise exception 'retry_reason_required'; end if;
  if coalesce(p_exhausted, false) = false
     and (p_next_attempt_at is null or p_next_attempt_at <= now()) then
    raise exception 'future_next_attempt_required';
  end if;
  if coalesce(p_exhausted, false) = true and p_next_attempt_at is not null then
    raise exception 'exhausted_retry_cannot_schedule';
  end if;

  select *
    into v_item
    from public.dealer_accelerator_batch_items
   where id = p_item_id
   for update;
  if not found then raise exception 'item_not_found'; end if;
  if v_item.status not in ('discovered', 'ready') then
    raise exception 'item_not_retry_eligible:%', v_item.status;
  end if;
  if v_item.lease_token is distinct from p_lease_token
     or v_item.lease_expires_at is null
     or v_item.lease_expires_at <= now() then
    raise exception 'lease_not_owned_or_expired';
  end if;

  v_prior := v_item.status;
  v_attempt := v_item.attempt_count + 1;

  update public.dealer_accelerator_batch_items
     set status = case when coalesce(p_exhausted, false) then 'blocked' else status end,
         blocked_reason_code = case
           when coalesce(p_exhausted, false) then 'technical_retry_exhausted'
           else null
         end,
         attempt_count = v_attempt,
         lease_token = null,
         lease_expires_at = null,
         next_attempt_at = case
           when coalesce(p_exhausted, false) then null
           else p_next_attempt_at
         end,
         updated_at = now()
   where id = v_item.id
  returning * into v_item;

  insert into public.dealer_accelerator_lifecycle_events (
    batch_item_id,
    dealer_profile_id,
    entity_kind,
    event_type,
    prior_state,
    resulting_state,
    actor_kind,
    actor_user_id,
    reason_code,
    metadata
  ) values (
    v_item.id,
    v_item.dealer_profile_id,
    'item',
    case
      when coalesce(p_exhausted, false) then 'item_retry_exhausted'
      else 'item_retry_scheduled'
    end,
    v_prior,
    v_item.status,
    v_actor,
    p_actor_user_id,
    v_reason,
    jsonb_build_object(
      'attempt_count', v_attempt,
      'next_attempt_at', v_item.next_attempt_at
    )
  );

  return v_item;
end
$fn$;

-- --------------------------------------------------------------------------
-- 11. Function ownership and execution boundary
-- --------------------------------------------------------------------------

alter function public.dealer_accelerator_authorize_source(
  uuid,text,text,text,text,uuid,text,text,text
) owner to dealer_accelerator_writer;
alter function public.dealer_accelerator_transition_source(
  uuid,text,uuid,text
) owner to dealer_accelerator_writer;
alter function public.dealer_accelerator_create_or_get_batch(
  uuid,text,text,text,integer,text,uuid
) owner to dealer_accelerator_writer;
alter function public.dealer_accelerator_register_or_get_item(
  uuid,text,text,uuid
) owner to dealer_accelerator_writer;
alter function public.dealer_accelerator_record_observation(
  uuid,timestamptz,text,text,text,text,text,text,uuid
) owner to dealer_accelerator_writer;
alter function public.dealer_accelerator_transition_batch(
  uuid,text,text,text,uuid,text
) owner to dealer_accelerator_writer;
alter function public.dealer_accelerator_transition_item(
  uuid,text,text,text,uuid,text
) owner to dealer_accelerator_writer;
alter function public.dealer_accelerator_claim_item_lease(
  uuid,uuid,integer,text,uuid
) owner to dealer_accelerator_writer;
alter function public.dealer_accelerator_record_item_retry(
  uuid,uuid,text,timestamptz,boolean,text,uuid
) owner to dealer_accelerator_writer;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.dealer_accelerator_authorize_source(uuid,text,text,text,text,uuid,text,text,text)',
    'public.dealer_accelerator_transition_source(uuid,text,uuid,text)',
    'public.dealer_accelerator_create_or_get_batch(uuid,text,text,text,integer,text,uuid)',
    'public.dealer_accelerator_register_or_get_item(uuid,text,text,uuid)',
    'public.dealer_accelerator_record_observation(uuid,timestamptz,text,text,text,text,text,text,uuid)',
    'public.dealer_accelerator_transition_batch(uuid,text,text,text,uuid,text)',
    'public.dealer_accelerator_transition_item(uuid,text,text,text,uuid,text)',
    'public.dealer_accelerator_claim_item_lease(uuid,uuid,integer,text,uuid)',
    'public.dealer_accelerator_record_item_retry(uuid,uuid,text,timestamptz,boolean,text,uuid)'
  ]
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end
$$;

comment on table public.dealer_accelerator_sources is
  'Internal authorized inventory sources for Dealer Accelerator batches. No dealer-facing access.';
comment on table public.dealer_accelerator_source_items is
  'Stable dealer/source identities only; never a physical watch, observation, or listing identity.';
comment on table public.dealer_accelerator_batches is
  'Idempotent bounded acquisition batches under one authorized dealer source.';
comment on table public.dealer_accelerator_batch_items is
  'One processing occurrence for a stable source item in one batch, with lease and retry truth.';
comment on table public.dealer_accelerator_observations is
  'Immutable versioned source observations with governed, nonnumeric continuity assessment.';
comment on table public.dealer_accelerator_lifecycle_events is
  'Append-only source, stable-item, batch, observation, processing, lease, retry, and recovery history.';
