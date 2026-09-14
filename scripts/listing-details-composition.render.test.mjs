/* Listing Details compiled-CSS render contract.
   Build first, then run:
   node scripts/listing-details-composition.render.test.mjs */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const source = read("components/PurchaseRequestForm.tsx");
const start = source.indexOf("{/* B · LISTING DETAILS (read-only seller truth; collapsible) */}");
const end = source.indexOf("{/* C · OFFER PANEL (form or active state) */}");
assert.ok(start >= 0 && end > start, "the real Listing Details source boundary is readable");
const block = source.slice(start, end);

const classFrom = (pattern, label) => {
  const value = block.match(pattern)?.[1];
  assert.ok(value, `${label} class is readable from the real renderer`);
  return value;
};

const detailsClass = classFrom(/<details open className="([^"]+)"/, "details");
const summaryClass = classFrom(/<summary className="([^"]+)"/, "summary");
const provenanceClass = classFrom(/data-listing-details-provenance className="([^"]+)"/, "provenance");
const compositionClass = classFrom(/data-listing-details-composition className="([^"]+)"/, "composition");
const labelClasses = [...block.matchAll(/<dt className="([^"]+)"/g)].map((match) => match[1]);
assert.equal(labelClasses.length, 4, "the real renderer exposes the four governed labels");
const conditionClass = classFrom(/data-listing-details-primary[\s\S]*?<dd className="([^"]+)"/, "Condition value");
const factClasses = [...block.matchAll(/data-listing-details-package[\s\S]*?<dd className="([^"]+)"[\s\S]*?<dd className="([^"]+)"/g)][0]?.slice(1);
assert.equal(factClasses?.length, 2, "the real Included and Band value classes are readable");
const supportClass = classFrom(/data-listing-details-support className="([^"]+)"/, "Fulfillment owner");
const supportValueClass = classFrom(/data-listing-details-support[\s\S]*?<dd className="([^"]+)"/, "Fulfillment value");
const footerClass = classFrom(/data-listing-details-trust-footer className="([^"]+)"/, "trust footer");
assert.match(
  block,
  /className=\{`grid gap-5 \$\{listing\.condition \? "mt-5" : ""\} \$\{listing\.included \? "sm:grid-cols-2" : ""\}`\}/,
  "the real package owner conditionally exposes the wide two-column layout",
);

