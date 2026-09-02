import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

/* ════════════════════════════════════════════════════════════════════════
   AUCTION OPERATIONS — RUN STORE — lib/auction-operations/runStore.ts

   Server-only helpers over auction_operations_run: the durable record of
   what was planned, what hash the founder approved, and how far an apply
   got. Callers hand in the trusted service client AFTER their own founder
   gate has passed — nothing here authorizes anything, exactly like
   lib/marketplaceControlData.

   THE ONE RULE THAT MATTERS: Apply never trusts the browser's plan. It
   loads the server-held plan bytes, recomputes their SHA-256, and refuses
   on any mismatch (verifyStoredPlan below). The founder's approval is of a
   hash they reviewed, bound to bytes this table holds.
   ════════════════════════════════════════════════════════════════════════ */

export type RunState = "uploading" | "planning" | "planned" | "applying" | "applied" | "failed";

/* ── ONE LIVE RUN PER EXACT PACKET REVISION ─────────────────────────────
   These three are the mid-flight states. The database enforces at most one
   run in any of them per packet_revision_id through the partial unique
   index below (migration 20260902220000). Outcomes — planned, applied,
   failed — never block a fresh START, and a planned run may coexist with a
   newer planning run for the same revision. Legacy NULL-bound rows are
   outside the guarantee by PostgreSQL NULL semantics, on purpose. */
export const LIVE_RUN_STATES = ["uploading", "planning", "applying"] as const;
export const ONE_LIVE_RUN_INDEX = "auction_operations_run_one_unterminated_per_revision";

/** True when a write was refused by the one-live-run index. PostgREST
    surfaces the index name inside the unique-violation message; nothing
    else about the message is relied on. */
export function isOneLiveRunConflict(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return m.includes(ONE_LIVE_RUN_INDEX);
}

export type AuctionRun = {
  id: string;
  adapter_id: string;
  packet_id: string;
  state: RunState;
  input_paths: Record<string, string>;
  source_hashes: Record<string, string>;
  /** The EXACT serialized plan the recorded hash covers. Text, not jsonb -
      jsonb re-orders keys and the hash binding would die in storage (found
      by the first production proof). */
  plan_bytes: string | null;
  plan_sha256: string | null;
  summary: Record<string, unknown>;
  contradictions: string[];
  progress: Record<string, unknown>;
  last_error_code: string | null;
  last_error_detail: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  /* THE BINDING. Which exact approved packet revision produced this run —
     recorded at creation, so planning cannot drift onto a revision that was
     activated afterwards. Null on runs created before the catalog existed. */
  packet_revision_id: string | null;
  packet_revision: number | null;
  descriptor_sha256: string | null;
  adapter_schema_version: string | null;
  applied_at: string | null;
};

const COLUMNS =
  "id, adapter_id, packet_id, state, input_paths, source_hashes, plan_bytes, plan_sha256, summary, contradictions, progress, last_error_code, last_error_detail, created_by, created_at, updated_at, approved_at, applied_at, packet_revision_id, packet_revision, descriptor_sha256, adapter_schema_version";

export const sha256Hex = (buf: Buffer | string): string =>
  crypto.createHash("sha256").update(buf).digest("hex");

