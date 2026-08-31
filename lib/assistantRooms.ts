/* ────────────────────────────────────────────────────────────────────────
   ADMIN ASSISTANT — CANONICAL ROOM REGISTRY

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "An unrecognized room is close enough to Founder Review."

   It is not. The prior resolver returned `founder_review` for ANY input it
   did not recognize — a typo, a stale client, a room built next month, a
   malformed body. The request then executed under Founder Review semantics
   against the Founder Review queue, and nothing in the response said so.

   > Wrong room is an error, not a default.

   ── KNOWING A KEY IS NOT SUPPORTING IT ──────────────────────────────────

   Three outcomes, deliberately distinct, because collapsing them tells the
   founder the wrong thing about his own product:

     · `ok`                — a room with a live adapter in this build;
     · `unsupported_room`  — a room this architecture NAMES but has not
                             attached yet. A client ahead of the server, or a
                             room still being built. Saying "invalid" here
                             would claim the room does not exist;
     · `invalid_room`      — nothing this product recognizes at all.

   A retired key would be a fourth: refused with its own sentence, never
   silently remapped onto whatever replaced it.

   ── THE THREAD IS NOT COLLATERAL ────────────────────────────────────────

   Resolution happens BEFORE any session or thread is read or written. A
   room-key failure therefore cannot create, mutate, resume, or close
   anything — the founder's current work is untouched by construction rather
   than by a promise, and every refusal sentence is allowed to say so.
   ──────────────────────────────────────────────────────────────────────── */

/** Every room the architecture names, implemented or not. */
export const ARCHITECTURE_ROOMS = [
  "founder_review",
  "marketplace_control",
  "auction_operations",
  "dealer_accelerator",
  "watch_passport",
  "vault_enrichment",
  "vault_review",
  "vault_upgrade",
  "watch_resolution",
] as const;

export type ArchitectureRoom = (typeof ARCHITECTURE_ROOMS)[number];

/** Rooms with a live adapter in THIS build. Widened only when one lands. */
export const IMPLEMENTED_ROOMS = [
  "founder_review",
  "marketplace_control",
  "dealer_accelerator",
  "watch_passport",
] as const;

/* What KIND of governed object a room's visible ids name. Not every room is
   about listings, and assuming so would send a bead id to the listings table
   and report the founder's own record as missing. The reread branches on
   this rather than on a guess about the id's shape. */
export const ROOM_SUBJECT: Record<ImplementedRoom, "listing" | "physical_watch"> = {
  founder_review: "listing",
  marketplace_control: "listing",
  dealer_accelerator: "listing",
  watch_passport: "physical_watch",
};

/* Which rooms may perform a governed Assistant mutation, and which one.
   Tier A rooms are absent by design: a room without DO is useful and honest,
   and inventing a mutation to reach a tier is explicitly forbidden. A room
   missing from this map cannot confirm anything, enforced at the confirm
   seam rather than trusted to the prompt. */
export const ROOM_OPERATION: Partial<
  Record<ImplementedRoom, "approve_listings" | "remove_listing">
> = {
  founder_review: "approve_listings",
  marketplace_control: "remove_listing",
};

export type ImplementedRoom = (typeof IMPLEMENTED_ROOMS)[number];

/** Human names, for sentences the founder reads. */
export const ROOM_LABEL: Record<ArchitectureRoom, string> = {
  founder_review: "Founder Review",
  marketplace_control: "Marketplace Control",
  auction_operations: "Auction Operations",
  dealer_accelerator: "Dealer Accelerator",
  watch_passport: "Watch Passport",
  vault_enrichment: "Vault Enrichment",
  vault_review: "Vault Review",
  vault_upgrade: "Vault Upgrade",
  watch_resolution: "Watch Resolution",
};

/* Keys this product once used and has since retired. A retired key is
   refused with its own sentence and NEVER remapped onto its successor:
   silently honouring it would execute today's semantics against an
   intention recorded under yesterday's. Empty today, and the shape exists
   so the first retirement cannot be handled by a quiet rename. */
export const RETIRED_ROOM_KEYS: Readonly<Record<string, string>> = {};

export type RoomResolution =
  | { state: "ok"; room: ImplementedRoom }
  | { state: "unsupported_room"; room: ArchitectureRoom; sentence: string }
  | { state: "retired_room"; received: string; sentence: string }
  | { state: "invalid_room"; received: string | null; sentence: string };

