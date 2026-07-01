"use client";

import Link from "next/link";
import { type ReactNode } from "react";

/* ────────────────────────────────────────────────────────────────────────
   DASHBOARD CLIENT — the buyer's morning brief  (v1.90)

   Answers one question: "What happened while I was away?" Every element is
   secondary to that except the Catalogue Match hero, which answers it
   directly. Catalogue and saved-watches are Phase 2 — their tables don't
   exist yet, so they render honest empty shells. No fabricated matches, no
   placeholder watches.

   ANTI-FEATURES (PRODUCT_SOUL.md, enforced here): no listing scores or
   combined_score, no save counts, no trend arrows, no manufactured urgency,
   no social-proof signals — anywhere on this page, ever. The discovery cards
   reuse the /browse visual treatment (defined locally, NOT imported from
   BrowseClient, which is a filtering shell rather than a card library).

   Outer spacing assumes the shared app layout provides page max-width and
   horizontal padding (same assumption BrowseClient makes).
   ──────────────────────────────────────────────────────────────────────── */

type ListingPhoto = { photo: { url: string }; category: string };

// Same shape as BrowseClient's ListingRow, minus the private combined_score.
// Exported so the server page can type its cast (mirrors AccountDashboard /
// AccountListing).
export type ListingRow = {
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
    caseSizeMm?: string;
    movementType?: string;
  } | null;
  status: string;
  created_at: string;
};

type DashboardProps = {
  displayName: string | null;
  recentListings: ListingRow[];
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatPrice(value: number): string {
  return `$${Number(value).toLocaleString("en-US")}`;
}

// Dial photo first, fallback to the first photo. Matches /browse.
function heroUrl(photos: ListingPhoto[]): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const dial = photos.find((p) => p?.category === "Dial");
  return (dial ?? photos[0])?.photo?.url ?? null;
}

/* ── Left nav ─────────────────────────────────────────────────────────── */

function NavSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[8px] uppercase tracking-[2.5px] text-[var(--ghost)]">
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function NavItem({
  href,
  active,
  soon,
  children,
}: {
  href?: string;
  active?: boolean;
  soon?: boolean;
  children: ReactNode;
}) {
  const base = "block text-[12px] tracking-[0.3px] transition";
  if (soon || !href) {
    // Phase 2 — present but not yet navigable. Quiet, not loud.
    return (
      <div className={`${base} cursor-default text-[var(--ghost)] opacity-60`}>
        {children}
        <span className="ml-1.5 text-[8px] uppercase tracking-[1.5px]">soon</span>
      </div>
    );
  }
  return (
    <Link
      href={href}
      className={`${base} ${
        active
          ? "text-[var(--gold)]"
          : "text-[var(--muted)] hover:text-[var(--platinum)]"
      }`}
    >
      {children}
    </Link>
  );
}

/* ── Discovery card — reuses the /browse visual treatment ─────────────── */

