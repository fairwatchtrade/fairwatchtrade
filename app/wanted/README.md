---
system_id: wanted
owns:
  - app/wanted
  - app/api/wanted
  - lib/wanted.ts
  - components/WantedWorkspace.tsx
  - components/WantedRequestsModule.tsx
  - supabase/migrations/20260823210000_wanted_requests_v1.sql
watches:
  - app/api/listings
protected:
  - path: supabase/migrations/20260823210000_wanted_requests_v1.sql
    reason: Defines wanted_requests_for_seller(), the only seller-facing read. Its returns table deliberately omits target_price, max_price, collector_note and requester_id.
traps:
  - wanted_requests has an own-row SELECT policy and NO seller policy at all. A seller session querying the table gets zero rows. Do not add a seller policy to make a seller-facing read work - the seller path is the SECURITY DEFINER projection.
  - Privacy here is structural, not a column list. Selecting fewer columns is the weak form; there is deliberately no column list for a future edit to get wrong.
  - The budget comparison runs inside Postgres and leaves as one of three words - within, near, outside. It must never leave as a number.
not_built:
  - Nothing reuses saved_searches. A collector may hold both a Saved Search and a Wanted for the same watch; that is expected, not duplication.
  - Wanted is not Purchase Request, not Private Listing, not Trade, and not Agent-Native discovery. They share plumbing ideas and are separate products.
---

# Wanted / Looking For — the demand primitive

> A collector declares the exact watch they are actively trying to buy, and an
> eligible seller answers with a governed FairWatchTrade listing.

## The misconception this file exists to kill

> "Wanted is a Saved Search with a price on it."

No. They cannot express each other's job:

| | Saved Search | Wanted |
| --- | --- | --- |
| Stores | a URL `query_string` (≤2000 chars) | structured demand: identity, must-have vs preferred, private budget |
| Means | *tell me when inventory appears* | *I am in the market, and sellers may answer me* |
| Direction | passive monitoring | active declaration |
| Answered by | nothing — it just matches | a seller, with a governed listing |

Nothing here reuses `saved_searches`. A collector may hold both for the same
watch, and that is expected, not duplication.

Wanted is also **not** Purchase Request (intent against one *chosen* listing),
**not** Private Listing (restricted supply), **not** Trade, and **not**
Agent-Native discovery. They share plumbing ideas; they are separate products.

## The privacy law, and why it is in the database

The founder ruling: the collector's **exact target and exact ceiling are
requester-private matching inputs**, and the seller never learns who is asking.
Showing a buyer's maximum anchors every answer at that maximum and inverts
normal negotiation leverage.

The weak way to honour that is to select fewer columns. **That is not what
happens here.**

- `wanted_requests` has an own-row SELECT policy and **no seller policy at
  all**. A seller's session querying the table gets **zero rows** — proven in
  production, not assumed. There is no column list for a future edit to get
  wrong.
- The only seller-facing read is `wanted_requests_for_seller()`, a
  **SECURITY DEFINER** projection whose `returns table (…)` contains no
  `target_price`, no `max_price`, no `collector_note`, no `requester_id`.
- The budget comparison happens **inside Postgres**, against the seller's own
  inventory, and leaves as one of three words: `within` / `near` / `outside`.
- At answer time the comparison needs the ceiling, so
  `/api/wanted/[id]/answer` reads the request with the **service client**,
  computes the verdict in-process, and returns only the verdict. The numbers
  never enter a response body, a `criteria_report`, a notification, or a log.

**Known bound, stated rather than hidden:** a seller who repeatedly re-prices a
listing and watches the signal move can narrow the ceiling to roughly the width
of the `near` band (`NEAR_BAND`, 15%). The band is deliberately wide and the
buckets deliberately coarse. **Widening it is safe; narrowing it is not, and a
numeric signal must never be introduced.**

## The three answer paths, and no fourth

1. **Use Existing Listing** — the seller picks one of their own listings; the
   server returns a truthful compatibility report before sending. A
   contradiction is never allowed to masquerade as a full match, and an
   unverifiable requirement is reported **unknown**, never quietly counted met.
