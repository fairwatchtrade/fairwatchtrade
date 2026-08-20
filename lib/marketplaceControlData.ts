import type { SupabaseClient } from "@supabase/supabase-js";

/* ════════════════════════════════════════════════════════════════════════
   MARKETPLACE CONTROL — server data layer (lib/marketplaceControlData.ts)

   The ONE query/derivation source for the founder operations room. Used by
   the server page (initial render) and /api/admin/marketplace (every
   subsequent interaction), so the two can never disagree about lifecycle
   membership, attention truth, or search behavior.

   SERVER-ONLY: callers hand in the trusted service client AFTER their own
   founder gate has passed. Nothing here authorizes anything.

   LIFECYCLE MAPPING (deliberate, from existing product laws — not from the
   prototype):
     CURRENT    draft · pending_review · published · reserved · private_active
                — everything needing present-tense operation. 'reserved' is an
                accepted offer mid-flight; 'private_active' is live to its one
                authorized buyer.
     OFF MARKET removed — the listing still exists, intentionally not live
                (seller vocabulary: "Paused").
     HISTORY    rejected — cold adjudicated truth.
     ALL        every retained row. Deleted listings are hard-deleted by the
                governed purge and are absent from all four BY CONSTRUCTION.

   NEEDS ATTENTION is deterministic or nothing. Every membership comes from
   an explainable runtime fact (see attentionReasons below). No scores, no
   heuristics, no demo sets. The stale "removed with no reason code"
   predicate is deliberately ABSENT: since the Pause-takes-no-reason ruling
   (20260817080000) a reasonless pause is an ordinary legal state, not a
   problem.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export type LifeView = "current" | "offmarket" | "history" | "all";

export const LIFE_STATUSES: Record<LifeView, string[]> = {
  current: ["draft", "pending_review", "published", "reserved", "private_active"],
  offmarket: ["removed"],
  history: ["rejected"],
  all: [
    "draft",
    "pending_review",
    "published",
    "reserved",
    "private_active",
    "removed",
    "rejected",
  ],
};

export function isLifeView(v: string): v is LifeView {
  return v === "current" || v === "offmarket" || v === "history" || v === "all";
}

export type McRow = {
  id: string;
  public_code: string | null;
  brand: string;
  model: string | null;
  reference: string;
  condition: string | null;
  year: string | null;
  status: string;
  asking_price: number;
  asking_currency: string | null;
  created_at: string;
  updated_at: string | null;
  seller_id: string;
  seller_name: string;
  completeness_score: number | null;
  significance_score: number | null;
  description_passed_ai: boolean | null;
  custom_brand_flag: boolean | null;
  in_hand_verified: boolean | null;
  dealer_attested_at: string | null;
  integrity_hold_reason: string | null;
  rejection_reason: string | null;
  removed_at: string | null;
  removal_reason_code: string | null;
  private_buyer_id: string | null;
  thumb: string | null;
};

export type McCounts = {
  byStatus: Record<string, number>;
  current: number;
  offmarket: number;
  history: number;
  all: number;
  attention: number;
};

export type McSort =
  | "created_desc"
  | "created_asc"
  | "updated_desc"
  | "price_desc"
  | "price_asc"
  | "status_asc"
  | "brand_asc";

export type McQuery = {
  view: LifeView;
  status: string | null;
  q: string;
  seller: string | null;
  new24h: boolean;
  dealer: boolean;
  requests: boolean;
  attention: boolean;
  sort: McSort;
  page: number; // 1-based
  per: number;
};

export type McPayload = {
  rows: McRow[];
  total: number;
  page: number;
  per: number;
  counts: McCounts;
  /** listing id → truthful reasons. Present for every attention member. */
  attention: Record<string, string[]>;
  sellers: Array<{ id: string; name: string }>;
  /** Exact Identifier Search Law: when the query is an exact listing code
      and that listing exists, it is returned here even if the active
      lifecycle/filters exclude it — never silently substituted. */
  exact: (McRow & { inCurrentFilters: boolean }) | null;
  /** True when the query was code-shaped and NO exact identifier exists. */
  noExactMatch: boolean;
};

const ROW_COLUMNS =
  "id, public_code, brand, model, reference, condition, year, status, asking_price, asking_currency, created_at, updated_at, seller_id, completeness_score, significance_score, description_passed_ai, custom_brand_flag, in_hand_verified, dealer_attested_at, integrity_hold_reason, rejection_reason, removed_at, removal_reason_code, private_buyer_id, photos";

