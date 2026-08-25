import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  findCanonicalCandidates,
  searchVaultReferences,
} from "@/lib/identity/canonicalReferenceResolver";

/* ════════════════════════════════════════════════════════════════════════
   /api/admin/auctions/lots/[lotId]/identity — the one-lot adjudication seam

   GET   the lot's raw identity evidence, its current governed decision if
         one exists, and the deterministic canonical candidates the existing
         resolver produces from that evidence (+ `?q=` to search the Vault).
   POST  { outcome, candidates[], reviewReason, expectedCurrentDecisionId }
         — recorded ONLY through identity_resolution_review_case.

   THIS ROUTE WRITES NOTHING ITSELF. Every decision goes through the existing
   governed RPC, which owns the case row, the supersession chain, the
   claim fingerprint, the candidate-role arithmetic and the optimistic
   concurrency check. A second writer for identity would be a second truth.

   ⚠ AN EXACT DECISION HERE DOES NOT PUBLISH ANYTHING. Monaco's rights and
   publication state are governed separately and are deliberately untouched:
   this seam records what the lot IS, never what may be shown. A lot can be
   canonically resolved and still correctly absent from public Market
   Evidence, and that absence is not a bug in this round.

   THE RESOLVER IS REUSED, NOT REIMPLEMENTED. findCanonicalCandidates applies
   the same brand-constrained exact-reference rule the Sell Flow uses, so an
   auction lot and a listing cannot drift into two different ideas of what
   "the same reference" means. searchVaultReferences is the founder's escape
   hatch for the ordinary case where the catalogue text is not the Vault's
   text — a human is allowed to know something the strings do not say.

   TWO INDEPENDENT GATES, the established admin shape: the page runs its own
   founder check and this route runs its own, with the UID as a hardcoded
   literal in THIS file. Neither surface trusts the other.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Defense-in-depth: hardcoded literal here, independent of the page's check.
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

/* The three this seam offers. The governed RPC also accepts related,
   probable and rejected; those carry product meaning this step has not
   ruled on, so the route refuses them rather than quietly widening the
   founder's vocabulary ahead of the decision to have them. */
const OFFERED_OUTCOMES = ["exact", "ambiguous", "unresolved"] as const;
type OfferedOutcome = (typeof OFFERED_OUTCOMES)[number];

type CandidateInput = {
  vaultReferenceId?: unknown;
  role?: unknown;
  evidence?: unknown;
};

async function requireFounder() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" as const, status: 401, user: null };
  if (user.id !== ADMIN_USER_ID)
    return { error: "forbidden" as const, status: 403, user: null };
  return { error: null, status: 200, user };
}

