export type Auction = {
  id: string;
  house: string;
  sale: string;
  city: string;
  start: string; // ISO 8601, e.g. "2026-06-24T09:00:00Z"
  end?: string; // ISO 8601. Defaults to start + 6h if omitted.
  catalogUrl?: string;
  onlineOnly?: boolean;
};

export type AuctionStatus = "live" | "upcoming" | "past";

export function statusOf(a: Auction, now: number = Date.now()): AuctionStatus {
  const start = Date.parse(a.start);
  const end = a.end ? Date.parse(a.end) : start + 6 * 36e5;
  if (now >= start && now <= end) return "live";
  return now < start ? "upcoming" : "past";
}

/* ── Source-URL normalization (v2.5d) — THE identity law ─────────────────
   The primary dedupe key for auction events, shared by the admin save
   route (write-time identity) and /api/auctions (merge-time identity).
   One implementation, one law:
     · lowercase scheme + host
     · strip fragment (#…)
     · strip tracking params (utm_*, fbclid, gclid, mc_cid, mc_eid)
     · strip trailing slash on the path
   Returns null for non-URLs — provenance text keeps no primary key. */
const TRACKING_PARAMS = ["fbclid", "gclid", "mc_cid", "mc_eid"];

export function normalizeSourceUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    u.hash = "";
    const params = u.searchParams;
    [...params.keys()].forEach((k) => {
      if (
        k.toLowerCase().startsWith("utm_") ||
        TRACKING_PARAMS.includes(k.toLowerCase())
      ) {
        params.delete(k);
      }
    });
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return null;
  }
}
