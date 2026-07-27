-- ════════════════════════════════════════════════════════════════════════
-- MARKET EVIDENCE RPC — fixture + security harness
-- (v5 Public Rights Gate + Phillips `normalized_facts_only` scope extension)
--
-- Runs the REAL migration DDL against the REAL production schema inside a
-- single transaction that is GUARANTEED to leave the database byte-identical:
-- the harness ends by RAISE-ing its own report, which aborts the transaction.
-- Nothing — not the scope column, not the functions, not one seeded row — is
-- ever committed.
--
-- Why production-with-rollback rather than a Supabase branch: the repo's
-- migration history begins at v2.21 and does not recreate the pre-v2.21
-- baseline (e.g. vault_references / vault_variants / vault_families), so a
-- from-scratch branch cannot reconstruct the schema this function joins. A
-- fully-rolled-back transaction on the real database is the only environment
-- with the true schema, the real canonical fingerprint function, and the real
-- anon / authenticated / service_role / rights-writer roles. The terminal
-- RAISE makes zero persistence structural, not merely intended.
--
-- The DDL section is guarded (IF NOT EXISTS / IF EXISTS) so the harness runs
-- identically BEFORE the scope migration is applied (proving the migration
-- itself) and AFTER it (as a pure regression suite).
--
-- Execute as a SINGLE statement batch. Expect it to finish with:
--   ERROR:  MEV_HARNESS_REPORT ...
-- That error IS the successful result. Read PASS/FAIL from its message.
-- ════════════════════════════════════════════════════════════════════════

-- ── Migration under test (verbatim semantics of 20260727150000) ─────────────
alter table public.auction_evidence_source_artifact
  add column if not exists public_use_scope text not null default 'none';
alter table public.auction_evidence_source_artifact
  drop constraint if exists asa_public_use_scope_check;
alter table public.auction_evidence_source_artifact
  add constraint asa_public_use_scope_check
  check (public_use_scope in ('none','normalized_facts_only'));
grant update (public_use_scope)
  on public.auction_evidence_source_artifact to auction_evidence_rights_writer;

drop function if exists public.auction_evidence_update_artifact_rights_state(
  uuid, boolean, text, boolean, text, boolean, text, boolean, text,
  boolean, text, boolean, text, text, text, uuid);
drop function if exists public.auction_evidence_update_artifact_rights_state(
  uuid, boolean, text, boolean, text, boolean, text, boolean, text,
  boolean, text, boolean, text, boolean, text, text, text, uuid);

create or replace function public.auction_evidence_update_artifact_rights_state(
  p_source_artifact_id                uuid,
  p_change_intake_method              boolean,
  p_new_intake_method                 text,
  p_change_permission_status          boolean,
  p_new_permission_status             text,
  p_change_automation_status          boolean,
  p_new_automation_status             text,
  p_change_publication_status         boolean,
  p_new_publication_status            text,
  p_change_artifact_retention_scope   boolean,
  p_new_artifact_retention_scope      text,
  p_change_full_artifact_storage_path boolean,
  p_new_full_artifact_storage_path    text,
  p_change_public_use_scope           boolean,
  p_new_public_use_scope              text,
  p_event_type                        text,
  p_reason                            text,
  p_actor_uid                         uuid
)
returns public.auction_evidence_source_artifact
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_art   public.auction_evidence_source_artifact;
  v_after public.auction_evidence_source_artifact;
  n_intake text; n_perm text; n_auto text; n_pub text; n_ret text; n_path text; n_scope text;
  v_prior jsonb; v_result jsonb;
  v_any_change boolean;
  pub_to_blocked boolean; perm_withdrawn boolean; more_restrictive boolean;
