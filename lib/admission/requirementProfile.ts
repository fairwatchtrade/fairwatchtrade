/* import type (fully erasable) so the bare-node test runner can load this
   module without resolving the "@" bundler alias at runtime. */
import type { DocumentationStatus, PhotoCategory } from "@/lib/scoring";

/* ════════════════════════════════════════════════════════════════════════
   BRAND ADMISSION — requirement profiles
   (Rolex Admission Design Gate v1 · approved 2026-08-04)

   One seller entrance. One Sell route. The identified watch supplies the
   requirement profile. This module is the shared admission layer: the Sell
   flow reads it to adapt each step, and POST /api/listings reads the SAME
   functions to enforce the SAME policy at publication. Pure TypeScript —
   no React, no network, no database — so the client corridor and the
   server gate can never drift apart.

   Scope is deliberately narrow: Rolex only, per the approved corridor.
   Tudor and pre-1994 Omega have their own future admission gates and are
   NOT implemented here. A null profile means the standard curated path —
   non-Rolex sellers never see or pass through any of this.

   The eight required photograph views map onto the EXISTING photo
   taxonomy (lib/scoring.ts PhotoCategory) — no new categories. The two
   serial-bearing categories (Caseback, Non-Crown Side) already carry the
   platform's private-evidence handling, which is exactly where the gate's
   "serial and reference evidence" requirement lands.

   Boxes are optional where commercially replaceable and not materially
   probative of identity or provenance. Any stronger box claim requires
   evidence — the four-state classification below is that claim, and
   "full set" language is available only when the relationship among the
   watch, its identity-bearing documentation, and the packaging is
   genuinely supportable.
   ════════════════════════════════════════════════════════════════════════ */

/* ── Component representation ────────────────────────────────────────────
   Originality, period correctness, replacement status, and uncertainty are
   never collapsed into a single "original" checkbox. */

/* Consolidation ruling 2026-08-06: Case is REMOVED from the required grid —
   demanding a provenance claim about the identity-bearing chassis asked
   normal sellers for stronger claims than they can usually support. Crystal
   replaces it: a disclosed service-replacement crystal is not an admission
   failure and is never cobbling; crystal status is disclosure evidence, and
   honest classification is the goal. Saved drafts that still carry a `case`
   classification remain resumable — unclassifiedComponents() iterates THIS
   list, so a stale extra key is simply ignored, never an error. */
import { classifyRolexIdentifier } from "./rolexIdentifier.ts";
import type {
  TudorDocumentationPolicy,
  TudorIdentityRequirement,
  TudorReferenceAdmission,
} from "./tudorReference.ts";

export const COMPONENT_KEYS = [
  "dial",
  "hands",
  "bezel",
  "crown",
  "bracelet",
  "clasp",
  "movement",
  "crystal",
] as const;
export type ComponentKey = (typeof COMPONENT_KEYS)[number];

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  dial: "Dial",
  hands: "Hands",
  bezel: "Bezel",
  crown: "Crown",
  bracelet: "Bracelet / strap",
  clasp: "Clasp",
  movement: "Movement",
  crystal: "Crystal",
};

export const COMPONENT_REPRESENTATIONS = [
  "original",
  "period_correct",
  "service_replacement",
  "unverified",
] as const;
export type ComponentRepresentation = (typeof COMPONENT_REPRESENTATIONS)[number];

export const REPRESENTATION_LABELS: Record<ComponentRepresentation, string> = {
  original: "Original to this watch",
  period_correct: "Period-correct",
  service_replacement: "Service replacement",
  unverified: "Unverified",
};

/* ── Packaging classification (four states) ──────────────────────────────
   A box is optional. The claim about it is not. */

export const PACKAGING_CLASSIFICATIONS = [
  "original_to_watch",
  "period_appropriate",
  "replacement",
  "unverified",
] as const;
export type PackagingClassification = (typeof PACKAGING_CLASSIFICATIONS)[number];