/** Lot evidence + current decision, read on the trusted client. */
async function readLot(lotId: string) {
  const db = createServiceClient();

  const { data: lot } = await db
    .from("auction_evidence_lot")
    .select("id, sale_id, lot_number, brand_text, model_text, reference_text, description")
    .eq("id", lotId)
    .maybeSingle();
  if (!lot) return null;

  const { data: sale } = await db
    .from("auction_evidence_sale")
    .select("id, sale_name, sale_date")
    .eq("id", lot.sale_id)
    .maybeSingle();

  const { data: kase } = await db
    .from("identity_resolution_case")
    .select("id")
    .eq("auction_lot_id", lotId)
    .maybeSingle();

  let decision: Record<string, unknown> | null = null;
  let candidates: Array<Record<string, unknown>> = [];
  if (kase) {
    const { data: d } = await db
      .from("identity_resolution_decision")
      .select("id, outcome, review_reason, reviewed_at, reviewed_by")
      .eq("case_id", kase.id)
      .eq("is_current", true)
      .maybeSingle();
    decision = d ?? null;
    if (d) {
      const { data: c } = await db
        .from("identity_resolution_candidate")
        .select("vault_reference_id, vault_variant_id, candidate_role, evidence, ordinal")
        .eq("decision_id", d.id)
        .order("ordinal");
      candidates = c ?? [];
    }
  }

  return { lot, sale, hasCase: !!kase, decision, candidates };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lotId: string }> }
) {
  const gate = await requireFounder();
  if (gate.error)
    return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { lotId } = await params;
  const found = await readLot(lotId);
  if (!found) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const q = request.nextUrl.searchParams.get("q") ?? "";

  /* The deterministic answer and the founder's search are returned
     together and kept apart. One is what the machinery concludes from the
     catalogue text; the other is what the founder went looking for. The UI
     labels each by provenance so a decision never records a search hit as
     though the resolver had proposed it. */
  const [suggested, searched] = await Promise.all([
    findCanonicalCandidates({
      brand: found.lot.brand_text ?? "",
      model: found.lot.model_text ?? "",
      reference: found.lot.reference_text ?? "",
    }),
    q.trim() ? searchVaultReferences(q, 25) : Promise.resolve([]),
  ]);

  return NextResponse.json(
    {
      lot: found.lot,
      sale: found.sale,
      hasCase: found.hasCase,
      decision: found.decision,
      decisionCandidates: found.candidates,
      suggested,
      searched,
      offeredOutcomes: OFFERED_OUTCOMES,
    },
    { status: 200 }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lotId: string }> }
) {
  const gate = await requireFounder();
  if (gate.error || !gate.user)
    return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { lotId } = await params;

  let body: {
    outcome?: unknown;
    candidates?: unknown;
    reviewReason?: unknown;
    expectedCurrentDecisionId?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const outcome = typeof body.outcome === "string" ? body.outcome : "";
  if (!(OFFERED_OUTCOMES as readonly string[]).includes(outcome)) {
    return NextResponse.json(
      {
        error: "invalid_outcome",
        detail: `outcome must be one of: ${OFFERED_OUTCOMES.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  const reviewReason =
    typeof body.reviewReason === "string" ? body.reviewReason.trim() : "";
  if (!reviewReason) {
    return NextResponse.json(
      {
        error: "review_reason_required",
        detail:
          "Say why this decision was made. The governed record refuses a blank reason, and a decision nobody can account for later is not evidence.",
      },
      { status: 400 }
    );
  }

  /* Shaped here, arithmetic enforced there. The RPC is the authority on how
     many candidates each outcome takes and which roles are legal; this only
     converts the request into the shape it expects and lets it refuse. */
  const raw = Array.isArray(body.candidates) ? (body.candidates as CandidateInput[]) : [];
  const candidates = raw.map((c) => ({
    vault_reference_id:
      typeof c.vaultReferenceId === "string" ? c.vaultReferenceId : null,
    role: typeof c.role === "string" ? c.role : null,
    evidence: typeof c.evidence === "string" ? c.evidence.trim() : "",
  }));

  const db = createServiceClient();

  /* Confirm the lot exists before handing an id to the writer. The RPC
     would happily open a case for a UUID that is not a lot — the FK is on
     the case row, but a typo should be a 404 here rather than an orphan
     case discovered later. */
  const { data: lot } = await db
    .from("auction_evidence_lot")
    .select("id")
    .eq("id", lotId)
    .maybeSingle();
  if (!lot) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const expected =
    typeof body.expectedCurrentDecisionId === "string" &&
    body.expectedCurrentDecisionId
      ? body.expectedCurrentDecisionId
      : null;

  const { data, error } = await db.rpc("identity_resolution_review_case", {
    p_subject_type: "auction_lot",
    p_listing_id: null,
    p_auction_lot_id: lotId,
    p_outcome: outcome as OfferedOutcome,
    p_candidates: candidates,
    p_review_reason: reviewReason,
    p_reviewer_uid: gate.user.id,
    p_expected_current_decision_id: expected,
  });

  if (error) {
    /* The RPC's refusals are the product rule speaking - one selected
       candidate for exact, two or more unselected for ambiguous, none for
       unresolved, a named current decision when correcting. Surfaced as-is
       so the founder reads the actual rule rather than a generic failure. */
    return NextResponse.json(
      { error: "review_refused", detail: error.message },
      { status: 409 }
    );
  }

  const after = await readLot(lotId);
  return NextResponse.json({ ok: true, decision: data, state: after }, { status: 200 });
}
