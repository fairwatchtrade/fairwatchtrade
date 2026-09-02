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
import { containRect } from "../lib/media/inspectionZoom.ts";

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
    /orientation="column"/.test(gallery) && /flex w-full shrink-0 flex-col/.test(rail));
  ok("R2 and a band beneath it on narrow ones, where a column would cost the photograph width",
    /orientation="row"/.test(gallery) && /min-\[56rem\]:hidden/.test(gallery));

  ok("R3 the hint sits below the stage, not on the photograph",
    /showZoomHint && \(/.test(gallery) && /Ctrl \+ scroll to zoom · drag to inspect/.test(gallery));
  ok("R3 the hint no longer lives inside the photograph viewport",
    !/Ctrl \+ scroll/.test(read("components/InspectionViewport.tsx")));
  ok("R3 its band is reserved whether or not it shows, so it cannot move the stage",
    /flex h-6 shrink-0 items-center/.test(gallery));
  ok("R3 discovery is remembered rather than re-nagged at every Fit",
    /zoomDiscovered/.test(gallery) && /setZoomDiscovered\(true\)/.test(gallery));
  ok("R3 the hint stays away when the source has no detail to reach",
    /zoomState\.maxScale > 1\.01 && !zoomDiscovered/.test(gallery));

  ok("R4 the zoom capability is untouched by the recomposition",
    /InspectionViewport/.test(gallery) && /key=\{heroUrl\}/.test(gallery));
}

