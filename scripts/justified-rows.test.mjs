/* ════════════════════════════════════════════════════════════════════════
   JUSTIFIED ROWS — the supporting-photo rail

   Run: node --experimental-strip-types scripts/justified-rows.test.mjs

   The property that makes the layout read as deliberate rather than ragged
   is that every full row fills the column EXACTLY. That is arithmetic, so
   it is proven by arithmetic here rather than by looking at it.
   ════════════════════════════════════════════════════════════════════════ */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { justifyRows, justifiedHeight } from "../lib/media/justifiedRows.ts";

let n = 0;
const ok = (label, cond) => { n += 1; assert.ok(cond, label); };
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const WIDTH = 168;
const OPTS = { targetHeight: 78, gap: 6, maxRowHeight: 132 };
const rowsOf = (tiles) => {
  const m = new Map();
  for (const t of tiles) m.set(t.row, [...(m.get(t.row) ?? []), t]);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
};
const rowWidth = (row, gap = 6) =>
  row.reduce((s, t) => s + t.width, 0) + gap * (row.length - 1);

/* ── 1 · every FULL row fills the column exactly ───────────────────────── */
{
  const items = [
    { index: 0, aspect: 1.5 },   // landscape
    { index: 1, aspect: 0.75 },  // portrait
    { index: 2, aspect: 0.75 },  // portrait
    { index: 3, aspect: 1.33 },  // landscape
    { index: 4, aspect: 1.0 },   // square
  ];
  const tiles = justifyRows(items, WIDTH, OPTS);
  const rows = rowsOf(tiles);

  ok("J1 every photograph gets exactly one tile", tiles.length === items.length);
  ok("J1 no photograph is lost or duplicated",
    new Set(tiles.map((t) => t.index)).size === items.length);

  rows.slice(0, -1).forEach((row, i) => {
    ok(`J1 full row ${i} fills the column exactly`, near(rowWidth(row), WIDTH));
  });

  rows.forEach((row, i) => {
    const h = row[0].height;
    ok(`J1 row ${i} shares one height across its tiles`,
      row.every((t) => near(t.height, h)));
  });
}

/* ── 2 · SHAPE IS PRESERVED — the whole point ──────────────────────────── */
{
  const aspects = [2.0, 0.5, 1.0, 1.6, 0.66];
  const tiles = justifyRows(aspects.map((a, i) => ({ index: i, aspect: a })), WIDTH, OPTS);
  tiles.forEach((t) => {
    ok(`J2 tile ${t.index} keeps its own aspect (${aspects[t.index]})`,
      near(t.width / t.height, aspects[t.index], 0.001));
  });
  ok("J2 a wide photograph is wider than a narrow one at rail size",
    tiles.find((t) => t.index === 0).width > tiles.find((t) => t.index === 1).width);
}

/* ── 3 · PACKING: wide alone, narrow paired ────────────────────────────── */
{
  /* Two portraits at 0.5 are narrow enough to share a row; one 2.0
     landscape is wide enough to need its own. */
  const rows = rowsOf(justifyRows(
    [{ index: 0, aspect: 2.0 }, { index: 1, aspect: 0.5 }, { index: 2, aspect: 0.5 }],
    WIDTH, OPTS
  ));
  ok("J3 the wide photograph takes a row alone", rows[0].length === 1 && rows[0][0].index === 0);
  ok("J3 the two narrow ones share the next", rows[1].length === 2);
  /* That shared row is also the LAST row, so the cap governs it and it is
     allowed to end short — asserting "fills the column" here would have
     been asserting the bug the cap exists to prevent. */
  ok("J3 the shared row is capped rather than stretched", rows[1][0].height <= OPTS.maxRowHeight + 0.001);
  ok("J3 and both tiles in it keep their own aspect",
    rows[1].every((t) => near(t.width / t.height, 0.5, 0.001)));

  /* A full (non-final) shared row DOES fill the column — proven with a
     fourth photograph so the pair is no longer last. */
  const four = rowsOf(justifyRows(
    [{ index: 0, aspect: 0.5 }, { index: 1, aspect: 0.5 }, { index: 2, aspect: 0.5 }, { index: 3, aspect: 0.5 }],
    WIDTH, OPTS
  ));
  ok("J3 a shared row that is not last fills the column exactly",
    four.length > 1 && near(rowWidth(four[0]), WIDTH));
}

/* ── 4 · THE LAST ROW IS CAPPED ────────────────────────────────────────
   A lone portrait left over at the end, justified to full width, becomes
   enormous — taller than every row above it, which reads as a broken rail
   rather than as a layout. It is allowed to end short instead. */
{
  const tiles = justifyRows(
    [{ index: 0, aspect: 1.5 }, { index: 1, aspect: 1.5 }, { index: 2, aspect: 0.5 }],
    WIDTH, OPTS
  );
  const rows = rowsOf(tiles);
  const last = rows[rows.length - 1];
  ok("J4 the final row never exceeds the cap",
    last.every((t) => t.height <= OPTS.maxRowHeight + 0.001));
  ok("J4 an uncapped lone portrait would have been far taller",
    WIDTH / 0.5 > OPTS.maxRowHeight * 2);
  ok("J4 and it is allowed to end short rather than stretch",
    rowWidth(last) <= WIDTH + 0.001);
}

