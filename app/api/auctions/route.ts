import { NextResponse } from "next/server";
import { statusOf, type Auction } from "@/lib/auctions";
import auctionsData from "@/data/auctions.json";

/* ════════════════════════════════════════════════════════════════════════
   GET /api/auctions — the auction data CONTRACT   (v2.5b)

   This route is not the source. It is the abstraction boundary.

   Today it reads data/auctions.json (the manual source, unchanged). Later
   it can read an auction_events table, admin entries, or official feeds —
   and the UI never knows, because the UI consumes THIS contract and never
   imports the data directly. MarketBar must never care where auction data
   came from; that is the entire point of this seam.

   ── THE CONTRACT (stable — future backends must satisfy exactly this) ──
   200 OK:
   {
     "serverNow": number,            // ms epoch at time of response
     "auctions": [
       {
         "id": string,
         "house": string,
         "sale": string,
         "city": string,
         "start": string,            // ISO 8601
         "end": string,              // ISO 8601, ALWAYS resolved
                                     // (source default start+6h applied here)
         "catalogUrl": string | null,
         "onlineOnly": boolean,
         "status": "live" | "upcoming"
       }
     ]
   }
   · "past" records never leave the server — filtering happens HERE,
     against real request time, never via client-side epoch tricks.
   · Ordering: live first, then soonest start — matching MarketBar's
     historical presentation so the swap is visually invisible.
   · Malformed source records are dropped, never crash the endpoint.

   statusOf() semantics untouched — used, not modified.
   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

// Status must reflect the actual request moment, not a cached one — an
// auction crossing its start boundary should read "live" on the next fetch.
export const dynamic = "force-dynamic";

const SIX_HOURS_MS = 6 * 36e5; // mirror of statusOf()'s default end

type AuctionOut = {
  id: string;
  house: string;
  sale: string;
  city: string;
  start: string;
  end: string;
  catalogUrl: string | null;
  onlineOnly: boolean;
  status: "live" | "upcoming";
};

/** Defensive normalization: the JSON is hand-maintained; a bad record is
 *  dropped, never fatal. Every surviving record conforms to the contract. */
function normalize(raw: unknown, now: number): AuctionOut | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  const house = typeof r.house === "string" ? r.house : "";
  const sale = typeof r.sale === "string" ? r.sale : "";
  const city = typeof r.city === "string" ? r.city : "";
  const start = typeof r.start === "string" ? r.start : "";
  if (!id || !house || !start || isNaN(Date.parse(start))) return null;

  const a: Auction = {
    id,
    house,
    sale,
    city,
    start,
    end: typeof r.end === "string" && !isNaN(Date.parse(r.end)) ? r.end : undefined,
    catalogUrl: typeof r.catalogUrl === "string" ? r.catalogUrl : undefined,
    onlineOnly: r.onlineOnly === true,
  };

  const status = statusOf(a, now);
  if (status === "past") return null; // past never leaves the server

  const endMs = a.end ? Date.parse(a.end) : Date.parse(a.start) + SIX_HOURS_MS;

  return {
    id: a.id,
    house: a.house,
    sale: a.sale,
    city: a.city,
    start: a.start,
    end: new Date(endMs).toISOString(),
    catalogUrl: a.catalogUrl ?? null,
    onlineOnly: a.onlineOnly === true,
    status,
  };
}

export async function GET() {
  const now = Date.now();

  const source: unknown[] = Array.isArray(auctionsData) ? auctionsData : [];
  const auctions = source
    .map((r) => normalize(r, now))
    .filter((a): a is AuctionOut => a !== null)
    .sort((a, b) => {
      const la = a.status === "live";
      const lb = b.status === "live";
      if (la !== lb) return la ? -1 : 1;
      return Date.parse(a.start) - Date.parse(b.start);
    });

  return NextResponse.json({ serverNow: now, auctions });
}
