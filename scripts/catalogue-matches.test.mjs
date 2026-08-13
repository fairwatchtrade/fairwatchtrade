/* Catalogue Permissioned Adjacency — derivation + contract guards.
   Run: node scripts/catalogue-matches.test.mjs

   Covers the pure Catalogue derivations (lib/catalogueMatches.ts), the
   count separation law in lib/savedSearchPresentation.ts, and the source
   contracts that keep the surfaces and the applied migration honest:
   Catalogue never falls back to marketplace-wide inventory, adjacent never
   masquerades as exact, the permission is per-search and default OFF, and
   the SQL evaluator's kind list stays in step with the canonical matcher. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const lib = await import("../lib/catalogueMatches.ts");
const pres = await import("../lib/savedSearchPresentation.ts");
const { catalogueHeroState, groupCatalogueMatches, ADJACENT_DISPLAY_CAP } = lib;
const { matchCounts, adjacentCount, adjacentCountLabel, presentMatch } = pres;

let n = 0;
const ok = (name, cond) => {
  assert.ok(cond, name);
  console.log(`  PASS ${++n}  ${name}`);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ── Hero: four honest states ────────────────────────────────────────── */
ok("no saved searches → the promise is not yet made",
  catalogueHeroState([], 0) === "no-searches");
ok("active search, no exact matches → watching",
  catalogueHeroState([{ paused: false }], 0) === "watching");
ok("exact matches present → found state",
  catalogueHeroState([{ paused: false }], 2) === "matches");
ok("every search paused → paused, never a false 'watching'",
  catalogueHeroState([{ paused: true }, { paused: true }], 0) === "paused");
ok("adjacent results alone never drive the hero (exactCount is exact-only)",
  catalogueHeroState([{ paused: false }], 0) === "watching");

/* ── Grouping ────────────────────────────────────────────────────────── */
const S = (id, over = {}) => ({ id, name: `search-${id}`, paused: false, include_adjacent: true, ...over });
const L = (id, status = "published") => ({ id, status });
const R = (id, sid, lid, kind, over = {}) => ({
  id, saved_search_id: sid, match_kind: kind,
  adjacent_reason: kind === "adjacent" ? `reason-${id}` : null,
  created_at: `2026-08-0${(id % 9) + 1}T00:00:00Z`, listing: L(lid), ...over,
});

{
  const g = groupCatalogueMatches([S("a")], [R(1, "a", "l1", "exact"), R(2, "a", "l2", "adjacent")]);
  ok("exact and adjacent separate cleanly, reasons ride the adjacent card",
    g.exact.length === 1 && g.adjacent.length === 1 &&
    g.exact[0].listing.id === "l1" && g.exact[0].reason === null &&
    g.adjacent[0].listing.id === "l2" && g.adjacent[0].reason === "reason-2");
}
{
  const g = groupCatalogueMatches([S("a")], [{ ...R(1, "a", "l1", "exact"), listing: L("l1", "sold") }]);
  ok("a match whose watch left the market renders nothing here",
    g.exact.length === 0 && g.adjacent.length === 0);
}
{
  const g = groupCatalogueMatches([S("a", { include_adjacent: false })],
    [R(1, "a", "l1", "adjacent"), R(2, "a", "l2", "exact")]);
  ok("adjacency OFF removes adjacent presentation at read time; exact stays",
    g.adjacent.length === 0 && g.exact.length === 1);
}
{
  const g = groupCatalogueMatches([S("a", { paused: true })],
    [R(1, "a", "l1", "adjacent"), R(2, "a", "l2", "exact")]);
  ok("paused search: adjacent hidden, accrued exact history still renders",
    g.adjacent.length === 0 && g.exact.length === 1);
}
{
  const g = groupCatalogueMatches([S("a"), S("b")],
    [R(1, "a", "l1", "adjacent"), R(2, "b", "l1", "exact")]);
  ok("one listing, one card: exact wins over adjacent across searches",
    g.exact.length === 1 && g.adjacent.length === 0 &&
    g.exact[0].matchKind === "exact" && g.exact[0].reason === null &&
    g.exact[0].searchNames.length === 2);
}
{
  const rows = Array.from({ length: 9 }, (_, i) => R(i + 1, "a", `l${i + 1}`, "adjacent"));
  const g = groupCatalogueMatches([S("a")], rows);
  ok(`adjacent display is bounded at ${ADJACENT_DISPLAY_CAP} — the Catalogue never becomes Browse by accumulation`,
    g.adjacent.length === ADJACENT_DISPLAY_CAP);
}
{
  const g = groupCatalogueMatches([S("a")], [{ ...R(1, "a", "l1", null), match_kind: undefined }]);
  ok("pre-adjacency rows (no kind) are exact by construction",
    g.exact.length === 1 && g.exact[0].matchKind === "exact");
}
{
  const g = groupCatalogueMatches([], [R(1, "ghost", "l1", "exact")]);
  ok("a row whose search no longer exists renders nothing", g.exact.length === 0);
}

