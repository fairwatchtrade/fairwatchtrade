"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
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

   Selection is sticky on purpose: the inspector keeps the last selected
   listing even when a filter change drops its row from the page, so
   operating context survives navigation (§7 "preserve coherent selection
   where possible").

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
    lastUsed?: Partial<ViewState>;
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
  { key: "status", label: "Status", width: 120, sortAsc: "status_asc" },
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
const MAX_SAVED_VIEWS = 8;

function defaultColumns(): ColumnsState {
  return {
    order: DETAIL_COLUMNS.map((c) => c.key),
    hidden: DETAIL_COLUMNS.map((c) => c.key).filter(
      (k) => !DETAIL_DEFAULT_VISIBLE.includes(k)
    ),
    widths: {},
  };
}

function defaultViewState(): ViewState {
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
    per: 50,
    columns: defaultColumns(),
  };
}

/* Presentation config survives across sessions; the OPERATING position does
   not — the room always opens on CURRENT with no residual filters (the
   lifecycle law: CURRENT is the default operating surface). */
function restoredViewState(prefs: McPrefs): ViewState {
  const base = defaultViewState();
  const last = prefs.marketplaceControl?.lastUsed;
  if (!last) return base;
  return {
    ...base,
    mode: last.mode === "detailed" ? "detailed" : "operational",
    sort:
      typeof last.sort === "string" && last.sort ? (last.sort as McSort) : base.sort,
    per: typeof last.per === "number" ? last.per : base.per,
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
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
}: {
  initial: McPayload;
  initialPrefs: McPrefs;
}) {
  const [view, setView] = useState<ViewState>(() => restoredViewState(initialPrefs));
  const [savedViews, setSavedViews] = useState<SavedView[]>(
    () => initialPrefs.marketplaceControl?.savedViews ?? []
  );
  const [qInput, setQInput] = useState("");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<McPayload>(initial);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<McRow | null>(initial.rows[0] ?? null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [bulkSeller, setBulkSeller] = useState("");
  const [bulk, setBulk] = useState<{ op: BulkOp; preview: BulkPreview } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const firstFetch = useRef(true);
  const fetchSeq = useRef(0);

  const set = useCallback(<K extends keyof ViewState>(key: K, value: ViewState[K]) => {
    setView((v) => ({ ...v, [key]: value }));
  }, []);

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
        setSelected((sel) => {
          const rows = (data as McPayload).rows;
          if (!sel) return rows[0] ?? null;
          return rows.find((r) => r.id === sel.id) ?? sel;
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
      /* The server rendered the initial payload with the DEFAULT query. A
         restored preference that changes the query (sort / page size) must
         refetch once; otherwise the server data is already current. */
      if (view.sort === "created_desc" && view.per === 50) return;
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
      void fetch("/api/admin/marketplace/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prefs: { marketplaceControl: { lastUsed: view, savedViews } },
        }),
      }).catch(() => {
        /* preference persistence is best-effort — the room never breaks over it */
      });
    }, 800);
    return () => clearTimeout(t);
  }, [view, savedViews]);

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

  const from = payload.total === 0 ? 0 : (payload.page - 1) * payload.per + 1;
  const to = Math.min(payload.total, payload.page * payload.per);
  const pageCount = Math.max(1, Math.ceil(payload.total / payload.per));

  const visibleColumns = view.columns.order
    .filter((k) => !view.columns.hidden.includes(k))
    .map((k) => DETAIL_COLUMNS.find((c) => c.key === k))
    .filter((c): c is (typeof DETAIL_COLUMNS)[number] => !!c);

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

  function moveColumn(key: string, dir: -1 | 1) {
    setView((v) => {
      const order = [...v.columns.order];
      const i = order.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return v;
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
  function applySavedView(name: string) {
    const sv = savedViews.find((s) => s.name === name);
    if (!sv) return;
    setView({
      ...defaultViewState(),
      ...sv.state,
      columns: {
        order: reconcileOrder(sv.state.columns?.order ?? []),
        hidden: (sv.state.columns?.hidden ?? []).filter((k) =>
          DETAIL_COLUMNS.some((c) => c.key === k)
        ),
        widths: sv.state.columns?.widths ?? {},
      },
    });
    setQInput(sv.state.q ?? "");
    setPage(1);
  }

  function saveCurrentView() {
    const name = saveName.trim().slice(0, 40);
    if (!name) return;
    setSavedViews((views) => {
      const rest = views.filter((v) => v.name !== name);
      return [...rest, { name, state: view }].slice(-MAX_SAVED_VIEWS);
    });
    setSaveName("");
    setSaveOpen(false);
  }

  function resetToDefault() {
    setView(defaultViewState());
    setQInput("");
    setPage(1);
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

  /* ── Renderers ───────────────────────────────────────────────────────── */

  function identityCell(row: McRow, thumbSize: number) {
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
          <div className="truncate text-[10px] text-[var(--muted)]">Ref. {row.reference}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[1.6px] text-[var(--gold)]">
            {row.public_code ?? "—"}
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

  function selectRow(row: McRow) {
    setSelected(row);
  }

  const exact = payload.exact;

  return (
    <main className="min-h-screen bg-[var(--ink)] text-[var(--platinum)]">
      <div className="px-4 py-6 md:px-8">
        {/* ── Page head ─────────────────────────────────────────────────── */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[3px] text-[var(--gold-dim)]">
              Admin · Marketplace Operations
            </div>
            <h1 className="mt-1 font-display text-[26px] font-light text-[var(--platinum)]">
              Marketplace Control
            </h1>
            <p className="mt-1 max-w-[640px] text-[12px] leading-relaxed text-[var(--muted)]">
              Operate current inventory first. Retrieve cold history deliberately. The room
              stays calm even when dealer intake adds hundreds of watches at once.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin/vault-review"
              className="border border-[var(--border-mid)] px-4 py-2 text-[11px] uppercase tracking-[1.5px] text-[var(--slate)] transition-colors hover:border-[var(--border-subtle)] hover:text-[var(--platinum)]"
            >
              ◈ Vault Review →
            </Link>
            <Link
              href="/admin/dealer-accelerator"
              className="border border-[var(--border-mid)] px-4 py-2 text-[11px] uppercase tracking-[1.5px] text-[var(--slate)] transition-colors hover:border-[var(--border-subtle)] hover:text-[var(--platinum)]"
            >
              ◈ Dealer Accelerator Review →
            </Link>
          </div>
        </div>

        {/* ── Operating strip (truthful runtime counts) ─────────────────── */}
        <section
          aria-label="Marketplace operating summary"
          className="mb-4 grid grid-cols-2 border border-[var(--border-subtle)] bg-[var(--surface)] sm:grid-cols-3 lg:grid-cols-5"
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
              className="border-b border-r border-[var(--border-faint)] px-4 py-3 last:border-r-0 lg:border-b-0"
            >
              <div className="text-[9px] uppercase tracking-[2px] text-[var(--muted)]">{m.k}</div>
              <div className={`mt-0.5 font-display text-[22px] font-light ${m.cls}`}>{m.v}</div>
            </div>
          ))}
        </section>

        {/* ── The workspace ─────────────────────────────────────────────── */}
        <section className="border border-[var(--border-subtle)] bg-[var(--surface)]">
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

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-faint)] px-3 py-2.5">
            <div className="relative min-w-[220px] flex-1">
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

            <label className="flex h-[34px] items-center gap-2 border border-[var(--border-mid)] px-2">
              <span className="text-[9px] uppercase tracking-[1.5px] text-[var(--muted)]">Status</span>
              <select
                value={view.status ?? ""}
                onChange={(e) => {
                  set("status", e.target.value || null);
                  setPage(1);
                }}
                className="bg-transparent text-[12px] text-[var(--platinum)] outline-none"
              >
                <option value="">All {LIFE_META[view.life].name.toLowerCase()}</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {adminLabel(s)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex h-[34px] items-center gap-2 border border-[var(--border-mid)] px-2">
              <span className="text-[9px] uppercase tracking-[1.5px] text-[var(--muted)]">Seller</span>
              <select
                value={view.seller ?? ""}
                onChange={(e) => {
                  set("seller", e.target.value || null);
                  setPage(1);
                }}
                className="max-w-[160px] bg-transparent text-[12px] text-[var(--platinum)] outline-none"
              >
                <option value="">All sellers</option>
                {payload.sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

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
                  onClick={() => set("mode", m)}
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

          {/* Context chips + view management */}
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-faint)] px-3 py-2">
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
                    ...defaultViewState(),
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
              {savedViews.length > 0 && (
                <label className="flex items-center gap-1.5">
                  <span className="text-[9px] uppercase tracking-[1.5px] text-[var(--muted)]">Views</span>
                  <select
                    value=""
                    onChange={(e) => e.target.value && applySavedView(e.target.value)}
                    className="border border-[var(--border-faint)] bg-transparent px-1.5 py-1 text-[11px] text-[var(--platinum)]"
                  >
                    <option value="">Apply…</option>
                    {savedViews.map((sv) => (
                      <option key={sv.name} value={sv.name}>
                        {sv.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
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

          {/* Column manager (Detailed) */}
          {view.mode === "detailed" && columnsOpen && (
            <div className="border-b border-[var(--border-faint)] px-3 py-3">
              <div className="mb-2 text-[10px] uppercase tracking-[2px] text-[var(--muted)]">
                Detailed columns — show, hide, reorder
              </div>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {view.columns.order.map((key, i) => {
                  const col = DETAIL_COLUMNS.find((c) => c.key === key);
                  if (!col) return null;
                  const hidden = view.columns.hidden.includes(key);
                  return (
                    <li key={key} className="flex items-center gap-2 text-[12px]">
                      <input
                        id={`col-${key}`}
                        type="checkbox"
                        checked={!hidden}
                        onChange={() => toggleColumn(key)}
                      />
                      <label htmlFor={`col-${key}`} className="flex-1 text-[var(--platinum-dim)]">
                        {col.label}
                      </label>
                      <button
                        type="button"
                        aria-label={`Move ${col.label} earlier`}
                        onClick={() => moveColumn(key, -1)}
                        disabled={i === 0}
                        className="border border-[var(--border-faint)] px-1.5 text-[11px] text-[var(--muted)] disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${col.label} later`}
                        onClick={() => moveColumn(key, 1)}
                        disabled={i === view.columns.order.length - 1}
                        className="border border-[var(--border-faint)] px-1.5 text-[11px] text-[var(--muted)] disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </li>
                  );
                })}
              </ul>
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

          {/* ── OPERATIONAL: ledger + persistent inspector ────────────────── */}
          {view.mode === "operational" ? (
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_330px] min-[1800px]:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 lg:border-r lg:border-[var(--border-faint)]">
                {/* List head */}
                <div className="hidden grid-cols-[minmax(280px,1.45fr)_110px_110px_110px_80px] border-b border-[var(--border-subtle)] bg-white/[0.02] md:grid">
                  {["Listing", "Price", "Status", "Listed", "Action"].map((h) => (
                    <div
                      key={h}
                      className="px-3 py-2 text-[9px] uppercase tracking-[1.8px] text-[var(--muted)]"
                    >
                      {h}
                    </div>
                  ))}
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
                          className={`relative grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-[var(--border-faint)] px-3 py-2.5 outline-none focus-visible:ring-1 focus-visible:ring-[var(--gold)] md:grid-cols-[minmax(280px,1.45fr)_110px_110px_110px_80px] md:gap-0 ${
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
                          <div className="text-right font-display text-[14px] text-[var(--platinum)] md:px-3 md:text-left">
                            {formatMoney(Number(row.asking_price), row.asking_currency)}
                          </div>
                          <div className="hidden md:block md:px-3">
                            <StatusPill status={row.status} />
                          </div>
                          <div className="hidden text-[11px] text-[var(--muted)] md:block md:px-3">
                            {relativeDate(row.created_at)}
                          </div>
                          <div className="hidden md:block md:px-3">
                            <Link
                              href={`/admin/listings/${row.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] uppercase tracking-[1.5px] text-[var(--gold-dim)] hover:text-[var(--gold)]"
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

              {/* Persistent inspector */}
              <aside className="border-t border-[var(--border-faint)] lg:border-t-0">
                {selected ? (
                  <div className="p-4">
                    <div className="text-[9px] uppercase tracking-[2.2px] text-[var(--gold-dim)]">
                      Selected listing
                    </div>
                    <div className="mt-1.5 font-display text-[19px] font-light leading-tight text-[var(--platinum)]">
                      {selected.brand}
                      <br />
                      {selected.model ?? "—"}
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--muted)]">
                      Ref. {selected.reference}
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-[2px] text-[var(--gold)]">
                      {selected.public_code ?? "—"}
                    </div>

                    <div className="mt-3">
                      {selected.thumb ? (
                        <Thumb row={selected} size={280} />
                      ) : (
                        <div className="grid h-[120px] place-items-center border border-[var(--border-faint)] text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]">
                          No listing photograph
                        </div>
                      )}
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
                ) : (
                  <div className="p-6 text-center font-display text-[12px] italic text-[var(--muted)]">
                    Select a listing to inspect it here.
                  </div>
                )}
              </aside>
            </div>
          ) : (
            /* ── DETAILED: operator-configurable audit table ─────────────── */
            <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[9px] uppercase tracking-[1.8px] text-[var(--muted)]">
                    <th
                      className="sticky left-0 z-[5] bg-[var(--surface)] px-3 py-2.5 font-normal"
                      style={{ minWidth: 280 }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          set("sort", view.sort === "brand_asc" ? "created_desc" : "brand_asc")
                        }
                        className={`uppercase tracking-[1.8px] ${
                          view.sort === "brand_asc" ? "text-[var(--gold)]" : "hover:text-[var(--platinum)]"
                        }`}
                      >
                        Listing{view.sort === "brand_asc" ? " ↑" : ""}
                      </button>
                    </th>
                    {visibleColumns.map((col) => {
                      const sortable = col.sortAsc || col.sortDesc;
                      const activeAsc = col.sortAsc && view.sort === col.sortAsc;
                      const activeDesc = col.sortDesc && view.sort === col.sortDesc;
                      return (
                        <th
                          key={col.key}
                          className="relative px-3 py-2.5 font-normal"
                          style={{ width: colWidth(col.key), minWidth: colWidth(col.key) }}
                        >
                          {sortable ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (col.sortAsc && col.sortDesc) {
                                  set(
                                    "sort",
                                    activeDesc ? col.sortAsc : (col.sortDesc as McSort)
                                  );
                                } else {
                                  const target = (col.sortAsc ?? col.sortDesc) as McSort;
                                  set("sort", view.sort === target ? "created_desc" : target);
                                }
                              }}
                              className={`uppercase tracking-[1.8px] ${
                                activeAsc || activeDesc
                                  ? "text-[var(--gold)]"
                                  : "hover:text-[var(--platinum)]"
                              }`}
                            >
                              {col.label}
                              {activeAsc ? " ↑" : activeDesc ? " ↓" : ""}
                            </button>
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
                          <td className="sticky left-0 z-[4] bg-[var(--surface)] px-3 py-2.5" style={{ minWidth: 280 }}>
                            <div className="flex items-start justify-between gap-2">
                              {identityCell(row, 40)}
                              <Link
                                href={`/admin/listings/${row.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="whitespace-nowrap text-[10px] uppercase tracking-[1.5px] text-[var(--gold-dim)] hover:text-[var(--gold)]"
                              >
                                Open →
                              </Link>
                            </div>
                          </td>
                          {visibleColumns.map((col) => (
                            <td
                              key={col.key}
                              className="max-w-0 truncate px-3 py-2.5 text-[12px] text-[var(--platinum-dim)]"
                              style={{ width: colWidth(col.key), minWidth: colWidth(col.key) }}
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
          )}

          {/* Footer — range, pagination, page size */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] px-3 py-2.5">
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
              <span className="px-1 text-[11px] text-[var(--platinum-dim)]">
                {payload.page} / {pageCount}
              </span>
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
            <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              Rows
              <select
                value={view.per}
                onChange={(e) => {
                  set("per", Number(e.target.value));
                  setPage(1);
                }}
                className="border border-[var(--border-mid)] bg-transparent px-1.5 py-1 text-[11px] text-[var(--platinum)]"
              >
                {PER_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
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
              <label className="flex h-[34px] items-center gap-2 border border-[var(--border-mid)] px-2">
                <span className="text-[9px] uppercase tracking-[1.5px] text-[var(--muted)]">
                  Seller
                </span>
                <select
                  value={bulkSeller}
                  onChange={(e) => setBulkSeller(e.target.value)}
                  className="max-w-[180px] bg-transparent text-[12px] text-[var(--platinum)] outline-none"
                >
                  <option value="">Choose…</option>
                  {payload.sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
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
