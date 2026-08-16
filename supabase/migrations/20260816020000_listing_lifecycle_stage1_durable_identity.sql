/* ════════════════════════════════════════════════════════════════════════
   LISTING LIFECYCLE — STAGE 1 of the governed Remove / Delete rollout
   ADDITIVE ONLY. Nothing is deleted, no FK is changed, no constraint relaxed.

   Governing order: FWT_Seller_Listing_Remove_True_Delete_Purge_2026-08-16_FINAL
   Evidence base:   FWT_LISTING_DELETE_19FK_EVIDENCE_INVENTORY_2026-08-16

   THE LAW THIS IMPLEMENTS

     Preservation does not propagate. A durable mechanism does not make every
     object it touches durable. If a record is intended to outlive a listing,
     it must have its own retention purpose AND remain meaningful without the
     live listing row.

   WHY THIS MIGRATION EXISTS AND WHY IT IS FIRST

   §18 fixes the rollout order, and the reason is not ceremony. Of the 19
   dependents on listings.id, exactly ONE (purchase_requests) can say which
   watch it concerned without the listing row. Every other durable record —
   adjudication history, Aubrey evidence, money-truth events, dealer lifecycle
   events, strikes — would survive a purge as an orphan that cannot name its
   own subject.

   So identity comes FIRST, backfill second, and only then may a foreign key
   be relaxed. Relaxing a constraint before the data it protects is
   independently meaningful is how a purge becomes data loss.

   THE SHAPE IS NOT INVENTED

   Two precedents already exist in this codebase and §5 says to use them:

     · purchase_requests (v2.27) snapshots listing_brand / listing_model /
       listing_reference at write time. Every live row carries them.
     · dealer_accelerator_lifecycle_events (v5.12) carries its own attested
       facts and fingerprint in metadata, so the event is history that stands
       alone while the row holds only current state.

   The column names below are purchase_requests' names, deliberately. A third
   naming convention would be a third thing to remember.

   WHAT IS DELIBERATELY *NOT* SNAPSHOTTED

   Not the gallery, description, Quick Specs payload, details blob, seller
   marketing text, layout, search payload or wizard state. §5 forbids copying
   the listing into history merely to escape a foreign key. Brand, model and
   reference answer "which watch" — that is the whole job.

   listing_id is NOT duplicated into a new "historical uuid" column. It is
   already a uuid on every one of these tables; at Stage 5 the FK CONSTRAINT
   is dropped where the record must outlive the listing, and the column keeps
   the value as historical identity. Detach the constraint, keep the fact.

   ⚠ ONE TABLE IS DELIBERATELY LEFT INCOMPLETE — identity_resolution_case.
   §4.4 requires snapshotting "the durable Vault identity result". That table
   has columns id, subject_type, listing_id, auction_lot_id, created_at and
   nothing else — there is no resolution-result column in it at all, so the
   result lives somewhere this migration cannot honestly name. Subject
   identity is added below; the RESULT snapshot is NOT invented. Resolving
   where the result lives is a Stage 3 prerequisite, and Stage 3 must stop
   with exact row ids rather than guess (§13).
   ════════════════════════════════════════════════════════════════════════ */

-- ── 1. Durable subject identity on records that must outlive the listing ──
-- Nullable on purpose: existing rows are backfilled in Stage 3, and NOT NULL
-- cannot be asserted until that backfill is proven (§13). Making these NOT
-- NULL now would break every current write path instead of protecting data.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS listing_brand     text,
  ADD COLUMN IF NOT EXISTS listing_model     text,
  ADD COLUMN IF NOT EXISTS listing_reference text;

COMMENT ON COLUMN public.transactions.listing_brand IS
  'Immutable watch identity captured at write time so a completed sale can say which watch it was without the listing row. §4.2: indirect identity via purchase_request_id is evidence, not the desired dependency for a financial record.';

