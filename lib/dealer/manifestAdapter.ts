import "server-only";

/* ════════════════════════════════════════════════════════════════════════
   FLIGHT 3 — STATIC-MANIFEST ADAPTER SLICE SERVICE
   lib/dealer/manifestAdapter.ts

   The worker core (contract v7 §12): callable later by cron, queue
   consumer, or CLI without contract change. The founder route is only
   ignition. Founder-triggered bounded slices — no daemon, no cron
   infrastructure; the spine remembers everything and resumes from any
   interruption.

   Objective (§1): one governed static manifest → durable evidence,
   exclusively through the runtime-proven Flight 1/2 rails, replayable to
   convergence, truthfully cancellable, and nothing else.

   Write-order law (§5.3, revised — the governing correction):
     fetch exact bytes → hash → archive content-addressed (create-only)
     → VERIFY archived object (read back, re-hash)
     → record the immutable manifest capture   ← durable receipt HERE
     → run total preflight against the FROZEN archived bytes
     → record the immutable preflight result
   Every recovery path reads only facts that existed before its crash
   window.
   ════════════════════════════════════════════════════════════════════════ */

import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import {
  isAllowedManifestContentType,
  preflightManifest,
  type PreflightItem,
} from "./manifestPreflight";
import { pinnedFetch, PinnedFetchError, isRetryableFailure } from "./pinnedFetch";
import type { GovernedOrigin } from "./originGovernance";

export const ADAPTER_VERSION = "flight3-static-manifest-v1";
export const PREFLIGHT_VERSION = ADAPTER_VERSION;
export const EVIDENCE_BUCKET = "dealer-evidence";

/** §12: slices bounded by BOTH a maximum work count and a deadline safely
    below the platform timeout. */
export const SLICE_MAX_ITEMS = 25;
export const SLICE_DEADLINE_MS = 45_000;
export const LEASE_SECONDS = 120;

/** §13 retry policy — the CALLER's, deliberately. The spine's
    record_item_retry holds no ceiling and no backoff of its own: it is a
    mechanism that records whatever the worker decides, and refuses only
    incoherent combinations (an exhausted retry that also schedules a future
    attempt, a next_attempt_at already in the past, a lease the caller does not
    hold). Naming the policy here keeps it visible and changeable in one place.

    Three attempts total, then the item blocks as technical_retry_exhausted.
    Backoff is linear on the attempt number and short on purpose: slices are
    founder-triggered rather than daemon-driven, so a due time measured in
    minutes means the next ordinary invocation picks the work up. */
export const RETRY_MAX_ATTEMPTS = 3;
export const RETRY_BACKOFF_BASE_MS = 60_000;

const sha256hex = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** §5.1 — the deterministic idempotency digest over the exact typed tuple
    (declared_manifest_version, adapter_version). Length-prefixing is by
    UTF-8 byte length and prevents delimiter ambiguity; a value can never
    impersonate the boundary. */
export function idempotencyKeyFor(declaredManifestVersion: string, adapterVersion: string): string {
  const enc = new TextEncoder();
  const lp = (s: string) => {
    const b = enc.encode(s);
    return `${b.byteLength}:${s}`;
  };
  return sha256hex(enc.encode(lp(declaredManifestVersion) + lp(adapterVersion)));
}

export interface SliceInvocation {
  sourceId: string;
  declaredManifestVersion: string;
  manifestUrl: string;
  batchLimit: number;
  actorUserId: string; // the founder
}

export interface SliceReport {
  batchId: string;
  batchStatus: string;
  settled: boolean; // §2: a terminal batch returned as-is, zero new writes
  phase: "initialization" | "items" | "terminal";
  itemsProcessed: number;
  photographsRetrieved: number;
  photographsFailed: number;
  photographsTerminal: number;
  detail: string;
}

type Db = ReturnType<typeof createServiceClient>;

