/* LS1-B2 — functional control, count and action floor.

   Run: node scripts/ls1-b2-functional-controls.test.mjs

   This is the bounded contract from the completed LS-1 return. It proves
   that the sixteen R03-R05 sub-floor declarations use one of two semantic
   recipes, that the active notification and account-rail counts share the
   work-badge recipe, and that R02/R06/R07 plus the later LS1-B5 Vault
   overrides remain outside this build. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const RECIPES = {
  "fw-compact-control": {
    "font-family": "'Inter', sans-serif",
    "font-size": "11px",
    "font-style": "normal",
    "font-weight": "400",
    "line-height": "1.4",
    "letter-spacing": "1px",
  },
  "fw-work-count": {
    "font-family": "'Inter', sans-serif",
    "font-size": "11px",
    "font-style": "normal",
    "font-weight": "500",
    "line-height": "1",
    "letter-spacing": "0.2px",
  },
};

const css = postcss.parse(read("app/globals.css"));
for (const [className, expected] of Object.entries(RECIPES)) {
  const selector = `.${className}`;
  const rules = [];
  css.walkRules((rule) => {
    if (rule.selectors?.includes(selector)) rules.push(rule);
  });
  assert.equal(rules.length, 1, `${selector} has one authoritative CSS recipe`);
  const rule = rules[0];
  assert.equal(rule.parent?.type, "atrule", `${selector} is inside a cascade layer`);
  assert.equal(rule.parent?.name, "layer", `${selector} is inside @layer`);
  assert.equal(rule.parent?.params, "components", `${selector} is utility-overridable`);

  const declarations = Object.fromEntries(
    rule.nodes
      .filter((node) => node.type === "decl")
      .map((decl) => [decl.prop, decl.value])
  );
  assert.deepEqual(declarations, expected, `${selector} is the exact governed typography recipe`);
  for (const outOfLane of ["color", "background", "border", "display", "padding", "margin", "text-transform"]) {
    assert.ok(!(outOfLane in declarations), `${selector} does not own ${outOfLane}`);
  }
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

function classTokens(path) {
  return staticStrings(path).flatMap((value) => value.split(/\s+/).filter(Boolean));
}

const EXPECTED_BINDINGS = {
  "app/internal/collector-dossiers/breguet-5967bb-11-9w6/page.tsx": {
    "fw-compact-control": 1,
    "fw-work-count": 0,
  },
  "components/HomepageClient.tsx": { "fw-compact-control": 1, "fw-work-count": 0 },
  "components/MarketplaceControl.tsx": { "fw-compact-control": 1, "fw-work-count": 0 },
  "components/MobileNav.tsx": { "fw-compact-control": 1, "fw-work-count": 0 },
  "components/MobileWizard.tsx": { "fw-compact-control": 0, "fw-work-count": 1 },
  "components/NotificationsBell.tsx": { "fw-compact-control": 1, "fw-work-count": 1 },
  "components/PhotoPresentationEditor.tsx": { "fw-compact-control": 2, "fw-work-count": 0 },
  "components/SavedSearchesCard.tsx": { "fw-compact-control": 1, "fw-work-count": 0 },
  "components/SellerListingsRoom.tsx": { "fw-compact-control": 0, "fw-work-count": 1 },
  "components/VaultGalaxy.tsx": { "fw-compact-control": 4, "fw-work-count": 0 },
  "components/VaultMarketEvidence.tsx": { "fw-compact-control": 0, "fw-work-count": 1 },
  "components/VaultRoomTabs.tsx": { "fw-compact-control": 1, "fw-work-count": 0 },
  "components/rail/railPrimitives.tsx": { "fw-compact-control": 0, "fw-work-count": 1 },
};

let bindingTotal = 0;
for (const [path, expected] of Object.entries(EXPECTED_BINDINGS)) {
  const strings = staticStrings(path);
  const actual = Object.fromEntries(
    Object.keys(RECIPES).map((recipe) => [
      recipe,
      strings.filter((value) => value.split(/\s+/).includes(recipe)).length,
    ])
  );
  assert.deepEqual(actual, expected, `${path} binds only its LS1-B2 semantic roles`);
  bindingTotal += Object.values(actual).reduce((sum, count) => sum + count, 0);

  for (const value of strings.filter((text) => Object.keys(RECIPES).some((recipe) => text.split(/\s+/).includes(recipe)))) {
    const tokens = value.split(/\s+/).filter(Boolean);
    assert.ok(
      !tokens.some((token) => /^(?:(?:max|sm|md|lg|xl)[^:]*:)?!?text-\[(?:7|8|9|10)px\]$/.test(token)),
      `${path}: governed LS1-B2 text is not overridden below the 11px floor`
    );
    assert.ok(
      !tokens.some((token) => /^font-(?:sans|display|thin|extralight|light|normal|medium|semibold|bold)$/.test(token)),
      `${path}: the semantic recipe owns face and weight`
    );
    assert.ok(!tokens.some((token) => token === "italic" || token === "not-italic"), `${path}: the recipe owns posture`);
    assert.ok(!tokens.some((token) => /^(?:(?:max|sm|md|lg|xl)[^:]*:)?!?tracking-/.test(token)), `${path}: the recipe owns tracking`);
    assert.ok(!tokens.some((token) => /^(?:(?:max|sm|md|lg|xl)[^:]*:)?!?leading-/.test(token)), `${path}: the recipe owns line height`);
  }
}
assert.equal(bindingTotal, 18, "all sixteen R03-R05 repairs and two active count roots are governed");

/* The approved exclusions are intentionally literal. These are not a site
   census: they are the closed R02/R06/R07 ledger carried by the LS-1 return,
   while the three variant-prefixed R04 overrides assigned to LS1-B5 are
   asserted separately below. */