ALTER TABLE public.listing_decision_events
  ADD COLUMN IF NOT EXISTS listing_brand     text,
  ADD COLUMN IF NOT EXISTS listing_model     text,
  ADD COLUMN IF NOT EXISTS listing_reference text;

ALTER TABLE public.listing_currency_events
  ADD COLUMN IF NOT EXISTS listing_brand     text,
  ADD COLUMN IF NOT EXISTS listing_model     text,
  ADD COLUMN IF NOT EXISTS listing_reference text;

ALTER TABLE public.dealer_accelerator_lifecycle_events
  ADD COLUMN IF NOT EXISTS listing_brand     text,
  ADD COLUMN IF NOT EXISTS listing_model     text,
  ADD COLUMN IF NOT EXISTS listing_reference text;

ALTER TABLE public.listing_integrity_evidence
  ADD COLUMN IF NOT EXISTS listing_brand     text,
  ADD COLUMN IF NOT EXISTS listing_model     text,
  ADD COLUMN IF NOT EXISTS listing_reference text;

ALTER TABLE public.listing_integrity_reviews
  ADD COLUMN IF NOT EXISTS listing_brand     text,
  ADD COLUMN IF NOT EXISTS listing_model     text,
  ADD COLUMN IF NOT EXISTS listing_reference text;

ALTER TABLE public.strikes
  ADD COLUMN IF NOT EXISTS listing_brand     text,
  ADD COLUMN IF NOT EXISTS listing_model     text,
  ADD COLUMN IF NOT EXISTS listing_reference text;

-- Subject identity only. The Vault RESULT snapshot is NOT added — see header.
ALTER TABLE public.identity_resolution_case
  ADD COLUMN IF NOT EXISTS listing_brand     text,
  ADD COLUMN IF NOT EXISTS listing_model     text,
  ADD COLUMN IF NOT EXISTS listing_reference text;

-- ── 2. The message_threads trap (§14) ──────────────────────────────────
/* Under two-homes semantics a NULL listing_id MEANS "dealer relationship
   conversation". So SET NULL on listing deletion does not orphan a watch
   conversation — it RECLASSIFIES it. The thread does not go missing; it
   silently becomes a different kind of thread.

   thread_kind makes the classification a stored fact rather than something
   inferred from whether a foreign key survived. A watch conversation stays a
   watch conversation after its listing is gone.

   Measured note: the live sample's `subject` already carried full identity
   ("Parmigiani Fleurier Tonda Metrographe · Ref. PFC274-0000600-HC3142"), so
   the human-readable half already survives. ⚠ Sample size was 1 — Stage 2
   must verify the write path before anything relies on subject being
   populated (§14).

   Default 'listing' is NOT applied blindly: it is correct only for threads
   that currently have a listing_id, and Stage 3 backfills accordingly. The
   column stays nullable until that runs, so an unclassified thread is
   visible as unclassified rather than silently mislabelled. */
ALTER TABLE public.message_threads
  ADD COLUMN IF NOT EXISTS thread_kind text;

ALTER TABLE public.message_threads
  DROP CONSTRAINT IF EXISTS message_threads_thread_kind_check;
ALTER TABLE public.message_threads
  ADD CONSTRAINT message_threads_thread_kind_check
  CHECK (thread_kind IS NULL OR thread_kind = ANY (ARRAY['listing', 'dealer']));

COMMENT ON COLUMN public.message_threads.thread_kind IS
  'Which home this conversation belongs to, stored independently of listing_id. A watch thread must remain a watch thread after its listing is deleted; classification must never derive from FK nullness (§14).';

