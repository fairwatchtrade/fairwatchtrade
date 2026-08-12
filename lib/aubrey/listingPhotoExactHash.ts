/* ════════════════════════════════════════════════════════════════════════
   AUBREY CHECK — FLIGHT 1 — lib/aubrey/listingPhotoExactHash.ts

   Listing-photo exact-hash evidence index. SERVER-ONLY: this module hashes
   the exact bytes FairWatchTrade retained in Vercel Blob and records the
   digest through a service-role RPC. Never import it from a client
   component — it touches node:crypto and the service client.

   EVIDENCE, NEVER A VERDICT. An exact recurring SHA-256 says only that
   FairWatchTrade retained identical bytes in more than one listing
   context. Every completed attempt is classification 'passed' — meaning
   "completed with no gate action authorized," not "the bytes are unique."
   Nothing here holds, rejects, accuses, notifies, or changes a listing.

   Byte authority: the digest is derived over the RETAINED NORMALIZED
   object bytes (post client compression). Re-encoded, cropped, resized, or
   differently-compressed copies are non-matches in Flight 1 — by design.
   Client-supplied hashes, URLs, filenames, EXIF, and Vercel metadata are
   never digest inputs.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import { createHash } from "node:crypto";
import { get as blobGetReal } from "@vercel/blob";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PROVIDER_AUBREY_EXACT_HASH,
  TRIGGERED_BY_UPLOAD,
  TRIGGERED_BY_RETRY,
} from "../integrity.ts";

export const AUBREY_EXACT_HASH_SCHEMA = "aubrey.exact_hash/v1";
export const AUBREY_EXACT_HASH_MAX_BYTES = 8 * 1024 * 1024;
export const AUBREY_EXACT_HASH_TIMEOUT_MS = 6_000;

export type ExactHashOutcome =
  | "no_cross_listing_recurrence"
  | "cross_listing_recurrence"
  | "incomplete";

/** Authoritative listing_media row fields the helper requires. Always
    database-derived (post-insert) — never client payload data. */
export type ExactHashMediaRow = {
  id: string;
  listing_id: string;
  storage_path: string | null;
  capture_source: string;
  category: string | null;
  capture_session_id: string | null;
};

/* ── Dependency seams (tests only — server code uses the defaults). The
      persistence seam is the service client itself; these cover the Blob
      read and the clock. Client code cannot reach them: the module itself
      is server-only. ── */
export type ExactHashDeps = {
  blobGet: typeof blobGetReal;
  nowIso: () => string;
  timeoutMs: number;
};

const defaultDeps: ExactHashDeps = {
  blobGet: blobGetReal,
  nowIso: () => new Date().toISOString(),
  timeoutMs: AUBREY_EXACT_HASH_TIMEOUT_MS,
};

/* ── Storage-path authority: only retained `listings/…` Blob pathnames are
      ever fetched. URLs, traversal, backslashes, absolute paths, empty
      paths, and foreign namespaces are refused before any network call. ── */
export function isRetainedListingsPath(storagePath: unknown): boolean {
  if (typeof storagePath !== "string" || storagePath.length === 0) return false;
  if (!storagePath.startsWith("listings/")) return false;
  if (storagePath.includes("://")) return false;
  if (storagePath.includes("..")) return false;
  if (storagePath.includes("\\")) return false;
  return true;
}

type HashSuccess = { ok: true; digest: string };
type HashFailure = {
  ok: false;
  executionStatus: "unavailable" | "invalid_response";
  incompleteReason:
    | "storage_path_missing"
    | "source_bytes_not_retained"
    | "blob_not_found"
    | "blob_fetch_timeout"
    | "blob_too_large"
    | "blob_path_mismatch"
    | "blob_read_failed";
};

/** Stream SHA-256 over exact retained bytes, bounded to 8 MiB. */
export async function sha256OfStream(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<{ ok: true; digest: string } | { ok: false; tooLarge: boolean }> {
  const hash = createHash("sha256");
  const reader = stream.getReader();
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return { ok: false, tooLarge: true };
        }
        hash.update(value);
      }
    }
  } catch {
    return { ok: false, tooLarge: false };
  }
  return { ok: true, digest: hash.digest("hex") };
}

/** Fetch retained bytes for one authoritative `listings/…` pathname and
    derive the exact-byte digest. Never consults client-supplied data. */
