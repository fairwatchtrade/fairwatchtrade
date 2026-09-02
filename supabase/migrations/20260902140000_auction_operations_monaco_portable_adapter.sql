-- ════════════════════════════════════════════════════════════════════════
-- AUCTION OPERATIONS — the monaco-portable adapter id                (v8.18)
-- supabase/migrations/20260902140000_auction_operations_monaco_portable_adapter.sql
--
-- ⛔ NOT APPLIED TO PRODUCTION BY THE FLIGHT THAT WROTE IT.
--    This file is the exact production migration gate for the ET37
--    plan-only pilot. It ships in the repository so it can be reviewed and
--    tested at source level; applying it is a separately authorised act.
--
-- THE MISCONCEPTION THIS FILE EXISTS TO KILL:
--
--   "The adapter allowlist is code, so a new adapter is a code change."
--
-- It is BOTH, on purpose. lib/auction-operations/packetContract.ts holds
-- ADAPTER_ALLOWLIST, and this CHECK mirrors it so that a compromised route
-- still cannot introduce a name the database has not been told about.
-- Adding an adapter therefore means adding it in both places, in the same
-- push, or the two disagree and registration fails closed — which is the
-- correct failure.
--
-- What this admits: `monaco-portable`, the code-owned family for accepted,
-- reconciled Monaco keeper artifacts. Plan-only. Apply is refused for it by
-- name in the dispatcher (applyDispatchFor) and that refusal exists BEFORE
-- this row can be registered — the refusal is the precondition of
-- registration, not a sibling of it.
--
-- What this does NOT do: it does not register ET37, does not stage a
-- keeper, does not touch Auction Evidence, and does not promote
-- phillips-sale or monaco-legend. The three existing classifications are
-- unchanged.
--
-- The original v8.0 catalog migration is not edited. Already-applied
-- migrations are history; this one supersedes the constraint by dropping
-- and re-adding it.
-- ════════════════════════════════════════════════════════════════════════

alter table public.auction_operations_packet_revision
  drop constraint if exists auction_operations_packet_revision_adapter_id_check;

alter table public.auction_operations_packet_revision
  add constraint auction_operations_packet_revision_adapter_id_check
  check (adapter_id in ('phillips-sale','monaco-legend','monaco-layer2','monaco-portable'));

comment on constraint auction_operations_packet_revision_adapter_id_check
  on public.auction_operations_packet_revision is
  'Mirror of ADAPTER_ALLOWLIST in lib/auction-operations/packetContract.ts. '
  'monaco-portable (v8.18) is plan-only: Apply is refused for it by name in applyDispatchFor().';
