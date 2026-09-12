/* LS-2 compounded dimming + enabled-control readability contract.

   Run: node scripts/ls2-compounded-dimming-controls.test.mjs

   This contract is deliberately bounded to the historical ten definite
   ordinary-user anchors, six conditional anchors, and the Vault Marketplace
   exit named by the authorized order. It protects the adjudicated no-change
   states as strongly as it protects the corrections. */
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
    `${path}: ${label}`,
  );
}

const corrected = [
  [
    "app/listings/[id]/page.tsx",
    "CD-01 photo-less narrow Back to Browse strengthens at hover without opacity dimming",
    `"text-[var(--platinum-dim)] transition hover:text-[var(--platinum)]",`,
  ],
  [
    "components/CatalogueClient.tsx",
    "CD-02 prior-request timestamp keeps the inherited readable muted floor",
    `{when && <span className="shrink-0">{when}</span>}`,
  ],
  [
    "components/CatalogueClient.tsx",
    "CD-03 Previous requests heading keeps the readable muted floor",
    `<div className="mb-1 text-[11px] uppercase tracking-[1.4px] text-[var(--muted)]"> Previous requests </div>`,
  ],
  [
    "components/CatalogueClient.tsx",
    "CD-04 null-listing wrapper does not dim live actions or required facts",
    `<div className="block cursor-default"> {inner} </div>`,
  ],
  [
    "components/SavedSearchesCard.tsx",
    "CD-05 enabled Remove is readable while its real busy state remains dimmed",
    `className="fw-compact-control shrink-0 uppercase text-[var(--muted)] transition hover:text-[var(--danger)] disabled:cursor-wait disabled:opacity-60"`,
  ],
  [
    "components/SellerProfile.tsx",
    "CD-06 functional Correspondence heading uses the readable secondary tier",
    `<div className="mb-2 text-[11px] uppercase tracking-[2px] text-[var(--slate)]"> Correspondence </div>`,
  ],
  [
    "components/SellFlow.tsx",
    "CD-07 reachable completed-step control no longer weakens on hover",
    `className="flex cursor-pointer flex-col items-center bg-transparent transition focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-[var(--gold)]"`,
  ],
  [
    "components/VaultGalaxy.tsx",
    "Vault Marketplace exit is readable before hover on the pinned-dark surface",
    `className="text-[11px] uppercase tracking-[2px] text-[var(--muted)] transition-colors hover:text-[var(--slate)]"`,
  ],
  [
    "components/VaultGalaxy.tsx",
    "CD-09 Atlantis Enter uses solid governed gold",
    `<div className="py-2 text-[11px] uppercase tracking-[6px] text-[var(--gold)]"> Enter </div>`,
  ],
  [
    "components/SellFlow.tsx",
    "CD-10 curation failure reasoning is readable on its danger wash",
    `{draft.curationReasoning && <div className="text-[var(--danger)]">{draft.curationReasoning}</div>}`,
  ],
];
for (const item of corrected) assertContext(...item);
assert.equal(corrected.length, 10, "the correction ledger stays at ten exact ordinary-user anchors");

const fixtureBound = [
  [
    "components/BrowseClient.tsx",
    "Gallery/Scan in-hand-verified shield remains fixture-bound over real photography",
    `className="absolute left-1.5 top-1.5 text-[var(--gold)] opacity-70"`,
  ],
  [
    "components/BrowseClient.tsx",
    "Collector-row in-hand-verified shield remains fixture-bound",
    `className="shrink-0 text-[var(--gold)] opacity-70"`,
  ],
  [
    "components/BrowseClient.tsx",
    "Quick Specs two-branch control remains mounted-proof bound",
    `: "text-[var(--platinum)] opacity-65"`,
  ],
  [
    "components/BrowseCardInspector.tsx",
    "inactive photo-position controls remain mounted-image proof bound",
    `: "bg-[var(--slate)] opacity-45 hover:opacity-80"`,
  ],
];
for (const item of fixtureBound) assertContext(...item);
assert.equal(fixtureBound.length, 4, "four exact ordinary-user conditional anchors remain fixture-bound");