/* ── 5 · UNMEASURED PHOTOGRAPHS STILL GET A TILE ───────────────────────
   A source whose dimensions have not arrived yet must not vanish from the
   rail — an unreachable photograph is worse than a briefly square one. */
{
  const tiles = justifyRows(
    [{ index: 0, aspect: NaN }, { index: 1, aspect: 0 }, { index: 2, aspect: -3 }, { index: 3, aspect: 1.5 }],
    WIDTH, OPTS
  );
  ok("J5 every photograph is laid out even with no measurement", tiles.length === 4);
  ok("J5 an unmeasured photograph is treated as square",
    tiles.filter((t) => t.index < 3).every((t) => near(t.width / t.height, 1, 0.001)));
}

/* ── 6 · DEGENERATE INPUT ──────────────────────────────────────────────── */
{
  ok("J6 no photographs, no tiles", justifyRows([], WIDTH, OPTS).length === 0);
  ok("J6 an unmeasured column produces nothing rather than nonsense",
    justifyRows([{ index: 0, aspect: 1 }], 0, OPTS).length === 0);
  ok("J6 a single photograph still gets its tile",
    justifyRows([{ index: 0, aspect: 1.4 }], WIDTH, OPTS).length === 1);
}

/* ── 7 · HEIGHT IS PREDICTABLE WITHOUT THE DOM ─────────────────────────── */
{
  const tiles = justifyRows(
    [{ index: 0, aspect: 1.5 }, { index: 1, aspect: 0.75 }, { index: 2, aspect: 0.75 }],
    WIDTH, OPTS
  );
  const rows = rowsOf(tiles);
  const expected = rows.reduce((s, r) => s + r[0].height, 0) + 6 * (rows.length - 1);
  ok("J7 total height matches the rows it describes",
    near(justifiedHeight(tiles, 6), expected));
  ok("J7 an empty rail has no height", justifiedHeight([], 6) === 0);
}

/* ── 8 · THE RAIL AND THE ROOM, pinned at the source ───────────────────── */
{
  const rail = read("components/InspectionPhotoRail.tsx");
  const gallery = read("components/ListingGallery.tsx");

  ok("R1 tiles are sized from each photograph's measured aspect",
    /probe\.naturalWidth \/ probe\.naturalHeight/.test(rail));
  ok("R1 the rail lays out through the justified algorithm",
    /justifyRows\(/.test(rail));
  /* Comments stripped before the check: this file's own header explains
     what h-14 w-14 used to be, and asserting over prose would be catching
     the documentation rather than the code. The resting listing page's
     strip is deliberately untouched by this flight and is not in scope. */
  const railCode = rail.replace(/\/\*[\s\S]*?\*\//g, "");
  ok("R1 the viewer's rail no longer forces a fixed square tile",
    !/h-14 w-14/.test(railCode) && !/w-14/.test(railCode));
  ok("R1 tiles are sized in pixels from the layout, not by a class",
    /style=\{\{ width: `\$\{width\}px`, height: `\$\{height\}px` \}\}/.test(railCode));

  ok("R2 the rail is a column beside the stage on wide screens",
    /orientation="column"/.test(gallery) && /w-\[168px\]/.test(rail));
  ok("R2 and a band beneath it on narrow ones, where a column would cost the photograph width",
    /orientation="row"/.test(gallery) && /min-\[56rem\]:hidden/.test(gallery));

  ok("R3 the hint sits below the stage, not on the photograph",
    /showZoomHint && \(/.test(gallery) && /Ctrl \+ scroll to zoom · drag to inspect/.test(gallery));
  ok("R3 the hint no longer lives inside the photograph viewport",
    !/Ctrl \+ scroll/.test(read("components/InspectionViewport.tsx")));
  ok("R3 its band is reserved whether or not it shows, so it cannot move the stage",
    /flex h-6 shrink-0 items-center justify-center/.test(gallery));
  ok("R3 discovery is remembered rather than re-nagged at every Fit",
    /zoomDiscovered/.test(gallery) && /setZoomDiscovered\(true\)/.test(gallery));
  ok("R3 the hint stays away when the source has no detail to reach",
    /zoomState\.maxScale > 1\.01 && !zoomDiscovered/.test(gallery));

  ok("R4 the zoom capability is untouched by the recomposition",
    /InspectionViewport/.test(gallery) && /key=\{heroUrl\}/.test(gallery));
}

console.log(`justified-rows: ${n} assertions passed`);
