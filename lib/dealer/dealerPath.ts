import "server-only";

/* ════════════════════════════════════════════════════════════════════════
   DEALER ACCELERATOR — the dealer's own path  (lib/dealer/dealerPath.ts)

   Everything a dealer can do for themselves, in one module the thin routes
   ignite. The engine below it is unchanged: this file connects a source,
   advances a run, and reads durable truth back out. It invents no state.

   ── What this module is NOT ────────────────────────────────────────────
   Not a second importer. Not a shadow inventory table. Not a second
   review system. Every write goes through a spine RPC that already owned
   that law before this file existed.

   ── The privilege shape, which is deliberate ───────────────────────────
   The accelerator tables grant service_role SELECT and nothing else; all
   writes are SECURITY DEFINER functions owned by the writer role. So a
   dealer never touches these tables directly and no row-level policy had
   to be widened to let them see their own run. Reads happen here, on the
   server, already filtered to the caller's own dealer id. If you are ever
   tempted to expose these tables to `authenticated` to save a route, the
   answer is no: the filter is the security boundary.

   ── Ownership is checked, never assumed ────────────────────────────────
   Every entry point re-reads the source and proves dealer_profile_id
   equals the caller before doing anything. A source id arriving from a
   client is an assertion, not a fact.
   ════════════════════════════════════════════════════════════════════════ */

import { createServiceClient } from "@/lib/supabase/service";
import {
  resolveInventorySource,
  NDJSON_SOURCE_TYPE,
  type DiscoveryRejection,
  type ResolvedInventorySource,
} from "./sourceDiscovery";
import { ADAPTER_VERSION, runManifestSlice } from "./manifestAdapter";
import { materializeOneItem } from "./materializationBridge";

/** The exact sentence a dealer affirms before FairWatchTrade will retrieve
    anything. Recorded verbatim in the authorization event so the record
    says what was actually agreed, not a paraphrase of it. */
export const DEALER_ATTESTATION_TEXT =
  "I confirm that I own, manage, or am authorized to use this inventory and " +
  "its photographs, and I authorize FairWatchTrade to retrieve them for the " +
  "purpose of preparing private draft listings.";

/** The adapter generation a dealer-connected source is scoped to. Part of
    the source's uniqueness key, so it must stay equal to the adapter's own
    version — the established rows already use exactly this value. */
export const DEALER_ADAPTER_SCOPE = ADAPTER_VERSION;

/* ── The durable terms recorded on a dealer-connected source ────────────
   These strings are stored on the row. The authorize RPC refuses to reuse
   an active source whose stored terms differ from the ones presented, so
   editing them does NOT corrupt anything — a returning dealer simply
   resolves down the already-connected branch instead. That is why the
   conflict below is treated as an ordinary outcome rather than an error.
   Keep them stable anyway: churn here makes the evidence log harder to
   read for no gain. */
const DEALER_AUTHORIZATION_BASIS =
  "Dealer self-service authorization. The dealer affirmed ownership of, or " +
  "authority over, this inventory and its photographs, and authorized " +
  "retrieval for the purpose of preparing private draft listings. Control of " +
  "the source domain was evidenced by a discovery document published on that " +
  "origin at the time of connection.";

const DEALER_RETENTION_TERMS =
  "Retained as the evidence record behind the dealer's own imported drafts. " +
  "Removal follows the dealer's account and listing retention terms.";

const DEALER_PHOTOGRAPH_USE_TERMS =
  "Photographs are retrieved from the dealer's own authorized source solely " +
  "to prepare that dealer's private draft listings, and carry Dealer " +
  "Accelerator provenance. They are never presented as In Hand Verified " +
  "capture and are never reclassified as an ordinary upload.";

/** One slice invocation is bounded; so is one call into this module. The
    budget sits well below any platform limit so a single call always
    returns a truthful answer rather than being killed mid-write. The spine
    resumes from any interruption, so stopping early is safe by design. */
const ADVANCE_BUDGET_MS = 20_000;

type Db = ReturnType<typeof createServiceClient>;