const outOfSurface = [
  [
    "components/VaultClusterReview.tsx",
    "CD-08 admin reviewed-row dimming is outside the ordinary-user surface",
    `className={\`py-5 \${isReviewed ? "opacity-55" : ""}\`}`,
  ],
  [
    "components/MarketplaceControl.tsx",
    "admin operational-ledger loading wrapper remains unchanged",
    `<div className={loading ? "opacity-60 transition-opacity" : ""}>`,
  ],
  [
    "components/MarketplaceControl.tsx",
    "admin detailed-table loading wrapper remains unchanged",
    `className={\`\${detailOverflow ? "fw-scroll-none " : ""}overflow-x-auto \${loading ? "opacity-60" : ""}\`}`,
  ],
];
for (const item of outOfSurface) assertContext(...item);
assert.equal(outOfSurface.length, 3, "three exact admin/founder anchors stay out of surface");
assert.equal(
  fixtureBound.length + 2,
  6,
  "all six historical conditional anchors are accounted for by four fixture debts and two admin exclusions",
);

const protectedAnchors = [
  [
    "components/CatalogueClient.tsx",
    "decorative prior-request separator keeps its quiet opacity",
    `<span className="mx-1.5 opacity-40">•</span>`,
  ],
  [
    "components/SellerProfile.tsx",
    "editorial seller-profile maxim stays untouched",
    `<div className="text-[11px] uppercase tracking-[2px] text-[var(--gold)] opacity-70"> Private correspondence, public standards. </div>`,
  ],
  [
    "components/SellerProfile.tsx",
    "truly unavailable Contact via listing stays disabled-looking",
    `<span className="fw-btn-secondary inline-block opacity-40">Contact via listing</span>`,
  ],
  [
    "components/SellFlow.tsx",
    "adjudicated decorative completed-step Roman numeral stays gold-subtle",
    `: i < step ? "text-[var(--gold-subtle)]" : "text-[var(--muted)]"`,
  ],
  [
    "components/VaultGalaxy.tsx",
    "Atlantis reveal parent keeps its animation opacity",
    `opacity: atlantisRevealing ? 0 : 1,`,
  ],
  [
    "components/SellFlow.tsx",
    "eligibility CTA keeps valid enabled-hover and true-disabled opacity",
    `hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40`,
  ],
];
for (const item of protectedAnchors) assertContext(...item);
assert.equal(protectedAnchors.length, 6, "six exact sibling protections stay intact");

assertContext(
  "components/VaultGalaxy.tsx",
  "Vault is pinned to the Dark appearance contract",
  `data-immersive-dark=""`,
);
assertContext(
  "components/VaultGalaxy.tsx",
  "Vault canvas keeps the measured radial surface",
  `"radial-gradient(circle at 50% 45%, #141824 0%, #090A10 45%, #03040A 100%)"`,
);
assertContext(
  "components/VaultGalaxy.tsx",
  "Atlantis resting veil keeps its measured alpha",
  `: "rgba(13,15,20,0.997)";`,
);

const css = normalize(read("app/globals.css"));
for (const declaration of [
  `--ink: light-dark(#F3F0E8, #0D0F14);`,
  `--surface: light-dark(#FAF7F0, #13151C);`,
  `--platinum: light-dark(#25231F, #E8E4DC);`,
  `--platinum-dim: light-dark(#3B382F, #CFCBC3);`,
  `--slate: light-dark(#57524A, #9CA1B0);`,
  `--muted: light-dark(#6B655B, #818799);`,
  `--gold-subtle: light-dark(rgba(122,95,32,0.72), rgba(201,168,76,0.45));`,
  `--gold: light-dark(#8D6B1F, #C9A84C);`,
  `--danger: light-dark(#A03B33, #E07070);`,
]) {
  assert.ok(css.includes(declaration), `global token definition remains unchanged: ${declaration}`);
}
assert.doesNotMatch(css, /\*\s*\{[^}]*opacity\s*:\s*1\s*!important/i, "no global opacity reset is introduced");
assert.doesNotMatch(css, /\[class[^\]]*opacity[^\]]*\][^{]*\{[^}]*opacity\s*:\s*1/i, "no utility-wide opacity reset is introduced");