begin
  if p_actor_uid is null then raise exception 'actor_uid is required'; end if;
  if p_event_type is null or p_event_type not in ('rights_state_change','takedown','restriction','blocking') then
    raise exception 'invalid event_type: %', coalesce(p_event_type,'NULL');
  end if;
  if not (p_change_intake_method or p_change_permission_status or p_change_automation_status
          or p_change_publication_status or p_change_artifact_retention_scope
          or p_change_full_artifact_storage_path or p_change_public_use_scope) then
    raise exception 'no-op: at least one field change is required';
  end if;
  if p_event_type in ('takedown','restriction','blocking') and (p_reason is null or btrim(p_reason) = '') then
    raise exception 'reason is required (non-empty) for a % event', p_event_type;
  end if;

  select * into v_art from public.auction_evidence_source_artifact where id = p_source_artifact_id for update;
  if not found then raise exception 'source artifact % does not exist', p_source_artifact_id; end if;

  n_intake := case when p_change_intake_method then p_new_intake_method else v_art.intake_method end;
  n_perm   := case when p_change_permission_status then p_new_permission_status else v_art.permission_status end;
  n_auto   := case when p_change_automation_status then p_new_automation_status else v_art.automation_status end;
  n_pub    := case when p_change_publication_status then p_new_publication_status else v_art.publication_status end;
  n_ret    := case when p_change_artifact_retention_scope then p_new_artifact_retention_scope else v_art.artifact_retention_scope end;
  n_path   := case when p_change_full_artifact_storage_path then p_new_full_artifact_storage_path else v_art.full_artifact_storage_path end;
  n_scope  := case when p_change_public_use_scope then p_new_public_use_scope else v_art.public_use_scope end;

  v_any_change := (n_intake is distinct from v_art.intake_method)
    or (n_perm is distinct from v_art.permission_status)
    or (n_auto is distinct from v_art.automation_status)
    or (n_pub is distinct from v_art.publication_status)
    or (n_ret is distinct from v_art.artifact_retention_scope)
    or (n_path is distinct from v_art.full_artifact_storage_path)
    or (n_scope is distinct from v_art.public_use_scope);
  if not v_any_change then
    raise exception 'no-op: supplied changes leave every field identical';
  end if;

  pub_to_blocked := (n_pub = 'blocked' and v_art.publication_status is distinct from 'blocked');
  perm_withdrawn := (n_perm in ('restricted','unresolved') and v_art.permission_status not in ('restricted','unresolved'));
  more_restrictive :=
       (case n_perm when 'restricted' then 3 when 'unresolved' then 2 else 0 end) > (case v_art.permission_status when 'restricted' then 3 when 'unresolved' then 2 else 0 end)
    or (case n_pub when 'blocked' then 3 when 'internal_only' then 2 when 'unresolved' then 1 else 0 end) > (case v_art.publication_status when 'blocked' then 3 when 'internal_only' then 2 when 'unresolved' then 1 else 0 end)
    or (case n_auto when 'disabled' then 2 when 'not_applicable' then 1 else 0 end) > (case v_art.automation_status when 'disabled' then 2 when 'not_applicable' then 1 else 0 end)
    or (case n_ret when 'metadata_only' then 2 when 'full_artifact_private' then 1 else 0 end) > (case v_art.artifact_retention_scope when 'metadata_only' then 2 when 'full_artifact_private' then 1 else 0 end)
    or (case n_scope when 'none' then 1 else 0 end) > (case v_art.public_use_scope when 'none' then 1 else 0 end);

  if p_event_type = 'blocking' and not pub_to_blocked then
    raise exception 'event_type blocking requires publication_status to become blocked';
  elsif p_event_type = 'takedown' and not (pub_to_blocked or perm_withdrawn) then
    raise exception 'event_type takedown requires publication blocked or permission withdrawn';
  elsif p_event_type = 'restriction' and not more_restrictive then
    raise exception 'event_type restriction requires a move to a more restrictive state';
  end if;

  v_prior := jsonb_build_object(
    'intake_method', v_art.intake_method, 'permission_status', v_art.permission_status,
    'automation_status', v_art.automation_status, 'publication_status', v_art.publication_status,
    'artifact_retention_scope', v_art.artifact_retention_scope, 'full_artifact_storage_path', v_art.full_artifact_storage_path,
    'public_use_scope', v_art.public_use_scope);

  update public.auction_evidence_source_artifact set
    intake_method = n_intake, permission_status = n_perm, automation_status = n_auto,
    publication_status = n_pub, artifact_retention_scope = n_ret, full_artifact_storage_path = n_path,
    public_use_scope = n_scope
  where id = v_art.id
  returning * into v_after;

  v_result := jsonb_build_object(
    'intake_method', v_after.intake_method, 'permission_status', v_after.permission_status,
    'automation_status', v_after.automation_status, 'publication_status', v_after.publication_status,
    'artifact_retention_scope', v_after.artifact_retention_scope, 'full_artifact_storage_path', v_after.full_artifact_storage_path,
    'public_use_scope', v_after.public_use_scope);

  insert into public.auction_evidence_source_artifact_events (
    source_artifact_id, event_type, prior_state, resulting_state, reason, actor_uid
  ) values (
    v_art.id, p_event_type, v_prior, v_result, p_reason, p_actor_uid
  );

  return v_after;
