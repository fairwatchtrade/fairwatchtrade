/* ════════════════════════════════════════════════════════════════════════
   STAGE 7 — DELETE ELIGIBILITY. May this listing be permanently deleted yet?

   IT DOES NOT DELETE ANYTHING. Stage 7 answers one question truthfully and
   stops. Physical purge is Stage 8 and is separately authorised.

   THE THREE LAWS THIS FILE IS BUILT AROUND

   1 · SERVER-AUTHORITATIVE LIFECYCLE. Eligibility requires status='removed'
       and the SERVER enforces it. A client that calls this seam directly on
       a published or draft listing gets a named lifecycle blocker back, not
       an answer. Whether the seller can SEE a Delete control is UX; it is
       not the gate.

   2 · CURRENT-STATE EVIDENCE, NEVER STORED AUTHORITY. Nothing here writes an
       approval flag, token or "eligible" column that Stage 8 could later
       trust. There is deliberately nothing to persist and nothing to go
       stale. A clear answer means "currently eligible" — Purchase Requests,
       transactions and workflow state can all change one second afterwards.
       ⚠ STAGE 8 MUST RE-EVALUATE THESE SAME RULES INSIDE ITS OWN DESTRUCTIVE
       TRANSACTION AND LOCK, IMMEDIATELY BEFORE DELETING. A Stage 7 all-clear
       is not permission. That is the whole TOCTOU boundary.

   3 · READ-ONLY, AND THE DATABASE ENFORCES IT. The function is declared
       STABLE, so Postgres itself refuses any INSERT/UPDATE/DELETE inside it —
       "UPDATE is not allowed in a non-volatile function". This is not a
       promise in a comment, it is a constraint the engine applies. The seam
       can be called repeatedly by seller and admin without changing reality.

   BLOCKERS ARE DERIVED FROM MACHINERY THAT ACTUALLY EXISTS

   Measured against production schema before writing, not assumed from the
   category names in the order:

     purchase_requests.status ....... pending | accepted | declined |
                                      expired | cancelled | superseded
                                      → REAL. pending and accepted are
                                        non-terminal and block.
     transactions.status ............ pending | payment_pending | paid |
                                      shipped | delivered | under_inspection |
                                      completed | cancelled | disputed |
                                      refunded
                                      → REAL. Everything except completed /
                                        cancelled / refunded blocks. 'disputed'
                                        is where a real dispute hold lives.
     mobile_wizard_sessions.status .. active | completed | expired
                                      → REAL. An active capture session is
                                        in-flight work deletion would break.

   ⚠ THREE CLASSES IN THE ORDER ARE DELIBERATELY NOT IMPLEMENTED, because
   inventing a blocker is as wrong as missing one:

     identity_resolution_case — has NO status, resolved_at or state column of
       any kind (id, subject_type, listing_id, auction_lot_id, created_at,
       plus the Stage 1 identity snapshot). There is no "unresolved" state to
       test. Stage 1's header already flagged that the resolution RESULT lives
       somewhere the schema cannot honestly name. A blocker here would be
       fiction.

     dealer_accelerator_batch_items — its own CHECK constraint forces
       listing_id IS NULL unless status='draft_created', which is the item's
       TERMINAL state with its lease released. So the only rows that can point
       at a listing are finished ones. Active accelerator work is structurally
       incapable of referencing a listing, and the order explicitly forbids
       treating durable history as a blocker.

     legal / retention hold — no such table or column exists. The order
       forbids inventing one. Real disputes surface through
       transactions.status='disputed', which IS implemented.

   listing_integrity_reviews (the Aubrey Check) was considered and excluded:
   its evidence was deliberately detached from listings at Stage 5 and carries
   its own subject identity, so it survives deletion by design rather than
   preventing it.

   PFC274 = 62 — app/api/evaluate/route.ts is untouched.
   ════════════════════════════════════════════════════════════════════════ */

