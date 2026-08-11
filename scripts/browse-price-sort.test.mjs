/* Collector View price proximity + price sort — v4.2.

   Run: node --experimental-strip-types scripts/browse-price-sort.test.mjs

   Two defects from Jason's production review at 100% zoom:

   1. The price was stranded at the extreme right edge. Measured on production
      at his real 3072px viewport before the change: every spec value
      right-aligned at x=822, and every price sat at x=3013 — 2,191px of dead
      space between a watch and its price, widening without bound as the
      viewport grows. The spec-row-count hypothesis was measured and DISPROVED:
      4-spec and 5-spec rows both rendered priceRight=3013, identical, at both
      1546px and 3072px. The real coupling is the middle column's flex-1
      absorbing all slack while the spec plate stays pinned at 420.

      The correction anchors the price to the plate's own right edge — the
      exact column every spec value already right-aligns to, and the exact
      position of the approved top row in Jason's screenshot (price right edge
      744 == spec value right edge 744). Because the anchor is the plate and
      not a measured offset, a listing rendering six or seven specs cannot
      drift it.

   2. No price sort existed. The scope rule is the dangerous part: sorting must
      span the ENTIRE filtered set with pagination applied afterward. A
      page-scoped sort looks completely correct and is silently wrong. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseBrowseSort, sortListings, usablePrice } from "../lib/browseSort.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../components/BrowseClient.tsx"), "utf8");

let n = 0;
const ok = (name) => console.log(`  PASS ${++n}  ${name}`);

/* Isolate the Collector View branch so nothing here can be satisfied by the
   Gallery card's markup instead. */
const cStart = src.indexOf("Collector View research row");
assert.ok(cStart > 0, "Collector View branch must exist");
const collector = src.slice(cStart);

/* ── 1 · The ordering itself, on real values ─────────────────────────── */
const row = (id, asking_price) => ({ id, asking_price });
const ids = (rows) => rows.map((r) => r.id).join(",");

const base = [
  row("a", 7850),
  row("b", 8250),
  row("c", 7250),
  row("d", 725),
  row("e", 7250),
];

assert.equal(ids(sortListings(base, "priceAsc")), "d,c,e,a,b");
assert.equal(ids(sortListings(base, "priceDesc")), "b,a,c,e,d");
ok("Low to High and High to Low both order by the real asking price");

/* Equal prices (c and e are both 7250) keep their default relative order in
   BOTH directions — a stable sort, so the room never reshuffles between
   renders for reasons a collector cannot see. */
assert.equal(ids(sortListings(base, "priceAsc")).indexOf("c") < ids(sortListings(base, "priceAsc")).indexOf("e"), true);
assert.equal(ids(sortListings(base, "priceDesc")).indexOf("c") < ids(sortListings(base, "priceDesc")).indexOf("e"), true);
ok("equal prices hold their default relative order in both directions (stable)");

/* ── 2 · Default order is preserved exactly ──────────────────────────── */
assert.equal(sortListings(base, "default"), base, "default must return the very same array reference");
ok("default mode returns the input untouched — existing ordering preserved exactly");

/* ── 3 · The null law — unpriced never masquerades as cheapest ────────── */
const withNulls = [
  row("p1", 500),
  row("n1", null),
  row("p2", 100),
  row("n2", undefined),
  row("p3", 300),
];

const asc = sortListings(withNulls, "priceAsc").map((r) => r.id);
const desc = sortListings(withNulls, "priceDesc").map((r) => r.id);

assert.deepEqual(asc, ["p2", "p3", "p1", "n1", "n2"]);
assert.deepEqual(desc, ["p1", "p3", "p2", "n1", "n2"]);
ok("unpriced listings sort AFTER priced listings in BOTH directions — never $0 at the top of Low to High");

assert.deepEqual(
  sortListings([row("x", null), row("y", null)], "priceAsc").map((r) => r.id),
  ["x", "y"],
);
ok("an all-unpriced set does not throw and keeps its default order");

