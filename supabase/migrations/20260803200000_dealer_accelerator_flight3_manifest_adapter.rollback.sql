-- ════════════════════════════════════════════════════════════════════════
-- DEALER ACCELERATOR FLIGHT 3 — ROLLBACK
-- supabase/migrations/20260803200000_dealer_accelerator_flight3_manifest_adapter.rollback.sql
--
-- Reverses every §17 amendment and removes every new Flight 3 object, in
-- dependency-safe order. Refuses if Flight 3 evidence rows exist — evidence
-- is never deleted by a rollback; a populated adapter run is retired by a
-- deliberate decision, not a schema retreat.
--
-- v8 (Layout, 2026-08-04): the forward migration's two corrections need NO
-- change here, and that is a property worth stating rather than leaving to
-- inference. The renamed CHECK
-- (dealer_accelerator_preflight_rejection_reason_check) lives on
-- dealer_accelerator_manifest_preflight_results, which section 2 drops
-- whole — this file never names it, so it cannot drift from the migration.
-- The §9.3 serialization change is confined to the body of
-- dealer_accelerator_record_manifest_line, which section 1 drops whole; the
-- two functions this file RESTORES (transition_batch, claim_item_lease) are
-- Flight 1 text and are untouched by both corrections.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── 0 · Refusals: never delete evidence, never strand new states ────────
do $do$
declare v int;
begin
  -- Double-revert idempotence (NewFav3 bench correction): a second run of
  -- this rollback is a deliberate no-op notice, never a raw
  -- missing-relation error. The captures table is the sentinel — it exists
  -- iff Flight 3 is applied.
  if to_regclass('public.dealer_accelerator_manifest_captures') is null then
    raise notice 'Flight 3 already rolled back — nothing to do.';
    return;
  end if;

  select (select count(*) from public.dealer_accelerator_manifest_captures)
       + (select count(*) from public.dealer_accelerator_manifest_preflight_results)
       + (select count(*) from public.dealer_accelerator_manifest_lines)
       + (select count(*) from public.dealer_accelerator_source_origins)
    into v;
  if v > 0 then
    raise exception 'REFUSED: % Flight 3 evidence row(s) exist — a rollback never deletes evidence', v;
  end if;
  select count(*) into v from public.dealer_accelerator_batches
   where status in ('cancel_requested', 'cancelled')
      or initialization_lease_token is not null;
  if v > 0 then
    raise exception 'REFUSED: % batch(es) hold Flight 3 states — resolve them deliberately first', v;
  end if;
  select count(*) into v from public.dealer_accelerator_photographs
   where retrieval_state = 'retrieval_terminal';
  if v > 0 then
    raise exception 'REFUSED: % photograph(s) are retrieval_terminal — the narrowed CHECK would strand them', v;
  end if;
  select count(*) into v from public.dealer_accelerator_lifecycle_events
   where event_type in ('batch_cancel_requested', 'batch_cancelled',
                        'batch_initialization_lease_claimed',
                        'batch_initialization_lease_recovered',
                        'photograph_retrieval_terminal');
  if v > 0 then
    raise exception 'REFUSED: % Flight 3 lifecycle event(s) exist — history is never deleted', v;
  end if;
end
$do$;

-- ── 1 · Drop Flight 3 functions ─────────────────────────────────────────
drop function if exists public.dealer_accelerator_record_photograph_retrieval_terminal(uuid,text,text,uuid);
drop function if exists public.dealer_accelerator_revoke_source_origin(uuid,bigint,text,uuid);
drop function if exists public.dealer_accelerator_approve_source_origin(uuid,text,text,integer,text,bigint,text,uuid);
drop function if exists public.dealer_accelerator_record_manifest_line(uuid,integer,bigint,bigint,text,text,uuid,text,uuid);
drop function if exists public.dealer_accelerator_record_manifest_preflight_result(uuid,text,text,integer,text,timestamptz,text,uuid);
drop function if exists public.dealer_accelerator_record_manifest_capture(uuid,text,text,text,text,bigint,text,timestamptz,timestamptz,bigint,text,text,text,uuid);
drop function if exists public.dealer_accelerator_request_batch_cancellation(uuid,text,uuid,text);
drop function if exists public.dealer_accelerator_surrender_item_lease(uuid,uuid,text,uuid);
drop function if exists public.dealer_accelerator_surrender_batch_initialization_lease(uuid,uuid,text,uuid);
drop function if exists public.dealer_accelerator_claim_batch_initialization_lease(uuid,uuid,integer,text,uuid);

-- ── 2 · Drop Flight 3 tables (children before parents) ──────────────────
drop table if exists public.dealer_accelerator_manifest_lines;
drop table if exists public.dealer_accelerator_manifest_preflight_results;
drop table if exists public.dealer_accelerator_manifest_captures;
drop table if exists public.dealer_accelerator_source_origins;

-- ── 3 · Restore transition_batch (pre-Flight-3 body, verbatim) ──────────
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

  select * into v_batch from public.dealer_accelerator_batches
   where id = p_batch_id for update;
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
    select authorization_state into v_source_state
      from public.dealer_accelerator_sources
     where id = v_batch.source_id for update;
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
    batch_id, dealer_profile_id, entity_kind, event_type,
    prior_state, resulting_state, actor_kind, actor_user_id, reason_code
  ) values (
    v_batch.id, v_batch.dealer_profile_id, 'batch', v_event_type,
    v_prior, v_next, v_actor, p_actor_user_id, v_reason
  );

  return v_batch;
