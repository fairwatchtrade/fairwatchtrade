
/* ════════════════════════════════════════════════════════════════════════
   WATCH PASSPORT — a biography of evidence FairWatchTrade actually has

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     A listing is one chapter. The Passport belongs to the physical watch.

   And the second, which matters more:

     Passport is a biography of evidence FWT actually has — not a mythology
     assembled to make the watch look complete.

   ── PURE PROJECTION. ZERO WRITES. ──────────────────────────────────────
   Nothing here persists anything. There is no Passport table, no snapshot,
   no correction layer, no cached copy of history. Every render derives from
   the governed sources, so correcting a source corrects the Passport on the
   next read with no Passport-side write at all.

   That is deliberate: a Passport-only correction layer could contradict the
   history it claims to describe, and then there would be two truths and no
   way to tell which one lied.

   ── THE SUBJECT IS THE BEAD, NEVER THE RESOLVED IDENTITY ───────────────
   `resolved_watch_id` is a render-time lens. It can be minted, retired,
   split and reminted; the bead cannot. Keying a biography to something
   that legitimately disappears would make the biography disappear with it.

   ── HISTORICAL IDENTITY IS THE LOAD-BEARING RULE ───────────────────────
   Every item whose meaning depends on physical-watch identity is
   interpreted through the identity state that applied TO THAT EVENT — for
   transfers, `resolve_physical_watch_as_of(bead, event.decision_generation)`.

   NEVER through the bead's current resolved identity.

   A later merge, split, retraction, conflict or remint must not silently
   change what FairWatchTrade believed when the event was recorded. If it
   did, a withdrawn identity conclusion would look as though it had always
   been true — which is the exact failure this whole chain exists to
   prevent.

   Listing chapters have no decision generation, and none is invented for
   them. They are interpreted through current identity only.
   ════════════════════════════════════════════════════════════════════════ */

/** Whether an item reached this Passport through what FWT believes NOW, or
    through a belief it has since revised. The distinction is shown, never
    flattened. */
export type IdentityBasis = "current" | "historical_prior_resolution";

export type PassportTimelineItem = {
  /** The immutable source row id. THE dedupe key — never display text, and
      never a composite of fields that could coincide. */
  sourceId: string;
  kind: "listing_chapter" | "transfer" | "transfer_retraction" | "identity_note";
  /** Ordering key. For transfers this is occurred_at when the asserter
      supplied one, otherwise recorded_at — and which one it is, is stated
      rather than quietly presented as the same thing. */
  effectiveAt: string;
  effectiveAtIsRecordedAt: boolean;
  identityBasis: IdentityBasis;
  /** The bead this item is actually about, which may not be the subject. */
  aboutBead: string;
  title: string;
  detail: string;
  /** Present on transfers: what identity looked like AT the event. */
  identityAtEvent?: {
    generation: number;
    state: string;
    members: string[];
    conflicted: boolean;
  };
};

export type PassportIdentifierSummary = {
  identifierType: string;
  sourceClass: string;
  observations: number;
};

export type WatchPassport = {
  bead: string;
  /** Header only. FWT's knowledge boundary — NOT an origin, a manufacture
      date, a first sale, or evidence the watch's real history began here. */
  knownToFwtSince: string | null;
  canonicalIdentity: { brand: string | null; model: string | null; reference: string | null } | null;
  currentIdentity: {
    state: string;
    generation: number | null;
    conflicted: boolean;
    members: string[];
    resolvedWatchId: string | null;
    /** True when current aggregation was stopped because identity is under
        review. Prior co-member history is still reachable below. */
    aggregationStopped: boolean;
  };
  timeline: PassportTimelineItem[];
  identifierEvidence: PassportIdentifierSummary[];
  /** Claims the platform cannot support, said out loud rather than implied
      by an empty section. */
  disclosures: string[];
  /** Places where a source does not durably preserve something Passport
      would otherwise have shown. Surfaced, never guessed around. */
  sourceGovernanceGaps: string[];
};

type ListingRow = {
  id: string; public_code: string | null; brand: string | null; model: string | null;
  reference: string | null; status: string | null; removal_reason_code: string | null;
  created_at: string; physical_watch_id: string;
};
type DecisionEventRow = {
  id: string; listing_id: string; decision: string | null;
  prior_status: string | null; resulting_status: string | null; created_at: string;
};

