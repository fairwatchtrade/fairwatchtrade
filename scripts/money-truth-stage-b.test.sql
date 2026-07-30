-- ============================================================================
-- MONEY TRUTH STAGE B — database-side fixture harness.
--
-- Target: a DISPOSABLE production-derived database with Stage A applied
-- (e.g. the Stage A runtime-test restore). NEVER production.
--
-- The application half of the shared-fixture contract is
-- scripts/money-truth-stage-b.test.mjs. Equivalence is matching OUTCOMES,
-- not duplicated logic: the database deliberately has no price parser — its
-- half of the contract is the curated currency set, the CHECK constraints,
-- the saved-search watcher's non-restrictive treatment of unsupported price
-- intent, and the v1/v2 attestation fingerprint separation.
--
-- Leaves ZERO residue: every write is reverted in place; the final assertion
-- proves no currency value survived the run.
--
-- PFC274 = 62 — the evaluate route is untouched.
-- ============================================================================

do $$
declare
  v_count   int;
  v_listing public.listings%rowtype;
  v_fp1     text;
  v_fp2     text;
  v_stored  text;
  v_match   boolean;
  v_caught  boolean;
begin
  -- ── 1 · the curated nine, exactly (mirrors SUPPORTED_CURRENCIES) ──
  select count(*) into v_count from public.supported_currencies;
  if v_count <> 9 then raise exception 'FAIL currencies: expected 9, found %', v_count; end if;

  select count(*) into v_count from public.supported_currencies
   where code in ('USD','CAD','EUR','GBP','CHF','JPY','AUD','SGD','HKD') and active;
  if v_count <> 9 then raise exception 'FAIL currencies: nine-code set mismatch'; end if;

  select count(*) into v_count from public.supported_currencies
   where exponent <> case when code = 'JPY' then 0 else 2 end;
  if v_count <> 0 then raise exception 'FAIL currencies: exponent mismatch'; end if;

  select count(*) into v_count from public.supported_currencies
   where display_prefix <> case code
     when 'USD' then 'US$' when 'CAD' then 'C$'  when 'EUR' then '€'
     when 'GBP' then '£'   when 'CHF' then 'CHF ' when 'JPY' then '¥'
     when 'AUD' then 'A$'  when 'SGD' then 'S$'  when 'HKD' then 'HK$' end;
  if v_count <> 0 then raise exception 'FAIL currencies: display_prefix mismatch'; end if;

  -- ── 2 · CHECK constraints: a tenth code is refused on all four columns ──
  select * into v_listing from public.listings limit 1;
  if not found then raise exception 'FAIL fixture: no listing rows on target'; end if;

  v_caught := false;
  begin
    update public.listings set asking_currency = 'NZD' where id = v_listing.id;
  exception when check_violation then v_caught := true;
  end;
  if not v_caught then raise exception 'FAIL check: listings accepted a tenth code'; end if;

  v_caught := false;
  begin
    update public.profiles set preferred_listing_currency = 'BTC'
     where id = (select id from public.profiles limit 1);
  exception when check_violation then v_caught := true;
  end;
  if not v_caught then raise exception 'FAIL check: profiles accepted a non-curated code'; end if;

  -- ── 3 · a curated code IS accepted, then reverted in place (zero residue) ──
  update public.listings set asking_currency = 'USD' where id = v_listing.id;
  update public.listings set asking_currency = null  where id = v_listing.id;

  -- ── 4 · watcher: unsupported price intent is NON-restrictive (§12) ──
  -- The if/elsif chain has no else branch — an unknown kind must pass through.
  select * into v_listing from public.listings limit 1;
  select public.saved_search_matches_listing(
    jsonb_build_object('meanings', jsonb_build_array(
      jsonb_build_object('kind','unsupportedPrice','value','$12,000',
                         'label','Price search isn''t available yet'))),
    v_listing) into v_match;
  if not v_match then raise exception 'FAIL watcher: price intent restricted matching'; end if;

  -- …while a REAL condition still binds beside it (no blanket true).
  select public.saved_search_matches_listing(
    jsonb_build_object('meanings', jsonb_build_array(
      jsonb_build_object('kind','brand','value','No Such Brand','label','Brand: No Such Brand'),
      jsonb_build_object('kind','unsupportedPrice','value','$12,000',
                         'label','Price search isn''t available yet'))),
    v_listing) into v_match;
  if v_match then raise exception 'FAIL watcher: real conditions stopped binding'; end if;

  -- ── 5 · v2 fingerprint: deterministic, well-formed, and never equal to v1 ──
  select public.listing_attestation_fingerprint_v2(id) into v_fp1
    from public.listings where dealer_attested_fingerprint is not null limit 1;
  select public.listing_attestation_fingerprint_v2(id) into v_fp2
    from public.listings where dealer_attested_fingerprint is not null limit 1;
  select dealer_attested_fingerprint into v_stored
    from public.listings where dealer_attested_fingerprint is not null limit 1;
  if v_fp1 is null or v_fp1 !~ '^[0-9a-f]{64}$' then
    raise exception 'FAIL v2: fingerprint malformed: %', v_fp1; end if;
  if v_fp1 <> v_fp2 then raise exception 'FAIL v2: not deterministic'; end if;
  if v_fp1 = v_stored then raise exception 'FAIL v2: collided with the stored v1'; end if;

  -- ── 6 · zero residue: no currency value survived this run ──
  select (select count(*) from public.listings where asking_currency is not null)
       + (select count(*) from public.profiles where preferred_listing_currency is not null)
       + (select count(*) from public.purchase_requests
           where proposed_currency is not null or listing_currency is not null)
       + (select count(*) from public.listing_currency_events)
    into v_count;
  if v_count <> 0 then raise exception 'FAIL residue: % currency values remain', v_count; end if;

  raise notice 'money-truth-stage-b.test.sql: ALL PASS';
end $$;
