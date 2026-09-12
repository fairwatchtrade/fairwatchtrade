/* LS1-B4 — ordinary-user semantic 10px split.

   Run: node scripts/ls1-b4-semantic-10px.test.mjs

   This is the bounded implementation contract carried from the completed
   LS-1 return. It does not run another typography census. It pins the 79
   unique, still-ungoverned R13-R16 bindings at current v8.62 HEAD, after the
   22 exact R14 bindings already closed by LS1-B1 and after reconciling the
   abbreviated ledger's three duplicate ListingCorrespondence anchors. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const RECIPES = [
  "fw-functional-copy",
  "fw-transaction-fact",
  "fw-lifecycle-label",
  "fw-validity-state",
  "fw-compact-control",
  "fw-work-count",
];

const css = postcss.parse(read("app/globals.css"));
for (const recipe of RECIPES) {
  const rules = [];
  css.walkRules((rule) => {
    if (rule.selectors?.includes(`.${recipe}`)) rules.push(rule);
  });
  assert.equal(rules.length, 1, `.${recipe} remains one authoritative governed recipe`);
}

function sourceTree(path) {
  return ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function staticStrings(path) {
  const values = [];
  const visit = (node) => {
    if (
      ts.isStringLiteralLike(node) ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail
    ) {
      values.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceTree(path));
  return values;
}

function recipeCounts(path) {
  const strings = staticStrings(path);
  return Object.fromEntries(
    RECIPES.map((recipe) => [
      recipe,
      strings.filter((value) => value.split(/\s+/).includes(recipe)).length,
    ])
  );
}

const normalize = (value) => value.replace(/\s+/g, " ").trim();

function countExact(haystack, needle) {
  let count = 0;
  let offset = 0;
  while ((offset = haystack.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

function anchor(path, recipe, label, context) {
  assert.ok(RECIPES.includes(recipe), `${path}: ${label} uses a known governed recipe`);
  assert.equal(
    context.split("{{recipe}}").length - 1,
    1,
    `${path}: ${label} context has one recipe slot`
  );
  return { path, recipe, label, context };
}

/* The B4 contract is an anchor ledger, not a file-level class census. Each
   context is a stable JSX/class-root plus nearby copy or expression. That
   pins the semantic role even when two recipes have the same per-file count. */
