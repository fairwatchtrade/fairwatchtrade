-- ============================================================================
-- ROLLBACK for Stage D pairing enforcement (both parts).
--
-- Drops listings_money_pairing_check regardless of whether it is NOT VALID
-- (20260730230000 only) or validated (20260730230100 applied). One statement,
-- no data to reverse, repeatable in both directions.
--
-- PFC274 = 62 — app/api/evaluate/route.ts is untouched.
-- ============================================================================

alter table public.listings drop constraint if exists listings_money_pairing_check;
