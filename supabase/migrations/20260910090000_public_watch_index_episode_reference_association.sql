-- ════════════════════════════════════════════════════════════════════════
-- PUBLIC WATCH INDEX — P7: durable publication-episode → canonical-reference
-- association. Phase 2 seam, internal only.
--
-- Governing authority: docs/product-laws/
--   Public_Watch_Index_Product_Contract_v2_ADOPTED.md §§2, 5, 6, 8, 12.
--
-- ── THE MISCONCEPTION THIS MIGRATION EXISTS TO KILL ─────────────────────
--
--   "listings.vault_reference_id already says which reference this is, so
--    reading it later tells us which reference the old episode belonged to."
--
-- It does not. That column is MUTABLE CURRENT STATE. Reading it tomorrow and
-- calling the answer history is the exact defect §5 condition 3 forbids: it
-- would move an old public episode onto whatever reference today's row
-- happens to name.
--
-- The distinction is TEMPORAL, and it is the whole design:
--
--   · AT the publication moment, that column IS the governed server-side
--     reference resolution for this publication. Capturing it then, into an
--     immutable row bound to the episode, is legitimate evidence.
--   · AFTER the publication moment it is only current state. Nothing may
--     ever re-derive a historical association from it again.
--
-- So the value is frozen once, by a trigger, inside the same transaction as
-- the episode itself — and never consulted for history again.
--
-- ── THE ONE GOVERNED PUBLICATION BOUNDARY ───────────────────────────────
--
-- public.record_listing_lifecycle_event() is the sole producer of a
-- 'BECAME_PUBLIC' row, and it emits one only when listings.status becomes
-- 'published'. Every application path that publishes — the founder status
-- route, Founder Review Triage, any future writer — passes through it,
-- because it is a trigger on the row itself rather than a call in a caller.
-- Binding here therefore binds at the publication boundary once, rather than
-- sprinkling independent writes across consumers.
--
-- 'BECAME_PRIVATE' and 'REMOVED' are separate event types, so a private-only
-- lifecycle produces no episode here and can never create public history.
--
-- ── WHAT THIS IS NOT ────────────────────────────────────────────────────
--
--   · NOT a second history ledger. The publication episode remains
--     listing_lifecycle_events; this table only says which reference an
--     episode belonged to.
--   · NOT a snapshot of the listing. No price, photo, seller, title or
--     status is copied. Two columns carry the claim: episode and reference.
--   · NOT suppression. Suppression is PERMISSION to publish (§8) and lives
--     in public_watch_index_suppressions. Withdrawal here is an EVIDENCE
--     statement: we no longer defensibly know which reference this episode
--     belonged to. Neither substitutes for the other, and a suppression
--     keeps following its contribution across any reassociation recorded
--     here.
--   · NOT a backfill. Nothing writes rows for episodes that already exist.
--
-- ── CORRECTION IS APPEND/SUPERSEDE, NEVER DESTRUCTIVE ───────────────────
--
-- A correction inserts a new row pointing at the superseded one and retires
-- the old row; the original publication evidence is never rewritten and the
-- superseded association stays auditable. If a correction cannot be tied
-- defensibly to the episode, the contribution is WITHDRAWN rather than moved
-- to today's row value (§2 retrospective correction, §6).
--
-- ⚠ CURRENT-GENERATION TRAP: this table is append-and-retire. Every
--   current-state query MUST filter is_current = true, or superseded and
--   withdrawn associations read as live evidence.
--
-- PFC274 = 62 — the evaluate route is untouched.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.public_watch_index_episode_reference (
  id uuid primary key default gen_random_uuid(),

  /* The durable publication episode. RESTRICT: an episode that carries an
     association must not vanish from under it. listing_lifecycle_events is
     append-only, so this edge is stable by construction. */
  episode_id bigint not null
    references public.listing_lifecycle_events (id) on delete restrict,

  /* The canonical reference this episode belonged to. RESTRICT for the same
     reason the suppression table restricts: a reference must not be deleted
     out from under durable historical evidence. */
  vault_reference_id uuid not null
    references public.vault_references (id) on delete restrict,

  /* Which governed path established this association. */
  established_via text not null check (established_via in (
    'publication_boundary',
    'governed_correction'
  )),

  recorded_at timestamptz not null default now(),
  /* NULL only at the publication boundary, where the establishing actor is
     the governed trigger rather than a person. Required for a correction. */
  recorded_by uuid,
  /* Required for a correction; meaningless at the publication boundary. */
  reason text,

  /* Append/supersede chain. NULL for the first association of an episode. */
  supersedes_id uuid references public.public_watch_index_episode_reference (id),

  is_current boolean not null default true,

  /* Retirement: superseded by a correction, or withdrawn for want of
     defensible evidence. Both leave the row readable forever. */
  retired_at timestamptz,
  retired_by uuid,
  retired_kind text check (retired_kind in ('superseded', 'withdrawn')),
  retired_reason text,

  constraint pwi_epref_correction_is_attributed check (
    established_via <> 'governed_correction'
    or (recorded_by is not null and reason is not null
        and char_length(btrim(reason)) between 1 and 2000)
  ),
  constraint pwi_epref_boundary_is_unattributed check (
    established_via <> 'publication_boundary'
    or (recorded_by is null and reason is null and supersedes_id is null)
  ),
  constraint pwi_epref_retirement_is_complete check (
    (is_current and retired_at is null and retired_by is null
       and retired_kind is null and retired_reason is null)
    or (not is_current and retired_at is not null and retired_kind is not null
        and retired_reason is not null
        and char_length(btrim(retired_reason)) between 1 and 2000)
  )
);

