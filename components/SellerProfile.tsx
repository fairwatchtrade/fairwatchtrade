"use client";

import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   SELLER PROFILE — components/SellerProfile.tsx   (v1.66)

   A collector's calling card. Trust leads (left column: who they are, their
   standards), inventory follows (right column: their published listings in the
   exact Browse card treatment). "Private correspondence, public standards."

   Option (b) build — renders against existing schema only:
     • Name = display_name. • Location omitted (no column).
     • House Style section omitted (no column).
     • Collector statement always shows its "not added yet" fallback (no column).
     • Quality signal is PROSE passed from the server (raw score never here).
     • strikes / new_listings_paused_until are never received or shown.

   Card treatment is copied verbatim from BrowseClient.tsx (p-7, h-[140px]
   ink-deep image area, object-contain, gold doc pill, Cormorant title/price).
   ──────────────────────────────────────────────────────────────────────── */

type ListingPhoto = {
  photo: { url: string };
  category: string;
  isWristShot?: boolean;
};

export type SellerCardListing = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  year: string;
  condition: string;
  asking_price: number;
  photos: ListingPhoto[];
  details?: {
    dialColorType?: string;
    caseMaterial?: string;
    documentation?: string;
  } | null;
  // NOTE: combined_score is intentionally absent — stripped server-side.
};

export type SellerView = {
  id: string;
  displayName: string;
  createdAt: string;
};

function formatPrice(value: number): string {
  return `$${Number(value).toLocaleString("en-US")}`;
}

function heroUrl(photos: ListingPhoto[]): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const dial = photos.find((p) => p?.category === "Dial");
  return (dial ?? photos[0])?.photo?.url ?? null;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase();
}

