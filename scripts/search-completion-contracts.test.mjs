/* Search Completion Flight — source-contract and parity guards.
   These assert the wiring the parser suite cannot see: the empty-state law,
   related-result separation, one shared result set for both views, the
   caret law's echo suppression, canonical routing, and live↔saved-search
   matcher parity (TypeScript vs SQL).
   Run: node scripts/search-completion-contracts.test.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const browse = read("components/BrowseClient.tsx");
const empty = read("components/SearchEmptyState.tsx");
const searchBox = read("components/BrowseSearch.tsx");
const headerNav = read("lib/nav/headerSearch.ts");
const parse = read("lib/search/parse.ts");
const sqlMatcher = read(
  "supabase/migrations/20260801163906_saved_search_exclude_dial_color.sql"
);

let pass = 0;
const ok = (name, cond) => {
  assert.ok(cond, name);
  pass++;
};

/* ── Exact no-match state and related-result separation ── */
ok(
  "empty state carries the exact required copy",
  empty.includes('"No exact match found."')
);
ok(
  "related results live under their own visible label",
  empty.includes("Related references") &&
    empty.includes("not the exact identifier you searched")
);
ok(
  "related section renders only for an exact-identifier search",
  /exactIdentifier && \(related\?\.length \?\? 0\) > 0/.test(empty)
);
ok(
  "BrowseClient passes the exact identifier to the empty state",
  browse.includes("exactIdentifier={exactIdentifier}") &&
    browse.includes("const exactIdentifier = activeSearch.code ?? activeSearch.reference")
);
ok(
  "related results are computed only on a zero-result exact search",
  browse.includes("if (!exactIdentifier || filtered.length > 0) return []")
);
ok(
  "related results never enter the canonical result set",
  // The canonical chain is filtered → sorted → paginated (v4.2 inserted the
  // price sort between the filtered set and the page slice). Related results
  // are presentation-only, so NO link in that chain may consult them: not the
  // filtered memo, not the sort, not the slice.
  browse.includes(
    'const sorted = useMemo(() => sortListings(filtered, sort), [filtered, sort]);'
  ) &&
    browse.includes(
      'const paginated = pageSize === "all" ? sorted : sorted.slice(0, pageSize);'
    ) &&
    !browse
      .slice(browse.indexOf("const filtered = useMemo"), browse.indexOf("const paginated"))
      .includes("relatedToIdentifier")
);

/* ── One result set, two views (Gallery / Collector parity) ── */
ok(
  "one canonical filtered set exists",
  (browse.match(/const filtered = useMemo/g) ?? []).length === 1
);
ok(
  "both views render from the same paginated slice",
  browse.includes("{paginated.map((row) => {") &&
    browse.includes('if (viewMode === "gallery" || viewMode === "scan")')
);

/* ── Save affordance: exactly one per screen state ── */
ok(
  "SaveSearchControl renders only when results exist, and only once",
  // The law is the affordance, not the exact guard expression: the control
  // never appears without results, and never twice on one screen (the empty
  // state owns its own inline "save it"). The dealer-scoped Browse added a
  // second condition AHEAD of the results guard, so match the guard itself.
  /paginated\.length > 0 && \(\s*<SaveSearchControl/.test(browse) &&
    (browse.match(/<SaveSearchControl/g) ?? []).length === 1
);

/* ── Caret law (the Galaxy mid-query editing defect) ── */
ok(
  "echo suppression mechanism present (lastSent)",
  searchBox.includes("const [lastSent, setLastSent] = useState(query)") &&
    searchBox.includes("if (query !== lastSent && query !== text)")
);
ok(
  "debounced commit records what this component sent",
  searchBox.includes("setLastSent(next)")
);

/* ── Canonical routing: one search system, /browse?q= ── */
ok(
  "header search submits to /browse?q=",
  headerNav.includes("`/browse?q=${encodeURIComponent(trimmed)}`")
);
ok(
  "Browse reads the same q the header writes",
  browse.includes('searchParams.get("q")')
);
ok(
  "Browse search commits back into q on the URL",
  browse.includes('next.set("q", value)')
);
ok(
  "no second parser: both surfaces resolve through lib/search/parse",
  browse.includes('from "@/lib/search/parse"') &&
    !headerNav.includes("parseSearch")
);

/* ── Live ↔ saved-search matcher parity (TS vs SQL) ── */
ok(
  "TS reference matching is exact identity",
  parse.includes(
    '(listing.reference ?? "").toLowerCase() === state.reference.toLowerCase()'
  )
);
ok(
  "SQL reference matching is exact identity",
  sqlMatcher.includes(
    "lower(p_state->>'reference') = lower(coalesce(p_listing.reference, ''))"
  )
);
ok(
  "TS code matching is exact identity",
  parse.includes('(listing.public_code ?? "").toLowerCase() === state.code.toLowerCase()')
);
ok(
  "SQL code matching is exact identity",
  sqlMatcher.includes(
    "lower(p_state->>'code') = lower(coalesce(p_listing.public_code, ''))"
  )
);
{
  // Every restrictive meaning kind the parser can emit has a matching SQL
  // branch; the two deliberately NON-restrictive kinds fall through both
  // evaluators. Adding a kind in parse.ts without SQL support fails here.
  const restrictiveKinds = [
    "brand",
    "collection",
    "caseMaterial",
    "excludeCaseMaterial",
    "complication",
    "movement",
    "beatRateMin",
    "powerReserveMinDays",
    "powerReservePresent",
    "caseSizeMaxMm",
    "dialColor",
    "excludeDialColor",
    "text",
  ];
  for (const kind of restrictiveKinds) {
    ok(`SQL matcher handles kind '${kind}'`, sqlMatcher.includes(`kind = '${kind}'`));
  }
  ok(
    "non-restrictive kinds fall through both evaluators",
    parse.includes('case "unsupportedExclusion":') &&
      parse.includes('case "unsupportedPrice":') &&
      !sqlMatcher.includes("kind = 'unsupportedExclusion'") &&
      !sqlMatcher.includes("kind = 'unsupportedPrice'")
  );
}

/* ── The identifier-shape law lives in the parser, matcher untouched ── */
ok(
  "identifier-shaped fallback sets state.reference verbatim",
  parse.includes("if (isIdentifierShaped(trimmed))")
);
ok(
  "unknown or unsupported text remains visible (never silently discarded)",
  parse.includes('kind: "unsupportedExclusion"') &&
    parse.includes("Search text: ${phrase}")
);

console.log(`search-completion-contracts: ${pass} assertions PASS`);
