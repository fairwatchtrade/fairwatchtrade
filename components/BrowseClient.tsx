"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

   v1.59 — Phase 1B follow-on (real-device evidence, iPhone 14 Pro 430x932):
   fixed mobile cramping by collapsing Collector to one card per row BELOW
   the md: breakpoint — but left it reverting to a 3/4-wide grid ABOVE that
   breakpoint, i.e. on desktop. That silently broke the core Collector View
   law (one listing per row, every width) the moment a wide monitor moved
   past 768px. Not a visual-preference bug — Collector's whole layout
   (small thumbnail left, DOMINANT data stack right) depends on a full-
   width row; forced into a 3-wide grid cell, the data stack becomes
   cramped exactly the way the mobile fix was trying to prevent.

   v2.5d — savedIds now seeds from the real saved_watches table on Browse
   mount (was session-only in v2.5c). Skips entirely when logged out — no
   behavior change for anonymous browsing. Save/unsave logic untouched.

   v2.5c — Add to Catalogue WIRED. saved_watches table created (verified
   nothing existed: no table, no migration history, no profiles column).
   Client-side insert via @/lib/supabase/client, same pattern as login page /
   NavBar Sign Out. Logged-out click → /login?callbackUrl=/browse (reuses the
   auth-flow-correction shipped this session). Duplicate-save is a harmless
   upsert no-op. Button shows a confirmed "Saved" state per session.

   v1.63 — Collector row polish: spec plate width pinned via inline style
   (the max-w utility was being ignored in the live build, letting values
   drift toward the price); watch photo enlarged to a portrait frame
   (120×150 mobile / 150×190 desktop, object-cover) to match the approved
   concept. No data, field, or logic changes.

   v1.62 — Collector View becomes a research tool. Three-zone row (photo /
   identity+capped-specs+Snapshot-trigger / price+Compare+Add-to-Catalogue).
   Collector Snapshot: inline absolute overlay, one-open-at-a-time, no layout
   shift, content generated ONLY from details keys verified to exist in
   production (buildSnapshot). Compare: per-row selection state only, no
   compare screen this phase. Add to Catalogue: placed & styled per the locked
   vocabulary but intentionally NOT wired — no Saved Watches store exists yet;
   handleAddToCatalogue is a no-op stub pending that mechanism. Out of scope
   per brief (deferred to Design Gate): guilloché, fumé, shadow/gutter/border
   aesthetic experimentation, animation refinement.

   v1.61 — Collector View outer wrapper: flex flex-col + real vertical gutter
   (space-y-6 md:space-y-8) replacing the grid gap-px background-bleed hack;
   per-row inset box-shadow perimeter. Gallery View grid untouched.

   v1.60 — restores the law: Collector View is grid-cols-1, unconditionally,
   at every width, full stop. The 3-wide/4-wide toggle is now removed from
   the DOM entirely (not grayed out) while Collector is active — it would
   otherwise sit on screen controlling nothing, which is worse than not
   being there. Gallery View: every width, untouched. 20/40/All page-size
   and Refine stay visible regardless of viewMode, per the brief.

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
   v2.10 — Back to Browse with filters preserved. The URL is now the single
   source of truth for all durable Browse view-state: the nine facet Sets,
   viewMode, gridCols, and pageSize are derived directly from useSearchParams()
   via useMemo — NOT parallel useState mirrors kept in sync with the URL.
   Two sources of truth is exactly the drift risk this design avoids: a
   separately-held useState value could theoretically render one tick out of
   sync with the URL; a value derived FROM the URL cannot, by construction.
   Toggling a filter/control calls router.replace() with a freshly-built
   URLSearchParams string — never manual string concatenation, which is
   exactly where the repeated-key/comma-hazard encoding (beatRateLabel() can
   contain a literal comma, e.g. "28,800 vph") would silently break if
   hand-rolled. openSnapshotId, compareSelected, isFilterOpen, mobileOpen, and
   savedIds are UNCHANGED — explicitly transient/DB-seeded, never persisted to
   the URL, per the locked ruling. All three listing-link call sites (Gallery
   card, Collector photo, Collector identity-header) now append the current
   Browse URL as an encoded returnTo value via listingHref(), so a buyer who
   opens a listing and clicks "← Browse" returns to the exact same filtered/
   sorted/paginated reality, not a reset one.
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
    // v1.62 — Collector Snapshot fields. Every key below was verified to
    // exist in real listings.details before being added here (Supabase read,
    // both production rows). Nothing speculative: the mockup's "Condition
    // Notes"/"Concern" were NOT in the data and are deliberately absent.
    // Scalars:
    calibre?: string;
    jewels?: string;
    crystalMaterial?: string;
    casebackType?: string;
    bezelMaterial?: string;
    waterResistance?: string;
    caseColorFinish?: string;
    closureType?: string;
    braceletWristSize?: string;
    // Arrays (rendered joined with " · " when non-empty):
    complications?: string[];
    serviceHistory?: string[];
    includedWithWatch?: string[];
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
                className={`flex h-[13px] w-[13px] shrink-0 items-center justify-center border-[1.5px] ${
                  isSelected
                    ? "border-[var(--border-gold)] bg-[rgba(201,168,76,0.08)]"
                    : "border-[var(--slate)] bg-[rgba(255,255,255,0.07)]"
                }`}
              >
                {isSelected && (
                  <div className="h-[5px] w-[5px] bg-[var(--gold)] opacity-100" />
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

// v1.62 — Collector Snapshot content, data-driven. Returns ONLY the deeper
// spec fields that (a) actually exist on this listing and (b) aren't already
// shown in the compact Collector row (Case Size / Movement / Beat Rate /
// Power Reserve / Thickness / Case Material / Documentation). Each field is
// emitted only when present — same "no penalty for missing data, only bad
// data" law SpecRow enforces. Arrays join with " · "; empty arrays are
// dropped, never rendered as an empty line. If this returns [], the row has
// nothing extra to reveal and the trigger is not shown at all.
function buildSnapshot(details: ListingRow["details"]): { label: string; value: string }[] {
  if (!details) return [];
  const rows: { label: string; value: string }[] = [];
  const scalar = (label: string, value?: string) => {
    if (value && value.trim()) rows.push({ label, value: value.trim() });
  };
  const list = (label: string, value?: string[]) => {
    if (Array.isArray(value) && value.length > 0) {
      rows.push({ label, value: value.join(" · ") });
    }
  };
  scalar("Calibre", details.calibre);
  scalar("Jewels", details.jewels);
  scalar("Crystal", details.crystalMaterial);
  scalar("Caseback", details.casebackType);
  scalar("Bezel", details.bezelMaterial);
  scalar("Water Resistance", details.waterResistance);
  scalar("Case Finish", details.caseColorFinish);
  scalar("Closure", details.closureType);
  scalar("Bracelet Fit", details.braceletWristSize);
  list("Complications", details.complications);
  list("Service History", details.serviceHistory);
  list("Included", details.includedWithWatch);
  return rows;
}

export default function BrowseClient({ listings }: { listings: ListingRow[] }) {
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // v2.10 — the URL is the single source of truth for durable Browse state.
  // router.replace() is used (never .push()) so filter/view/grid/page-size
  // clicks don't spam browser history — pressing Back once should leave
  // Browse, not undo one facet toggle at a time. scroll:false preserves the
  // pre-existing UX (clicking a control never scrolled the page before).
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Builds the next URL from the CURRENT searchParams (never from local
  // component state, which could theoretically be one render behind) plus
  // one changed key, and navigates via replace. Omitting a key entirely when
  // it would be empty/default keeps an all-defaults Browse at a clean
  // "/browse" with no query string at all, per the acceptance requirement.
  const navigateWithParams = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams.toString());
    mutate(next);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Multi-value facet toggle (repeated keys, e.g. ?brand=Omega&brand=Rolex).
  // Never comma-joins — the verified hazard is beatRateLabel() producing a
  // literal comma ("28,800 vph"); repeated keys sidestep that class of bug
  // entirely rather than trying to escape commas correctly.
  const toggleFilterParam = (key: string, value: string) => {
    navigateWithParams((next) => {
      const current = next.getAll(key);
      next.delete(key);
      if (current.includes(value)) {
        for (const v of current) if (v !== value) next.append(key, v);
      } else {
        for (const v of current) next.append(key, v);
        next.append(key, value);
      }
    });
  };

  // Single-value control (viewMode / gridCols / pageSize). Omits the key
  // entirely when set back to its default, so the URL never carries redundant
  // "everything is default" noise.
  const setSingleParam = (key: string, value: string, defaultValue: string) => {
    navigateWithParams((next) => {
      if (value === defaultValue) next.delete(key);
      else next.set(key, value);
    });
  };

  const viewModeParam = searchParams.get("viewMode");
  const viewMode: "gallery" | "collector" =
    viewModeParam === "collector" ? "collector" : "gallery";
  const setViewMode = (value: "gallery" | "collector") =>
    setSingleParam("viewMode", value, "gallery");

  const gridColsParam = searchParams.get("gridCols");
  const gridCols: 3 | 4 = gridColsParam === "4" ? 4 : 3;
  const setGridCols = (value: 3 | 4) => setSingleParam("gridCols", String(value), "3");

  const pageSizeParam = searchParams.get("pageSize");
  const pageSize: 20 | 40 | "all" =
    pageSizeParam === "40" ? 40 : pageSizeParam === "all" ? "all" : 20;
  const setPageSize = (value: 20 | 40 | "all") =>
    setSingleParam("pageSize", String(value), "20");

  // The current Browse reality, as a single encoded value — used to build
  // every listing link's returnTo. Built via URLSearchParams (never manual
  // template-literal concatenation), so nested repeated params and the
  // beatRate comma hazard are encoded/decoded symmetrically for free —
  // verified by round-trip test before this was written.
  const currentBrowseUrl = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);

  const listingHref = (id: string) => {
    const p = new URLSearchParams();
    p.set("returnTo", currentBrowseUrl);
    return `/listings/${id}?${p.toString()}`;
  };
  // v1.62 — Collector research workflow state.
  // Only ONE snapshot may be open at a time: a single id (or null), never a
  // Set — opening another row's snapshot simply replaces this value, which
  // is the "opening another automatically closes the previous" rule for free.
  const [openSnapshotId, setOpenSnapshotId] = useState<string | null>(null);
  // Compare is selection-only this phase (no compare screen yet). The Set is
  // the workflow-preparation surface the future compare view will read from.
  const [compareSelected, setCompareSelected] = useState<Set<string>>(new Set());
  // v2.5d — savedIds now seeds from the database on mount (was session-only
  // in v2.5c, which read as broken even though saves persisted correctly —
  // /catalogue always showed them right, Browse just didn't know yet).
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  // (router is declared once, above, in the URL-state block — v2.10)

  // v2.5d — one query on load. Skips entirely if not logged in, so savedIds
  // stays empty exactly as before — no behavior change for anonymous
  // browsing. Does not touch save/unsave logic, only seeds initial state.
  useEffect(() => {
    let cancelled = false;
    async function seedSavedIds() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("saved_watches")
        .select("listing_id")
        .eq("user_id", user.id);

      if (!cancelled && !error && Array.isArray(data)) {
        setSavedIds(new Set(data.map((r) => r.listing_id as string)));
      }
    }
    seedSavedIds();
    return () => {
      cancelled = true;
    };
  }, []);

  // v2.10 — each filter is now DERIVED from the URL (useMemo over
  // searchParams.getAll(key)), not held as independent useState. Same names,
  // same Set<string> shape, so the FacetGroup renders and the `filtered`
  // useMemo below are UNCHANGED — only the origin of the value moved.
  const selectedBrands = useMemo(() => new Set(searchParams.getAll("brand")), [searchParams]);
  const selectedConditions = useMemo(
    () => new Set(searchParams.getAll("condition")),
    [searchParams]
  );
  const selectedCaseSizes = useMemo(
    () => new Set(searchParams.getAll("caseSize")),
    [searchParams]
  );
  const selectedMovements = useMemo(
    () => new Set(searchParams.getAll("movement")),
    [searchParams]
  );
  // v1.57 — Workbench-only facets (never rendered in the ordinary rail).
  const selectedBeatRates = useMemo(
    () => new Set(searchParams.getAll("beatRate")),
    [searchParams]
  );
  const selectedPowerReserves = useMemo(
    () => new Set(searchParams.getAll("powerReserve")),
    [searchParams]
  );
  const selectedMaterials = useMemo(
    () => new Set(searchParams.getAll("caseMaterial")),
    [searchParams]
  );
  const selectedDials = useMemo(() => new Set(searchParams.getAll("dialColor")), [searchParams]);
  const selectedDocs = useMemo(() => new Set(searchParams.getAll("docs")), [searchParams]);

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

  // v1.62 — Collector workflow handlers.
  const toggleSnapshot = (id: string) =>
    setOpenSnapshotId((prev) => (prev === id ? null : id));

  const toggleCompare = (id: string) =>
    setCompareSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // v2.5c — Add to Catalogue: WIRED. The saved_watches table now exists
  // (verified via Supabase: no table, no migration history, no profiles
  // column — genuinely nothing before this build; created fresh, RLS
  // enabled, own-row-only policies). This writes directly from the client,
  // same pattern as the login page and NavBar's Sign Out already use
  // (@/lib/supabase/client). Logged-out click sends the user to /login with
  // callbackUrl=/browse, reusing the exact auth-flow-correction mechanism
  // shipped this session — login honors it and returns them here.
  const handleAddToCatalogue = async (id: string) => {
    if (savedIds.has(id)) return; // already saved this session — no-op

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login?callbackUrl=/browse");
      return;
    }

    // upsert + ignoreDuplicates: idempotent against the (user_id, listing_id)
    // primary key — re-saving an already-saved watch is a harmless no-op,
    // never a thrown error surfaced to the collector.
    const { error } = await supabase
      .from("saved_watches")
      .upsert({ user_id: user.id, listing_id: id }, { onConflict: "user_id,listing_id", ignoreDuplicates: true });

    if (error) {
      console.error("[FairWatchTrade] Add to Catalogue failed:", error);
      return;
    }

    setSavedIds((prev) => new Set(prev).add(id));
  };

  const toggleBrand = (value: string) => toggleFilterParam("brand", value);

  const toggleCondition = (value: string) => toggleFilterParam("condition", value);

  const toggleCaseSize = (value: string) => toggleFilterParam("caseSize", value);

  const toggleMovement = (value: string) => toggleFilterParam("movement", value);

  const toggleBeatRate = (value: string) => toggleFilterParam("beatRate", value);

  const togglePowerReserve = (value: string) => toggleFilterParam("powerReserve", value);

  const toggleMaterial = (value: string) => toggleFilterParam("caseMaterial", value);

  const toggleDial = (value: string) => toggleFilterParam("dialColor", value);

  const toggleDoc = (value: string) => toggleFilterParam("docs", value);

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
          {/* v1.60 — absent from the DOM in Collector View, not grayed out:
              once Collector is always grid-cols-1, this toggle would
              control nothing while sitting on screen implying it does. */}
          {viewMode === "gallery" && (
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
          )}

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
              // v1.61 — Collector View: stacked block, not a grid. space-y-*
              // utilities don't apply inside `grid`, so Collector gets its
              // own flex flex-col wrapper with real vertical gutters instead
              // of the old gap-px background-bleed hack. Gallery View's grid
              // wrapper is untouched — byte-for-byte the same as v1.60.
              className={
                viewMode === "collector"
                  ? "flex flex-col space-y-6 md:space-y-8"
                  : `grid gap-px bg-[var(--border-faint)] ${
                      gridCols === 3 ? "grid-cols-3" : "grid-cols-4"
                    }`
              }
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
                      href={listingHref(row.id)}
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

                // v1.62 — Collector View research row. Three zones:
                //   • photo (left)  — links to detail
                //   • identity + capped spec plate + Snapshot trigger (middle)
                //   • price + Compare + Add to Catalogue (right)
                // The row is no longer a single wrapping <Link>: it now holds
                // interactive controls (checkbox, buttons) that must NOT
                // navigate, so ONLY the photo and identity header link to the
                // detail page. Spec fields and normalizers (sizeLabel,
                // beatRateLabel, powerReserveLabel, thicknessLabel) and the
                // "no missing-data placeholder" law are unchanged from v1.58.
                const snapshotRows = buildSnapshot(row.details);
                const hasSnapshot = snapshotRows.length > 0;
                const isSnapshotOpen = openSnapshotId === row.id;
                const isCompared = compareSelected.has(row.id);

                return (
                  <div
                    key={row.id}
                    // Perimeter whisper preserved from v1.61 (inset only, sharp
                    // corners, no drop-shadow). The row is raised above its
                    // siblings ONLY while its snapshot is open, so the absolute
                    // overlay is never clipped by the row beneath it.
                    className={`group relative flex gap-4 p-5 shadow-[inset_0_0_0_1px_rgba(232,220,190,0.05)] transition ${
                      isSnapshotOpen ? "z-30" : "z-0"
                    }`}
                  >
                    {/* Photo (left) — links to detail. v1.63: enlarged to a
                        portrait frame (was 84×84) to match the approved concept
                        — the watch photo now carries real presence beside the
                        spec plate. Responsive so it doesn't crowd phone widths.
                        object-cover fills the frame edge-to-edge (was contain);
                        revert to object-contain if any hero crops awkwardly. */}
                    <Link
                      href={listingHref(row.id)}
                      className="flex h-[150px] w-[120px] shrink-0 items-center justify-center overflow-hidden bg-[var(--ink-deep)] transition hover:opacity-90 md:h-[190px] md:w-[150px]"
                    >
                      {hero ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={hero} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="text-center text-[9px] leading-tight tracking-[0.3px] text-[var(--ghost)]">
                          No photo
                        </div>
                      )}
                    </Link>

                    {/* Middle — identity (links to detail), capped spec plate,
                        Snapshot trigger. */}
                    <div className="min-w-0 flex-1">
                      <Link href={listingHref(row.id)} className="block">
                        <div className="mb-[3px] text-[8px] uppercase tracking-[2.5px] text-[var(--gold-subtle)]">
                          {row.brand}
                        </div>
                        <div className="mb-[2px] flex items-center gap-2">
                          <span className="truncate font-display text-[14px] font-light leading-[1.25] text-[var(--platinum)]">
                            {row.model ?? row.brand}
                          </span>
                          {row.in_hand_verified && (
                            <span
                              title="In Hand Verified"
                              aria-label="In Hand Verified"
                              className="shrink-0 text-[var(--gold)] opacity-70"
                            >
                              🛡️
                            </span>
                          )}
                        </div>
                        <div className="mb-2 truncate text-[10px] tracking-[0.3px] text-[var(--muted)]">
                          {row.reference}
                        </div>
                      </Link>

                      {/* Spec plate — width-pinned so each label↔value pair
                          stays close and never stretches across the row (brief
                          §1). v1.63: the utility cap (max-w-[380px]) was being
                          ignored in the live build, letting values drift toward
                          the price column — so the width is pinned with an
                          inline style here, which the browser honors
                          unconditionally. Fields/normalizers unchanged. */}
                      <div style={{ maxWidth: 420 }}>
                        <SpecRow label="Case Size" value={sizeLabel(row.details?.caseSizeMm) || null} />
                        <SpecRow label="Movement" value={row.details?.movementType ?? null} />
                        <SpecRow label="Beat Rate" value={beatRateLabel(row.details?.movementFrequency) || null} />
                        <SpecRow label="Power Reserve" value={powerReserveLabel(row.details?.powerReserve) || null} />
                        <SpecRow label="Thickness" value={thicknessLabel(row.details?.caseThicknessMm) || null} />
                        <SpecRow label="Case Material" value={row.details?.caseMaterial ?? null} />
                        <SpecRow label="Documentation" value={docBadge} />
                      </div>

                      {/* Snapshot trigger — shown only when there is deeper
                          data to reveal. Never navigates. */}
                      {hasSnapshot && (
                        <button
                          type="button"
                          onClick={() => toggleSnapshot(row.id)}
                          aria-expanded={isSnapshotOpen}
                          className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-[2px] text-[var(--gold-subtle)] transition hover:text-[var(--gold)]"
                        >
                          <span className={`transition-transform ${isSnapshotOpen ? "rotate-180" : ""}`}>▼</span>
                          Collector Snapshot
                        </button>
                      )}
                    </div>

                    {/* Right — price + workflow actions. */}
                    <div className="flex w-[190px] shrink-0 flex-col items-end justify-between gap-4">
                      <div className="font-display text-[16px] font-light text-[var(--platinum-dim)]">
                        {formatPrice(Number(row.asking_price))}
                      </div>

                      <div className="w-full">
                        {/* Compare — selection only this phase. Never navigates. */}
                        <button
                          type="button"
                          onClick={() => toggleCompare(row.id)}
                          aria-pressed={isCompared}
                          className={`flex w-full items-center gap-2 border px-[10px] py-[7px] text-[10px] uppercase tracking-[1.5px] transition ${
                            isCompared
                              ? "border-[var(--border-gold)] text-[var(--gold)]"
                              : "border-[var(--border-subtle)] text-[var(--muted)] hover:text-[var(--slate)]"
                          }`}
                        >
                          <span
                            className={`flex h-[13px] w-[13px] shrink-0 items-center justify-center border-[1.5px] ${
                              isCompared
                                ? "border-[var(--border-gold)] bg-[rgba(201,168,76,0.08)]"
                                : "border-[var(--slate)] bg-[rgba(255,255,255,0.07)]"
                            }`}
                          >
                            {isCompared && <span className="h-[5px] w-[5px] bg-[var(--gold)] opacity-100" />}
                          </span>
                          Compare
                        </button>

                        {/* Add to Catalogue — v2.5c: WIRED to the real
                            saved_watches table. Shows a confirmed state
                            once saved this session; re-click is a no-op
                            (handleAddToCatalogue short-circuits on savedIds). */}
                        <button
                          type="button"
                          onClick={() => handleAddToCatalogue(row.id)}
                          disabled={savedIds.has(row.id)}
                          className={`mt-[10px] flex w-full items-center gap-1 border px-[10px] py-[7px] text-[10px] uppercase tracking-[1.5px] transition ${
                            savedIds.has(row.id)
                              ? "cursor-default border-[var(--border-gold)] text-[var(--gold)]"
                              : "border-[var(--border-subtle)] text-[var(--muted)] hover:text-[var(--slate)]"
                          }`}
                        >
                          {savedIds.has(row.id) ? (
                            <>
                              <span>✓</span> Saved
                            </>
                          ) : (
                            <>
                              <span className="text-[var(--gold-subtle)]">＋</span> Add to Catalogue
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Collector Snapshot overlay — absolute, anchored to this
                        row. Absolute positioning means it does NOT push the
                        following listings down (brief §2/§5: Browse stays
                        stable). One-open-at-a-time is guaranteed by the single
                        openSnapshotId. Content is generated only from fields
                        that exist on THIS listing (buildSnapshot). NOTE: the
                        panel's border/shadow here are the minimum needed to
                        read as a floating surface over the row beneath — any
                        aesthetic refinement of this treatment is deferred to
                        the Design Gate, per the brief's out-of-scope list. */}
                    {isSnapshotOpen && (
                      <div className="absolute left-[100px] right-4 top-[calc(100%-14px)] z-40 border border-[rgba(232,220,190,0.16)] bg-[var(--ink-deep)] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.42)]">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-[8px] uppercase tracking-[2.5px] text-[var(--gold-subtle)]">
                            Collector Snapshot · {row.model ?? row.brand}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleSnapshot(row.id)}
                            aria-label="Close snapshot"
                            className="text-[10px] uppercase tracking-[1.5px] text-[var(--ghost)] transition hover:text-[var(--slate)]"
                          >
                            Close
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
                          {snapshotRows.map((s) => (
                            <div
                              key={s.label}
                              className="flex items-baseline justify-between gap-3 border-b border-[var(--border-faint)] py-1 text-[11px] tracking-[0.3px]"
                            >
                              <span className="shrink-0 text-[var(--ghost)]">{s.label}</span>
                              <span className="text-right text-[var(--slate)]">{s.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
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