end
$fn$;
alter function public.dealer_accelerator_transition_batch(uuid,text,text,text,uuid,text)
  owner to dealer_accelerator_writer;
revoke all on function public.dealer_accelerator_transition_batch(uuid,text,text,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.dealer_accelerator_transition_batch(uuid,text,text,text,uuid,text)
  to service_role;

-- ── 4 · Restore claim_item_lease (pre-Flight-3 body: no batch gate) ─────
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
  if p_lease_token is null then raise exception 'lease_token_required'; end if;
  if p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 86400 then
    raise exception 'lease_seconds_out_of_range';
  end if;

  select * into v_item from public.dealer_accelerator_batch_items
   where id = p_item_id for update;
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
alter function public.dealer_accelerator_claim_item_lease(uuid,uuid,integer,text,uuid)
  owner to dealer_accelerator_writer;
revoke all on function public.dealer_accelerator_claim_item_lease(uuid,uuid,integer,text,uuid)
  from public, anon, authenticated;
grant execute on function public.dealer_accelerator_claim_item_lease(uuid,uuid,integer,text,uuid)
  to service_role;

-- ── 5 · Restore photographs CHECKs (pre-Flight-3) ───────────────────────
alter table public.dealer_accelerator_photographs
  drop constraint if exists dealer_accelerator_photographs_retrieval_state_check;
alter table public.dealer_accelerator_photographs
  add constraint dealer_accelerator_photographs_retrieval_state_check
  check (retrieval_state in ('declared', 'retrieved', 'retrieval_failed'));

alter table public.dealer_accelerator_photographs
  drop constraint if exists dealer_accelerator_photographs_retrieval_truth_check;
alter table public.dealer_accelerator_photographs
  add constraint dealer_accelerator_photographs_retrieval_truth_check
  check (
    (retrieval_state = 'retrieved'
      and retrieved_at is not null and content_hash is not null
      and storage_path is not null and authorization_event_id_at_retrieval is not null)
    or
    (retrieval_state <> 'retrieved'
      and retrieved_at is null and content_hash is null
      and storage_path is null and authorization_event_id_at_retrieval is null)
  );

-- ── 6 · Restore event vocabulary (pre-Flight-3) ─────────────────────────
alter table public.dealer_accelerator_lifecycle_events
  drop constraint if exists dealer_accelerator_lifecycle_events_type_check;
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
      'extraction_recorded'
    )
  );

-- ── 7 · Restore batches CHECKs + drop initialization-lease columns ──────
alter table public.dealer_accelerator_batches
  drop constraint if exists dealer_accelerator_batches_init_lease_pair_check;
alter table public.dealer_accelerator_batches
  drop column if exists initialization_lease_token,
  drop column if exists initialization_lease_expires_at;

alter table public.dealer_accelerator_batches
  drop constraint if exists dealer_accelerator_batches_status_check;
alter table public.dealer_accelerator_batches
  add constraint dealer_accelerator_batches_status_check
  check (status in ('queued', 'running', 'completed', 'completed_with_exceptions', 'failed'));

alter table public.dealer_accelerator_batches
  drop constraint if exists dealer_accelerator_batches_status_truth_check;
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
  );

-- ── 8 · Extension: left installed deliberately ──────────────────────────
-- btree_gist is dropped only if nothing else depends on it; a shared
-- extension is not this rollback's to remove blindly.
do $do$
begin
  begin
    drop extension if exists btree_gist;
  exception when dependent_objects_still_exist then
    raise notice 'btree_gist retained: other objects depend on it.';
  end;
end
$do$;

-- ── 9 · Prove no residue ────────────────────────────────────────────────
do $do$
declare v int;
begin
  select count(*) into v from pg_tables where schemaname = 'public' and tablename like 'dealer_accelerator_manifest%';
  if v > 0 then raise exception 'ROLLBACK INCOMPLETE: % manifest table(s) remain', v; end if;
  select count(*) into v from pg_tables where schemaname = 'public' and tablename = 'dealer_accelerator_source_origins';
  if v > 0 then raise exception 'ROLLBACK INCOMPLETE: source_origins remains'; end if;
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in
     ('dealer_accelerator_claim_batch_initialization_lease',
      'dealer_accelerator_surrender_batch_initialization_lease',
      'dealer_accelerator_surrender_item_lease',
      'dealer_accelerator_request_batch_cancellation',
      'dealer_accelerator_record_manifest_capture',
      'dealer_accelerator_record_manifest_preflight_result',
      'dealer_accelerator_record_manifest_line',
      'dealer_accelerator_approve_source_origin',
      'dealer_accelerator_revoke_source_origin',
      'dealer_accelerator_record_photograph_retrieval_terminal');
  if v > 0 then raise exception 'ROLLBACK INCOMPLETE: % Flight 3 function(s) remain', v; end if;
  select count(*) into v from information_schema.columns
   where table_schema = 'public' and table_name = 'dealer_accelerator_batches'
     and column_name like 'initialization_lease%';
  if v > 0 then raise exception 'ROLLBACK INCOMPLETE: initialization-lease columns remain'; end if;
  raise notice 'Flight 3 rollback clean — all amendments reversed, all evidence preserved by refusal.';
end
$do$;

commit;
