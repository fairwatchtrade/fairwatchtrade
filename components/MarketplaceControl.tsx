"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import HelpBubble from "@/components/HelpBubble";
import { formatMoney } from "@/lib/formatMoney";
import { adminLabel, statusTokenKey } from "@/lib/listingStatus";
import {
  LIFE_STATUSES,
  PER_OPTIONS,
  type LifeView,
  type McPayload,
  type McRow,
  type McSort,
} from "@/lib/marketplaceControlData";

/* ════════════════════════════════════════════════════════════════════════
   MARKETPLACE CONTROL — components/MarketplaceControl.tsx

   The founder's marketplace operations room (the evolved /admin). Winning
   composition per the 2026-08-20 competing Design Gate:

     lifecycle controls / search / filters
       → compact watch-centered ledger
       → persistent selected-listing inspector

   Two views of ONE room: Operational (FWT-curated, default) and Detailed
   (operator-configurable audit table). Same inventory, same state — the
   switch never mutates product truth.

   All retrieval is server-side (/api/admin/marketplace): the room never
   loads the retained listing universe into the browser. CURRENT stays
   operationally small even when history becomes enormous.

   Selection is sticky WITHIN a result context, never beyond it. A filter,
   sort, page, or lifecycle change preserves the selection as long as the
   listing is still part of what the ledger is showing; the moment the
   current context no longer contains it, the selection clears. The room
   must never hold an inspector open on a listing the visible ledger does
   not contain — that stale pane was the founder SEE-it defect. It is
   cleared three ways: the inspector ×, a click on genuinely neutral
   workspace, or falling out of context. It is never set automatically.

   PFC274 = 62 — no scoring machinery is touched here; significance is
   displayed to the founder only, exactly as the previous admin table did.
   ════════════════════════════════════════════════════════════════════════ */

/* ── View state (presentation/query only — the saved-view law) ─────────── */

type ColumnsState = {
  order: string[];
  hidden: string[];
  widths: Record<string, number>;
};

type ViewState = {
  mode: "operational" | "detailed";
  life: LifeView;
  status: string | null;
  q: string;
  seller: string | null;
  new24h: boolean;
  dealer: boolean;
  requests: boolean;
  attention: boolean;
  sort: McSort;
  per: number;
  columns: ColumnsState;
};

type SavedView = { name: string; state: ViewState };

export type McPrefs = {
  marketplaceControl?: {
    /* perExplicit marks a page size the founder actually chose (Rows
       control / saved view). Older builds persisted `per` on every save, so
       a bare stored `per` WITHOUT this flag is residue of the device
       default, not a choice — it is ignored on restore and stripped by the
       next persist. */
    lastUsed?: Partial<ViewState> & { perExplicit?: boolean };
    savedViews?: SavedView[];
  };
};

const DETAIL_DEFAULT_VISIBLE = [
  "seller",
  "status",
  "price",
  "completeness",
  "significance",
  "ai",
  "custom",
  "created",
];

const DETAIL_COLUMNS: Array<{
  key: string;
  label: string;
  width: number;
  sortAsc?: McSort;
  sortDesc?: McSort;
}> = [
  { key: "seller", label: "Seller", width: 140 },
  { key: "status", label: "Status", width: 120, sortAsc: "status_asc", sortDesc: "status_desc" },
  { key: "price", label: "Price", width: 110, sortAsc: "price_asc", sortDesc: "price_desc" },
  { key: "currency", label: "Currency", width: 84 },
  { key: "condition", label: "Condition", width: 110 },
  { key: "year", label: "Year", width: 76 },
  { key: "completeness", label: "Compl.", width: 76 },
  { key: "significance", label: "Signif.", width: 76 },
  { key: "ai", label: "AI", width: 60 },
  { key: "custom", label: "Custom", width: 80 },
  { key: "inhand", label: "In Hand", width: 84 },
  { key: "dealer", label: "Dealer Import", width: 120 },
  { key: "hold", label: "Hold Reason", width: 180 },
  { key: "removal", label: "Removal", width: 130 },
  { key: "privateBuyer", label: "Private", width: 80 },
  { key: "rejection", label: "Rejection Reason", width: 180 },
  { key: "created", label: "Created", width: 110, sortAsc: "created_asc", sortDesc: "created_desc" },
  { key: "updated", label: "Updated", width: 110, sortDesc: "updated_desc" },
];

const COL_MIN = 60;
const COL_MAX = 420;
/* The Listing column is the star and keeps a real column of its own — but a
   FIXED one, so the metadata columns receive the surplus on a wide monitor
   instead of it all pooling here. MIN is what it may compress to before the
   table starts scrolling horizontally (the pre-existing narrow behavior). */
const LISTING_COL_BASE = 340;
const LISTING_COL_MIN = 280;
const MAX_SAVED_VIEWS = 8;

/* Everything a founder can aim at. A click landing inside any of these is
   aimed work — it keeps its meaning and never doubles as a dismissal. Rows
   carry data-mc-row (they select); the inspector and the confirmation dialog
   carry data-mc-keep; the column resize grips are role="separator". Anything
   NOT matching this is background, and clicking background puts a transient
   surface down. Add to this list before adding any new bare-div control. */
const MC_INTERACTIVE =
  '[data-mc-row],[data-mc-keep],a,button,input,select,textarea,label,option,summary,[role="tab"],[role="dialog"],[role="separator"]';

/* The FWT listing ID's reading face — Sitka locally, serif fallback, no
   webfont asset. An identifier the founder scans and repeats aloud deserves
   a face made for reading; the compressed UI face at small sizes was the
   "smooshed" defect the ergonomics order names. */
const ID_FACE: CSSProperties = {
  fontFamily: '"Sitka Text", Sitka, Georgia, Cambria, "Times New Roman", serif',
};

/* ── The room's dropdown ────────────────────────────────────────────────
   FairWatchTrade already has a select language; this room simply had not
   spoken it. The parts that carry over from the established treatment
   (Account Settings, the Sell Flow fields) are the option list painted in
   --surface-2 with --platinum text — without it the native menu drops a
   bright platform slab into a dark room — and gold on focus.

   What was missing here was the chrome. A bare <select> paints the
   platform's own arrow and focus ring, which is precisely the
   half-finished-browser-furniture read: FWT type inside, Windows outside.
   appearance-none removes it and the shell supplies the caret and a
   focus-within gold edge, so the whole control lights as one object
   instead of the platform lighting the inner element.

   It stays a real <select> on purpose. Keyboard behavior, type-ahead,
   option semantics, mobile's native picker, and assistive technology are
   all free here and are all work to rebuild badly — the complaint was
   material, not mechanism, so only the material changed. Legibility is
   token-driven, so Daylight and dark both follow the theme. */
const MC_SELECT =
  "appearance-none bg-transparent pr-4 text-[var(--platinum)] outline-none [&>option]:bg-[var(--surface-2)] [&>option]:text-[var(--platinum)]";

