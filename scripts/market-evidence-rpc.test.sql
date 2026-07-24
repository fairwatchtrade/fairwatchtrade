-- ════════════════════════════════════════════════════════════════════════
-- MARKET EVIDENCE RPC — fixture + security harness  (v5)
--
-- Runs the REAL migration function against the REAL production schema inside a
-- single transaction that is GUARANTEED to leave the database byte-identical:
-- the harness ends by RAISE-ing its own report, which aborts the transaction.
-- Nothing — not the function, not one seeded row — is ever committed.
--
-- Why production-with-rollback rather than a Supabase branch: the repo's
-- migration history begins at v2.21 and does not recreate the pre-v2.21
-- baseline (e.g. vault_references / vault_variants / vault_families), so a
-- from-scratch branch cannot reconstruct the schema this function joins. A
-- fully-rolled-back transaction on the real database is the only environment
-- with the true schema, the real canonical fingerprint function, and the real
-- anon / authenticated / service_role roles. The terminal RAISE makes zero
-- persistence structural, not merely intended.
--
-- Execute as a SINGLE statement batch. Expect it to finish with:
--   ERROR:  MEV_HARNESS_REPORT ...
-- That error IS the successful result. Read PASS/FAIL from its message.
-- ════════════════════════════════════════════════════════════════════════

