import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* ════════════════════════════════════════════════════════════════════════
   AGENT-NATIVE PUBLIC DISCOVERY — lib/discovery/publicDiscovery.ts  (v6.44)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL: this is not FairWatchTrade's
   search. It is the surface by which an assistant a collector already uses —
   sitting somewhere else entirely — can find out that FairWatchTrade has the
   watch, and send the collector to the real listing.

   Internal discovery (Browse, Smart Search, Wanted, Saved Search, WatchDNA)
   makes collector intent legible to FairWatchTrade. This makes FairWatchTrade
   inventory legible to machines. They are separate products that happen to
   share a taxonomy. Do not merge them because both involve searching.

   THREE THINGS THIS MODULE IS RESPONSIBLE FOR

   1. THE CLIENT IS DELIBERATELY ANONYMOUS. Not the SSR cookie client. An
      external surface must return the same bytes to everyone, and a signed-in
      seller's cookie must not be able to widen it by accident. The anonymous
      role is also the role the read model's RLS floor was designed against,
      so the surface is evaluated exactly as it is documented.

   2. THE EXTERNAL VOCABULARY IS ITS OWN CONTRACT. Storage keys are camelCase
      because the Sell Flow wrote them; the published field names below are a
      deliberate, stable, snake_case vocabulary an agent can rely on. Renaming
      a details key internally must never silently rename a published field —
      SPEC_VOCABULARY is the seam that stops it. A stored key with no entry in
      that map is NOT published, so the map is a second whitelist behind the
      view's.

   3. VALUES ARE PASSED VERBATIM. Nothing here reformats, rounds, infers, or
      completes a fact. If a field is unknown it is omitted rather than
      guessed. No penalty for missing data, only a penalty for bad data —
      and that law applies to machines too.

   WHAT THIS MODULE MUST NEVER DO. It must never read `listings` directly. It
   reads `public_discovery_listings`, the governed read model, which positively
   admits rows and projects only approved public facts. Reaching past it for
   "just one more field" reintroduces exactly the leak the view prevents.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

/* The host that actually SERVES, not the one that redirects to it. The apex
   domain answers every request with a 308 to www, which a browser absorbs
   invisibly and an agent pays for on every canonical link it follows. A
   machine-readable canonical identity that needs a redirect to resolve is not
   canonical. */
export const SITE_URL = "https://www.fairwatchtrade.com";

/** The governed read model. The only table-like object this surface reads. */
const READ_MODEL = "public_discovery_listings";

/* A fetch bound, not pagination. It exists so the failure mode at scale is a
   deliberate, reported truncation rather than an unbounded query — the same
   discipline Browse adopted. Refinement that happens in memory (free text and
   dial) runs over this bounded set, so the ceiling is also the honest limit of
   those two filters. Raising it is a decision, not a default. */
export const DISCOVERY_FETCH_CEILING = 200;

/** Most an external caller may take in one response. */
export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

/* ── The published specification vocabulary ────────────────────────────────
   left  = the key as the Sell Flow stored it
   right = the field name FairWatchTrade publishes to machines, forever

   Every entry is a field the public Listing Detail already renders. Adding a
   line here publishes a fact; there is no other way for one to appear. */
const SPEC_VOCABULARY: Record<string, string> = {
  caseSizeMm: "case_size_mm",
  caseThicknessMm: "case_thickness_mm",
  caseMaterial: "case_material",
  caseColorFinish: "case_finish",
  movementType: "movement",
  calibre: "calibre",
  movementFrequency: "movement_frequency",
  powerReserve: "power_reserve",
  waterResistance: "water_resistance",
  dialColorType: "dial_color",
  complications: "complications",
  closureType: "closure_type",
  casebackType: "caseback",
  crystalMaterial: "crystal",
  bezelMaterial: "bezel_material",
  jewels: "jewels",
  crownPresent: "crown_present",
  originalStrapBracelet: "original_strap_bracelet",
  braceletWristSize: "bracelet_wrist_size",
  serviceHistory: "service_history",
};

/** The columns the read model publishes. Named explicitly so a column added
    to the view later cannot start serializing without a decision here. */
const READ_MODEL_COLUMNS = [
  "id",
  "public_code",
  "brand",
  "model",
  "reference",
  "year",
  "condition",
  "asking_price",
  "asking_currency",
  "availability",
  "stock_statement",
  "in_hand_verified",
  "open_to_trades",
  "documentation",
  "included_with_watch",
  "specs",
  "description",
  "photo_urls",
  "seller_display_name",
  "seller_slug",
  "created_at",
  "updated_at",
].join(", ");

