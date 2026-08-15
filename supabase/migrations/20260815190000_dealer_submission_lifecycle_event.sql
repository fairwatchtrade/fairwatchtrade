/* ════════════════════════════════════════════════════════════════════════
   DEALER SUBMISSION LIFECYCLE EVENT
   Dealer Accelerator porch-proof closure, repair 1 of 3.

   WHAT THIS CLOSES

   The TD-0002 porch proof moved an imported draft draft → pending_review
   through the real dealer UI. It worked. But the Accelerator's append-only
   lifecycle log stopped at item_draft_created, and listing_decision_events
   only ever records reviewer decisions (approved / rejected — no submitted
   type exists anywhere in that table). The dealer's own submission fell
   between two logs that each correctly cover something else.

   The attestation FACT was never missing: submit_listing_for_review already
   stamps dealer_attested_at / _by / _fingerprint atomically with the
   transition. What was missing is HISTORY. Those three columns are current
   state — a resubmission overwrites them, and the earlier attestation is
   gone. An append-only event survives that.

   WHY A TRIGGER RATHER THAN EDITING THE RPC

   submit_listing_for_review builds a 14-frame length-prefixed canonical text
   whose bytes must match lib/attestation.ts exactly; the fingerprint is a
   SHA-256 over it. CREATE OR REPLACE would mean retyping that builder in
   order to append an unrelated INSERT, and a single transcribed byte would
   silently change every fingerprint minted from then on. A trigger fires in
   the same transaction, at the same instant, and does not touch it.

   Atomic either way: the event commits with the transition, or neither does.

   WHY entity_kind = 'item'

   The lifecycle table's entity CHECK admits source / source_item / batch /
   item / observation, each requiring its own context id. There is no listing
   kind, and listing_id is not part of that rule. Rather than broaden this
   table into a second general listing-audit system, the event reuses 'item'
   with the batch_item_id that already links the imported item to its
   listing — the same shape item_draft_created uses.

   WHY THE EVENT CAN BE SKIPPED

   entity_kind='item' REQUIRES batch_item_id. Two imported listings predate
   batches and have none. One of them is 'rejected', which the RPC permits to
   resubmit — so this is a live path. If the insert were mandatory it would
   violate the CHECK and abort the whole transaction, and a dealer would be
   unable to submit because their audit row could not be shaped. A submission
   must never fail for want of a log entry. Where the accelerator context is
   absent the event is skipped; the attestation columns still record it.
   ════════════════════════════════════════════════════════════════════════ */

-- ── 1. Admit the new event type ────────────────────────────────────────
-- The existing CHECK is a closed enumeration of import-lifecycle types.
-- Extended, never replaced: every prior value is carried across verbatim.
ALTER TABLE public.dealer_accelerator_lifecycle_events
  DROP CONSTRAINT IF EXISTS dealer_accelerator_lifecycle_events_type_check;

ALTER TABLE public.dealer_accelerator_lifecycle_events
  ADD CONSTRAINT dealer_accelerator_lifecycle_events_type_check
  CHECK (event_type = ANY (ARRAY[
    'source_authorized', 'source_suspended', 'source_reauthorized',
    'source_revoked', 'source_item_registered', 'batch_created',
    'batch_started', 'batch_completed', 'batch_completed_with_exceptions',
    'batch_failed', 'batch_retry_queued', 'item_registered',
    'observation_recorded', 'item_readied', 'item_blocked', 'item_unblocked',
    'item_lease_claimed', 'item_lease_recovered', 'item_retry_scheduled',
    'item_retry_exhausted', 'payload_recorded', 'photograph_declared',
    'photograph_retrieved', 'photograph_retrieval_failed',
    'extraction_recorded', 'batch_cancel_requested', 'batch_cancelled',
    'batch_initialization_lease_claimed',
    'batch_initialization_lease_recovered', 'photograph_retrieval_terminal',
    'item_draft_created',
    -- new: the dealer's own submission of an imported draft
    'listing_submitted_for_review'
  ]::text[]));

-- ── 2. The event writer ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_dealer_submission_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_batch_item uuid;
BEGIN
  /* A dealer submitting their OWN listing. An admin or system transition
     into pending_review is not a dealer attestation and is not logged here
     as one. */
  IF v_caller IS NULL OR v_caller <> NEW.seller_id THEN
    RETURN NEW;
  END IF;

  /* Imported identity comes from trusted provenance, never from a caller
     claim — the same unforgeable marker the RPC and the workspace use. */
  IF NOT EXISTS (
    SELECT 1 FROM public.listing_media
     WHERE listing_id = NEW.id AND capture_source = 'dealer_import'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT bi.id INTO v_batch_item
    FROM public.dealer_accelerator_batch_items bi
   WHERE bi.listing_id = NEW.id
   ORDER BY bi.id
   LIMIT 1;

  /* No accelerator context to hang the event on. Skip it rather than abort
     a legitimate submission — see the header. */
  IF v_batch_item IS NULL THEN
    RETURN NEW;
  END IF;

  /* FAIL-OPEN, DELIBERATELY.

     This trigger sits on public.listings — every seller submission on the
     platform passes through it, not only dealer imports. An unhandled
     exception here would abort those transactions and take submission down
     for everyone, to protect an audit row.

     The same principle as the batch_item skip above, stated in code: a
     submission must never fail for want of a log entry. A missing event is
     recoverable from dealer_attested_at/_by/_fingerprint, which the RPC
     writes in this same transaction. A blocked submission is not
     recoverable — the dealer simply cannot sell. */
  BEGIN
  INSERT INTO public.dealer_accelerator_lifecycle_events (
    batch_item_id, dealer_profile_id, listing_id, entity_kind, event_type,
    prior_state, resulting_state, actor_kind, actor_user_id, metadata
  ) VALUES (
    v_batch_item, NEW.seller_id, NEW.id, 'item', 'listing_submitted_for_review',
    OLD.status, NEW.status, 'dealer', v_caller,
    /* What was attested, not merely that a submission happened.

       The fingerprint is the load-bearing field: a SHA-256 over the 14
       canonical frames, so it binds the actual payload the dealer confirmed.
       The six ceremony checkboxes are deliberately NOT stored — they are
       ephemeral by design, and at a successful submission they are
       structurally always all true, so recording them would preserve a
       constant rather than evidence. */
    jsonb_build_object(
      'availability',            NEW.details->>'availability',
      'attestation_fingerprint', NEW.dealer_attested_fingerprint,
      'fingerprint_version',     CASE WHEN NEW.asking_currency IS NULL
                                      THEN 'v1' ELSE 'v2' END,
      'ceremony',                'complete',
      'resubmission',            OLD.status = 'rejected'
    )
  );
  EXCEPTION WHEN OTHERS THEN
    /* Swallowed on purpose — see FAIL-OPEN above. The transition and the
       attestation stamp stand; only the history line is lost, and its
       absence is detectable by comparing dealer_attested_at against the
       events table. */
    NULL;
  END;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.log_dealer_submission_event() FROM PUBLIC, anon, authenticated, service_role;

-- ── 3. Fire it at exactly the proved transition ────────────────────────
DROP TRIGGER IF EXISTS listings_dealer_submission_event ON public.listings;

CREATE TRIGGER listings_dealer_submission_event
  AFTER UPDATE ON public.listings
  FOR EACH ROW
  WHEN (OLD.status IN ('draft', 'rejected') AND NEW.status = 'pending_review')
  EXECUTE FUNCTION public.log_dealer_submission_event();