function McSelect({
  label,
  value,
  onChange,
  ariaLabel,
  dense = false,
  selectClassName = "",
  children,
}: {
  label?: string;
  value: string | number;
  onChange: (value: string) => void;
  ariaLabel?: string;
  dense?: boolean;
  selectClassName?: string;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex items-center gap-2 border border-[var(--border-mid)] transition-colors focus-within:border-[var(--gold-dim)] ${
        dense ? "h-[26px] px-1.5" : "h-[34px] px-2"
      }`}
    >
      {label && (
        <span className="whitespace-nowrap text-[9px] uppercase tracking-[1.5px] text-[var(--muted)]">
          {label}
        </span>
      )}
      <span className="relative flex min-w-0 items-center">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel ?? label}
          className={`${MC_SELECT} ${dense ? "text-[11px]" : "text-[12px]"} ${selectClassName}`}
        >
          {children}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-0 text-[8px] leading-none text-[var(--muted)]"
        >
          ▼
        </span>
      </span>
    </label>
  );
}

function defaultColumns(): ColumnsState {
  return {
    order: DETAIL_COLUMNS.map((c) => c.key),
    hidden: DETAIL_COLUMNS.map((c) => c.key).filter(
      (k) => !DETAIL_DEFAULT_VISIBLE.includes(k)
    ),
    widths: {},
  };
}

/* defaultPer is the DEVICE-CLASS default resolved by the server page
   (mobile 25 / desktop 50). An explicit founder choice overrides it via
   prefs; the device default itself is never persisted, so a phone visit can
   never quietly rewrite the desktop page size (or vice versa). */
function defaultViewState(defaultPer: number): ViewState {
  return {
    mode: "operational",
    life: "current",
    status: null,
    q: "",
    seller: null,
    new24h: false,
    dealer: false,
    requests: false,
    attention: false,
    sort: "created_desc",
    per: defaultPer,
    columns: defaultColumns(),
  };
}

/* Bounded page navigation: Previous · 1 · 2 · 3 · … · N · Next. Always the
   first/last page, a window around the current one, ellipses for the rest. */
function pageWindow(current: number, count: number): Array<number | "…"> {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const wanted = new Set(
    [1, 2, current - 1, current, current + 1, count - 1, count].filter(
      (n) => n >= 1 && n <= count
    )
  );
  const out: Array<number | "…"> = [];
  let prev = 0;
  for (const n of [...wanted].sort((a, b) => a - b)) {
    if (n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
}

/* Presentation config survives across sessions; the OPERATING position does
   not — the room always opens on CURRENT with no residual filters (the
   lifecycle law: CURRENT is the default operating surface). A stored `per`
   exists ONLY when the founder explicitly chose one (Rows control / saved
   view) — the persistence path strips it otherwise. */
function restoredViewState(prefs: McPrefs, defaultPer: number): ViewState {
  const base = defaultViewState(defaultPer);
  const last = prefs.marketplaceControl?.lastUsed;
  if (!last) return base;
  return {
    ...base,
    mode: last.mode === "detailed" ? "detailed" : "operational",
    sort:
      typeof last.sort === "string" && last.sort ? (last.sort as McSort) : base.sort,
    per:
      last.perExplicit === true &&
      typeof last.per === "number" &&
      (PER_OPTIONS as readonly number[]).includes(last.per)
        ? last.per
        : base.per,
    columns: {
      order: Array.isArray(last.columns?.order)
        ? reconcileOrder(last.columns.order)
        : base.columns.order,
      hidden: Array.isArray(last.columns?.hidden)
        ? last.columns.hidden.filter((k) => DETAIL_COLUMNS.some((c) => c.key === k))
        : base.columns.hidden,
      widths:
        last.columns?.widths && typeof last.columns.widths === "object"
          ? last.columns.widths
          : {},
    },
  };
}

/* Stored orders survive column-registry changes: unknown keys drop, new
   registry keys append. */
function reconcileOrder(stored: string[]): string[] {
  const known = DETAIL_COLUMNS.map((c) => c.key);
  const kept = stored.filter((k) => known.includes(k));
  const missing = known.filter((k) => !kept.includes(k));
  return [...kept, ...missing];
}

/* The arrangement a saved preset actually becomes when restored — defaults
   underneath, the preset over them, columns reconciled against the columns
   that exist today. ONE definition, used both to apply a preset and to ask
   whether the working view is still that preset; if those two ever answered
   differently, a restored view would instantly stop calling itself by name. */
function reconcileSavedView(sv: SavedView, defaultPer: number): ViewState {
  return {
    ...defaultViewState(defaultPer),
    ...sv.state,
    columns: {
      order: reconcileOrder(sv.state.columns?.order ?? []),
      hidden: (sv.state.columns?.hidden ?? []).filter((k) =>
        DETAIL_COLUMNS.some((c) => c.key === k)
      ),
      widths: sv.state.columns?.widths ?? {},
    },
  };
}

/* Order-independent identity of an arrangement. An array, not the object, so
   two views built by different spread paths cannot compare unequal purely
   because their keys were written in a different order. */
function viewFingerprint(v: ViewState): string {
  return JSON.stringify([
    v.mode,
    v.life,
    v.status,
    v.q,
    v.seller,
    v.new24h,
    v.dealer,
    v.requests,
    v.attention,
    v.sort,
    v.per,
    v.columns.order.join(","),
    [...v.columns.hidden].sort().join(","),
    Object.keys(v.columns.widths)
      .sort()
      .map((k) => `${k}:${v.columns.widths[k]}`)
      .join(","),
  ]);
}

/* ── Small shared bits ─────────────────────────────────────────────────── */

const CODE_SHAPE = /^[a-z][0-9]{5}$/i;

const LIFE_META: Record<LifeView, { name: string; help: string }> = {
  current: {
    name: "Current",
    help: "Live inventory, drafts in motion, review and attention states.",
  },
  offmarket: {
    name: "Off Market",
    help: "Inventory that still exists but is intentionally not live.",
  },
  history: { name: "History", help: "Cold retained truth you deliberately went looking for." },
  all: { name: "All", help: "Deliberate retrieval only — never the default operating dump." },
};

const LIFE_ORDER: LifeView[] = ["current", "offmarket", "history", "all"];

function relativeDate(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function absoluteDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusBadgeStyle(status: string): CSSProperties {
  const key = statusTokenKey(status);
  return {
    borderColor: `var(--lc-${key}-line)`,
    color: `var(--lc-${key}-badge, var(--muted))`,
    backgroundColor: `var(--lc-${key}-wash, transparent)`,
  };
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className="inline-flex items-center border px-2 py-0.5 text-[11px] uppercase tracking-[1.2px] whitespace-nowrap"
      style={statusBadgeStyle(status)}
    >
      {adminLabel(status)}
    </span>
  );
}

function Thumb({ row, size }: { row: McRow; size: number }) {
  return row.thumb ? (
    // eslint-disable-next-line @next/next/no-img-element -- operator thumbnails at ledger scale; blob host not in next/image config
    <img
      src={row.thumb}
      alt={`${row.brand} ${row.model ?? ""}`.trim()}
      width={size}
      height={size}
      className="border border-[var(--border-subtle)] object-cover"
      style={{ width: size, height: size }}
      loading="lazy"
    />
  ) : (
    <div
      className="grid place-items-center border border-[var(--border-faint)] text-center text-[8px] uppercase tracking-[1px] text-[var(--muted)]"
      style={{ width: size, height: size }}
    >
      No photo
    </div>
  );
}

/* ── Column sort header — one behavior for Operational AND Detailed ──────
   Ancestry: the previous admin table's click-to-sort header (restored after
   the redesign dropped it from the default room). First click on a column
   sorts descending, second flips ascending; the active column shows gold +
   ↑/↓. Sorting is server-side and always returns to page 1 (the caller's
   onSort does both). */
function sortStateOf(sort: McSort, asc?: McSort, desc?: McSort): "asc" | "desc" | null {
  if (asc && sort === asc) return "asc";
  if (desc && sort === desc) return "desc";
  return null;
}

function SortHead({
  label,
  asc,
  desc,
  sort,
  onSort,
}: {
  label: string;
  asc?: McSort;
  desc?: McSort;
  sort: McSort;
  onSort: (next: McSort) => void;
}) {
  const state = sortStateOf(sort, asc, desc);
  const next: McSort =
    state === "desc" ? ((asc ?? desc) as McSort) : ((desc ?? asc) as McSort);
  return (
    <button
      type="button"
      onClick={() => onSort(next)}
      aria-sort={state === "asc" ? "ascending" : state === "desc" ? "descending" : undefined}
      className={`text-left uppercase tracking-[1.8px] ${
        state ? "text-[var(--gold)]" : "hover:text-[var(--platinum)]"
      }`}
    >
      {label}
      {state === "asc" ? " ↑" : state === "desc" ? " ↓" : ""}
    </button>
  );
}

/* ── Bulk / destructive dialog machinery ───────────────────────────────── */

type BulkOp = "remove" | "delete";

type BulkPreview = {
  op: BulkOp;
  candidates: number;
  eligible: Array<{ id: string; public_code: string | null; brand: string; model: string | null; status: string }>;
  blocked: Array<{ id: string; public_code: string | null; brand: string; model: string | null; status: string; blockers: string[] }>;
};

type BulkExecResult = {
  succeeded: number;
  failed: number;
  results: Array<{ id: string; ok: boolean; blocked?: boolean; error?: string; media_deleted?: number; media_stranded?: number }>;
};

const REASON_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "sold_in_store", label: "Sold in store" },
  { code: "sold_elsewhere", label: "Sold elsewhere" },
  { code: "no_longer_for_sale", label: "No longer for sale" },
  { code: "listing_mistake", label: "Listing mistake / duplicate" },
  { code: "other", label: "Other" },
];

const EXECUTE_CHUNK = 25;

async function bulkPreview(body: {
  op: BulkOp;
  sellerId?: string;
  listingIds?: string[];
}): Promise<BulkPreview> {
  const res = await fetch("/api/admin/marketplace/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, mode: "preview" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail ?? "Preview failed.");
  return data as BulkPreview;
}

async function bulkExecute(
  op: BulkOp,
  ids: string[],
  reasonCode: string | null,
  onProgress: (done: number, total: number) => void
): Promise<BulkExecResult> {
  const all: BulkExecResult = { succeeded: 0, failed: 0, results: [] };
  for (let i = 0; i < ids.length; i += EXECUTE_CHUNK) {
    const chunk = ids.slice(i, i + EXECUTE_CHUNK);
    const res = await fetch("/api/admin/marketplace/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, mode: "execute", listingIds: chunk, reasonCode }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail ?? "Execution failed.");
    all.succeeded += data.succeeded ?? 0;
    all.failed += data.failed ?? 0;
    all.results.push(...(data.results ?? []));
    onProgress(Math.min(i + EXECUTE_CHUNK, ids.length), ids.length);
  }
  return all;
}

function BulkDialog({
  op,
  preview,
  onClose,
  onDone,
}: {
  op: BulkOp;
  preview: BulkPreview;
  onClose: () => void;
  onDone: (result: BulkExecResult) => void;
}) {
  const [reasonCode, setReasonCode] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<BulkExecResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verb = op === "delete" ? "Permanently delete" : "Take off market";
  const eligibleIds = preview.eligible.map((e) => e.id);

  async function run() {
    if (op === "delete" && !reasonCode) {
      setError("Choose why these listings are leaving for good.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const r = await bulkExecute(
        op,
        eligibleIds,
        op === "delete" ? reasonCode : reasonCode || null,
        (done, total) => setProgress({ done, total })
      );
      setResult(r);
      onDone(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Execution failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    /* data-mc-keep: the room's neutral-click dismissal must not reach through
       an open confirmation. The dialog keeps its own explicit close controls
       — a destructive confirmation is not something a stray click puts down. */
    <div
      data-mc-keep
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
    >
      <div className="max-h-[85vh] w-full max-w-[560px] overflow-y-auto border border-[var(--border-mid)] bg-[var(--surface)] p-6">
        <div className="text-[10px] uppercase tracking-[2.5px] text-[var(--gold-dim)]">
          {op === "delete" ? "Permanent Delete" : "Take Off Market"}
        </div>

        {result ? (
          <>
            <div className="mt-2 font-display text-[18px] font-light text-[var(--platinum)]">
              {result.succeeded} of {result.results.length} completed
            </div>
            <ul className="mt-3 max-h-[220px] space-y-1 overflow-y-auto text-[12px] text-[var(--platinum-dim)]">
              {result.results.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{r.id}</span>
                  <span className={r.ok ? "text-[var(--gold)]" : "text-[var(--danger)]"}>
                    {r.ok
                      ? op === "delete"
                        ? `deleted${typeof r.media_deleted === "number" ? ` · ${r.media_deleted} photos purged` : ""}${r.media_stranded ? ` · ${r.media_stranded} stranded` : ""}`
                        : "off market"
                      : r.blocked
                        ? "blocked at execution — nothing changed"
                        : (r.error ?? "failed")}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="border border-[var(--border-mid)] px-4 py-2 text-[11px] uppercase tracking-[1.5px] text-[var(--platinum)] hover:border-[var(--border-subtle)]"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-2 font-display text-[18px] font-light text-[var(--platinum)]">
              {verb} {preview.eligible.length} listing
              {preview.eligible.length === 1 ? "" : "s"}
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
              {preview.candidates} candidate{preview.candidates === 1 ? "" : "s"} ·{" "}
              {preview.eligible.length} eligible · {preview.blocked.length} blocked.
              {op === "delete"
                ? " Deletion is permanent — the governed purge re-checks every blocker inside its own lock before anything is removed."
                : " Listings keep every byte of their data; only public availability ends. Pending purchase requests close truthfully."}
            </p>

            {preview.blocked.length > 0 && (
              <div className="mt-4 border-l-2 border-[var(--danger)] bg-[var(--danger)]/[0.05] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[2px] text-[var(--danger)]">
                  Blocked — will not be touched
                </div>
                <ul className="mt-1.5 max-h-[160px] space-y-1 overflow-y-auto text-[12px] text-[var(--platinum-dim)]">
                  {preview.blocked.map((b) => (
                    <li key={b.id}>
                      <span className="text-[var(--platinum)]">
                        {b.brand} {b.model ?? ""}
                      </span>{" "}
                      <span className="text-[var(--gold-dim)]">{b.public_code ?? b.id}</span>
                      <span className="block text-[11px] text-[var(--muted)]">
                        {b.blockers.join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.eligible.length > 0 && (
              <ul className="mt-4 max-h-[180px] space-y-1 overflow-y-auto border border-[var(--border-faint)] px-3 py-2 text-[12px] text-[var(--platinum-dim)]">
                {preview.eligible.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3">
                    <span className="truncate">
                      {e.brand} {e.model ?? ""}
                    </span>
                    <span className="text-[var(--gold-dim)]">{e.public_code ?? e.id}</span>
                  </li>
                ))}
              </ul>
            )}

            {op === "delete" && preview.eligible.length > 0 && (
              <div className="mt-4">
                <label className="text-[10px] uppercase tracking-[2px] text-[var(--muted)]">
                  Why are these leaving for good?
                  <select
                    value={reasonCode}
                    onChange={(e) => setReasonCode(e.target.value)}
                    className="mt-1 block w-full border border-[var(--border-mid)] bg-transparent px-2 py-2 text-[13px] text-[var(--platinum)]"
                  >
                    <option value="">Choose a reason…</option>
                    {REASON_OPTIONS.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {error && (
              <div className="mt-3 text-[12px] text-[var(--danger)]">{error}</div>
            )}
            {progress && running && (
              <div className="mt-3 text-[12px] text-[var(--muted)]">
                Working… {progress.done} / {progress.total}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={running}
                className="border border-[var(--border-mid)] px-4 py-2 text-[11px] uppercase tracking-[1.5px] text-[var(--platinum-dim)] hover:border-[var(--border-subtle)] disabled:opacity-40"
              >
                Cancel
              </button>
              {preview.eligible.length > 0 && (
                <button
                  type="button"
                  onClick={run}
                  disabled={running}
                  className={`border px-4 py-2 text-[11px] uppercase tracking-[1.5px] disabled:opacity-40 ${
                    op === "delete"
                      ? "border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger)]/[0.08]"
                      : "border-[var(--border-gold)] text-[var(--gold)] hover:bg-[var(--gold-whisper)]"
                  }`}
                >
                  {running
                    ? "Working…"
                    : `${verb} ${preview.eligible.length} listing${preview.eligible.length === 1 ? "" : "s"}`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── The room ──────────────────────────────────────────────────────────── */

export default function MarketplaceControl({
  initial,
  initialPrefs,
  initialPer,
}: {
  initial: McPayload;
  initialPrefs: McPrefs;
  /** Device-class page-size default resolved by the SERVER page (mobile 25 /
      desktop 50). The server fetches the initial payload at this size — or
      at the stored explicit choice when one exists — so first paint and
      client state agree and there is no mount-time page-size snap. */
  initialPer: number;
}) {
  const [view, setView] = useState<ViewState>(() =>
    restoredViewState(initialPrefs, initialPer)
  );
  /* True only when the founder has explicitly chosen a page size (Rows
     control or a saved view). Only an explicit choice is ever persisted. */
  const [perExplicit, setPerExplicit] = useState<boolean>(() => {
    const last = initialPrefs.marketplaceControl?.lastUsed;
    return (
      last?.perExplicit === true &&
      typeof last.per === "number" &&
      (PER_OPTIONS as readonly number[]).includes(last.per)
    );
  });
  const [savedViews, setSavedViews] = useState<SavedView[]>(
    () => initialPrefs.marketplaceControl?.savedViews ?? []
  );
  const [qInput, setQInput] = useState("");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<McPayload>(initial);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /* The room OPENS unselected (mobile correction order §5): no inspector, no
     selected row, the ledger fully unobstructed. Selection is an explicit
     act and is reversible without resetting any room state. */
  const [selected, setSelected] = useState<McRow | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  /* Provenance of the current arrangement, NOT a mode. It names the preset
     the working view was last restored from; whether that name still holds
     is derived below. There is no "inside a saved view" state to leave and
     no exit ceremony — the label simply stops being true. */
  const [appliedFrom, setAppliedFrom] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [bulkSeller, setBulkSeller] = useState("");
  const [bulk, setBulk] = useState<{ op: BulkOp; preview: BulkPreview } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const firstFetch = useRef(true);
  const fetchSeq = useRef(0);
  const asideRef = useRef<HTMLElement | null>(null);
  /* Set only by a real user tap — a background refresh updating the selected
     row's data must never yank the viewport to the inspector. */
  const scrollToInspector = useRef(false);

  const set = useCallback(<K extends keyof ViewState>(key: K, value: ViewState[K]) => {
    setView((v) => ({ ...v, [key]: value }));
  }, []);

  /* Derived, not tracked. appliedFrom records which preset the arrangement
     was last restored from; whether that name is still TRUE is answered by
     comparing the two arrangements on every render. Deriving it rather than
     clearing it in an effect buys real behavior: change a control and the
     name goes, change it back and the name returns, because the question is
     always "is this still that preset?" and never "has something happened
     since?". Nothing to keep in sync, nothing to forget to clear. */
  const appliedView = useMemo(() => {
    if (!appliedFrom) return null;
    const sv = savedViews.find((s) => s.name === appliedFrom);
    if (!sv) return null;
    return viewFingerprint(reconcileSavedView(sv, initialPer)) === viewFingerprint(view)
      ? appliedFrom
      : null;
  }, [appliedFrom, savedViews, view, initialPer]);

  /* q debounce — typing never spams the server. */
  useEffect(() => {
    const t = setTimeout(() => {
      setView((v) => (v.q === qInput ? v : { ...v, q: qInput }));
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  /* Lifecycle change reconciles an incompatible status filter (§7). */
  const selectLife = useCallback((life: LifeView) => {
    setView((v) => ({
      ...v,
      life,
      status: v.status && LIFE_STATUSES[life].includes(v.status) ? v.status : null,
    }));
    setPage(1);
  }, []);

  /* Column sorting — see SortHead (module level). Server-side, page resets. */
  const applySort = useCallback((next: McSort) => {
    setView((v) => ({ ...v, sort: next }));
    setPage(1);
  }, []);

  /* ── Server fetch on any query-state change ──────────────────────────── */
  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("view", view.life);
    if (view.status) p.set("status", view.status);
    if (view.q) p.set("q", view.q);
    if (view.seller) p.set("seller", view.seller);
    if (view.new24h) p.set("new24h", "1");
    if (view.dealer) p.set("dealer", "1");
    if (view.requests) p.set("requests", "1");
    if (view.attention) p.set("attention", "1");
    p.set("sort", view.sort);
    p.set("page", String(page));
    p.set("per", String(view.per));
    return p.toString();
  }, [view.life, view.status, view.q, view.seller, view.new24h, view.dealer, view.requests, view.attention, view.sort, view.per, page]);

  const refresh = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/marketplace?${queryString}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail ?? "Read failed.");
      if (seq === fetchSeq.current) {
        setPayload(data as McPayload);
        /* Sticky within context, never automatic, never a ghost. The
           selection survives a filter/sort/page change while the listing is
           still part of what this result actually contains — and is dropped
           the moment it is not. The old `?? sel` fallback kept the previous
           row object alive, so the inspector could describe a listing the
           ledger beneath it no longer held. The exact-identifier row counts
           as present even when it sits outside the active filters: the
           payload returns it deliberately (Exact Identifier Search Law), so
           it is part of this context, not a leftover from the last one. */
        setSelected((sel) => {
          if (!sel) return null;
          const next = data as McPayload;
          const fresh = next.rows.find((r) => r.id === sel.id);
          if (fresh) return fresh;
          if (next.exact && next.exact.id === sel.id) return next.exact;
          return null;
        });
      }
    } catch (e) {
      if (seq === fetchSeq.current) {
        setLoadError(e instanceof Error ? e.message : "Could not read the ledger.");
      }
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    if (firstFetch.current) {
      firstFetch.current = false;
      /* The server rendered the initial payload with the default query at
         the resolved page size (initial.per is the server's truth — device
         default or the stored explicit choice). A restored preference that
         changes the query beyond that (sort) must refetch once; otherwise
         the server data is already current. */
      if (view.sort === "created_desc" && view.per === initial.per) return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh closes over the full query string
  }, [refresh]);

  /* ── Preference persistence (debounced last-used + explicit saves) ───── */
  const prefsReady = useRef(false);
  useEffect(() => {
    if (!prefsReady.current) {
      prefsReady.current = true;
      return;
    }
    const t = setTimeout(() => {
      /* Page size is persisted ONLY as an explicit choice, marked by the
         perExplicit flag; a device-class default must never masquerade as
         one (JSON.stringify drops the undefined key, which also strips
         legacy always-persisted `per` residue). */
      const lastUsed = perExplicit
        ? { ...view, perExplicit: true }
        : { ...view, per: undefined };
      void fetch("/api/admin/marketplace/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prefs: { marketplaceControl: { lastUsed, savedViews } },
        }),
      }).catch(() => {
        /* preference persistence is best-effort — the room never breaks over it */
      });
    }, 800);
    return () => clearTimeout(t);
  }, [view, savedViews, perExplicit]);

  /* ── Derived presentation ────────────────────────────────────────────── */
  const counts = payload.counts;
  const lifeCounts: Record<LifeView, number> = {
    current: counts.current,
    offmarket: counts.offmarket,
    history: counts.history,
    all: counts.all,
  };
  const statusOptions = LIFE_STATUSES[view.life];
  const attentionFor = (id: string): string[] => payload.attention[id] ?? [];
  const anyFilterActive =
    !!view.status || !!view.q || !!view.seller || view.new24h || view.dealer || view.requests || view.attention;
  /* Everything the narrow Filters disclosure can conceal (q stays visible in
     the search box) — the toggle wears this count so a hidden active filter
     is never invisible. */
  const hiddenFilterCount =
    (view.status ? 1 : 0) +
    (view.seller ? 1 : 0) +
    (view.attention ? 1 : 0) +
    (view.new24h ? 1 : 0) +
    (view.dealer ? 1 : 0) +
    (view.requests ? 1 : 0);

  const from = payload.total === 0 ? 0 : (payload.page - 1) * payload.per + 1;
  const to = Math.min(payload.total, payload.page * payload.per);
  const pageCount = Math.max(1, Math.ceil(payload.total / payload.per));

  const visibleColumns = view.columns.order
    .filter((k) => !view.columns.hidden.includes(k))
    .map((k) => DETAIL_COLUMNS.find((c) => c.key === k))
    .filter((c): c is (typeof DETAIL_COLUMNS)[number] => !!c);

  /* ── Detailed table: the metadata columns fill a wide monitor ──────────
     (founder SEE-it, 2026-08-21: "the Listing column sits in another
     county"). The Listing cell carried a min-width and NO width, so in an
     auto-layout table it absorbed every surplus pixel — on a 4K monitor the
     row read as two disconnected halves with a dead band between them. The
     metadata columns were never crowded; they were simply never given any
     of the extra room.

     Giving Listing a FIXED width hands the surplus back, and each metadata
     column claims a proportional slice of whatever remains. Both halves of
     that are load-bearing, and both were measured rather than assumed:

     · The slice must be expressed as a PERCENTAGE of the leftover, not as
       base+extra in pixels. A table in auto layout treats plain pixel widths
       as mere ratios once there is surplus and rescales every column
       including Listing — measured at 2750px, plain widths put Listing back
       at 843px. A percentage-based column claims its width against the table
       box, which is what actually pins Listing at its 340.
     · The distribution is proportional to base, so the column hierarchy
       survives: Seller stays the widest, AI the narrowest, instead of every
       column converging on one uniform width.

     Measured at a 2750px table (a maximized 4K window): Listing 340, Seller
     439, Status 376, Price 345, Year/Compl/Signif 238, AI 188, Created 345,
     with zero gap after Listing.

     ⚠ The cost, stated plainly: drag-resize is amplified at wide widths. The
     handle sets a column's BASE, and the base is scaled by
     (leftover / Σbase) — about 3.1× on a maximized 4K window — so a 50px
     drag moves the boundary roughly 150px. A zero-delta grab still moves
     nothing, so nothing jumps on mousedown; the edge simply outruns the
     pointer. That is the price of filling the width, and filling the width
     is what was asked for.

     Narrow behavior is untouched BY CONSTRUCTION: minWidth holds every
     column at its base, the percentages can only ever hand out room that
     exists, and once the bases no longer fit the table overflows into the
     existing horizontal scroll exactly as before. Verified live at 900px —
     all columns at base, scrolling restored. It is pure CSS against the
     table's own box: no measurement, no resize observer, nothing to re-run
     on a window drag. */
  const detailMetaBase = visibleColumns.reduce((n, c) => n + colWidth(c.key), 0);

  function detailColStyle(key: string): CSSProperties {
    const slice = detailMetaBase > 0 ? colWidth(key) / detailMetaBase : 0;
    return {
      width: `calc((100% - ${LISTING_COL_BASE}px) * ${slice.toFixed(5)})`,
      minWidth: colWidth(key),
    };
  }

  const codeShapedQuery = CODE_SHAPE.test(view.q.trim());

  /* ── Column drag-resize (bounded) ────────────────────────────────────── */
  const resizeRef = useRef<{ key: string; startX: number; startW: number } | null>(null);
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const r = resizeRef.current;
      if (!r) return;
      const w = Math.min(COL_MAX, Math.max(COL_MIN, r.startW + (e.clientX - r.startX)));
      setView((v) => ({
        ...v,
        columns: { ...v.columns, widths: { ...v.columns.widths, [r.key]: w } },
      }));
    }
    function onUp() {
      resizeRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  function colWidth(key: string): number {
    return (
      view.columns.widths[key] ?? DETAIL_COLUMNS.find((c) => c.key === key)?.width ?? 110
    );
  }

  /* Reorder acts on what the founder can actually SEE. The stored order
     array holds all eighteen columns including the hidden ones, so swapping
     blindly with the immediate neighbour could swap a column against a
     hidden entry and change nothing on screen — press, no movement, press
     again, still nothing. That is most of why this control read as fiddly.
     Skip to the next VISIBLE neighbour instead: one press, one visible move,
     every time. Hidden entries keep their slots and are simply passed over. */
  function moveVisibleColumn(key: string, dir: -1 | 1) {
    setView((v) => {
      const order = [...v.columns.order];
      const i = order.indexOf(key);
      if (i < 0) return v;
      let j = i + dir;
      while (j >= 0 && j < order.length && v.columns.hidden.includes(order[j])) j += dir;
      if (j < 0 || j >= order.length) return v;
      [order[i], order[j]] = [order[j], order[i]];
      return { ...v, columns: { ...v.columns, order } };
    });
  }

  function toggleColumn(key: string) {
    setView((v) => {
      const hidden = v.columns.hidden.includes(key)
        ? v.columns.hidden.filter((k) => k !== key)
        : [...v.columns.hidden, key];
      return { ...v, columns: { ...v.columns, hidden } };
    });
  }

  /* ── Saved views ─────────────────────────────────────────────────────── */
  /* Applying a preset RESTORES it as the live working view. It does not put
     the room into a mode: the very next control change is ordinary, and the
     only thing that happens is the preset's name stops being displayed. */
  function applySavedView(name: string) {
    const sv = savedViews.find((s) => s.name === name);
    if (!sv) return;
    // A saved view's captured page size is an explicit choice being restored.
    if (typeof sv.state.per === "number") setPerExplicit(true);
    setAppliedFrom(name);
    setView(reconcileSavedView(sv, initialPer));
    setQInput(sv.state.q ?? "");
    setPage(1);
    /* Restoring an arrangement is not the same as reopening the panel used
       to build it: configuration starts closed and deliberate. */
    setColumnsOpen(false);
  }

  function saveCurrentView() {
    const name = saveName.trim().slice(0, 40);
    if (!name) return;
    setSavedViews((views) => {
      const rest = views.filter((v) => v.name !== name);
      return [...rest, { name, state: view }].slice(-MAX_SAVED_VIEWS);
    });
    /* The arrangement on screen now genuinely IS this preset, so it is named
       as such — until the next control change makes it the founder's own. */
    setAppliedFrom(name);
    setSaveName("");
    setSaveOpen(false);
  }

  /* Back to the FairWatchTrade baseline arrangement. It resets how the room
     is ARRANGED and nothing else: saved views are presentation state the
     founder deliberately named, and Reset has never had any business
     deleting them. Selection is not special-cased here — the refetch that
     follows drops it if the default view no longer contains it, which is the
     same context law every other filter change obeys. */
  function resetToDefault() {
    setView(defaultViewState(initialPer));
    setPerExplicit(false);
    setQInput("");
    setPage(1);
    setAppliedFrom(null);
    setColumnsOpen(false);
  }

  /* ── Single-listing governed actions (inspector) ─────────────────────── */
  async function openSingleAction(op: BulkOp, id: string) {
    setBulkError(null);
    setBulkLoading(true);
    try {
      const preview = await bulkPreview({ op, listingIds: [id] });
      setBulk({ op, preview });
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBulkLoading(false);
    }
  }

  async function openBulkAction(op: BulkOp) {
    if (!bulkSeller) {
      setBulkError("Choose a seller first — bulk operations act on one seller's inventory.");
      return;
    }
    setBulkError(null);
    setBulkLoading(true);
    try {
      const preview = await bulkPreview({ op, sellerId: bulkSeller });
      setBulk({ op, preview });
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBulkLoading(false);
    }
  }

  /* ── Direct Re-run check (ergonomics order 2026-08-22, item 4) ─────────
     An ENTRANCE, not machinery: the button posts to the same governed
     founder recheck route Founder Review uses — same auth gates, same
     provider behavior, same audit trail, no duplicate logic, no alternate
     write path. The result carries the id of the listing it belongs to
     and renders only while that listing is the selection — moving on
     retires it, with no effect-driven reset. A successful re-run refreshes
     the ledger, because release-only reconciliation can legitimately
     change status. */
  const [recheckState, setRecheckState] = useState<{
    listingId: string | null;
    busy: boolean;
    note: { kind: "ok" | "err"; text: string } | null;
  }>({ listingId: null, busy: false, note: null });

  async function rerunCheck() {
    if (!selected || recheckState.busy) return;
    if (!window.confirm("Re-run The Aubrey Check for this listing's photographs?")) return;
    const listingId = selected.id;
    setRecheckState({ listingId, busy: true, note: null });
    try {
      const res = await fetch(`/api/admin/listings/${listingId}/recheck`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        rechecked?: number;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        setRecheckState({
          listingId,
          busy: false,
          note: {
            kind: "err",
            text: data?.detail || data?.error || `Re-run failed (${res.status}).`,
          },
        });
      } else {
        setRecheckState({
          listingId,
          busy: false,
          note: { kind: "ok", text: `Re-ran ${data.rechecked ?? 0} check(s).` },
        });
        void refresh();
      }
    } catch {
      setRecheckState({
        listingId,
        busy: false,
        note: { kind: "err", text: "Network error — nothing was re-run." },
      });
    }
  }

  /* ── Detailed lateral navigation ──────────────────────────────────────
     A slim proxy scroller synchronized with the table's own horizontal
     scroll. It renders only when the table actually overflows, carries no
     content (aria-hidden — the real scroller stays keyboard-reachable),
     and costs the table nothing: no wrapper height cap, no nested vertical
     scroll region, no change to how the page scrolls. Measurement watches
     the container AND the table, because adding or resizing a column
     changes scrollWidth without changing the container. */
  const detailScrollRef = useRef<HTMLDivElement | null>(null);
  const detailProxyRef = useRef<HTMLDivElement | null>(null);
  const [detailScrollWidth, setDetailScrollWidth] = useState(0);
  const [detailOverflow, setDetailOverflow] = useState(false);

  useEffect(() => {
    const el = detailScrollRef.current;
    if (!el) return;
    /* ResizeObserver fires on observe, so the first measurement lands from
       the callback rather than from this effect body. */
    const ro = new ResizeObserver(() => {
      setDetailScrollWidth(el.scrollWidth);
      setDetailOverflow(el.scrollWidth - el.clientWidth > 1);
    });
    ro.observe(el);
    const table = el.firstElementChild;
    if (table) ro.observe(table);
    return () => ro.disconnect();
  }, [view.mode, visibleColumns.length, payload.rows.length]);

  /* One-directional assignment guarded by a tolerance: setting scrollLeft
     fires the other element's scroll event, and without the guard the two
     would chase each other. */
  function syncProxyFromTable() {
    const a = detailScrollRef.current;
    const b = detailProxyRef.current;
    if (!a || !b) return;
    if (Math.abs(b.scrollLeft - a.scrollLeft) > 1) b.scrollLeft = a.scrollLeft;
  }
  function syncTableFromProxy() {
    const a = detailProxyRef.current;
    const b = detailScrollRef.current;
    if (!a || !b) return;
    if (Math.abs(b.scrollLeft - a.scrollLeft) > 1) b.scrollLeft = a.scrollLeft;
  }

  /* ── The selected-listing inspector, ONE implementation ───────────────
     Extracted verbatim so BOTH the operational ledger and the detailed
     audit table render the same pane with the same governed actions. It
     was previously inline in the operational branch only, which left
     Detailed view with no inspector at all: selecting a row there appeared
     to do nothing and OPEN → navigation became the only way to inspect a
     listing. The flow law is unchanged — opaque overlay pinned upper-right,
     rows pass beneath it, never a reserved column. */
  function inspectorPane() {
    if (!selected) return null;
    return (
<aside
                  ref={asideRef}
                  data-mc-keep
                  className="border-t border-[var(--border-faint)] bg-[var(--surface)] @min-[1050px]:absolute @min-[1050px]:top-0 @min-[1050px]:right-0 @min-[1050px]:z-10 @min-[1050px]:w-[330px] @min-[1600px]:w-[360px] @min-[1050px]:border @min-[1050px]:border-[var(--border-mid)] @min-[1050px]:shadow-lg"
                >
                  <div className="p-4">
                    {/* The round trip's return half: Back to list rides the
                        stacked inspector home to the exact selected row
                        (selection intact); × ends the selection entirely —
                        the completely unselected state, one tap away. */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[9px] uppercase tracking-[2.2px] text-[var(--gold-dim)]">
                        Selected listing
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={backToList}
                          className="border border-[var(--border-mid)] px-2.5 py-1.5 text-[10px] uppercase tracking-[1.5px] text-[var(--platinum-dim)] hover:text-[var(--platinum)] @min-[1050px]:hidden"
                        >
                          ‹ Back to list
                        </button>
                        <button
                          type="button"
                          onClick={clearSelection}
                          aria-label="Clear selection"
                          className="border border-[var(--border-mid)] px-2.5 py-1.5 text-[10px] text-[var(--muted)] hover:text-[var(--platinum)]"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {/* Operations pane, not a photo panel (SEE-it finding 2):
                        the photograph joins the identity header at thumbnail
                        scale so lifecycle state, reasons, and actions own the
                        pane's vertical priority. The watch still anchors —
                        photo + serif identity lead — it just stops being a
                        gallery. */}
                    <div className="mt-2 flex items-start gap-3">
                      <Thumb row={selected} size={88} />
                      <div className="min-w-0">
                        <div className="font-display text-[17px] font-light leading-tight text-[var(--platinum)]">
                          {selected.brand}
                          <br />
                          {selected.model ?? "—"}
                        </div>
                        <div
                          className="mt-1 text-[13px] uppercase tracking-[2px] text-[var(--mineral)]"
                          style={ID_FACE}
                        >
                          {selected.public_code ?? "—"}
                        </div>
                        <div className="mt-1 text-[11px] tracking-[0.02em] text-[var(--muted)]">
                          Ref. {selected.reference}
                        </div>
                      </div>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-y border-[var(--border-faint)] py-3">
                      {(
                        [
                          ["Status", <StatusPill key="s" status={selected.status} />],
                          [
                            "Asking Price",
                            formatMoney(Number(selected.asking_price), selected.asking_currency),
                          ],
                          ["Seller", selected.seller_name],
                          ["Created", absoluteDate(selected.created_at)],
                          ["Condition", selected.condition ?? "—"],
                          ["Year", selected.year ?? "—"],
                          ["In Hand", selected.in_hand_verified ? "Verified" : "—"],
                          [
                            "Dealer Import",
                            selected.dealer_attested_at
                              ? absoluteDate(selected.dealer_attested_at)
                              : "—",
                          ],
                        ] as Array<[string, ReactNode]>
                      ).map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-[9px] uppercase tracking-[1.8px] text-[var(--muted)]">
                            {k}
                          </dt>
                          <dd className="mt-0.5 text-[12px] text-[var(--platinum-dim)]">{v}</dd>
                        </div>
                      ))}
                    </dl>

                    {selected.status === "removed" && (
                      <div className="mt-3 text-[11px] text-[var(--muted)]">
                        Off market since {absoluteDate(selected.removed_at)}
                        {selected.removal_reason_code
                          ? ` · ${selected.removal_reason_code.replace(/_/g, " ")}`
                          : ""}
                      </div>
                    )}
                    {selected.status === "rejected" && (
                      <div className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
                        {selected.rejection_reason
                          ? `Rejection message: ${selected.rejection_reason}`
                          : "No rejection message was recorded."}
                      </div>
                    )}

                    {attentionFor(selected.id).length > 0 && (
                      <div className="mt-3 border-l-2 border-[var(--danger)] bg-[var(--danger)]/[0.05] px-3 py-2">
                        <div className="text-[9px] uppercase tracking-[2px] text-[var(--danger)]">
                          Needs attention
                        </div>
                        <ul className="mt-1 space-y-1 text-[11px] leading-snug text-[var(--platinum-dim)]">
                          {attentionFor(selected.id).map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-4 grid gap-2">
                      <Link
                        href={`/admin/listings/${selected.id}`}
                        className="border border-[var(--border-gold)] px-3 py-2 text-center text-[10px] uppercase tracking-[1.5px] text-[var(--gold)] hover:bg-[var(--gold-whisper)]"
                      >
                        Open Adjudication →
                      </Link>
                      {selected.status === "published" && (
                        <Link
                          href={`/listings/${selected.id}`}
                          className="border border-[var(--border-mid)] px-3 py-2 text-center text-[10px] uppercase tracking-[1.5px] text-[var(--platinum-dim)] hover:text-[var(--platinum)]"
                        >
                          View Listing →
                        </Link>
                      )}
                      <button
                        type="button"
                        disabled={recheckState.busy}
                        onClick={rerunCheck}
                        className="border border-[var(--border-mid)] px-3 py-2 text-[10px] uppercase tracking-[1.5px] text-[var(--platinum-dim)] hover:text-[var(--platinum)] disabled:opacity-40"
                      >
                        {recheckState.busy && recheckState.listingId === selected.id
                          ? "Re-running…"
                          : "Re-run Check"}
                      </button>
                      {recheckState.note && recheckState.listingId === selected.id && (
                        <div
                          role="status"
                          className={`px-0.5 text-[11px] leading-snug ${
                            recheckState.note.kind === "ok"
                              ? "text-[var(--success)]"
                              : "text-[var(--danger)]"
                          }`}
                        >
                          {recheckState.note.text}
                        </div>
                      )}
                      {["published", "reserved", "pending_review"].includes(selected.status) && (
                        <button
                          type="button"
                          disabled={bulkLoading}
                          onClick={() => openSingleAction("remove", selected.id)}
                          className="border border-[var(--border-mid)] px-3 py-2 text-[10px] uppercase tracking-[1.5px] text-[var(--platinum-dim)] hover:text-[var(--platinum)] disabled:opacity-40"
                        >
                          Take Off Market…
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={bulkLoading}
                        onClick={() => openSingleAction("delete", selected.id)}
                        className="border border-[var(--danger)]/50 px-3 py-2 text-[10px] uppercase tracking-[1.5px] text-[var(--danger)] hover:bg-[var(--danger)]/[0.06] disabled:opacity-40"
                      >
                        Delete Eligible Listing…
                      </button>
                    </div>
                  </div>
                </aside>
    );
  }

  /* ── Renderers ───────────────────────────────────────────────────────── */

  function identityCell(row: McRow, thumbSize: number) {
    /* Identity hierarchy (ergonomics order 2026-08-22): watch name first,
       then the FWT LISTING ID — the operational anchor the founder orients
       and acts by in this room — then the manufacturer reference, quieter
       than the ID but genuinely readable, never smooshed. The ID wears the
       established mineral identifier treatment and the Sitka reading face;
       mineral stays confined to identifiers — never the row. */
    return (
      <div className="flex min-w-0 items-start gap-3">
        <Thumb row={row} size={thumbSize} />
        <div className="min-w-0">
          <div className="truncate text-[9px] uppercase tracking-[1.8px] text-[var(--gold-dim)]">
            {row.brand}
          </div>
          <div className="truncate font-display text-[15px] font-light text-[var(--platinum)]">
            {row.model ?? "—"}
          </div>
          <div
            className="mt-0.5 text-[12px] uppercase tracking-[1.6px] text-[var(--mineral)]"
            style={ID_FACE}
          >
            {row.public_code ?? "—"}
          </div>
          <div
            className="truncate text-[11px] tracking-[0.02em] text-[var(--muted)]"
            title={row.reference}
          >
            Ref. {row.reference}
          </div>
        </div>
      </div>
    );
  }

  function detailCell(row: McRow, key: string) {
    switch (key) {
      case "seller":
        return <span className="truncate">{row.seller_name}</span>;
      case "status":
        return <StatusPill status={row.status} />;
      case "price":
        return <span>{formatMoney(Number(row.asking_price), row.asking_currency)}</span>;
      case "currency":
        return <span>{row.asking_currency ?? "—"}</span>;
      case "condition":
        return <span className="truncate">{row.condition ?? "—"}</span>;
      case "year":
        return <span>{row.year ?? "—"}</span>;
      case "completeness":
        return <span>{row.completeness_score ?? "—"}</span>;
      case "significance":
        return <span>{row.significance_score ?? "—"}</span>;
      case "ai":
        return row.description_passed_ai === false ? (
          <span className="font-semibold text-[var(--danger)]">✗</span>
        ) : row.description_passed_ai === true ? (
          <span>✓</span>
        ) : (
          <span>—</span>
        );
      case "custom":
        return row.custom_brand_flag ? (
          <span className="font-semibold text-[var(--gold)]">Flag</span>
        ) : (
          <span>—</span>
        );
      case "inhand":
        return <span>{row.in_hand_verified ? "Verified" : "—"}</span>;
      case "dealer":
        return <span>{row.dealer_attested_at ? absoluteDate(row.dealer_attested_at) : "—"}</span>;
      case "hold":
        return <span className="truncate">{row.integrity_hold_reason ?? "—"}</span>;
      case "removal":
        return (
          <span className="truncate">
            {row.removed_at
              ? `${absoluteDate(row.removed_at)}${row.removal_reason_code ? ` · ${row.removal_reason_code}` : ""}`
              : "—"}
          </span>
        );
      case "privateBuyer":
        return <span>{row.private_buyer_id ? "Yes" : "—"}</span>;
      case "rejection":
        return <span className="truncate">{row.rejection_reason ?? "—"}</span>;
      case "created":
        return <span>{relativeDate(row.created_at)}</span>;
      case "updated":
        return <span>{relativeDate(row.updated_at)}</span>;
      default:
        return <span>—</span>;
    }
  }

  /* ── Selection is a round trip (mobile correction order §3–§5) ──────────
     Tap a listing → the inspector is brought into view automatically when
     it is STACKED (below the ledger); the desktop overlay never scrolls.
     "Back to list" returns to the exact selected row — same page, same
     filters/sort/lifecycle, same selection, useful scroll position — and
     clearing the selection removes the inspector entirely without touching
     any other room state. */
  function selectRow(row: McRow) {
    scrollToInspector.current = true;
    setSelected(row);
  }

  useEffect(() => {
    if (!scrollToInspector.current || !selected) return;
    scrollToInspector.current = false;
    const el = asideRef.current;
    if (el && getComputedStyle(el).position !== "absolute") {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selected]);

  function scrollToSelectedRow(id: string) {
    document
      .querySelector(`[data-mc-row="${id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* Back to the exact selected row — selection intact, row still lit. Only
     offered where the inspector is stacked; the desktop overlay never took
     the founder away from the list in the first place. */
  function backToList() {
    if (selected) scrollToSelectedRow(selected.id);
  }

  function clearSelection() {
    const wasId = selected?.id;
    const el = asideRef.current;
    const stacked = el ? getComputedStyle(el).position !== "absolute" : false;
    setSelected(null);
    // Stacked: land back on the row that was selected, not at a random depth.
    if (stacked && wasId) requestAnimationFrame(() => scrollToSelectedRow(wasId));
  }

  /* ── Putting a transient surface down ──────────────────────────────────
     Two ways out of a selection or an open configuration panel, neither of
     which disturbs a single piece of working state: a click on genuinely
     neutral workspace, and Escape. Both are additions — the inspector × is
     untouched and still the explicit control.

     "Neutral" is defined by exclusion, and the exclusion list is the safety
     property: anything a founder could be aiming at keeps its click. Rows
     (they select), every control, every label, the inspector itself, and the
     bulk confirmation dialog all opt out via MC_INTERACTIVE. What is left is
     background — padding, the head, the metrics strip, the empty run below
     the last row. A click there means "nothing", and nothing is exactly what
     the room then shows.

     Deliberately NOT reset by either path: search, filters, sort, lifecycle,
     page, page size, saved views. Putting the inspector down is not a way of
     starting over. */
  function dismissOnNeutral(e: ReactMouseEvent) {
    if (e.button !== 0 || bulk) return;
    if (!selected && !columnsOpen) return;
    const target = e.target as HTMLElement | null;
    if (!target || target.closest(MC_INTERACTIVE)) return;
    /* A click that ends a text drag is a selection gesture, not a dismissal. */
    if ((window.getSelection()?.toString().length ?? 0) > 0) return;
    setColumnsOpen(false);
    setSelected(null);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      /* The destructive confirmation owns the keyboard while it is open —
         this room does not reach around an open dialog. */
      if (bulk) return;
      if (saveOpen) {
        setSaveOpen(false);
        setSaveName("");
        return;
      }
      /* Escape inside a text field belongs to that field. A founder mid-query
         who presses it means "never mind, this text" — losing the inspector
         selection instead would be exactly the accidental control loss this
         pair of exits exists to avoid. */
      const el = document.activeElement;
      const typing =
        (el instanceof HTMLInputElement && el.type !== "checkbox") ||
        el instanceof HTMLTextAreaElement;
      if (typing) return;
      if (columnsOpen) {
        setColumnsOpen(false);
        return;
      }
      if (selected) clearSelection();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clearSelection is stable within a render pass
  }, [bulk, saveOpen, columnsOpen, selected]);

  const exact = payload.exact;

  return (
    /* The neutral-click dismissal listens at the room's outer edge so every
       piece of background is covered by one handler instead of a scatter of
       overlay divs. Escape is its keyboard equivalent (see the effect above),
       which is why this is a plain listener and not a control. */
    <main
      className="min-h-screen bg-[var(--ink)] text-[var(--platinum)]"
      onClick={dismissOnNeutral}
    >
      {/* Pre-list runway compression (mobile correction order): on a phone
          the ledger's first row must arrive fast — the head keeps its
          identity but sheds the explainer prose and one padding notch, and
          the operating strip tightens to two short rows. All of it
          viewport-gated; the approved desktop composition is unchanged. */}
      <div className="px-4 py-4 md:px-8 md:py-6">
        {/* ── Page head ─────────────────────────────────────────────────── */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 md:mb-5 md:gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[3px] text-[var(--gold-dim)]">
              Admin · Marketplace Operations
            </div>
            <h1 className="mt-1 font-display text-[26px] font-light text-[var(--platinum)]">
              Marketplace Control
            </h1>
            <p className="mt-1 hidden max-w-[640px] text-[12px] leading-relaxed text-[var(--muted)] sm:block">
              Operate current inventory first. Retrieve cold history deliberately. The room
              stays calm even when dealer intake adds hundreds of watches at once.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Link
              href="/admin/vault-review"
              className="border border-[var(--border-mid)] px-3 py-1.5 text-[10px] uppercase tracking-[1.5px] text-[var(--slate)] transition-colors hover:border-[var(--border-subtle)] hover:text-[var(--platinum)] sm:px-4 sm:py-2 sm:text-[11px]"
            >
              ◈ Vault Review →
            </Link>
            <Link
              href="/admin/dealer-accelerator"
              className="border border-[var(--border-mid)] px-3 py-1.5 text-[10px] uppercase tracking-[1.5px] text-[var(--slate)] transition-colors hover:border-[var(--border-subtle)] hover:text-[var(--platinum)] sm:px-4 sm:py-2 sm:text-[11px]"
            >
              ◈ Dealer Accelerator Review →
            </Link>
          </div>
        </div>

        {/* ── Operating strip (truthful runtime counts) ─────────────────── */}
        <section
          aria-label="Marketplace operating summary"
          className="mb-4 grid grid-cols-3 border border-[var(--border-subtle)] bg-[var(--surface)] lg:grid-cols-5"
        >
          {[
            { k: "Current", v: counts.current, cls: "text-[var(--platinum)]" },
            { k: "Published", v: counts.byStatus.published ?? 0, cls: "text-[var(--gold)]" },
            { k: "Drafts", v: counts.byStatus.draft ?? 0, cls: "text-[var(--platinum-dim)]" },
            {
              k: "Needs Attention",
              v: counts.attention,
              cls: counts.attention > 0 ? "text-[var(--danger)]" : "text-[var(--muted)]",
            },
            { k: "Off Market", v: counts.offmarket, cls: "text-[var(--platinum-dim)]" },
          ].map((m) => (
            <div
              key={m.k}
              className="border-b border-r border-[var(--border-faint)] px-2.5 py-2 last:border-r-0 sm:px-4 sm:py-3 lg:border-b-0"
            >
              <div className="text-[8px] uppercase tracking-[1.5px] text-[var(--muted)] sm:text-[9px] sm:tracking-[2px]">
                {m.k}
              </div>
              <div className={`mt-0.5 font-display text-[18px] font-light sm:text-[22px] ${m.cls}`}>
                {m.v}
              </div>
            </div>
          ))}
        </section>

        {/* ── The workspace ─────────────────────────────────────────────────
            @container: every layout boundary inside keys on THIS element's
            width, never the viewport. The rail collapses (238px ↔ 72px), so
            the same viewport can offer two different widths here — viewport
            breakpoints are structurally the wrong tool and produced the
            ledger-under-inspector underlap the Human SEE-it caught. The
            inspector column is reserved only when the container can
            physically hold the ledger's minimum row grid BESIDE it; the
            five-column row grid exists only when the ledger can physically
            hold it. Below each threshold the composition stacks or
            compacts deliberately — geometry, not clipping. */}
        <section className="@container border border-[var(--border-subtle)] bg-[var(--surface)]">
          {/* Lifecycle tabs */}
          <div role="tablist" aria-label="Lifecycle view" className="grid grid-cols-2 border-b border-[var(--border-subtle)] md:grid-cols-4">
            {LIFE_ORDER.map((life) => {
              const active = view.life === life;
              return (
                <button
                  key={life}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => selectLife(life)}
                  className={`relative border-r border-[var(--border-faint)] px-4 py-3 text-left last:border-r-0 ${
                    active ? "bg-[var(--gold-whisper)]" : "hover:bg-white/[0.02]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-semibold uppercase tracking-[1.5px] ${
                        active ? "text-[var(--platinum)]" : "text-[var(--muted)]"
                      }`}
                    >
                      {LIFE_META[life].name}
                    </span>
                    <span className="inline-flex h-[20px] min-w-[20px] items-center justify-center border border-[var(--border-mid)] px-1 text-[10px] text-[var(--platinum-dim)]">
                      {lifeCounts[life]}
                    </span>
                  </span>
                  <span className="mt-1 hidden text-[10px] leading-snug text-[var(--muted)] lg:block">
                    {LIFE_META[life].help}
                  </span>
                  {active && (
                    <span className="absolute inset-x-4 bottom-0 h-[2px] bg-[var(--gold)]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Controls — search/status/seller/attention + the view switch.
              py/gap lifted one notch (SEE-it finding 3): the clusters read
              as deliberately grouped, not compressed.
              NARROW (pre-list runway compression): only the search box and a
              Filters toggle stay on the runway; every other control folds
              behind the toggle. On @min-[740px] the fold wrapper becomes
              display:contents — its children rejoin this flex row exactly as
              the approved desktop composition laid them, so wide containers
              are untouched by construction. */}
          <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--border-faint)] px-4 py-3.5">
            <div className="relative min-w-[180px] flex-1">
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search brand, model, reference, listing code, seller…"
                aria-label="Search listings"
                className="h-[34px] w-full border border-[var(--border-mid)] bg-transparent px-3 pr-8 text-[12px] text-[var(--platinum)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--gold-dim)]"
              />
              <span aria-hidden="true" className="absolute right-2.5 top-[7px] text-[14px] text-[var(--muted)]">
                ⌕
              </span>
            </div>

            <button
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
              className={`h-[34px] border px-3 text-[11px] uppercase tracking-[1px] transition-colors @min-[740px]:hidden ${
                filtersOpen || hiddenFilterCount > 0
                  ? "border-[var(--border-gold)] text-[var(--gold)]"
                  : "border-[var(--border-mid)] text-[var(--muted)]"
              }`}
            >
              Filters{hiddenFilterCount > 0 ? ` · ${hiddenFilterCount}` : ""}
            </button>

            <div
              className={`${filtersOpen ? "flex" : "hidden"} w-full flex-wrap items-center gap-2.5 @min-[740px]:contents`}
            >
            <McSelect
              label="Status"
              value={view.status ?? ""}
              onChange={(v) => {
                set("status", v || null);
                setPage(1);
              }}
            >
              <option value="">All {LIFE_META[view.life].name.toLowerCase()}</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {adminLabel(s)}
                </option>
              ))}
            </McSelect>

            <McSelect
              label="Seller"
              value={view.seller ?? ""}
              onChange={(v) => {
                set("seller", v || null);
                setPage(1);
              }}
              selectClassName="max-w-[160px] truncate"
            >
              <option value="">All sellers</option>
              {payload.sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </McSelect>

            <button
              type="button"
              aria-pressed={view.attention}
              onClick={() => {
                set("attention", !view.attention);
                setPage(1);
              }}
              className={`h-[34px] border px-3 text-[11px] uppercase tracking-[1px] transition-colors ${
                view.attention
                  ? "border-[var(--danger)] bg-[var(--danger)]/[0.07] text-[var(--danger)]"
                  : "border-[var(--border-mid)] text-[var(--muted)] hover:text-[var(--platinum)]"
              }`}
            >
              Needs Attention{counts.attention > 0 ? ` · ${counts.attention}` : ""}
            </button>

            {/* Operational | Detailed — two views of one room */}
            <div className="ml-auto flex items-center border border-[var(--border-mid)]" role="group" aria-label="Room view">
              {(["operational", "detailed"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={view.mode === m}
                  onClick={() => {
                    set("mode", m);
                    /* Configuration belongs to the view it configures.
                       Leaving Detailed closes Columns, so returning later
                       cannot resurrect a panel the founder never reopened —
                       the trap he hit. The other two paths that change mode
                       (applying a saved view, Reset) close it as well. */
                    if (m !== "detailed") setColumnsOpen(false);
                  }}
                  className={`h-[32px] px-3 text-[11px] uppercase tracking-[1.5px] ${
                    view.mode === m
                      ? "bg-[var(--gold-whisper)] text-[var(--gold)]"
                      : "text-[var(--muted)] hover:text-[var(--platinum)]"
                  }`}
                >
                  {m === "operational" ? "Operational" : "Detailed"}
                </button>
              ))}
            </div>
            </div>
          </div>

          {/* Context chips + view management — folds with the narrow Filters
              disclosure (runway compression); always present @min-[740px]. */}
          <div
            className={`${filtersOpen ? "flex" : "hidden"} flex-wrap items-center gap-2.5 border-b border-[var(--border-faint)] px-4 py-3 @min-[740px]:flex`}
          >
            {(
              [
                { key: "new24h" as const, label: "New · 24h" },
                { key: "dealer" as const, label: "Dealer import" },
                { key: "requests" as const, label: "Has purchase request" },
              ]
            ).map((chip) => (
              <button
                key={chip.key}
                type="button"
                aria-pressed={view[chip.key]}
                onClick={() => {
                  set(chip.key, !view[chip.key]);
                  setPage(1);
                }}
                className={`border px-2.5 py-1 text-[10px] uppercase tracking-[1px] transition-colors ${
                  view[chip.key]
                    ? "border-[var(--border-gold)] bg-[var(--gold-whisper)] text-[var(--gold)]"
                    : "border-[var(--border-faint)] text-[var(--muted)] hover:text-[var(--platinum)]"
                }`}
              >
                {chip.label}
              </button>
            ))}
            {anyFilterActive && (
              <button
                type="button"
                onClick={() => {
                  setView((v) => ({
                    ...defaultViewState(initialPer),
                    mode: v.mode,
                    life: v.life,
                    sort: v.sort,
                    per: v.per,
                    columns: v.columns,
                  }));
                  setQInput("");
                  setPage(1);
                }}
                className="border border-[var(--border-faint)] px-2.5 py-1 text-[10px] uppercase tracking-[1px] text-[var(--platinum-dim)] hover:text-[var(--platinum)]"
              >
                Clear filters ×
              </button>
            )}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* The one place the current / preset / default relationship is
                  made visible. The control shows the preset the arrangement
                  was last restored from, and shows "Current arrangement" the
                  moment any control moves — which is the whole mental model
                  stated by the interface instead of explained in a manual:
                  a preset is somewhere you came FROM, never a mode you are
                  IN, so there is nothing to exit. The help carries the rest,
                  including the one thing a founder cannot see and might
                  reasonably fear — that Reset does not delete his views. */}
              {/* relative: HelpBubble renders its trigger and its bubble as
                  SIBLINGS, so the bubble anchors to THIS element, not to the
                  trigger. Without it the bubble escapes to the nearest
                  positioned ancestor and lands somewhere else entirely. */}
              <span data-mc-keep className="relative flex items-center gap-1.5">
                {savedViews.length > 0 && (
                  <McSelect
                    label="Views"
                    ariaLabel="Apply a saved view"
                    dense
                    value={appliedView ?? ""}
                    onChange={(v) => v && applySavedView(v)}
                    selectClassName="max-w-[150px] truncate"
                  >
                    <option value="">Current arrangement</option>
                    {savedViews.map((sv) => (
                      <option key={sv.name} value={sv.name}>
                        {sv.name}
                      </option>
                    ))}
                  </McSelect>
                )}
                <HelpBubble
                  label="Saved views help"
                  historyKey="mc-views-help"
                  title="Views"
                  caretTracksTrigger
                  bubbleClassName="right-0 top-[26px] w-[min(300px,calc(100vw-32px))]"
                >
                  <p>
                    This room remembers where you left it on its own — the arrangement
                    you were last using comes back with you. There is nothing you have
                    to save to keep it.
                  </p>
                  <p className="mt-2">
                    A saved view is an optional named preset. Applying one restores that
                    arrangement as your live working view; change any control afterward
                    and it is simply yours again. You are never <em>inside</em> a saved
                    view, so there is nothing to leave.
                  </p>
                  <p className="mt-2">
                    <strong>Reset to FWT Default</strong> returns the room to the
                    FairWatchTrade baseline arrangement. It never deletes a saved view.
                  </p>
                </HelpBubble>
              </span>
              {saveOpen ? (
                <span className="flex items-center gap-1.5">
                  <input
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveCurrentView()}
                    placeholder="View name"
                    aria-label="Saved view name"
                    className="h-[26px] w-[130px] border border-[var(--border-mid)] bg-transparent px-2 text-[11px] text-[var(--platinum)] outline-none"
                  />
                  <button
                    type="button"
                    onClick={saveCurrentView}
                    className="border border-[var(--border-gold)] px-2 py-1 text-[10px] uppercase tracking-[1px] text-[var(--gold)]"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaveOpen(false)}
                    aria-label="Cancel saving view"
                    className="px-1 text-[12px] text-[var(--muted)]"
                  >
                    ×
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setSaveOpen(true)}
                  className="border border-[var(--border-faint)] px-2.5 py-1 text-[10px] uppercase tracking-[1px] text-[var(--muted)] hover:text-[var(--platinum)]"
                >
                  Save view
                </button>
              )}
              {view.mode === "detailed" && (
                <button
                  type="button"
                  onClick={() => setColumnsOpen((o) => !o)}
                  aria-expanded={columnsOpen}
                  className="border border-[var(--border-faint)] px-2.5 py-1 text-[10px] uppercase tracking-[1px] text-[var(--muted)] hover:text-[var(--platinum)]"
                >
                  Columns
                </button>
              )}
              <button
                type="button"
                onClick={resetToDefault}
                className="border border-[var(--border-faint)] px-2.5 py-1 text-[10px] uppercase tracking-[1px] text-[var(--muted)] hover:text-[var(--platinum)]"
              >
                Reset to FWT Default
              </button>
            </div>
          </div>

          {/* ── Column configuration (Detailed) ──────────────────────────
              A temporary adjustment surface, not a second product. It is
              therefore easy to put down — Done, Escape, or a click on
              neutral workspace — and it never survives leaving Detailed.

              Show and Order are separated because they are separate
              behaviors (sorting is a third, and lives on the table headers
              where the founder is already looking). Conflating them into one
              eighteen-row grid of checkbox + ↑ + ↓ is what made ordinary
              table setup feel like operating a small application: the grid
              wrapped, so "up" pointed at a column that was visually to the
              left, and the arrows moved entries against hidden columns and
              appeared to do nothing. Show is now a plain scan of what
              exists; Order is a short strip of only what is in the table,
              reading left-to-right exactly as the table reads. */}
          {view.mode === "detailed" && columnsOpen && (
            <div
              data-mc-keep
              className="border-b border-[var(--border-faint)] bg-[var(--surface-2)] px-4 py-3.5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] uppercase tracking-[2px] text-[var(--gold-dim)]">
                  Detailed columns
                </div>
                <button
                  type="button"
                  onClick={() => setColumnsOpen(false)}
                  className="border border-[var(--border-mid)] px-3 py-1 text-[10px] uppercase tracking-[1.5px] text-[var(--platinum-dim)] transition-colors hover:border-[var(--border-subtle)] hover:text-[var(--platinum)]"
                >
                  Done
                </button>
              </div>

              <div className="mt-3 text-[9px] uppercase tracking-[1.5px] text-[var(--muted)]">
                Show
              </div>
              <ul className="mt-1.5 grid grid-cols-2 gap-x-5 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
                {DETAIL_COLUMNS.map((col) => (
                  <li key={col.key} className="flex items-center gap-2 text-[12px]">
                    <input
                      id={`col-${col.key}`}
                      type="checkbox"
                      checked={!view.columns.hidden.includes(col.key)}
                      onChange={() => toggleColumn(col.key)}
                      className="accent-[var(--gold)]"
                    />
                    <label
                      htmlFor={`col-${col.key}`}
                      className="flex-1 cursor-pointer text-[var(--platinum-dim)]"
                    >
                      {col.label}
                    </label>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-[9px] uppercase tracking-[1.5px] text-[var(--muted)]">
                  Order
                </span>
                <span className="text-[10px] text-[var(--muted)]">
                  left to right, as the table reads
                </span>
              </div>
              {visibleColumns.length === 0 ? (
                <div className="mt-1.5 text-[11px] italic text-[var(--muted)]">
                  Every column is hidden — the table shows the listing alone.
                </div>
              ) : (
                <ol className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {visibleColumns.map((col, i) => (
                    <li
                      key={col.key}
                      className="flex items-center gap-0.5 border border-[var(--border-faint)] py-0.5 pl-2.5 pr-0.5 text-[11px] text-[var(--platinum-dim)]"
                    >
                      <span className="mr-1">{col.label}</span>
                      <button
                        type="button"
                        aria-label={`Move ${col.label} left`}
                        onClick={() => moveVisibleColumn(col.key, -1)}
                        disabled={i === 0}
                        className="px-1.5 text-[12px] leading-none text-[var(--muted)] transition-colors hover:text-[var(--platinum)] disabled:opacity-25 disabled:hover:text-[var(--muted)]"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${col.label} right`}
                        onClick={() => moveVisibleColumn(col.key, 1)}
                        disabled={i === visibleColumns.length - 1}
                        className="px-1.5 text-[12px] leading-none text-[var(--muted)] transition-colors hover:text-[var(--platinum)] disabled:opacity-25 disabled:hover:text-[var(--muted)]"
                      >
                        ›
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {/* Exact Identifier Search Law surface */}
          {codeShapedQuery && payload.noExactMatch && (
            <div className="border-b border-[var(--border-faint)] px-4 py-2.5 text-[12px] text-[var(--platinum)]">
              <span className="font-semibold">No exact match found.</span>{" "}
              <span className="text-[var(--muted)]">
                Results below are related listings, not the requested code.
              </span>
            </div>
          )}
          {exact && (
            <button
              type="button"
              onClick={() => selectRow(exact)}
              className="flex w-full items-center gap-3 border-b border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-2.5 text-left"
            >
              <span className="text-[9px] uppercase tracking-[2px] text-[var(--gold)]">
                Exact match
              </span>
              <span className="truncate text-[12px] text-[var(--platinum)]">
                {exact.brand} {exact.model ?? ""} · Ref. {exact.reference} ·{" "}
                <span className="uppercase tracking-[1px] text-[var(--gold)]">
                  {exact.public_code}
                </span>
              </span>
              <StatusPill status={exact.status} />
              {!exact.inCurrentFilters && (
                <span className="text-[10px] text-[var(--muted)]">
                  outside the current view/filters
                </span>
              )}
            </button>
          )}

          {loadError && (
            <div className="border-b border-[var(--border-faint)] px-4 py-2.5 text-[12px] text-[var(--danger)]">
              {loadError}
            </div>
          )}

          {/* ── OPERATIONAL: ledger + persistent inspector ──────────────────
              THE FLOW LAW (founder ruling, 2026-08-20, after two rejected
              attempts — do not re-litigate): the ledger is the primary
              long-list surface and ALWAYS owns the full workspace width.
              The selected-listing inspector is an OPAQUE OVERLAY pinned to
              the upper-right; rows pass beneath it and are covered — never
              visible through it — and everything below the overlay's actual
              height is full-width by construction. Do NOT "fix" overlap by
              reserving a column, narrowing rows, floating, hiding columns,
              or shrinking type: permanently narrowing the list to preserve
              an upper-page pane is the exact rejected geometry. The one
              container boundary below governs only the sanctioned narrow
              collapse (inspector stacks beneath the list, §19); it plays no
              part in overlap prevention. min-h keeps a short/filtered list
              from letting the overlay spill past the workspace. */}
          {view.mode === "operational" ? (
            <div className="relative @min-[1050px]:min-h-[660px]">
              <div className="min-w-0">
                {/* List head — the four meaningful columns sort (asc/desc,
                    active in gold), same behavior as the Detailed headers. */}
                <div className="hidden grid-cols-[minmax(280px,1.45fr)_110px_110px_110px_80px] border-b border-[var(--border-subtle)] bg-white/[0.02] @min-[740px]:grid">
                  <div className="px-3 py-2 text-[9px] text-[var(--muted)]">
                    <SortHead label="Listing" asc="brand_asc" desc="brand_desc" sort={view.sort} onSort={applySort} />
                  </div>
                  <div className="px-3 py-2 text-[9px] text-[var(--muted)]">
                    <SortHead label="Price" asc="price_asc" desc="price_desc" sort={view.sort} onSort={applySort} />
                  </div>
                  <div className="px-3 py-2 text-[9px] text-[var(--muted)]">
                    <SortHead label="Status" asc="status_asc" desc="status_desc" sort={view.sort} onSort={applySort} />
                  </div>
                  <div className="px-3 py-2 text-[9px] text-[var(--muted)]">
                    <SortHead label="Listed" asc="created_asc" desc="created_desc" sort={view.sort} onSort={applySort} />
                  </div>
                  <div className="px-3 py-2 text-[9px] uppercase tracking-[1.8px] text-[var(--muted)]">
                    Action
                  </div>
                </div>

                <div className={loading ? "opacity-60 transition-opacity" : ""}>
                  {payload.rows.length === 0 ? (
                    <div className="px-4 py-10 text-center font-display text-[13px] italic text-[var(--muted)]">
                      {anyFilterActive
                        ? "No listings match these filters."
                        : `Nothing in ${LIFE_META[view.life].name}.`}
                    </div>
                  ) : (
                    payload.rows.map((row) => {
                      const reasons = attentionFor(row.id);
                      const isSelected = selected?.id === row.id;
                      return (
                        <div
                          key={row.id}
                          data-mc-row={row.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => selectRow(row)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              selectRow(row);
                            }
                          }}
                          aria-pressed={isSelected}
                          className={`relative grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-[var(--border-faint)] px-3 py-2.5 outline-none focus-visible:ring-1 focus-visible:ring-[var(--gold)] @min-[740px]:grid-cols-[minmax(280px,1.45fr)_110px_110px_110px_80px] @min-[740px]:gap-0 ${
                            isSelected ? "bg-[var(--gold-whisper)]" : "hover:bg-white/[0.02]"
                          }`}
                          style={
                            reasons.length > 0
                              ? { boxShadow: "inset 3px 0 0 0 var(--danger)" }
                              : isSelected
                                ? { boxShadow: "inset 3px 0 0 0 var(--gold)" }
                                : undefined
                          }
                        >
                          {identityCell(row, 48)}
                          <div className="text-right font-display text-[14px] text-[var(--platinum)] @min-[740px]:px-3 @min-[740px]:text-left">
                            {formatMoney(Number(row.asking_price), row.asking_currency)}
                          </div>
                          <div className="hidden @min-[740px]:block @min-[740px]:px-3">
                            <StatusPill status={row.status} />
                          </div>
                          <div className="hidden text-[11px] text-[var(--muted)] @min-[740px]:block @min-[740px]:px-3">
                            {relativeDate(row.created_at)}
                          </div>
                          <div className="hidden @min-[740px]:block">
                            {/* A real hit target, not a text sliver: the link
                                fills its cell to ~38px tall with working
                                padding, restrained face unchanged. Row
                                selection is untouched — the click stops here. */}
                            <Link
                              href={`/admin/listings/${row.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="flex min-h-[38px] items-center px-3 text-[10px] uppercase tracking-[1.5px] text-[var(--gold-dim)] hover:bg-[var(--gold-whisper)] hover:text-[var(--gold)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--gold)]"
                            >
                              Open →
                            </Link>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Selected-listing inspector — opaque overlay, upper-right.
                  The explicit background is load-bearing: a transparent pane
                  let underlying row cells ghost through (the Human SEE-it
                  defect). Narrow containers: static, stacks below the list.

                  NO SELECTION = NO INSPECTOR SURFACE, at every width. The
                  pane does not exist unless a listing is selected — it is
                  not an empty frame holding an instruction. The phone lost
                  its placeholder band in the mobile correction; the desktop
                  kept a centered "Select a listing to inspect it here." in
                  an otherwise empty overlay, which is the same orphan one
                  breakpoint up. Removing it costs the ledger nothing: the
                  pane is absolutely positioned, so rows already run the full
                  workspace width beneath it (the flow law) — what leaves is
                  a floating empty box, not a column. */}
              {inspectorPane()}
            </div>
          ) : (
            /* ── DETAILED: operator-configurable audit table ───────────────
                Same positioning context and same inspector as the ledger:
                the founder inspects and acts on a selected listing without
                leaving the room, in the view they actually work in.

                LATERAL MOVEMENT: the table's own horizontal scrollbar sits
                at the physical bottom of the whole result set, so reaching
                the right-hand columns from row 3 of 24 meant travelling to
                the bottom of the table, moving sideways, and climbing back.
                A sticky proxy scroller rides the bottom of the viewport
                while the table is in view and is synchronized with it, so
                sideways is always one reach away. Density, columns,
                sorting, filters, pagination and row behavior are untouched. */
            <div className="relative @min-[1050px]:min-h-[660px]">
              <div
                ref={detailScrollRef}
                onScroll={syncProxyFromTable}
                className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}
              >
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[9px] uppercase tracking-[1.8px] text-[var(--muted)]">
                    <th
                      className="sticky left-0 z-[5] bg-[var(--surface)] px-3 py-2.5 font-normal"
                      style={{ width: LISTING_COL_BASE, minWidth: LISTING_COL_MIN }}
                    >
                      <SortHead label="Listing" asc="brand_asc" desc="brand_desc" sort={view.sort} onSort={applySort} />
                    </th>
                    {visibleColumns.map((col) => {
                      const sortable = col.sortAsc || col.sortDesc;
                      return (
                        <th
                          key={col.key}
                          className="relative px-3 py-2.5 font-normal"
                          style={detailColStyle(col.key)}
                        >
                          {sortable ? (
                            <SortHead
                              label={col.label}
                              asc={col.sortAsc}
                              desc={col.sortDesc}
                              sort={view.sort}
                              onSort={applySort}
                            />
                          ) : (
                            col.label
                          )}
                          <span
                            role="separator"
                            aria-orientation="vertical"
                            onPointerDown={(e) => {
                              e.preventDefault();
                              resizeRef.current = {
                                key: col.key,
                                startX: e.clientX,
                                startW: colWidth(col.key),
                              };
                            }}
                            className="absolute right-0 top-0 h-full w-[5px] cursor-col-resize hover:bg-[var(--gold-dim)]/40"
                          />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {payload.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={visibleColumns.length + 1}
                        className="px-4 py-10 text-center font-display text-[13px] italic text-[var(--muted)]"
                      >
                        {anyFilterActive
                          ? "No listings match these filters."
                          : `Nothing in ${LIFE_META[view.life].name}.`}
                      </td>
                    </tr>
                  ) : (
                    payload.rows.map((row) => {
                      const reasons = attentionFor(row.id);
                      const isSelected = selected?.id === row.id;
                      return (
                        <tr
                          key={row.id}
                          data-mc-row={row.id}
                          onClick={() => selectRow(row)}
                          className={`cursor-pointer border-b border-[var(--border-faint)] align-top ${
                            isSelected ? "bg-[var(--gold-whisper)]" : "hover:bg-white/[0.02]"
                          }`}
                          style={
                            reasons.length > 0
                              ? { boxShadow: "inset 3px 0 0 0 var(--danger)" }
                              : undefined
                          }
                        >
                          <td
                            className="sticky left-0 z-[4] bg-[var(--surface)] px-3 py-2.5"
                            style={{ width: LISTING_COL_BASE, minWidth: LISTING_COL_MIN }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              {identityCell(row, 40)}
                              <Link
                                href={`/admin/listings/${row.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="flex min-h-[36px] items-center whitespace-nowrap px-3 text-[10px] uppercase tracking-[1.5px] text-[var(--gold-dim)] hover:bg-[var(--gold-whisper)] hover:text-[var(--gold)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--gold)]"
                              >
                                Open →
                              </Link>
                            </div>
                          </td>
                          {visibleColumns.map((col) => (
                            <td
                              key={col.key}
                              className="max-w-0 truncate px-3 py-2.5 text-[12px] text-[var(--platinum-dim)]"
                              style={detailColStyle(col.key)}
                            >
                              {detailCell(row, col.key)}
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              </div>
              {detailOverflow && (
                <div
                  ref={detailProxyRef}
                  onScroll={syncTableFromProxy}
                  aria-hidden="true"
                  className="sticky bottom-0 z-20 overflow-x-auto border-t border-[var(--border-faint)] bg-[var(--surface)]"
                >
                  <div style={{ width: detailScrollWidth, height: 1 }} />
                </div>
              )}
              {inspectorPane()}
            </div>
          )}

          {/* Footer — range, pagination, page size */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] px-4 py-3">
            <div className="text-[11px] text-[var(--muted)]">
              {payload.total === 0
                ? "No matching listings"
                : `Showing ${from}–${to} of ${payload.total} matching listing${payload.total === 1 ? "" : "s"}`}
              {loading ? " · refreshing…" : ""}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={payload.page <= 1}
                aria-label="Previous page"
                className="h-[28px] min-w-[28px] border border-[var(--border-mid)] text-[12px] text-[var(--platinum-dim)] disabled:opacity-30"
              >
                ‹
              </button>
              {pageWindow(payload.page, pageCount).map((it, i) =>
                it === "…" ? (
                  <span
                    key={`gap-${i}`}
                    aria-hidden="true"
                    className="px-0.5 text-[11px] text-[var(--muted)]"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={it}
                    type="button"
                    onClick={() => setPage(it)}
                    aria-label={`Page ${it}`}
                    aria-current={payload.page === it ? "page" : undefined}
                    className={`h-[28px] min-w-[28px] border px-1 text-[12px] ${
                      payload.page === it
                        ? "border-[var(--border-gold)] bg-[var(--gold-whisper)] text-[var(--gold)]"
                        : "border-[var(--border-mid)] text-[var(--platinum-dim)] hover:text-[var(--platinum)]"
                    }`}
                  >
                    {it}
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={payload.page >= pageCount}
                aria-label="Next page"
                className="h-[28px] min-w-[28px] border border-[var(--border-mid)] text-[12px] text-[var(--platinum-dim)] disabled:opacity-30"
              >
                ›
              </button>
            </div>
            <McSelect
              label="Rows"
              ariaLabel="Rows per page"
              dense
              value={view.per}
              onChange={(v) => {
                setPerExplicit(true);
                set("per", Number(v));
                setPage(1);
              }}
            >
              {PER_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </McSelect>
          </div>
        </section>

        {/* ── Bulk dealer / account-scale operations — below the ledger ──── */}
        <section className="mt-4 border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-[260px] flex-1">
              <div className="text-[9px] uppercase tracking-[2.2px] text-[var(--gold-dim)]">
                Dealer / account-scale operations
              </div>
              <div className="mt-1 font-display text-[16px] font-light text-[var(--platinum)]">
                Operate a whole seller inventory without touching every row by hand.
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                Eligibility and blockers come from runtime truth — a preview always shows the
                exact affected set before anything changes.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <McSelect
                label="Seller"
                ariaLabel="Seller for bulk operation"
                value={bulkSeller}
                onChange={setBulkSeller}
                selectClassName="max-w-[180px] truncate"
              >
                <option value="">Choose…</option>
                {payload.sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </McSelect>
              <button
                type="button"
                disabled={bulkLoading}
                onClick={() => openBulkAction("remove")}
                className="border border-[var(--border-mid)] px-3 py-2 text-[10px] uppercase tracking-[1.5px] text-[var(--platinum-dim)] hover:text-[var(--platinum)] disabled:opacity-40"
              >
                Take Listings Off Market…
              </button>
              <button
                type="button"
                disabled={bulkLoading}
                onClick={() => openBulkAction("delete")}
                className="border border-[var(--danger)]/50 px-3 py-2 text-[10px] uppercase tracking-[1.5px] text-[var(--danger)] hover:bg-[var(--danger)]/[0.06] disabled:opacity-40"
              >
                Delete Eligible Listings…
              </button>
            </div>
          </div>
          {bulkError && <div className="mt-2 text-[12px] text-[var(--danger)]">{bulkError}</div>}
          {bulkLoading && (
            <div className="mt-2 text-[12px] text-[var(--muted)]">Computing eligibility…</div>
          )}
        </section>
      </div>

      {bulk && (
        <BulkDialog
          op={bulk.op}
          preview={bulk.preview}
          onClose={() => setBulk(null)}
          onDone={(result) => {
            /* A deleted listing must not linger in the inspector as a
               zombie selection — the row no longer exists anywhere. */
            if (bulk.op === "delete") {
              const gone = new Set(result.results.filter((r) => r.ok).map((r) => r.id));
              setSelected((sel) => (sel && gone.has(sel.id) ? null : sel));
            }
            void refresh();
          }}
        />
      )}
    </main>
  );
}