type ResolveResult = {
  state?: string;
  generation?: number;
  members?: string[];
  conflicted?: boolean;
  resolved_watch_id?: string | null;
};

/* Listing statuses that never constitute a chapter. A draft is an
   intention; a pending review is a queue position; a rejection is the
   platform declining to publish. None of them is something that happened
   to the watch. */
const NEVER_A_CHAPTER = new Set(["draft", "pending_review", "rejected"]);

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The minimal shape this composition needs, described structurally rather
    than borrowed from the service client, so the projection can be exercised
    against a controlled source. That is what makes "zero writes" provable:
    a fake client can record every operation and fail on any mutation. */
export type PassportDb = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any }>;
};

export async function composeWatchPassport(
  beadId: string,
  client?: PassportDb
): Promise<WatchPassport | null> {
  /* Imported lazily and only when no client is supplied: the service client
     pulls in server-only wiring, and this module must stay loadable outside
     the Next runtime for its proofs to be runnable at all. */
  const db: PassportDb =
    client ?? ((await import("@/lib/supabase/service")).createServiceClient() as unknown as PassportDb);

  const { data: bead } = await db
    .from("physical_watches")
    .select("id, created_at")
    .eq("id", beadId)
    .maybeSingle();
  if (!bead) return null;

  // ── current identity ────────────────────────────────────────────────
  const { data: currentRaw } = await db.rpc("resolve_physical_watch", { p_bead: beadId });
  const current = (currentRaw ?? {}) as ResolveResult;
  const conflicted = current.conflicted === true;

  /* Conflict stops CURRENT aggregation — the platform does not currently
     know these are one watch, so it must not present them as one. Prior
     co-member history is not erased; it moves below, labelled. */
  const currentMembers = conflicted ? [beadId] : (current.members ?? [beadId]);

  // ── the beads this subject has EVER been adjudicated against ────────
  // Bounded by the decision log, not by a scan of every bead in existence.
  const { data: decisions } = await db
    .from("physical_watch_resolution_decisions")
    .select("left_physical_watch_id, right_physical_watch_id")
    .or(`left_physical_watch_id.eq.${beadId},right_physical_watch_id.eq.${beadId}`);

  const everRelated = new Set<string>([beadId, ...currentMembers]);
  for (const d of decisions ?? []) {
    everRelated.add(d.left_physical_watch_id as string);
    everRelated.add(d.right_physical_watch_id as string);
  }

  // ── listing chapters ────────────────────────────────────────────────
  // Current identity only: listings carry no decision generation, and
  // inventing one for them would be fabricating a belief that never existed.
  const { data: listings } = await db
    .from("listings")
    .select("id, public_code, brand, model, reference, status, removal_reason_code, created_at, physical_watch_id")
    .in("physical_watch_id", currentMembers);

  const listingRows = (listings ?? []) as ListingRow[];
  const listingIds = listingRows.map((l) => l.id);
  const { data: decisionEvents } = listingIds.length
    ? await db
        .from("listing_decision_events")
        .select("id, listing_id, decision, prior_status, resulting_status, created_at")
        .in("listing_id", listingIds)
        .order("created_at", { ascending: true })
    : { data: [] as Record<string, unknown>[] };

  const timeline: PassportTimelineItem[] = [];
  const gaps = new Set<string>();

  for (const l of listingRows) {
    const status = String(l.status ?? "");
    const removal = l.removal_reason_code as string | null;

    /* A listing flagged as a mistake never becomes provenance, even if it
       briefly reached publication. Excluding on a governed reason code is
       safe; ASSERTING history from today's row would not be, so the code is
       only ever used to exclude. */
    if (removal === "listing_mistake") continue;

    /* Durable evidence that this listing genuinely reached the marketplace:
       a governed decision event that RESULTED in publication. Today's status
       is not evidence of yesterday's history. */
    const published = ((decisionEvents ?? []) as DecisionEventRow[]).find(
      (e) => e.listing_id === l.id && e.resulting_status === "published"
    );
    const isPrivateEpisode = status === "private_active";

    if (!published && !isPrivateEpisode) {
      if (NEVER_A_CHAPTER.has(status)) continue;
      /* Reached a real state with no durable evidence of how. Passport
         omits the claim rather than inferring the transition. */
      gaps.add(
        `Listing ${l.public_code ?? l.id} is '${status}' but no governed lifecycle event records how it got there, so no chapter is claimed for it.`
      );
      continue;
    }

    if (published) {
      timeline.push({
        sourceId: published.id,
        kind: "listing_chapter",
        effectiveAt: published.created_at,
        effectiveAtIsRecordedAt: false,
        identityBasis: "current",
        aboutBead: l.physical_watch_id,
        title: "Founder-admitted listing chapter",
        detail: `Offered publicly on FairWatchTrade${l.public_code ? ` as ${l.public_code}` : ""}${
          removal ? ` · later removed (${removal})` : ""
        }.`,
      });
    } else {
      /* A genuine private-only episode. Founder-visible, and permanently
         excluded from any future collector/public provenance. Only the
         EXISTENCE and governed chapter metadata — never counterparty
         identity, messages, offers, negotiation, terms, or price. */
      timeline.push({
        sourceId: l.id,
        kind: "listing_chapter",
        effectiveAt: l.created_at,
        effectiveAtIsRecordedAt: false,
        identityBasis: "current",
        aboutBead: l.physical_watch_id,
        title: "Founder-admitted listing chapter (private episode)",
        detail:
          "A private listing episode existed. Founder-visible only and permanently excluded from collector/public provenance. No counterparty, correspondence, offer, term or price is carried here.",
      });
      gaps.add(
        "Private listing episodes are not recorded in listing_decision_events, so no private→public or public→private transition can be durably proven. Passport omits any such transition claim."
      );
    }
  }

  // ── transfer history, interpreted at its OWN generation ─────────────
  const { data: transfers } = await db
    .from("physical_watch_transfer_events")
    .select(
      "id, physical_watch_id, event_type, provenance_class, occurred_at, recorded_at, decision_generation, supersedes_event_id, trade_deal_id"
    )
    .in("physical_watch_id", [...everRelated]);

  for (const t of transfers ?? []) {
    const aboutBead = t.physical_watch_id as string;
    const generation = Number(t.decision_generation);

    /* THE LOAD-BEARING CALL. Identity as it stood when this event was
       recorded — never as it stands now. */
    const { data: asOfRaw } = await db.rpc("resolve_physical_watch_as_of", {
      p_bead: aboutBead,
      p_generation: generation,
    });
    const asOf = (asOfRaw ?? {}) as ResolveResult;
    const membersAtEvent = asOf.members ?? [aboutBead];

    /* Admitted when the event was about THIS bead, or about a bead that —
       at that generation — FairWatchTrade believed was this same watch.
       A belief later withdrawn still explains why the record exists. */
    const wasThisWatch = aboutBead === beadId || membersAtEvent.includes(beadId);
    if (!wasThisWatch) continue;

    const stillCurrent = currentMembers.includes(aboutBead);
    const basis: IdentityBasis = stillCurrent ? "current" : "historical_prior_resolution";

    const occurred = t.occurred_at as string | null;
    const effectiveAt = (occurred ?? t.recorded_at) as string;

    const retraction = t.event_type === "TRANSFER_RETRACTED";
    timeline.push({
      sourceId: t.id as string,
      kind: retraction ? "transfer_retraction" : "transfer",
      effectiveAt,
      effectiveAtIsRecordedAt: occurred === null,
      identityBasis: basis,
      aboutBead,
      title: retraction ? "Transfer retracted" : "Ownership transferred",
      detail: retraction
        ? "An earlier transfer assertion was withdrawn as mistaken. The original assertion remains on record; this does not mean the watch was transferred back."
        : `Recorded as ${
            t.provenance_class === "party_confirmed_recipient"
              ? "confirmed by the recipient"
              : "asserted by FairWatchTrade's founder on the evidence available"
          }. FairWatchTrade did not independently verify the package contents, the authenticity of the watch, or ownership.`,
      identityAtEvent: {
        generation,
        state: String(asOf.state ?? "UNRESOLVED"),
        members: membersAtEvent,
        conflicted: asOf.conflicted === true,
      },
    });

    if (basis === "historical_prior_resolution") {
      timeline.push({
        sourceId: `identity-note:${t.id}`,
        kind: "identity_note",
        effectiveAt,
        effectiveAtIsRecordedAt: occurred === null,
        identityBasis: "historical_prior_resolution",
        aboutBead,
        title: "Internal identity note",
        detail:
          "This event was recorded against a different record that FairWatchTrade believed at the time was this same watch. That identity conclusion no longer stands. The event is preserved and shown under the belief that produced it — it is not re-interpreted through today's understanding, and it has not been moved or rewritten.",
      });
    }
  }

  if (conflicted) {
    timeline.push({
      sourceId: `identity-note:conflict:${beadId}`,
      kind: "identity_note",
      effectiveAt: new Date(0).toISOString(),
      effectiveAtIsRecordedAt: true,
      identityBasis: "current",
      aboutBead: beadId,
      title: "Identity continuity under review",
      detail:
        "Current exact-watch decisions about this record contradict each other, so FairWatchTrade is not currently treating it as resolved with any other record. Aggregation of co-member history has stopped. Nothing recorded previously has been deleted.",
    });
  }

  /* DEDUPE BY IMMUTABLE SOURCE ROW IDENTITY. The same underlying row can be
     reachable through more than one co-member path; it must appear once.
     Matching display text would not be sufficient — two different events can
     read identically. */
  const seen = new Set<string>();
  const deduped = timeline.filter((i) => {
    if (seen.has(i.sourceId)) return false;
    seen.add(i.sourceId);
    return true;
  });

  /* Deterministic chronology: effective time, then a stable tie-break on the
     immutable source id. Two items with the same timestamp order the same
     way on every render, forever. */
  deduped.sort((a, b) => {
    const t = a.effectiveAt.localeCompare(b.effectiveAt);
    return t !== 0 ? t : a.sourceId.localeCompare(b.sourceId);
  });

  // ── identifier evidence: PRESENCE ONLY ──────────────────────────────
  // Never a raw value, never a token, never a fragment, never an equality
  // relationship, never a masked reveal. Presence of identifier evidence is
  // not proof of authenticity and must not be worded as though it were.
  const { data: observations } = await db
    .from("physical_watch_identifier_observations")
    .select("identifier_type, source_class")
    .in("physical_watch_id", currentMembers)
    .eq("is_current", true);

  const summaryMap = new Map<string, PassportIdentifierSummary>();
  for (const o of observations ?? []) {
    const key = `${o.identifier_type}|${o.source_class}`;
    const existing = summaryMap.get(key);
    if (existing) existing.observations += 1;
    else
      summaryMap.set(key, {
        identifierType: o.identifier_type as string,
        sourceClass: o.source_class as string,
        observations: 1,
      });
  }

  const firstListing = listingRows.find((l) => l.physical_watch_id === beadId) ?? null;

  return {
    bead: beadId,
    knownToFwtSince: (bead.created_at as string) ?? null,
    canonicalIdentity: firstListing
      ? {
          brand: firstListing.brand,
          model: firstListing.model,
          reference: firstListing.reference,
        }
      : null,
    currentIdentity: {
      state: String(current.state ?? "UNRESOLVED"),
      generation: current.generation ?? null,
      conflicted,
      members: currentMembers,
      resolvedWatchId: current.resolved_watch_id ?? null,
      aggregationStopped: conflicted,
    },
    timeline: deduped,
    identifierEvidence: [...summaryMap.values()].sort(
      (a, b) =>
        a.identifierType.localeCompare(b.identifierType) ||
        a.sourceClass.localeCompare(b.sourceClass)
    ),
    /* Said out loud. An empty timeline is not evidence that nothing
       happened — it is evidence that FairWatchTrade holds no record. */
    disclosures: [
      "FairWatchTrade's records begin when this watch first became known to the platform. Absence of earlier events is not evidence that no earlier history exists.",
      "This is not a complete ownership history or chain of custody.",
      "Nothing here authenticates the watch, verifies its serial continuity, or establishes manufacturer provenance, original sale, or original owner.",
      "Transfer records state who asserted that a transfer occurred and on what footing. They do not mean FairWatchTrade inspected a package or independently verified ownership.",
      "The presence of identifier evidence is not proof of authenticity.",
    ],
    sourceGovernanceGaps: [...gaps],
  };
}