export async function createRun(
  db: SupabaseClient,
  params: {
    adapter: string;
    packetId: string;
    createdBy: string;
    state: RunState;
    /* REQUIRED, deliberately. These were optional for exactly one version,
       and the uploads route simply did not pass them — which is how a run
       came to exist naming no revision of its own, leaving planning to fall
       back to whatever happened to be active later.

       Optional was the defect; the omission was only its symptom. A governed
       run cannot be created without naming the revision that authorised it,
       and making that a type error is the only form of this rule that
       survives the next new caller. Historical rows with null binding
       already exist and stay readable; what changed is that no new one can
       be minted. */
    packetRevisionId: string;
    packetRevision: number;
    descriptorSha256: string;
    adapterSchemaVersion: string;
  }
): Promise<AuctionRun> {
  const { data, error } = await db
    .from("auction_operations_run")
    .insert({
      adapter_id: params.adapter,
      packet_id: params.packetId,
      state: params.state,
      created_by: params.createdBy,
      packet_revision_id: params.packetRevisionId,
      packet_revision: params.packetRevision,
      descriptor_sha256: params.descriptorSha256,
      adapter_schema_version: params.adapterSchemaVersion,
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`run create failed: ${error.message}`);
  return data as AuctionRun;
}

/** The live run for an exact revision, if one exists. Advisory before an
    insert (it avoids an expected exception), authoritative after a
    conflict (it is how the loser recovers the winner). */
export async function findLiveRunForRevision(
  db: SupabaseClient,
  packetRevisionId: string
): Promise<AuctionRun | null> {
  const { data, error } = await db
    .from("auction_operations_run")
    .select(COLUMNS)
    .eq("packet_revision_id", packetRevisionId)
    .in("state", [...LIVE_RUN_STATES])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`live run read failed: ${error.message}`);
  const rows = (data ?? []) as AuctionRun[];
  return rows[0] ?? null;
}

export type BirthOutcome = { run: AuctionRun; reusedExisting: boolean };

/**
 * THE R1 BIRTH DECISION — create one live run for an exact revision, or
 * reuse the one that already exists. The unique index is the authority;
 * the read beforehand only spares an expected exception.
 *
 *   1. read for a live run → reuse it;
 *   2. attempt the exact-bound insert;
 *   3. refused by the index → the winner exists; read it and reuse it;
 *   4. the winner left the live states before that read (it became
 *      planned/failed) → retry the whole decision once against current
 *      truth rather than reporting a phantom conflict.
 *
 * Two concurrent callers cannot both mint a live row: PostgreSQL admits one
 * and refuses the other, and the refused caller lands on step 3. Nothing
 * here is a job system, a new state, or browser authority — the caller
 * supplies the resolved revision and the founder id, nothing else.
 */
export async function birthOrReuseRun(
  db: SupabaseClient,
  params: {
    adapter: string;
    packetId: string;
    createdBy: string;
    packetRevisionId: string;
    packetRevision: number;
    descriptorSha256: string;
    adapterSchemaVersion: string;
  }
): Promise<BirthOutcome> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const live = await findLiveRunForRevision(db, params.packetRevisionId);
    if (live) return { run: live, reusedExisting: true };
    try {
      const run = await createRun(db, { ...params, state: "planning" });
      return { run, reusedExisting: false };
    } catch (e) {
      if (!isOneLiveRunConflict(e)) throw e;
      const winner = await findLiveRunForRevision(db, params.packetRevisionId);
      if (winner) return { run: winner, reusedExisting: true };
      // The winner terminated between the refusal and the read. Go around once.
    }
  }
  throw new Error("run_birth_contended: another run for this exact packet revision was live at every attempt");
}

/** The bounded recovery projection. Deliberately NOT the run row: no plan
    bytes, no input/storage paths, no source hashes, no evidence content. */
export type RecentRun = {
  runId: string;
  adapter: string;
  packetId: string;
  /** Catalog-owned human title, never a client transformation of the slug.
      Bound run → its own bound revision's title. Legacy unbound run → the
      currently active revision's title for that packetId as present-day
      presentation only, else the bare packetId. */
  packetLabel: string;
  state: RunState;
  /** Derived here, from packet_revision_id IS NOT NULL. Never stored,
      never backfilled, never asserted by the browser. */
  revisionBound: boolean;
  lastErrorCode: string | null;
  lastErrorDetail: string | null;
  createdAt: string;
  approvedAt: string | null;
  appliedAt: string | null;
};

const RECENT_COLUMNS =
  "id, adapter_id, packet_id, state, last_error_code, last_error_detail, created_at, approved_at, applied_at, packet_revision_id";

export const RECENT_RUNS_LIMIT = 20;