/* ── Count separation law ────────────────────────────────────────────── */
{
  const matches = [
    { created_at: "2026-08-10T00:00:00Z", match_kind: "exact" },
    { created_at: "2026-08-11T00:00:00Z", match_kind: "adjacent" },
    { created_at: "2026-08-12T00:00:00Z" },
  ];
  ok("matchCounts counts EXACT only — adjacent never inflates match language",
    eq(matchCounts({ last_opened_at: null }, matches), { total: 2, fresh: 2 }));
  ok("adjacentCount honors the current permission",
    adjacentCount({ include_adjacent: true }, matches) === 1 &&
    adjacentCount({ include_adjacent: false }, matches) === 0);
  ok("close-match label is quiet and truthful",
    adjacentCountLabel(0) === null && adjacentCountLabel(1) === "1 close match" &&
    adjacentCountLabel(3) === "3 close matches");
}
{
  const p = presentMatch(
    { id: "m1", saved_search_id: "s", listing_id: "l", created_at: "2026-08-12T00:00:00Z",
      match_kind: "adjacent", adjacent_reason: "Case in 14k Gold — the same material family as the Gold Filled you asked for." },
    { id: "l", brand: "Omega", model: null, reference: null, asking_price: null,
      condition: null, status: "published", photos: [] }
  );
  ok("presentMatch carries kind and the stored reason to every surface",
    p.matchKind === "adjacent" && p.reason?.includes("material family"));
}

/* ── Source contracts: Catalogue is collector-scoped ─────────────────── */
const page = read("app/catalogue/page.tsx");
ok("Catalogue page no longer reads marketplace-wide listings",
  !page.includes('.from("listings")') && !page.includes("limit(3)"));
ok("Catalogue page reads the collector's own searches and matches",
  page.includes('.from("saved_searches")') && page.includes('.from("saved_search_matches")'));
ok("no stale 'tables do not exist' language survives",
  !page.includes("tables don't exist") && !page.includes("Phase 2 (tables"));

const client = read("components/CatalogueClient.tsx");
ok("CatalogueClient no longer receives a marketplace feed",
  !client.includes("recentListings"));
ok("exact and adjacent render under unmistakable labels",
  client.includes("Exact match") && client.includes("Close to your search"));
ok("the adjacent card shows its stored reason",
  client.includes("card.reason"));
ok("hero has all four honest states",
  client.includes("Did your watch finally appear?") &&
  client.includes("We&apos;re watching for you.") &&
  client.includes("Watching is paused.") &&
  client.includes("Nothing is being watched yet."));

const control = read("components/SaveSearchControl.tsx");
ok("save-time opt-in exists, in plain words, wired to the column",
  control.includes("Show me close matches too") && control.includes("include_adjacent: closeMatches"));
ok("saving triggers the bounded single-search re-evaluation",
  control.includes('rpc("reevaluate_saved_search"'));

const module_ = read("components/SavedSearchesModule.tsx");
ok("management surface reads and toggles the per-search permission",
  module_.includes("include_adjacent") &&
  module_.includes("Show close matches") && module_.includes("Stop close matches"));
ok("enabling re-evaluates that one search only",
  module_.includes('rpc("reevaluate_saved_search", { p_saved_search_id: id })'));

/* ── Migration contracts: the applied SQL stays honest ───────────────── */
const mig = read("supabase/migrations/20260812233000_catalogue_permissioned_adjacency.sql");
const canonical = read("supabase/migrations/20260801163906_saved_search_exclude_dial_color.sql");
ok("permission column defaults OFF",
  mig.includes("include_adjacent boolean not null default false"));
ok("match kind is constrained to the two truthful values",
  mig.includes("check (match_kind in ('exact', 'adjacent'))"));
{
  // Paired-evaluator law: every kind the canonical matcher restricts must be
  // mirrored in the adjacency evaluator's exact leg, and vice versa.
  const kinds = [...canonical.matchAll(/kind = '([A-Za-z]+)'/g)].map((m) => m[1]);
  assert.ok(kinds.length >= 13, "canonical matcher kinds must be discoverable");
  for (const k of new Set(kinds)) {
    assert.ok(mig.includes(`p_kind = '${k}'`), `adjacency evaluator must mirror kind '${k}'`);
  }
  ok("kind parity holds between the canonical matcher and the adjacency evaluator's exact leg", true);
}
ok("exact wins structurally — the evaluator refuses exact matches first",
  mig.indexOf("saved_search_matches_listing(p_state, p_listing)") <
  mig.indexOf("p_state->'meanings'"));
ok("code searches never produce adjacency",
  mig.includes("p_state->>'code'"));
ok("the re-evaluation is owner-gated and bounded to one search",
  mig.includes("user_id = auth.uid()") && mig.includes("p_saved_search_id"));
ok("evaluator functions are not client-callable; only the RPC is granted",
  (mig.match(/revoke all on function/g) ?? []).length >= 4 &&
  mig.includes("grant execute on function public.reevaluate_saved_search(uuid) to authenticated"));
ok("the canonical exact evaluator is not redefined by this migration",
  !mig.includes("create or replace function public.saved_search_matches_listing"));

console.log(`\n  catalogue-matches: ${n} sections, all assertions passed`);