export function isArchitectureRoom(v: unknown): v is ArchitectureRoom {
  return typeof v === "string" && (ARCHITECTURE_ROOMS as readonly string[]).includes(v);
}

export function isImplementedRoom(v: unknown): v is ImplementedRoom {
  return typeof v === "string" && (IMPLEMENTED_ROOMS as readonly string[]).includes(v);
}

/* The one place a room key becomes a room. Every caller must branch on the
   state; there is deliberately no variant that returns a room for input the
   product did not recognize. */
export function resolveRoom(raw: unknown): RoomResolution {
  if (typeof raw !== "string" || raw.trim() === "") {
    return {
      state: "invalid_room",
      received: typeof raw === "string" ? raw : null,
      sentence:
        "I couldn't tell which Admin room this is, so I haven't assumed one. " +
        "Nothing was read or changed, and any work you already have is still preserved.",
    };
  }

  const key = raw.trim();

  if (isImplementedRoom(key)) return { state: "ok", room: key };

  if (Object.prototype.hasOwnProperty.call(RETIRED_ROOM_KEYS, key)) {
    return {
      state: "retired_room",
      received: key,
      sentence:
        `This page is asking for "${key}", which this product has retired. ` +
        "I haven't guessed which room replaced it, so nothing was read or changed. " +
        "Reload the Admin page and try again.",
    };
  }

  if (isArchitectureRoom(key)) {
    return {
      state: "unsupported_room",
      room: key,
      sentence:
        `I don't have ${ROOM_LABEL[key]} attached yet, so I haven't treated this as another room. ` +
        "Nothing was read or changed here, and any work you already have is still preserved.",
    };
  }

  return {
    state: "invalid_room",
    received: key,
    sentence:
      `I couldn't establish this Admin room ("${key}"), so I haven't treated it as Founder Review ` +
      "or any other room. Nothing was read or changed, and any work you already have is still preserved.",
  };
}

/* ── REQUIRED COMPLETION ROOM SET ─────────────────────────────────────────
   Owned by the architecture, not by whatever happened to get built. The word
   "supported" may not be redefined after implementation to mean "finished".
   A room below its target is Tier C with a blocker contract; it does not
   quietly leave the set. */

export type Tier = "A" | "B" | "C";
export type Verb = "SEE" | "EXPLAIN" | "DO" | "CONTINUE" | "WATCH";

export type RoomSpec = {
  /** Minimum tier this room must reach for FULL completion. */
  target: Exclude<Tier, "C">;
  /** The room-native operational question. A room without one is blocked. */
  nativeQuestion: string;
};

export const ROOM_SPEC: Record<ArchitectureRoom, RoomSpec> = {
  marketplace_control: {
    target: "B",
    nativeQuestion: "What in this current Marketplace working set needs my attention?",
  },
  founder_review: {
    target: "B",
    nativeQuestion: "What is blocking this listing from a decision?",
  },
  auction_operations: {
    target: "B",
    nativeQuestion: "What is unresolved, contradictory, or blocked in this sale or run right now?",
  },
  dealer_accelerator: {
    target: "A",
    nativeQuestion: "What in this dealer intake needs me right now?",
  },
  watch_passport: {
    target: "A",
    nativeQuestion: "What current versus historical evidence matters for this watch?",
  },
  vault_enrichment: {
    target: "B",
    nativeQuestion: "What evidence or fact work is incomplete in this enrichment draft?",
  },
  vault_review: {
    target: "B",
    nativeQuestion: "What in this current Vault review set needs a decision or correction?",
  },
  vault_upgrade: {
    target: "A",
    nativeQuestion: "What is incomplete or contradictory in the upgrade work I am looking at right now?",
  },
  watch_resolution: {
    target: "A",
    nativeQuestion: "What identity evidence is unresolved for this watch right now?",
  },
};