const PROTECTED_EIGHT_PX_COUNTS = {
  "app/error.tsx": 1,
  "app/not-found.tsx": 1,
  "app/reset-password/page.tsx": 3,
  "app/sell/(entry)/page.tsx": 1,
  "app/vault/galaxy/page.tsx": 1,
  "app/vault/page.tsx": 1,
  "components/FounderSignature.tsx": 1,
  "components/ListFromPhoneHandoff.tsx": 1,
  "components/MarketplaceControl.tsx": 2,
  "components/MobileNav.tsx": 1,
  "components/PhotoPresentationEditor.tsx": 1,
  "components/PhotoRedactionEditor.tsx": 1,
  "components/VaultGalaxy.tsx": 4,
  "components/VaultSpecificationUpgrade.tsx": 1,
  "components/reassurance/ListingDeclined.tsx": 1,
  "components/reassurance/ListingSold.tsx": 1,
  "components/reassurance/NoSearchResults.tsx": 1,
  "components/reassurance/SignInRequired.tsx": 1,
};

let protectedEightPxTotal = 0;
for (const [path, expected] of Object.entries(PROTECTED_EIGHT_PX_COUNTS)) {
  const actual = classTokens(path).filter((token) => token === "text-[8px]").length;
  assert.equal(actual, expected, `${path} preserves its approved R06/R07 or LS1-B5 8px treatments`);
  protectedEightPxTotal += actual;
}
assert.equal(protectedEightPxTotal, 24, "all 19 R06 and 5 R07 treatments remain exact");

const photoTokens = classTokens("components/PhotoPresentationEditor.tsx");
assert.equal(photoTokens.filter((token) => token === "text-[7px]").length, 3, "R02 photo role overlays remain untouched");

const vaultTokens = classTokens("components/VaultGalaxy.tsx");
assert.equal(vaultTokens.filter((token) => token === "max-sm:!text-[8px]").length, 3, "LS1-B5 retains all three forced Vault reductions");
assert.equal(vaultTokens.filter((token) => token === "max-sm:!tracking-[1px]").length, 3, "LS1-B5 retains their paired tracking overrides");

console.log("ls1-b2-functional-controls: 2 recipes, 18 bindings and 27 protected 8px treatments PASS");
