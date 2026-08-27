# Remove, Restore, Delete — and who is allowed to say which one happened

This folder is the room's mutation surface. The three verbs below are **not**
interchangeable and the difference between them is the whole design.

## The misconception this file exists to kill

> "Remove and Delete are the same operation with different force."

No. They are different promises.

| Verb | Meaning | Reversible? | Who may execute |
| --- | --- | --- | --- |
| **Remove** | off the market, row intact | **Yes** — `restore_listing()` | seller, founder, Assistant (confirmed) |
| **Restore** | back into the market *pipeline* | n/a | seller, founder |
| **Delete** | irreversible physical purge | **No** | seller, founder — never the Assistant |

Before v6.89 that table was a lie in one cell: Remove claimed to be reversible
and had **no inverse anywhere in the product**. `remove_listing()` drove a
listing to `removed`, raised `already_removed` on a second call, and no other
governed path wrote that column. The row survived; the listing did not. That is
why v6.89 repaired the primitive *before* the Assistant was allowed near the
verb — exposing a one-way Remove behind a confirmation dialog would have made
the Assistant the most convenient way to destroy something quietly.

## Restore returns a listing to the pipeline, never to the market

`restore_listing()` sets **`pending_review`** and nothing else. It never sets
`published`.

That is not caution, it is the publication gate: `lib/listingPublicationGate`
requires prior status `pending_review` **plus** an explicitly recorded founder
approval. Restoring to the listing's *prior* status would have put a formerly
published watch straight back on Browse with no adjudication — a second
publication writer, which is exactly the defect v6.34 removed. One canonical
restore state is what keeps publication a decision.

The constraint enforces it rather than trusting the code:
`lle_type_matches_state_check` allows a `RESTORED` lifecycle event only with
`resulting_status in ('draft','pending_review')`. A restore that claimed to
reach `published` cannot be written down.

## What Restore deliberately does NOT undo

Removing cancels the listing's **pending** purchase requests and notifies those
buyers. Restore leaves them cancelled.

Re-creating them would be the platform inventing buyer intent nobody expressed.
The preview says this before the founder confirms, and `restore_listing()`
returns `requests_left_cancelled` so the surface can state it afterwards
instead of letting the seller discover it. Accepted requests are never
cancelled by a removal at all — they are live obligations and survive it.

## Where the behaviour actually lives (the non-obvious parts)

- **One core, two entry points.** `remove_listing_core()` holds the entire
  implementation. `remove_listing()` calls it with `'direct'`;
  `remove_listing_assistant()` calls it with `'assistant'`. Both literals are
  hardcoded in their wrapper. There is no third caller and no parameter that
  selects between them.
- **The grant is the security property.** `remove_listing_assistant()` has
  EXECUTE granted to **`service_role` only**. A browser carrying the founder's
  own session authenticates as `authenticated` and cannot invoke it, whatever
  it puts in its body. That — not validation — is what makes
  `executed_via = 'assistant'` unforgeable. `remove_listing_core()` is granted
  to nobody and is reachable only through the two wrappers, which run as its
  owner.
- **Provenance reaches the trigger through transaction-local settings.**
  `listing_lifecycle_events` is produced exclusively by a trigger (Round 17),
  so the RPC cannot pass it arguments directly. The core publishes
  `fwt.authorized_by` / `fwt.executed_via` / `fwt.machinery` with
  `set_config(..., true)` before the UPDATE, and the producer reads them with
  `current_setting(..., true)`. Transaction-local scope matters: the values die
  with the transaction and cannot leak across a pooled connection. A client
  cannot set them — PostgREST executes no arbitrary SQL.
- **NULL attribution is honest, not missing.** Unlike
  `listing_decision_events` (one writer, so `DEFAULT 'direct'` was a fact this
  table can answer), the lifecycle producer stands under *every* writer of
  `listings.status`. Most declare no provenance, so their rows carry NULL. No
  backfill, ever.
- **`RESTORED` needs its own trigger.** The existing producer serves INSERT as
  well as UPDATE, and PostgreSQL forbids `OLD` in an INSERT `WHEN` clause. A
  restore is identified by where it came *from*, so it needs `OLD` and
  therefore an UPDATE-only trigger of its own.

## Delete eligibility now agrees with what Delete actually does

Three foreign keys into `listings` are `ON DELETE RESTRICT`:

```
trade_deal_legs.listing_id
trade_offers.target_listing_id
trade_offers.offered_listing_id
```

`listing_delete_eligibility()` used to check trade **deals** by status and
never looked at `trade_offers` at all. A listing carrying any trade-offer row
was reported **deletable**, and the physical delete then failed at the FK.
Governed eligibility owes the founder the refusal *before* the destructive
call, not a raw database error after it.

Both listing roles are checked — a listing can be blocked as the watch that was
wanted (`target`) or as the watch offered for it (`offered`). Checking one
column would be half a truth.

Blocker codes, and why they differ:

| Code | Why it blocks |
| --- | --- |
| `accepted_trade_offer` | the offer that became a real trade — a live obligation |
| `pending_trade_offer` | an open proposal awaiting an answer |
| `trade_offer_history` | terminal (`declined`/`superseded`/`withdrawn`) — blocks **only** because the FK is RESTRICT |
| `active_trade_deal` | a deal still in flight |
| `trade_deal_history` | a leg of a completed/cancelled deal — again, only the FK |

### What is deliberately NOT built

**Terminal trade history still blocks permanent deletion.** Those rows carry
their own identity snapshot (`target_/offered_ brand, model, reference`), so
they would stay legible without the listing — meaning the FK *could* become
`ON DELETE SET NULL` and let them survive the purge. That change makes
another party's record lose its pointer, and it would remove `accepted`'s
database-level protection along with everything else (an accepted offer would
then be guarded only by eligibility, unless a BEFORE DELETE trigger replaced
the RESTRICT). That is a Trade Offers decision, not a delete-eligibility one,
and this round did not take it. What changed is that the block is now
**disclosed by name before execution** instead of arriving as an FK exception.

## Verify current state

```sql
-- provenance on recent lifecycle events: who authorized, what executed
select event_type, prior_status, resulting_status,
       executed_via, machinery, authorized_by is not null as has_authorizer
  from listing_lifecycle_events
 order by id desc limit 20;

-- the two Remove entry points and their grants (assistant must be service_role only)
select proname, coalesce(array_to_string(proacl,' | '),'(default)') as acl
  from pg_proc where proname in
   ('remove_listing','remove_listing_assistant','remove_listing_core','restore_listing');

-- what a removal would cost, before confirming it
select public.listing_remove_preview('<listing-uuid>');

-- eligibility vs the FKs that actually block a purge
select public.listing_delete_eligibility('<listing-uuid>');

-- Assistant receipts, by room-operation
select operation, cardinality(requested_listing_ids) as requested,
       cardinality(succeeded_listing_ids) as succeeded, failed_listings
  from assistant_operation_receipts order by created_at desc limit 10;
```

## The Assistant in this room

`marketplace_control` is a room key on `assistant_work_sessions`; its single
allowed operation is `remove_listing`. Both are enforced by CHECK constraints,
and a third refuses a `remove_listing` receipt carrying more than one id — **no
batch remove is a database property here, not a habit.**

The Assistant proposes; the founder confirms; the same governed machinery runs.
It may only act on the listing the founder currently has **selected** — a code
the model produces that resolves to anything else is dropped server-side with
the reason said out loud. It cannot delete, cannot restore, and cannot approve
from this room.

`PFC274 = 62` — the evaluate route is untouched by any of this.
