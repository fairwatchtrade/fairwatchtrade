-- ════════════════════════════════════════════════════════════════════════
-- AUCTION OPERATIONS — one live run per exact packet revision        (v8.22)
-- supabase/migrations/20260902220000_auction_operations_one_live_run_per_revision.sql
--
-- THE MISCONCEPTION THIS FILE EXISTS TO KILL:
--
--   "The route checks for a live run before it inserts one, so there can
--    only ever be one."
--
-- A check-then-insert is advisory. Two START PLANNING presses that land
-- within the same few milliseconds both read "no live run" and both insert,
-- and the room then carries two governed runs for one packet revision. The
-- only thing that makes the reviewed one-live-run invariant TRUE is a
-- uniqueness backstop in the database, so that the second insert is refused
-- by PostgreSQL itself and the route recovers the winner instead.
--
-- THE PREDICATE, and why exactly these states:
--   uploading | planning | applying   are mid-flight. One at a time.
--   planned   | applied  | failed     are outcomes. They never block a fresh
--                                     START, and a planned run may coexist
--                                     with a newer planning run.
--
-- NULL packet_revision_id rows are outside the guarantee by normal
-- PostgreSQL NULL semantics. That is deliberate: the two legacy runs that
-- predate revision binding stay exactly NULL and are never rebound.
--
-- SECOND-ORDER CONSEQUENCE, handled in the Apply route: this same index
-- governs planned -> applying. Applying an older plan while another run for
-- the same revision is live is refused by the index; the route turns that
-- into a bounded active_run_conflict, leaves both runs untouched, and the
-- founder retries once the other run leaves the live states.
--
-- Preflight at authoring: production held exactly two runs, both legacy
-- NULL-bound (one planned, one applied), and no bound run rows - no
-- collision. Existing indexes: pkey, non-unique packet_revision_idx,
-- recent created_at idx.
--
-- No table shape, state vocabulary, writer, RLS, grant or Auction Evidence
-- data changes. This index is the ONLY DDL this flight authorizes.
-- ════════════════════════════════════════════════════════════════════════

create unique index if not exists auction_operations_run_one_unterminated_per_revision
  on public.auction_operations_run (packet_revision_id)
  where state in ('uploading', 'planning', 'applying');

comment on index public.auction_operations_run_one_unterminated_per_revision is
  'R1 race guard: at most one uploading/planning/applying run per exact packet revision. '
  'NULL (legacy, pre-binding) rows are outside the guarantee by design. '
  'Birth recovers the existing live run on conflict; Apply surfaces the conflict as active_run_conflict.';
