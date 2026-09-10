-- ════════════════════════════════════════════════════════════════════════
-- PUBLIC WATCH INDEX — P6: approved-public-reference-knowledge authority.
-- Phase 3 seam, internal only.
--
-- Governing authority: docs/product-laws/
--   Public_Watch_Index_Product_Contract_v2_ADOPTED.md §§3, 7, 8, 11, 13.
--
-- ── THE MISCONCEPTION THIS MIGRATION EXISTS TO KILL ─────────────────────
--
--   "There is a reference_knowledge row for this reference, so FairWatchTrade
--    has public reference knowledge about it."
--
-- It does not. Possessing knowledge and being permitted to state it publicly
-- are different facts, and the contract is explicit: a `reference_knowledge`
-- row or hidden Vault material alone does not qualify. Neither does Galaxy
-- visibility, which is a brand-boundary PRESENTATION decision the Galaxy
-- Publication Law forbids reading downward.
--
-- Permanent rule:
--   Reference Knowledge means APPROVED PUBLIC knowledge only. Hidden or
--   internal knowledge is not public truth merely because FWT possesses it.
--
-- ── WHY A SEPARATE SATELLITE, NOT A COLUMN ──────────────────────────────
--
-- Bolting `approved = true` onto the generated content would make CONTENT
-- POSSESSION equal PUBLICATION PERMISSION — the exact conflation above,
-- rebuilt in a column. The authority therefore lives in its own relation
-- keyed to the canonical reference, and the projection reads ONLY that
-- relation. It never reads reference_knowledge at all, which is what makes
-- the answer identical whether internal knowledge exists or not.
--
-- ── EXPOSURE HARDENING, PERFORMED HERE ──────────────────────────────────
--
-- public.reference_knowledge carried a policy literally named "readable by
-- anyone" with USING (true), plus SELECT and INSERT grants to anon and
-- authenticated. Any client could read every row. Under the contract that is
-- a leak by construction: an unapproved row would become public knowledge
-- merely by existing, and its existence would be visible to anyone who
-- looked.
--
-- Verified before narrowing: NOTHING in the product reads that table. Its
-- only writer is lib/research/compileReferenceKnowledge.ts, which uses the
-- service client and therefore bypasses RLS entirely. Narrowing destroys no
-- legitimate internal use.
--
-- ── NO RESURRECTION ─────────────────────────────────────────────────────
--
-- Approval is publication authority, not immutable fact. A revoked approval
-- is retired, never deleted, and nothing anywhere re-creates one: there is no
-- automatic producer of an approval, so a rebuild cannot resurrect a
-- withdrawn one from a knowledge row that still exists. The only way an
-- approval returns is another explicit founder act.
--
-- ⚠ CURRENT-GENERATION TRAP: append-and-retire, exactly like
--   public_watch_index_episode_reference. Every current-state query MUST
--   filter is_current = true.
--
-- PFC274 = 62 — the evaluate route is untouched.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.public_watch_index_reference_knowledge_approval (
  id uuid primary key default gen_random_uuid(),

  /* The exact canonical reference this approval speaks for. RESTRICT: a
     reference must not be deleted out from under a live publication
     authority. Approval never fans out to a sibling, parent or child —
     approving reference A says nothing about reference B. */
  vault_reference_id uuid not null
    references public.vault_references (id) on delete restrict,

  /* The approved public destination, WHEN ONE EXISTS (§7). Optional by
     contract: approval alone is the authority, and no URL is ever invented
     to complete it. */
  public_destination text
    check (public_destination is null
           or public_destination ~ '^https://[A-Za-z0-9._~:/?#@!$&''()*+,;=%-]+$'),

  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  /* Internal provenance. Never published, never returned to a public
     consumer, and never used to explain a negative. */
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),

  is_current boolean not null default true,

  revoked_at timestamptz,
  revoked_by uuid,
  revoked_reason text,

  constraint pwi_rka_revocation_is_complete check (
    (is_current and revoked_at is null and revoked_by is null and revoked_reason is null)
    or (not is_current and revoked_at is not null and revoked_by is not null
        and revoked_reason is not null
        and char_length(btrim(revoked_reason)) between 1 and 2000)
  )
);

comment on table public.public_watch_index_reference_knowledge_approval is
  'Explicit authority to state reference knowledge publicly for one canonical reference. Separate from the knowledge content on purpose: possession is not permission. Append-and-retire; every current-state query must filter is_current = true. See docs/product-laws/Public_Watch_Index_Product_Contract_v2_ADOPTED.md section 3.';

/* Exactly one LIVE approval per reference. A revoked row frees the slot, so
   a reference may be approved again later by another explicit founder act. */
create unique index if not exists pwi_rka_one_live_per_reference
  on public.public_watch_index_reference_knowledge_approval (vault_reference_id)
  where is_current;

-- ── Structural denial for every client role ─────────────────────────────
alter table public.public_watch_index_reference_knowledge_approval enable row level security;
-- No policy on purpose: RLS enabled with zero policies denies anon and
-- authenticated entirely. No ordinary user can mint, revoke, read or rewrite
-- public-knowledge authority, or influence it with client state.
revoke all on table public.public_watch_index_reference_knowledge_approval from anon;
revoke all on table public.public_watch_index_reference_knowledge_approval from authenticated;

