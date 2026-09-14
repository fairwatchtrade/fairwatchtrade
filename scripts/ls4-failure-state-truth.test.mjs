/* LS-4 known-debt failure-truth contract.

   Run:
     node --experimental-strip-types scripts/ls4-failure-state-truth.test.mjs

   This contract covers only the authorized Purchase Request and Notification
   debt families. It deliberately does not census unrelated catch/failure
   branches. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyPurchaseResponse } from "../lib/purchaseRequest.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/* Purchase Request: known refusal is distinct from an outcome whose delivery
   cannot be confirmed. Mutating either branch back to one bucket must fail. */
for (const [status, body] of [
  [409, { error: "duplicate_request" }],
  [403, { error: "not_allowed" }],
  [409, { error: "listing_currency_unset" }],
]) {
  assert.equal(classifyPurchaseResponse(status, body, 9000).kind, "product_rejection");
}
assert.equal(classifyPurchaseResponse(400, { error: "invalid_amount" }, 9000).kind, "field_error");
assert.equal(classifyPurchaseResponse(401, null, 9000).kind, "expired");
assert.equal(classifyPurchaseResponse(404, null, 9000).kind, "unavailable");
assert.equal(
  classifyPurchaseResponse(409, { error: "listing_changed", old: 10000, current: 11000 }, 9000).kind,
  "changed",
);
assert.equal(classifyPurchaseResponse(500, { error: "insert_failed" }, 9000).kind, "submission_unconfirmed");
assert.equal(classifyPurchaseResponse(418, { error: "unknown" }, 9000).kind, "submission_unconfirmed");

const controller = read("components/usePurchaseRequest.ts");
const full = read("components/PurchaseRequestForm.tsx");
const inline = read("components/InlinePurchaseRequest.tsx");
const failurePresentation = read("components/PurchaseRequestFailureTruth.tsx");
const purchasePresentation = read("lib/purchaseRequestPresentation.ts");

