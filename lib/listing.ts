import {
  type PhotoCategory,
  type DocumentationStatus,
  type ListingState,
} from "@/lib/scoring";
import { type UploadedPhoto } from "@/lib/storage";
import { type PhotoPresentation, defaultPresentation } from "@/lib/photoPresentation";
import type { AdmissionState } from "@/lib/admission/requirementProfile";

/* ════════════════════════════════════════════════════════════════════════
   LISTING DRAFT — the single state object that travels through all 5 steps
   of the seller flow. Each step reads/writes its slice; the score meter is
   fed by deriving the scoring engine's ListingState from this draft
   (toScoringState below). This is the spine the whole flow hangs on.
   ════════════════════════════════════════════════════════════════════════ */

/* "Very Good" added by the condition-governance ruling 2026-08-06: a fully
   wearable, functioning watch showing honest age-consistent wear, with no
   undisclosed major defect that would materially surprise a buyer. Condition
   is a factual claim — one grade, never a range. */
export type Condition = "Unworn" | "Mint" | "Excellent" | "Very Good" | "Good" | "Fair";
export type CurationDecision = "pending" | "pass" | "fail";

export type ListingPhoto = {
  photo: UploadedPhoto;
  category: PhotoCategory;
  isWristShot?: boolean;
  /** Service Evidence only: the seller's deliberate opt-in to public display.
      PRIVATE BY DEFAULT (lib/servicePhotoPrivacy governs every public surface). */
  servicePublicOptIn?: boolean;
};

export type ListingDetails = {
  movementType?: string;
  caseSizeMm?: string;
  caseThicknessMm?: string;
  caseMaterial?: string;
  caseColorFinish?: string;
  documentation: DocumentationStatus;
  crownPresent?: boolean;
  closureType?: string;
  casebackType?: string;
  crystalMaterial?: string;
  originalStrapBracelet?: boolean;
  braceletWristSize?: string;
  includedWithWatch?: string[];
  dialColorType?: string;
  complications?: string[];
  serviceHistory?: string[];
  movementFrequency?: string;
  bezelMaterial?: string;
  waterResistance?: string;
  calibre?: string;
  jewels?: string;
  powerReserve?: string;
  /* Brand-admission claims (Rolex Admission Design Gate v1). Present only
     for profile brands; composed at read time against the checklist above —
     box inclusion itself is never duplicated here. */
  admission?: AdmissionState;
};

export type ListingDraft = {
  // Step 1 — curation gate
  brand: string;
  customBrandFlag: boolean;
  model: string;
  reference: string;
  year: string;
  condition: Condition | "";
  askingPrice: string;
  /* Money Truth Stage B — the amount's currency, chosen and explicitly
     confirmed beside it in the curation step (approved Design Gate). Empty
     string until the seller confirms the pair; never silently defaulted. */
  askingCurrency: string;
  /* True only while the seller's confirmed amount+currency pair is intact —
     editing either value clears it (Design Gate: deliberate confirmation). */
  askingConfirmed: boolean;
  provenanceNote: string;
  significanceScore: number | null; // Part 1, fixed once curation passes
  curationDecision: CurationDecision;
  curationReasoning: string;

  // Step 2 — photos
  photos: ListingPhoto[];
  hasBracelet: boolean;
  /* Hero framing chosen on the Review step. Presentation only — the uploaded
     photographs in `photos` are never modified by it. Optional so drafts
     written before this existed resume without migration. */
  photoPresentation?: PhotoPresentation;

  // Step 3 — structured details
  details: ListingDetails;

  // Step 4 — seller description
  description: string;
  descriptionPassedAI: boolean | null;
  strikes: number;
};

export function emptyDraft(): ListingDraft {
  return {
    brand: "",
    customBrandFlag: false,
    model: "",
    reference: "",
    year: "",
    condition: "",
    askingPrice: "",
    askingCurrency: "",
    askingConfirmed: false,
    provenanceNote: "",
    significanceScore: null,
    curationDecision: "pending",
    curationReasoning: "",
    photos: [],
    hasBracelet: false,
    photoPresentation: defaultPresentation(),
    details: { documentation: "Watch Only" },
    description: "",
    descriptionPassedAI: null,
    strikes: 0,
  };
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/* Bridge: derive the scoring engine's ListingState from the live draft so
   ListingScoreMeter (which takes a ListingState) is fed straight from the
   flow with zero duplication. */
export function toScoringState(d: ListingDraft): ListingState {
  return {
    significanceScore: d.significanceScore ?? 0,
    photoCategories: d.photos.map((p) => p.category),
    hasBracelet: d.hasBracelet,
    hasWristShot: d.photos.some((p) => p.isWristShot),
    documentation: d.details.documentation,
    descriptionWordCount: wordCount(d.description),
    descriptionPassedAI: d.descriptionPassedAI === true,
  };
}
