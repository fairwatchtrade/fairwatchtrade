import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_PAGE_SIZE,
  DISCOVERY_HEADERS,
  MAX_PAGE_SIZE,
  createDiscoveryClient,
  findExact,
  findRelated,
  looksLikeListingCode,
  looksLikeReference,
  search,
  toRecord,
  type DiscoveryQuery,
  type ExactLookup,
} from "@/lib/discovery/publicDiscovery";

/* ════════════════════════════════════════════════════════════════════════
   /api/discovery/listings — public inventory, for the AI already in the
   collector's hand  (v6.44)

   A collector says, somewhere else entirely: "find me a Parmigiani Kalpa
   Hebdomadaire, white guilloché dial, full set, under $7,000." Their
   assistant asks this route. If FairWatchTrade has it, the assistant can say
   "here you go" and hand over the real listing.

   THE TWO ANSWER SHAPES, deliberately distinguishable in the payload

   1. AN EXACT IDENTIFIER WAS ASKED FOR — `code`, `reference`, or a `q` whose
      shape is an identifier. This is a promise under the Exact Identifier
      Search Law. The response carries `exact_match` (the object, or null) and
      `no_exact_match` with a plain sentence. Nearby identifiers appear only
      under `related`, with `related_note` saying what they are.

      Related never masquerades as found. One changed character can be a
      different case material, dial, movement, generation or watch entirely —
      so a near miss is never promoted into the answer slot, not even when it
      is the only row that came back.

   2. CONSTRAINTS WERE ASKED FOR — brand, dial, ceiling, documentation. The
      response carries `results`, and no `exact_match` key exists to be
      misread.

   THE ROUTE HOLDS NO PRIVACY LOGIC. It cannot see a private listing to
   exclude one: it reads the governed read model, which admitted its rows
   before this file ran. Nothing here can be edited into a leak, which is the
   entire point of putting the boundary in the database.

   NOT A SECOND SEARCH PRODUCT. Browse, Smart Search, Wanted and Saved Search
   remain FairWatchTrade's own experiences and are untouched by this file.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RELATED_LIMIT = 5;

const text = (v: string | null): string | null => {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed.slice(0, 120);
};

const money = (v: string | null): number | null => {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const flag = (v: string | null): boolean | null => {
  if (v === null) return null;
  const t = v.trim().toLowerCase();
  if (t === "true" || t === "1" || t === "yes") return true;
  if (t === "false" || t === "0" || t === "no") return false;
  return null;
};

function pageSize(v: string | null): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

/** Which exact promise, if any, this request made. Explicit parameters win
    over shape inference, because a caller who names the parameter has stated
    the promise rather than had it guessed for them. */
function exactLookup(params: URLSearchParams): ExactLookup | null {
  const code = text(params.get("code"));
  if (code) return { identifier: code, kind: "listing_code" };

  const reference = text(params.get("reference"));
  if (reference) return { identifier: reference, kind: "reference" };

  const q = text(params.get("q"));
  if (q && looksLikeListingCode(q)) return { identifier: q, kind: "listing_code" };
  if (q && looksLikeReference(q)) return { identifier: q, kind: "reference" };

  return null;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: DISCOVERY_HEADERS });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = pageSize(params.get("limit"));

  let supabase;
  try {
    supabase = createDiscoveryClient();
  } catch {
    /* Fail visibly rather than answering "no watches" to a question the
       surface never actually asked. An empty catalogue is a fact; a
       misconfiguration reported as an empty catalogue is a lie. */
    return NextResponse.json(
      { error: "discovery_unavailable", message: "Public discovery is temporarily unavailable." },
      { status: 503, headers: DISCOVERY_HEADERS }
    );
  }

  const lookup = exactLookup(params);

  try {
    /* ── The exact-identifier promise ──────────────────────────────────── */
    if (lookup) {
      const exact = await findExact(supabase, lookup);
      const exactIds = exact.map((r) => r.id);
      const related = await findRelated(supabase, lookup, exactIds, RELATED_LIMIT);

      return NextResponse.json(
        {
          query: { identifier: lookup.identifier, identifier_type: lookup.kind },
          exact_identifier_requested: true,
          no_exact_match: exact.length === 0,
          message:
            exact.length === 0
              ? "No exact match found."
              : `Exact match found on FairWatchTrade for ${lookup.identifier}.`,
          exact_match: exact.length > 0 ? toRecord(exact[0]) : null,
          /* More than one public listing can genuinely carry the same
             manufacturer reference — two examples of the same watch. All of
             them are exact; none of them is "related". */
          additional_exact_matches:
            exact.length > 1 ? exact.slice(1).map(toRecord) : [],
          related: related.map(toRecord),
          related_note:
            "Related results are nearby alternatives on FairWatchTrade. They are NOT the requested identifier and must not be presented as it.",
        },
        { headers: DISCOVERY_HEADERS }
      );
    }

    /* ── Ordinary collector constraints ────────────────────────────────── */
    const query: DiscoveryQuery = {
      text: text(params.get("q")),
      brand: text(params.get("brand")),
      model: text(params.get("model")),
      dial: text(params.get("dial")),
      documentation: text(params.get("documentation")),
      condition: text(params.get("condition")),
      maxPrice: money(params.get("max_price")),
      minPrice: money(params.get("min_price")),
      currency: text(params.get("currency")),
      inHandVerified: flag(params.get("in_hand_verified")),
      openToTrades: flag(params.get("open_to_trades")),
      limit,
    };

    const { rows, truncated } = await search(supabase, query);

    return NextResponse.json(
      {
        query: {
          text: query.text,
          brand: query.brand,
          model: query.model,
          dial: query.dial,
          documentation: query.documentation,
          condition: query.condition,
          max_price: query.maxPrice,
          min_price: query.minPrice,
          currency: query.currency,
          in_hand_verified: query.inHandVerified,
          open_to_trades: query.openToTrades,
          limit: query.limit,
        },
        result_count: rows.length,
        /* Stated, never silent: a capped sweep that reads as complete is the
           defect this field exists to prevent. */
        truncated,
        truncation_note: truncated
          ? "Inventory exceeded this surface's fetch bound; results are partial. Narrow the query."
          : null,
        results: rows.map(toRecord),
      },
      { headers: DISCOVERY_HEADERS }
    );
  } catch (err) {
    console.error("[discovery] listings query failed", err);
    return NextResponse.json(
      { error: "discovery_failed", message: "Public discovery could not complete that query." },
      { status: 500, headers: DISCOVERY_HEADERS }
    );
  }
}
