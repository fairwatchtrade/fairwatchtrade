/* LS-2 Admin permanent-dark actual-surface contract.

   Start the app in development, then run:
     node scripts/ls2-admin-status-parity-gallery.render.test.mjs */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const url = process.env.LS2_ADMIN_GALLERY_URL ??
  "http://127.0.0.1:3100/internal/ls2-admin-status-parity-gallery";
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
assert.ok(executablePath, "Chrome/Chromium is available (or CHROME_PATH is set)");

const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
try {
  for (const appearance of ["light", "dark"]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 3072, height: 1728, deviceScaleFactor: 1.25 });
    await page.setCookie({
      name: "fwt-appearance",
      value: appearance,
      url: new URL(url).origin,
      sameSite: "Lax",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector('[data-fixture-gallery="ls2-admin-status-parity"]');
    assert.ok(page.url().endsWith("/admin/internal/ls2-admin-status-parity-gallery"), "ordered doorway reaches the Admin-owned gallery");

    const result = await page.evaluate(() => {
      const gallery = document.querySelector('[data-fixture-gallery="ls2-admin-status-parity"]');
      const scope = gallery.closest("[data-admin-dark]");
      const wrapper = document.querySelector("[data-admin-dark]");
      const listingMarkers = [...document.querySelectorAll("[data-admin-listing-status]")];
      const requestMarkers = [...document.querySelectorAll("[data-admin-purchase-request-status]")];
      const controls = [...document.querySelectorAll("[data-admin-native-control]")];
      return {
        htmlTheme: document.documentElement.dataset.theme,
        scopeScheme: getComputedStyle(scope).colorScheme,
        wrapperDisplay: getComputedStyle(wrapper).display,
        galleryScheme: getComputedStyle(gallery).colorScheme,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        listingCount: listingMarkers.length,
        requestCount: requestMarkers.length,
        listingColors: Object.fromEntries(listingMarkers.map((element) => [
          element.dataset.adminListingStatus,
          getComputedStyle(element).color,
        ])),
        requestColors: requestMarkers.map((element) => ({
          status: element.dataset.adminPurchaseRequestStatus,
          cause: element.dataset.adminPurchaseRequestClosure ?? "",
          governance: element.dataset.adminPurchaseRequestGovernance,
          color: getComputedStyle(element.querySelector(".fw-lifecycle-label")).color,
        })),
        controlSchemes: controls.map((element) => getComputedStyle(element).colorScheme),
      };
    });

    if (process.env.LS2_ADMIN_GALLERY_DEBUG === "1") {
      console.log(JSON.stringify({ appearance, result }, null, 2));
    }

    assert.equal(result.htmlTheme, appearance);
    assert.equal(result.scopeScheme, "dark");
    assert.equal(result.galleryScheme, "dark");
    assert.equal(result.wrapperDisplay, "contents");
    assert.equal(result.documentWidth, result.viewportWidth, `${appearance}: no horizontal overflow at Dell reference width`);
    assert.equal(result.listingCount, 8, `${appearance}: seven canonical listing states plus unknown`);
    assert.equal(result.requestCount, 10, `${appearance}: complete PR/cancellation matrix`);
    assert.ok(result.controlSchemes.every((scheme) => scheme === "dark"), `${appearance}: native controls inherit dark scheme`);
    assert.notEqual(result.listingColors.published, result.listingColors.rejected);
    assert.notEqual(result.listingColors.pending_review, result.listingColors.draft);
    assert.notEqual(result.listingColors.private_active, result.listingColors.reserved);
    const byStatus = (status) => result.requestColors.find((item) => item.status === status);
    assert.notEqual(byStatus("accepted").color, byStatus("declined").color);
    assert.notEqual(byStatus("accepted").color, byStatus("pending").color);
    assert.equal(byStatus("expired").governance, "governance-pending");
    assert.equal(byStatus("unknown_state").governance, "neutral");
    assert.deepEqual(errors, []);
    await page.close();
  }

  const narrow = await browser.newPage();
  await narrow.setViewport({ width: 360, height: 800, deviceScaleFactor: 3 });
  await narrow.setCookie({
    name: "fwt-appearance",
    value: "light",
    url: new URL(url).origin,
    sameSite: "Lax",
  });
  await narrow.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await narrow.waitForSelector('[data-fixture-gallery="ls2-admin-status-parity"]');
  const narrowResult = await narrow.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
    labels: [...document.querySelectorAll("[data-admin-listing-status]")].map((element) => ({
      text: element.textContent.trim(),
      width: element.getBoundingClientRect().width,
      parentWidth: element.parentElement.getBoundingClientRect().width,
    })),
    requests: [...document.querySelectorAll("[data-admin-purchase-request-status]")].map((element) => ({
      width: element.getBoundingClientRect().width,
      parentWidth: element.parentElement.getBoundingClientRect().width,
    })),
  }));
  assert.equal(narrowResult.documentWidth, narrowResult.viewportWidth, "narrow gallery has no horizontal overflow");
  assert.ok(narrowResult.labels.every((item) => item.width <= item.parentWidth), "listing labels remain inside their cards");
  assert.ok(narrowResult.requests.every((item) => item.width <= item.parentWidth), "PR state and closure remain inside their cards");
  await narrow.close();
} finally {
  await browser.close();
}

console.log("LS-2 Admin gallery render PASS: Admin stays dark under Light/Dark preference, markers remain distinct, native controls inherit dark, and the neutral wrapper does not overflow.");
