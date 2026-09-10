import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { createDiscoveryClient, listingUrl } from "@/lib/discovery/publicDiscovery";
import {
  project,
  utcAssessmentDay,
  type EligibleListing,
  type LiveSuppression,
  type ProjectionInput,
  type PublicWatchIndexRecord,
  type PublicationEpisode,
  type ReferenceIdentity,
} from "./projection";

/* ════════════════════════════════════════════════════════════════════════
   PUBLIC WATCH INDEX — the reader  (Phase 1, internal only)
   lib/publicWatchIndex/projectionSource.ts

   Governing authority:
   docs/product-laws/Public_Watch_Index_Product_Contract_v2_ADOPTED.md

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "The index is a table, so building it means writing rows."

   It is not. It is a DERIVED public representation of governed identity,
   lifecycle, knowledge and evidence sources — never a second manually
   maintained history ledger (§12). Nothing here writes. Every assertion is
   recomputed from its governed source on every call, which is also why a
   suppression can never be outrun by a rebuild.

   THREE CLIENTS, ON PURPOSE. Mixing them is not sloppiness; each read is
   scoped to the narrowest role that can answer its question.

     · ANONYMOUS (createDiscoveryClient) — current availability and the
       Market Evidence gate. The projection must compute what is PUBLICLY
       true, and the cookie-bound client would widen for a signed-in seller
       (listings_select_public_or_own returns their own drafts). Reading as
       anon makes it structurally impossible for the projection to see more
       than the public can.
     · SERVICE ROLE — publication evidence and suppressions. Both tables deny
       every client role by design, and both are internal-only inputs.
     · NONE — approved public reference knowledge. See below.

   WHY KNOWLEDGE IS ALWAYS UNAVAILABLE IN PHASE 1. `reference_knowledge` is
   NOT read here, and that is deliberate rather than unfinished. The law (§3)
   admits only information APPROVED for public representation, and says
   plainly that a `reference_knowledge` row alone does not qualify. No
   approval state exists anywhere in the schema — that table has version,
   freshness and payload but no approved_at, publication_status, permission
   or reviewer column — and Galaxy visibility is a brand-boundary
   presentation decision that §3 expressly excludes. Because no approval
   check can be COMPLETED, the honest state is unavailable_or_incomplete, not
   "none established". Populating or reading that table to make the assertion
   look answered is forbidden: it is publicly readable today with no approval
   gate in front of it, which is a public-release prerequisite in its own
   right.

   WHY HISTORY IS ALWAYS UNAVAILABLE IN PHASE 1. Durable publication evidence
   EXISTS: listing_lifecycle_events records a BECAME_PUBLIC episode per
   listing, append-only, written by a trigger. That satisfies §5 condition 2.
   Condition 3 — defensible evidence that the episode belongs to THIS
   canonical reference — has no mechanism at all. listing_lifecycle_events
   carries no reference column, and listing_decision_events carries only the
   seller's typed text, which §2 and §5 both refuse as association evidence.
   `listings.vault_reference_id` is a mutable current field and §5 names it
   as insufficient by itself. So the assessment cannot be completed, and the
   law's instruction is explicit: identify that specific prerequisite, and do
   NOT manufacture a history by copying mutable listing rows into an index.

   NO BACKFILL. Nothing here writes history, and nothing infers it.

   Read lib/publicWatchIndex/README.md before changing a rule here.
   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

/** Bound, not pagination: the failure mode at scale is a reported truncation
    rather than an unbounded query. Same discipline as Browse and discovery. */
export const ELIGIBLE_LISTING_CEILING = 200;

/** Why an assertion could not be completed. Internal diagnostics for the
    return and the founder's own reading — never a public field, and never
    shaped so its presence reveals a withheld record. */
export type CoverageNote = {
  assertion: "public_listing_history" | "approved_public_reference_knowledge";
  reason: string;
};

export const KNOWLEDGE_GAP: CoverageNote = {
  assertion: "approved_public_reference_knowledge",
  reason:
    "No approved-public-representation state exists for reference knowledge. " +
    "Galaxy visibility is a brand-boundary presentation decision and does not qualify (contract section 3). " +
    "The check cannot be completed, so the assertion is unavailable rather than negative.",
};

export const HISTORY_GAP: CoverageNote = {
  assertion: "public_listing_history",
  reason:
    "Durable publication evidence exists (listing_lifecycle_events BECAME_PUBLIC), " +
    "but no episode-linked reference-association evidence exists (contract section 5 condition 3). " +
    "Today's listings.vault_reference_id and seller text are both refused as association evidence, " +
    "so the assessment cannot be completed.",
};

type AnonClient = SupabaseClient;

/* ── Reference identity ─────────────────────────────────────────────────── */

/** Public reference identity, read through the Galaxy-visible closure.
    Galaxy visibility is used ONLY as an inclusion floor — a reference that is
    not publicly visible must never enter the index — and never as the
    approved-knowledge assertion. Hierarchy is carried only where the identity
    supplies it; nothing is invented to look complete (§2). */