/* ════════════════════════════════════════════════════════════════════════
   Connecting a source
   ════════════════════════════════════════════════════════════════════════ */

export type ConnectOutcome =
  | {
      ok: true;
      /** 'connected' — this dealer's attestation authorized it just now.
          'already_connected' — an active authorization for this exact
          source already existed for this dealer, so nothing was
          re-authorized and the dealer continues from it. */
      status: "connected" | "already_connected";
      sourceId: string;
      resolved: ResolvedInventorySource;
    }
  | DiscoveryRejection
  | { ok: false; failure: "attestation_required" | "source_write_failed"; detail?: string };

/**
 * Resolve a typed website, then record the dealer's own authorization for
 * it. Read-then-write is deliberate: nothing durable happens until the
 * source has actually been resolved and validated.
 */
export async function connectInventorySource(opts: {
  userId: string;
  website: string;
  attested: boolean;
}): Promise<ConnectOutcome> {
  if (!opts.attested) return { ok: false, failure: "attestation_required" };

  const resolved = await resolveInventorySource(opts.website);
  if (!resolved.ok) return resolved;

  const db = createServiceClient();

  // An active authorization for this exact source may already exist — the
  // dealer reconnecting, or a source authorized during an earlier era of
  // this system. Either way it is not an error and must not be rewritten.
  const existing = await findActiveSource(db, opts.userId, resolved.sourceLocator);
  if (existing) {
    await ensureOriginsApproved(db, existing.id, opts.userId, resolved);
    return {
      ok: true,
      status: "already_connected",
      sourceId: existing.id,
      resolved,
    };
  }

  try {
    const { data, error } = await db.rpc("dealer_accelerator_authorize_source", {
      p_dealer_profile_id: opts.userId,
      p_source_type: NDJSON_SOURCE_TYPE,
      p_source_locator: resolved.sourceLocator,
      p_source_locator_key: resolved.sourceLocator,
      p_authorization_basis: DEALER_AUTHORIZATION_BASIS,
      p_authorized_by: opts.userId,
      p_retention_terms: DEALER_RETENTION_TERMS,
      p_photograph_use_terms: DEALER_PHOTOGRAPH_USE_TERMS,
      p_adapter_scope: DEALER_ADAPTER_SCOPE,
      // The dealer authorized this, and the log now says so.
      p_actor_kind: "dealer",
      // The attestation itself, verbatim, beside the evidence of domain
      // control that made it self-service. Both are facts about this act.
      p_attestation: {
        attestation_text: DEALER_ATTESTATION_TEXT,
        attested: true,
        domain_control_evidence: "well_known_inventory_document_v1",
        resolved_manifest_url: resolved.manifestUrl,
        declared_snapshot: resolved.declaredVersion,
        watches_declared: resolved.watchCount,
      },
    });
    if (error) {
      // The RPC refuses to reuse an active source whose stored terms differ
      // from these. That means one already exists — the already-connected
      // outcome, reached from the other direction.
      if (/active_source_authorization_conflict/.test(error.message)) {
        const again = await findActiveSource(db, opts.userId, resolved.sourceLocator);
        if (again) {
          await ensureOriginsApproved(db, again.id, opts.userId, resolved);
          return { ok: true, status: "already_connected", sourceId: again.id, resolved };
        }
      }
      return { ok: false, failure: "source_write_failed", detail: error.message };
    }

    const sourceId = (data as { id: string }).id;
    await ensureOriginsApproved(db, sourceId, opts.userId, resolved);
    return { ok: true, status: "connected", sourceId, resolved };
  } catch (e) {
    return {
      ok: false,
      failure: "source_write_failed",
      detail: e instanceof Error ? e.message : "unknown",
    };
  }
}

async function findActiveSource(
  db: Db,
  userId: string,
  sourceLocator: string
): Promise<{ id: string } | null> {
  const { data } = await db
    .from("dealer_accelerator_sources")
    .select("id")
    .eq("dealer_profile_id", userId)
    .eq("source_type", NDJSON_SOURCE_TYPE)
    .eq("source_locator_key", sourceLocator.toLowerCase())
    .eq("adapter_scope", DEALER_ADAPTER_SCOPE)
    .neq("authorization_state", "revoked")
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}