const ANCHORS = [
  anchor("components/AccountDashboard.tsx", "fw-functional-copy", "seller clarification", `<div className="mt-3 border-l border-[var(--border-gold)] bg-[var(--gold-whisper)] px-3 py-2 {{recipe}} text-[var(--muted)]"> We need a little more information`),
  anchor("components/AccountDashboard.tsx", "fw-functional-copy", "submit next action", `<div className="mt-1.5 {{recipe}} text-[var(--muted)]"> Sends this draft to FairWatchTrade.`),
  anchor("components/AccountDashboard.tsx", "fw-functional-copy", "integrity-review state", `<div className="mt-3 {{recipe}} text-[var(--muted)]"> Your photographs are receiving an additional authenticity review.`),
  anchor("components/AccountDashboard.tsx", "fw-functional-copy", "submitted state", `<div className="mt-3 {{recipe}} text-[var(--muted)]"> Submitted for review.`),
  anchor("components/AccountDashboard.tsx", "fw-functional-copy", "submission failure", `<div className="mt-2 {{recipe}} text-[var(--danger)]"> {submitError}`),

  anchor("components/AccountRoomSelector.tsx", "fw-compact-control", "account room control", `<span className="{{recipe}} uppercase text-[var(--muted)]"> Account </span>`),
  anchor("components/AccountSettings.tsx", "fw-lifecycle-label", "SMS availability", `<span className="{{recipe}} border border-[var(--border-subtle)] px-1.5 py-[1px] uppercase text-[var(--muted)]"> Coming soon </span>`),
  anchor("components/BrowseClient.tsx", "fw-compact-control", "wanted-request link", `className="{{recipe}} mt-3 inline-block border border-[var(--border-mid)] px-4 py-2 uppercase text-[var(--slate)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--platinum)]" > Create Wanted Request →`),

  anchor("components/BrowseQuickAdd.tsx", "fw-compact-control", "quick-add control group", `<span className="{{recipe}} uppercase text-[var(--muted)]"> Quick add </span>`),
  anchor("components/BrowseQuickAdd.tsx", "fw-work-count", "facet result count", `<span className="{{recipe}} shrink-0 text-[var(--muted)]">{n}</span>`),
  anchor("components/BrowseQuickAdd.tsx", "fw-transaction-fact", "remaining facet fact", `<div className="{{recipe}} px-3 pb-1 pt-1.5 text-[var(--muted)]"> {cat.facets.length - PICKER_LIMIT} more in Refine </div>`),
  anchor("components/BrowseQuickAdd.tsx", "fw-compact-control", "open refine control", `className="{{recipe}} mt-1 block w-full border-t border-[var(--border-faint)] px-3 py-2 text-left uppercase text-[var(--gold-dim)] transition hover:text-[var(--gold)]" > Open full Refine →`),

  anchor("components/BrowseSearch.tsx", "fw-functional-copy", "dealer search instruction", `<div className="{{recipe}} mb-1.5 uppercase text-[var(--gold-dim)]"> Search inventory </div>`),
  anchor("components/BrowseSearch.tsx", "fw-compact-control", "dealer search submit", `className="{{recipe}} border border-[var(--border-subtle)] bg-[var(--ink-deep)] uppercase text-[var(--platinum-dim)] transition hover:border-[var(--border-gold)] hover:text-[var(--platinum)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-gold)]" > Go`),
  anchor("components/BrowseSearch.tsx", "fw-transaction-fact", "search-chip provenance", '<small className={`{{recipe}} flex-none uppercase ${ legibilityMode ? "text-[var(--slate)]" : "text-[var(--muted)]" }`} > {chip.source === "filter" ? "Filter" : "Search"} </small>'),
  anchor("components/BrowseSearch.tsx", "fw-transaction-fact", "filter-chip provenance", '<small className={`{{recipe}} flex-none uppercase ${ legibilityMode ? "text-[var(--slate)]" : "text-[var(--muted)]" }`} > Filter </small>'),

  anchor("components/CatalogueRoomSelector.tsx", "fw-compact-control", "collector room control", `<span className="{{recipe}} uppercase text-[var(--muted)]"> Collector </span>`),
  anchor("components/CurationReviewCard.tsx", "fw-transaction-fact", "review timestamp", `<p className="{{recipe}} mt-2 uppercase text-[var(--ghost)]"> Updated{" "}`),
  anchor("components/DialReveal.tsx", "fw-functional-copy", "dial-reveal tooltip", `"{{recipe}} text-[var(--dim,#BFC5D2)]", "translate-x-[4px] opacity-0`),
  anchor("components/HomepageClient.tsx", "fw-transaction-fact", "listing metadata", `<div className="{{recipe}} mb-3 text-[var(--muted)]"> {meta} </div>`),
  anchor("components/ImportedDraftsWorkspace.tsx", "fw-lifecycle-label", "imported field state", `<span className="{{recipe}} border border-[rgba(201,168,76,0.3)] px-1.5 py-0.5 uppercase text-[var(--gold-dim)]"> Imported </span>`),
  anchor("components/InlinePurchaseRequest.tsx", "fw-validity-state", "optional offer note", `<span className="{{recipe}} normal-case text-[var(--muted)]"> — optional </span>`),
  anchor("components/ListFromPhoneHandoff.tsx", "fw-transaction-fact", "phone handoff URL", `<p className="mt-2 break-all {{recipe}} text-[var(--muted)]"> {url} </p>`),

  anchor("components/ListingCorrespondence.tsx", "fw-compact-control", "view conversation control", `className="{{recipe}} text-[var(--slate)] underline decoration-[var(--border-mid)] underline-offset-4 transition hover:text-[var(--gold)]" > View conversation ↓`),
  anchor("components/ListingCorrespondence.tsx", "fw-functional-copy", "correspondence failure", `{error && <div className="mt-2 {{recipe}} text-[var(--danger)]">{error}</div>}`),
  anchor("components/ListingCorrespondence.tsx", "fw-transaction-fact", "conversation reference", `<div className="{{recipe}} text-[var(--muted)]"> Reference {reference} </div>`),
  anchor("components/ListingGallery.tsx", "fw-compact-control", "reset zoom control", 'className={`${zoomBtnBase} {{recipe}} w-auto px-2 uppercase`} > Reset'),
  anchor("components/MobileCollectorsDrawer.tsx", "fw-functional-copy", "collector drawer note", `const noteCls = "{{recipe}} mt-1 block text-[var(--platinum-dim)]";`),
  anchor("components/MobileNav.tsx", "fw-lifecycle-label", "mobile admin state", `<div className="{{recipe}} mt-1 uppercase text-[var(--gold)]"> Admin </div>`),

  anchor("components/MobileWizard.tsx", "fw-functional-copy", "recommended-currency explanation", `<div className="mt-2 flex items-center gap-2 {{recipe}} text-[var(--gold-subtle)]"> <span className="fw-work-count`),
  anchor("components/MobileWizard.tsx", "fw-functional-copy", "currency conversion disclosure", `<p className="mt-2 {{recipe}} text-[var(--slate)]"> No conversion is performed.`),
  anchor("components/MobileWizard.tsx", "fw-compact-control", "clear reference control", `className="{{recipe}} border border-[rgba(255,255,255,0.28)] px-3 py-1.5 text-[var(--slate)] transition-colors hover:text-[var(--platinum-dim)]" > {label}`),
  anchor("components/NavBar.tsx", "fw-lifecycle-label", "desktop admin state", `<span className="{{recipe}} shrink-0 text-[var(--gold)]"> Admin </span>`),
  anchor("components/NotificationsBell.tsx", "fw-transaction-fact", "notification timestamp", `<div className="{{recipe}} mt-0.5 text-[var(--muted)]"> {formatRelativeTime(n.created_at)} </div>`),

  anchor("components/PhotoPresentationEditor.tsx", "fw-functional-copy", "crop-axis help", `<p className="mt-1.5 min-h-[30px] {{recipe}} text-[var(--muted)]"> {active && !axes.horizontal`),
  anchor("components/PhotoPresentationEditor.tsx", "fw-functional-copy", "story-photo help", `<p className="mt-1 {{recipe}} text-[#8b8578]"> Shown with Story / Provenance on the listing. </p>`),
  anchor("components/PhotoRedactionEditor.tsx", "fw-functional-copy", "redaction help or error", `<p className="mt-1.5 min-h-[16px] {{recipe}} text-[var(--muted)]"> {error && bitmap ? (`),

  anchor("components/PhotoUpload.tsx", "fw-functional-copy", "photo upload failure", `<div className="absolute inset-0 flex items-center justify-center bg-red-950/70 px-2 text-center {{recipe}} text-red-200"> {it.error} </div>`),
  anchor("components/PhotoUpload.tsx", "fw-functional-copy", "extended-bracelet guidance", `<p className="{{recipe}} text-[var(--muted)]"> Show the full strap/bracelet extended in one frame`),
  anchor("components/PhotoUpload.tsx", "fw-functional-copy", "non-crown-side guidance", `<p className="{{recipe}} text-[var(--muted)]"> The side opposite the crown`),
  anchor("components/PhotoUpload.tsx", "fw-functional-copy", "crown-side guidance", `<p className="{{recipe}} text-[var(--muted)]"> The crown side`),
  anchor("components/PhotoUpload.tsx", "fw-functional-copy", "service-evidence guidance", `<div className="relative {{recipe}} text-[var(--muted)]"> {/* Instructional copy lives`),
  anchor("components/PhotoUpload.tsx", "fw-functional-copy", "extra-links guidance", `<p className="{{recipe}} text-[var(--muted)]"> Loose spare links included with the watch.`),

  anchor("components/ProposeTradeDialog.tsx", "fw-compact-control", "quiet trade controls", `const quietBtn = "{{recipe}} border border-[var(--border-mid)] px-3 py-1.5 uppercase text-[var(--slate)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--platinum)]";`),
  anchor("components/ProposeTradeDialog.tsx", "fw-compact-control", "cancel trade control", `<button type="button" onClick={onClose} className="{{recipe}} uppercase text-[var(--slate)] hover:text-[var(--platinum)]"> Cancel </button>`),
  anchor("components/ProposeTradeDialog.tsx", "fw-transaction-fact", "trade receive fact", `<dt className="{{recipe}} uppercase text-[var(--muted)]"> You receive </dt>`),
  anchor("components/ProposeTradeDialog.tsx", "fw-transaction-fact", "trade give fact", `<dt className="{{recipe}} uppercase text-[var(--muted)]"> You give </dt>`),
  anchor("components/ProposeTradeDialog.tsx", "fw-transaction-fact", "trade cash fact", `<dt className="{{recipe}} uppercase text-[var(--muted)]"> Cash </dt>`),

  anchor("components/PurchaseRequestForm.tsx", "fw-functional-copy", "seller-details review help", `<div className="mt-4 border-t border-[var(--border-gold)] pt-3 {{recipe}} text-[var(--muted)]"> Review these details from the seller before sending your request. </div>`),
  anchor("components/PurchaseRequestForm.tsx", "fw-validity-state", "optional purchase note", `<span className="{{recipe}} normal-case text-[var(--muted)]"> — optional </span>`),
  anchor("components/ReviewStep.tsx", "fw-functional-copy", "listing-currency disclosure", `<p className="mt-1.5 max-w-[560px] {{recipe}} text-[var(--muted)]"> The amount and currency shown are the exact values attached to the listing.`),

  anchor("components/SavedListingDrafts.tsx", "fw-lifecycle-label", "open draft state", `<span className="{{recipe}} uppercase text-[var(--gold)]"> Open now </span>`),
  anchor("components/SavedListingDrafts.tsx", "fw-lifecycle-label", "most-recent draft state", `<span className="{{recipe}} uppercase text-[var(--slate)]"> Most recent </span>`),
  anchor("components/SavedListingDrafts.tsx", "fw-lifecycle-label", "set-aside draft state", `<span className="{{recipe}} uppercase text-[var(--slate)]"> Set aside </span>`),
  anchor("components/SavedSearchesCard.tsx", "fw-functional-copy", "saved-search failure", `<div className="mt-2 {{recipe}} text-[var(--danger)]">{error}</div>`),

  anchor("components/SellerListingsRoom.tsx", "fw-compact-control", "sort direction control", 'className={`{{recipe}} ${ active ? "text-[var(--gold)]" : "opacity-0 transition-opacity group-hover:opacity-60" }`}'),
  anchor("components/SellerListingsRoom.tsx", "fw-functional-copy", "row submission failure", `<div className="col-span-full {{recipe}} text-[var(--danger)]"> {submitErrorMsg} </div>`),
  anchor("components/SellerListingsRoom.tsx", "fw-transaction-fact", "selected listing reference", `<div className="mt-1.5 {{recipe}} text-[var(--muted)]">Ref. {selected.reference}</div>`),
  anchor("components/SellerListingsRoom.tsx", "fw-functional-copy", "selected integrity-review state", `<div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-3 py-2.5 text-left {{recipe}} text-[var(--muted)]"> Your photographs are receiving an additional authenticity review.`),
  anchor("components/SellerListingsRoom.tsx", "fw-functional-copy", "selected clarification state", `<div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-3 py-2.5 text-left {{recipe}} text-[var(--muted)]"> We need a little more information`),
  anchor("components/SellerListingsRoom.tsx", "fw-functional-copy", "selected pending state", `<div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-3 py-2.5 text-left {{recipe}} text-[var(--muted)]"> We&apos;ve received this listing`),
  anchor("components/SellerListingsRoom.tsx", "fw-functional-copy", "selected private state", `<div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-3 py-2.5 text-left {{recipe}} text-[var(--muted)]"> This is a private listing`),
  anchor("components/SellerListingsRoom.tsx", "fw-functional-copy", "selected rejected state", `<div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-3 py-2.5 text-left {{recipe}} text-[var(--muted)]"> This listing won&apos;t be going live`),
  anchor("components/SellerListingsRoom.tsx", "fw-functional-copy", "selected removed state", `<div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-3 py-2.5 text-left {{recipe}} text-[var(--muted)]"> You paused this listing`),
  anchor("components/SellerListingsRoom.tsx", "fw-functional-copy", "selected returned-to-draft state", `<div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-3 py-2.5 text-left {{recipe}} text-[var(--muted)]"> This listing was returned to your drafts`),
  anchor("components/SellerListingsRoom.tsx", "fw-functional-copy", "prior review decisions", `<div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-3 py-2.5 text-left {{recipe}} text-[var(--muted)]"> <span className="block text-[var(--muted)]">Earlier in this review</span>`),

  anchor("components/TradeDoorway.tsx", "fw-lifecycle-label", "last proposal state", `<p className="mt-1 {{recipe}} uppercase text-[var(--muted)]"> Your last proposal:`),
  anchor("components/TradeOffersModule.tsx", "fw-compact-control", "quiet offer controls", `const quietBtn = "{{recipe}} border border-[var(--border-mid)] px-3 py-1.5 uppercase text-[var(--slate)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--platinum)]";`),

  anchor("components/VaultMarketEvidence.tsx", "fw-transaction-fact", "price-basis fact", `<div className="{{recipe}} mt-[2px] text-[var(--muted)]"> {BASIS_LABELS[ev.priceBasis] ?? ev.priceBasis} </div>`),
  anchor("components/VaultMarketEvidence.tsx", "fw-functional-copy", "market-evidence disclosure", `<p className="{{recipe}} mt-2 text-[var(--muted)]"> One reviewed sale result attached to this exact reference.`),
  anchor("components/VaultMarketEvidence.tsx", "fw-transaction-fact", "sale provenance", `<p className="{{recipe}} mb-[6px] text-[var(--muted)]"> <b className="font-medium text-[var(--platinum-dim)]">Sale:</b>`),
  anchor("components/VaultMarketEvidence.tsx", "fw-transaction-fact", "sale-code provenance", `<p className="{{recipe}} mb-[6px] text-[var(--muted)]"> <b className="font-medium text-[var(--platinum-dim)]">Sale code:</b>`),
  anchor("components/VaultMarketEvidence.tsx", "fw-transaction-fact", "lot provenance", `<p className="{{recipe}} mb-[6px] text-[var(--muted)]"> <b className="font-medium text-[var(--platinum-dim)]">Lot:</b>`),
  anchor("components/VaultMarketEvidence.tsx", "fw-transaction-fact", "identity provenance", `<p className="{{recipe}} mb-[6px] text-[var(--muted)]"> <b className="font-medium text-[var(--platinum-dim)]"> Identity source: </b>`),
  anchor("components/VaultMarketEvidence.tsx", "fw-transaction-fact", "result provenance", `<p className="{{recipe}} text-[var(--muted)]"> <b className="font-medium text-[var(--platinum-dim)]"> Result source: </b>`),

  anchor("components/WantedRequestsModule.tsx", "fw-compact-control", "quiet wanted-request controls", `const quietBtn = "{{recipe}} border border-[var(--border-mid)] px-3 py-1.5 uppercase text-[var(--slate)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--platinum)]";`),
  anchor("components/WantedWorkspace.tsx", "fw-compact-control", "quiet wanted-workspace controls", `const quietBtn = "{{recipe}} border border-[var(--border-mid)] px-3 py-1.5 uppercase text-[var(--slate)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--platinum)]";`),
  anchor("components/WantedWorkspace.tsx", "fw-compact-control", "wanted-status tab", 'className={`{{recipe}} border px-3 py-1.5 uppercase transition-colors ${ tab === t.key'),
  anchor("components/WantedWorkspace.tsx", "fw-compact-control", "answer listing link", `className="{{recipe}} border border-[var(--border-mid)] px-3 py-1.5 uppercase text-[var(--slate)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--platinum)]" > {isPrivate ? "Open private listing" : "View listing"} →`),
];

