import { createServiceClient } from "@/lib/supabase/service";
import { isPromotableFinding, findingRequiresReview } from "@/lib/integrity";
import { upsertVersioned } from "@/lib/research/versionedUpsert";

/* ════════════════════════════════════════════════════════════════════════
   LISTING ADDENDUM COMPILER — lib/research/compileListingAddendum.ts

   Input: listingId. Compiles Marketplace Knowledge (listing-specific) and
   the sanitized FairWatchTrade Review narrative. Runs ENTIRELY server-side
   via the service-role client — never a buyer's session client — because
   the Review narrative is derived from listing_integrity_provider_results,
   whose evidence table is founder-UUID-locked at the RLS level. This
   function is a trusted-server-only utility: it is not request-scoped and
   is meant to be invoked by a future trigger (listing edit, integrity-review
   completion, admin refresh) — that orchestration is NOT part of this build.

   ── Marketplace Knowledge — real fields only ───────────────────────────
   Verified this session: no listing_revisions, additional_photos, or
   service_updates table exists anywhere in the schema. The ONLY genuinely
   listing-specific marketplace field that exists today is listings.
   provenance_note. Revisions / Additional Photos disclosure / service
   updates are represented as { available: false } — same honesty principle
   as Reference Knowledge's "Not yet catalogued": we state absence plainly,
   we do not fabricate placeholder content. Collector Impressions integration
   is explicitly future (per the brief), not attempted here.

   The "Additional Photos disclosure" locked copy was not available to this
   compiler — flagged in delivery notes, not guessed at.

   ── FairWatchTrade Review — sanitized, never raw evidence ──────────────
   Reuses isPromotableFinding / findingRequiresReview from lib/integrity.ts
   EXACTLY as verified this session — not reimplemented. Reads
   listing_media → listing_integrity_provider_results (by media_id), the
   same join shape already used in app/api/listings/route.ts's evidence
   promotion step.

   Produces exactly ONE of three honest states — chosen because most live
   listings (anything published through desktop) will have ZERO listing_media
   rows today, since only the mobile wizard populates that table. A narrative
   implying "this listing was reviewed" would be a fabrication for those
   listings. The three states:
     · reviewed_clean   — findings exist, all promotable ones are 'passed'
     · reviewed_flagged — a promotable finding requires review
     · not_reviewed     — no listing_media rows, or no completed provider
                          results — the engine never ran on this listing's
                          photos (true today for every desktop-published
                          listing, and any pre-Integrity-Engine listing)

   The stored payload contains ONLY the coarse status + the sanitized
   sentence — never provider names, raw classifications, confidence values,
   or evidence rows. This status string is a report-level derived label, not
   the provider's classification vocabulary (passed / review_suggested /
   high_confidence_match) — it is not the thing the boundary forbids exposing.

   FLAGGED, NOT DECIDED HERE: listing_integrity_reviews (human admin
   review/resolution) exists in the schema (verified this session, currently
   0 rows) but is NOT consulted by this compiler — the brief scoped reuse to
   isPromotableFinding/findingRequiresReview only. If an admin later resolves
   a flagged finding, this narrative logic has no way to know and would keep
   reporting "flagged" until refreshed. Whether resolution should override the
   raw finding is a real open question, not answered by this build — see
   delivery notes.

   Writes to listing_addenda, keyed by listing_id, via the shared
   upsertVersioned helper.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

type CompileResult =
  | { ok: true; id: string; version: number }
  | { ok: false; reason: string };

type ReviewStatus = "reviewed_clean" | "reviewed_flagged" | "not_reviewed";

const REVIEW_NARRATIVE: Record<ReviewStatus, string> = {
  reviewed_clean:
    "This listing's photographs satisfied FairWatchTrade's authenticity review prior to publication.",
  reviewed_flagged:
    "This listing's photographs were flagged for additional review as part of FairWatchTrade's authenticity process.",
  not_reviewed:
    "FairWatchTrade's automated photo review has not yet run for this listing.",
};

export async function compileListingAddendum(listingId: string): Promise<CompileResult> {
  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("[research] listing_addenda: service client unavailable:", e);
    return { ok: false, reason: "service_client_unavailable" };
  }

  // ── Fetch the listing row (Marketplace Knowledge source fields) ──
  const { data: listing, error: listingErr } = await service
    .from("listings")
    .select("id, provenance_note")
    .eq("id", listingId)
    .maybeSingle();

  if (listingErr) {
    console.error("[research] listing_addenda: listing read failed:", listingErr.message);
    return { ok: false, reason: "listing_read_failed" };
  }
  if (!listing) {
    return { ok: false, reason: "listing_not_found" };
  }

  // ── Marketplace Knowledge — real fields only, absence stated plainly ──
  const provenanceAvailable =
    typeof listing.provenance_note === "string" && listing.provenance_note.trim() !== "";

  const marketplaceKnowledge = {
    provenanceNote: provenanceAvailable
      ? { available: true, value: listing.provenance_note as string }
      : { available: false, value: null },
    // None of these are backed by a table today (verified this session) —
    // stated as unavailable, not fabricated.
    revisions: { available: false },
    additionalPhotosDisclosure: { available: false },
    serviceUpdates: { available: false },
  };

  // ── FairWatchTrade Review — sanitized, derived server-side ──
  const { data: media, error: mediaErr } = await service
    .from("listing_media")
    .select("id")
    .eq("listing_id", listingId);

  if (mediaErr) {
    console.error("[research] listing_addenda: listing_media read failed:", mediaErr.message);
    return { ok: false, reason: "media_read_failed" };
  }

  const mediaIds = (media ?? []).map((m) => m.id);

  let reviewStatus: ReviewStatus = "not_reviewed";

  if (mediaIds.length > 0) {
    const { data: results, error: resultsErr } = await service
      .from("listing_integrity_provider_results")
      .select("id, classification, execution_status, is_active, detail")
      .in("media_id", mediaIds);

    if (resultsErr) {
      console.error("[research] listing_addenda: provider results read failed:", resultsErr.message);
      return { ok: false, reason: "provider_results_read_failed" };
    }

    // Reused EXACTLY from lib/integrity.ts — not reimplemented.
    const promotable = (results ?? []).filter(isPromotableFinding);

    if (promotable.length > 0) {
      const anyRequiresReview = promotable.some((r) => findingRequiresReview(r.classification));
      reviewStatus = anyRequiresReview ? "reviewed_flagged" : "reviewed_clean";
    }
    // else: media rows exist but no completed/promotable findings yet
    // (e.g. still in-flight, or every attempt was operational-only) —
    // stays "not_reviewed", which is the honest state.
  }

  const fairwatchtradeReview = {
    status: reviewStatus,
    narrative: REVIEW_NARRATIVE[reviewStatus],
  };

  const payload = {
    marketplaceKnowledge,
    fairwatchtradeReview,
  };

  const sectionFreshness = {
    marketplace: "compiled",
    review: reviewStatus,
  };

  const result = await upsertVersioned(
    service,
    "listing_addenda",
    "listing_id",
    listingId,
    payload,
    sectionFreshness
  );

  if (!result) {
    return { ok: false, reason: "upsert_failed" };
  }
  return { ok: true, id: result.id, version: result.version };
}
