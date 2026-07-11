/* ════════════════════════════════════════════════════════════════════════
   RESOLUTION SEAM — lib/research/resolveListingReference.ts

   The single boundary between a listing (the SELLER'S CLAIM — "seller says
   PFC274…") and a Vault reference (FAIRWATCHTRADE'S OPINION — "yes, that's this
   reference"). Those are different facts with different provenance; this seam
   keeps them independent until curation earns the link.

   LOCKED CONTRACT (do not widen in Phase 1):
     resolveListingReference(listingId): Promise<ReferenceResolution | null>
     ReferenceResolution = { referenceId: string; resolutionMethod: string }

   PHASE 1 BEHAVIOUR: returns null. There is deliberately no
   listing_reference_resolution store yet (its durable history, provenance,
   confidence model, supersession rules, and possible Integrity-provider-style
   execution pattern are a dedicated future architecture ruling — not to be
   hardened prematurely to unblock Research Reports). With no verified
   relationship to look up, the seam honestly returns null and the report
   degrades to "Not yet catalogued in the FairWatchTrade Vault."

   Verified at build time: 0 of 3 live listings resolve to a Vault reference by
   text match, and reference-level Vault metadata is empty — so null is the
   correct, honest Phase 1 state, not a stub hiding real data.

   THE RESOLVER FLIGHT fills this function's body (deterministic match →
   confidence → provenance → persistence, per its own ruling) WITHOUT changing
   this signature or any call site. Consumers compile against the contract, not
   the implementation.

   Intentionally minimal: no confidence, no resolvedAt, no provenance object in
   Phase 1. Adding them now would prejudge the resolver's shape.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export type ReferenceResolution = {
  referenceId: string;
  resolutionMethod: string;
};

/**
 * Resolve a listing to the Vault reference it claims, when a verified
 * relationship exists. Phase 1 has no resolution store, so this returns null
 * for every listing; the report's Reference Knowledge section degrades to
 * "Not yet catalogued in the FairWatchTrade Vault."
 *
 * @param listingId - the listing whose Vault reference we attempt to resolve.
 * @returns the resolved reference + method, or null when unresolved.
 */
export async function resolveListingReference(
  listingId: string
): Promise<ReferenceResolution | null> {
  // Referenced so the locked-contract parameter isn't flagged as unused while
  // the body is intentionally empty in Phase 1. The resolver flight replaces
  // everything below this line.
  void listingId;
  return null;
}
