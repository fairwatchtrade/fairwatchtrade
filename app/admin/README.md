# Marketplace Control — how this room actually works

**The misconception this file exists to kill:** `/admin` is not a page that
loads all listings and filters them in the browser. The v1.95 AdminDashboard
did exactly that (unbounded full-table fetch, client-side sort); it was
replaced by this room, whose every interaction is one bounded server query.
If you are debugging "why doesn't row X appear", the answer is in a server
query or a lifecycle mapping — not in client state.

## The pieces

| Piece | Where | Job |
|---|---|---|
| Server page | `app/admin/page.tsx` | Founder gate (hardcoded UID) → resolves device-class page size → service-client initial read (CURRENT, newest first) → mounts rail + room |
| Data layer | `lib/marketplaceControlData.ts` | THE one source for lifecycle mapping, Needs-Attention predicates, and the ledger query. Page and API both call it; they cannot drift |
| List API | `app/api/admin/marketplace/route.ts` | GET — server-side search/filter/sort/pagination |
| Prefs API | `app/api/admin/marketplace/prefs/route.ts` | GET/PUT per-admin presentation state (`admin_view_preferences`, RLS-own) |
| Bulk API | `app/api/admin/marketplace/bulk/route.ts` | POST preview/execute for Take-Off-Market and Permanent Delete |
| Room UI | `components/MarketplaceControl.tsx` | Ledger + persistent inspector (Operational) / configurable table (Detailed) |
| Migration | `supabase/migrations/20260820160000_marketplace_control_room.sql` | Admin closure causes, founder authority on the governed RPCs, prefs table, indexes |

**The Operational flow law (founder ruling, 2026-08-20, two rejected attempts
behind it):** the ledger ALWAYS owns the full workspace width; the
selected-listing inspector is an OPAQUE OVERLAY pinned upper-right. Rows pass
beneath it and are covered — never visible through it — and everything below
the overlay's actual height is full-width. Never "fix" overlap here by
reserving a column, narrowing rows, hiding columns, or shrinking type:
permanently narrowing the long list to preserve an upper-page pane is the
exact rejected geometry. The pane's explicit `bg-[var(--surface)]` is
load-bearing (a transparent pane ghosts row cells through — the original
defect). Layout variants in this component are Tailwind v4 CONTAINER queries
(`@min-[…]:`); a misspelled variant compiles silently to nothing, so after
any edit grep the built CSS for `@container (min-width:` before shipping.

## Pagination is real bounded data behavior

Every page of the ledger is one `.range()` window on the server — the room
never fetches the universe and hides rows. Two properties are load-bearing:

- **Deterministic order across pages:** every sort in `fetchMarketplace()`
  ends on an `id` tiebreak. Without it, rows whose sort key collides
  (dealer-burst `created_at`, equal prices, same status) can silently
  duplicate on one page and vanish from the next.
- **Device-class page size, explicit-choice persistence:** the server page
  resolves the default ONCE per request — phones 25, desktops 50 — from
  `sec-ch-ua-mobile` (UA substring fallback). It is a device-class decision,
  not a viewport measurement: resizing a window never churns it, and first
  paint is fetched at the resolved size so nothing snaps on mount. A page
  size chosen through the Rows control or restored by a saved view is an
  EXPLICIT preference and persists in prefs marked with a `perExplicit: true`
  flag beside it; the persistence path strips `per` otherwise, so a phone
  visit can never quietly rewrite the desktop default (or vice versa). A
  stored `per` WITHOUT the flag is residue of older builds that persisted it
  on every save — restore ignores it and the next save strips it.

Selection on a phone is a round trip: the room opens completely unselected;
tapping a row scrolls to the stacked inspector; "Back to list" returns to
the exact selected row (selection intact); × clears selection entirely. The
narrow runway folds every control except search behind the Filters toggle —
on wide containers the fold wrapper is `display: contents`, so the approved
desktop composition is untouched by construction.

## Lifecycle mapping (deliberate, not prototype-derived)

- **CURRENT** = draft · pending_review · published · reserved · private_active
- **OFF MARKET** = removed (seller vocabulary: "Paused")
- **HISTORY** = rejected
- **ALL** = the seven above. Deleted rows are hard-deleted by the governed
  purge — absent from every view **by construction**, not by filtering.

## Needs Attention is deterministic or nothing

Membership comes only from explainable runtime facts (see
`computeAttention()`): integrity holds, pending_review with no review record,
pending_review older than 48h (by `updated_at` — there is no submission
timestamp column), flagged `listing_integrity_evidence` without a resolved
review, rejected with no recorded seller message. **No scores, no
heuristics.** The old "removed with no reason code" idea is deliberately
absent: since the Pause-takes-no-reason ruling a reasonless pause is an
ordinary legal state.

## Where the mutations live (this is what costs hours if forgotten)

The room's destructive actions do **not** have their own write paths. They
call the same governed RPCs the seller surfaces use — `remove_listing()` and
`delete_listing_permanently()` — **through the founder's session client**,
never the service client (the delete function refuses service_role by
design). The Marketplace Control migration widened each function's caller
gate to exactly one extra principal (the founder UID, hardcoded in the SQL)
and made the recorded closure cause follow the actor:
`listing_removed_by_admin` / `listing_deleted_by_admin` vs the `_by_seller`
causes. Eligibility, TOCTOU locking, tombstones, and orphan-media
computation all still live inside those functions — the bulk route only
sequences calls and reports per-row truth.

Deliberately NOT built:

- No admin status transitions in the inspector — `/admin/listings/[id]`
  (the adjudication room) remains the ONE door for approve/reject/clarify,
  with its seller-message requirements intact.
- No seller emails for admin remove/delete — the seller-voiced receipts
  ("you removed your listing") would be lies. Buyer bells still fire via
  `emit_listing_*_notifications` (derived from committed events, non-fatal).
- No `private_active` operations — the private listing machinery owns that
  state; this room only displays it.

## Verify current state

```sql
-- the four lifecycle views should partition the table
select status, count(*) from listings group by status order by status;

-- who may call the governed delete (expect: authenticated only)
select proacl from pg_proc where proname = 'delete_listing_permanently';

-- admin closure causes exist in the constraint
select pg_get_constraintdef(oid) from pg_constraint
 where conname = 'purchase_requests_closure_cause_check';

-- prefs store is RLS-own
select polname, pg_get_expr(polqual, polrelid) from pg_policy
 where polrelid = 'admin_view_preferences'::regclass;
```

```bash
# the list API is the room's single read door (founder session required)
curl -s https://www.fairwatchtrade.com/api/admin/marketplace?view=current | head
```

Saved views preserve presentation/query state only (the saved-view law) —
they are JSON in `admin_view_preferences.prefs` and can never mutate a
listing. The room always OPENS on CURRENT with no residual filters;
presentation config (Operational/Detailed, columns, sort, page size) is what
persists across sessions.
