-- Dealer Accelerator Batch Spine — Flight 1 rollback-safe verification.
-- Run only against a local/test database in this exact wrapper:
--
-- begin;
-- \i supabase/migrations/20260729020434_dealer_accelerator_batch_spine.sql
-- \i scripts/dealer-accelerator-batch-spine.test.sql
-- rollback;

create temporary table dealer_accelerator_flight_1_results (
  assertion text primary key,
  passed boolean not null,
  detail text not null
) on commit drop;

create or replace function pg_temp.dealer_accelerator_assert(
  p_assertion text,
  p_passed boolean,
  p_detail text
)
returns void
language plpgsql
as $assert$
begin
  insert into dealer_accelerator_flight_1_results (
    assertion,
    passed,
    detail
  ) values (
    p_assertion,
    coalesce(p_passed, false),
    p_detail
  );
end
$assert$;

do $test$
declare
  v_dealer uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
  v_actor uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
  v_missing uuid := gen_random_uuid();
  v_source public.dealer_accelerator_sources;
  v_source_repeat public.dealer_accelerator_sources;
  v_source_state public.dealer_accelerator_sources;
  v_source_other public.dealer_accelerator_sources;
  v_batch public.dealer_accelerator_batches;
  v_batch_repeat public.dealer_accelerator_batches;
  v_batch_second public.dealer_accelerator_batches;
  v_batch_other public.dealer_accelerator_batches;
  v_item public.dealer_accelerator_batch_items;
  v_item_repeat public.dealer_accelerator_batch_items;
  v_item_second public.dealer_accelerator_batch_items;
  v_item_other public.dealer_accelerator_batch_items;
  v_observation public.dealer_accelerator_observations;
  v_observation_repeat public.dealer_accelerator_observations;
  v_observation_changed public.dealer_accelerator_observations;
  v_observed_at timestamptz := '2026-07-29 02:30:00+00';
  v_token_one uuid := gen_random_uuid();
  v_token_two uuid := gen_random_uuid();
  v_token_three uuid := gen_random_uuid();
  v_before bigint;
  v_after bigint;
  v_listing_count bigint;
  v_media_count bigint;
  v_notification_count bigint;
  v_vault_brand_count bigint;
  v_vault_collection_count bigint;
  v_vault_family_count bigint;
  v_vault_variant_count bigint;
  v_vault_reference_count bigint;
  v_vault_event_count bigint;
  v_metadata jsonb;