function ListingCard({ row }: { row: ListingRow }) {
  const hero = heroUrl(row.photos);
  const meta = [row.condition, row.year].filter(Boolean).join(" · ");
  const parts = [row.details?.dialColorType, row.details?.caseMaterial].filter(
    Boolean
  );
  const attrs = parts.join(" · ") || null;
  const doc = row.details?.documentation;
  const docBadge = doc === "Full Set" || doc === "Papers Only" ? doc : null;

  return (
    <Link
      href={`/listings/${row.id}`}
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
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function DashboardClient({
  displayName,
  recentListings,
}: DashboardProps) {
  return (
    <div className="flex gap-8 py-8">
      {/* Left nav — sticky, desktop only */}
      <nav className="hidden w-[200px] shrink-0 md:block">
        <div className="sticky top-6 space-y-6">
          <NavSection title="Discover">
            <NavItem href="/browse">Browse</NavItem>
            <NavItem href="/browse">New Arrivals</NavItem>
          </NavSection>
          <NavSection title="Intelligence">
            <NavItem soon>My Catalogue</NavItem>
            <NavItem soon>Watch DNA</NavItem>
          </NavSection>
          <NavSection title="Trade">
            <NavItem href="/dashboard" active>
              Dashboard
            </NavItem>
            <NavItem href="/account">Account</NavItem>
            <NavItem href="/sell">Sell</NavItem>
          </NavSection>
        </div>
      </nav>

      {/* Right content */}
      <div className="min-w-0 flex-1">
        {/* Greeting */}
        <h1 className="font-display text-[26px] font-light text-[var(--platinum)]">
          {greeting()}, {displayName ?? "Collector"}.
        </h1>

        {/* Catalogue Match hero — State 2 (the honest state for v1.90).
            The gold border/background are present in BOTH states so the hero
            stays dominant even when empty. It is the promise, not the result. */}
        <div className="mt-6 border border-[rgba(201,168,76,0.28)] bg-[var(--gold-whisper)] px-8 py-8">
          {/* TODO: Phase 2 — State 1 (a real catalogue match exists): same gold
              border/background, headline "Did your watch finally appear?", a
              match card with listing details and a "View listing →" button.
              Requires the catalogue table (Phase 2). Not implemented in v1.90. */}
          <div className="mb-3 text-[9px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
            Catalogue Match
          </div>
          <div className="mb-2 font-display text-[22px] font-light text-[var(--platinum)]">
            We&apos;re watching for you.
          </div>
          <div className="text-[13px] leading-relaxed text-[var(--muted)]">
            Your catalogue is active. We&apos;ll notify you the moment a match
            appears.
          </div>
        </div>

        {/* Two-column below the hero */}
        <div className="mt-8 flex flex-col gap-8 lg:flex-row">
          {/* Left — discovery feed + saved watches */}
          <div className="min-w-0 flex-1">
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div className="text-[9px] uppercase tracking-[2.5px] text-[var(--ghost)]">
                  Discovery
                </div>
                <Link
                  href="/browse"
                  className="text-[10px] uppercase tracking-[2px] text-[var(--gold-subtle)] transition hover:text-[var(--gold)]"
                >
                  See all →
                </Link>
              </div>

              {recentListings.length === 0 ? (
                <div className="border border-dashed border-[var(--border-faint)] px-4 py-6 text-center">
                  <div className="font-display text-[11px] italic text-[var(--ghost)]">
                    No published listings yet.
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-px bg-[var(--border-faint)] sm:grid-cols-3">
                  {recentListings.map((row) => (
                    <ListingCard key={row.id} row={row} />
                  ))}
                </div>
              )}
            </div>

            {/* Saved watches — shell (Phase 2, saved_watches table doesn't exist) */}
            <div className="mt-8">
              <div className="mb-4 text-[9px] uppercase tracking-[2.5px] text-[var(--ghost)]">
                Saved Watches
              </div>
              <div className="border border-dashed border-[var(--border-faint)] px-4 py-6 text-center">
                <div className="font-display text-[11px] italic text-[var(--ghost)]">
                  No saved watches yet.
                </div>
              </div>
            </div>
          </div>

          {/* Right — 220px rail of shells */}
          <div className="w-full shrink-0 lg:w-[220px]">
            {/* My Catalogue — shell (Phase 2, catalogue table doesn't exist) */}
            <div className="border border-[var(--border-subtle)] px-4 py-5">
              <div className="mb-3 text-[9px] uppercase tracking-[2.5px] text-[var(--ghost)]">
                My Catalogue
              </div>
              <div className="mb-4 font-display text-[12px] italic text-[var(--ghost)]">
                Add your first reference.
              </div>
              <button
                disabled
                className="cursor-not-allowed border border-[var(--border-subtle)] px-3 py-1.5 text-[9px] uppercase tracking-[2px] text-[var(--ghost)] opacity-40"
              >
                + Add reference
              </button>
            </div>

            {/* Watch DNA — shell, Coming Soon. No numbers, no fake metrics. */}
            <div className="mt-4 border border-[var(--border-subtle)] px-4 py-5">
              <div className="mb-4 text-[9px] uppercase tracking-[2.5px] text-[var(--ghost)]">
                Watch DNA
              </div>
              <div className="grid grid-cols-3 gap-3">
                {["Craft", "Presence", "Heritage"].map((bucket) => (
                  <div key={bucket} className="text-center">
                    <div className="mb-1 text-[10px] text-[var(--slate)]">
                      {bucket}
                    </div>
                    <div className="font-display text-[10px] italic text-[var(--ghost)]">
                      Coming soon
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent activity — shell */}
            <div className="mt-4">
              <div className="mb-3 text-[9px] uppercase tracking-[2.5px] text-[var(--ghost)]">
                Recent Activity
              </div>
              <div className="font-display text-[11px] italic text-[var(--ghost)]">
                No recent activity.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
