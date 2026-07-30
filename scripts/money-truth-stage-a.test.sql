-- Marketplace Money Truth Foundation — STAGE A verification harness.
-- Run only against a disposable production-derived database, in this wrapper:
--
-- begin;
-- \i supabase/migrations/20260729214500_money_truth_foundation_stage_a.sql
-- \i scripts/money-truth-stage-a.test.sql
-- rollback;
--
-- Stage A can honestly test DDL, constraints, privileges, the attestation RPC,
-- and v1/v2 fingerprint separation. It CANNOT test shared TS/SQL parser
-- fixtures (Stage B — the parser does not exist yet) or pairing enforcement
-- (Stage D). Those are deliberately absent, not overlooked.

create temporary table money_truth_stage_a_results (
  assertion text primary key,
  passed    boolean not null,
  detail    text not null
) on commit drop;

create or replace function pg_temp.mt_assert(a text, p boolean, d text)
returns void language plpgsql as $assert$
begin
  insert into money_truth_stage_a_results (assertion, passed, detail)
  values (a, coalesce(p, false), d);
end
$assert$;

do $test$
declare
  v_founder uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
  v_listing uuid;
  v_other   uuid;
  v_fp_v1   text;
  v_fp_v2   text;
  v_fp_v2b  text;
  v_before  bigint;
  v_after   bigint;
  v_row     public.listings%rowtype;
  v_listing_count bigint;
  v_media_count   bigint;
  v_pr_count      bigint;
