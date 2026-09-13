/* LS-2 Trade + Wanted state-color semantics contract.

   Run: node --experimental-strip-types scripts/ls2-trade-wanted-state-semantics.test.mjs

   The behavioral half executes the bounded domain owner. The integration
   half proves that the live ordinary-user emitters and the private fixture
   gallery consume that owner, so a perfect map cannot sit unused beside a
   still-collapsed product. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEAL_STATE_PRESENTATION,
  LEG_STATE_PRESENTATION,
  TRADE_CASH_PRESENTATION,
  TRADE_OFFER_STATE_PRESENTATION,
  WANTED_BUDGET_FIT_PRESENTATION,
  WANTED_STATE_PRESENTATION,
  tradeStatePresentation,
  wantedStatePresentation,
} from "../lib/tradeWantedStatePresentation.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const normalized = (path) => read(path).replace(/\s+/g, " ").trim();
const countExact = (source, needle) => source.split(needle).length - 1;

/* The exact vocabulary is hand-derived from current Trade/Wanted product
   truth. A new state cannot silently inherit a color by string matching. */
assert.deepEqual(Object.keys(TRADE_OFFER_STATE_PRESENTATION), [
  "pending",
  "accepted",
  "declined",
  "superseded",
  "withdrawn",
]);
assert.deepEqual(Object.keys(DEAL_STATE_PRESENTATION), [
  "pending",
  "settling",
  "completed",
  "cancelled",
]);
assert.deepEqual(Object.keys(LEG_STATE_PRESENTATION), [
  "bound",
  "in_transit",
  "delivered",
  "verified",
  "transferred",
  "cancelled",
]);
assert.deepEqual(Object.keys(WANTED_STATE_PRESENTATION), [
  "draft",
  "active",
  "answered",
  "paused",
  "closed",
]);

const settledTrade = {
  "offer:pending": ["open", "var(--lc-private_active-badge)", "var(--lc-private_active-line)"],
  "offer:accepted": ["committed", "var(--lc-reserved-badge)", "var(--lc-reserved-line)"],
  "offer:declined": ["adverse", "var(--lc-rejected-badge)", "var(--lc-rejected-line)"],
  "offer:superseded": ["terminal-neutral", "var(--lc-removed-badge)", "var(--lc-removed-line)"],
  "offer:withdrawn": ["terminal-neutral", "var(--lc-removed-badge)", "var(--lc-removed-line)"],
  "deal:pending": ["committed", "var(--lc-reserved-badge)", "var(--lc-reserved-line)"],
  "deal:settling": ["operational", "var(--lc-private_active-badge)", "var(--lc-private_active-line)"],
  "deal:completed": ["complete", "var(--lc-published-badge)", "var(--lc-published-line)"],
  "leg:bound": ["committed", "var(--lc-reserved-badge)", "var(--lc-reserved-line)"],
  "leg:in_transit": ["operational", "var(--lc-private_active-badge)", "var(--lc-private_active-line)"],
  "leg:transferred": ["complete", "var(--lc-published-badge)", "var(--lc-published-line)"],
};
for (const [key, [meaning, text, line]] of Object.entries(settledTrade)) {
  const [kind, status] = key.split(":");
  const presentation = tradeStatePresentation({ kind, status });
  assert.equal(presentation.governance, "settled", `${key} is a settled emitter`);
  assert.equal(presentation.meaning, meaning, `${key} keeps its governed meaning`);
  assert.equal(presentation.text, text, `${key} uses its governed semantic text token`);
  assert.equal(presentation.line, line, `${key} uses its governed semantic line token`);
  assert.equal(presentation.surface, "var(--surface)", `${key} renders readable text on the real badge surface`);
}

/* Delivered and verified have labels but no current producer. Cancellation
   has a current transition but no ruling that makes it adverse. The product
   may render every word; LS-2 may not invent color meaning for any of them. */