export const PACKAGING_LABELS: Record<PackagingClassification, string> = {
  original_to_watch: "Original to this watch",
  period_appropriate: "Period-appropriate",
  replacement: "Replacement",
  unverified: "Unverified",
};

export const PACKAGING_DESCRIPTIONS: Record<PackagingClassification, string> = {
  original_to_watch:
    "Supported by documentation, contemporaneous evidence, or a defensible chain of possession.",
  period_appropriate:
    "Correct for the era or reference family, but not proven to have accompanied this exact watch.",
  replacement: "Added later and accurately represented as such.",
  unverified: "Relationship to the watch cannot be established.",
};

/* ── Admission state — the seller's claims, carried in details.admission ──
   Box inclusion is NOT stored here: it is composed at read time from the
   existing Included-with-watch checklist, one source of truth. */

export type AdmissionState = {
  /** Entry condition: the original identity-bearing documentation can be provided. */
  documentationAvailable?: boolean;
  /** Entry condition: complete wearable watch — never head-only or an unfinished project. */
  completeWatch?: boolean;
  /** Per-component representation claims. All components must be classified. */
  components?: Partial<Record<ComponentKey, ComponentRepresentation>>;
  /** Required whenever the Included-with-watch checklist includes a Box. */
  packaging?: PackagingClassification;
  /** The complete documented Style value exactly as entered, when the seller
      supplied a composite Style rather than a bare reference (Style-number
      ruling 2026-08-06). Kept SEPARATE from the canonical reference — never
      a serial number, never truncated, never substituted. Its presence is a
      documentary identity CLAIM pending image verification; it never
      satisfies the original-documentation gate by itself. */
  styleNumber?: string;
  /** Review affirmation: replacement components are stated plainly in the description. */
  componentsStatedPlainly?: boolean;
  /** Track 2 (enhanced-evidence Tudor): seller-entered identity-marking
      values, keyed by the admitted reference's requirement keys. Evidence
      ANSWERS only — the requirements themselves live on the canonical
      Vault reference and are re-resolved server-side, so seller-editable
      state can never widen what is demanded of it. */
  enhancedIdentityEvidence?: Record<string, string>;
};

/* ── Early, exact eligibility stops (locked copy) ───────────────────────── */

export const ADMISSION_STOPS = {
  documentationUnavailable:
    "FairWatchTrade requires the original identity-bearing documentation for Rolex listings. This watch cannot continue through the Rolex path without it.",
  incompleteWatch:
    "FairWatchTrade accepts complete, wearable Rolex watches. Watch heads and unfinished project watches are not eligible.",
  componentUnsupported:
    "A component claim remains unsupported. Classify it accurately as original, period-correct, replacement, or unverified before continuing.",
  unsupportedFullSet:
    "The watch may include documentation and a box, but the relationship among them is not sufficiently supported for “full set” language.",
} as const;

/* Tudor's own stop table — same keys, Tudor's own words. Never Rolex copy
   with the brand swapped by hand later: the gates select a table by the
   profile's brand, Rolex resolves to the byte-identical object above, and
   neither brand can drift into lecturing the other's sellers. */
export const TUDOR_ADMISSION_STOPS = {
  documentationUnavailable:
    "FairWatchTrade requires the original identity-bearing documentation for this Tudor reference. This watch cannot continue without it.",
  incompleteWatch:
    "FairWatchTrade accepts complete, wearable Tudor watches. Watch heads and unfinished project watches are not eligible.",
  componentUnsupported: ADMISSION_STOPS.componentUnsupported,
  unsupportedFullSet: ADMISSION_STOPS.unsupportedFullSet,
} as const;

/* The reference-policy stop. This is NOT an evidence failure and must
   never read like one: no amount of photographs overcomes a reference
   that is not admitted, and the copy neither blames the watch nor
   promises that more effort would change the answer. */
export const TUDOR_REFERENCE_NOT_ADMITTED =
  "This Tudor reference is not currently admitted to FairWatchTrade. FairWatchTrade accepts selected Tudor references rather than the brand generally.";

/* ── The requirement profile ─────────────────────────────────────────────── */

