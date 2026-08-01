-- ============================================================================
-- Dealer Accelerator Flight 2 — literal evidence and photograph provenance
--
-- This migration adds the byte-evidence satellite of immutable observations,
-- literal photograph declarations with governed retrieval truth, and versioned
-- append-only extractions. It does not fetch anything, compute readiness,
-- materialize a draft, create a listing, write listing media, notify a user,
-- or touch the Vault.
--
-- Governing hash law: dealer_accelerator_observations.observation_hash is
-- canonical and equals encode(digest(payload_bytes, 'sha256'), 'hex') of the
-- one-to-one payload row. The payload row stores no second hash column; the
-- writer computes the digest and rejects insertion on mismatch.
--
-- Capture-time authorization is preserved immutably (state, exact use-terms
-- text and its hash, governing lifecycle event). Present-day revocation stops
-- new retrieval and use; it never rewrites capture history.
--
-- Controlled function signatures:
--   dealer_accelerator_record_observation_with_evidence(
--     uuid,timestamptz,text,text,text,text,bytea,jsonb,text,uuid)
--   dealer_accelerator_record_photograph_retrieval(
--     uuid,timestamptz,text,text,text,uuid)
--   dealer_accelerator_record_photograph_retrieval_failure(uuid,text,text,uuid)
--   dealer_accelerator_record_extraction(uuid,text,text,text,jsonb,text,uuid)
--
-- Bounded amendments to committed Flight 1 objects, each additive:
--   1. unique (id, source_id) on dealer_accelerator_lifecycle_events — the
--      structural target that binds every authorization-event pointer to its
--      own source; a pointer naming another source's event cannot satisfy
--      the composite foreign key.
--   2. dealer_accelerator_lifecycle_events_type_check re-created as the
--      original twenty event types plus the five evidence types.
--   3. usage on schema extensions granted to dealer_accelerator_writer —
--      runtime-proven dependency: the SECURITY DEFINER evidence functions
--      call extensions.digest() as the writer, and without schema usage the
--      call fails 42501. (An explicit execute grant on
--      dealer_accelerator_record_observation was runtime-proven REDUNDANT:
--      the Flight 1 revoke loop instantiates the function ACL, which
--      preserves the owner's own execute entry, so writer-owned delegation
--      already carries.)
--
-- PFC274 = 62 — app/api/evaluate/route.ts is untouched.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 0. Preconditions
-- --------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.dealer_accelerator_observations') is null
     or to_regclass('public.dealer_accelerator_lifecycle_events') is null then
    raise exception
      'dealer_accelerator_literal_evidence requires the batch spine migration (20260729020434) first';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'dealer_accelerator_writer') then
    raise exception
      'dealer_accelerator_literal_evidence requires the dealer_accelerator_writer role';
  end if;
  begin
    perform extensions.digest('probe'::bytea, 'sha256');
  exception when others then
    raise exception
      'dealer_accelerator_literal_evidence requires pgcrypto digest() in the extensions schema';
  end;
end
$$;

-- --------------------------------------------------------------------------
-- 1. Bounded amendments to Flight 1 objects (additive only)
-- --------------------------------------------------------------------------

-- 1a. Composite target for source-bound authorization-event pointers.
-- id alone is already unique, so this cannot invalidate any existing row.
alter table public.dealer_accelerator_lifecycle_events
  add constraint dealer_accelerator_lifecycle_events_id_source_key
  unique (id, source_id);

-- 1b. Event vocabulary: the original twenty types verbatim, plus five
-- evidence types. Evidence events ride entity_kind = 'observation', which the
-- existing entity check already permits; that check is not modified.
alter table public.dealer_accelerator_lifecycle_events
  drop constraint dealer_accelerator_lifecycle_events_type_check;
alter table public.dealer_accelerator_lifecycle_events
  add constraint dealer_accelerator_lifecycle_events_type_check
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
      'item_retry_exhausted',
      'payload_recorded',
      'photograph_declared',
      'photograph_retrieved',
      'photograph_retrieval_failed',
      'extraction_recorded'
    )
  );

-- 1c. The writer must reach extensions.digest() from inside SECURITY DEFINER
-- functions. Runtime-proven on 2026-08-01: without schema usage the composite
-- recorder fails 42501 at its first digest; the migration-time precondition
-- probe runs as a superuser and cannot catch this. No execute grant on
-- extensions functions is needed — pgcrypto grants execute to PUBLIC.
-- (No execute grant on dealer_accelerator_record_observation is needed
-- either: the Flight 1 revoke loop instantiated that function's ACL with the
-- owner's execute entry intact, so writer-owned delegation already carries —
-- runtime-proven the same day.)
grant usage on schema extensions to dealer_accelerator_writer;

