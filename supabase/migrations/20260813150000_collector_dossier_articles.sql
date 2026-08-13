-- ============================================================================
-- Collector Dossier — reference-level editorial articles (storage + approval)
--
-- The Dossier plumbing is production-proven (v4.9–v4.13, runtime-closed
-- 2026-08-13). The founder's verdict on the served content: the v1 Vault-only
-- template is not the intended magazine article. The article PIPELINE was
-- already prototyped end to end for one reference — the Breguet 5967 canary:
-- external research → hash-bound editorial manuscript → verbatim view model →
-- PDF — but that approved prose lives hard-coded in TypeScript
-- (lib/dossier/collectorDossierViewModel.ts) because approved articles have
-- nowhere else to live. This migration gives them a home.
--
-- WHAT THIS IS: storage and an approval gate. Nothing more.
-- WHAT THIS IS NOT: an authoring workflow, a research pipeline, a generation
-- policy, or editorial content. The table ships EMPTY, and production
-- behavior is byte-identical until a founder-approved article row exists.
--
-- Governing floor (unchanged): no unapproved prose reaches a public
-- Collector Dossier. Enforced structurally here:
--   · the view model consumes ONLY rows with status = 'approved';
--   · approval stamps a manuscript hash over the exact content approved;
--   · approved content is frozen — corrections require retire + new draft;
--   · at most ONE approved article per reference;
--   · no client role can touch the table at all.
--
-- The article belongs to the REFERENCE, never to a seller's listing.
--
-- Regeneration reuses the proven path: approval flips the reference's
-- existing dossier row back to pending with template_version 2, and the
-- next publish/republish walks the already-proven claim → generate →
-- mark_ready seam. Listing publication remains fail-open throughout.
--
-- Rollback: supabase/rollbacks/20260813150000_collector_dossier_articles.down.sql
-- ============================================================================

create table public.collector_dossier_articles (
  id                 uuid primary key default gen_random_uuid(),
  vault_reference_id uuid not null references public.vault_references(id) on delete cascade,
  status             text not null default 'draft'
    constraint cda_status_check check (status in ('draft', 'approved', 'retired')),
  title              text,
  opening_identity   text,
  -- The reader-facing body: an array of { moduleId, heading, paragraphs[] },
  -- the same DossierSection shape the view model and both renderers already
  -- consume. Structure is enforced here; the words are the editor's.
  sections           jsonb not null
    constraint cda_sections_array check (jsonb_typeof(sections) = 'array'),
  -- Provenance note for the editorial pass (which manuscript, which sources
  -- ledger). Never rendered to readers.
  source_note        text,
  -- Stamped by the approval RPC over the exact approved content.
  manuscript_sha256  text,
  delta_sha256       text,
  approved_by        uuid references auth.users(id),
  approved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Approval is hash-bound and attributed, or it is not approval.
  constraint cda_approved_complete check (
    status <> 'approved'
    or (manuscript_sha256 is not null and approved_by is not null and approved_at is not null)
  )
);

-- One approved article per reference — the canonical one.
create unique index cda_one_approved_per_reference
  on public.collector_dossier_articles (vault_reference_id)
  where status = 'approved';

create index cda_reference_idx
  on public.collector_dossier_articles (vault_reference_id, status);

-- No client role reads or writes articles; the view model reads through the
-- service client and approval happens through the RPC below. (All three
-- roles revoked — any single one left out leaves the others open.)
revoke all on public.collector_dossier_articles from public, anon, authenticated;

-- Approved content is frozen. A correction is retire + new draft + approve,
-- which keeps every approved manuscript hash honest forever.
create or replace function public.collector_dossier_article_protect()
returns trigger
language plpgsql
as $$
begin
  if OLD.status = 'approved' then
    if NEW.status = 'approved'
       and (NEW.title is distinct from OLD.title
         or NEW.opening_identity is distinct from OLD.opening_identity
         or NEW.sections is distinct from OLD.sections
         or NEW.manuscript_sha256 is distinct from OLD.manuscript_sha256
         or NEW.vault_reference_id is distinct from OLD.vault_reference_id) then
      raise exception 'approved article content is frozen; retire it and approve a corrected draft';
    end if;
    if NEW.status = 'draft' then
      raise exception 'an approved article cannot return to draft; retire it';
    end if;
  end if;
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists trg_collector_dossier_article_protect on public.collector_dossier_articles;
create trigger trg_collector_dossier_article_protect
  before update on public.collector_dossier_articles
  for each row execute function public.collector_dossier_article_protect();

-- ── Approval ────────────────────────────────────────────────────────────────
-- Hash-bound: the RPC computes the manuscript hash over the exact content
-- being approved, stamps reviewer and time, retires any previously approved
-- article for the same reference, and flips the reference's existing dossier
-- row (if any) back to pending at template_version 2 so the proven
-- claim → generate → mark_ready path rebuilds the PDF on the next
-- publish/republish. Listing publication is never touched.
create or replace function public.collector_dossier_article_approve(
  p_article_id uuid,
  p_reviewer_uid uuid
)
returns public.collector_dossier_articles
language plpgsql
security definer
set search_path = public
as $$
declare
  art public.collector_dossier_articles%rowtype;
  h   text;
begin
  if not exists (select 1 from public.profiles where id = p_reviewer_uid) then
    raise exception 'reviewer profile missing; refusing to approve';
  end if;

  select * into art from public.collector_dossier_articles where id = p_article_id for update;
  if not found then
    raise exception 'article % not found', p_article_id;
  end if;
  if art.status <> 'draft' then
    raise exception 'only a draft can be approved (article % is %)', p_article_id, art.status;
  end if;

  -- The hash binds title, opening line and every section byte approved.
  h := encode(extensions.digest(
         convert_to(coalesce(art.title, '') || E''
           || coalesce(art.opening_identity, '') || E''
           || art.sections::text, 'UTF8'),
         'sha256'), 'hex');

  -- Exactly one approved article per reference: retire any predecessor.
  update public.collector_dossier_articles
     set status = 'retired'
   where vault_reference_id = art.vault_reference_id
     and status = 'approved'
     and id <> art.id;

  update public.collector_dossier_articles
     set status = 'approved',
         manuscript_sha256 = h,
         approved_by = p_reviewer_uid,
         approved_at = now()
   where id = art.id
   returning * into art;

  -- Ask the proven pipeline to rebuild this reference's dossier with the
  -- article. Fail-open: if no dossier row exists yet, the first qualifying
  -- publish will create one and pick the article up naturally.
  update public.collector_dossiers
     set status = 'pending',
         template_version = 2,
         generation_started_at = null,
         last_error = null
   where vault_reference_id = art.vault_reference_id;

  return art;
end;
$$;

revoke all on function public.collector_dossier_article_approve(uuid, uuid) from public, anon, authenticated;