export type DiscoveryRow = {
  id: string;
  public_code: string | null;
  brand: string | null;
  model: string | null;
  reference: string | null;
  year: string | null;
  condition: string | null;
  asking_price: number | string | null;
  asking_currency: string | null;
  availability: string | null;
  stock_statement: string | null;
  in_hand_verified: boolean | null;
  open_to_trades: boolean | null;
  documentation: string | null;
  included_with_watch: unknown;
  specs: Record<string, unknown> | null;
  description: string | null;
  photo_urls: unknown;
  seller_display_name: string | null;
  seller_slug: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type DiscoveryRecord = Record<string, unknown>;

/* ── The anonymous client ──────────────────────────────────────────────── */

let cachedClient: SupabaseClient | null = null;

/**
 * The public, session-free client every external discovery read uses.
 * @throws if Supabase configuration is absent — the surface fails visibly
 *         rather than degrading into an unexplained empty catalogue.
 */
export function createDiscoveryClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Public discovery is not configured: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required."
    );
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

/* ── Serialization ─────────────────────────────────────────────────────── */

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

/** The canonical FairWatchTrade address for a listing. One listing, one URL,
    multiple discovery entrances — an agent must never link to a shadow copy. */
export function listingUrl(id: string): string {
  return `${SITE_URL}/listings/${id}`;
}

function publishedSpecs(specs: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!specs) return out;
  for (const [storedKey, value] of Object.entries(specs)) {
    const published = SPEC_VOCABULARY[storedKey];
    if (!published) continue; // no vocabulary entry, no publication
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[published] = value;
  }
  return out;
}

/** One listing as an external agent receives it. Absent facts are omitted,
    never nulled into a claim. */
export function toRecord(row: DiscoveryRow): DiscoveryRecord {
  const price =
    row.asking_price === null || row.asking_price === undefined
      ? null
      : Number(row.asking_price);

  const record: DiscoveryRecord = {
    listing_code: row.public_code,
    url: listingUrl(row.id),
    brand: row.brand,
    model: row.model,
    reference: row.reference,
    availability: row.availability,
  };

  if (price !== null && Number.isFinite(price)) {
    record.price = { amount: price, currency: row.asking_currency ?? "USD" };
  }
  if (row.year) record.year = row.year;
  if (row.condition) record.condition = row.condition;
  if (row.documentation) record.documentation = row.documentation;

  const included = strings(row.included_with_watch);
  if (included.length > 0) record.included_with_watch = included;

  const specs = publishedSpecs(row.specs);
  if (Object.keys(specs).length > 0) record.specifications = specs;

  if (row.in_hand_verified) record.in_hand_verified = true;
  if (row.open_to_trades) record.open_to_trades = true;
  if (row.stock_statement) record.seller_stock_statement = row.stock_statement;

  if (row.description) record.seller_description = row.description;

  const photos = strings(row.photo_urls);
  if (photos.length > 0) record.photographs = photos;

  if (row.seller_display_name) {
    record.seller = {
      name: row.seller_display_name,
      url: `${SITE_URL}/sellers/${row.seller_slug ?? ""}`,
    };
    /* A seller with no dealer profile has no public profile slug, so no
       address is published rather than a broken one. */
    if (!row.seller_slug) record.seller = { name: row.seller_display_name };
  }

  if (row.created_at) record.listed_at = row.created_at;
  if (row.updated_at) record.last_updated = row.updated_at;

  return record;
}

/* ── Exact identifier handling ─────────────────────────────────────────── */

/* A FairWatchTrade listing code is a letter followed by five digits. The
   pattern exists so a collector who types one into an agent gets identifier
   treatment without having to know which parameter to use. */
const FWT_CODE = /^[a-z]\d{5}$/i;

export function looksLikeListingCode(value: string): boolean {
  return FWT_CODE.test(value.trim());
}

/* A manufacturer reference is recognised by shape, not by a list: it carries
   at least one digit and no spaces, which is what separates "PFC274-0000600-
   B33002" or "79173" from "blue dial chronograph". Recognition only decides
   whether the EXACT search runs first; it never suppresses the ordinary text
   search, so a false positive costs nothing but an extra exact lookup. */
export function looksLikeReference(value: string): boolean {
  const v = value.trim();
  if (v.length < 3 || /\s/.test(v)) return false;
  return /\d/.test(v);
}

export type ExactLookup = {
  /** The identifier the caller asked for, verbatim. */
  identifier: string;
  /** Which promise was made: an FWT listing code or a manufacturer reference. */
  kind: "listing_code" | "reference";
};

