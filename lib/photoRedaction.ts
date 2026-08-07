/* ════════════════════════════════════════════════════════════════════════
   PHOTO REDACTION — the privacy utility, NOT an image editor

   A seller may hide private information that appears inside a photograph —
   an address on a service invoice, a serial engraving, paperwork detail —
   with a blur brush or a whiteout marker. That is the entire capability.
   No crop, no filters, no exposure, no color, no drawing, no text.

   ── NON-DESTRUCTIVE BY CONSTRUCTION ────────────────────────────────────
   The original upload is never modified, overwritten, or deleted. Applying
   redactions renders a NEW composite from the ORIGINAL bytes plus the
   stroke list and uploads it as its own object; the listing then presents
   the redacted object while the original remains stored, referenced only
   from the seller's private draft state. Clearing redactions restores the
   original. Re-editing always re-renders from the original — blur is never
   applied on top of blur.

   ── WHY PIXELS, NOT OVERLAY METADATA ───────────────────────────────────
   Rendering redaction as display-time overlays would require every public
   surface (listing page, Browse hero, Catalogue, derived thumbnails) to
   apply them forever, and one surface forgetting = a privacy leak of
   exactly the detail the seller asked to hide. The public artifact
   therefore carries the redaction baked into its pixels; the private
   original never reaches a public surface.

   Strokes are stored NORMALIZED (0..1 of the image's natural dimensions),
   so they are resolution-independent and re-render identically.
   ════════════════════════════════════════════════════════════════════════ */

export type RedactionTool = "blur" | "white";

export type RedactionPoint = { x: number; y: number };

export type RedactionStroke = {
  tool: RedactionTool;
  /** Brush radius as a fraction of the image's larger natural dimension. */
  radius: number;
  /** Path in normalized image coordinates (0..1 × 0..1). */
  points: RedactionPoint[];
};

/** One photograph's redaction state, keyed in the draft by the CURRENT
    (redacted) pathname. The original is preserved here — draft state is
    seller-private — and never in presentation metadata, which reaches
    public surfaces. */
export type PhotoRedactionRecord = {
  originalPathname: string;
  originalUrl: string;
  strokes: RedactionStroke[];
};

export const REDACTION_BRUSH_RADIUS = 0.035;
export const MAX_REDACTION_STROKES = 60;
export const MAX_STROKE_POINTS = 400;

/** The soft paper-white of the whiteout marker — deliberate-looking on a
    document, never a hole punched in the photograph. */
export const WHITEOUT_COLOR = "#f4f2ee";

function num01(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
}

export function sanitizeStroke(input: unknown): RedactionStroke | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const tool: RedactionTool | null =
    raw.tool === "blur" ? "blur" : raw.tool === "white" ? "white" : null;
  if (!tool) return null;
  const radius = num01(raw.radius);
  if (radius === null || radius === 0 || radius > 0.2) return null;
  if (!Array.isArray(raw.points) || raw.points.length === 0) return null;
  const points: RedactionPoint[] = [];
  for (const p of raw.points.slice(0, MAX_STROKE_POINTS)) {
    if (!p || typeof p !== "object") return null;
    const x = num01((p as Record<string, unknown>).x);
    const y = num01((p as Record<string, unknown>).y);
    if (x === null || y === null) return null;
    points.push({ x, y });
  }
  return { tool, radius, points };
}

/** Unknown → a valid record or null. Runs over resumed draft state. */
export function sanitizeRedactionRecord(input: unknown): PhotoRedactionRecord | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.originalPathname !== "string" || raw.originalPathname === "") return null;
  if (typeof raw.originalUrl !== "string" || raw.originalUrl === "") return null;
  if (!Array.isArray(raw.strokes)) return null;
  const strokes: RedactionStroke[] = [];
  for (const s of raw.strokes.slice(0, MAX_REDACTION_STROKES)) {
    const clean = sanitizeStroke(s);
    if (clean) strokes.push(clean);
  }
  return {
    originalPathname: raw.originalPathname.slice(0, 512),
    originalUrl: raw.originalUrl.slice(0, 2048),
    strokes,
  };
}

export function sanitizeRedactions(
  input: unknown
): Record<string, PhotoRedactionRecord> {
  const out: Record<string, PhotoRedactionRecord> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof key !== "string" || key === "") continue;
    const rec = sanitizeRedactionRecord(value);
    if (rec) out[key.slice(0, 512)] = rec;
  }
  return out;
}

/* ── Stroke path geometry (shared by preview and composite) ─────────────
   A stroke paints as a round-capped, round-joined line through its points.
   A single tap must still paint a dot: a zero-length subpath renders
   nothing in some engines, so a lone point gets a hair of length. */
export function strokePath(
  stroke: RedactionStroke,
  width: number,
  height: number
): Path2D {
  const path = new Path2D();
  const pts = stroke.points;
  path.moveTo(pts[0].x * width, pts[0].y * height);
  if (pts.length === 1) {
    path.lineTo(pts[0].x * width + 0.01, pts[0].y * height);
  } else {
    for (let i = 1; i < pts.length; i++) {
      path.lineTo(pts[i].x * width, pts[i].y * height);
    }
  }
  return path;
}

/** Paint one image's strokes onto a 2D context whose canvas is the SAME
    size as `source`. `blurred` is a pre-blurred copy of the source at the
    same size, used as the paint for blur strokes. */
export function paintStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: RedactionStroke[],
  blurred: CanvasImageSource,
  width: number,
  height: number
): void {
  const maxDim = Math.max(width, height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    ctx.lineWidth = Math.max(2, stroke.radius * maxDim * 2);
    if (stroke.tool === "blur") {
      const pattern = ctx.createPattern(blurred as CanvasImageSource, "no-repeat");
      if (!pattern) continue;
      ctx.strokeStyle = pattern;
    } else {
      ctx.strokeStyle = WHITEOUT_COLOR;
    }
    ctx.stroke(strokePath(stroke, width, height));
  }
}

/** Build the blurred paint source for blur strokes: the source image with a
    strong, size-proportional gaussian blur, drawn over an unblurred base so
    the soft alpha edge of the filter never shows through. */
export function makeBlurredCopy(
  source: CanvasImageSource,
  width: number,
  height: number
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.drawImage(source, 0, 0, width, height);
  const blurPx = Math.max(10, Math.round(Math.max(width, height) * 0.014));
  ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(source, 0, 0, width, height);
  ctx.filter = "none";
  return c;
}

/** Render the public composite: ORIGINAL bytes + strokes → JPEG blob at the
    original's full stored resolution. Always renders from the original, so
    repeated edits never compound. */
export async function renderRedactedBlob(
  originalUrl: string,
  strokes: RedactionStroke[]
): Promise<Blob> {
  const res = await fetch(originalUrl);
  if (!res.ok) throw new Error(`original fetch failed (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const w = bitmap.width;
  const h = bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0);
  paintStrokes(ctx, strokes, makeBlurredCopy(bitmap, w, h), w, h);
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9)
  );
  if (!blob) throw new Error("composite encode failed");
  return blob;
}
