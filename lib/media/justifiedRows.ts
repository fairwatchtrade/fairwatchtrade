/* ════════════════════════════════════════════════════════════════════════
   JUSTIFIED ROWS — the supporting-photo rail

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "Thumbnails should all be the same size."

   A uniform grid of squares needs every photograph cropped into the same
   box, and that crop throws away the one thing a thumbnail is good for. A
   dial macro, a caseback engraving, a wrist shot and a box-and-papers flat
   lay are different SHAPES, and the shape is legible long before the
   content is. Crop them all square and a collector has to click through
   five identical tiles to find the one they wanted.

   It also quietly breaks the rule the rest of this viewer keeps. The
   inspection stage is object-contain, and the resting hero deliberately
   refuses the seller's focal crop, because subtracting evidence to improve
   presentation is the trade this product does not make. A square-cropped
   rail was making that trade at small scale — a caseback engraving near the
   frame edge simply vanished from its own thumbnail.

   ── THE ALGORITHM ──────────────────────────────────────────────────────
   Rows of a common height, each filling the container's width exactly:

     · walk the photographs, adding to a row while the row still fits;
     · when it would overflow, close the row and solve for the height that
       makes it fill the width precisely;
     · a wide photograph fills a row alone, two narrow ones share.

   Nothing is cropped, because shape decides the packing rather than the
   packing deciding the shape.

   Pure — no DOM, no React. The arithmetic is provable by arithmetic.
   ════════════════════════════════════════════════════════════════════════ */

export type JustifiedInput = {
  /** Position in the caller's own list; carried through untouched so the
      caller never has to match tiles back up by guessing. */
  index: number;
  /** width / height. A non-finite or non-positive aspect is treated as
      square rather than thrown away — an unmeasured photograph must still
      get a tile, or it becomes unreachable. */
  aspect: number;
};

export type JustifiedTile = {
  index: number;
  width: number;
  height: number;
  row: number;
};

export type JustifyOptions = {
  /** The height a row aims for before it is solved to fit the width. */
  targetHeight?: number;
  gap?: number;
  /** Ceiling for the final row. Without it, one lone portrait photograph in
      the last row is stretched to the full column width and becomes
      enormous — the row is "justified" and the rail looks broken. */
  maxRowHeight?: number;
};

const SAFE_ASPECT = 1;

function safeAspect(aspect: number): number {
  return Number.isFinite(aspect) && aspect > 0 ? aspect : SAFE_ASPECT;
}

export function justifyRows(
  items: readonly JustifiedInput[],
  containerWidth: number,
  options: JustifyOptions = {}
): JustifiedTile[] {
  const targetHeight = options.targetHeight ?? 96;
  const gap = options.gap ?? 8;
  const maxRowHeight = options.maxRowHeight ?? targetHeight * 1.6;

  if (items.length === 0 || !(containerWidth > 0)) return [];

  const tiles: JustifiedTile[] = [];
  let row: JustifiedInput[] = [];
  let rowIndex = 0;

  /* Solve a row: given the aspects and the gaps between them, there is
     exactly one height at which the row fills the width. */
  const flush = (batch: JustifiedInput[], isLast: boolean) => {
    if (batch.length === 0) return;
    const aspectSum = batch.reduce((sum, it) => sum + safeAspect(it.aspect), 0);
    const available = containerWidth - gap * (batch.length - 1);
    let height = available / aspectSum;

    /* The last row is the one that can misbehave: it holds whatever was
       left over, so solving it to full width can inflate it far past every
       row above. Cap it and let it end short — a row that does not reach
       the edge reads as "that is all of them", which is true. */
    if (isLast) height = Math.min(height, maxRowHeight);

    for (const it of batch) {
      const width = height * safeAspect(it.aspect);
      tiles.push({ index: it.index, width, height, row: rowIndex });
    }
    rowIndex += 1;
  };

  for (const item of items) {
    const candidate = [...row, item];
    const aspectSum = candidate.reduce((sum, it) => sum + safeAspect(it.aspect), 0);
    const widthAtTarget = aspectSum * targetHeight + gap * (candidate.length - 1);

    if (widthAtTarget >= containerWidth && row.length > 0) {
      /* Closing BEFORE adding, when the row is already full enough. The
         alternative — always adding then checking — packs rows tighter and
         makes the tiles smaller than the target rather than larger, which
         at rail size is the difference between legible and not. */
      flush(row, false);
      row = [item];
    } else {
      row = candidate;
      if (widthAtTarget >= containerWidth) {
        flush(row, false);
        row = [];
      }
    }
  }

  flush(row, true);
  return tiles;
}

/** Total height the rail needs, so a caller can reserve or scroll it
    without measuring the DOM it has not rendered yet. */
export function justifiedHeight(tiles: readonly JustifiedTile[], gap = 8): number {
  if (tiles.length === 0) return 0;
  const rows = new Map<number, number>();
  for (const t of tiles) rows.set(t.row, Math.max(rows.get(t.row) ?? 0, t.height));
  const heights = [...rows.values()];
  return heights.reduce((a, b) => a + b, 0) + gap * (heights.length - 1);
}
