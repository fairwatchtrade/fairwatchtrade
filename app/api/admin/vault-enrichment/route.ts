import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buildEnrichmentPlan,
  ENRICHMENT_FACT_TYPES,
  planFileName,
  type EnrichmentFactType,
  type ResolvedIdentity,
} from "@/lib/vault/enrichmentAuthoring";

/* ════════════════════════════════════════════════════════════════════════
   ADMIN — /api/admin/vault-enrichment  (founder only)

   GET  ?q=…   search real Vault references (the only things that can be a
               target — an operator cannot author against a reference that
               does not exist, which is what invalidated an entire 101-record
               legacy backlog).
   POST        build a one-record plan, its raw-byte SHA-256, and the RPC
               call that references that hash.

   THIS ROUTE NEVER WRITES. It reads the Vault to resolve identity and to see
   whether the fact is already present, then returns an artifact. The write
   remains the deliberate, separately-authorized step it has always been.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

const ADMIN_EMAIL = "jmynatt74@gmail.com";

/** The environment the emitted artifacts are bound to. The RPC re-checks this
    server-side, so a plan authored for one project cannot apply to another. */
const EXPECTED_ENV = "aqgjcezhdoianqmoknnu";
const APPLIED_BY = "vault-enrichment-room";

type ReferenceRow = {
  id: string;
  reference: string;
  metadata: unknown;
  vault_variants: {
    id: string;
    name: string;
    vault_families: {
      id: string;
      name: string;
      vault_collections: {
        id: string;
        name: string;
        vault_brands: { id: string; name: string; slug: string } | null;
      } | null;
    } | null;
  } | null;
};

const SELECT_WITH_HIERARCHY =
  "id, reference, metadata, vault_variants!inner(id, name, vault_families!inner(id, name, vault_collections!inner(id, name, vault_brands!inner(id, name, slug))))";

function toIdentity(row: ReferenceRow): ResolvedIdentity | null {
  const variant = row.vault_variants;
  const family = variant?.vault_families;
  const collection = family?.vault_collections;
  const brand = collection?.vault_brands;
  if (!variant || !family || !collection || !brand) return null;
  return {
    reference_id: row.id,
    reference: row.reference,
    brand: { id: brand.id, name: brand.name, slug: brand.slug },
    collection: { id: collection.id, name: collection.name },
    family: { id: family.id, name: family.name },
    variant: { id: variant.id, name: variant.name },
  };
}

async function requireFounder() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) return null;
  return user;
}

export async function GET(request: NextRequest) {
  if (!(await requireFounder())) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const db = createServiceClient();

  let query = db.from("vault_references").select(SELECT_WITH_HIERARCHY).order("reference").limit(40);
  if (q) query = query.ilike("reference", `%${q}%`);

  const { data, error } = await query;
  if (error) {
    console.error("[vault-enrichment] reference search failed:", error.message);
    return NextResponse.json({ error: "search_failed" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as ReferenceRow[];
  const references = rows
    .map((row) => {
      const identity = toIdentity(row);
      if (!identity) return null;
      const enrichment =
        row.metadata && typeof row.metadata === "object"
          ? ((row.metadata as Record<string, unknown>).enrichment as Record<string, unknown> | undefined)
          : undefined;
      return {
        ...identity,
        existing_facts: enrichment ? Object.keys(enrichment).sort() : [],
      };
    })
    .filter(Boolean);

  return NextResponse.json({ references });
}

export async function POST(request: NextRequest) {
  if (!(await requireFounder())) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: {
    reference_id?: string;
    fact_type?: string;
    values?: Record<string, unknown>;
    evidence?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const referenceId = typeof body.reference_id === "string" ? body.reference_id : "";
  const factType = String(body.fact_type ?? "") as EnrichmentFactType;
  if (!referenceId) return NextResponse.json({ error: "reference_id_required" }, { status: 400 });
  if (!ENRICHMENT_FACT_TYPES.includes(factType)) {
    return NextResponse.json({ error: "unknown_fact_type" }, { status: 400 });
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("vault_references")
    .select(SELECT_WITH_HIERARCHY)
    .eq("id", referenceId)
    .maybeSingle();

  if (error) {
    console.error("[vault-enrichment] reference read failed:", error.message);
    return NextResponse.json({ error: "reference_read_failed" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "reference_not_found" }, { status: 404 });

  const row = data as unknown as ReferenceRow;
  const identity = toIdentity(row);
  if (!identity) {
    return NextResponse.json({ error: "reference_hierarchy_incomplete" }, { status: 409 });
  }

  const plan = buildEnrichmentPlan({
    identity,
    factType,
    values: (body.values ?? {}) as Record<string, unknown>,
    evidence: (body.evidence ?? {}) as Record<string, unknown>,
    existingMetadata: row.metadata,
    expectedEnv: EXPECTED_ENV,
    appliedBy: APPLIED_BY,
  });

  return NextResponse.json({
    ...plan,
    identity,
    plan_file_name: planFileName(identity.reference, factType),
  });
}