CREATE OR REPLACE FUNCTION public.listing_delete_eligibility(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE                     -- read-only, enforced by the engine (law 3)
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller   uuid := auth.uid();
  v_listing  public.listings%ROWTYPE;
  v_blockers jsonb := '[]'::jsonb;
  v_accepted int;
  v_pending  int;
  v_txn      int;
  v_txn_states text;
  v_wizard   int;
BEGIN
  SELECT * INTO v_listing FROM public.listings WHERE id = p_listing_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  /* Ownership. A signed-in caller must be the seller; anyone else gets
     not_found rather than not_allowed, so the seam cannot be used to probe
     whether another seller's listing exists.

     auth.uid() IS NULL means service_role — the founder's admin surface
     reads through it exactly as the rest of /admin does. anon cannot reach
     this branch because EXECUTE is revoked from anon below. */
  IF v_caller IS NOT NULL AND v_listing.seller_id <> v_caller THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  /* ── Lifecycle prerequisite, enforced HERE and not in the UI ──────────
     Only a Removed listing is a candidate. Every other state is reported as
     a named blocker rather than an error, so both surfaces can explain it. */
  IF v_listing.status <> 'removed' THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code',           'not_removed',
      'current_status', v_listing.status
    );
  END IF;

  /* ── Purchase Requests ────────────────────────────────────────────────
     accepted is the one the product already promised would survive Remove
     and block permanent Delete — a live obligation between two people.

     pending is included defensively. remove_listing() closes every pending
     request on the way through, so a Removed listing should never carry one;
     if it somehow does, that is precisely the state where deleting would be
     unsafe, and eligibility must not be the place that assumes an invariant
     rather than checking it. */
  SELECT count(*) FILTER (WHERE status = 'accepted'),
         count(*) FILTER (WHERE status = 'pending')
    INTO v_accepted, v_pending
    FROM public.purchase_requests
   WHERE listing_id = p_listing_id;

  IF v_accepted > 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'accepted_purchase_request', 'count', v_accepted);
  END IF;

  IF v_pending > 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'pending_purchase_request', 'count', v_pending);
  END IF;

  /* ── Transactions ─────────────────────────────────────────────────────
     completed / cancelled / refunded are settled: those rows carry their own
     watch identity from Stage 1 and were detached from listings at Stage 5,
     so they outlive the listing intact and do not need it. Everything else —
     including disputed — is money or goods still in motion. */
  SELECT count(*), string_agg(DISTINCT status, ', ' ORDER BY status)
    INTO v_txn, v_txn_states
    FROM public.transactions
   WHERE listing_id = p_listing_id
     AND status NOT IN ('completed', 'cancelled', 'refunded');

  IF v_txn > 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'active_transaction', 'count', v_txn, 'states', v_txn_states);
  END IF;

  /* ── In-flight capture work ───────────────────────────────────────────
     An active guided-capture session against this listing is work someone is
     in the middle of. completed and expired sessions are finished. */
  SELECT count(*) INTO v_wizard
    FROM public.mobile_wizard_sessions
   WHERE listing_id = p_listing_id AND status = 'active';

  IF v_wizard > 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'active_wizard_session', 'count', v_wizard);
  END IF;

  RETURN jsonb_build_object(
    'listing_id',                    p_listing_id,
    'public_code',                   v_listing.public_code,
    'lifecycle_state',               v_listing.status,
    'removal_reason_code',           v_listing.removal_reason_code,
    'eligible_for_permanent_delete', jsonb_array_length(v_blockers) = 0,
    'blockers',                      v_blockers,
    /* Stamped so a stale answer is visibly stale. It is NOT an authorisation
       timestamp and confers nothing on Stage 8. */
    'evaluated_at',                  now()
  );
END $function$;

REVOKE ALL ON FUNCTION public.listing_delete_eligibility(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.listing_delete_eligibility(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.listing_delete_eligibility(uuid) IS
  'Stage 7. Answers whether a listing may CURRENTLY be permanently deleted, and why not. Read-only and STABLE (the engine refuses writes inside it), repeatable, side-effect free. Requires status=removed server-side. Returns structured blocker codes: not_removed, accepted_purchase_request, pending_purchase_request, active_transaction, active_wizard_session. DELETES NOTHING and stores no approval — Stage 8 must re-evaluate under its own lock immediately before destroying anything. Non-owners receive not_found; service_role reads for the admin surface. PFC274 = 62.';
