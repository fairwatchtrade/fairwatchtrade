import { NextResponse } from "next/server";
import {
  DISCOVERY_HEADERS,
  MAX_PAGE_SIZE,
  SITE_URL,
  createDiscoveryClient,
} from "@/lib/discovery/publicDiscovery";

/* ════════════════════════════════════════════════════════════════════════
   /api/discovery — the front door for machines  (v6.44)

   An agent that has never seen FairWatchTrade before fetches this and learns
   what is here, what it may ask, and what it must not claim. Provider-neutral
   on purpose: this is not built for one assistant vendor, and FairWatchTrade
   inventory truth must never become proprietary to one of them.

   WHY A DESCRIPTOR AND NOT JUST ENDPOINTS. An assistant deciding whether to
   trust a marketplace needs to know the boundary before it reads a single
   watch: what is admitted, what is never exposed, and what the surface will
   not manufacture. Publishing that contract is how an agent knows a missing
   field means "unknown" rather than "not looked up" — and how it knows a
   near-miss reference is not the watch that was asked for.

   The live inventory count is read at request time so this document cannot
   drift away from the inventory it describes.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: DISCOVERY_HEADERS });
}

export async function GET() {
  let available: number | null = null;
  try {
    const supabase = createDiscoveryClient();
    const { count } = await supabase
      .from("public_discovery_listings")
      .select("id", { count: "exact", head: true });
    available = typeof count === "number" ? count : null;
  } catch {
    /* The descriptor is still true without a count. It stays null rather than
       reporting a number nobody measured. */
    available = null;
  }

  return NextResponse.json(
    {
      name: "FairWatchTrade Public Inventory Discovery",
      description:
        "A collector-first marketplace for independent and boutique watchmaking. This surface lets an " +
        "assistant discover current public FairWatchTrade inventory and link a collector to the real listing.",
      site: SITE_URL,
      version: "1.0",
      listings_available: available,

      endpoints: {
        search: {
          method: "GET",
          url: `${SITE_URL}/api/discovery/listings`,
          description:
            "Search current public inventory by collector constraints, or resolve an exact identifier.",
          parameters: {
            q: "Free text, or an exact FairWatchTrade listing code or manufacturer reference.",
            code: "Exact FairWatchTrade listing code. Makes the exact-identifier promise explicitly.",
            reference: "Exact manufacturer reference. Makes the exact-identifier promise explicitly.",
            brand: "Manufacturer name, partial match.",
            model: "Model or collection name, partial match.",
            dial: "Dial colour, partial match.",
            documentation:
              "Set state, e.g. 'Full Set', 'Papers Only', 'No Box or Papers'. Partial match.",
            condition: "Stated condition, partial match.",
            max_price: "Price ceiling, in the listing currency.",
            min_price: "Price floor, in the listing currency.",
            currency: "ISO currency code, e.g. USD.",
            in_hand_verified: "true to return only listings whose physical possession was proven at listing time.",
            open_to_trades: "true to return only listings whose seller will consider a trade.",
            limit: `Results to return. Default 20, maximum ${MAX_PAGE_SIZE}.`,
          },
        },
        listing: {
          method: "GET",
          url: `${SITE_URL}/api/discovery/listings/{listing_code}`,
          description:
            "Re-read one listing's current truth by FairWatchTrade listing code or canonical listing id. " +
            "Returns 404 once a watch leaves public inventory.",
        },
        schema: {
          method: "GET",
          url: `${SITE_URL}/api/discovery/openapi.json`,
          description: "OpenAPI 3.1 description of this surface.",
        },
      },

      /* The boundary, stated to the machine that is about to read across it. */
      inventory_scope: {
        included: "Public, active, currently available marketplace listings.",
        excluded: [
          "private listings",
          "drafts",
          "listings pending review",
          "rejected listings",
          "withdrawn, removed or deleted listings",
          "reserved listings with an accepted offer",
          "any internal review, evidence or moderation state",
          "private correspondence and private buyer or seller data",
        ],
        enforcement:
          "Eligibility is enforced by a governed database read model, not by query construction. " +
          "There is no supported external path by which a non-public listing can be returned.",
      },

      usage_rules: {
        exact_identifier:
          "An exact identifier search is a promise. When an exact FairWatchTrade listing code or " +
          "manufacturer reference is requested, only that exact identifier may be presented as found. " +
          "Nearby results arrive under 'related' and must be described as alternatives, never as the " +
          "requested watch. One changed character can be a different case material, dial, movement, " +
          "generation or watch entirely.",
        missing_fields:
          "An omitted field means the fact is unknown, not that it is absent from the watch. Do not " +
          "infer it, and do not fill it from another source and attribute it to FairWatchTrade.",
        no_manufactured_claims:
          "This surface publishes only facts FairWatchTrade owns. It carries no valuation, no " +
          "authenticity conclusion, and no internal score. Do not present any such claim as coming " +
          "from FairWatchTrade.",
        freshness:
          "Availability is current at the time of the response. Re-read a listing before telling a " +
          "collector it is still available.",
        transaction:
          "Discovery ends at the listing. Purchase, offers and trades happen on FairWatchTrade through " +
          "its own governed controls. Do not attempt to transact through this surface.",
        linking:
          "Always link a collector to the canonical 'url' on the record. Never reproduce a listing as " +
          "a standalone copy.",
      },

      contact: "hello@fairwatchtrade.com",
    },
    { headers: DISCOVERY_HEADERS }
  );
}