const rgb = (r, g, b) => [r, g, b];
const rgba = (r, g, b, a) => ({ rgb: [r, g, b], a });
const blend = (foreground, background, alpha) => foreground.map(
  (channel, index) => channel * alpha + background[index] * (1 - alpha),
);
const composite = ({ rgb: foreground, a }, background) => blend(foreground, background, a);
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
    surface: rgb(250, 247, 240),
    platinum: rgb(37, 35, 31),
    platinumDim: rgb(59, 56, 47),
    slate: rgb(87, 82, 74),
    muted: rgb(107, 101, 91),
    gold: rgb(141, 107, 31),
    danger: rgb(160, 59, 51),
  },
  dark: {
    ink: rgb(13, 15, 20),
    surface: rgb(19, 21, 28),
    platinum: rgb(232, 228, 220),
    platinumDim: rgb(207, 203, 195),
    slate: rgb(156, 161, 176),
    muted: rgb(129, 135, 153),
    gold: rgb(201, 168, 76),
    danger: rgb(224, 112, 112),
  },
};
const vaultCanvasEndpoints = [rgb(20, 24, 36), rgb(9, 10, 16), rgb(3, 4, 10)];
const vaultRestingSurfaces = vaultCanvasEndpoints.map((background) =>
  composite(rgba(13, 15, 20, 0.997), background),
);

const measurements = [
  {
    label: "CD-01 photo-less Back to Browse",
    modes: ["light", "dark"],
    pairs: (c) => [
      ["rest", c.gold, c.platinumDim, c.ink],
      ["hover", blend(c.gold, c.ink, 0.8), c.platinum, c.ink],
    ],
  },
  ...[
    "CD-02 prior-request timestamp",
    "CD-03 Previous requests heading",
  ].map((label) => ({
    label,
    modes: ["light", "dark"],
    pairs: (c) => [["rest", blend(c.muted, c.ink, 0.7), c.muted, c.ink]],
  })),
  {
    label: "CD-04 null-listing shared wrapper",
    modes: ["light", "dark"],
    pairs: (c) => [
      ["required facts", blend(c.muted, c.ink, 0.7), c.muted, c.ink],
      ["enabled Remove", blend(c.platinumDim, c.ink, 0.7), c.platinumDim, c.ink],
    ],
  },
  {
    label: "CD-05 saved-search Remove",
    modes: ["light", "dark"],
    pairs: (c) => [["enabled rest", blend(c.muted, c.surface, 0.6), c.muted, c.surface]],
  },
  {
    label: "CD-06 seller Correspondence heading",
    modes: ["light", "dark"],
    pairs: (c) => [["rest", blend(c.gold, c.ink, 0.7), c.slate, c.ink]],
  },
  {
    label: "CD-07 completed-step navigation",
    modes: ["light", "dark"],
    pairs: (c) => [["hover label", blend(c.muted, c.ink, 0.8), c.muted, c.ink]],
  },
  {
    label: "Vault Marketplace exit",
    modes: ["dark"],
    pairs: (c) => vaultRestingSurfaces.map((background, index) =>
      [`rest endpoint ${index + 1}`, rgb(74, 79, 92), c.muted, background],
    ),
  },
  {
    label: "CD-09 Atlantis Enter",
    modes: ["dark"],
    pairs: (c) => vaultRestingSurfaces.map((background, index) => [
      `rest endpoint ${index + 1}`,
      composite(rgba(201, 168, 76, 0.55), background),
      c.gold,
      background,
    ]),
  },
  {
    label: "CD-10 curation failure reasoning",
    modes: ["light", "dark"],
    pairs: (c) => {
      const wash = composite(rgba(220, 80, 80, 0.06), c.surface);
      return [["failure", blend(c.danger, wash, 0.8), c.danger, wash]];
    },
  },
];

assert.equal(measurements.length, corrected.length, "every corrected anchor has actual-surface measurements");
const anchorKey = (label) => label.startsWith("Vault Marketplace")
  ? "Vault Marketplace"
  : label.match(/^CD-\d+/)?.[0];
assert.deepEqual(
  measurements.map(({ label }) => anchorKey(label)).sort(),
  corrected.map(([, label]) => anchorKey(label)).sort(),
  "the measurement ledger maps one-to-one to the exact corrected-anchor ledger",
);
for (const { label, modes, pairs } of measurements) {
  for (const mode of modes) {
    const colors = palette[mode];
    for (const [state, current, proposed, background] of pairs(colors)) {
      const before = contrast(current, background);
      const after = contrast(proposed, background);
      assert.ok(after > before, `${label} ${mode} ${state} improves: ${after.toFixed(3)} > ${before.toFixed(3)}`);
      assert.ok(after >= 4.5, `${label} ${mode} ${state} clears 4.5:1: ${after.toFixed(3)}`);
    }
  }
}

console.log(
  "LS-2 compounded-dimming contract PASS: 10 corrected, 4 fixture-bound, 2 conditional admin exclusions, 1 definite admin exclusion.",
);
