/* ════════════════════════════════════════════════════════════════════════
   PHOTO SET COHERENCE — do these photographs belong to each other?

   ── THE OBSERVATION THIS IS BUILT ON ───────────────────────────────────
   On 2026-08-01 a borrowed photograph was published to FairWatchTrade and no
   web search found it — Google's index does not cover the marketplace CDN it
   came from. But it was identifiable anyway, from the set alone:

       Crown Side    1800x2400   phone
       Non-Crown     1800x2400   phone
       Caseback      1800x2400   phone
       Clasp         1800x2400   phone
       Full watch    1800x2400   phone
       Dial          1600x1600   ← the borrowed one

   One square studio image among five handheld 3:4 shots from the same
   afternoon. It did not match its own siblings. No provider, no API, no
   index, no monthly bill — the evidence was sitting in the upload the whole
   time.

   ── WHAT THIS IS AND IS NOT ────────────────────────────────────────────
   This does NOT detect theft. It detects INCONSISTENCY, which is a different
   and weaker claim, and the difference matters:

     · A seller may legitimately mix a phone photo with a manufacturer press
       shot, and say so.
     · A seller may crop one image and not others.
     · A seller may photograph on two days with two devices.

   So every finding here is a question for a human, never an accusation, and
   a single odd photo is never on its own enough to hold a listing — it is
   one voice in the four-layer stack.

   ── LIVE CAPTURE IS EXEMPT ─────────────────────────────────────────────
   A photograph taken through the mobile wizard's camera cannot be stolen: it
   did not exist until the seller pressed the shutter. Provenance there is
   established rather than inferred, so coherence has nothing to add and the
   analysis skips it. Suspicion is for arbitrary uploads.
   ════════════════════════════════════════════════════════════════════════ */

import type { CaptureMetadata } from "@/lib/photoForensics";

export type CoherencePhoto = {
  pathname: string;
  category?: string | null;
  capture?: CaptureMetadata | null;
  /** 'live_camera' captures are exempt — see the header. */
  captureSource?: "live_camera" | "desktop_upload" | string | null;
};

export type CoherenceFinding = {
  pathname: string;
  category: string | null;
  /** Machine-stable reason code. */
  code:
    | "aspect_outlier"
    | "missing_exif_among_camera_photos"
    | "foreign_camera"
    | "foreign_capture_date"
    | "editor_software"
    | "size_outlier";
  /** One plain sentence a reviewer can act on. Never accusatory. */
  detail: string;
  /** 1 = worth a glance, 3 = hard to explain innocently. */
  weight: 1 | 2 | 3;
};

export type CoherenceResult = {
  analyzed: number;
  skippedLiveCapture: number;
  findings: CoherenceFinding[];
  /** Sum of finding weights. The caller decides what to do with it. */
  score: number;
};

function ratio(c?: CaptureMetadata | null): number | null {
  if (!c?.originalWidth || !c?.originalHeight) return null;
  return c.originalWidth / c.originalHeight;
}

/** Group values, returning the most common and how many shared it. */
function modal<T>(values: T[]): { value: T | null; count: number } {
  const counts = new Map<string, { value: T; n: number }>();
  for (const v of values) {
    const k = String(v);
    const e = counts.get(k);
    if (e) e.n += 1;
    else counts.set(k, { value: v, n: 1 });
  }
  let best: { value: T; n: number } | null = null;
  for (const e of counts.values()) if (!best || e.n > best.n) best = e;
  return best ? { value: best.value, count: best.n } : { value: null, count: 0 };
}

/* Aspect ratios are compared loosely: 3:4 from two different phones is not
   bit-identical, and a 2% difference is not evidence of anything. */
const ASPECT_TOLERANCE = 0.04;

/** A set smaller than this has no "normal" to be an outlier from. */
const MIN_SET_FOR_OUTLIERS = 3;

const EDITORS = /photoshop|gimp|lightroom|affinity|pixelmator|canva|snapseed/i;

