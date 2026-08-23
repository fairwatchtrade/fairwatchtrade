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

export type AuctionRun = {
  id: string;
  adapter_id: string;
  packet_id: string;
  state: RunState;
  input_paths: Record<string, string>;
  source_hashes: Record<string, string>;
  plan: unknown;
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
  applied_at: string | null;
};

const COLUMNS =
  "id, adapter_id, packet_id, state, input_paths, source_hashes, plan, plan_sha256, summary, contradictions, progress, last_error_code, last_error_detail, created_by, created_at, updated_at, approved_at, applied_at";

export const sha256Hex = (buf: Buffer | string): string =>
  crypto.createHash("sha256").update(buf).digest("hex");

export async function createRun(
  db: SupabaseClient,
  params: { adapter: string; packetId: string; createdBy: string; state: RunState }
): Promise<AuctionRun> {
  const { data, error } = await db
    .from("auction_operations_run")
    .insert({
      adapter_id: params.adapter,
      packet_id: params.packetId,
      state: params.state,
      created_by: params.createdBy,
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`run create failed: ${error.message}`);
  return data as AuctionRun;
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

/* The plan the server holds is the only plan that exists. Canonical bytes
   are re-derived with the same serialization every adapter used to hash at
   plan time, so approval-by-hash cannot drift from apply-by-hash. */
export function planBytesOf(run: AuctionRun): string {
  return JSON.stringify(run.plan, null, 2) + "\n";
}

/** Recompute and verify the stored plan's hash. Returns the parsed plan or
    throws — a run whose bytes no longer match its recorded hash is never
    applied, it is a stop condition. */
export function verifyStoredPlan(run: AuctionRun): { plan: unknown; planSha256: string } {
  if (!run.plan || !run.plan_sha256) throw new Error("run holds no plan");
  const recomputed = sha256Hex(Buffer.from(planBytesOf(run)));
  if (recomputed !== run.plan_sha256)
    throw new Error(`stored plan bytes hash ${recomputed} != recorded ${run.plan_sha256}`);
  return { plan: run.plan, planSha256: recomputed };
}