/* ── 9 · THE BOUNDED STAGE ─────────────────────────────────────────────
   The stage is sized to the widest rectangle any photograph in the LISTING
   actually occupies. That is what lets the arrows sit on the stage's own
   edges and be both close to the watch and perfectly still — the previous
   two attempts could manage one or the other, never both. Everything below
   fails silently and merely looks slightly wrong, so none of it is left to
   the eye. */
{
  const gallery = read("components/ListingGallery.tsx");
  const viewport = read("components/InspectionViewport.tsx");
  const rail = read("components/InspectionPhotoRail.tsx");

  ok("C1 the stage is sized from photographic SHAPE, never from pixel counts",
    /\.map\(\(n\) => room\.height \* \(n\.w \/ n\.h\)\)/.test(gallery) &&
    !/Math\.min\(room\.height \* \(n\.w \/ n\.h\), n\.w\)/.test(gallery));
  ok("C1 it reserves the rail's actual width, which is now a constant",
    /room\.width - RAIL_WIDTH - ROOM_GAP - STAGE_GUTTERS/.test(gallery));
  ok("C1 and stays full width until every photograph has reported",
    /measured\.some\(\(n\) => !n\)\) return available/.test(gallery));

  ok("C2 width is measured on the room, height on the stage area",
    /ro\.observe\(rowEl\)/.test(gallery) && /ro\.observe\(areaEl\)/.test(gallery));
  ok("C2 the measured room width excludes its own padding",
    /clientWidth - num\(cs\.paddingLeft\) - num\(cs\.paddingRight\)/.test(gallery));
  ok("C2 an explicit stage width overrides flex, which would otherwise ignore it",
    /flex: "0 0 auto", width: stageWidth/.test(gallery));
  ok("C2 the bound is on the STAGE, not the column — so the column can widen alone",
    !/width: stageWidth \+ STAGE_GUTTERS/.test(gallery));
  ok("C2 and the column takes the room's slack, keeping the rail at the edge",
    !/min-\[56rem\]:justify-center/.test(gallery));

  ok("C3 BOTH arrows are pinned to the stage, in plain CSS",
    /left: "calc\(-1 \* var\(--arrow-gutter\)\)"/.test(gallery) &&
    /right: "calc\(-1 \* var\(--arrow-gutter\)\)"/.test(gallery));
  ok("C3 neither arrow is placed from the photograph any more, so neither travels",
    !/heroFitWidth/.test(gallery));

  ok("C4 the measured stage excludes padding, so a wide photograph cannot overflow it",
    /clientWidth - num\(cs\.paddingLeft\) - num\(cs\.paddingRight\)/.test(viewport));

  ok("C5 the rail fills the column the room hands it",
    /flex w-full shrink-0 flex-col/.test(rail));
  /* A FIXED width, and that is what makes "20% narrower" mean anything. The
     rail used to be flex-1 between a min and a max, so it took whatever the
     stage left behind — and tile height in a justified row is the row's
     width divided by however many fit, so a rail that changed width changed
     every thumbnail with it. The same listing rendered different thumbnail
     sizes in different windows, and no single percentage could describe a
     change to them. */
  ok("C5 the rail is a FIXED width, so thumbnail scale cannot follow the window",
    /style=\{wideRoom \? \{ width: RAIL_WIDTH \} : undefined\}/.test(gallery) &&
    /min-\[56rem\]:shrink-0/.test(gallery) && !/min-\[56rem\]:flex-1/.test(gallery));
  ok("C5 tile height is derived from that width rather than typed",
    /targetHeight: \(width - GAP\) \/ 2/.test(rail));

  /* ── The arithmetic and the paint must not drift apart ────────────────
     Each constant is read back out of the Tailwind class it mirrors. These
     are the assertions that will actually catch someone one day: changing a
     padding class without its constant leaves a stage that reserves the
     wrong width and looks merely a little off. */
  const numOf = (re) => { const m = gallery.match(re); return m ? parseFloat(m[1]) : NaN; };
  const RAIL_WIDTH = numOf(/const RAIL_WIDTH = (\d+)/);
  const ROOM_GAP = numOf(/const ROOM_GAP = (\d+)/);
  const STAGE_GUTTERS = numOf(/const STAGE_GUTTERS = (\d+)/);
  const WIDE = gallery.match(/const WIDE_ROOM = "([^"]+)"/)?.[1];

  /* No drift guard needed for the width any more: the rail is sized FROM the
     constant rather than from a class repeating it, so the stage's
     reservation and the rail's occupation are the same number by
     construction. This asserts they stay that way — and that no class
     quietly reintroduces a second copy of the number. */
  ok("C6 the rail is sized from RAIL_WIDTH itself, with no class repeating it",
    Number.isFinite(RAIL_WIDTH) && /width: RAIL_WIDTH/.test(gallery) &&
    !/min-\[56rem\]:w-\[\d+px\]/.test(gallery));
  ok("C6 ROOM_GAP matches the gap class between stage and rail",
    Number.isFinite(ROOM_GAP) && gallery.includes("min-[56rem]:gap-" + ROOM_GAP / 4 + '"'));
  ok("C6 STAGE_GUTTERS matches the padding that holds the arrows",
    (() => {
      const l = gallery.match(/sm:pl-\[([\d.]+)rem\]/);
      const r = gallery.match(/sm:pr-\[([\d.]+)rem\]/);
      return !!l && !!r && (parseFloat(l[1]) + parseFloat(r[1])) * 16 === STAGE_GUTTERS;
    })());
  ok("C6 WIDE_ROOM matches the breakpoint the rail actually switches at",
    !!WIDE && gallery.includes("min-[" + WIDE + "]:flex-row"));

  ok("C7 the stage is sized to the MEDIAN photograph, not the widest",
    /fits\[Math\.floor\(fits\.length \/ 2\)\]/.test(gallery));
  ok("C7 sizing to the widest is gone — one outlier used to take the whole room",
    !/const widest = Math\.max/.test(gallery));

  ok("C8 the inspection room cycles rather than dead-ending at either end",
    /\(i \+ step \+ photos\.length\) % photos\.length/.test(gallery));
  ok("C8 so both of its arrows are always present and neither can appear or vanish",
    /const canCycle = photos\.length > 1;/.test(gallery) &&
    (gallery.match(/\{canCycle && \(/g) ?? []).length === 2);
  ok("C8 and the resting hero above still stops at the ends, unchanged",
    /const hasPrev = active > 0;/.test(gallery) &&
    /const hasNext = active < photos\.length - 1;/.test(gallery));

  ok("C9 the room and the header hang on ONE outer geometry",
    (gallery.match(/max-w-\[1900px\]/g) ?? []).length >= 2);
}

/* ── 10 · THE POLISH PASS ──────────────────────────────────────────────
   Six small requests, each of which fails quietly and looks merely a bit
   wrong rather than broken — which is exactly why they are pinned here. */
{
  const gallery = read("components/ListingGallery.tsx");
  const rail = read("components/InspectionPhotoRail.tsx");

  ok("P1 the rail measures its own content, not its padding",
    /clientWidth - num\(cs\.paddingLeft\) - num\(cs\.paddingRight\)/.test(rail));
  ok("P1 which it must, now that it carries padding on every side",
    /overflow-y-auto py-1\.5 pl-1\.5 pr-3/.test(rail));
  ok("P1 and that padding clears the selection ring, which the scroller clips",
    (() => {
      /* A scroll container clips on BOTH axes once either is not visible, and
         a ring is a box-shadow drawn outside the tile. Every justified row
         fills the content width exactly, so without clearance the ring on a
         row-edge tile is sliced — the "partly broken" gold outline. A 2px
         ring at 2px offset reaches 4px. */
      const m = rail.match(/overflow-y-auto py-([\d.]+) pl-([\d.]+) pr-([\d.]+)/);
      if (!m) return false;
      const px = (v) => parseFloat(v) * 4;
      return px(m[1]) > 4 && px(m[2]) > 4 && px(m[3]) > 4;
    })());

  ok("P2 auto-follow reveals only when the tile is out of view",
    /if \(top < rail\.scrollTop\)/.test(rail) &&
    /bottom > rail\.scrollTop \+ rail\.clientHeight/.test(rail));
  ok("P2 it never recentres, which would slide the whole set on every press",
    !/scrollIntoView/.test(rail) && !/block: "center"/.test(rail));
  ok("P2 and the rail is positioned, or offsetTop would measure the wrong box",
    /"relative flex w-full shrink-0 flex-col/.test(rail));

  ok("P3 selection is ONE decisive ring, standing off the tile",
    /ring-2 ring-\[var\(--gold\)\] ring-offset-2/.test(rail));
  ok("P3 the second gold edge underneath it is gone",
    !/border-\[var\(--gold\)\]/.test(rail));
  ok("P3 the gap is wide enough that adjacent rings cannot collide",
    (() => {
      /* A 2px ring at 2px offset reaches 4px past the tile on every side, so
         neighbours need more than 8px between them or the selection touches
         the tile beside it. This is why the rail gap widened. */
      const gap = parseFloat((rail.match(/const GAP = (\d+)/) ?? [])[1]);
      return Number.isFinite(gap) && gap > 8;
    })());
  ok("P3 and the flex gap class matches the GAP the layout solves against",
    (() => {
      const gap = parseFloat((rail.match(/const GAP = (\d+)/) ?? [])[1]);
      const cls = "gap-" + gap / 4;
      return rail.includes(cls + " ") || rail.includes(cls + '"');
    })());
  ok("P3 focus stays visible and is NOT gold, so it cannot read as selection",
    /focus-visible:outline-\[var\(--ink\)\]/.test(rail) &&
    !/focus-visible:outline-\[var\(--gold\)\]/.test(rail));

  ok("P4 the hero sits on a MAT, bounded to the stage rather than the page",
    /min-\[56rem\]:bg-\[#F1F4F8\]/.test(gallery));
  ok("P4 the mat has a small radius — finished, not announced",
    /min-\[56rem\]:rounded-lg/.test(gallery));
  ok("P4 the rail stays on the room's own tone, outside that mat",
    /min-\[56rem\]:pl-6/.test(gallery) && !/min-\[56rem\]:border-l/.test(gallery));
  ok("P4 the mat is desktop-only, so a phone keeps its bare room",
    !/ sm:bg-\[#F1F4F8\]/.test(gallery) && !/ bg-\[#F1F4F8\]/.test(gallery));

  ok("P5 the control says RESET, and says the same thing to a screen reader",
    />\s*Reset\s*<\/button>/.test(gallery) &&
    /aria-label="Reset the photograph to fit the viewer"/.test(gallery));

  ok("P6 the MAT takes the room's slack, so the rail stays against the edge",
    /flex min-h-0 min-w-0 flex-1 flex-col/.test(gallery) &&
    /flex: "0 0 auto", width: stageWidth/.test(gallery));
}

/* ── 11 · TWO CEILINGS, AND THEY ARE NOT THE SAME JOB ──────────────────
   The listing-level stage represents the SHAPES in the set. A photograph's
   own pixel count is a separate ceiling governing only how large that one
   source may truthfully render.

   Mixing them collapsed the room in production: capping each contribution by
   its own width first let four 160x160 placeholders outvote an 1800x2400
   photograph, and the real watch rendered 160px wide inside a 1032px mat. */
{
  const ROOM_H = 797;
  const AVAILABLE = 888;
  const stageWidth = (naturals, { capByOwnPixels }) => {
    const fits = naturals
      .map((n) => (capByOwnPixels ? Math.min(ROOM_H * (n.w / n.h), n.w) : ROOM_H * (n.w / n.h)))
      .sort((a, b) => a - b);
    return Math.min(AVAILABLE, Math.max(1, Math.round(fits[Math.floor(fits.length / 2)])));
  };

  /* The real listing, measured live: one photograph and four placeholders. */
  const BREITLING = [
    { w: 1800, h: 2400 },
    { w: 160, h: 160 }, { w: 160, h: 160 }, { w: 160, h: 160 }, { w: 160, h: 160 },
  ];

  ok("T1 four 160x160 placeholders cannot collapse the stage",
    stageWidth(BREITLING, { capByOwnPixels: false }) === 797);
  ok("T1 and the defect is pinned: capping by own pixels DID collapse it to 160",
    stageWidth(BREITLING, { capByOwnPixels: true }) === 160);

  /* The per-photograph ceiling must still bite INSIDE that correct stage. */
  const stage = { width: 797, height: ROOM_H };
  const real = containRect(stage, 1800 / 2400, { width: 1800, height: 2400 });
  const placeholder = containRect(stage, 1, { width: 160, height: 160 });
  ok("T2 the real photograph fills the stage's height, limited by shape not pixels",
    Math.round(real.height) === ROOM_H && Math.round(real.width) === 598);
  ok("T2 a low-resolution source is still held to its own native detail",
    Math.round(placeholder.width) === 160 && Math.round(placeholder.height) === 160);

  /* Rolex: eleven photographs, all high resolution. Removing the cap must
     move nothing, because no source was being clipped by it. */
  const ROLEX = [0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.55, 1.32, 1.33, 1.78]
    .map((a) => ({ w: Math.round(3000 * a), h: 3000 }));
  ok("T3 Rolex is unchanged with the cap removed",
    stageWidth(ROLEX, { capByOwnPixels: false }) === stageWidth(ROLEX, { capByOwnPixels: true }));
  ok("T3 and still sizes to the typical portrait rather than to the 16:9 outlier",
    stageWidth(ROLEX, { capByOwnPixels: false }) === 598);
}

console.log(`justified-rows: ${n} assertions passed`);
