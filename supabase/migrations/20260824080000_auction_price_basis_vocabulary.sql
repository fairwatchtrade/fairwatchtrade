-- ════════════════════════════════════════════════════════════════════════
-- AUCTION PRICE BASIS — two states the vocabulary could not express
-- supabase/migrations/20260824080000_auction_price_basis_vocabulary.sql
--
-- THE MISCONCEPTION THIS MIGRATION EXISTS TO KILL:
--
--   Being allowed to SHOW a price is not the same as understanding it well
--   enough to COMPARE it.
--
-- Those are separate gates, and flattening them is what produced the defect
-- this fixes. Monaco's factual results are publishable — that question is
-- settled. Whether a given number means the same thing as a Phillips number
-- is a different question with a different answer.
--
-- ── WHY `other` HAD TO STOP BEING A TERMINAL ANSWER ────────────────────
-- `other` was not a mapper mistake. For ET33/ET35 it was a documented,
-- honest fallback: the vocabulary had no value capable of expressing
-- "result including premium and VAT", so the adapter chose the only
-- non-lying option available.
--
-- The problem is that `other` collapses three genuinely different epistemic
-- states into one bucket:
--
--   1. the price exists and we know exactly what it means
--   2. the price exists and is trustworthy, but its composition is unknown
--   3. there is no trustworthy price fact at all
--
-- State 3 already had an honest representation — NULL/NULL/NULL. States 1
-- and 2 did not, so both landed in `other` and became indistinguishable.
-- That is the erasure being repaired.
--
-- ── THE TWO NEW VALUES ─────────────────────────────────────────────────
--
--   result_including_premium_and_vat
--     For ET33/ET35, whose sources prove the reported figure includes both
--     buyer's premium and VAT. Deliberately NOT named
--     'hammer_plus_premium_plus_vat': the source does not establish
--     "hammer" as the semantic base, and a name that claims more than the
--     source proves is the same failure in a different costume.
--
--   reported_result_basis_unverified
--     The price is trustworthy AS A SOURCE-REPORTED RESULT and its
--     composition is unresolved. This is an honest epistemic state, not a
--     placeholder awaiting cleanup. A row in this state is publishable as a
--     fact and ineligible for normalized cross-house comparison, and those
--     two properties are meant to coexist indefinitely if the semantics are
--     never resolved.
--
-- ── ORDERING IS LOAD-BEARING ───────────────────────────────────────────
-- The CHECK must be widened BEFORE any backfill or ingest, because three
-- production constraints govern every write together:
--   · price_basis must be null or in the governed vocabulary;
--   · price, currency and basis are all-present or all-absent;
--   · only a 'sold' outcome may carry any of them.
-- A backfill attempted first fails on the first row, every time.
--
-- ── WHAT THIS MIGRATION DOES NOT DO ────────────────────────────────────
-- It does not touch a single price. Widening a vocabulary and using it are
-- separate acts, and the data repair travels through the existing governed
-- correction RPC so every change supersedes rather than overwrites.
-- ════════════════════════════════════════════════════════════════════════

begin;

alter table public.auction_evidence_result
  drop constraint if exists aer_price_basis_check;

alter table public.auction_evidence_result
  add constraint aer_price_basis_check
  check (
    price_basis is null
    or price_basis in (
      'hammer',
      'hammer_plus_premium',
      -- Exact, proven semantics.
      'result_including_premium_and_vat',
      -- Trustworthy number, unresolved composition. Not a waiting room.
      'reported_result_basis_unverified',
      -- Retained ONLY so historical rows remain valid during staged
      -- cleanup. New ingestion must never terminate here.
      'other'
    )
  );

comment on column public.auction_evidence_result.price_basis is
  'What the stored number actually means. Ingestion must terminate in exactly one of three honest states: a specific governed basis; reported_result_basis_unverified when the figure is trustworthy but its composition is unresolved; or NULL/NULL/NULL when there is no trustworthy price fact. ''other'' is retained only for historical rows during staged cleanup and must never be emitted by new ingestion — it collapses "known but different" and "trustworthy but unresolved" into one bucket, which is the erasure this vocabulary exists to prevent.';

commit;
