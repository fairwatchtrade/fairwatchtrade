# Trade mutation authority — where a Trade action is actually allowed

**Lead with the misconception this file exists to kill:**

> "The route checks all of this before it writes, so the database doesn't have to."

It does have to, and for two separate reasons that look like one:

1. A route check happens at a different moment than the write. Between reading
   a listing and inserting against it, the listing can change. A route cannot
   take a row lock, so it can never close that gap.
2. A route is one caller. The security boundary has to hold for every caller,
   including the next one someone adds.

Both live authority defects repaired on 2026-09-02 lived in exactly that gap.

**The behaviour is in the database, not in these files.** The routes below
validate request shape and render error copy. They are not the boundary.

| Concern | Where it actually lives |
|---|---|
| Who may propose a trade | `public.propose_trade_offer()` |
| Who may assert a transfer, and what a replay means | `public.record_physical_watch_transfer_event()` |
| Who may accept | `public.accept_trade_offer()` |
| Route shape / error copy | `app/api/trade-offers/route.ts`, `app/api/trade/transfer/route.ts` |

Migration: `supabase/migrations/20260902120000_trade_authority_repair_slice_1.sql`

Verify current state:

```bash
node --experimental-strip-types scripts/trade.test.mjs
```

```sql
-- authorization must appear BEFORE the replay lookup, or the hole is back
select position('only_the_recipient_may_confirm_receipt' in def)
     < position('where idempotency_key = p_idempotency_key' in def) as auth_before_replay
from (select pg_get_functiondef(oid) def from pg_proc
      where proname = 'record_physical_watch_transfer_event') d;

-- proposal admission must be a governed function, not route code
select proname, prosecdef from pg_proc where proname = 'propose_trade_offer';
```

---

## Private-listing proposal admission

A `private_active` listing is offered to **one** authorized buyer. Until this
repair, that rule existed in RLS for *reading* and nowhere at all for *writing*
a trade proposal. `isTradeable()` accepts `private_active` deliberately — that
is how a watch not publicly for sale takes part in a trade — and nothing
compared the caller to `private_buyer_id`.

**The target** — the watch being proposed *for*, someone else's:

| Target state | Admission |
|---|---|
| `published` | eligible |
| `private_active` **and** caller = `private_buyer_id` | eligible |
| `private_active` **and** caller ≠ `private_buyer_id` | **refused** |

**The offered watch** — the caller's own, put up as consideration: the
designated-buyer gate **does not apply**. An owner may offer their own
`private_active` watch before it is committed. The private designation governs
who may *acquire* that watch, not whether its owner may put it on the table.
Competing use after commitment is already refused by the accepted-offer and
accepted-request checks inside `accept_trade_offer()`.

> **Applying the target rule to the offered watch is the easy mistake.** It
> looks like consistency and it silently forbids a legitimate, already-governed
> move.

The guard is written `is distinct from`, not `<>`. A `private_active` row with
a NULL `private_buyer_id` designates nobody, and `<>` against NULL yields NULL —
the row would fall straight through the guard.

**Route presentation, deliberately chosen:** a non-designated caller gets
`404 target_not_found`, the same answer as a listing that does not exist. They
cannot read the row either, so this is the only answer consistent with what the
rest of the platform tells them. Returning "you are not the designated buyer"
would confirm the listing exists and that someone else is designated.

## Deterministic locks, and revalidation after them

`propose_trade_offer()` locks **both** listings before it validates anything,
in ascending listing-id order — the discipline proven in `accept_trade_offer()`.

> **Never lock "target then offered."** That ordering deadlocks precisely when
> two collectors want each other's watch, which is the case Trade exists for.
> Sorting by id makes both directions take the same locks in the same sequence,
> so they queue instead of deadlocking.

Every rule is then evaluated against the **locked** rows, and the offer's
denormalised identity (`target_brand`, `target_public_code`, …) is copied from
those same rows — so a terminal offer's durable identity can never disagree
with the listing it was actually created against.

## `trade_offer_events` is authoritative

**Founder ruling, 2026-09-02:** `trade_offer_events` is the authoritative,
append-only history of Trade offer lifecycle transitions. Every governed
transition must atomically author its corresponding event. Event history may
not be silently skipped, edited or deleted.

So proposal creation and its `proposed` event are **one transaction**. They
were previously two statements from the route, the second issued after the
first had already committed, **with its error discarded** — an offer could
exist with no lifecycle event and nothing anywhere said so.

If the event cannot be written, the proposal does not exist. That is proven,
not assumed: a trigger forced to raise on `trade_offer_events` leaves zero
orphan offers behind.

## Authorization before idempotency

This is the rule most likely to be quietly undone by someone tidying the
function, so it is stated as plainly as possible:

> **A replay means THIS EXACT AUTHORIZED ACTOR ALREADY PERFORMED THIS EXACT
> AUTHORIZED ACTION. It does not mean someone already used this string.**

