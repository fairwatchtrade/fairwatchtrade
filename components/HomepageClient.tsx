"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   MARKETPLACE CLIENT — components/HomepageClient.tsx  (v1.94)

   The place, not the promise. The analog clock (kept verbatim from the
   coming-soon page, shrunk to an 80px ambient element) still ticks; the
   listings grid is the point. Nothing of the waitlist survives here — this is
   a new file, not a rewrite.

   The clock needs useState + useEffect, so this stays a client component; the
   listings are fetched by the server parent (app/marketplace/page.tsx) and
   passed in. Card treatment matches BrowseClient (defined locally, not
   imported — that component is a filtering shell, not a card library).

   ANTI-FEATURES (PRODUCT_SOUL.md): never a combined_score, save count, trend
   arrow, or urgency signal — anywhere on this page.
   ──────────────────────────────────────────────────────────────────────── */

// Same shape as BrowseClient's ListingRow, minus the private combined_score and
// the details block (not selected for this surface). Exported so the server
// page can type its cast.
export type ListingRow = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  year: string;
  condition: string;
  asking_price: number;
  photos: { photo: { url: string }; category: string }[];
  status: string;
  created_at: string;
};

// Dial photo first, fallback to the first photo. Matches /browse.
function heroUrl(listing: ListingRow): string | null {
  const photos = listing.photos ?? [];
  const dial = photos.find((p) => p?.category === "Dial");
  return (dial ?? photos[0])?.photo?.url ?? null;
}

function formatPrice(n: number): string {
  return `$${Number(n).toLocaleString("en-US")}`;
}

function ListingCard({ listing }: { listing: ListingRow }) {
  const hero = heroUrl(listing);
  const meta = [listing.condition, listing.year].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group relative block cursor-pointer border border-transparent p-7 transition hover:bg-[rgba(255,255,255,0.02)]"
    >
      <div className="mb-4 flex h-[140px] w-full items-center justify-center overflow-hidden bg-[var(--ink-deep)]">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[11px] tracking-[0.3px] text-[var(--ghost)]">
            No photo
          </div>
        )}
      </div>

      <div className="mb-[5px] text-[8px] uppercase tracking-[2.5px] text-[var(--gold-subtle)]">
        {listing.brand}
      </div>
      <div className="mb-1 font-display text-[15px] font-light leading-[1.25] text-[var(--platinum)]">
        {listing.model ?? listing.brand}
      </div>
      {meta && (
        <div className="mb-3 text-[10px] tracking-[0.3px] text-[var(--muted)]">
          {meta}
        </div>
      )}
      <div className="font-display text-[17px] font-light text-[var(--platinum-dim)]">
        {formatPrice(Number(listing.asking_price))}
      </div>
    </Link>
  );
}

