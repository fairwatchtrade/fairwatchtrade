"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   BROWSE CLIENT — client-side facet filtering shell for /browse (v1.57)

   Receives the already-ranked listings from the server page and renders the
   Studio filter sidebar (desktop) / overlay (mobile) plus the card grid.
   Filter/facet logic, toggle functions, and useMemo hooks are preserved
   verbatim from v1.28 — only the visual/layout chrome is restyled, plus
   grid-width and page-size controls.

   v1.57 — Phase 1A: Gallery View / Collector View toggle + Collector's
   Workbench. Core design law: "Gallery View is for seeing watches.
   Collector View is for understanding watches. The left rail is for
   narrowing watches." Movement and Case Size MOVED out of the ordinary
   rail into the Workbench — one control, one location, never duplicated.
   Beat Rate/Power Reserve values are confirmed to exist but not confirmed
   clean; normalizeVph()/normalizePowerReserve() below are DISPLAY-ONLY
   transforms (the stored listings.details values are never rewritten) —
   same established pattern as sizeLabel() already uses for case size.

   v1.59 — Phase 1B follow-on (P1, real-device evidence: iPhone 14 Pro
   430x932). Collector View's two-column grid left cards too narrow at
   phone widths — cramped stacked text, awkward wrapping. Fix: Collector
   View collapses to one card per row below the file's own existing md:
   breakpoint (768px — the same cutoff the Refine button, sidebar collapse,
   and mobile filter overlay already use; no new breakpoint invented).
   Desktop/tablet Collector behavior (the 3-wide/4-wide toggle) and ALL of
   Gallery View (every width) are untouched — verified below.

   v1.58 — Phase 1B: Collector View gets its actual spec-first card layout
   (Phase 1A shipped it as Gallery-card-plus-one-line; this closes that
   gap). Gallery View's render branch is byte-for-byte untouched below.
   Collector: small fixed thumbnail left, dominant data stack right — nine
   fields in the brief's exact order, each rendered only when present (no
   "Unknown"/"N/A"/dash for missing data, ever). Documentation reuses the
   existing docBadge derivation verbatim, just placed as a stack row
   instead of a floating pill (logic identical, placement is the only
   change). caseThicknessMm is real, verified live against production
   before writing this: "11.7" and "9.5", plain decimal, same clean shape
   as caseSizeMm — thicknessLabel() mirrors sizeLabel() exactly.
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
  details?: {
    dialColorType?: string;
    caseMaterial?: string;
    documentation?: string;
    caseSizeMm?: string;
    movementType?: string;
    movementFrequency?: string; // Beat Rate / VPH — heterogeneous raw formats
    powerReserve?: string; // heterogeneous raw formats
    caseThicknessMm?: string; // v1.58 — verified live against production
  } | null;
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

// v1.58 — Case thickness: display-only, mirrors sizeLabel() exactly.
// Verified against real listings.details before writing this — values are
// plain decimals ("11.7", "9.5"), same clean shape caseSizeMm already has.
function thicknessLabel(value?: string): string {
  if (!value) return "";
  return value.includes("mm") ? value : `${value}mm`;
}

// v1.57 — Beat Rate / VPH: display-only normalization. Stored values are
// confirmed heterogeneous ("28800" | "28,800 vph" | "4 Hz"). Hz is left as
// Hz (a real, different unit — never silently converted to vph). A
// recognizable vph number is reformatted with a thousands separator so
// "28800" and "28,800 vph" collapse to ONE facet instead of two. Anything
// unrecognized displays exactly as stored — never dropped, never guessed.
// The SAME output feeds both the facet label and the filter-match value
// (the sizeLabel pattern above), so display and filtering never disagree.
function beatRateLabel(value?: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const hz = trimmed.match(/(\d+(?:\.\d+)?)\s*hz/i);
  if (hz) return `${hz[1]} Hz`;
  const num = trimmed.match(/[\d,]+/);
  if (num) {
    const n = Number(num[0].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return `${n.toLocaleString("en-US")} vph`;
  }
  return trimmed; // unrecognized format — shown as-is, not fabricated
}

// v1.57 — Power Reserve: same display-only law. Stored values are confirmed
// heterogeneous ("42 hours" | "dual barrel 42 hour reserve" | "approx. 42h").
// Extract the number preceding an hour-unit; unrecognized text passes
// through unchanged rather than being silently discarded.
function powerReserveLabel(value?: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const hrs = trimmed.match(/(\d+(?:\.\d+)?)\s*h(?:our)?s?\b/i);
  if (hrs) return `${hrs[1]} hours`;
  return trimmed;
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

// v1.58 — one small presentational helper, shared by every Collector-View
// data-stack row: renders label/value only when value is truthy. This IS
// the "no Unknown/N/A/dash for missing data" law, enforced in one place
// instead of nine separate conditionals that could drift from each other.
function SpecRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-[var(--border-faint)] py-1 text-[10px] tracking-[0.3px]">
      <span className="text-[var(--ghost)]">{label}</span>
      <span className="text-[var(--slate)]">{value}</span>
    </div>
  );
}