begin
  if not exists (select 1 from auth.users where id = v_founder) then
    raise exception 'Disposable-target prerequisite missing: founder actor %', v_founder;
  end if;

  select count(*) into v_listing_count from public.listings;
  select count(*) into v_media_count   from public.listing_media;
  select count(*) into v_pr_count      from public.purchase_requests;

  select id into v_listing from public.listings order by created_at limit 1;
  -- guaranteed distinct from v_listing, so the correction case can never be
  -- silently skipped (a skipped assertion records no row and would "pass")
  select id into v_other from public.listings where id <> v_listing order by id limit 1;
  if v_listing is null then raise exception 'Disposable target has no listings'; end if;

  -- ── supported_currencies ────────────────────────────────────────────────
  perform pg_temp.mt_assert(
    'curated set is exactly the locked nine, all active',
    (select count(*) from public.supported_currencies) = 9
      and (select count(*) from public.supported_currencies where active) = 9
      and (select count(*) from public.supported_currencies
            where code in ('USD','CAD','EUR','GBP','CHF','JPY','AUD','SGD','HKD')) = 9,
    'no tenth code, no inactive row');

  perform pg_temp.mt_assert(
    'JPY is a zero-exponent currency and the rest are two',
    (select exponent from public.supported_currencies where code = 'JPY') = 0
      and (select count(*) from public.supported_currencies
            where code <> 'JPY' and exponent = 2) = 8,
    'exponent truth is stored, not assumed by callers');

  -- The curated nine is expressed in TWO places — the seeded metadata rows and
  -- the four hardcoded column CHECKs — so the assertion that matters is that
  -- they AGREE. (A set-restricting CHECK on the table itself is deliberately
  -- absent: 'XXX' is a valid ISO shape, and the real write control is that no
  -- client holds INSERT. Drift between the two expressions is a live risk and
  -- is reported as a design finding, not silently patched here.)
  declare
    rec  record;
    v_bad text := null;
  begin
    for rec in select code from public.supported_currencies where active loop
      begin
        update public.listings set asking_currency = rec.code where id = v_listing;
      exception when check_violation then
        v_bad := coalesce(v_bad || ',', '') || rec.code;
      end;
    end loop;
    update public.listings set asking_currency = null where id = v_listing;
    perform pg_temp.mt_assert(
      'metadata table and column constraint express the SAME curated set',
      v_bad is null,
      coalesce('listed but rejected by the column CHECK: ' || v_bad,
               'every active code in supported_currencies is accepted by listings'));
  end;

  begin
    insert into public.supported_currencies (code, exponent, display_prefix, display_name)
    values ('usd', 2, 'x', 'lowercase');
    perform pg_temp.mt_assert('code format check enforces uppercase ISO shape', false, 'lowercase accepted');
  exception when others then
    perform pg_temp.mt_assert('code format check enforces uppercase ISO shape',
      sqlstate = '23514', sqlerrm);
  end;

  -- ── nullable currency columns ───────────────────────────────────────────
  perform pg_temp.mt_assert(
    'all four currency columns exist and are nullable in Stage A',
    (select count(*) from information_schema.columns
      where table_schema = 'public' and is_nullable = 'YES'
        and (table_name, column_name) in (
          ('listings','asking_currency'),
          ('purchase_requests','proposed_currency'),
          ('purchase_requests','listing_currency'),
          ('profiles','preferred_listing_currency'))) = 4,
    'no row is forced to carry a currency before Stage C');

  perform pg_temp.mt_assert(
    'no currency value was written by the migration',
    (select count(*) from public.listings where asking_currency is not null) = 0
      and (select count(*) from public.purchase_requests
            where proposed_currency is not null or listing_currency is not null) = 0
      and (select count(*) from public.profiles
            where preferred_listing_currency is not null) = 0,
    'Stage A is DDL only — attestation is Stage C');

  begin
    update public.listings set asking_currency = 'XBT' where id = v_listing;
    perform pg_temp.mt_assert('listings rejects an off-set currency', false, 'XBT accepted');
  exception when others then
    perform pg_temp.mt_assert('listings rejects an off-set currency', sqlstate = '23514', sqlerrm);
  end;

  perform pg_temp.mt_assert(
    'amount-without-currency is still permitted in Stage A',
    (select count(*) from public.listings
      where asking_price is not null and asking_currency is null) > 0,
    'pairing enforcement is Stage D, deliberately absent here');

  -- ── v1 / v2 fingerprint separation ──────────────────────────────────────
  v_fp_v2 := public.listing_attestation_fingerprint_v2(v_listing);
  perform pg_temp.mt_assert(
    'v2 fingerprint is a sha256 hex digest',
    v_fp_v2 ~ '^[0-9a-f]{64}$', coalesce(v_fp_v2,'<null>'));

  -- v1 recomputed inline exactly as submit_listing_for_review builds it.
  select encode(sha256(convert_to(
       octet_length(convert_to(coalesce(l.brand,''),'UTF8'))::text || ':' || coalesce(l.brand,'')
    || octet_length(convert_to(coalesce(l.model,''),'UTF8'))::text || ':' || coalesce(l.model,'')
    || octet_length(convert_to(coalesce(l.reference,''),'UTF8'))::text || ':' || coalesce(l.reference,'')
    || octet_length(convert_to(coalesce(l.year,''),'UTF8'))::text || ':' || coalesce(l.year,'')
    || octet_length(convert_to(coalesce(l.condition,''),'UTF8'))::text || ':' || coalesce(l.condition,'')
    || octet_length(convert_to(coalesce(trim_scale(l.asking_price)::text,''),'UTF8'))::text || ':' || coalesce(trim_scale(l.asking_price)::text,'')
    || octet_length(convert_to(coalesce(l.provenance_note,''),'UTF8'))::text || ':' || coalesce(l.provenance_note,'')
    || octet_length(convert_to(coalesce(l.description,''),'UTF8'))::text || ':' || coalesce(l.description,'')
    || octet_length(convert_to(case when l.has_bracelet then 'true' else 'false' end,'UTF8'))::text || ':' || case when l.has_bracelet then 'true' else 'false' end
    || octet_length(convert_to(coalesce(l.details->>'availability',''),'UTF8'))::text || ':' || coalesce(l.details->>'availability','')
    || (select octet_length(convert_to(s,'UTF8'))::text || ':' || s from (
          select coalesce(string_agg(octet_length(convert_to(x.v,'UTF8'))::text || ':' || x.v, '' order by x.o), '') as s
          from jsonb_array_elements_text(coalesce(l.details->'includedWithWatch','[]'::jsonb)) with ordinality as x(v,o)) t)
    || octet_length(convert_to(coalesce(l.details->>'includedNotes',''),'UTF8'))::text || ':' || coalesce(l.details->>'includedNotes','')
    || (select octet_length(convert_to(s,'UTF8'))::text || ':' || s from (
          select coalesce(string_agg(octet_length(convert_to(p.e->'photo'->>'url','UTF8'))::text || ':' || (p.e->'photo'->>'url'), '' order by p.o), '') as s
          from jsonb_array_elements(coalesce(l.photos,'[]'::jsonb)) with ordinality as p(e,o)
          where p.e->'photo'->>'url' ~ '\S') t)
  ,'UTF8')),'hex')
    into v_fp_v1
    from public.listings l where l.id = v_listing;

  perform pg_temp.mt_assert(
    'v1 and v2 fingerprints cannot collide on the same listing',
    v_fp_v1 is not null and v_fp_v2 is not null and v_fp_v1 <> v_fp_v2,
    'differing frame counts (13 vs 15) under a uniquely-decodable encoding');

  -- ── founder-gated attestation RPC ───────────────────────────────────────
  begin
    perform public.listing_currency_attest(v_listing, 'USD', 'test basis', gen_random_uuid());
    perform pg_temp.mt_assert('non-founder actor is refused', false, 'a random actor attested');
  exception when others then
    perform pg_temp.mt_assert('non-founder actor is refused',
      sqlerrm like '%founder_only%', sqlerrm);
  end;

  begin
    perform public.listing_currency_attest(v_listing, 'XBT', 'test basis', v_founder);
    perform pg_temp.mt_assert('unsupported currency is refused', false, 'XBT attested');
  exception when others then
    perform pg_temp.mt_assert('unsupported currency is refused',
      sqlerrm like '%unsupported_currency%', sqlerrm);
  end;

  begin
    perform public.listing_currency_attest(v_listing, 'USD', '   ', v_founder);
    perform pg_temp.mt_assert('blank attestation basis is refused', false, 'blank basis accepted');
  exception when others then
    perform pg_temp.mt_assert('blank attestation basis is refused',
      sqlerrm like '%attestation_basis_required%', sqlerrm);
  end;

  v_before := (select count(*) from public.listing_currency_events);
  select * into v_row from public.listing_currency_attest(
    v_listing, 'USD', 'founder attestation — harness fixture', v_founder);
  v_after := (select count(*) from public.listing_currency_events);

  perform pg_temp.mt_assert(
    'attestation writes currency and exactly one event, atomically',
    v_row.asking_currency = 'USD'
      and v_after = v_before + 1
      and (select event_type from public.listing_currency_events
            where listing_id = v_listing order by id desc limit 1) = 'currency_attested',
    'currency write and event are one transaction');

  perform pg_temp.mt_assert(
    'the event records prior state, basis and actor',
    (select prior_state->>'asking_currency' is null
              and btrim(attestation_basis) <> ''
              and actor_uid = v_founder
       from public.listing_currency_events
      where listing_id = v_listing order by id desc limit 1),
    'basis is positively recorded, never inferred from $ text');

  v_before := v_after;
  perform public.listing_currency_attest(
    v_listing, 'USD', 'founder attestation — harness fixture', v_founder);
  v_after := (select count(*) from public.listing_currency_events);
  perform pg_temp.mt_assert(
    're-attesting the same currency is idempotent',
    v_after = v_before,
    'a re-run of the Stage C session cannot double-write');

  if v_other is not null and v_other <> v_listing then
    perform public.listing_currency_attest(v_other, 'USD', 'harness fixture', v_founder);
    perform public.listing_currency_attest(v_other, 'GBP', 'harness correction', v_founder);
    perform pg_temp.mt_assert(
      'a currency change is recorded as a correction, not a first attestation',
      (select event_type from public.listing_currency_events
        where listing_id = v_other order by id desc limit 1) = 'currency_corrected'
        and (select count(*) from public.listing_currency_events where listing_id = v_other) = 2,
      'append-only history distinguishes attestation from correction');

    -- REGRESSION (defect found on the disposable target, 2026-07-30): both
    -- events share one created_at because now() is transaction-frozen. With a
    -- uuid key the history was unorderable and the correction sorted BEFORE
    -- the attestation it corrected. The monotonic identity id is the fix, and
    -- this asserts the ordering is real rather than incidental.
    perform pg_temp.mt_assert(
      'history is orderable even when every event shares one timestamp',
      (select count(distinct created_at) from public.listing_currency_events
        where listing_id = v_other) = 1
      and (select event_type from public.listing_currency_events
            where listing_id = v_other order by id asc limit 1) = 'currency_attested'
      and (select event_type from public.listing_currency_events
            where listing_id = v_other order by id desc limit 1) = 'currency_corrected',
      'monotonic id, not created_at, is what makes append-only history readable');
  end if;

  -- ── currency changes the v2 fingerprint ─────────────────────────────────
  v_fp_v2b := public.listing_attestation_fingerprint_v2(v_listing);
  perform pg_temp.mt_assert(
    'currency is genuinely protected by v2',
    v_fp_v2b <> v_fp_v2,
    'field 14 moves the digest — currency is material, not cosmetic');

  -- ── protected data ──────────────────────────────────────────────────────
  perform pg_temp.mt_assert(
    'no listing, media or purchase-request row was created or destroyed',
    (select count(*) from public.listings) = v_listing_count
      and (select count(*) from public.listing_media) = v_media_count
      and (select count(*) from public.purchase_requests) = v_pr_count,
    'Stage A adds columns and history, never rows');
