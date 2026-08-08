-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK — Evidence → Draft Materialization Bridge
--
-- Reverses the schema this flight added. It does NOT delete listings,
-- listing_media, or lifecycle events that the bridge already created: those
-- are real records of real writes, and erasing them would make the system
-- lie about its own history. Run this only while the bridge has created
-- nothing, or after the drafts it created have been dealt with deliberately.
--
-- The drop of dealer_accelerator_photograph_rehosts will REFUSE while any
-- rehost row exists. That refusal is intentional.
--
-- PFC274 = 62 — the evaluate route is untouched.
-- ════════════════════════════════════════════════════════════════════════

drop function if exists public.dealer_accelerator_materialize_item_draft(uuid, text, uuid);
drop function if exists public.dealer_accelerator_record_photograph_rehost(uuid, text, text, integer, text, text, uuid);
drop function if exists public.dealer_accelerator_assess_item_eligibility(uuid);

-- Refuses if republication facts exist (RESTRICT is the default).
drop table if exists public.dealer_accelerator_photograph_rehosts;

alter table public.dealer_accelerator_photographs
  drop constraint if exists dealer_accelerator_photographs_chain_key;

-- Restore the pre-flight event vocabulary. Refuses if an 'item_draft_created'
-- event has already been written — again, intentional.
alter table public.dealer_accelerator_lifecycle_events
  drop constraint dealer_accelerator_lifecycle_events_type_check;

alter table public.dealer_accelerator_lifecycle_events
  add constraint dealer_accelerator_lifecycle_events_type_check
  check (
    event_type in (
      'source_authorized',
      'source_suspended',
      'source_reauthorized',
      'source_revoked',
      'source_item_registered',
      'batch_created',
      'batch_started',
      'batch_completed',
      'batch_completed_with_exceptions',
      'batch_failed',
      'batch_retry_queued',
      'item_registered',
      'observation_recorded',
      'item_readied',
      'item_blocked',
      'item_unblocked',
      'item_lease_claimed',
      'item_lease_recovered',
      'item_retry_scheduled',
      'item_retry_exhausted',
      'payload_recorded',
      'photograph_declared',
      'photograph_retrieved',
      'photograph_retrieval_failed',
      'extraction_recorded',
      'batch_cancel_requested',
      'batch_cancelled',
      'batch_initialization_lease_claimed',
      'batch_initialization_lease_recovered',
      'photograph_retrieval_terminal'
    )
  );

-- NOTE: dealer_import_one_listing is deliberately NOT reverted. Restoring the
-- pre-flight body would reintroduce the money-pairing defect (asking_price
-- written without asking_currency violates listings_money_pairing_check), and
-- that defect blocks every priced dealer import, bridge or not.

-- PFC274 = 62 — the evaluate route is untouched.