-- --------------------------------------------------------------------------
-- 2. Observation payloads — the byte evidence, one-to-one with observations
-- --------------------------------------------------------------------------

create table public.dealer_accelerator_observation_payloads (
  id                              uuid        not null default gen_random_uuid(),
  observation_id                  uuid        not null,
  batch_item_id                   uuid        not null,
  batch_id                        uuid        not null,
  source_item_id                  uuid        not null,
  source_id                       uuid        not null,
  dealer_profile_id               uuid        not null,
  payload_bytes                   bytea       not null,
  payload_text                    text,
  payload_jsonb                   jsonb,
  decode_status                   text        not null,
  parse_status                    text        not null,
  parse_error_code                text,
  authorization_state_at_capture  text        not null,
  use_terms_text_at_capture       text        not null,
  use_terms_hash_at_capture       text        not null,
  authorization_event_id          bigint      not null,
  captured_at                     timestamptz not null,
  created_at                      timestamptz not null default now(),

  constraint dealer_accelerator_observation_payloads_pkey
    primary key (id),
  -- The one-to-one law: at most one byte-evidence row per observation.
  constraint dealer_accelerator_observation_payloads_observation_key
    unique (observation_id),
  -- Full-chain binding against the observation's own committed chain key.
  constraint dealer_accelerator_observation_payloads_observation_fk
    foreign key (
      observation_id,
      batch_item_id,
      batch_id,
      source_item_id,
      source_id,
      dealer_profile_id
    )
    references public.dealer_accelerator_observations (
      id,
      batch_item_id,
      batch_id,
      source_item_id,
      source_id,
      dealer_profile_id
    )
    on delete restrict,
  -- Source-bound authorization event: an event row must exist with this id
  -- AND this source_id, so another source's event can never satisfy it.
  constraint dealer_accelerator_observation_payloads_auth_event_fk
    foreign key (authorization_event_id, source_id)
    references public.dealer_accelerator_lifecycle_events (id, source_id)
    on delete restrict,
  constraint dealer_accelerator_observation_payloads_bytes_check
    check (octet_length(payload_bytes) > 0),
  constraint dealer_accelerator_observation_payloads_decode_check
    check (decode_status in ('decoded', 'invalid_utf8')),
  constraint dealer_accelerator_observation_payloads_parse_check
    check (parse_status in ('parsed', 'not_json', 'parse_failed')),
  constraint dealer_accelerator_observation_payloads_text_truth_check
    check ((payload_text is not null) = (decode_status = 'decoded')),
  constraint dealer_accelerator_observation_payloads_jsonb_truth_check
    check ((payload_jsonb is not null) = (parse_status = 'parsed')),
  constraint dealer_accelerator_observation_payloads_parse_requires_decode_check
    check (parse_status <> 'parsed' or decode_status = 'decoded'),
  constraint dealer_accelerator_observation_payloads_undecodable_check
    check (decode_status <> 'invalid_utf8' or parse_status = 'parse_failed'),
  constraint dealer_accelerator_observation_payloads_error_truth_check
    check (
      (parse_error_code is not null and btrim(parse_error_code) <> '')
      = (parse_status in ('not_json', 'parse_failed'))
    ),
  constraint dealer_accelerator_observation_payloads_capture_state_check
    check (
      authorization_state_at_capture in ('authorized', 'suspended', 'revoked')
    ),
  constraint dealer_accelerator_observation_payloads_terms_check
    check (btrim(use_terms_text_at_capture) <> ''),
  constraint dealer_accelerator_observation_payloads_terms_hash_check
    check (use_terms_hash_at_capture ~ '^[0-9a-f]{64}$')
);

-- --------------------------------------------------------------------------
-- 3. Photograph declarations and governed retrieval truth
-- --------------------------------------------------------------------------

