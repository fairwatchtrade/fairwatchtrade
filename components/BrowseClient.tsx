"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   BROWSE CLIENT — client-side facet filtering shell for /browse (v1.28)

   Receives the already-ranked listings from the server page and renders the
   collapsible filter sidebar (desktop) / overlay (mobile) plus the card grid.
   Card markup is copied verbatim from the v1.27 server page — only the
   surrounding filter/layout chrome is new.
   ──────────────────────────────────────────────────────────────────────── */

type ListingPhoto = {
  photo: { url: string };
  category: string;
  isWristShot?: boolean;
};

type ListingRow = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  year: string;
  condition: string;
  asking_price: number;
  photos: ListingPhoto[];
  details?: { dialColorType?: string; caseMaterial?: string; documentation?: string } | null;
  combined_score: number; // private — ranking input only, never rendered
  created_at: string; // ISO 8601 — ranking tie-break
  sold?: boolean; // optional on the row; defaults false if absent
  weeks_featured?: number; // optional on the row; defaults 0 if absent
  status: string;
};

function formatPrice(value: number): string {
  return `$${Number(value).toLocaleString("en-US")}`;
}

function heroUrl(photos: ListingPhoto[]): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const dial = photos.find((p) => p?.category === "Dial");
  return (dial ?? photos[0])?.photo?.url ?? null;
}

function countBy(listings: ListingRow[], pick: (l: ListingRow) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const l of listings) {
    const value = pick(l);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function FacetGroup({
  title,
  facets,
  selected,
  onToggle,
}: {
  title: string;
  facets: [string, number][];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  if (facets.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.15em] text-[#B7BAC4]">
        {title}
      </div>
      <div className="mt-2 space-y-1.5">
        {facets.map(([value, count]) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2 text-[13px] text-[#E8E4DC]"
          >
            <input
              type="checkbox"
              checked={selected.has(value)}
              onChange={() => onToggle(value)}
              className="h-3.5 w-3.5 shrink-0 rounded accent-[#C9A84C]"
            />
            <span className="min-w-0 flex-1 truncate">{value}</span>
            <span className="text-[11px] tabular-nums text-[#B7BAC4]">{count}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function BrowseClient({ listings }: { listings: ListingRow[] }) {
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [selectedConditions, setSelectedConditions] = useState<Set<string>>(new Set());

  const brandFacets = useMemo(() => countBy(listings, (l) => l.brand), [listings]);
  const conditionFacets = useMemo(
    () => countBy(listings, (l) => l.condition),
    [listings]
  );

  const filtered = useMemo(
    () =>
      listings.filter((l) => {
        const brandOk = selectedBrands.size === 0 || selectedBrands.has(l.brand);
        const condOk =
          selectedConditions.size === 0 || selectedConditions.has(l.condition);
        return brandOk && condOk;
      }),
    [listings, selectedBrands, selectedConditions]
  );

  const toggleBrand = (value: string) =>
    setSelectedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const toggleCondition = (value: string) =>
    setSelectedConditions((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const facetList = (
    <div className="space-y-5">
      <FacetGroup
        title="Brand"
        facets={brandFacets}
        selected={selectedBrands}
        onToggle={toggleBrand}
      />
      <FacetGroup
        title="Condition"
        facets={conditionFacets}
        selected={selectedConditions}
        onToggle={toggleCondition}
      />
    </div>
  );

  return (
    <div>
      {/* Toggle bar */}
      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setIsFilterOpen((v) => !v)}
          className="hidden items-center rounded-md border border-white/10 px-3 py-1.5 text-[12px] text-[#E8E4DC] transition hover:border-[#C9A84C]/40 md:inline-flex"
        >
          {isFilterOpen ? "Hide filters" : "Show filters"}
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex items-center rounded-md border border-white/10 px-3 py-1.5 text-[12px] text-[#E8E4DC] md:hidden"
        >
          Filters
        </button>
      </div>

      <div className="mt-4 flex gap-6">
        {/* Desktop sidebar — collapses to w-0 */}
        <aside
          className={`hidden shrink-0 flex-col overflow-hidden transition-all duration-300 md:flex ${
            isFilterOpen ? "w-64" : "w-0"
          }`}
        >
          <div className="w-64 pr-2">{facetList}</div>
        </aside>

        {/* Grid wrapper — expands as the sidebar collapses */}
        <div className="min-w-0 flex-1">
          {filtered.length === 0 ? (
            <p className="text-[14px] text-[#B7BAC4]">
              No listings match these filters.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-5 md:grid-cols-3">
              {filtered.map((row) => {
                const hero = heroUrl(row.photos);
                const title = row.model ? `${row.brand} ${row.model}` : row.brand;
                const meta = [row.condition, row.year].filter(Boolean).join(" · ");
                const parts = [row.details?.dialColorType, row.details?.caseMaterial].filter(Boolean);
                const attrs = parts.join(" · ") || null;
                const doc = row.details?.documentation;
                const docBadge = doc === "Full Set" || doc === "Papers Only" ? doc : null;

                return (
                  <Link
                    key={row.id}
                    href={`/listings/${row.id}`}
                    className="group block overflow-hidden rounded-xl border border-white/10 bg-[#0D0F14] transition hover:border-[#C9A84C]/40"
                  >
                    <div className="relative overflow-hidden">
                      {hero ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={hero}
                          alt=""
                          className="aspect-[4/3] w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[4/3] w-full items-center justify-center text-[13px] text-[#B7BAC4]">
                          No photo
                        </div>
                      )}
                      {docBadge && (
                        <span className="absolute top-2 right-2 rounded-full bg-[#C9A84C] px-2 py-0.5 text-[10px] font-medium tracking-wide text-[#0D0F14]">
                          {docBadge}
                        </span>
                      )}
                    </div>

                    <div className="p-4">
                      {meta && (
                        <div className="text-[11px] uppercase tracking-[0.15em] text-[#B7BAC4]">
                          {meta}
                        </div>
                      )}
                      <div className="mt-1 text-[15px] font-medium text-[#E8E4DC]">
                        {title}
                      </div>
                      {attrs && (
                        <div className="mt-0.5 text-[12px] text-[#B7BAC4]">
                          {attrs}
                        </div>
                      )}
                      <div className="mt-2 text-[15px] font-semibold text-[#C9A84C]">
                        {formatPrice(Number(row.asking_price))}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#0D0F14]/95 md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="absolute inset-y-0 left-0 w-72 max-w-[80%] overflow-auto border-r border-white/10 bg-[#0D0F14] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[14px] font-medium text-[#E8E4DC]">Filters</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md border border-white/10 px-2 py-1 text-[12px] text-[#E8E4DC]"
              >
                Close
              </button>
            </div>
            {facetList}
          </div>
        </div>
      )}
    </div>
  );
}
