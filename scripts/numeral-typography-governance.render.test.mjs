/* Compiled-CSS numeral typography proof.
   Build first, then run:
   node scripts/numeral-typography-governance.render.test.mjs */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const listingIdSource = read("components/FwtListingId.tsx");
const browseSource = read("components/BrowseClient.tsx");

const idFace = listingIdSource.match(/fontFamily:\s*'([^']+)'/)?.[1];
assert.ok(idFace, "the real listing-code font family is readable from FwtListingId");
const cardClass = listingIdSource.match(/className=\{`([^`]*fw-tabular-nums[^`]*)\$\{className/)?.[1]?.trim();
assert.ok(cardClass, "the real listing-code card class is readable from FwtListingId");
const browseOwnerClass = browseSource.match(/<div className="([^"]*text-\[11px\][^"]*)">\s*\{row\.brand\}\s*<FwtListingId/s)?.[1];
assert.ok(browseOwnerClass, "the real Browse listing-code owner is readable");

const cssRoot = path.join(root, ".next", "static", "chunks");
assert.ok(existsSync(cssRoot), "a current Next production build exists");
const cssFiles = readdirSync(cssRoot).filter((file) => file.endsWith(".css"));
assert.ok(cssFiles.length > 0, "the current Next production build provides compiled CSS");
const compiledCss = cssFiles.map((file) => readFileSync(path.join(cssRoot, file), "utf8")).join("\n");

const screenshotDir = process.env.FWT_NUMERAL_SCREENSHOTS;
if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });
const executablePath = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean).find((candidate) => existsSync(candidate));
assert.ok(executablePath, "Chrome/Chromium is available (or CHROME_PATH is set)");

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const results = [];
try {
  for (const appearance of ["light", "dark"]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html>
      <html data-theme="${appearance}">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>${compiledCss}</style>
        </head>
        <body>
          <main style="width:420px;margin:32px;padding:20px;border:1px solid var(--border-faint)">
            <p id="inter">Inter 0123456789</p>
            <p id="cormorant" class="font-display" style="font-size:32px">Cormorant 0123456789</p>
            <input id="native-number" value="2026" aria-label="Native numeral inheritance proof" />
            <div id="browse-owner" class="${browseOwnerClass}" style="margin-top:24px">
              BREITLING <span aria-hidden="true">·</span>
              <span id="p-code" style='font-family:${idFace}' class="${cardClass}">P34666</span>
            </div>
            <div class="${browseOwnerClass}">
              ROLEX <span aria-hidden="true">·</span>
              <span id="m-code" style='font-family:${idFace}' class="${cardClass}">M55915</span>
            </div>
            <div id="width-fixture" class="${browseOwnerClass}" style="position:absolute;left:-9999px;white-space:nowrap">
              <span id="ones" style='font-family:${idFace}' class="${cardClass}">111111</span>
              <span id="eights" style='font-family:${idFace}' class="${cardClass}">888888</span>
            </div>
          </main>
        </body>
      </html>`, { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts.ready);

    const measured = await page.evaluate(() => {
      const style = (id) => getComputedStyle(document.querySelector(id));
      const rect = (id) => document.querySelector(id).getBoundingClientRect();
      const owner = document.querySelector("#browse-owner");
      return {
        interVariant: style("#inter").fontVariantNumeric,
        interFont: style("#inter").fontFamily,
        cormorantVariant: style("#cormorant").fontVariantNumeric,
        cormorantFont: style("#cormorant").fontFamily,
        nativeVariant: style("#native-number").fontVariantNumeric,
        pVariant: style("#p-code").fontVariantNumeric,
        mVariant: style("#m-code").fontVariantNumeric,
        codeFont: style("#p-code").fontFamily,
        codeFontSize: style("#p-code").fontSize,
        codeLetterSpacing: style("#p-code").letterSpacing,
        onesWidth: rect("#ones").width,
        eightsWidth: rect("#eights").width,
        ownerWidth: owner.clientWidth,
        ownerScrollWidth: owner.scrollWidth,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
      };
    });

    assert.match(measured.interVariant, /lining-nums/, `${appearance} Inter inherits lining figures`);
    assert.match(measured.cormorantVariant, /lining-nums/, `${appearance} Cormorant inherits lining figures`);
    assert.match(measured.nativeVariant, /lining-nums/, `${appearance} native controls inherit lining figures without a selector fork`);
    for (const [code, variant] of [["P34666", measured.pVariant], ["M55915", measured.mVariant]]) {
      assert.match(variant, /lining-nums/, `${appearance} ${code} preserves lining figures`);
      assert.match(variant, /tabular-nums/, `${appearance} ${code} uses tabular figures`);
      assert.doesNotMatch(variant, /oldstyle-nums|normal/, `${appearance} ${code} does not reset numeral form`);
    }
    assert.ok(
      Math.abs(measured.onesWidth - measured.eightsWidth) <= 0.5,
      `${appearance} actual listing-code font has usable tabular advances (111111=${measured.onesWidth}px, 888888=${measured.eightsWidth}px; difference <= 0.5 CSS px; font=${measured.codeFont})`,
    );
    assert.ok(measured.ownerScrollWidth <= measured.ownerWidth, `${appearance} real Browse code owner does not overflow`);
    assert.equal(measured.documentWidth, measured.viewportWidth, `${appearance} numeral fixture does not overflow the viewport`);

    if (screenshotDir) {
      await page.screenshot({ path: path.join(screenshotDir, `${appearance}-browse-codes.png`), fullPage: true });
    }

    results.push({
      appearance,
      inter: measured.interVariant,
      interFont: measured.interFont,
      cormorant: measured.cormorantVariant,
      cormorantFont: measured.cormorantFont,
      nativeControl: measured.nativeVariant,
      listingCode: measured.pVariant,
      listingCodeFont: measured.codeFont,
      listingCodeSize: measured.codeFontSize,
      listingCodeTracking: measured.codeLetterSpacing,
      tabularAdvanceDifferencePx: Number(Math.abs(measured.onesWidth - measured.eightsWidth).toFixed(3)),
      overflow: false,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`Numeral typography compiled render PASS\n${JSON.stringify(results, null, 2)}`);
