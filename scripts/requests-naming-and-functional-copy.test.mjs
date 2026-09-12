import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* ── Requests naming + authenticated functional copy (2026-09-12) ──────
   The seller room is Requests, three copy blocks ship verbatim, the
   collector's Wanted room keeps everything it owns, the unresolved prefill
   seam is provably untouched, and the footing rule has a governed home.
   Run: node scripts/requests-naming-and-functional-copy.test.mjs
   ─────────────────────────────────────────────────────────────────────── */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/** Comment-stripped source: a pin on rendered COPY must never match prose
    that merely quotes the wording it replaced. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
/** Source as the reader meets it: the file wraps, the person reads a line. */
const flat = (p) => code(p).replace(/\s+/g, " ");

const rail = read("components/AccountRail.tsx");
const shell = read("components/AccountDashboard.tsx");
const selector = read("components/AccountRoomSelector.tsx");
const requestsRoom = read("components/WantedRequestsModule.tsx");
const wanted = read("components/WantedWorkspace.tsx");
const sell = read("app/sell/(entry)/page.tsx");

/* ── 1 · the rename, everywhere the name is shown ────────────────────── */

test("the seller Account room is Requests in the rail, the title, the narrow selector and the Sell doorway", () => {
  assert.match(rail, /\{ id: "wanted", label: "Requests", icon: "wanted" \}/);
  assert.match(shell, /activeModule === "wanted"\s*\?\s*"Requests"/);
  assert.match(selector, /\{ id: "wanted", label: "Requests" \}/);
  assert.match(sell, /Back to Requests/);
});

test("no user-visible seller surface still says Collector Demand", () => {
  for (const [name, src] of [
    ["rail", rail],
    ["shell", shell],
    ["selector", selector],
    ["room", requestsRoom],
    ["sell", sell],
    ["room geography", read("lib/accountWorkspace/roomGeography.ts")],
  ]) {
    assert.ok(!/Collector Demand/.test(src), `${name} still carries the retired room name`);
  }
});

test("the room failure state carries the new name and keeps its LS-4 meaning", () => {
  assert.match(requestsRoom, /Requests could not be loaded just now\. Nothing has changed\./);
  /* The semantics around it are the v8.65 ones, unchanged. */
  assert.match(requestsRoom, /queue\.phase === "unavailable" \?/);
  assert.match(requestsRoom, /data-queue-unavailable=""/);
  assert.match(requestsRoom, /\) : provenEmpty\(queue\) \? \(/);
});

test("the rename did not reorder Account navigation or restore the duplicate title", () => {
  const order = ["dashboard", "inventory", "accelerator", "communications", "saved", "wanted", "trades"];
  const positions = order.map((id) => rail.indexOf(`id: "${id}"`));
  assert.ok(positions.every((v, i) => v > 0 && (i === 0 || v > positions[i - 1])), "rail order unchanged");
  assert.ok(!/Requests<\/h2>/.test(requestsRoom), "the room renders no second title");
  assert.ok(!/<h1/.test(requestsRoom));
});

/* ── 2 · the three locked copy blocks, verbatim ──────────────────────── */

const INTRO =
  "Watches people are looking for that you may be able to answer with a listing you already have, a new one, or a private listing made for them alone.";
const PRIVACY =
  "You&rsquo;re never shown their exact budget or who they are — only whether a watch sits within, near, or outside their range. Every answer is a real FairWatchTrade listing, never a message.";
const WANTED_INTRO =
  "Tell us what you&rsquo;re looking to buy. Sellers can see if they already have a match and answer with that listing, or create a private listing just for you.";

test("the Requests intro ships exactly as locked", () => {
  assert.ok(flat("components/WantedRequestsModule.tsx").includes(INTRO));
  /* The words the order forbids reintroducing. */
  const f = flat("components/WantedRequestsModule.tsx");
  assert.ok(!/requests from collectors/i.test(f));
  for (const swap of ["buyers are looking for", "members are looking for", "collectors are looking for"]) {
    assert.ok(!f.includes(swap), `"${swap}" replaced the locked noun`);
  }
});

test("the Requests privacy line ships exactly as locked, over unchanged truth", () => {
  assert.ok(flat("components/WantedRequestsModule.tsx").includes(PRIVACY));
  assert.ok(!/The collector&rsquo;s exact budget/i.test(flat("components/WantedRequestsModule.tsx")));
  /* The product truth underneath is untouched: the room still renders only
     the three-word budget projection and no identity or ceiling field. */
  assert.match(requestsRoom, /budget_fit/);
  for (const forbidden of ["max_price", "target_price", "requester_id", "private_note"]) {
    assert.ok(!requestsRoom.includes(forbidden), `${forbidden} must never reach the seller room`);
  }
});

test("the collector Wanted intro ships exactly as locked, with no system vocabulary", () => {
  assert.ok(flat("components/WantedWorkspace.tsx").includes(WANTED_INTRO));
  assert.ok(!/governed inventory/i.test(flat("components/WantedWorkspace.tsx")), "internal vocabulary is gone from the intro");
  assert.ok(!/Tell FairWatchTrade what you are actively trying to buy/.test(flat("components/WantedWorkspace.tsx")));
});