-- ── The function under test (verbatim copy of the migration body) ──────────
create or replace function public.market_evidence_for_reference(p_reference_id uuid)
returns table (
  reference             text,
  house                 text,
  sale_title            text,
  sale_code             text,
  sale_date             date,
  location              text,
  lot_number            text,
  price_realized        numeric,
  currency              text,
  price_basis           text,
  lot_page_url          text,
  sale_page_url         text,
  identity_source_label text,
  result_source_label   text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    vr.reference,
    h.name                                                   as house,
    s.sale_name                                              as sale_title,
    (pg_catalog.regexp_match(s.source_url, '/auction/([A-Za-z0-9]+)'))[1] as sale_code,
    s.sale_date,
    s.location,
    l.lot_number,
    r.price_realized,
    r.currency,
    r.price_basis,
    case when la.source_url ~ '^https://[^/]+/detail/' then la.source_url else null end as lot_page_url,
    (
      select spa.source_url
        from public.auction_evidence_source_artifact spa
       where spa.sale_id = s.id
         and spa.publication_status = 'allowed'
         and spa.permission_status in ('permitted', 'authorized_or_licensed')
         and spa.source_url ~ '^https://[^/]+/auction/'
       order by spa.source_url
       limit 1
    )                                                        as sale_page_url,
    h.name || ' Lot ' || l.lot_number                        as identity_source_label,
    'Official ' || h.name || ' results'                      as result_source_label
  from public.vault_references vr
  join public.identity_resolution_candidate c
    on c.vault_reference_id = vr.id and c.candidate_role = 'selected'
  join public.identity_resolution_decision d
    on d.id = c.decision_id and d.is_current and d.outcome = 'exact'
   and d.reviewed_by is not null and d.reviewed_at is not null
  join public.identity_resolution_case k
    on k.id = d.case_id and k.subject_type = 'auction_lot' and k.auction_lot_id is not null
  join public.auction_evidence_lot l    on l.id = k.auction_lot_id
  join public.auction_evidence_sale s   on s.id = l.sale_id
  join public.auction_evidence_house h  on h.id = s.house_id
  join public.auction_evidence_result r
    on r.lot_id = l.id and r.is_current and r.sale_outcome = 'sold'
  join public.auction_evidence_source_artifact la
    on la.id = l.source_artifact_id
   and la.publication_status = 'allowed'
   and la.permission_status in ('permitted', 'authorized_or_licensed')
  join public.auction_evidence_source_artifact ra
    on ra.id = r.source_artifact_id
   and ra.publication_status = 'allowed'
   and ra.permission_status in ('permitted', 'authorized_or_licensed')
  where vr.id = p_reference_id
    and d.claim_fingerprint = public.identity_resolution_claim_fingerprint('auction_lot', k.auction_lot_id)
    and (
          (r.price_realized is not null and r.currency is not null and r.price_basis is not null)
       or (r.price_realized is null     and r.currency is null     and r.price_basis is null)
        )
  order by s.sale_date desc nulls last, r.id asc
  limit 1
$fn$;

-- Owner stays postgres (owns the tables, FORCE RLS off) — no transfer needed.
revoke all     on function public.market_evidence_for_reference(uuid) from public;
grant  execute on function public.market_evidence_for_reference(uuid) to anon;
grant  execute on function public.market_evidence_for_reference(uuid) to authenticated;

-- ── Seed helpers (rolled back with everything else) ────────────────────────
create or replace function public._mev_variant(p_tag text)
returns table(variant_id uuid, ref_id uuid)
language plpgsql as $$
declare v uuid := gen_random_uuid(); r uuid := gen_random_uuid();
begin
  insert into public.vault_variants(id, family_id, name) values (v, null, 'MEVTEST '||p_tag);
  insert into public.vault_references(id, variant_id, reference) values (r, v, 'MEV-'||p_tag);
  variant_id := v; ref_id := r; return next;
end $$;

create or replace function public._mev_attach(
  p_ref uuid, p_tag text,
  p_outcome text default 'exact', p_decision_current boolean default true,
  p_fp text default 'valid', p_result_current boolean default true,
  p_sale_outcome text default 'sold', p_price_mode text default 'complete',
  p_lot_pub text default 'allowed', p_lot_perm text default 'permitted',
  p_res_pub text default 'allowed', p_res_perm text default 'permitted',
  p_lot_artifact boolean default true, p_res_artifact boolean default true,
  p_lot_url text default null, p_add_sale_page boolean default false,
  p_reviewed_by uuid default '77a6893a-54fe-4373-9bf7-3327d0ba69cf',
  p_reviewed_at timestamptz default now(),
  p_sale_date date default date '2026-06-13', p_price numeric default 22860)
returns uuid   -- result_id
language plpgsql as $$
declare
  v_house uuid := gen_random_uuid(); v_sale uuid := gen_random_uuid();
  v_lot uuid := gen_random_uuid(); v_case uuid := gen_random_uuid();
  v_dec uuid := gen_random_uuid(); v_res uuid := gen_random_uuid();
  v_lot_art uuid; v_res_art uuid; v_fp text;
  v_sale_url text := 'https://www.phillips.com/auction/NY' || substr(md5(p_tag),1,6);
  v_lot_url  text := coalesce(p_lot_url, 'https://www.phillips.com/detail/x/' || substr(md5(p_tag),1,6));
  v_price numeric; v_ccy text; v_basis text;
begin
  insert into public.auction_evidence_house(id,name,slug)
    values (v_house,'House '||p_tag,'h-'||substr(md5(p_tag),1,10));
  insert into public.auction_evidence_sale(id,house_id,sale_name,sale_date,location,source_url)
    values (v_sale,v_house,'Sale '||p_tag,p_sale_date,'New York',v_sale_url);

  if p_lot_artifact then
    v_lot_art := gen_random_uuid();
    insert into public.auction_evidence_source_artifact
      (id,sale_id,source_url,retrieved_at,intake_method,permission_status,automation_status,
       publication_status,artifact_retention_scope)
      values (v_lot_art,v_sale,v_lot_url,now(),'manual_entry',p_lot_perm,'not_applicable',
              p_lot_pub,'metadata_only');
  end if;
  if p_res_artifact then
    v_res_art := gen_random_uuid();
    insert into public.auction_evidence_source_artifact
      (id,sale_id,source_url,retrieved_at,intake_method,permission_status,automation_status,
       publication_status,artifact_retention_scope)
      values (v_res_art,v_sale,'https://www.phillips.com/results/'||substr(md5(p_tag),1,6),now(),
              'public_file',p_res_perm,'not_applicable',p_res_pub,'metadata_only');
  end if;
  if p_add_sale_page then
    insert into public.auction_evidence_source_artifact
      (id,sale_id,source_url,retrieved_at,intake_method,permission_status,automation_status,
       publication_status,artifact_retention_scope)
      values (gen_random_uuid(),v_sale,v_sale_url,now(),'founder_supplied_file','permitted',
              'not_applicable','allowed','metadata_only');
  end if;

  insert into public.auction_evidence_lot(id,sale_id,lot_number,brand_text,model_text,reference_text,source_artifact_id)
    values (v_lot,v_sale,'22','Omega','Speedmaster','2998-5',v_lot_art);

  if p_fp = 'valid' then
    v_fp := public.identity_resolution_claim_fingerprint('auction_lot', v_lot);
  else
    v_fp := repeat('a',64);   -- valid shape, deliberately wrong value
  end if;

  insert into public.identity_resolution_case(id,subject_type,auction_lot_id)
    values (v_case,'auction_lot',v_lot);
  insert into public.identity_resolution_decision
    (id,case_id,chain_root_id,supersedes_decision_id,is_current,outcome,claim_fingerprint,review_reason,reviewed_by,reviewed_at)
    values (v_dec,v_case,v_dec,null,p_decision_current,p_outcome,v_fp,'test',p_reviewed_by,p_reviewed_at);
  insert into public.identity_resolution_candidate(id,decision_id,vault_reference_id,candidate_role,evidence,ordinal)
    values (gen_random_uuid(),v_dec,p_ref,'selected','e',1);

  if p_sale_outcome = 'sold' and p_price_mode = 'complete' then
    v_price := p_price; v_ccy := 'USD'; v_basis := 'hammer_plus_premium';
  else
    v_price := null; v_ccy := null; v_basis := null;   -- undisclosed / not-sold
  end if;

  -- The result always carries a real reviewer; only the DECISION's review
  -- fields are placed under test (test 10), so p_reviewed_by/at govern the
  -- decision alone.
  insert into public.auction_evidence_result
    (id,chain_root_id,supersedes_result_id,is_current,lot_id,price_realized,currency,price_basis,
     sale_outcome,result_date,source_artifact_id,reviewed_by,reviewed_at)
    values (v_res,v_res,null,p_result_current,v_lot,v_price,v_ccy,v_basis,
            p_sale_outcome,p_sale_date,v_res_art,'77a6893a-54fe-4373-9bf7-3327d0ba69cf',now());
  return v_res;
end $$;

-- ── Run the matrix; RAISE the report (aborts → guaranteed rollback) ────────
do $harness$
declare
  rpt text := E'\n';
  n_pass int := 0; n_fail int := 0;
  v uuid; r uuid; rid1 uuid; rid2 uuid;
  cnt int; rec record; tprotect text; ok boolean;
  procedure_note text;
begin
  -- helper macro via a nested block is not available; inline assert appends.
  -- Each test: seed, call rpc, compare count, record.

  -- 1 eligible renders
  select variant_id, ref_id into v, r from public._mev_variant('t1');
  perform public._mev_attach(r,'t1');
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=1 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('01 eligible_renders exp=1 got=%s %s'||E'\n', cnt, case when cnt=1 then 'PASS' else 'FAIL' end);

  -- 15 complete price correct (check values on the row from test 1)
  select * into rec from public.market_evidence_for_reference(r);
  ok := (rec.price_realized=22860 and rec.currency='USD' and rec.price_basis='hammer_plus_premium'
         and rec.reference='MEV-t1' and rec.lot_number='22');
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('15 complete_price_values %s (price=%s ccy=%s basis=%s)'||E'\n',
                       case when ok then 'PASS' else 'FAIL' end, rec.price_realized, rec.currency, rec.price_basis);

  -- 25 payload exposes only sanitized OUT columns (no ids/reviewer/internal)
  select bool_and(pn not in ('id','reviewed_by','reviewed_at','source_artifact_id',
                             'full_artifact_storage_path','attribution_note','claim_fingerprint'))
    into ok
  from (select unnest(p.proargnames) pn, unnest(p.proargmodes) pm
        from pg_proc p where p.proname='market_evidence_for_reference') q
  where pm in ('t','o','b');   -- TABLE columns carry mode 't'
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if;
  rpt := rpt || format('25 payload_sanitized %s'||E'\n', case when ok then 'PASS' else 'FAIL' end);

  -- Negative single-knob cases: each expects 0
  -- 2 internal_only lot
  select variant_id,ref_id into v,r from public._mev_variant('t2'); perform public._mev_attach(r,'t2',p_lot_pub=>'internal_only');
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('02 internal_only_lot exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);
  -- 3 internal_only result
  select variant_id,ref_id into v,r from public._mev_variant('t3'); perform public._mev_attach(r,'t3',p_res_pub=>'internal_only');
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('03 internal_only_result exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);
  -- 4 unresolved pub
  select variant_id,ref_id into v,r from public._mev_variant('t4'); perform public._mev_attach(r,'t4',p_lot_pub=>'unresolved',p_lot_perm=>'unresolved');
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('04 unresolved exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);
  -- 5 blocked
  select variant_id,ref_id into v,r from public._mev_variant('t5'); perform public._mev_attach(r,'t5',p_res_pub=>'blocked');
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('05 blocked exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);
  -- 6 missing rights support (no lot artifact)
  select variant_id,ref_id into v,r from public._mev_variant('t6'); perform public._mev_attach(r,'t6',p_lot_artifact=>false);
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('06 missing_lot_artifact exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);
  -- 7 mixed: lot allowed but result permission restricted
  select variant_id,ref_id into v,r from public._mev_variant('t7'); perform public._mev_attach(r,'t7',p_res_perm=>'restricted');
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('07 mixed_result_perm_restricted exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);
  -- 8 non-exact
  select variant_id,ref_id into v,r from public._mev_variant('t8'); perform public._mev_attach(r,'t8',p_outcome=>'probable');
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('08 non_exact exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);
  -- 9 superseded/non-current decision
  select variant_id,ref_id into v,r from public._mev_variant('t9'); perform public._mev_attach(r,'t9',p_decision_current=>false);
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('09 non_current_decision exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);
  -- 11 fingerprint invalid
  select variant_id,ref_id into v,r from public._mev_variant('t11'); perform public._mev_attach(r,'t11',p_fp=>'invalid');
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('11 fingerprint_invalid exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);
  -- 12 non-current result
  select variant_id,ref_id into v,r from public._mev_variant('t12'); perform public._mev_attach(r,'t12',p_result_current=>false);
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('12 non_current_result exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);
  -- 13 passed result
  select variant_id,ref_id into v,r from public._mev_variant('t13'); perform public._mev_attach(r,'t13',p_sale_outcome=>'passed');
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('13 passed exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);
  -- 14 withdrawn result
  select variant_id,ref_id into v,r from public._mev_variant('t14'); perform public._mev_attach(r,'t14',p_sale_outcome=>'withdrawn');
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('14 withdrawn exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);
  -- 16 undisclosed price renders (1 row, nulls)
  select variant_id,ref_id into v,r from public._mev_variant('t16'); perform public._mev_attach(r,'t16',p_price_mode=>'undisclosed');
  select * into rec from public.market_evidence_for_reference(r);
  ok := (rec.reference='MEV-t16' and rec.price_realized is null and rec.currency is null and rec.price_basis is null);
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('16 undisclosed_renders %s (price=%s)'||E'\n',case when ok then 'PASS' else 'FAIL' end, rec.price_realized);
  -- 18 no decision
  select variant_id,ref_id into v,r from public._mev_variant('t18');  -- variant+ref only
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('18 no_decision exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);

  -- 10 unreviewed decision (needs NOT NULL relaxed, rolled back)
  alter table public.identity_resolution_decision alter column reviewed_by drop not null;
  alter table public.identity_resolution_decision alter column reviewed_at drop not null;
  select variant_id,ref_id into v,r from public._mev_variant('t10');
  perform public._mev_attach(r,'t10',p_reviewed_by=>null,p_reviewed_at=>null);
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('10 unreviewed exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);

  -- 17 partial price tuple (needs triplet check dropped, rolled back)
  alter table public.auction_evidence_result drop constraint aer_price_triplet_check;
  select variant_id,ref_id into v,r from public._mev_variant('t17');
  rid1 := public._mev_attach(r,'t17');            -- complete first
  update public.auction_evidence_result set currency=null where id=rid1;  -- now partial
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('17 partial_price exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);

  -- 19 multiple eligible → newest sale date wins
  select variant_id,ref_id into v,r from public._mev_variant('t19');
  perform public._mev_attach(r,'t19a',p_sale_date=>date '2025-01-01',p_price=>1000);
  perform public._mev_attach(r,'t19b',p_sale_date=>date '2026-06-13',p_price=>2000);
  select * into rec from public.market_evidence_for_reference(r);
  ok := (rec.sale_date=date '2026-06-13' and rec.price_realized=2000);
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('19 newest_sale_date %s (date=%s price=%s)'||E'\n',case when ok then 'PASS' else 'FAIL' end, rec.sale_date, rec.price_realized);

  -- 20 reversed reviewed_at does not change ordering
  select variant_id,ref_id into v,r from public._mev_variant('t20');
  perform public._mev_attach(r,'t20a',p_sale_date=>date '2025-01-01',p_price=>1000,p_reviewed_at=>now());              -- older sale, newest review
  perform public._mev_attach(r,'t20b',p_sale_date=>date '2026-06-13',p_price=>2000,p_reviewed_at=>now()-interval '10 days'); -- newer sale, oldest review
  select * into rec from public.market_evidence_for_reference(r);
  ok := (rec.sale_date=date '2026-06-13' and rec.price_realized=2000);
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('20 review_time_ignored %s (date=%s)'||E'\n',case when ok then 'PASS' else 'FAIL' end, rec.sale_date);

  -- 21 null sale dates sort last
  select variant_id,ref_id into v,r from public._mev_variant('t21');
  perform public._mev_attach(r,'t21a',p_sale_date=>null,p_price=>1000);
  perform public._mev_attach(r,'t21b',p_sale_date=>date '2026-06-13',p_price=>2000);
  select * into rec from public.market_evidence_for_reference(r);
  ok := (rec.sale_date=date '2026-06-13' and rec.price_realized=2000);
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('21 null_dates_last %s (date=%s)'||E'\n',case when ok then 'PASS' else 'FAIL' end, rec.sale_date);

  -- 22 identical sale dates → result.id ascending
  select variant_id,ref_id into v,r from public._mev_variant('t22');
  rid1 := public._mev_attach(r,'t22a',p_sale_date=>date '2026-06-13',p_price=>1111);
  rid2 := public._mev_attach(r,'t22b',p_sale_date=>date '2026-06-13',p_price=>2222);
  select * into rec from public.market_evidence_for_reference(r);
  ok := ((rec.price_realized=1111) = (rid1 < rid2));   -- winner is the smaller result.id
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('22 tie_result_id_asc %s (winner_price=%s)'||E'\n',case when ok then 'PASS' else 'FAIL' end, rec.price_realized);

  -- 23/24 sale-page URL truthful; no fictional lot URL
  select variant_id,ref_id into v,r from public._mev_variant('t23');
  perform public._mev_attach(r,'t23',
     p_lot_url=>'https://www.phillips.com/auction/NY080126',  -- sale page stored on the LOT artifact
     p_add_sale_page=>true);
  select * into rec from public.market_evidence_for_reference(r);
  ok := (rec.lot_page_url is null                                   -- 24: no fictional lot URL
         and rec.sale_page_url ~ '^https://[^/]+/auction/');        -- 23: truthful sale link
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('23/24 link_truthfulness %s (lot=%s sale=%s)'||E'\n',case when ok then 'PASS' else 'FAIL' end, rec.lot_page_url, rec.sale_page_url);

  -- 26 direct protected-table SELECT unavailable to public roles
  ok := not has_table_privilege('anon','public.identity_resolution_decision','select')
    and not has_table_privilege('anon','public.auction_evidence_result','select')
    and not has_table_privilege('authenticated','public.identity_resolution_decision','select')
    and not has_table_privilege('authenticated','public.auction_evidence_source_artifact','select');
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('26 no_public_table_select %s'||E'\n',case when ok then 'PASS' else 'FAIL' end);

  -- 27 RPC cannot mutate (stable/read-only) + is security definer + anon may execute
  select (p.provolatile in ('s','i') and p.prosecdef
          and has_function_privilege('anon','public.market_evidence_for_reference(uuid)','execute')
          and has_function_privilege('authenticated','public.market_evidence_for_reference(uuid)','execute')
          and (p.proacl is null or not (array_to_string(p.proacl,',') like '=%')))  -- no PUBLIC (=) grant
    into ok from pg_proc p where p.proname='market_evidence_for_reference';
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('27 read_only_definer_grants %s'||E'\n',case when ok then 'PASS' else 'FAIL' end);

  -- 28 at most one row (already exercised by 19/22; assert directly)
  select count(*) into cnt from public.market_evidence_for_reference(r);   -- v = t22 (two eligible)
  if cnt<=1 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('28 at_most_one_row got=%s %s'||E'\n',cnt,case when cnt<=1 then 'PASS' else 'FAIL' end);

  -- Sibling regression: one variant, two references A and B; evidence for A only.
  select variant_id,ref_id into v,r from public._mev_variant('tSIB');   -- r = ref A, v = variant
  rid2 := gen_random_uuid();                                            -- ref B id
  insert into public.vault_references(id,variant_id,reference) values (rid2, v, 'MEV-tSIB-B');
  perform public._mev_attach(r,'tSIBa');                                -- eligible evidence on A only
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=1 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('S1 sibling_A_returns_1 got=%s %s'||E'\n',cnt,case when cnt=1 then 'PASS' else 'FAIL' end);
  select count(*) into cnt from public.market_evidence_for_reference(rid2);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('S2 sibling_B_returns_0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);
  select * into rec from public.market_evidence_for_reference(r);
  ok := (rec.reference='MEV-tSIB');
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('S3 no_cross_reference_leak %s'||E'\n',case when ok then 'PASS' else 'FAIL' end);

  -- ── Live read-only proofs against the REAL Phillips REFERENCE ids ───────
  select count(*) into cnt from public.market_evidence_for_reference('7ee9b02f-4329-4611-8f6c-ea57e23ad301'); -- AP / Lot 53 reference
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('L1 live_AP_lot53 exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);
  select count(*) into cnt from public.market_evidence_for_reference('9dd35666-e9ea-49b3-89c8-4c9e3f57d142'); -- Omega / Lot 22 reference
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('L2 live_Omega_lot22 exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);

  raise exception E'MEV_HARNESS_REPORT  PASS=% FAIL=%\n%', n_pass, n_fail, rpt;
end
$harness$;