const cssRoot = path.join(root, ".next", "static", "chunks");
assert.ok(existsSync(cssRoot), "a current Next production build exists");
const cssFiles = readdirSync(cssRoot).filter((file) => file.endsWith(".css"));
assert.ok(cssFiles.length > 0, "the current Next production build provides compiled CSS");
const compiledCss = cssFiles.map((file) => readFileSync(path.join(cssRoot, file), "utf8")).join("\n");
const screenshotDir = process.env.FWT_LISTING_DETAILS_SCREENSHOTS;
if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });

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

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const results = [];
try {
  for (const fixture of fixtures) {
    const page = await browser.newPage();
    await page.setViewport({ width: fixture.width, height: fixture.height, deviceScaleFactor: fixture.scale });
    await page.setContent(`<!doctype html>
      <html data-theme="${fixture.appearance}">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>${compiledCss}</style>
        </head>
        <body class="bg-[var(--ink)] text-[var(--platinum)]">
          <main style="width:min(640px,calc(100vw - 32px));margin:24px auto">
            <details id="listing-details" open class="${detailsClass}">
              <summary id="summary" class="${summaryClass}">
                <h2 class="font-display text-[19px] font-light text-[var(--platinum)]">Listing details</h2>
                <span id="provenance" data-listing-details-provenance class="${provenanceClass}">Seller-provided details</span>
              </summary>
              <div data-listing-details-composition class="${compositionClass}">
                <dl id="primary" data-listing-details-primary>
                  <div>
                    <dt id="condition-label" class="${labelClasses[0]}">Condition</dt>
                    <dd id="condition-value" class="${conditionClass}">Very Good</dd>
                  </div>
                </dl>
                <dl id="package" data-listing-details-package class="grid gap-5 mt-5 sm:grid-cols-2">
                  <div id="included">
                    <dt class="${labelClasses[1]}">Included</dt>
                    <dd class="${factClasses[0]}">Watch and papers</dd>
                  </div>
                  <div id="band">
                    <dt class="${labelClasses[2]}">Band</dt>
                    <dd class="${factClasses[1]}">Strap · Folding / Deployant Clasp</dd>
                  </div>
                </dl>
                <dl id="support" data-listing-details-support class="${supportClass}">
                  <div>
                    <dt class="${labelClasses[3]}">Fulfillment</dt>
                    <dd id="support-value" class="${supportValueClass}">Shipping details will be confirmed with the seller.</dd>
                  </div>
                </dl>
                <div id="trust-footer" data-listing-details-trust-footer class="${footerClass}">Review these details from the seller before sending your request.</div>
              </div>
            </details>
          </main>
        </body>
      </html>`, { waitUntil: "domcontentloaded" });

    const measured = await page.evaluate(() => {
      const rect = (id) => document.querySelector(id).getBoundingClientRect();
      const style = (id) => getComputedStyle(document.querySelector(id));
      const details = document.querySelector("#listing-details");
      const packageOwner = document.querySelector("#package");
      const included = rect("#included");
      const band = rect("#band");
      const conditionLabel = style("#condition-label");
      const conditionValue = style("#condition-value");
      const supportValue = style("#support-value");
      const support = style("#support");
      const footer = style("#trust-footer");
      const openBefore = details.open;
      document.querySelector("#summary").click();
      const closedAfterClick = !details.open;
      document.querySelector("#summary").click();
      return {
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        detailsWidth: details.clientWidth,
        detailsScrollWidth: details.scrollWidth,
        openBefore,
        closedAfterClick,
        reopenedAfterClick: details.open,
        conditionLabelSize: Number.parseFloat(conditionLabel.fontSize),
        conditionValueSize: Number.parseFloat(conditionValue.fontSize),
        conditionNumerals: conditionValue.fontVariantNumeric,
        supportValueSize: Number.parseFloat(supportValue.fontSize),
        conditionWeight: conditionValue.fontWeight,
        packageColumns: getComputedStyle(packageOwner).gridTemplateColumns,
        packageSideBySide: Math.abs(included.top - band.top) < 1 && band.left > included.left,
        packageStacked: band.top > included.bottom,
        supportRule: `${support.borderTopWidth} ${support.borderTopStyle}`,
        footerRule: `${footer.borderTopWidth} ${footer.borderTopStyle}`,
        order: ["#primary", "#package", "#support", "#trust-footer"].map((id) => rect(id).top),
        detailsBackground: getComputedStyle(details).backgroundColor,
        provenanceDisplay: style("#provenance").display,
      };
    });

    if (screenshotDir) {
      await page.screenshot({
        path: path.join(screenshotDir, `${fixture.appearance}-${fixture.width}px.png`),
        fullPage: true,
      });
    }

    assert.equal(measured.width, fixture.width, `${fixture.name} uses its intended CSS width`);
    assert.equal(measured.documentWidth, fixture.width, `${fixture.name} ${fixture.appearance} has no page overflow`);
    assert.ok(measured.detailsScrollWidth <= measured.detailsWidth, `${fixture.name} ${fixture.appearance} Listing Details does not overflow`);
    assert.ok(measured.openBefore && measured.closedAfterClick && measured.reopenedAfterClick, `${fixture.name} ${fixture.appearance} retains native disclosure behavior`);
    assert.ok(measured.conditionValueSize > measured.conditionLabelSize, `${fixture.name} ${fixture.appearance} Condition value outranks its label`);
    assert.match(measured.conditionNumerals, /lining-nums/, `${fixture.name} ${fixture.appearance} the display value resolves lining numerals`);
    assert.ok(measured.conditionValueSize > measured.supportValueSize, `${fixture.name} ${fixture.appearance} Fulfillment remains subordinate to Condition`);
    assert.deepEqual([...measured.order].sort((a, b) => a - b), measured.order, `${fixture.name} ${fixture.appearance} preserves the governed fact order`);
    assert.equal(measured.supportRule, "1px solid", `${fixture.name} ${fixture.appearance} has one support separator`);
    assert.equal(measured.footerRule, "1px solid", `${fixture.name} ${fixture.appearance} has one trust-footer rule`);
    assert.equal(measured.provenanceDisplay, "block", `${fixture.name} ${fixture.appearance} provenance reads beneath the heading`);
    if (fixture.width >= 640) {
      assert.ok(measured.packageSideBySide, `${fixture.name} ${fixture.appearance} groups Included and Band in two supported columns`);
    } else {
      assert.ok(measured.packageStacked, `${fixture.name} ${fixture.appearance} stacks Included then Band naturally`);
    }

    results.push({
      appearance: fixture.appearance,
      viewport: `${fixture.width}x${fixture.height}@${fixture.scale}`,
      conditionPx: measured.conditionValueSize,
      supportPx: measured.supportValueSize,
      package: fixture.width >= 640 ? "two-column" : "stacked",
      overflow: false,
      disclosure: "open → closed → open",
      surface: measured.detailsBackground,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`Listing Details compiled render PASS\n${JSON.stringify(results, null, 2)}`);
