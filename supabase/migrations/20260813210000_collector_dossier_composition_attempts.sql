-- ============================================================================
-- Collector Dossier — composition attempts (audit trail)
--
-- One row per automatic composition attempt: the frozen evidence basis, the
-- exact input claims, the composer's raw output, the per-paragraph claim
-- linkage, both verification verdicts with named refusals, provider/model
-- audit metadata, and the final status. Enough to diagnose and reproduce a
-- composition without polluting public content.
--
-- WHAT AN ATTEMPT CAN NEVER DO: reach public state. A verified attempt
-- produces at most a status='draft' row in collector_dossier_articles; the
-- founder approval RPC remains the only door to 'approved', and nothing in
-- this migration touches it. Listing publication is untouched.
--
-- THE BASIS IS FROZEN. Each attempt records the claim-set hash it composed
-- from; the pipeline refuses to verify a draft against any other basis
-- (named state: stale_claim_basis). No "probably still current".
--
-- Claim linkage (linked_sections) is internal governance metadata. The
-- reader-facing candidate (candidate_sections) carries prose only — the
-- renderer never sees claim ids, and provider metadata never renders.
--
-- Raw composer OUTPUT is retained for audit; hidden model reasoning is not
-- persisted anywhere, by construction — the pipeline never receives it.
--
-- Rollback: supabase/rollbacks/20260813210000_collector_dossier_composition_attempts.down.sql
-- ============================================================================

create table public.collector_dossier_composition_attempts (
  id                     uuid primary key default gen_random_uuid(),
  vault_reference_id     uuid not null references public.vault_references(id) on delete cascade,

  -- The frozen evidence basis for this attempt.
  claim_set_hash         text not null,
  input_claim_keys       text[] not null,
  input_claim_count      integer not null,

  -- Composer audit (internal only; never rendered).
  composer_provider      text,
  composer_model         text,
  composer_usage         jsonb,
  raw_composer_output    text,

  -- Internal composition shape: sections whose paragraphs each carry the
  -- claim ids that permit them to exist.
  linked_sections        jsonb,
  structure_refusals     jsonb not null default '[]'::jsonb,

  -- The reader-facing candidate (prose only, linkage stripped).
  candidate_opening      text,
  candidate_sections     jsonb,
  candidate_sha256       text,

  -- Verification verdicts: named refusals, never scores.
  deterministic_refusals jsonb not null default '[]'::jsonb,
  semantic_refusals      jsonb not null default '[]'::jsonb,
  verifier_provider      text,
  verifier_model         text,
  verifier_usage         jsonb,

  status                 text not null default 'composing'
    constraint cdca_status_check check (status in
      ('composing', 'no_composable_claims', 'composer_unavailable',
       'structure_refused', 'deterministic_refused', 'semantic_refused',
       'verifier_unavailable', 'stale_claim_basis', 'verified')),
  failure_detail         text,

  -- The draft article a verified attempt produced. Draft, never approved.
  draft_article_id       uuid references public.collector_dossier_articles(id),

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  verified_at            timestamptz,

  -- Verified means zero refusals of every kind and a self-verifying hash.
  constraint cdca_verified_is_clean check (
    status <> 'verified'
    or (jsonb_array_length(deterministic_refusals) = 0
        and jsonb_array_length(semantic_refusals) = 0
        and jsonb_array_length(structure_refusals) = 0
        and candidate_sha256 is not null
        and verified_at is not null)
  )
);

create index cdca_reference_idx
  on public.collector_dossier_composition_attempts (vault_reference_id, status, created_at desc);

-- Server-governed: no client role reads or writes attempts. (All three
-- revoked — leaving any one out leaves the others open.)
revoke all on public.collector_dossier_composition_attempts from public, anon, authenticated;

create or replace function public.collector_dossier_composition_attempt_touch()
returns trigger language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists trg_cdca_touch on public.collector_dossier_composition_attempts;
create trigger trg_cdca_touch
  before update on public.collector_dossier_composition_attempts
  for each row execute function public.collector_dossier_composition_attempt_touch();