The producer's required order:

1. actor and key present
2. lock the deal
3. lock the leg, prove it belongs to that deal
4. lock the listing, resolve the physical-watch bead
5. **authorize** for the requested event type
6. **only now**, evaluate replay
7. remaining state validation, then insert

Step 6 sits after 5 because that was the defect. It sits *before* 7 for a
second reason worth keeping: a legitimate retry by the real recipient would
otherwise die on `leg_already_has_live_transfer` — a condition its own first
call created.

**The client-supplied key is never authority.** It was checked first, before
any lock and before authorization, so a replay hit returned another actor's
successful event to a caller who had proven nothing.

**And the keys are not secret.** `confirm_trade_leg_receipt()` derives its key
as `'trade_leg_receipt:' || p_leg_id` — fully determined by the leg id. Anyone
who could reach a leg id could reconstruct the recipient's exact key. This was
never a guessing attack.

**Replay identity is the tuple** `(trade_deal_leg_id, asserted_by_user_id,
event_type, idempotency_key)`. All four must match, or it is not a replay.

A key that exists under a *different* tuple is `idempotency_key_conflict` — a
refusal, never a replay. `idempotency_key` carries a UNIQUE index so the insert
could not have succeeded anyway; refusing here means the conflicting event's id
is never handed to a caller with no standing to see it.

Retraction authorization is hoisted above the retraction's *state* checks for
the same reason: an unauthorized caller must not be able to distinguish
`superseded_event_not_found` from `target_transfer_is_not_live`. Those answers
describe someone else's transfer.

## Step 2 of 2 — lifecycle truth and authoritative history (v8.19)

Migration: `supabase/migrations/20260902160000_trade_lifecycle_truth_step_2.sql`

**The founder ruling, verbatim, and it is not a logging policy:**

> `trade_offer_events` is the authoritative, append-only history of Trade
> offer lifecycle transitions. Every governed lifecycle transition must
> atomically author its corresponding event. Event history may not be
> silently skipped, edited, or deleted. Historical reconciliation must
> preserve supported truth and must never fabricate events that cannot be
> evidenced.

### Trade and Purchase Requests are siblings, and the winner is authoritative

The two mechanisms stay separate. When either commits a watch, competing
pending offers in the *other* become truthfully superseded **in the same
transaction**:

- **Trade wins** — `accept_trade_offer()` retires pending Purchase Requests
  on both committed listings (it already did) and now also authors one
  `superseded` event for **each** Trade offer it retires, from the exact
  `RETURNING` set. Bulk supersession is never one anonymous event.
- **Purchase Request wins** — `accept_purchase_request()` gains exactly one
  additive write: it retires pending Trade offers on its listing whether the
  listing is the **target** or the **offered consideration**, one event each.
  Its own semantics (transaction row, reserve, sibling requests) are
  reproduced verbatim. It is not generalised and the mechanisms are not merged.

Purchase Requests keep their own history contract: `purchase_request_events`
is a cancellation ledger whose CHECK admits only `resulting_status =
'cancelled'`. No `superseded` vocabulary is invented for it; the status write
is the whole of its governed truth for this transition, exactly as it always
was for its own siblings.

### Lock discipline across the two mechanisms

Trade acceptance locks **both** listings in ascending id order, then sibling
rows. Purchase Request acceptance locks its **one** listing, then its sibling
requests, then the competing pending Trade offers. Both lock the listing
before any sibling row, so neither can hold a sibling lock while waiting on a
listing the other holds — no cycle is possible. No second lock convention was
created. A true two-session race was not executed (no `dblink`, and none was
installed); revalidation against locked state is proven behaviourally.

### Private commitment closure

If an owner's `private_active` watch commits through another Trade before its
named private buyer commits it, **the private opportunity closes with that
commitment and the named buyer is told.** In `accept_trade_offer()`:

1. the pre-commit `private_buyer_id` of each committed listing is **captured
   from the locked row** before anything clears it;
2. the acquirer of each watch is derived from the offer — target → proposer,
   offered → recipient — never from the request;
3. if the watch was privately offered to someone **other than its acquirer**,
   the designation is cleared in the same statement that reserves the row,
   and a `private_listing_closed` notification is inserted for the captured
   buyer through the **existing governed seam** — the `notifications` table,
   exactly as `notify_on_private_listing_activation()` writes — inside the
   acceptance transaction. If the insert fails, the acceptance rolls back;
4. if the acquirer *is* the named buyer, the opportunity is being fulfilled,
   not closed — nothing is cleared and nobody is warned.

The bell renders any notification `type` and deep-links on `listing_id`, so
no UI changed.

**If that trade is later cancelled before transfer (v8.20, founder ruling):**
`cancel_trade_deal()` restores each listing by evidence, not by the row —
after closure the row is indistinguishable from an always-public watch. It
reads the winning offer's `accepted` event (`metadata.private_opportunities_closed`)
and decides per listing:

