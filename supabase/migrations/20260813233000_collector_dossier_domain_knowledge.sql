-- ============================================================================
-- Collector Dossier — governed domain knowledge (the editorial shelf)
--
-- The sibling corpus beside collector_dossier_claims:
--
--   exact-reference claims  =  what is true about THIS watch
--   domain knowledge        =  what is useful to understand about
--                              watches LIKE this
--   the composer            =  turns the intersection into an article
--
-- THE SCOPE LAW IS PRESERVED, NOT WIDENED. Reference claims stay bound to
-- one vault_references row; this table is honestly reference-independent
-- and carries NO vault_reference_id at all. A domain statement naming a
-- reference identifier is refused by the admission contract — shelf
-- knowledge can never masquerade as an exact-reference claim.
--
-- REUSABLE DOES NOT MEAN UNGOVERNED. Every unit is researched through the
-- same DNS-pinned retrieval path, bound to retrieved text, and admitted by
-- a class-specific deterministic contract (lib/dossier/domainKnowledge.ts).
-- No model-memory fact, no "everyone knows this", no confidence column.
--
-- THE FACTS MAY BE REUSED. THE PROSE IS COMPOSED FRESH. Rows here are
-- knowledge units (statement, values, qualifier, evidence, applicability),
-- never stock article paragraphs.
--
-- APPLICABILITY IS LOAD-BEARING. Each unit carries deterministic rules
-- (value match, subject match, statement term, line identity) evaluated
-- against a reference's own composable claims. The composer only ever
-- receives the applicable intersection; the model never decides
-- applicability from memory.
--
-- Versioning: corrections are new rows that retire the old one. A unit id
-- IS a version pin — composition attempts record the exact ids they used,
-- so every draft stays traceable to the exact knowledge version behind it.
--
-- Nothing here touches listings, publication, or any served artifact.
--
-- Rollback: supabase/rollbacks/20260813233000_collector_dossier_domain_knowledge.down.sql
-- ============================================================================

create table public.collector_dossier_domain_knowledge (
  id               uuid primary key default gen_random_uuid(),

  -- Stable identity within the shelf, e.g. 'beat_rate_28800'.
  knowledge_key    text not null,
  knowledge_class  text not null
    constraint cddk_class_check check (knowledge_class in
      ('GENERAL_HOROLOGY', 'FEATURE_TECHNICAL_CONTEXT', 'FEATURE_DESIGN_HISTORY',
       'CERTIFICATION_STANDARD_CONTEXT', 'LINE_BRAND_CONTEXT')),
  -- Normalized concept key for grouping and audit, e.g. 'beat_rate'.
  concept_key      text not null,

  outcome          text not null
    constraint cddk_outcome_check check (outcome in
      ('VERIFIED', 'UNRESOLVED', 'UNSUPPORTED')),
  admission        text not null
    constraint cddk_admission_check check (admission in
      ('ADMITTED', 'REFUSED', 'PENDING_REVIEW')),
  refusals         text[] not null default '{}',

  -- The governed knowledge payload: reader-usable statement of general
  -- fact. Never about a specific reference (contract-enforced).
  statement        text not null,
  values           jsonb not null default '[]'::jsonb
    constraint cddk_values_array check (jsonb_typeof(values) = 'array'),
  qualifier        text,

  -- Deterministic applicability rules joining this unit to references.
  applicability    jsonb not null default '[]'::jsonb
    constraint cddk_applicability_array check (jsonb_typeof(applicability) = 'array'),

  -- Evidence entries under the shared shape law, incl. retrievalId +
  -- retrievalSha256 binding to collector_dossier_source_retrievals.
  evidence         jsonb not null default '[]'::jsonb
    constraint cddk_evidence_array check (jsonb_typeof(evidence) = 'array'),
  evidence_binding text not null default 'UNBOUND'
    constraint cddk_binding_check check (evidence_binding in ('UNBOUND', 'RETRIEVAL_BOUND')),

  provenance       text not null default 'MACHINE_RESEARCH',
  lifecycle        text not null default 'current'
    constraint cddk_lifecycle_check check (lifecycle in ('current', 'retired')),
  supersedes_id    uuid references public.collector_dossier_domain_knowledge(id),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Admission and its reasons can never disagree.
  constraint cddk_admitted_is_clean check (
    admission <> 'ADMITTED'
    or (coalesce(array_length(refusals, 1), 0) = 0 and outcome = 'VERIFIED')
  ),
  constraint cddk_refused_has_reason check (
    admission = 'ADMITTED' or coalesce(array_length(refusals, 1), 0) > 0
  )
);

-- One current row per knowledge key; retired rows keep the history.
create unique index cddk_current_key
  on public.collector_dossier_domain_knowledge (knowledge_key)
  where lifecycle = 'current';

create index cddk_concept_idx
  on public.collector_dossier_domain_knowledge (concept_key, lifecycle);

-- Server-governed: no client role reads or writes the shelf. (All three
-- revoked — leaving any one out leaves the others open.)
revoke all on public.collector_dossier_domain_knowledge from public, anon, authenticated;

create or replace function public.collector_dossier_domain_knowledge_touch()
returns trigger language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists trg_cddk_touch on public.collector_dossier_domain_knowledge;
create trigger trg_cddk_touch
  before update on public.collector_dossier_domain_knowledge
  for each row execute function public.collector_dossier_domain_knowledge_touch();

-- ── Composition attempts learn their domain basis ───────────────────────
-- Unit ids ARE version pins (corrections are new rows), so recording the
-- exact ids used keeps every attempt traceable to the exact knowledge
-- version it composed from.
alter table public.collector_dossier_composition_attempts
  add column if not exists input_domain_ids uuid[] not null default '{}',
  add column if not exists input_domain_keys text[] not null default '{}';