create table public.dealer_accelerator_photographs (
  id                                    uuid        not null default gen_random_uuid(),
  observation_id                        uuid        not null,
  batch_item_id                         uuid        not null,
  batch_id                              uuid        not null,
  source_item_id                        uuid        not null,
  source_id                             uuid        not null,
  dealer_profile_id                     uuid        not null,
  sequence_index                        integer     not null,
  source_url                            text        not null,
  source_pathname                       text,
  declared_category                     text,
  declared_at                           timestamptz not null,
  authorization_state_at_declaration    text        not null,
  use_terms_text_at_capture             text        not null,
  use_terms_hash_at_capture             text        not null,
  authorization_event_id_at_declaration bigint      not null,
  retrieval_state                       text        not null default 'declared',
  retrieved_at                          timestamptz,
  content_hash                          text,
  storage_path                          text,
  authorization_event_id_at_retrieval   bigint,
  created_at                            timestamptz not null default now(),
  updated_at                            timestamptz not null default now(),

  constraint dealer_accelerator_photographs_pkey
    primary key (id),
  constraint dealer_accelerator_photographs_sequence_key
    unique (observation_id, sequence_index),
  constraint dealer_accelerator_photographs_observation_fk
    foreign key (
      observation_id,
      batch_item_id,
      batch_id,
      source_item_id,
      source_id,
      dealer_profile_id
    )
    references public.dealer_accelerator_observations (
      id,
      batch_item_id,
      batch_id,
      source_item_id,
      source_id,
      dealer_profile_id
    )
    on delete restrict,
  constraint dealer_accelerator_photographs_declaration_event_fk
    foreign key (authorization_event_id_at_declaration, source_id)
    references public.dealer_accelerator_lifecycle_events (id, source_id)
    on delete restrict,
  constraint dealer_accelerator_photographs_retrieval_event_fk
    foreign key (authorization_event_id_at_retrieval, source_id)
    references public.dealer_accelerator_lifecycle_events (id, source_id)
    on delete restrict,
  constraint dealer_accelerator_photographs_sequence_check
    check (sequence_index >= 0),
  constraint dealer_accelerator_photographs_url_check
    check (btrim(source_url) <> ''),
  constraint dealer_accelerator_photographs_pathname_check
    check (source_pathname is null or btrim(source_pathname) <> ''),
  constraint dealer_accelerator_photographs_category_check
    check (declared_category is null or btrim(declared_category) <> ''),
  constraint dealer_accelerator_photographs_declaration_state_check
    check (
      authorization_state_at_declaration in ('authorized', 'suspended', 'revoked')
    ),
  constraint dealer_accelerator_photographs_terms_check
    check (btrim(use_terms_text_at_capture) <> ''),
  constraint dealer_accelerator_photographs_terms_hash_check
    check (use_terms_hash_at_capture ~ '^[0-9a-f]{64}$'),
  constraint dealer_accelerator_photographs_retrieval_state_check
    check (retrieval_state in ('declared', 'retrieved', 'retrieval_failed')),
  -- Success facts are earned together or absent together. Failure history
  -- lives in lifecycle events, never in overwritten columns.
  constraint dealer_accelerator_photographs_retrieval_truth_check
    check (
      (
        retrieval_state = 'retrieved'
        and retrieved_at is not null
        and content_hash is not null
        and storage_path is not null
        and authorization_event_id_at_retrieval is not null
      )
      or
      (
        retrieval_state <> 'retrieved'
        and retrieved_at is null
        and content_hash is null
        and storage_path is null
        and authorization_event_id_at_retrieval is null
      )
    ),
  constraint dealer_accelerator_photographs_content_hash_check
    check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  constraint dealer_accelerator_photographs_storage_path_check
    check (storage_path is null or btrim(storage_path) <> '')
);

-- Indexed evidence, deliberately NOT unique at any scope: the same bytes
-- recurring across observations is continuity evidence, never an error.
create index dealer_accelerator_photographs_content_hash_idx
  on public.dealer_accelerator_photographs (content_hash)
  where content_hash is not null;

-- --------------------------------------------------------------------------
-- 4. Versioned append-only extractions — interpretations, never evidence
-- --------------------------------------------------------------------------

create table public.dealer_accelerator_observation_extractions (
  id                     uuid        not null default gen_random_uuid(),
  observation_id         uuid        not null,
  batch_item_id          uuid        not null,
  batch_id               uuid        not null,
  source_item_id         uuid        not null,
  source_id              uuid        not null,
  dealer_profile_id      uuid        not null,
  extractor_version      text        not null,
  literal_brand          text,
  literal_reference      text,
  photograph_categories  jsonb       not null default '{}'::jsonb,
  extracted_at           timestamptz not null default now(),

  constraint dealer_accelerator_observation_extractions_pkey
    primary key (id),
  constraint dealer_accelerator_observation_extractions_version_key
    unique (observation_id, extractor_version),
  constraint dealer_accelerator_observation_extractions_observation_fk
    foreign key (
      observation_id,
      batch_item_id,
      batch_id,
      source_item_id,
      source_id,
      dealer_profile_id
    )
    references public.dealer_accelerator_observations (
      id,
      batch_item_id,
      batch_id,
      source_item_id,
      source_id,
      dealer_profile_id
    )
    on delete restrict,
  constraint dealer_accelerator_observation_extractions_extractor_check
    check (btrim(extractor_version) <> ''),
  constraint dealer_accelerator_observation_extractions_brand_check
    check (literal_brand is null or btrim(literal_brand) <> ''),
  constraint dealer_accelerator_observation_extractions_reference_check
    check (literal_reference is null or btrim(literal_reference) <> ''),
  constraint dealer_accelerator_observation_extractions_categories_check
    check (jsonb_typeof(photograph_categories) = 'object')
);

