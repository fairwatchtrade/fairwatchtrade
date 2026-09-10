-- ════════════════════════════════════════════════════════════════════════
-- PUBLIC WATCH INDEX — founder-authorized suppression / no-resurrection seam
-- Phase 1. Governing authority: docs/product-laws/
--   Public_Watch_Index_Product_Contract_v2_ADOPTED.md §8.
--
-- WHAT THIS IS. A record of PERMISSION TO PUBLISH, nothing else. It does not
-- rewrite a publication event, it is not a parallel factual-history ledger,
-- and it never becomes public. §8: "Suppression changes permission to
-- publish; it does not rewrite the underlying publication event or authorize
-- a parallel factual-history ledger."
--
-- THE FOUR RULES THIS TABLE EXISTS TO MAKE MECHANICAL
--
--   1 · FOUNDER ONLY, SERVER SIDE. No client role may read, insert, update or
--       delete. RLS is enabled with NO policy, which denies every client role
--       structurally, and the two writer functions are service_role-only. The
--       founder gate itself lives in the calling route — the same division
--       v8.31 used for dealer admission.
--
--   2 · NO RESURRECTION BY REFRESH. A live suppression is publication
--       authority. Any refresh, cache regeneration or full rebuild must read
--       this table and honour it; re-reading the original source is not
--       reinstatement. Nothing here expires on its own, and no process other
--       than an explicit authorized reversal can clear one.
--
--   3 · REASSOCIATION CANNOT EVADE IT. A contribution-scoped suppression is
--       keyed on the CONTRIBUTION (the listing), and the projection follows
--       it wherever that contribution later resolves. `vault_reference_id`
--       records the reference the decision was ABOUT; it is not the thing
--       that has to still match for the suppression to bite.
--
--   4 · RE-ADMISSION IS TWO ACTS. An explicit authorized reversal recorded
--       here, AND a successful eligibility check at projection time. A
--       reversal alone re-admits nothing: the projection recomputes the
--       assertion from the live gates afterwards.
--
-- PRIVATE FOREVER. actor, reason, time and scope are recorded internally and
-- are never published. The projection reads only "is there a live suppression
-- covering this contribution/assertion" — never why, never who.
--
-- DELIBERATELY NOT BUILT: no seller self-service suppression, no expiry, no
-- automatic suppression from any signal, no public read path.
--
-- PFC274 = 62 — the evaluate route is untouched.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.public_watch_index_suppressions (
  id uuid primary key default gen_random_uuid(),

  /* The reference the decision was ABOUT. Recorded for scope and audit.
     RESTRICT, not SET NULL: a reference must not be deleted out from under a
     live publication-authority decision. This is 06B's answer (object
     identity may not be severed), not 06A's (taxonomy may be reclassified),
     because a suppression is a decision about a specific thing. */
  vault_reference_id uuid not null
    references public.vault_references (id) on delete restrict,

  /* Contribution scope. NULL = the whole reference's assertion is suppressed.
     Non-null = this listing's contribution is suppressed, and it stays
     suppressed if the listing is later reassociated to another reference.

     DELIBERATELY NO FOREIGN KEY. Two reasons, both load-bearing:
       · the decision must survive the listing's deletion — a contribution
         that could return through some other source stays suppressed;
       · listings already carries a known permanent-delete blocker where a
         3-hop cascade meets a NO ACTION foreign key. Adding another RESTRICT
         edge to listings would deepen a defect that is already open. */
  contribution_listing_id uuid,

  /* Which public assertion the decision covers. 'all' covers every one. */
  assertion text not null check (assertion in (
    'all',
    'available_now',
    'public_listing_history',
    'approved_public_reference_knowledge',
    'market_evidence'
  )),

  /* Internal only. Never published, never returned to a public consumer. */
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  actor_uid uuid not null,
  created_at timestamptz not null default now(),

  /* Reversal = re-admission authority. All three fields or none: a reversal
     without a recorded actor and reason is not an authorized reversal. */
  reversed_at timestamptz,
  reversed_by uuid,
  reversal_reason text,

  constraint public_watch_index_suppressions_reversal_complete check (
    (reversed_at is null and reversed_by is null and reversal_reason is null)
    or (reversed_at is not null and reversed_by is not null
        and reversal_reason is not null
        and char_length(btrim(reversal_reason)) between 1 and 2000)
  )
);

comment on table public.public_watch_index_suppressions is
  'Public Watch Index publication authority. Founder-only, never public. A live row forbids the covered contribution/assertion from appearing in the index, through every refresh and rebuild. See docs/product-laws/Public_Watch_Index_Product_Contract_v2_ADOPTED.md section 8.';

