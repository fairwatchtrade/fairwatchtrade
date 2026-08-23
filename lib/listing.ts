import {
  type PhotoCategory,
  type DocumentationStatus,
  type ListingState,
} from "@/lib/scoring";
import { type UploadedPhoto } from "@/lib/storage";
import { type PhotoPresentation, defaultPresentation } from "@/lib/photoPresentation";
import { type PhotoRedactionRecord } from "@/lib/photoRedaction";
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
  /** "" means uploaded but not yet tagged. An accepted upload belongs in the
      draft the moment it exists — the draft is the ONE photo store, and a
      photo that is only in component state is a photo the seller can lose by
      navigating (Jason's walk, 2026-08-07: some photos survived a Sell Flow
      disturbance and some did not — the untagged ones were being filtered out
      on the way in). Tagging is a later, separate act. Every consumer keys off
      SPECIFIC categories (Set membership / includes), so an untagged entry
      contributes nothing to scoring, required views, or publication gates —
      it simply stops disappearing. */
  category: PhotoCategory | "";
  isWristShot?: boolean;
  /** Service Evidence only: the seller's deliberate opt-in to public display.
      PRIVATE BY DEFAULT (lib/servicePhotoPrivacy governs every public surface). */
  servicePublicOptIn?: boolean;
  /** SHA-256 of the exact selected file's bytes, for same-draft duplicate
      rejection only. Draft-scoped and client-side: this answers "is this exact
      photo already in THIS listing?" and nothing else. It is NOT the Aubrey
      Check exact-hash index, which answers cross-listing recurrence. Optional
      so drafts written before this resume without migration. */
  contentHash?: string;
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
  /* ── Canonical watch identity ──────────────────────────────────────────
     The governed vault_references row this watch has been determined to
     BE, resolved deterministically beside the reference field. It NEVER
     replaces `reference` above — that stays exactly what the seller typed,
     and the two are different facts with different provenance.

     `vaultReferenceKey` is the identity context (brand|model|reference)
     the id was resolved against. Carrying it makes staleness DETECTABLE
     rather than assumed: edit any of the three and the key no longer
     matches, so a canonical id can never remain silently attached to text
     that no longer resolves to it. Optional so a draft written before this
     existed resumes without migration — and an absent key reads as stale,
     which is the safe direction.

     Advisory here regardless: publication re-resolves server-side and the
     server's answer is what persists. */
  vaultReferenceId?: string | null;
  vaultReferenceKey?: string;
  significanceScore: number | null; // Part 1, fixed once curation passes
  curationDecision: CurationDecision;
  curationReasoning: string;

  // Step 2 — photos
  photos: ListingPhoto[];
  hasBracelet: boolean;
  /* Trade V1 — one binary seller declaration, deliberately not a preference
     taxonomy (no accepted brands, minimum value, categories or radius).
     Governed listing state, never description text. */
  openToTrades: boolean;
  /* Hero framing chosen on the Review step. Presentation only — the uploaded
     photographs in `photos` are never modified by it. Optional so drafts
     written before this existed resume without migration. */
  photoPresentation?: PhotoPresentation;
  /* Privacy redaction state, keyed by the CURRENT (redacted) pathname in
     `photos`. Each record privately preserves the original upload and the
     stroke list, so redactions can be re-edited from the original or cleared
     entirely. Lives in DRAFT state only — never in presentation metadata,
     which reaches public surfaces. Optional: older drafts resume clean. */
  photoRedactions?: Record<string, PhotoRedactionRecord>;

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
    vaultReferenceId: null,
    vaultReferenceKey: "",
    significanceScore: null,
    curationDecision: "pending",
    curationReasoning: "",
    photos: [],
    hasBracelet: false,
    openToTrades: false,
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
    /* Untagged uploads live in the draft but carry no category, so they are
       dropped here rather than reaching the scorer as empty strings. Scoring
       has always been driven by which categories are PRESENT, never by how
       many photos exist — an untagged photo earns nothing until tagged. */
    photoCategories: d.photos
      .map((p) => p.category)
      .filter((c): c is PhotoCategory => c !== ""),
    hasBracelet: d.hasBracelet,
    hasWristShot: d.photos.some((p) => p.isWristShot),
    documentation: d.details.documentation,
    descriptionWordCount: wordCount(d.description),
    descriptionPassedAI: d.descriptionPassedAI === true,
  };
}
