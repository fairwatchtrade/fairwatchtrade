-- ════════════════════════════════════════════════════════════════════════
-- CANONICAL WATCH IDENTITY — the one governed listing → Vault edge
-- supabase/migrations/20260824030000_canonical_watch_identity_06a.sql
--
-- THE MISCONCEPTION THIS MIGRATION EXISTS TO KILL:
--
--   Manufacturer reference TEXT is not canonical listing identity.
--
-- Before this column, `listings.brand`, `listings.model` and
-- `listings.reference` were free text and there was no relationship of any
-- kind between a listing and the governed Vault taxonomy. Not a broken one —
-- none. This adds exactly one edge, and nothing else.
--
-- ── WHAT THIS COLUMN ANSWERS, AND WHAT IT DOES NOT ─────────────────────
-- It answers: WHAT KIND OF WATCH IS THIS?
-- It does NOT answer: WHICH EXACT PHYSICAL WATCH IS THIS?
--
-- Two listings of the same reference legitimately carry the SAME
-- vault_reference_id while remaining completely independent physical
-- objects. That is the acceptance law of this round, and it is why there is
-- no unique constraint here and never should be. Physical-watch identity,
-- serials, and same-watch matching are a different problem with different
-- evidence, and none of them is introduced here.
--
-- ── WHY NULLABLE, AND WHY NO BACKFILL ──────────────────────────────────
-- Of the listings that exist as this ships, only one resolves
-- deterministically to a single Vault reference under its own brand. The
-- rest genuinely have no unambiguous canonical answer, and
-- `vault_references.reference` is NOT unique — a real duplicate already
-- exists in the corpus.
--
-- Guessing the remainder by fuzzy text would manufacture identity the
-- platform has not earned, and it would be indistinguishable afterwards
-- from identity it did. Unknown stays NULL. Forward population comes from
-- the Sell Flow resolver; historical rows are corrected by a human or not
-- at all.
--
-- ── ON DELETE SET NULL ─────────────────────────────────────────────────
-- If a Vault reference is ever removed, the listing survives and loses its
-- canonical claim. A listing must never be deleted by taxonomy maintenance,
-- and a dangling identity pointer is worse than an absent one.
--
-- ── WRITE POSTURE ──────────────────────────────────────────────────────
-- INSERT is table-wide for `authenticated`, so the new column inherits it
-- and the Sell Flow can write a resolved link at creation. UPDATE for
-- `authenticated` is column-scoped and deliberately NOT extended here: a
-- seller cannot mutate canonical identity after the fact. Correction is a
-- founder action through the service role.
-- ════════════════════════════════════════════════════════════════════════

begin;

alter table public.listings
  add column if not exists vault_reference_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'listings_vault_reference_id_fkey'
       and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listings_vault_reference_id_fkey
      foreign key (vault_reference_id)
      references public.vault_references(id)
      on delete set null;
  end if;
end $$;

-- Reverse lookup ("which listings claim this canonical reference?") is the
-- only access pattern this column has. Partial: the unresolved majority is
-- not worth indexing and never will be queried by a NULL pointer.
create index if not exists listings_vault_reference_id_idx
  on public.listings (vault_reference_id)
  where vault_reference_id is not null;

comment on column public.listings.vault_reference_id is
  'Canonical type-of-watch identity: the governed vault_references row this listing has been determined to be. NULL means unresolved or ambiguous, which is an honest state and the default. Never unique — two listings of the same reference are two independent physical objects. listings.reference remains seller-stated text and is not authoritative for identity.';

-- Explicit and additive; the table-level INSERT grant already covers it.
-- Stated so the write posture survives a future narrowing of that grant.
grant insert (vault_reference_id) on public.listings to authenticated;

commit;
