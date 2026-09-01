import { createHash } from "node:crypto";
import type { RegisteredPacket, UploadSpec, AdapterId } from "@/lib/auction-operations/registry";

/* ════════════════════════════════════════════════════════════════════════
   AUCTION OPERATIONS — PACKET CONTRACT (pure)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "Adapters became data when packets did."

   They did not. This module holds the half of the catalog that is CODE and
   nothing else: which adapters exist, which of them have been proven able
   to take a new instance, which schema versions each accepts, and how a
   descriptor is serialized and hashed.

   It is deliberately pure — no filesystem, no database, no `server-only`.
   That is not tidiness: packetCatalog.ts is server-only because it reads
   both, and a module that cannot be imported outside Next cannot be
   asserted against by the focused suite. Splitting the contract out keeps
   the founder's documented command working unchanged:

     node --experimental-strip-types scripts/auction-operations.test.mjs

   The rules that decide what may be ingested are therefore testable without
   standing up a database, which is exactly the half worth testing that way.
   ════════════════════════════════════════════════════════════════════════ */

/** THE ADAPTER ALLOWLIST. Finite, code-owned, and mirrored by a CHECK
    constraint in the catalog migration so a compromised route still cannot
    introduce a fourth name. */
export const ADAPTER_ALLOWLIST = ["phillips-sale", "monaco-legend", "monaco-layer2"] as const;

/** Families whose executable path was INSPECTED and proven able to resolve
    a new packet instance from governed descriptor data alone — no packet
    id, sale id, manifest path or corpus identity baked into source.

    monaco-layer2 qualifies after this flight: its one instance literal (the
    plan's `flight` label) now comes from the descriptor. The other two are
    deliberately absent. Their executable paths are manifest-driven, but
    neither was proven end to end here, and listing them would claim a
    reusability nobody demonstrated. Absence is a finding, not an oversight. */
export const RUNTIME_REGISTERABLE_ADAPTERS = ["monaco-layer2"] as const;

export type RuntimeRegisterableAdapter = (typeof RUNTIME_REGISTERABLE_ADAPTERS)[number];

export function isAllowlistedAdapter(v: unknown): v is AdapterId {
  return typeof v === "string" && (ADAPTER_ALLOWLIST as readonly string[]).includes(v);
}

export function isRuntimeRegisterable(v: unknown): v is RuntimeRegisterableAdapter {
  return typeof v === "string" && (RUNTIME_REGISTERABLE_ADAPTERS as readonly string[]).includes(v);
}

/** Schema versions each family will accept. A descriptor whose version is
    not listed is refused rather than parsed hopefully. */
export const ADAPTER_SCHEMA_VERSIONS: Record<AdapterId, readonly string[]> = {
  "phillips-sale": ["phillips-sale-manifest-v1"],
  "monaco-legend": ["monaco-landing-semantic-v1"],
  "monaco-layer2": ["monaco-layer2-v1"],
};

export type PacketRevisionRow = {
  id: string;
  packet_id: string;
  revision: number;
  title: string;
  description: string;
  adapter_id: string;
  adapter_schema_version: string;
  acquisition_mode: "staged_upload" | "registered_fetch" | "mixed";
  descriptor: Record<string, unknown>;
  descriptor_bytes: string;
  descriptor_sha256: string;
  upload_specs: UploadSpec[];
  source_urls: unknown[];
  semantic_gates: Record<string, unknown>;
  validation_state: string;
  approval_state: string;
  activation_state: string;
  display_order: number;
};

/** A catalog row is only usable if the code still recognises its mechanics.
    Applied on the way OUT of the database as well as on the way in: a row
    written before an adapter was retired must not become executable again
    just because it is still marked active. */
export function rowIsUsable(row: PacketRevisionRow): boolean {
  if (!isAllowlistedAdapter(row.adapter_id)) return false;
  return ADAPTER_SCHEMA_VERSIONS[row.adapter_id].includes(row.adapter_schema_version);
}

/** Canonical descriptor serialization + hash, used by the registration path
    so the stored bytes and the stored hash cannot disagree. */
export function descriptorBytesAndHash(descriptor: unknown): { bytes: string; sha256: string } {
  const bytes = JSON.stringify(descriptor);
  return { bytes, sha256: createHash("sha256").update(bytes, "utf8").digest("hex") };
}

/** Re-derive the hash from the stored bytes and compare. A hash sitting
    beside its own payload authorises nothing until somebody recomputes it;
    this is where that happens, before any adapter sees the descriptor. */
export function assertDescriptorIntegrity(row: PacketRevisionRow): void {
  const actual = createHash("sha256").update(row.descriptor_bytes, "utf8").digest("hex");
  if (actual !== row.descriptor_sha256) {
    throw new Error(
      `descriptor_hash_mismatch: revision ${row.packet_id}@${row.revision} stores ${row.descriptor_sha256} but its bytes hash to ${actual}`
    );
  }
}

export type ResolvedDescriptor = { bytes: Buffer; value: unknown };

/** The inline case: the governed bytes in the row ARE the manifest. This is
    what makes a new same-family packet possible without a deployment,
    because nothing has to exist on disk. */
export function resolveInlineDescriptor(row: PacketRevisionRow): ResolvedDescriptor[] {
  const descriptor = row.descriptor as { manifest?: unknown };
  if (descriptor?.manifest === undefined) {
    throw new Error(
      `descriptor_unsupported: revision ${row.packet_id}@${row.revision} carries neither manifest_paths nor an inline manifest`
    );
  }
  const bytes = Buffer.from(JSON.stringify(descriptor.manifest), "utf8");
  return [{ bytes, value: descriptor.manifest }];
}

/** The catalog row rendered in the shape the existing machinery already
    speaks. A projection, not a second registry: manifestPaths is populated
    ONLY for legacy descriptors that genuinely still name repo files, and is
    empty for a runtime-registered instance whose descriptor travels in the
    row. */
export function toRegisteredPacket(row: PacketRevisionRow): RegisteredPacket {
  const descriptor = row.descriptor as { manifest_paths?: unknown };
  const manifestPaths = Array.isArray(descriptor?.manifest_paths)
    ? (descriptor.manifest_paths as unknown[]).filter((p): p is string => typeof p === "string")
    : [];
  return {
    adapter: row.adapter_id as AdapterId,
    packetId: row.packet_id,
    title: row.title,
    description: row.description,
    manifestPaths,
    uploads: Array.isArray(row.upload_specs) ? row.upload_specs : [],
  };
}

export const PACKET_CATALOG_COLUMNS =
  "id, packet_id, revision, title, description, adapter_id, adapter_schema_version, " +
  "acquisition_mode, descriptor, descriptor_bytes, descriptor_sha256, upload_specs, " +
  "source_urls, semantic_gates, validation_state, approval_state, activation_state, display_order";