export async function readReferenceIdentity(
  db: AnonClient,
  vaultReferenceId: string
): Promise<ReferenceIdentity | null> {
  const { data, error } = await db
    .from("vault_galaxy_references")
    .select("id, reference, variant_id")
    .eq("id", vaultReferenceId)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as { id: string; reference: string; variant_id: string | null };
  let manufacturer = "";
  let collection: string | null = null;
  let family: string | null = null;
  let variant: string | null = null;

  if (row.variant_id) {
    const { data: v } = await db
      .from("vault_galaxy_variants")
      .select("id, name, family_id")
      .eq("id", row.variant_id)
      .maybeSingle();
    const variantRow = v as { name: string | null; family_id: string | null } | null;
    variant = variantRow?.name ?? null;
    if (variantRow?.family_id) {
      const { data: f } = await db
        .from("vault_galaxy_families")
        .select("id, name, collection_id")
        .eq("id", variantRow.family_id)
        .maybeSingle();
      const familyRow = f as { name: string | null; collection_id: string | null } | null;
      family = familyRow?.name ?? null;
      if (familyRow?.collection_id) {
        const { data: c } = await db
          .from("vault_galaxy_collections")
          .select("id, name, brand_id")
          .eq("id", familyRow.collection_id)
          .maybeSingle();
        const collectionRow = c as { name: string | null; brand_id: string | null } | null;
        collection = collectionRow?.name ?? null;
        if (collectionRow?.brand_id) {
          const { data: b } = await db
            .from("vault_galaxy_brands")
            .select("name")
            .eq("id", collectionRow.brand_id)
            .maybeSingle();
          manufacturer = ((b as { name: string | null } | null)?.name ?? "").trim();
        }
      }
    }
  }
  if (manufacturer === "") return null; // no public manufacturer identity, no record
  return {
    vaultReferenceId: row.id,
    manufacturer,
    reference: row.reference,
    collection,
    family,
    variant,
  };
}

/* ── Current availability (§4) ──────────────────────────────────────────── */

/**
 * Eligible listings for one reference, admitted by the governed public
 * discovery boundary and nothing else.
 *
 * TWO READS, ONE ADMISSION DECISION. `public_discovery_listings` decides
 * membership; the second read supplies only the reference EDGE for rows that
 * view already admitted. Eligibility is never re-derived from a status
 * string, and no field of the view beyond the listing id is consumed — in
 * particular seller_display_name and seller_slug are never selected, so
 * seller identity cannot leak into a record that has no field for it.
 *
 * Returns null when the population could not be checked completely.
 */
export async function readEligibleListings(
  db: AnonClient,
  vaultReferenceId: string
): Promise<{ listings: EligibleListing[]; retrievalComplete: boolean } | null> {
  const { data: admitted, error } = await db
    .from("public_discovery_listings")
    .select("id")
    .limit(ELIGIBLE_LISTING_CEILING + 1);
  if (error) return null;

  const ids = ((admitted ?? []) as { id: string }[]).map((r) => r.id);
  const retrievalComplete = ids.length <= ELIGIBLE_LISTING_CEILING;
  const bounded = ids.slice(0, ELIGIBLE_LISTING_CEILING);
  if (bounded.length === 0) return { listings: [], retrievalComplete };

  const { data: edges, error: edgeError } = await db
    .from("listings")
    .select("id, vault_reference_id")
    .in("id", bounded)
    .eq("vault_reference_id", vaultReferenceId);
  if (edgeError) return null;

  const listings = ((edges ?? []) as { id: string }[]).map((r) => ({
    listingId: r.id,
    canonicalUrl: listingUrl(r.id),
  }));
  return { listings, retrievalComplete };
}

/* ── Publication evidence (§5) ──────────────────────────────────────────── */

/**
 * Durable public publication episodes for the listings that currently resolve
 * to this reference.
 *
 * Every episode returned carries `referenceAssociationEvidenced: false`, and
 * that is the truthful value, not a placeholder: no mechanism ties a
 * publication episode to a canonical reference. The episodes are still read
 * and returned so the shape of the gap is visible rather than invisible — the
 * projection then reports `not_established_within_coverage` only if the
 * assessment could actually be completed, which it cannot, so this reader
 * hands the projection `null` and records HISTORY_GAP.
 *
 * Returns null: the history assessment cannot be completed in Phase 1.
 */
export async function readPublicationEpisodes(): Promise<PublicationEpisode[] | null> {
  return null;
}

/* ── Suppressions (§8) ──────────────────────────────────────────────────── */

/**
 * Every LIVE suppression that can bear on this reference. Two shapes are
 * fetched deliberately:
 *   · rows recorded against this reference (contribution-scoped or not);
 *   · contribution-scoped rows recorded against ANY reference whose
 *     contribution currently resolves here — because a suppression follows
 *     its contribution and a reassociation must not evade it (§8).
 *
 * Reads actor, reason and time NEVER leave this function; only the assertion
 * and the contribution id are returned.
 */
