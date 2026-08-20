# Private Listing V1 — how this machinery actually works

**The misconception this file exists to kill:** Private Listing is not a
separate system. There is no private-sale table, no second checkout, no
private inbox, no share link. A private listing is **the same listing row**
with a different admission: `status = 'private_active'` plus
`listings.private_buyer_id` — the ONE FairWatchTrade account it is offered
to. Everything else — photos, provenance, purchase requests, accept/decline,
transactions, correspondence, withdraw — is the ordinary machinery.

## The one design decision that carries the leakage law

`private_active` is its **own status value**, deliberately NOT
`published` + flag. Every public surface filters `status = 'published'`
(Browse, `/sellers/[id]`, Watch DNA, the public half of
`listings_select_public_or_own`, the new-listing broadcast bell, saved-search
matching, the collector-dossier trigger) — so private rows are excluded from
all of them **by construction**. There are zero per-surface hide conditions
to maintain, and any FUTURE surface that uses the published predicate is
clean automatically. If you ever add a public surface that does NOT filter
on `status='published'`, you have re-opened this law — don't.

## Where the behavior lives

| Behavior | Actual home |
| --- | --- |
| Admission state + authorized buyer + RLS + guards + doorbell | migration `supabase/migrations/20260820010000_private_listing_v1.sql` |
| Buyer read access | RLS policy `listings_select_private_buyer` (additive — the canonical `listings_select_public_or_own` is untouched) |
| Conversation → known-buyer seam | `POST /api/listings` with `privateThreadId`: the server derives the buyer from the thread's participants and requires the caller to be the other one. **Never a buyer id, never an email, never a URL.** |
| Primary entrance | Communications room reading pane → "Create Private Listing for This Buyer" → `/sell?privateThread=<id>` (`components/CommunicationsRoom.tsx`) |
| Recipient banner / fail-safe | `app/sell/page.tsx` — resolves the thread before rendering; an unresolvable thread REFUSES to render the flow rather than silently falling back to a public submission |
| Activation | The wizard's final button becomes **Activate Private Listing** (`components/ReviewStep.tsx`); the row lands `private_active` directly when integrity has no objection |
| Trust rules NOT weakened | An integrity hold sends a private submission into the same `pending_review` witness path as any listing; founder **approval of a private-intended row lands `private_active`, never `published`** (`app/api/admin/listings/[id]/status`) |
| Purchase-request eligibility | DB trigger `purchase_requests_creation_guard` + `accept_purchase_request` accept `private_active` **only for the row's `private_buyer_id`**; `POST /api/purchase-requests` mirrors it for clean status codes |
| Buyer doorbell | DB triggers `listings_notify_private_activation_*` → one notification to exactly `private_buyer_id`; the bell's `listing_id` routes to `/listings/{id}`, where RLS re-checks admission |
| Seller discovery | Listings workspace: conditional **Private** tab, `Private` badge (`lib/listingStatus.ts` + `--lc-private_active-*` tokens), panel card naming the buyer, **Withdraw Private Listing** |
| Withdraw | The existing `remove_listing()` RPC — `private_active` joined its removable states. Same Stage 6A request-closure attribution, same Delete doctrine afterward. No private fork. |
| Buyer's marker on the listing page | `components/ListingActionRail.tsx` — "Offered to you alone" |
| Behavior pins | `scripts/private-listing-rls.test.sql` (rolled-back, role-switched RLS/eligibility proof) |

## Authorization law

The account, never the URL. A private row is readable by the seller (own-rows
clause), the one authorized buyer (new policy), accepted-request buyer after
accept (existing clause — which is also what carries the buyer through
`reserved`), and service-role machinery. Everyone else gets **no row**, so
`/listings/[id]` falls into the same `notFound()` as a nonexistent id — no
brand, no price, no photographs, no confirmation anything exists.

## Lifecycle

`private_active` → (buyer offers → seller accepts) → `reserved` → the
existing transaction machinery. Or `private_active` → **Withdraw** →
`removed` (existing semantics: listing stays the seller's; pending requests
close with `listing_removed_by_seller`). Held private submissions:
`pending_review` → founder approve → `private_active`.

## Deliberately NOT built (do not "fix")

- **Make Public** — explicitly not V1. No placeholder button, no dead route.
  The identity/photos/provenance/history all live on the ordinary listing
  row, so a future Make Public is a visibility transition, not a rebuild.
- **Multiple invited buyers / reassignment / share links / expiration** —
  one seller → one named buyer is the law of V1.
- **`New Listing → Private Listing` secondary entrance** — permitted by
  Product Law, deliberately not shipped in V1; the conversation-led path is
  the doorway. (Nothing blocks adding it later: the creation seam only needs
  a thread.)
- **A private filter on Browse/public surfaces** — nothing private exists
  there to filter, by construction.
- `WRITABLE_STATUSES` (founder dropdown) deliberately excludes
  `private_active` — it is written by the private creation path and by
  approval of a private-intended row, never hand-placed.

## Verify current state

```sql
-- private rows and their buyers (service role):
select id, status, brand, model, private_buyer_id from listings
  where private_buyer_id is not null order by created_at desc;
-- the buyer policy is live:
select policyname from pg_policies where tablename='listings'
  and policyname='listings_select_private_buyer';
-- guards accept private for the right buyer only:
--   run scripts/private-listing-rls.test.sql (rolls back, leaves nothing)
```
