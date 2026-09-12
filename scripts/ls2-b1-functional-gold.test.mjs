/* LS2-B1 — functional --gold-subtle warning and outcome split.

   Run: node scripts/ls2-b1-functional-gold.test.mjs

   This is the bounded current-HEAD implementation contract for the historical
   LS2 R01/R02 ordinary-user anchors. It intentionally does not recensus
   --gold-subtle. It pins only the adjudicated corrections, explicit stop
   items, and historical R06/R07 protection anchors. */
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
  const source = normalize(read(path));
  const expected = normalize(context);
  assert.equal(
    countExact(source, expected),
    expectedCount,
    `${path}: ${label} keeps its exact semantic color binding and visible meaning`
  );
}

const corrected = [
  [
    "components/BrandCombobox.tsx",
    "incomplete-brand required correction",
    `<p role="alert" className="mt-1 text-[11px] text-[var(--slate)]"> Choose a complete brand from the list, or type the full name of an unlisted brand. </p>`,
  ],
  [
    "components/ModelCombobox.tsx",
    "incomplete-model required correction",
    `<p role="alert" className="mt-1 text-[11px] text-[var(--slate)]"> Choose a complete model from the list, or type the full name of an unlisted model. </p>`,
  ],
  [
    "components/MobileWizard.tsx",
    "invalid asking-price correction",
    `<div className="text-[12px] leading-[1.5] italic text-[var(--slate)]"> {askingParse.message} </div>`,
  ],
  [
    "components/ReviewStep.tsx",
    "hard publication-block correction",
    `<p className="mt-1.5 text-[12px] leading-[1.6] text-[var(--danger)]"> Required correction: {g.correction} </p>`,
  ],
  [
    "components/SavedSearchesModule.tsx",
    "saved-search unwatched-price limitation",
    `<div className="mt-2 text-[11px] leading-[1.5] text-[var(--slate)]"> {unwatched} </div>`,
  ],
  [
    "components/SaveSearchControl.tsx",
    "saved and naming unwatched-price limitations",
    `<span className="w-full text-[11px] leading-[1.5] text-[var(--slate)]"> {unwatchedNote} </span>`,
    2,
  ],
  [
    "components/SellFlow.tsx",
    "review reference advisory",
    `<p className="mb-3 text-[11px] italic text-[var(--slate)]"> {refAdvisory.message} </p>`,
  ],
  [
    "components/SellFlow.tsx",
    "curation reference advisory",
    `<p className="mt-1 text-[11px] italic text-[var(--slate)]"> {advisory.message} </p>`,
  ],
  [
    "components/SellFlow.tsx",
    "desktop invalid asking-price correction",
    `<div className="text-[12px] leading-[1.5] italic text-[var(--slate)]"> {askingParse.message} </div>`,
  ],
  [
    "components/SellFlow.tsx",
    "hard admission stop",
    `className="mt-2 border-l-2 border-[var(--border-gold)] pl-3 text-[12px] leading-[1.6] text-[var(--danger)]" > {c.stop} </p>`,
  ],
  [
    "components/WantedWorkspace.tsx",
    "close-panel lifecycle reassurance",
    `<div className="mb-2 text-[11px] uppercase tracking-[2px] text-[var(--slate)]"> No longer looking? The request is kept, not deleted. </div>`,
  ],
  [
    "app/listings/[id]/page.tsx",
    "verified-possession fact on gold tint",
    `<div className="text-[11px] uppercase tracking-[1.6px] text-[var(--gold-on-tint)]"> In Hand Verified`,
  ],
  [
    "components/DealerAcceleratorRoom.tsx",
    "successful retry outcome only",
    '{note && ( <p className={`mt-2.5 border-t border-[var(--border-subtle)] pt-2.5 text-[12px] leading-[1.6] ${ note.ok ? "text-[var(--success)]" : "text-[var(--muted)]" }`} > {note.text} </p> )}',
  ],
  [
    "components/WantedRequestsModule.tsx",
    "listing-answer completion feedback",
    `{note && <p className="mb-4 text-[12px] italic text-[var(--platinum-dim)]">{note}</p>}`,
  ],
];

for (const [path, label, context, expectedCount] of corrected) {
  assertContext(path, label, context, expectedCount);
  const legacyGoldContext = context.replace(
    /text-\[var\(--(?:slate|platinum-dim|danger|success|gold-on-tint)\)\]/,
    "text-[var(--gold-subtle)]"
  );
  assert.notEqual(legacyGoldContext, context, `${path}: ${label} exposes one destination token`);
  assert.equal(
    countExact(normalize(read(path)), normalize(legacyGoldContext)),
    0,
    `${path}: ${label} has no surviving legacy gold-subtle binding`
  );
}