assert.equal(ANCHORS.length, 79, "the explicit LS1-B4 ledger contains 79 unique anchors");
assert.deepEqual(
  Object.fromEntries(RECIPES.map((recipe) => [recipe, ANCHORS.filter((item) => item.recipe === recipe).length])),
  {
    "fw-functional-copy": 33,
    "fw-transaction-fact": 18,
    "fw-lifecycle-label": 8,
    "fw-validity-state": 2,
    "fw-compact-control": 17,
    "fw-work-count": 1,
  },
  "the 79 anchors preserve the adjudicated B4 semantic split"
);

function assertAnchorBinding(item, source = read(item.path)) {
  const expectedContext = normalize(item.context.replace("{{recipe}}", item.recipe));
  assert.equal(
    countExact(normalize(source), expectedContext),
    1,
    `${item.path}: ${item.label} binds ${item.recipe}`
  );
}

for (const item of ANCHORS) assertAnchorBinding(item);

/* Mutation check: the old whole-file counts accepted this balanced swap. The
   explicit anchors must reject both incorrect roles without touching disk. */
const browseQuickAddSource = read("components/BrowseQuickAdd.tsx");
const semanticallySwappedBrowseQuickAdd = browseQuickAddSource
  .replace("fw-work-count", "__LS1_B4_SWAP__")
  .replace("fw-transaction-fact", "fw-work-count")
  .replace("__LS1_B4_SWAP__", "fw-transaction-fact");
