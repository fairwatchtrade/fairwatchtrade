/* Communications room — state law, folders, deep links, notification routing.

   Run: node --experimental-strip-types scripts/communications-room.test.mjs

   These assertions pin the room's BEHAVIOR, not its markup:
     · the three states stay independent — a pending-but-read request never
       counts as unread, an archived thread never leaks into the live desk,
       and nothing about reading moves transactional state;
     · both doors open the same room with the right filter;
     · the Requests folder holds EVERY request (resolved included) while the
       Unread folder holds only unread message threads;
     · a notification stamped with purchase_request_id routes into the
       Communications room on that exact request; an unstamped one keeps the
       listing route; a bell with neither routes nowhere;
     · a deep link lands where the item actually lives, including an
       archived thread landing on Archived;
     · a request pairs with its correspondence thread by (listing, buyer) —
       never by snapshot text;
     · Stage 6A closure attribution survives the move into the room. */
import assert from "node:assert/strict";
import {
  buildItems,
  folderCounts,
  folderItems,
  folderForModule,
  matchThreadForRequest,
  notificationHref,
  requestLabel,
  requestTitle,
  resolveDeepLink,
  searchItems,
} from "../lib/communications.ts";

function thread(over = {}) {
  return {
    id: "t1",
    listing: { id: "L1", brand: "Parmigiani", model: "Tonda", reference: "PF012", thumbUrl: null },
    subject: null,
    otherId: "buyer-1",
    otherName: "A Collector",
    lastMessage: { body: "Is the case clean?", created_at: "2026-08-18T10:00:00Z", sender_id: "buyer-1" },
    unreadCount: 1,
    updatedAt: "2026-08-18T10:00:00Z",
    myRole: "b",
    archivedByMe: false,
    ...over,
  };
}

function request(over = {}) {
  return {
    id: "r1",
    listing_id: "L1",
    buyer_id: "buyer-1",
    listing_brand: "Parmigiani",
    listing_model: "Tonda",
    listing_reference: "PF012",
    proposed_purchase_price: 7150,
    listing_price: 7850,
    proposed_currency: "USD",
    listing_currency: "USD",
    shipping_terms: null,
    included_items: null,
    notes: "Ready to proceed.",
    status: "pending",
    closure_cause: null,
    created_at: "2026-08-18T08:00:00Z",
    updated_at: "2026-08-18T08:00:00Z",
    listings: null,
    ...over,
  };
}

/* ── Doors ── */
assert.equal(folderForModule("requests"), "requests");
assert.equal(folderForModule("messages"), "messages");