const wantedRequestsSource = normalize(read("components/WantedRequestsModule.tsx"));
assertContext(
  "components/WantedRequestsModule.tsx",
  "completion note originates only after the successful send branch",
  `if (!res.ok) { setError(data?.detail ?? "That answer could not be sent."); return; } onAnswered("Your listing has been sent as an answer."); } catch { setError("Network error — nothing was sent."); }`
);
assert.equal(
  countExact(wantedRequestsSource, "setNote("),
  1,
  "Wanted Requests note state has only the success callback as a writer"
);

assert.equal(
  corrected.reduce((sum, item) => sum + (item[3] ?? 1), 0),
  15,
  "the correction ledger contains exactly 15 styled anchors"
);

/* Ambiguous and LS4-adjacent emitters stay on their existing treatment. */
const stopped = [
  [
    "components/SellFlow.tsx",
    "ambiguous Rolex review stop",
    `className="mt-2 border-l-2 border-[var(--border-gold)] pl-3 text-[12px] leading-[1.6] text-[var(--gold-subtle)]" > {ROLEX_IDENTIFIER_STOP} {ROLEX_IDENTIFIER_STOP_DETAIL}`,
  ],
  [
    "components/TradeOffersModule.tsx",
    "mixed trade operation emitter",
    `{note && ( <p className="mt-4 text-[12px] italic text-[var(--gold-subtle)]">{note}</p> )}`,
  ],
  [
    "components/WantedWorkspace.tsx",
    "mixed wanted operation emitter",
    `{note && <p className="mb-4 text-[12px] italic text-[var(--gold-subtle)]">{note}</p>}`,
  ],
  [
    "components/AdminAuctionIngest.tsx",
    "admin mixed operation emitter",
    `{note && ( <p className="mt-3 text-[12px] italic text-[var(--gold-subtle)]">{note}</p> )}`,
  ],
];
for (const item of stopped) assertContext(...item);

/* Historical R06 declarations are decorative, editorial, redundant, or
   ornamental. Their source presence is pinned without widening into a census. */
const protectedR06 = [
  ["app/about/page.tsx", "story eyebrow", `text-[var(--gold-subtle)]"> The Story Behind the Platform`],
  ["app/about/page.tsx", "difference eyebrow", `text-[var(--gold-subtle)]"> What FairWatchTrade Does Differently`],
  ["app/admin/auctions/page.tsx", "admin market eyebrow", `text-[var(--gold-subtle)]"> Admin · Market`],
  ["app/error.tsx", "error-page framing eyebrow", `text-[var(--gold-subtle)]"> One moment`],
  ["app/login/page.tsx", "sign-in panel title", `text-[var(--gold-subtle)]"> Sign In`],
  ["app/not-found.tsx", "not-found framing eyebrow", `text-[var(--gold-subtle)]"> Page not found`],
  ["app/sell/(entry)/page.tsx", "sell-entry brand eyebrow", `text-[var(--gold-subtle)]"> FairWatchTrade`],
  ["app/signup/page.tsx", "compact and wide create-account panel titles", `text-[var(--gold-subtle)]"> Create Account`, 2],
  ["app/vault/galaxy/page.tsx", "vault-galaxy auth eyebrow", `text-[var(--gold-subtle)]"> The FairWatchTrade Vault`],
  ["app/vault/page.tsx", "vault auth eyebrow", `text-[var(--gold-subtle)]"> The FairWatchTrade Vault`],
  ["app/wanted/page.tsx", "wanted page eyebrow", `text-[var(--gold-subtle)]"> Wanted / Looking For`],
  ["components/AccountSettings.tsx", "account framing eyebrow", `text-[var(--gold-subtle)] md:block"> Account`],
  ["components/BrowseClient.tsx", "decorative add glyph", `text-[var(--gold-subtle)]">＋</span> Add to Catalogue`],
  ["components/ListFromPhoneHandoff.tsx", "phone-handoff title", `text-[var(--gold-subtle)]"> List from phone`],
  ["components/SellFlow.tsx", "sell-flow phone-handoff title", `text-[var(--gold-subtle)]"> List from phone`],
  ["components/VaultGalaxy.tsx", "vault title", `text-[var(--gold-subtle)]"> The FairWatchTrade Vault`],
  ["components/VaultGalaxy.tsx", "reference-card eyebrow", `text-[var(--gold-subtle)] max-sm:hidden"> Reference card`],
  ["components/VaultGalaxy.tsx", "manufacturer eyebrows in family and collection views", `text-[var(--gold-subtle)] max-sm:hidden"> Manufacturer`, 2],
];
for (const item of protectedR06) assertContext(...item);
assert.equal(
  protectedR06.reduce((sum, item) => sum + (item[3] ?? 1), 0),
  20,
  "all 20 historical R06 anchors remain protected"
);