/* NaN and Infinity are not orderings. A NaN price would otherwise compare
   false against every other value and scatter its row unpredictably. */
assert.equal(usablePrice(Number.NaN), null);
assert.equal(usablePrice(Number.POSITIVE_INFINITY), null);
assert.equal(usablePrice("7850"), null);
assert.equal(usablePrice(0), 0);
assert.equal(usablePrice(7850), 7850);
ok("NaN, Infinity and numeric strings are treated as unpriced; a real 0 is a real price");

/* ── 4 · Never mutates the caller's array ────────────────────────────── */
const original = [row("a", 3), row("b", 1), row("c", 2)];
const snapshot = ids(original);
sortListings(original, "priceAsc");
sortListings(original, "priceDesc");
assert.equal(ids(original), snapshot, "sorting must not reorder the memoized source array");
ok("sorting never mutates in place — the filtered set other readers hold is untouched");

/* ── 5 · URL truth ───────────────────────────────────────────────────── */
assert.equal(parseBrowseSort("priceAsc"), "priceAsc");
assert.equal(parseBrowseSort("priceDesc"), "priceDesc");
assert.equal(parseBrowseSort(null), "default");
assert.equal(parseBrowseSort("cheapest"), "default");
assert.equal(parseBrowseSort(""), "default");
ok("an unrecognised or absent sort param degrades to the default order, never an error");

/* ── 6 · SCOPE: sort spans the filtered set, pagination comes after ──── */
assert.ok(
  /const sorted = useMemo\(\(\) => sortListings\(filtered, sort\), \[filtered, sort\]\)/.test(src),
  "the whole filtered set must be sorted",
);
assert.ok(
  /const paginated = pageSize === "all" \? sorted : sorted\.slice\(0, pageSize\)/.test(src),
  "pagination must slice the SORTED result",
);
assert.ok(
  !/filtered\.slice\(0, pageSize\)/.test(src),
  "the filtered set must never be sliced directly — that is the page-scoped sort defect",
);
ok("sort applies to the entire filtered set and pagination slices the sorted result — never the reverse");

/* Proven as behaviour, not only as source: the twenty lowest across a set of
   fifty must be the twenty lowest overall, not a reordering of the first
   twenty. This is the exact failure the flight order calls silently wrong. */
const fifty = Array.from({ length: 50 }, (_, i) => row(`r${i}`, (i * 37) % 50 || 50));
const pageOf = (rows, size) => rows.slice(0, size);

const wholeThenPage = pageOf(sortListings(fifty, "priceAsc"), 20);
const pageThenWhole = sortListings(pageOf(fifty, 20), "priceAsc");

const cheapest20 = [...fifty].sort((a, b) => a.asking_price - b.asking_price).slice(0, 20);
assert.deepEqual(
  wholeThenPage.map((r) => r.asking_price),
  cheapest20.map((r) => r.asking_price),
  "sort-then-page must yield the twenty lowest in the whole set",
);
assert.notDeepEqual(
  wholeThenPage.map((r) => r.id),
  pageThenWhole.map((r) => r.id),
  "the two strategies must be demonstrably different on this fixture",
);
ok("on a 50-listing fixture, sort-then-page returns the twenty genuinely lowest — page-then-sort provably does not");

/* ── 7 · Result membership and filtering are untouched ───────────────── */
assert.equal(sortListings(base, "priceAsc").length, base.length);
assert.equal(sortListings(withNulls, "priceDesc").length, withNulls.length);
assert.deepEqual(
  [...sortListings(withNulls, "priceAsc")].map((r) => r.id).sort(),
  [...withNulls].map((r) => r.id).sort(),
  "sorting changes order only, never membership",
);
ok("sorting changes order only — never result membership or count");

/* ── 8 · Persistence rides the existing URL state ────────────────────── */
assert.ok(
  /const sort = parseBrowseSort\(searchParams\.get\("sort"\)\)/.test(src),
  "sort must be read from the URL like the other single-value controls",
);
assert.ok(
  /setSingleParam\("sort", value, "default"\)/.test(src),
  "sort must be written through setSingleParam so the default never litters the URL",
);
assert.ok(
  /const qs = searchParams\.toString\(\)/.test(src),
  "returnTo must still be built from the whole query string, which now carries the sort",
);
ok("sort lives in the URL, so Back-to-Browse preserves it through the existing returnTo — no new mechanism");