const CODE_SHAPE = /^[a-z][0-9]{5}$/i;

export const PER_OPTIONS = [25, 50, 100] as const;

function clampPer(per: number): number {
  return (PER_OPTIONS as readonly number[]).includes(per) ? per : 50;
}

/* Same shape AccountDashboard proves: photos jsonb is an array of
   { category, photo: { url } }. Dial-first, else the first photograph.
   No real photograph → null; the UI must say so, never fabricate. */
type PhotoEntry = { category?: string; photo?: { url?: string } };
function thumbUrl(photos: unknown): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const list = photos as PhotoEntry[];
  const dial = list.find((p) => p?.category === "Dial");
  return (dial ?? list[0])?.photo?.url ?? null;
}

/* or() filter strings can't carry commas/parens; substring search doesn't
   need them. Wildcard characters are stripped rather than escaped — the
   search is for watch identity, not patterns. */
function sanitizeQuery(q: string): string {
  return q.replace(/[,()"'\\%_]/g, " ").replace(/\s+/g, " ").trim();
}

/* ── Deterministic Needs Attention ─────────────────────────────────────── */

export async function computeAttention(
  db: SupabaseClient
): Promise<Record<string, string[]>> {
  const reasons: Record<string, string[]> = {};
  const add = (id: string, reason: string) => {
    (reasons[id] ??= []).push(reason);
  };

  // Predicate group 1 — the review queue itself.
  const { data: pending } = await db
    .from("listings")
    .select("id, integrity_hold_reason, updated_at")
    .eq("status", "pending_review");
  const pendingRows = Array.isArray(pending) ? pending : [];

  // Predicate group 2 — flagged authenticity evidence.
  const { data: evidence } = await db
    .from("listing_integrity_evidence")
    .select("listing_id, classification")
    .in("classification", ["review_suggested", "high_confidence_match"]);
  const evidenceIds = [
    ...new Set(
      (Array.isArray(evidence) ? evidence : [])
        .map((e) => e.listing_id as string | null)
        .filter((v): v is string => !!v)
    ),
  ];

  // Review records answer "has a founder already looked?" for both groups.
  const reviewIds = [
    ...new Set([...pendingRows.map((p) => p.id as string), ...evidenceIds]),
  ];
  const reviewByListing = new Map<string, { resolved: boolean }>();
  if (reviewIds.length > 0) {
    const { data: reviews } = await db
      .from("listing_integrity_reviews")
      .select("listing_id, resolved_at")
      .in("listing_id", reviewIds);
    for (const r of Array.isArray(reviews) ? reviews : []) {
      reviewByListing.set(r.listing_id as string, {
        resolved: r.resolved_at != null,
      });
    }
  }

  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  for (const p of pendingRows) {
    const id = p.id as string;
    const hold = p.integrity_hold_reason as string | null;
    if (hold) {
      add(id, `Integrity hold: ${hold}`);
    } else if (!reviewByListing.has(id)) {
      add(id, "Awaiting founder review — no review has been recorded");
    }
    const changedAt = new Date((p.updated_at as string) ?? "").getTime();
    if (Number.isFinite(changedAt) && changedAt < cutoff) {
      add(id, "In the review queue over 48 hours");
    }
  }

  for (const id of evidenceIds) {
    const review = reviewByListing.get(id);
    if (!review || !review.resolved) {
      add(id, "Photograph authenticity evidence flagged for review");
    }
  }

  // Predicate group 3 — adverse decision with no recorded explanation.
  const { data: rejected } = await db
    .from("listings")
    .select("id, rejection_reason")
    .eq("status", "rejected");
  for (const r of Array.isArray(rejected) ? rejected : []) {
    const reason = (r.rejection_reason as string | null)?.trim();
    if (!reason) add(r.id as string, "Rejected without a recorded seller message");
  }

  return reasons;
}

/* ── Counts (operating strip + lifecycle tabs) ─────────────────────────── */

export async function fetchCounts(
  db: SupabaseClient,
  attentionCount: number
): Promise<McCounts> {
  const statuses = LIFE_STATUSES.all;
  const results = await Promise.all(
    statuses.map((s) =>
      db.from("listings").select("id", { count: "exact", head: true }).eq("status", s)
    )
  );
  const byStatus: Record<string, number> = {};
  statuses.forEach((s, i) => {
    byStatus[s] = results[i].count ?? 0;
  });
  const sum = (keys: string[]) => keys.reduce((acc, k) => acc + (byStatus[k] ?? 0), 0);
  return {
    byStatus,
    current: sum(LIFE_STATUSES.current),
    offmarket: sum(LIFE_STATUSES.offmarket),
    history: sum(LIFE_STATUSES.history),
    all: sum(LIFE_STATUSES.all),
    attention: attentionCount,
  };
}

/* ── Sellers with inventory (filter vocabulary) ────────────────────────── */

export async function fetchSellers(
  db: SupabaseClient
): Promise<Array<{ id: string; name: string }>> {
  const { data: rows } = await db.from("listings").select("seller_id");
  const ids = [
    ...new Set(
      (Array.isArray(rows) ? rows : []).map((r) => r.seller_id as string).filter(Boolean)
    ),
  ];
  if (ids.length === 0) return [];
  const { data: profiles } = await db
    .from("profiles")
    .select("id, display_name")
    .in("id", ids);
  const nameById = new Map(
    (Array.isArray(profiles) ? profiles : []).map((p) => [
      p.id as string,
      (p.display_name as string | null) ?? "Unknown",
    ])
  );
  return ids
    .map((id) => ({ id, name: nameById.get(id) ?? "Unknown" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ── The ledger query ──────────────────────────────────────────────────── */

type RawRow = Record<string, unknown> & { photos?: unknown };

async function attachSellerNames(
  db: SupabaseClient,
  raw: RawRow[]
): Promise<McRow[]> {
  const sellerIds = [...new Set(raw.map((r) => r.seller_id as string))];
  const nameById = new Map<string, string>();
  if (sellerIds.length > 0) {
    const { data: profiles } = await db
      .from("profiles")
      .select("id, display_name")
      .in("id", sellerIds);
    for (const p of Array.isArray(profiles) ? profiles : []) {
      nameById.set(p.id as string, (p.display_name as string | null) ?? "Unknown");
    }
  }
  return raw.map((r) => {
    const { photos, ...rest } = r;
    return {
      ...(rest as Omit<McRow, "seller_name" | "thumb">),
      seller_name: nameById.get(r.seller_id as string) ?? "Unknown",
      thumb: thumbUrl(photos),
    } as McRow;
  });
}

export async function fetchMarketplace(
  db: SupabaseClient,
  query: McQuery,
  attention: Record<string, string[]>
): Promise<{
  rows: McRow[];
  total: number;
  exact: (McRow & { inCurrentFilters: boolean }) | null;
  noExactMatch: boolean;
}> {
  const per = clampPer(query.per);
  const page = Math.max(1, query.page);
  const q = sanitizeQuery(query.q);

  /* Exact Identifier Search Law: an exact FWT listing code is a promise.
     Resolved FIRST, independent of every filter, so a related result can
     never masquerade as the requested watch. */
  let exact: (McRow & { inCurrentFilters: boolean }) | null = null;
  let noExactMatch = false;
  const codeShaped = CODE_SHAPE.test(q);
  if (codeShaped) {
    const { data: exactRaw } = await db
      .from("listings")
      .select(ROW_COLUMNS)
      .ilike("public_code", q)
      .maybeSingle();
    if (exactRaw) {
      const [row] = await attachSellerNames(db, [exactRaw as RawRow]);
      const inView = LIFE_STATUSES[query.view].includes(row.status);
      const inStatus = !query.status || row.status === query.status;
      const inSeller = !query.seller || row.seller_id === query.seller;
      exact = { ...row, inCurrentFilters: inView && inStatus && inSeller };
    } else {
      noExactMatch = true;
    }
  }

  let builder = db.from("listings").select(ROW_COLUMNS, { count: "exact" });

  const viewStatuses = LIFE_STATUSES[query.view];
  if (query.status && viewStatuses.includes(query.status)) {
    builder = builder.eq("status", query.status);
  } else if (query.view !== "all") {
    builder = builder.in("status", viewStatuses);
  }

  if (query.seller) builder = builder.eq("seller_id", query.seller);
  if (query.new24h) {
    builder = builder.gte(
      "created_at",
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    );
  }
  if (query.dealer) builder = builder.not("dealer_attested_at", "is", null);

  if (query.requests) {
    const { data: reqRows } = await db
      .from("purchase_requests")
      .select("listing_id")
      .not("listing_id", "is", null);
    const ids = [
      ...new Set(
        (Array.isArray(reqRows) ? reqRows : []).map((r) => r.listing_id as string)
      ),
    ];
    if (ids.length === 0) return { rows: [], total: 0, exact, noExactMatch };
    builder = builder.in("id", ids);
  }

  if (query.attention) {
    const ids = Object.keys(attention);
    if (ids.length === 0) return { rows: [], total: 0, exact, noExactMatch };
    builder = builder.in("id", ids);
  }

  if (q) {
    const clauses = [
      `brand.ilike.%${q}%`,
      `model.ilike.%${q}%`,
      `reference.ilike.%${q}%`,
      `public_code.ilike.%${q}%`,
    ];
    // Seller identity is something operators actually possess.
    const { data: sellerMatches } = await db
      .from("profiles")
      .select("id")
      .ilike("display_name", `%${q}%`)
      .limit(25);
    const sellerIds = (Array.isArray(sellerMatches) ? sellerMatches : []).map(
      (p) => p.id as string
    );
    if (sellerIds.length > 0) {
      clauses.push(`seller_id.in.(${sellerIds.join(",")})`);
    }
    builder = builder.or(clauses.join(","));
  }

  switch (query.sort) {
    case "created_asc":
      builder = builder.order("created_at", { ascending: true });
      break;
    case "updated_desc":
      builder = builder
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      break;
    case "price_desc":
      builder = builder
        .order("asking_price", { ascending: false })
        .order("created_at", { ascending: false });
      break;
    case "price_asc":
      builder = builder
        .order("asking_price", { ascending: true })
        .order("created_at", { ascending: false });
      break;
    case "status_asc":
      builder = builder
        .order("status", { ascending: true })
        .order("created_at", { ascending: false });
      break;
    case "brand_asc":
      builder = builder
        .order("brand", { ascending: true })
        .order("created_at", { ascending: false });
      break;
    default:
      builder = builder.order("created_at", { ascending: false });
  }

  const offset = (page - 1) * per;
  const { data, count, error } = await builder.range(offset, offset + per - 1);
  if (error) throw new Error(`marketplace query failed: ${error.message}`);

  const rows = await attachSellerNames(db, (Array.isArray(data) ? data : []) as RawRow[]);
  return { rows, total: count ?? 0, exact, noExactMatch };
}

/* ── Full payload (page + API share this) ──────────────────────────────── */

export async function fetchMarketplacePayload(
  db: SupabaseClient,
  query: McQuery
): Promise<McPayload> {
  const attention = await computeAttention(db);
  const [listResult, counts, sellers] = await Promise.all([
    fetchMarketplace(db, query, attention),
    fetchCounts(db, Object.keys(attention).length),
    fetchSellers(db),
  ]);
  return {
    rows: listResult.rows,
    total: listResult.total,
    page: Math.max(1, query.page),
    per: clampPer(query.per),
    counts,
    attention,
    sellers,
    exact: listResult.exact,
    noExactMatch: listResult.noExactMatch,
  };
}

export function parseMcQuery(params: URLSearchParams): McQuery {
  const view = params.get("view") ?? "current";
  const sort = params.get("sort") ?? "created_desc";
  const SORTS: McSort[] = [
    "created_desc",
    "created_asc",
    "updated_desc",
    "price_desc",
    "price_asc",
    "status_asc",
    "brand_asc",
  ];
  return {
    view: isLifeView(view) ? view : "current",
    status: params.get("status") || null,
    q: params.get("q") ?? "",
    seller: params.get("seller") || null,
    new24h: params.get("new24h") === "1",
    dealer: params.get("dealer") === "1",
    requests: params.get("requests") === "1",
    attention: params.get("attention") === "1",
    sort: (SORTS as string[]).includes(sort) ? (sort as McSort) : "created_desc",
    page: Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1),
    per: Number.parseInt(params.get("per") ?? "50", 10) || 50,
  };
}

export const DEFAULT_MC_QUERY: McQuery = {
  view: "current",
  status: null,
  q: "",
  seller: null,
  new24h: false,
  dealer: false,
  requests: false,
  attention: false,
  sort: "created_desc",
  page: 1,
  per: 50,
};