-- ── The one governed approval ───────────────────────────────────────────
create or replace function public.public_watch_index_approve_reference_knowledge(
  p_vault_reference_id uuid,
  p_actor_uid          uuid,
  p_reason             text,
  p_public_destination text default null
)
returns public.public_watch_index_reference_knowledge_approval
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.public_watch_index_reference_knowledge_approval;
begin
  if p_actor_uid is null then
    raise exception 'actor_required' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 1 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  /* The reference must EXIST. Nothing here consults galaxy_visible,
     reference_knowledge, seller text or generated content — none of those is
     an approval source, and reading one would rebuild the conflation this
     table exists to prevent. */
  if not exists (select 1 from public.vault_references where id = p_vault_reference_id) then
    raise exception 'unknown_reference' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.public_watch_index_reference_knowledge_approval
     where vault_reference_id = p_vault_reference_id and is_current
  ) then
    raise exception 'already_approved' using errcode = '23505';
  end if;

  insert into public.public_watch_index_reference_knowledge_approval
    (vault_reference_id, public_destination, approved_by, reason)
  values
    (p_vault_reference_id, nullif(btrim(coalesce(p_public_destination, '')), ''),
     p_actor_uid, btrim(p_reason))
  returning * into v_row;
  return v_row;
end;
$$;

-- ── The one governed revocation ─────────────────────────────────────────
create or replace function public.public_watch_index_revoke_reference_knowledge(
  p_vault_reference_id uuid,
  p_actor_uid          uuid,
  p_reason             text
)
returns public.public_watch_index_reference_knowledge_approval
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.public_watch_index_reference_knowledge_approval;
begin
  if p_actor_uid is null then
    raise exception 'actor_required' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 1 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  /* The row is retired, never deleted: the revocation history is what makes
     a later reader able to see that an approval once existed and was
     withdrawn. The underlying knowledge content is untouched — internal
     knowledge may remain under its own rules. */
  update public.public_watch_index_reference_knowledge_approval
     set is_current = false,
         revoked_at = now(),
         revoked_by = p_actor_uid,
         revoked_reason = btrim(p_reason)
   where vault_reference_id = p_vault_reference_id and is_current
  returning * into v_row;

  if v_row.id is null then
    raise exception 'no_live_approval' using errcode = '22023';
  end if;
  return v_row;
end;
$$;

revoke all on function public.public_watch_index_approve_reference_knowledge(uuid, uuid, text, text) from public;
revoke all on function public.public_watch_index_approve_reference_knowledge(uuid, uuid, text, text) from anon;
revoke all on function public.public_watch_index_approve_reference_knowledge(uuid, uuid, text, text) from authenticated;
grant execute on function public.public_watch_index_approve_reference_knowledge(uuid, uuid, text, text) to service_role;

revoke all on function public.public_watch_index_revoke_reference_knowledge(uuid, uuid, text) from public;
revoke all on function public.public_watch_index_revoke_reference_knowledge(uuid, uuid, text) from anon;
revoke all on function public.public_watch_index_revoke_reference_knowledge(uuid, uuid, text) from authenticated;
grant execute on function public.public_watch_index_revoke_reference_knowledge(uuid, uuid, text) to service_role;

comment on function public.public_watch_index_approve_reference_knowledge(uuid, uuid, text, text) is
  'The only way reference knowledge becomes approved for public representation. service_role only; the founder gate lives in the calling route. Consults no knowledge row, no Galaxy visibility and no seller text — approval is an explicit act, never a derived one.';
comment on function public.public_watch_index_revoke_reference_knowledge(uuid, uuid, text) is
  'Withdraws public-representation authority. The row is retired, never deleted, and nothing re-creates an approval automatically, so no rebuild can resurrect a withdrawn one.';

-- ════════════════════════════════════════════════════════════════════════
-- EXPOSURE HARDENING — public.reference_knowledge
--
-- The policy below was named "reference_knowledge readable by anyone" with
-- USING (true): every anon and authenticated client could read every row.
-- Under the contract an unapproved row must not become public knowledge, and
-- its EXISTENCE must not be observable, so this surface is closed.
--
-- Verified before dropping: no reader exists anywhere in the product. The
-- sole writer, lib/research/compileReferenceKnowledge.ts, holds the service
-- client and bypasses RLS, so it is unaffected.
--
-- RLS remains enabled with zero policies — structural denial — matching the
-- other Public Watch Index relations. The loose INSERT grant goes with it.
-- ════════════════════════════════════════════════════════════════════════
drop policy if exists "reference_knowledge readable by anyone" on public.reference_knowledge;
revoke all on table public.reference_knowledge from anon;
revoke all on table public.reference_knowledge from authenticated;

comment on table public.reference_knowledge is
  'Internal compiled reference knowledge. NOT public and NOT an approval source: permission to state this publicly lives in public_watch_index_reference_knowledge_approval. Denied to every client role; written only by the service-role compiler.';
