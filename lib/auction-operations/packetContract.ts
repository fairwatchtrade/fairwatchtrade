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
export const ADAPTER_ALLOWLIST = ["phillips-sale", "monaco-legend", "monaco-layer2", "monaco-portable"] as const;

/* ── APPLY IS WITHHELD BY NAME, AND THAT COMES FIRST ───────────────────────

   The dispatcher in applySlice.ts historically read:

       phillips-sale  → the Phillips writer
       everything else → the Monaco writer

   so a NEW adapter id, merely by existing, inherited applyMonacoPlanSlice.
   That is how a plan-only family would have become a writing family without
   anyone deciding it should.

   This set is the precondition of runtime registration for a family that
   has no proven writer yet: such a family may appear in
   RUNTIME_REGISTERABLE_ADAPTERS below only if it appears here first, and
   applyDispatchFor() consults this set before it consults anything else.
   UI hiding is not the boundary; the server-side dispatch fails closed.

   A family leaves this set when a writer for it has been built, proven, and
   separately authorised — never by editing this line alone. monaco-portable
   lived here from v8.18 and left in v8.25: its registration is safe now
   because its explicit, proven writer is the dispatch target, and because
   every portable plan states its own executability in its hashed bytes
   (planBoundApplyEnabled below), so a plan generated while the family was
   withheld can never execute merely because newer code exists.

   The set is EMPTY as of v8.25. The mechanism stays for the next family
   that needs to plan before it may write. */
export const APPLY_WITHHELD_ADAPTERS = [] as const;

export function isApplyWithheld(v: unknown): boolean {
  return typeof v === "string" && (APPLY_WITHHELD_ADAPTERS as readonly string[]).includes(v);
}

export type ApplyDispatch = "withheld" | "phillips" | "monaco" | "portable" | "unsupported";

/** THE dispatch decision, pure and testable, and explicit BY FAMILY.

    Withheld is evaluated first so a withheld family can never reach a
    writer. After that, every writer branch names the families it serves.
    There is no fall-through: a name that is neither withheld nor a proven
    writer family is `unsupported`, and the slice refuses it before any
    engine. v8.18 closed the fourth-adapter hazard by withholding
    monaco-portable first; v8.21 closed the general one — a future name
    cannot inherit a writer by elimination.

    v8.25: monaco-portable leaves the withheld set and gains its own branch,
    dispatched to applyPortablePlanSlice — never to the Monaco writer, which
    resolves artifacts by URL and cannot see the URL-less private keeper. */
export function applyDispatchFor(adapterId: unknown): ApplyDispatch {
  if (isApplyWithheld(adapterId)) return "withheld";
  if (adapterId === "phillips-sale") return "phillips";
  if (adapterId === "monaco-legend" || adapterId === "monaco-layer2") return "monaco";
  if (adapterId === "monaco-portable") return "portable";
  return "unsupported";
}

export const APPLY_WITHHELD_ERROR = "apply_withheld_plan_only_family";

/* ── THE PLAN-BOUND GATE (v8.25) ────────────────────────────────────────────

   A family-level release must never retroactively authorise a historical
   plan whose own reviewed hash says it was not executable. When
   monaco-portable left the withheld set, every portable plan generated
   before that — bytes the founder reviewed, hash and all — still said
   `apply.enabled: false`. The family being enabled is not authority to run
   them; their own bytes are the authority, and their bytes say no.

   This reads the VERIFIED stored plan value, never a summary string and
   never anything the browser sent. Rules:

     plan carries an `apply` block  → executable only if enabled === true,
                                      strictly (no coercion, no wording)
     no `apply` block, portable     → NOT executable: a released portable
                                      plan must state its own enabled Apply
     no `apply` block, other family → executable; those plan shapes carry no
                                      plan-bound statement and family
                                      dispatch governs them as before

   The apply route consults this after verifyStoredPlan() and before the
   run may move to `applying`; the run status route reports it so the room
   renders server truth; the portable writer refuses independently beneath
   both. */
export const APPLY_PLAN_BOUND_DISABLED_ERROR = "apply_plan_bound_disabled";

export function planBoundApplyEnabled(
  adapterId: unknown,
  plan: unknown
): { enabled: boolean; reason: string } {
  const apply =
    plan !== null && typeof plan === "object" ? (plan as { apply?: unknown }).apply : undefined;
  if (apply !== null && typeof apply === "object") {
    const a = apply as { enabled?: unknown; reason?: unknown };
    if (a.enabled === true) return { enabled: true, reason: "the plan's own bytes state Apply is enabled" };
    return {
      enabled: false,
      reason: typeof a.reason === "string" && a.reason ? a.reason : "the plan's own bytes state Apply is not enabled",
    };
  }
  if (adapterId === "monaco-portable") {
    return { enabled: false, reason: "a portable plan must state its own enabled Apply; this one carries no apply block" };
  }
  return { enabled: true, reason: "this plan shape carries no plan-bound apply statement; family dispatch governs" };
}
export const APPLY_UNSUPPORTED_ERROR = "apply_unsupported_adapter";

