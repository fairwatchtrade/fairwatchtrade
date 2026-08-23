# Listing adjudication — who is allowed to move a listing, and how

Three routes live in this folder and they are deliberately *not* interchangeable.
This file exists because the difference between them is the whole design, and it
is invisible from the filenames.

## The misconception this file exists to kill

> "The integrity check passed, so the listing is approved."

No. **Evidence and adjudication are different systems and they never merged.**

- `listing_integrity_provider_results.classification` (`passed`,
  `review_suggested`, `high_confidence_match`) is **per provider, per
  photograph**. Several rows can disagree inside one listing. It is an
  *evidence input*.
- A **listing-level** decision lives in exactly two places: the founder's, in
  `listing_integrity_reviews` + `listing_decision_events`; and the machine's, in
  `listing_review_triage` + `listing_decision_events`.

A clean integrity gate means *the system has no objection*. It has never meant
*someone approved this*. That distinction is what v6.34 was written to restore
and what everything below preserves.

## The three routes

| Route | What it is | What it may write |
| --- | --- | --- |
| `status/` | Founder adjudication. The person decides. | Any of the four writable statuses |
| `recheck/` | **Evidence gathering only.** Re-runs providers, may clear a hold. | `integrity_hold_reason` — never `status` |
| `triage/` | Runs the automatic policy on demand. Takes no status, no outcome, no override. | Nothing directly; it calls the seam |

`recheck/` used to release a cleared hold straight to `published`. It doesn't
any more, and that is the single most important thing in this folder: **clearing
the system's objection and approving a listing are different acts.**

## Where publication is actually governed

Not here. `lib/listingPublicationGate.ts`.

Reaching `published` requires all three, and the predicate is stated **once**:

1. the listing is currently `pending_review`;
2. an explicit approval is recorded with the transition;
3. `details.availability` is not `Not Currently Available`.

Both writers — the founder route and the triage seam — call
`publicationRefusal()`. Neither restates the conditions inline, and
`scripts/sell-lifecycle.test.mjs` fails if either one starts to.

## Automatic triage (Founder Review Triage V1)

Founder Review is meant to be the exception room, not the inbox for every
submission. Triage is what makes that true.

- **Policy** — `lib/reviewTriage.ts`. Pure, no I/O, readable in one screen.
  ESCALATE is the *structural* default: `PASS` requires an explicit positive
  predicate and no branch falls through into a disposition. Every rule consumes
  an existing product decision; none was invented for triage. The header of that
  file lists each rule and where its authority comes from.
- **Seam** — `lib/reviewTriageService.ts`. Server-only. Takes a listing id and
  **nothing else** — no caller can name a status, so the transition is derived
  from the outcome. Exactly two transitions exist:
  `pending_review → published` (pass) and `pending_review → draft` (fail).
  Every write is scoped `.eq("status","pending_review")`, so a founder
  adjudicating mid-flight always wins the race and triage reports moving
  nothing.
- **Record** — `listing_review_triage`. One *current* row per listing, enforced
  by a partial unique index on `superseded_at is null`, not by convention.
  Earlier cycles are kept.
- **Attribution** — `listing_decision_events.actor_kind`. A machine disposition
  is `'triage'` with `actor_uid` NULL; a founder decision is `'founder'` with a
  real uid. A CHECK constraint refuses every other combination, so a forged
  founder is not representable.

### When it runs

Automatically, at the two points a listing enters review:
`app/api/listings/route.ts` (fresh submission) and
`app/api/listings/[id]/submit-for-review/route.ts` (resubmission). Both call it
inside `try/catch` — a triage failure must never turn a successful submission
into an error, and an untriaged listing simply stays `pending_review`, which is
where Founder Review already looks.

**Deploying triage does not disturb the existing queue.** It runs on submission
or when the founder asks; listings already sitting in `pending_review` are not
swept.

### What is deliberately NOT built

- **No score, band, or threshold.** Nothing probabilistic publishes or refuses a
  watch. There is no column for one.
- **No Triage Room and no new admin navigation.** Escalations surface as one
  more attention reason inside Marketplace Control.
- **Triage never writes `listing_integrity_reviews`.** That table answers "did
  the *founder* look" and a machine must not answer it.
- **Triage never writes evidence.** It reads a finished evidence set through
  `aggregateIntegrityForListing`; it executes no provider.
- **No rejection.** The only automatic adverse act is a return to draft, which
  the seller can undo by fixing the listing and resubmitting.

## Where the behaviour actually lives (the non-obvious parts)

- `computeAttention()` in `lib/marketplaceControlData.ts` surfaces escalations.
  It is a **read aggregation** — it never runs triage. The reason is scoped to
  listings still `pending_review`, which is why a disposed listing leaves no
  stale founder work behind.
- The `finding_review` hold is a **founder-only exit**, declared by
  `isSystemReleasableHold()` returning false in `lib/integrity.ts`. Triage
  escalates on it rather than taking it.
- With `AUBREY_ENFORCEMENT` off, `requireAuthenticityCoverage` is false, so a
  listing with no completed authenticity result is not held for missing
  coverage. Triage passes the same flag every other caller passes — it does not
  have its own opinion about coverage.
- Original `dealer_import` source images are excluded from authenticity
  execution, so requiring coverage of them would hold every imported listing
  forever. The seam applies the same exclusion the recheck route does.

## Verify current state

```sql
-- what triage is currently saying about the queue
select l.public_code, l.status, t.outcome, t.reason_code, t.policy_version
  from listing_review_triage t
  join listings l on l.id = t.listing_id
 where t.superseded_at is null
 order by t.created_at desc;

-- machine decisions vs founder decisions, and no forged actors
select actor_kind, count(*), count(actor_uid) as with_actor
  from listing_decision_events group by actor_kind;

-- listings still waiting on a person
select count(*) from listings where status = 'pending_review';
```

## Proofs

- `scripts/review-triage.test.mjs` — policy behaviour + the governance boundary.
- `scripts/sell-lifecycle.test.mjs` — the publication door, including that no
  writer re-implements the law inline.

`PFC274 = 62` — the evaluate route is untouched by any of this.