2. **Create New Listing** — `/sell?wanted=<id>`. Normal Sell Flow. No shortcut
   around photographs, evidence, review, or publication governance.
3. **Create Private Listing for Requester** — `/sell?wanted=<id>&private=1`.

### Why the private path does not reuse `?privateThread`

The thread-seeded entry derives the buyer from an existing conversation. A
Wanted answer has no conversation — that is the point of the founder ruling
that authorized it. So `/sell?wanted=` is an **independent** entry:

```
Wanted request → Answer Request → Create Private Listing for Requester
  → normal governed Sell Flow → requester bound as authorized buyer
  → review → private_active → listing-bound Communications thereafter
```

The browser sends a **request id, never a buyer**. `app/api/listings/route.ts`
re-derives `private_buyer_id` from the request row, exactly as the thread path
re-derives the counterpart, and refuses if the request is not open, if the
seller owns it, or if the collector did not accept private listings. This also
means Wanted does **not** inherit the known `?privateThread` direct-load
hydration defect.

## Where the behaviour actually lives (the non-obvious parts)

- **Answering never closes a request.** It moves `active` → `answered`; the
  collector still decides when to stop looking. Pause stops seller visibility
  and routing while keeping everything; close keeps history and is not a
  delete. Only a `draft` can be deleted, because it was never visible.
- **Dedupe is a constraint**, not a disabled button:
  `unique (wanted_request_id, listing_id)`. A double submit returns 409 from
  Postgres. Notifications carry `dedupe_key = wanted_answer:<answer id>`, so
  one answer rings one bell.
- **Answers have no message column and never will.** Communications stays
  listing-bound; there is no third home and no pre-listing DM.
- **The seller queue shows every open request**, because any seller can answer
  by creating a listing. Eligibility is not a brand filter — the `budget_fit`
  signal is computed from the seller's matching inventory and is simply `null`
  when they have nothing comparable, which is more honest than a manufactured
  signal.
- **The criteria report is frozen at answer time**, so a later listing edit
  cannot rewrite what the collector was shown.

## Entrances

| Surface | Where |
| --- | --- |
| Desktop collector | `CatalogueRail` → **Discover** → Wanted (`/wanted`) |
| Mobile collector | `MobileNav` drawer, beside Catalogue — a destination, not a new nav primitive |
| Browse zero-result | `BrowseClient` → *Create Wanted Request*, seeding the draft via `browseDraftHref()` |
| Seller | Seller Workspace → **Wanted Requests** (`/account?module=wanted`) |

⚠ **New Arrivals was removed from the rail by founder ruling and must never
return.** It reappeared in an early design artifact and invalidated it as
current-shell proof. Dealer Room may surface the same requests contextually
later; it is deliberately not a second door today.

Only single-valued Browse criteria seed a draft: a search across three brands
is a filter, not a demand, so it seeds no brand rather than an arbitrary one.

## What is deliberately NOT built

- No public WTB board, comments, likes, feed, or buyer profile.
- No way for a seller to browse the person, only the demand.
- No "message the requester" before a governed listing exists.
- No numeric budget signal, ever.
- No Dealer Room room, no Saved Search change, no Communications expansion.

## Verify current state

```sql
-- what a SELLER can reach directly (must be zero rows)
set local role authenticated;
set local request.jwt.claims = '{"sub":"<a seller uid>","role":"authenticated"}';
select count(*) from wanted_requests;

-- what the sanctioned projection gives them (no number, no identity)
select display_identity, budget_fit, answer_count from wanted_requests_for_seller();
reset role;

-- open demand and its answers
select w.display_identity, w.status, count(a.id) as answers
  from wanted_requests w
  left join wanted_request_answers a on a.wanted_request_id = w.id
 group by w.id, w.display_identity, w.status order by w.created_at desc;
```

```bash
node --experimental-strip-types scripts/wanted.test.mjs
```

`PFC274 = 62` — the evaluate route is untouched by anything in this room.