end;
$fn$;

alter function public.auction_evidence_update_artifact_rights_state(uuid, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, text, text, uuid) owner to auction_evidence_rights_writer;
revoke all     on function public.auction_evidence_update_artifact_rights_state(uuid, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, text, text, uuid) from public;
revoke all     on function public.auction_evidence_update_artifact_rights_state(uuid, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, text, text, uuid) from anon;
revoke all     on function public.auction_evidence_update_artifact_rights_state(uuid, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, text, text, uuid) from authenticated;
grant  execute on function public.auction_evidence_update_artifact_rights_state(uuid, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, text, text, uuid) to   service_role;

-- ── The public function under test (verbatim copy of the migration body) ────
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
         and spa.public_use_scope = 'normalized_facts_only'
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
   and la.public_use_scope = 'normalized_facts_only'
  join public.auction_evidence_source_artifact ra
    on ra.id = r.source_artifact_id
   and ra.publication_status = 'allowed'
   and ra.permission_status in ('permitted', 'authorized_or_licensed')
   and ra.public_use_scope = 'normalized_facts_only'
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
  p_sale_date date default date '2026-06-13', p_price numeric default 22860,
  p_lot_scope text default 'normalized_facts_only',
  p_res_scope text default 'normalized_facts_only')
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
       publication_status,artifact_retention_scope,public_use_scope)
      values (v_lot_art,v_sale,v_lot_url,now(),'manual_entry',p_lot_perm,'not_applicable',
              p_lot_pub,'metadata_only',p_lot_scope);
  end if;
  if p_res_artifact then
    v_res_art := gen_random_uuid();
    insert into public.auction_evidence_source_artifact
      (id,sale_id,source_url,retrieved_at,intake_method,permission_status,automation_status,
       publication_status,artifact_retention_scope,public_use_scope)
      values (v_res_art,v_sale,'https://www.phillips.com/results/'||substr(md5(p_tag),1,6),now(),
              'public_file',p_res_perm,'not_applicable',p_res_pub,'metadata_only',p_res_scope);
  end if;
  if p_add_sale_page then
    insert into public.auction_evidence_source_artifact
      (id,sale_id,source_url,retrieved_at,intake_method,permission_status,automation_status,
       publication_status,artifact_retention_scope,public_use_scope)
      values (gen_random_uuid(),v_sale,v_sale_url,now(),'founder_supplied_file','permitted',
              'not_applicable','allowed','metadata_only','normalized_facts_only');
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
  cnt int; rec record; ok boolean;
  -- scope-extension locals
  v_actor uuid := '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
  v_art_id uuid; v_ev record;
  live_snap_before jsonb; live_snap_after jsonb;
  v_house uuid; v_sale uuid; v_res_art uuid; v_lotA uuid; v_lotB uuid;
  v_lotA_art uuid; v_lotB_art uuid; v_caseA uuid; v_caseB uuid;
  v_decA uuid; v_decB uuid; v_resA uuid; v_resB uuid; rA uuid; rB uuid;
