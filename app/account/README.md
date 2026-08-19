# Seller Communications — how this machinery actually works

**The misconception this file exists to kill:** Requests and Messages look
like two separate inbox products in the rail. They are not. Since v5.93 they
are **two doors into one Communications room** — a single component with a
single state model. If you find yourself building a second inbox, a third
rail entry, or a "requests view", stop: the room already exists and both
doors already open it.

## Where the behavior lives

| Behavior | Actual home |
| --- | --- |
| Room UI (folders \| list \| reading pane) | `components/CommunicationsRoom.tsx` |
| Folder law, deep-link resolution, notification routing, item model | `lib/communications.ts` (pure, tested) |
| Behavior pins | `scripts/communications-room.test.mjs` (`node --experimental-strip-types …`) |
| Thread list / thread read / reply / **PATCH mark_unread·archive·unarchive** | `app/api/messages/…` routes |
| Seller's first reply to a purchase request (no thread yet) | `POST /api/messages` with `purchaseRequestId` — NOT the `listingId` path |
| Accept / Decline / Withdraw | unchanged atomic RPCs (`accept_purchase_request` etc.) via `PATCH /api/purchase-requests/[id]` |
| Purchase-request bell stamping | DB trigger `notify_on_purchase_request()` + `withdraw_purchase_request()` — migration `20260819210000_communications_notification_deep_links.sql` |
| Correspondence email (one home since v5.93) | `lib/correspondenceEmail.ts` |
| Bell click routing | `notificationHref()` in `lib/communications.ts`, used by `components/NotificationsBell.tsx` |

## The permanent state law

Three independent concepts. **Reading is not resolving. Reading is not
archiving.**

- **Read state** — message threads only (`messages.read_at`). Opening a
  thread marks the counterpart's messages read; *Mark Unread* clears
  `read_at` on the **latest inbound message only** (minimal truthful write).
- **Transactional state** — purchase requests only (`status`). The Requests
  rail badge counts **pending** requests and moves only on
  Accept/Decline/withdraw — never on reading.
- **Archive state** — message threads only, **my side's flag only**
  (`archived_by_a`/`_b`). Purchase requests have **no archive column**, so
  the room deliberately offers them no archive control.

## Peek vs open (the subtle one)

The room auto-shows the first item of a folder (Design Gate behavior). That
auto-display fetches `GET /api/messages/[id]?peek=1`, which **skips** the
mark-read write. Only an explicit row click or a notification landing
fetches without `peek` and consumes read state. If unread counts ever start
vanishing "on their own", look for a code path that dropped the peek param.

## Addressing / deep links

- `?module=requests` / `?module=messages` — the doors (pushState, WS2:
  module is the only history unit).
- `?request=<id>` / `?thread=<id>` — the selected item (replaceState only).
- `notifications.purchase_request_id` (nullable, SET NULL on purge) is what
  lets a bell land on the exact request: stamped → `/account?module=
  requests&request=<id>`; unstamped (all pre-v5.93 rows) → the listing.
- A deep link waits for **both** data sources (`loaded` prop) before
  concluding an id is unknown, then falls back to the door's filter. RLS
  already hides other users' items; the room never errors on a foreign id.

## Names and emails — the traps that cost hours

- `profiles` is **select-own** RLS. Any counterpart display name MUST come
  through the `public_seller_profiles` view (owner-rights view, effectively
  public names). Reading `profiles` directly for another user silently
  returns nothing — that is exactly how every correspondence email was
  undeliverable until v5.93.
- Recipient email/notify_email lookups go through
  `getRecipientEmailPrefs()` in `lib/correspondenceEmail.ts` (service-role,
  narrow read, after the route has already authorized the caller as a
  participant). Do not "simplify" it back to a session read.
- Email links are **role-aware**: seller recipients land in the
  Communications room on the exact thread; buyer recipients land on the
  listing (their conversation's home).

## Request ↔ thread pairing

A request pairs with its correspondence thread by
`(listing_id, buyer_id) == (thread.listing.id, thread.otherId)` — live ids,
never snapshot text. `otherId` was added to the `/api/messages` GET payload
for exactly this. A terminal request whose listing FK was nulled (Stage 5)
pairs with nothing and refuses seller-reply with a typed
`conversation_unavailable`.

## Deliberately NOT built (do not "fix")

- **No third rail entry** for Communications — the two doors are the law.
- **No archive for purchase requests** — no column, no invented state.
- **No read state for requests** — pending is attention, not unreadness.
- **No message-thread bells** — email is the doorbell for messages; the
  bell table only carries purchase-request events today.
- **No Private Listing anything** — the future seam is "Create Private
  Listing for This Buyer" from a buyer conversation; nothing here blocks
  it and nothing here fakes it. No placeholder CTA exists on purpose.
- The old `MessagesView`/`RequestsView` inline modules are **gone**, not
  moved. Nothing in the application mounts a second copy of the room —
  it renders once, outside the mobile/desktop split (the v2.68 lesson).

## Verify current state

```sql
-- bells are being stamped:
select id, type, listing_id, purchase_request_id from notifications
  where type = 'purchase_request' order by created_at desc limit 5;
-- the stamping trigger is live:
select prosrc from pg_proc where proname = 'notify_on_purchase_request';
```

```bash
node --experimental-strip-types scripts/communications-room.test.mjs
```