/** Families whose executable path was INSPECTED and proven able to resolve
    a new packet instance from governed descriptor data alone — no packet
    id, sale id, manifest path or corpus identity baked into source.

    monaco-layer2 qualifies after v8.0: its one instance literal (the plan's
    `flight` label) comes from the descriptor.

    monaco-portable qualifies for PLAN-ONLY registration after v8.18: its
    profile validator reads no sale code, its packet gates live in the
    descriptor, and — the precondition — Apply is refused for it by name
    above. Registering an instance produces a reviewable plan and nothing
    else.

    phillips-sale and monaco-legend are deliberately absent. Their
    executable paths are manifest-driven, but neither was proven end to end,
    and listing them would claim a reusability nobody demonstrated. Absence
    is a finding, not an oversight. */
export const RUNTIME_REGISTERABLE_ADAPTERS = ["monaco-layer2", "monaco-portable"] as const;

export type RuntimeRegisterableAdapter = (typeof RUNTIME_REGISTERABLE_ADAPTERS)[number];

export function isAllowlistedAdapter(v: unknown): v is AdapterId {
  return typeof v === "string" && (ADAPTER_ALLOWLIST as readonly string[]).includes(v);
}

export function isRuntimeRegisterable(v: unknown): v is RuntimeRegisterableAdapter {
  return typeof v === "string" && (RUNTIME_REGISTERABLE_ADAPTERS as readonly string[]).includes(v);
}

/** Schema versions each family will accept. A descriptor whose version is
    not listed is refused rather than parsed hopefully.

    monaco-portable's version IS its profile name: profiles are additive and
    named, and a second portable keeper shape earns a second entry here with
    its own validator, never a widening of the first. */
export const ADAPTER_SCHEMA_VERSIONS: Record<AdapterId, readonly string[]> = {
  "phillips-sale": ["phillips-sale-manifest-v1"],
  "monaco-legend": ["monaco-landing-semantic-v1"],
  "monaco-layer2": ["monaco-layer2-v1"],
  "monaco-portable": ["monaco-portable-reconciled-sale-v1"],
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
  if (!ADAPTER_SCHEMA_VERSIONS[row.adapter_id].includes(row.adapter_schema_version)) return false;
  /* A row whose bytes and projection disagree is not merely suspect, it is
     unusable: nothing downstream could say which of the two it meant. */
  return descriptorIsGoverned(row);
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

/** Key-order-independent structural equality. JSON.stringify comparison is
    NOT usable here: two objects with identical content but different key
    order serialize differently, so it would manufacture disagreement between
    a descriptor and its own faithful projection. */
export function structurallyEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => structurallyEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && structurallyEqual(ao[k], bo[k]));
  }
  return false;
}

/**
 * THE DESCRIPTOR AUTHORITY. Every executable decision that depends on a
 * descriptor resolves through here and nowhere else.
 *
 * THE DEFECT THIS FUNCTION EXISTS TO KILL:
 *
 *   The hash covered descriptor_bytes, and the runtime read the separate
 *   JSONB descriptor column. Two values, one signature. A row could carry
 *   verified bytes describing A while the code executed B, and every
 *   integrity check in the system would still pass — because each half was
 *   internally consistent and nothing compared them.
 *
 *   A valid hash over A must never authorise the execution of B.
 *
 * So the bytes win, always. They are rehashed, then PARSED, and the parsed
 * value is what callers get.
 *
 * ── AND DIVERGENCE FAILS CLOSED ────────────────────────────────────────
 * Executing A while quietly ignoring a disagreeing B is NOT sufficient, and
 * the distinction matters. If the two halves disagree, the row itself is
 * untrustworthy: something wrote one and not the other, and nobody can say
 * from here which one was intended or what else that writer touched.
 * Continuing on A would be treating a corrupted row as merely untidy. So
 * the row is REFUSED — `descriptor_projection_mismatch` — and neither value
 * executes.
 *
 * Key order is not divergence. structurallyEqual compares content, because a
 * JSON.stringify comparison would manufacture a mismatch between a
 * descriptor and its own faithful projection purely from key ordering.
 */
export function verifiedDescriptor(row: PacketRevisionRow): Record<string, unknown> {
  assertDescriptorIntegrity(row);

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.descriptor_bytes);
  } catch {
    throw new Error(
      `descriptor_unparseable: revision ${row.packet_id}@${row.revision} has a verified hash over bytes that are not JSON`
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `descriptor_not_an_object: revision ${row.packet_id}@${row.revision}`
    );
  }

  if (!structurallyEqual(parsed, row.descriptor)) {
    throw new Error(
      `descriptor_projection_mismatch: revision ${row.packet_id}@${row.revision} — the verified bytes and the stored JSONB describe different descriptors; the bytes are authoritative and the row is refused`
    );
  }

  return parsed as Record<string, unknown>;
}

/** Non-throwing form, for filtering a catalog listing. One ungoverned row
    must not take down the whole room, but it must not be selectable either. */
export function descriptorIsGoverned(row: PacketRevisionRow): boolean {
  try {
    verifiedDescriptor(row);
    return true;
  } catch {
    return false;
  }
}

export type ResolvedDescriptor = { bytes: Buffer; value: unknown };

/** The inline case: the governed bytes in the row ARE the manifest. This is
    what makes a new same-family packet possible without a deployment,
    because nothing has to exist on disk. */
export function resolveInlineDescriptor(row: PacketRevisionRow): ResolvedDescriptor[] {
  const descriptor = verifiedDescriptor(row) as { manifest?: unknown };
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
  /* Even the projection reads through the authority. manifestPaths is not
     executable today, but "not executable today" is exactly how a value
     becomes executable tomorrow without anyone noticing. */
  const descriptor = verifiedDescriptor(row) as { manifest_paths?: unknown };
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
