-- ════════════════════════════════════════════════════════════════════════
-- Dealer Intake — Flight 2A: atomic dealer-import RPC test harness
--
-- HOW TO RUN (non-live, leaves nothing behind): execute inside ONE transaction
-- AFTER the migration 20260722160727_dealer_import_atomic_listing_media.sql has
-- created public.dealer_import_one_listing, then ROLLBACK. i.e.
--   begin;
--   \i supabase/migrations/20260722160727_dealer_import_atomic_listing_media.sql
--   \i scripts/dealer-import-atomic.test.sql
--   rollback;
-- The Flight 2A verification ran exactly this shape against the main project via
-- a begin…rollback batch — no migration was applied, no row persisted.
--
-- Dealer under test = an EXISTING profile (no auth.users/profiles row is created).
-- Each check inserts { check, pass, detail } into temp table _t; the final
-- SELECT reports them. Forced-failure atomicity tests use TEMP triggers that are
-- dropped again and, regardless, vanish on rollback.
-- ════════════════════════════════════════════════════════════════════════

create temp table _t(chk text, pass boolean, detail text);

do $$
declare
  v_dealer uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';  -- existing profile
  v_res    jsonb;
  v_id     uuid;
  v_n      int;
  v_seller uuid;
  v_score  int;
  v_iv     boolean;
  v_photos jsonb;
  v_media_urls text;
  v_photo_urls text;