/* Historical R07 source definitions remain dormant and unchanged. */
const dormantR07 = [
  ["components/HomepageClient.tsx", "staged homepage brand label", `text-[var(--gold-subtle)]"> {listing.brand}`],
  ["components/reassurance/ListingDeclined.tsx", "declined framing", `text-[var(--gold-subtle)]"> Listing review`],
  ["components/reassurance/ListingDeclined.tsx", "declined decorative numeral", `text-[var(--gold-subtle)]">{i + 1}.</span>`],
  ["components/reassurance/ListingSold.tsx", "sold framing", `text-[var(--gold-subtle)]"> This listing`],
  ["components/reassurance/ListingSold.tsx", "sold decorative glyph", `text-[var(--gold-subtle)]">♡</span>`],
  ["components/reassurance/NoSearchResults.tsx", "no-results framing", `text-[var(--gold-subtle)]"> No results`],
  ["components/reassurance/NoSearchResults.tsx", "no-results decorative glyph", `text-[var(--gold-subtle)]">◎</span>`],
  ["components/reassurance/SignInRequired.tsx", "sign-in-required framing", `text-[var(--gold-subtle)]"> Members only`],
  ["components/reassurance/SignInRequired.tsx", "sign-in-required decorative glyph", `text-[var(--gold-subtle)]">♡</span>`],
  ["app/globals.css", "dormant fw-eyebrow recipe", `.fw-eyebrow { font-family: 'Inter', sans-serif; font-size: 10px; letter-spacing: 2.6px; text-transform: uppercase; color: var(--gold-subtle); }`],
  ["app/globals.css", "dormant fw-crossing-word recipe", `.fw-crossing-word { font-size: 9px; letter-spacing: 6px; color: var(--gold-subtle); text-transform: uppercase; padding: 8px 0; }`],
];
for (const item of dormantR07) assertContext(...item);
assert.equal(dormantR07.length, 11, "all 11 historical R07 definitions remain source-present");
assertContext("app/page.tsx", "live homepage remains CurrentHomepage", `import CurrentHomepage from "@/components/CurrentHomepage";`);
assertContext("marketplace/page.tsx", "HomepageClient remains staged off the live homepage", `import HomepageClient, { type ListingRow } from "@/components/HomepageClient";`);

/* These bounded owner/ancestor anchors pin the actual rendered surfaces used
   by the measurement ledger below; they are not inferred from token names. */
const surfaceEvidence = [
  ["components/SellFlow.tsx", "SellFlow Curation and Review card surface", `className="border border-[var(--border-subtle)] bg-[var(--surface)] px-8 py-8" > {step === 0 && (`],
  ["components/SellFlow.tsx", "SellFlow price correction gold wash", `<div className="mt-3 flex flex-col gap-3 border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">`],
  ["components/MobileWizard.tsx", "mobile price correction gold wash", `<div className="mt-3 border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-3">`],
  ["components/MobileWizard.tsx", "mobile wizard base surface", `<main className="min-h-[100dvh] bg-[var(--ink)]">`],
  ["components/AccountDashboard.tsx", "account-room base surface", `<main className="min-h-screen bg-[var(--ink)] text-[var(--platinum)]">`],
  ["app/browse/page.tsx", "Browse save-search base surface", `<main className="min-h-screen bg-[var(--ink)] text-[var(--platinum)]">`],
  ["app/wanted/page.tsx", "Wanted close-panel base surface", `<div className="flex min-h-screen bg-[var(--ink)]">`],
  ["app/listings/[id]/page.tsx", "listing-detail base surface", `<main className="min-h-screen bg-[var(--ink)] pb-32 text-[var(--platinum)]">`],
  ["app/listings/[id]/page.tsx", "verified-possession gold wash", `<div className="mt-3 flex items-start gap-3 border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-3">`],
  ["components/DealerAcceleratorRoom.tsx", "retry-outcome raised row surface", `key={i.batchItemId} className="border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4"`],
];
for (const item of surfaceEvidence) assertContext(...item);

/* Pin the existing token arms used by this build. Any global palette change is
   outside B1 and must fail here rather than silently changing the measurement. */
