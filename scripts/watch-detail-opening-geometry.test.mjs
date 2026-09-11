import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* ── Watch Detail opening geometry: hero and right rail never share pixels ──
   The invariant is geometric: at every desktop width and height, and for
   every photograph shape, the rendered hero's right edge must not pass the
   right rail's painted left edge, and the photo arrows (which since v8.54
   are pinned to the stable governed stage, not the aspect-sized hero) must
   stay out of the rail and must not move when the photograph changes.

   There is no headless browser in this repo, so the proof is the layout
   arithmetic itself, read from the live source strings (grid template, gap
   token, rail pull, gallery width formula, stage ceiling, cell reserve). If
   any of those strings change, the model changes with them; if the model
   ever drifts from the browser, the LIVE FIXTURES below fail first — they
   are getBoundingClientRect() values measured on production on 2026-09-10.
   Run: node scripts/watch-detail-opening-geometry.test.mjs
   ─────────────────────────────────────────────────────────────────────── */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const page = read("app/listings/[id]/page.tsx");
const gallery = read("components/ListingGallery.tsx");
const globals = read("app/globals.css");

const num = (re, src, label) => {
  const m = re.exec(src);
  assert.ok(m, `${label}: pattern not found`);
  return Number(m[1]);
};

/* ── The composition, read from source ───────────────────────────────── */

const grid = /min-\[56rem\]:grid-cols-\[minmax\(0,(\d+)px\)_clamp\((\d+)px,(\d+)vw,(\d+)px\)\]/.exec(page);
assert.ok(grid, "opening grid template");
const PRIMARY_CAP = Number(grid[1]);
const RAIL_MIN = Number(grid[2]);
const RAIL_VW = Number(grid[3]) / 100;
const RAIL_MAX = Number(grid[4]);
assert.match(page, /min-\[56rem\]:gap-x-\[var\(--space-6\)\]/);
const GAP = num(/--space-6:\s*(\d+)px/, globals, "--space-6");
const railLine = /<aside data-purchase-rail="" className="([^"]+)"/.exec(page);
assert.ok(railLine, "rail aside");
assert.match(railLine[1], /^hidden /, "rail is absent below the handoff");
const RAIL_PULL = num(/min-\[56rem\]:-translate-x-\[(\d+)px\]/, railLine[1], "rail pull");

/* Page wrapper: 82px left content gutter from the handoff; right padding is
   32px (sm:px-8) below 67rem and 24px (pr-6) from 67rem; 1438px overall cap. */
assert.match(page, /min-\[56rem\]:ml-\[50px\][^"]*min-\[67rem\]:max-w-\[1438px\] min-\[67rem\]:pl-\[82px\] min-\[67rem\]:pr-6/);
assert.match(page, /px-6 py-8 sm:px-8/);
const WRAP_CAP = 1438, LEFT = 82, RIGHT_BELOW_67 = 32, RIGHT_ABOVE_67 = 24;

/* The gallery cell (grid column 1, row 1). A right padding here is the
   hero-territory reserve: the strip of the primary track the pulled rail
   paints over, and which the photograph must therefore not use. */
const cellLine = /<div className="relative min-\[56rem\]:col-start-1 min-\[56rem\]:row-start-1([^"]*)">\s*\{\/\* SECTION 1/.exec(page);
assert.ok(cellLine, "gallery cell");
const reserveMatch = /min-\[56rem\]:pr-\[(\d+)px\]/.exec(cellLine[1]);
const CELL_RESERVE = reserveMatch ? Number(reserveMatch[1]) : 0;

/* Gallery: its own monotonic width, then a square stage capped at 60vh, then
   the exact-aspect hero that takes the largest rectangle fitting both. */
const gal = /data-listing-gallery="" className="w-full max-w-\[(\d+)px\] min-\[56rem\]:max-w-\[min\((\d+)px,calc\(100vw_-_(\d+)px\)\)\]"/.exec(gallery);
assert.ok(gal, "gallery wrapper");
const GALLERY_NARROW_MAX = Number(gal[1]);
const GALLERY_CAP = Number(gal[2]);
const GALLERY_VW_MINUS = Number(gal[3]);
const STAGE_RE = /<div data-listing-stage="" className="relative flex aspect-square max-h-\[(\d+)vh\] w-full items-center justify-center \[container-type:size\]">/;
const STAGE_VH = num(STAGE_RE, gallery, "stage ceiling") / 100;
assert.match(gallery, /width: `min\(100cqw, calc\(100cqh \* \$\{heroAspect\}\)\)`/);
/* Resting arrows: children of the STAGE (v8.54), inset 12px from ITS edges.
   The stage is the gallery's full width, so arrow x is a function of the
   gallery box alone and never of heroAspect. */
