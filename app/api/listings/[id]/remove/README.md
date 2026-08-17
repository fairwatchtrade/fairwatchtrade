# Remove — listing lifecycle Stage 6 / 6A

## The misconception this file exists to kill

> **`purchase_requests.status = 'cancelled'` does not mean the buyer withdrew.**

It means the request closed. Two different people can cause that, and for one
release the product got it wrong in the most direct way possible: the buyer's
Catalogue printed **"You withdrew this offer."** under requests the *seller* had
closed by taking the watch off the market.

If you are about to write code that branches on `status === 'cancelled'`, you
almost certainly want `closure_cause` instead.

**Lifecycle state and closure attribution are two different facts.** The schema
now has room for both. Keep them apart.

## What Remove actually does

Remove is **not** delete. The listing stays the seller's, stays in their
workspace, and keeps every byte of its data. Only its public availability ends.

Permanent deletion is a separate governed purge (later stages) and is not
implemented here.

## Where the behaviour actually lives

This is the part that costs hours if you go looking in the wrong place.

| Behaviour | Where it lives | Not here |
| --- | --- | --- |
| A removed listing disappearing from Browse, search, saved searches, the public route, the Catalogue and the dealer room | the **RLS policy** `listings_select_public_or_own`, which already reads `status = 'published' OR own OR accepted-buyer` | no caller filters on status; there is no `.neq('status','removed')` anywhere and adding one would be a bug |
| An accepted buyer still seeing the listing after removal | the **third clause** of that same policy | not special-cased in any route |
| Why a client cannot just `UPDATE listings SET status='removed'` | the v2.21 **column-grant whitelist** plus `listings_update_own` (seller UPDATE restricted to draft/rejected) | not a route-level check |
| The seller-facing label "Removed" and its colour | `lib/listingStatus.ts` + the `--lc-removed-*` tokens in `app/globals.css` | not local maps in the components |

The consequence of row 1 is worth stating twice: **removal takes effect through
a predicate that already existed.** Nothing needs to remember a flag.

## The two-call sequence, and why it is two

```
1. remove_listing()                     — persists truth, rings nothing
2. emit_listing_removal_notifications() — reads what committed, rings
```

They are separate on purpose:

- a notification failure can never roll back a removal;
- a retried emission can never double-ring;
- a caller that crashed, lost its response, or double-submitted can simply call
  step 2 again.

**Exactly-once does not come from step 1's return value.** `remove_listing`
returns `closed_requests` (request ids + event ids) for confirmation copy and
observability *only*. The durable dedupe identity is:

```
notifications.dedupe_key = 'pr_closed:' || purchase_request_events.id
```

enforced by a partial unique index. The event row is committed state, so a
retry re-derives the same key and resolves to the notification that already
exists. Anything that treats the RPC's response as the source of exactly-once
behaviour has reintroduced the bug.

## Deliberately NOT built

- **Un-remove / relist.** There is no RPC for it. The seller UI says so plainly
  rather than implying it exists. Do not add a client-side status write to fake
  it — see the column-grant row above.
- **Cancelling ACCEPTED requests.** Removal never touches them. This is a
  judgement call, not an oversight: the alternative lets a seller quietly walk
  away from an agreed deal by pressing Remove. Stage 7 blocks permanent delete
  on a surviving accepted request.
- **Any transaction row.** No reason code writes to `transactions` — including
  `sold_in_store` and `sold_elsewhere`. A removal records why the watch left the
  market, never that FairWatchTrade sold it. Tax Time, sales metrics and
  Collector Impression eligibility are all downstream of `transactions` and are
  therefore untouched. The seller-facing dialog says this out loud because
  "Sold" in a marketplace UI reasonably implies the opposite.
- **Backfilled causes for historical closures.** A cancelled row is attributed
  only where a durable `buyer_withdrew` event proves it. Everything else keeps
  `closure_cause IS NULL` and renders as a neutral "Closed". Guessing would be
  the same defect this stage repaired, pointed backwards.
- **A removal entry in `listing_decision_events`.** That table's entire
  vocabulary is adjudication — approved/rejected by a reviewer. A seller taking
  their own watch off the market is not a decision about the listing's merit.

## Verify current state

```sql
-- Attribution vocabulary actually in force
SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conname IN ('purchase_requests_closure_cause_check',
                   'pre_event_type_check',
                   'listings_status_lifecycle');

-- Is anything still closing without a recorded cause?
SELECT closure_cause, count(*)
  FROM purchase_requests
 WHERE status = 'cancelled'
 GROUP BY 1 ORDER BY 2 DESC;

-- Dedupe guard present?
SELECT indexdef FROM pg_indexes WHERE indexname = 'notifications_dedupe_key_uniq';

-- Emission is idempotent: run twice on the same listing, the second returns 0
SELECT emit_listing_removal_notifications('<listing-id>');

-- Removals and what each one closed
SELECT l.id, l.removed_at, l.removal_reason_code,
       count(*) FILTER (WHERE pr.closure_cause = 'listing_removed_by_seller') AS closed,
       count(*) FILTER (WHERE pr.status = 'accepted')                         AS accepted_surviving
  FROM listings l
  LEFT JOIN purchase_requests pr ON pr.listing_id = l.id
 WHERE l.status = 'removed'
 GROUP BY l.id, l.removed_at, l.removal_reason_code
 ORDER BY l.removed_at DESC;
```

## Ordering trap

`purchase_requests.closure_cause` is **selected by client code** — the buyer's
Catalogue and the seller's Requests view both request the column. The migration
must therefore be applied **before** the code that reads it deploys, or both
queries fail. This lane has burned migration-ordering both directions before;
it is not symmetric and it is not forgiving.