function memberSince(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const NAV_LINKS = [
  { label: "Browse", href: "/browse" },
  { label: "Sell", href: "/sell" },
  { label: "Account", href: "/account" },
  { label: "About", href: "/about" },
];

export default function SellerProfile({
  seller,
  listings,
  qualityText,
  completedSales,
}: {
  seller: SellerView;
  listings: SellerCardListing[];
  qualityText: string | null;
  completedSales: number;
}) {
  const initials = initialsFor(seller.displayName);

  return (
    <main className="flex min-h-screen flex-col bg-[var(--ink)] text-[var(--platinum)]">
      {/* Ticker — static metals (Phase 2 live values) */}
      <div className="flex shrink-0 items-center gap-7 border-b border-[var(--border-faint)] px-8 py-2">
        <div className="flex items-center gap-1.5 text-[9px] tracking-[1.2px] text-[var(--slate)]">
          <span className="h-[3px] w-[3px] rounded-full bg-[var(--gold)] opacity-50" />
          Au <span className="text-[var(--muted)]">$4,091</span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] tracking-[1.2px] text-[var(--slate)]">
          <span className="h-[3px] w-[3px] rounded-full bg-[var(--gold)] opacity-50" />
          Ag <span className="text-[var(--muted)]">$59.30</span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] tracking-[1.2px] text-[var(--slate)]">
          <span className="h-[3px] w-[3px] rounded-full bg-[var(--gold)] opacity-50" />
          Pt <span className="text-[var(--muted)]">$1,625</span>
        </div>
        <div className="ml-auto text-[9px] text-[var(--ghost)]">
          Phillips Geneva &ensp;·&ensp; <span className="text-[var(--slate)]">4d 16h</span>
        </div>
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between border-b border-[var(--border-faint)] px-8 py-4">
        <Link href="/" className="font-display text-[15px] font-light text-[var(--platinum)]">
          Fair<span className="text-[var(--gold)]">Watch</span>Trade
        </Link>
        <div className="hidden gap-7 md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-[10px] uppercase tracking-[2px] text-[var(--slate)] transition-colors hover:text-[var(--platinum)]"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 border-b border-[var(--border-faint)] px-8 py-3">
        <Link href="/browse" className="text-[9px] tracking-[0.5px] text-[var(--ghost)] hover:text-[var(--muted)]">
          Browse
        </Link>
        <span className="text-[9px] text-[var(--void)]">›</span>
        <span className="text-[9px] tracking-[0.5px] text-[var(--ghost)]">Sellers</span>
        <span className="text-[9px] text-[var(--void)]">›</span>
        <span className="text-[9px] tracking-[0.5px] text-[var(--ghost)]">{seller.displayName}</span>
      </div>

      {/* Body — two columns */}
      <div className="flex flex-1">
        {/* LEFT — the person */}
        <div className="flex w-[232px] shrink-0 flex-col border-r border-[var(--border-faint)] px-6 py-7">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-gold)] bg-[rgba(201,168,76,0.04)]">
            <span className="font-display text-[16px] font-light text-[var(--gold)]">
              {initials}
            </span>
          </div>

          <div className="mb-1 font-display text-[22px] font-light leading-[1.2] text-[var(--platinum)]">
            {seller.displayName}
          </div>
          {/* Location omitted — no column in schema (Phase 2). */}

          <div className="mt-4">
            <div className="flex items-baseline justify-between border-b border-[var(--border-faint)] py-2">
              <span className="text-[9px] uppercase tracking-[1px] text-[var(--muted)]">Member since</span>
              <span className="font-display text-[15px] font-light text-[var(--platinum-dim)]">
                {memberSince(seller.createdAt)}
              </span>
            </div>
            <div className="flex items-baseline justify-between border-b border-[var(--border-faint)] py-2">
              <span className="text-[9px] uppercase tracking-[1px] text-[var(--muted)]">Active listings</span>
              <span className="font-display text-[15px] font-light text-[var(--platinum-dim)]">
                {listings.length}
              </span>
            </div>
            <div className="flex items-baseline justify-between py-2">
              <span className="text-[9px] uppercase tracking-[1px] text-[var(--muted)]">Completed sales</span>
              {/* Literal dash — never 0. Transaction history is Phase 2 dormant. */}
              <span className="font-display text-[15px] font-light text-[var(--platinum-dim)]">—</span>
            </div>
          </div>

          <div className="fw-rule my-5" />

          {/* Quality signal — only if server returned prose (>=40 avg). */}
          {qualityText && (
            <div className="mb-4 border border-[var(--border-gold)] bg-[rgba(201,168,76,0.025)] p-3">
              <div className="mb-1 text-[7.5px] uppercase tracking-[2px] text-[var(--gold-subtle)]">
                Listing quality
              </div>
              <p className="font-display text-[12px] font-light italic leading-[1.5] text-[var(--slate)]">
                {qualityText}
              </p>
            </div>
          )}

          {/* Verification shell — always present, always dormant. */}
          <div className="mb-4 border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.01)] p-3">
            <div className="mb-1 text-[7.5px] uppercase tracking-[2px] text-[var(--muted)]">
              Verification
            </div>
            <div className="text-[10px] font-light italic text-[var(--muted)]">
              In Hand Verified — Phase 2
            </div>
          </div>

          <div className="fw-rule my-5" />

          {/* House Style — section header kept; items omitted (no column yet). */}
          <div className="text-[7.5px] uppercase tracking-[3px] text-[var(--gold)] opacity-70">
            Private correspondence, public standards.
          </div>

          <div className="fw-rule my-5" />

          {/* Collector statement — always the fallback (no column yet). */}
          <div className="mb-2 text-[8px] uppercase tracking-[2px] text-[var(--muted)]">
            Collector statement
          </div>
          <p className="font-display text-[12px] font-light italic leading-[1.8] text-[var(--muted)]">
            This seller hasn&apos;t added a statement yet.
          </p>

          {/* Correspondence — pinned to bottom */}
          <div className="mt-auto border-t border-[var(--border-faint)] pt-5">
            <div className="mb-2 text-[7.5px] uppercase tracking-[3px] text-[var(--gold)] opacity-70">
              Correspondence
            </div>
            <p className="mb-3 font-display text-[12px] font-light italic leading-[1.6] text-[var(--muted)]">
              Questions about a specific listing are handled through the listing&apos;s
              conversation thread. Serious enquiries only.
            </p>
            {listings.length > 0 ? (
              <Link href={`/listings/${listings[0].id}`} className="fw-btn-secondary inline-block">
                Contact via listing
              </Link>
            ) : (
              <span className="fw-btn-secondary inline-block opacity-40">Contact via listing</span>
            )}
            <div className="mt-4 border-t border-[var(--border-faint)] pt-4 text-center text-[8px] uppercase tracking-[2px] text-[var(--ghost)]">
              Private correspondence · Public standards
            </div>
          </div>
        </div>

        {/* RIGHT — the inventory */}
        <div className="flex-1 px-8 py-7">
          <div className="mb-5 flex items-baseline justify-between">
            <div className="font-display text-[18px] font-light text-[var(--platinum)]">
              Active Listings
            </div>
            <div className="text-[9px] uppercase tracking-[2px] text-[var(--ghost)]">
              {listings.length} {listings.length === 1 ? "watch" : "watches"}
            </div>
          </div>

          {listings.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mb-2 font-display text-[18px] font-light text-[var(--platinum)]">
                No active listings.
              </div>
              <p className="font-display text-[13px] font-light italic text-[var(--muted)]">
                This seller hasn&apos;t listed a watch yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-px bg-[var(--border-faint)]">
              {listings.map((row) => {
                const hero = heroUrl(row.photos);
                const meta = [row.condition, row.year].filter(Boolean).join(" · ");
                const attrs = [row.details?.dialColorType, row.details?.caseMaterial]
                  .filter(Boolean)
                  .join(" · ") || null;
                const doc = row.details?.documentation;
                const docBadge = doc === "Full Set" || doc === "Papers Only" ? doc : null;

                return (
                  <Link
                    key={row.id}
                    href={`/listings/${row.id}`}
                    className="group relative block cursor-pointer border border-transparent p-7 transition hover:bg-[rgba(255,255,255,0.02)]"
                  >
                    <div className="relative mb-4 flex h-[140px] w-full items-center justify-center overflow-hidden bg-[var(--ink-deep)]">
                      {hero ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={hero} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[11px] tracking-[0.3px] text-[var(--ghost)]">
                          No photo
                        </div>
                      )}
                      {docBadge && (
                        <span className="absolute right-3 top-3 rounded-full border border-[var(--border-gold)] bg-[rgba(201,168,76,0.08)] px-2 py-0.5 text-[8px] uppercase tracking-[1.5px] text-[var(--gold)]">
                          {docBadge}
                        </span>
                      )}
                    </div>

                    <div className="mb-[5px] text-[8px] uppercase tracking-[2.5px] text-[var(--gold-subtle)]">
                      {row.brand}
                    </div>
                    <div className="mb-1 font-display text-[15px] font-light leading-[1.25] text-[var(--platinum)]">
                      {row.model ?? row.brand}
                    </div>
                    {meta && (
                      <div className="mb-3 text-[10px] tracking-[0.3px] text-[var(--muted)]">
                        {attrs ? `${meta} · ${attrs}` : meta}
                      </div>
                    )}
                    <div className="font-display text-[17px] font-light text-[var(--platinum-dim)]">
                      {formatPrice(Number(row.asking_price))}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Transaction history — always shown below the grid; dormant. */}
          <div className="mt-7 border-t border-[var(--border-faint)] pt-5">
            <div className="mb-2 text-[8px] uppercase tracking-[2px] text-[var(--ghost)]">
              Transaction history
            </div>
            {completedSales === 0 ? (
              <p className="font-display text-[13px] font-light italic leading-[1.7] text-[var(--ghost)]">
                This seller joined recently. Their listing quality speaks before their
                transaction history can.
              </p>
            ) : (
              <p className="font-display text-[13px] font-light italic text-[var(--muted)]">
                {completedSales} completed sales on FairWatchTrade.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
