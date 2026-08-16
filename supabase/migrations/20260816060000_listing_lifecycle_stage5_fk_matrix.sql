/* ════════════════════════════════════════════════════════════════════════
   LISTING LIFECYCLE — STAGE 5: the foreign-key matrix

   Authorized by Jason against the v5.24/v5.25 seam packet and the v5.26
   Purchase Request bridge. This is the first stage that changes deletion
   behaviour, and it changes it deliberately, row by row.

   NOT a CASCADE sweep. Each of the 19 dependencies is treated according to
   the classification proven in the evidence inventory:

     · records with an independently justified durable purpose LOSE THE
       CONSTRAINT but keep listing_id as historical identity — the value
       survives, only the requirement that the listing still exist goes;
     · listing-scoped residue is set to CASCADE so it dies with the listing;
     · two rows keep SET NULL because a null there is meaningful, not lossy.

   WHY DROPPING A CONSTRAINT IS NOT THE SAME AS LOSING THE LINK

   listing_id remains a uuid column on every durable table. After the FK is
   dropped it still records which listing the row concerned; it simply stops
   demanding that the listing be present. Combined with the brand/reference
   snapshots from Stages 1-3, each of these records can now answer "which
   watch" entirely on its own. That is the whole precondition for purge, and
   it was proven 0/0/0/0 before this file was written.

   ⚠ WHAT THIS MIGRATION DOES NOT DO

   It does not delete anything, does not create the purge RPC, and does not
   touch media. After it runs, a listing with dependents is still not
   deletable by any application role — DELETE and TRUNCATE remain revoked
   from anon, authenticated and service_role. This changes what WOULD happen
   at deletion; it does not enable deletion.
   ════════════════════════════════════════════════════════════════════════ */

-- ── A. Durable records: drop the constraint, keep the history ──────────
/* Each of these carries listing_brand/listing_model/listing_reference,
   backfilled and enforced fail-closed. They no longer need the listing row
   to be intelligible, and they must not be destroyed with it. */

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_listing_id_fkey;            -- was NO ACTION

ALTER TABLE public.listing_decision_events
  DROP CONSTRAINT IF EXISTS lde_listing_fk;                          -- was CASCADE (!)

ALTER TABLE public.listing_currency_events
  DROP CONSTRAINT IF EXISTS lce_listing_fk;                          -- was RESTRICT

ALTER TABLE public.dealer_accelerator_lifecycle_events
  DROP CONSTRAINT IF EXISTS dealer_accelerator_lifecycle_events_listing_fk;  -- was RESTRICT

ALTER TABLE public.listing_integrity_evidence
  DROP CONSTRAINT IF EXISTS listing_integrity_evidence_listing_id_fkey;      -- was CASCADE (!)

ALTER TABLE public.listing_integrity_reviews
  DROP CONSTRAINT IF EXISTS listing_integrity_reviews_listing_id_fkey;       -- was CASCADE (!)

ALTER TABLE public.strikes
  DROP CONSTRAINT IF EXISTS strikes_listing_id_fkey;                 -- was SET NULL

ALTER TABLE public.identity_resolution_case
  DROP CONSTRAINT IF EXISTS irc_listing_fk;                          -- was RESTRICT

/* The three marked (!) are the inversion the evidence inventory found: the
   adjudication history and the entire Aubrey Check evidence and review trail
   were configured to be DESTROYED with the listing, while operational
   bookkeeping blocked deletion. That is now corrected. */

-- ── B. purchase_requests: the reviewed SET NULL treatment ──────────────
/* Reviewed and ruled: SET NULL rather than DROP. listing_id is nullable
   (verified), so this is legal. Keeping the constraint preserves PostgREST
   relationship inference while a listing exists — which two live surfaces
   use for imagery — and lets a terminal request outlive it.

   v5.25/v5.26 made both surfaces snapshot-first, so a null here costs the
   photograph and nothing else. Nonterminal requests remain purge blockers,
   so this only ever fires once the relationship is genuinely finished. */
ALTER TABLE public.purchase_requests
  DROP CONSTRAINT IF EXISTS purchase_requests_listing_id_fkey;
ALTER TABLE public.purchase_requests
  ADD CONSTRAINT purchase_requests_listing_id_fkey
  FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;

-- ── C. Listing-scoped residue: die with the listing ────────────────────
/* These have no independent product meaning once the listing is permanently
   gone, and must not keep a dead listing alive. */

ALTER TABLE public.listing_drafts
  DROP CONSTRAINT IF EXISTS listing_drafts_listing_id_fkey;          -- was NO ACTION
ALTER TABLE public.listing_drafts
  ADD CONSTRAINT listing_drafts_listing_id_fkey
  FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;

/* Operational work item. A completed batch item must never be the reason a
   listing cannot be deleted; an ACTIVE lease is a purge BLOCKER enforced by
   the Stage 7 eligibility check, which is a policy question, not an FK one. */
ALTER TABLE public.dealer_accelerator_batch_items
  DROP CONSTRAINT IF EXISTS dealer_accelerator_batch_items_listing_fk;  -- was RESTRICT
ALTER TABLE public.dealer_accelerator_batch_items
  ADD CONSTRAINT dealer_accelerator_batch_items_listing_fk
  FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;

/* Already CASCADE and correct — listed for the record, not altered:
     listing_addenda, listing_collector_dossiers, listing_media,
     mobile_wizard_sessions, saved_search_matches, saved_watches.
   listing_collector_dossiers is the ATTACHMENT only; the dossier itself and
   its five sibling tables carry zero FKs to listings and survive untouched.
   listing_media stays CASCADE deliberately: media dies with the listing, and
   the Stage 9 purge preserves the required hashes BEFORE removing it. */

-- ── D. Kept at SET NULL, because null is meaningful here ───────────────
/* message_threads: ⚠ CHANGED FROM THE PROPOSED MATRIX, on evidence.
   The proposal was to drop this FK. The messages API does NOT use PostgREST
   embedding — it performs a manual lookup
   (`from("listings").select(...).in("id", listingIds)`) and joins in JS. A
   dropped FK would therefore leave listing_id holding a uuid pointing at a
   row that no longer exists, and that lookup would silently return nothing
   for a thread that still claims a listing.

   SET NULL is both safer and sufficient: thread_kind (Stage 1) now carries
   the classification independently, so a watch conversation remains a watch
   conversation, and `subject` retains human-readable identity. Null here
   means "the listing is gone", not "this is a dealer thread" — which is
   exactly the trap §14 exists to close, now closed by data rather than by
   the FK. Same reasoning Layout applied to purchase_requests.

   notifications: unchanged. Losing the click-through target is convenience
   loss; the message text stands on its own. */
-- (no statement — both already SET NULL and deliberately left alone)

-- PFC274 = 62 — app/api/evaluate/route.ts is untouched.
