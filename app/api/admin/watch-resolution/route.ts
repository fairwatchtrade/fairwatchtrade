import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/* ════════════════════════════════════════════════════════════════════════
   /api/admin/watch-resolution — the one door into exact-watch adjudication

   GET             advisory candidates awaiting a human
   GET ?bead=…     what is currently concluded about one bead, plus the
                   decision history of every pair it belongs to
   POST            confirm | non-match | retract

   ── WHY THE CLIENT CANNOT AUTHOR A DECISION ────────────────────────────
   It posts an INTENT. Everything that makes the intent safe — canonical
   pair ordering, linear supersession, generation assignment, full-closure
   conflict recomputation, resolved-id retirement and mint, membership
   refresh — happens inside one governed database transaction that the
   browser cannot reach. There is no request shape through which a caller
   can write a decision row, name a generation, or nominate a resolved id.

   ── WHY THERE IS NO "MERGE" ────────────────────────────────────────────
   Confirming two beads are the same watch does NOT move data. No bead is
   deleted, no listing is reparented, no 06C observation changes hands. The
   conclusion is an edge in a log; the beads are exactly where they were.
   If this route ever appears to need a merge, something upstream has been
   misunderstood.

   ── WHAT IS DELIBERATELY NOT RETURNED ──────────────────────────────────
   Equality tokens. They are sensitive infrastructure — a token handed to a
   browser is an oracle for testing guessed serials. Candidates carry the
   observation ids and their comparability domain, never the token itself,
   and never a raw identifier.

   ── AUTOMATED INFERENCE MAY NOT CONFIRM ────────────────────────────────
   Candidates are computed by machine. Confirmation is not available to
   one: the only POST path is founder-gated, and no scored, probabilistic,
   or similarity-derived caller exists anywhere in this round.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

const OUTCOMES = ["CONFIRMED_SAME_WATCH", "EXPLICIT_NON_MATCH", "RETRACTED"] as const;
type Outcome = (typeof OUTCOMES)[number];
const isOutcome = (v: unknown): v is Outcome =>
  typeof v === "string" && (OUTCOMES as readonly string[]).includes(v);

/* Never includes equality_token. Absent by construction, not by filtering. */
const DECISION_COLUMNS =
  "id, decision_generation, left_physical_watch_id, right_physical_watch_id, outcome, evidence_observation_ids, evidence_note, reviewed_by, observed_at, recorded_at, chain_root_id, supersedes_id, reason";

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

export async function GET(request: NextRequest) {
  const gate = await requireFounder();
  if (gate.error) return gate.error;

  const db = createServiceClient();
  const bead = (request.nextUrl.searchParams.get("bead") ?? "").trim();

  if (bead) {
    const [{ data: resolution }, { data: history }, { data: listings }] = await Promise.all([
      db.rpc("resolve_physical_watch", { p_bead: bead }),
      db
        .from("physical_watch_resolution_decisions")
        .select(DECISION_COLUMNS)
        .or(`left_physical_watch_id.eq.${bead},right_physical_watch_id.eq.${bead}`)
        .order("decision_generation", { ascending: true }),
      /* Type-level context for the founder. Supporting only: a shared
         reference is never evidence that two objects are one object. */
      db
        .from("listings")
        .select("id, public_code, brand, model, reference, physical_watch_id")
        .eq("physical_watch_id", bead),
    ]);

    return NextResponse.json({
      bead,
      resolution: resolution ?? null,
      history: history ?? [],
      listings: listings ?? [],
    });
  }

  const { data: candidates, error } = await db.rpc("physical_watch_identifier_candidates", {
    p_limit: 100,
  });
  if (error) {
    return NextResponse.json({ error: "candidates_failed" }, { status: 500 });
  }

  /* Listing context for each bead in the candidate list, so the founder is
     looking at watches rather than uuids. */
  const beads = [
    ...new Set(
      (candidates ?? []).flatMap((c: Record<string, string>) => [
        c.left_physical_watch_id,
        c.right_physical_watch_id,
      ])
    ),
  ];
  const { data: listings } = beads.length
    ? await db
        .from("listings")
        .select("id, public_code, brand, model, reference, physical_watch_id")
        .in("physical_watch_id", beads)
    : { data: [] };

  return NextResponse.json({ candidates: candidates ?? [], listings: listings ?? [] });
}

export async function POST(request: NextRequest) {
  const gate = await requireFounder();
  if (gate.error) return gate.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const beadA = typeof body.beadA === "string" ? body.beadA.trim() : "";
  const beadB = typeof body.beadB === "string" ? body.beadB.trim() : "";
  const outcome = body.outcome;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : null;
  const evidenceNote =
    typeof body.evidenceNote === "string" ? body.evidenceNote.trim().slice(0, 1000) : null;
  const observedAt = typeof body.observedAt === "string" ? body.observedAt : null;
  const evidenceIds = Array.isArray(body.evidenceObservationIds)
    ? (body.evidenceObservationIds as unknown[]).filter((v): v is string => typeof v === "string")
    : [];

  if (!beadA || !beadB) {
    return NextResponse.json({ error: "bad_request", detail: "Two beads required." }, { status: 400 });
  }
  if (!isOutcome(outcome)) {
    return NextResponse.json(
      { error: "bad_request", detail: "outcome must be a governed resolution outcome." },
      { status: 400 }
    );
  }
  if (outcome === "RETRACTED" && !reason) {
    /* A withdrawal without a stated reason is indistinguishable from a
       mistake, and the database refuses it too. */
    return NextResponse.json(
      { error: "bad_request", detail: "A retraction must state why." },
      { status: 400 }
    );
  }

  const db = createServiceClient();
  const { data, error } = await db.rpc("adjudicate_physical_watch_pair", {
    p_bead_a: beadA,
    p_bead_b: beadB,
    p_outcome: outcome,
    p_reviewed_by: gate.user!.id,
    p_evidence_ids: evidenceIds,
    p_evidence_note: evidenceNote,
    p_reason: reason,
    p_observed_at: observedAt,
  });

  if (error) {
    /* Bounded governed codes only — the database message is not forwarded. */
    const known = new Set([
      "invalid_pair",
      "nothing_to_retract",
      "pair_already_unresolved",
      "supersession_crosses_canonical_pair",
      "supersession_crosses_chain",
      "decision_log_is_append_only",
    ]);
    const matched = [...known].find((k) => error.message.includes(k));
    return NextResponse.json(
      { error: "adjudication_failed", reason: matched ?? "rejected" },
      { status: 400 }
    );
  }

  /* Return the resulting BELIEF, not just an id — the founder should see
     what the graph now says, including a conflict their decision created. */
  const { data: resolution } = await db.rpc("resolve_physical_watch", { p_bead: beadA });
  return NextResponse.json({ ok: true, decisionId: data, resolution }, { status: 201 });
}
