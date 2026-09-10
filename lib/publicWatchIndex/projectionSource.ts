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
   PUBLIC WATCH INDEX — the reader  (internal only; Phase 1 + P7)
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
     · SERVICE ROLE — publication episodes, their reference associations,
       and suppressions. All three tables deny every client role by design,
       and all three are internal-only inputs.
     · NONE — approved public reference knowledge. See below.

   WHY KNOWLEDGE IS STILL ALWAYS UNAVAILABLE (P6 open). `reference_knowledge` is
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

   HOW HISTORY IS ESTABLISHED (P7, v8.36). Two separate proofs, never one.
   §5 condition 2 is satisfied by listing_lifecycle_events, which records a
   BECAME_PUBLIC episode per genuine publication, append-only, written by a
   trigger. §5 condition 3 is satisfied by
   public_watch_index_episode_reference, which freezes the canonical
   reference AT the publication boundary and binds it to that episode.

   THE TEMPORAL DISTINCTION IS THE WHOLE DESIGN. At the publication moment,
   `listings.vault_reference_id` IS the governed server-side resolution for
   that publication, and capturing it then is evidence. After that moment it
   is only mutable current state, and nothing may ever re-derive a historical
   association from it again. This reader therefore never consults that
   column for history: the episode set comes entirely from the association
   table, which is why changing a listing's reference today cannot move an
   old episode onto it.

   NOT BACKFILLED, AND NOTHING HERE WRITES. Episodes published before the
   binder existed carry no association and were deliberately left alone; only
   a governed correction can resolve one, with evidence.

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

/* P7 (v8.36) closed the mechanism gap this note used to describe. What
   remains is a COVERAGE statement, not a missing mechanism: episodes
   published before the binder existed carry no association and were
   deliberately not backfilled, so a `not_established_within_coverage` answer
   spans only the episodes the seam can actually speak for. */
