import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  listActivePacketRevisions,
  toRegisteredPacket,
  descriptorBytesAndHash,
  isAllowlistedAdapter,
  isRuntimeRegisterable,
  ADAPTER_SCHEMA_VERSIONS,
  RUNTIME_REGISTERABLE_ADAPTERS,
} from "@/lib/auction-operations/packetCatalog";
import { APPLY_WITHHELD_ADAPTERS } from "@/lib/auction-operations/packetContract";

/* ════════════════════════════════════════════════════════════════════════
   AUCTION OPERATIONS — PACKET CATALOG — /api/admin/auctions/packets

   GET   the packet instances the founder may select right now.
   POST  register a NEW packet revision.

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "Registering a packet is a kind of ingestion."

   It is not, and the separation is the safety. Registering writes ONE
   catalog row describing what may later be ingested. It fetches nothing,
   parses no corpus, touches no Auction Evidence, and produces no plan. The
   row it writes is born unapproved and inactive and cannot be used for
   anything until two further, separately recorded acts happen.

   ── WHAT THIS DOOR IS NOT ──────────────────────────────────────────────
   Not an arbitrary file-ingestion door. The adapter must be on the code
   allowlist AND marked runtime-registerable; the schema version must be one
   this build knows; the descriptor must validate. A family whose executable
   path still carries instance-specific literals is refused here by name,
   because letting it through would be claiming a reusability nobody proved.

   Founder identity is resolved from the session, server-side. The literal
   below is deliberately independent of any shared constant, matching the
   defense-in-depth convention the other Auction Operations routes use.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

async function founderGate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { user: null, deny: NextResponse.json({ error: "not_authenticated", detail: "Sign in required." }, { status: 401 }) };
  }
  if (user.id !== ADMIN_USER_ID) {
    return { user: null, deny: NextResponse.json({ error: "forbidden", detail: "Admin only." }, { status: 403 }) };
  }
  return { user, deny: null };
}

export async function GET() {
  const gate = await founderGate();
  if (gate.deny) return gate.deny;

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "server_misconfigured", detail: "Admin read channel unavailable." }, { status: 500 });
  }

  try {
    const rows = await listActivePacketRevisions(service);
    /* The room is told what it may select and nothing more. Descriptor bytes
       and source URLs stay server-side — the browser has no use for the
       mechanics and no business holding them. */
    return NextResponse.json({
      packets: rows.map((r) => {
        const projected = toRegisteredPacket(r);
        return {
          adapter: projected.adapter,
          packetId: projected.packetId,
          title: projected.title,
          description: projected.description,
          uploads: projected.uploads.map((u) => ({ kind: u.kind, label: u.label, required: u.required })),
          revision: r.revision,
          revisionId: r.id,
        };
      }),
      runtimeRegisterableAdapters: RUNTIME_REGISTERABLE_ADAPTERS,
      /* Families the room may plan but must never offer to apply. The
         server refuses regardless; this is so the room can say so honestly
         instead of drawing a button that would be refused. */
      applyWithheldAdapters: APPLY_WITHHELD_ADAPTERS,
    });
  } catch (e) {
    console.error("[auction-ops] packet catalog read failed:", e);
    /* An unreadable catalog is reported as unreadable. It does NOT fall back
       to a built-in list — a fallback is how the mirrored registry survived
       the last time, and an empty room is a truthful room. */
    return NextResponse.json({ error: "catalog_unavailable", detail: "The packet catalog could not be read." }, { status: 503 });
  }
}

type RegisterBody = {
  packetId?: unknown;
  title?: unknown;
  description?: unknown;
  houseSlug?: unknown;
  adapterId?: unknown;
  adapterSchemaVersion?: unknown;
  acquisitionMode?: unknown;
  descriptor?: unknown;
  uploadSpecs?: unknown;
  sourceUrls?: unknown;
  semanticGates?: unknown;
  displayOrder?: unknown;
};

