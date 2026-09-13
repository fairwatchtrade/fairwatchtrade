/* LS-2 Notification state semantics + noncolor read/unread contract.

   Run: node --experimental-strip-types scripts/ls2-notification-state-semantics.test.mjs

   This contract is deliberately written before the shared presentation
   extraction. It protects the live bell's network/mutation owner while the
   founder gallery receives only deterministic, in-memory presentation data. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NOTIFICATION_READ_STATES,
  notificationCountPresentation,
  notificationReadState,
} from "../lib/notificationPresentation.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const normalized = (path) => read(path).replace(/\s+/g, " ").trim();

const unread = {
  id: "unread",
  type: "purchase_request",
  message: "You have a purchase request.",
  listing_id: "listing",
  purchase_request_id: "request",
  read: false,
  created_at: "2026-09-13T12:00:00.000Z",
};
const history = { ...unread, id: "read", read: true };

assert.deepEqual(NOTIFICATION_READ_STATES, ["unread", "read"]);
assert.equal(notificationReadState(unread), "unread");
assert.equal(notificationReadState(history), "read");

assert.deepEqual(notificationCountPresentation(0), {
  hasUnread: false,
  visibleBadge: null,
  ariaLabel: "Notifications",
});
assert.deepEqual(notificationCountPresentation(1), {
  hasUnread: true,
  visibleBadge: "1",
  ariaLabel: "Notifications, 1 unread",
});
assert.deepEqual(notificationCountPresentation(9), {
  hasUnread: true,
  visibleBadge: "9",
  ariaLabel: "Notifications, 9 unread",
});
assert.deepEqual(notificationCountPresentation(10), {
  hasUnread: true,
  visibleBadge: "9+",
  ariaLabel: "Notifications, 10 unread",
});
assert.deepEqual(notificationCountPresentation(27), {
  hasUnread: true,
  visibleBadge: "9+",
  ariaLabel: "Notifications, 27 unread",
});

const bell = normalized("components/NotificationsBell.tsx");
const bellButton = normalized("components/NotificationBellButton.tsx");
const row = normalized("components/NotificationRowPresentation.tsx");
const typography = normalized("app/globals.css");
const galleryPath = "app/internal/ls2-notification-state-gallery/page.tsx";
const gallery = normalized(galleryPath);
const prebuild = normalized("package.json");

/* One presentational row owner; the live bell keeps routing and mutations. */
assert.match(bell, /<NotificationRowPresentation notification=\{n\} timeLabel=\{formatRelativeTime\(n\.created_at\)\} \/>/);
assert.match(bell, /<NotificationBellButton unreadCount=\{unreadCount\} expanded=\{open\} onToggle=\{\(\) => setOpen\(\(o\) => !o\)\} \/>/);
assert.match(bellButton, /const \{ hasUnread, visibleBadge, ariaLabel \} = notificationCountPresentation\(unreadCount\);/);
assert.match(bellButton, /aria-label=\{ariaLabel\}/);
assert.match(bellButton, /\{visibleBadge\}/);
assert.match(bell, /if \(!n\.read\) markRead\(\[n\.id\]\)/, "row activation still owns mark-read in the live bell");
assert.match(bell, /const href = notificationHref\(n\)/, "routing remains in the live bell");
assert.match(bell, /setInterval\(load, POLL_MS\)/, "30-second polling remains in the live bell");
assert.match(bell, /method: "PATCH"/, "PATCH remains in the live bell");

