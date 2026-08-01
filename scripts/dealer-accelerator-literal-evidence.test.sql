-- Dealer Accelerator Literal Evidence — Flight 2 rollback-safe verification.
-- Run only against a local/test database in this exact wrapper:
--
-- begin;
-- \i supabase/migrations/20260729020434_dealer_accelerator_batch_spine.sql
-- \i supabase/migrations/20260801123722_dealer_accelerator_literal_evidence.sql
-- \i scripts/dealer-accelerator-literal-evidence.test.sql
-- rollback;
--
-- (Against a target that already carries the spine, omit the first \i.)

create temporary table dealer_accelerator_flight_2_results (
  assertion text primary key,
  passed boolean not null,
  detail text not null
) on commit drop;

create or replace function pg_temp.dealer_accelerator_evidence_assert(
  p_assertion text,
  p_passed boolean,
  p_detail text
)
returns void
language plpgsql
as $assert$
begin
  insert into dealer_accelerator_flight_2_results (
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
  v_observed_at timestamptz := '2026-08-01 12:30:00+00';
  v_source public.dealer_accelerator_sources;
  v_source_b public.dealer_accelerator_sources;
  v_batch public.dealer_accelerator_batches;
  v_item_a public.dealer_accelerator_batch_items;
  v_item_b public.dealer_accelerator_batch_items;
  v_item_c public.dealer_accelerator_batch_items;
  v_item_d public.dealer_accelerator_batch_items;
  v_obs_bare public.dealer_accelerator_observations;
  v_payload public.dealer_accelerator_observation_payloads;
  v_photo_0 public.dealer_accelerator_photographs;
  v_photo_1 public.dealer_accelerator_photographs;
  v_photo_2 public.dealer_accelerator_photographs;
  v_photo_row public.dealer_accelerator_photographs;
  v_extraction public.dealer_accelerator_observation_extractions;
  v_extraction_repeat public.dealer_accelerator_observation_extractions;
  v_extraction_v2 public.dealer_accelerator_observation_extractions;
  v_env jsonb;
  v_env_repeat jsonb;
  v_env_b jsonb;
  v_env_c jsonb;
  v_bytes_a bytea;
  v_bytes_b bytea;
  v_bytes_c bytea;
  v_bytes_d bytea;
  v_photos_a jsonb;
  v_obs_a uuid;
  v_obs_b uuid;
  v_obs_c uuid;
  v_auth_event_a bigint;
  v_reauth_event bigint;
  v_content_hash_shared text
    := encode(extensions.digest('shared-image-bytes'::bytea, 'sha256'), 'hex');
  v_content_hash_other text
    := encode(extensions.digest('other-image-bytes'::bytea, 'sha256'), 'hex');
  v_events_before bigint;
  v_events_after bigint;
  v_rows_before bigint;
  v_rows_after bigint;
  v_caught boolean;
  v_probe_ok boolean;
  v_probe_ok_2 boolean;
  v_probe_ok_3 boolean;
  v_probe_ok_4 boolean;
  v_listing_count bigint;
  v_media_count bigint;
  v_notification_count bigint;
  v_vault_reference_count bigint;
  v_count bigint;
  v_count_2 bigint;
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
  select count(*) into v_vault_reference_count from public.vault_references;

  -- ── Fixture chain: authorized source, running batch, four items ──

  select * into v_source
  from public.dealer_accelerator_authorize_source(
    v_dealer,
    'static_json_manifest',
    'test://dealer/evidence.json',
    'dealer-evidence-json',
    'written dealer authorization',
    v_actor,
    'retain source evidence for marketplace audit',
    'dealer grants marketplace listing use',
    'inventory-v1'
  );

  select id into v_auth_event_a
    from public.dealer_accelerator_lifecycle_events
   where source_id = v_source.id
     and event_type = 'source_authorized';

  select * into v_batch
  from public.dealer_accelerator_create_or_get_batch(
    v_source.id, 'adapter-1', 'snapshot-1', 'idem-evidence-1', 8, 'system', null
  );
  select * into v_batch
  from public.dealer_accelerator_transition_batch(
    v_batch.id, 'running', null, 'system', null, null
  );

  select * into v_item_a
  from public.dealer_accelerator_register_or_get_item(
    v_batch.id, 'sku-evidence-a', 'system', null
  );
  select * into v_item_b
  from public.dealer_accelerator_register_or_get_item(
    v_batch.id, 'sku-evidence-b', 'system', null
  );
  select * into v_item_c
  from public.dealer_accelerator_register_or_get_item(
    v_batch.id, 'sku-evidence-c', 'system', null
  );
  select * into v_item_d
  from public.dealer_accelerator_register_or_get_item(
    v_batch.id, 'sku-evidence-d', 'system', null
  );

  v_bytes_a := convert_to(
    '{"brand":"Omega","reference":"310.30.42.50.01.002","photos":3}', 'UTF8'
  );
  v_photos_a := jsonb_build_array(
    jsonb_build_object('url', 'https://dealer.example/watch/front.jpg',
                       'category', 'front'),
    jsonb_build_object('url', 'https://dealer.example/watch/front.jpg'),
    jsonb_build_object('url', 'https://dealer.example/watch/back.jpg',
                       'pathname', 'watch/back.jpg', 'category', 'caseback')
  );

  -- ── Recording, hash law, one-to-one ──

  v_env := public.dealer_accelerator_record_observation_with_evidence(
    v_item_a.id, v_observed_at, 'adapter-1', 'v1', 'snap-item-a',
    'unassessed', v_bytes_a, v_photos_a, 'system', null
  );
  v_obs_a := (v_env->>'observation_id')::uuid;

  select * into v_payload
    from public.dealer_accelerator_observation_payloads
   where observation_id = v_obs_a;

  perform pg_temp.dealer_accelerator_evidence_assert(
    'payload row exists one-to-one with the observation',
    found
      and (v_env->>'payload_id')::uuid = v_payload.id
      and (select count(*)
             from public.dealer_accelerator_observation_payloads
            where observation_id = v_obs_a) = 1,
    'composite recorder produced exactly one byte-evidence satellite'
  );

  perform pg_temp.dealer_accelerator_evidence_assert(
    'canonical hash law: parent observation_hash equals digest of stored bytes',
    (select observation_hash
       from public.dealer_accelerator_observations
      where id = v_obs_a)
    = encode(extensions.digest(v_payload.payload_bytes, 'sha256'), 'hex'),
    'observation identity and payload evidence are provably the same object'
  );

  perform pg_temp.dealer_accelerator_evidence_assert(
    'payload row stores no second payload-hash column',
    not exists (
      select 1
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'dealer_accelerator_observation_payloads'
         and column_name in ('payload_hash', 'observation_hash', 'content_hash')
    ),
    'the parent observation hash remains the only hash authority'
  );

  perform pg_temp.dealer_accelerator_evidence_assert(
    'valid UTF-8 JSON payload derives text and jsonb conveniences',
    v_payload.decode_status = 'decoded'
      and v_payload.parse_status = 'parsed'
      and v_payload.parse_error_code is null
      and v_payload.payload_text is not null
      and v_payload.payload_jsonb->>'brand' = 'Omega',
    'derived conveniences populated alongside authoritative bytes'
  );

  -- ── Photograph declarations ──

  select count(*) into v_count
    from public.dealer_accelerator_photographs
   where observation_id = v_obs_a;
  select count(*) into v_count_2
    from public.dealer_accelerator_photographs
   where observation_id = v_obs_a
     and source_url = 'https://dealer.example/watch/front.jpg';

  perform pg_temp.dealer_accelerator_evidence_assert(
    'declarations preserved in order, duplicate URLs legal',
    v_count = 3 and v_count_2 = 2
      and jsonb_array_length(v_env->'photograph_ids') = 3,
    'sequence uniqueness governs; duplicate declared URLs are preserved truth'
  );

  select * into v_photo_0
    from public.dealer_accelerator_photographs
   where observation_id = v_obs_a and sequence_index = 0;
  select * into v_photo_1
    from public.dealer_accelerator_photographs
   where observation_id = v_obs_a and sequence_index = 1;
  select * into v_photo_2
    from public.dealer_accelerator_photographs
   where observation_id = v_obs_a and sequence_index = 2;

  perform pg_temp.dealer_accelerator_evidence_assert(
    'literal declaration metadata is preserved verbatim',
    v_photo_0.declared_category = 'front'
      and v_photo_0.source_pathname is null
      and v_photo_1.declared_category is null
      and v_photo_2.source_pathname = 'watch/back.jpg'
      and v_photo_2.declared_category = 'caseback',
    'dealer wording and paths survive exactly as declared'
  );

  perform pg_temp.dealer_accelerator_evidence_assert(
    'capture-time authorization is snapshotted immutably',
    v_payload.authorization_state_at_capture = 'authorized'
      and v_payload.use_terms_text_at_capture = v_source.photograph_use_terms
      and v_payload.use_terms_hash_at_capture = encode(
            extensions.digest(
              convert_to(v_source.photograph_use_terms, 'UTF8'), 'sha256'),
            'hex')
      and v_payload.authorization_event_id = v_auth_event_a
      and v_photo_0.authorization_event_id_at_declaration = v_auth_event_a
      and v_photo_0.authorization_state_at_declaration = 'authorized',
    'state, exact terms text, terms hash, and governing event preserved at capture'
  );

  -- ── Replay convergence ──

  select count(*) into v_events_before
    from public.dealer_accelerator_lifecycle_events;
  v_env_repeat := public.dealer_accelerator_record_observation_with_evidence(
    v_item_a.id, v_observed_at, 'adapter-1', 'v1', 'snap-item-a',
    'unassessed', v_bytes_a, v_photos_a, 'system', null
  );
  select count(*) into v_events_after
    from public.dealer_accelerator_lifecycle_events;

  perform pg_temp.dealer_accelerator_evidence_assert(
    'identical replay converges with no new rows and no new events',
    (v_env_repeat->>'observation_id')::uuid = v_obs_a
      and (v_env_repeat->>'payload_id')::uuid = v_payload.id
      and (v_env_repeat->>'payload_replay')::boolean
      and (v_env_repeat->>'photograph_replay')::boolean
      and v_events_after = v_events_before
      and (select count(*)
             from public.dealer_accelerator_photographs
            where observation_id = v_obs_a) = 3,
    'replay law: identical evidence converges to identical marketplace state'
  );

  v_caught := false;
  begin
    perform public.dealer_accelerator_record_observation_with_evidence(
      v_item_a.id, v_observed_at, 'adapter-1', 'v1', 'snap-item-a',
      'unassessed', convert_to('{"brand":"Rolex"}', 'UTF8'), v_photos_a,
      'system', null
    );
  exception when others then
    v_caught := sqlerrm like '%observation_snapshot_conflict%';
  end;
  perform pg_temp.dealer_accelerator_evidence_assert(
    'different bytes under a reused snapshot identity fail truthfully',
    v_caught,
    'changed evidence cannot silently reuse an observation identity'
  );

  v_caught := false;
  begin
    perform public.dealer_accelerator_record_observation_with_evidence(
      v_item_a.id, v_observed_at, 'adapter-1', 'v1', 'snap-item-a',
      'unassessed', v_bytes_a,
      jsonb_build_array(
        jsonb_build_object('url', 'https://dealer.example/watch/front.jpg',
                           'category', 'altered')),
      'system', null
    );
  exception when others then
    v_caught := sqlerrm like '%photograph_declaration_conflict%';
  end;
  perform pg_temp.dealer_accelerator_evidence_assert(
    'conflicting photograph redeclaration fails truthfully',
    v_caught,
    'a replay must match the full prior declaration exactly'
  );

  -- ── Best-effort derivation: non-JSON and undecodable payloads ──

  v_bytes_b := convert_to('brand,reference,price', 'UTF8');
  v_env_b := public.dealer_accelerator_record_observation_with_evidence(
    v_item_b.id, v_observed_at, 'adapter-1', 'v1', 'snap-item-b',
    'unassessed', v_bytes_b, '[]'::jsonb, 'system', null
  );
  v_obs_b := (v_env_b->>'observation_id')::uuid;
  select * into v_payload
    from public.dealer_accelerator_observation_payloads
   where observation_id = v_obs_b;

  perform pg_temp.dealer_accelerator_evidence_assert(
    'decoded non-JSON payload stores bytes with honest parse status',
    v_payload.decode_status = 'decoded'
      and v_payload.parse_status = 'not_json'
      and v_payload.parse_error_code = 'invalid_json'
      and v_payload.payload_text = 'brand,reference,price'
      and v_payload.payload_jsonb is null
      and (select observation_hash
             from public.dealer_accelerator_observations
            where id = v_obs_b)
          = encode(extensions.digest(v_bytes_b, 'sha256'), 'hex'),
    'CSV-shaped evidence is preserved and hashed; only the parse is refused'
  );

  perform pg_temp.dealer_accelerator_evidence_assert(
    'an empty photograph declaration set is legal',
    jsonb_array_length(v_env_b->'photograph_ids') = 0
      and (select count(*)
             from public.dealer_accelerator_photographs
            where observation_id = v_obs_b) = 0,
    'a manifest row may truthfully declare zero photographs'
  );

  v_bytes_c := decode('fffe00ff', 'hex');
  v_env_c := public.dealer_accelerator_record_observation_with_evidence(
    v_item_c.id, v_observed_at, 'adapter-1', 'v1', 'snap-item-c',
    'unassessed', v_bytes_c, '[]'::jsonb, 'system', null
  );
  v_obs_c := (v_env_c->>'observation_id')::uuid;
  select * into v_payload
    from public.dealer_accelerator_observation_payloads
   where observation_id = v_obs_c;

  perform pg_temp.dealer_accelerator_evidence_assert(
    'invalid UTF-8 payload stores exact bytes and verified hash',
    v_payload.decode_status = 'invalid_utf8'
      and v_payload.parse_status = 'parse_failed'
      and v_payload.parse_error_code = 'undecodable_payload'
      and v_payload.payload_text is null
      and v_payload.payload_jsonb is null
      and v_payload.payload_bytes = v_bytes_c
      and (select observation_hash
             from public.dealer_accelerator_observations
            where id = v_obs_c)
          = encode(extensions.digest(v_bytes_c, 'sha256'), 'hex'),
    'derivation failure is recorded, never fatal to the evidence'
  );

  -- ── Retrieval: failures preserved, success write-once, monotonic ──

  select * into v_photo_row
  from public.dealer_accelerator_record_photograph_retrieval_failure(
    v_photo_0.id, 'fetch_timeout', 'worker', null
  );
  select * into v_photo_row
  from public.dealer_accelerator_record_photograph_retrieval_failure(
    v_photo_0.id, 'fetch_timeout', 'worker', null
  );

  perform pg_temp.dealer_accelerator_evidence_assert(
    'retrieval failures accumulate as events with attempt numbers',
    v_photo_row.retrieval_state = 'retrieval_failed'
      and v_photo_row.retrieved_at is null
      and v_photo_row.content_hash is null
      and (select count(*)
             from public.dealer_accelerator_lifecycle_events
            where event_type = 'photograph_retrieval_failed'
              and metadata->>'photograph_id' = v_photo_0.id::text) = 2
      and (select max((metadata->>'attempt_number')::int)
             from public.dealer_accelerator_lifecycle_events
            where event_type = 'photograph_retrieval_failed'
              and metadata->>'photograph_id' = v_photo_0.id::text) = 2,
    'the row is a cursor; the events are the memory'
  );

  select * into v_photo_0
  from public.dealer_accelerator_record_photograph_retrieval(
    v_photo_0.id, v_observed_at, v_content_hash_shared,
    'dealer-evidence/' || v_content_hash_shared, 'worker', null
  );

  perform pg_temp.dealer_accelerator_evidence_assert(
    'retrieval succeeds after failure with write-once facts',
    v_photo_0.retrieval_state = 'retrieved'
      and v_photo_0.retrieved_at = v_observed_at
      and v_photo_0.content_hash = v_content_hash_shared
      and v_photo_0.storage_path = 'dealer-evidence/' || v_content_hash_shared
      and v_photo_0.authorization_event_id_at_retrieval = v_auth_event_a,
    'failed attempts remain in history; success facts earned once'
  );

  select count(*) into v_events_before
    from public.dealer_accelerator_lifecycle_events;
  select * into v_photo_row
  from public.dealer_accelerator_record_photograph_retrieval(
    v_photo_0.id, v_observed_at, v_content_hash_shared,
    'dealer-evidence/' || v_content_hash_shared, 'worker', null
  );
  select count(*) into v_events_after
    from public.dealer_accelerator_lifecycle_events;

  perform pg_temp.dealer_accelerator_evidence_assert(
    'identical retrieval replay converges without new events',
    v_photo_row.id = v_photo_0.id and v_events_after = v_events_before,
    'replayed success returns existing truth'
  );

  v_caught := false;
  begin
    perform public.dealer_accelerator_record_photograph_retrieval(
      v_photo_0.id, v_observed_at, v_content_hash_other,
      'dealer-evidence/' || v_content_hash_other, 'worker', null
    );
  exception when others then
    v_caught := sqlerrm like '%photograph_retrieval_conflict%';
  end;
  perform pg_temp.dealer_accelerator_evidence_assert(
    'conflicting re-retrieval of a retrieved photograph fails',
    v_caught,
    'success facts are write-once, never overwritten'
  );

  v_caught := false;
  begin
    perform public.dealer_accelerator_record_photograph_retrieval_failure(
      v_photo_0.id, 'late_failure', 'worker', null
    );
  exception when others then
    v_caught := sqlerrm like '%photograph_already_retrieved%';
  end;
  perform pg_temp.dealer_accelerator_evidence_assert(
    'retrieved is terminal: no failure may follow success',
    v_caught,
    'monotonic retrieval graph holds'
  );

  -- ── Revocation law: history survives, new use stops ──

  perform public.dealer_accelerator_transition_source(
    v_source.id, 'suspended', v_actor, 'terms_review'
  );

  v_caught := false;
  begin
    perform public.dealer_accelerator_record_photograph_retrieval(
      v_photo_1.id, v_observed_at, v_content_hash_other,
      'dealer-evidence/' || v_content_hash_other, 'worker', null
    );
  exception when others then
    v_caught := sqlerrm like '%source_not_currently_authorized%';
  end;

  perform pg_temp.dealer_accelerator_evidence_assert(
    'suspension blocks new retrieval while declaration history stands',
    v_caught
      and (select count(*)
             from public.dealer_accelerator_photographs
            where observation_id = v_obs_a) = 3
      and (select authorization_state_at_declaration
             from public.dealer_accelerator_photographs
            where id = v_photo_1.id) = 'authorized',
    'revocation stops future use without rewriting capture history'
  );

  perform public.dealer_accelerator_transition_source(
    v_source.id, 'authorized', v_actor, 'terms_review_cleared'
  );
  select max(id) into v_reauth_event
    from public.dealer_accelerator_lifecycle_events
   where source_id = v_source.id
     and entity_kind = 'source';

  select * into v_photo_1
  from public.dealer_accelerator_record_photograph_retrieval(
    v_photo_1.id, v_observed_at, v_content_hash_other,
    'dealer-evidence/' || v_content_hash_other, 'worker', null
  );

  perform pg_temp.dealer_accelerator_evidence_assert(
    'declaration and retrieval carry different governing events honestly',
    v_photo_1.retrieval_state = 'retrieved'
      and v_photo_1.authorization_event_id_at_declaration = v_auth_event_a
      and v_photo_1.authorization_event_id_at_retrieval = v_reauth_event
      and v_reauth_event > v_auth_event_a,
    'capture-time and use-time authorization are separate preserved truths'
  );

  select * into v_photo_2
  from public.dealer_accelerator_record_photograph_retrieval(
    v_photo_2.id, v_observed_at, v_content_hash_shared,
    'dealer-evidence/' || v_content_hash_shared, 'worker', null
  );

  perform pg_temp.dealer_accelerator_evidence_assert(
    'recurring content hash is indexed evidence, never unique identity',
    v_photo_2.content_hash = v_content_hash_shared
      and (select count(*)
             from public.dealer_accelerator_photographs
            where content_hash = v_content_hash_shared) = 2
      and not exists (
        select 1
          from pg_index i
          join pg_class c on c.oid = i.indexrelid
         where c.relname = 'dealer_accelerator_photographs_content_hash_idx'
           and i.indisunique
      ),
    'the same bytes recurring across photographs is continuity evidence'
  );

  -- ── Cross-source authorization events are structurally rejected ──

  select * into v_source_b
  from public.dealer_accelerator_authorize_source(
    v_dealer,
    'static_json_manifest',
    'test://dealer/second.json',
    'dealer-second-json',
    'written dealer authorization',
    v_actor,
    'retain source evidence for marketplace audit',
    'dealer grants marketplace listing use',
    'inventory-v1'
  );

  v_obs_bare := public.dealer_accelerator_record_observation(
    v_item_d.id, v_observed_at, 'adapter-1', 'v1',
    encode(extensions.digest('bare-item-d'::bytea, 'sha256'), 'hex'),
    'snap-item-d', 'unassessed', 'system', null
  );

  v_caught := false;
  begin
    insert into public.dealer_accelerator_observation_payloads (
      observation_id, batch_item_id, batch_id, source_item_id, source_id,
      dealer_profile_id, payload_bytes, payload_text, payload_jsonb,
      decode_status, parse_status, parse_error_code,
      authorization_state_at_capture, use_terms_text_at_capture,
      use_terms_hash_at_capture, authorization_event_id, captured_at
    ) values (
      v_obs_bare.id, v_obs_bare.batch_item_id, v_obs_bare.batch_id,
      v_obs_bare.source_item_id, v_obs_bare.source_id,
      v_obs_bare.dealer_profile_id, 'bare-item-d'::bytea, 'bare-item-d', null,
      'decoded', 'not_json', 'invalid_json', 'authorized',
      'dealer grants marketplace listing use',
      encode(extensions.digest(
        convert_to('dealer grants marketplace listing use', 'UTF8'),
        'sha256'), 'hex'),
      (select id from public.dealer_accelerator_lifecycle_events
        where source_id = v_source_b.id
          and event_type = 'source_authorized'),
      v_observed_at
    );
  exception when foreign_key_violation then
    v_caught := true;
  end;

  perform pg_temp.dealer_accelerator_evidence_assert(
    'a payload cannot cite another source''s authorization event',
    v_caught,
    'the composite (event, source) foreign key rejects cross-source citation'
  );

  v_caught := false;
  begin
    insert into public.dealer_accelerator_photographs (
      observation_id, batch_item_id, batch_id, source_item_id, source_id,
      dealer_profile_id, sequence_index, source_url, declared_at,
      authorization_state_at_declaration, use_terms_text_at_capture,
      use_terms_hash_at_capture, authorization_event_id_at_declaration
    ) values (
      v_obs_bare.id, v_obs_bare.batch_item_id, v_obs_bare.batch_id,
      v_obs_bare.source_item_id, v_obs_bare.source_id,
      v_obs_bare.dealer_profile_id, 0, 'https://dealer.example/x.jpg',
      v_observed_at, 'authorized',
      'dealer grants marketplace listing use',
      encode(extensions.digest(
        convert_to('dealer grants marketplace listing use', 'UTF8'),
        'sha256'), 'hex'),
      (select id from public.dealer_accelerator_lifecycle_events
        where source_id = v_source_b.id
          and event_type = 'source_authorized')
    );
  exception when foreign_key_violation then
    v_caught := true;
  end;

  perform pg_temp.dealer_accelerator_evidence_assert(
    'a photograph cannot cite another source''s authorization event',
    v_caught,
    'source-bound event pointers hold structurally on photographs too'
  );

  -- ── One-to-one law is structural, not only procedural ──

  v_caught := false;
  begin
    insert into public.dealer_accelerator_observation_payloads (
      observation_id, batch_item_id, batch_id, source_item_id, source_id,
      dealer_profile_id, payload_bytes, payload_text, payload_jsonb,
      decode_status, parse_status, parse_error_code,
      authorization_state_at_capture, use_terms_text_at_capture,
      use_terms_hash_at_capture, authorization_event_id, captured_at
    )
    select
      observation_id, batch_item_id, batch_id, source_item_id, source_id,
      dealer_profile_id, payload_bytes, payload_text, payload_jsonb,
      decode_status, parse_status, parse_error_code,
      authorization_state_at_capture, use_terms_text_at_capture,
      use_terms_hash_at_capture, authorization_event_id, captured_at
      from public.dealer_accelerator_observation_payloads
     where observation_id = v_obs_a;
  exception when unique_violation then
    v_caught := true;
  end;

  perform pg_temp.dealer_accelerator_evidence_assert(
    'unique (observation_id) enforces the one-to-one payload law',
    v_caught
      and exists (
        select 1
          from pg_constraint
         where conname = 'dealer_accelerator_observation_payloads_observation_key'
           and contype = 'u'
      ),
    'the one-to-one shape is a constraint, not a convention'
  );

  -- ── Versioned extractions ──

  select * into v_extraction
  from public.dealer_accelerator_record_extraction(
    v_obs_a, 'extractor-1', 'Omega', '310.30.42.50.01.002',
    '{"0":"front","2":"caseback"}'::jsonb, 'system', null
  );
  select * into v_extraction_repeat
  from public.dealer_accelerator_record_extraction(
    v_obs_a, 'extractor-1', 'Omega', '310.30.42.50.01.002',
    '{"0":"front","2":"caseback"}'::jsonb, 'system', null
  );

  perform pg_temp.dealer_accelerator_evidence_assert(
    'extraction records once and replays to the same row',
    v_extraction.id = v_extraction_repeat.id
      and v_extraction.literal_brand = 'Omega'
      and v_extraction.literal_reference = '310.30.42.50.01.002'
      and (select count(*)
             from public.dealer_accelerator_observation_extractions
            where observation_id = v_obs_a) = 1,
    'interpretations are idempotent per extractor version'
  );

  v_caught := false;
  begin
    perform public.dealer_accelerator_record_extraction(
      v_obs_a, 'extractor-1', 'Rolex', '310.30.42.50.01.002',
      '{"0":"front","2":"caseback"}'::jsonb, 'system', null
    );
  exception when others then
    v_caught := sqlerrm like '%extraction_version_conflict%';
  end;
  perform pg_temp.dealer_accelerator_evidence_assert(
    'conflicting values under a reused extractor version fail',
    v_caught,
    'an extractor version states one interpretation, permanently'
  );

  select * into v_extraction_v2
  from public.dealer_accelerator_record_extraction(
    v_obs_a, 'extractor-2', 'Omega', '310.30.42.50.01.002',
    '{"0":"dial","2":"caseback"}'::jsonb, 'system', null
  );

  perform pg_temp.dealer_accelerator_evidence_assert(
    'corrections are new versions; prior interpretations survive',
    v_extraction_v2.id <> v_extraction.id
      and (select count(*)
             from public.dealer_accelerator_observation_extractions
            where observation_id = v_obs_a) = 2
      and (select extractor_version
             from public.dealer_accelerator_observation_extractions
            where observation_id = v_obs_a
            order by extracted_at desc, extractor_version desc
            limit 1) = 'extractor-2',
    'append-only interpretation history with a readable latest'
  );

  -- ── Event atomicity: exactly one event per successful write ──

  perform pg_temp.dealer_accelerator_evidence_assert(
    'every successful evidence write appended exactly one matching event',
    (select count(*)
       from public.dealer_accelerator_lifecycle_events
      where event_type = 'payload_recorded')
      = (select count(*)
           from public.dealer_accelerator_observation_payloads)
    and (select count(*)
           from public.dealer_accelerator_lifecycle_events
          where event_type = 'photograph_declared')
      = (select count(*)
           from public.dealer_accelerator_photographs)
    and (select count(*)
           from public.dealer_accelerator_lifecycle_events
          where event_type = 'photograph_retrieved')
      = (select count(*)
           from public.dealer_accelerator_photographs
          where retrieval_state = 'retrieved')
    and (select count(*)
           from public.dealer_accelerator_lifecycle_events
          where event_type = 'extraction_recorded')
      = (select count(*)
           from public.dealer_accelerator_observation_extractions),
    'rejected operations appended nothing; successes appended exactly one'
  );

  -- ── Privileges and RLS ──

  v_probe_ok := false;
  execute 'set local role anon';
  begin
    execute 'select count(*) from public.dealer_accelerator_observation_payloads';
  exception when insufficient_privilege then
    v_probe_ok := true;
  end;
  execute 'reset role';

  v_probe_ok_2 := false;
  execute 'set local role authenticated';
  begin
    execute 'select count(*) from public.dealer_accelerator_photographs';
  exception when insufficient_privilege then
    v_probe_ok_2 := true;
  end;
  execute 'reset role';

  v_probe_ok_3 := true;
  execute 'set local role service_role';
  begin
    execute 'select count(*) from public.dealer_accelerator_photographs';
  exception when others then
    v_probe_ok_3 := false;
  end;
  execute 'reset role';

  v_probe_ok_4 := false;
  execute 'set local role service_role';
  begin
    execute
      'insert into public.dealer_accelerator_observation_extractions '
      || '(observation_id, batch_item_id, batch_id, source_item_id, source_id, '
      || 'dealer_profile_id, extractor_version) '
      || 'select observation_id, batch_item_id, batch_id, source_item_id, '
      || 'source_id, dealer_profile_id, ''illicit'' '
      || 'from public.dealer_accelerator_observation_extractions limit 1';
  exception when insufficient_privilege then
    v_probe_ok_4 := true;
  end;
  execute 'reset role';

  perform pg_temp.dealer_accelerator_evidence_assert(
    'anon and authenticated cannot read; service role reads but cannot mutate',
    v_probe_ok and v_probe_ok_2 and v_probe_ok_3 and v_probe_ok_4,
    'evidence tables mutate only through controlled writer functions'
  );

  v_probe_ok := false;
  execute 'set local role dealer_accelerator_writer';
  begin
    execute
      'update public.dealer_accelerator_observation_payloads '
      || 'set parse_error_code = ''tampered'' where true';
  exception when insufficient_privilege then
    v_probe_ok := true;
  end;
  execute 'reset role';

  v_probe_ok_2 := false;
  execute 'set local role dealer_accelerator_writer';
  begin
    execute 'delete from public.dealer_accelerator_photographs where true';
  exception when insufficient_privilege then
    v_probe_ok_2 := true;
  end;
  execute 'reset role';

  v_probe_ok_3 := false;
  execute 'set local role dealer_accelerator_writer';
  begin
    execute
      'update public.dealer_accelerator_observation_extractions '
      || 'set literal_brand = ''tampered'' where true';
  exception when insufficient_privilege then
    v_probe_ok_3 := true;
  end;
  execute 'reset role';

  perform pg_temp.dealer_accelerator_evidence_assert(
    'even the writer cannot update payloads or extractions, nor delete photographs',
    v_probe_ok and v_probe_ok_2 and v_probe_ok_3,
    'append-only is a privilege boundary, not a promise'
  );

  -- ── Non-impact proof ──

  perform pg_temp.dealer_accelerator_evidence_assert(
    'no listing, media, notification, or Vault row was touched',
    (select count(*) from public.listings) = v_listing_count
      and (select count(*) from public.listing_media) = v_media_count
      and (select count(*) from public.notifications) = v_notification_count
      and (select count(*) from public.vault_references) = v_vault_reference_count,
    'evidence rails observed nothing outside their own domain'
  );

  perform pg_temp.dealer_accelerator_evidence_assert(
    'spine amendment: composite event key exists for source-bound pointers',
    exists (
      select 1
        from pg_constraint
       where conname = 'dealer_accelerator_lifecycle_events_id_source_key'
         and contype = 'u'
    ),
    'the additive Flight 1 amendment landed as designed'
  );
end
$test$;

select assertion, passed, detail
  from dealer_accelerator_flight_2_results
 order by assertion;

do $summary$
declare
  v_total bigint;
  v_failed bigint;
begin
  select count(*), count(*) filter (where not passed)
    into v_total, v_failed
    from dealer_accelerator_flight_2_results;
  if v_failed > 0 then
    raise exception
      'Dealer Accelerator Flight 2 verification FAILED: % of % assertions failed',
      v_failed, v_total;
  end if;
  raise notice
    'Dealer Accelerator Flight 2 verification passed: % of % assertions',
    v_total, v_total;
end
$summary$;