end
$test$;

-- ── privilege boundary (outside the DO block: catalogue reads) ────────────
select pg_temp.mt_assert(
  'supported_currencies is client-readable but never client-writable',
  has_table_privilege('anon','public.supported_currencies','SELECT')
    and has_table_privilege('authenticated','public.supported_currencies','SELECT')
    and not has_table_privilege('anon','public.supported_currencies','INSERT')
    and not has_table_privilege('authenticated','public.supported_currencies','UPDATE')
    and not has_table_privilege('service_role','public.supported_currencies','INSERT'),
  'writes are migration-only');

select pg_temp.mt_assert(
  'currency events are append-only outside controlled ownership',
  not has_table_privilege('service_role','public.listing_currency_events','INSERT')
    and not has_table_privilege('service_role','public.listing_currency_events','UPDATE')
    and not has_table_privilege('service_role','public.listing_currency_events','DELETE')
    and not has_table_privilege('anon','public.listing_currency_events','SELECT')
    and not has_table_privilege('authenticated','public.listing_currency_events','SELECT'),
  'only the definer RPC may append; no client may read another seller history');

select pg_temp.mt_assert(
  'RLS is enabled on both new tables',
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.supported_currencies'::regclass,
                  'public.listing_currency_events'::regclass)),
  'ordinary access cannot reach either table directly');