const css = normalize(read("app/globals.css"));
for (const declaration of [
  `--ink: light-dark(#F3F0E8, #0D0F14);`,
  `--surface: light-dark(#FAF7F0, #13151C);`,
  `--surface-2: light-dark(#FFFDF8, #1A1D26);`,
  `--platinum-dim: light-dark(#3B382F, #CFCBC3);`,
  `--slate: light-dark(#57524A, #9CA1B0);`,
  `--gold-subtle: light-dark(rgba(122,95,32,0.72), rgba(201,168,76,0.45));`,
  `--gold-whisper: light-dark(rgba(176,138,46,0.13), rgba(201,168,76,0.08));`,
  `--gold-on-tint: light-dark(#745A1A, #C9A84C);`,
  `--danger: light-dark(#A03B33, #E07070);`,
  `--success: light-dark(#2E7D4F, #70C090);`,
]) {
  assert.ok(css.includes(declaration), `global token remains unchanged: ${declaration}`);
}

const hex = (value) => {
  const raw = value.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(raw.slice(offset, offset + 2), 16));
};
const rgba = (r, g, b, a) => ({ rgb: [r, g, b], a });
const blend = ({ rgb, a }, background) => rgb.map((channel, i) => channel * a + background[i] * (1 - a));
const linear = (channel) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = (rgb) => 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
const contrast = (foreground, background) => {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const palette = {
  light: {
    ink: hex("#F3F0E8"), surface: hex("#FAF7F0"), surface2: hex("#FFFDF8"),
    slate: hex("#57524A"), platinumDim: hex("#3B382F"), danger: hex("#A03B33"), success: hex("#2E7D4F"), goldOnTint: hex("#745A1A"),
    goldSubtle: rgba(122, 95, 32, 0.72), goldWhisper: rgba(176, 138, 46, 0.13),
  },
  dark: {
    ink: hex("#0D0F14"), surface: hex("#13151C"), surface2: hex("#1A1D26"),
    slate: hex("#9CA1B0"), platinumDim: hex("#CFCBC3"), danger: hex("#E07070"), success: hex("#70C090"), goldOnTint: hex("#C9A84C"),
    goldSubtle: rgba(201, 168, 76, 0.45), goldWhisper: rgba(201, 168, 76, 0.08),
  },
};

function assertImproves(label, backgroundFor, proposedFor, floor = 0) {
  for (const mode of ["light", "dark"]) {
    const colors = palette[mode];
    const background = backgroundFor(colors);
    const current = contrast(blend(colors.goldSubtle, background), background);
    const proposed = contrast(proposedFor(colors), background);
    assert.ok(proposed > current, `${label} measurably improves in ${mode}: ${proposed.toFixed(2)} > ${current.toFixed(2)}`);
    assert.ok(proposed >= floor, `${label} reaches its required ${floor}:1 floor in ${mode}`);
  }
}

const plain = (key) => (colors) => colors[key];
const washOver = (key) => (colors) => blend(colors.goldWhisper, colors[key]);
const surfaces = {
  ink: plain("ink"),
  surface: plain("surface"),
  surface2: plain("surface2"),
  goldWashOnInk: washOver("ink"),
  goldWashOnSurface: washOver("surface"),
};
const measurementLedger = [
  ["incomplete-brand required correction", "surface", "slate"],
  ["incomplete-model required correction", "surface", "slate"],
  ["invalid asking-price correction", "goldWashOnInk", "slate"],
  ["hard publication-block correction", "ink", "danger"],
  ["saved-search unwatched-price limitation", "ink", "slate"],
  ["saved and naming unwatched-price limitations", "ink", "slate"],
  ["review reference advisory", "surface", "slate"],
  ["curation reference advisory", "surface", "slate"],
  ["desktop invalid asking-price correction", "goldWashOnSurface", "slate"],
  ["hard admission stop", "surface", "danger"],
  ["close-panel lifecycle reassurance", "ink", "slate"],
  ["verified-possession fact on gold tint", "goldWashOnInk", "goldOnTint"],
  ["successful retry outcome only", "surface2", "success"],
  ["listing-answer completion feedback", "ink", "platinumDim"],
];
assert.deepEqual(
  measurementLedger.map(([label]) => label).sort(),
  corrected.map(([, label]) => label).sort(),
  "every corrected semantic anchor is tied to one actual-surface measurement"
);
for (const [label, surface, token] of measurementLedger) {
  assertImproves(label, surfaces[surface], plain(token), 4.5);
}

console.log(`LS2-B1 contract PASS: ${corrected.reduce((sum, item) => sum + (item[3] ?? 1), 0)} corrected anchors, ${protectedR06.reduce((sum, item) => sum + (item[3] ?? 1), 0)} R06 protected, ${dormantR07.length} R07 dormant.`);
