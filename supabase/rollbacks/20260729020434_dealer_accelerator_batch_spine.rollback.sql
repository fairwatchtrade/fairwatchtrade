-- Dealer Accelerator Batch Spine — Flight 1 rollback.
-- This reverses only the durable objects introduced by the paired migration.

do $revoke$
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
    -- Repeatable Rollback Law: a target that was never created is already
    -- clean. to_regprocedure yields null for an unknown signature instead of
    -- raising, so only functions that actually exist are touched. A real
    -- revoke failure on an existing function still aborts, as it should.
    if to_regprocedure(fn) is not null then
      execute format('revoke execute on function %s from service_role', fn);
      execute format('revoke execute on function %s from public', fn);
      execute format('revoke execute on function %s from anon', fn);
      execute format('revoke execute on function %s from authenticated', fn);
    end if;
  end loop;
end
$revoke$;

drop function if exists public.dealer_accelerator_record_item_retry(
  uuid,
  uuid,
  text,
  timestamptz,
  boolean,
  text,
  uuid
);

drop function if exists public.dealer_accelerator_claim_item_lease(
  uuid,
  uuid,
  integer,
  text,
  uuid
);

drop function if exists public.dealer_accelerator_transition_item(
  uuid,
  text,
  text,
  text,
  uuid,
  text
);

drop function if exists public.dealer_accelerator_record_observation(
  uuid,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid
);

drop function if exists public.dealer_accelerator_transition_batch(
  uuid,
  text,
  text,
  text,
  uuid,
  text
);

drop function if exists public.dealer_accelerator_register_or_get_item(
  uuid,
  text,
  text,
  uuid
);

drop function if exists public.dealer_accelerator_create_or_get_batch(
  uuid,
  text,
  text,
  text,
  integer,
  text,
  uuid
);

drop function if exists public.dealer_accelerator_transition_source(
  uuid,
  text,
  uuid,
  text
);

drop function if exists public.dealer_accelerator_authorize_source(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text
);

-- `drop policy if exists` guards only the POLICY's existence, not the table's:
-- against a missing table it raises undefined_table (42P01). Each table is
-- therefore checked first, so a partially-applied migration rolls back cleanly.
do $policies$
declare
  rec record;
begin
  for rec in
    select *
      from (values
        ('dealer_accelerator_lifecycle_events_writer_insert', 'public.dealer_accelerator_lifecycle_events'),
        ('dealer_accelerator_lifecycle_events_writer_select', 'public.dealer_accelerator_lifecycle_events'),
        ('dealer_accelerator_observations_writer_insert',     'public.dealer_accelerator_observations'),
        ('dealer_accelerator_observations_writer_select',     'public.dealer_accelerator_observations'),
        ('dealer_accelerator_batch_items_writer_update',      'public.dealer_accelerator_batch_items'),
        ('dealer_accelerator_batch_items_writer_insert',      'public.dealer_accelerator_batch_items'),
        ('dealer_accelerator_batch_items_writer_select',      'public.dealer_accelerator_batch_items'),
        ('dealer_accelerator_batches_writer_update',          'public.dealer_accelerator_batches'),
        ('dealer_accelerator_batches_writer_insert',          'public.dealer_accelerator_batches'),
        ('dealer_accelerator_batches_writer_select',          'public.dealer_accelerator_batches'),
        ('dealer_accelerator_source_items_writer_insert',     'public.dealer_accelerator_source_items'),
        ('dealer_accelerator_source_items_writer_select',     'public.dealer_accelerator_source_items'),
        ('dealer_accelerator_sources_writer_update',          'public.dealer_accelerator_sources'),
        ('dealer_accelerator_sources_writer_insert',          'public.dealer_accelerator_sources'),
        ('dealer_accelerator_sources_writer_select',          'public.dealer_accelerator_sources')
      ) as t(policy_name, table_name)
  loop
    if to_regclass(rec.table_name) is not null then
      execute format('drop policy if exists %I on %s', rec.policy_name, rec.table_name);
    end if;
  end loop;
end
$policies$;

drop table if exists public.dealer_accelerator_lifecycle_events;
drop table if exists public.dealer_accelerator_observations;
drop table if exists public.dealer_accelerator_batch_items;
drop table if exists public.dealer_accelerator_batches;
drop table if exists public.dealer_accelerator_source_items;
drop table if exists public.dealer_accelerator_sources;

-- The paired migration grants nothing on public.profiles or auth.users, so
-- there is nothing to revoke there. Parity is intentional, not an omission.
--
-- All three role statements raise undefined_object (42704) when the role was
-- never created, so they are gated on the role existing. The only tolerated
-- failure is the specific dependent-objects case below; anything else still
-- aborts the rollback loudly.
do $role$
begin
  if exists (select 1 from pg_roles where rolname = 'dealer_accelerator_writer') then
    revoke dealer_accelerator_writer from postgres;
    revoke usage, create on schema public from dealer_accelerator_writer;

    begin
      drop role dealer_accelerator_writer;
    exception
      when dependent_objects_still_exist then
        raise notice
          'dealer_accelerator_writer retained because objects outside this migration still depend on it';
    end;
  end if;
end
$role$;
