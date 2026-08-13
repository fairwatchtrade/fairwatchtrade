-- ============================================================================
-- Collector Dossier — retrieval-bound evidence
--
-- THE GAP THIS CLOSES. The v4.45 evidence contract proved SHAPE: the URL
-- parses, the host is not a known placeholder, the source name is not
-- obvious prose, the access date is ISO. A fabricated but well-formed
-- source object passes all four. That is not enough to govern automatic
-- research population.
--
--   A citation is not evidence merely because its URL looks plausible.
--   Retrieve it. Bind it. Then judge it.
--
-- This table is the durable record of sources ACTUALLY FETCHED. A claim's
-- evidence now carries the retrieval id it was drawn from, and the
-- admission contracts refuse any cited claim whose source was never
-- retrieved, whose excerpt is absent from the retrieved text, or whose
-- asserted value the retrieved material does not support.
--
-- RETRIEVAL PROOF IS NOT TRUTH PROOF. Successful retrieval establishes only
-- that the source was obtained; successful binding, only that the source
-- carries the attached material. Whether that evidence is SUFFICIENT stays
-- entirely downstream with source class, corroboration, exact-reference
-- discipline, plausibility and the human escape hatch — none of which this
-- migration touches.
--
-- Bounded by design: the normalized text is capped and no raw page blob is
-- retained. The content hash is over NORMALIZED text, so presentation churn
-- does not look like a content change while a factual edit does.
--
-- Append-only in practice: a later retrieval of the same URL whose content
-- changed becomes a NEW row and supersedes the old one, so claims stay
-- auditable against the evidence state they were admitted from.
--
-- Rollback: supabase/rollbacks/20260813190000_collector_dossier_source_retrievals.down.sql
-- ============================================================================

create table public.collector_dossier_source_retrievals (
  id               uuid primary key default gen_random_uuid(),
  requested_url    text not null,
  resolved_url     text,
  host             text not null,
  http_status      integer,
  content_type     text,
  source_title     text,
  -- Bounded, tag-stripped, normalized-comparable text. Enough to prove
  -- support and reproduce the check; never a page archive.
  evidence_text    text not null,
  content_sha256   text not null,
  content_bytes    integer,
  retrieved_at     timestamptz not null default now(),
  source_accessed  date not null default (now() at time zone 'utc')::date,
  provenance       text not null default 'SERVER_FETCH',
  lifecycle        text not null default 'current'
    constraint cdsr_lifecycle_check check (lifecycle in ('current', 'superseded')),
  supersedes_id    uuid references public.collector_dossier_source_retrievals(id),
  created_at       timestamptz not null default now(),

  -- A retrieval row exists only for something that actually came back.
  constraint cdsr_real_retrieval check (
    http_status is not null and http_status >= 200 and http_status < 400
    and length(evidence_text) > 0
    and content_sha256 ~ '^[0-9a-f]{64}$'
  )
);

-- One current retrieval per requested URL; changed content supersedes.
create unique index cdsr_current_per_url
  on public.collector_dossier_source_retrievals (requested_url)
  where lifecycle = 'current';

create index cdsr_host_idx on public.collector_dossier_source_retrievals (host, retrieved_at desc);

-- Server-governed: no client role may write a "retrieval" it did not perform.
revoke all on public.collector_dossier_source_retrievals from public, anon, authenticated;

-- Claims record which retrieval their evidence came from. Kept as a column
-- for auditability alongside the per-evidence retrievalId already carried in
-- the evidence payload, so a reader can see binding without parsing jsonb.
alter table public.collector_dossier_claims
  add column if not exists evidence_binding text not null default 'UNBOUND'
    constraint cdc_evidence_binding_check check (evidence_binding in
      ('UNBOUND', 'RETRIEVAL_BOUND'));

comment on column public.collector_dossier_claims.evidence_binding is
  'RETRIEVAL_BOUND means every evidence entry cites a real retrieval whose text carries the excerpt and supports the claimed values. UNBOUND is honest legacy: admitted under shape-only evidence before retrieval binding existed.';