/* ── Folder law ── */
{
  const threads = [
    thread(),
    thread({
      id: "t2",
      unreadCount: 0,
      updatedAt: "2026-08-17T10:00:00Z",
      lastMessage: { body: "Ship insured?", created_at: "2026-08-17T10:00:00Z", sender_id: "buyer-1" },
    }),
    thread({ id: "t3", archivedByMe: true, unreadCount: 0, updatedAt: "2026-08-16T10:00:00Z" }),
  ];
  const requests = [
    request(),
    request({ id: "r2", status: "declined", updated_at: "2026-08-15T10:00:00Z" }),
  ];
  const items = buildItems(threads, requests);

  // Newest activity first, threads and requests interleaved — the request
  // from the 18th 08:00 sits between the 18th 10:00 and 17th 10:00 threads.
  assert.deepEqual(
    items.map((i) => i.key),
    ["thr:t1", "req:r1", "thr:t2", "thr:t3", "req:r2"]
  );

  const counts = folderCounts(items);
  // All = live desk: 2 live threads + 2 requests; the archived thread is out.
  assert.equal(counts.all, 4);
  // Requests = every request, resolved included.
  assert.equal(counts.requests, 2);
  // Messages = live threads only.
  assert.equal(counts.messages, 2);
  // Unread = unread live threads only. The PENDING request is attention,
  // not unreadness — it must NOT be here. Reading is not resolving.
  assert.equal(counts.unread, 1);
  assert.equal(counts.archived, 1);

  // Archived thread appears in archived and nowhere else.
  const archivedKeys = folderItems(items, "archived").map((i) => i.key);
  assert.deepEqual(archivedKeys, ["thr:t3"]);
  assert.ok(!folderItems(items, "all").some((i) => i.key === "thr:t3"));
  assert.ok(!folderItems(items, "messages").some((i) => i.key === "thr:t3"));

  // A resolved request still lives in Requests — the pill says its state.
  assert.ok(folderItems(items, "requests").some((i) => i.key === "req:r2"));

  /* ── Deep links ── */
  // Stamped request → Requests folder, exact item — resolved or not.
  assert.deepEqual(resolveDeepLink(items, "r2", null), { key: "req:r2", folder: "requests" });
  // Thread → Messages; archived thread → Archived.
  assert.deepEqual(resolveDeepLink(items, null, "t2"), { key: "thr:t2", folder: "messages" });
  assert.deepEqual(resolveDeepLink(items, null, "t3"), { key: "thr:t3", folder: "archived" });
  // Unknown id resolves to nothing — the room falls back to the door's
  // ordinary filter and reveals nothing.
  assert.equal(resolveDeepLink(items, "nope", null), null);

  /* ── Search ── */
  assert.equal(searchItems(items, "parmigiani").length, 5);
  assert.equal(searchItems(folderItems(items, "messages"), "case clean").length, 1);
  assert.equal(searchItems(items, "no such watch").length, 0);
}

/* ── Request ↔ thread pairing ── */
{
  const t = thread();
  const stranger = thread({ id: "t9", otherId: "buyer-9" });
  const otherListing = thread({
    id: "t8",
    listing: { id: "L2", brand: "Omega", model: null, reference: "166", thumbUrl: null },
  });
  // Same listing + same buyer pairs; anything else does not.
  assert.equal(matchThreadForRequest([stranger, otherListing, t], request())?.id, "t1");
  assert.equal(matchThreadForRequest([stranger, otherListing], request()), null);
  // A terminal request whose listing FK was nulled pairs with nothing.
  assert.equal(matchThreadForRequest([t], request({ listing_id: null })), null);
}

/* ── Notification routing ── */
{
  const stamped = {
    id: "n1",
    type: "purchase_request",
    message: "New purchase request",
    listing_id: "L1",
    purchase_request_id: "r1",
    read: false,
    created_at: "2026-08-19T00:00:00Z",
  };
  // Stamped → the exact request in the Communications room.
  assert.equal(notificationHref(stamped), "/account?module=requests&request=r1");
  // Unstamped (all pre-v5.93 history) → the listing, as before.
  assert.equal(
    notificationHref({ ...stamped, purchase_request_id: null }),
    "/listings/L1"
  );
  // Neither → nowhere (renders as a non-link row).
  assert.equal(
    notificationHref({ ...stamped, purchase_request_id: null, listing_id: null }),
    null
  );
}

/* ── Vocabulary: Stage 6A closure attribution ── */
{
  assert.equal(requestLabel(request()), "pending");
  assert.equal(requestLabel(request({ status: "cancelled", closure_cause: "buyer_withdrew" })), "withdrawn");
  assert.equal(
    requestLabel(request({ status: "cancelled", closure_cause: "listing_removed_by_seller" })),
    "closed on removal"
  );
  assert.equal(requestLabel(request({ status: "cancelled" })), "closed");
  assert.equal(requestLabel(request({ status: "superseded" })), "superseded");

  // Snapshot identity survives a vanished listing.
  assert.equal(requestTitle(request()), "Parmigiani Tonda");
  assert.equal(
    requestTitle(request({ listing_brand: null, listing_model: null })),
    "Ref. PF012"
  );
  assert.equal(
    requestTitle(request({ listing_brand: null, listing_model: null, listing_reference: null })),
    "Watch no longer listed"
  );
}

console.log("communications-room: all assertions passed");
