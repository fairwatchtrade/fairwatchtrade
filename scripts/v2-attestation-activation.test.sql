-- ============================================================================
-- v2 ATTESTATION ACTIVATION — database-side harness.
--
-- Target: a DISPOSABLE production-derived database with Stage A applied and
-- Stage C replay allowed (e.g. the Stage A runtime-test restore). NEVER
-- production.
--
-- SELF-ADAPTING: the block detects whether the activation migration is
-- currently applied (the function body delegates to fingerprint_v2) or rolled
-- back (v1-always), and asserts the frame expectations for THAT mode. The
-- apply -> test -> rollback -> test -> reapply -> test cycle therefore proves
-- both directions with this single file.
--
-- SHARED FIXTURE CONTRACT: the fixture field values below are defined
-- canonically in scripts/v2-attestation-activation.test.mjs, which computes
-- the fingerprint literals asserted here:
--   MOSER_V2_USD  3edd9f1c5785097e2e047496234574bb072beda43b4adb8240a6be38577123da
--   MOSER_V1      572acd9a49e134832fae425932a9d7a353bb48adec4f5a4c1eae9d5219ec326a
--   FIXTURE_V1    da2346bb22b599ff6550e9fde3bce460e8df879885797a0c7a525cae5cd99313
--   FIXTURE_V2    e41ef25fd04df395f0a9479cdb5cee92dcf28278f475eac842965124116a8f09
--                 (FIXTURE_V2 = fixture truth WITH USD set — the discriminator
--                 scenario attests USD before resubmitting)
-- Changing fixture data in either file without the other breaks both loudly.
--
-- The v1 specimen is a TRANSACTION-LOCAL synthetic dealer fixture — never the
-- real Czapek. Zero residue: every row created is deleted, every H. Moser
-- field restored (updated_at alone moves, by the touch trigger — disposable
-- target, stated honestly).
--
-- PFC274 = 62 — the evaluate route is untouched.
-- ============================================================================

do $$
declare
  v_founder   uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
  v_moser     uuid := '800802c8-e37f-4e7a-918f-5e2c02a49f46';
  v_activated boolean;

  -- expected literals (shared-fixture contract, see header)
  c_moser_v2  text := '3edd9f1c5785097e2e047496234574bb072beda43b4adb8240a6be38577123da';
  c_moser_v1  text := '572acd9a49e134832fae425932a9d7a353bb48adec4f5a4c1eae9d5219ec326a';
  c_fix_v1    text := 'da2346bb22b599ff6550e9fde3bce460e8df879885797a0c7a525cae5cd99313';
  c_fix_v2    text := 'e41ef25fd04df395f0a9479cdb5cee92dcf28278f475eac842965124116a8f09';

  -- baselines for the zero-residue proof
  b_events        bigint;
  b_listings      bigint;
  b_media         bigint;
  b_notifications bigint;
  b_matches       bigint;

  -- saved H. Moser state
  s_status  text; s_at timestamptz; s_by uuid; s_fp text; s_ccy text;
  s_rej     text; s_note text;

  v_fix    uuid;
  v_plain  uuid;
  v_fp     text;
  v_res    jsonb;
