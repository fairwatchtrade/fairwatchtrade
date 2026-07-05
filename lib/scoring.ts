/* ════════════════════════════════════════════════════════════════════════
   FAIRWATCHTRADE SCORING ENGINE

   The two-part model:
     Part 1 — Intrinsic Significance (0–100). Genuine rarity / horological
              merit. Produced by the EXISTING evaluation engine
              (evaluationPrompt.ts) — this file does NOT recompute it, it
              consumes it. Runs ONCE at curation.
     Part 2 — Listing Completeness (0–COMPLETENESS_MAX). Rewards seller
              EFFORT: mandatory photos, wrist shot, movement shown, full
              documentation, a genuine description. Almost entirely
              deterministic — NO AI call — so it can recalculate live as the
              seller builds (password-strength-meter psychology).

   Combined = significance + completeness. Significance is the spine and
   DOMINATES by construction (100 vs a 20-point cap), so the Classic Car
   Magazine principle holds: a rare grail with thin paperwork still outranks
   a common watch with a flawless listing. Effort is a booster, never an
   override.

   Everything below is pure TypeScript — no React, no network, no database.
   The point weights are the knobs to turn in a tuning pass; they all live
   in the COMPLETENESS block so there's one place to adjust.
   ════════════════════════════════════════════════════════════════════════ */

export type PhotoCategory =
  | "Dial"
  | "Caseback"
  | "Non-Crown Side"
  | "Crown Side"
  | "Movement (closeup)"
  | "Bracelet/Strap"
  | "Full watch, strap/bracelet extended"
  | "Clasp/Pin Buckle"
  | "Box"
  | "Papers/Warranty"
  | "Other";

export type DocumentationStatus =
  | "Full Set"
  | "Papers Only"
  | "Box Only"
  | "Watch Only";

/** How the watch is being sold — the mobile wizard's Screen 0 declaration.
 *  Optional on ListingState: the desktop flow never sets it, so desktop
 *  behavior is unchanged. "head_only" is the one state that changes the
 *  mandatory gate (no clasp/buckle exists to photograph). */
export type SaleState = "bracelet" | "strap" | "head_only" | "other";

/** Everything the scorer needs about a listing-in-progress. */
export type ListingState = {
  /** Part 1, 0–100, from the existing evaluation engine. */
  significanceScore: number;
  /** One entry per uploaded photo: its chosen category. */
  photoCategories: PhotoCategory[];
  /** Does the watch ship on a bracelet? Drives the mandatory bracelet shots. */
  hasBracelet: boolean;
  /** v2.2 — explicit sale-state declaration (mobile wizard Screen 0).
   *  Absent = legacy/desktop behavior (clasp always required). */
  saleState?: SaleState;
  /** A wrist shot was included. (Wrist shots live under "Other", so the
   *  upload UI flags this separately rather than inferring from category.) */
  hasWristShot: boolean;
  documentation: DocumentationStatus;
  descriptionWordCount: number;
  /** Reuses the strike-system result — no extra API call here. */
  descriptionPassedAI: boolean;
};

/* ── Tunable weights (Part 2). Sum defines COMPLETENESS_MAX. ─────────────── */
export const COMPLETENESS = {
  mandatoryPhotos: 6, // Dial + Caseback + Clasp (+ both bracelet sides if applicable)
  wristShot: 3,
  movementShown: 2, // a Movement / exhibition-back shot — collector-relevant
  fullDocumentation: 5, // scaled by DOC_POINTS below — the CLAIM
  documentationPhotos: 2, // +1 Box photo, +1 Papers photo — visual PROOF of the claim
  genuineDescription: 4, // >= MIN_WORDS and passed AI
} as const;

export const COMPLETENESS_MAX =
  COMPLETENESS.mandatoryPhotos +
  COMPLETENESS.wristShot +
  COMPLETENESS.movementShown +
  COMPLETENESS.fullDocumentation +
  COMPLETENESS.documentationPhotos +
  COMPLETENESS.genuineDescription; // = 22

export const MIN_WORDS = 75;

/** Documentation is scaled, not all-or-nothing — vintage often can't be full set. */
const DOC_POINTS: Record<DocumentationStatus, number> = {
  "Full Set": COMPLETENESS.fullDocumentation,
  "Papers Only": 3,
  "Box Only": 2,
  "Watch Only": 0,
};

/* ── Mandatory photo set ─────────────────────────────────────────────────
   Required to go live (Dial, Caseback, Clasp/Pin Buckle; full extended shot if on a bracelet). */
