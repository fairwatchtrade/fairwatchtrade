# Dealer Accelerator — Retry Policy

**Status:** Approved product/runtime policy, 2026-08-08.
**Implemented in:** `lib/dealer/manifestAdapter.ts` (`RETRY_MAX_ATTEMPTS`, `RETRY_BACKOFF_BASE_MS`).
**Mechanism:** `public.dealer_accelerator_record_item_retry` (spine migration `20260729020434`).

---

## The policy

| Value | Setting |
| --- | --- |
| Maximum attempts | **3** |
| Backoff base | **60 000 ms** |
| Backoff curve | **Linear on attempt number** — 60 s, then 120 s |

After the third attempt the item is blocked as `technical_retry_exhausted`, and
every still-pending photograph on that item is recorded `retrieval_terminal` so
nothing is left implying that further work is coming.

## Why the policy lives in the caller

The database function holds **no ceiling and no backoff of its own, deliberately.**
It is a mechanism, not a policy: it records whatever the worker decides and
refuses only combinations that cannot be true —

- an exhausted retry that also schedules a future attempt;
- a `next_attempt_at` that is already in the past;
- a caller that does not hold the item's lease;
- an item whose status is not `discovered` or `ready`.

Exhaustion is therefore the **caller's** determination, passed as `p_exhausted`.
Confirmed 2026-08-08 by runtime review and by contract/history review: no
database-level numeric ceiling exists, no database-level timing rule exists, and
no prior contract specifies a count, duration, or curve. These values conflict
with nothing; they are the first explicit statement of the policy.

`dealer_accelerator_claim_item_lease` enforces the backoff by refusing to
re-claim an item before its `next_attempt_at` falls due, raising
`item_retry_not_due`. The short duration is deliberate: slices are
founder-triggered rather than daemon-driven, so a due time measured in minutes
means the next ordinary invocation picks the work up.

## Semantics that must not drift

- **Attempt count is per item-processing cycle, not per photograph.** One
  `record_item_retry` call per slice, however many photographs failed within it.
- **The first and second retryable failures are non-terminal.** An item stays
  `discovered` with a scheduled due time.
- **Exhaustion happens only at the approved ceiling** — never as a side effect of
  an error on the way there.
- **What counts as retryable is not widened by this policy.** Classification
  stays where it already is, in `isRetryableFailure` (`lib/dealer/pinnedFetch.ts`);
  a terminal failure such as a non-image response is still terminal on sight.
- **No schema or function redesign** is implied or permitted by this document.

## The failure this replaced

Before v3.69 the adapter called `record_item_retry` with four arguments. The
function has taken seven since the day it was written, so the call raised
SQLSTATE `42883 function ... does not exist`. It sat inside a `try/catch` that
treated any failure as the ceiling being reached — so the first genuinely
retryable photograph failure was misread as exhaustion, blocked the item and
terminalised its photographs before one retry had been attempted.

The catch was removed with the repair. A failure in this call must surface; it
must never again be reinterpreted as a policy outcome.

## Changing these values

Change the constants in `lib/dealer/manifestAdapter.ts` and this table together.
They are a single fact written in two places on purpose: the constant is what
runs, this file is what was agreed.