export type RequiredView = {
  category: PhotoCategory;
  /** OR-alternatives: any ONE of the primary category or these satisfies the
      view (Photos-step ruling 2026-08-06 — "Movement or service evidence" is
      a genuine OR; a solid-caseback watch is never opened just to produce a
      movement photograph). Only the exact listed categories count — an
      unrelated tag can never satisfy a view by accident. */
  altCategories?: PhotoCategory[];
  /** The evidence this view exists to support, in the seller's language. */
  view: string;
};

export type EntryCondition = {
  key: "documentationAvailable" | "completeWatch";
  prompt: string;
  stop: string;
  /** Default true. False marks a condition whose "No" answer ROUTES rather
      than stops — Track 2 Tudor: no original papers is not a refusal, it
      is the turn into the enhanced evidence corridor. Absent on every
      Rolex condition, whose behavior is unchanged. */
  stopsWhenFalse?: boolean;
};

export type RequirementProfile = {
  brand: "Rolex" | "Tudor";
  /** Shown the moment Curation identifies the brand. */
  activationNote: string;
  /** The photograph checklist for this profile — evidence, not gallery suggestions. */
  requiredViews: RequiredView[];
  photosNote: string;
  entryConditions: EntryCondition[];
  /** Tudor only. The documentation policy of the ADMITTED reference and,
      under enhanced_evidence_allowed, the identity markings it requires.
      Absent on Rolex — absence selects the default documentation gate,
      which is the exact pre-existing branch. */
  documentationPolicy?: TudorDocumentationPolicy;
  identityEvidence?: TudorIdentityRequirement[];
};

const ROLEX_PROFILE: RequirementProfile = {
  brand: "Rolex",
  activationNote:
    "Rolex-specific requirements are now active. This listing will require full authentic documentation, exact component representation, completeness checks, and stricter review before publication. A box is optional and must be classified if included.",
  requiredViews: [
    { category: "Dial", view: "Dial and hands" },
    { category: "Caseback", view: "Caseback" },
    { category: "Crown Side", view: "Crown and side profile" },
    { category: "Non-Crown Side", view: "Case, serial and reference evidence" },
    { category: "Bracelet/Strap", view: "Bracelet or strap" },
    { category: "Clasp/Pin Buckle", view: "Clasp and code" },
    /* Consolidation ruling 2026-08-06: "Movement or service evidence" is no
       longer a REQUIRED view. Movement photography is optional when
       naturally available — a solid-caseback Rolex is never opened for
       admission — and service documentation is optional supporting
       evidence that may strengthen the listing but never blocks it.
       Uploading a service document means SERVICE DOCUMENTATION PROVIDED,
       never VERIFIED. */
    { category: "Papers/Warranty", view: "Warranty card / papers" },
  ],
  photosNote:
    "These images support component correctness and completeness. Serial and reference photographs remain private evidence unless publication policy explicitly permits a safe partial display — please do not obscure them from FairWatchTrade review. Movement photographs and service documentation are welcome supporting evidence, never required — a solid caseback never needs to be opened for admission. Service Evidence images stay off the public listing unless you deliberately choose otherwise.",
  entryConditions: [
    {
      key: "documentationAvailable",
      prompt: "I can provide the original identity-bearing documentation for this watch.",
      stop: ADMISSION_STOPS.documentationUnavailable,
    },
    {
      key: "completeWatch",
      prompt: "The watch is complete and wearable — not a watch head or an unfinished project.",
      stop: ADMISSION_STOPS.incompleteWatch,
    },
  ],
};

/* ── The Tudor profile — derived per admitted reference, never a constant ──
   Rolex has one profile because Rolex has one policy. A Tudor profile is a
   function of WHICH reference was admitted: its documentation policy and,
   under enhanced evidence, the exact identity markings that reference
   demands. Mechanics are shared with Rolex — views, entry conditions,
   component and packaging law — while every word of copy is Tudor's own.

   Papers/Warranty is a required VIEW only under original_required. Under
   enhanced_evidence_allowed the papers may legitimately not exist, so the
   view cannot be a precondition — but a seller on that reference who DOES
   have papers still passes through the full Track 1 documentation gate,
   itemization and photograph included. Old does not make original papers
   invalid. */
