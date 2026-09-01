/* ════════════════════════════════════════════════════════════════════════
   RETURN TO DRAFT — RECOVERING THE SELLER'S WORK — lib/listingDraftRecovery.ts

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "Return to Draft puts the listing back in the seller's drafts."

   It did not. `listings.status = 'draft'` and a Sell saved listing are two
   different things in two different tables. Sell reads `listing_drafts`, and
   nothing anywhere loaded a `listings` row back into the wizard — so a watch
   the founder returned for changes became uneditable by the only person who
   could change it. `listings_update_own` permits a seller UPDATE on
   draft/rejected, but the wizard could not show them the row to update.

   This module is the missing half: it turns a listing back into the wizard's
   own content shape, so the seller gets their partial work handed back.

   PURE. No I/O, no Supabase, no React — the mapping is the part that can
   silently eat a description or a photo set, so it is testable on its own and
   is pinned by scripts/listing-draft-recovery.test.mjs.

   ── WHICH SOURCE WINS ──────────────────────────────────────────────────
   THE LISTING WINS for everything the listing holds. That row is what was
   submitted, reviewed and decided on; a draft untouched since before
   publication is stale by definition. Reopening stale content and letting the
   seller resubmit it would silently revert founder corrections.

   THE PRIOR DRAFT WINS only for state the listings table never had a column
   for — see DRAFT-ONLY below. Carried forward when a draft survives, honestly
   defaulted when one does not.

   ── DRAFT-ONLY STATE ───────────────────────────────────────────────────
   `photoRedactions` is the load-bearing one. Its own type says it "lives in
   DRAFT state only — never in presentation metadata, which reaches public
   surfaces", so a listing genuinely cannot carry it. If the seller redacted a
   serial number, that record exists in their draft and nowhere else; losing it
   costs them the ability to re-edit or clear the redaction from the original.

   `curationReasoning` and `strikes` are the same shape of fact — produced by
   the wizard's own gates, never persisted onto the listing.

   ── WHAT IS DELIBERATELY NOT CARRIED ───────────────────────────────────
   `tudorAdmission` is dropped, always. Its type says it is advisory, is keyed
   to an identity context so staleness is detectable, and that "an absent key
   reads as stale, which is the safe direction". Reconstructing it would assert
   a summary nobody recomputed.

   ── CURATION IS NEVER MANUFACTURED ─────────────────────────────────────
   An earlier draft of this module derived `curationDecision: "pass"` from the
   listing having reached a reviewable status. That was wrong, and the reason
   is worth keeping: the premise "a listing cannot reach review without passing
   curation" holds for the wizard, and the listings that need reconstructing
   are precisely the ones that did NOT come through it — created by the API,
   by a script, or by the dealer materialisation seam. The canary listing for
   this work carries significance_score NULL and score_state {}; nothing in the
   row says the curation evaluator ever ran on it. Writing "pass" would assert
   a specific historical fact about another subsystem in order to satisfy a
   step gate.

   So `curationDecision` is the prior draft's real value when one survives, and
   "pending" when nothing knows — which is the honest word for "nothing knows".

   ⚠ CONSEQUENCE FOR THE CALLER. SellFlow gives a draft whose curationDecision
   is not "pass" no reachable step beyond the first, so a recovered listing
   would strand its seller at curation. The fix is NOT to lie here. It is that
   `listing_drafts.listing_id` already records the fact that matters — a draft
   bound to a listing is a listing being CORRECTED, not a watch being admitted,
   and step reachability belongs to that binding. That is the same fact
   resubmission needs in order to update the existing row instead of minting a
   second watch.

   NOTHING HERE RUNS OR READS THE SCORING MECHANISM. `significanceScore` is
   copied from the column the listing already stores, exactly as it stands; no
   evaluation is performed, requested or re-derived. PFC274 = 62 — the
   evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import type { ListingDraft } from "./listing.ts";

/** The listing columns this mapping reads. Named explicitly so a caller
    cannot pass a partial row and quietly produce an empty draft. */
export type RecoverableListing = {
  brand: string | null;
  custom_brand_flag: boolean | null;
  model: string | null;
  reference: string | null;
  year: string | null;
  condition: string | null;
  asking_price: number | null;
  asking_price_raw: string | null;
  asking_currency: string | null;
  provenance_note: string | null;
  vault_reference_id: string | null;
  significance_score: number | null;
  photos: unknown;
  has_bracelet: boolean | null;
  open_to_trades: boolean | null;
  photo_presentation: unknown;
  details: unknown;
  description: string | null;
  description_passed_ai: boolean | null;
};