const browseQuickAddSemanticAnchors = ANCHORS.filter(
  (item) => item.path === "components/BrowseQuickAdd.tsx" &&
    (item.recipe === "fw-work-count" || item.recipe === "fw-transaction-fact")
);
assert.throws(
  () => browseQuickAddSemanticAnchors.forEach((item) => assertAnchorBinding(item, semanticallySwappedBrowseQuickAdd)),
  /facet (?:result count|remaining facet fact) binds fw-(?:work-count|transaction-fact)/,
  "the anchor ledger rejects a balanced BrowseQuickAdd semantic swap"
);

const EXPECTED_FILE_TOTALS = {
  "components/ImportedDraftsWorkspace.tsx": [4, 0, 1, 0, 0, 0],
  "components/ListFromPhoneHandoff.tsx": [0, 1, 0, 0, 0, 0],
  "components/MobileWizard.tsx": [13, 0, 0, 0, 1, 1],
  "components/PhotoPresentationEditor.tsx": [2, 0, 0, 0, 2, 0],
  "components/PhotoRedactionEditor.tsx": [1, 0, 0, 0, 0, 0],
  "components/PhotoUpload.tsx": [6, 0, 0, 0, 0, 0],
  "components/ReviewStep.tsx": [2, 0, 0, 0, 0, 0],
  "components/SavedListingDrafts.tsx": [0, 0, 3, 0, 0, 0],
  "components/SellerListingsRoom.tsx": [11, 1, 0, 0, 1, 1],
  "components/AccountDashboard.tsx": [5, 0, 0, 0, 0, 0],
  "components/InlinePurchaseRequest.tsx": [0, 0, 0, 1, 0, 0],
  "components/ListingCorrespondence.tsx": [4, 1, 0, 0, 1, 0],
  "components/ProposeTradeDialog.tsx": [0, 3, 0, 0, 2, 0],
  "components/PurchaseRequestForm.tsx": [2, 6, 0, 2, 0, 0],
  "components/SavedSearchesCard.tsx": [1, 0, 0, 0, 1, 0],
  "components/TradeDoorway.tsx": [0, 0, 1, 0, 0, 0],
  "components/TradeOffersModule.tsx": [0, 0, 8, 0, 1, 0],
  "components/WantedRequestsModule.tsx": [0, 0, 1, 7, 1, 0],
  "components/WantedWorkspace.tsx": [0, 0, 1, 8, 3, 0],
  "components/AccountRoomSelector.tsx": [0, 0, 0, 0, 1, 0],
  "components/AccountSettings.tsx": [8, 0, 1, 0, 0, 0],
  "components/BrowseClient.tsx": [0, 0, 0, 0, 1, 0],
  "components/BrowseQuickAdd.tsx": [0, 1, 0, 0, 2, 1],
  "components/BrowseSearch.tsx": [1, 2, 0, 0, 1, 0],
  "components/CatalogueRoomSelector.tsx": [0, 0, 0, 0, 1, 0],
  "components/DialReveal.tsx": [1, 0, 0, 0, 0, 0],
  "components/HomepageClient.tsx": [1, 1, 0, 0, 1, 0],
  "components/ListingGallery.tsx": [0, 0, 0, 0, 1, 0],
  "components/MobileCollectorsDrawer.tsx": [1, 0, 0, 0, 0, 0],
  "components/MobileNav.tsx": [0, 0, 1, 0, 1, 0],
  "components/NavBar.tsx": [0, 0, 1, 0, 0, 0],
  "components/NotificationsBell.tsx": [1, 1, 0, 0, 1, 1],
  "components/CurationReviewCard.tsx": [0, 1, 0, 0, 0, 0],
  "components/VaultMarketEvidence.tsx": [1, 6, 0, 0, 0, 1],
};

