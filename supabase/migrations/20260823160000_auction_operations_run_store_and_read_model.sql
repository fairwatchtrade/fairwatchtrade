-- ═══════════════════════════════════════════════════════════════════════
-- AUCTION OPERATIONS — run store, results read model, private staging
--
-- THE MISCONCEPTION THIS FILE EXISTS TO KILL: none of this is a second
-- Auction Evidence system. auction_operations_run is OPERATIONAL state for
-- the founder room (what was planned, what hash was approved, how far an
-- apply got). Evidence truth stays exactly where it lives:
-- auction_evidence_* under the controlled writer RPC, whose grants this
-- migration does not touch. Deliberately NOT built: an ingestion_status
-- column on auction_evidence_sale — a run is not a sale fact.
--
-- Verify current state:
--   select adapter_id, packet_id, state, plan_sha256 is not null as planned
--     from auction_operations_run order by created_at desc limit 10;
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1 · The durable run/plan record ─────────────────────────────────────
create table if not exists public.auction_operations_run (
  id                uuid        primary key default gen_random_uuid(),
  adapter_id        text        not null,
  packet_id         text        not null,
  state             text        not null default 'uploading'
                    check (state in ('uploading','planning','planned','applying','applied','failed')),
  input_paths       jsonb       not null default '{}',
  source_hashes     jsonb       not null default '{}',
  -- The exact deterministic plan and the hash the founder approves. Apply
  -- reloads THIS plan and re-verifies THIS hash; browser-supplied plan
  -- facts are never authoritative.
  plan              jsonb,
  plan_sha256       text        check (plan_sha256 is null or plan_sha256 ~ '^[0-9a-f]{64}$'),
  summary           jsonb       not null default '{}',
  contradictions    jsonb       not null default '[]',
  progress          jsonb       not null default '{}',
  last_error_code   text,
  last_error_detail text,
  created_by        uuid        not null references auth.users (id) on delete restrict,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  approved_at       timestamptz,
  applied_at        timestamptz
);

create index if not exists auction_operations_run_recent_idx
  on public.auction_operations_run (created_at desc);

alter table public.auction_operations_run enable row level security;

-- Private operational state: no browser role reads or writes it, ever. The
-- founder reaches it only through founder-gated server routes that use the
-- trusted client after their own UID gate.
revoke all on public.auction_operations_run from public, anon, authenticated, service_role;
grant select, insert, update on public.auction_operations_run to service_role;

comment on table public.auction_operations_run is
  'Auction Operations plan/apply runs. Operational machinery for the founder room — never a duplicate of, or a status column on, Auction Evidence truth.';

-- ── 2 · Results read model — one row per sale, identity truth included ──
-- SECURITY INVOKER on purpose: only service_role can execute it, and the
-- fingerprint function already grants service_role. Freshness is computed
-- INSIDE Postgres so the page never runs one RPC per lot.
create or replace function public.auction_operations_results_read_model()
returns table (
  sale_id              uuid,
  sale_name            text,
  sale_date            date,
  location             text,
  source_url           text,
  house_name           text,
  artifact_count       bigint,
  permission_statuses  text[],
  publication_statuses text[],
  public_use_scopes    text[],
  retention_scopes     text[],
  lot_count            bigint,
  current_result_count bigint,
  sold_count           bigint,
  passed_count         bigint,
  withdrawn_count      bigint,
  unsold_count         bigint,
  priced_result_count  bigint,
  case_count           bigint,
  fresh_exact_count    bigint,
  fresh_nonexact_count bigint,
  stale_decision_count bigint,
  no_case_count        bigint
)
language sql
stable
set search_path = public, extensions
as $$
  with lot_identity as (
    select
      l.sale_id,
      l.id as lot_id,
      c.id as case_id,
      d.outcome,
      (d.claim_fingerprint = public.identity_resolution_claim_fingerprint('auction_lot', l.id)) as fp_fresh
    from public.auction_evidence_lot l
    left join public.identity_resolution_case c
      on c.subject_type = 'auction_lot' and c.auction_lot_id = l.id
    left join public.identity_resolution_decision d
      on d.case_id = c.id and d.is_current
  ),
  identity_rollup as (
    select
      sale_id,
      count(*)                                                        as lot_count,
      count(case_id)                                                  as case_count,
      count(*) filter (where case_id is null)                         as no_case_count,
      count(*) filter (where outcome = 'exact'  and fp_fresh)         as fresh_exact_count,
      count(*) filter (where outcome is not null and outcome <> 'exact' and fp_fresh) as fresh_nonexact_count,
      count(*) filter (where outcome is not null and not fp_fresh)    as stale_decision_count
    from lot_identity
    group by sale_id
  ),
  result_rollup as (
    select
      l.sale_id,
      count(*)                                              as current_result_count,
      count(*) filter (where r.sale_outcome = 'sold')       as sold_count,
      count(*) filter (where r.sale_outcome = 'passed')     as passed_count,
      count(*) filter (where r.sale_outcome = 'withdrawn')  as withdrawn_count,
      count(*) filter (where r.sale_outcome = 'unsold')     as unsold_count,
      count(*) filter (where r.price_realized is not null)  as priced_result_count
    from public.auction_evidence_result r
    join public.auction_evidence_lot l on l.id = r.lot_id
    where r.is_current
    group by l.sale_id
  ),
  artifact_rollup as (
    select
      a.sale_id,
      count(*)                                          as artifact_count,
      array_agg(distinct a.permission_status)           as permission_statuses,
      array_agg(distinct a.publication_status)          as publication_statuses,
      array_agg(distinct a.public_use_scope)            as public_use_scopes,
      array_agg(distinct a.artifact_retention_scope)    as retention_scopes
    from public.auction_evidence_source_artifact a
    group by a.sale_id
  )
  select
    s.id,
    s.sale_name,
    s.sale_date,
    s.location,
    s.source_url,
    h.name,
    coalesce(ar.artifact_count, 0),
    coalesce(ar.permission_statuses,  '{}'),
    coalesce(ar.publication_statuses, '{}'),
    coalesce(ar.public_use_scopes,    '{}'),
    coalesce(ar.retention_scopes,     '{}'),
    coalesce(ir.lot_count, 0),
    coalesce(rr.current_result_count, 0),
    coalesce(rr.sold_count, 0),
    coalesce(rr.passed_count, 0),
    coalesce(rr.withdrawn_count, 0),
    coalesce(rr.unsold_count, 0),
    coalesce(rr.priced_result_count, 0),
    coalesce(ir.case_count, 0),
    coalesce(ir.fresh_exact_count, 0),
    coalesce(ir.fresh_nonexact_count, 0),
    coalesce(ir.stale_decision_count, 0),
    coalesce(ir.no_case_count, 0)
  from public.auction_evidence_sale s
  join public.auction_evidence_house h on h.id = s.house_id
  left join identity_rollup ir on ir.sale_id = s.id
  left join result_rollup   rr on rr.sale_id = s.id
  left join artifact_rollup ar on ar.sale_id = s.id
