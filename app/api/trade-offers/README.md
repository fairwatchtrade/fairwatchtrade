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