-- --------------------------------------------------------------------------
-- 5. RLS and direct privileges
-- --------------------------------------------------------------------------

alter table public.dealer_accelerator_observation_payloads enable row level security;
alter table public.dealer_accelerator_photographs enable row level security;
alter table public.dealer_accelerator_observation_extractions enable row level security;

revoke all on public.dealer_accelerator_observation_payloads from public, anon, authenticated, service_role;
revoke all on public.dealer_accelerator_photographs from public, anon, authenticated, service_role;
revoke all on public.dealer_accelerator_observation_extractions from public, anon, authenticated, service_role;

grant select on public.dealer_accelerator_observation_payloads to service_role;
grant select on public.dealer_accelerator_photographs to service_role;
grant select on public.dealer_accelerator_observation_extractions to service_role;

-- Append-only tables receive select+insert only; no UPDATE means no row locks
-- in their functions. Photographs alone carry UPDATE, solely for the governed
-- write-once retrieval columns.
grant select, insert on public.dealer_accelerator_observation_payloads
  to dealer_accelerator_writer;
grant select, insert, update on public.dealer_accelerator_photographs
  to dealer_accelerator_writer;
grant select, insert on public.dealer_accelerator_observation_extractions
  to dealer_accelerator_writer;

create policy dealer_accelerator_observation_payloads_writer_select
  on public.dealer_accelerator_observation_payloads
  for select to dealer_accelerator_writer using (true);
create policy dealer_accelerator_observation_payloads_writer_insert
  on public.dealer_accelerator_observation_payloads
  for insert to dealer_accelerator_writer with check (true);

create policy dealer_accelerator_photographs_writer_select
  on public.dealer_accelerator_photographs
  for select to dealer_accelerator_writer using (true);
create policy dealer_accelerator_photographs_writer_insert
  on public.dealer_accelerator_photographs
  for insert to dealer_accelerator_writer with check (true);
create policy dealer_accelerator_photographs_writer_update
  on public.dealer_accelerator_photographs
  for update to dealer_accelerator_writer using (true) with check (true);

create policy dealer_accelerator_observation_extractions_writer_select
  on public.dealer_accelerator_observation_extractions
  for select to dealer_accelerator_writer using (true);
create policy dealer_accelerator_observation_extractions_writer_insert
  on public.dealer_accelerator_observation_extractions
  for insert to dealer_accelerator_writer with check (true);

-- --------------------------------------------------------------------------
-- 6. Composite evidence recorder
-- --------------------------------------------------------------------------

