/* LS2 Purchase Request color parity contract.
   Run: node scripts/ls2-purchase-request-color-parity.test.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const normalize = (value) => value.replace(/\s+/g, " ").trim();
const source = (path) => normalize(read(path));

function includes(path, expected, label) {
  assert.ok(source(path).includes(normalize(expected)), `${path}: ${label}`);
}

function occurrences(path, expected) {
  const needle = normalize(expected);
  return source(path).split(needle).length - 1;
}

const owner = "lib/purchaseRequestPresentation.ts";
const fullForm = "components/PurchaseRequestForm.tsx";
const inlineForm = "components/InlinePurchaseRequest.tsx";
const controller = "components/usePurchaseRequest.ts";
const classifier = "lib/purchaseRequest.ts";

/* One Purchase Request-specific owner governs field validation on both form
   surfaces. LS-4 retired the mixed formError bucket and its amber debt; that
   removal must not alter the governed validation or lifecycle recipes. */
includes(
  owner,
  'validation: { text: "var(--slate)", border: "var(--gold-dim)" }',
  "owns the exact restrained validation text and boundary recipe",
);
assert.equal(occurrences(owner, "#d8a171"), 0, "the retired mixed formError amber does not survive LS-4");
assert.ok(!source(owner).includes("PURCHASE_REQUEST_LEGACY_FULL_FIELD_BORDER"), "no legacy full-form field border remains");