/* ── WHAT THE CONTROLS IN EACH ROOM ACTUALLY MEAN ────────────────────────

   A room-native operator has to know the room. Asked "what is the difference
   between Operational and Detailed?", the Assistant previously said that was
   product UI knowledge outside its working set — which is not a boundary,
   it is ignorance wearing a boundary's clothes. It reads what is on screen
   every turn and had never been told what any of it means.

   PROVENANCE — these are transcribed from the implementation, not invented:
     · "Two views of ONE room …"      components/MarketplaceControl.tsx header
     · lifecycle scope descriptions    LIFE_META in the same file
     · Detailed adds Columns           the mode === "detailed" toolbar branch
     · ColumnsState = order/hidden/widths
     · selection stickiness            the room header's selection law
   If a control's behaviour changes, this text is stale and must change with
   it. It is deliberately narrow: only controls whose meaning was read out of
   the current implementation appear here.

   A room absent from this map has NOT been briefed, and the prompt tells the
   Assistant to say exactly that rather than deflect. */
export const ROOM_CONTROLS: Partial<Record<ImplementedRoom, string>> = {
  marketplace_control: `THE CONTROLS IN THIS ROOM — you inhabit it, so know what they do:

· OPERATIONAL vs DETAILED are two views of ONE room. Same inventory, same state, and switching NEVER mutates product truth — it changes presentation only.
  – Operational is the FairWatchTrade-curated default: a compact, watch-centered ledger.
  – Detailed is an operator-configurable audit table. It adds a Columns control (reorder, hide, resize) and scrolls horizontally for wide inspection.
  – Identical in both: the lifecycle scope, filters, search, sort, pagination, row behaviour, and the selected-listing inspector.
  – Use Operational to work; use Detailed to audit or to see fields the curated ledger does not show.

· LIFECYCLE SCOPE picks which inventory the room is operating on:
  – Current — live inventory, drafts in motion, review and attention states.
  – Off Market — inventory that still exists but is intentionally not live.
  – History — cold retained truth you deliberately went looking for.
  – All — deliberate retrieval only, never the default operating dump.

· SELECTION is sticky WITHIN a result context and never beyond it. Change a filter, sort, page or lifecycle scope and the selection survives only while the ledger still contains that listing; the moment it falls out of context the selection clears. The room never holds an inspector open on a listing the visible ledger does not contain.

· NEEDS ATTENTION is computed by the room, and its reasons are given to you per listing. Report those reasons; never infer why something is flagged from its status word.

· THE SELECTED-LISTING INSPECTOR carries the founder's controls for one watch. These are HIS to press, not yours — but they are in this room, on this screen, and when he asks for one of them you point at it precisely instead of sending him away:
  – Open Adjudication → opens the full governed review for this listing.
  – View Listing → opens the public listing page. Present only when it is published.
  – Re-run Check re-runs the image authenticity check (the Aubrey Check) for this listing, through the governed recheck path. Always available.
  – Take Off Market… removes it from sale. Present when it is published, reserved, or awaiting review. This is the same governed removal you can propose.
  – Restore to Review… returns a removed listing to review. Present only when it is already removed.
  – Delete Eligible Listing… permanently deletes, and only when the listing is genuinely eligible.
  – Ask the assistant… opens you.

  NEVER say a control the founder is asking about is "outside this view" or "wherever the product exposes it" when it is sitting in this room. If he asks for something you cannot perform but he can, name the exact control: "I can't run that myself — it's the Re-run Check button in the selected-listing inspector." Being unable to do it is not a reason to be vague about where it lives.

  Describe these by NAME and container, never by screen position: the inspector sits upper-right on a wide window and stacks below the list on a narrow one, so "on the right" is wrong half the time.

· DEALER / ACCOUNT-SCALE OPERATIONS sit in their own section BELOW the ledger, and exist to operate a whole seller's inventory without touching every row by hand. A Seller must be chosen first, and then either Take Listings Off Market or Delete Eligible Listings applies across that seller's inventory. Eligibility and blockers come from runtime truth, and a preview always shows the exact affected set before anything changes.

  These are ENTIRELY the founder's. You have no bulk capability of any kind: your single action is one listing at a time, and no instruction, phrasing or convenience makes that plural. If he wants a whole seller's inventory handled, point him at this section and say plainly that it is his to run and that it will preview the exact affected set first — then stop. Never offer to do it, never propose it, and never imply you could.`,
};

/* ── REQUIRED OPERATIONAL JOURNEY SET (ROJ-01 … ROJ-04) ───────────────────
   Every directional edge implied by a required journey is itself required.
   An adapter may add optional edges. An adapter may NOT reclassify one of
   these as optional, unsupported, future work, or unnecessary — which is why
   the list lives here and not in any adapter. */