assert.match(controller, /case "product_rejection"/);
assert.match(controller, /case "submission_unconfirmed"/);
assert.match(
  controller,
  /case "submission_unconfirmed":\s*persistDraft\(\);\s*setFailure\(outcome\)/,
  "unconfirmed submission persists the draft before the verification doorway can unmount the full form",
);
assert.match(controller, /catch\s*\{\s*apply\(\{ kind: "submission_unconfirmed" \}\)/s);
assert.doesNotMatch(controller, /setFormError|formError/);
for (const [name, source] of [["full", full], ["inline", inline]]) {
  assert.match(source, /<PurchaseRequestFailureTruth/,
    `${name} renderer uses the shared failure-truth presentation`);
  assert.match(source, /failure=\{failure\}/,
    `${name} renderer receives the explicit controller failure`);
}
assert.match(failurePresentation, /Request not sent/);
assert.match(failurePresentation, /Submission not confirmed/);
assert.match(
  failurePresentation,
  /We couldn't confirm whether your purchase request was sent\. Check My Offers before trying again\./,
);
assert.match(failurePresentation, /href="\/catalogue#my-offers"/);
assert.match(failurePresentation, />\s*View My Offers\s*</);
assert.doesNotMatch(failurePresentation, /Please try again|Nothing was sent|Request failed/i);
assert.doesNotMatch(purchasePresentation, /PURCHASE_REQUEST_LEGACY_FORM_ERROR_COLOR/);

/* Notification: exercise the real pure truth owner. Missing exports are
   reported as a deliberate red assertion instead of an import-time crash. */
const notificationTruth = await import("../lib/notificationFailureTruth.ts").catch(() => ({}));
for (const name of [
  "resolveNotificationLoad",
  "notificationLoadFailureState",
  "applyConfirmedNotificationRead",
]) {
  assert.equal(typeof notificationTruth[name], "function", `${name} is implemented`);
}

const rows = [
  { id: "unread-1", read: false },
  { id: "read-1", read: true },
];
assert.deepEqual(
  notificationTruth.resolveNotificationLoad(rows, 1, new Error("db row detail"), null),
  { ok: false, error: "notifications_unavailable" },
  "row-query failure cannot become an empty success",
);
assert.deepEqual(
  notificationTruth.resolveNotificationLoad(rows, 1, null, new Error("db count detail")),
  { ok: false, error: "notifications_unavailable" },
  "count-query failure cannot become authoritative zero",
);
assert.deepEqual(
  notificationTruth.resolveNotificationLoad(rows, null, null, null),
  { ok: false, error: "notifications_unavailable" },
  "missing exact count cannot masquerade as zero",
);
assert.deepEqual(notificationTruth.resolveNotificationLoad(rows, 1, null, null), {
  ok: true,
  notifications: rows,
  unreadCount: 1,
});
assert.equal(notificationTruth.notificationLoadFailureState(false), "failed_initial");
assert.equal(notificationTruth.notificationLoadFailureState(true), "stale");
assert.deepEqual(notificationTruth.applyConfirmedNotificationRead(rows, 1, ["unread-1"]), {
  notifications: [
    { id: "unread-1", read: true },
    { id: "read-1", read: true },
  ],
  unreadCount: 0,
});
assert.deepEqual(notificationTruth.applyConfirmedNotificationRead(rows, 1, "all"), {
  notifications: [
    { id: "unread-1", read: true },
    { id: "read-1", read: true },
  ],
  unreadCount: 0,
});

const api = read("app/api/notifications/route.ts");
const bell = read("components/NotificationsBell.tsx");
const notificationTruthSource = read("lib/notificationFailureTruth.ts");
const pkg = JSON.parse(read("package.json"));

assert.match(api, /resolveNotificationLoad/);
assert.match(api, /countError/);
assert.match(api, /notifications_unavailable/);
assert.match(api, /status:\s*503/);
assert.doesNotMatch(api, /notifications:\s*\[\],\s*unread_count:\s*count\s*\?\?\s*0/);

assert.match(notificationTruthSource, /"loading"\s*\|\s*"ready"\s*\|\s*"failed_initial"\s*\|\s*"stale"/);
assert.match(bell, /Notifications couldn&apos;t be loaded right now\./);
assert.match(bell, /Couldn&apos;t refresh notifications\. Showing the last loaded list\./);
assert.match(bell, /Couldn't confirm that change\. Notifications will refresh\./);
assert.match(bell, />\s*Retry\s*</);
assert.match(bell, /const POLL_MS = 30_000;/, "the 30-second poll cadence is exact");
assert.match(
  bell,
  /const sequence = \+\+loadSequence\.current;[\s\S]*?const mutationGeneration = notificationMutationGeneration\.current;[\s\S]*?sequence === loadSequence\.current &&[\s\S]*?mutationGeneration === notificationMutationGeneration\.current/,
  "overlapping GETs and mutation windows are sequenced before applying truth",
);
assert.equal(
  (bell.match(/if \(!isCurrentTruthRequest\(\)\) return;/g) ?? []).length,
  2,
  "both successful and failed GET completions reject stale responses",
);
assert.match(bell, /const notificationMutationInFlight = useRef\(false\);/,
  "notification bookkeeping mutations are serialized independently of navigation");
assert.match(bell, /setInterval\(load, POLL_MS\)/, "poll cadence and owner remain unchanged");
assert.match(bell, /const href = notificationHref\(n\)/, "routing owner remains unchanged");
assert.match(bell, /if \(!n\.read\) void markRead\(\[n\.id\]\)/,
  "row activation still owns mark-read without blocking navigation");
const markReadBody = bell.match(/async function markRead\([\s\S]*?\r?\n  }\r?\n\r?\n  async function markAllRead/)?.[0] ?? "";
const markAllBody = bell.match(/async function markAllRead\([\s\S]*?\r?\n  }\r?\n\r?\n  const hasUnread/)?.[0] ?? "";
for (const [name, body] of [["row mark-read", markReadBody], ["Mark-all", markAllBody]]) {
  assert.ok(body, `${name} function is present`);
  const fetchIndex = body.indexOf('await fetch("/api/notifications"');
  const statusIndex = body.indexOf('if (!res.ok) throw new Error("notification_update_unconfirmed")');
  const settleIndex = body.indexOf("setInbox(");
  const mutationStartIndex = body.indexOf("notificationMutationGeneration.current += 1;");
  const mutationEndIndex = body.indexOf("notificationMutationGeneration.current += 1;", mutationStartIndex + 1);
  assert.match(body, /if \(notificationMutationInFlight\.current\) return;/,
    `${name} cannot overlap another notification bookkeeping mutation`);
  assert.match(body, /finally \{\s*notificationMutationInFlight\.current = false;/,
    `${name} always releases the mutation-serialization gate`);
  assert.doesNotMatch(body, /setMutationNotice\(null\)/,
    `${name} success cannot erase an earlier unconfirmed mutation before authoritative reconciliation`);
  assert.ok(fetchIndex >= 0 && statusIndex > fetchIndex && settleIndex > statusIndex,
    `${name} can settle local read/count truth only after its own PATCH returned ok`);
  assert.ok(mutationStartIndex >= 0 && mutationStartIndex < fetchIndex && mutationEndIndex > statusIndex && mutationEndIndex < settleIndex,
    `${name} invalidates GETs started before or during its confirmation window`);
}
assert.doesNotMatch(
  bell,
  /href=\{href\}[\s\S]{0,500}?preventDefault/,
  "mark-read confirmation never blocks routed row navigation",
);
assert.match(
  bell,
  /loadState === "ready"[\s\S]*?notifications\.length === 0[\s\S]*?No notifications yet\./,
  "authoritative empty appears only from ready state",
);
assert.match(pkg.scripts.prebuild, /scripts\/ls4-failure-state-truth\.test\.mjs/);

console.log("LS-4 failure-state truth PASS: Purchase Request delivery truth and Notification load/mutation confirmation are explicit and guarded.");