export function tudorProfileFor(
  referenceAdmission: TudorReferenceAdmission | null | undefined
): RequirementProfile | null {
  if (!referenceAdmission?.admitted) return null;
  const enhanced =
    referenceAdmission.documentationPolicy === "enhanced_evidence_allowed";
  return {
    brand: "Tudor",
    documentationPolicy: referenceAdmission.documentationPolicy,
    identityEvidence: referenceAdmission.identityEvidence,
    activationNote: enhanced
      ? "This Tudor reference is admitted to FairWatchTrade. Exact identity, component representation, and completeness requirements are now active. If the original papers are absent, this reference is authorized for the enhanced identity-evidence path instead."
      : "This Tudor reference is admitted to FairWatchTrade. Exact identity, original documentation, component representation, and completeness requirements are now active. A box is optional and must be classified if included.",
    requiredViews: [
      { category: "Dial", view: "Dial and hands" },
      { category: "Caseback", view: "Caseback" },
      { category: "Crown Side", view: "Crown and side profile" },
      { category: "Non-Crown Side", view: "Case, serial and reference markings" },
      { category: "Bracelet/Strap", view: "Bracelet or strap" },
      { category: "Clasp/Pin Buckle", view: "Clasp and code" },
      ...(enhanced
        ? []
        : [{ category: "Papers/Warranty", view: "Warranty card / papers" } as RequiredView]),
    ],
    photosNote:
      "These images support exact identity, component correctness and completeness. Serial and reference marking photographs remain review evidence — please do not obscure them from FairWatchTrade review. Never open a case or remove a bracelet just to produce a photograph: photograph what is safely visible, and service documentation is welcome supporting evidence, never required.",
    entryConditions: [
      {
        key: "documentationAvailable",
        prompt: enhanced
          ? "I can provide the original matching papers for this watch."
          : "I can provide the original identity-bearing documentation for this watch.",
        stop: TUDOR_ADMISSION_STOPS.documentationUnavailable,
        ...(enhanced ? { stopsWhenFalse: false } : {}),
      },
      {
        key: "completeWatch",
        prompt:
          "The watch is complete and wearable — not a watch head or an unfinished project.",
        stop: TUDOR_ADMISSION_STOPS.incompleteWatch,
      },
    ],
  };
}

/** The one lookup. Null = the standard curated path, entirely untouched.
 *
 *  Deliberately SYNCHRONOUS, exactly as before. Tudor admission requires a
 *  Vault answer, and that answer is resolved through the existing Watch
 *  Identity seam by the caller's own layer — the API route on the server,
 *  the draft's derived summary on the client — then handed in here as
 *  data. Eight call sites keep their shape; a brand without its admission
 *  answer is simply not a profile brand yet, which is also the truthful
 *  dormant state: until a reference is admitted somewhere, Tudor resolves
 *  to null everywhere, and nothing below this line is reachable. */
export function requirementProfileFor(
  brand: string | null | undefined,
  referenceAdmission?: TudorReferenceAdmission | null
): RequirementProfile | null {
  const b = (brand ?? "").trim().toLowerCase();
  if (b === "rolex") return ROLEX_PROFILE;
  if (b === "tudor") return tudorProfileFor(referenceAdmission);
  return null;
}

/* ── Watch-identity change law (admission-state reset) ───────────────────
   Admission answers are affirmations about ONE physical watch: "I can
   provide THIS watch's documentation", "THIS watch is complete", "THIS
   component is original". They must never silently survive a change of
   which watch the draft is about — a seller who affirmed a Submariner's
   papers and then retyped the field into a Datejust would otherwise arrive
   at Review pre-affirmed on answers nobody gave about the Datejust.

   What counts as "the same watch" here deliberately reuses the semantics
   the product already has, rather than inventing a second identity:

   · brand equality is the dispatcher's own rule above — trim + lowercase;
   · reference equality is canonicalReferenceText's rule from the Sell
     path: trimmed text, except that under the Rolex profile a documented
     Style and its derived canonical reference are the SAME identity, so
     editing R79173327B6252 down to 79173 is a spelling change, not a
     different watch, and must not cost the seller their affirmations.

   The reset itself lives with the draft's owner (the Sell Flow patch
   door); this function only answers the question, so the rule is testable
   without a browser and cannot drift per-surface. */

