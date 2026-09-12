/* LS2 functional action, identity, and instruction color contract.

   Run: node scripts/ls2-functional-action-identity-instruction.test.mjs

   This is a bounded current-HEAD contract. It pins only the adjudicated
   ordinary-user corrections, exact leave-unchanged anchors, their source-
   declared surfaces, and the token values used by the contrast ledger. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
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

function assertContext(path, label, context, expectedCount = 1) {
  assert.equal(
    countExact(normalize(read(path)), normalize(context)),
    expectedCount,
    `${path}: ${label} keeps its exact semantic color binding and visible meaning`,
  );
}

const corrected = [
  {
    path: "components/BrowseClient.tsx",
    label: "Browse Refine heading",
    token: "slate",
    context: `<div className="mb-[6px] text-[11px] uppercase tracking-[1.4px] text-[var(--slate)]"> {dealerScope ? \`Refine \${dealerScope.businessName}\` : "Refine"} </div>`,
  },
  {
    path: "components/BrowseClient.tsx",
    label: "Browse Collector's Workbench heading",
    token: "slate",
    context: `<div className="mb-3 text-[11px] uppercase tracking-[1.6px] text-[var(--slate)]"> Collector&apos;s Workbench </div>`,
  },
  {
    path: "components/BrowseClient.tsx",
    label: "Browse Gallery brand identity",
    token: "slate",
    context: `<div className="mb-[5px] text-[11px] uppercase tracking-[1.6px] text-[var(--slate)]"> {row.brand} <FwtListingId code={row.public_code} /> </div>`,
  },
  {
    path: "components/BrowseClient.tsx",
    label: "Browse Collector-row brand identity",
    token: "slate",
    context: `<div className="mb-[3px] text-[11px] uppercase tracking-[1.6px] text-[var(--slate)]"> {row.brand} <FwtListingId code={row.public_code} /> </div>`,
  },
  {
    path: "components/BrowseClient.tsx",
    label: "Browse Collector Snapshot action",
    token: "muted",
    context: `className="mt-3 inline-flex items-center gap-1 text-[11px] uppercase tracking-[1.6px] text-[var(--muted)] transition hover:text-[var(--gold)]" > <span className={\`transition-transform \${isSnapshotOpen ? "rotate-180" : ""}\`}>▼</span> Collector Snapshot`,
  },
  {
    path: "components/BrowseClient.tsx",
    label: "Browse open Collector Snapshot identity",
    token: "slate",
    context: `<span className="text-[11px] uppercase tracking-[1.6px] text-[var(--slate)]"> Collector Snapshot · {row.model ?? row.brand} </span>`,
  },
  {
    path: "components/CommunicationsRoom.tsx",
    label: "Communications correspondence type",
    token: "comms-semantic",
    context: `<div className="text-[11px] uppercase tracking-[1.6px] text-[var(--comms-semantic)]"> {selected.kind === "request" ? "Purchase Request" : "Message"} </div>`,
  },
  {
    path: "components/CommunicationsRoom.tsx",
    label: "Communications Mark Unread action",
    token: "comms-semantic",
    context: `className="border border-[var(--border-faint)] px-2.5 py-1.5 text-[11px] uppercase tracking-[1.2px] text-[var(--comms-semantic)] transition hover:text-[var(--gold)] disabled:opacity-40" > Mark Unread`,
  },
  {
    path: "components/CommunicationsRoom.tsx",
    label: "Communications private-listing doorway",
    token: "muted",
    context: `href={\`/sell?privateThread=\${paneThread.id}\`} className="border border-[var(--border-gold)] px-2.5 py-1 text-[11px] uppercase tracking-[1.3px] text-[var(--muted)] transition hover:bg-[var(--gold-whisper)] hover:text-[var(--gold)]" > Create Private Listing for This Buyer`,
  },
  {
    path: "components/CommunicationsRoom.tsx",
    label: "Communications own-message author",
    token: "comms-semantic",
    context: `m.isMine ? "text-[var(--comms-semantic)]" : "text-[var(--slate)]"`,
  },
  {
    path: "components/NotificationsBell.tsx",
    label: "Notifications Mark all read action",
    token: "muted",
    context: `className="text-[11px] uppercase tracking-[2px] text-[var(--muted)] transition-colors hover:text-[var(--gold)]" > Mark all read`,
  },
  {
    path: "components/PurchaseRequestForm.tsx",
    label: "Purchase Request return action",
    token: "muted",
    context: `href={backToListing} className="text-[11px] tracking-[0.3px] text-[var(--muted)] transition hover:text-[var(--gold)]" > ← Return to listing`,
  },
  {
    path: "components/SaveSearchControl.tsx",
    label: "saved-search user-authored name",
    token: "platinum-dim",
    context: `<span className="fw-functional-copy text-[var(--platinum-dim)]"> &ldquo;{savedName}&rdquo; </span>`,
  },
  {
    path: "components/ListingCorrespondence.tsx",
    label: "Listing Correspondence heading",
    token: "slate",
    context: `<div className="border-t border-[var(--border-faint)] pt-6 text-[11px] uppercase tracking-[1.4px] text-[var(--slate)]"> Correspondence </div>`,
  },
  {
    path: "components/ListingCorrespondence.tsx",
    label: "Listing Correspondence own-message author",
    token: "slate",
    context: `m.isMine ? "text-[var(--slate)]" : "text-[var(--slate)]"`,
  },
  {
    path: "components/SearchEmptyState.tsx",
    label: "SearchEmpty related-result brand",
    token: "slate",
    context: `<span className="mr-2 text-[11px] uppercase tracking-[1.4px] text-[var(--slate)]"> {r.brand} </span>`,
  },
  {
    path: "components/VaultGalaxy.tsx",
    label: "Vault selected parent-brand identity",
    token: "slate",
    context: `<div className="fw-compact-control mb-[10px] uppercase text-[var(--slate)]"> {selectedBrand?.name} </div>`,
  },
  {
    path: "components/VaultGalaxy.tsx",
    label: "Vault search instruction",
    token: "slate",
    context: `<label className="mb-[10px] block text-[11px] uppercase tracking-[3px] text-[var(--slate)]"> What interests you today? </label>`,
  },
  {
    path: "components/MobileWizard.tsx",
    label: "Mobile Wizard recommended-currency guidance",
    token: "slate",
    context: `<div className="mt-2 flex items-center gap-2 fw-functional-copy text-[var(--slate)]"> <span className="fw-work-count border border-[var(--border-gold)] px-1.5 py-0.5 uppercase"> Recommended </span> <span>USD is suggested because no preference is set.</span> </div>`,
  },
  {
    path: "components/ProposeTradeDialog.tsx",
    label: "Propose Trade workflow heading",
    token: "slate",
    context: `<div className="text-[11px] uppercase tracking-[3px] text-[var(--slate)]"> Propose a trade </div>`,
  },
  {
    path: "components/SellFlow.tsx",
    label: "SellFlow recommended-currency guidance",
    token: "slate",
    context: `<div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--slate)]"> <span className="border border-[var(--border-gold)] px-1.5 py-0.5 text-[11px] uppercase tracking-[1.2px]"> Recommended </span> <span>No preference is set. USD is suggested, not silently saved.</span> </div>`,
  },
  {
    path: "components/SellFlow.tsx",
    label: "SellFlow no-papers alternate-path instruction",
    token: "slate",
    context: `<p className="mt-2 border-l-2 border-[var(--border-gold)] pl-3 text-[12px] leading-[1.6] text-[var(--slate)]"> No original papers — this reference is authorized for the identity-evidence path below instead. </p>`,
  },
  {
    path: "components/WantedRequestsModule.tsx",
    label: "Wanted existing-listing answer-path heading",
    token: "slate",
    context: `<div className="mb-2 text-[11px] uppercase tracking-[2px] text-[var(--slate)]"> Use an existing listing </div>`,
  },
  {
    path: "components/WantedRequestsModule.tsx",
    label: "Wanted new-listing answer-path heading",
    token: "slate",
    context: `<div className="mb-1 text-[11px] uppercase tracking-[2px] text-[var(--slate)]"> Create a new listing </div>`,
  },
  {
    path: "components/WantedRequestsModule.tsx",
    label: "Wanted private-listing answer-path heading",
    token: "slate",
    context: `<div className="mb-1 text-[11px] uppercase tracking-[2px] text-[var(--slate)]"> Create a private listing for this collector </div>`,
  },
  {
    path: "components/WantedWorkspace.tsx",
    label: "Wanted composer identity heading",
    token: "slate",
    context: `<div className="mb-4 text-[11px] uppercase tracking-[3px] text-[var(--slate)]"> {editingId ? "Edit request" : "Identity first"} </div>`,
  },
  {
    path: "components/WantedWorkspace.tsx",
    label: "Wanted criteria heading",
    token: "slate",
    context: `<div className="mt-6 mb-3 text-[11px] uppercase tracking-[3px] text-[var(--slate)]"> What matters </div>`,
  },
  {
    path: "components/WantedWorkspace.tsx",
    label: "Wanted seller-answer composer heading",
    token: "slate",
    context: `<div className="mt-6 mb-3 text-[11px] uppercase tracking-[3px] text-[var(--slate)]"> How sellers may answer </div>`,
  },
];

for (const { path, label, token, context } of corrected) {
  assertContext(path, label, context);
  const legacyContext = context.replace(`text-[var(--${token})]`, "text-[var(--gold-subtle)]");
  assert.notEqual(legacyContext, context, `${path}: ${label} exposes its destination token`);
  assert.equal(
    countExact(normalize(read(path)), normalize(legacyContext)),
    0,
    `${path}: ${label} has no surviving legacy gold-subtle binding`,
  );
}
assert.equal(corrected.length, 28, "the correction ledger contains exactly 28 styled anchors");

const protectedAnchors = [
  [
    "components/NavBar.tsx",
    "account-menu decorative open-state chevron inheritance",
    `accountOpen ? "text-[var(--gold-subtle)]" : "text-[var(--muted)] hover:text-[var(--gold)]"`,
  ],
  [
    "components/SellFlow.tsx",
    "completed-step decorative Roman numeral",
    `i === step ? "text-[var(--gold)]" : i < step ? "text-[var(--gold-subtle)]" : "text-[var(--muted)]"`,
  ],
];
for (const item of protectedAnchors) assertContext(...item);
assert.equal(protectedAnchors.length, 2, "both exact protected anchors remain unchanged");

const outOfSurfaceAnchors = [
  ["app/admin/auctions/results/[saleId]/page.tsx", "admin auction-house identity", `text-[var(--gold-subtle)]"> {sale.house.name}`],
  ["app/admin/dealer-accelerator/page.tsx", "admin dealer identity", `text-[var(--gold-subtle)]"> {dealer}`],
  ["app/internal/collector-dossiers/breguet-5967bb-11-9w6/page.tsx", "internal dossier identity", `text-[var(--gold-subtle)]"> Internal · Collector Dossier`],
  ["components/DealerAcceleratorRoom.tsx", "dealer onboarding step headings", `<div className="text-[12px] font-semibold text-[var(--gold-subtle)]">{t}</div>`],
  ["components/DealerAcceleratorRoom.tsx", "dealer discovery-document path", `text-[var(--gold-subtle)]"> /.well-known/fairwatchtrade-inventory.json`],
  ["components/DealerAcceleratorRoom.tsx", "dealer source-item identity", `<p className="font-mono text-[12px] text-[var(--gold-subtle)]">{i.sourceItemKey}</p>`],
  ["components/AccountSettings.tsx", "dealer-room identity", `text-[var(--gold-subtle)]"> Dealer Room identity`],
  ["components/AdminAuctionIngest.tsx", "admin auction draft instruction", `<div className="mb-4 text-[11px] uppercase tracking-[3px] text-[var(--gold-subtle)]"> {editing`],
  ["components/AdminAuctionResultsIngest.tsx", "admin sale-selection instruction", `text-[var(--gold-subtle)]"> Choose the registered sale you are bringing in`],
  ["components/AdminAuctionResultsIngest.tsx", "admin recent-runs heading", `text-[var(--gold-subtle)]">Current &amp; recent runs</div>`],
];
for (const item of outOfSurfaceAnchors) assertContext(...item);
assert.equal(outOfSurfaceAnchors.length, 10, "all ten exact out-of-surface anchors remain unchanged");

const css = normalize(read("app/globals.css"));
for (const declaration of [
  `--ink: light-dark(#F3F0E8, #0D0F14);`,
  `--ink-deep: light-dark(#ECE7DD, #07080C);`,
  `--surface: light-dark(#FAF7F0, #13151C);`,
  `--surface-2: light-dark(#FFFDF8, #1A1D26);`,
  `--card-surface: light-dark(#FAF7F0, transparent);`,
  `--hover-wash: light-dark(rgba(37,35,31,0.04), rgba(255,255,255,0.03));`,
  `--platinum-dim: light-dark(#3B382F, #CFCBC3);`,
  `--platinum-dim: light-dark(#34312A, #D8D4CC);`,
  `--slate: light-dark(#57524A, #9CA1B0);`,
  `--muted: light-dark(#6B655B, #818799);`,
  `--gold-subtle: light-dark(rgba(122,95,32,0.72), rgba(201,168,76,0.45));`,
]) {
  assert.ok(css.includes(declaration), `global token definition remains unchanged: ${declaration}`);
}
assertContext(
  "components/CommunicationsRoom.tsx",
  "Communications local semantic token",
  `--comms-semantic: #656058;`,
);

const surfaceEvidence = [
  ["components/BrowseClient.tsx", "Gallery card surface and hover", `bg-[var(--card-surface)] p-3 transition hover:bg-[var(--hover-wash)]`],
  ["components/BrowseClient.tsx", "open Snapshot surface", `border border-[var(--panel-line)] bg-[var(--ink-deep)] p-5`],
  ["components/SearchEmptyState.tsx", "related-results surface", `border border-[var(--border-subtle)] bg-[var(--surface)]`],
  ["components/SearchEmptyState.tsx", "related-result hover surface", `transition hover:bg-[var(--hover-wash)]`],
  ["components/NotificationsBell.tsx", "notification panel surface", `border border-[var(--border-subtle)] bg-[var(--surface)]`],
  ["components/CommunicationsRoom.tsx", "reader-head surface", `bg-[var(--comms-reader-head)] px-4 py-3`],
  ["components/CommunicationsRoom.tsx", "reader-body surface", `bg-[var(--comms-reader-body)]`],
  ["components/SellFlow.tsx", "SellFlow editor card surface", `border border-[var(--border-subtle)] bg-[var(--surface)] px-8 py-8`],
  ["components/VaultGalaxy.tsx", "Vault forced dark subtree", `data-immersive-dark=""`],
  ["components/VaultGalaxy.tsx", "Vault canvas range", `radial-gradient(circle at 50% 45%, #141824 0%, #090A10 45%, #03040A 100%)`],
  ["components/VaultGalaxy.tsx", "Vault plaque surface", `bg-[rgba(12,17,30,0.55)]`],
  ["components/VaultGalaxy.tsx", "Vault search surface", `w-[min(710px,calc(100%-32px))] border border-[var(--border-gold)] bg-[rgba(7,8,12,0.72)]`],
];
for (const item of surfaceEvidence) assertContext(...item);

const rgb = (r, g, b) => [r, g, b];
const rgba = (r, g, b, a) => ({ rgb: [r, g, b], a });
const blend = ({ rgb: foreground, a }, background) => foreground.map(
  (channel, index) => channel * a + background[index] * (1 - a),
);
const linear = (channel) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = (color) => 0.2126 * linear(color[0]) + 0.7152 * linear(color[1]) + 0.0722 * linear(color[2]);
const contrast = (foreground, background) => {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const palette = {
  light: {
    ink: rgb(243, 240, 232),
    inkDeep: rgb(236, 231, 221),
    surface: rgb(250, 247, 240),
    surface2: rgb(255, 253, 248),
    cardSurface: rgb(250, 247, 240),
    hoverWash: rgba(37, 35, 31, 0.04),
    slate: rgb(87, 82, 74),
    muted: rgb(107, 101, 91),
    platinumDim: rgb(59, 56, 47),
    goldSubtle: rgba(122, 95, 32, 0.72),
  },
  dark: {
    ink: rgb(13, 15, 20),
    inkDeep: rgb(7, 8, 12),
    surface: rgb(19, 21, 28),
    surface2: rgb(26, 29, 38),
    cardSurface: rgb(13, 15, 20),
    hoverWash: rgba(255, 255, 255, 0.03),
    slate: rgb(156, 161, 176),
    muted: rgb(129, 135, 153),
    platinumDim: rgb(207, 203, 195),
    goldSubtle: rgba(201, 168, 76, 0.45),
  },
};
const fixed = {
  commsSemantic: rgb(101, 96, 88),
  commsReaderHead: rgb(236, 236, 234),
  commsReaderBody: rgb(242, 241, 238),
  vaultPlaque: rgba(12, 17, 30, 0.55),
  vaultSearch: rgba(7, 8, 12, 0.72),
  vaultEndpoints: [rgb(20, 24, 36), rgb(9, 10, 16), rgb(3, 4, 10)],
};

const plain = (key) => (colors) => [colors[key]];
const hoverOver = (key) => (colors) => [colors[key], blend(colors.hoverWash, colors[key])];
const gallerySurfaces = (colors) => [colors.cardSurface, blend(colors.hoverWash, colors.ink)];
const commsHead = () => [fixed.commsReaderHead];
const commsBodyHover = (colors) => [blend(colors.hoverWash, fixed.commsReaderBody)];
const vaultPlaqueSurfaces = () => fixed.vaultEndpoints.map((endpoint) => blend(fixed.vaultPlaque, endpoint));
const vaultSearchSurfaces = () => fixed.vaultEndpoints.map((endpoint) => blend(fixed.vaultSearch, endpoint));

const measurementLedger = [
  ["Browse Refine heading", plain("ink"), "slate"],
  ["Browse Collector's Workbench heading", plain("ink"), "slate"],
  ["Browse Gallery brand identity", gallerySurfaces, "slate"],
  ["Browse Collector-row brand identity", plain("ink"), "slate"],
  ["Browse Collector Snapshot action", plain("ink"), "muted"],
  ["Browse open Collector Snapshot identity", plain("inkDeep"), "slate"],
  ["Communications correspondence type", commsHead, "commsSemantic"],
  ["Communications Mark Unread action", commsHead, "commsSemantic"],
  ["Communications private-listing doorway", plain("surface2"), "muted"],
  ["Communications own-message author", commsBodyHover, "commsSemantic"],
  ["Notifications Mark all read action", plain("surface"), "muted"],
  ["Purchase Request return action", plain("ink"), "muted"],
  ["saved-search user-authored name", plain("ink"), "platinumDim"],
  ["Listing Correspondence heading", plain("ink"), "slate"],
  ["Listing Correspondence own-message author", plain("ink"), "slate"],
  ["SearchEmpty related-result brand", hoverOver("surface"), "slate"],
  ["Vault selected parent-brand identity", vaultPlaqueSurfaces, "slate", ["dark"]],
  ["Vault search instruction", vaultSearchSurfaces, "slate", ["dark"]],
  ["Mobile Wizard recommended-currency guidance", plain("ink"), "slate"],
  ["Propose Trade workflow heading", plain("ink"), "slate"],
  ["SellFlow recommended-currency guidance", plain("surface"), "slate"],
  ["SellFlow no-papers alternate-path instruction", plain("surface"), "slate"],
  ["Wanted existing-listing answer-path heading", plain("ink"), "slate"],
  ["Wanted new-listing answer-path heading", plain("ink"), "slate"],
  ["Wanted private-listing answer-path heading", plain("ink"), "slate"],
  ["Wanted composer identity heading", plain("ink"), "slate"],
  ["Wanted criteria heading", plain("ink"), "slate"],
  ["Wanted seller-answer composer heading", plain("ink"), "slate"],
];

assert.deepEqual(
  measurementLedger.map(([label]) => label).sort(),
  corrected.map(({ label }) => label).sort(),
  "the actual-surface contrast ledger label multiset equals the corrected-anchor label multiset",
);

for (const [label, backgroundsFor, token, modes = ["light", "dark"]] of measurementLedger) {
  for (const mode of modes) {
    const colors = palette[mode];
    const proposed = token === "commsSemantic" ? fixed.commsSemantic : colors[token];
    for (const [stateIndex, background] of backgroundsFor(colors).entries()) {
      const currentRatio = contrast(blend(colors.goldSubtle, background), background);
      const proposedRatio = contrast(proposed, background);
      assert.ok(
        proposedRatio > currentRatio,
        `${label} state ${stateIndex + 1} strictly improves in ${mode}: ${proposedRatio.toFixed(3)} > ${currentRatio.toFixed(3)}`,
      );
      assert.ok(
        proposedRatio >= 4.5,
        `${label} state ${stateIndex + 1} clears 4.5:1 in ${mode}: ${proposedRatio.toFixed(3)}`,
      );
    }
  }
}

console.log("LS2 functional action/identity/instruction contract PASS: 28 corrected, 2 protected, 10 out-of-surface anchors.");
