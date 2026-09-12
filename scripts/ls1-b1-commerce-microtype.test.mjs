/* LS1-B1 — transaction and lifecycle microtype.

   Run: node scripts/ls1-b1-commerce-microtype.test.mjs

   This is the bounded cross-surface contract from the completed LS-1 return.
   It deliberately does not census every small label. It proves that the 47
   named commerce facts, lifecycle labels and validity states share one of
   three readable Inter recipes, while color, geometry and product semantics
   remain with their existing owners. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const RECIPES = {
  "fw-transaction-fact": {
    "font-family": "'Inter', sans-serif",
    "font-size": "11px",
    "font-style": "normal",
    "font-weight": "400",
    "line-height": "1.45",
    "letter-spacing": "0.4px",
  },
  "fw-lifecycle-label": {
    "font-family": "'Inter', sans-serif",
    "font-size": "11px",
    "font-style": "normal",
    "font-weight": "400",
    "line-height": "1.4",
    "letter-spacing": "1px",
  },
  "fw-validity-state": {
    "font-family": "'Inter', sans-serif",
    "font-size": "11px",
    "font-style": "normal",
    "font-weight": "400",
    "line-height": "1.4",
    "letter-spacing": "0.8px",
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

function staticClassText(initializer) {
  if (!initializer) return "";
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return "";
  const expression = initializer.expression;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  if (ts.isTemplateExpression(expression)) {
    return [expression.head.text, ...expression.templateSpans.map((span) => span.literal.text)].join(" ");
  }
  if (ts.isBinaryExpression(expression)) {
    const collect = (node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
      if (ts.isBinaryExpression(node)) return `${collect(node.left)} ${collect(node.right)}`;
      return "";
    };
    return collect(expression);
  }
  return "";
}

function governedBindings(path) {
  const source = read(path);
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.text === "className") {
      const text = staticClassText(node.initializer);
      const tokens = text.split(/\s+/).filter(Boolean);
      const recipe = Object.keys(RECIPES).find((name) => tokens.includes(name));
      if (recipe) {
        found.push({ recipe, text, tokens });
        assert.ok(
          !tokens.some((token) => /^text-\[(?:7|8|9|10)px\]$/.test(token)),
          `${path}: ${recipe} is not overridden below the 11px floor`
        );
        assert.ok(
          !tokens.some((token) => /^font-(?:sans|display|thin|extralight|light|normal|medium|semibold|bold)$/.test(token)),
          `${path}: ${recipe} owns face and weight`
        );
        assert.ok(!tokens.some((token) => token === "italic" || token === "not-italic"), `${path}: ${recipe} owns posture`);
        assert.ok(!tokens.some((token) => token.startsWith("tracking-")), `${path}: ${recipe} owns tracking`);
        assert.ok(!tokens.some((token) => token.startsWith("leading-")), `${path}: ${recipe} owns line height`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

const EXPECTED_BINDINGS = {
  "components/PurchaseRequestForm.tsx": {
    "fw-transaction-fact": 6,
    "fw-lifecycle-label": 0,
    "fw-validity-state": 1,
  },
  "components/TradeOffersModule.tsx": {
    "fw-transaction-fact": 0,
    "fw-lifecycle-label": 8,
    "fw-validity-state": 0,
  },
  "components/WantedWorkspace.tsx": {
    "fw-transaction-fact": 0,
    "fw-lifecycle-label": 1,
    "fw-validity-state": 8,
  },
  "components/WantedRequestsModule.tsx": {
    "fw-transaction-fact": 0,
    "fw-lifecycle-label": 1,
    "fw-validity-state": 7,
  },
  "components/CatalogueClient.tsx": {
    "fw-transaction-fact": 3,
    "fw-lifecycle-label": 3,
    "fw-validity-state": 0,
  },
  "components/CommunicationsRoom.tsx": {
    "fw-transaction-fact": 2,
    "fw-lifecycle-label": 2,
    "fw-validity-state": 0,
  },
  "components/ShoppingBagRoom.tsx": {
    "fw-transaction-fact": 2,
    "fw-lifecycle-label": 2,
    "fw-validity-state": 0,
  },
  "components/ShoppingBagEntrance.tsx": {
    "fw-transaction-fact": 0,
    "fw-lifecycle-label": 1,
    "fw-validity-state": 0,
  },
};

let total = 0;
for (const [path, expected] of Object.entries(EXPECTED_BINDINGS)) {
  const found = governedBindings(path);
  const actual = Object.fromEntries(Object.keys(RECIPES).map((name) => [name, found.filter((item) => item.recipe === name).length]));
  assert.deepEqual(actual, expected, `${path} binds only its LS1-B1 semantic roles`);
  total += found.length;
}
assert.equal(total, 47, "all 47 LS1-B1 commerce microtype bindings are governed");

console.log("ls1-b1-commerce-microtype: 3 recipes and 47 bindings PASS");