function hasMandatoryPhotos(s: ListingState): boolean {
  const cats = new Set(s.photoCategories);
  // v2.2 sale-state ruling: a head-only watch has no clasp or buckle to
  // photograph, so the clasp requirement lifts for that one state. Every
  // other state — and every legacy caller that doesn't set saleState —
  // keeps the original gate exactly.
  const claspRequired = s.saleState !== "head_only";
  const base =
    cats.has("Dial") &&
    cats.has("Caseback") &&
    (!claspRequired || cats.has("Clasp/Pin Buckle"));
  if (!base) return false;
  if (s.hasBracelet) {
    // "both LEFT and RIGHT side shown separately" → at least two strap shots.
    return cats.has("Full watch, strap/bracelet extended");
  }
  return true;
}

export type CompletenessItem = {
  key: string;
  label: string;
  earned: number;
  max: number;
  done: boolean;
  /** What the seller can do to earn it — shown in the live meter. */
  hint: string;
};

export type CompletenessResult = {
  points: number;
  max: number;
  items: CompletenessItem[];
};

export function scoreCompleteness(s: ListingState): CompletenessResult {
  const items: CompletenessItem[] = [];

  // 1. Mandatory photo set
  const mandatoryDone = hasMandatoryPhotos(s);
  items.push({
    key: "mandatory",
    label: "Required photos",
    earned: mandatoryDone ? COMPLETENESS.mandatoryPhotos : 0,
    max: COMPLETENESS.mandatoryPhotos,
    done: mandatoryDone,
    hint:
      s.saleState === "head_only"
        ? "Dial and caseback"
        : s.hasBracelet
          ? "Dial, caseback, clasp, and both bracelet sides"
          : "Dial, caseback, and clasp",
  });

  // 2. Wrist shot
  items.push({
    key: "wrist",
    label: "Wrist shot",
    earned: s.hasWristShot ? COMPLETENESS.wristShot : 0,
    max: COMPLETENESS.wristShot,
    done: s.hasWristShot,
    hint: "Add a wrist shot so buyers grasp scale",
  });

  // 3. Movement shown
  const movementShown = s.photoCategories.includes("Movement (closeup)");
  items.push({
    key: "movement",
    label: "Movement shown",
    earned: movementShown ? COMPLETENESS.movementShown : 0,
    max: COMPLETENESS.movementShown,
    done: movementShown,
    hint: "Add a movement / exhibition-back photo",
  });

  // 4. Documentation (scaled)
  const docEarned = DOC_POINTS[s.documentation];
  items.push({
    key: "documentation",
    label: "Documentation",
    earned: docEarned,
    max: COMPLETENESS.fullDocumentation,
    done: docEarned === COMPLETENESS.fullDocumentation,
    hint: "Full set (box + papers) earns the most",
  });

  // 5. Documentation photographed — visual PROOF, on top of the dropdown claim
  const boxShot = s.photoCategories.includes("Box");
  const papersShot = s.photoCategories.includes("Papers/Warranty");
  const docPhotoPoints = (boxShot ? 1 : 0) + (papersShot ? 1 : 0);
  items.push({
    key: "docPhotos",
    label: "Box & papers photographed",
    earned: docPhotoPoints,
    max: COMPLETENESS.documentationPhotos,
    done: docPhotoPoints === COMPLETENESS.documentationPhotos,
    hint: "Photograph the box and papers — proof beats a checkbox",
  });

  // 6. Genuine description
  const descGood = s.descriptionPassedAI && s.descriptionWordCount >= MIN_WORDS;
  items.push({
    key: "description",
    label: "Genuine description",
    earned: descGood ? COMPLETENESS.genuineDescription : 0,
    max: COMPLETENESS.genuineDescription,
    done: descGood,
    hint: `${MIN_WORDS}+ words, in your own voice`,
  });

  const points = items.reduce((sum, i) => sum + i.earned, 0);
  return { points, max: COMPLETENESS_MAX, items };
}

export type ScoreTier = "Exceptional" | "Notable" | "Solid" | "Emerging";

export function significanceTier(score: number): ScoreTier {
  if (score >= 85) return "Exceptional";
  if (score >= 70) return "Notable";
  if (score >= 50) return "Solid";
  return "Emerging";
}

export type ScoreResult = {
  significance: number; // 0–100
  completeness: number; // 0–COMPLETENESS_MAX
  combined: number; // significance + completeness
  completenessDetail: CompletenessResult;
  tier: ScoreTier;
};

export function scoreListing(s: ListingState): ScoreResult {
  const significance = clamp(s.significanceScore, 0, 100);
  const completenessDetail = scoreCompleteness(s);
  return {
    significance,
    completeness: completenessDetail.points,
    combined: significance + completenessDetail.points,
    completenessDetail,
    tier: significanceTier(significance),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