export default function BrowseClient({ listings }: { listings: ListingRow[] }) {
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [gridCols, setGridCols] = useState<3 | 4>(3);
  const [pageSize, setPageSize] = useState<20 | 40 | "all">(20);
  // v1.57 — orthogonal to grid width/page size: Collector View adds
  // understanding (specs), it never removes what Gallery View shows.
  const [viewMode, setViewMode] = useState<"gallery" | "collector">("gallery");
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [selectedConditions, setSelectedConditions] = useState<Set<string>>(new Set());
  const [selectedCaseSizes, setSelectedCaseSizes] = useState<Set<string>>(new Set());
  const [selectedMovements, setSelectedMovements] = useState<Set<string>>(new Set());
  // v1.57 — Workbench-only facets (never rendered in the ordinary rail).
  const [selectedBeatRates, setSelectedBeatRates] = useState<Set<string>>(new Set());
  const [selectedPowerReserves, setSelectedPowerReserves] = useState<Set<string>>(
    new Set()
  );
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
  const beatRateFacets = useMemo(
    () => countBy(listings, (l) => beatRateLabel(l.details?.movementFrequency)),
    [listings]
  );
  const powerReserveFacets = useMemo(
    () => countBy(listings, (l) => powerReserveLabel(l.details?.powerReserve)),
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
        const beatRateOk =
          selectedBeatRates.size === 0 ||
          selectedBeatRates.has(beatRateLabel(l.details?.movementFrequency));
        const powerReserveOk =
          selectedPowerReserves.size === 0 ||
          selectedPowerReserves.has(powerReserveLabel(l.details?.powerReserve));
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
          beatRateOk &&
          powerReserveOk &&
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
      selectedBeatRates,
      selectedPowerReserves,
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

  const toggleBeatRate = (value: string) =>
    setSelectedBeatRates((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const togglePowerReserve = (value: string) =>
    setSelectedPowerReserves((prev) => {
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

  // v1.57 — the rail: ORDINARY narrowing only. Movement and Case Size have
  // moved out entirely (see Workbench below) — one control, one location,
  // never rendered in both places per the Phase 1 architectural correction.
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
        title="Brand"
        facets={brandFacets}
        selected={selectedBrands}
        onToggle={toggleBrand}
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
        title="Condition"
        facets={conditionFacets}
        selected={selectedConditions}
        onToggle={toggleCondition}
      />

      {/* v1.57 — Collector's Workbench: a distinct, visually separate group.
          Per the core design law, this is NOT the narrowing rail — it is
          collector-specific criteria, reusing the identical FacetGroup /
          countBy / toggle-handler pattern as every rail facet above. */}
      <div className="mx-[18px] mb-[22px] border-t border-[var(--border-faint)] pt-5">
        <div className="mb-3 text-[8px] uppercase tracking-[2.5px] text-[var(--gold-subtle)]">
          Collector&apos;s Workbench
        </div>
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
        title="Beat Rate"
        facets={beatRateFacets}
        selected={selectedBeatRates}
        onToggle={toggleBeatRate}
      />
      <FacetGroup
        title="Power Reserve"
        facets={powerReserveFacets}
        selected={selectedPowerReserves}
        onToggle={togglePowerReserve}
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

      {/* Layout controls bar — grid width + view mode + page size.
          v1.57 — the Gallery/Collector toggle sits alongside grid width:
          both are orthogonal display controls, neither replaces the other. */}
      <div className="mt-6 flex items-center justify-between border-b border-[var(--border-faint)] pb-4">
        <div className="flex items-center gap-4">
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

          <div className="flex items-center gap-1 border-l border-[var(--border-faint)] pl-4">
            {([
              { key: "gallery", label: "Gallery" },
              { key: "collector", label: "Collector" },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setViewMode(key)}
                className={`border px-[10px] py-[5px] text-[9px] uppercase tracking-[1px] transition ${
                  viewMode === key
                    ? "border-[var(--border-gold)] text-[var(--gold)]"
                    : "border-[var(--border-subtle)] text-[var(--ghost)] hover:text-[var(--slate)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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
            <div
              className={`grid gap-px bg-[var(--border-faint)] ${
                viewMode === "collector"
                  ? `grid-cols-1 ${gridCols === 3 ? "md:grid-cols-3" : "md:grid-cols-4"}`
                  : gridCols === 3
                    ? "grid-cols-3"
                    : "grid-cols-4"
              }`}
            >
              {paginated.map((row) => {
                const hero = heroUrl(row.photos);
                const title = row.model ? `${row.brand} ${row.model}` : row.brand;
                const meta = [row.condition, row.year].filter(Boolean).join(" · ");
                const parts = [row.details?.dialColorType, row.details?.caseMaterial].filter(Boolean);
                const attrs = parts.join(" · ") || null;
                const doc = row.details?.documentation;
                const docBadge = doc === "Full Set" || doc === "Papers Only" ? doc : null;

                // v1.58 — Gallery View. Byte-for-byte untouched from v1.57;
                // not part of this brief.
                if (viewMode === "gallery") {
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
                }

                // v1.58 — Phase 1B: Collector View's actual spec-first layout.
                // Small fixed thumbnail left, dominant data stack right — the
                // brief's nine fields, in order, each absent when the source
                // data is absent. No new normalization invented: sizeLabel,
                // beatRateLabel, powerReserveLabel, and thicknessLabel are the
                // exact same functions Gallery/Workbench already trust.
                return (
                  <Link
                    key={row.id}
                    href={`/listings/${row.id}`}
                    className="group relative flex gap-4 cursor-pointer border border-transparent p-5 transition hover:bg-[rgba(255,255,255,0.02)]"
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

                    {/* Supporting thumbnail — fixed, small, never dominant. */}
                    <div className="flex h-[84px] w-[84px] shrink-0 items-center justify-center overflow-hidden bg-[var(--ink-deep)]">
                      {hero ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={hero}
                          alt=""
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="text-center text-[9px] leading-tight tracking-[0.3px] text-[var(--ghost)]">
                          No photo
                        </div>
                      )}
                    </div>

                    {/* Dominant data block. */}
                    <div className="min-w-0 flex-1">
                      {/* 1 · Brand / Model / Reference — header weight */}
                      <div className="mb-[3px] text-[8px] uppercase tracking-[2.5px] text-[var(--gold-subtle)]">
                        {row.brand}
                      </div>
                      <div className="mb-[2px] truncate font-display text-[14px] font-light leading-[1.25] text-[var(--platinum)]">
                        {row.model ?? row.brand}
                      </div>
                      <div className="mb-2 truncate text-[10px] tracking-[0.3px] text-[var(--muted)]">
                        {row.reference}
                      </div>

                      {/* 2-8 · the spec stack — each row absent if the field is */}
                      <SpecRow label="Case Size" value={sizeLabel(row.details?.caseSizeMm) || null} />
                      <SpecRow label="Movement" value={row.details?.movementType ?? null} />
                      <SpecRow label="Beat Rate" value={beatRateLabel(row.details?.movementFrequency) || null} />
                      <SpecRow label="Power Reserve" value={powerReserveLabel(row.details?.powerReserve) || null} />
                      <SpecRow label="Thickness" value={thicknessLabel(row.details?.caseThicknessMm) || null} />
                      <SpecRow label="Case Material" value={row.details?.caseMaterial ?? null} />
                      <SpecRow label="Documentation" value={docBadge} />

                      {/* 9 · Price */}
                      <div className="mt-2 font-display text-[16px] font-light text-[var(--platinum-dim)]">
                        {formatPrice(Number(row.asking_price))}
                      </div>
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
