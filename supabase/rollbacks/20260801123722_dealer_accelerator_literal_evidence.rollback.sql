-- ============================================================================
-- Dealer Accelerator Flight 2 — literal evidence rollback
--
-- Development/test recovery only. Production rollback authorization is a
-- separate gate. Removes the three evidence tables, the four evidence
-- functions, and the three bounded Flight 1 amendments — and nothing else.
-- Every statement is guarded so the file is re-runnable against absent or
-- partial installs (missing-function 42883, missing-table-under-policy 42P01,
-- and missing-grantee/role 42704 all short-circuit safely).
--
-- The Flight 1 batch spine (six tables, nine functions, writer role) is left
-- exactly as the spine migration built it.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Evidence functions — revoke, then drop
-- --------------------------------------------------------------------------

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
    if to_regprocedure(fn) is not null then
      if exists (select 1 from pg_roles where rolname = 'service_role') then
        execute format('revoke all on function %s from service_role', fn);
      end if;
      execute format('drop function %s', fn);
    end if;
  end loop;
end
$$;

-- --------------------------------------------------------------------------
-- 2. Policies — guarded against missing tables (IF EXISTS guards the policy,
--    not the table)
-- --------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.dealer_accelerator_observation_payloads') is not null then
    drop policy if exists dealer_accelerator_observation_payloads_writer_select
      on public.dealer_accelerator_observation_payloads;
    drop policy if exists dealer_accelerator_observation_payloads_writer_insert
      on public.dealer_accelerator_observation_payloads;
  end if;
  if to_regclass('public.dealer_accelerator_photographs') is not null then
    drop policy if exists dealer_accelerator_photographs_writer_select
      on public.dealer_accelerator_photographs;
    drop policy if exists dealer_accelerator_photographs_writer_insert
      on public.dealer_accelerator_photographs;
    drop policy if exists dealer_accelerator_photographs_writer_update
      on public.dealer_accelerator_photographs;
  end if;
  if to_regclass('public.dealer_accelerator_observation_extractions') is not null then
    drop policy if exists dealer_accelerator_observation_extractions_writer_select
      on public.dealer_accelerator_observation_extractions;
    drop policy if exists dealer_accelerator_observation_extractions_writer_insert
      on public.dealer_accelerator_observation_extractions;
  end if;
end
$$;

-- --------------------------------------------------------------------------
-- 3. Evidence tables
-- --------------------------------------------------------------------------

drop table if exists public.dealer_accelerator_observation_extractions;
drop table if exists public.dealer_accelerator_photographs;
drop table if exists public.dealer_accelerator_observation_payloads;

-- --------------------------------------------------------------------------
-- 4. Flight 1 amendment reversal — event vocabulary
--
-- Lifecycle events are append-only and are never deleted by rollback. If any
-- surviving event row already uses an evidence event type, restoring the
-- original twenty-type check would fail validation against real history, so
-- the expanded vocabulary is kept and reported. Otherwise the original check
-- is restored verbatim.
-- --------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.dealer_accelerator_lifecycle_events') is null then
    return;
  end if;
  if exists (
    select 1
      from public.dealer_accelerator_lifecycle_events
     where event_type in (
       'payload_recorded',
       'photograph_declared',
       'photograph_retrieved',
       'photograph_retrieval_failed',
       'extraction_recorded'
     )
  ) then
    raise notice
      'dealer_accelerator rollback: evidence event rows exist; expanded event vocabulary retained to preserve append-only history';
    return;
  end if;
  alter table public.dealer_accelerator_lifecycle_events
    drop constraint if exists dealer_accelerator_lifecycle_events_type_check;
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
        'item_retry_exhausted'
      )
    );
end
$$;

-- --------------------------------------------------------------------------
-- 5. Flight 1 amendment reversal — composite event key
--    (safe only after the referencing evidence tables are gone)
-- --------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.dealer_accelerator_lifecycle_events') is not null then
    alter table public.dealer_accelerator_lifecycle_events
      drop constraint if exists dealer_accelerator_lifecycle_events_id_source_key;
  end if;
end
$$;

-- --------------------------------------------------------------------------
-- 6. Flight 1 amendment reversal — extensions schema usage
-- --------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'dealer_accelerator_writer')
     and exists (select 1 from pg_namespace where nspname = 'extensions') then
    revoke usage on schema extensions from dealer_accelerator_writer;
  end if;
end
$$;