/* One LIVE suppression per (reference, contribution, assertion). A reversed
   row does not occupy the slot, so the same scope may be suppressed again
   later — suppression is repeatable, reversal is not a permanent amnesty.
   The sentinel stands in for NULL because NULLs never collide in a unique
   index, which would otherwise permit unlimited duplicate reference-scoped
   rows. */
create unique index if not exists public_watch_index_suppressions_live_scope
  on public.public_watch_index_suppressions (
    vault_reference_id,
    coalesce(contribution_listing_id, '00000000-0000-0000-0000-000000000000'::uuid),
    assertion
  )
  where reversed_at is null;

/* The projection's hot lookup: every live suppression, by contribution. */
create index if not exists public_watch_index_suppressions_live_contribution
  on public.public_watch_index_suppressions (contribution_listing_id)
  where reversed_at is null;

-- ── Structural denial for every client role ─────────────────────────────
alter table public.public_watch_index_suppressions enable row level security;
-- No policy is created on purpose. RLS enabled with zero policies denies
-- anon and authenticated entirely; service_role bypasses RLS.
revoke all on table public.public_watch_index_suppressions from anon;
revoke all on table public.public_watch_index_suppressions from authenticated;

-- ── The one governed writer ─────────────────────────────────────────────
create or replace function public.public_watch_index_suppress(
  p_vault_reference_id      uuid,
  p_assertion               text,
  p_reason                  text,
  p_actor_uid               uuid,
  p_contribution_listing_id uuid default null
)
returns public.public_watch_index_suppressions
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.public_watch_index_suppressions;
begin
  if p_vault_reference_id is null then
    raise exception 'reference_required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.vault_references where id = p_vault_reference_id) then
    raise exception 'unknown_reference' using errcode = '22023';
  end if;
  if p_actor_uid is null then
    raise exception 'actor_required' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 1 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  /* A second live suppression over the same scope is refused rather than
     silently merged: two decisions about one thing must not become one row
     whose actor and reason are whichever arrived last. */
  if exists (
    select 1 from public.public_watch_index_suppressions
     where vault_reference_id = p_vault_reference_id
       and coalesce(contribution_listing_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(p_contribution_listing_id, '00000000-0000-0000-0000-000000000000'::uuid)
       and assertion = p_assertion
       and reversed_at is null
  ) then
    raise exception 'already_suppressed' using errcode = '23505';
  end if;

  insert into public.public_watch_index_suppressions
    (vault_reference_id, contribution_listing_id, assertion, reason, actor_uid)
  values
    (p_vault_reference_id, p_contribution_listing_id, p_assertion, btrim(p_reason), p_actor_uid)
  returning * into v_row;
  return v_row;
end;
$$;

-- ── The one governed reversal ───────────────────────────────────────────
create or replace function public.public_watch_index_reverse_suppression(
  p_suppression_id uuid,
  p_actor_uid      uuid,
  p_reason         text
)
returns public.public_watch_index_suppressions
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.public_watch_index_suppressions;
begin
  if p_actor_uid is null then
    raise exception 'actor_required' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 1 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  /* Reversing an already-reversed row is refused, not made idempotent: the
     second reversal would overwrite the first one's actor and reason, and
     the reversal record is the authority for re-admission. */
  update public.public_watch_index_suppressions
     set reversed_at = now(),
         reversed_by = p_actor_uid,
         reversal_reason = btrim(p_reason)
   where id = p_suppression_id
     and reversed_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not_live_suppression' using errcode = '22023';
  end if;
  return v_row;
end;
$$;

revoke all on function public.public_watch_index_suppress(uuid, text, text, uuid, uuid) from public;
revoke all on function public.public_watch_index_suppress(uuid, text, text, uuid, uuid) from anon;
revoke all on function public.public_watch_index_suppress(uuid, text, text, uuid, uuid) from authenticated;
grant execute on function public.public_watch_index_suppress(uuid, text, text, uuid, uuid) to service_role;

revoke all on function public.public_watch_index_reverse_suppression(uuid, uuid, text) from public;
revoke all on function public.public_watch_index_reverse_suppression(uuid, uuid, text) from anon;
revoke all on function public.public_watch_index_reverse_suppression(uuid, uuid, text) from authenticated;
grant execute on function public.public_watch_index_reverse_suppression(uuid, uuid, text) to service_role;

comment on function public.public_watch_index_suppress(uuid, text, text, uuid, uuid) is
  'The only way a Public Watch Index suppression is created. service_role only; the founder gate lives in the calling route. Records actor, time, reason and scope internally; none of it is ever published.';
comment on function public.public_watch_index_reverse_suppression(uuid, uuid, text) is
  'The only way a suppression is lifted. Reversal is one half of re-admission; the projection must still pass a live eligibility check afterwards.';
