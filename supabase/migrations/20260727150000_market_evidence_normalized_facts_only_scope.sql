-- ════════════════════════════════════════════════════════════════════════
-- MARKET EVIDENCE — durable `normalized_facts_only` public-use scope
-- (Phillips Facts-Only Activation, Implementation Order v1 §4/§5/§7)
--
-- WHY THIS EXISTS
--   The settled Phillips two-question ruling permits public use of NORMALIZED
--   FACTS ONLY (house, sale, lot, identity, sold state, realized price,
--   attribution, truthful links). `publication_status = 'allowed'` alone is too
--   broad a signal to carry that ruling durably: a future reader could mistake
--   'allowed' for blanket clearance of the underlying artifact (PDF, images,
--   catalogue prose, layout). This migration makes the narrow scope a DISTINCT,
--   CONTROLLED value that must be present IN ADDITION to the v2.61 rights
--   states before any artifact supports a public row.
--
-- WHAT IT ADDS
--   1  `public_use_scope` on auction_evidence_source_artifact:
--        · 'none'                   — default. NO public-use scope granted.
--        · 'normalized_facts_only'  — public use of normalized facts ONLY;
--                                     NEVER artifact reuse of any kind.
--      Default closed for every existing and future row. CHECK-constrained;
--      future separately-ruled scopes extend the CHECK by migration without
--      weakening this one.
--   2  The controlled rights-transition RPC carries the field through the SAME
--      append-only event mechanism as every other rights state (prior and
--      resulting snapshots include it; scope withdrawal ranks as restrictive).
--      The prior 16-parameter signature is dropped and replaced — it has no
--      application caller (verified; types/auctionEvidence.ts documents it
--      only) — so the field CANNOT be changed outside the event-writing path.
--   3  public.market_evidence_for_reference now requires
--      `public_use_scope = 'normalized_facts_only'` on EVERY artifact that
--      justifies a public fact: the lot-identity artifact, the result artifact,
--      and any artifact whose URL is emitted as the sale link. Missing, broad,
--      or unknown scope fails closed (zero rows).
--
-- WHAT IT DOES NOT DO
--   · It does NOT change any rights state, promote any artifact, or touch any
--     evidence row. All three live Phillips artifacts remain internal_only
--     with scope 'none' after this migration; both live references keep
--     returning zero rows until the separately authorized transition stage.
--   · It does NOT permit artifact reuse under any scope value. There is no
--     scope value that means "reuse the PDF/images/prose" — by design.
--
-- PFC274 = 62 — the evaluate route is untouched by this migration.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. The scope column — default closed, controlled vocabulary ────────────
alter table public.auction_evidence_source_artifact
  add column public_use_scope text not null default 'none';

alter table public.auction_evidence_source_artifact
  add constraint asa_public_use_scope_check
  check (public_use_scope in ('none','normalized_facts_only'));