export default function HomepageClient({ listings }: { listings: ListingRow[] }) {
  // Clock state — same logic as the coming-soon page.
  const [time, setTime] = useState({ hourDeg: -90, minDeg: -90, secDeg: -90 });

  useEffect(() => {
    function calcTime() {
      const now = new Date();
      const hours = now.getHours() % 12;
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      setTime({
        hourDeg: hours * 30 + minutes * 0.5,
        minDeg: minutes * 6 + seconds * 0.1,
        secDeg: seconds * 6 - 90,
      });
    }
    calcTime();
    const interval = setInterval(calcTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const { hourDeg, minDeg, secDeg } = time;

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[var(--ink)]">
      {/* Movement background art — texture only */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-10%] top-[40%] w-[55%] max-w-[560px] -translate-y-1/2 opacity-[0.015]"
      >
        <svg viewBox="0 0 500 500" fill="none" className="h-auto w-full">
          <circle cx="250" cy="250" r="230" stroke="white" strokeWidth="0.4" />
          <circle cx="250" cy="250" r="185" stroke="white" strokeWidth="0.4" />
          <circle cx="250" cy="250" r="140" stroke="white" strokeWidth="0.4" />
          <circle cx="250" cy="250" r="95" stroke="white" strokeWidth="0.4" />
          <circle cx="250" cy="250" r="50" stroke="white" strokeWidth="0.4" />
          <line x1="250" y1="20" x2="250" y2="55" stroke="white" strokeWidth="0.4" />
          <line x1="250" y1="445" x2="250" y2="480" stroke="white" strokeWidth="0.4" />
          <line x1="20" y1="250" x2="55" y2="250" stroke="white" strokeWidth="0.4" />
          <line x1="445" y1="250" x2="480" y2="250" stroke="white" strokeWidth="0.4" />
          <line x1="250" y1="250" x2="250" y2="100" stroke="white" strokeWidth="0.9" />
          <line x1="250" y1="250" x2="315" y2="250" stroke="white" strokeWidth="0.7" />
          <circle cx="250" cy="250" r="4" fill="white" />
        </svg>
      </div>

      {/* Header block */}
      <div
        className="relative z-[1] flex flex-col items-center px-6 text-center"
        style={{ paddingTop: "48px", paddingBottom: "24px" }}
      >
        {/* Clock — shrunk to 80px, ambient not centerpiece */}
        <div className="mx-auto mb-6 w-full max-w-[80px]">
          <svg
            viewBox="0 0 220 220"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label="FairWatchTrade clock"
            className="block h-auto w-full"
          >
            <circle cx="110" cy="110" r="108" stroke="rgba(201,168,76,0.12)" strokeWidth="0.5" />
            <circle cx="110" cy="110" r="100" stroke="rgba(201,168,76,0.28)" strokeWidth="1" />
            <circle cx="110" cy="110" r="93" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            <line x1="110" y1="16" x2="110" y2="26" stroke="#C9A84C" strokeWidth="1.5" />
            <line x1="110" y1="194" x2="110" y2="204" stroke="#C9A84C" strokeWidth="1.5" />
            <line x1="16" y1="110" x2="26" y2="110" stroke="#C9A84C" strokeWidth="1.5" />
            <line x1="194" y1="110" x2="204" y2="110" stroke="#C9A84C" strokeWidth="1.5" />
            <line x1="158.4" y1="21.6" x2="153.4" y2="30.3" stroke="rgba(201,168,76,0.3)" strokeWidth="0.8" />
            <line x1="198.4" y1="61.6" x2="189.7" y2="66.6" stroke="rgba(201,168,76,0.3)" strokeWidth="0.8" />
            <line x1="198.4" y1="158.4" x2="189.7" y2="153.4" stroke="rgba(201,168,76,0.3)" strokeWidth="0.8" />
            <line x1="158.4" y1="198.4" x2="153.4" y2="189.7" stroke="rgba(201,168,76,0.3)" strokeWidth="0.8" />
            <line x1="61.6" y1="198.4" x2="66.6" y2="189.7" stroke="rgba(201,168,76,0.3)" strokeWidth="0.8" />
            <line x1="21.6" y1="158.4" x2="30.3" y2="153.4" stroke="rgba(201,168,76,0.3)" strokeWidth="0.8" />
            <line x1="21.6" y1="61.6" x2="30.3" y2="66.6" stroke="rgba(201,168,76,0.3)" strokeWidth="0.8" />
            <line x1="61.6" y1="21.6" x2="66.6" y2="30.3" stroke="rgba(201,168,76,0.3)" strokeWidth="0.8" />
            <text x="110" y="50" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="11" fill="rgba(232,228,220,0.55)" letterSpacing="1">XII</text>
            <text x="170" y="114" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="11" fill="rgba(232,228,220,0.38)" letterSpacing="1">III</text>
            <text x="110" y="178" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="11" fill="rgba(232,228,220,0.38)" letterSpacing="1">VI</text>
            <text x="50" y="114" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="11" fill="rgba(232,228,220,0.38)" letterSpacing="1">IX</text>
            <text x="110" y="96" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="8" fill="rgba(201,168,76,0.4)" letterSpacing="2">FW</text>
            <text x="110" y="106" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="5.5" fill="rgba(201,168,76,0.28)" letterSpacing="1.5">FAIRWATCHTRADE</text>
            <g style={{ transformOrigin: "110px 110px", transform: `rotate(${hourDeg}deg)` }}>
              <line x1="110" y1="110" x2="110" y2="48" stroke="#E8E4DC" strokeWidth="1.2" strokeLinecap="round" />
            </g>
            <g style={{ transformOrigin: "110px 110px", transform: `rotate(${minDeg}deg)` }}>
              <line x1="110" y1="110" x2="110" y2="34" stroke="#E8E4DC" strokeWidth="1" strokeLinecap="round" />
            </g>
            <g className="second-hand" style={{ transformOrigin: "110px 110px", transform: `rotate(${secDeg}deg)` }}>
              <line x1="110" y1="122" x2="110" y2="40" stroke="#C9A84C" strokeWidth="0.8" strokeLinecap="round" opacity="0.7" />
            </g>
            <circle cx="110" cy="110" r="3" fill="#C9A84C" />
            <circle cx="110" cy="110" r="1.5" fill="#0D0F14" />
          </svg>
        </div>

        <h1 className="mb-4 max-w-[540px] font-display text-[28px] font-light leading-[1.3] tracking-[0.3px] text-[var(--platinum)]">
          A marketplace <span className="text-[var(--gold)]">worthy</span>
          <br />
          of the watches within it.
        </h1>

        <div className="fw-rule" />
      </div>

      {/* Listings grid */}
      <div className="relative z-[1] mx-auto w-full max-w-7xl px-6 pb-16 sm:px-8">
        {listings.length === 0 ? (
          <div className="py-16 text-center">
            <div className="font-display text-[14px] font-light italic text-[var(--ghost)]">
              No listings yet.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
