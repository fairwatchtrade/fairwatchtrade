import {
  type PhotoCategory,
  type DocumentationStatus,
  type ListingState,
} from "@/lib/scoring";
import { type UploadedPhoto } from "@/lib/storage";

/* ════════════════════════════════════════════════════════════════════════
   LISTING DRAFT — the single state object that travels through all 5 steps
   of the seller flow. Each step reads/writes its slice; the score meter is
   fed by deriving the scoring engine's ListingState from this draft
   (toScoringState below). This is the spine the whole flow hangs on.
   ════════════════════════════════════════════════════════════════════════ */

export type Condition = "Unworn" | "Mint" | "Excellent" | "Good" | "Fair";
export type CurationDecision = "pending" | "pass" | "fail";

export type ListingPhoto = {
  photo: UploadedPhoto;
  category: PhotoCategory;
  isWristShot?: boolean;
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
};

export type ListingDraft = {
  // Step 1 — curation gate
  brand: string;
  model: string;
  reference: string;
  year: string;
  condition: Condition | "";
  askingPrice: string;
  provenanceNote: string;
  significanceScore: number | null; // Part 1, fixed once curation passes
  curationDecision: CurationDecision;
  curationReasoning: string;

  // Step 2 — photos
  photos: ListingPhoto[];
  hasBracelet: boolean;

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
    model: "",
    reference: "",
    year: "",
    condition: "",
    askingPrice: "",
    provenanceNote: "",
    significanceScore: null,
    curationDecision: "pending",
    curationReasoning: "",
    photos: [],
    hasBracelet: false,
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