for (const [path, expectedValues] of Object.entries(EXPECTED_FILE_TOTALS)) {
  const expected = Object.fromEntries(RECIPES.map((recipe, index) => [recipe, expectedValues[index]]));
  assert.deepEqual(recipeCounts(path), expected, `${path} preserves its exact current governed recipe totals`);

  for (const value of staticStrings(path).filter((text) => RECIPES.some((recipe) => text.split(/\s+/).includes(recipe)))) {
    const tokens = value.split(/\s+/).filter(Boolean);
    assert.ok(
      !tokens.some((token) => /^(?:[^:]+:)*!?text-\[(?:7|8|8\.5|9|10|11|11\.5|12|12\.5|13|14|15)px\]$/.test(token)),
      `${path}: governed text has no local numeric-size override`
    );
    assert.ok(
      !tokens.some((token) => /^(?:[^:]+:)*!?font-(?:sans|display|thin|extralight|light|normal|medium|semibold|bold)$/.test(token)),
      `${path}: the semantic recipe owns face and weight`
    );
    assert.ok(!tokens.some((token) => /^(?:[^:]+:)*!?(?:italic|not-italic)$/.test(token)), `${path}: the recipe owns posture`);
    assert.ok(!tokens.some((token) => /^(?:[^:]+:)*!?tracking-/.test(token)), `${path}: the recipe owns tracking`);
    assert.ok(!tokens.some((token) => /^(?:[^:]+:)*!?leading-/.test(token)), `${path}: the recipe owns line height`);
  }
}

