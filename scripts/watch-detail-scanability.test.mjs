import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  RESERVED,
  SNAPSHOT_SEQUENCE,
  chunkRows,
  composeWatchDetailGeography,
} from "../lib/watchDetailGeography.ts";

/* ── Watch Detail factual scanability (build order 2026-09-10) ────────────
   Facts live in predictable places. These tests pin the geography itself
   (the composer) and the layout law the renderer must obey (source pins),
   so a later "tidy" cannot quietly let a missing value pull a later fact
   forward, duplicate Documentation, or dress a plain fact as a link.
   Run: node --experimental-strip-types scripts/watch-detail-scanability.test.mjs
   ─────────────────────────────────────────────────────────────────────── */

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const specs = read("components/ListingSpecs.tsx");
const page = read("app/listings/[id]/page.tsx");

const labels = (rows) => rows.map((row) => row.map((s) => (s.reserved ? "reserved" : s.label)));
const values = (rows) => rows.map((row) => row.map((s) => s.value));

/* The primary acceptance example, exactly as stored in production for the
   Datejust m55915 (read 2026-09-10, not mutated). */
const m55915 = {
  details: {
    caseSizeMm: "31",
    closureType: "Folding / Deployant Clasp",
    caseMaterial: "Stainless Steel",
    casebackType: "Solid",
    crownPresent: true,
    movementType: "Automatic",
    bezelMaterial: "Gold",
    complications: ["Date"],
    dialColorType: "Champagne",
    documentation: "Papers Only",
    serviceHistory: ["Recently Serviced", "Serviced by Independent"],
    includedWithWatch: ["Manual / Booklet", "Service Receipt", "Papers", "Warranty Card", "Extra Links"],
    originalStrapBracelet: true,
  },
  year: "2004",
  condition: "Very Good",
};

/* The published Breitling p34666: material, movement, dial and complications
   are all absent while Year, Condition and Documentation are present. This
   is the missing-value stability case, on real production shape. */
const p34666 = {
  details: { caseSizeMm: "42", documentation: "No Box or Papers", crownPresent: true },
  year: "2026",
  condition: "Good",
};

test("Collector Snapshot is the exact 3 x 3 semantic matrix", () => {
  const geo = composeWatchDetailGeography(m55915.details, m55915.year, m55915.condition);
  assert.deepEqual(labels(geo.snapshot), [
    ["Case Size", "Case Material", "Year"],
    ["Movement", "Dial Color", "Complications"],
    ["Condition", "Documentation", "reserved"],
  ]);
  assert.deepEqual(values(geo.snapshot), [
    ["31 mm", "Stainless Steel", "2004"],
    ["Automatic", "Champagne", "Date"],
    ["Very Good", "Papers Only", ""],
  ]);
  assert.equal(geo.snapshot[2][2], RESERVED);
});

test("Technical Specifications: short facts align, long facts breathe", () => {
  const geo = composeWatchDetailGeography(m55915.details, m55915.year, m55915.condition);
  assert.deepEqual(labels(geo.technical), [
    ["Closure Type", "Caseback", "Bezel Material"],
    ["Crown Present", "Strap / Bracelet & Hardware", "reserved"],
  ]);
  assert.deepEqual(values(geo.technical), [
    ["Folding / Deployant Clasp", "Solid", "Gold"],
    ["Yes", "Original", ""],
  ]);
  assert.deepEqual(
    geo.technicalWide.map((s) => [s.label, s.value]),
    [
      ["Included With Watch", "Manual / Booklet, Service Receipt, Papers, Warranty Card, Extra Links"],
      ["Service & Case History", "Recently Serviced, Serviced by Independent"],
    ],
  );
});

test("Documentation appears once, in the Snapshot, never in Technical Specifications", () => {
  const geo = composeWatchDetailGeography(m55915.details, m55915.year, m55915.condition);
  const everywhere = [
    ...geo.snapshot.flat(),
    ...geo.snapshotExtras,
    ...geo.technical.flat(),
    ...geo.technicalWide,
    ...geo.technicalExtras,
  ];
  const docs = everywhere.filter((s) => s.label === "Documentation");
  assert.equal(docs.length, 1);
  assert.equal(geo.snapshot[2][1].label, "Documentation");
  assert.equal(geo.snapshot[2][1].value, "Papers Only");
  assert.equal(geo.snapshot[2][1].href, undefined, "documentation is descriptive text, never navigation");
  assert.ok(!geo.technical.flat().some((s) => s.label === "Documentation"));
  assert.ok(!geo.technicalWide.some((s) => s.label === "Documentation"));
  // The two concepts stay distinct: status upstairs, itemised contents deeper.
  assert.equal(geo.technicalWide[0].label, "Included With Watch");
});