/**
 * Resolve an exact identifier against public inventory.
 *
 * THE PROMISE. An exact identifier search returns that exact identifier if it
 * exists, and says so plainly when it does not. It never substitutes a merely
 * similar identifier and presents it as a match. Related never masquerades as
 * found — so this function returns the exact rows and nothing else. Nearby
 * alternatives are a separate, separately labelled query.
 */
export async function findExact(
  supabase: SupabaseClient,
  lookup: ExactLookup
): Promise<DiscoveryRow[]> {
  const column = lookup.kind === "listing_code" ? "public_code" : "reference";
  /* Case-insensitive equality, not a pattern: one changed character is a
     different watch, but a lowercase/uppercase difference is the same one.
     `ilike` with no wildcards is exactly equality, ignoring case. */
  const { data, error } = await supabase
    .from(READ_MODEL)
    .select(READ_MODEL_COLUMNS)
    .ilike(column, lookup.identifier.trim())
    .limit(MAX_PAGE_SIZE);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DiscoveryRow[];
}

/* ── Constraint search ─────────────────────────────────────────────────── */

export type DiscoveryQuery = {
  text: string | null;
  brand: string | null;
  model: string | null;
  dial: string | null;
  documentation: string | null;
  condition: string | null;
  maxPrice: number | null;
  minPrice: number | null;
  currency: string | null;
  inHandVerified: boolean | null;
  openToTrades: boolean | null;
  limit: number;
};

export type SearchOutcome = {
  rows: DiscoveryRow[];
  /** True when the bounded fetch hit its ceiling and results may be partial. */
  truncated: boolean;
  /* ── UNCONFIRMED ── rows FairWatchTrade cannot answer the constraint for.
     Never folded into `rows`: a `Papers Only` query must return Papers Only,
     and an agent reading only `results` must be structurally unable to relay
     one of these as a match. */
  unconfirmed: UnconfirmedRow[];
  /** Independent of `truncated` — the two fetches have their own ceilings and
      one shared boolean could not say which was hit. */
  unconfirmedTruncated: boolean;
};

export type UnconfirmedRow = {
  row: DiscoveryRow;
  /* WHICH constraints are unconfirmed, not merely THAT one is. A query may
     supply four and a row may be unknown on two of them; one-row-one-reason
     would discard the difference. */
  unconfirmed_constraints: string[];
};

/* The constraints whose source can genuinely be absent. brand,
   in_hand_verified and open_to_trades are NOT NULL in `listings` — verified
   against production — so they have no null to admit and keep their strict
   filters. `text` is excluded by ruling: a free-text match cannot be honestly
   decomposed into a reason. */
const UNKNOWN_CAPABLE = [
  "documentation",
  "condition",
  "model",
  "currency",
  "max_price",
  "min_price",
  "dial",
] as const;

/** Which supplied constraints this row cannot be answered for. */
function unknownConstraintsFor(row: DiscoveryRow, q: DiscoveryQuery): string[] {
  const out: string[] = [];
  if (q.documentation && row.documentation === null) out.push("documentation");
  if (q.condition && row.condition === null) out.push("condition");
  if (q.model && row.model === null) out.push("model");
  if (q.currency && row.asking_currency === null) out.push("currency");
  /* One price column answers two constraints, so each is named separately —
     a collector who supplied only min_price should not be told max_price is
     unconfirmed. */
  if (q.maxPrice !== null && row.asking_price === null) out.push("max_price");
  if (q.minPrice !== null && row.asking_price === null) out.push("min_price");
  if (q.dial && typeof row.specs?.dialColorType !== "string") out.push("dial");
  return out;
}

/**
 * Search public inventory by collector constraints.
 *
 * Scalar constraints are applied by the database. Free text and dial colour
 * are refined in memory over the bounded fetch, because both need to look
 * across several fields at once — see DISCOVERY_FETCH_CEILING for what that
 * bound honestly means.
 */
