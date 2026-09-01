import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADAPTER_SCHEMA_VERSIONS,
  PACKET_CATALOG_COLUMNS,
  verifiedDescriptor,
  isAllowlistedAdapter,
  isRuntimeRegisterable,
  resolveInlineDescriptor,
  rowIsUsable,
  toRegisteredPacket,
  descriptorBytesAndHash,
  ADAPTER_ALLOWLIST,
  RUNTIME_REGISTERABLE_ADAPTERS,
  type PacketRevisionRow,
  type ResolvedDescriptor,
} from "@/lib/auction-operations/packetContract";

/* The pure contract is re-exported so callers have one import site, while
   the rules themselves stay testable without Next. */
export {
  ADAPTER_ALLOWLIST,
  RUNTIME_REGISTERABLE_ADAPTERS,
  ADAPTER_SCHEMA_VERSIONS,
  isAllowlistedAdapter,
  isRuntimeRegisterable,
  toRegisteredPacket,
  descriptorBytesAndHash,
  verifiedDescriptor,
};
export type { PacketRevisionRow, ResolvedDescriptor };

/* ════════════════════════════════════════════════════════════════════════
   AUCTION OPERATIONS — GOVERNED PACKET CATALOG (server)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "Making packets registerable at runtime means adapters become
      registerable at runtime."

   It does not, and the whole design turns on keeping those two apart:

     PACKET INSTANCE  →  data.  Governed rows in
                         auction_operations_packet_revision. A new sale of a
                         proven family needs no code and no deployment.

     ADAPTER          →  code.  ADAPTER_ALLOWLIST below, and nothing else.
                         A packet row NAMES an adapter; it never supplies,
                         selects dynamically, or influences one. There is no
                         dynamic import here, no eval, no adapter string
                         reaching a module path.

   If a catalog row names an adapter this file does not already know, the
   row is refused. That refusal is the point: unknown mechanics fail
   visibly rather than being improvised.

   ── WHY THE BROWSER IS NEVER ASKED ─────────────────────────────────────
   Upload requirements, acquisition mode, source URLs, semantic gates and
   the descriptor itself all resolve from the exact server-held revision.
   The client sends a packet id; everything the machinery then trusts comes
   from the row, never from the request.
   ════════════════════════════════════════════════════════════════════════ */

const ROW_COLS = PACKET_CATALOG_COLUMNS;

/** Every packet instance the founder may select right now. The room renders
    exactly this — there is no client-side list to fall back to. */
export async function listActivePacketRevisions(
  db: SupabaseClient
): Promise<PacketRevisionRow[]> {
  const { data, error } = await db
    .from("auction_operations_packet_revision")
    .select(ROW_COLS)
    .eq("activation_state", "active")
    .order("display_order", { ascending: true })
    .order("packet_id", { ascending: true });
  if (error) throw new Error(`packet_catalog_read_failed: ${error.message}`);
  return ((data ?? []) as unknown as PacketRevisionRow[]).filter(rowIsUsable);
}

/** The active revision for one packet id, or null. Null is a refusal, never
    a prompt to guess. */
export async function resolveActivePacketRevision(
  db: SupabaseClient,
  packetId: unknown
): Promise<PacketRevisionRow | null> {
  if (typeof packetId !== "string" || packetId === "") return null;
  const { data, error } = await db
    .from("auction_operations_packet_revision")
    .select(ROW_COLS)
    .eq("packet_id", packetId)
    .eq("activation_state", "active")
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as PacketRevisionRow;
  return rowIsUsable(row) ? row : null;
}

/** One exact revision by id — what a run planned against, regardless of
    what has since been activated. This is how a later revision is prevented
    from changing an already-created run. */
export async function resolvePacketRevisionById(
  db: SupabaseClient,
  revisionId: unknown
): Promise<PacketRevisionRow | null> {
  if (typeof revisionId !== "string" || revisionId === "") return null;
  const { data, error } = await db
    .from("auction_operations_packet_revision")
    .select(ROW_COLS)
    .eq("id", revisionId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as PacketRevisionRow;
  return rowIsUsable(row) ? row : null;
}

/**
 * The descriptor(s) a plan is generated from, resolved from the EXACT
 * revision rather than from disk wherever the revision carries its own.
 *
 * Two shapes, and the difference is the whole reusability story:
 *
 *   legacy_repo_manifest — the descriptor names repo files. Reading them
 *     keeps the three migrated packets byte-for-byte what they were, which
 *     is what "materially equivalent behaviour" has to mean for a corpus
 *     that is already ingested.
 *
 *   inline — the descriptor IS the manifest, carried in the row. Nothing
 *     needs to exist on disk, which is what removes the deployment.
 *
 * The stored hash is re-derived from the stored bytes first, for both
 * shapes. This is the only function that hands descriptor bytes to an
 * adapter, so it is the right and only place to insist on that.
 */
export function loadDescriptors(row: PacketRevisionRow): ResolvedDescriptor[] {
  /* The verified bytes decide, including which SHAPE this descriptor is.
     Reading the kind field off the JSONB would have let an unverified projection
     choose between the legacy-path branch and the inline branch, which is
     the same trust defect one level up. */
  const descriptor = verifiedDescriptor(row) as { kind?: unknown; manifest_paths?: unknown };
  if (descriptor?.kind === "legacy_repo_manifest") {
    const paths = Array.isArray(descriptor.manifest_paths)
      ? (descriptor.manifest_paths as unknown[]).filter((p): p is string => typeof p === "string")
      : [];
    if (paths.length === 0) {
      throw new Error(`descriptor_empty: legacy revision ${row.packet_id}@${row.revision} names no manifest`);
    }
    return paths.map((rel) => {
      const abs = path.join(process.cwd(), rel);
      const bytes = fs.readFileSync(abs);
      return { bytes, value: JSON.parse(bytes.toString("utf8")) };
    });
  }

  return resolveInlineDescriptor(row);
}