begin
  -- N14 baseline: snapshot the three REAL Phillips artifacts before anything.
  select jsonb_agg(jsonb_build_object(
           'id', a.id, 'perm', a.permission_status, 'pub', a.publication_status,
           'scope', a.public_use_scope, 'ret', a.artifact_retention_scope,
           'intake', a.intake_method, 'url', a.source_url) order by a.id)
    into live_snap_before
    from public.auction_evidence_source_artifact a
   where a.id in ('403bf1fd-b256-4cf7-aed5-367f913ef6d7',
                  '43da11af-d8e6-4bec-897b-f8b7dbb007ff',
                  '70c47ff7-92fe-46b6-8304-a9c746b5d806');

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
                             'full_artifact_storage_path','attribution_note','claim_fingerprint',
                             'public_use_scope'))
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

  -- ════════════ SCOPE EXTENSION MATRIX (order §9, items 1-8 & 12-14) ═══════
  -- (§9.9 = test 26 · §9.10 = test 27 · §9.11 = the whole matrix above)

  -- N1 (§9.1) allowed WITHOUT a public-use scope → 0
  select variant_id,ref_id into v,r from public._mev_variant('n1');
  perform public._mev_attach(r,'n1',p_lot_scope=>'none',p_res_scope=>'none');
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('N1 allowed_scope_none exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);

  -- N2 (§9.2) unknown / broader scope → 0 (CHECK dropped to admit the value,
  -- re-added NOT VALID after — all rolled back)
  alter table public.auction_evidence_source_artifact drop constraint asa_public_use_scope_check;
  select variant_id,ref_id into v,r from public._mev_variant('n2');
  perform public._mev_attach(r,'n2',p_lot_scope=>'blanket_artifact_reuse',p_res_scope=>'blanket_artifact_reuse');
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('N2 unknown_broader_scope exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);
  alter table public.auction_evidence_source_artifact
    add constraint asa_public_use_scope_check
    check (public_use_scope in ('none','normalized_facts_only')) not valid;

  -- N3 (§9.3) scope present but permission/publication state incomplete → 0
  select variant_id,ref_id into v,r from public._mev_variant('n3a');
  perform public._mev_attach(r,'n3a',p_lot_pub=>'internal_only');       -- scoped, not publication-allowed
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('N3a scoped_internal_only exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);
  select variant_id,ref_id into v,r from public._mev_variant('n3b');
  perform public._mev_attach(r,'n3b',p_res_perm=>'unresolved');         -- scoped, permission unresolved
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('N3b scoped_perm_unresolved exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);

  -- N4 (§9.4) complete facts-only state → exactly one sanitized row
  select variant_id,ref_id into v,r from public._mev_variant('n4');
  perform public._mev_attach(r,'n4');
  select * into rec from public.market_evidence_for_reference(r);
  select count(*) into cnt from public.market_evidence_for_reference(r);
  ok := (cnt=1 and rec.reference='MEV-n4' and rec.price_realized=22860 and rec.currency='USD'
         and rec.price_basis='hammer_plus_premium' and rec.lot_number='22');
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('N4 facts_only_complete_renders %s (cnt=%s price=%s)'||E'\n',case when ok then 'PASS' else 'FAIL' end,cnt,rec.price_realized);

  -- N5 (§9.5) required LOT artifact missing facts-only scope → 0
  select variant_id,ref_id into v,r from public._mev_variant('n5');
  perform public._mev_attach(r,'n5',p_lot_scope=>'none');
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('N5 lot_scope_missing exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);

  -- N6 (§9.6) required RESULT artifact missing facts-only scope → 0
  select variant_id,ref_id into v,r from public._mev_variant('n6');
  perform public._mev_attach(r,'n6',p_res_scope=>'none');
  select count(*) into cnt from public.market_evidence_for_reference(r);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('N6 result_scope_missing exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);

  -- N7 (§9.7) a SHARED results artifact cannot activate a sibling lot that
  -- lacks its own eligible lot support. One sale, one fully-eligible shared
  -- result artifact; lot A has a scoped lot artifact, lot B's lot artifact has
  -- scope 'none'. A renders; B stays dark.
  select variant_id,ref_id into v,rA from public._mev_variant('n7a');
  select variant_id,ref_id into v,rB from public._mev_variant('n7b');
  v_house := gen_random_uuid(); v_sale := gen_random_uuid();
  v_res_art := gen_random_uuid(); v_lotA := gen_random_uuid(); v_lotB := gen_random_uuid();
  v_lotA_art := gen_random_uuid(); v_lotB_art := gen_random_uuid();
  v_caseA := gen_random_uuid(); v_caseB := gen_random_uuid();
  v_decA := gen_random_uuid(); v_decB := gen_random_uuid();
  v_resA := gen_random_uuid(); v_resB := gen_random_uuid();
  insert into public.auction_evidence_house(id,name,slug) values (v_house,'House n7','h-n7shared01');
  insert into public.auction_evidence_sale(id,house_id,sale_name,sale_date,location,source_url)
    values (v_sale,v_house,'Sale n7',date '2026-06-13','New York','https://www.phillips.com/auction/NYN7SHARE');
  insert into public.auction_evidence_source_artifact
    (id,sale_id,source_url,retrieved_at,intake_method,permission_status,automation_status,publication_status,artifact_retention_scope,public_use_scope)
    values
    (v_res_art, v_sale,'https://www.phillips.com/results/n7shared',now(),'public_file','permitted','not_applicable','allowed','metadata_only','normalized_facts_only'),
    (v_lotA_art,v_sale,'https://www.phillips.com/detail/x/n7lota',  now(),'manual_entry','permitted','not_applicable','allowed','metadata_only','normalized_facts_only'),
    (v_lotB_art,v_sale,'https://www.phillips.com/detail/x/n7lotb',  now(),'manual_entry','permitted','not_applicable','allowed','metadata_only','none');
  insert into public.auction_evidence_lot(id,sale_id,lot_number,brand_text,model_text,reference_text,source_artifact_id)
    values (v_lotA,v_sale,'22','Omega','Speedmaster','2998-5',v_lotA_art),
           (v_lotB,v_sale,'53','Audemars Piguet','Royal Oak','26589',v_lotB_art);
  insert into public.identity_resolution_case(id,subject_type,auction_lot_id)
    values (v_caseA,'auction_lot',v_lotA),(v_caseB,'auction_lot',v_lotB);
  insert into public.identity_resolution_decision
    (id,case_id,chain_root_id,supersedes_decision_id,is_current,outcome,claim_fingerprint,review_reason,reviewed_by,reviewed_at)
    values (v_decA,v_caseA,v_decA,null,true,'exact',public.identity_resolution_claim_fingerprint('auction_lot',v_lotA),'test',v_actor,now()),
           (v_decB,v_caseB,v_decB,null,true,'exact',public.identity_resolution_claim_fingerprint('auction_lot',v_lotB),'test',v_actor,now());
  insert into public.identity_resolution_candidate(id,decision_id,vault_reference_id,candidate_role,evidence,ordinal)
    values (gen_random_uuid(),v_decA,rA,'selected','e',1),
           (gen_random_uuid(),v_decB,rB,'selected','e',1);
  insert into public.auction_evidence_result
    (id,chain_root_id,supersedes_result_id,is_current,lot_id,price_realized,currency,price_basis,sale_outcome,result_date,source_artifact_id,reviewed_by,reviewed_at)
    values (v_resA,v_resA,null,true,v_lotA,22860,'USD','hammer_plus_premium','sold',date '2026-06-13',v_res_art,v_actor,now()),
           (v_resB,v_resB,null,true,v_lotB,101600,'USD','hammer_plus_premium','sold',date '2026-06-13',v_res_art,v_actor,now());
  select count(*) into cnt from public.market_evidence_for_reference(rA);
  if cnt=1 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('N7a shared_result_A_renders exp=1 got=%s %s'||E'\n',cnt,case when cnt=1 then 'PASS' else 'FAIL' end);
  select count(*) into cnt from public.market_evidence_for_reference(rB);
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('N7b shared_result_no_sibling_activation exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);

  -- N8 (§9.8) payload is EXACTLY the 14 sanctioned public columns — nothing else
  select (count(*) = 14 and bool_and(pn = any (array[
           'reference','house','sale_title','sale_code','sale_date','location',
           'lot_number','price_realized','currency','price_basis','lot_page_url',
           'sale_page_url','identity_source_label','result_source_label'])))
    into ok
  from (select unnest(p.proargnames) pn, unnest(p.proargmodes) pm
        from pg_proc p where p.proname='market_evidence_for_reference') q
  where pm = 't';
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('N8 payload_exact_14_columns %s'||E'\n',case when ok then 'PASS' else 'FAIL' end);

  -- N12 (§9.12) the controlled transition appends the event and produces the
  -- correct current state — end to end: dark artifact → transition → renders.
  select variant_id,ref_id into v,r from public._mev_variant('n12');
  perform public._mev_attach(r,'n12',p_lot_pub=>'internal_only',p_lot_perm=>'unresolved',p_lot_scope=>'none');
  select count(*) into cnt from public.market_evidence_for_reference(r);
  ok := (cnt=0);
  select a.id into v_art_id
    from public.auction_evidence_source_artifact a
   where a.source_url = 'https://www.phillips.com/detail/x/'||substr(md5('n12'),1,6);
  execute 'set local role auction_evidence_rights_writer';
  perform public.auction_evidence_update_artifact_rights_state(
    v_art_id,
    false,null,                      -- intake unchanged
    true,'permitted',                -- permission → permitted (facts-only truth; NOT authorized_or_licensed)
    false,null,                      -- automation unchanged
    true,'allowed',                  -- publication → allowed
    false,null,                      -- retention unchanged (metadata_only)
    false,null,                      -- storage path unchanged
    true,'normalized_facts_only',    -- THE scope
    'rights_state_change',
    'Harness: Phillips facts-only ruling transition (rolled back)',
    v_actor);
  execute 'reset role';
  select count(*) into cnt from public.market_evidence_for_reference(r);
  select e.* into v_ev
    from public.auction_evidence_source_artifact_events e
   where e.source_artifact_id = v_art_id
   order by e.created_at desc limit 1;
  ok := ok and (cnt=1)
        and (v_ev.event_type='rights_state_change')
        and (v_ev.prior_state->>'public_use_scope'='none')
        and (v_ev.resulting_state->>'public_use_scope'='normalized_facts_only')
        and exists (select 1 from public.auction_evidence_source_artifact a
                     where a.id=v_art_id and a.public_use_scope='normalized_facts_only'
                       and a.publication_status='allowed' and a.permission_status='permitted');
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('N12 transition_appends_event_and_activates %s (post_cnt=%s)'||E'\n',case when ok then 'PASS' else 'FAIL' end,cnt);

  -- N13 (§9.13) reversal/supersession returns the artifact to a non-public
  -- state WITHOUT deleting history.
  execute 'set local role auction_evidence_rights_writer';
  perform public.auction_evidence_update_artifact_rights_state(
    v_art_id,
    false,null, false,null, false,null,
    true,'internal_only',            -- publication back down
    false,null, false,null,
    true,'none',                     -- scope withdrawn
    'restriction',
    'Harness: reversal (rolled back)',
    v_actor);
  execute 'reset role';
  select count(*) into cnt from public.market_evidence_for_reference(r);
  ok := (cnt=0)
        and ((select count(*) from public.auction_evidence_source_artifact_events e where e.source_artifact_id=v_art_id) = 2)
        and exists (select 1 from public.auction_evidence_source_artifact_events e
                     where e.source_artifact_id=v_art_id and e.event_type='rights_state_change'
                       and e.resulting_state->>'public_use_scope'='normalized_facts_only')
        and exists (select 1 from public.auction_evidence_source_artifact a
                     where a.id=v_art_id and a.public_use_scope='none' and a.publication_status='internal_only');
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('N13 reversal_nonpublic_history_kept %s (post_cnt=%s)'||E'\n',case when ok then 'PASS' else 'FAIL' end,cnt);

  -- N14 (§9.14) unapproved artifacts unchanged — the three REAL Phillips
  -- artifacts are byte-identical on every rights field, still scope 'none'.
  select jsonb_agg(jsonb_build_object(
           'id', a.id, 'perm', a.permission_status, 'pub', a.publication_status,
           'scope', a.public_use_scope, 'ret', a.artifact_retention_scope,
           'intake', a.intake_method, 'url', a.source_url) order by a.id)
    into live_snap_after
    from public.auction_evidence_source_artifact a
   where a.id in ('403bf1fd-b256-4cf7-aed5-367f913ef6d7',
                  '43da11af-d8e6-4bec-897b-f8b7dbb007ff',
                  '70c47ff7-92fe-46b6-8304-a9c746b5d806');
  ok := (live_snap_before = live_snap_after)
        and (select bool_and(a.public_use_scope='none' and a.publication_status='internal_only')
               from public.auction_evidence_source_artifact a
              where a.id in ('403bf1fd-b256-4cf7-aed5-367f913ef6d7',
                             '43da11af-d8e6-4bec-897b-f8b7dbb007ff',
                             '70c47ff7-92fe-46b6-8304-a9c746b5d806'));
  if ok then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('N14 real_artifacts_untouched %s'||E'\n',case when ok then 'PASS' else 'FAIL' end);

  -- ── Live read-only proofs against the REAL Phillips REFERENCE ids ───────
  -- (post-DDL, pre-transition: proves the migration alone changes nothing)
  select count(*) into cnt from public.market_evidence_for_reference('7ee9b02f-4329-4611-8f6c-ea57e23ad301'); -- AP / Lot 53 reference
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('L1 live_AP_lot53 exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);
  select count(*) into cnt from public.market_evidence_for_reference('9dd35666-e9ea-49b3-89c8-4c9e3f57d142'); -- Omega / Lot 22 reference
  if cnt=0 then n_pass:=n_pass+1; else n_fail:=n_fail+1; end if; rpt:=rpt||format('L2 live_Omega_lot22 exp=0 got=%s %s'||E'\n',cnt,case when cnt=0 then 'PASS' else 'FAIL' end);

  raise exception E'MEV_HARNESS_REPORT  PASS=% FAIL=%\n%', n_pass, n_fail, rpt;
end
$harness$;