/* ── 9 · The control, beside the page-size control ───────────────────── */
assert.ok(collector.length > 0);
assert.ok(/Low to High/.test(src) && /High to Low/.test(src), "both directions must be offered");
const sortBlock = src.slice(src.indexOf('{/* Price sort'), src.indexOf('{([20, 40, "all"] as const)'));
assert.ok(sortBlock.length > 0, "the sort control must sit immediately before the page-size control");
assert.ok(
  sortBlock.includes('text-[9px] uppercase tracking-[1px]'),
  "the sort control must borrow the existing control typography, not introduce a new one",
);
assert.ok(
  sortBlock.includes("border-[var(--border-gold)] text-[var(--gold)]"),
  "the active state must be the room's existing gold, not a new visual language",
);
assert.ok(sortBlock.includes('aria-pressed={sort === key}'), "selected direction must be exposed to assistive tech");
assert.ok(
  sortBlock.includes('setSort(sort === key ? "default" : key)'),
  "pressing the active direction must return to the default order",
);
ok("one restrained control beside 20/40/ALL, in the room's existing language, with a way back to default");

/* ── 10 · Price proximity — anchored to the plate, not to an offset ──── */
const plateAnchor = /<div style=\{\{ maxWidth: 420 \}\}>\s*<Link/;
assert.ok(plateAnchor.test(collector), "identity and spec plate must share ONE width-capped column");
ok("identity and the spec plate share one capped column — the price edge is the spec-value edge by construction");

const modelLine = collector.slice(
  collector.indexOf('className="mb-[2px] flex items-center gap-2"'),
  collector.indexOf('{row.reference}'),
);
assert.ok(modelLine.includes("formatPrice(row.asking_price, row.asking_currency)"), "price rides the model line");
assert.ok(modelLine.includes("ml-auto"), "ml-auto sends only the price to the edge");
assert.ok(modelLine.includes("hidden") && modelLine.includes("md:inline"), "the model-line price is desktop-only");
assert.ok(
  modelLine.indexOf("In Hand Verified") < modelLine.indexOf("formatPrice"),
  "the shield stays beside the name; the price goes to the edge after it",
);
ok("the price rides the model line at md+, level with the watch name, shield undisturbed");

/* No hardcoded horizontal offset was introduced to fake the alignment. */
assert.ok(
  !/(left|right|marginLeft|marginRight):\s*\d{3,}/.test(collector),
  "no three-digit hardcoded horizontal offset may position the price",
);
ok("no hardcoded offset — the alignment is structural, so a six-spec listing cannot drift it");

/* ── 11 · Mobile is deliberately untouched ───────────────────────────── */
const rail = collector.slice(collector.indexOf("Right — workflow actions"), collector.indexOf("Compare — selection only"));
assert.ok(rail.includes("md:hidden"), "the rail keeps the price below md");
assert.ok(
  rail.includes("md:justify-end"),
  "with the price display:none at md+, the lone button block must be pinned to the bottom edge, not pulled to the top",
);
ok("phone keeps its price exactly where it was; Compare/Add to Catalogue stay at the bottom edge on desktop");

/* ── 12 · The far right stays the actions' ────────────────────────────── */
assert.ok(rail.includes("md:w-[190px]"), "the action rail keeps its width");
assert.ok(collector.includes("Add to Catalogue"), "Add to Catalogue survives");
assert.ok(collector.includes("toggleCompare(row.id)"), "Compare survives");
assert.ok(collector.includes("listingHref(row.id)"), "listing links survive");
ok("the far-right area remains COMPARE / ADD TO CATALOGUE; compare, catalogue and listing links all intact");

console.log(`\n  browse-price-sort: ${n} sections, all assertions passed`);
