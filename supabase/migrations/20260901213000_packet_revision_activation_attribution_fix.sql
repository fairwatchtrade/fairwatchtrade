-- ═══════════════════════════════════════════════════════════════════════
-- AUCTION OPERATIONS — activation_is_attributed: implication, not identity
--
-- THE DEFECT THIS FILE EXISTS TO KILL:
--
--   A revision could be activated exactly once and then never retired.
--
-- 20260901120000 wrote the constraint as a BICONDITIONAL:
--
--   check ((activation_state = 'active')
--          = (activated_by is not null and activated_at is not null))
--
-- The intent was "an active revision must say who activated it and when".
-- What it also says is the reverse: a revision that is NOT active must have
-- no activation attribution at all. Retirement violates that by design —
-- retiring keeps activated_by and activated_at precisely because they are
-- the historical record of when that revision governed, and runs bound to
-- it must stay readable afterwards.
--
-- So the atomic switch failed on its retirement half:
--
--   ERROR 23514 ... violates check constraint "activation_is_attributed"
--   CONTEXT: set activation_state = 'retired' ...
--            auction_operations_activate_packet_revision line 31
--
-- Caught by live verification, not by the source suite: every assertion
-- there was about the constraint's PRESENCE, and it was present. Only a
-- real retirement could show that what it forbade included the thing the
-- feature needs to do. The whole switch rolled back, correctly and
-- wholly — nothing was ever left half-applied — but supersession, the
-- capability the catalog exists to provide, could not happen at all.
--
-- ── THE REPAIR ─────────────────────────────────────────────────────────
-- Implication. Being active REQUIRES attribution; not being active says
-- nothing about it. The birth trigger already guarantees a new row arrives
-- with null activation attribution, so the reverse direction was buying
-- nothing that was not already enforced, while costing retirement entirely.
--
-- approval_is_attributed is deliberately NOT changed. Approval is never
-- revoked — the freeze trigger refuses it — so that biconditional never has
-- to survive a transition away from 'approved', and it correctly keeps an
-- unapproved row from carrying approval attribution.
--
-- Verify:
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conname = 'activation_is_attributed';
-- ═══════════════════════════════════════════════════════════════════════

alter table public.auction_operations_packet_revision
  drop constraint if exists activation_is_attributed;

alter table public.auction_operations_packet_revision
  add constraint activation_is_attributed
  check (
    activation_state <> 'active'
    or (activated_by is not null and activated_at is not null)
  );