/** The reference text's identity under a brand — trim, plus the Rolex
    Style→canonical equivalence when the brand has the Rolex profile. */
export function normalizedReferenceIdentity(
  brand: string | null | undefined,
  reference: string | null | undefined
): string {
  const trimmed = (reference ?? "").trim();
  if (!requirementProfileFor(brand)) return trimmed;
  const ident = classifyRolexIdentifier(trimmed);
  return ident.kind === "unsupported" ? trimmed : ident.reference;
}

/** True when brand/reference now describe a materially different watch. */
export function watchIdentityChanged(
  prev: { brand: string; reference: string },
  next: { brand: string; reference: string }
): boolean {
  const prevBrand = prev.brand.trim().toLowerCase();
  const nextBrand = next.brand.trim().toLowerCase();
  if (prevBrand !== nextBrand) return true;
  return (
    normalizedReferenceIdentity(prev.brand, prev.reference) !==
    normalizedReferenceIdentity(next.brand, next.reference)
  );
}

/* ── Composition helpers (read-time, single source of truth) ─────────────── */

export function admissionBoxIncluded(includedWithWatch: string[] | undefined): boolean {
  return (includedWithWatch ?? []).includes("Box");
}

function papersItemized(includedWithWatch: string[] | undefined): boolean {
  const included = includedWithWatch ?? [];
  return included.includes("Papers") || included.includes("Warranty Card");
}

export function missingRequiredViews(
  profile: RequirementProfile,
  photoCategories: string[]
): RequiredView[] {
  const have = new Set(photoCategories);
  return profile.requiredViews.filter(
    (v) =>
      !have.has(v.category) &&
      !(v.altCategories ?? []).some((alt) => have.has(alt))
  );
}

/** "Full set" is genuinely supportable only when the watch, its papers, and a
    box classified as original to this watch stand together. */
export function fullSetSupportable(
  admission: AdmissionState | undefined,
  includedWithWatch: string[] | undefined
): boolean {
  return (
    admissionBoxIncluded(includedWithWatch) &&
    papersItemized(includedWithWatch) &&
    admission?.packaging === "original_to_watch"
  );
}

/** Rolex-aware documentation truth. The derived summary status may claim
    "Full Set" only when that claim is supportable; otherwise it degrades to
    the claim the evidence actually carries. Non-profile brands pass through
    untouched. */
export function governDocumentation(
  base: DocumentationStatus,
  profile: RequirementProfile | null,
  admission: AdmissionState | undefined,
  includedWithWatch: string[] | undefined
): DocumentationStatus {
  if (!profile) return base;
  if (base === "Full Set" && !fullSetSupportable(admission, includedWithWatch)) {
    return "Papers Only";
  }
  return base;
}

/** Matches "full set" / "full-set" / "fullset" in seller-authored text. */
const FULL_SET_LANGUAGE = /full[\s-]*set/i;

export function usesFullSetLanguage(text: string | null | undefined): boolean {
  return FULL_SET_LANGUAGE.test(text ?? "");
}

export function unclassifiedComponents(
  admission: AdmissionState | undefined
): ComponentKey[] {
  const components = admission?.components ?? {};
  return COMPONENT_KEYS.filter(
    (k) => !COMPONENT_REPRESENTATIONS.includes(components[k] as ComponentRepresentation)
  );
}

export function replacementComponents(
  admission: AdmissionState | undefined
): ComponentKey[] {
  const components = admission?.components ?? {};
  return COMPONENT_KEYS.filter((k) => components[k] === "service_replacement");
}

