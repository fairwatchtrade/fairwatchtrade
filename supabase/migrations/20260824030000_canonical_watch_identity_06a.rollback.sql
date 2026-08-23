-- Rollback for 20260824030000_canonical_watch_identity_06a.sql
--
-- Dropping the column discards every canonical link established since the
-- migration ran. Those links are re-derivable from Sell Flow resolution and
-- founder correction, but they are NOT recoverable from this file — the
-- seller text they were resolved from is preserved, the resolutions
-- themselves are not.

begin;

drop index if exists public.listings_vault_reference_id_idx;

alter table public.listings
  drop constraint if exists listings_vault_reference_id_fkey;

alter table public.listings
  drop column if exists vault_reference_id;

commit;
