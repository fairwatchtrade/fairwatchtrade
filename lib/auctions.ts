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