comment on table public.public_watch_index_episode_reference is
  'Durable evidence of which canonical reference a genuine public publication episode belonged to, captured at the publication boundary and never re-derived from current listing state. Append/supersede; every current-state query must filter is_current = true. See docs/product-laws/Public_Watch_Index_Product_Contract_v2_ADOPTED.md section 5 condition 3.';

/* Exactly one CURRENT association per episode. A retired row frees the slot,
   so an episode may be corrected repeatedly and may also be withdrawn and
   later re-established by a governed correction. */
create unique index if not exists pwi_epref_one_current_per_episode
  on public.public_watch_index_episode_reference (episode_id)
  where is_current;

/* The projection's hot lookup: current associations for one reference. */
create index if not exists pwi_epref_current_by_reference
  on public.public_watch_index_episode_reference (vault_reference_id)
  where is_current;

-- ── Structural denial for every client role ─────────────────────────────
alter table public.public_watch_index_episode_reference enable row level security;
-- No policy on purpose: RLS enabled with zero policies denies anon and
-- authenticated entirely. service_role bypasses RLS. No client may mint or
-- rewrite historical episode→reference truth.
revoke all on table public.public_watch_index_episode_reference from anon;
revoke all on table public.public_watch_index_episode_reference from authenticated;

-- ── The publication boundary binder ─────────────────────────────────────
create or replace function public.public_watch_index_bind_episode_reference()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_reference uuid;
begin
  /* The governed server-side reference resolution AS IT STANDS AT THIS
     PUBLICATION MOMENT. This is the only instant at which reading this
     column is evidence rather than current state — see the header. */
  select l.vault_reference_id into v_reference
    from public.listings l
   where l.id = NEW.listing_id;

  /* UNRESOLVED IS A REAL ANSWER. No guess, no seller text, no resemblance
     matching, and above all no refusal: an otherwise valid marketplace
     publication must never be blocked because the Public Watch Index cannot
     establish historical reference identity. The episode simply carries no
     exact-reference association until governed evidence later resolves it. */
  if v_reference is null then
    return null;
  end if;

  insert into public.public_watch_index_episode_reference
    (episode_id, vault_reference_id, established_via)
  values
    (NEW.id, v_reference, 'publication_boundary')
  on conflict do nothing;

  return null;
end;
$$;

drop trigger if exists public_watch_index_bind_episode_reference
  on public.listing_lifecycle_events;

create trigger public_watch_index_bind_episode_reference
  after insert on public.listing_lifecycle_events
  for each row
  when (new.event_type = 'BECAME_PUBLIC')
  execute function public.public_watch_index_bind_episode_reference();

comment on function public.public_watch_index_bind_episode_reference() is
  'Freezes the canonical reference at the moment a listing genuinely becomes public, bound to the durable publication episode. An unresolved reference records nothing and never blocks publication.';

