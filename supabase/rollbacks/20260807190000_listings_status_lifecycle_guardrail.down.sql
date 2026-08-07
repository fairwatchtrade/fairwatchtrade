-- Rollback: remove the listing lifecycle status guardrail.
-- Drops only the CHECK. No data is touched and no status value changes.

alter table public.listings
  drop constraint if exists listings_status_lifecycle;