const ARROW = /className=\{`\$\{stageArrowClass\} (left|right)-3`\}/g;
assert.equal((gallery.match(ARROW) ?? []).length, 2, "both resting arrows are inset 12px inside the stage");
assert.match(gallery, /const stageArrowClass =\s*"absolute top-1\/2 z-10 flex h-11 w-11/);
const ARROW_INSET = 12, ARROW_SIZE = 44;

/* Measured on production: the classic desktop scrollbar. */
const SCROLLBAR = 15;

/* ── The layout model ─────────────────────────────────────────────────── */

function layout(vw, vh, aspect) {
  const doc = vw - SCROLLBAR;
  const above67 = vw >= 67 * 16;
  const right = above67 ? RIGHT_ABOVE_67 : RIGHT_BELOW_67;
  const content = Math.min(doc, WRAP_CAP) - LEFT - right;
  const gridLeft = above67 ? Math.max(LEFT, (doc - WRAP_CAP) / 2 + LEFT) : LEFT;
  const rail = Math.min(RAIL_MAX, Math.max(RAIL_MIN, RAIL_VW * vw));
  const cell = Math.min(PRIMARY_CAP, content - rail - GAP);
  const cellLeft = gridLeft;
  const cellRight = cellLeft + cell;
  const railLeft = cellRight + GAP - RAIL_PULL;
  const galleryBox = cell - CELL_RESERVE;
  const galleryW = Math.min(galleryBox, GALLERY_CAP, vw - GALLERY_VW_MINUS);
  const stageH = Math.min(galleryW, STAGE_VH * vh);
  const heroW = Math.min(galleryW, stageH * aspect);
  const heroLeft = cellLeft + (galleryW - heroW) / 2;
  const heroRight = heroLeft + heroW;
  const stageLeft = cellLeft, stageRight = cellLeft + galleryW;
  const nextRight = stageRight - ARROW_INSET;
  const prevLeft = stageLeft + ARROW_INSET;
  return { doc, cell, cellLeft, cellRight, rail, railLeft, galleryW, heroW, heroLeft, heroRight, stageLeft, stageRight, nextRight, prevLeft, gridRight: cellRight + GAP + rail };
}

/* ── LIVE FIXTURES: production, Breitling p34666, 2026-09-10 ─────────── */

test("the model reproduces production rectangles measured today", () => {
  const cases = [
    { vw: 1440, vh: 900,  aspect: 0.75, cell: 974, railLeft: 1026, heroW: 405, heroRight: 772 },
    { vw: 1440, vh: 1500, aspect: 1,    cell: 974, railLeft: 1026, heroW: 900, heroRight: 1019 },
    { vw: 1920, vh: 1200, aspect: 1,    cell: 974, railLeft: 1259, heroW: 720, heroRight: 1162 },
    { vw: 1280, vh: 900,  aspect: 1,    cell: 879, railLeft: 931,  heroW: 540, heroRight: 791 },
    { vw: 896,  vh: 900,  aspect: 1,    cell: 519, railLeft: 571,  heroW: 518, heroRight: 600 },
    { vw: 1000, vh: 1400, aspect: 1,    cell: 623, railLeft: 675,  heroW: 622, heroRight: 704 },
  ];
  for (const c of cases) {
    const m = layout(c.vw, c.vh, c.aspect);
    const tol = 2 + CELL_RESERVE; // the fixtures predate any reserve; a reserve narrows the hero on purpose
    assert.ok(Math.abs(m.cell - c.cell) <= 1, `${c.vw}x${c.vh} cell ${m.cell} vs live ${c.cell}`);
    assert.ok(Math.abs(m.railLeft - c.railLeft) <= 1, `${c.vw}x${c.vh} railLeft ${m.railLeft} vs live ${c.railLeft}`);
    assert.ok(Math.abs(m.heroW - c.heroW) <= tol, `${c.vw}x${c.vh} heroW ${m.heroW} vs live ${c.heroW}`);
    assert.ok(Math.abs(m.heroRight - c.heroRight) <= tol, `${c.vw}x${c.vh} heroRight ${m.heroRight} vs live ${c.heroRight}`);
  }
});

/* ── The invariant ────────────────────────────────────────────────────── */

const WIDTHS = [];
for (let w = 896; w <= 1920; w += 8) WIDTHS.push(w);
const HEIGHTS = [700, 800, 900, 1080, 1200, 1440, 1500, 1700];
const ASPECTS = [0.75, 1, 4 / 3, 3 / 2, 16 / 9];

test("hero and right rail never intersect at any desktop width, height or photograph shape", () => {
  const failures = [];
  for (const vw of WIDTHS) for (const vh of HEIGHTS) for (const a of ASPECTS) {
    const m = layout(vw, vh, a);
    if (m.heroRight > m.railLeft + 0.5) failures.push(`${vw}x${vh} aspect ${a.toFixed(2)}: hero right ${m.heroRight.toFixed(0)} > rail left ${m.railLeft.toFixed(0)} (overlap ${(m.heroRight - m.railLeft).toFixed(0)}px)`);
  }
  assert.equal(failures.length, 0, `${failures.length} colliding combinations, e.g.\n  ` + failures.slice(0, 6).join("\n  "));
});

test("the photo arrows stay inside the governed stage and out of the rail", () => {
  for (const vw of WIDTHS) for (const vh of HEIGHTS) for (const a of ASPECTS) {
    const m = layout(vw, vh, a);
    assert.ok(m.nextRight <= m.stageRight && m.nextRight - ARROW_SIZE >= m.stageLeft, `${vw}x${vh}: next arrow outside stage`);
    assert.ok(m.prevLeft >= m.stageLeft && m.prevLeft + ARROW_SIZE <= m.stageRight, `${vw}x${vh}: prev arrow outside stage`);
    assert.ok(m.nextRight <= m.railLeft, `${vw}x${vh} aspect ${a.toFixed(2)}: next arrow enters the rail`);
  }
});

/* ── v8.54: the arrows do not move when the photograph changes ─────────
   Founder ruling: like Inspect Photo. At a fixed viewport, paging from a
   portrait to a square to a landscape photograph changes the picture and
   nothing else. Previous.left/top and Next.right/top are invariant across
   every photograph shape, and the arrow coordinates are independent of the
   hero entirely — a change of hero width moves the hero, never an arrow. */
test("at a fixed viewport, Previous and Next keep their exact coordinates across portrait, square and landscape", () => {
  const SHAPES = [0.75, 1, 4 / 3, 3 / 2, 16 / 9, 0.6, 2];
  for (const vw of WIDTHS) for (const vh of HEIGHTS) {
    const first = layout(vw, vh, SHAPES[0]);
    const stageH = Math.min(first.galleryW, STAGE_VH * vh);
    const arrowTop = stageH / 2 - ARROW_SIZE / 2; // top-1/2 -translate-y-1/2 of the stage
    for (const a of SHAPES) {
      const m = layout(vw, vh, a);
      assert.equal(m.prevLeft, first.prevLeft, `${vw}x${vh} aspect ${a.toFixed(2)}: Previous.left walked ${first.prevLeft.toFixed(1)} -> ${m.prevLeft.toFixed(1)}`);
      assert.equal(m.nextRight, first.nextRight, `${vw}x${vh} aspect ${a.toFixed(2)}: Next.right walked ${first.nextRight.toFixed(1)} -> ${m.nextRight.toFixed(1)}`);
      // The stage's height is the min of its width and 60vh, aspect-free, so top is invariant too.
      assert.equal(Math.min(m.galleryW, STAGE_VH * vh) / 2 - ARROW_SIZE / 2, arrowTop, `${vw}x${vh}: arrow top walked`);
    }
    // And the hero really does change under the still arrows (the model is not degenerate).
    const widths = new Set(SHAPES.map((a) => layout(vw, vh, a).heroW.toFixed(1)));
    assert.ok(widths.size > 1, `${vw}x${vh}: hero width did not vary across shapes`);
  }
});

test("the resting arrows are children of the stage, and no arrow is nested in the hero wrapper", () => {
  const stageStart = gallery.search(STAGE_RE);
  const heroStart = gallery.indexOf('data-listing-hero=""');
  assert.ok(stageStart > 0 && heroStart > stageStart, "hero wrapper is inside the stage");
  // The hero wrapper closes at the loupe button's parent; the arrows come after it.
  const loupe = gallery.indexOf('aria-label="Inspect photo"', heroStart);
  const heroBlock = gallery.slice(heroStart, loupe);
  assert.doesNotMatch(heroBlock, /aria-label="(Previous|Next) photo"/, "an arrow sits inside data-listing-hero");
  const prev = gallery.indexOf('aria-label="Previous photo"', loupe);
  const next = gallery.indexOf('aria-label="Next photo"', loupe);
  assert.ok(prev > loupe && next > prev, "both resting arrows follow the hero wrapper inside the stage");
  // Ends behaviour unchanged: Previous gated on hasPrev, Next on hasNext.
  const afterLoupe = gallery.slice(loupe, next + 400);
  assert.match(afterLoupe, /\{hasPrev && \(\s*<button[\s\S]*?aria-label="Previous photo"/);
  assert.match(afterLoupe, /\{hasNext && \(\s*<button[\s\S]*?aria-label="Next photo"/);
  assert.match(afterLoupe, /setActive\(\(i\) => Math\.max\(0, i - 1\)\)/);
  assert.match(afterLoupe, /setActive\(\(i\) => Math\.min\(photos\.length - 1, i \+ 1\)\)/);
  assert.match(afterLoupe, /<NavArrowMark flip /);
  // The stage is positioned so absolute children resolve against IT, not the page.
  assert.match(gallery, /data-listing-stage="" className="relative /);
  // Inspection-room arrows untouched.
  assert.equal((gallery.match(/className=\{roomArrowClass\}/g) ?? []).length, 2);
  // README states the law.
  const readme = read("components/ListingGallery.README.md");
  assert.match(readme, /Resting\s+photo-navigation arrows are pinned to the stable governed stage, not the active\s+photograph\./);
});

test("the handoff has no band where both systems overlap, and nothing overflows the document", () => {
  for (const vw of [896, 897, 900, 904, 912]) for (const vh of HEIGHTS) for (const a of ASPECTS) {
    const m = layout(vw, vh, a);
    assert.ok(m.heroRight <= m.railLeft + 0.5, `${vw}x${vh} aspect ${a.toFixed(2)}: overlap at the handoff`);
  }
  for (const vw of WIDTHS) {
    const m = layout(vw, 900, 1);
    assert.ok(m.gridRight <= m.doc, `${vw}: opening grid overflows the document`);
    assert.ok(m.railLeft + m.rail <= m.doc, `${vw}: rail overflows the document`);
    assert.ok(m.heroW > 0 && m.galleryW > 0, `${vw}: hero collapsed`);
  }
});

test("the reserve is exactly the strip the pulled rail claims from the primary, expressed once", () => {
  assert.equal(CELL_RESERVE, RAIL_PULL - GAP, `cell reserve must equal rail pull (${RAIL_PULL}) minus gap (${GAP})`);
});

/* ── Evidence rules the fix must not break ───────────────────────────── */

test("the photograph stays whole and the mechanism unchanged", () => {
  assert.match(gallery, /className="h-full w-full rounded-lg object-contain"/);
  // The resting hero block itself never crops (thumbnail tiles elsewhere may).
  const heroBlock = gallery.slice(gallery.indexOf('data-listing-hero=""'), gallery.indexOf('aria-label="Inspect photo"'));
  assert.doesNotMatch(heroBlock, /object-cover/);
  assert.match(gallery, /data-listing-hero=""\s+className="relative max-h-full max-w-full"/);
  // The stage still has no overflow clip that could hide valid evidence.
  const stage = STAGE_RE.exec(gallery);
  assert.ok(stage && !/overflow-hidden/.test(stage[0]));
  // Below the handoff the gallery keeps its narrow edge and the rail is gone.
  assert.equal(GALLERY_NARROW_MAX, 518);
  assert.match(page, /data-purchase-inline="" className="min-\[56rem\]:hidden"/);
});