export async function search(
  supabase: SupabaseClient,
  q: DiscoveryQuery
): Promise<SearchOutcome> {
  /* ── TWO BOUNDED FETCHES, DELIBERATELY ────────────────────────────────
     The strict fetch is byte-for-byte what this surface has always run, and
     its rows are `results[]`. The admitting fetch repeats it with each
     unknown-capable constraint widened to *(matches OR is null)*; its rows
     minus the strict ones are `unconfirmed`.

     WHY NOT ONE SHARED FETCH. The ceiling is 200. A single admitting query
     would spend that ceiling on both classes at once, and on a sparsely
     populated field — the ordinary case for documentation — unconfirmed rows
     can crowd the collector's actual matches out of the fetch entirely.
     `truncated: true` would then be honest about the fetch and WRONG about
     the results. This surface has never done that and this round will not be
     where it starts. The cost is one extra round trip per constraint query,
     accepted knowingly.

     WHY RETRIEVAL AND NOT A POST-PASS. `ilike`, `eq`, `lte` and `gte` all
     drop NULL rows at the database, so a row that could carry `unknown` is
     already gone before any labelling code could run. That is why the
     previous attempt at this capability could not have worked whatever it
     did to the response shape. */
  const base = () =>
    supabase
      .from(READ_MODEL)
      .select(READ_MODEL_COLUMNS)
      .order("asking_price", { ascending: true, nullsFirst: false })
      .limit(DISCOVERY_FETCH_CEILING + 1);

  /* NOT NULL in `listings`, so there is no null to admit and no widened form
     of these. They stay strict in both fetches. */
  const applyStructural = <T extends { ilike: unknown }>(b: T): T => {
    let out = b as unknown as ReturnType<typeof base>;
    if (q.brand) out = out.ilike("brand", `%${q.brand}%`);
    if (q.inHandVerified === true) out = out.eq("in_hand_verified", true);
    if (q.openToTrades === true) out = out.eq("open_to_trades", true);
    return out as unknown as T;
  };

  let strict = applyStructural(base());
  if (q.model) strict = strict.ilike("model", `%${q.model}%`);
  if (q.condition) strict = strict.ilike("condition", `%${q.condition}%`);
  if (q.documentation) strict = strict.ilike("documentation", `%${q.documentation}%`);
  if (q.currency) strict = strict.eq("asking_currency", q.currency.toUpperCase());
  if (q.maxPrice !== null) strict = strict.lte("asking_price", q.maxPrice);
  if (q.minPrice !== null) strict = strict.gte("asking_price", q.minPrice);

  /* Successive .or() calls AND together, which is exactly the semantics
     needed: each constraint independently admits *(matches OR unknown)*, and
     a row must clear every supplied constraint to be fetched at all.

     A row with a real answer that is not the requested one — `No Box or
     Papers` against `Papers Only` — fails the match branch AND the null
     branch, so it never returns. The exclusion of not_satisfied falls out of
     retrieval and needs no enforcement code, which is the reason this belongs
     here rather than in a filter afterwards. */
  let admitting = applyStructural(base());
  if (q.model) admitting = admitting.or(`model.ilike.%${q.model}%,model.is.null`);
  if (q.condition) admitting = admitting.or(`condition.ilike.%${q.condition}%,condition.is.null`);
  if (q.documentation) {
    admitting = admitting.or(
      `documentation.ilike.%${q.documentation}%,documentation.is.null`
    );
  }
  if (q.currency) {
    admitting = admitting.or(
      `asking_currency.eq.${q.currency.toUpperCase()},asking_currency.is.null`
    );
  }
  if (q.maxPrice !== null) {
    admitting = admitting.or(`asking_price.lte.${q.maxPrice},asking_price.is.null`);
  }
  if (q.minPrice !== null) {
    admitting = admitting.or(`asking_price.gte.${q.minPrice},asking_price.is.null`);
  }

  const anyUnknownCapable =
    Boolean(q.model || q.condition || q.documentation || q.currency || q.dial) ||
    q.maxPrice !== null ||
    q.minPrice !== null;

  const [strictRes, admitRes] = await Promise.all([
    strict,
    /* Skipped entirely when no supplied constraint can be unknown — the
       second query would be identical to the first and would buy nothing. */
    anyUnknownCapable ? admitting : Promise.resolve(null),
  ]);

  if (strictRes.error) throw new Error(strictRes.error.message);
  if (admitRes && admitRes.error) throw new Error(admitRes.error.message);

  /* In-memory refinements. `dial` and `text` look across several fields at
     once, so both still run over the bounded fetch. */
  const dialMatches = (r: DiscoveryRow): boolean => {
    if (!q.dial) return true;
    const dial = r.specs?.dialColorType;
    return typeof dial === "string" && dial.toLowerCase().includes(q.dial.toLowerCase());
  };
  const textMatches = (r: DiscoveryRow): boolean => {
    if (!q.text) return true;
    const needle = q.text.toLowerCase();
    return [r.brand, r.model, r.reference, r.public_code, r.description]
      .filter((v): v is string => typeof v === "string")
      .some((v) => v.toLowerCase().includes(needle));
  };

  const strictFetched = (strictRes.data ?? []) as unknown as DiscoveryRow[];
  const truncated = strictFetched.length > DISCOVERY_FETCH_CEILING;
  const strictRows = (truncated
    ? strictFetched.slice(0, DISCOVERY_FETCH_CEILING)
    : strictFetched
  ).filter((r) => dialMatches(r) && textMatches(r));

  const rows = strictRows.slice(0, q.limit);

  if (!admitRes) {
    return { rows, truncated, unconfirmed: [], unconfirmedTruncated: false };
  }

  const admitFetched = (admitRes.data ?? []) as unknown as DiscoveryRow[];
  const unconfirmedTruncated = admitFetched.length > DISCOVERY_FETCH_CEILING;
  const admitRows = unconfirmedTruncated
    ? admitFetched.slice(0, DISCOVERY_FETCH_CEILING)
    : admitFetched;

  /* Identity by id, not by position: the two fetches order alike but a row
     present in both is a satisfied row and must appear only once, in
     results[]. */
  const strictIds = new Set(strictRows.map((r) => r.id));

  const unconfirmed: UnconfirmedRow[] = [];
  for (const r of admitRows) {
    if (strictIds.has(r.id)) continue;
    /* text still applies — an unconfirmed row must still be one the collector
       asked about. dial does NOT filter here; a missing dialColorType is
       precisely an unconfirmed answer rather than a reason to drop the row. */
    if (!textMatches(r)) continue;
    const reasons = unknownConstraintsFor(r, q);
    /* A row can reach the admitting fetch, fail nothing, and still not be in
       the strict set — for instance a dial mismatch on a row that HAS a dial.
       That is not_satisfied, not unknown, and it is excluded. */
    if (reasons.length === 0) continue;
    unconfirmed.push({ row: r, unconfirmed_constraints: reasons });
    if (unconfirmed.length >= q.limit) break;
  }

  return { rows, truncated, unconfirmed, unconfirmedTruncated };
}

