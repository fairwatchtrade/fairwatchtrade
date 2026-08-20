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
| Server page | `app/admin/page.tsx` | Founder gate (hardcoded UID) → service-client initial read (DEFAULT query: CURRENT, newest first) → mounts rail + room |
| Data layer | `lib/marketplaceControlData.ts` | THE one source for lifecycle mapping, Needs-Attention predicates, and the ledger query. Page and API both call it; they cannot drift |
| List API | `app/api/admin/marketplace/route.ts` | GET — server-side search/filter/sort/pagination |
| Prefs API | `app/api/admin/marketplace/prefs/route.ts` | GET/PUT per-admin presentation state (`admin_view_preferences`, RLS-own) |
| Bulk API | `app/api/admin/marketplace/bulk/route.ts` | POST preview/execute for Take-Off-Market and Permanent Delete |
| Room UI | `components/MarketplaceControl.tsx` | Ledger + persistent inspector (Operational) / configurable table (Detailed) |
| Migration | `supabase/migrations/20260820160000_marketplace_control_room.sql` | Admin closure causes, founder authority on the governed RPCs, prefs table, indexes |

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