begin
  if not exists (
    select 1 from public.profiles where id = v_dealer
  ) or not exists (
    select 1 from auth.users where id = v_actor
  ) then
    raise exception
      'Local/test prerequisite missing: expected existing dealer profile and auth actor %',
      v_dealer;
  end if;

  select count(*) into v_listing_count from public.listings;
  select count(*) into v_media_count from public.listing_media;
  select count(*) into v_notification_count from public.notifications;
  select count(*) into v_vault_brand_count from public.vault_brands;
  select count(*) into v_vault_collection_count from public.vault_collections;
  select count(*) into v_vault_family_count from public.vault_families;
  select count(*) into v_vault_variant_count from public.vault_variants;
  select count(*) into v_vault_reference_count from public.vault_references;
  select count(*) into v_vault_event_count from public.vault_enrichment_events;

  select * into v_source
  from public.dealer_accelerator_authorize_source(
    v_dealer,
    'static_json_manifest',
    'test://dealer/primary.json',
    'dealer-primary-json',
    'written dealer authorization',
    v_actor,
    'retain source evidence for marketplace audit',
    'dealer grants marketplace listing use',
    'inventory-v1'
  );

  perform pg_temp.dealer_accelerator_assert(
    'source ownership binds to an existing dealer profile',
    v_source.dealer_profile_id = v_dealer
      and v_source.authorized_by = v_actor
      and v_source.authorization_state = 'authorized',
    'source parent and authorizer are existing repository identities'
  );

  select * into v_source_repeat
  from public.dealer_accelerator_authorize_source(
    v_dealer,
    'static_json_manifest',
    'test://dealer/primary.json',
    'dealer-primary-json',
    'written dealer authorization',
    v_actor,
    'retain source evidence for marketplace audit',
    'dealer grants marketplace listing use',
    'inventory-v1'
  );

  perform pg_temp.dealer_accelerator_assert(
    'duplicate active authorization returns existing truth',
    v_source_repeat.id = v_source.id
      and (
        select count(*)
        from public.dealer_accelerator_sources
        where dealer_profile_id = v_dealer
          and source_type = 'static_json_manifest'
          and source_locator_key = 'dealer-primary-json'
          and adapter_scope = 'inventory-v1'
          and authorization_state <> 'revoked'
      ) = 1
      and (
        select count(*)
        from public.dealer_accelerator_lifecycle_events
        where source_id = v_source.id
          and event_type = 'source_authorized'
      ) = 1,
    'identical active authorization is represented and evented once'
  );

  begin
    perform public.dealer_accelerator_authorize_source(
      v_dealer,
      'static_json_manifest',
      'test://dealer/primary.json',
      'dealer-primary-json',
      'different authorization',
      v_actor,
      'retain source evidence for marketplace audit',
      'dealer grants marketplace listing use',
      'inventory-v1'
    );
    perform pg_temp.dealer_accelerator_assert(
      'materially different authorization terms fail',
      false,
      'conflicting terms were silently merged'
    );
  exception when others then
    perform pg_temp.dealer_accelerator_assert(
      'materially different authorization terms fail',
      sqlerrm like '%active_source_authorization_conflict%',
      sqlerrm
    );
  end;

  begin
    perform public.dealer_accelerator_authorize_source(
      v_missing,
      'static_json_manifest',
      'test://dealer/missing.json',
      'missing-dealer-json',
      'written dealer authorization',
      v_actor,
      'retain source evidence for marketplace audit',
      'dealer grants marketplace listing use',
      'inventory-v1'
    );
    perform pg_temp.dealer_accelerator_assert(
      'unknown dealer ownership fails',
      false,
      'source accepted a missing dealer'
    );
  exception when others then
    perform pg_temp.dealer_accelerator_assert(
      'unknown dealer ownership fails',
      sqlstate = '23503'
        and sqlerrm like '%dealer_accelerator_sources_dealer_fk%',
      sqlerrm
    );
  end;

  select * into v_batch
  from public.dealer_accelerator_create_or_get_batch(
    v_source.id,
    'adapter-1',
    'snapshot-1',
    'batch-request-1',
    25,
    'founder',
    v_actor
  );

  perform pg_temp.dealer_accelerator_assert(
    'authorized source can begin a batch',
    v_batch.source_id = v_source.id
      and v_batch.dealer_profile_id = v_dealer
      and v_batch.status = 'queued',
    'authorized source produced one queued batch'
  );

  select * into v_batch_repeat
  from public.dealer_accelerator_create_or_get_batch(
    v_source.id,
    'adapter-1',
    'snapshot-1',
    'batch-request-1',
    25,
    'founder',
    v_actor
  );
  perform pg_temp.dealer_accelerator_assert(
    'same idempotency key returns the same batch',
    v_batch_repeat.id = v_batch.id,
    'exact retry returned the original batch'
  );

  select * into v_batch_repeat
  from public.dealer_accelerator_create_or_get_batch(
    v_source.id,
    'adapter-1',
    'snapshot-1',
    'different-request-for-same-snapshot',
    25,
    'system',
    null
  );
  perform pg_temp.dealer_accelerator_assert(
    'same snapshot and adapter returns the same batch',
    v_batch_repeat.id = v_batch.id,
    'snapshot replay returned the original batch'
  );

  begin
    perform public.dealer_accelerator_create_or_get_batch(
      v_source.id,
      'adapter-2',
      'snapshot-conflict',
      'batch-request-1',
      25,
      'system',
      null
    );
    perform pg_temp.dealer_accelerator_assert(
      'conflicting immutable batch values fail',
      false,
      'reused key accepted conflicting immutable values'
    );
  exception when others then
    perform pg_temp.dealer_accelerator_assert(
      'conflicting immutable batch values fail',
      sqlerrm like '%batch_idempotency_conflict%',
      sqlerrm
    );
  end;

  select * into v_source_state
  from public.dealer_accelerator_authorize_source(
    v_dealer,
    'static_csv_manifest',
    'test://dealer/state.csv',
    'dealer-state-csv',
    'written dealer authorization',
    v_actor,
    'retain source evidence for marketplace audit',
    'dealer grants marketplace listing use',
    'inventory-v1'
  );
  select * into v_source_state
  from public.dealer_accelerator_transition_source(
    v_source_state.id, 'suspended', v_actor, 'dealer_pause'
  );

  begin
    perform public.dealer_accelerator_create_or_get_batch(
      v_source_state.id, 'adapter-1', 'suspended-snapshot',
      'suspended-request', 5, 'system', null
    );
    perform pg_temp.dealer_accelerator_assert(
      'suspended source cannot begin a batch',
      false,
      'suspended source created a batch'
    );
  exception when others then
    perform pg_temp.dealer_accelerator_assert(
      'suspended source cannot begin a batch',
      sqlerrm like '%source_not_authorized:suspended%',
      sqlerrm
    );
  end;

  select * into v_source_state
  from public.dealer_accelerator_transition_source(
    v_source_state.id, 'authorized', v_actor, 'dealer_resumed'
  );
  select * into v_source_state
  from public.dealer_accelerator_transition_source(
    v_source_state.id, 'revoked', v_actor, 'authorization_withdrawn'
  );

  begin
    perform public.dealer_accelerator_create_or_get_batch(
      v_source_state.id, 'adapter-1', 'revoked-snapshot',
      'revoked-request', 5, 'system', null
    );
    perform pg_temp.dealer_accelerator_assert(
      'revoked source cannot begin a batch',
      false,
      'revoked source created a batch'
    );
  exception when others then
    perform pg_temp.dealer_accelerator_assert(
      'revoked source cannot begin a batch',
      sqlerrm like '%source_not_authorized:revoked%',
      sqlerrm
    );
  end;

  begin
    perform public.dealer_accelerator_transition_source(
      v_source_state.id, 'authorized', v_actor, 'invalid_reactivation'
    );
    perform pg_temp.dealer_accelerator_assert(
      'revoked source is terminal',
      false,
      'revoked source was reactivated'
    );
  exception when others then
    perform pg_temp.dealer_accelerator_assert(
      'revoked source is terminal',
      sqlerrm like '%invalid_source_transition:revoked->authorized%',
      sqlerrm
    );
  end;

  select * into v_batch
  from public.dealer_accelerator_transition_batch(
    v_batch.id, 'running', null, 'worker', null, null
  );

  v_before := (
    select count(*) from public.dealer_accelerator_lifecycle_events
    where batch_id = v_batch.id
  );
  begin
    perform public.dealer_accelerator_transition_batch(
      v_batch.id, 'queued', null, 'worker', null, null
    );
  exception when others then
    null;
  end;
  v_after := (
    select count(*) from public.dealer_accelerator_lifecycle_events
    where batch_id = v_batch.id
  );
  perform pg_temp.dealer_accelerator_assert(
    'rejected batch transition appends no event',
    v_after = v_before,
    'running to queued was rejected atomically'
  );

  select * into v_batch_second
  from public.dealer_accelerator_create_or_get_batch(
    v_source.id,
    'adapter-1',
    'snapshot-2',
    'batch-request-2',
    25,
    'system',
    null
  );
  select * into v_batch_second
  from public.dealer_accelerator_transition_batch(
    v_batch_second.id, 'running', null, 'worker', null, null
  );

  select * into v_item
  from public.dealer_accelerator_register_or_get_item(
    v_batch.id, 'watch-001', 'worker', null
  );
  select * into v_item_repeat
  from public.dealer_accelerator_register_or_get_item(
    v_batch.id, 'watch-001', 'worker', null
  );

  perform pg_temp.dealer_accelerator_assert(
    'same source item in one batch returns the same processing item',
    v_item_repeat.id = v_item.id
      and (
        select count(*) from public.dealer_accelerator_batch_items
        where batch_id = v_batch.id
          and source_item_id = v_item.source_item_id
      ) = 1
      and (
        select count(*) from public.dealer_accelerator_lifecycle_events
        where batch_item_id = v_item.id
          and event_type = 'item_registered'
      ) = 1,
    'batch processing registration and its event are idempotent'
  );

  select * into v_item_second
  from public.dealer_accelerator_register_or_get_item(
    v_batch_second.id, 'watch-001', 'worker', null
  );

  perform pg_temp.dealer_accelerator_assert(
    'stable source item identity survives later batches',
    v_item_second.id <> v_item.id
      and v_item_second.source_item_id = v_item.source_item_id
      and (
        select count(*) from public.dealer_accelerator_source_items
        where id = v_item.source_item_id
          and source_id = v_source.id
          and source_item_key = 'watch-001'
      ) = 1
      and (
        select count(*) from public.dealer_accelerator_lifecycle_events
        where source_item_id = v_item.source_item_id
          and event_type = 'source_item_registered'
      ) = 1,
    'one immutable source identity has separate batch processing occurrences'
  );

  select * into v_observation
  from public.dealer_accelerator_record_observation(
    v_item.id,
    v_observed_at,
    'adapter-1',
    'source-v1',
    repeat('a', 64),
    'snapshot-watch-001-v1',
    'unassessed',
    'worker',
    null
  );
  v_before := (
    select count(*) from public.dealer_accelerator_lifecycle_events
    where observation_id = v_observation.id
      and event_type = 'observation_recorded'
  );
  select * into v_observation_repeat
  from public.dealer_accelerator_record_observation(
    v_item_second.id,
    v_observed_at,
    'adapter-1',
    'source-v1',
    repeat('a', 64),
    'snapshot-watch-001-v1',
    'unassessed',
    'worker',
    null
  );
  v_after := (
    select count(*) from public.dealer_accelerator_lifecycle_events
    where observation_id = v_observation.id
      and event_type = 'observation_recorded'
  );

  perform pg_temp.dealer_accelerator_assert(
    'exact observation replay is idempotent without a duplicate event',
    v_observation_repeat.id = v_observation.id
      and (
        select count(*) from public.dealer_accelerator_observations
        where source_item_id = v_item.source_item_id
          and observation_hash = repeat('a', 64)
      ) = 1
      and v_before = 1
      and v_after = v_before,
    'identical immutable observation truth and event are represented once'
  );

  select * into v_observation_changed
  from public.dealer_accelerator_record_observation(
    v_item_second.id,
    v_observed_at + interval '1 hour',
    'adapter-1',
    'source-v2',
    repeat('b', 64),
    'snapshot-watch-001-v2',
    'ambiguous',
    'worker',
    null
  );

  perform pg_temp.dealer_accelerator_assert(
    'changed content under one source item creates a preserved observation',
    v_observation_changed.id <> v_observation.id
      and v_observation_changed.source_item_id = v_observation.source_item_id
      and (
        select count(*) from public.dealer_accelerator_observations
        where source_item_id = v_observation.source_item_id
      ) = 2
      and (
        select count(*) from public.dealer_accelerator_lifecycle_events
        where observation_id in (v_observation.id, v_observation_changed.id)
          and event_type = 'observation_recorded'
      ) = 2,
    'source-ID reuse preserves both immutable snapshots and both events'
  );

  perform pg_temp.dealer_accelerator_assert(
    'ambiguous continuity remains unresolved',
    v_observation_changed.continuity_state = 'ambiguous'
      and v_observation_changed.source_item_id = v_observation.source_item_id
      and not exists (
        select 1
        from public.dealer_accelerator_batch_items
        where source_item_id = v_observation.source_item_id
          and listing_id is not null
      ),
    'ambiguity neither merges physical identity nor creates listing identity'
  );

  v_before := (
    select count(*) from public.dealer_accelerator_observations
    where source_item_id = v_item.source_item_id
  );
  begin
    perform public.dealer_accelerator_record_observation(
      v_item.id,
      v_observed_at + interval '2 hours',
      'adapter-1',
      'source-v3',
      repeat('c', 64),
      'snapshot-watch-001-v3',
      'confirmed_same_watch',
      'worker',
      null
    );
    perform pg_temp.dealer_accelerator_assert(
      'unbacked confirmed-same continuity is unavailable in Flight 1',
      false,
      'confirmed_same_watch was accepted without governed evidence'
    );
  exception when others then
    perform pg_temp.dealer_accelerator_assert(
      'unbacked confirmed-same continuity is unavailable in Flight 1',
      sqlerrm like '%confirmed_same_watch_requires_governed_evidence%'
        and (
          select count(*) from public.dealer_accelerator_observations
          where source_item_id = v_item.source_item_id
        ) = v_before,
      sqlerrm
    );
  end;

  begin
    perform public.dealer_accelerator_record_observation(
      v_item.id,
      v_observed_at,
      'adapter-1',
      'source-v1',
      repeat('a', 64),
      'conflicting-snapshot',
      'unassessed',
      'worker',
      null
    );
    perform pg_temp.dealer_accelerator_assert(
      'observation hash cannot identify conflicting immutable truth',
      false,
      'one content hash accepted conflicting snapshot identity'
    );
  exception when others then
    perform pg_temp.dealer_accelerator_assert(
      'observation hash cannot identify conflicting immutable truth',
      sqlerrm like '%observation_hash_conflict%',
      sqlerrm
    );
  end;

  select * into v_source_other
  from public.dealer_accelerator_authorize_source(
    v_dealer,
    'static_json_manifest',
    'test://dealer/other.json',
    'dealer-other-json',
    'written dealer authorization',
    v_actor,
    'retain source evidence for marketplace audit',
    'dealer grants marketplace listing use',
    'inventory-v1'
  );
  select * into v_batch_other
  from public.dealer_accelerator_create_or_get_batch(
    v_source_other.id, 'adapter-1', 'other-snapshot',
    'other-request', 10, 'system', null
  );
  select * into v_batch_other
  from public.dealer_accelerator_transition_batch(
    v_batch_other.id, 'running', null, 'worker', null, null
  );
  select * into v_item_other
  from public.dealer_accelerator_register_or_get_item(
    v_batch_other.id, 'watch-other', 'worker', null
  );

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
      v_item_other.source_item_id,
      v_item.id,
      v_item.batch_id,
      v_item.source_id,
      v_item.dealer_profile_id,
      v_observed_at,
      'adapter-1',
      'invalid-cross-source',
      repeat('d', 64),
      'invalid-cross-source',
      'ambiguous'
    );
    perform pg_temp.dealer_accelerator_assert(
      'cross-source observation attachment fails structurally',
      false,
      'observation crossed source-item ancestry'
    );
  exception when foreign_key_violation then
    perform pg_temp.dealer_accelerator_assert(
      'cross-source observation attachment fails structurally',
      true,
      sqlerrm
    );
  end;

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
      v_item_second.batch_id,
      v_item.source_id,
      v_item.dealer_profile_id,
      v_observed_at,
      'adapter-1',
      'invalid-cross-item',
      repeat('e', 64),
      'invalid-cross-item',
      'ambiguous'
    );
    perform pg_temp.dealer_accelerator_assert(
      'cross-item observation attachment fails structurally',
      false,
      'observation crossed batch-item ancestry'
    );
  exception when foreign_key_violation then
    perform pg_temp.dealer_accelerator_assert(
      'cross-item observation attachment fails structurally',
      true,
      sqlerrm
    );
  end;

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
      v_missing,
      v_observed_at,
      'adapter-1',
      'invalid-cross-dealer',
      repeat('f', 64),
      'invalid-cross-dealer',
      'ambiguous'
    );
    perform pg_temp.dealer_accelerator_assert(
      'cross-dealer observation attachment fails structurally',
      false,
      'observation crossed dealer ancestry'
    );
  exception when foreign_key_violation then
    perform pg_temp.dealer_accelerator_assert(
      'cross-dealer observation attachment fails structurally',
      true,
      sqlerrm
    );
  end;

  select metadata into v_metadata
  from public.dealer_accelerator_lifecycle_events
  where observation_id = v_observation.id
    and event_type = 'observation_recorded';

  select * into v_item
  from public.dealer_accelerator_transition_item(
    v_item.id, 'ready', null, 'worker', null, null
  );

  v_before := (
    select count(*) from public.dealer_accelerator_lifecycle_events
    where batch_item_id = v_item.id
  );
  begin
    perform public.dealer_accelerator_transition_item(
      v_item.id, 'draft_created', null, 'worker', null, null
    );
  exception when others then
    null;
  end;
  v_after := (
    select count(*) from public.dealer_accelerator_lifecycle_events
    where batch_item_id = v_item.id
  );
  perform pg_temp.dealer_accelerator_assert(
    'general transition cannot reach draft_created',
    v_item.status = 'ready'
      and v_item.listing_id is null
      and v_after = v_before,
    'reserved materialization state was rejected without an event'
  );

  begin
    perform public.dealer_accelerator_transition_item(
      v_item.id, 'blocked', null, 'worker', null, null
    );
    perform pg_temp.dealer_accelerator_assert(
      'blocked state requires a reason',
      false,
      'blocked state accepted no reason'
    );
  exception when others then
    perform pg_temp.dealer_accelerator_assert(
      'blocked state requires a reason',
      sqlerrm like '%blocked_reason_required%',
      sqlerrm
    );
  end;

  select * into v_item
  from public.dealer_accelerator_transition_item(
    v_item.id, 'blocked', 'identity_ambiguous',
    'worker', null, 'identity_ambiguous'
  );

  begin
    perform public.dealer_accelerator_transition_item(
      v_item.id, 'ready', 'stale_reason', 'worker', null, null
    );
    perform pg_temp.dealer_accelerator_assert(
      'nonblocked state cannot retain a blocked reason',
      false,
      'ready state accepted a blocked reason'
    );
  exception when others then
    perform pg_temp.dealer_accelerator_assert(
      'nonblocked state cannot retain a blocked reason',
      sqlerrm like '%blocked_reason_not_allowed%',
      sqlerrm
    );
  end;

  select * into v_item
  from public.dealer_accelerator_transition_item(
    v_item.id, 'ready', null, 'worker', null, 'identity_resolved'
  );

  v_before := (
    select count(*) from public.dealer_accelerator_lifecycle_events
    where batch_item_id = v_item.id
  );
  select * into v_item
  from public.dealer_accelerator_claim_item_lease(
    v_item.id, v_token_one, 1, 'worker', null
  );
  v_after := (
    select count(*) from public.dealer_accelerator_lifecycle_events
    where batch_item_id = v_item.id
  );
  perform pg_temp.dealer_accelerator_assert(
    'eligible item can be leased',
    v_item.lease_token = v_token_one
      and v_item.lease_expires_at > now()
      and v_after = v_before + 1,
    'claim stored one token and appended one event'
  );

  v_before := v_after;
  begin
    perform public.dealer_accelerator_claim_item_lease(
      v_item.id, v_token_two, 30, 'worker', null
    );
  exception when others then
    null;
  end;
  v_after := (
    select count(*) from public.dealer_accelerator_lifecycle_events
    where batch_item_id = v_item.id
  );
  perform pg_temp.dealer_accelerator_assert(
    'unexpired lease cannot be stolen',
    (
      select lease_token = v_token_one
      from public.dealer_accelerator_batch_items
      where id = v_item.id
    ) and v_after = v_before,
    'competing token was rejected without an event'
  );

  perform pg_sleep(1.1);
  v_before := (
    select count(*) from public.dealer_accelerator_lifecycle_events
    where batch_item_id = v_item.id
      and event_type = 'item_lease_recovered'
  );
  select * into v_item
  from public.dealer_accelerator_claim_item_lease(
    v_item.id, v_token_two, 30, 'worker', null
  );
  v_after := (
    select count(*) from public.dealer_accelerator_lifecycle_events
    where batch_item_id = v_item.id
      and event_type = 'item_lease_recovered'
  );
  perform pg_temp.dealer_accelerator_assert(
    'expired lease is recovered with exactly one event',
    v_item.lease_token = v_token_two and v_after = v_before + 1,
    'expired ownership transferred through the controlled claim'
  );

  select * into v_item
  from public.dealer_accelerator_record_item_retry(
    v_item.id,
    v_token_two,
    'temporary_source_error',
    now() + interval '1 second',
    false,
    'worker',
    null
  );
  perform pg_temp.dealer_accelerator_assert(
    'retry increments attempts, clears lease, and schedules next attempt',
    v_item.attempt_count = 1
      and v_item.lease_token is null
      and v_item.lease_expires_at is null
      and v_item.next_attempt_at > now(),
    'first technical retry preserved a due time'
  );

  perform pg_sleep(1.1);
  select * into v_item
  from public.dealer_accelerator_claim_item_lease(
    v_item.id, v_token_three, 30, 'worker', null
  );
  select * into v_item
  from public.dealer_accelerator_record_item_retry(
    v_item.id,
    v_token_three,
    'source_retry_exhausted',
    null,
    true,
    'worker',
    null
  );
  perform pg_temp.dealer_accelerator_assert(
    'exhausted retry blocks with durable retry history',
    v_item.status = 'blocked'
      and v_item.blocked_reason_code = 'technical_retry_exhausted'
      and v_item.attempt_count = 2
      and v_item.lease_token is null
      and (
        select count(*)
        from public.dealer_accelerator_lifecycle_events
        where batch_item_id = v_item.id
          and event_type in ('item_retry_scheduled', 'item_retry_exhausted')
      ) = 2,
    'scheduled and exhausted retry events both remain'
  );

  perform pg_temp.dealer_accelerator_assert(
    'observation event metadata remains unchanged',
    (
      select metadata = v_metadata
      from public.dealer_accelerator_lifecycle_events
      where observation_id = v_observation.id
        and event_type = 'observation_recorded'
    ),
    'original immutable observation metadata survived later processing'
  );

  select * into v_item_other
  from public.dealer_accelerator_transition_item(
    v_item_other.id,
    'blocked',
    'identity_ambiguous',
    'worker',
    null,
    'identity_ambiguous'
  );
  perform pg_temp.dealer_accelerator_assert(
    'discovered item may block with a reason',
    v_item_other.status = 'blocked'
      and v_item_other.blocked_reason_code = 'identity_ambiguous'
      and v_item_other.listing_id is null,
    'second allowed discovered transition passed'
  );

  select * into v_batch
  from public.dealer_accelerator_transition_batch(
    v_batch.id, 'failed', 'adapter_fault', 'worker', null, 'adapter_fault'
  );
  perform pg_temp.dealer_accelerator_assert(
    'failed batch timestamps and error match status truth',
    v_batch.status = 'failed'
      and v_batch.failed_at is not null
      and v_batch.completed_at is null
      and v_batch.fatal_error_code = 'adapter_fault',
    'failed truth is internally consistent'
  );

  v_before := (
    select count(*) from public.dealer_accelerator_lifecycle_events
    where batch_id = v_batch.id
      and event_type = 'batch_retry_queued'
  );
  select * into v_batch
  from public.dealer_accelerator_transition_batch(
    v_batch.id, 'queued', null, 'worker', null, 'technical_retry'
  );
  v_after := (
    select count(*) from public.dealer_accelerator_lifecycle_events
    where batch_id = v_batch.id
      and event_type = 'batch_retry_queued'
  );
  perform pg_temp.dealer_accelerator_assert(
    'failed batch can queue one explicit retry event',
    v_batch.status = 'queued'
      and v_batch.failed_at is null
      and v_batch.fatal_error_code is null
      and v_after = v_before + 1,
    'failed to queued is explicit and atomic'
  );

  select * into v_batch
  from public.dealer_accelerator_transition_batch(
    v_batch.id, 'running', null, 'worker', null, null
  );
  select * into v_batch
  from public.dealer_accelerator_transition_batch(
    v_batch.id, 'completed', null, 'worker', null, null
  );
  perform pg_temp.dealer_accelerator_assert(
    'completed batch timestamps match status truth',
    v_batch.status = 'completed'
      and v_batch.started_at is not null
      and v_batch.completed_at is not null
      and v_batch.failed_at is null
      and v_batch.fatal_error_code is null,
    'completed truth is internally consistent'
  );

  v_before := (
    select count(*) from public.dealer_accelerator_lifecycle_events
    where batch_id = v_batch.id
  );
  begin
    perform public.dealer_accelerator_transition_batch(
      v_batch.id, 'failed', 'late_failure', 'worker', null, null
    );
  exception when others then
    null;
  end;
  v_after := (
    select count(*) from public.dealer_accelerator_lifecycle_events
    where batch_id = v_batch.id
  );
  perform pg_temp.dealer_accelerator_assert(
    'completed batch is terminal',
    (
      select status = 'completed'
      from public.dealer_accelerator_batches
      where id = v_batch.id
    ) and v_after = v_before,
    'terminal transition was rejected without an event'
  );

  select * into v_batch_second
  from public.dealer_accelerator_transition_batch(
    v_batch_second.id,
    'completed_with_exceptions',
    null,
    'worker',
    null,
    'one_item_requires_correction'
  );
  v_before := (
    select count(*) from public.dealer_accelerator_lifecycle_events
    where batch_id = v_batch_second.id
  );
  begin
    perform public.dealer_accelerator_transition_batch(
      v_batch_second.id, 'queued', null, 'worker', null, null
    );
  exception when others then
    null;
  end;
  v_after := (
    select count(*) from public.dealer_accelerator_lifecycle_events
    where batch_id = v_batch_second.id
  );
  perform pg_temp.dealer_accelerator_assert(
    'completed-with-exceptions batch is terminal',
    v_batch_second.status = 'completed_with_exceptions'
      and v_batch_second.started_at is not null
      and v_batch_second.completed_at is not null
      and v_batch_second.failed_at is null
      and v_batch_second.fatal_error_code is null
      and v_after = v_before,
    'alternate completed truth is terminal and internally consistent'
  );

  perform pg_temp.dealer_accelerator_assert(
    'events preserve same-parent truth',
    not exists (
      select 1
      from public.dealer_accelerator_lifecycle_events e
      left join public.dealer_accelerator_sources s
        on s.id = e.source_id
      left join public.dealer_accelerator_source_items si
        on si.id = e.source_item_id
      left join public.dealer_accelerator_batches b
        on b.id = e.batch_id
      left join public.dealer_accelerator_batch_items i
        on i.id = e.batch_item_id
      left join public.dealer_accelerator_observations o
        on o.id = e.observation_id
      where (e.source_id is not null and s.dealer_profile_id <> e.dealer_profile_id)
         or (e.source_item_id is not null and si.dealer_profile_id <> e.dealer_profile_id)
         or (e.batch_id is not null and b.dealer_profile_id <> e.dealer_profile_id)
         or (e.batch_item_id is not null and i.dealer_profile_id <> e.dealer_profile_id)
         or (e.observation_id is not null and o.dealer_profile_id <> e.dealer_profile_id)
    ),
    'source, stable-item, batch, processing-item, and observation event parents match'
  );

  perform pg_temp.dealer_accelerator_assert(
    'protected repository data is unchanged',
    (select count(*) from public.listings) = v_listing_count
      and (select count(*) from public.listing_media) = v_media_count
      and (select count(*) from public.notifications) = v_notification_count
      and (select count(*) from public.vault_brands) = v_vault_brand_count
      and (select count(*) from public.vault_collections) = v_vault_collection_count
      and (select count(*) from public.vault_families) = v_vault_family_count
      and (select count(*) from public.vault_variants) = v_vault_variant_count
      and (select count(*) from public.vault_references) = v_vault_reference_count
      and (select count(*) from public.vault_enrichment_events) = v_vault_event_count,
    'listings, media, notifications, and Vault row counts match the opening snapshot'
  );
