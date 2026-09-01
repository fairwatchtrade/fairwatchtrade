/* ════════════════════════════════════════════════════════════════════════
   RETURN TO DRAFT — THE WRITE — lib/listingDraftRecoveryService.ts

   SERVER ONLY. The other half of lib/listingDraftRecovery.ts: that module
   decides WHAT the seller should get back, this one puts it where Sell looks.

   ── WHAT WAS BROKEN ────────────────────────────────────────────────────
   "Return to Draft" wrote listings.status = 'draft' and stopped. Sell's saved
   listings read `listing_drafts`, and nothing loaded a `listings` row into the
   wizard, so the watch left the only workspace that could edit it. The founder
   asked for a photograph and the seller had no door to add one through.

   ── THE BINDING IS THE POINT ───────────────────────────────────────────
   `listing_drafts.listing_id` already existed and already meant the right
   thing. A draft carrying one is a listing being CORRECTED rather than a watch
   being admitted, and that single fact is what lets Sell unlock a returned
   listing without anybody forging a curation verdict, and what lets
   resubmission update the original row instead of minting a second watch.

   One draft per listing. Re-returning the same watch reuses its draft rather
   than accumulating a new one each time a founder changes their mind.

   ── FAILURE POSTURE ────────────────────────────────────────────────────
   A founder's decision must never fail because this did. Every entry point
   calls it non-fatally and it returns a result rather than throwing: a listing
   whose recovery draft could not be written is still returned to the seller,
   and the founder's decision still stands. The seller sees no saved listing —
   which is exactly today's behaviour, so the failure mode is "no worse than
   before" rather than "the decision was lost".

   PFC274 = 62 — the evaluate route is untouched. Nothing here evaluates.
   ════════════════════════════════════════════════════════════════════════ */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  draftContentFromListing,
  type RecoverableListing,
} from "@/lib/listingDraftRecovery";

/** Exactly the columns the mapping reads, plus the owner the draft belongs to. */
const LISTING_COLUMNS =
  "id, seller_id, brand, custom_brand_flag, model, reference, year, condition, " +
  "asking_price, asking_price_raw, asking_currency, provenance_note, " +
  "vault_reference_id, significance_score, photos, has_bracelet, open_to_trades, " +
  "photo_presentation, details, description, description_passed_ai";

export type RecoveryDraftResult =
  | { ok: true; draftId: string; reused: boolean }
  | { ok: false; skipped: string };

/**
 * Make sure the seller can actually reach a listing that was handed back.
 *
 * Idempotent. Safe to call on every return-to-draft, from the founder path and
 * the automatic one alike.
 */
export async function ensureRecoveryDraftForListing(
  service: SupabaseClient,
  listingId: string
): Promise<RecoveryDraftResult> {
  if (!listingId) return { ok: false, skipped: "missing_listing_id" };

  const { data: listing, error: readErr } = await service
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("id", listingId)
    .maybeSingle();
  if (readErr) return { ok: false, skipped: `listing_read_failed: ${readErr.message}` };
  if (!listing) return { ok: false, skipped: "listing_not_found" };

  const row = listing as unknown as RecoverableListing & {
    id: string;
    seller_id: string | null;
  };
  if (!row.seller_id) return { ok: false, skipped: "listing_has_no_seller" };

  /* The listing's own draft, if it ever had one. Newest first: a listing
     should only ever have one bound draft, and if history left more than one
     the most recently touched is the seller's real work. */
  const { data: existing, error: draftErr } = await service
    .from("listing_drafts")
    .select("id, content, revision")
    .eq("listing_id", listingId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (draftErr) return { ok: false, skipped: `draft_read_failed: ${draftErr.message}` };

  /* The listing is authoritative for everything it holds; the surviving draft
     contributes only what the listings table has no column for. */
  const content = draftContentFromListing(row, existing?.content ?? null);

  if (existing) {
    const { error: updErr } = await service
      .from("listing_drafts")
      .update({
        content,
        status: "active",
        /* Editing authority comes home. A handoff issued before the listing
           was submitted must not still be outstanding on a draft the seller
           is being asked to pick back up. */
        active_editor: "desktop",
        handoff_status: "none",
        handoff_token: null,
        handoff_expires_at: null,
        revision: (existing.revision ?? 0) + 1,
        updated_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (updErr) return { ok: false, skipped: `draft_update_failed: ${updErr.message}` };
    return { ok: true, draftId: existing.id as string, reused: true };
  }

  /* No draft ever existed — an API, script or dealer-materialised listing.
     One is created so the seller has the same door as everybody else. */
  const { data: created, error: insErr } = await service
    .from("listing_drafts")
    .insert({
      seller_id: row.seller_id,
      listing_id: listingId,
      content,
      status: "active",
      active_editor: "desktop",
    })
    .select("id")
    .maybeSingle();
  if (insErr) return { ok: false, skipped: `draft_insert_failed: ${insErr.message}` };
  if (!created) return { ok: false, skipped: "draft_insert_returned_nothing" };

  return { ok: true, draftId: created.id as string, reused: false };
}