$$;

revoke all on function public.auction_operations_results_read_model() from public, anon, authenticated;
grant execute on function public.auction_operations_results_read_model() to service_role;

comment on function public.auction_operations_results_read_model() is
  'One row per auction_evidence_sale with truthful source/result/identity rollups. A stale exact decision is counted stale, never resolved.';

-- ── 3 · Sale detail — everything the inspect page shows, one round trip ─
create or replace function public.auction_operations_sale_detail(p_sale_id uuid)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'sale', (
      select jsonb_build_object(
        'id', s.id, 'sale_name', s.sale_name, 'sale_date', s.sale_date,
        'location', s.location, 'source_url', s.source_url,
        'house', jsonb_build_object('name', h.name, 'slug', h.slug, 'website_url', h.website_url)
      )
      from public.auction_evidence_sale s
      join public.auction_evidence_house h on h.id = s.house_id
      where s.id = p_sale_id
    ),
    'artifacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'source_url', a.source_url, 'content_hash', a.content_hash,
        'retrieved_at', a.retrieved_at, 'intake_method', a.intake_method,
        'permission_status', a.permission_status, 'automation_status', a.automation_status,
        'publication_status', a.publication_status, 'public_use_scope', a.public_use_scope,
        'artifact_retention_scope', a.artifact_retention_scope,
        'attribution_note', a.attribution_note, 'price_basis_statement', a.price_basis_statement,
        'omission_statement', a.omission_statement
      ) order by a.created_at)
      from public.auction_evidence_source_artifact a where a.sale_id = p_sale_id
    ), '[]'),
    'lots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'lot_number', l.lot_number, 'brand_text', l.brand_text,
        'model_text', l.model_text, 'reference_text', l.reference_text,
        'description', l.description,
        'result', (
          select jsonb_build_object(
            'sale_outcome', r.sale_outcome, 'price_realized', r.price_realized,
            'currency', r.currency, 'price_basis', r.price_basis,
            'result_date', r.result_date
          )
          from public.auction_evidence_result r
          where r.lot_id = l.id and r.is_current
        ),
        'identity', (
          select jsonb_build_object(
            'outcome', d.outcome,
            'fingerprint_fresh',
              d.claim_fingerprint = public.identity_resolution_claim_fingerprint('auction_lot', l.id),
            'reviewed_at', d.reviewed_at
          )
          from public.identity_resolution_case c
          join public.identity_resolution_decision d on d.case_id = c.id and d.is_current
          where c.subject_type = 'auction_lot' and c.auction_lot_id = l.id
        )
      ) order by (case when l.lot_number ~ '^[0-9]+$' then lpad(l.lot_number, 12, '0') else l.lot_number end))
      from public.auction_evidence_lot l where l.sale_id = p_sale_id
    ), '[]')
  )
$$;

revoke all on function public.auction_operations_sale_detail(uuid) from public, anon, authenticated;
grant execute on function public.auction_operations_sale_detail(uuid) to service_role;

comment on function public.auction_operations_sale_detail(uuid) is
  'Read-first inspection payload for /admin/auctions/results/[saleId]. Never claims retained bytes; retention truth rides on each artifact row.';

-- ── 4 · Private staging bucket — founder source files, never evidence ───
-- Signed-token uploads only; no RLS policy grants any client role access,
-- so nothing but the trusted server (and a token it issued) can touch it.
-- Staging bytes are NEVER promoted into Auction Evidence retention: current
-- importer semantics are metadata_only and stay that way.
insert into storage.buckets (id, name, public, file_size_limit)
values ('auction-operations-staging', 'auction-operations-staging', false, 52428800)
on conflict (id) do nothing;