-- ── 3. The Removed state (§1A, §6) ─────────────────────────────────────
/* Removed is a LIVE seller-visible state, not a graveyard. §1 forbids a
   permanent seller_deleted_at resting place; this is the opposite — the
   listing is still the seller's, still in their workspace, simply off the
   market and eligible to become permanently deletable later.

   Extending the status CHECK is what makes Remove work through the EXISTING
   public predicate rather than bolting a filter onto every read path. The
   RLS policy listings_select_public_or_own already reads
   `status = 'published' OR own OR accepted-buyer`, so a removed listing stops
   being public the instant the status changes — Browse, search, saved
   searches, the public route and the dealer room all inherit it at once.
   §15's requirement is met by the predicate that already exists, not by
   nineteen callers each remembering a flag. */
ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_status_lifecycle;
ALTER TABLE public.listings
  ADD CONSTRAINT listings_status_lifecycle
  CHECK (status = ANY (ARRAY[
    'draft', 'pending_review', 'published', 'rejected', 'reserved',
    'removed'
  ]));

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS removed_at          timestamptz,
  ADD COLUMN IF NOT EXISTS removal_reason_code text,
  ADD COLUMN IF NOT EXISTS removal_reason_note text;

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_removal_reason_code_check;
ALTER TABLE public.listings
  ADD CONSTRAINT listings_removal_reason_code_check
  CHECK (removal_reason_code IS NULL OR removal_reason_code = ANY (ARRAY[
    'sold_in_store', 'sold_elsewhere', 'no_longer_for_sale',
    'listing_mistake', 'other'
  ]));

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_removal_reason_note_len;
ALTER TABLE public.listings
  ADD CONSTRAINT listings_removal_reason_note_len
  CHECK (removal_reason_note IS NULL OR char_length(removal_reason_note) <= 320);

/* ⚠ NO UPDATE GRANT is issued for these columns. v2.21 revoked table-level
   UPDATE on listings from authenticated and granted an explicit whitelist of
   commercial-truth columns, so a new column arrives unwritable by any client
   session. Remove must therefore go through a SECURITY DEFINER RPC — which is
   also required because listings_update_own restricts seller UPDATE to
   draft/rejected and a published listing could not be moved otherwise. Same
   door submit_listing_for_review uses. That RPC is Stage 6, not this file. */

COMMENT ON COLUMN public.listings.removed_at IS
  'When the seller took this watch off the market. Removed is a live state, never a graveyard — permanent deletion physically removes the row (§1B).';

-- ── 4. Deletion tombstone (§10) — minimal, and bounded by CHECK ────────
/* Allowed only for deletion audit, idempotency, original-UUID history and
   hold bookkeeping. It must never become a shadow copy of the listing, so
   the columns it does NOT have are the point: no photos, no description, no
   specs, no details payload, no addenda, no wizard state.

   Subject identity is limited to the same three fields every other durable
   record gets, for the same reason: a deletion record that cannot say which
   watch was deleted is not an audit record. */
CREATE TABLE IF NOT EXISTS public.listing_deletion_tombstone (
  listing_id          uuid PRIMARY KEY,
  public_code         text,
  seller_id           uuid NOT NULL,
  listing_brand       text,
  listing_model       text,
  listing_reference   text,
  removal_reason_code text,
  deleted_at          timestamptz NOT NULL DEFAULT now(),
  purge_event_id      uuid,
  hold_marker         text
);

COMMENT ON TABLE public.listing_deletion_tombstone IS
  'Minimal proof that a listing was purged: which listing, whose, when, why, and under which purge transaction. Deliberately NOT a listing archive (§10) — no photos, description, specs, details, addenda or wizard state may ever be added here.';

ALTER TABLE public.listing_deletion_tombstone ENABLE ROW LEVEL SECURITY;

/* No policies are created. With RLS enabled and no policy, no client session
   can read or write it; only SECURITY DEFINER functions (the Stage 9 purge
   RPC) reach it. A deletion audit that the deleter can edit is not an audit. */

REVOKE ALL ON TABLE public.listing_deletion_tombstone FROM PUBLIC, anon, authenticated;

/* Deliberately NO foreign key to listings. The whole purpose of this row is
   to outlive the listing; an FK would make it impossible to write at exactly
   the moment it becomes true. */

-- PFC274 = 62 — app/api/evaluate/route.ts is untouched.
