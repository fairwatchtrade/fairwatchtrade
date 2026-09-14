/* LS-2 Admin permanent-dark + Seller/Admin status parity contract.

   Run: node --experimental-strip-types scripts/ls2-admin-status-parity.test.mjs

   Each assertion names a concrete regression: account appearance leaking
   into Admin, an omitted declaration scope, raw storage vocabulary reaching
   the founder, a duplicated state palette, or a gallery drifting away from
   the real presentation owners. */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  LIFECYCLE_STATUSES,
  adminLabel,
  statusTokenKey,
} from "../lib/listingStatus.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const normalized = (path) => read(path).replace(/\s+/g, " ").trim();

const css = read("app/globals.css");
const adminLayout = normalized("app/admin/layout.tsx");

/* Route-family ownership: both governed shared declaration selectors append
   Admin at the end, and the route wrapper has no box and no auth behavior. */
const priorSharedSelector = /:root,\s*\[data-immersive-dark\],\s*\[data-inspection-light\]\s*\{/g;
assert.equal(
  (css.match(priorSharedSelector) ?? []).length,
  0,
  "every shared declaration scope appends data-admin-dark",
);
const adminSharedSelector = /:root,\s*\[data-immersive-dark\],\s*\[data-inspection-light\],\s*\[data-admin-dark\]\s*\{/g;
assert.equal(
  (css.match(adminSharedSelector) ?? []).length,
  2,
  "the main and mobile shared token scopes both include Admin",
);
assert.match(css, /\[data-admin-dark\]\s*\{\s*color-scheme:\s*dark;\s*color:\s*var\(--platinum\);\s*\}/);
assert.match(adminLayout, /data-admin-dark=""/);
assert.match(adminLayout, /style=\{\{ display: "contents" \}\}/, "the route ancestor generates no layout box");
assert.match(adminLayout, /appearance scope only/i);
assert.match(adminLayout, /adds no authorization gate/i);
assert.doesNotMatch(adminLayout, /createClient|auth\.getUser|redirect\(/, "appearance layout does not impersonate route authorization");

/* The two pre-existing exception memberships remain exact and the new scope
   has one owner only. */
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}
const sourceRoot = new URL("../", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1));
const appAndComponents = [...sourceFiles(join(sourceRoot, "app")), ...sourceFiles(join(sourceRoot, "components"))];
const joinedSources = appAndComponents.map((path) => readFileSync(path, "utf8")).join("\n");
assert.equal((joinedSources.match(/data-admin-dark=""/g) ?? []).length, 1, "only app/admin/layout mounts data-admin-dark");
assert.equal((joinedSources.match(/data-immersive-dark=""/g) ?? []).length, 2, "Galaxy and Collector's Drawer remain the only immersive-dark mounts");
assert.equal((joinedSources.match(/data-inspection-light=""/g) ?? []).length, 1, "Watch Detail remains the only inspection-light mount");
assert.match(css, /html\s*\{[^}]*color-scheme:\s*light dark;/s);
assert.match(css, /html\[data-theme="light"\] \{ color-scheme: light; \}/);
assert.match(css, /html\[data-theme="dark"\] \{ color-scheme: dark; \}/);

/* Token values are byte-for-byte the v8.86 values; only selector membership
   may change in this flight. */
const lifecycleDeclarations = (value) =>
  value
    .split(/\r?\n/)
    .filter((line) => line.includes("--lc-"))
    .map((line) => line.trim());
assert.deepEqual(lifecycleDeclarations(css), [
  "--lc-draft-line:           light-dark(rgba(122,95,32,0.44), rgba(201,168,76,0.34));",
  "--lc-draft-wash:           light-dark(var(--state-wash), rgba(201,168,76,0.045));",
  "--lc-draft-badge:          light-dark(#84682A, #C9A84C);",
  "--lc-pending_review-line:  light-dark(rgba(90,95,110,0.45), rgba(156,161,176,0.40));",
  "--lc-pending_review-wash:  light-dark(var(--state-wash), rgba(156,161,176,0.045));",
  "--lc-pending_review-badge: light-dark(#5A5F6E, #B9BECC);",
  "--lc-published-line:       light-dark(rgba(46,125,79,0.45), rgba(112,192,144,0.34));",
  "--lc-published-wash:       light-dark(var(--state-wash), rgba(112,192,144,0.038));",
  "--lc-published-badge:      light-dark(#2E7D4F, #70C090);",
  "--lc-rejected-line:        light-dark(rgba(160,59,51,0.5), rgba(190,86,80,0.44));",
  "--lc-rejected-wash:        light-dark(var(--state-wash), rgba(190,86,80,0.05));",
  "--lc-rejected-badge:       light-dark(#A03B33, #DB8E88);",
  "--lc-private_active-line:  light-dark(rgba(62,78,110,0.5), rgba(159,179,224,0.42));",
  "--lc-private_active-wash:  light-dark(var(--state-wash), rgba(159,179,224,0.045));",
  "--lc-private_active-badge: light-dark(#3E4E6E, #9FB3E0);",
  "--lc-reserved-line:        light-dark(rgba(110,90,37,0.55), rgba(228,216,188,0.62));",
  "--lc-reserved-wash:        light-dark(var(--state-wash), rgba(228,216,188,0.05));",
  "--lc-reserved-badge:       light-dark(#6E5A25, #EFE4CB);",
  "--lc-removed-line:         light-dark(rgba(107,101,92,0.42), rgba(169,162,150,0.34));",
  "--lc-removed-wash:         light-dark(var(--state-wash), rgba(169,162,150,0.04));",
  "--lc-removed-badge:        light-dark(#6B655C, #A9A296);",
  "--lc-neutral-line:         var(--border-subtle);",
  "--lc-attn-edge:            light-dark(#2C7F88, #58B4BE);",
  "--lc-select-line:          light-dark(rgba(37,35,31,0.30), rgba(232,228,220,0.30));",
  "--lc-select-fill:          light-dark(#F3EFE6, rgba(255,255,255,0.028));",
  "--lc-focus-ring:           light-dark(rgba(37,35,31,0.55), rgba(232,228,220,0.55));",
], "no lifecycle token value changed");

/* Canonical listing vocabulary and semantic marker ownership. */
assert.deepEqual(
  LIFECYCLE_STATUSES.map((status) => [status, adminLabel(status), statusTokenKey(status)]),
  [
    ["draft", "Draft", "draft"],
    ["pending_review", "Pending Review", "pending_review"],
    ["published", "Published", "published"],
    ["rejected", "Rejected", "rejected"],
    ["reserved", "Sale Pending", "reserved"],
    ["removed", "Paused", "removed"],
    ["private_active", "Private", "private_active"],
  ],
);
assert.equal(statusTokenKey("future_state"), "neutral");

const listingMarker = normalized("components/AdminListingStatusMarker.tsx");
assert.match(listingMarker, /statusTokenKey\(status\)/);
assert.match(listingMarker, /adminLabel\(status\)/);
assert.match(listingMarker, /var\(--lc-\$\{tokenKey\}-badge, var\(--muted\)\)/);
assert.match(listingMarker, /var\(--lc-\$\{tokenKey\}-line\)/);

const controls = normalized("components/ListingStatusControls.tsx");
assert.match(controls, /<AdminListingStatusMarker status=\{status\} \/>/);
assert.match(controls, /<option key=\{s\} value=\{s\}> \{adminLabel\(s\)\} <\/option>/);
assert.match(controls, /Change status to "\$\{adminLabel\(selected\)\}"\?/);
assert.match(controls, /Status changed to "\$\{adminLabel\(applied\)\}"\./);
assert.match(controls, /status: next/, "POST body retains raw selected status");
assert.doesNotMatch(controls, /color: "#C9A84C"/);
assert.match(controls, /const STATUS_OPTIONS = WRITABLE_STATUSES/, "dropdown derives from the writable raw vocabulary");
assert.match(controls, /<option key=\{s\} value=\{s\}>/, "every option submits its raw status value");

/* Purchase Request truth stays in the existing shared owner and the exact
   Founder Review emitter is shared with the deterministic gallery. */
const prOwner = await import("../lib/purchaseRequestPresentation.ts");
assert.deepEqual(prOwner.PURCHASE_REQUEST_LIFECYCLE_STATUSES, [
  "pending",
  "accepted",
  "declined",
  "expired",
  "cancelled",
  "superseded",
]);
assert.deepEqual(prOwner.PURCHASE_REQUEST_CLOSURE_CAUSES, [
  "buyer_withdrew",
  "listing_removed_by_seller",
  "listing_deleted_by_seller",
]);
assert.equal(prOwner.purchaseRequestLifecycleColor("pending", null), "var(--lc-pending_review-badge)");
assert.equal(prOwner.purchaseRequestLifecycleColor("accepted", null), "var(--lc-published-badge)");
assert.equal(prOwner.purchaseRequestLifecycleColor("declined", null), "var(--lc-rejected-badge)");
assert.equal(prOwner.purchaseRequestLifecycleColor("superseded", null), "var(--muted)");
assert.equal(prOwner.purchaseRequestLifecycleColor("cancelled", "buyer_withdrew"), "var(--slate)");
assert.equal(prOwner.purchaseRequestLifecycleColor("cancelled", "listing_removed_by_seller"), "var(--lc-rejected-badge)");
assert.equal(prOwner.purchaseRequestLifecycleColor("cancelled", "listing_deleted_by_seller"), "var(--lc-rejected-badge)");
assert.equal(prOwner.purchaseRequestLifecycleColor("cancelled", null), undefined);
assert.equal(prOwner.purchaseRequestLifecycleColor("expired", null), undefined);
assert.equal("PURCHASE_REQUEST_LEGACY_FORM_ERROR_COLOR" in prOwner, false);

const prMarker = normalized("components/AdminPurchaseRequestStatus.tsx");
assert.match(prMarker, /isPurchaseRequestLifecycleStatus\(status\)/);
assert.match(prMarker, /purchaseRequestLifecycleColor\(lifecycleStatus, closureCause\)/);
assert.match(prMarker, /status === "expired" \? "governance-pending" : "neutral"/);
assert.match(prMarker, /listing_deleted_by_seller/);
assert.match(prMarker, /closed by the seller deleting the listing/);

const founderReview = normalized("app/admin/listings/[id]/page.tsx");
assert.match(founderReview, /\.from\("purchase_requests"\)/, "Founder Review rows come from Purchase Request truth");
assert.match(founderReview, /<AdminPurchaseRequestStatus status=\{r\.status\} closureCause=\{r\.closure_cause\} \/>/);
assert.match(founderReview, /<AdminListingStatusMarker status=\{currentStatus\} \/>/);
assert.doesNotMatch(founderReview, /r\.status === "accepted" \? C\.green/);

/* The gallery is under /admin so the route-level owner—not a facsimile—pins
   its scheme. Fixtures derive from the real iterable vocabularies and make
   no data or mutation calls after the founder identity check. */
const galleryPath = "app/admin/internal/ls2-admin-status-parity-gallery/page.tsx";
const gallery = normalized(galleryPath);
for (const anchor of [
  "supabase.auth.getUser()",
  "ADMIN_EMAIL",
  'redirect("/")',
  "robots: { index: false, follow: false, nocache: true }",
  'data-fixture-gallery="ls2-admin-status-parity"',
  "...LIFECYCLE_STATUSES",
  "PURCHASE_REQUEST_LIFECYCLE_STATUSES.filter",
  "PURCHASE_REQUEST_CLOSURE_CAUSES.map",
  "AdminListingStatusMarker",
  "AdminPurchaseRequestStatus",
]) assert.ok(gallery.includes(anchor), `${galleryPath}: ${anchor}`);
assert.doesNotMatch(gallery, /data-admin-dark=/, "gallery inherits the one route-family appearance owner");
assert.doesNotMatch(gallery, /fetch\(|supabase\.from\(|supabase\.rpc\(|<form|onClick=/, "gallery has no record read or mutation seam");
assert.equal((gallery.match(/supabase\.auth\.getUser\(\)/g) ?? []).length, 1, "Supabase is used once, only for founder identity");

const packageJson = normalized("package.json");
assert.match(packageJson, /scripts\/ls2-admin-status-parity\.test\.mjs/, "parity guard runs in the normal build path");

const requestedGalleryDoorwayPath = "app/internal/ls2-admin-status-parity-gallery/page.tsx";
assert.ok(existsSync(new URL(requestedGalleryDoorwayPath, root)), "the ordered /internal gallery doorway exists");
const requestedGalleryDoorway = normalized(requestedGalleryDoorwayPath);
assert.match(requestedGalleryDoorway, /redirect\("\/admin\/internal\/ls2-admin-status-parity-gallery"\)/);
assert.match(requestedGalleryDoorway, /robots: \{ index: false, follow: false, nocache: true \}/);

console.log("LS-2 Admin status parity PASS: permanent-dark route scope, canonical labels, governed listing/PR semantics, and founder-only in-memory gallery.");
