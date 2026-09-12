/* LS1-B3 — functional small-display italic.

   Run: node scripts/ls1-b3-functional-copy.test.mjs

   This is the closed implementation contract from the completed LS-1
   discovery. It proves that all 88 adjudicated R17-R21 functional roots use
   one readable Inter recipe, carries the fourteen additive LS1-B4 bindings
   and eight auth/recovery LS1-B6 state roots, keeps railBody as the single
   shared root for its four current render sites, and leaves the named
   editorial and dormant treatments outside these builds. It is deliberately
   not a new census. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const JSONC_CONFIG_FIXTURE = `{
  // TypeScript config comments and trailing commas are legal.
  "compilerOptions": { "moduleResolution": "bundler", },
}`;
const jsoncFixture = ts.parseConfigFileTextToJson("tsconfig.fixture.json", JSONC_CONFIG_FIXTURE);
assert.equal(jsoncFixture.error, undefined, "TypeScript accepts commented, trailing-comma JSONC config");
const parsedJsoncFixture = ts.parseJsonConfigFileContent(
  jsoncFixture.config,
  ts.sys,
  rootPath,
  undefined,
  "tsconfig.fixture.json"
);
assert.equal(parsedJsoncFixture.errors.length, 0, "TypeScript accepts the JSONC fixture without config diagnostics");

function formatDiagnostic(diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

function readTypeScriptResolutionOptions() {
  const tsconfigPath = fileURLToPath(new URL("tsconfig.json", root));
  const readResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  assert.equal(
    readResult.error,
    undefined,
    `tsconfig read/JSONC diagnostic: ${readResult.error ? formatDiagnostic(readResult.error) : "none"}`
  );
  const parsed = ts.parseJsonConfigFileContent(readResult.config, ts.sys, rootPath, undefined, tsconfigPath);
  assert.equal(
    parsed.errors.length,
    0,
    `tsconfig parsed-config diagnostics:\n${parsed.errors.map(formatDiagnostic).join("\n")}`
  );
  return parsed.options;
}

const typescriptResolutionOptions = readTypeScriptResolutionOptions();
const RECIPE = "fw-functional-copy";

const css = postcss.parse(read("app/globals.css"));
const recipeRules = [];
css.walkRules((rule) => {
  if (rule.selectors?.includes(`.${RECIPE}`)) recipeRules.push(rule);
});
assert.equal(recipeRules.length, 1, `.${RECIPE} has one authoritative CSS recipe`);
const recipeRule = recipeRules[0];
assert.equal(recipeRule.selector, `.${RECIPE}`, `.${RECIPE} is not coupled to another selector`);
assert.equal(recipeRule.parent?.type, "atrule", `.${RECIPE} is inside a cascade layer`);
assert.equal(recipeRule.parent?.name, "layer", `.${RECIPE} is inside @layer`);
assert.equal(recipeRule.parent?.params, "components", `.${RECIPE} is utility-overridable`);
const recipeNodes = recipeRule.nodes ?? [];
assert.ok(recipeNodes.every((node) => node.type === "decl"), `.${RECIPE} contains declarations only`);
assert.ok(recipeNodes.every((node) => !node.important), `.${RECIPE} does not use !important`);
const declarations = recipeNodes.map((decl) => [decl.prop, decl.value]);
assert.equal(new Set(declarations.map(([property]) => property)).size, declarations.length, `.${RECIPE} has no duplicate declarations`);
assert.deepEqual(
  Object.fromEntries(declarations),
  {
    "font-family": "'Inter', sans-serif",
    "font-size": "13px",
    "font-style": "normal",
    "font-weight": "400",
    "line-height": "1.5",
    "letter-spacing": "0.2px",
  },
  `.${RECIPE} is the exact governed functional-copy treatment`
);

function sourceTree(path) {
  const kind = path.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : path.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : /\.(?:js|mjs|cjs)$/.test(path)
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  return ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, kind);
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

function staticFragments(node) {
  const values = [];
  const visit = (child) => {
    if (
      ts.isStringLiteralLike(child) ||
      child.kind === ts.SyntaxKind.TemplateHead ||
      child.kind === ts.SyntaxKind.TemplateMiddle ||
      child.kind === ts.SyntaxKind.TemplateTail
    ) {
      values.push(child.text);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return values;
}

function classNameBindings(path) {
  const bindings = [];
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.text === "className" && node.initializer) {
      bindings.push(staticFragments(node.initializer).join(" "));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceTree(path));
  return bindings;
}

function classNameIdentifierReferences(path, identifier) {
  let count = 0;
  const visitIdentifier = (node) => {
    if (ts.isIdentifier(node) && node.text === identifier) count += 1;
    ts.forEachChild(node, visitIdentifier);
  };
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.text === "className" && node.initializer) {
      visitIdentifier(node.initializer);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceTree(path));
  return count;
}

const EXPECTED_BINDINGS = {
  "app/admin/auctions/page.tsx": 1,
  "app/admin/vault-enrichment/page.tsx": 1,
  "app/admin/vault-review/page.tsx": 1,
  "app/admin/vault-upgrade/page.tsx": 1,
  "app/error.tsx": 1,
  "app/forgot-password/page.tsx": 3,
  "app/login/page.tsx": 1,
  "app/not-found.tsx": 1,
  "app/reset-password/page.tsx": 4,
  "app/sell/(entry)/page.tsx": 7,
  "app/signup/page.tsx": 7,
  "components/AccountSettings.tsx": 8,
  "components/CameraCapture.tsx": 2,
  "components/CatalogueClient.tsx": 5,
  "components/CommunicationsRoom.tsx": 6,
  "components/DeleteListingDialog.tsx": 2,
  "components/HomepageClient.tsx": 1,
  "components/ImportedDraftsWorkspace.tsx": 4,
  "components/ListingCorrespondence.tsx": 4,
  "components/MarketplaceControl.tsx": 2,
  "components/MobileWizard.tsx": 13,
  "components/NotificationsBell.tsx": 1,
  "components/PurchaseRequestForm.tsx": 2,
  "components/rail/catalogueCardStyles.ts": 1,
  "components/RemoveListingDialog.tsx": 1,
  "components/ReviewStep.tsx": 2,
  "components/SavedSearchesModule.tsx": 2,
  "components/SavedSearchQuickLinks.tsx": 1,
  "components/SaveSearchControl.tsx": 1,
  "components/SellerListingsRoom.tsx": 11,
  "components/SellerProfile.tsx": 6,
  "components/SellFlow.tsx": 1,
  "components/ShoppingBagRoom.tsx": 1,
  "components/VaultClusterReview.tsx": 1,
  "components/VaultGalaxy.tsx": 4,
};

const localRecipeConflicts = [
  /^(?:(?:[^:]+):)*!?font-(?:sans|display|thin|extralight|light|normal|medium|semibold|bold)$/,
  /^(?:(?:[^:]+):)*!?(?:italic|not-italic)$/,
  /^(?:(?:[^:]+):)*!?text-(?:xs|sm|base|lg|xl|[2-9]xl)(?:\/\S+)?$/,
  /^(?:(?:[^:]+):)*!?text-\[length:[^\]]+\](?:\/\S+)?$/,
  /^(?:(?:[^:]+):)*!?text-\(\s*length:[^)]+\)(?:\/\S+)?$/,
  /^(?:(?:[^:]+):)*!?text-\[(?:-?(?:\d+(?:\.\d*)?|\.\d+)(?:px|rem|em|vw|vh|vmin|vmax|ch|ex|cap|ic|lh|rlh|%)|(?:calc|min|max|clamp)\([^\]]+\))\](?:\/\S+)?$/,
  /^(?:(?:[^:]+):)*!?leading-/,
  /^(?:(?:[^:]+):)*!?tracking-/,
];

let bindingTotal = 0;
for (const [path, expected] of Object.entries(EXPECTED_BINDINGS)) {
  const candidates = path === "components/rail/catalogueCardStyles.ts"
    ? staticStrings(path)
    : classNameBindings(path);
  const governed = candidates.filter((value) => value.split(/\s+/).includes(RECIPE));
  assert.equal(governed.length, expected, `${path} binds only its adjudicated LS1-B3 roots`);
  bindingTotal += governed.length;
  for (const value of governed) {
    const tokens = value.split(/\s+/).filter(Boolean);
    assert.equal(tokens.filter((token) => token === RECIPE).length, 1, `${path}: the recipe is bound exactly once`);
    for (const token of tokens) {
      assert.ok(!localRecipeConflicts.some((pattern) => pattern.test(token)), `${path}: ${token} does not override the governed recipe`);
    }
  }
}
assert.equal(bindingTotal, 110, "all 88 LS1-B3 roots, 14 additive LS1-B4 bindings and 8 LS1-B6 auth/recovery states are governed");

const railSource = read("components/rail/catalogueCardStyles.ts");
assert.match(
  railSource,
  /export const railBody\s*=\s*["']fw-functional-copy text-\[var\(--muted\)\]["'];/,
  "railBody is the one governed shared root"
);
const catalogueRailReferences = staticStrings("components/CatalogueClient.tsx").filter((value) => value.includes("railBody")).length;
assert.equal(catalogueRailReferences, 0, "railBody references are expressions, not duplicated strings in Catalogue");
assert.equal(classNameIdentifierReferences("components/CatalogueClient.tsx", "railBody"), 3, "Catalogue renders railBody exactly three times");
assert.equal(classNameIdentifierReferences("components/SavedSearchesCard.tsx", "railBody"), 1, "Saved Searches renders railBody exactly once");

function countExactStatic(path, value) {
  return staticStrings(path).filter((entry) => entry === value).length;
}

function directAnchorClasses(path, { identifier, text }) {
  const classes = [];
  const visit = (node) => {
    if (ts.isJsxElement(node)) {
      const matches = node.children.some((child) => {
        if (
          identifier &&
          ts.isJsxExpression(child) &&
          child.expression &&
          ts.isIdentifier(child.expression)
        ) {
          return child.expression.text === identifier;
        }
        return Boolean(text && ts.isJsxText(child) && child.text.includes(text));
      });
      if (matches) {
        const className = node.openingElement.attributes.properties.find(
          (property) => ts.isJsxAttribute(property) && property.name.text === "className"
        );
        if (className && ts.isJsxAttribute(className) && className.initializer) {
          const expression = ts.isJsxExpression(className.initializer)
            ? className.initializer.expression
            : className.initializer;
          classes.push({
            staticValue: expression && ts.isStringLiteralLike(expression) ? expression.text : null,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceTree(path));
  return classes;
}

function assertFunctionalStateAnchor(path, anchor, label) {
  const classes = directAnchorClasses(path, anchor);
  assert.equal(classes.length, 1, `${label} has one direct rendered state owner`);
  assert.notEqual(classes[0].staticValue, null, `${label} keeps one unconditional static class value`);
  assert.ok(classes[0].staticValue.split(/\s+/).includes(RECIPE), `${label} binds the governed functional-copy recipe`);
}

for (const [path, identifier, label] of [
  ["app/login/page.tsx", "error", "login validation/network/credential error"],
  ["app/signup/page.tsx", "verifyError", "signup confirmation-code error"],
  ["app/signup/page.tsx", "resendMessage", "signup resend success/failure feedback"],
  ["app/signup/page.tsx", "error", "signup creation error"],
  ["app/forgot-password/page.tsx", "error", "forgot-password failure"],
  ["app/reset-password/page.tsx", "error", "reset-password/token failure"],
]) {
  assertFunctionalStateAnchor(path, { identifier }, label);
}
for (const path of ["app/signup/page.tsx", "app/reset-password/page.tsx"]) {
  assertFunctionalStateAnchor(path, { text: "Passwords don" }, `${path} password-mismatch validation`);
}

const AUTH_TRIPLET_CLASS = "font-display text-[12px] font-light italic leading-[1.5] text-[var(--muted)]";
for (const path of [
  "app/forgot-password/page.tsx",
  "app/login/page.tsx",
  "app/reset-password/page.tsx",
  "app/signup/page.tsx",
]) {
  assert.equal(countExactStatic(path, AUTH_TRIPLET_CLASS), 3, `${path} preserves all three auth marketing treatments`);
}

const PROTECTED_EXACT_CLASSES = [
  ["app/login/page.tsx", "mb-8 font-display text-[14px] font-light italic leading-[1.6] text-[var(--muted)]", 1, "login contextual welcome"],
  ["components/BrowseClient.tsx", "font-display text-[14px] font-light italic leading-[1.6] text-[var(--slate)]", 1, "Browse maxim"],
  ["components/MobileNav.tsx", "mt-1 font-display text-[13px] font-light italic text-[var(--platinum-dim)]", 1, "MobileNav literary greeting"],
  ["components/CatalogueClient.tsx", "mb-3 font-display text-[13px] font-light italic text-[var(--platinum-dim)]", 1, "Catalogue literary maxim"],
  ["components/CurrentHomepage.tsx", "mt-2 font-display text-[15px] font-light italic leading-[1.7] text-[var(--gold)] sm:hidden", 1, "current-homepage identity"],
  ["components/VaultGalaxy.tsx", "pointer-events-none fixed bottom-[10px] left-1/2 z-[6] -translate-x-1/2 text-center font-display text-[11px] italic text-[var(--muted)]", 1, "Vault disclosure"],
  ["components/VaultGalaxy.tsx", "font-display text-[15px] font-light italic leading-[1.8] tracking-[0.2px] text-[var(--muted)]", 1, "Vault archive line"],
  ["components/VaultSpecificationUpgrade.tsx", "mt-0.5 font-display italic text-[var(--muted)]", 1, "Vault admin aside"],
  ["components/reassurance/ListingDeclined.tsx", "mx-auto mb-8 max-w-[460px] font-display text-[15px] font-light italic leading-[1.8] text-[var(--slate)]", 1, "dormant declined reassurance"],
  ["components/reassurance/ListingSold.tsx", "mx-auto mb-6 max-w-[460px] font-display text-[15px] font-light italic leading-[1.8] text-[var(--slate)]", 1, "dormant sold reassurance"],
  ["components/reassurance/NoSearchResults.tsx", "mx-auto mb-6 max-w-[460px] font-display text-[15px] font-light italic leading-[1.8] text-[var(--slate)]", 1, "dormant no-results reassurance"],
  ["components/reassurance/SignInRequired.tsx", "mx-auto mb-6 max-w-[460px] font-display text-[15px] font-light italic leading-[1.8] text-[var(--slate)]", 1, "dormant sign-in reassurance"],
];
for (const [path, value, expected, label] of PROTECTED_EXACT_CLASSES) {
  assert.equal(countExactStatic(path, value), expected, `${label} remains byte-exact`);
}

for (const [path, label] of [
  ["components/VaultEntrance.tsx", "dormant Vault entrance"],
  ["components/AtlantisVaultEntrance.tsx", "dormant Atlantis entrance"],
]) {
  const source = read(path);
  assert.match(source, /fontFamily:\s*["']'Cormorant Garamond', serif["']/, `${label} keeps Cormorant`);
  assert.match(source, /fontSize:\s*(?:15|["']15px["'])/, `${label} keeps its 15px size`);
  assert.match(source, /fontWeight:\s*300/, `${label} keeps its light weight`);
  assert.match(source, /fontStyle:\s*["']italic["']/, `${label} keeps its italic posture`);
  assert.match(source, /lineHeight:\s*1\.8/, `${label} keeps its line height`);
  assert.match(source, /letterSpacing:\s*["']0\.2px["']/, `${label} keeps its tracking`);
  assert.doesNotMatch(source, new RegExp(`\\b${RECIPE}\\b`), `${label} receives no functional binding`);
}

for (const path of [
  "components/BrowseClient.tsx",
  "components/MobileNav.tsx",
  "components/CurrentHomepage.tsx",
  "components/VaultSpecificationUpgrade.tsx",
  "components/reassurance/ListingDeclined.tsx",
  "components/reassurance/ListingSold.tsx",
  "components/reassurance/NoSearchResults.tsx",
  "components/reassurance/SignInRequired.tsx",
]) {
  assert.doesNotMatch(read(path), new RegExp(`\\b${RECIPE}\\b`), `${path} remains outside LS1-B3`);
}

const DORMANT_TREATMENT_PATHS = new Set([
  "components/reassurance/ListingDeclined.tsx",
  "components/reassurance/ListingSold.tsx",
  "components/reassurance/NoSearchResults.tsx",
  "components/reassurance/SignInRequired.tsx",
  "components/VaultEntrance.tsx",
  "components/AtlantisVaultEntrance.tsx",
]);
const dormantPathKey = (path) => process.platform === "win32" ? path.toLowerCase() : path;
const DORMANT_TREATMENT_PATH_KEYS = new Set([...DORMANT_TREATMENT_PATHS].map(dormantPathKey));
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const EXCLUDED_SOURCE_PARTS = new Set([
  ".git",
  ".next",
  "build",
  "dist",
  "node_modules",
  "out",
  "scripts",
  "test",
  "tests",
  "__tests__",
]);
const EXCLUDED_SOURCE_ROOTS = new Set([
  ".claude",
  ".superpowers",
  "continuity",
  "docs",
  "public",
  "supabase",
]);
const EXCLUDED_SOURCE_FILES = new Set([
  "eslint.config.mjs",
  "next-env.d.ts",
  "next.config.ts",
  "postcss.config.mjs",
]);
const EXCLUDED_SOURCE_PATH_PREFIXES = ["app/api/evaluate"];

function toRepoPath(path) {
  return relative(rootPath, path).split(sep).join("/");
}

function hasExcludedSourcePathBoundary(path) {
  return EXCLUDED_SOURCE_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function isExcludedProductionPath(path) {
  const parts = path.split("/");
  return EXCLUDED_SOURCE_FILES.has(path) || EXCLUDED_SOURCE_ROOTS.has(parts[0]) || hasExcludedSourcePathBoundary(path) || parts.some((part) => {
    const lower = part.toLowerCase();
    return EXCLUDED_SOURCE_PARTS.has(lower) || /canary|scor(?:e|ing)|evaluation/.test(lower);
  }) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
}

assert.ok(isExcludedProductionPath("app/api/evaluate"), "api/evaluate directory is excluded before recursion");
assert.ok(isExcludedProductionPath("app/api/evaluate/future-probe.mts"), "api/evaluate descendants are excluded before reading");
assert.ok(isExcludedProductionPath("app/api/evaluate/route.ts"), "api/evaluate route is excluded before reading");

function productionSourcePaths(directory = rootPath, paths = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    const path = toRepoPath(absolutePath);
    if (isExcludedProductionPath(path)) continue;
    if (entry.isDirectory()) {
      productionSourcePaths(absolutePath, paths);
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name)) && !DORMANT_TREATMENT_PATHS.has(path)) {
      paths.push(path);
    }
  }
  return paths.sort();
}

const productionSources = productionSourcePaths();
for (const path of [
  "app/what-fairwatchtrade-can-do/page.tsx",
  "components/CurrentHomepage.tsx",
  "lib/brands.ts",
  "marketplace/page.tsx",
  "middleware.ts",
  "types/shipping.ts",
]) {
  assert.ok(productionSources.includes(path), `${path} remains in the production-source scan`);
}
assert.ok(!isExcludedProductionPath("data/future.ts"), "future data source remains eligible for the production-source scan");
for (const path of [
  ".claude/settings.json",
  ".superpowers/sdd/example.mjs",
  "continuity/derive.mjs",
  "docs/example.ts",
  "eslint.config.mjs",
  "next-env.d.ts",
  "next.config.ts",
  "postcss.config.mjs",
  "supabase/functions/example.ts",
]) {
  assert.ok(isExcludedProductionPath(path), `${path} is excluded before traversal or reading`);
  assert.ok(!productionSources.includes(path), `${path} is absent from the production-source scan`);
}

function resolvedDormantTarget(importer, specifier) {
  if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return null;
  const resolved = ts.resolveModuleName(
    specifier,
    join(rootPath, importer),
    typescriptResolutionOptions,
    ts.sys
  ).resolvedModule?.resolvedFileName;
  if (!resolved) return null;
  const path = toRepoPath(resolved);
  return DORMANT_TREATMENT_PATH_KEYS.has(dormantPathKey(path)) ? path : null;
}

function moduleSpecifiers(path) {
  const specifiers = [];
  const add = (node) => {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text);
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isDynamicImport || isRequire) add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceTree(path));
  return specifiers;
}

const dormantRevivalReferences = productionSources.flatMap((path) =>
  moduleSpecifiers(path).flatMap((specifier) => {
    const target = resolvedDormantTarget(path, specifier);
    return target ? [{ path, specifier, target }] : [];
  })
);
assert.equal(
  dormantRevivalReferences.length,
  0,
  `Dormant revival is blocked: ${dormantRevivalReferences.map(({ path, specifier, target }) => `${path} -> ${specifier} (${target})`).join(", ")}. An external production-source reference means the revived component must be corrected to the current governed semantic typography and this contract reconciled before shipment.`
);

assert.equal(countExactStatic("components/VaultSpecificationUpgrade.tsx", "mt-2 text-[12px] text-[var(--platinum-dim)]"), 1, "Vault admin aside keeps its inherited 12px parent");
assert.match(read("components/VaultSpecificationUpgrade.tsx"), /Nice try, you wanker\./, "Vault admin aside copy remains present");
assert.match(read("components/CurrentHomepage.tsx"), /MARKETPLACE_IDENTITY_CLARIFICATION_LINES_MOBILE/, "current-homepage identity source remains present");
assert.match(read("components/CatalogueClient.tsx"), /Every great library begins with a single volume\./, "Catalogue literary maxim remains present");

console.log("ls1-b3-functional-copy: 1 recipe, 88 base + 14 B4 + 8 B6 bindings (110 current), 4 rail consumers, 20 protected and 6 dormant treatments PASS");
