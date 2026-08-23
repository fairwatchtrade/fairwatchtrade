-- ═══════════════════════════════════════════════════════════════════════
-- AUCTION OPERATIONS — the plan is BYTES, not a document
--
-- Found by the first production proof, before any founder apply: the run
-- store held the plan in a jsonb column, and jsonb does not preserve key
-- order or serialization detail. The recorded SHA-256 was computed over the
-- generator's exact bytes; re-serializing the jsonb produced different
-- bytes, so verifyStoredPlan refused every apply with a hash mismatch —
-- fail-closed, exactly as designed, but permanently.
--
-- A hash-bound plan must be stored as the bytes that were hashed. The
-- application parses it when it needs the structure.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.auction_operations_run
  add column if not exists plan_bytes text;

alter table public.auction_operations_run
  drop column if exists plan;