export function analyzePhotoSet(photos: CoherencePhoto[]): CoherenceResult {
  const live = photos.filter((p) => p.captureSource === "live_camera");
  const subjects = photos.filter((p) => p.captureSource !== "live_camera");
  const findings: CoherenceFinding[] = [];

  const add = (
    p: CoherencePhoto,
    code: CoherenceFinding["code"],
    detail: string,
    weight: CoherenceFinding["weight"]
  ) => findings.push({ pathname: p.pathname, category: p.category ?? null, code, detail, weight });

  if (subjects.length >= MIN_SET_FOR_OUTLIERS) {
    /* ── 1 · Aspect ratio ── the signal that caught the real case ── */
    const ratios = subjects.map((p) => ({ p, r: ratio(p.capture) })).filter((x) => x.r !== null);
    if (ratios.length >= MIN_SET_FOR_OUTLIERS) {
      const rounded = ratios.map((x) => Math.round(x.r! * 100) / 100);
      const { value: common, count } = modal(rounded);
      // Only meaningful when a real majority agrees on a shape.
      if (common !== null && count >= Math.ceil(ratios.length * 0.6)) {
        for (const { p, r } of ratios) {
          if (Math.abs(r! - common) > ASPECT_TOLERANCE) {
            add(
              p,
              "aspect_outlier",
              `This photograph's shape (${r!.toFixed(2)}:1) differs from the other ${count} in this listing (${common.toFixed(2)}:1), which is typical of an image sourced separately from the rest.`,
              2
            );
          }
        }
      }
    }

    /* ── 2 · EXIF present on most, absent on one ──
       Now that the pipeline preserves metadata, absence is meaningful again —
       but ONLY relative to the seller's own set. A seller whose every photo
       lacks EXIF is not suspicious; one bare photo among five camera photos
       is a question worth asking. */
    const withExif = subjects.filter((p) => p.capture?.hasExif);
    if (withExif.length >= 2 && withExif.length < subjects.length) {
      for (const p of subjects) {
        if (!p.capture?.hasExif) {
          add(
            p,
            "missing_exif_among_camera_photos",
            `This photograph carries no camera information, while ${withExif.length} others in this listing do.`,
            2
          );
        }
      }
    }

    /* ── 3 · A different camera ── */
    const models = subjects
      .map((p) => p.capture?.model)
      .filter((m): m is string => typeof m === "string" && m !== "");
    if (models.length >= MIN_SET_FOR_OUTLIERS) {
      const { value: common, count } = modal(models);
      if (common && count >= Math.ceil(models.length * 0.6)) {
        for (const p of subjects) {
          const m = p.capture?.model;
          if (m && m !== common) {
            add(
              p,
              "foreign_camera",
              `Taken on a different camera (${m}) than the other ${count} photographs (${common}).`,
              2
            );
          }
        }
      }
    }

    /* ── 4 · Taken on a different day ──
       Weak on its own — people photograph over two sessions — so weight 1. */
    const days = subjects
      .map((p) => ({ p, d: p.capture?.capturedAt?.slice(0, 10) ?? null }))
      .filter((x) => x.d);
    if (days.length >= MIN_SET_FOR_OUTLIERS) {
      const { value: common, count } = modal(days.map((x) => x.d!));
      if (common && count >= Math.ceil(days.length * 0.6)) {
        for (const { p, d } of days) {
          if (d !== common) {
            add(p, "foreign_capture_date", `Captured on ${d}, while ${count} others were taken on ${common}.`, 1);
          }
        }
      }
    }
  }

  /* ── 5 · Authoring software ── applies to any set size.
     Editing is not guilt. A reviewer should simply know. */
  for (const p of subjects) {
    const sw = p.capture?.software;
    if (sw && EDITORS.test(sw)) {
      add(p, "editor_software", `Saved from image-editing software (${sw}).`, 1);
    }
  }

  return {
    analyzed: subjects.length,
    skippedLiveCapture: live.length,
    findings,
    score: findings.reduce((s, f) => s + f.weight, 0),
  };
}