const validationConsumers = {
  full: {
    path: fullForm,
    neutralBorder: '"var(--border-mid)"',
    textBinding: "style={{ color: purchaseRequestPresentation.validation.text }}",
  },
  inline: {
    path: inlineForm,
    neutralBorder: '"var(--border-mid)"',
    textBinding: "showOfferError ? purchaseRequestPresentation.validation.text :",
  },
};
assert.deepEqual(Object.keys(validationConsumers), ["full", "inline"], "validation parity covers exactly the full and inline forms");
for (const [surface, { path, neutralBorder, textBinding }] of Object.entries(validationConsumers)) {
  includes(path, 'from "@/lib/purchaseRequestPresentation"', `${surface} form uses the shared presentation owner`);
  includes(
    path,
    `borderColor: showOfferError ? purchaseRequestPresentation.validation.border : ${neutralBorder}`,
    `${surface} field validation uses the same shared validation.border`,
  );
  includes(
    path,
    textBinding,
    `${surface} field validation uses the same shared slate text recipe`,
  );
  assert.equal(
    occurrences(path, "purchaseRequestPresentation.validation.border"),
    1,
    `${path}: has exactly one governed validation-border consumer`,
  );
  assert.equal(
    occurrences(path, "purchaseRequestPresentation.validation.text"),
    1,
    `${path}: has exactly one governed validation-text consumer`,
  );
  assert.equal((read(path).match(/#d8a171/gi) ?? []).length, 0, `${path}: has no component-local amber literal`);
  assert.ok(!source(path).includes("PURCHASE_REQUEST_LEGACY_FULL_FIELD_BORDER"), `${path}: has no legacy full-border escape hatch`);
  assert.ok(!source(path).includes("PURCHASE_REQUEST_LEGACY_FORM_ERROR_COLOR"), `${path}: retired mixed error color is absent`);
}

/* The semantic owner has exactly three governed submit outcomes. Expiry and
   unknown states deliberately return undefined instead of inheriting a tone. */
const ownerRaw = read(owner);
const submitMapBody = ownerRaw.match(
  /const SUBMIT_OUTCOME_PRESENTATION:\s*Record<SubmitOutcome, OutcomePresentation>\s*=\s*\{([\s\S]*?)\r?\n\};/,
);
assert.ok(submitMapBody, `${owner}: submit outcome map is present`);
const governedSubmitKeys = [...submitMapBody[1].matchAll(/^\s{2}([a-z_]+):\s*\{/gm)].map((match) => match[1]);
assert.deepEqual(
  governedSubmitKeys,
  ["success", "changed", "unavailable"],
  "the governed submit map has exactly the three already-truthful outcome keys",
);

const governedOutcomeRecipes = {
  success: 'success: { text: "var(--success)", border: "var(--lc-published-line)" }',
  changed: 'changed: { text: "var(--slate)", border: "var(--slate)" }',
  unavailable: 'unavailable: { text: "var(--platinum)", border: "var(--border-subtle)" }',
};
assert.deepEqual(Object.keys(governedOutcomeRecipes), governedSubmitKeys, "the asserted recipes and semantic map keys agree exactly");
for (const [outcome, presentation] of Object.entries(governedOutcomeRecipes)) {
  includes(owner, presentation, `governs truthful ${outcome} with its exact semantic recipe`);
}
assert.ok(!normalize(submitMapBody[1]).includes("expired:"), "expired has no governed submit mapping");

/* Full StatePanel consumers name the truthful outcome. Its mark and eyebrow
   both resolve through the outcome-specific text recipe; only the protected
   currency and expiry panels can reach the local platinum/gold fallbacks. */
const fullOutcomeBindings = {
  changed: '<StatePanel mark="!" markTone="changed" eyebrow="Listing updated"',
  unavailable: '<StatePanel mark="—" markTone="unavailable" eyebrow="Listing status changed"',
  success: '<StatePanel mark="✓" markTone="success" eyebrow="Request sent"',
};
assert.deepEqual(Object.keys(fullOutcomeBindings), ["changed", "unavailable", "success"], "full outcome bindings cover the governed states exactly");
for (const [outcome, binding] of Object.entries(fullOutcomeBindings)) {
  includes(fullForm, binding, `full ${outcome} panel binds its semantic outcome key`);
}
includes(fullForm, "const outcome = purchaseRequestOutcomePresentation(markTone);", "StatePanel resolves the shared outcome recipe");
includes(
  fullForm,
  'const markColor = outcome?.text ?? (markTone === "platinum" ? "var(--platinum)" : "var(--gold)");',
  "StatePanel text has only the protected platinum/gold local fallbacks",
);
includes(
  fullForm,
  'const markBorder = outcome?.border ?? (markTone === "platinum" ? "var(--border-subtle)" : "var(--border-gold)");',
  "StatePanel border has only the protected platinum/gold local fallbacks",
);
includes(
  fullForm,
  'const eyebrowColor = outcome?.text ?? "var(--gold)";',
  "governed outcome eyebrows use semantic text while protected non-outcome panels retain gold",
);
includes(
  fullForm,
  '<div className="text-[11px] uppercase tracking-[1.4px]" style={{ color: eyebrowColor }}> {eyebrow} </div>',
  "the full outcome eyebrow consumes outcome-specific text instead of static gold",
);
assert.ok(!source(fullForm).includes('text-[var(--gold)]">{eyebrow}'), "success/changed/unavailable eyebrows cannot collapse to static gold");

/* Inline cards use the same three-key owner on a neutral --surface. Because
   the controller view union is closed, the undefined arm here is exactly the
   governance-pending expired state and preserves its legacy gold rendering. */
includes(inlineForm, "const outcome = purchaseRequestOutcomePresentation(view);", "inline outcome resolves through the shared owner");
includes(
  inlineForm,
  'className={outcome ? "border bg-[var(--surface)] px-4 py-3" : "border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-3"}',
  "inline governed outcomes use --surface while expired preserves its exact legacy border and wash",
);
includes(
  inlineForm,
  'style={{ color: outcome?.text ?? "var(--gold-dim)" }}',
  "inline expired eyebrow preserves its exact legacy gold-dim fallback",
);
includes(inlineForm, 'view === "expired"', "inline expiry branch remains present and local");
includes(fullForm, 'view === "expired"', "full expiry branch remains present and local");
includes(fullForm, 'mark="↻" markTone="gold" eyebrow="Identity needs to be rechecked"', "full expiry preserves its exact local gold presentation");

/* Persisted lifecycle ownership is shared by the two ordinary-user doors.
   Known seller-initiated closure is adverse; expired/unknown lifecycle values
   still fall through to the pre-existing local muted treatment. */
includes(owner, 'listing_removed_by_seller: "var(--lc-rejected-badge)"', "settled seller removal is adverse/closed");
includes(owner, 'listing_deleted_by_seller: "var(--lc-rejected-badge)"', "settled seller deletion is adverse/closed");
for (const component of ["components/CatalogueClient.tsx", "components/CommunicationsRoom.tsx"]) {
  includes(component, 'from "@/lib/purchaseRequestPresentation"', "uses shared persisted lifecycle colors");
  includes(component, "purchaseRequestLifecycleColor", "delegates lifecycle color lookup to the shared owner");
}
assert.ok(!source("components/CatalogueClient.tsx").includes("type OfferTone"), "Catalogue has no inert local tone map");
assert.ok(!source("components/CommunicationsRoom.tsx").includes('listing_removed_by_seller") { return "var(--muted)"'), "Communications has no local muted seller-removal drift");

/* LS-4 resolved the taxonomy debt without reopening LS-2 color semantics:
   field validation remains governed here, while structurally distinct
   product-rejection and unconfirmed-delivery truth stay neutral. */
const outcomeTypeBody = read(classifier).match(
  /export type PurchaseRequestOutcome\s*=([\s\S]*?);\r?\n\r?\nexport type PurchaseRequestFailure/,
);
assert.ok(outcomeTypeBody, `${classifier}: PurchaseRequestOutcome union is present`);
const outcomeKinds = [...outcomeTypeBody[1].matchAll(/kind:\s*"([a-z_]+)"/g)].map((match) => match[1]);
assert.deepEqual(
  outcomeKinds,
  ["success", "expired", "unavailable", "changed", "product_rejection", "submission_unconfirmed", "field_error"],
  "controller outcome taxonomy keeps LS-2 governed states and the LS-4 truth split exact",
);

const failureClassifierBranches = {
  duplicate_request: 'if (status === 409 && err === "duplicate_request") { return { kind: "product_rejection"',
  own_listing: 'if (status === 403) { return { kind: "product_rejection"',
  currency_unset: 'if (status === 409 && err === "listing_currency_unset") { return { kind: "product_rejection"',
  unknown_http: 'return { kind: "submission_unconfirmed" };',
};
assert.deepEqual(
  Object.keys(failureClassifierBranches),
  ["duplicate_request", "own_listing", "currency_unset", "unknown_http"],
  "the LS-4 classifier branch ledger is exact",
);
for (const [failure, branch] of Object.entries(failureClassifierBranches)) {
  includes(classifier, branch, `${failure} feeds its truthful outcome`);
}
includes(
  classifier,
  'if (status === 400 && err === "invalid_amount") { return { kind: "field_error"',
  "server invalid_amount is the distinct field_error branch",
);
includes(controller, 'case "product_rejection": setFailure(outcome);', "known rejection remains explicit in the failure union");
includes(
  controller,
  'case "submission_unconfirmed": persistDraft(); setFailure(outcome);',
  "unconfirmed delivery remains explicit and preserves the verification handoff draft",
);
includes(controller, 'case "field_error": setFieldError(outcome.detail);', "classified field_error feeds fieldError");
includes(controller, "const [failure, setFailure] = useState<PurchaseRequestFailure | null>(null);", "controller exposes the explicit failure union");
includes(controller, "const [fieldError, setFieldError] = useState<string | null>(null);", "controller exposes one distinct fieldError state");
includes(controller, 'if (!p.ok) { setFieldError(', "client parsing feeds the distinct fieldError state");
includes(
  controller,
  '} catch { apply({ kind: "submission_unconfirmed" });',
  "network failure feeds unconfirmed-delivery truth",
);
assert.ok(!source(controller).includes("formError"), "the mixed formError state is retired");

/* Protected controller/classifier/copy and global-token anchors. Exact token
   values also bind the actual-surface arithmetic below to production CSS. */
const protectedAnchors = {
  controller_view: [controller, 'export type PurchaseRequestView = "form" | "success" | "expired" | "unavailable" | "changed";'],
  controller_expiry: [controller, 'setView("expired")'],
  changed_classifier_copy: [classifier, 'kind: "changed", old: Number(data?.old), current: Number(data?.current)'],
  server_changed_copy: ["app/api/purchase-requests/route.ts", 'error: "listing_changed", detail: "The seller updated the asking price. Review the current listing before submitting your offer."'],
  full_non_checkout_copy: [fullForm, "Sending a purchase request does not complete the purchase."],
  inline_non_checkout_copy: [inlineForm, "Sending a purchase request does not complete the purchase"],
};
for (const [label, [path, expected]] of Object.entries(protectedAnchors)) includes(path, expected, `protected anchor: ${label}`);

for (const declaration of [
  "--ink:          light-dark(#F3F0E8, #0D0F14);",
  "--surface:      light-dark(#FAF7F0, #13151C);",
  "--surface-2:    light-dark(#FFFDF8, #1A1D26);",
  "--platinum:     light-dark(#25231F, #E8E4DC);",
  "--slate:        light-dark(#57524A, #9CA1B0);",
  "--gold-dim:     light-dark(#84682A, #9A7E3A);",
  "--gold-whisper: light-dark(rgba(176,138,46,0.13), rgba(201,168,76,0.08));",
  "--gold:         light-dark(#8D6B1F, #C9A84C);",
  "--success:      light-dark(#2E7D4F, #70C090);",
  "--border-gold:        light-dark(rgba(122,95,32,0.38), rgba(201,168,76,0.28));",
  "--border-subtle:      light-dark(rgba(62,54,38,0.14), rgba(255,255,255,0.06));",
  "--lc-published-line:       light-dark(rgba(46,125,79,0.45), rgba(112,192,144,0.34));",
  "--lc-rejected-badge:",
]) includes("app/globals.css", declaration, `global token remains unchanged: ${declaration}`);

/* Exact stop ledger: LS-4 retired the mixed-error stop. Governance-pending
   expiry remains the sole unresolved color-semantic family. */
const stopLedger = {
  governance_pending_expired: {
    full: [fullForm, 'view === "expired"'],
    inline: [inlineForm, 'view === "expired"'],
  },
};
assert.deepEqual(
  Object.keys(stopLedger),
  ["governance_pending_expired"],
  "governance-pending expiry is the sole remaining stop family",
);
for (const [family, surfaces] of Object.entries(stopLedger)) {
  assert.deepEqual(Object.keys(surfaces), ["full", "inline"], `${family}: stop applies to exactly both form surfaces`);
  for (const [surface, [path, expected]] of Object.entries(surfaces)) includes(path, expected, `${family}: ${surface} stop remains`);
}

/* Exact fixture debt. LS-4 adds distinct product-rejection and unconfirmed
   delivery fixtures on each renderer without changing the LS-2 states. */
const fixtureLedger = {
  full: {
    field_validation: [fullForm, "showOfferError ?"],
    success: [fullForm, 'view === "success"'],
    changed: [fullForm, 'view === "changed"'],
    unavailable: [fullForm, 'view === "unavailable"'],
    expired: [fullForm, 'view === "expired"'],
    product_rejection: [fullForm, "failure &&"],
    submission_unconfirmed: [fullForm, "failure &&"],
  },
  inline: {
    field_validation: [inlineForm, "showOfferError ?"],
    success: [inlineForm, 'view === "success"'],
    changed: [inlineForm, 'view === "changed"'],
    unavailable: [inlineForm, 'view === "unavailable"'],
    expired: [inlineForm, 'view === "expired"'],
    product_rejection: [inlineForm, "failure &&"],
    submission_unconfirmed: [inlineForm, "failure &&"],
  },
};
assert.deepEqual(Object.keys(fixtureLedger), ["full", "inline"], "fixture debt covers exactly both Purchase Request renderers");
for (const [surface, states] of Object.entries(fixtureLedger)) {
  assert.deepEqual(
    Object.keys(states),
    ["field_validation", "success", "changed", "unavailable", "expired", "product_rejection", "submission_unconfirmed"],
    `${surface}: exact fixture state ledger`,
  );
  for (const [state, [path, expected]] of Object.entries(states)) {
    includes(path, expected, `${surface} ${state} remains fixture/Human SEE-it bound`);
  }
}

/* Actual-surface arithmetic. Full StatePanel output is transparent on the
   full form's --surface-2 panel; governed inline outcome cards set --surface.
   Every corrected 11px outcome eyebrow clears 4.5:1 in Light and Dark. The
   border ratios are also recorded for every state/surface; success and
   unavailable perimeters are quiet semantic framing, not the sole carrier of
   readable state, so a text contrast floor is not misapplied to those lines. */
const hex = (value) => [0, 2, 4].map((index) => Number.parseInt(value.slice(1 + index, 3 + index), 16));
const linear = (channel) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = (rgb) => 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
const blend = (foreground, alpha, background) => foreground.map((channel, index) => channel * alpha + background[index] * (1 - alpha));
const rounded = (value) => Number(value.toFixed(3));

includes(fullForm, 'min-h-[560px] border border-[var(--border-subtle)] bg-[var(--surface-2)]', "full StatePanel sits on --surface-2");
includes(fullForm, 'className="h-[54px] w-full border bg-[var(--input-bg)]', "full validation boundary stays on its LS-3-governed input surface");
includes(inlineForm, '"border border-[var(--border-gold)] bg-[rgba(201,168,76,0.03)] px-4 py-4"', "inline validation text sits on the 3% gold form wash");
includes(inlineForm, 'className="h-[46px] w-full border bg-[var(--surface-2)]', "inline validation boundary sits on themed --surface-2");

const modeRecipes = {
  Light: {
    surfaces: { full: "#FFFDF8", inline: "#FAF7F0" },
    outcomes: {
      success: { text: "#2E7D4F", border: { rgb: "#2E7D4F", alpha: 0.45 } },
      changed: { text: "#57524A", border: { rgb: "#57524A", alpha: 1 } },
      unavailable: { text: "#25231F", border: { rgb: "#3E3626", alpha: 0.14 } },
    },
    legacy: {
      fullText: "#8D6B1F",
      inlineText: "#84682A",
      inlineParent: "#F3F0E8",
      inlineWash: { rgb: "#B08A2E", alpha: 0.13 },
    },
  },
  Dark: {
    surfaces: { full: "#1A1D26", inline: "#13151C" },
    outcomes: {
      success: { text: "#70C090", border: { rgb: "#70C090", alpha: 0.34 } },
      changed: { text: "#9CA1B0", border: { rgb: "#9CA1B0", alpha: 1 } },
      unavailable: { text: "#E8E4DC", border: { rgb: "#FFFFFF", alpha: 0.06 } },
    },
    legacy: {
      fullText: "#C9A84C",
      inlineText: "#9A7E3A",
      inlineParent: "#0D0F14",
      inlineWash: { rgb: "#C9A84C", alpha: 0.08 },
    },
  },
};

const measuredOutcomes = {};
const measuredLegacyText = {};
for (const [mode, recipe] of Object.entries(modeRecipes)) {
  assert.deepEqual(Object.keys(recipe.outcomes), ["success", "changed", "unavailable"], `${mode}: arithmetic covers every governed outcome`);
  measuredOutcomes[mode] = {};
  measuredLegacyText[mode] = {};
  for (const [surface, backgroundHex] of Object.entries(recipe.surfaces)) {
    const background = hex(backgroundHex);
    const legacyBackground = surface === "inline"
      ? blend(hex(recipe.legacy.inlineWash.rgb), recipe.legacy.inlineWash.alpha, hex(recipe.legacy.inlineParent))
      : background;
    const legacyText = hex(surface === "inline" ? recipe.legacy.inlineText : recipe.legacy.fullText);
    const legacyTextContrast = contrast(legacyText, legacyBackground);
    measuredLegacyText[mode][surface] = rounded(legacyTextContrast);
    measuredOutcomes[mode][surface] = {};
    for (const [outcome, colors] of Object.entries(recipe.outcomes)) {
      const textContrast = contrast(hex(colors.text), background);
      const renderedBorder = blend(hex(colors.border.rgb), colors.border.alpha, background);
      const borderContrast = contrast(renderedBorder, background);
      measuredOutcomes[mode][surface][outcome] = {
        text: rounded(textContrast),
        border: rounded(borderContrast),
      };
      assert.ok(textContrast >= 4.5, `${outcome} text clears small-text AA on the actual ${mode} ${surface} surface`);
      if (surface === "inline") {
        assert.ok(textContrast > legacyTextContrast, `${outcome} text lifts the failing ${mode} inline legacy gold treatment`);
      } else {
        assert.ok(
          Math.abs(textContrast - legacyTextContrast) > 0.1,
          `${outcome} text is measurably distinct from the ${mode} full legacy gold treatment while retaining AA`,
        );
      }
    }
  }
}

assert.deepEqual(measuredLegacyText, {
  Light: { full: 4.854, inline: 4.1 },
  Dark: { full: 7.365, inline: 4.435 },
}, "historical full static-gold and inline gold-on-wash eyebrow measurements are exact");
assert.deepEqual(measuredOutcomes, {
  Light: {
    full: {
      success: { text: 4.963, border: 1.886 },
      changed: { text: 7.62, border: 7.62 },
      unavailable: { text: 15.429, border: 1.283 },
    },
    inline: {
      success: { text: 4.715, border: 1.857 },
      changed: { text: 7.24, border: 7.24 },
      unavailable: { text: 14.66, border: 1.279 },
    },
  },
  Dark: {
    full: {
      success: { text: 7.72, border: 2.039 },
      changed: { text: 6.523, border: 6.523 },
      unavailable: { text: 13.274, border: 1.183 },
    },
    inline: {
      success: { text: 8.363, border: 2.035 },
      changed: { text: 7.066, border: 7.066 },
      unavailable: { text: 14.38, border: 1.163 },
    },
  },
}, "Light/Dark text and rendered-border arithmetic is complete for every corrected outcome on both actual surfaces");

/* Field-validation arithmetic uses the same shared tokens but each renderer's
   real surface: text sits on --surface-2 (full) or the inline 3% gold wash;
   borders sit on the fixed-dark full input or themed inline --surface-2.
   Proposed text clears 4.5:1 and the shared border clears 3:1 everywhere. */
const validationMeasurements = {};
for (const [mode, values] of Object.entries({
  Light: { slate: "#57524A", goldDim: "#84682A", surface2: "#FFFDF8", ink: "#F3F0E8" },
  Dark: { slate: "#9CA1B0", goldDim: "#9A7E3A", surface2: "#1A1D26", ink: "#0D0F14" },
})) {
  const surface2 = hex(values.surface2);
  const inlineWash = blend(hex("#C9A84C"), 0.03, hex(values.ink));
  const fixedDarkInput = hex("#10131A");
  const oldAmber = hex("#D8A171");
  const oldFullBorder = blend(oldAmber, 0.65, fixedDarkInput);
  const oldInlineBorder = blend(oldAmber, 0.65, surface2);
  validationMeasurements[mode] = {
    fullText: { before: rounded(contrast(oldAmber, surface2)), after: rounded(contrast(hex(values.slate), surface2)) },
    inlineText: { before: rounded(contrast(oldAmber, inlineWash)), after: rounded(contrast(hex(values.slate), inlineWash)) },
    fullBorder: { before: rounded(contrast(oldFullBorder, fixedDarkInput)), after: rounded(contrast(hex(values.goldDim), fixedDarkInput)) },
    inlineBorder: { before: rounded(contrast(oldInlineBorder, surface2)), after: rounded(contrast(hex(values.goldDim), surface2)) },
  };
  assert.ok(validationMeasurements[mode].fullText.after >= 4.5, `full validation text clears AA in ${mode}`);
  assert.ok(validationMeasurements[mode].inlineText.after >= 4.5, `inline validation text clears AA in ${mode}`);
  assert.ok(validationMeasurements[mode].fullBorder.after >= 3, `shared validation border clears the full fixed-dark boundary floor in ${mode}`);
  assert.ok(validationMeasurements[mode].inlineBorder.after >= 3, `shared validation border clears the inline boundary floor in ${mode}`);
}
assert.deepEqual(validationMeasurements, {
  Light: {
    fullText: { before: 2.232, after: 7.62 },
    inlineText: { before: 1.954, after: 6.673 },
    fullBorder: { before: 4.099, after: 3.535 },
    inlineBorder: { before: 1.652, after: 5.171 },
  },
  Dark: {
    fullText: { before: 7.419, after: 6.523 },
    inlineText: { before: 8.152, after: 7.167 },
    fullBorder: { before: 4.099, after: 4.796 },
    inlineBorder: { before: 3.901, after: 4.344 },
  },
}, "validation before/after arithmetic records every real text and boundary surface without claiming universal contrast gain");

/* Mutation-sensitive source guards. These assertions reject the named source
   regressions; manual mutation trials are separate external evidence and this
   contract does not claim to execute mutations itself. */
const inline = source(inlineForm);
assert.ok(
  inline.includes('outcome ? "border bg-[var(--surface)] px-4 py-3" : "border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-3"'),
  "regression guard: inline governed outcomes cannot return to one all-gold card",
);
assert.ok(!inline.includes("const BAD ="), "regression guard: inline cannot reintroduce component-local amber");
const full = source(fullForm);
for (const [outcome, binding] of Object.entries(fullOutcomeBindings)) {
  assert.ok(full.includes(normalize(binding)), `regression guard: full ${outcome} cannot collapse to a generic markTone`);
}
assert.ok(
  full.includes(normalize('style={{ color: eyebrowColor }}> {eyebrow} </div>')),
  "regression guard: full outcome eyebrow cannot return to static gold",
);
assert.ok(!source(owner).includes("expired:"), "regression guard: unresolved expiry cannot enter the governed map");
assert.ok(
  !source("components/CommunicationsRoom.tsx").includes('if (r.status === "cancelled" && r.closure_cause === "listing_removed_by_seller")'),
  "regression guard: Communications cannot restore its local seller-removal drift",
);

console.log(
  "LS2 Purchase Request color parity contract PASS: 3 governed submit states across 2 surfaces; expiry remains stopped; LS-4 failure truth stays neutral.",
);