export const HISTORY_COVERAGE_NOTE: CoverageNote = {
  assertion: "public_listing_history",
  reason:
    "Episode-to-reference association is captured at the publication boundary from P7 onward. " +
    "Publication episodes recorded before that seam existed carry no association and were not backfilled, " +
    "so the assessed coverage is future publications plus any episode a governed correction has since resolved.",
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

/** The governed removal reason that disqualifies a publication episode from
    becoming provenance. A brief genuine publication is not automatically a
    mistake — evidence and governed reason codes decide (§5). */
export const MISTAKE_REASON_CODE = "listing_mistake";

/**
 * Durable public publication episodes belonging to this canonical reference.
 *
 * P7 (v8.36) replaced the Phase 1 stub. The set is driven ENTIRELY by
 * `public_watch_index_episode_reference`, the durable association captured at
 * each publication boundary — never by today's `listings.vault_reference_id`.
 * A listing whose current row points here contributes nothing unless its
 * episode carries a current association saying so, which is exactly what
 * stops history moving when a mutable row changes.
 *
 * `is_current` is mandatory: the association table is append-and-retire, and
 * without that filter superseded and withdrawn associations read as live
 * evidence.
 *
 * Field by field, for the projection's five §5 conditions:
 *   · durablyEvidenced — true. The lifecycle event IS the governed durable
 *     publication evidence; the row would not exist otherwise.
 *   · referenceAssociationEvidenced — true. A current association is the
 *     separate proof §5 condition 3 demands.
 *   · publicUsePermitted — true here. Per-episode public-use restriction has
 *     exactly two mechanisms, and neither belongs in this flag: withdrawal
 *     removes the current association (so the episode never reaches this
 *     list), and suppression is applied by the projection itself. The
 *     platform-wide retention permission remains an open PUBLIC-RELEASE
 *     prerequisite, not a per-episode fact this reader can evaluate.
 *   · disqualifyingMistake — derived at read time: an episode whose very next
 *     lifecycle event ended it as REMOVED with the governed mistake reason is
 *     not provenance. Derived rather than stored so a later correction to the
 *     reason code is honoured immediately.
 *
 * Returns null only when the assessment could not be completed.
 */
export async function readPublicationEpisodes(
  service: SupabaseClient,
  vaultReferenceId: string
): Promise<PublicationEpisode[] | null> {
  const associations = await service
    .from("public_watch_index_episode_reference")
    .select("episode_id")
    .eq("is_current", true)
    .eq("vault_reference_id", vaultReferenceId);
  if (associations.error) return null;

  const episodeIds = ((associations.data ?? []) as { episode_id: number }[]).map((r) => r.episode_id);
  if (episodeIds.length === 0) return [];

  const episodes = await service
    .from("listing_lifecycle_events")
    .select("id, listing_id, occurred_at")
    .in("id", episodeIds)
    .eq("event_type", "BECAME_PUBLIC");
  if (episodes.error) return null;

  const rows = (episodes.data ?? []) as { id: number; listing_id: string; occurred_at: string }[];
  if (rows.length === 0) return [];

  /* Every lifecycle event for the listings involved, so "what ended this
     episode" is answered in one read rather than one read per episode. */
  const timeline = await service
    .from("listing_lifecycle_events")
    .select("listing_id, event_type, removal_reason_code, occurred_at")
    .in("listing_id", [...new Set(rows.map((r) => r.listing_id))])
    .order("occurred_at", { ascending: true });
  if (timeline.error) return null;

  const events = (timeline.data ?? []) as {
    listing_id: string;
    event_type: string;
    removal_reason_code: string | null;
    occurred_at: string;
  }[];

  return rows.map((episode) => {
    const next = events.find(
      (e) => e.listing_id === episode.listing_id && e.occurred_at > episode.occurred_at
    );
    return {
      listingId: episode.listing_id,
      durablyEvidenced: true,
      referenceAssociationEvidenced: true,
      publicUsePermitted: true,
      disqualifyingMistake:
        next?.event_type === "REMOVED" && next?.removal_reason_code === MISTAKE_REASON_CODE,
    };
  });
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
  /* P7 closed the history gap for FUTURE publications; the knowledge gap
     (P6) is untouched and still the honest reason that assertion cannot be
     completed. Existing episodes recorded before P7 carry no association and
     were deliberately not backfilled, so HISTORY_COVERAGE_NOTE explains what
     the history answer does and does not span. */
  const coverageNotes: CoverageNote[] = [HISTORY_COVERAGE_NOTE, KNOWLEDGE_GAP];

  const reference = await readReferenceIdentity(anon, vaultReferenceId);
  if (!reference) return { record: null, coverageNotes };

  const eligible = await readEligibleListings(anon, vaultReferenceId);
  const marketEvidence = await readMarketEvidence(anon, vaultReferenceId);

  let service: SupabaseClient | null = null;
  try {
    service = createServiceClient();
  } catch {
    service = null;
  }

  const publicationEpisodes = service
    ? await readPublicationEpisodes(service, vaultReferenceId)
    : null;

  /* Suppression candidates are every contribution that could reach this
     record: the listings currently eligible AND the listings behind the
     historical episodes. A contribution-scoped suppression follows its
     contribution across reassociation, so omitting the historical half would
     let a reassociated episode slip past a live decision (§8). */
  const candidateListingIds = [
    ...new Set([
      ...(eligible?.listings ?? []).map((l) => l.listingId),
      ...(publicationEpisodes ?? []).map((e) => e.listingId),
    ]),
  ];

  let suppressions: LiveSuppression[] | null = [];
  if (service === null) {
    suppressions = null;
  } else {
    try {
      suppressions = await readLiveSuppressions(service, vaultReferenceId, candidateListingIds);
    } catch {
      suppressions = null;
    }
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
    publicationEpisodes,
    knowledge: { state: "unavailable_or_incomplete", destination: null },
    marketEvidence,
    suppressions,
    assessedOn: utcAssessmentDay(),
  };
  return { record: project(input), coverageNotes };
}
