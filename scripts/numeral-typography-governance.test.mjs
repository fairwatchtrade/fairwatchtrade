/* Sitewide numeral typography governance contract.
   Run: node scripts/numeral-typography-governance.test.mjs */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const globalCss = read("app/globals.css");
const listingIdSource = read("components/FwtListingId.tsx");

assert.match(
  globalCss,
  /html\s*\{[^}]*font-variant-numeric\s*:\s*lining-nums\s*;/s,
  "the inherited html typography owner must require lining numerals",
);
assert.match(
  globalCss,
  /\.fw-tabular-nums\s*\{[^}]*font-variant-numeric\s*:\s*lining-nums\s+tabular-nums\s*;/s,
  "the governed structured-numeral utility must preserve lining and tabular figures",
);
assert.equal(
  (listingIdSource.match(/\bfw-tabular-nums\b/g) ?? []).length,
  2,
  "both card and detail variants of the shared FWT listing-code owner must use tabular lining figures",
);

const productRoots = ["app", "components", "lib"];
const productExtensions = new Set([".css", ".js", ".jsx", ".ts", ".tsx"]);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return entry.isFile() && productExtensions.has(path.extname(entry.name)) ? [absolute] : [];
  });
}

function withoutComments(source, extension) {
  if (extension === ".css") {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\r\n]/g, " "))
      .replace(/(^|\s)\/\/.*$/gm, (comment) => comment.replace(/[^\r\n]/g, " "));
  }

  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, source);
  let result = "";
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const tokenText = scanner.getTokenText();
    result += token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia
      ? tokenText.replace(/[^\r\n]/g, " ")
      : tokenText;
  }
  return result;
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

const violations = [];
for (const productRoot of productRoots) {
  for (const absolute of walk(path.join(root, productRoot))) {
    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    const source = readFileSync(absolute, "utf8");
    const executable = withoutComments(source, path.extname(absolute));

    const report = (match, reason) => {
      violations.push(`${relative}:${lineNumber(executable, match.index)} ${reason}: ${match[0].trim()}`);
    };

    for (const match of executable.matchAll(/(?:^|[\s"'`])(?:oldstyle-nums|normal-nums)(?=$|[\s"'`])/gm)) {
      report(match, "prohibited numeral reset");
    }
    for (const match of executable.matchAll(/(?:^|[\s"'`])(?:tabular-nums|proportional-nums|diagonal-fractions|stacked-fractions|slashed-zero)(?=$|[\s"'`])/gm)) {
      report(match, "ungoverned local numeric utility");
    }
    for (const match of executable.matchAll(/font-variant(?!-numeric)\s*:\s*[^;}\n]+/gi)) {
      report(match, "font-variant shorthand can reset lining figures");
    }
    for (const match of executable.matchAll(/font-variant-numeric\s*:\s*([^;}\n]+)/gi)) {
      if (!/\blining-nums\b/i.test(match[1])) report(match, "local numeric owner omits lining figures");
    }
    for (const match of executable.matchAll(/fontVariantNumeric\s*:\s*["'`]([^"'`]+)["'`]/g)) {
      if (!/\blining-nums\b/i.test(match[1])) report(match, "inline numeric owner omits lining figures");
    }
    for (const match of executable.matchAll(/(?:font-feature-settings|fontFeatureSettings)\s*:\s*([^;}\n]+)/gi)) {
      const value = match[1];
      const enablesOldstyle = /["']onum["']\s*(?:1|on)?/i.test(value);
      const disablesLining = /["']lnum["']\s*(?:0|off)/i.test(value);
      const ownsNumericFeature = /["'](?:lnum|onum|tnum|pnum|frac|afrc)["']/i.test(value);
      const preservesLining = /["']lnum["']\s*(?:1|on)/i.test(value);
      if (enablesOldstyle || disablesLining || (ownsNumericFeature && !preservesLining)) {
        report(match, "OpenType numeric feature owner violates the lining law");
      }
    }
    for (const match of executable.matchAll(/(?:^|[;{])\s*font\s*:\s*([^;}\n]+)/gim)) {
      const value = match[1].trim();
      if (value !== "inherit" && value !== "string") {
        report(match, "font shorthand can reset lining figures");
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Numeral typography governance violations:\n");
  for (const violation of violations) console.error(`- ${violation}`);
  console.error("");
}

assert.equal(
  violations.length,
  0,
  "rendered product source must not request old-style figures or cancel the inherited lining owner",
);

console.log("Numeral typography governance PASS: global lining owner, governed tabular owner, and no reset doors.");
