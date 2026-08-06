/* ════════════════════════════════════════════════════════════════════════
   PRESENTATION THUMBNAIL — margin-trim derivation for Gallery cards

   A seller photograph may carry large EMPTY margins baked into the source
   bytes — a phone screenshot's black letterbox bands, a studio shot's
   uniform backdrop. Contained in the Gallery card's 4:3 frame, those
   margins shrink the watch. This module derives, at read time, a
   presentation thumbnail with only those empty margins trimmed away.

   THE EVIDENCE LAW STILL GOVERNS. This is presentation, not editing:

   - the stored original is NEVER rewritten — derivation happens on a copy
     in memory, per request, cached only by the CDN;
   - only near-uniform border margins are removed. The watch — crown, lugs,
     strap, bracelet, included-set context — is meaningful content and can
     never match a uniform border, so it can never be trimmed;
   - a modest safe margin is re-added around the detected content;
   - every trim must pass trust checks; anything suspicious falls back to
     the untrimmed photograph, resized only.

   WHY TRIM AND NOT SALIENCY CROPPING: an attention/object crop decides
   what "matters" and discards the rest — exactly the subtraction the
   evidence law forbids. Border trimming is the one crop that provably
   removes nothing meaningful: it only removes rows and columns that are
   visually identical to the border itself.

   Two passes: a screenshot's black bands can hide a second uniform border
   inside (a studio backdrop). Each pass detects the new corner color and
   is separately gated by the trust checks; the second pass simply stops
   when the remaining border is real photographic content (a table, a
   wrist) because textured rows never match within the threshold.
   ════════════════════════════════════════════════════════════════════════ */

import sharp from "sharp";

/** Output width — 2× the ~230px card media well at phone DPR. */
export const THUMB_WIDTH = 480;

/** sharp trim tolerance. Conservative: JPEG noise on a "uniform" band sits
    well under this; real content (strap texture, wood grain, a wrist) sits
    far above it and stops the trim. */
export const TRIM_THRESHOLD = 22;

/** Breathing room re-added around the detected content, as a fraction of
    the content box's SMALLER side — the "modest safe margin". Sized to
    outlast JPEG halo around a trim edge (~8–16px) without re-inflating a
    tall box's trimmed bands: a fraction of the larger side re-added most
    of a letterboxed screenshot's removed band, proven on real bytes. */
export const SAFE_MARGIN_FRACTION = 0.025;

/** The margin never shrinks below this many pixels. */
export const SAFE_MARGIN_MIN_PX = 8;

/** Trust floor: a trim that keeps less than this fraction of the source
    area is suspicious (near-uniform photo, threshold artifact) → fallback. */
export const MIN_CONTENT_FRACTION = 0.12;

/** Trust floor: the content box must be at least this many pixels a side. */
export const MIN_CONTENT_PX = 96;

/** A trim below this linear gain on both axes is noise — not worth a
    second pass, and on the first pass the untrimmed resize is served. */
export const MIN_GAIN_FRACTION = 0.02;

export type ContentBox = { left: number; top: number; width: number; height: number };

/** Pure: pad a detected content box with the safe margin, clamped to the
    source bounds. Padding is symmetric per axis except where the source
    edge clamps it — content is never shifted, only given air. */
export function padContentBox(
  box: ContentBox,
  srcWidth: number,
  srcHeight: number,
  marginFraction: number = SAFE_MARGIN_FRACTION
): ContentBox {
  const pad = Math.max(
    SAFE_MARGIN_MIN_PX,
    Math.round(Math.min(box.width, box.height) * marginFraction)
  );
  const left = Math.max(0, box.left - pad);
  const top = Math.max(0, box.top - pad);
  const right = Math.min(srcWidth, box.left + box.width + pad);
  const bottom = Math.min(srcHeight, box.top + box.height + pad);
  return { left, top, width: right - left, height: bottom - top };
}

/** Pure: is this detected content box trustworthy enough to crop to? */
export function isTrustworthyContentBox(
  box: ContentBox,
  srcWidth: number,
  srcHeight: number
): boolean {
  if (box.width < MIN_CONTENT_PX || box.height < MIN_CONTENT_PX) return false;
  if (box.left < 0 || box.top < 0) return false;
  if (box.left + box.width > srcWidth || box.top + box.height > srcHeight) return false;
  const srcArea = srcWidth * srcHeight;
  if (srcArea <= 0) return false;
  return (box.width * box.height) / srcArea >= MIN_CONTENT_FRACTION;
}

