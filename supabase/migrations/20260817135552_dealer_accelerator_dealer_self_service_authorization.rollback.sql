-- ══════════════════════════════════════════════════════════════════════════
-- ROLLBACK — dealer-performed source authorization
--
-- Restores both functions to their pre-flight form: authorize_source back to
-- nine parameters with actor_kind hardcoded to 'founder', and
-- approve_source_origin back to refusing 'dealer' and to a bare INSERT.
--
-- WHAT THIS ROLLBACK CANNOT UNDO, and must not pretend to:
-- any source_authorized event already written with actor_kind 'dealer', and
-- any origin row a dealer already approved, remain exactly as recorded. The
-- lifecycle log is append-only by design and those rows are true statements
-- about what happened. Reverting the function does not make them false, and
-- deleting them to make the schema look untouched would be the one thing
-- this table exists to prevent.
--
-- Consequence worth stating plainly: after this rollback, any dealer-facing
-- route still calling the eleven-argument form fails with an undefined
-- function. Roll the application back too, or the dealer path breaks loudly
-- rather than quietly recording founder authorship for dealer acts.
-- ══════════════════════════════════════════════════════════════════════════

drop function if exists public.dealer_accelerator_authorize_source(
  uuid, text, text, text, text, uuid, text, text, text, text, jsonb
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
    dealer_profile_id, source_type, source_locator, source_locator_key,
    authorization_basis, authorization_state, authorized_by,
    retention_terms, photograph_use_terms, adapter_scope
  ) values (
    p_dealer_profile_id, v_source_type, v_locator, v_locator_key, v_basis,
    'authorized', p_authorized_by, v_retention, v_photo_terms, v_scope
  )
  returning * into v_source;

  insert into public.dealer_accelerator_lifecycle_events (
    source_id, dealer_profile_id, entity_kind, event_type,
    resulting_state, actor_kind, actor_user_id
  ) values (
    v_source.id, v_source.dealer_profile_id, 'source', 'source_authorized',
    'authorized', 'founder', p_authorized_by
  );

  return v_source;
end
$fn$;

alter function public.dealer_accelerator_authorize_source(
  uuid, text, text, text, text, uuid, text, text, text
) owner to dealer_accelerator_writer;

-- anon and authenticated, not just PUBLIC. This function is created fresh
-- above, so Supabase's default privileges grant EXECUTE on it to both client
-- roles; a revoke from the PUBLIC pseudo-role does NOT remove explicit role
-- grants. Omitting them here would have this rollback reintroduce the exact
-- privilege escalation that 20260817135711 exists to close — a
-- SECURITY DEFINER function taking an identity as a parameter, callable by
-- any signed-in client.
revoke all on function public.dealer_accelerator_authorize_source(
  uuid, text, text, text, text, uuid, text, text, text
) from anon, authenticated, public;

grant execute on function public.dealer_accelerator_authorize_source(
  uuid, text, text, text, text, uuid, text, text, text
) to service_role;

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