end
$test$;

set local role service_role;

select public.dealer_accelerator_authorize_source(
  '77a6893a-54fe-4373-9bf7-3327d0ba69cf',
  'static_json_manifest',
  'test://dealer/service-boundary.json',
  'dealer-service-boundary-json',
  'written dealer authorization',
  '77a6893a-54fe-4373-9bf7-3327d0ba69cf',
  'retain source evidence for marketplace audit',
  'dealer grants marketplace listing use',
  'inventory-v1'
);

reset role;

select pg_temp.dealer_accelerator_assert(
  'controlled service function can mutate',
  (
    select count(*) = 1
    from public.dealer_accelerator_sources
    where source_locator_key = 'dealer-service-boundary-json'
  ) and (
    select count(*) = 1
    from public.dealer_accelerator_lifecycle_events e
    join public.dealer_accelerator_sources s on s.id = e.source_id
    where s.source_locator_key = 'dealer-service-boundary-json'
      and e.event_type = 'source_authorized'
  ),
  'service role crossed only the controlled function boundary'
);

select pg_temp.dealer_accelerator_assert(
  'anon has no table access',
  not has_table_privilege('anon', 'public.dealer_accelerator_sources', 'SELECT')
    and not has_table_privilege('anon', 'public.dealer_accelerator_source_items', 'INSERT')
    and not has_table_privilege('anon', 'public.dealer_accelerator_batches', 'UPDATE')
    and not has_table_privilege('anon', 'public.dealer_accelerator_batch_items', 'DELETE')
    and not has_table_privilege('anon', 'public.dealer_accelerator_observations', 'SELECT')
    and not has_table_privilege('anon', 'public.dealer_accelerator_lifecycle_events', 'INSERT'),
  'anon has no ordinary read or mutation grant'
);