const REPAIR_FILES = Object.keys(EXPECTED_FILE_TOTALS);
const rawTenPx = REPAIR_FILES.flatMap((path) =>
  staticStrings(path).flatMap((value) => value.split(/\s+/).filter((token) => token === "text-[10px]"))
);
assert.equal(rawTenPx.length, 0, "all 79 unique LS1-B4 bindings leave the raw 10px bucket");

const listingGallery = read("components/ListingGallery.tsx");
assert.doesNotMatch(
  listingGallery,
  /className=\{`\$\{zoomBtn\}\s+fw-compact-control\b/,
  "ListingGallery Reset must not compose the 13px zoom button with fw-compact-control"
);

const PROTECTED_R15 = [
  "app/wanted/page.tsx",
  "components/MarketBar.tsx",
  "components/StoryPhotoPicker.tsx",
];
for (const path of PROTECTED_R15) {
  const protectedStrings = staticStrings(path).filter((value) => value.split(/\s+/).includes("text-[10px]"));
  assert.equal(protectedStrings.length, 1, `${path} preserves its one adjudicated R15 pass`);
  assert.ok(
    protectedStrings.every((value) => RECIPES.every((recipe) => !value.split(/\s+/).includes(recipe))),
    `${path} does not bind a governed functional recipe to its protected treatment`
  );
}

console.log("ls1-b4-semantic-10px: 79 bindings, 6 existing recipes and 3 protected R15 treatments PASS");