export async function readLiveSuppressions(
  service: SupabaseClient,
  vaultReferenceId: string,
  candidateListingIds: readonly string[]
): Promise<LiveSuppression[] | null> {
  const byReference = await service
    .from("public_watch_index_suppressions")
    .select("assertion, contribution_listing_id")
    .is("reversed_at", null)
    .eq("vault_reference_id", vaultReferenceId);
  if (byReference.error) return null;

  const rows = [...((byReference.data ?? []) as { assertion: string; contribution_listing_id: string | null }[])];

  if (candidateListingIds.length > 0) {
    const byContribution = await service
      .from("public_watch_index_suppressions")
      .select("assertion, contribution_listing_id")
      .is("reversed_at", null)
      .in("contribution_listing_id", [...candidateListingIds]);
    if (byContribution.error) return null;
    rows.push(
      ...((byContribution.data ?? []) as { assertion: string; contribution_listing_id: string | null }[])
    );
  }

  const seen = new Set<string>();
  const out: LiveSuppression[] = [];
  for (const r of rows) {
    const key = `${r.assertion}|${r.contribution_listing_id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      assertion: r.assertion as LiveSuppression["assertion"],
      contributionListingId: r.contribution_listing_id,
    });
  }
  return out;
}

/* ── Market Evidence (§9) ───────────────────────────────────────────────── */

/**
 * The existing governed public Market Evidence gate, consumed and never
 * reimplemented. The gate fails closed on rights and returns at most one
 * deterministically selected row; an error is an unavailable assessment, not
 * a negative. No exact values are copied into the index — only whether a
 * qualifying record exists.
 */
export async function readMarketEvidence(
  db: AnonClient,
  vaultReferenceId: string
): Promise<{ qualifies: boolean; destination: string | null } | null> {
  const { data, error } = await db.rpc("market_evidence_for_reference", {
    p_reference_id: vaultReferenceId,
  });
  if (error) return null;
  const rows = (data ?? []) as { lot_page_url: string | null; sale_page_url: string | null }[];
  if (rows.length === 0) return { qualifies: false, destination: null };
  const first = rows[0];
  return { qualifies: true, destination: first.lot_page_url ?? first.sale_page_url ?? null };
}

/* ── The composed internal projection ───────────────────────────────────── */

export type ProjectionResult = {
  record: PublicWatchIndexRecord | null;
  /** Internal diagnostics only. Never a public field. */
  coverageNotes: CoverageNote[];
};

/**
 * Project one canonical reference. Internal only — there is no endpoint, no
 * manifest entry and no robots change in Phase 1.
 *
 * Returns `record: null` only when the reference has no public identity to
 * describe (absent, or not Galaxy-visible). That is an inclusion floor, not
 * a statement about whether internal records exist: §13 requires that a
 * reference with no public entry disclose nothing about private material.
 */
export async function projectReference(vaultReferenceId: string): Promise<ProjectionResult> {
  const anon = createDiscoveryClient();
  const coverageNotes: CoverageNote[] = [HISTORY_GAP, KNOWLEDGE_GAP];

  const reference = await readReferenceIdentity(anon, vaultReferenceId);
  if (!reference) return { record: null, coverageNotes };

  const eligible = await readEligibleListings(anon, vaultReferenceId);
  const marketEvidence = await readMarketEvidence(anon, vaultReferenceId);

  let suppressions: LiveSuppression[] | null = [];
  try {
    suppressions = await readLiveSuppressions(
      createServiceClient(),
      vaultReferenceId,
      (eligible?.listings ?? []).map((l) => l.listingId)
    );
  } catch {
    suppressions = null;
  }

  /* FAIL CLOSED ON SUPPRESSION. If publication authority cannot be read, the
     projection must not publish assertions it cannot prove are permitted.
     Every dimension collapses to unavailable rather than risking the
     re-admission of a suppressed contribution. */
  if (suppressions === null) {
    const input: ProjectionInput = {
      reference,
      eligibleListings: null,
      retrievalComplete: false,
      publicationEpisodes: null,
      knowledge: { state: "unavailable_or_incomplete", destination: null },
      marketEvidence: null,
      suppressions: [],
      assessedOn: utcAssessmentDay(),
    };
    return { record: project(input), coverageNotes };
  }

  const input: ProjectionInput = {
    reference,
    eligibleListings: eligible ? eligible.listings : null,
    retrievalComplete: eligible ? eligible.retrievalComplete : false,
    publicationEpisodes: await readPublicationEpisodes(),
    knowledge: { state: "unavailable_or_incomplete", destination: null },
    marketEvidence,
    suppressions,
    assessedOn: utcAssessmentDay(),
  };
  return { record: project(input), coverageNotes };
}