select pg_temp.dealer_accelerator_assert(
  'authenticated has no table access',
  not has_table_privilege('authenticated', 'public.dealer_accelerator_sources', 'SELECT')
    and not has_table_privilege('authenticated', 'public.dealer_accelerator_source_items', 'INSERT')
    and not has_table_privilege('authenticated', 'public.dealer_accelerator_batches', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.dealer_accelerator_batch_items', 'DELETE')
    and not has_table_privilege('authenticated', 'public.dealer_accelerator_observations', 'SELECT')
    and not has_table_privilege('authenticated', 'public.dealer_accelerator_lifecycle_events', 'INSERT'),
  'authenticated has no ordinary read or mutation grant'
);

select pg_temp.dealer_accelerator_assert(
  'service role is read-only on all durable tables',
  has_table_privilege('service_role', 'public.dealer_accelerator_sources', 'SELECT')
    and has_table_privilege('service_role', 'public.dealer_accelerator_source_items', 'SELECT')
    and has_table_privilege('service_role', 'public.dealer_accelerator_batches', 'SELECT')
    and has_table_privilege('service_role', 'public.dealer_accelerator_batch_items', 'SELECT')
    and has_table_privilege('service_role', 'public.dealer_accelerator_observations', 'SELECT')
    and has_table_privilege('service_role', 'public.dealer_accelerator_lifecycle_events', 'SELECT')
    and not has_table_privilege('service_role', 'public.dealer_accelerator_sources', 'INSERT')
    and not has_table_privilege('service_role', 'public.dealer_accelerator_source_items', 'UPDATE')
    and not has_table_privilege('service_role', 'public.dealer_accelerator_batches', 'UPDATE')
    and not has_table_privilege('service_role', 'public.dealer_accelerator_batch_items', 'DELETE')
    and not has_table_privilege('service_role', 'public.dealer_accelerator_observations', 'INSERT')
    and not has_table_privilege('service_role', 'public.dealer_accelerator_lifecycle_events', 'INSERT'),
  'service role reads durable truth but cannot directly mutate it'
);

select pg_temp.dealer_accelerator_assert(
  'source identities and observations are immutable',
  not has_table_privilege(
    'dealer_accelerator_writer',
    'public.dealer_accelerator_source_items',
    'UPDATE'
  )
    and not has_table_privilege(
      'dealer_accelerator_writer',
      'public.dealer_accelerator_source_items',
      'DELETE'
    )
    and not has_table_privilege(
      'dealer_accelerator_writer',
      'public.dealer_accelerator_observations',
      'UPDATE'
    )
    and not has_table_privilege(
      'dealer_accelerator_writer',
      'public.dealer_accelerator_observations',
      'DELETE'
    )
    and not has_table_privilege(
      'service_role',
      'public.dealer_accelerator_observations',
      'UPDATE'
    )
    and not has_table_privilege(
      'service_role',
      'public.dealer_accelerator_observations',
      'DELETE'
    ),
  'no controlled or application role can update or delete identity history'
);

select pg_temp.dealer_accelerator_assert(
  'events are append-only outside controlled ownership',
  not has_table_privilege(
    'service_role',
    'public.dealer_accelerator_lifecycle_events',
    'UPDATE'
  )
    and not has_table_privilege(
      'service_role',
      'public.dealer_accelerator_lifecycle_events',
      'DELETE'
    )
    and not has_table_privilege(
      'anon',
      'public.dealer_accelerator_lifecycle_events',
      'UPDATE'
    )
    and not has_table_privilege(
      'authenticated',
      'public.dealer_accelerator_lifecycle_events',
      'DELETE'
    ),
  'direct event insertion, update, and delete grants are absent'
);

select pg_temp.dealer_accelerator_assert(
  'service role may execute all controlled functions',
  (
    select bool_and(
      has_function_privilege('service_role', function_oid, 'EXECUTE')
    )
    from unnest(array[
      'public.dealer_accelerator_authorize_source(uuid,text,text,text,text,uuid,text,text,text)'::regprocedure,
      'public.dealer_accelerator_transition_source(uuid,text,uuid,text)'::regprocedure,
      'public.dealer_accelerator_create_or_get_batch(uuid,text,text,text,integer,text,uuid)'::regprocedure,
      'public.dealer_accelerator_register_or_get_item(uuid,text,text,uuid)'::regprocedure,
      'public.dealer_accelerator_record_observation(uuid,timestamptz,text,text,text,text,text,text,uuid)'::regprocedure,
      'public.dealer_accelerator_transition_batch(uuid,text,text,text,uuid,text)'::regprocedure,
      'public.dealer_accelerator_transition_item(uuid,text,text,text,uuid,text)'::regprocedure,
      'public.dealer_accelerator_claim_item_lease(uuid,uuid,integer,text,uuid)'::regprocedure,
      'public.dealer_accelerator_record_item_retry(uuid,uuid,text,timestamptz,boolean,text,uuid)'::regprocedure
    ]) as functions(function_oid)
  ),
  'all mutations are available through the controlled service boundary'
);

select pg_temp.dealer_accelerator_assert(
  'public function execution is absent',
  not exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) a
    where p.oid in (
      'public.dealer_accelerator_authorize_source(uuid,text,text,text,text,uuid,text,text,text)'::regprocedure,
      'public.dealer_accelerator_transition_source(uuid,text,uuid,text)'::regprocedure,
      'public.dealer_accelerator_create_or_get_batch(uuid,text,text,text,integer,text,uuid)'::regprocedure,
      'public.dealer_accelerator_register_or_get_item(uuid,text,text,uuid)'::regprocedure,
      'public.dealer_accelerator_record_observation(uuid,timestamptz,text,text,text,text,text,text,uuid)'::regprocedure,
      'public.dealer_accelerator_transition_batch(uuid,text,text,text,uuid,text)'::regprocedure,
      'public.dealer_accelerator_transition_item(uuid,text,text,text,uuid,text)'::regprocedure,
      'public.dealer_accelerator_claim_item_lease(uuid,uuid,integer,text,uuid)'::regprocedure,
      'public.dealer_accelerator_record_item_retry(uuid,uuid,text,timestamptz,boolean,text,uuid)'::regprocedure
    )
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute any Flight 1 function'
);