comment on column public.auction_evidence_source_artifact.public_use_scope is
  'Narrow PUBLIC-USE scope granted to this artifact''s normalized facts. '
  '''none'' (default) = no public use. ''normalized_facts_only'' = the settled '
  'facts-only ruling: normalized sale/lot/identity/result facts and truthful '
  'attribution may appear publicly; the artifact itself (PDF, images, prose, '
  'layout) may NEVER be reproduced under any value of this column. Written '
  'ONLY through auction_evidence_update_artifact_rights_state (append-only '
  'event). publication_status=''allowed'' without this scope grants nothing.';

-- rights_writer already holds column-level UPDATE on the six protected rights
-- columns; the scope column joins that exact set.
grant update (public_use_scope)
  on public.auction_evidence_source_artifact to auction_evidence_rights_writer;

-- ── 2. Rights-transition RPC — extended to carry the scope ─────────────────
-- Drop the prior signature (no application caller) so exactly one controlled
-- path exists. Recreate with the scope change-pair; everything else preserved.
drop function if exists public.auction_evidence_update_artifact_rights_state(
  uuid, boolean, text, boolean, text, boolean, text, boolean, text,
  boolean, text, boolean, text, text, text, uuid);

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

  -- compute resulting values (change flag true => new value applied, even NULL)
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

  -- transition classification vs the CLAIMED event_type
  pub_to_blocked := (n_pub = 'blocked' and v_art.publication_status is distinct from 'blocked');
  perm_withdrawn := (n_perm in ('restricted','unresolved') and v_art.permission_status not in ('restricted','unresolved'));
  more_restrictive :=
       (case n_perm when 'restricted' then 3 when 'unresolved' then 2 else 0 end) > (case v_art.permission_status when 'restricted' then 3 when 'unresolved' then 2 else 0 end)
    or (case n_pub when 'blocked' then 3 when 'internal_only' then 2 when 'unresolved' then 1 else 0 end) > (case v_art.publication_status when 'blocked' then 3 when 'internal_only' then 2 when 'unresolved' then 1 else 0 end)
    or (case n_auto when 'disabled' then 2 when 'not_applicable' then 1 else 0 end) > (case v_art.automation_status when 'disabled' then 2 when 'not_applicable' then 1 else 0 end)
    or (case n_ret when 'metadata_only' then 2 when 'full_artifact_private' then 1 else 0 end) > (case v_art.artifact_retention_scope when 'metadata_only' then 2 when 'full_artifact_private' then 1 else 0 end)
    -- scope withdrawal ('normalized_facts_only' -> 'none') is a restriction
    or (case n_scope when 'none' then 1 else 0 end) > (case v_art.public_use_scope when 'none' then 1 else 0 end);

  if p_event_type = 'blocking' and not pub_to_blocked then
    raise exception 'event_type blocking requires publication_status to become blocked';
  elsif p_event_type = 'takedown' and not (pub_to_blocked or perm_withdrawn) then
    raise exception 'event_type takedown requires publication blocked or permission withdrawn';
  elsif p_event_type = 'restriction' and not more_restrictive then
    raise exception 'event_type restriction requires a move to a more restrictive state';
  end if;
  -- rights_state_change: any real change qualifies (already guaranteed by v_any_change)

  v_prior := jsonb_build_object(
    'intake_method', v_art.intake_method, 'permission_status', v_art.permission_status,
    'automation_status', v_art.automation_status, 'publication_status', v_art.publication_status,
    'artifact_retention_scope', v_art.artifact_retention_scope, 'full_artifact_storage_path', v_art.full_artifact_storage_path,
    'public_use_scope', v_art.public_use_scope);

  -- Only the seven protected columns are set here: rights_writer holds
  -- column-level UPDATE on exactly those. updated_at is set by the BEFORE
  -- UPDATE trigger, so it is deliberately NOT in this SET list.
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

comment on function public.auction_evidence_update_artifact_rights_state(uuid, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, text, text, uuid) is
  'The ONLY path that changes an artifact''s rights state, now including '
  'public_use_scope. Atomically applies the requested field changes and appends '
  'the complete before/after snapshot to auction_evidence_source_artifact_events. '
  'Scope withdrawal ranks as a restriction. Owner auction_evidence_rights_writer; '
  'execute service_role only. PFC274 = 62.';

-- ── 3. Public RPC — every supporting artifact must carry the exact scope ───
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
    -- Lot link ONLY when the lot's own rights-eligible artifact is a public
    -- https lot-DETAIL page. A sale-page URL never becomes a lot link.
    case
      when la.source_url ~ '^https://[^/]+/detail/' then la.source_url
      else null
    end                                                      as lot_page_url,
    -- Truthful sale link: a rights-eligible, facts-only-scoped artifact of
    -- THIS sale whose URL is a public https auction/sale page.
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
    on c.vault_reference_id = vr.id
   and c.candidate_role = 'selected'
  join public.identity_resolution_decision d
    on d.id = c.decision_id
   and d.is_current
   and d.outcome = 'exact'
   and d.reviewed_by is not null
   and d.reviewed_at is not null
  join public.identity_resolution_case k
    on k.id = d.case_id
   and k.subject_type = 'auction_lot'
   and k.auction_lot_id is not null
  join public.auction_evidence_lot l
    on l.id = k.auction_lot_id
  join public.auction_evidence_sale s
    on s.id = l.sale_id
  join public.auction_evidence_house h
    on h.id = s.house_id
  join public.auction_evidence_result r
    on r.lot_id = l.id
   and r.is_current
   and r.sale_outcome = 'sold'
  -- Rights gate — lot identity artifact (identity / sale / lot facts).
  -- publication + permission + EXACT facts-only public-use scope, all required.
  join public.auction_evidence_source_artifact la
    on la.id = l.source_artifact_id
   and la.publication_status = 'allowed'
   and la.permission_status in ('permitted', 'authorized_or_licensed')
   and la.public_use_scope = 'normalized_facts_only'
  -- Rights gate — result artifact (price / outcome facts). Independent of the
  -- lot artifact: neither eligible artifact may justify the other's facts.
  join public.auction_evidence_source_artifact ra
    on ra.id = r.source_artifact_id
   and ra.publication_status = 'allowed'
   and ra.permission_status in ('permitted', 'authorized_or_licensed')
   and ra.public_use_scope = 'normalized_facts_only'
  -- EXACT reference boundary: the case's selected candidate must resolve to
  -- the precise reference being rendered — never a sibling reference under the
  -- same variant. There is no variant-wide fallback.
  where vr.id = p_reference_id
    -- Canonical fingerprint, recomputed live; stale decisions fail closed.
    and d.claim_fingerprint
        = public.identity_resolution_claim_fingerprint('auction_lot', k.auction_lot_id)
    -- Price tuple: complete, or fully undisclosed. Partial is invalid.
    and (
          (r.price_realized is not null and r.currency is not null and r.price_basis is not null)
       or (r.price_realized is null     and r.currency is null     and r.price_basis is null)
        )
  order by s.sale_date desc nulls last, r.id asc
  limit 1
$fn$;

-- Owner stays postgres (owns every joined table, FORCE RLS off) — unchanged.
revoke all     on function public.market_evidence_for_reference(uuid) from public;
grant  execute on function public.market_evidence_for_reference(uuid) to anon;
grant  execute on function public.market_evidence_for_reference(uuid) to authenticated;

comment on function public.market_evidence_for_reference(uuid) is
  'Public Market Evidence for one EXACT Vault reference (vault_references.id). '
  'Read-only, security definer (owner postgres), fixed empty search_path, no '
  'dynamic SQL. A row is returned ONLY when every supporting artifact (lot '
  'identity, result, and any emitted sale-link artifact) is publication-allowed, '
  'permission-permitted, AND carries public_use_scope = normalized_facts_only '
  'exactly — missing, broader, or unknown scope fails closed. Scoped to the '
  'precise reference rendered; at most one deterministic, reviewed, '
  'fingerprint-valid exact sold result. Output is public-only: no ids, storage '
  'paths, reviewer identity, notes, or credentials. PFC274 = 62.';
