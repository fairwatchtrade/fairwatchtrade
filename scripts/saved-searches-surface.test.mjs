/* Saved Searches Account Surface — presentation-contract tests (no DOM, no
   network). Run: node --experimental-strip-types scripts/saved-searches-surface.test.mjs
   (tsx-free: we import the TS module via a tiny on-the-fly transpile using
   node's type stripping; falls back to failing loudly if unsupported). */
import fs from "node:fs";

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL  ${name}`);
  }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const mod = await import("../lib/savedSearchPresentation.ts");
const {
  originalSearchText,
  interpretedMeaning,
  statusLabel,
  matchCounts,
  matchCountLabel,
  contextLine,
  openResultsHref,
  presentMatch,
} = mod;

// ── original language: q wins; name is the fallback (quick-link saves) ──
check(
  "original text = the collector's q",
  originalSearchText({ name: "My hunt", query_string: "q=parmigiani+kalpa+-gold" }) ===
    "parmigiani kalpa -gold"
);
check(
  "original text falls back to the saved name",
  originalSearchText({ name: "Steel chronographs", query_string: "brand=Omega" }) ===
    "Steel chronographs"
);

// ── interpreted meaning: stored state first, plain collector words only ──
const storedState = {
  version: 1,
  text: "manual wind power reserve >5d",
  code: null,
  reference: null,
  meanings: [
    { kind: "movement", value: "Manual Wind", label: "Movement: Manual Wind", source: [] },
    {
      kind: "powerReserveMinDays",
      value: "5",
      label: "Power Reserve: More than 5 days",
      source: [],
    },
  ],
};
check(
  "meaning uses stored reviewed labels",
  interpretedMeaning({ query_string: "q=x", search_state: storedState }) ===
    "Movement: Manual Wind · Power Reserve: More than 5 days"
);
check(
  "meaning falls back to a fresh parse when no state stored",
  interpretedMeaning({ query_string: "q=parmigiani+kalpa+-gold", search_state: null }).includes(
    "Brand: Parmigiani Fleurier"
  )
);
check(
  "manual Refine selections join the meaning",
  interpretedMeaning({ query_string: "q=automatic&docs=Full+Set", search_state: null }) ===
    "Movement: Automatic · Documentation: Full Set"
);
check(
  "exact listing-code search speaks collector language",
  interpretedMeaning({
    query_string: "q=q15932",
    search_state: { version: 1, text: "q15932", code: "q15932", reference: null, meanings: [] },
  }) === "Exact FairWatchTrade listing code"
);
// long collector syntax survives intact (no truncation in the model layer)
const longQ = 'manual wind "small seconds" -gold >=28800vph under 40mm power reserve >5d';
check(
  "long technical text is preserved verbatim",
  originalSearchText({ name: "x", query_string: `q=${encodeURIComponent(longQ)}` }) === longQ
);

// ── status ──
check("watching label", statusLabel({ paused: false }) === "Watching");
check("paused label", statusLabel({ paused: true }) === "Paused");

// ── new-count law: new = created after last OPEN; never-opened = all new ──
const m = (iso) => ({ created_at: iso });
const now = new Date();
const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();
check(
  "never opened → every match is new",
  eq(matchCounts({ last_opened_at: null }, [m(daysAgo(1)), m(daysAgo(9))]), { total: 2, fresh: 2 })
);
check(
  "opened between matches → only later ones are new",
  eq(matchCounts({ last_opened_at: daysAgo(5) }, [m(daysAgo(1)), m(daysAgo(9))]), {
    total: 2,
    fresh: 1,
  })
);
check(
  "opened after all matches → nothing new",
  eq(matchCounts({ last_opened_at: daysAgo(0.5) }, [m(daysAgo(1))]), { total: 1, fresh: 0 })
);

// ── DD1 count labels ──
check("no matches yet", matchCountLabel({ total: 0, fresh: 0 }) === "No matches yet");
check("1 new match", matchCountLabel({ total: 3, fresh: 1 }) === "1 new match");
check("2 new matches", matchCountLabel({ total: 2, fresh: 2 }) === "2 new matches");
check("1 saved match", matchCountLabel({ total: 1, fresh: 0 }) === "1 saved match");
check("3 matches", matchCountLabel({ total: 3, fresh: 0 }) === "3 matches");

// ── context lines per DD1 state ──
check(
  "paused context",
  contextLine({ paused: true }, { total: 1, fresh: 0 }, null) ===
    "Watching is paused. Existing match history remains available."
);
check(
  "no-match context",
  contextLine({ paused: false }, { total: 0, fresh: 0 }, null) ===
    "Nothing yet. We’re still watching for your watch."
);
check(
  "prior-match context",
  contextLine({ paused: false }, { total: 3, fresh: 0 }, daysAgo(3)) ===
    "No new matches since you last opened this search"
);
check(
  "new-match context names the recency",
  contextLine({ paused: false }, { total: 2, fresh: 2 }, daysAgo(0)).startsWith(
    "Most recent match found"
  )
);

// ── open results = the saved browse query verbatim (no second engine) ──
check(
  "open results href is the stored query",
  openResultsHref({ query_string: "q=parmigiani+kalpa&brand=Omega" }) ===
    "/browse?q=parmigiani+kalpa&brand=Omega"
);
check("empty query reopens plain browse", openResultsHref({ query_string: "" }) === "/browse");

// ── match presentation truth ──
const matchRow = { id: "m1", saved_search_id: "s1", listing_id: "l1", created_at: daysAgo(0) };
const live = presentMatch(matchRow, {
  id: "l1",
  brand: "Omega",
  model: "Seamaster",
  reference: "166.0209",
  asking_price: 4200,
  condition: "Excellent",
  status: "published",
  photos: [{ category: "Dial", photo: { url: "https://x/img.jpg" } }],
});
check(
  "available match: full truthful fields + real listing link",
  live.available &&
    live.title === "Omega Seamaster" &&
    live.priceText === "$4,200" &&
    live.availabilityLabel === "Available" &&
    live.href === "/listings/l1" &&
    live.thumbUrl === "https://x/img.jpg"
);
const gone = presentMatch(matchRow, {
  id: "l1",
  brand: "Omega",
  model: "Seamaster",
  reference: "166.0209",
  asking_price: 4200,
  condition: "Excellent",
  status: "rejected",
  photos: [],
});
check(
  "unavailable match: honest label, no purchase path, no stale price",
  !gone.available &&
    gone.availabilityLabel === "No longer available" &&
    gone.href === null &&
    gone.priceText === null
);
const unreadable = presentMatch(matchRow, null);
check(
  "listing no longer readable: history preserved, honestly labeled",
  unreadable.title === "Previously matched watch" &&
    unreadable.availabilityLabel === "No longer available" &&
    unreadable.href === null
);

// ── jargon ban: no implementation vocabulary in customer-facing sources ──
const surfaces = [
  "components/SavedSearchesModule.tsx",
  "lib/savedSearchPresentation.ts",
  "components/SaveSearchControl.tsx",
  "components/SearchEmptyState.tsx",
];
const BANNED = /criterion|criteria|query object|watcher job|parser|subscription|automation status|database state/i;
for (const file of surfaces) {
  // Strings the collector can SEE: JSX text + quoted literals. A coarse but
  // honest proxy: scan every string literal in the file.
  const src = fs.readFileSync(file, "utf8");
  const strings = [...src.matchAll(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g)]
    .map((x) => x[0])
    .filter((s) => !s.includes("/") && !s.includes("_")); // paths/idents excluded
  check(`no customer-facing jargon in ${file}`, !strings.some((s) => BANNED.test(s)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
