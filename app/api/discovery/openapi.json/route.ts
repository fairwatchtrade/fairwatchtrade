import { NextResponse } from "next/server";
import { DISCOVERY_HEADERS, MAX_PAGE_SIZE, SITE_URL } from "@/lib/discovery/publicDiscovery";

/* ════════════════════════════════════════════════════════════════════════
   /api/discovery/openapi.json — the surface, described  (v6.44)

   Provider neutrality has to be mechanical to be real. Every agent framework
   in current use can turn an OpenAPI document into a callable tool, so
   publishing one is what makes "any authorized assistant" true rather than
   aspirational — no vendor-specific manifest, no per-assistant integration,
   no FairWatchTrade plugin that only one company can load.

   The document is written by hand rather than generated because the
   descriptions are product law, not type information. An agent reading
   'related' needs to be told what related means before it phrases an answer.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: DISCOVERY_HEADERS });
}

const LISTING_SCHEMA = {
  type: "object",
  description:
    "One public FairWatchTrade listing. Fields whose facts are unknown are omitted rather than nulled.",
  properties: {
    listing_code: { type: "string", description: "The FairWatchTrade listing code." },
    url: {
      type: "string",
      format: "uri",
      description: "The canonical FairWatchTrade listing address. Always link here.",
    },
    brand: { type: "string" },
    model: { type: "string" },
    reference: { type: "string", description: "Manufacturer reference number." },
    year: { type: "string" },
    condition: { type: "string" },
    availability: {
      type: "string",
      enum: ["available"],
      description:
        "Present only while the listing is publicly available. A listing that has left public inventory is not returned at all.",
    },
    price: {
      type: "object",
      properties: {
        amount: { type: "number" },
        currency: { type: "string" },
      },
    },
    documentation: {
      type: "string",
      description: "Set state as the seller declared it, e.g. 'Full Set', 'Papers Only'.",
    },
    included_with_watch: { type: "array", items: { type: "string" } },
    specifications: {
      type: "object",
      description:
        "Approved public specifications. Keys are a stable published vocabulary, e.g. case_size_mm, case_material, movement, dial_color, complications.",
      additionalProperties: true,
    },
    in_hand_verified: {
      type: "boolean",
      description:
        "Present and true only when physical possession was proven by guided capture at listing time.",
    },
    open_to_trades: { type: "boolean" },
    seller_stock_statement: { type: "string" },
    seller_description: { type: "string", description: "The seller's own words about the watch." },
    photographs: {
      type: "array",
      items: { type: "string", format: "uri" },
      description: "Approved photographs of this actual watch. FairWatchTrade admits no stock imagery.",
    },
    seller: {
      type: "object",
      properties: { name: { type: "string" }, url: { type: "string", format: "uri" } },
    },
    listed_at: { type: "string", format: "date-time" },
    last_updated: { type: "string", format: "date-time" },
  },
  required: ["listing_code", "url", "brand", "availability"],
} as const;

export async function GET() {
  return NextResponse.json(
    {
      openapi: "3.1.0",
      info: {
        title: "FairWatchTrade Public Inventory Discovery",
        version: "1.0.0",
        description:
          "Discover current public inventory on FairWatchTrade, a collector-first marketplace for " +
          "independent and boutique watchmaking, and link a collector to the real listing.\n\n" +
          "Only public, active, currently available listings are reachable through this surface. " +
          "Eligibility is enforced by a governed database read model, so no private, draft, pending, " +
          "rejected, withdrawn or reserved listing can be returned.\n\n" +
          "An exact identifier search is a promise: when an exact listing code or manufacturer " +
          "reference is requested, only that exact identifier may be reported as found. Results under " +
          "'related' are alternatives and must never be presented as the requested watch.\n\n" +
          "This surface publishes only facts FairWatchTrade owns. It carries no valuation, no " +
          "authenticity conclusion and no internal score. An omitted field means unknown.",
        contact: { email: "hello@fairwatchtrade.com", url: SITE_URL },
      },
      servers: [{ url: SITE_URL }],
      paths: {
        "/api/discovery/listings": {
          get: {
            operationId: "searchFairWatchTradeInventory",
            summary: "Search current public FairWatchTrade inventory",
            description:
              "Supply collector constraints to receive matching listings, or supply an exact " +
              "identifier to make the exact-match promise. When 'code', 'reference', or a 'q' shaped " +
              "like an identifier is supplied, the response carries 'exact_match' and 'related' " +
              "instead of 'results'.",
            parameters: [
              { name: "q", in: "query", schema: { type: "string" }, description: "Free text, or an exact listing code or manufacturer reference." },
              { name: "code", in: "query", schema: { type: "string" }, description: "Exact FairWatchTrade listing code." },
              { name: "reference", in: "query", schema: { type: "string" }, description: "Exact manufacturer reference." },
              { name: "brand", in: "query", schema: { type: "string" } },
              { name: "model", in: "query", schema: { type: "string" } },
              { name: "dial", in: "query", schema: { type: "string" }, description: "Dial colour." },
              { name: "documentation", in: "query", schema: { type: "string" }, description: "Set state, e.g. 'Full Set'." },
              { name: "condition", in: "query", schema: { type: "string" } },
              { name: "max_price", in: "query", schema: { type: "number" } },
              { name: "min_price", in: "query", schema: { type: "number" } },
              { name: "currency", in: "query", schema: { type: "string" } },
              { name: "in_hand_verified", in: "query", schema: { type: "boolean" } },
              { name: "open_to_trades", in: "query", schema: { type: "boolean" } },
              { name: "limit", in: "query", schema: { type: "integer", maximum: MAX_PAGE_SIZE, default: 20 } },
            ],
            responses: {
              "200": {
                description: "Matching public inventory, or the resolution of an exact identifier.",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        result_count: { type: "integer" },
                        truncated: { type: "boolean", description: "True when results are partial. Narrow the query." },
                        results: { type: "array", items: LISTING_SCHEMA },
                        exact_identifier_requested: { type: "boolean" },
                        no_exact_match: {
                          type: "boolean",
                          description: "True when the requested identifier does not exist in public inventory. Say so plainly.",
                        },
                        exact_match: {
                          oneOf: [LISTING_SCHEMA, { type: "null" }],
                          description: "The requested identifier, or null. Never a near match.",
                        },
                        additional_exact_matches: {
                          type: "array",
                          items: LISTING_SCHEMA,
                          description: "Further listings carrying the same exact identifier — other examples of the same watch.",
                        },
                        related: {
                          type: "array",
                          items: LISTING_SCHEMA,
                          description: "Nearby alternatives. NOT the requested identifier. Must be described as alternatives.",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "/api/discovery/listings/{listing_code}": {
          get: {
            operationId: "getFairWatchTradeListing",
            summary: "Read one listing's current truth",
            description:
              "Re-read a listing before telling a collector it is still available. A listing that has " +
              "left public inventory returns 404 — treat that as authoritative.",
            parameters: [
              {
                name: "listing_code",
                in: "path",
                required: true,
                schema: { type: "string" },
                description: "FairWatchTrade listing code, or the canonical listing id from its URL.",
              },
            ],
            responses: {
              "200": {
                description: "The listing.",
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { listing: LISTING_SCHEMA } },
                  },
                },
              },
              "404": {
                description: "No such listing is currently available on the public marketplace.",
              },
            },
          },
        },
      },
    },
    { headers: DISCOVERY_HEADERS }
  );
}