/** The constraints this surface can report as unconfirmed, for the descriptor. */
export const UNKNOWN_CAPABLE_CONSTRAINTS: readonly string[] = UNKNOWN_CAPABLE;

/**
 * Nearby alternatives for an exact identifier that was not found, or that was.
 * These are ALWAYS returned under their own labelled key — never folded into
 * the exact result — so an agent cannot mistake one for the other.
 */
export async function findRelated(
  supabase: SupabaseClient,
  lookup: ExactLookup,
  excludeIds: string[],
  limit: number
): Promise<DiscoveryRow[]> {
  const identifier = lookup.identifier.trim();
  /* Neighbours are found by PREFIX, not by containing the whole identifier.
     Containment finds nothing in the case that matters most: an identifier
     one character off the real one — PFC274-0000600-B33003 against
     ...B33002 — shares everything but its tail, and a whole-string match
     misses it entirely. The prefix is cut at the last separator when the
     identifier has one, because a segmented reference groups a real family
     there; otherwise the last two characters are dropped.

     These are emphatically NOT the requested identifier, which is why they
     land under `related` and never in the answer slot. */
  const column = lookup.kind === "listing_code" ? "public_code" : "reference";
  const lastSeparator = Math.max(
    identifier.lastIndexOf("-"),
    identifier.lastIndexOf("/"),
    identifier.lastIndexOf("."),
    identifier.lastIndexOf("_")
  );
  const prefix =
    lastSeparator >= 3
      ? identifier.slice(0, lastSeparator)
      : identifier.slice(0, Math.max(3, identifier.length - 2));

  let builder = supabase
    .from(READ_MODEL)
    .select(READ_MODEL_COLUMNS)
    .ilike(column, `${prefix}%`)
    .limit(limit + excludeIds.length);
  if (excludeIds.length > 0) {
    builder = builder.not("id", "in", `(${excludeIds.join(",")})`);
  }
  const { data, error } = await builder;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as DiscoveryRow[]).slice(0, limit);
}

/* ── Transport ─────────────────────────────────────────────────────────── */

/* Public facts, readable from anywhere, by anything authorized to fetch a
   URL. CORS is open because the data is open; the boundary that matters was
   decided in the read model, not in a header. */
export const DISCOVERY_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  /* Short cache: inventory truth beats crawlability, and an assistant must
     never confidently recommend a watch FairWatchTrade already knows is gone.
     Sixty seconds is short enough that a state change is visible almost
     immediately and long enough to absorb a burst of agent traffic. */
  "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=30",
};