export async function listRecentRuns(db: SupabaseClient): Promise<RecentRun[]> {
  const { data, error } = await db
    .from("auction_operations_run")
    .select(RECENT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(RECENT_RUNS_LIMIT);
  if (error) throw new Error(`recent runs read failed: ${error.message}`);
  const rows = (data ?? []) as Array<{
    id: string; adapter_id: string; packet_id: string; state: RunState;
    last_error_code: string | null; last_error_detail: string | null;
    created_at: string; approved_at: string | null; applied_at: string | null;
    packet_revision_id: string | null;
  }>;

  /* R3 — labels come from catalog truth. Bound runs: the exact bound
     revision's title. Unbound legacy runs: the active revision's title for
     that packet id, as present-day presentation only; the row still says
     revisionBound: false so nobody reads the label as historical binding. */
  const boundIds = [...new Set(rows.map((r) => r.packet_revision_id).filter((v): v is string => !!v))];
  const unboundPacketIds = [...new Set(rows.filter((r) => !r.packet_revision_id).map((r) => r.packet_id))];
  const titleByRevision = new Map<string, string>();
  const titleByActivePacket = new Map<string, string>();
  if (boundIds.length > 0) {
    const { data: revs } = await db
      .from("auction_operations_packet_revision")
      .select("id, title")
      .in("id", boundIds);
    for (const r of (revs ?? []) as Array<{ id: string; title: string }>) titleByRevision.set(r.id, r.title);
  }
  if (unboundPacketIds.length > 0) {
    const { data: active } = await db
      .from("auction_operations_packet_revision")
      .select("packet_id, title")
      .eq("activation_state", "active")
      .in("packet_id", unboundPacketIds);
    for (const r of (active ?? []) as Array<{ packet_id: string; title: string }>) titleByActivePacket.set(r.packet_id, r.title);
  }

  return rows.map((r) => {
    const revisionBound = r.packet_revision_id !== null;
    const packetLabel = revisionBound
      ? (titleByRevision.get(r.packet_revision_id as string) ?? r.packet_id)
      : (titleByActivePacket.get(r.packet_id) ?? r.packet_id);
    return {
      runId: r.id,
      adapter: r.adapter_id,
      packetId: r.packet_id,
      packetLabel,
      state: r.state,
      revisionBound,
      lastErrorCode: r.last_error_code,
      lastErrorDetail: r.last_error_detail,
      createdAt: r.created_at,
      approvedAt: r.approved_at,
      appliedAt: r.applied_at,
    };
  });
}

export async function getRun(db: SupabaseClient, runId: string): Promise<AuctionRun | null> {
  const { data, error } = await db
    .from("auction_operations_run")
    .select(COLUMNS)
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(`run read failed: ${error.message}`);
  return (data as AuctionRun) ?? null;
}

export async function updateRun(
  db: SupabaseClient,
  runId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await db
    .from("auction_operations_run")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) throw new Error(`run update failed: ${error.message}`);
}

export async function markFailed(
  db: SupabaseClient,
  runId: string,
  code: string,
  detail: string
): Promise<void> {
  await updateRun(db, runId, {
    state: "failed",
    last_error_code: code,
    // Bounded: error text is operational, not an evidence dump.
    last_error_detail: detail.slice(0, 4000),
  });
}

/** Recompute and verify the stored plan's hash over the EXACT stored bytes,
    then parse. A run whose bytes no longer match its recorded hash is never
    applied — that is a stop condition, not a repair opportunity. */
export function verifyStoredPlan(run: AuctionRun): { plan: unknown; planSha256: string } {
  if (!run.plan_bytes || !run.plan_sha256) throw new Error("run holds no plan");
  const recomputed = sha256Hex(Buffer.from(run.plan_bytes));
  if (recomputed !== run.plan_sha256)
    throw new Error(`stored plan bytes hash ${recomputed} != recorded ${run.plan_sha256}`);
  return { plan: JSON.parse(run.plan_bytes), planSha256: recomputed };
}