/* ── Publication gates (Review step + server enforcement) ────────────────── */

export type GateStatus = "pass" | "needs_confirmation" | "blocked";

export type PublicationGate = {
  key: "identity" | "components" | "completeness" | "packaging";
  title: string;
  status: GateStatus;
  detail: string;
  /** The exact correction that clears a blocked gate, when one exists. */
  correction?: string;
};

export type AdmissionGateInput = {
  admission: AdmissionState | undefined;
  includedWithWatch: string[] | undefined;
  documentation: string | undefined;
  description: string | null | undefined;
  provenanceNote: string | null | undefined;
  photoCategories: string[];
};

export function evaluateAdmissionGates(
  profile: RequirementProfile | null,
  input: AdmissionGateInput
): {
  gates: PublicationGate[];
  ready: boolean;
} {
  const { admission, includedWithWatch, documentation, description, provenanceNote } =
    input;
  const gates: PublicationGate[] = [];

  /* Brand-selected copy. Rolex — and a null profile, the pre-widening
     callers' shape — resolves to the byte-identical ADMISSION_STOPS object
     the gates always used; only a Tudor profile selects Tudor's words.
     Predicates below are untouched by this selection. */
  const stops =
    profile?.brand === "Tudor" ? TUDOR_ADMISSION_STOPS : ADMISSION_STOPS;

  // 1 · Identity and documentation
  const papersPhotographed = input.photoCategories.includes("Papers/Warranty");

  /* Track 2 turn — the ONE additive exception. It exists only for a Tudor
     profile whose ADMITTED REFERENCE carries enhanced_evidence_allowed,
     and only when the seller has said the original papers are absent.
     Every other case — every Rolex, every null profile, every
     original_required Tudor, and an enhanced-reference seller who HAS the
     papers — takes the exact pre-existing branch below, unchanged. */
  const enhancedEvidenceActive =
    profile?.documentationPolicy === "enhanced_evidence_allowed" &&
    admission?.documentationAvailable !== true;

  if (enhancedEvidenceActive) {
    const required = profile?.identityEvidence ?? [];
    const supplied = admission?.enhancedIdentityEvidence ?? {};
    const missing = required.filter((r) => !(supplied[r.key] ?? "").trim());
    if (required.length === 0) {
      /* A parser this state cannot come from — enhanced admission without
         identifier requirements is refused at read time — but a gate that
         demands nothing in place of papers must not exist even in theory. */
      gates.push({
        key: "identity",
        title: "Identity and documentation",
        status: "blocked",
        detail: stops.documentationUnavailable,
      });
    } else if (missing.length > 0) {
      gates.push({
        key: "identity",
        title: "Identity and documentation",
        status: "blocked",
        detail: `This reference is authorized for identity evidence in place of original papers. Still needed: ${missing
          .map((r) => r.label)
          .join(", ")}.`,
      });
    } else {
      gates.push({
        key: "identity",
        title: "Identity and documentation",
        status: "pass",
        detail:
          "Identity evidence supplied in place of original papers — authorized for this reference.",
      });
    }
  } else if (admission?.documentationAvailable !== true) {
    gates.push({
      key: "identity",
      title: "Identity and documentation",
      status: "blocked",
      detail: stops.documentationUnavailable,
    });
  } else if (!papersItemized(includedWithWatch)) {
    gates.push({
      key: "identity",
      title: "Identity and documentation",
      status: "blocked",
      detail:
        "The identity-bearing documentation must appear under Included with watch — add Papers or Warranty Card, or the listing cannot claim it.",
    });
  } else if (!papersPhotographed) {
    gates.push({
      key: "identity",
      title: "Identity and documentation",
      status: "blocked",
      detail:
        "Photograph the warranty card or papers. Identity-bearing documentation must be shown, not merely claimed.",
    });
  } else {
    gates.push({
      key: "identity",
      title: "Identity and documentation",
      status: "pass",
      detail: "Reference, documentation, and supporting photographs supplied.",
    });
  }

  // 2 · Component representation
  const unclassified = unclassifiedComponents(admission);
  const replacements = replacementComponents(admission);
  if (unclassified.length > 0) {
    gates.push({
      key: "components",
      title: "Component representation",
      status: "blocked",
      detail: stops.componentUnsupported,
      correction: `Still unclassified: ${unclassified
        .map((k) => COMPONENT_LABELS[k])
        .join(", ")}.`,
    });
  } else if (replacements.length > 0 && admission?.componentsStatedPlainly !== true) {
    const named = replacements.map((k) => COMPONENT_LABELS[k]).join(", ");
    gates.push({
      key: "components",
      title: "Component representation",
      status: "needs_confirmation",
      detail: `${named} ${
        replacements.length === 1 ? "is" : "are"
      } marked as a service replacement; the description must state this plainly.`,
    });
  } else {
    gates.push({
      key: "components",
      title: "Component representation",
      status: "pass",
      detail: "Every component claim is classified and accurately represented.",
    });
  }

  // 3 · Completeness
  if (admission?.completeWatch !== true) {
    gates.push({
      key: "completeness",
      title: "Completeness",
      status: "blocked",
      detail: stops.incompleteWatch,
    });
  } else {
    gates.push({
      key: "completeness",
      title: "Completeness",
      status: "pass",
      detail: "Complete wearable watch; no head-only or project-watch condition.",
    });
  }

  // 4 · Packaging language
  const hasBox = admissionBoxIncluded(includedWithWatch);
  const supportable = fullSetSupportable(admission, includedWithWatch);
  const sellerText = `${description ?? ""}\n${provenanceNote ?? ""}`;
  const packagingLabel = admission?.packaging
    ? PACKAGING_LABELS[admission.packaging].toLowerCase()
    : "unverified";
  if (hasBox && !admission?.packaging) {
    gates.push({
      key: "packaging",
      title: "Packaging language",
      status: "blocked",
      detail:
        "How is the included box related to this watch? Classify it as original to this watch, period-appropriate, replacement, or unverified.",
    });
  } else if (usesFullSetLanguage(sellerText) && !supportable) {
    gates.push({
      key: "packaging",
      title: "Packaging language",
      status: "blocked",
      detail: stops.unsupportedFullSet,
      correction: `Remove “full set” and describe the box as ${
        hasBox ? packagingLabel : "not included"
      }.`,
    });
  } else if (documentation === "Full Set" && !supportable) {
    // Defense in depth — the Details derivation should make this unreachable.
    gates.push({
      key: "packaging",
      title: "Packaging language",
      status: "blocked",
      detail: stops.unsupportedFullSet,
    });
  } else {
    gates.push({
      key: "packaging",
      title: "Packaging language",
      status: "pass",
      detail: hasBox
        ? `Box classified as ${packagingLabel}; language matches the evidence.`
        : "No box included; no packaging claim to support.",
    });
  }

  return { gates, ready: gates.every((g) => g.status === "pass") };
}

/* ── Server-side publication verdict ─────────────────────────────────────
   POST /api/listings calls this for profile brands. The same gate logic the
   Review step renders decides here — the server never trusts that the
   client corridor was walked. */

export type PublishAdmissionVerdict = { ok: true } | { ok: false; detail: string };

export function evaluatePublishAdmission(
  profile: RequirementProfile,
  input: AdmissionGateInput
): PublishAdmissionVerdict {
  const missing = missingRequiredViews(profile, input.photoCategories);
  if (missing.length > 0) {
    return {
      ok: false,
      detail: `${profile.brand} listings require these photograph views: ${missing
        .map((v) => v.view)
        .join("; ")}.`,
    };
  }
  const { gates, ready } = evaluateAdmissionGates(profile, input);
  if (!ready) {
    const offending = gates.find((g) => g.status !== "pass");
    return {
      ok: false,
      detail: offending
        ? `${offending.title}: ${offending.detail}`
        : "This listing has not satisfied the brand admission requirements.",
    };
  }
  return { ok: true };
}
