/* LS-2 Notification actual-surface render contract.

   Start the app on port 3100, then run:
     node scripts/ls2-notification-state-gallery.render.test.mjs

   Override LS2_NOTIFICATION_GALLERY_URL or CHROME_PATH when needed. */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const url =
  process.env.LS2_NOTIFICATION_GALLERY_URL ??
  "http://127.0.0.1:3100/internal/ls2-notification-state-gallery";

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
assert.ok(executablePath, "Chrome/Chromium is available (or CHROME_PATH is set)");

const fixtures = [
  { appearance: "light", name: "Dell 4K @125% / browser 100%", width: 3072, height: 1728, scale: 1.25 },
  { appearance: "dark", name: "Dell 4K @125% / browser 100%", width: 3072, height: 1728, scale: 1.25 },
  { appearance: "light", name: "synthetic XCover-width", width: 360, height: 800, scale: 3 },
  { appearance: "dark", name: "synthetic XCover-width", width: 360, height: 800, scale: 3 },
];

const parseColor = (value) => {
  const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
  if (value.startsWith("color(srgb")) {
    return [...channels.slice(0, 3).map((channel) => channel * 255), channels[3] ?? 1];
  }
  return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0, channels[3] ?? 1];
};
const composite = (foreground, background) => {
  const [fr, fg, fb, fa] = parseColor(foreground);
  const [br, bg, bb] = parseColor(background);
  return [
    fr * fa + br * (1 - fa),
    fg * fa + bg * (1 - fa),
    fb * fa + bb * (1 - fa),
    1,
  ];
};
const linear = (channel) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = (rgba) => {
  const [r, g, b] = rgba.slice(0, 3).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastRgba = (foreground, background) => {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
const contrast = (foreground, background) =>
  contrastRgba(parseColor(foreground), parseColor(background));

const expectedScenarios = [
  "empty-zero",
  "history-zero",
  "one-unread",
  "nine-unread",
  "ten-plus",
  "mixed-read-unread",
  "long-message",
  "routable",
  "non-routable",
  "unknown-type",
  "unread-to-read",
  "count-cue-mismatch",
].sort();

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
    await page.setCookie({
      name: "fwt-appearance",
      value: fixture.appearance,
      url: new URL(url).origin,
      sameSite: "Lax",
    });

    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector('[data-fixture-gallery="ls2-notification-state"]', { timeout: 15_000 });

    const result = await page.evaluate(() => {
      const scenarios = [...document.querySelectorAll("[data-notification-scenario]")];
      const scenarioKeys = scenarios.map((node) => node.getAttribute("data-notification-scenario")).sort();
      const cues = [...document.querySelectorAll("[data-notification-unread-cue]")];
      const unreadRows = [...document.querySelectorAll('[data-notification-read-state="unread"]')];
      const readRows = [...document.querySelectorAll('[data-notification-read-state="read"]')];
      const cueDetails = cues.map((cue) => {
        const row = cue.closest("[data-notification-read-state]");
        const message = row?.querySelector("[data-notification-message]");
        const style = getComputedStyle(cue);
        const panel = cue.closest("[data-notification-panel]");
        const panelStyle = panel ? getComputedStyle(panel) : null;
        const rect = cue.getBoundingClientRect();
        const messageRect = message?.getBoundingClientRect();
        let current = cue;
        let hiddenFromAccessibility = false;
        let effectiveOpacity = 1;
        while (current) {
          if (current.getAttribute("aria-hidden") === "true" || current.hasAttribute("hidden") || current.hasAttribute("inert")) {
            hiddenFromAccessibility = true;
          }
          effectiveOpacity *= Number(getComputedStyle(current).opacity);
          current = current.parentElement;
        }
        return {
          text: cue.textContent?.trim(),
          state: row?.getAttribute("data-notification-read-state"),
          color: style.color,
          background: panelStyle?.backgroundColor ?? "",
          visible: rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && effectiveOpacity > 0,
          effectiveOpacity,
          hiddenFromAccessibility,
          overlapsMessage: Boolean(messageRect && rect.top < messageRect.bottom - 0.5),
        };
      });
      const readCueCount = readRows.reduce(
        (sum, row) => sum + row.querySelectorAll("[data-notification-unread-cue]").length,
        0,
      );
      const panelsWithinViewport = [...document.querySelectorAll("[data-notification-panel]")].every((panel) => {
        const rect = panel.getBoundingClientRect();
        return rect.left >= -0.5 && rect.right <= document.documentElement.clientWidth + 0.5;
      });
      const scenario = (key) => document.querySelector(`[data-notification-scenario="${key}"]`);
      const bell = (key) => scenario(key)?.querySelector("[data-notification-bell]");
      const mismatch = scenario("count-cue-mismatch");
      const longRow = scenario("long-message")?.querySelector("[data-notification-read-state]");
      return {
        scenarioKeys,
        cueDetails,
        unreadRows: unreadRows.length,
        readRows: readRows.length,
        readCueCount,
        panelsWithinViewport,
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        oneAria: bell("one-unread")?.getAttribute("aria-label"),
        nineVisual: bell("nine-unread")?.querySelector("[data-notification-visible-count]")?.textContent?.trim(),
        nineAria: bell("nine-unread")?.getAttribute("aria-label"),
        tenVisual: bell("ten-plus")?.querySelector("[data-notification-visible-count]")?.textContent?.trim(),
        tenAria: bell("ten-plus")?.getAttribute("aria-label"),
        zeroBadgeCount: bell("empty-zero")?.querySelectorAll("[data-notification-visible-count]").length,
        historyMarkAll: scenario("history-zero")?.querySelector("[data-mark-all-visible]")?.getAttribute("data-mark-all-visible"),
        oneMarkAll: scenario("one-unread")?.querySelector("[data-mark-all-visible]")?.getAttribute("data-mark-all-visible"),
        mismatchAria: bell("count-cue-mismatch")?.getAttribute("aria-label"),
        mismatchCueCount: mismatch?.querySelectorAll("[data-notification-unread-cue]").length,
        mismatchDeclared: mismatch?.getAttribute("data-count-cue-mismatch"),
        mismatchVisibleUnreadRows: mismatch?.getAttribute("data-visible-unread-rows"),
        routableHref: scenario("routable")?.querySelector("a")?.getAttribute("href"),
        nonRoutableRows: scenario("non-routable")?.querySelectorAll("[data-notification-non-link-row]").length,
        unknownMessage: scenario("unknown-type")?.querySelector("[data-notification-message]")?.textContent?.trim(),
        longRowWithinPanel: (() => {
          if (!longRow) return false;
          const rowRect = longRow.getBoundingClientRect();
          const panelRect = longRow.closest("[data-notification-panel]")?.getBoundingClientRect();
          return Boolean(panelRect && rowRect.left >= panelRect.left && rowRect.right <= panelRect.right + 0.5);
        })(),
      };
    });

    await page.focus('[data-notification-scenario="mixed-read-unread"] a');
    const focused = await page.evaluate(() => {
      const link = document.activeElement;
      const cue = link?.querySelector("[data-notification-unread-cue]");
      const panel = link?.closest("[data-notification-panel]");
      return {
        tag: link?.tagName,
        cueColor: cue ? getComputedStyle(cue).color : "",
        rowBackground: link ? getComputedStyle(link).backgroundColor : "",
        panelBackground: panel ? getComputedStyle(panel).backgroundColor : "",
      };
    });
    await page.hover('[data-notification-scenario="one-unread"] a');
    const hovered = await page.evaluate(() => {
      const link = document.querySelector('[data-notification-scenario="one-unread"] a');
      const cue = link?.querySelector("[data-notification-unread-cue]");
      const panel = link?.closest("[data-notification-panel]");
      return {
        active: link?.matches(":hover"),
        cueColor: cue ? getComputedStyle(cue).color : "",
        rowBackground: link ? getComputedStyle(link).backgroundColor : "",
        panelBackground: panel ? getComputedStyle(panel).backgroundColor : "",
      };
    });

    assert.deepEqual(result.scenarioKeys, expectedScenarios, `${fixture.appearance} ${fixture.name}: complete matrix`);
    assert.ok(result.unreadRows > 0 && result.readRows > 0, `${fixture.appearance} ${fixture.name}: both row states render`);
    assert.equal(result.cueDetails.length, result.unreadRows, `${fixture.appearance} ${fixture.name}: every unread row has one cue`);
    assert.equal(result.readCueCount, 0, `${fixture.appearance} ${fixture.name}: read rows have no unread cue`);
    for (const cue of result.cueDetails) {
      assert.equal(cue.text, "Unread", `${fixture.appearance} ${fixture.name}: literal noncolor cue`);
      assert.equal(cue.state, "unread", `${fixture.appearance} ${fixture.name}: cue belongs only to unread`);
      assert.ok(cue.visible, `${fixture.appearance} ${fixture.name}: cue is visible at rest`);
      assert.equal(cue.effectiveOpacity, 1, `${fixture.appearance} ${fixture.name}: cue and ancestors are fully opaque`);
      assert.equal(cue.hiddenFromAccessibility, false, `${fixture.appearance} ${fixture.name}: cue remains in accessibility tree`);
      assert.equal(cue.overlapsMessage, false, `${fixture.appearance} ${fixture.name}: cue does not collide with message`);
      const ratio = contrast(cue.color, cue.background);
      assert.ok(ratio >= 4.5, `${fixture.appearance} ${fixture.name}: cue contrast ${ratio.toFixed(2)}:1`);
    }
    assert.equal(result.oneAria, "Notifications, 1 unread");
    assert.equal(result.nineVisual, "9");
    assert.equal(result.nineAria, "Notifications, 9 unread");
    assert.equal(result.tenVisual, "9+");
    assert.equal(result.tenAria, "Notifications, 10 unread");
    assert.equal(result.zeroBadgeCount, 0);
    assert.equal(result.historyMarkAll, "false");
    assert.equal(result.oneMarkAll, "true");
    assert.equal(result.mismatchAria, "Notifications, 3 unread");
    assert.equal(result.mismatchCueCount, 2);
    assert.equal(result.mismatchDeclared, "true");
    assert.equal(result.mismatchVisibleUnreadRows, "2");
    assert.equal(result.routableHref, "/account?module=requests&request=fixture-request-routable");
    assert.equal(result.nonRoutableRows, 1);
    assert.match(result.unknownMessage ?? "", /unknown future notification type/i);
    assert.ok(result.longRowWithinPanel, `${fixture.appearance} ${fixture.name}: long row stays inside panel`);
    assert.ok(result.panelsWithinViewport, `${fixture.appearance} ${fixture.name}: panels stay within viewport`);
    assert.ok(result.noHorizontalOverflow, `${fixture.appearance} ${fixture.name}: no horizontal overflow`);
    assert.equal(focused.tag, "A", `${fixture.appearance} ${fixture.name}: routable row receives focus`);
    const focusedBackground = composite(focused.rowBackground, focused.panelBackground);
    const focusedContrast = contrastRgba(parseColor(focused.cueColor), focusedBackground);
    assert.ok(focusedContrast >= 4.5, `${fixture.appearance} ${fixture.name}: focused cue contrast ${focusedContrast.toFixed(2)}:1`);
    assert.equal(hovered.active, true, `${fixture.appearance} ${fixture.name}: row hover surface is active`);
    const hoveredBackground = composite(hovered.rowBackground, hovered.panelBackground);
    const hoveredContrast = contrastRgba(parseColor(hovered.cueColor), hoveredBackground);
    assert.ok(hoveredContrast >= 4.5, `${fixture.appearance} ${fixture.name}: hovered cue contrast ${hoveredContrast.toFixed(2)}:1`);
    assert.deepEqual(pageErrors, [], `${fixture.appearance} ${fixture.name}: no page errors`);

    const minCueContrast = Math.min(...result.cueDetails.map((cue) => contrast(cue.color, cue.background)));
    results.push(`${fixture.appearance} ${fixture.name}: ${result.cueDetails.length} cues, rest ${minCueContrast.toFixed(2)}:1, focus ${focusedContrast.toFixed(2)}:1, hover ${hoveredContrast.toFixed(2)}:1, opacity 1, no overflow`);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`LS-2 Notification gallery render PASS\n${results.join("\n")}`);