/* ── 3 · what the collector room keeps ───────────────────────────────── */

test("Wanted keeps its name, its room, its route and its mechanics", () => {
  assert.match(wanted, /<h1 className="font-display text-\[30px\] font-light text-\[var\(--platinum\)\]">Wanted<\/h1>/);
  assert.match(read("components/CatalogueRail.tsx"), /Wanted/);
  assert.ok(!/Requests/.test(read("components/CatalogueRail.tsx")), "the seller room name never enters the Catalogue family");
  /* The collector route and its creation path are untouched. */
  assert.match(read("app/wanted/page.tsx"), /<WantedWorkspace \/>/);
  assert.match(wanted, /fetch\("\/api\/wanted"/);
  assert.match(wanted, /method: "POST"/, "creation still lives here");
  /* And the seller room still writes no Wanted request. */
  assert.ok(!/WantedWorkspace/.test(requestsRoom));
});

test("the Account module stays internally keyed wanted — this was a name change, not a rename of the data model", () => {
  assert.match(rail, /id: "wanted"/);
  assert.match(shell, /activeModule === "wanted"/);
  assert.match(selector, /id: "wanted"/);
  assert.match(read("lib/accountModules.ts"), /"wanted"/);
  assert.match(requestsRoom, /\/api\/wanted\/seller/, "the seller projection route is unchanged");
});

/* ── 4 · the doorway and the frozen prefill seam ─────────────────────── */

test("the doorway label and target are held exactly as they were", () => {
  assert.match(requestsRoom, /data-create-wanted-request=""/);
  assert.match(requestsRoom, /href="\/wanted\?new=1"/);
  assert.match(flat("components/WantedRequestsModule.tsx"), /> Create Wanted Request </);
  for (const renamed of ["Create Your Own Wanted Request", "Source This Watch", "Hunt for This Watch", "Create Request<"]) {
    assert.ok(!requestsRoom.includes(renamed), `the doorway was relabelled to "${renamed}"`);
  }
});

test("the unresolved Wanted prefill seam is byte-for-byte what it was", () => {
  /* This asserts UNCHANGED, never correct. The product question — whether
     carrying another request's criteria into the personal composer is
     intentional sourcing or incidental context — is not answered here. */
  assert.match(wanted, /const \[composing, setComposing\] = useState\(\(\) => params\.get\("new"\) === "1"\);/);
  assert.match(
    wanted,
    /const \[draft, setDraft\] = useState<Draft>\(\(\) => \(\{\s*\.\.\.EMPTY_DRAFT,\s*brand: params\.get\("brand"\) \?\? "",\s*modelText: params\.get\("model"\) \?\? "",\s*minCondition: params\.get\("condition"\) \?\? "",\s*\}\)\);/,
    "the seeding parameters and their order are untouched"
  );
});

/* ── 5 · LS-3 and the v8.65 work, untouched ──────────────────────────── */

test("no field, placeholder or gray-box treatment was touched", () => {
  for (const [name, src] of [["Wanted", wanted], ["Requests", requestsRoom]]) {
    assert.ok(!/::placeholder|placeholder:\[|placeholder-\[/.test(src), `${name} changed placeholder styling`);
  }
  /* The global sheet is not in this run's changed set at all. */
  assert.ok(!/placeholder/.test(code("lib/accountWorkspace/roomGeography.ts")));
});

test("the v8.65 room origin, archive and LS-4 provenance still stand", () => {
  assert.match(requestsRoom, /<div className=\{ACCOUNT_ROOM_BODY\}>/);
  assert.match(read("components/TradeOffersModule.tsx"), /<div className=\{ACCOUNT_ROOM_BODY\}>/);
  assert.match(read("components/TradeOffersModule.tsx"), /data-trade-view=/);
  assert.match(read("components/TradeOffersModule.tsx"), /data-archive-control=/);
  assert.match(read("app/api/trade-offers/route.ts"), /dealsOk/);
  assert.match(read("app/api/wanted/\[id\]/peek/route.ts"), /error: "read_failed"/);
  assert.match(wanted, /useState<LoadState<WantedRow\[\]>>\(LOADING\)/);
});

/* ── 6 · the footing rule, in its governed home ──────────────────────── */

const RULE =
  "In authenticated functional copy, never describe the reader in third person. Address the reader directly; name the other party only when their role is necessary. Editorial, marketing, manifesto, and public listing copy are outside this rule.";

test("the authenticated-functional-copy rule lives in the governed Product Laws home, verbatim", () => {
  const law = read("docs/product-laws/Authenticated_Functional_Copy_Law.md");
  assert.ok(law.replace(/\s+/g, " ").replace(/> /g, "").includes(RULE), "the rule is present word for word");
  assert.match(law, /Status: GOVERNING/);
  /* It uses the established folder rather than starting a second system. */
  assert.match(read("docs/product-laws/README.md"), /Product Laws preserve reusable product behavior/);
  assert.match(law, /## Core Law/);
  assert.match(law, /## Forbidden Behavior/);
  assert.match(law, /## Out of Scope/);
});
