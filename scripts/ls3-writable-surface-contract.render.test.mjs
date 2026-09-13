/* LS-3 compiled-CSS render contract.
   Build first, then run:
   node scripts/ls3-writable-surface-contract.render.test.mjs */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { NATIVE_OPTION_STYLE } from "../lib/nativeOptionPresentation.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const cssRoot = path.join(root, ".next", "static", "chunks");
const cssFiles = readdirSync(cssRoot).filter((file) => file.endsWith(".css"));
assert.ok(cssFiles.length > 0, "a current Next production build provides compiled CSS");
const compiledCss = cssFiles.map((file) => readFileSync(path.join(cssRoot, file), "utf8")).join("\n");

const purchaseSource = read("components/PurchaseRequestForm.tsx");
const offerClassMatch = purchaseSource.match(
  /data-purchase-offer-for=\{listing\.id\}[\s\S]*?className="([^"]+)"/,
);
assert.ok(offerClassMatch, "the real full-page Purchase Request offer input class is readable");
let offerClass = offerClassMatch[1];
const mutateFixedDark = process.argv.includes("--mutate-fixed-dark");
const offerStyle = mutateFixedDark ? "background:#10131a" : "";

const adminControlSource = read("components/ListingStatusControls.tsx");
for (const expected of [
  'background: "var(--input-bg)"',
  'color: "var(--platinum)"',
  'border: "1px solid var(--input-line)"',
]) {
  assert.ok(adminControlSource.includes(expected), `Admin status select keeps ${expected}`);
}

const evidenceSource = read("components/IntegrityEvidencePanel.tsx");
const reviewerRule = evidenceSource.match(/\.reviewer-note\{([^}]*)\}/)?.[0];
const reviewerFocusRule = evidenceSource.match(/\.reviewer-note:focus\{([^}]*)\}/)?.[0];
assert.ok(reviewerRule && reviewerFocusRule, "the real Admin reviewer-note recipe and focus state are readable");

const executablePath = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean).find((candidate) => existsSync(candidate));
assert.ok(executablePath, "Chrome/Chromium is available (or CHROME_PATH is set)");

const fixtures = [
  { appearance: "light", width: 3072, height: 1728, scale: 1.25, name: "Dell 4K @125%" },
  { appearance: "dark", width: 3072, height: 1728, scale: 1.25, name: "Dell 4K @125%" },
  { appearance: "light", width: 360, height: 800, scale: 3, name: "synthetic XCover-width" },
  { appearance: "dark", width: 360, height: 800, scale: 3, name: "synthetic XCover-width" },
];