test("a missing value keeps its slot; later facts never migrate", () => {
  const geo = composeWatchDetailGeography(p34666.details, p34666.year, p34666.condition);
  assert.deepEqual(labels(geo.snapshot), [
    ["Case Size", "Case Material", "Year"],
    ["Movement", "Dial Color", "Complications"],
    ["Condition", "Documentation", "reserved"],
  ]);
  assert.deepEqual(values(geo.snapshot), [
    ["42 mm", "", "2026"],
    ["", "", ""],
    ["Good", "No Box or Papers", ""],
  ]);
  // Year is still top-right and Documentation is still row 3 column 2 even
  // though four earlier facts are absent. Nothing slid forward.
  assert.equal(geo.snapshot[0][2].value, "2026");
  assert.equal(geo.snapshot[2][1].value, "No Box or Papers");
  // Absent slots carry no link and no invented vocabulary.
  for (const s of geo.snapshot.flat()) {
    if (s.value === "") assert.equal(s.href, undefined);
  }
  assert.deepEqual(values(geo.technical), [
    ["", "", ""],
    ["Yes", "", ""],
  ]);
  assert.deepEqual(geo.technicalWide.map((s) => s.value), ["", ""]);
});

test("narrow reading order is the governed sequence, whatever is populated", () => {
  for (const sample of [m55915, p34666]) {
    const geo = composeWatchDetailGeography(sample.details, sample.year, sample.condition);
    const order = geo.snapshot.flat().filter((s) => !s.reserved).map((s) => s.label);
    assert.deepEqual(order, [...SNAPSHOT_SEQUENCE]);
  }
});

test("underlining means a real interaction: only byte-exact Browse dimensions link", () => {
  const geo = composeWatchDetailGeography(m55915.details, m55915.year, m55915.condition);
  const linked = geo.snapshot.flat().filter((s) => s.href).map((s) => [s.label, s.href]);
  assert.deepEqual(linked, [
    ["Case Material", "/browse?caseMaterial=Stainless%20Steel"],
    ["Movement", "/browse?movement=Automatic"],
    ["Dial Color", "/browse?dialColor=Champagne"],
  ]);
  // Formatted, derived and descriptive facts stay plain text.
  for (const s of [...geo.technical.flat(), ...geo.technicalWide]) assert.equal(s.href, undefined);
  assert.equal(geo.snapshot[0][0].href, undefined, "Case Size");
  assert.equal(geo.snapshot[0][2].href, undefined, "Year");
  assert.equal(geo.snapshot[2][0].href, undefined, "Condition");
  // A missing value never links to an empty filter.
  const empty = composeWatchDetailGeography({}, null, null);
  for (const s of empty.snapshot.flat()) assert.equal(s.href, undefined);
});

test("facts the matrix does not name are never hidden, and never inside a governed slot", () => {
  const geo = composeWatchDetailGeography(
    {
      ...m55915.details,
      caseThicknessMm: "11.7",
      caseColorFinish: "silver",
      movementFrequency: "28800",
      crystalMaterial: "Sapphire",
    },
    m55915.year,
    m55915.condition,
  );
  // Governed geometry is byte-for-byte what it was without the extras.
  assert.deepEqual(labels(geo.snapshot), [
    ["Case Size", "Case Material", "Year"],
    ["Movement", "Dial Color", "Complications"],
    ["Condition", "Documentation", "reserved"],
  ]);
  assert.deepEqual(
    geo.snapshotExtras.map((s) => [s.label, s.value]),
    [
      ["Case Thickness", "11.7 mm"],
      ["Case Finish", "silver"],
      ["Beat Rate", "28,800 vph (4 Hz)"],
    ],
  );
  assert.deepEqual(geo.technicalExtras.map((s) => [s.label, s.value]), [["Crystal", "Sapphire"]]);
  // Present-only: with nothing extra stored there is nothing extra shown.
  const plain = composeWatchDetailGeography(m55915.details, m55915.year, m55915.condition);
  assert.deepEqual(plain.snapshotExtras, []);
  assert.deepEqual(plain.technicalExtras, []);
  assert.deepEqual(chunkRows(geo.snapshotExtras).map((r) => r.length), [3]);
});

/* ── Renderer law: source pins ─────────────────────────────────────────── */

test("the renderer lays out the composed geography and nothing else", () => {
  assert.match(specs, /composeWatchDetailGeography\(details, year, condition\)/);
  assert.doesNotMatch(specs, /pushSnap|pushTech|snapshotRows|techRows/);
  // Every governed row is its own grid: a gap in one row can never be
  // filled by the next row's first fact. Three columns on desktop; two on a
  // phone since the founder's narrow target of 2026-09-12, which is why this
  // no longer pins `grid-cols-1` at the narrow end.
  assert.match(specs, /const ROW =\s*\n?\s*"grid-cols-2 [^"]*sm:grid-cols-3/);
  assert.match(specs, /<dl key=\{unit\.key\} className=\{className\}>/);
  // Wide rows exist for the long facts.
  assert.match(specs, /const WIDE = "grid-cols-1 /);
  assert.match(specs, /geo\.technicalWide\.map\(\(slot\) => \(\{ key: slot\.key, slots: \[slot\], wide: true \}\)\)/);
  // The reserved cell is the empty third column, not a phantom element.
  assert.match(specs, /\.filter\(\(slot\) => !slot\.reserved\)/);
  // The extras render after the governed rows, through the same Units.
  assert.match(specs, /chunkRows\(geo\.snapshotExtras\)/);
  assert.match(specs, /chunkRows\(geo\.technicalExtras\)/);
});

