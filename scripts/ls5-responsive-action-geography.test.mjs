import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* LS-5 automatic source contract.

   This guard names the three governed responsive owners from the authorized
   closure flight. It is deliberately source-only and bounded: the separate
   Chromium contract owns rendered breakpoint geometry and stays MANUAL / HEAVY.

   Run: node scripts/ls5-responsive-action-geography.test.mjs */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const marketBar = read("components/MarketBar.tsx");
const navBar = read("components/NavBar.tsx");
const listingPage = read("app/listings/[id]/page.tsx");
const listingRail = read("components/ListingActionRail.tsx");
const correspondence = read("components/ListingCorrespondence.tsx");
const gallery = read("components/ListingGallery.tsx");
const mobileDrawer = read("components/MobileCollectorsDrawer.tsx");
const marketplace = read("components/MarketplaceControl.tsx");
const pkg = JSON.parse(read("package.json"));

function classForData(source, tag, attribute) {
  const match = new RegExp(
    `<${tag}\\s+${attribute}=""\\s+className="([^"]+)"`,
  ).exec(source);
  assert.ok(match, `${attribute} class owner exists`);
  return match[1];
}

function arbitraryBreakpoints(className) {
  return [...className.matchAll(/(?:min|max)-\[([^\]]+)\]:/g)].map((match) => match[1]);
}

function displayOwnership(className) {
  const displayUtilities = new Set([
    "hidden",
    "block",
    "inline",
    "inline-block",
    "flex",
    "inline-flex",
    "grid",
    "inline-grid",
    "contents",
  ]);
  return className
    .split(/\s+/)
    .filter((token) => displayUtilities.has(token.split(":").at(-1)));
}

/* ── 1. MarketBar: Home-only below sm; Watch Detail stays stronger ───── */