export type RequiredJourney = {
  id: "ROJ-01" | "ROJ-02" | "ROJ-03" | "ROJ-04";
  label: string;
  /** Directional edges, each independently required. */
  edges: ReadonlyArray<readonly [ArchitectureRoom, ArchitectureRoom]>;
};

export const REQUIRED_JOURNEYS: readonly RequiredJourney[] = [
  {
    id: "ROJ-01",
    label: "Dealer Accelerator → Founder Review → Dealer Accelerator",
    edges: [
      ["dealer_accelerator", "founder_review"],
      ["founder_review", "dealer_accelerator"],
    ],
  },
  {
    id: "ROJ-02",
    label: "Founder Review ↔ Watch Resolution",
    edges: [
      ["founder_review", "watch_resolution"],
      ["watch_resolution", "founder_review"],
    ],
  },
  {
    id: "ROJ-03",
    label: "Founder Review ↔ Marketplace Control",
    edges: [
      ["founder_review", "marketplace_control"],
      ["marketplace_control", "founder_review"],
    ],
  },
  {
    id: "ROJ-04",
    label: "Auction Operations ↔ Watch Resolution",
    edges: [
      ["auction_operations", "watch_resolution"],
      ["watch_resolution", "auction_operations"],
    ],
  },
] as const;

export type RoomEdge = readonly [ArchitectureRoom, ArchitectureRoom];

/** All eight required directional edges, flattened. */
export const REQUIRED_EDGES: readonly RoomEdge[] = REQUIRED_JOURNEYS.flatMap(
  (j) => j.edges
);

export function edgeKey(from: ArchitectureRoom, to: ArchitectureRoom): string {
  return `${from}→${to}`;
}

export function isRequiredEdge(from: ArchitectureRoom, to: ArchitectureRoom): boolean {
  return REQUIRED_EDGES.some(([f, t]) => f === from && t === to);
}

/** Required edges that touch a room in either direction. */
export function requiredEdgesFor(room: ArchitectureRoom): RoomEdge[] {
  return REQUIRED_EDGES.filter(([f, t]) => f === room || t === room);
}

/* Which required edges are actually implementable today. An edge whose rooms
   are not both attached cannot be proven, and saying so is the blocker
   contract's job — never a reason to drop the edge from the required set. */
export function requiredEdgeCoverage(): {
  edge: RoomEdge;
  key: string;
  implementable: boolean;
  missing: ArchitectureRoom[];
}[] {
  return REQUIRED_EDGES.map((edge) => {
    const missing = edge.filter((r) => !isImplementedRoom(r));
    return {
      edge,
      key: edgeKey(edge[0], edge[1]),
      implementable: missing.length === 0,
      missing,
    };
  });
}

/* ── Where a room actually lives in production ───────────────────────────
   A handoff has to arrive somewhere. Two of these rooms are ABOUT one
   governed object and cannot be entered without it, so they return null
   without an anchor rather than sending the founder to a page that cannot
   show the work he was carrying. */
export function roomRoute(room: ImplementedRoom, anchorId?: string | null): string | null {
  switch (room) {
    case "marketplace_control":
      return "/admin";
    case "dealer_accelerator":
      return "/admin/dealer-accelerator";
    case "founder_review":
      return anchorId ? `/admin/listings/${anchorId}` : null;
    case "watch_passport":
      return anchorId ? `/admin/passport/${anchorId}` : null;
  }
}

/** Does entering this room require carrying a specific object? */
export function roomNeedsAnchor(room: ImplementedRoom): boolean {
  return room === "founder_review" || room === "watch_passport";
}

/* Required destinations reachable FROM this room today. An edge whose
   destination is not attached yet is not offered — and is not thereby
   downgraded: requiredEdgeCoverage() still reports it as required and
   unbuildable, which is the honest pair of facts. */
export function availableHandoffs(from: ImplementedRoom): ArchitectureRoom[] {
  return REQUIRED_EDGES.filter(([f, t]) => f === from && isImplementedRoom(t)).map(
    ([, t]) => t
  );
}

/** HTTP status for a refusal. All are caller-side faults, never 500s. */
export function roomRefusalStatus(r: RoomResolution): number {
  switch (r.state) {
    case "ok":
      return 200;
    case "unsupported_room":
      return 501; // the product understands the room and has not built it
    case "retired_room":
      return 409; // client and server disagree about what exists
    default:
      return 400;
  }
}