| The watch was | Cancelled trade restores it to |
|---|---|
| originally public | `published` |
| private, acquired by its **named** buyer (designation never closed) | `private_active` |
| private, opportunity **explicitly closed** and buyer notified | **`removed` (Paused)** — never Published, never the old invitation |

Paused means Paused: `removed_at` is stamped and `removal_reason_note` says
why; no seller `removal_reason_code` is invented (the reason is optional by
ruling, and none of the seller vocabulary is true here). The seller's own
Restore machinery lifts it like any other paused listing. The `cancelled`
event records `listings_restored` — each listing and what it was restored to.

### Completed trades cannot be unilaterally reopened

Before completion a collector may retract their own receipt confirmation as a
correction, under the actor rules Slice 1 governs. Once
`trade_deals.status = 'completed'`, `TRANSFER_RETRACTED` refuses —
`deal_completed_retraction_refused` — for recipient and founder alike through
this unilateral seam. The refusal sits **with authorization and before the
replay lookup**, so a stale idempotency key cannot turn a refused request into
apparent success. The dispute/correction path is a future product.

### Every writer, enumerated

| Path | Moves `trade_offers.status`? | Event | Where |
|---|---|---|---|
| `propose_trade_offer()` | insert `pending` | `proposed` | same function (v8.17) |
| `resolve_trade_offer()` | `pending → declined / withdrawn` | one each | same function (**new**) |
| `accept_trade_offer()` | `pending → accepted`; competitors `→ superseded` | `accepted` + one `superseded` **per** loser | same function |
| `accept_purchase_request()` | competitors `→ superseded` | one `superseded` per loser | same function |
| `trade_deals_completed_event` trigger | no — the **deal** completes | `completed` | AFTER UPDATE on `trade_deals`, whichever path completed it |
| `cancel_trade_deal()` | no — the deal cancels | `cancelled` | same function |

Removed producers: the `[id]` route no longer updates status or inserts
events; `confirm_trade_leg_receipt()` no longer authors `completed` (the
trigger owns it, so the founder-asserted path is covered identically). The
producer names its actor for the trigger via `set_config('fwt.transfer_actor')`
— the same local-setting mechanism as `fwt.transfer_seam`.

### Append-only, structurally

Producers are SECURITY DEFINER functions owned by the table owner and need no
grant. So `INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` are
**revoked from `anon`, `authenticated` and `service_role`**, and two triggers
refuse `UPDATE`/`DELETE` (row) and `TRUNCATE` (statement) for whoever still
could — including the owner running SQL by hand. The FK to `trade_offers` is
now `ON DELETE RESTRICT`: a cascade is a DELETE path, and history outlives the
row it describes. `SELECT` is unchanged; parties read their own history
through RLS.

**The only path around the triggers** is the table owner disabling them
(`ALTER TABLE … DISABLE TRIGGER`) from outside the application. `service_role`
is not the owner and cannot; it also cannot set `session_replication_role`.
No new destructive seam was created.

### Historical reconciliation — one row, fully evidenced

The one real production offer predates v8.17 and had `accepted` and
`completed` events but no `proposed`. Every fact the rule requires is a
column on that offer row — identity, `proposer_id`, prior `null`, resulting
`pending`, `created_at`. The migration inserts it idempotently with
`metadata.reconciled = true` and `reconciled_from` naming the columns, so it
can never be mistaken for a live-authored event. Nothing else was missing and
nothing else was inserted. Never fabricate an event because a row implies one.

## What is deliberately NOT built here

- **No change to who may do what.** `TRANSFERRED` remains recipient-only.
  Pre-completion `TRANSFER_RETRACTED` authority is unchanged. Sender-alone
  assertion has no path here and none in the database.
- **No post-completion retraction refusal.** Considered and deliberately left
  to a later slice.
- **`accept_trade_offer()` is untouched.** Acceptance is recipient-only and the
  recipient *is* the private listing's owner, so no cross-actor hole exists
  there. Its lock discipline is the pattern the new function follows.
- **No historical rows were migrated, edited or deleted.**
- **No RLS policy and no table grant was altered.** Broad client table grants
  are already inert under RLS default-deny (only SELECT policies exist). The
  mutation boundary is the function, and that is where the repair went.
- **The wider event-integrity audit is not here** — decline, withdrawal,
  acceptance/bulk supersession, historical reconciliation, and structural
  append-only enforcement across the whole event subsystem remain open.

## Grants

`propose_trade_offer` → `authenticated` (revoked from `public`, `anon`). It
reads `auth.uid()`, so it must be called on the **session** client; the service
role carries no identity and would simply raise `not_authenticated`.

`record_physical_watch_transfer_event` → `service_role` only. It is reached
through the route, never from a browser, and takes its actor as an argument —
which is exactly why the order of its checks is load-bearing.