/* Founder ruling 2026-09-10: below sm an absent slot does not render and a
   row with nothing present does not render; desktop keeps every slot. The
   rule between rows is decided per breakpoint from what is shown, because a
   hidden sibling still satisfies :first-child and would leave a stray rule
   above the first visible phone row. */
test("below sm absent facts leave; on desktop every slot stays", () => {
  assert.match(specs, /const isPresent = \(slot: SpecSlot\) => !slot\.reserved && slot\.value !== ""/);
  // Absent slot: hidden on the phone, a block from sm up.
  assert.match(specs, /className=\{isPresent\(slot\) \? undefined : "hidden sm:block"\}/);
  // Fully absent row: hidden on the phone, a grid from sm up.
  assert.match(specs, /shownNarrow \? "grid" : "hidden sm:grid"/);
  // Rules: narrow decided by earlier VISIBLE rows, desktop by earlier rows.
  assert.match(specs, /narrowRule \? "border-t pt-4" : "border-t-0 pt-0"/);
  assert.match(specs, /wideRule \? "sm:border-t sm:pt-4" : "sm:border-t-0 sm:pt-0"/);
  assert.match(specs, /if \(shownNarrow\) shownBeforeNarrow = true;/);
  assert.match(specs, /shownBeforeWide = true;/);
  assert.doesNotMatch(specs, /first:(border|pt)/);
  // Nothing about desktop geometry moved: three columns from sm, one below.
  assert.match(specs, /sm:grid-cols-3/);
  assert.doesNotMatch(specs, /md:grid-cols|lg:grid-cols/);
});

test("mobile removes the Snapshot heading while desktop keeps its established headings", () => {
  assert.match(specs, /<h2 className=\{HEADING\}>/);
  const mobileStart = specs.indexOf('data-mobile-specifications=""');
  const desktopStart = specs.indexOf('data-desktop-specifications=""');
  assert.ok(mobileStart >= 0 && desktopStart > mobileStart);
  const mobile = specs.slice(mobileStart, desktopStart);
  const desktop = specs.slice(desktopStart);
  assert.match(mobile, /<SectionHeading>Technical Specifications<\/SectionHeading>/);
  assert.doesNotMatch(mobile, /Collector Snapshot/);
  assert.match(desktop, /<SectionHeading>Collector Snapshot<\/SectionHeading>/);
  assert.match(desktop, /<SectionHeading>Technical Specifications<\/SectionHeading>/);
  assert.match(specs, /text-\[11px\] font-medium uppercase tracking-\[0\.22em\] text-\[var\(--gold-dim\)\]/);
  assert.doesNotMatch(specs, /<span[^>]*>\s*Collector Snapshot/);
});

test("labels lift one tier and lose the wide tracking; values stay the star", () => {
  assert.match(specs, /const LABEL = "text-\[12px\] uppercase tracking-\[0\.08em\] text-\[var\(--slate\)\]"/);
  assert.doesNotMatch(specs, /tracking-\[1\.5px\]/);
  assert.match(specs, /font-display text-\[16px\] font-light text-\[var\(--platinum\)\]/);
  // Readability floor: no --ghost / --void on informational text.
  assert.doesNotMatch(specs, /--ghost|--void/);
  // No table boxes, no card-per-fact furniture, no shouting labels.
  assert.doesNotMatch(specs, /<table|rounded-|shadow-|font-bold|bg-\[var\(--stone/);
});

test("underline styling exists only on the real-link branch", () => {
  const underlines = specs.match(/underline/g) ?? [];
  // "underline" and "underline-offset-4" on the one Link className, nothing else.
  assert.equal(underlines.length, 2);
  assert.match(specs, /slot\.href \? \(\s*<Link/);
});

test("no Highlighter, no new destinations, no prototype furniture", () => {
  assert.doesNotMatch(specs, /D9785E|highlight|Highlighter/i);
  assert.doesNotMatch(specs, /\/browse\?/);
  assert.doesNotMatch(specs, /Unknown|N\/A|Not stated|specimen|acceptance/);
  const geo = read("lib/watchDetailGeography.ts");
  assert.doesNotMatch(geo, /D9785E|highlight/i);
  // The only destinations are the three pre-existing byte-exact filters.
  const params = [...geo.matchAll(/browseLink\("([a-zA-Z]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(params, ["caseMaterial", "dialColor", "movement"]);
});

test("the page still mounts the one shared renderer in section order", () => {
  assert.match(page, /import ListingSpecs from "@\/components\/ListingSpecs"/);
  assert.match(page, /<ListingSpecs\s+details=\{details\}\s+year=\{listing\.year\}\s+condition=\{listing\.condition\}\s*\/>/);
  assert.doesNotMatch(page, /two-column spec grid|collapsible Technical Specs/);
});