/**
 * Every source row for this dealer's governed source at this locator, across
 * ALL authorization episodes — revoked ones included.
 *
 * This is the lineage, and it is the difference between a truthful "already
 * prepared" count and one that resets to zero every time an authorization is
 * retired. The four columns below ARE the lineage; the database also derives
 * them into `source_lineage_key`, which is what the adoption function matches
 * on when it decides whether a listing already exists for an item.
 *
 * Deliberately NOT filtered by authorization_state: a retired episode's work
 * is still work that was really done, and its listings still exist.
 */
async function findLineageSourceIds(
  db: Db,
  userId: string,
  sourceLocator: string
): Promise<string[]> {
  const { data } = await db
    .from("dealer_accelerator_sources")
    .select("id")
    .eq("dealer_profile_id", userId)
    .eq("source_type", NDJSON_SOURCE_TYPE)
    .eq("source_locator_key", sourceLocator.toLowerCase())
    .eq("adapter_scope", DEALER_ADAPTER_SCOPE);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

/**
 * Approve the two governed origins this source needs. Idempotent by way of
 * the RPC, which converges on an existing approval rather than raising.
 *
 * The origins are derived from the resolved document, never from anything
 * the dealer typed directly: the manifest directory and the declared
 * photographs prefix, both on the origin whose control was evidenced.
 */
async function ensureOriginsApproved(
  db: Db,
  sourceId: string,
  userId: string,
  resolved: ResolvedInventorySource
): Promise<void> {
  // Origins are chain-bound to the event that authorized them. Use this
  // source's own authorization event — the earliest one, so a reconnect
  // does not re-point existing origins at a newer event.
  const { data: ev } = await db
    .from("dealer_accelerator_lifecycle_events")
    .select("id")
    .eq("source_id", sourceId)
    .eq("event_type", "source_authorized")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  const eventId = (ev as { id: number } | null)?.id;
  if (eventId === undefined) return; // no authorization event: nothing to bind to

  for (const [purpose, prefix] of [
    ["manifest", resolved.manifestPathPrefix],
    ["photographs", resolved.photographsPathPrefix],
  ] as const) {
    const { error } = await db.rpc("dealer_accelerator_approve_source_origin", {
      p_source_id: sourceId,
      p_purpose: purpose,
      p_hostname: resolved.hostname,
      p_port: resolved.port,
      p_path_prefix: prefix,
      p_authorization_event_id: eventId,
      p_actor_kind: "dealer",
      p_actor_user_id: userId,
    });
    // A revoked origin refuses loudly and must not be papered over —
    // re-approving after a revocation is a deliberate decision, not a side
    // effect of reconnecting.
    if (error && /origin_revoked/.test(error.message)) throw new Error(error.message);
  }
}

/* ════════════════════════════════════════════════════════════════════════
   Reading the run
   ════════════════════════════════════════════════════════════════════════ */

export interface AttentionItem {
  batchItemId: string;
  sourceItemKey: string;
  reasonCode: string;
}

export interface DealerAcceleratorState {
  source: {
    id: string;
    locator: string;
    state: string;
    connectedAt: string;
    authorizedBySelf: boolean;
  } | null;
  run: {
    batchId: string;
    status: string;
    snapshotKey: string;
    startedAt: string | null;
    completedAt: string | null;
    itemsTotal: number;
    prepared: number;
    needsAttention: number;
    stillProcessing: number;
    /** No further work will ever happen on this run. */
    settled: boolean;
    /** Work remains and a further call would advance it. */
    advanceable: boolean;
    fatalErrorCode: string | null;
  } | null;
  needsAttention: AttentionItem[];
  /** Drafts that actually reached the marketplace as imported inventory —
      the same unforgeable marker the Imported Drafts workspace queries. */
  importedDraftCount: number;
}

const SETTLED_BATCH = ["completed", "completed_with_exceptions", "failed", "cancelled"];

export async function buildDealerAcceleratorState(
  userId: string
): Promise<DealerAcceleratorState> {
  const db = createServiceClient();

  const { data: srcRow } = await db
    .from("dealer_accelerator_sources")
    .select("id,source_locator,authorization_state,authorized_at,authorized_by")
    .eq("dealer_profile_id", userId)
    .neq("authorization_state", "revoked")
    .order("authorized_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const src = srcRow as {
    id: string;
    source_locator: string;
    authorization_state: string;
    authorized_at: string;
    authorized_by: string;
  } | null;

  const importedDraftCount = await countImportedDrafts(db, userId);

  if (!src) {
    return { source: null, run: null, needsAttention: [], importedDraftCount };
  }

  const { data: batchRow } = await db
    .from("dealer_accelerator_batches")
    .select("id,status,source_snapshot_key,started_at,completed_at,fatal_error_code")
    .eq("dealer_profile_id", userId)
    .eq("source_id", src.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const batch = batchRow as {
    id: string;
    status: string;
    source_snapshot_key: string;
    started_at: string | null;
    completed_at: string | null;
    fatal_error_code: string | null;
  } | null;

  const source = {
    id: src.id,
    locator: src.source_locator,
    state: src.authorization_state,
    connectedAt: src.authorized_at,
    // Surfaced because it is the difference between a dealer who authorized
    // their own source and one whose source predates self-service.
    authorizedBySelf: src.authorized_by === userId,
  };

  if (!batch) return { source, run: null, needsAttention: [], importedDraftCount };

  // Item counts come from the items themselves, one read, counted here.
  // Not a stored tally: a stored count is a second truth that can drift
  // from the rows it claims to summarize.
  const { data: itemRows } = await db
    .from("dealer_accelerator_batch_items")
    .select("id,status,blocked_reason_code,source_item_id")
    .eq("batch_id", batch.id);

  const items = (itemRows ?? []) as Array<{
    id: string;
    status: string;
    blocked_reason_code: string | null;
    source_item_id: string;
  }>;

  const prepared = items.filter((i) => i.status === "draft_created").length;
  const blocked = items.filter((i) => i.status === "blocked");
  const stillProcessing = items.filter(
    (i) => i.status === "discovered" || i.status === "ready"
  ).length;

  const needsAttention = await describeBlockedItems(db, blocked);

  const settled = SETTLED_BATCH.includes(batch.status);

  return {
    source,
    run: {
      batchId: batch.id,
      status: batch.status,
      snapshotKey: batch.source_snapshot_key,
      startedAt: batch.started_at,
      completedAt: batch.completed_at,
      itemsTotal: items.length,
      prepared,
      needsAttention: blocked.length,
      stillProcessing,
      settled,
      // A settled batch may still have ready items awaiting materialization
      // when the run was interrupted between phases, so advanceability is
      // about remaining work, not about the batch's own status alone.
      advanceable: !settled || stillProcessing > 0,
      fatalErrorCode: batch.fatal_error_code,
    },
    needsAttention,
    importedDraftCount,
  };
}

/** Resolve blocked items to their stable source keys so the dealer sees
    which watch is affected rather than an internal row id. */
async function describeBlockedItems(
  db: Db,
  blocked: Array<{ id: string; blocked_reason_code: string | null; source_item_id: string }>
): Promise<AttentionItem[]> {
  if (blocked.length === 0) return [];
  const { data } = await db
    .from("dealer_accelerator_source_items")
    .select("id,source_item_key")
    .in(
      "id",
      blocked.map((b) => b.source_item_id)
    );
  const keyById = new Map(
    ((data ?? []) as Array<{ id: string; source_item_key: string }>).map((r) => [
      r.id,
      r.source_item_key,
    ])
  );
  return blocked.map((b) => ({
    batchItemId: b.id,
    sourceItemKey: keyById.get(b.source_item_id) ?? "",
    reasonCode: b.blocked_reason_code ?? "unknown",
  }));
}

async function countImportedDrafts(db: Db, userId: string): Promise<number> {
  // Imported provenance is carried by listing_media, and the listing's own
  // seller is the ownership boundary. Counting media rows would over-count
  // (several photographs per watch), so count distinct listings.
  const { data } = await db
    .from("listing_media")
    .select("listing_id,listings!inner(seller_id)")
    .eq("capture_source", "dealer_import")
    .eq("listings.seller_id", userId);
  const rows = (data ?? []) as Array<{ listing_id: string }>;
  return new Set(rows.map((r) => r.listing_id)).size;
}

/* ════════════════════════════════════════════════════════════════════════
   Advancing the run
   ════════════════════════════════════════════════════════════════════════ */

export interface AdvanceReport {
  ok: boolean;
  sourceId: string;
  batchId: string | null;
  slicesRun: number;
  itemsMaterialized: number;
  /** Recognized as already prepared by an earlier authorization episode and
      linked to that listing. Counted separately from itemsMaterialized so
      "prepared this call" never claims credit for work already done. */
  itemsAdopted: number;
  itemsBlocked: number;
  /** Items that THREW rather than returning a verdict, with the first distinct
      message.

      This exists because its absence cost real time. Twelve items failed
      identically with a permission error, the per-item catch counted each as
      "needing attention", and the report read "0 newly prepared, 12 needing
      attention" — indistinguishable from twelve watches legitimately lacking
      evidence. The durable state said 'discovered', which contradicted
      "attention", and that contradiction was the only clue.

      A thrown error is not a verdict about a watch. It must never be counted
      as one silently. */
  itemsErrored: number;
  errorSample: string | null;
  /** True when nothing further remains for this snapshot. */
  finished: boolean;
  detail: string;
}

/**
 * Do one bounded unit of preparation, then report. Safe to call again at any
 * time: the spine's idempotency means a repeat converges instead of
 * duplicating.
 *
 * ── TWO MODES, and the distinction is load-bearing ────────────────────────
 *
 * START mode (no `continueBatchId`) — the dealer pressed Start. The current
 * discovery document is resolved and a batch for that snapshot is created or
 * returned. This is the ONLY mode permitted to bring a new batch into
 * existence, because starting preparation is a decision a person makes.
 *
 * CONTINUATION mode (`continueBatchId` supplied) — the background worker is
 * finishing a run somebody already started. It works on THAT batch and pins
 * discovery to THAT batch's own snapshot key, so it can never resolve a newer
 * document into a new batch. For a batch whose discovery has already
 * finished, the document is not fetched at all — materialization needs no
 * manifest.
 *
 * Why this matters: the worker previously received only (userId, sourceId)
 * and always re-resolved the current document. Handed an idle historical
 * batch it created a brand-new batch on that source for the current snapshot
 * — new preparation nobody asked for. A background worker may finish work; it
 * may not start it.
 */
export async function advancePreparation(opts: {
  userId: string;
  sourceId: string;
  budgetMs?: number;
  /** Continuation mode: the batch to continue, and nothing else. */
  continueBatchId?: string;
  /** That batch's own snapshot key, so discovery cannot drift to a newer one. */
  continueSnapshotKey?: string;
}): Promise<AdvanceReport> {
  const db = createServiceClient();
  const deadline = Date.now() + (opts.budgetMs ?? ADVANCE_BUDGET_MS);
  const continuing = Boolean(opts.continueBatchId);

  const { data: srcRow } = await db
    .from("dealer_accelerator_sources")
    .select("id,dealer_profile_id,source_locator,authorization_state")
    .eq("id", opts.sourceId)
    .maybeSingle();
  const src = srcRow as {
    id: string;
    dealer_profile_id: string;
    source_locator: string;
    authorization_state: string;
  } | null;

  // Ownership and state are proven here, not trusted from the caller.
  if (!src || src.dealer_profile_id !== opts.userId) {
    return blankAdvance(opts.sourceId, "source_not_found");
  }
  if (src.authorization_state !== "authorized") {
    return blankAdvance(opts.sourceId, `source_${src.authorization_state}`);
  }

  /* Continuation mode re-proves the batch belongs to this dealer AND this
     source before touching it. A batch id from a caller is an assertion. */
  let continueStatus: string | null = null;
  if (continuing) {
    const { data: bRow } = await db
      .from("dealer_accelerator_batches")
      .select("id,dealer_profile_id,source_id,status,source_snapshot_key")
      .eq("id", opts.continueBatchId as string)
      .maybeSingle();
    const b = bRow as {
      id: string;
      dealer_profile_id: string;
      source_id: string;
      status: string;
      source_snapshot_key: string;
    } | null;
    if (!b || b.dealer_profile_id !== opts.userId || b.source_id !== src.id) {
      return blankAdvance(opts.sourceId, "batch_not_found_for_source");
    }
    continueStatus = b.status;
  }

  /* Discovery is needed only when phase one is unfinished. A batch that has
     already completed discovery needs no manifest, so in continuation mode we
     do not fetch the dealer's document at all — which also means a dealer
     whose website is temporarily unreachable can still have their prepared
     evidence materialized. */
  const discoveryNeeded =
    !continuing || !["completed", "completed_with_exceptions", "failed", "cancelled"].includes(continueStatus ?? "");

  let resolvedVersion: string | null = null;
  let resolvedManifestUrl: string | null = null;
  let resolvedWatchCount = 0;

  if (discoveryNeeded) {
    const resolved = await resolveInventorySource(src.source_locator);
    if (!resolved.ok) {
      return blankAdvance(opts.sourceId, `source_unresolvable_${resolved.failure}`);
    }
    // The re-resolved source must still be the source that was authorized.
    // Without this, a changed discovery document could redirect an existing
    // authorization at a different directory on the same host.
    if (resolved.sourceLocator.toLowerCase() !== src.source_locator.toLowerCase()) {
      return blankAdvance(opts.sourceId, "source_moved");
    }
    resolvedManifestUrl = resolved.manifestUrl;
    resolvedWatchCount = resolved.watchCount;
    /* THE PIN. In continuation mode the snapshot key comes from the batch,
       never from the freshly resolved document. Pass the document's version
       here and create_or_get_batch would mint a NEW batch whenever the dealer
       had bumped their inventory — which is exactly the bug this closes. */
    resolvedVersion = continuing
      ? (opts.continueSnapshotKey ?? null)
      : resolved.declaredVersion;
    if (resolvedVersion === null) {
      return blankAdvance(opts.sourceId, "continuation_snapshot_unknown");
    }
  }

  let batchId: string | null = opts.continueBatchId ?? null;
  let slicesRun = 0;
  let settled = false;

  /* ── Two phases, two budgets ────────────────────────────────────────────
     Discovery and materialization used to share one deadline, and discovery
     always ran first. When discovery used the whole budget — real fetching
     over a real inventory, easily 19s against a 12s allowance — the loop
     exited on the deadline and materialization got nothing. Worse, `batchId`
     is only learned from a slice report, so a call entering with no budget
     left never even set it and the materialization block was skipped
     outright by `if (batchId)`.

     Discovery now gets a bounded share and materialization keeps the rest,
     so every call makes progress on whichever phase has work. Both phases
     are resumable, so a call that runs out mid-phase costs time, never
     state. */
  const discoveryDeadline = Math.min(deadline, Date.now() + Math.floor((opts.budgetMs ?? ADVANCE_BUDGET_MS) * 0.6));

  /* ── Discovery phase ───────────────────────────────────────────────────
     Skipped entirely when phase one is already finished. In continuation mode
     the version passed here is the BATCH's own snapshot key, so
     create_or_get_batch can only return that batch — never mint a newer one. */
  if (discoveryNeeded && resolvedVersion !== null && resolvedManifestUrl !== null) {
    while (Date.now() < discoveryDeadline) {
      const report = await runManifestSlice({
        sourceId: src.id,
        declaredManifestVersion: resolvedVersion,
        manifestUrl: resolvedManifestUrl,
        batchLimit: Math.max(1, resolvedWatchCount),
        actorUserId: opts.userId,
        /* A background continuation is the WORKER acting, not the dealer.
           Recording 'dealer' for a pass no person triggered is how the
           accidental batch came to carry batch_started:dealer, which then made
           it look explicitly started. The dealer's own Start still records
           'dealer', because a dealer really did press it. */
        actorKind: continuing ? "worker" : "dealer",
      });
      slicesRun++;
      // In continuation mode batchId is already pinned; assert rather than
      // overwrite, so a surprise batch id surfaces instead of being adopted.
      if (batchId !== null && report.batchId !== batchId) {
        return blankAdvance(opts.sourceId, "continuation_batch_diverged");
      }
      batchId = report.batchId;
      if (report.settled || SETTLED_BATCH.includes(report.batchStatus)) {
        settled = true;
        break;
      }
      if (report.itemsProcessed === 0 && report.phase === "items") break; // no forward progress
    }
  } else {
    // Discovery already finished; nothing to slice.
    settled = true;
  }

  /* START mode only: learn the batch from durable state when discovery ran out
     of budget before reporting one. Continuation mode already knows it.
     Without this a run whose discovery finished on an earlier call could never
     be materialized — twelve items sat in 'discovered' behind a completed
     batch for exactly this reason. */
  if (batchId === null && resolvedVersion !== null) {
    const { data: currentBatch } = await db
      .from("dealer_accelerator_batches")
      .select("id")
      .eq("dealer_profile_id", opts.userId)
      .eq("source_id", src.id)
      .eq("source_snapshot_key", resolvedVersion)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    batchId = (currentBatch as { id: string } | null)?.id ?? null;
  }

  // ── Materialization phase: evidence → dealer-owned drafts, one at a
  //    time, exactly as the bridge requires. ──
  let materialized = 0;
  let adoptedCount = 0;
  let blocked = 0;
  let errored = 0;
  let errorSample: string | null = null;

  if (batchId) {
    const { data: readyRows } = await db
      .from("dealer_accelerator_batch_items")
      .select("id,status,source_item_id")
      .eq("batch_id", batchId)
      .in("status", ["discovered", "ready"]);

    const ready = (readyRows ?? []) as Array<{ id: string; source_item_id: string }>;
    const keys = await sourceItemKeys(
      db,
      ready.map((r) => r.source_item_id)
    );

    for (const row of ready) {
      if (Date.now() >= deadline) break;
      const key = keys.get(row.source_item_id);
      if (!key) continue;
      try {
        const result = await materializeOneItem({
          sourceId: src.id,
          sourceItemKey: key,
          /* Name the exact item this batch selected. Without it the bridge
             picks whichever item for this key already carries a listing —
             which, on a dealer's SECOND snapshot, is the previous batch's
             item. This batch's item would then never be transitioned, the run
             would never finish, and the worker would retry it forever. */
          batchItemId: row.id,
          actorUserId: opts.userId,
          /* Truthful attribution: a background continuation is the worker
             acting under the dealer's earlier Start, not the dealer acting
             now. actor_user_id still names the dealer, so the act remains
             traceable to whose inventory it was. */
          actorKind: continuing ? "worker" : "dealer",
          mode: "materialize",
        });
        if (result.outcome === "DRAFT_CREATED") materialized++;
        // An earlier authorization episode already prepared this watch; this
        // item linked to that listing rather than creating a second one.
        else if (result.outcome === "ALREADY_MATERIALIZED") adoptedCount++;
        else if (result.outcome === "BLOCKED") blocked++;
      } catch (e) {
        /* One item's failure is that item's business — the remaining items
           still get their turn. But it is counted as an ERROR, not as
           "blocked": blocked is a truthful verdict about a watch's evidence,
           and a thrown exception is a fault in the machinery. Conflating them
           hid a permission error behind twelve plausible-looking attention
           counts. */
        errored++;
        if (errorSample === null) {
          errorSample = e instanceof Error ? e.message : String(e);
        }
      }
    }
  }

  const after = await buildDealerAcceleratorState(opts.userId);
  const finished = Boolean(after.run && !after.run.advanceable);

  return {
    ok: true,
    sourceId: src.id,
    batchId,
    slicesRun,
    itemsMaterialized: materialized,
    itemsAdopted: adoptedCount,
    itemsBlocked: blocked,
    itemsErrored: errored,
    errorSample,
    finished,
    detail:
      `${settled ? "discovery settled" : `discovery advanced in ${slicesRun} slice(s)`}; ` +
      `${materialized} newly prepared` +
      (adoptedCount > 0 ? `, ${adoptedCount} already prepared previously` : "") +
      (blocked > 0 ? `, ${blocked} needing attention` : "") +
      // Errors are named loudly and carry their message. A silent count here
      // is what made a permission failure look like ordinary attention.
      (errored > 0 ? `, ${errored} FAILED (${errorSample})` : ""),
  };
}

async function sourceItemKeys(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await db
    .from("dealer_accelerator_source_items")
    .select("id,source_item_key")
    .in("id", ids);
  return new Map(
    ((data ?? []) as Array<{ id: string; source_item_key: string }>).map((r) => [
      r.id,
      r.source_item_key,
    ])
  );
}

function blankAdvance(sourceId: string, detail: string): AdvanceReport {
  return {
    ok: false,
    sourceId,
    batchId: null,
    slicesRun: 0,
    itemsMaterialized: 0,
    itemsAdopted: 0,
    itemsBlocked: 0,
    itemsErrored: 0,
    errorSample: null,
    finished: false,
    detail,
  };
}

/* ════════════════════════════════════════════════════════════════════════
   Already-prepared arithmetic for the confirmation screen
   ════════════════════════════════════════════════════════════════════════ */

export interface PreparationForecast {
  found: number;
  alreadyPrepared: number;
  toPrepare: number;
}

/**
 * How many of the declared watches already exist as drafts for this dealer.
 * Answers the confirmation screen honestly: re-running a snapshot must not
 * imply the whole file is about to be prepared again.
 *
 * Counted across the whole LINEAGE, not just the currently authorized source.
 * A dealer who reconnects after an authorization was retired must still be
 * told the truth about what has already been prepared — and the number shown
 * here must agree with what the run will actually do, because the adoption
 * function matches on the same lineage.
 */
export async function forecastPreparation(
  userId: string,
  resolved: ResolvedInventorySource
): Promise<PreparationForecast> {
  const db = createServiceClient();
  const found = resolved.watchCount;

  const sourceIds = await findLineageSourceIds(db, userId, resolved.sourceLocator);
  if (sourceIds.length === 0) return { found, alreadyPrepared: 0, toPrepare: found };

  const { data: siRows } = await db
    .from("dealer_accelerator_source_items")
    .select("id,source_item_key")
    .in("source_id", sourceIds)
    .in("source_item_key", resolved.declaredItemIds);

  const si = (siRows ?? []) as Array<{ id: string; source_item_key: string }>;
  if (si.length === 0) return { found, alreadyPrepared: 0, toPrepare: found };

  // "Already prepared" means a draft actually exists for it, not merely
  // that the item was seen before. An item discovered but never
  // materialized is still work to do.
  const { data: biRows } = await db
    .from("dealer_accelerator_batch_items")
    .select("source_item_id,listing_id")
    .in(
      "source_item_id",
      si.map((s) => s.id)
    )
    .not("listing_id", "is", null);

  const withDrafts = new Set(
    ((biRows ?? []) as Array<{ source_item_id: string }>).map((r) => r.source_item_id)
  );

  /* Count distinct source item KEYS, not source item rows. Each authorization
     episode registers its own row for the same external key, so counting rows
     would report a watch prepared twice as two already-prepared watches and
     drive the arithmetic past the number actually found. The key is the
     watch; the rows are episodes of it. */
  const preparedKeys = new Set(
    si.filter((s) => withDrafts.has(s.id)).map((s) => s.source_item_key)
  );
  const alreadyPrepared = preparedKeys.size;

  return { found, alreadyPrepared, toPrepare: Math.max(0, found - alreadyPrepared) };
}