select pg_temp.dealer_accelerator_assert(
  'RLS is enabled on all durable tables',
  (
    select bool_and(relrowsecurity)
    from pg_class
    where oid in (
      'public.dealer_accelerator_sources'::regclass,
      'public.dealer_accelerator_source_items'::regclass,
      'public.dealer_accelerator_batches'::regclass,
      'public.dealer_accelerator_batch_items'::regclass,
      'public.dealer_accelerator_observations'::regclass,
      'public.dealer_accelerator_lifecycle_events'::regclass
    )
  ),
  'ordinary authenticated access cannot expose another dealer'
);

select pg_temp.dealer_accelerator_assert(
  'identity-separation constraints exist',
  (
    select count(*) = 7
    from pg_constraint
    where conname in (
      'dealer_accelerator_source_items_source_fk',
      'dealer_accelerator_batches_source_fk',
      'dealer_accelerator_batch_items_batch_fk',
      'dealer_accelerator_batch_items_source_item_fk',
      'dealer_accelerator_observations_batch_item_fk',
      'dealer_accelerator_lifecycle_events_source_item_fk',
      'dealer_accelerator_lifecycle_events_observation_fk'
    )
  )
    and to_regclass(
      'public.dealer_accelerator_batch_items_one_materialized_source_item'
    ) is not null,
  'source, batch occurrence, observation, and future materialization identities are structural'
);

select pg_temp.dealer_accelerator_assert(
  'source and observation identities are not listing or physical-watch identities',
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'dealer_accelerator_source_items',
        'dealer_accelerator_observations'
      )
      and column_name in ('listing_id', 'physical_watch_id')
  )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'dealer_accelerator_batch_items'
        and column_name = 'listing_id'
    ),
  'later linkage remains a separate processing or mapping concern'
);

select assertion, passed, detail
from dealer_accelerator_flight_1_results
order by assertion;

do $finish$
declare
  v_failures text;
begin
  select string_agg(assertion || ': ' || detail, E'\n' order by assertion)
    into v_failures
    from dealer_accelerator_flight_1_results
   where not passed;

  if v_failures is not null then
    raise exception E'Dealer Accelerator Flight 1 verification failed:\n%', v_failures;
  end if;
end
$finish$;