-- ── Governed correction (append/supersede) ──────────────────────────────
create or replace function public.public_watch_index_correct_episode_reference(
  p_episode_id         bigint,
  p_vault_reference_id uuid,
  p_actor_uid          uuid,
  p_reason             text
)
returns public.public_watch_index_episode_reference
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_prior public.public_watch_index_episode_reference;
  v_row   public.public_watch_index_episode_reference;
begin
  if p_actor_uid is null then
    raise exception 'actor_required' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 1 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.vault_references where id = p_vault_reference_id) then
    raise exception 'unknown_reference' using errcode = '22023';
  end if;
  /* The correction must be tied to a genuine public publication episode.
     Correcting an episode that is not one is refused rather than invented. */
  if not exists (
    select 1 from public.listing_lifecycle_events
     where id = p_episode_id and event_type = 'BECAME_PUBLIC'
  ) then
    raise exception 'unknown_public_episode' using errcode = '22023';
  end if;

  select * into v_prior
    from public.public_watch_index_episode_reference
   where episode_id = p_episode_id and is_current;

  /* Retire the prior association FIRST so the one-current index is free.
     The prior row is never deleted or rewritten: it stays auditable with the
     actor and reason that retired it. */
  if v_prior.id is not null then
    if v_prior.vault_reference_id = p_vault_reference_id then
      raise exception 'already_associated' using errcode = '23505';
    end if;
    update public.public_watch_index_episode_reference
       set is_current = false,
           retired_at = now(),
           retired_by = p_actor_uid,
           retired_kind = 'superseded',
           retired_reason = btrim(p_reason)
     where id = v_prior.id;
  end if;

  insert into public.public_watch_index_episode_reference
    (episode_id, vault_reference_id, established_via, recorded_by, reason, supersedes_id)
  values
    (p_episode_id, p_vault_reference_id, 'governed_correction',
     p_actor_uid, btrim(p_reason), v_prior.id)
  returning * into v_row;

  return v_row;
end;
$$;

-- ── Governed withdrawal (no successor) ──────────────────────────────────
create or replace function public.public_watch_index_withdraw_episode_reference(
  p_episode_id bigint,
  p_actor_uid  uuid,
  p_reason     text
)
returns public.public_watch_index_episode_reference
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.public_watch_index_episode_reference;
begin
  if p_actor_uid is null then
    raise exception 'actor_required' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 1 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  /* Withdrawal is what happens when a correction CANNOT be defensibly tied
     to the original episode: the exact-reference contribution goes away
     rather than moving to today's row value. The publication episode itself
     is untouched — only the claim about which reference it belonged to. */
  update public.public_watch_index_episode_reference
     set is_current = false,
         retired_at = now(),
         retired_by = p_actor_uid,
         retired_kind = 'withdrawn',
         retired_reason = btrim(p_reason)
   where episode_id = p_episode_id and is_current
  returning * into v_row;

  if v_row.id is null then
    raise exception 'no_current_association' using errcode = '22023';
  end if;
  return v_row;
end;
$$;

revoke all on function public.public_watch_index_correct_episode_reference(bigint, uuid, uuid, text) from public;
revoke all on function public.public_watch_index_correct_episode_reference(bigint, uuid, uuid, text) from anon;
revoke all on function public.public_watch_index_correct_episode_reference(bigint, uuid, uuid, text) from authenticated;
grant execute on function public.public_watch_index_correct_episode_reference(bigint, uuid, uuid, text) to service_role;

revoke all on function public.public_watch_index_withdraw_episode_reference(bigint, uuid, text) from public;
revoke all on function public.public_watch_index_withdraw_episode_reference(bigint, uuid, text) from anon;
revoke all on function public.public_watch_index_withdraw_episode_reference(bigint, uuid, text) from authenticated;
grant execute on function public.public_watch_index_withdraw_episode_reference(bigint, uuid, text) to service_role;

comment on function public.public_watch_index_correct_episode_reference(bigint, uuid, uuid, text) is
  'Governed retrospective correction. Retires the prior association as superseded and appends the corrected one; never rewrites the publication episode. service_role only.';
comment on function public.public_watch_index_withdraw_episode_reference(bigint, uuid, text) is
  'Withdraws an exact-reference historical association that can no longer be defensibly tied to its publication episode. Not suppression: this is an evidence statement, not a permission one. service_role only.';
