-- ══════════════════════════════════════════════════════════════════════════
-- Dealer Accelerator — dealer-performed source authorization
--
-- The spine has always been able to record a source authorized by anyone;
-- only the ignition routes restricted that to the founder. Opening the
-- ordinary dealer path exposes two places where the recording machinery
-- cannot yet tell the truth about who acted:
--
--   1. dealer_accelerator_authorize_source writes its source_authorized
--      event with actor_kind hardcoded to 'founder'. A dealer authorizing
--      their own source would produce a false line in an append-only
--      evidence log. That is the one kind of defect this log cannot carry.
--
--   2. dealer_accelerator_approve_source_origin REFUSES actor_kind
--      'dealer' outright, so a dealer-authorized source could never have
--      its governed origins approved. The SSRF boundary itself is correct
--      and is not touched here — only who is permitted to be recorded as
--      having approved an origin.
--
-- A third change is a plain defect fix rather than a vocabulary question:
-- approve_source_origin INSERTs with no conflict handling, so approving an
-- origin that already exists raised a unique violation. A dealer
-- re-connecting the same website is ordinary behaviour, not an error, so
-- the function now converges on the existing row. It still refuses to
-- hand back a REVOKED origin as though it were approved.
--
-- No table, constraint, policy, grant, or event vocabulary changes. The
-- lifecycle event CHECK already permits actor_kind 'dealer'; nothing new is
-- introduced, an existing capability is simply reachable honestly.
--
-- OWNERSHIP NOTE, load-bearing: both functions are owned by
-- dealer_accelerator_writer, not postgres. They are SECURITY DEFINER, so
-- the owner IS the privilege they execute with. Recreating them without
-- restoring that owner would silently escalate them to postgres. The
-- ALTER FUNCTION ... OWNER TO and GRANT statements at the end of each
-- block are not boilerplate — they are the privilege boundary.
--
-- PFC274 = 62 — the evaluate route is untouched by this migration.
-- ══════════════════════════════════════════════════════════════════════════

-- --------------------------------------------------------------------------
-- 1. authorize_source: name the actor honestly, carry the attestation
-- --------------------------------------------------------------------------
-- DROP rather than CREATE OR REPLACE: two parameters are being added, and
-- CREATE OR REPLACE cannot change a signature. The new parameters carry
-- DEFAULTS so every existing nine-argument caller keeps resolving to this
-- one function — an overload would have left a second door that still
-- hardcodes 'founder'.
drop function if exists public.dealer_accelerator_authorize_source(
  uuid, text, text, text, text, uuid, text, text, text
);

create function public.dealer_accelerator_authorize_source(
  p_dealer_profile_id uuid,
  p_source_type text,
  p_source_locator text,
  p_source_locator_key text,
  p_authorization_basis text,
  p_authorized_by uuid,
  p_retention_terms text,
  p_photograph_use_terms text,
  p_adapter_scope text,
  p_actor_kind text default 'founder',
  p_attestation jsonb default '{}'::jsonb
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
  v_actor text := btrim(coalesce(p_actor_kind, ''));
  v_meta jsonb := coalesce(p_attestation, '{}'::jsonb);
begin
  -- Null is rejected here; a non-null id that does not exist is rejected by
  -- dealer_accelerator_sources_dealer_fk / _authorizer_fk on insert below.
  if p_dealer_profile_id is null then
    raise exception 'dealer_profile_not_found';
  end if;
  if p_authorized_by is null then
    raise exception 'authorized_actor_not_found';
  end if;
  -- Only the two kinds that can actually authorize a source. 'system' and
  -- 'worker' are excluded deliberately: authorization is a human act, and
  -- the events table's human_actor CHECK would refuse them without a user
  -- id anyway. Refuse loudly here rather than fail on a constraint later.
  if v_actor not in ('founder', 'dealer') then
    raise exception 'invalid_actor_kind';
  end if;
  if jsonb_typeof(v_meta) <> 'object' then
    raise exception 'attestation_must_be_object';
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
    actor_user_id,
    metadata
  ) values (
    v_source.id,
    v_source.dealer_profile_id,
    'source',
    'source_authorized',
    'authorized',
    v_actor,
    p_authorized_by,
    v_meta
  );

  return v_source;
end
$fn$;

-- SECURITY DEFINER runs as the OWNER. Restore it, then restore the grant
-- the DROP discarded. Both statements are the privilege boundary.
alter function public.dealer_accelerator_authorize_source(
  uuid, text, text, text, text, uuid, text, text, text, text, jsonb
) owner to dealer_accelerator_writer;

revoke all on function public.dealer_accelerator_authorize_source(
  uuid, text, text, text, text, uuid, text, text, text, text, jsonb
) from public;

grant execute on function public.dealer_accelerator_authorize_source(
  uuid, text, text, text, text, uuid, text, text, text, text, jsonb
) to service_role;

-- --------------------------------------------------------------------------
-- 2. approve_source_origin: permit a dealer actor; converge on re-approval
-- --------------------------------------------------------------------------
-- Signature is unchanged, so CREATE OR REPLACE is correct here and the
-- existing owner and grant are preserved automatically.
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
  -- 'dealer' added. The origin CHECKs, the canonical-form refusals, and the
  -- fetch-time revalidation are unchanged: this widens WHO may be recorded
  -- as approving an origin, never WHAT an origin may be.
  if v_actor not in ('system', 'founder', 'dealer') then
    raise exception 'invalid_actor_kind';
  end if;
  if v_actor in ('founder', 'dealer') and p_actor_user_id is null then
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
  )
  -- Re-approving an origin that already exists is ordinary (a dealer
  -- reconnecting the same website), not an error. Converge on the existing
  -- row instead of raising a unique violation. DO NOTHING rather than DO
  -- UPDATE: an approved origin's identity and authorizing event are
  -- historical facts and must not be rewritten by a later call.
  on conflict (source_id, purpose, hostname, port, path_prefix) do nothing
  returning * into v_row;

  if v_row.id is null then
    -- Lost to the conflict clause: read the row that already governs this
    -- origin and answer with it.
    select * into v_row from public.dealer_accelerator_source_origins
     where source_id = p_source_id
       and purpose = p_purpose
       and hostname = p_hostname
       and port = coalesce(p_port, 443)
       and path_prefix = coalesce(p_path_prefix, '/');
    if not found then raise exception 'origin_approval_lost'; end if;
    -- A revoked origin must never be handed back as if it were approved.
    -- Re-approval after revocation is a deliberate act with its own
    -- decision to make, not a silent side effect of reconnecting.
    if v_row.state <> 'approved' then
      raise exception 'origin_revoked:%', v_row.state;
    end if;
  end if;

  return v_row;
end
$fn$;
