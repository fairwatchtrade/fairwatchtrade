-- Rollback for 20260824040000_physical_watch_skeleton_06b.sql
--
-- ⚠ THIS DESTROYS OBJECT IDENTITY, AND IT IS NOT RECOVERABLE.
--
-- Every physical-watch id minted since the migration ran disappears with
-- the table. Re-running the migration afterwards mints entirely NEW beads —
-- the listings will each get an identity again, but not the SAME identity.
-- Anything that recorded a physical_watch_id elsewhere in the meantime
-- would be pointing at nothing.
--
-- While only 06B exists this costs little, because nothing yet accumulates
-- history against these ids. The moment a later round hangs provenance,
-- transfer events, or Passport history on them, this file stops being a
-- rollback and becomes a data-loss event. Read that sentence again before
-- running it.

begin;

alter table public.listings
  alter column physical_watch_id drop default;

drop index if exists public.listings_physical_watch_id_idx;

alter table public.listings
  drop constraint if exists listings_physical_watch_id_fkey;

alter table public.listings
  drop column if exists physical_watch_id;

drop function if exists public.mint_physical_watch();

drop table if exists public.physical_watches;

commit;