create or replace function public.dealer_accelerator_record_observation_with_evidence(
  p_batch_item_id uuid,
  p_observed_at timestamptz,
  p_adapter_version text,
  p_source_version text,
  p_snapshot_identity text,
  p_continuity_state text,
  p_payload_bytes bytea,
  p_photographs jsonb,
  p_actor_kind text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_hash text;
  v_observation public.dealer_accelerator_observations;
  v_source public.dealer_accelerator_sources;
  v_auth_event bigint;
  v_terms_hash text;
  v_payload public.dealer_accelerator_observation_payloads;
  v_payload_replay boolean := false;
  v_photo_replay boolean := false;
  v_text text;
  v_jsonb jsonb;
  v_decode text;
  v_parse text;
  v_err text;
  v_photo jsonb;
  v_url text;
  v_pathname text;
  v_category text;
  v_seq integer;
  v_declared_count integer;
  v_existing_count integer;
  v_existing public.dealer_accelerator_photographs;
  v_photo_ids uuid[] := array[]::uuid[];
begin
  if p_payload_bytes is null or octet_length(p_payload_bytes) = 0 then
    raise exception 'payload_bytes_required';
  end if;
  if p_photographs is null or jsonb_typeof(p_photographs) <> 'array' then
    raise exception 'photographs_must_be_array';
  end if;
  for v_photo in select value from jsonb_array_elements(p_photographs) loop
    if jsonb_typeof(v_photo) <> 'object' then
      raise exception 'photograph_declaration_must_be_object';
    end if;
    if jsonb_typeof(v_photo->'url') is distinct from 'string'
       or btrim(v_photo->>'url') = '' then
      raise exception 'photograph_url_must_be_nonblank_string';
    end if;
    if v_photo ? 'pathname'
       and jsonb_typeof(v_photo->'pathname') not in ('string', 'null') then
      raise exception 'photograph_pathname_must_be_string';
    end if;
    if v_photo ? 'category'
       and jsonb_typeof(v_photo->'category') not in ('string', 'null') then
      raise exception 'photograph_category_must_be_string';
    end if;
  end loop;

  -- The canonical hash is computed from the delivered bytes; a caller cannot
  -- assert a hash it does not hold the evidence for.
  v_hash := encode(extensions.digest(p_payload_bytes, 'sha256'), 'hex');

  -- Observation identity is owned by the proven Flight 1 authority: batch must
  -- be running, snapshot/hash idempotency and conflicts enforced, event
  -- appended there.
  v_observation := public.dealer_accelerator_record_observation(
    p_batch_item_id,
    p_observed_at,
    p_adapter_version,
    p_source_version,
    v_hash,
    p_snapshot_identity,
    p_continuity_state,
    p_actor_kind,
    p_actor_user_id
  );

  if v_observation.observation_hash is distinct from v_hash then
    raise exception 'payload_hash_mismatch';
  end if;

  select *
    into v_source
    from public.dealer_accelerator_sources
   where id = v_observation.source_id;
  if not found then raise exception 'source_not_found'; end if;

  select max(id)
    into v_auth_event
    from public.dealer_accelerator_lifecycle_events
   where source_id = v_observation.source_id
     and entity_kind = 'source';
  if v_auth_event is null then
    raise exception 'source_authorization_event_missing';
  end if;

  v_terms_hash := encode(
    extensions.digest(convert_to(v_source.photograph_use_terms, 'UTF8'), 'sha256'),
    'hex'
  );

  -- Derived conveniences are best-effort; their failure is recorded, never fatal.
  begin
    v_text := convert_from(p_payload_bytes, 'UTF8');
    v_decode := 'decoded';
  exception when others then
    v_text := null;
    v_decode := 'invalid_utf8';
  end;
  if v_decode = 'decoded' then
    begin
      v_jsonb := v_text::jsonb;
      v_parse := 'parsed';
      v_err := null;
    exception when others then
      v_jsonb := null;
      v_parse := 'not_json';
      v_err := 'invalid_json';
    end;
  else
    v_jsonb := null;
    v_parse := 'parse_failed';
    v_err := 'undecodable_payload';
  end if;

  select *
    into v_payload
    from public.dealer_accelerator_observation_payloads
   where observation_id = v_observation.id;
  if found then
    if v_payload.payload_bytes is distinct from p_payload_bytes then
      raise exception 'payload_bytes_conflict';
    end if;
    v_payload_replay := true;
  else
    begin
      insert into public.dealer_accelerator_observation_payloads (
        observation_id,
        batch_item_id,
        batch_id,
        source_item_id,
        source_id,
        dealer_profile_id,
        payload_bytes,
        payload_text,
        payload_jsonb,
        decode_status,
        parse_status,
        parse_error_code,
        authorization_state_at_capture,
        use_terms_text_at_capture,
        use_terms_hash_at_capture,
        authorization_event_id,
        captured_at
      ) values (
        v_observation.id,
        v_observation.batch_item_id,
        v_observation.batch_id,
        v_observation.source_item_id,
        v_observation.source_id,
        v_observation.dealer_profile_id,
        p_payload_bytes,
        v_text,
        v_jsonb,
        v_decode,
        v_parse,
        v_err,
        v_source.authorization_state,
        v_source.photograph_use_terms,
        v_terms_hash,
        v_auth_event,
        now()
      )
      returning * into v_payload;
    exception
      when unique_violation then
        select *
          into v_payload
          from public.dealer_accelerator_observation_payloads
         where observation_id = v_observation.id;
        if not found
           or v_payload.payload_bytes is distinct from p_payload_bytes then
          raise exception 'payload_identity_race_conflict';
        end if;
        v_payload_replay := true;
    end;
    if not v_payload_replay then
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
        'payload_recorded',
        v_parse,
        btrim(p_actor_kind),
        p_actor_user_id,
        jsonb_build_object(
          'payload_id', v_payload.id,
          'octet_length', octet_length(p_payload_bytes),
          'decode_status', v_decode,
          'parse_status', v_parse
        )
      );
    end if;
  end if;

  v_declared_count := jsonb_array_length(p_photographs);
  select count(*)::integer
    into v_existing_count
    from public.dealer_accelerator_photographs
   where observation_id = v_observation.id;

  if v_existing_count > 0 then
    -- Replay path: the full prior declaration must match exactly.
    if v_existing_count <> v_declared_count then
      raise exception 'photograph_declaration_conflict';
    end if;
    for v_photo, v_seq in
      select value, (ordinality - 1)::integer
        from jsonb_array_elements(p_photographs) with ordinality
    loop
      select *
        into v_existing
        from public.dealer_accelerator_photographs
       where observation_id = v_observation.id
         and sequence_index = v_seq;
      if not found
         or v_existing.source_url is distinct from btrim(v_photo->>'url')
         or v_existing.source_pathname is distinct from
            nullif(btrim(coalesce(v_photo->>'pathname', '')), '')
         or v_existing.declared_category is distinct from
            nullif(btrim(coalesce(v_photo->>'category', '')), '') then
        raise exception 'photograph_declaration_conflict';
      end if;
      v_photo_ids := v_photo_ids || v_existing.id;
    end loop;
    v_photo_replay := true;
  else
    for v_photo, v_seq in
      select value, (ordinality - 1)::integer
        from jsonb_array_elements(p_photographs) with ordinality
    loop
      v_url := btrim(v_photo->>'url');
      v_pathname := nullif(btrim(coalesce(v_photo->>'pathname', '')), '');
      v_category := nullif(btrim(coalesce(v_photo->>'category', '')), '');
      begin
        insert into public.dealer_accelerator_photographs (
          observation_id,
          batch_item_id,
          batch_id,
          source_item_id,
          source_id,
          dealer_profile_id,
          sequence_index,
          source_url,
          source_pathname,
          declared_category,
          declared_at,
          authorization_state_at_declaration,
          use_terms_text_at_capture,
          use_terms_hash_at_capture,
          authorization_event_id_at_declaration
        ) values (
          v_observation.id,
          v_observation.batch_item_id,
          v_observation.batch_id,
          v_observation.source_item_id,
          v_observation.source_id,
          v_observation.dealer_profile_id,
          v_seq,
          v_url,
          v_pathname,
          v_category,
          now(),
          v_source.authorization_state,
          v_source.photograph_use_terms,
          v_terms_hash,
          v_auth_event
        )
        returning * into v_existing;
      exception
        when unique_violation then
          select *
            into v_existing
            from public.dealer_accelerator_photographs
           where observation_id = v_observation.id
             and sequence_index = v_seq;
          if not found
             or v_existing.source_url is distinct from v_url
             or v_existing.source_pathname is distinct from v_pathname
             or v_existing.declared_category is distinct from v_category then
            raise exception 'photograph_declaration_race_conflict';
          end if;
          v_photo_ids := v_photo_ids || v_existing.id;
          continue;
      end;
      v_photo_ids := v_photo_ids || v_existing.id;
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
        'photograph_declared',
        'declared',
        btrim(p_actor_kind),
        p_actor_user_id,
        jsonb_build_object(
          'photograph_id', v_existing.id,
          'sequence_index', v_seq,
          'source_url', v_url
        )
      );
    end loop;
  end if;

  return jsonb_build_object(
    'observation_id', v_observation.id,
    'observation_hash', v_observation.observation_hash,
    'payload_id', v_payload.id,
    'payload_replay', v_payload_replay,
    'photograph_ids', to_jsonb(v_photo_ids),
    'photograph_replay', v_photo_replay,
    'decode_status', v_payload.decode_status,
    'parse_status', v_payload.parse_status
  );