begin
  -- ── VALIDATION (1–9) ──
  v_res := public.dealer_import_one_listing(null, '{"brand":"B","reference":"R"}'::jsonb, '[{"url":"u"}]'::jsonb);
  insert into _t values ('01_null_dealer_rejected', v_res->>'result'='REJECTED_BEFORE_MUTATION' and v_res->>'reason'='dealer_not_found', v_res::text);

  v_res := public.dealer_import_one_listing(gen_random_uuid(), '{"brand":"B","reference":"R"}'::jsonb, '[{"url":"u"}]'::jsonb);
  insert into _t values ('02_nonexistent_dealer_rejected', v_res->>'reason'='dealer_not_found', v_res::text);

  v_res := public.dealer_import_one_listing(v_dealer, '{"brand":"","reference":"R"}'::jsonb, '[{"url":"u"}]'::jsonb);
  insert into _t values ('03_missing_brand_rejected', v_res->>'reason'='missing_brand', v_res::text);

  v_res := public.dealer_import_one_listing(v_dealer, '{"brand":"B","reference":"  "}'::jsonb, '[{"url":"u"}]'::jsonb);
  insert into _t values ('04_missing_reference_rejected', v_res->>'reason'='missing_reference', v_res::text);

  v_res := public.dealer_import_one_listing(v_dealer, '{"brand":"B","reference":"R"}'::jsonb, '{"not":"array"}'::jsonb);
  insert into _t values ('05_non_array_photos_rejected', v_res->>'reason'='invalid_photos_payload', v_res::text);

  v_res := public.dealer_import_one_listing(v_dealer, '{"brand":"B","reference":"R"}'::jsonb, '[]'::jsonb);
  insert into _t values ('06_zero_photos_rejected', v_res->>'reason'='zero_declared_photos', v_res::text);

  v_res := public.dealer_import_one_listing(v_dealer, '{"brand":"B","reference":"R"}'::jsonb, '[{"url":"   "}]'::jsonb);
  insert into _t values ('07_blank_url_rejected', v_res->>'reason'='invalid_declared_photo', v_res::text);

  v_res := public.dealer_import_one_listing(v_dealer, '{"brand":"B","reference":"R"}'::jsonb, '[{"url":"good"},{"url":""}]'::jsonb);
  insert into _t values ('08_one_malformed_rejects_whole', v_res->>'reason'='invalid_declared_photo', v_res::text);

  -- 08b — added in the verification closeout (PREPARED, not executed during the
  -- data freeze). A non-string url is unusable under the str()-based contract and
  -- must reject the WHOLE listing before mutation.
  v_res := public.dealer_import_one_listing(v_dealer, '{"brand":"B","reference":"R"}'::jsonb, '[{"url":123}]'::jsonb);
  insert into _t values ('08b_non_string_url_rejects_whole', v_res->>'reason'='invalid_declared_photo', v_res::text);

  -- 09: caller cannot inject trust/scoring fields — RPC ignores unknown keys.
  v_res := public.dealer_import_one_listing(v_dealer,
    '{"brand":"B9","reference":"R9","significance_score":999,"in_hand_verified":true,"seller_id":"00000000-0000-0000-0000-000000000000","status":"published"}'::jsonb,
    '[{"url":"u9","category":"Dial"}]'::jsonb);
  v_id := (v_res->>'listing_id')::uuid;
  select significance_score, in_hand_verified, seller_id, status
    into v_score, v_iv, v_seller, v_media_urls
    from public.listings where id = v_id;
  insert into _t values ('09_caller_cannot_inject_trust',
    v_res->>'result'='IMPORTED' and v_score is null and v_iv = false and v_seller = v_dealer and v_media_urls = 'draft',
    format('score=%s iv=%s seller_is_dealer=%s status=%s', v_score, v_iv, v_seller=v_dealer, v_media_urls));

  -- ── SUCCESS (10, 11, 15, 16, 20, 21, 30) ──
  v_res := public.dealer_import_one_listing(v_dealer, '{"brand":"Bone","reference":"Rone"}'::jsonb, '[{"url":"only"}]'::jsonb);
  v_id  := (v_res->>'listing_id')::uuid;
  select count(*) into v_n from public.listing_media where listing_id=v_id and capture_source='dealer_import';
  insert into _t values ('10_one_photo_import_ok', v_res->>'result'='IMPORTED' and v_n=1, format('media=%s', v_n));
  insert into _t values ('20_creates_trusted_marker', v_n>=1, format('dealer_import_media=%s', v_n));
  insert into _t values ('21_discoverable_by_workspace',
    exists(select 1 from public.listing_media where listing_id=v_id and capture_source='dealer_import'), 'EXISTS dealer_import media');
  select seller_id into v_seller from public.listings where id=v_id;
  insert into _t values ('30_seller_is_only_validated_dealer', v_seller=v_dealer, v_seller::text);

  v_res := public.dealer_import_one_listing(v_dealer, '{"brand":"Bm","reference":"Rm"}'::jsonb,
    '[{"url":"p1","category":"Dial"},{"url":"p2","category":"Caseback"},{"url":"p3"}]'::jsonb);
  v_id  := (v_res->>'listing_id')::uuid;
  select count(*) into v_n from public.listing_media where listing_id=v_id;
  insert into _t values ('11_multi_photo_import_ok', v_res->>'result'='IMPORTED' and v_n=3, format('media=%s', v_n));
  insert into _t values ('15_all_declared_media_present', v_n=3, format('media=%s expected 3', v_n));
  -- 16: listings.photos order/urls == listing_media order/urls (same validated set)
  select string_agg(e->'photo'->>'url', ',' order by ord)
    into v_photo_urls from public.listings l, jsonb_array_elements(l.photos) with ordinality as x(e,ord) where l.id=v_id;
  select string_agg(storage_path, ',' order by sequence_index)
    into v_media_urls from public.listing_media where listing_id=v_id;
  insert into _t values ('16_photos_and_media_same_set_order', v_photo_urls = v_media_urls, format('photos=[%s] media=[%s]', v_photo_urls, v_media_urls));

  -- ── ATOMICITY via forced failures (12, 13/14) ──
  -- 12: force the listings insert to fail → nothing survives.
  create function pg_temp._force_listing_fail() returns trigger language plpgsql as $x$ begin raise exception 'forced_listing_fail'; end; $x$;
  create trigger _z_force_listing before insert on public.listings for each row execute function pg_temp._force_listing_fail();
  begin
    v_res := public.dealer_import_one_listing(v_dealer, '{"brand":"ATOM12","reference":"R12"}'::jsonb, '[{"url":"u"}]'::jsonb);
    insert into _t values ('12_listing_fail_rolls_back', false, 'NO ERROR RAISED (bad)');
  exception when others then
    select count(*) into v_n from public.listings where brand='ATOM12';
    insert into _t values ('12_listing_fail_rolls_back', v_n=0, format('listings_with_marker=%s (expect 0)', v_n));
  end;
  drop trigger _z_force_listing on public.listings;

  -- 13/14: force the listing_media insert to fail → the listing rolls back too.
  create function pg_temp._force_media_fail() returns trigger language plpgsql as $x$ begin raise exception 'forced_media_fail'; end; $x$;
  create trigger _z_force_media before insert on public.listing_media for each row execute function pg_temp._force_media_fail();
  begin
    v_res := public.dealer_import_one_listing(v_dealer, '{"brand":"ATOM13","reference":"R13"}'::jsonb, '[{"url":"u1"},{"url":"u2"}]'::jsonb);
    insert into _t values ('13_14_media_fail_rolls_back_all', false, 'NO ERROR RAISED (bad)');
  exception when others then
    select count(*) into v_n from public.listings where brand='ATOM13';
    insert into _t values ('13_14_media_fail_rolls_back_all', v_n=0 and sqlstate='DIM01', format('listings=%s sqlstate=%s (expect 0/DIM01)', v_n, sqlstate));
  end;
  drop trigger _z_force_media on public.listing_media;

  -- 24: the acceptance invariant — every IMPORTED listing has >=1 dealer_import media.
  select count(*) into v_n
    from public.listings l
    where l.seller_id=v_dealer and l.status='draft'
      and l.brand in ('Bone','Rone','Bm','B9')
      and not exists (select 1 from public.listing_media m where m.listing_id=l.id and m.capture_source='dealer_import');
  insert into _t values ('24_no_markerless_import_possible', v_n=0, format('imported_without_marker=%s (expect 0)', v_n));
end $$;

-- ── PERMISSIONS (25–29) — catalog facts, no execution needed ──
insert into _t values ('25_public_no_execute',        not has_function_privilege('public','public.dealer_import_one_listing(uuid,jsonb,jsonb)','execute'), null);
insert into _t values ('26_anon_no_execute',          not has_function_privilege('anon','public.dealer_import_one_listing(uuid,jsonb,jsonb)','execute'), null);
insert into _t values ('27_authenticated_no_execute', not has_function_privilege('authenticated','public.dealer_import_one_listing(uuid,jsonb,jsonb)','execute'), null);
insert into _t values ('28_service_role_execute',     has_function_privilege('service_role','public.dealer_import_one_listing(uuid,jsonb,jsonb)','execute'), null);
insert into _t values ('29_secdef_empty_searchpath',
  (select prosecdef and ('search_path=""' = any(proconfig)) from pg_proc where proname='dealer_import_one_listing'),
  (select proconfig::text from pg_proc where proname='dealer_import_one_listing'));
insert into _t values ('29b_owner_is_postgres',
  (select pg_get_userbyid(proowner)='postgres' from pg_proc where proname='dealer_import_one_listing'),
  (select pg_get_userbyid(proowner) from pg_proc where proname='dealer_import_one_listing'));

select chk, pass, detail from _t order by chk;