for (const input of [
  { kind: "deal", status: "cancelled" },
  { kind: "leg", status: "delivered" },
  { kind: "leg", status: "verified" },
  { kind: "leg", status: "cancelled" },
]) {
  const presentation = tradeStatePresentation(input);
  const key = `${input.kind}:${input.status}`;
  assert.equal(presentation.governance, "pending", `${key} remains governance-pending`);
  assert.equal(presentation.meaning, "unruled", `${key} receives no guessed meaning`);
  assert.equal(presentation.text, "var(--platinum-dim)", `${key} stays readable and neutral`);
  assert.equal(presentation.line, "var(--lc-neutral-line)", `${key} has no invented state-colored edge`);
}

const settledWanted = {
  draft: ["incomplete", "var(--lc-draft-badge)", "var(--lc-draft-line)"],
  active: ["live", "var(--lc-published-badge)", "var(--lc-published-line)"],
  answered: ["engagement", "var(--lc-private_active-badge)", "var(--lc-private_active-line)"],
  paused: ["held", "var(--lc-pending_review-badge)", "var(--lc-pending_review-line)"],
  closed: ["terminal-neutral", "var(--lc-removed-badge)", "var(--lc-removed-line)"],
};
for (const [status, [meaning, text, line]] of Object.entries(settledWanted)) {
  const presentation = wantedStatePresentation(status);
  assert.equal(presentation.governance, "settled", `wanted:${status} is settled`);
  assert.equal(presentation.meaning, meaning, `wanted:${status} keeps its governed meaning`);
  assert.equal(presentation.text, text, `wanted:${status} uses its semantic text token`);
  assert.equal(presentation.line, line, `wanted:${status} uses its semantic line token`);
  assert.equal(presentation.surface, "var(--surface)", `wanted:${status} renders on the real badge surface`);
}
for (const absent of ["satisfied", "removed", "expired"]) {
  assert.ok(!(absent in WANTED_STATE_PRESENTATION), `wanted:${absent} remains out of current vocabulary`);
}

assert.deepEqual(
  WANTED_BUDGET_FIT_PRESENTATION,
  {
    governance: "advisory-privacy",
    meaning: "coarse-projection",
    text: "var(--muted)",
  },
  "within/near/outside/null share one quiet readable advisory presentation",
);
assert.deepEqual(
  TRADE_CASH_PRESENTATION,
  { governance: "factual", meaning: "consideration", text: "var(--platinum-dim)" },
  "cash adjustment is factual rather than automatically positive or negative",
);