assert.match(
  marketBar,
  /const isHome = pathname === "\/";/,
  "MarketBar explicitly recognizes the actual Home route",
);
assert.match(
  marketBar,
  /const visibilityClass = isWatchDetail\s*\? "hidden min-\[56rem\]:block"\s*:\s*isHome\s*\? ""\s*:\s*"hidden sm:block";/,
  "MarketBar owns the exact Home/non-Home/Watch-Detail visibility ladder",
);
assert.match(
  marketBar,
  /className=\{`\$\{visibilityClass\} w-full border-b/,
  "the visibility ladder controls the real MarketBar root",
);
assert.match(
  marketBar,
  /<div className="hidden sm:contents">/,
  "the auction half still stands down below sm",
);
assert.equal(
  (marketBar.match(/<(?:a|Link)\s/g) ?? []).length,
  1,
  "LS-5 adds no replacement narrow Auctions destination",
);
assert.match(marketBar, /href=\{a\.catalogUrl \?\? "#"\}/, "the existing auction destination is unchanged");
assert.doesNotMatch(marketBar, /href=(?:"|\{["'])\/auctions/, "no substitute Auctions route is introduced");

/* ── 2. Watch Detail: one 56rem owner handoff, one state machine ─────── */

const inlineClass = classForData(listingPage, "div", "data-purchase-inline");
const railClass = classForData(listingPage, "aside", "data-purchase-rail");
assert.equal(inlineClass, "min-[56rem]:hidden", "inline purchase owner is exclusively below 56rem");
assert.match(railClass, /^hidden /, "rail is absent below the owner handoff");
assert.match(railClass, /min-\[56rem\]:grid/, "rail takes ownership at 56rem");
assert.deepEqual(
  displayOwnership(inlineClass),
  ["min-[56rem]:hidden"],
  "inline has no named or arbitrary competing display breakpoint",
);
assert.deepEqual(
  displayOwnership(railClass),
  ["hidden", "min-[56rem]:grid"],
  "rail display ownership is exactly base hidden then 56rem grid",
);
assert.deepEqual(
  [...new Set(arbitraryBreakpoints(`${inlineClass} ${railClass}`))],
  ["56rem"],
  "purchase owners carry no competing visibility breakpoint",
);

for (const variant of ["inline", "rail", "bar"]) {
  assert.match(
    listingPage,
    new RegExp(`<ListingActionRail\\s+[\\s\\S]*?variant="${variant}"`),
    `Watch Detail consumes the shared ${variant} action dressing`,
  );
}
assert.match(
  listingRail,
  /const ctaState: "owner" \| "reserved" \| "superseded" \| "pending" \| "accepted" \| "open"/,
  "all three dressings consume one purchase decision",
);
assert.match(
  listingPage,
  /<ListingCorrespondence[\s\S]*?offerAction=\{[\s\S]*?<ListingActionRail[\s\S]*?variant="bar"/,
  "the fixed bar receives the same purchase-action owner",
);
assert.match(
  correspondence,
  /setBarRetired\(main\.getBoundingClientRect\(\)\.bottom <= window\.innerHeight\)/,
  "the fixed bar retires at the listing main boundary",
);
assert.match(correspondence, /eligible && !barRetired/, "eligible fixed bar obeys retirement truth");
assert.match(correspondence, /!authed && !barRetired/, "guest fixed bar obeys retirement truth");

assert.match(
  gallery,
  /data-desktop-drawer-slot="" className="hidden min-\[56rem\]:contents"/,
  "desktop Drawer begins at the shared 56rem handoff",
);
assert.equal(
  (mobileDrawer.match(/min-\[56rem\]:hidden/g) ?? []).length,
  2,
  "mobile Drawer panel and opener both retire at 56rem",
);
assert.match(
  mobileDrawer,
  /window\.matchMedia\("\(max-width: 895\.98px\)"\)/,
  "mobile Drawer JS arbitration is the max-width complement of 896px",
);
assert.match(
  listingPage,
  /photoUrls\.length === 0[\s\S]*?min-\[56rem\]:hidden/,
  "photo-less narrow listings retain one non-duplicative Back-to-Browse fallback",
);
assert.match(
  listingPage,
  /min-\[67rem\]:mx-auto min-\[67rem\]:w-full min-\[67rem\]:max-w-\[1438px\]/,
  "67rem remains container geometry rather than an action-owner handoff",
);
assert.match(
  navBar,
  /data-desktop-navigation="" className="hidden min-w-0 items-center gap-6 shell:flex"/,
  "global desktop navigation begins at the shared shell breakpoint",
);
assert.match(
  navBar,
  /data-mobile-navigation-trigger=""[\s\S]*?className="text-\[var\(--slate\)\] shell:hidden"/,
  "global mobile trigger retires at the shared shell breakpoint",
);

/* ── 3. Marketplace Control: stacked/overlay selection round trip ───── */

assert.match(marketplace, /function inspectorPane\(\) \{\s*if \(!selected\) return null;/, "no selection means no inspector surface");
assert.match(
  marketplace,
  /className="border-t[^\n]+@min-\[1050px\]:absolute[^\n]+@min-\[1050px\]:right-0/,
  "the inspector changes from stacked to overlay at 1050 container px",
);
assert.match(
  marketplace,
  /function selectRow\(row: McRow\) \{\s*scrollToInspector\.current = true;\s*setSelected\(row\);\s*\}/,
  "row selection arms the stacked inspector handoff",
);
assert.match(
  marketplace,
  /getComputedStyle\(el\)\.position !== "absolute"[\s\S]*?el\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/,
  "only the stacked inspector scrolls into view",
);
assert.match(
  marketplace,
  /function backToList\(\) \{\s*if \(selected\) scrollToSelectedRow\(selected\.id\);\s*\}/,
  "Back to list returns to the exact selected row",
);
assert.equal(
  (marketplace.match(/className="relative @min-\[1050px\]:min-h-\[660px\]"/g) ?? []).length,
  2,
  "operational and detailed ledgers preserve full-width overlay geography",
);
assert.doesNotMatch(
  marketplace,
  /grid-cols-\[[^\]]*330px|pr-\[330px\]|mr-\[330px\]/,
  "no permanent inspector column is reserved from the ledger",
);

/* ── 4. Automatic/manual boundary ───────────────────────────────────── */

assert.match(
  pkg.scripts.prebuild,
  /scripts\/ls5-responsive-action-geography\.test\.mjs/,
  "the deterministic LS-5 source guard is wired to prebuild",
);
assert.doesNotMatch(
  pkg.scripts.prebuild,
  /ls5-responsive-action-geography\.render\.test\.mjs/,
  "the MANUAL / HEAVY Chromium contract stays off prebuild",
);

console.log(
  "LS-5 responsive action geography PASS: MarketBar route law, Watch Detail 56rem handoff, and Marketplace Control 1050px container round trip are guarded.",
);
