import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  describeCanonicalLink,
  resolveCanonicalReference,
  searchVaultReferences,
  vaultReferenceExists,
} from "@/lib/identity/canonicalReferenceResolver";

/* ════════════════════════════════════════════════════════════════════════
   /api/admin/listings/[id]/canonical-reference — the correction seam

   GET   current canonical link + what the resolver would say today
         (+ `?q=` to search the Vault for a row to link)
   POST  { vaultReferenceId: string | null }  — set, correct, or clear

   THIS IS A CORRECTION CONTROL, NOT A VAULT EDITOR. It writes exactly one
   column on one listing. It cannot create, rename, move, or delete a Vault
   row, and the only ids it will accept are ids the Vault already holds —
   an arbitrary UUID is refused rather than stored, so the FK is never the
   thing discovering a typo.

   WHY THE FREE TEXT IS NOT RE-VALIDATED ON THIS PATH: correcting a link on
   a listing whose seller text is wrong is precisely what this control is
   for. The automatic resolver refuses to guess; a human is allowed to know
   something the text does not say. What the founder may NOT do is create
   identity out of nothing — hence the existence check.

   Clearing is a first-class action, not an accident: an incorrect canonical
   link must be removable back to honest NULL without inventing a
   replacement.

   TWO INDEPENDENT GATES, same shape as the sibling admin routes: the page's
   founder check and this route's own hardcoded literal. Neither trusts the
   other.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";

// Defense-in-depth: hardcoded literal in THIS file, intentionally independent
// of the page's check and of any shared constant.
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

async function requireFounder() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "not_authenticated" }, { status: 401 }) };
  if (user.id !== ADMIN_USER_ID) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { user };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireFounder();
  if (gate.error) return gate.error;
  const { id } = await params;

  const db = createServiceClient();
  const { data: listing } = await db
    .from("listings")
    .select("id, brand, model, reference, vault_reference_id")
    .eq("id", id)
    .maybeSingle();

  if (!listing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();

  const [current, suggestion, results] = await Promise.all([
    describeCanonicalLink(listing.vault_reference_id ?? null),
    resolveCanonicalReference({
      brand: listing.brand ?? "",
      model: listing.model ?? "",
      reference: listing.reference ?? "",
    }),
    q ? searchVaultReferences(q) : Promise.resolve([]),
  ]);

  return NextResponse.json({
    listing: {
      id: listing.id,
      brand: listing.brand ?? "",
      model: listing.model ?? "",
      reference: listing.reference ?? "",
      vaultReferenceId: listing.vault_reference_id ?? null,
    },
    current,
    /* What the deterministic resolver says about this listing's text RIGHT
       NOW — shown beside the stored link so the founder can see agreement,
       drift, or an honest ambiguity without leaving the room. */
    suggestion,
    results,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireFounder();
  if (gate.error) return gate.error;
  const { id } = await params;

  let raw: unknown;
  try {
    const body = await request.json();
    raw = body?.vaultReferenceId;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  /* null | "" — an explicit, intentional clear. */
  const requested =
    typeof raw === "string" && raw.trim() !== "" ? raw.trim() : raw === null ? null : undefined;
  if (requested === undefined) {
    return NextResponse.json(
      { error: "bad_request", detail: "vaultReferenceId must be a Vault reference id or null." },
      { status: 400 }
    );
  }

  if (requested !== null) {
    const target = await vaultReferenceExists(requested);
    if (!target) {
      return NextResponse.json(
        {
          error: "unknown_reference",
          detail: "That id is not a Vault reference with a complete brand chain.",
        },
        { status: 400 }
      );
    }
  }

  const db = createServiceClient();
  const { error } = await db
    .from("listings")
    .update({ vault_reference_id: requested })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "write_failed", detail: error.message }, { status: 500 });
  }

  const current = await describeCanonicalLink(requested);
  return NextResponse.json({ ok: true, vaultReferenceId: requested, current });
}