begin
  -- ── mode detection: activated iff the stamp path delegates to fingerprint_v2 ──
  v_activated := position('listing_attestation_fingerprint_v2'
                   in pg_get_functiondef('public.submit_listing_for_review(uuid)'::regprocedure)) > 0;

  select count(*) into b_events        from public.listing_currency_events;
  select count(*) into b_listings      from public.listings;
  select count(*) into b_media         from public.listing_media;
  select count(*) into b_notifications from public.notifications;
  select count(*) into b_matches       from public.saved_search_matches;

  -- the RPCs read auth.uid() from the request claims; grant this transaction
  -- the seller's identity (established harness technique, disposable only)
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_founder::text, 'role', 'authenticated')::text, true);

  -- ═══ PART 1 · H. Moser-derived specimen (v2 path when activated) ═══
  select status, dealer_attested_at, dealer_attested_by, dealer_attested_fingerprint,
         asking_currency, rejection_reason, seller_clarification_note
    into s_status, s_at, s_by, s_fp, s_ccy, s_rej, s_note
    from public.listings where id = v_moser;
  if s_fp <> c_moser_v1 then
    raise exception 'FAIL precondition: moser stored fp is not the known v1 (%)', s_fp;
  end if;

  perform public.listing_currency_attest(v_moser, 'USD',
    'Activation harness replay on disposable target — reverted in this transaction.', v_founder);
  update public.listings set status = 'rejected' where id = v_moser;

  v_res := public.submit_listing_for_review(v_moser);
  select dealer_attested_fingerprint into v_fp from public.listings where id = v_moser;

  if v_activated then
    if v_fp <> c_moser_v2 then
      raise exception 'FAIL P1(activated): stamped % , expected v2 %', v_fp, c_moser_v2; end if;
    if v_fp <> public.listing_attestation_fingerprint_v2(v_moser) then
      raise exception 'FAIL P1(activated): stamp != live fingerprint_v2'; end if;
  else
    -- rolled back: v1-always, and the truth is unchanged, so the stamp must
    -- reproduce the ORIGINAL v1 value even though currency is set.
    if v_fp <> c_moser_v1 then
      raise exception 'FAIL P1(rollback): stamped % , expected v1 %', v_fp, c_moser_v1; end if;
  end if;

  -- revert: currency event away, every saved field back
  delete from public.listing_currency_events where listing_id = v_moser and id > b_events;
  update public.listings set
    status = s_status, dealer_attested_at = s_at, dealer_attested_by = s_by,
    dealer_attested_fingerprint = s_fp, asking_currency = s_ccy,
    rejection_reason = s_rej, seller_clarification_note = s_note
  where id = v_moser;

  -- ═══ PART 2 · transaction-local dealer fixture (v1 + mode discriminator) ═══
  insert into public.listings
    (seller_id, brand, model, reference, year, condition, asking_price,
     asking_currency, provenance_note, description, has_bracelet, details, photos, status)
  values
    (v_founder, 'Fixture Watch Co.', 'Test Reference Model', 'FIX-0001', '2020',
     'Excellent', 5000, null, null, 'Transaction-local v1 harness specimen.', false,
     '{"availability":"In Stock","includedWithWatch":["Box"]}'::jsonb,
     '[{"photo":{"url":"https://example.invalid/fixture-dial.jpg"}}]'::jsonb,
     'draft')
  returning id into v_fix;

  insert into public.listing_media (listing_id, category, storage_path, capture_source)
  values (v_fix, 'Dial', 'fixture/dial.jpg', 'dealer_import');

  -- 2a · NULL currency -> v1 stamp in BOTH modes (legacy preserved)
  v_res := public.submit_listing_for_review(v_fix);
  select dealer_attested_fingerprint into v_fp from public.listings where id = v_fix;
  if v_fp <> c_fix_v1 then
    raise exception 'FAIL P2a: null-currency stamp % , expected v1 %', v_fp, c_fix_v1; end if;

  -- 2b · USD currency -> the mode discriminator
  update public.listings set status = 'draft', asking_currency = 'USD' where id = v_fix;
  v_res := public.submit_listing_for_review(v_fix);
  select dealer_attested_fingerprint into v_fp from public.listings where id = v_fix;
  if v_activated then
    if v_fp <> c_fix_v2 then
      raise exception 'FAIL P2b(activated): stamped % , expected v2 %', v_fp, c_fix_v2; end if;
    if v_fp <> public.listing_attestation_fingerprint_v2(v_fix) then
      raise exception 'FAIL P2b(activated): stamp != live fingerprint_v2'; end if;
  else
    if v_fp <> c_fix_v1 then
      raise exception 'FAIL P2b(rollback): stamped % , expected v1 %', v_fp, c_fix_v1; end if;
  end if;

  delete from public.listing_media where listing_id = v_fix;
  delete from public.listings where id = v_fix;

  -- ═══ PART 3 · non-imported listing: never stamped, either mode ═══
  insert into public.listings (seller_id, brand, reference, status, details, photos)
  values (v_founder, 'Fixture Plain Co.', 'FIX-0002', 'draft', '{}'::jsonb, '[]'::jsonb)
  returning id into v_plain;

  v_res := public.submit_listing_for_review(v_plain);
  select dealer_attested_fingerprint into v_fp from public.listings where id = v_plain;
  if v_fp is not null then
    raise exception 'FAIL P3: non-imported listing received a fingerprint: %', v_fp; end if;
  if (v_res->>'imported')::boolean then
    raise exception 'FAIL P3: non-imported listing reported imported=true'; end if;

  delete from public.listings where id = v_plain;

  -- ═══ PART 4 · zero residue ═══
  if (select count(*) from public.listing_currency_events) <> b_events then
    raise exception 'FAIL residue: currency events'; end if;
  if (select count(*) from public.listings) <> b_listings then
    raise exception 'FAIL residue: listings'; end if;
  if (select count(*) from public.listing_media) <> b_media then
    raise exception 'FAIL residue: listing_media'; end if;
  if (select count(*) from public.notifications) <> b_notifications then
    raise exception 'FAIL residue: notifications'; end if;
  if (select count(*) from public.saved_search_matches) <> b_matches then
    raise exception 'FAIL residue: saved_search_matches'; end if;
  if not exists (select 1 from public.listings
                  where id = v_moser and status = s_status and asking_currency is null
                    and dealer_attested_fingerprint = c_moser_v1) then
    raise exception 'FAIL residue: moser not fully restored'; end if;

  raise notice 'v2-attestation-activation harness: ALL PASS (mode = %)',
    case when v_activated then 'ACTIVATED' else 'ROLLED BACK' end;
end $$;
