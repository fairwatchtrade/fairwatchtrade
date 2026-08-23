-- ════════════════════════════════════════════════════════════════════════
-- PHYSICAL WATCH SKELETON — opaque identity for the actual object
-- supabase/migrations/20260824040000_physical_watch_skeleton_06b.sql
--
-- THE MISCONCEPTION THIS MIGRATION EXISTS TO KILL:
--
--   A listing row is not the physical watch.
--
-- A listing is one chapter: a moment when someone offered an object for
-- sale. The object outlives the chapter. Until now the platform had no way
-- to say "this listing is about THAT object" — only "this listing exists".
--
-- ── THE TWO IDENTITIES, AND WHY THEY ARE NOT DERIVED FROM ONE ANOTHER ───
--   vault_reference_id  (06A)  WHAT KIND of watch this is
--   physical_watch_id   (06B)  WHICH OBJECT RECORD this listing belongs to
--
-- Same canonical reference does NOT imply same physical watch. Two sellers
-- listing the same reference are two objects. One seller listing the same
-- reference twice is, as far as this round is concerned, still two objects.
-- Neither column may ever be computed from the other.
--
-- ── WHAT THIS ROUND REFUSES TO DECIDE ──────────────────────────────────
-- It does NOT answer "are these two listings the same physical watch?"
-- That is a later, governed question with its own evidence.
--
--   False split is repairable later. False merge corrupts provenance.
--
-- So this round mints ONE FRESH OBJECT IDENTITY PER LISTING ROW and stops.
-- Every existing listing gets its own. No grouping by reference, seller,
-- brand, images, provenance, text similarity, or inference of any kind.
-- Deliberately generating false splits is the correct, conservative error.
--
-- ── WHERE THE MINT ACTUALLY LIVES — READ THIS BEFORE EDITING ANY ROUTE ──
-- The mint is a COLUMN DEFAULT, not application code. Nothing in the
-- TypeScript ever writes physical_watch_id, and nothing should start.
--
-- This is not cleverness for its own sake. There are two listing-creation
-- seams, and one of them — dealer materialization — creates its listing
-- INSIDE public.dealer_accelerator_materialize_item_draft, a security
-- definer function that inserts listing, media, item status and lifecycle
-- event in one transaction. Application code cannot join that transaction.
-- A TypeScript mint there would be a second round trip that could succeed
-- while the listing failed, or fail while the listing succeeded — which is
-- precisely the non-atomicity this round forbids.
--
-- A DEFAULT is evaluated per row, inside whatever transaction is doing the
-- INSERT. So it is atomic at BOTH seams for free, it fires for any future
-- creation path nobody has thought of yet, and it cannot be forgotten.
--
-- It also makes the negative guarantee structural rather than a promise:
-- the function only ever INSERTs and returns a brand-new id, so there is no
-- expression anywhere in this round capable of assigning one listing's
-- physical identity to another listing.
--
-- A DEFAULT does not fire on UPDATE, so same-row lifecycle — edit, reject
-- then resubmit, remove then restore — preserves the object identity with
-- no code and no guard. The behavior falls out of the mechanism.
--
-- ── ON DELETE RESTRICT, DELIBERATELY NOT SET NULL ──────────────────────
-- 06A's vault_reference_id uses SET NULL because taxonomy may legitimately
-- be reclassified or removed, and a listing that loses its classification
-- is merely unclassified.
--
-- Physical identity is the opposite kind of fact. It is durable
-- infrastructure, and severing it silently would destroy the continuity
-- every later round depends on. Ordinary lifecycle must not be able to
-- delete an object identity out from under a listing. Retirement, merge,
-- and split semantics belong to a governed later round that can reason
-- about provenance; until that exists, the database refuses.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · The bead ────────────────────────────────────────────────────────
-- Two columns, on purpose. No reference, brand, serial, case number,
-- movement number, owner, status, matching metadata, merge fields, or
-- Passport fields. Every one of those is a later round's decision, and a
-- column added early becomes a column something starts trusting early.
create table if not exists public.physical_watches (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

comment on table public.physical_watches is
  'An opaque identity for one physical watch object. Deliberately holds no attributes — it is a bead to hang history on, not a description of a watch. A listing is a chapter about an object; this is the object.';

-- Opaque means opaque: no client role reads this table. RLS on with no
-- policy denies every non-service caller by default. Referential integrity
-- checks are exempt from RLS, so the foreign key below still validates.
alter table public.physical_watches enable row level security;

revoke all on public.physical_watches from anon, authenticated;

-- ── 2 · The mint ────────────────────────────────────────────────────────
-- Security definer because the inserting role (authenticated, or the
-- dealer writer) has no rights on the table above and must not gain any.
-- It takes no arguments, so there is nothing a caller can influence: the
-- only thing it can do is create one new opaque row and return its id.
create or replace function public.mint_physical_watch()
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.physical_watches default values returning id;
$$;

comment on function public.mint_physical_watch() is
  'Mints one fresh physical-watch identity. Used as the column default on listings.physical_watch_id so the mint is atomic with the listing insert at every creation seam. Never call this to share an identity — it cannot return an existing one.';

alter function public.mint_physical_watch() owner to postgres;
revoke all on function public.mint_physical_watch() from public;
grant execute on function public.mint_physical_watch()
  to anon, authenticated, service_role, dealer_accelerator_writer;

-- ── 3 · The edge ────────────────────────────────────────────────────────
alter table public.listings
  add column if not exists physical_watch_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'listings_physical_watch_id_fkey'
       and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listings_physical_watch_id_fkey
      foreign key (physical_watch_id)
      references public.physical_watches(id)
      on delete restrict;
  end if;
end $$;

-- NO UNIQUE CONSTRAINT, now or later in this round. Uniqueness here would
-- permanently forbid two listings from ever sharing an object identity —
-- and a later governed round exists precisely to allow that when evidence
-- earns it. The absence of this constraint is a decision, not an omission.

create index if not exists listings_physical_watch_id_idx
  on public.listings (physical_watch_id)
  where physical_watch_id is not null;

comment on column public.listings.physical_watch_id is
  'Which physical object record this listing is about. Minted fresh per listing row by the column default; never written by application code. Orthogonal to vault_reference_id (what KIND of watch) and never derived from it. Same reference does not imply same object. ON DELETE RESTRICT: object identity is durable infrastructure and must not be severed by an ordinary delete.';

-- ── 4 · Existing rows ───────────────────────────────────────────────────
-- One fresh identity each, minted before the default is attached so the
-- intent is explicit rather than incidental. mint_physical_watch() is
-- volatile, so it is evaluated once PER ROW — this cannot collapse two
-- listings onto one bead.
update public.listings
   set physical_watch_id = public.mint_physical_watch()
 where physical_watch_id is null;

-- ── 5 · The default, attached last ──────────────────────────────────────
alter table public.listings
  alter column physical_watch_id set default public.mint_physical_watch();

-- ── 6 · Prove it, here, against live rows ───────────────────────────────
-- Every precondition re-proved at execution time. If any of this is false
-- the whole migration rolls back rather than leaving the table half-built.
do $$
declare
  v_total     int;
  v_populated int;
  v_distinct  int;
begin
  select count(*) into v_total from public.listings;
  select count(physical_watch_id), count(distinct physical_watch_id)
    into v_populated, v_distinct
    from public.listings;

  if v_populated <> v_total then
    raise exception 'backfill incomplete: % of % listings carry an object identity',
      v_populated, v_total;
  end if;
  if v_distinct <> v_total then
    raise exception 'backfill collapsed identities: % distinct for % listings — false merge',
      v_distinct, v_total;
  end if;

  raise notice 'physical identity minted for % listings, all distinct', v_total;
end $$;

commit;
