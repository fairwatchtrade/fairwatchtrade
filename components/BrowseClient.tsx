"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   BROWSE CLIENT — client-side facet filtering shell for /browse (v1.55)

   Receives the already-ranked listings from the server page and renders the
   Studio filter sidebar (desktop) / overlay (mobile) plus the card grid.
   Filter/facet logic, toggle functions, and useMemo hooks are preserved
   verbatim from v1.28 — only the visual/layout chrome is restyled, plus
   grid-width and page-size controls.
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
  details?: { dialColorType?: string; caseMaterial?: string; documentation?: string; caseSizeMm?: string; movementType?: string } | null;
  combined_score: number; // private — ranking input only, never rendered
  created_at: string; // ISO 8601 — ranking tie-break
  sold?: boolean; // optional on the row; defaults false if absent
  weeks_featured?: number; // optional on the row; defaults 0 if absent
  status: string;
  in_hand_verified?: boolean;
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

// Case size facet/filter key: append "mm" unless already present, so the
// displayed label and the value matched against the selection are identical.
function sizeLabel(value?: string): string {
  if (!value) return "";
  return value.includes("mm") ? value : `${value}mm`;
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
    <div className="mb-[22px] px-[18px]">
      <div className="mb-3 text-[8px] uppercase tracking-[2.5px] text-[var(--ghost)]">
        {title}
      </div>
      <div>
        {facets.map(([value, count]) => {
          const isSelected = selected.has(value);
          return (
            <label
              key={value}
              className="mb-2 flex cursor-pointer items-center gap-2"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(value)}
                className="sr-only"
              />
              <div
                className={`flex h-3 w-3 shrink-0 items-center justify-center border ${
                  isSelected
                    ? "border-[var(--border-gold)] bg-[rgba(201,168,76,0.08)]"
                    : "border-[var(--border-subtle)]"
                }`}
              >
                {isSelected && (
                  <div className="h-[5px] w-[5px] bg-[var(--gold)] opacity-80" />
                )}
              </div>
              <span
                className={`min-w-0 flex-1 truncate text-[11px] tracking-[0.3px] ${
                  isSelected ? "text-[var(--slate)]" : "text-[var(--muted)]"
                }`}
              >
                {value}
              </span>
              <span className="text-[10px] tabular-nums text-[var(--ghost)]">
                {count}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function BrowseClient({ listings }: { listings: ListingRow[] }) {
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [gridCols, setGridCols] = useState<3 | 4>(3);
  const [pageSize, setPageSize] = useState<20 | 40 | "all">(20);
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [selectedConditions, setSelectedConditions] = useState<Set<string>>(new Set());
  const [selectedCaseSizes, setSelectedCaseSizes] = useState<Set<string>>(new Set());
  const [selectedMovements, setSelectedMovements] = useState<Set<string>>(new Set());
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(new Set());
  const [selectedDials, setSelectedDials] = useState<Set<string>>(new Set());
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());

  const brandFacets = useMemo(() => countBy(listings, (l) => l.brand), [listings]);
  const conditionFacets = useMemo(
    () => countBy(listings, (l) => l.condition),
    [listings]
  );
  const caseSizeFacets = useMemo(
    () => countBy(listings, (l) => sizeLabel(l.details?.caseSizeMm)),
    [listings]
  );
  const movementFacets = useMemo(
    () => countBy(listings, (l) => l.details?.movementType ?? ""),
    [listings]
  );
  const materialFacets = useMemo(
    () => countBy(listings, (l) => l.details?.caseMaterial ?? ""),
    [listings]
  );
  const dialFacets = useMemo(
    () => countBy(listings, (l) => l.details?.dialColorType ?? ""),
    [listings]
  );
  const docFacets = useMemo(
    () => countBy(listings, (l) => l.details?.documentation ?? ""),
    [listings]
  );

  const filtered = useMemo(
    () =>
      listings.filter((l) => {
        const brandOk = selectedBrands.size === 0 || selectedBrands.has(l.brand);
        const condOk =
          selectedConditions.size === 0 || selectedConditions.has(l.condition);
        const sizeOk =
          selectedCaseSizes.size === 0 ||
          selectedCaseSizes.has(sizeLabel(l.details?.caseSizeMm));
        const movementOk =
          selectedMovements.size === 0 ||
          selectedMovements.has(l.details?.movementType ?? "");
        const materialOk =
          selectedMaterials.size === 0 ||
          selectedMaterials.has(l.details?.caseMaterial ?? "");
        const dialOk =
          selectedDials.size === 0 ||
          selectedDials.has(l.details?.dialColorType ?? "");
        const docOk =
          selectedDocs.size === 0 ||
          selectedDocs.has(l.details?.documentation ?? "");
        return (
          brandOk &&
          condOk &&
          sizeOk &&
          movementOk &&
          materialOk &&
          dialOk &&
          docOk
        );
      }),
    [
      listings,
      selectedBrands,
      selectedConditions,
      selectedCaseSizes,
      selectedMovements,
      selectedMaterials,
      selectedDials,
      selectedDocs,
    ]
  );

  const paginated = pageSize === "all" ? filtered : filtered.slice(0, pageSize);

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

  const toggleCaseSize = (value: string) =>
    setSelectedCaseSizes((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const toggleMovement = (value: string) =>
    setSelectedMovements((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const toggleMaterial = (value: string) =>
    setSelectedMaterials((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const toggleDial = (value: string) =>
    setSelectedDials((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const toggleDoc = (value: string) =>
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const facetList = (
    <div>
      {/* Filter intro */}
      <div className="mb-5 border-b border-[var(--border-faint)] px-[18px] pb-5">
        <div className="mb-[6px] text-[8px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
          Refine
        </div>
        <p className="font-display text-[13px] font-light italic leading-[1.6] text-[var(--muted)]">
          Collectors think in dials, not dropdowns.
        </p>
      </div>

      <FacetGroup
        title="Case Size"
        facets={caseSizeFacets}
        selected={selectedCaseSizes}
        onToggle={toggleCaseSize}
      />
      <FacetGroup
        title="Movement"
        facets={movementFacets}
        selected={selectedMovements}
        onToggle={toggleMovement}
      />
      <FacetGroup
        title="Case Material"
        facets={materialFacets}
        selected={selectedMaterials}
        onToggle={toggleMaterial}
      />
      <FacetGroup
        title="Dial Color"
        facets={dialFacets}
        selected={selectedDials}
        onToggle={toggleDial}
      />
      <FacetGroup
        title="Box & Papers"
        facets={docFacets}
        selected={selectedDocs}
        onToggle={toggleDoc}
      />
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
          {isFilterOpen ? "Hide" : "Refine"}
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex items-center rounded-md border border-white/10 px-3 py-1.5 text-[12px] text-[#E8E4DC] md:hidden"
        >
          Refine
        </button>
      </div>

      {/* Layout controls bar — grid width + page size */}
      <div className="mt-6 flex items-center justify-between border-b border-[var(--border-faint)] pb-4">
        <div className="flex items-center gap-1">
          {([3, 4] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setGridCols(n)}
              className={`border px-[10px] py-[5px] text-[9px] uppercase tracking-[1px] transition ${
                gridCols === n
                  ? "border-[var(--border-gold)] text-[var(--gold)]"
                  : "border-[var(--border-subtle)] text-[var(--ghost)] hover:text-[var(--slate)]"
              }`}
            >
              {n}-wide
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {([20, 40, "all"] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPageSize(n)}
              className={`border px-[10px] py-[5px] text-[9px] uppercase tracking-[1px] transition ${
                pageSize === n
                  ? "border-[var(--border-gold)] text-[var(--gold)]"
                  : "border-[var(--border-subtle)] text-[var(--ghost)] hover:text-[var(--slate)]"
              }`}
            >
              {n === "all" ? "All" : n}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex gap-6">
        {/* Desktop sidebar — collapses to w-0 */}
        <aside
          className={`hidden shrink-0 flex-col overflow-hidden transition-all duration-300 md:flex ${
            isFilterOpen ? "w-[168px]" : "w-0"
          }`}
        >
          <div className="w-[168px]">{facetList}</div>
        </aside>

        {/* Grid wrapper — expands as the sidebar collapses */}
        <div className="min-w-0 flex-1">
          {paginated.length === 0 ? (
            <p className="text-[14px] text-[var(--slate)]">
              No watches match your selection.
            </p>
          ) : (
            <div className={`grid gap-px bg-[var(--border-faint)] ${gridCols === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
              {paginated.map((row) => {
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
                    className="group relative block cursor-pointer border border-transparent p-7 transition hover:bg-[rgba(255,255,255,0.02)]"
                  >
                    {row.in_hand_verified && (
                      <div
                        title="In Hand Verified"
                        className="absolute top-2 right-2 text-[var(--gold)] opacity-70"
                        aria-label="In Hand Verified"
                      >
                        🛡️
                      </div>
                    )}

                    {/* Dial / image area */}
                    <div className="mb-4 flex h-[140px] w-full items-center justify-center overflow-hidden bg-[var(--ink-deep)]">
                      {hero ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={hero}
                          alt=""
                          className="h-full w-full object-contain"
                        />
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

                    {/* Brand */}
                    <div className="mb-[5px] text-[8px] uppercase tracking-[2.5px] text-[var(--gold-subtle)]">
                      {row.brand}
                    </div>

                    {/* Model */}
                    <div className="mb-1 font-display text-[15px] font-light leading-[1.25] text-[var(--platinum)]">
                      {row.model ?? row.brand}
                    </div>

                    {/* Reference / meta */}
                    {meta && (
                      <div className="mb-3 text-[10px] tracking-[0.3px] text-[var(--muted)]">
                        {attrs ? `${meta} · ${attrs}` : meta}
                      </div>
                    )}

                    {/* Price */}
                    <div className="font-display text-[17px] font-light text-[var(--platinum-dim)]">
                      {formatPrice(Number(row.asking_price))}
                    </div>

                    {/* HOVER ENRICHMENT — Phase 2: slot ready, data pending */}
                    {/* <div className="fw-hover-enrichment"> ... </div> */}
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
          className="fixed inset-0 z-40 bg-[var(--ink)]/95 md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="absolute inset-y-0 left-0 w-72 max-w-[80%] overflow-auto border-r border-[var(--border-faint)] bg-[var(--ink)] py-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between px-[18px]">
              <span className="text-[8px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
                Refine
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="fw-btn-secondary"
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