/* Literal text is the noncolor cue and is not hidden from assistive tech. */
assert.match(row, /data-notification-read-state=\{state\}/);
assert.match(row, /\{state === "unread" && \(/);
assert.match(row, /data-notification-unread-cue=""/);
assert.match(row, />\s*Unread\s*<\/span>/);
assert.match(row, /className="fw-notification-state uppercase"/);
assert.match(
  typography,
  /\.fw-notification-state \{ font-family: 'Inter', sans-serif; font-size: 12px; font-style: normal; font-weight: 500; line-height: 1\.4; letter-spacing: 0\.8px; \}/,
  "the notification state has one owner-specific governed recipe at the stronger human floor",
);
assert.doesNotMatch(row, /data-notification-unread-cue=""[^>]*aria-hidden/s);
assert.match(row, /aria-hidden="true"/, "the dot may remain decorative, never semantic");
assert.match(
  row,
  /style=\{\{ color: "light-dark\(var\(--gold-dim\), var\(--gold\)\)" \}\}/,
  "the subordinate visible cue uses readable supporting gold in Light and the established notification gold in Dark",
);

/* The route is founder-gated and every fixture stays in memory. */
for (const anchor of [
  "supabase.auth.getUser()",
  "ADMIN_EMAIL",
  "redirect(\"/\")",
  "robots: { index: false, follow: false, nocache: true }",
  'data-fixture-gallery="ls2-notification-state"',
  "NOTIFICATION_GALLERY_SCENARIOS",
  "NotificationRowPresentation",
  "NotificationBellButton",
  "COUNT_CUE_MISMATCH",
  "LS-4-ADJACENT / NO DISTINCT USER STATE",
]) assert.ok(gallery.includes(anchor), `${galleryPath}: ${anchor}`);

assert.doesNotMatch(
  gallery,
  /fetch\(|supabase\.from\(|supabase\.rpc\(|method:\s*["']PATCH|setInterval\(|setTimeout\(|useEffect\(|useState\(|onClick=|<form/,
  "gallery has no polling, fetch, database read after auth, PATCH, timer, optimistic mutation, or form seam",
);
assert.equal((gallery.match(/supabase\.auth\.getUser\(\)/g) ?? []).length, 1, "Supabase is used once, only for founder identity");

/* The matrix names every authorized state, including the deliberate mismatch. */
for (const fixture of [
  "empty-zero",
  "history-zero",
  "one-unread",
  "nine-unread",
  "ten-plus",
  "mixed-read-unread",
  "long-message",
  "routable",
  "non-routable",
  "unknown-type",
  "unread-to-read",
  "count-cue-mismatch",
]) assert.ok(gallery.includes(fixture), `gallery covers ${fixture}`);
assert.match(gallery, /data-mark-all-visible=\{scenario\.unreadCount > 0 \? "true" : "false"\}/);
assert.match(gallery, /scenario\.unreadCount > 0 && \(/, "Mark all follows aggregate unread truth");
assert.match(gallery, /NOTIFICATION_READ_STATES\.map/, "read-state coverage derives from the product owner");
assert.match(gallery, /notificationHref\(item\)/, "gallery exercises the real route owner");
assert.match(gallery, /long sender\/context[^<]*not applicable/i, "unsupported sender/context is truthfully classified");

/* A new presentation state cannot silently miss the gallery or normal build. */
assert.match(prebuild, /scripts\/ls2-notification-state-semantics\.test\.mjs/);

/* Frozen neighbors: zero bell is enabled/readable; Mark-all stays readable;
   opening still does not mark anything; exact count and cap remain shared. */
assert.match(bellButton, /style=\{\{ color: hasUnread \? "#C9A84C" : "var\(--muted\)" \}\}/);
assert.doesNotMatch(bellButton, /disabled=\{!hasUnread\}|disabled=\{unreadCount === 0\}/);
assert.match(bell, /Mark all read/);
assert.match(bell, /text-\[var\(--muted\)\][^>]*hover:text-\[var\(--gold\)\]/);
assert.match(bell, /onToggle=\{\(\) => setOpen\(\(o\) => !o\)\}/);
assert.doesNotMatch(bell, /onClick=\{\(\) => \{[^}]*setOpen[^}]*mark(All)?Read/s);

console.log("LS-2 Notification state semantics PASS: shared noncolor unread truth, exact count/cap, founder-only in-memory gallery, build-path coverage.");