export async function hashRetainedBytes(
  storagePath: string,
  deps: ExactHashDeps = defaultDeps
): Promise<HashSuccess | HashFailure> {
  const pathText = typeof storagePath === "string" ? storagePath : "";
  if (!isRetainedListingsPath(pathText)) {
    return {
      ok: false,
      executionStatus: "unavailable",
      incompleteReason:
        pathText.length > 0 ? "source_bytes_not_retained" : "storage_path_missing",
    };
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), deps.timeoutMs);
  try {
    const result = await deps.blobGet(storagePath, {
      access: "public",
      useCache: false,
      abortSignal: abort.signal,
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return {
        ok: false,
        executionStatus: "unavailable",
        incompleteReason: "blob_read_failed",
      };
    }
    if (result.blob.pathname !== storagePath) {
      return {
        ok: false,
        executionStatus: "invalid_response",
        incompleteReason: "blob_path_mismatch",
      };
    }
    if (
      typeof result.blob.size === "number" &&
      result.blob.size > AUBREY_EXACT_HASH_MAX_BYTES
    ) {
      // Refused on the declared size — the stream is never consumed.
      return {
        ok: false,
        executionStatus: "unavailable",
        incompleteReason: "blob_too_large",
      };
    }
    const hashed = await sha256OfStream(result.stream, AUBREY_EXACT_HASH_MAX_BYTES);
    if (!hashed.ok) {
      return {
        ok: false,
        executionStatus: "unavailable",
        incompleteReason: hashed.tooLarge ? "blob_too_large" : "blob_read_failed",
      };
    }
    return { ok: true, digest: hashed.digest };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const isAbort = name === "AbortError" || name === "BlobRequestAbortedError";
    const isNotFound = name === "BlobNotFoundError";
    return {
      ok: false,
      executionStatus: "unavailable",
      incompleteReason: isAbort
        ? "blob_fetch_timeout"
        : isNotFound
          ? "blob_not_found"
          : "blob_read_failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ── Detail builders — exact Flight 1 evidence vocabulary. Machine
      outcomes are observations; no accusatory or exculpatory terms. ── */

type RpcRecurrence = {
  cross_listing_match_count: number;
  matches: { media_id: string; listing_id: string; capture_source: string }[];
  matches_truncated: boolean;
};

function completedDetail(
  digest: string,
  captureSource: string,
  recurrence: RpcRecurrence
): Record<string, unknown> {
  const outcome: ExactHashOutcome =
    recurrence.cross_listing_match_count > 0
      ? "cross_listing_recurrence"
      : "no_cross_listing_recurrence";
  return {
    schema_version: AUBREY_EXACT_HASH_SCHEMA,
    verdict: "observation_only",
    outcome,
    hash_algorithm: "sha256",
    hash_scope: "retained_object_bytes",
    content_sha256: digest,
    capture_source: captureSource,
    cross_listing_match_count: recurrence.cross_listing_match_count,
    matches: recurrence.matches,
    matches_truncated: recurrence.matches_truncated,
    gate_effect: "none_flight_1",
  };
}

function incompleteDetail(
  captureSource: string,
  incompleteReason: string
): Record<string, unknown> {
  return {
    schema_version: AUBREY_EXACT_HASH_SCHEMA,
    verdict: "incomplete",
    outcome: "incomplete",
    hash_algorithm: "sha256",
    hash_scope: "retained_object_bytes",
    capture_source: captureSource,
    incomplete_reason: incompleteReason,
    gate_effect: "none_flight_1",
  };
}

/* ── Attempt spine ─────────────────────────────────────────────────────── */

type AttemptState = {
  hasActiveCompleted: boolean;
  maxAttempt: number;
};

async function readAttemptState(
  service: SupabaseClient,
  mediaId: string
): Promise<AttemptState | null> {
  const { data, error } = await service
    .from("listing_integrity_provider_results")
    .select("execution_status, is_active, attempt_number")
    .eq("media_id", mediaId)
    .eq("provider", PROVIDER_AUBREY_EXACT_HASH);
  if (error) {
    console.error("[aubrey exact-hash] attempt-state read failed:", error.message);
    return null;
  }
  let hasActiveCompleted = false;
  let maxAttempt = 0;
  for (const row of data ?? []) {
    if (row.execution_status === "completed" && row.is_active === true) {
      hasActiveCompleted = true;
    }
    maxAttempt = Math.max(maxAttempt, row.attempt_number ?? 0);
  }
  return { hasActiveCompleted, maxAttempt };
}

async function insertAttempt(
  service: SupabaseClient,
  media: ExactHashMediaRow,
  attemptNumber: number,
  triggeredBy: string,
  core: {
    execution_status: string;
    classification: string | null;
    completed_at: string | null;
    detail: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await service
    .from("listing_integrity_provider_results")
    .insert({
      provider: PROVIDER_AUBREY_EXACT_HASH,
      attempt_number: attemptNumber,
      triggered_by: triggeredBy,
      capture_session_id: media.capture_session_id,
      storage_path: media.storage_path,
      category: media.category ?? null,
      media_id: media.id,
      execution_status: core.execution_status,
      classification: core.classification,
      is_active: true,
      completed_at: core.completed_at,
      reason: null,
      detail: core.detail,
    });
  if (error && (error as { code?: string }).code !== "23505") {
    // 23505 is a harmless concurrent winner, consistent with existing
    // Aubrey attempt behavior. Anything else is logged and left retryable.
    console.error("[aubrey exact-hash] attempt insert failed:", error.message);
  }
}

/* ── The one route-facing entry point ──────────────────────────────────────

   Called from completePublishOrchestration() AFTER authoritative
   listing_media rows exist and BEFORE the evidence-promotion read. One
   photo's failure never prevents sibling attempts or publication; nothing
   here ever throws through the publish path, and nothing here reads or
   writes listing status. Not conditional on AUBREY_ENFORCEMENT — this is
   inert evidence infrastructure, not enforcement — and it never causes the
   image_authenticity provider to run. ── */
export async function ensureExactHashAttempts(
  params: {
    service: SupabaseClient | null;
    media: ExactHashMediaRow[];
    triggeredBy: typeof TRIGGERED_BY_UPLOAD | typeof TRIGGERED_BY_RETRY;
  },
  deps: ExactHashDeps = defaultDeps
): Promise<void> {
  const { service, media, triggeredBy } = params;
  if (!service) {
    // No fabricated row of any kind — the attempt remains eligible for a
    // later idempotent retry.
    console.error("[aubrey exact-hash] exact_hash_service_unavailable");
    return;
  }
  if (media.length === 0) return;

  await Promise.allSettled(
    media.map(async (m) => {
      try {
        const state = await readAttemptState(service, m.id);
        if (state === null) return; // read failed — retry remains eligible
        if (state.hasActiveCompleted) return; // idempotent skip: no fetch, hash, RPC, or insert
        const attemptNumber = state.maxAttempt + 1;

        // Dealer-import rows are provenance-distinct: their storage_path may
        // be an arbitrary external URL outside retained-byte authority, and
        // this flight adds no dealer caller. Never fetched, never hashed.
        if (m.capture_source === "dealer_import") {
          await insertAttempt(service, m, attemptNumber, triggeredBy, {
            execution_status: "unavailable",
            classification: null,
            completed_at: null,
            detail: incompleteDetail(m.capture_source, "source_bytes_not_retained"),
          });
          return;
        }

        const hashed = await hashRetainedBytes(m.storage_path ?? "", deps);
        if (!hashed.ok) {
          await insertAttempt(service, m, attemptNumber, triggeredBy, {
            execution_status: hashed.executionStatus,
            classification: null,
            completed_at: null,
            detail: incompleteDetail(m.capture_source, hashed.incompleteReason),
          });
          return;
        }

        const { data: rpcData, error: rpcError } = await service.rpc(
          "record_listing_media_content_sha256",
          { p_media_id: m.id, p_content_sha256: hashed.digest }
        );
        const recurrence = parseRpcRecurrence(rpcData);
        if (rpcError || recurrence === null) {
          if (rpcError) {
            console.error(
              "[aubrey exact-hash] hash record RPC failed:",
              rpcError.message
            );
          }
          await insertAttempt(service, m, attemptNumber, triggeredBy, {
            execution_status: "invalid_response",
            classification: null,
            completed_at: null,
            detail: incompleteDetail(m.capture_source, "hash_record_failed"),
          });
          return;
        }

        await insertAttempt(service, m, attemptNumber, triggeredBy, {
          execution_status: "completed",
          classification: "passed",
          completed_at: deps.nowIso(),
          detail: completedDetail(hashed.digest, m.capture_source, recurrence),
        });
      } catch (err) {
        // Belt-and-braces: an unexpected error must never surface into the
        // publish path or block a sibling photo.
        console.error("[aubrey exact-hash] attempt failed unexpectedly:", err);
      }
    })
  );
}

function parseRpcRecurrence(rpcData: unknown): RpcRecurrence | null {
  if (typeof rpcData !== "object" || rpcData === null) return null;
  const r = rpcData as Record<string, unknown>;
  if (r.schema_version !== "aubrey.exact_hash.rpc/v1") return null;
  const count = r.cross_listing_match_count;
  if (typeof count !== "number" || count < 0) return null;
  const matches = Array.isArray(r.matches) ? r.matches : null;
  if (matches === null) return null;
  const parsed: RpcRecurrence["matches"] = [];
  for (const item of matches) {
    if (typeof item !== "object" || item === null) return null;
    const e = item as Record<string, unknown>;
    if (
      typeof e.media_id !== "string" ||
      typeof e.listing_id !== "string" ||
      typeof e.capture_source !== "string"
    ) {
      return null;
    }
    parsed.push({
      media_id: e.media_id,
      listing_id: e.listing_id,
      capture_source: e.capture_source,
    });
  }
  return {
    cross_listing_match_count: count,
    matches: parsed,
    matches_truncated: r.matches_truncated === true,
  };
}
