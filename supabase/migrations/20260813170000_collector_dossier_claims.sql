-- ============================================================================
-- Collector Dossier — server-side exact-reference claims corpus
--
-- The durable machine-readable layer between research and prose. Storage,
-- structure and the claim-set hash live here; the admission CONTRACTS live
-- in lib/dossier/claimAdmission.ts, one definition shared by the population
-- path, the future composer, the future verifier and the tests (the same
-- arrangement lib/vault/enrichmentFactTypes.ts uses for the enrichment gate).
--
-- GOVERNING RULE: a machine-gathered claim enters governed state only
-- through an explicit, claim-class-specific admission contract. Never
-- because a model sounded confident, a domain looked plausible, two models
-- agreed, or a score crossed a line. THERE IS NO CONFIDENCE COLUMN, by
-- construction — admission is carried by named refusal conditions.
--
-- SCOPE IS THE EXACT REFERENCE. Every claim binds to one vault_references
-- row. A claim may not float at brand, collection, family, sibling,
-- listing or seller level. Sibling contamination is refused by contract.
--
-- THREE CLASSES, because a corpus of hard facts alone produces a
-- specification sheet and unconstrained prose produces invention:
--   OBJECTIVE_FACT      measurable/specified truth about this reference
--   CONTEXTUAL_FACT     history, chronology, attribution, documented
--                       reception, relationship to adjacent references
--   DESIGN_DESCRIPTION  bounded observation of what is visibly there
-- Bounded observation is allowed; unsupported explanation is not.
--
-- THE RESEARCH TRICHOTOMY IS REUSED VERBATIM: VERIFIED / UNRESOLVED /
-- UNSUPPORTED. UNRESOLVED stays meaningful — competing readings persist
-- with their own evidence, are never averaged, never resolved by score, and
-- never automatically publishable.
--
-- Nothing here touches listings, publication, or any served artifact. The
-- corpus existing changes no public behavior whatsoever.
--
-- Rollback: supabase/rollbacks/20260813170000_collector_dossier_claims.down.sql
-- ============================================================================

create table public.collector_dossier_claims (
  id                 uuid primary key default gen_random_uuid(),
  vault_reference_id uuid not null references public.vault_references(id) on delete cascade,

  -- Stable identity of the claim within its reference.
  claim_key          text not null,
  claim_class        text not null
    constraint cdc_class_check check (claim_class in
      ('OBJECTIVE_FACT', 'CONTEXTUAL_FACT', 'DESIGN_DESCRIPTION')),

  -- The research finding, reusing the Vault research validator's vocabulary.
  outcome            text not null
    constraint cdc_outcome_check check (outcome in
      ('VERIFIED', 'UNRESOLVED', 'UNSUPPORTED')),

  -- Corpus state, distinct from the finding: a VERIFIED claim can still be
  -- REFUSED, and an UNRESOLVED one is durable but never auto-publishable.
  admission          text not null
    constraint cdc_admission_check check (admission in
      ('ADMITTED', 'REFUSED', 'PENDING_REVIEW')),

  -- Named refusal conditions. First-class and durable — never a log line.
  refusals           text[] not null default '{}',

  subject            text not null,
  statement          text not null,
  -- Mechanically comparable values, for CLAIM-SCOPED deterministic checks.
  -- The replay proved global token membership cannot catch conflation: a
  -- sibling identifier is an admitted value somewhere in the packet.
  values             jsonb not null default '[]'::jsonb
    constraint cdc_values_array check (jsonb_typeof(values) = 'array'),
  -- A recheck/limit condition the prose MUST carry if it uses this claim.
  -- Dropping one is drift by omission (replay finding D7).
  qualifier          text,
  -- Competing readings; only meaningful while outcome = 'UNRESOLVED'.
  options            jsonb not null default '[]'::jsonb
    constraint cdc_options_array check (jsonb_typeof(options) = 'array'),
  -- Evidence entries: sourceClass / sourceName / sourceUrl / sourceExcerpt /
  -- sourceAccessed. Multiple entries express corroboration.
  evidence           jsonb not null default '[]'::jsonb
    constraint cdc_evidence_array check (jsonb_typeof(evidence) = 'array'),
  -- DESIGN_DESCRIPTION only: the admitted claim keys this observation rests on.
  supports           text[] not null default '{}',
  -- Traceability toward DossierSection.moduleId — never rendered to readers.
  module_hint        text,
  -- How the claim entered: machine research, founder entry, manuscript import.
  provenance         text not null default 'MACHINE_RESEARCH',

  -- Corrections are versioned replacements, never in-place edits.
  lifecycle          text not null default 'current'
    constraint cdc_lifecycle_check check (lifecycle in ('current', 'retired')),
  supersedes_id      uuid references public.collector_dossier_claims(id),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- Admission is structurally bound to having no refusals: the state and its
  -- reasons can never disagree.
  constraint cdc_admitted_is_clean check (
    admission <> 'ADMITTED'
    or (coalesce(array_length(refusals, 1), 0) = 0 and outcome = 'VERIFIED')
  ),
  constraint cdc_refused_has_reason check (
    admission = 'ADMITTED' or coalesce(array_length(refusals, 1), 0) > 0
  )
);

-- One current row per claim key per reference; retired rows keep the history.
create unique index cdc_current_key_per_reference
  on public.collector_dossier_claims (vault_reference_id, claim_key)
  where lifecycle = 'current';

create index cdc_reference_admission_idx
  on public.collector_dossier_claims (vault_reference_id, admission, lifecycle);

-- Server-governed: no client role reads or writes the corpus. (All three
-- revoked — leaving any one out leaves the others open.)
revoke all on public.collector_dossier_claims from public, anon, authenticated;

create or replace function public.collector_dossier_claim_touch()
returns trigger language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists trg_collector_dossier_claim_touch on public.collector_dossier_claims;
create trigger trg_collector_dossier_claim_touch
  before update on public.collector_dossier_claims
  for each row execute function public.collector_dossier_claim_touch();

-- ── Claim-set hash ──────────────────────────────────────────────────────
-- Answers exactly one question: has the evidence basis for this reference
-- materially changed? Ordered by claim key over governed content only —
-- ids, timestamps, provenance and evidence plumbing are runtime noise and
-- are deliberately excluded, so a reread is byte-stable while a material
-- change to an admitted claim moves the hash. Mirrors claimSetHashInput()
-- in lib/dossier/claimAdmission.ts; the test suite asserts they agree.
create or replace function public.collector_dossier_claim_set_hash(p_reference_id uuid)
returns text
language sql
stable
as $$
  select encode(
    extensions.digest(
      convert_to(
        coalesce(string_agg(row_json, E'\n' order by claim_key), ''),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  from (
    select
      c.claim_key,
      json_build_object(
        'k', c.claim_key,
        'c', c.claim_class,
        's', c.statement,
        'v', (select coalesce(json_agg(v order by v), '[]'::json)
                from jsonb_array_elements_text(c.values) v),
        'q', c.qualifier
      )::text as row_json
    from public.collector_dossier_claims c
    where c.vault_reference_id = p_reference_id
      and c.lifecycle = 'current'
      and c.admission = 'ADMITTED'
  ) rows;
$$;

revoke all on function public.collector_dossier_claim_set_hash(uuid) from public, anon, authenticated;
