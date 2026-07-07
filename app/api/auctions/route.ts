import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeSourceUrl,
  statusOf,
  type Auction,
} from "@/lib/auctions";
import auctionsData from "@/data/auctions.json";

/* ════════════════════════════════════════════════════════════════════════
   GET /api/auctions — the auction data CONTRACT   (v2.5b · merged v2.5d)

   This route is not the source. It is the abstraction boundary.

   v2.5d — TWO sources now feed the seam, merged under the migration law:
     data/auctions.json  +  auction_events (Supabase, admin paste-to-parse)
   Both normalize to the same contract; duplicates resolve with the
   TABLE winning. JSON is NOT retired by the existence of table rows —
   it retires later, deliberately, once the table is mature. The UI
   never knows any of this; it consumes THIS contract and never imports
   data directly. MarketBar must never care where auction data came
   from; that is the entire point of this seam.

   Merge identity (dedupe), in order — table wins on any match:
     1. normalized URL: a JSON entry's catalogUrl equals a table row's
        source_url_normalized or normalized catalog_url
     2. composite: house + title/sale (case-insensitive) + same UTC
        calendar day of start + city/location (case-insensitive)
   (normalizeSourceUrl is the shared law in @/lib/auctions.)

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

type EventRow = {
  id: string;
  auction_house: string;
  auction_title: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  catalog_url: string | null;
  source_url_normalized: string | null;
  online_only: boolean | null;
};

/** auction_events row → the same raw shape normalize() already accepts. */
function rowToRaw(r: EventRow) {
  return {
    id: `db-${r.id}`,
    house: r.auction_house,
    sale: r.auction_title,
    city: r.location ?? "",
    start: r.starts_at,
    end: r.ends_at ?? undefined,
    catalogUrl: r.catalog_url ?? undefined,
    onlineOnly: r.online_only === true,
  };
}

const dayOf = (iso: string) => iso.slice(0, 10);
const ci = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

export async function GET() {
  const now = Date.now();

  // Source 2 (v2.5d): admin-entered table rows. A read failure fails open
  // to JSON-only — the bar never goes dark because the table hiccuped.
  let eventRows: EventRow[] = [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("auction_events")
      .select(
        "id, auction_house, auction_title, location, starts_at, ends_at, catalog_url, source_url_normalized, online_only"
      );
    if (Array.isArray(data)) eventRows = data as EventRow[];
  } catch {
    /* fail open — JSON-only this response */
  }

  const tableAuctions = eventRows
    .map((r) => normalize(rowToRaw(r), now))
    .filter((a): a is AuctionOut => a !== null);

  // Merge law: JSON entries survive UNLESS a table row claims the same
  // identity — then the table wins. JSON is never dropped wholesale.
  const jsonSource: unknown[] = Array.isArray(auctionsData) ? auctionsData : [];
  const jsonAuctions = jsonSource
    .map((r) => normalize(r, now))
    .filter((a): a is AuctionOut => a !== null)
    .filter((j) => {
      const jUrl = j.catalogUrl ? normalizeSourceUrl(j.catalogUrl) : null;
      const claimedByTable = eventRows.some((row) => {
        // 1 · normalized-URL identity
        if (jUrl) {
          const rowCat = row.catalog_url ? normalizeSourceUrl(row.catalog_url) : null;
          if (row.source_url_normalized === jUrl || (rowCat !== null && rowCat === jUrl)) {
            return true;
          }
        }
        // 2 · composite identity — house + title + same UTC day + location
        return (
          ci(row.auction_house) === ci(j.house) &&
          ci(row.auction_title) === ci(j.sale) &&
          dayOf(row.starts_at) === dayOf(j.start) &&
          ci(row.location) === ci(j.city)
        );
      });
      return !claimedByTable; // table wins; unclaimed JSON entries survive
    });

  const auctions = [...tableAuctions, ...jsonAuctions]
    .sort((a, b) => {
      const la = a.status === "live";
      const lb = b.status === "live";
      if (la !== lb) return la ? -1 : 1;
      return Date.parse(a.start) - Date.parse(b.start);
    });

  return NextResponse.json({ serverNow: now, auctions });
}