const parseColor = (value) => {
  const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
  if (value.startsWith("color(srgb")) return channels.slice(0, 3).map((channel) => channel * 255);
  return channels.slice(0, 3);
};
const linear = (channel) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = (rgb) => 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const results = [];
try {
  for (const fixture of fixtures) {
    const page = await browser.newPage();
    await page.setViewport({
      width: fixture.width,
      height: fixture.height,
      deviceScaleFactor: fixture.scale,
    });
    const optionStyle = `background-color:${NATIVE_OPTION_STYLE.backgroundColor};color:${NATIVE_OPTION_STYLE.color}`;
    await page.setContent(`<!doctype html>
      <html data-theme="${fixture.appearance}">
        <head><style>${compiledCss}\n${reviewerRule}\n${reviewerFocusRule}</style></head>
        <body class="bg-[var(--surface)] text-[var(--platinum)]">
          <main style="width:min(720px,100%);padding:24px">
            <input id="offer" class="${offerClass}" style="${offerStyle}" placeholder="0.00" aria-label="Your offer" />
            <select id="native-option" class="fw-input"><option style="${optionStyle}">USD</option></select>
            <section data-admin-dark style="margin-top:24px;padding:16px">
              <select id="admin-select" style="background:var(--input-bg);color:var(--platinum);border:1px solid var(--input-line)"><option>Published</option></select>
              <textarea id="reviewer-note" class="reviewer-note" placeholder="Reviewer note"></textarea>
            </section>
          </main>
        </body>
      </html>`, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async () => {
      const color = (element, pseudo) => getComputedStyle(element, pseudo).color;
      const background = (element) => getComputedStyle(element).backgroundColor;
      const offer = document.querySelector("#offer");
      const nativeOption = document.querySelector("#native-option option");
      const adminSelect = document.querySelector("#admin-select");
      const reviewer = document.querySelector("#reviewer-note");
      const inputProbe = document.createElement("div");
      inputProbe.style.background = "var(--input-bg)";
      document.body.append(inputProbe);
      const governedInputBackground = background(inputProbe);
      inputProbe.style.background = "var(--surface)";
      const governedFocusBackground = background(inputProbe);
      inputProbe.remove();

      const offerRest = {
        background: background(offer),
        color: color(offer),
        placeholder: color(offer, "::placeholder"),
      };
      offer.value = "7100";
      offer.focus();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const offerFocus = {
        background: background(offer),
        color: color(offer),
        activeElement: document.activeElement?.id,
        matchesFocus: offer.matches(":focus"),
      };
      const reviewerRestBorder = getComputedStyle(reviewer).borderTopColor;
      reviewer.focus();
      const reviewerFocusBorder = getComputedStyle(reviewer).borderTopColor;

      return {
        appearance: document.documentElement.dataset.theme,
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        governedInputBackground,
        governedFocusBackground,
        offerClass: offer.className,
        offerRest,
        offerFocus,
        nativeOption: { background: background(nativeOption), color: color(nativeOption) },
        adminSelect: { background: background(adminSelect), color: color(adminSelect) },
        reviewer: {
          background: background(reviewer),
          color: color(reviewer),
          restBorder: reviewerRestBorder,
          focusBorder: reviewerFocusBorder,
        },
      };
    });

    if (process.argv.includes("--debug")) console.error(JSON.stringify({ fixture, result }, null, 2));
    assert.equal(result.appearance, fixture.appearance, `${fixture.name} receives ${fixture.appearance}`);
    assert.equal(result.colorScheme, fixture.appearance, `${fixture.name} resolves ${fixture.appearance}`);
    assert.equal(result.width, fixture.width, `${fixture.name} uses its intended CSS width`);
    assert.equal(result.documentWidth, fixture.width, `${fixture.name} has no horizontal overflow`);
    assert.equal(
      result.offerRest.background,
      result.governedInputBackground,
      `${fixture.name} ${fixture.appearance} offer rests on --input-bg`,
    );
    assert.notEqual(
      result.offerFocus.background,
      result.offerRest.background,
      `${fixture.name} ${fixture.appearance} focus changes the active surface`,
    );
    assert.ok(
      contrast(parseColor(result.offerRest.color), parseColor(result.offerRest.background)) >= 4.5,
      `${fixture.name} ${fixture.appearance} entered value clears 4.5:1`,
    );
    assert.ok(
      contrast(parseColor(result.offerRest.placeholder), parseColor(result.offerRest.background)) >= 4.5,
      `${fixture.name} ${fixture.appearance} placeholder clears 4.5:1`,
    );
    assert.notEqual(
      result.offerRest.placeholder,
      result.offerRest.color,
      `${fixture.name} ${fixture.appearance} placeholder stays distinct from entered value`,
    );
    assert.equal(
      result.nativeOption.background,
      fixture.appearance === "light" ? "rgb(250, 247, 240)" : "rgb(20, 24, 33)",
      `${fixture.name} ${fixture.appearance} native option resolves its governed arm`,
    );
    assert.equal(
      result.nativeOption.color,
      fixture.appearance === "light" ? "rgb(37, 35, 31)" : "rgb(232, 228, 220)",
      `${fixture.name} ${fixture.appearance} native option text resolves its governed arm`,
    );
    assert.equal(result.adminSelect.background, "rgb(10, 13, 18)", `${fixture.name} Admin select stays permanently dark`);
    assert.equal(result.reviewer.background, "rgb(10, 13, 18)", `${fixture.name} Admin reviewer note stays permanently dark`);
    assert.notEqual(result.reviewer.restBorder, result.reviewer.focusBorder, `${fixture.name} Admin reviewer note exposes focus`);

    results.push({
      appearance: fixture.appearance,
      viewport: `${fixture.width}x${fixture.height}@${fixture.scale}`,
      offerRest: result.offerRest.background,
      offerFocus: result.offerFocus.background,
      valueContrast: contrast(parseColor(result.offerRest.color), parseColor(result.offerRest.background)).toFixed(2),
      placeholderContrast: contrast(parseColor(result.offerRest.placeholder), parseColor(result.offerRest.background)).toFixed(2),
      nativeOption: result.nativeOption,
      adminSurface: result.adminSelect.background,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`LS-3 writable-surface compiled render PASS\n${JSON.stringify(results, null, 2)}`);