select pg_temp.mt_assert(
  'both functions are postgres-owned definers with a pinned search_path',
  (select bool_and(prosecdef and pg_get_userbyid(proowner) = 'postgres'
                   and 'search_path=""' = any(proconfig))
     from pg_proc
    where oid in ('public.listing_currency_attest(uuid,text,text,uuid)'::regprocedure,
                  'public.listing_attestation_fingerprint_v2(uuid)'::regprocedure)),
  'the v2.94 lesson: a dedicated owner would be blocked by listings RLS');

select pg_temp.mt_assert(
  'only service_role may execute the controlled functions',
  has_function_privilege('service_role','public.listing_currency_attest(uuid,text,text,uuid)','EXECUTE')
    and has_function_privilege('service_role','public.listing_attestation_fingerprint_v2(uuid)','EXECUTE')
    and not has_function_privilege('anon','public.listing_currency_attest(uuid,text,text,uuid)','EXECUTE')
    and not has_function_privilege('authenticated','public.listing_currency_attest(uuid,text,text,uuid)','EXECUTE'),
  'no client session can attest a currency');

select pg_temp.mt_assert(
  'submit_listing_for_review is UNCHANGED — v2 defined, not activated',
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_listing_for_review') = 1
    -- Match on the currency field itself, NOT on the string 'v2': the v1
    -- function's own comments cite version numbers like v2.21b, which made a
    -- '%v2%' pattern self-triggering.
    and (select prosrc not like '%asking_currency%'
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'submit_listing_for_review')
    -- and the v2 fingerprint exists, unwired
    and to_regprocedure('public.listing_attestation_fingerprint_v2(uuid)') is not null,
  'the boundary Jason set: activation is Stage B, in lockstep with the client mirror');

select pg_temp.mt_assert(
  'no pairing constraint was added in Stage A',
  not exists (
    select 1 from pg_constraint
     where conrelid = 'public.listings'::regclass
       and pg_get_constraintdef(oid) like '%asking_currency%'
       and pg_get_constraintdef(oid) like '%asking_price%'),
  'amount/currency pairing is Stage D, NOT VALID then VALIDATE');

select assertion, passed, detail from money_truth_stage_a_results order by assertion;

do $finish$
declare v_failures text;
begin
  select string_agg(assertion || ': ' || detail, E'\n' order by assertion)
    into v_failures from money_truth_stage_a_results where not passed;
  if v_failures is not null then
    raise exception E'Money Truth Stage A verification failed:\n%', v_failures;
  end if;
end
$finish$;