async function rpc<T>(db: Db, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/* ── §14 Storage determinism: create-only + loser-verifies-winner ──────── */
async function archiveCreateOnly(db: Db, path: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const { error } = await db.storage.from(EVIDENCE_BUCKET).upload(path, bytes, {
    contentType,
    upsert: false, // create-only semantics: no overwrite is POSSIBLE
  });
  if (error) {
    const msg = (error as { message?: string }).message ?? "";
    if (!/already exists|duplicate|409/i.test(msg)) {
      throw new Error(`storage_archive_failed: ${msg}`);
    }
    // Lost the create race (or the object predates us): read the WINNER's
    // object and verify the winner's bytes against our own hash before
    // treating the path as valid — convergence by verification, never by
    // assumption.
  }
  await verifyArchived(db, path, sha256hex(bytes));
}

async function verifyArchived(db: Db, path: string, expectedHash: string): Promise<void> {
  const { data, error } = await db.storage.from(EVIDENCE_BUCKET).download(path);
  if (error || !data) throw new Error("storage_verify_read_failed");
  const got = sha256hex(new Uint8Array(await data.arrayBuffer()));
  if (got !== expectedHash) throw new Error("storage_verify_hash_mismatch");
}

/* ── image magic-byte validation (§15, mandatory) ──────────────────────── */
function hasImageMagicBytes(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true; // JPEG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true; // PNG
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return true; // WebP
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return true; // GIF
  return false;
}

async function loadApprovedOrigins(db: Db, sourceId: string): Promise<GovernedOrigin[]> {
  const { data, error } = await db
    .from("dealer_accelerator_source_origins")
    .select("purpose,hostname,port,path_prefix,state")
    .eq("source_id", sourceId)
    .eq("state", "approved");
  if (error) throw new Error(`origins: ${error.message}`);
  return (data ?? []).map((r) => ({
    purpose: r.purpose as GovernedOrigin["purpose"],
    hostname: r.hostname as string,
    port: r.port as number,
    pathPrefix: r.path_prefix as string,
    state: r.state as GovernedOrigin["state"],
  }));
}

interface BatchRow {
  id: string;
  status: string;
  source_id: string;
  adapter_version: string;
  source_snapshot_key: string;
  fatal_error_code: string | null;
}

async function freshBatch(db: Db, batchId: string): Promise<BatchRow> {
  const { data, error } = await db
    .from("dealer_accelerator_batches")
    .select("id,status,source_id,adapter_version,source_snapshot_key,fatal_error_code")
    .eq("id", batchId)
    .single();
  if (error || !data) throw new Error("batch_read_failed");
  return data as BatchRow;
}

const TERMINAL = ["completed", "completed_with_exceptions", "failed", "cancelled"];

/**
 * Run one bounded slice of the manifest adapter. Safe to invoke repeatedly
 * and concurrently: batch identity is structural (§5.1), initialization is
 * serialized by the batch initialization lease (§5.2), items by item
 * leases, and every terminal outcome replays as a settled no-op (§2).
 */
export async function runManifestSlice(inv: SliceInvocation): Promise<SliceReport> {
  const db = createServiceClient();
  const deadline = Date.now() + SLICE_DEADLINE_MS;
  const leaseToken = crypto.randomUUID();
  const report = {
    itemsProcessed: 0,
    photographsRetrieved: 0,
    photographsFailed: 0,
    photographsTerminal: 0,
  };

  // ── §5.1 structural batch identity, atomic create-or-return ──
  const batch = await rpc<BatchRow>(db, "dealer_accelerator_create_or_get_batch", {
    p_source_id: inv.sourceId,
    p_adapter_version: ADAPTER_VERSION,
    p_source_snapshot_key: inv.declaredManifestVersion, // §5.1 binding law
    p_idempotency_key: idempotencyKeyFor(inv.declaredManifestVersion, ADAPTER_VERSION),
    p_batch_limit: inv.batchLimit,
    p_actor_kind: "founder",
    p_actor_user_id: inv.actorUserId,
  });

  // ── §2 terminal settlement: settled result, zero new writes ──
  if (TERMINAL.includes(batch.status)) {
    return {
      batchId: batch.id,
      batchStatus: batch.status,
      settled: true,
      phase: "terminal",
      ...report,
      detail:
        batch.status === "failed"
          ? `settled failure: ${batch.fatal_error_code}`
          : `settled ${batch.status}; replay writes nothing`,
    };
  }

  if (batch.status === "queued") {
    await rpc(db, "dealer_accelerator_transition_batch", {
      p_batch_id: batch.id,
      p_next_status: "running",
      p_fatal_error_code: null,
      p_actor_kind: "founder",
      p_actor_user_id: inv.actorUserId,
      p_reason_code: null,
    });
  }

  const origins = await loadApprovedOrigins(db, inv.sourceId);

  // ── initialization: capture + preflight, lease-serialized (§5.2/§5.3) ──
  const { data: existingCapture } = await db
    .from("dealer_accelerator_manifest_captures")
    .select("id,content_hash,storage_path,byte_length")
    .eq("batch_id", batch.id)
    .maybeSingle();

  let captureId: string;
  let manifestBytes: Uint8Array;

  if (!existingCapture) {
    await rpc(db, "dealer_accelerator_claim_batch_initialization_lease", {
      p_batch_id: batch.id,
      p_lease_token: leaseToken,
      p_lease_seconds: LEASE_SECONDS,
      p_actor_kind: "worker",
      p_actor_user_id: null,
    });

    // checkpoint: cancellation is consulted BEFORE the remote fetch
    if ((await freshBatch(db, batch.id)).status === "cancel_requested") {
      await surrenderInit(db, batch.id, leaseToken);
      return cancelPending(db, batch.id, inv.actorUserId, report, "initialization");
    }

    // fetch → hash → archive (create-only) → verify — one atomic unit that
    // completes or fails on its own terms
    let fetched;
    try {
      fetched = await pinnedFetch(inv.manifestUrl, origins, "manifest");
    } catch (e) {
      const code = e instanceof PinnedFetchError ? e.code : "connect_failed";
      await surrenderInit(db, batch.id, leaseToken);
      await failBatch(db, batch.id, inv.actorUserId, `manifest_fetch_${code}`);
      return terminalReport(db, batch.id, report, `manifest fetch failed: ${code}`);
    }
    if (!isAllowedManifestContentType(fetched.contentType)) {
      await surrenderInit(db, batch.id, leaseToken);
      await failBatch(db, batch.id, inv.actorUserId, "manifest_content_type_violation");
      return terminalReport(db, batch.id, report, "content-type violation");
    }

    const hash = sha256hex(fetched.body);
    const storagePath = `manifests/sha256/${hash}`;
    const fetchedAt = new Date().toISOString();
    await archiveCreateOnly(db, storagePath, fetched.body, "application/x-ndjson");
    const verifiedAt = new Date().toISOString();

    // checkpoint AFTER the fetch/archive/verify unit, BEFORE capture
    // insertion: a cancelled batch that never recorded intake has none —
    // the orphaned object is recoverable litter (§5.3).
    if ((await freshBatch(db, batch.id)).status === "cancel_requested") {
      await surrenderInit(db, batch.id, leaseToken);
      return cancelPending(db, batch.id, inv.actorUserId, report, "initialization");
    }

    const { data: authEvent } = await db
      .from("dealer_accelerator_lifecycle_events")
      .select("id")
      .eq("source_id", inv.sourceId)
      .in("event_type", ["source_authorized", "source_reauthorized"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }) // deterministic order: created_at, id
      .limit(1)
      .single();
    if (!authEvent) throw new Error("source_authorization_event_missing");

    const cap = await rpc<{ id: string }>(db, "dealer_accelerator_record_manifest_capture", {
      p_batch_id: batch.id,
      p_requested_url: inv.manifestUrl,
      p_resolved_url: fetched.finalUrl,
      p_content_hash: hash,
      p_storage_path: storagePath,
      p_byte_length: fetched.body.byteLength,
      p_response_content_type: fetched.contentType,
      p_fetched_at: fetchedAt,
      p_verified_at: verifiedAt,
      p_authorization_event_id: authEvent.id,
      p_response_etag: fetched.etag,
      p_response_last_modified: fetched.lastModified,
      p_actor_kind: "worker",
      p_actor_user_id: null,
    });
    captureId = cap.id;
    manifestBytes = fetched.body;
  } else {
    // Recovery path: the capture fact exists — read the FROZEN archived
    // bytes named by the capture row. NEVER refetch remote (§5.3).
    captureId = existingCapture.id;
    const { data: blob, error } = await db.storage
      .from(EVIDENCE_BUCKET)
      .download(existingCapture.storage_path);
    if (error || !blob) throw new Error("frozen_capture_unreadable");
    manifestBytes = new Uint8Array(await blob.arrayBuffer());
    if (sha256hex(manifestBytes) !== existingCapture.content_hash) {
      throw new Error("frozen_capture_hash_mismatch");
    }
  }

  // ── preflight result (idempotent; one per capture) ──
  const { data: existingResult } = await db
    .from("dealer_accelerator_manifest_preflight_results")
    .select("id,disposition,rejection_reason")
    .eq("manifest_capture_id", captureId)
    .maybeSingle();

  let preflight = existingResult
    ? null // already settled — recompute only the items when accepted
    : preflightManifest(manifestBytes);

  if (!existingResult && preflight) {
    // checkpoint: cancellation after capture, before preflight result —
    // a cancelled batch bearing a capture with no preflight result is a
    // LEGAL terminal shape (§5.3).
    if ((await freshBatch(db, batch.id)).status === "cancel_requested") {
      await surrenderInit(db, batch.id, leaseToken);
      return cancelPending(db, batch.id, inv.actorUserId, report, "initialization");
    }
    await rpc(db, "dealer_accelerator_record_manifest_preflight_result", {
      p_manifest_capture_id: captureId,
      p_disposition: preflight.disposition,
      p_rejection_reason: preflight.disposition === "rejected" ? preflight.reason : null,
      p_rejection_line_number: preflight.disposition === "rejected" ? preflight.lineNumber : null,
      p_preflight_version: PREFLIGHT_VERSION,
      p_completed_at: new Date().toISOString(),
      p_actor_kind: "worker",
      p_actor_user_id: null,
    });
  }

  const disposition = existingResult?.disposition ?? preflight?.disposition;
  if (disposition === "rejected") {
    const reason = existingResult?.rejection_reason
      ?? (preflight && preflight.disposition === "rejected" ? preflight.reason : "rejected");
    await surrenderInit(db, batch.id, leaseToken).catch(() => {});
    await failBatch(db, batch.id, inv.actorUserId, `manifest_preflight_${reason}`);
    return terminalReport(db, batch.id, report, `preflight rejected: ${reason}`);
  }

  // initialization settled — release the initialization lease before item
  // work; item leases own everything from here.
  await surrenderInit(db, batch.id, leaseToken).catch(() => {});

  const items =
    preflight && preflight.disposition === "accepted"
      ? preflight.items
      : (() => {
          const p = preflightManifest(manifestBytes);
          if (p.disposition !== "accepted") throw new Error("settled_preflight_diverged");
          return p.items;
        })();

  // ── item slices (§13) ──
  for (const item of items) {
    if (report.itemsProcessed >= SLICE_MAX_ITEMS || Date.now() > deadline) break;

    // checkpoint before claiming any lease
    const b = await freshBatch(db, batch.id);
    if (b.status === "cancel_requested") {
      return cancelPending(db, batch.id, inv.actorUserId, report, "items");
    }
    if (b.status !== "running") break;

    const processed = await processOneItem(db, batch.id, captureId, item, leaseToken, report, inv);
    if (processed) report.itemsProcessed++;
  }

  // ── batch-completion predicate (§13) ──
  const done = await tryCompleteBatch(db, batch.id, inv.actorUserId);
  const final = await freshBatch(db, batch.id);
  return {
    batchId: batch.id,
    batchStatus: final.status,
    settled: TERMINAL.includes(final.status),
    phase: done ? "terminal" : "items",
    ...report,
    detail: done ? `batch closed as ${final.status}` : "slice bound reached; invoke again to continue",
  };
}

/* ── helpers ───────────────────────────────────────────────────────────── */

async function surrenderInit(db: Db, batchId: string, token: string): Promise<void> {
  await rpc(db, "dealer_accelerator_surrender_batch_initialization_lease", {
    p_batch_id: batchId,
    p_lease_token: token,
    p_actor_kind: "worker",
    p_actor_user_id: null,
  }).catch(() => {}); // an expired/absent lease is fine: nothing to surrender
}

async function failBatch(db: Db, batchId: string, actorUserId: string, code: string): Promise<void> {
  await rpc(db, "dealer_accelerator_transition_batch", {
    p_batch_id: batchId,
    p_next_status: "failed",
    p_fatal_error_code: code.slice(0, 120),
    p_actor_kind: "worker",
    p_actor_user_id: null,
    p_reason_code: null,
  });
}

async function cancelPending(
  db: Db,
  batchId: string,
  actorUserId: string,
  counts: Omit<SliceReport, "batchId" | "batchStatus" | "settled" | "phase" | "detail">,
  phase: SliceReport["phase"]
): Promise<SliceReport> {
  // §5.3 terminalization: the database proves quiescence; if a live lease
  // remains it raises cancellation_pending_active_leases and a later slice
  // (or lease expiry) finishes the job.
  try {
    await rpc(db, "dealer_accelerator_transition_batch", {
      p_batch_id: batchId,
      p_next_status: "cancelled",
      p_fatal_error_code: null,
      p_actor_kind: "worker",
      p_actor_user_id: null,
      p_reason_code: "cancellation_requested",
    });
  } catch {
    /* cancellation_pending_active_leases: truthful; quiescence not yet provable */
  }
  const final = await freshBatch(db, batchId);
  return {
    batchId,
    batchStatus: final.status,
    settled: final.status === "cancelled",
    phase,
    ...counts,
    detail: final.status === "cancelled" ? "cancelled (quiescence proven)" : "cancellation pending",
  };
}

async function terminalReport(
  db: Db,
  batchId: string,
  counts: Omit<SliceReport, "batchId" | "batchStatus" | "settled" | "phase" | "detail">,
  detail: string
): Promise<SliceReport> {
  const final = await freshBatch(db, batchId);
  return { batchId, batchStatus: final.status, settled: true, phase: "terminal", ...counts, detail };
}

/** One claimed item slice per §13: register, observe, line-record, then
    attempt each eligible photograph AT MOST ONCE in ascending
    sequence_index order; one shared record_item_retry if retryable work
    remains. Returns false when the item was already settled. */
async function processOneItem(
  db: Db,
  batchId: string,
  captureId: string,
  item: PreflightItem,
  leaseToken: string,
  report: { photographsRetrieved: number; photographsFailed: number; photographsTerminal: number },
  inv: SliceInvocation
): Promise<boolean> {
  const bi = await rpc<{ id: string; status: string }>(db, "dealer_accelerator_register_or_get_item", {
    p_batch_id: batchId,
    p_source_item_key: item.declaredItemId, // the exact decoded string, verbatim
    p_actor_kind: "worker",
    p_actor_user_id: null,
  });
  if (bi.status === "blocked") return false;

  // The claim returns the item row, so attempt_count here is the authoritative
  // count BEFORE this cycle — the number the retry decision below is made on.
  let claimed: { attempt_count: number };
  try {
    claimed = await rpc<{ attempt_count: number }>(db, "dealer_accelerator_claim_item_lease", {
      p_item_id: bi.id,
      p_lease_token: leaseToken,
      p_lease_seconds: LEASE_SECONDS,
      p_actor_kind: "worker",
      p_actor_user_id: null,
    });
  } catch {
    return false; // leased elsewhere or retry not due — another slice's work
  }

  try {
    // observation + payload + declarations (idempotent Flight 2 rail)
    const obs = await rpc<{ observation: { id: string } }>(
      db,
      "dealer_accelerator_record_observation_with_evidence",
      {
        p_batch_item_id: bi.id,
        p_observed_at: new Date().toISOString(),
        p_adapter_version: ADAPTER_VERSION,
        p_source_version: inv.declaredManifestVersion,
        p_snapshot_identity: `${inv.declaredManifestVersion}:${item.declaredItemId}`,
        p_continuity_state: "unassessed",
        p_payload_bytes: `\\x${Buffer.from(item.payloadBytes).toString("hex")}`,
        p_photographs: item.photographs.map((p) => ({
          url: p.sourceUrl,
          pathname: p.sourcePathname,
          category: p.declaredCategory,
        })),
        p_actor_kind: "worker",
        p_actor_user_id: null,
      }
    );
    const observationId =
      (obs as { observation?: { id: string } }).observation?.id ??
      (obs as { observation_id?: string }).observation_id;
    if (!observationId) throw new Error("observation_id_missing_from_rpc_result");

    // §9 line provenance — geometry proven in-function
    await rpc(db, "dealer_accelerator_record_manifest_line", {
      p_manifest_capture_id: captureId,
      p_line_number: item.lineNumber,
      p_byte_start: item.byteStart,
      p_byte_end: item.byteEnd,
      p_framing: item.framing,
      p_declared_item_id: item.declaredItemId,
      p_observation_id: observationId,
      p_actor_kind: "worker",
      p_actor_user_id: null,
    });

    // §13 photographs: each eligible one AT MOST ONCE, ascending sequence
    const { data: photos } = await db
      .from("dealer_accelerator_photographs")
      .select("id,sequence_index,source_url,retrieval_state")
      .eq("observation_id", observationId)
      .in("retrieval_state", ["declared", "retrieval_failed"])
      .order("sequence_index", { ascending: true });

    const origins = await loadApprovedOrigins(db, inv.sourceId);
    let retryableRemains = false;

    for (const ph of photos ?? []) {
      // checkpoint before each photograph
      if ((await freshBatch(db, batchId)).status === "cancel_requested") break;
      try {
        const res = await pinnedFetch(ph.source_url, origins, "photographs");
        if (!hasImageMagicBytes(res.body)) {
          throw new PinnedFetchError("http_error", 415); // terminal: not an image
        }
        const hash = sha256hex(res.body);
        const path = `photographs/sha256/${hash}`;
        await archiveCreateOnly(db, path, res.body, res.contentType || "application/octet-stream");
        await rpc(db, "dealer_accelerator_record_photograph_retrieval", {
          p_photograph_id: ph.id,
          p_retrieved_at: new Date().toISOString(),
          p_content_hash: hash,
          p_storage_path: path,
          p_actor_kind: "worker",
          p_actor_user_id: null,
        });
        report.photographsRetrieved++;
      } catch (e) {
        const retryable = e instanceof PinnedFetchError && isRetryableFailure(e);
        const code = e instanceof PinnedFetchError
          ? `${e.code}${e.statusCode ? `_${e.statusCode}` : ""}`
          : "archive_or_record_failed";
        if (retryable) {
          await rpc(db, "dealer_accelerator_record_photograph_retrieval_failure", {
            p_photograph_id: ph.id,
            p_reason_code: code,
            p_actor_kind: "worker",
            p_actor_user_id: null,
          });
          report.photographsFailed++;
          retryableRemains = true;
        } else {
          await rpc(db, "dealer_accelerator_record_photograph_retrieval_terminal", {
            p_photograph_id: ph.id,
            p_reason_code: code,
            p_actor_kind: "worker",
            p_actor_user_id: null,
          });
          report.photographsTerminal++;
        }
      }
    }

    if (retryableRemains) {
      // §13: exactly ONE record_item_retry per slice — attempt_count increments
      // once per item processing CYCLE, never once per photograph.
      //
      // The database function takes SEVEN arguments and does not decide
      // exhaustion for us: the caller states whether the ceiling is reached
      // (p_exhausted) and, when it is not, supplies a FUTURE p_next_attempt_at
      // which claim_item_lease then honours by refusing to re-claim the item
      // before it falls due. It also verifies the caller still owns the lease.
      //
      // This call previously passed four arguments and wrapped itself in a
      // try/catch that treated ANY failure as "ceiling reached". Four arguments
      // match no overload, so the very first retryable photograph failure threw
      // on arity and was mistaken for exhaustion — the item was blocked and
      // every outstanding photograph terminalised before a single retry was
      // ever attempted. The catch is gone with it: a genuine failure here must
      // surface, not be silently reinterpreted as a policy outcome.
      const attemptsAfterThis = claimed.attempt_count + 1;
      const exhausted = attemptsAfterThis >= RETRY_MAX_ATTEMPTS;

      await rpc(db, "dealer_accelerator_record_item_retry", {
        p_item_id: bi.id,
        p_lease_token: leaseToken,
        p_reason_code: "photograph_retryable_failures",
        // Exhausted retries must schedule nothing; the function rejects a
        // next_attempt_at paired with p_exhausted.
        p_next_attempt_at: exhausted
          ? null
          : new Date(Date.now() + RETRY_BACKOFF_BASE_MS * attemptsAfterThis).toISOString(),
        p_exhausted: exhausted,
        p_actor_kind: "worker",
        p_actor_user_id: null,
      });

      if (exhausted) {
        // The item is now blocked (technical_retry_exhausted). Mark EVERY
        // still-pending photograph retrieval_terminal so nothing left behind
        // claims that future work is coming (§13).
        const { data: pending } = await db
          .from("dealer_accelerator_photographs")
          .select("id")
          .eq("observation_id", observationId)
          .in("retrieval_state", ["declared", "retrieval_failed"]);
        for (const p of pending ?? []) {
          await rpc(db, "dealer_accelerator_record_photograph_retrieval_terminal", {
            p_photograph_id: p.id,
            p_reason_code: "retry_ceiling_exhausted",
            p_actor_kind: "worker",
            p_actor_user_id: null,
          }).catch(() => {});
          report.photographsTerminal++;
        }
      }
    }
    return true;
  } finally {
    // cooperative surrender: never abandon a lease to expiry (§10)
    await rpc(db, "dealer_accelerator_surrender_item_lease", {
      p_batch_item_id: bi.id,
      p_lease_token: leaseToken,
      p_actor_kind: "worker",
      p_actor_user_id: null,
    }).catch(() => {});
  }
}

/** §13 batch-completion predicate: every non-blocked item settled ∧ no
    active lease ∧ no retry-due photograph. Zero retrieval_terminal AND
    zero blocked → completed; otherwise completed_with_exceptions. */
async function tryCompleteBatch(db: Db, batchId: string, actorUserId: string): Promise<boolean> {
  const b = await freshBatch(db, batchId);
  if (b.status !== "running") return TERMINAL.includes(b.status);

  const { data: cap } = await db
    .from("dealer_accelerator_manifest_captures")
    .select("id")
    .eq("batch_id", batchId)
    .maybeSingle();
  if (!cap) return false;

  const { count: expectedLines } = await db
    .from("dealer_accelerator_manifest_lines")
    .select("id", { count: "exact", head: true })
    .eq("manifest_capture_id", cap.id);

  const { data: items } = await db
    .from("dealer_accelerator_batch_items")
    .select("id,status,lease_token,lease_expires_at")
    .eq("batch_id", batchId);
  if (!items || items.length === 0 || (expectedLines ?? 0) < items.length) return false;

  const now = Date.now();
  const liveLease = items.some(
    (i) => i.lease_token !== null && new Date(i.lease_expires_at as string).getTime() > now
  );
  if (liveLease) return false;
  const blocked = items.filter((i) => i.status === "blocked").length;

  const nonBlockedIds = items.filter((i) => i.status !== "blocked").map((i) => i.id);
  const { data: openPhotos } = await db
    .from("dealer_accelerator_photographs")
    .select("id,retrieval_state,batch_item_id")
    .in("batch_item_id", nonBlockedIds.length > 0 ? nonBlockedIds : ["00000000-0000-0000-0000-000000000000"])
    .in("retrieval_state", ["declared", "retrieval_failed"]);
  if ((openPhotos ?? []).length > 0) return false; // retry-due work remains

  const { count: terminalPhotos } = await db
    .from("dealer_accelerator_photographs")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .eq("retrieval_state", "retrieval_terminal");

  const clean = blocked === 0 && (terminalPhotos ?? 0) === 0;
  await rpc(db, "dealer_accelerator_transition_batch", {
    p_batch_id: batchId,
    p_next_status: clean ? "completed" : "completed_with_exceptions",
    p_fatal_error_code: null,
    p_actor_kind: "worker",
    p_actor_user_id: null,
    p_reason_code: null,
  });
  return true;
}