end
$fn$;

-- --------------------------------------------------------------------------
-- 7. Photograph retrieval — success is write-once; new use needs current
--    authorization
-- --------------------------------------------------------------------------

create or replace function public.dealer_accelerator_record_photograph_retrieval(
  p_photograph_id uuid,
  p_retrieved_at timestamptz,
  p_content_hash text,
  p_storage_path text,
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
  v_source public.dealer_accelerator_sources;
  v_auth_event bigint;
  v_hash text := lower(btrim(coalesce(p_content_hash, '')));
  v_path text := btrim(coalesce(p_storage_path, ''));
  v_actor text := btrim(coalesce(p_actor_kind, ''));
begin
  if v_actor not in ('system', 'founder', 'dealer', 'worker') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_actor in ('founder', 'dealer') and p_actor_user_id is null then
    raise exception 'human_actor_required';
  end if;
  if p_retrieved_at is null then raise exception 'retrieved_at_required'; end if;
  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'content_hash_must_be_sha256_hex';
  end if;
  if v_path = '' then raise exception 'storage_path_required'; end if;

  select *
    into v_photo
    from public.dealer_accelerator_photographs
   where id = p_photograph_id
   for update;
  if not found then raise exception 'photograph_not_found'; end if;

  if v_photo.retrieval_state = 'retrieved' then
    if v_photo.retrieved_at is distinct from p_retrieved_at
       or v_photo.content_hash is distinct from v_hash
       or v_photo.storage_path is distinct from v_path then
      raise exception 'photograph_retrieval_conflict';
    end if;
    return v_photo;
  end if;

  -- Declaration history survives revocation; NEW retrieval does not.
  select *
    into v_source
    from public.dealer_accelerator_sources
   where id = v_photo.source_id;
  if not found then raise exception 'source_not_found'; end if;
  if v_source.authorization_state <> 'authorized' then
    raise exception 'source_not_currently_authorized:%',
      v_source.authorization_state;
  end if;

  select max(id)
    into v_auth_event
    from public.dealer_accelerator_lifecycle_events
   where source_id = v_photo.source_id
     and entity_kind = 'source';
  if v_auth_event is null then
    raise exception 'source_authorization_event_missing';
  end if;

  update public.dealer_accelerator_photographs
     set retrieval_state = 'retrieved',
         retrieved_at = p_retrieved_at,
         content_hash = v_hash,
         storage_path = v_path,
         authorization_event_id_at_retrieval = v_auth_event,
         updated_at = now()
   where id = v_photo.id
   returning * into v_photo;

  insert into public.dealer_accelerator_lifecycle_events (
    observation_id,
    dealer_profile_id,
    entity_kind,
    event_type,
    prior_state,
    resulting_state,
    actor_kind,
    actor_user_id,
    metadata
  ) values (
    v_photo.observation_id,
    v_photo.dealer_profile_id,
    'observation',
    'photograph_retrieved',
    'declared',
    'retrieved',
    v_actor,
    p_actor_user_id,
    jsonb_build_object(
      'photograph_id', v_photo.id,
      'sequence_index', v_photo.sequence_index,
      'content_hash', v_hash,
      'storage_path', v_path,
      'authorization_event_id_at_retrieval', v_auth_event
    )
  );

  return v_photo;
end
$fn$;

-- --------------------------------------------------------------------------
-- 8. Photograph retrieval failure — the row is a cursor, events are the memory
-- --------------------------------------------------------------------------

create or replace function public.dealer_accelerator_record_photograph_retrieval_failure(
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
  v_attempt bigint;
begin
  if v_actor not in ('system', 'founder', 'dealer', 'worker') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_actor in ('founder', 'dealer') and p_actor_user_id is null then
    raise exception 'human_actor_required';
  end if;
  if v_reason = '' then raise exception 'reason_code_required'; end if;

  select *
    into v_photo
    from public.dealer_accelerator_photographs
   where id = p_photograph_id
   for update;
  if not found then raise exception 'photograph_not_found'; end if;

  if v_photo.retrieval_state = 'retrieved' then
    raise exception 'photograph_already_retrieved';
  end if;

  select count(*) + 1
    into v_attempt
    from public.dealer_accelerator_lifecycle_events
   where observation_id = v_photo.observation_id
     and event_type = 'photograph_retrieval_failed'
     and metadata->>'photograph_id' = v_photo.id::text;

  update public.dealer_accelerator_photographs
     set retrieval_state = 'retrieval_failed',
         updated_at = now()
   where id = v_photo.id
   returning * into v_photo;

  insert into public.dealer_accelerator_lifecycle_events (
    observation_id,
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
    v_photo.observation_id,
    v_photo.dealer_profile_id,
    'observation',
    'photograph_retrieval_failed',
    'declared',
    'retrieval_failed',
    v_actor,
    p_actor_user_id,
    v_reason,
    jsonb_build_object(
      'photograph_id', v_photo.id,
      'sequence_index', v_photo.sequence_index,
      'attempt_number', v_attempt
    )
  );

  return v_photo;
end
$fn$;

-- --------------------------------------------------------------------------
-- 9. Versioned extraction recorder
-- --------------------------------------------------------------------------

create or replace function public.dealer_accelerator_record_extraction(
  p_observation_id uuid,
  p_extractor_version text,
  p_literal_brand text,
  p_literal_reference text,
  p_photograph_categories jsonb,
  p_actor_kind text,
  p_actor_user_id uuid
)
returns public.dealer_accelerator_observation_extractions
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_observation public.dealer_accelerator_observations;
  v_extraction public.dealer_accelerator_observation_extractions;
  v_version text := btrim(coalesce(p_extractor_version, ''));
  v_brand text := nullif(btrim(coalesce(p_literal_brand, '')), '');
  v_reference text := nullif(btrim(coalesce(p_literal_reference, '')), '');
  v_categories jsonb := coalesce(p_photograph_categories, '{}'::jsonb);
  v_actor text := btrim(coalesce(p_actor_kind, ''));
begin
  if v_actor not in ('system', 'founder', 'dealer', 'worker') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_actor in ('founder', 'dealer') and p_actor_user_id is null then
    raise exception 'human_actor_required';
  end if;
  if v_version = '' then raise exception 'extractor_version_required'; end if;
  if jsonb_typeof(v_categories) <> 'object' then
    raise exception 'photograph_categories_must_be_object';
  end if;

  select *
    into v_observation
    from public.dealer_accelerator_observations
   where id = p_observation_id;
  if not found then raise exception 'observation_not_found'; end if;

  select *
    into v_extraction
    from public.dealer_accelerator_observation_extractions
   where observation_id = v_observation.id
     and extractor_version = v_version;
  if found then
    if v_extraction.literal_brand is distinct from v_brand
       or v_extraction.literal_reference is distinct from v_reference
       or v_extraction.photograph_categories is distinct from v_categories then
      raise exception 'extraction_version_conflict';
    end if;
    return v_extraction;
  end if;

  begin
    insert into public.dealer_accelerator_observation_extractions (
      observation_id,
      batch_item_id,
      batch_id,
      source_item_id,
      source_id,
      dealer_profile_id,
      extractor_version,
      literal_brand,
      literal_reference,
      photograph_categories
    ) values (
      v_observation.id,
      v_observation.batch_item_id,
      v_observation.batch_id,
      v_observation.source_item_id,
      v_observation.source_id,
      v_observation.dealer_profile_id,
      v_version,
      v_brand,
      v_reference,
      v_categories
    )
    returning * into v_extraction;
  exception
    when unique_violation then
      select *
        into v_extraction
        from public.dealer_accelerator_observation_extractions
       where observation_id = v_observation.id
         and extractor_version = v_version;
      if not found
         or v_extraction.literal_brand is distinct from v_brand
         or v_extraction.literal_reference is distinct from v_reference
         or v_extraction.photograph_categories is distinct from v_categories then
        raise exception 'extraction_identity_race_conflict';
      end if;
      return v_extraction;
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
    'extraction_recorded',
    v_version,
    v_actor,
    p_actor_user_id,
    jsonb_build_object(
      'extraction_id', v_extraction.id,
      'extractor_version', v_version,
      'has_literal_brand', v_brand is not null,
      'has_literal_reference', v_reference is not null
    )
  );

  return v_extraction;
end
$fn$;

-- --------------------------------------------------------------------------
-- 10. Function ownership and execution boundary
-- --------------------------------------------------------------------------

alter function public.dealer_accelerator_record_observation_with_evidence(
  uuid,timestamptz,text,text,text,text,bytea,jsonb,text,uuid
) owner to dealer_accelerator_writer;
alter function public.dealer_accelerator_record_photograph_retrieval(
  uuid,timestamptz,text,text,text,uuid
) owner to dealer_accelerator_writer;
alter function public.dealer_accelerator_record_photograph_retrieval_failure(
  uuid,text,text,uuid
) owner to dealer_accelerator_writer;
alter function public.dealer_accelerator_record_extraction(
  uuid,text,text,text,jsonb,text,uuid
) owner to dealer_accelerator_writer;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.dealer_accelerator_record_observation_with_evidence(uuid,timestamptz,text,text,text,text,bytea,jsonb,text,uuid)',
    'public.dealer_accelerator_record_photograph_retrieval(uuid,timestamptz,text,text,text,uuid)',
    'public.dealer_accelerator_record_photograph_retrieval_failure(uuid,text,text,uuid)',
    'public.dealer_accelerator_record_extraction(uuid,text,text,text,jsonb,text,uuid)'
  ]
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end
$$;

comment on table public.dealer_accelerator_observation_payloads is
  'Verbatim delivered source bytes, one-to-one with an immutable observation; the parent observation_hash is the canonical digest of payload_bytes. Capture-time authorization is preserved immutably.';
comment on table public.dealer_accelerator_photographs is
  'Literal photograph declarations with governed write-once retrieval truth. Declaration history survives revocation; new retrieval requires current authorization. content_hash recurrence is continuity evidence, never identity.';
comment on table public.dealer_accelerator_observation_extractions is
  'Versioned append-only interpretations of observation evidence (literal brand, reference, photograph categories). Corrections are new versions, never edits.';
