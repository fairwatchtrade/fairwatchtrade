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

## Pause and Delete are siblings, not stages

> **Pause** = *"keep the listing, stop selling it for now."*
> **Delete** = *"I'm finished with this listing permanently."*
>
> **Neither is a prerequisite for the other.**

Jason's own framing is the clearest test:

- *"I can't find the damn watch in my safe right now"* → **Pause**
- *"Sold it, shipped it, done. Delete the fucker."* → **Delete**

A seller may Pause today and Delete months later, or go straight from
published to Delete and never Pause at all.

⚠ **Stage 7 originally required `status = 'removed'` before Delete.** That was
a sensible-looking safety rule and it was backwards: it forced a seller to
know FairWatchTrade's internal lifecycle before they could find the action
they arrived for. A dealer who had just shipped a watch would look for
Delete, find nothing, and be told why by no one. The prerequisite is gone.

**The safety property was never the status word — it is the obligations.** A
`reserved` listing was never dangerous because it said "reserved"; it was
dangerous because of the accepted purchase request that made it reserved, and
that request blocks on its own merits in any state.

### Vocabulary: product vs database

| Seller sees | Database stores |
| --- | --- |
| Pause Listing / **Paused** | `status = 'removed'`, `remove_listing()`, `removed_at`, `removal_reason_code` |
| — | `closure_cause = 'listing_removed_by_seller'` |

The internal names stay by ruling. **Do not undertake a schema-renaming
exercise** — it would rewrite durable history for a label.

### Pause takes no reason

Every reason in the governed set — *sold in my store*, *sold on another
website*, *listing mistake / duplicate* — describes a watch leaving **for
good**. They existed because Remove was once the only exit, so the reason
field was carrying a question that belongs to the irreversible action.

The vocabulary is not deleted, it is **waiting**: Delete inherits it when
Stage 8 builds the final confirmation.

⚠ **History is preserved, not rewritten.** `p_reason_code` is now *optional*,
never forbidden. `z99216` really was taken down under the older Remove
semantics carrying `sold_in_store`, and both the seller panel and the admin
panel still display a stored reason where one exists — labelled *"Reason
recorded"*, because it is history rather than something this action asks for.

⚠ **The NULL trap, again.** The old guard used
`coalesce(p_reason_code,'') NOT IN (...)` because a bare `NULL NOT IN (...)`
evaluates to NULL rather than true. Now that NULL is legal the guard must
short-circuit on it — `p_reason_code IS NOT NULL AND p_reason_code NOT IN
(...)`. The coalesce form would have rejected every reasonless Pause.

### What a future Delete must not do

**Purge directly.** It must not fabricate a Pause event, invent a removal
reason, or pretend the seller chose Pause on the way past. A published
listing disappears from the market *because it was deleted*, not because
something secretly paused it first — and there is no half-deleted window,
because the row physically stops existing.

## Stage 7 — delete eligibility (it does not delete)

> **`listing_delete_eligibility(uuid)` answers one question and stops:
> *may this listing be permanently deleted yet?*** It destroys nothing.

Three properties, and each is enforced rather than promised:

| Property | How it is enforced |
| --- | --- |
| **Server-authoritative** | The function requires `status = 'removed'` itself. A client calling it on a published or draft listing gets a `not_removed` blocker back. Whether a Delete control is *visible* is UX, not the gate. |
| **Read-only** | Declared `STABLE`, so **Postgres refuses** `INSERT`/`UPDATE`/`DELETE` inside it — *"UPDATE is not allowed in a non-volatile function"*. Verified empirically at 84 calls across every listing: zero rows changed anywhere. |
| **Not an authorisation** | Nothing is stored. There is no `eligible_for_permanent_delete` column, no token, no approval row. Deliberately nothing to go stale. |

### ⚠ The TOCTOU boundary — the most important line in this file

A Stage 7 all-clear is **evidence, not permission**. Purchase requests,
transactions and workflow state can all change one second after the read.

**Stage 8 must re-evaluate these same rules inside its own destructive
transaction and lock, immediately before deleting.** A purge that trusts an
earlier eligibility result is the bug this design exists to prevent.

The result says *currently* eligible. It never says it will still be true.

### Blocker sources — and the three that are deliberately absent

Implemented, because the machinery genuinely exists:

| Code | Source | Blocks on |
| --- | --- | --- |
| `not_removed` | `listings.status` | anything other than `removed` |
| `accepted_purchase_request` | `purchase_requests.status` | `accepted` — the live obligation that survives Remove |
| `pending_purchase_request` | `purchase_requests.status` | `pending` — defensive; `remove_listing` closes these, so its presence means an invariant broke |
| `active_transaction` | `transactions.status` | everything except `completed`, `cancelled`, `refunded`. `disputed` is where a real dispute hold lives |
| `active_wizard_session` | `mobile_wizard_sessions.status` | `active` |

**Not implemented, and this is a decision rather than an omission:**

- **`identity_resolution_case`** has no `status`, `state` or `resolved_at`
  column *at all*. There is no unresolved state to test. Stage 1 already
  flagged that the resolution *result* lives somewhere the schema cannot
  honestly name. A blocker here would be fiction.
- **`dealer_accelerator_batch_items`** — its own CHECK forces
  `listing_id IS NULL` unless `status = 'draft_created'`, which is the
  item's *terminal* state with its lease released. Active accelerator work
  is structurally incapable of referencing a listing.
- **Legal / retention hold** — no such table or column exists anywhere.
  Real disputes surface as `transactions.status = 'disputed'`.

`listing_integrity_reviews` (the Aubrey Check) was considered and excluded:
its evidence was detached from `listings` at Stage 5 and carries its own
subject identity, so it *survives* deletion by design rather than preventing
it.

### Consumers — one seam, two surfaces

- **Seller** — `components/DeleteListingDialog.tsx`, opened from the Removed
  listing's rail. Renders blockers or the consequences review.
- **Admin** — the Lifecycle panel on `/admin/listings/[id]`, read through the
  service client (the function admits it because `auth.uid()` is null there).

Neither evaluates a blocker itself. `lib/listingDeleteEligibility.ts` turns
codes into sentences and nothing more. **If the two surfaces ever disagree,
one of them has started computing locally — that is the defect, not a
wording drift.**

### What deletion is designed to take, and what it cannot

This is the Stage 5 boundary made visible, and the seller review says it in
plain words:

- **Dies with the listing** — the row itself and everything owned only by it.
  These still hold a foreign key: `listing_media`, `listing_addenda`,
  `listing_drafts`, `saved_watches`, `saved_search_matches`,
  `listing_collector_dossiers`, `message_threads`, `notifications`,
  `mobile_wizard_sessions`, `purchase_requests`,
  `dealer_accelerator_batch_items`.
- **Outlives it** — records detached at Stage 5, each carrying its own
  brand/model/reference snapshot: `transactions`,
  `listing_decision_events`, `listing_currency_events`,
  `listing_integrity_evidence`, `listing_integrity_reviews`, `strikes`,
  `identity_resolution_case`, `dealer_accelerator_lifecycle_events`,
  `listing_deletion_tombstone`.

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