/** Pure: did the trim actually remove a meaningful margin on either axis? */
export function isMeaningfulGain(
  box: ContentBox,
  srcWidth: number,
  srcHeight: number
): boolean {
  return (
    box.width <= srcWidth * (1 - MIN_GAIN_FRACTION) ||
    box.height <= srcHeight * (1 - MIN_GAIN_FRACTION)
  );
}

/** One sharp trim pass over a buffer → the content box in that buffer's own
    coordinates, or null when nothing trustworthy was trimmed. */
async function detectTrimBox(buffer: Buffer): Promise<ContentBox | null> {
  const meta = await sharp(buffer).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (!srcW || !srcH) return null;
  try {
    const { info } = await sharp(buffer)
      .trim({ threshold: TRIM_THRESHOLD })
      .toBuffer({ resolveWithObject: true });
    // sharp reports the trim as negative offsets of the retained region.
    const box: ContentBox = {
      left: Math.max(0, -(info.trimOffsetLeft ?? 0)),
      top: Math.max(0, -(info.trimOffsetTop ?? 0)),
      width: info.width,
      height: info.height,
    };
    if (!isMeaningfulGain(box, srcW, srcH)) return null;
    if (!isTrustworthyContentBox(box, srcW, srcH)) return null;
    return box;
  } catch {
    // A fully-uniform image makes sharp's trim throw ("unsupported image
    // boundary") — there is no content to frame; the caller falls back.
    return null;
  }
}

export type DerivedThumb = {
  buffer: Buffer;
  contentType: "image/webp";
  /** True when a trustworthy margin trim was applied. */
  trimmed: boolean;
  /** The padded content box in oriented-source coordinates, when trimmed. */
  box: ContentBox | null;
  sourceWidth: number;
  sourceHeight: number;
};

/** Derive the presentation thumbnail: EXIF-orient, trim empty margins
    (up to two gated passes), re-add the safe margin, resize, encode.
    Never throws on bad image data the fallback can absorb — the caller
    should still try/catch and serve the original on any failure. */
export async function deriveThumb(input: Buffer): Promise<DerivedThumb> {
  /* Orientation first: the crop must happen in the same pixel space the
     browser displays. failOn:"none" keeps mildly-corrupt JPEGs renderable.
     The intermediate MUST be lossless (or the untouched input): a lossy
     re-encode here smeared band edges enough to defeat the trim — proven
     on a real production screenshot, where the true 126px letterbox bands
     detected on the original shrank to 29px after a JPEG round trip. */
  const meta0 = await sharp(input, { failOn: "none" }).metadata();
  const oriented =
    (meta0.orientation ?? 1) === 1
      ? input
      : await sharp(input, { failOn: "none" }).rotate().png().toBuffer();
  const meta = await sharp(oriented, { failOn: "none" }).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (!srcW || !srcH) throw new Error("unreadable image");

  /* Pass 1 on the whole photograph; pass 2 inside pass 1's box (a new
     corner color may appear once the outer band is gone). Each pass is
     independently trust-gated; box coordinates compose to absolute. */
  let content: ContentBox | null = await detectTrimBox(oriented);
  if (content) {
    const inner = await detectTrimBox(
      await sharp(oriented).extract(content).toBuffer()
    );
    if (
      inner &&
      isTrustworthyContentBox(
        { left: content.left + inner.left, top: content.top + inner.top, width: inner.width, height: inner.height },
        srcW,
        srcH
      )
    ) {
      content = {
        left: content.left + inner.left,
        top: content.top + inner.top,
        width: inner.width,
        height: inner.height,
      };
    }
  }

  const box = content ? padContentBox(content, srcW, srcH) : null;
  const pipeline = box
    ? sharp(oriented).extract(box)
    : sharp(oriented);

  const buffer = await pipeline
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  return {
    buffer,
    contentType: "image/webp",
    trimmed: box !== null,
    box,
    sourceWidth: srcW,
    sourceHeight: srcH,
  };
}
