-- ============================================================================
-- Marketplace Money Truth — STAGE D (part 2 of 2): validate the pairing
--
-- Judges every EXISTING row against listings_money_pairing_check (added
-- NOT VALID by 20260730230000). Apply ONLY after the read-only proof on the
-- target returns zero violations:
--
--   select count(*) from public.listings
--    where (asking_price is null) <> (asking_currency is null);
--
-- After this migration, pg_constraint.convalidated = true and the
-- amount-with-its-currency law holds for every row, past and future.
--
-- PFC274 = 62 — app/api/evaluate/route.ts is untouched.
-- ============================================================================

alter table public.listings validate constraint listings_money_pairing_check;
