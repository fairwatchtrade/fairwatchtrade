-- ============================================================================
-- Marketplace Money Truth — STAGE D (part 1 of 2): pairing constraint, NOT VALID
--
-- The law (Master Record, order §2.1): a marketplace money fact is an exact
-- amount PLUS its currency, present or absent together. This constraint makes
-- that law structural on public.listings:
--
--   (asking_price IS NULL) = (asking_currency IS NULL)
--
-- NOT VALID: existing rows are not yet judged; every NEW write is enforced
-- immediately. Validation of existing rows is the SEPARATE part-2 migration
-- (20260730230100), applied only after a read-only zero-violation proof on
-- the target — the staged ceremony the order requires (§13 Stage D).
--
-- Scope notes, stated rather than hidden:
--   · listings ONLY. purchase_requests snapshot pairing is deliberately
--     deferred: the legacy snapshots are immutable and currency-less, so that
--     constraint is unsatisfiable without a backfill this flight excludes.
--   · A currency can no longer be attested onto an amount-less listing —
--     the constraint enforces the ruling that deferred the amount-less draft.
--   · Known follow-up (recorded, NOT implemented here): the Imported Drafts
--     room lets a dealer clear the amount while the attested currency stays;
--     that write is now refused by the database and surfaces as a raw save
--     error until an app-side message ships in its own later flight.
--
-- Rollback: scripts/money-truth-stage-d.rollback.sql (single DROP CONSTRAINT,
-- valid from either stage).
--
-- PFC274 = 62 — app/api/evaluate/route.ts is untouched.
-- ============================================================================

alter table public.listings
  add constraint listings_money_pairing_check
  check ((asking_price is null) = (asking_currency is null))
  not valid;