export async function POST(request: NextRequest) {
  const gate = await founderGate();
  if (gate.deny) return gate.deny;
  const user = gate.user!;

  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "bad_request", detail: "Could not parse body." }, { status: 400 });
  }

  const packetId = typeof body.packetId === "string" ? body.packetId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(packetId)) {
    return NextResponse.json({ error: "invalid_packet_id", detail: "A packet id is 1–64 characters of letters, digits, dot, dash or underscore." }, { status: 400 });
  }
  if (title === "") {
    return NextResponse.json({ error: "invalid_title", detail: "A packet needs a human title." }, { status: 400 });
  }

  /* ADAPTER: allowlisted AND proven reusable. Two separate refusals on
     purpose — "we have never heard of this parser" and "this parser exists
     but has not been proven able to take a new instance" are different
     answers, and collapsing them would hide the second. */
  const adapterId = body.adapterId;
  if (!isAllowlistedAdapter(adapterId)) {
    return NextResponse.json({ error: "unsupported_adapter", detail: "That adapter is not on the code allowlist." }, { status: 400 });
  }
  if (!isRuntimeRegisterable(adapterId)) {
    return NextResponse.json(
      {
        error: "adapter_not_runtime_registerable",
        detail: `The ${adapterId} family is not yet proven able to resolve a new packet instance from descriptor data alone. Registering one would claim a reusability it has not earned.`,
      },
      { status: 400 }
    );
  }

  const schemaVersion = typeof body.adapterSchemaVersion === "string" ? body.adapterSchemaVersion.trim() : "";
  if (!ADAPTER_SCHEMA_VERSIONS[adapterId].includes(schemaVersion)) {
    return NextResponse.json(
      { error: "unsupported_schema_version", detail: `${adapterId} accepts: ${ADAPTER_SCHEMA_VERSIONS[adapterId].join(", ")}` },
      { status: 400 }
    );
  }

  const acquisitionMode = body.acquisitionMode;
  if (acquisitionMode !== "staged_upload" && acquisitionMode !== "registered_fetch" && acquisitionMode !== "mixed") {
    return NextResponse.json({ error: "invalid_acquisition_mode", detail: "Acquisition mode must be staged_upload, registered_fetch or mixed." }, { status: 400 });
  }

  /* DESCRIPTOR VALIDATION, owned by the family rather than by this route.
     A runtime-registered instance must carry its manifest inline — pointing
     at a repo path would reinstate the deployment requirement this flight
     exists to remove. */
  const descriptor = body.descriptor;
  if (descriptor === null || typeof descriptor !== "object" || Array.isArray(descriptor)) {
    return NextResponse.json({ error: "invalid_descriptor", detail: "The descriptor must be an object." }, { status: 400 });
  }
  const d = descriptor as Record<string, unknown>;
  if (d.manifest === undefined || d.manifest === null || typeof d.manifest !== "object") {
    return NextResponse.json(
      { error: "invalid_descriptor", detail: "A runtime-registered packet carries its manifest inline, under `manifest`." },
      { status: 400 }
    );
  }
  if (adapterId === "monaco-layer2") {
    const m = d.manifest as Record<string, unknown>;
    const corpus = m.corpus as { sha256?: unknown } | undefined;
    if (!corpus || typeof corpus.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(corpus.sha256)) {
      return NextResponse.json({ error: "invalid_descriptor", detail: "A Layer 2 manifest must pin corpus.sha256." }, { status: 400 });
    }
    if (!Array.isArray(m.sales) || m.sales.length === 0) {
      return NextResponse.json({ error: "invalid_descriptor", detail: "A Layer 2 manifest must declare its sales." }, { status: 400 });
    }
    if (typeof d.flight !== "string" || d.flight.trim() === "") {
      return NextResponse.json(
        { error: "invalid_descriptor", detail: "A Layer 2 packet must name its own flight label — it is written into the deterministic plan." },
        { status: 400 }
      );
    }
  }
  if (adapterId === "monaco-portable") {
    /* The descriptor governs the PACKET: which keeper, exactly, and what it
       must reconcile to. It does not mirror the keeper. The profile name is
       the schema version already validated above; the keeper's structure is
       validated at plan time from the verified bytes, not here. */
    const m = d.manifest as Record<string, unknown>;
    const keeper = m.keeper as { sha256?: unknown } | undefined;
    if (!keeper || typeof keeper.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(keeper.sha256)) {
      return NextResponse.json({ error: "invalid_descriptor", detail: "A portable packet must pin keeper.sha256 — the exact accepted keeper bytes." }, { status: 400 });
    }
    const gates = m.gates as Record<string, unknown> | undefined;
    if (!gates || typeof gates !== "object") {
      return NextResponse.json({ error: "invalid_descriptor", detail: "A portable packet must carry its reconciliation gates." }, { status: 400 });
    }
    for (const k of ["sale_code", "canonical_auction_url", "lot_count", "sold", "unsold", "withdrawn", "sold_total", "currency", "price_basis"]) {
      if (gates[k] === undefined || gates[k] === null) {
        return NextResponse.json({ error: "invalid_descriptor", detail: `A portable packet's gates must pin ${k}.` }, { status: 400 });
      }
    }
    const house = m.house as Record<string, unknown> | undefined;
    const sale = m.sale as Record<string, unknown> | undefined;
    if (!house || typeof house.slug !== "string" || typeof house.name !== "string" || !sale || typeof sale.code !== "string") {
      return NextResponse.json({ error: "invalid_descriptor", detail: "A portable packet must name its house (slug, name) and sale (code)." }, { status: 400 });
    }
  }

  /* The hash is computed HERE, over the exact bytes stored. A
     caller-supplied hash would authorise nothing: a descriptor and a hash
     that arrived together prove only that whoever sent them can hash. */
  const { bytes, sha256 } = descriptorBytesAndHash(descriptor);

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "server_misconfigured", detail: "Admin write channel unavailable." }, { status: 500 });
  }

  const { data: existing } = await service
    .from("auction_operations_packet_revision")
    .select("revision")
    .eq("packet_id", packetId)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextRevision = existing ? ((existing as { revision: number }).revision ?? 0) + 1 : 1;

  const { data, error } = await service
    .from("auction_operations_packet_revision")
    .insert({
      packet_id: packetId,
      revision: nextRevision,
      title,
      description: typeof body.description === "string" ? body.description : "",
      house_slug: typeof body.houseSlug === "string" ? body.houseSlug : null,
      adapter_id: adapterId,
      adapter_schema_version: schemaVersion,
      acquisition_mode: acquisitionMode,
      descriptor,
      descriptor_bytes: bytes,
      descriptor_sha256: sha256,
      upload_specs: Array.isArray(body.uploadSpecs) ? body.uploadSpecs : [],
      source_urls: Array.isArray(body.sourceUrls) ? body.sourceUrls : [],
      semantic_gates:
        body.semanticGates && typeof body.semanticGates === "object" && !Array.isArray(body.semanticGates)
          ? body.semanticGates
          : {},
      display_order: typeof body.displayOrder === "number" ? body.displayOrder : 1000,
      created_by: user.id,
      /* Structural validation happened above and is recorded as validation,
         NOT as approval. The row is still born unapproved and inactive; the
         insert trigger refuses anything else, so this route could not
         activate its own revision even if it tried to. */
      validation_state: "validated",
      validated_at: new Date().toISOString(),
      provenance: { origin: "founder_registration", route: "/api/admin/auctions/packets" },
    })
    .select("id, packet_id, revision, validation_state, approval_state, activation_state")
    .single();

  if (error) {
    const duplicate = /duplicate key|auction_operations_packet_revision_identity/i.test(error.message);
    return NextResponse.json(
      {
        error: duplicate ? "duplicate_packet_revision" : "registration_failed",
        detail: duplicate ? "That packet revision already exists." : error.message,
      },
      { status: duplicate ? 409 : 500 }
    );
  }

  return NextResponse.json({ revision: data, nextStep: "approve" }, { status: 201 });
}
