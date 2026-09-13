/* LS-3 writable-surface contract.
   Run: node scripts/ls3-writable-surface-contract.test.mjs */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productRoots = ["app", "components"];
const controlTags = new Set(["input", "select", "textarea", "option"]);
const nonTextInputTypes = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);
const fixedUtilityPattern = /(?:^|\s)(?:[^\s:]+:)*bg-(?:\[#[0-9a-f]{3,8}\]|black(?:\/[^\s]+)?|white(?:\/[^\s]+)?)(?=\s|$)/gi;
const fixedStylePattern = /\b(?:background|backgroundColor)\s*:\s*["'`](?:#[0-9a-f]{3,8}|rgba?\s*\()/gi;
const fixedCssPattern = /\b(?:background|background-color)\s*:\s*(?:#[0-9a-f]{3,8}|rgba?\s*\()/gi;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [absolute] : [];
  });
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function tagName(node) {
  return node.tagName.getText().toLowerCase();
}

function attribute(node, name) {
  return node.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

function attributeText(node, name, sourceFile) {
  const target = attribute(node, name);
  if (!target?.initializer) return "";
  if (ts.isStringLiteral(target.initializer)) return target.initializer.text;
  if (ts.isJsxExpression(target.initializer) && target.initializer.expression) {
    return target.initializer.expression.getText(sourceFile);
  }
  return "";
}

function staticClassNames(node) {
  const target = attribute(node, "className");
  if (!target?.initializer) return [];
  if (ts.isStringLiteral(target.initializer)) return target.initializer.text.split(/\s+/).filter(Boolean);
  if (
    ts.isJsxExpression(target.initializer) &&
    target.initializer.expression &&
    (ts.isStringLiteral(target.initializer.expression) || ts.isNoSubstitutionTemplateLiteral(target.initializer.expression))
  ) {
    return target.initializer.expression.text.split(/\s+/).filter(Boolean);
  }
  return [];
}

function collectConstInitializers(sourceFile) {
  const bindings = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      bindings.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return bindings;
}

function resolvedExpressionText(expression, sourceFile, bindings) {
  if (ts.isIdentifier(expression) && bindings.has(expression.text)) {
    return bindings.get(expression.text).getText(sourceFile);
  }
  return expression.getText(sourceFile);
}

function isInScopeControl(node, sourceFile) {
  if (tagName(node) !== "input") return true;
  const type = attributeText(node, "type", sourceFile).replace(/["'`]/g, "").toLowerCase();
  return !nonTextInputTypes.has(type);
}

function cssRuleViolations(source, classNames) {
  const matches = [];
  for (const className of classNames) {
    if (!/^[a-zA-Z_-][\w-]*$/.test(className)) continue;
    const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rulePattern = new RegExp(`\\.${escaped}\\s*\\{([^}]*)\\}`, "g");
    for (const rule of source.matchAll(rulePattern)) {
      for (const fixed of rule[1].matchAll(fixedCssPattern)) {
        matches.push(`${className}: ${fixed[0]}`);
      }
    }
  }
  return matches;
}

const violations = [];
for (const relativeRoot of productRoots) {
  for (const absolute of walk(path.join(root, relativeRoot))) {
    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    if (relative.startsWith("app/internal/")) continue;

    const source = readFileSync(absolute, "utf8");
    const sourceFile = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const bindings = collectConstInitializers(sourceFile);

    function visit(node) {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && controlTags.has(tagName(node))) {
        if (!isInScopeControl(node, sourceFile)) return;

        const classText = attributeText(node, "className", sourceFile);
        const classViolations = [...classText.matchAll(fixedUtilityPattern)].map((match) => match[0].trim());

        const styleAttribute = attribute(node, "style");
        let styleViolations = [];
        if (
          styleAttribute?.initializer &&
          ts.isJsxExpression(styleAttribute.initializer) &&
          styleAttribute.initializer.expression
        ) {
          const styleText = resolvedExpressionText(styleAttribute.initializer.expression, sourceFile, bindings);
          styleViolations = [...styleText.matchAll(fixedStylePattern)].map((match) => match[0]);
        }

        const ruleViolations = cssRuleViolations(source, staticClassNames(node));
        const found = [...classViolations, ...styleViolations, ...ruleViolations];
        if (found.length > 0) {
          violations.push({
            file: relative,
            line: lineOf(sourceFile, node),
            control: tagName(node),
            fixedSurface: [...new Set(found)].join(", "),
          });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
}

if (violations.length > 0) {
  console.error("LS-3 fixed writable-surface bypasses:\n");
  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${violation.line} <${violation.control}> ${violation.fixedSurface}`,
    );
  }
  console.error("");
}

assert.equal(
  violations.length,
  0,
  "in-scope writable controls must consume appearance-governed surfaces",
);

console.log("LS-3 writable-surface contract PASS: no fixed literal product control surfaces.");
