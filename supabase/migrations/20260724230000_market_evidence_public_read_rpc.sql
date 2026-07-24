-- ════════════════════════════════════════════════════════════════════════
-- MARKET EVIDENCE — narrow public read boundary  (v5, Public Rights Gate)
--
-- Adds ONE read-only function that returns the public Market Evidence payload
-- for one EXACT Vault reference, and closes the production rights-gating defect: the
-- prior server route (createServiceClient + broad table reads) suppressed only
-- publication_status = 'blocked', so artifacts that are merely 'internal_only'
-- could still be rendered publicly. This function fails CLOSED: a card is
-- returned only when every supporting artifact's rights state permits public
-- use (publication_status = 'allowed' AND a permitting permission_status).
--
-- SECURITY POSTURE
--   · security definer, STABLE (read-only), set search_path = '' (all objects
--     fully qualified), NO dynamic SQL.
--   · OWNER = postgres (the migration runner; no ownership transfer). Rationale:
--     every target table is owned by postgres with FORCE ROW LEVEL SECURITY
--     OFF, so a postgres-owned definer reads them without adding a single RLS
--     policy or new role, and postgres already holds EXECUTE on the canonical
--     fingerprint function. service_role — the app's current read identity — was
--     rejected as owner for two reasons: it lacks CREATE on schema public in
--     this project (cannot own objects there), and keeping it would not confine
--     the privilege any further. A dedicated reader role was rejected because,
--     lacking BYPASSRLS (superuser-only to grant) and any SELECT policy, it
--     would require adding RLS policies to the protected tables — a larger
--     change to domains this flight must not alter. The broad privilege that
--     used to live in application code (a general service-role client that could
--     read ANY column of ANY table) is now confined to this one fixed,
--     sanitized, STABLE read-only body. No new role; no RLS change.
--   · Direct invocation is safe: the output contains ONLY already-public
--     fields — no database ids, no storage paths, no signed URLs, no reviewer
--     identity, no notes, no credentials.
--   · Default PUBLIC execute is revoked; execute is granted ONLY to anon and
--     authenticated — the roles the server-side public read path runs as. The
--     browser never queries the protected tables directly.
--
-- ELIGIBILITY (all must hold, else zero rows — Identity Resolution + Auction
-- Evidence, v5 §6):
--   1  source is an Auction Evidence lot (case.subject_type = 'auction_lot');
--   2  the case's selected candidate resolves to the EXACT requested reference
--      (vault_references.id) — never a sibling reference of the same variant;
--   3  the decision is the current head decision (is_current);
--   4  outcome = 'exact';
--   5  human-reviewed (reviewed_by / reviewed_at present — schema-guaranteed,
--      re-asserted here as defense in depth);
--   6  fingerprint-valid against the live claim via the CANONICAL function
--      public.identity_resolution_claim_fingerprint (reused, never forked);
--   7  the linked result is current in its correction chain (is_current);
--   8  result outcome = 'sold';
--   9  price tuple valid: all three present, OR all three absent (partial =>
--      excluded);
--  10  BOTH supporting artifacts (lot identity + result) have a rights state
--      that permits public use. The lot artifact justifies identity/sale/lot
--      facts; the result artifact justifies price/outcome facts. Neither
--      substitutes for the other (v5 §6 final clause).
--  11  a returned source URL is an intended public https URL whose label
--      truthfully names its destination (lot-detail vs sale page); no fictional
--      lot URL is ever constructed (v5 §11).
--
-- Deterministic single result (v5 §10): newest sale_date, null dates last,
-- auction_evidence_result.id ascending as the final tie-break; LIMIT 1.
--
-- This migration changes NO rights state and NO evidence row. It does not
-- promote any Phillips artifact. Both current live proofs (AP / Lot 53 and
-- Omega Speedmaster 2998-5 / Lot 22) remain 'internal_only' and therefore
-- return zero rows until evidence rights are separately cleared.
--
-- PFC274 = 62 — the evaluate route is untouched by this migration.
-- ════════════════════════════════════════════════════════════════════════

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
    -- Truthful sale link: a rights-eligible artifact of THIS sale whose URL is
    -- a public https auction/sale page. Labelled as the sale, never the lot.
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
  join public.auction_evidence_source_artifact la
    on la.id = l.source_artifact_id
   and la.publication_status = 'allowed'
   and la.permission_status in ('permitted', 'authorized_or_licensed')
  -- Rights gate — result artifact (price / outcome facts). Independent of the
  -- lot artifact: neither eligible artifact may justify the other's facts.
  join public.auction_evidence_source_artifact ra
    on ra.id = r.source_artifact_id
   and ra.publication_status = 'allowed'
   and ra.permission_status in ('permitted', 'authorized_or_licensed')
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

-- Owner stays postgres (the deploy role): it owns every joined table with
-- FORCE RLS off and holds EXECUTE on the fingerprint function, so no ownership
-- transfer, new role, or RLS policy is introduced.

-- Least-privilege execution: no PUBLIC, only the public read path's roles.
revoke all     on function public.market_evidence_for_reference(uuid) from public;
grant  execute on function public.market_evidence_for_reference(uuid) to anon;
grant  execute on function public.market_evidence_for_reference(uuid) to authenticated;

comment on function public.market_evidence_for_reference(uuid) is
  'Public Market Evidence for one EXACT Vault reference (vault_references.id). '
  'Read-only, security definer (owner postgres), fixed empty search_path, no '
  'dynamic SQL. Scoped to the precise reference rendered — never a sibling '
  'reference of the same variant; no variant-wide fallback. Returns at most one '
  'deterministically selected, rights-cleared, reviewed, fingerprint-valid exact '
  'sold result. Output is public-only: no ids, storage paths, reviewer identity, '
  'notes, or credentials. Fails closed on any ineligibility. PFC274 = 62.';