/** The wizard's saved envelope. */
export type DraftContent = {
  draft: ListingDraft;
  progress: { reached: number; at: number };
};

/* The Review step. A returned listing has already been through every step, so
   every step is reachable — and the seller opens on the one surface that shows
   the whole watch at once, rather than at chrome they have to walk past.
   (v7.76: advancing lands on the work.) */
const REVIEW_STEP = 4;

/* ── WHY NO vaultReferenceKey IS EMITTED ───────────────────────────────
   v7.82 emitted one, built as a raw `brand|model|reference` join. That looks
   right and is not: the wizard's key normalises all three first
   (canonicalIdentityKey → normalizeBrand | normalizeModelText |
   referenceCompareKey). So the emitted key never matched what SellFlow
   recomputes, and the carried canonical id was discarded as stale every time.

   Emitting nothing is strictly better than emitting a wrong context. The type
   says an absent key "reads as stale, which is the safe direction", the wizard
   recomputes one the moment the seller touches the identity fields, and
   resubmission re-resolves canonical identity server-side regardless — so no
   real answer is lost, and the code stops asserting a context it never had.

   ⚠ The carried vaultReferenceId is therefore still dropped on load. Making it
   survive means calling the wizard's own key function, and that module reaches
   for the "@/" alias which node's strip-types runner cannot resolve — so it
   needs canonicalIdentity's imports made node-safe first. That is identity
   work and it is parked. Recorded here rather than bodged. */

function priorDraftOf(priorContent: unknown): Partial<ListingDraft> {
  if (!priorContent || typeof priorContent !== "object") return {};
  const draft = (priorContent as Record<string, unknown>).draft;
  if (!draft || typeof draft !== "object") return {};
  return draft as Partial<ListingDraft>;
}

/**
 * Rebuild the wizard's content from a listing the founder handed back.
 *
 * `priorContent` is that listing's own `listing_drafts.content` when one
 * survives, and null when the listing never came from the wizard. It
 * contributes ONLY the fields the listings table has no column for.
 */
export function draftContentFromListing(
  listing: RecoverableListing,
  priorContent: unknown = null
): DraftContent {
  const prior = priorDraftOf(priorContent);

  const brand = listing.brand ?? "";
  const model = listing.model ?? "";
  const reference = listing.reference ?? "";

  /* The exact text the parser accepted is preserved on the listing precisely
     so it can never drift from the canonical amount. Prefer it; fall back to
     the number only for a row predating the raw column. */
  const askingPrice =
    listing.asking_price_raw ??
    (listing.asking_price != null ? String(listing.asking_price) : "");
  const askingCurrency = listing.asking_currency ?? "";

  const draft: ListingDraft = {
    // Step 1 — curation
    brand,
    customBrandFlag: listing.custom_brand_flag === true,
    model,
    reference,
    year: listing.year ?? "",
    condition: (listing.condition ?? "") as ListingDraft["condition"],
    askingPrice,
    askingCurrency,
    /* The money pair is confirmed exactly when both halves are present: the
       listing's own CHECK refuses one without the other, so a row carrying
       both was confirmed on the way in. */
    askingConfirmed: askingPrice !== "" && askingCurrency !== "",
    provenanceNote: listing.provenance_note ?? "",
    vaultReferenceId: listing.vault_reference_id ?? null,
    // vaultReferenceKey deliberately absent — see WHY NO vaultReferenceKey above.
    // tudorAdmission deliberately omitted — see header.
    significanceScore: listing.significance_score ?? null,
    /* The real verdict when one survives; "pending" when nothing knows. Never
       inferred from the listing's status — see CURATION IS NEVER MANUFACTURED. */
    curationDecision: prior.curationDecision ?? "pending",
    curationReasoning: prior.curationReasoning ?? "",

    // Step 2 — photos
    photos: (Array.isArray(listing.photos)
      ? listing.photos
      : []) as ListingDraft["photos"],
    hasBracelet: listing.has_bracelet === true,
    openToTrades: listing.open_to_trades === true,
    ...(listing.photo_presentation
      ? {
          photoPresentation:
            listing.photo_presentation as ListingDraft["photoPresentation"],
        }
      : {}),
    ...(prior.photoRedactions ? { photoRedactions: prior.photoRedactions } : {}),

    // Step 3 — details
    details: (listing.details ?? {}) as ListingDraft["details"],

    // Step 4 — description
    description: listing.description ?? "",
    descriptionPassedAI: listing.description_passed_ai ?? null,
    strikes: typeof prior.strikes === "number" ? prior.strikes : 0,
  };

  return { draft, progress: { reached: REVIEW_STEP, at: REVIEW_STEP } };
}