/* The same bounded badge components are mounted by product and gallery. */
const badge = normalized("components/TradeWantedStateBadge.tsx");
assert.match(badge, /tradeStatePresentation\(/, "Trade badge resolves the real Trade owner");
assert.match(badge, /wantedStatePresentation\(/, "Wanted badge resolves the real Wanted owner");
assert.match(badge, /backgroundColor: presentation\.surface/, "badge mounts the measured surface");
assert.equal(
  countExact(badge, "style={stateBadgeStyle(presentation)}"),
  2,
  "Trade and Wanted badges share one bounded optical expression",
);
assert.match(
  badge,
  /color: `light-dark\(\$\{lightText\}, \$\{presentation\.text\}\)`/,
  "Dark keeps the exact governed state text while Light receives only an optical lift",
);
assert.match(
  badge,
  /const lightLine = `color-mix\(in srgb, \$\{presentation\.line\}[^`]+\$\{lightText\}\)`/,
  "Light deepens the governed line mapping rather than replacing its semantic source",
);
assert.match(
  badge,
  /borderColor: `light-dark\(\$\{lightLine\}, \$\{presentation\.line\}\)`/,
  "Dark keeps the exact governed state edge while Light receives only the mapped optical lift",
);

const liveConsumers = {
  "components/TradeOffersModule.tsx": ["<TradeStateBadge", "tradeCashPresentation"],
  "components/TradeDoorway.tsx": ["<TradeStateBadge"],
  "components/ProposeTradeDialog.tsx": ["tradeCashPresentation"],
  "components/WantedWorkspace.tsx": ["<WantedStateBadge", "wantedBudgetFitPresentation"],
  "components/WantedRequestsModule.tsx": ["wantedBudgetFitPresentation"],
};
for (const [path, anchors] of Object.entries(liveConsumers)) {
  const source = normalized(path);
  for (const anchor of anchors) assert.ok(source.includes(anchor), `${path} consumes ${anchor}`);
}
const doorway = normalized("components/TradeDoorway.tsx");
for (const branch of [
  /<TradeStateBadge kind="offer" status="accepted" label="Your trade was accepted"/,
  /<TradeStateBadge kind="offer" status="pending" label="Trade proposal pending"/,
  /<TradeStateBadge kind="offer" status=\{historicalStatus\} label=\{`Your last proposal: \$\{TRADE_STATUS_LABELS\[historicalStatus\]\}`\}/,
]) assert.match(doorway, branch, `TradeDoorway binds its ${branch} emitter to the shared owner`);

const tradeRoom = normalized("components/TradeOffersModule.tsx");
for (const branch of [
  /borderColor: currentStatePresentation\?\.line/,
  /<TradeStateBadge kind="deal" status=\{deal\.status\} \/>/,
  /<TradeStateBadge kind="offer" status=\{o\.status\} \/>/,
  /<TradeStateBadge kind="leg" status=\{leg\.leg_status\}/,
  /style=\{\{ color: tradeCashPresentation\.text \}\}/,
]) assert.match(tradeRoom, branch, `TradeOffersModule binds ${branch} to the shared owner`);

const wantedRoom = normalized("components/WantedWorkspace.tsx");
assert.match(wantedRoom, /<WantedStateBadge status=\{r\.status\} \/>/, "collector lifecycle binds the exact request status");
assert.match(wantedRoom, /style=\{\{ color: wantedBudgetFitPresentation\.text \}\}[^]*BUDGET_FIT_LABELS\[report\.budgetFit\]/, "collector answer projection stays on the privacy owner");

const sellerRequests = normalized("components/WantedRequestsModule.tsx");
assert.equal(countExact(sellerRequests, "style={{ color: wantedBudgetFitPresentation.text }}"), 2, "both seller budget projections bind the privacy owner");
assert.doesNotMatch(read("components/TradeOffersModule.tsx"), /fw-lifecycle-label[^\n]*text-\[var\(--gold-dim\)\]/, "Trade state emitters no longer collapse to gold-dim");
assert.doesNotMatch(read("components/ProposeTradeDialog.tsx"), /summary\.cash[\s\S]{0,80}var\(--gold\)|var\(--gold\)[\s\S]{0,80}summary\.cash/, "Trade proposal cash stays factual rather than gold-coded");
assert.doesNotMatch(read("components/WantedWorkspace.tsx"), /fw-lifecycle-label[^\n]*text-\[var\(--gold-dim\)\]/, "Wanted lifecycle no longer collapses to gold-dim");
assert.doesNotMatch(read("components/WantedRequestsModule.tsx"), /BUDGET_FIT_LABELS[\s\S]{0,180}text-\[var\(--(success|danger|lc-published-badge|lc-rejected-badge)\)\]/, "budget-fit is never amplified into good/bad color");

/* Founder-only, noindex, deterministic, and non-mutating. The gallery maps
   the real vocabulary arrays through the real product badges. */
const galleryPath = "app/internal/ls2-trade-wanted-state-gallery/page.tsx";
const gallery = normalized(galleryPath);
for (const anchor of [
  "supabase.auth.getUser()",
  "ADMIN_EMAIL",
  "redirect(\"/\")",
  "robots: { index: false, follow: false, nocache: true }",
  'kind === "offer" ? TRADE_STATUSES',
  'kind === "deal" ? DEAL_STATUSES : LEG_STATUSES',
  "statuses.map",
  "WANTED_STATUSES.map",
  "<TradeStateBadge",
  "<WantedStateBadge",
  "WANTED_BUDGET_FIT_PRESENTATION",
  "TRADE_CASH_PRESENTATION",
]) assert.ok(gallery.includes(anchor), `${galleryPath}: ${anchor}`);
assert.doesNotMatch(gallery, /fetch\(|\.from\(|\.rpc\(|<form|onClick=|method:/, "gallery has no data or mutation seam");
assert.doesNotMatch(gallery, /satisfied|wanted.*removed|wanted.*expired/i, "gallery does not invent absent Wanted states");

/* Actual-surface arithmetic. Existing compact state text was gold-dim on
   --ink; governed badges place their text on --surface. Budget projection
   becomes readable muted text on --ink, while cash becomes factual
   platinum-dim. Every readable 11px label clears 4.5:1 in both modes. */
const rgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const linear = (channel) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) /
  (Math.min(luminance(a), luminance(b)) + 0.05);

const modes = {
  Light: {
    ink: "#F3F0E8", surface: "#FAF7F0", goldDim: "#84682A", muted: "#6B655B",
    platinumDim: "#3B382F", oldCash: "#8D6B1F",
    stateText: ["#84682A", "#5A5F6E", "#2E7D4F", "#A03B33", "#3E4E6E", "#6E5A25", "#6B655C", "#3B382F"],
  },
  Dark: {
    ink: "#0D0F14", surface: "#13151C", goldDim: "#9A7E3A", muted: "#818799",
    platinumDim: "#CFCBC3", oldCash: "#C9A84C",
    stateText: ["#C9A84C", "#B9BECC", "#70C090", "#DB8E88", "#9FB3E0", "#EFE4CB", "#A9A296", "#CFCBC3"],
  },
};
for (const [mode, palette] of Object.entries(modes)) {
  const beforeState = contrast(palette.goldDim, palette.ink);
  for (const color of palette.stateText) {
    const after = contrast(color, palette.surface);
    assert.ok(after >= 4.5, `${mode} state ${color} clears 4.5:1 on --surface (${after.toFixed(3)})`);
    assert.ok(after > beforeState, `${mode} state ${color} improves on collapsed gold-dim (${after.toFixed(3)} > ${beforeState.toFixed(3)})`);
  }
  const budgetBefore = contrast(palette.goldDim, palette.ink);
  const budgetAfter = contrast(palette.muted, palette.ink);
  assert.ok(budgetAfter >= 4.5 && budgetAfter > budgetBefore, `${mode} advisory budget is quieter but more readable`);
  const cashBefore = contrast(palette.oldCash, palette.ink);
  const cashAfter = contrast(palette.platinumDim, palette.ink);
  assert.ok(cashAfter >= 4.5 && cashAfter > cashBefore, `${mode} factual cash clears and improves the text floor`);
}

/* This bounded flight reuses tokens; it never edits the global palette. */
const css = normalized("app/globals.css");
for (const declaration of [
  "--ink: light-dark(#F3F0E8, #0D0F14);",
  "--surface: light-dark(#FAF7F0, #13151C);",
  "--platinum-dim: light-dark(#3B382F, #CFCBC3);",
  "--muted: light-dark(#6B655B, #818799);",
  "--lc-draft-badge: light-dark(#84682A, #C9A84C);",
  "--lc-draft-line: light-dark(rgba(122,95,32,0.44), rgba(201,168,76,0.34));",
  "--lc-pending_review-badge: light-dark(#5A5F6E, #B9BECC);",
  "--lc-pending_review-line: light-dark(rgba(90,95,110,0.45), rgba(156,161,176,0.40));",
  "--lc-published-badge: light-dark(#2E7D4F, #70C090);",
  "--lc-published-line: light-dark(rgba(46,125,79,0.45), rgba(112,192,144,0.34));",
  "--lc-rejected-badge: light-dark(#A03B33, #DB8E88);",
  "--lc-rejected-line: light-dark(rgba(160,59,51,0.5), rgba(190,86,80,0.44));",
  "--lc-private_active-badge: light-dark(#3E4E6E, #9FB3E0);",
  "--lc-private_active-line: light-dark(rgba(62,78,110,0.5), rgba(159,179,224,0.42));",
  "--lc-reserved-badge: light-dark(#6E5A25, #EFE4CB);",
  "--lc-reserved-line: light-dark(rgba(110,90,37,0.55), rgba(228,216,188,0.62));",
  "--lc-removed-badge: light-dark(#6B655C, #A9A296);",
  "--lc-removed-line: light-dark(rgba(107,101,92,0.42), rgba(169,162,150,0.34));",
  "--lc-neutral-line: var(--border-subtle);",
]) assert.ok(css.includes(declaration), `global token remains unchanged: ${declaration}`);

console.log("LS-2 Trade + Wanted state semantics PASS: 16 settled states, 4 explicit Trade stops, 3 absent Wanted states, 1 advisory privacy projection");
