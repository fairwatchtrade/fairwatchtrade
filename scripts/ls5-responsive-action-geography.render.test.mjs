import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

/* LS-5 MANUAL / HEAVY Chromium contract — deliberately NOT in prebuild.

   Start the development server on port 3100, then run:
     node scripts/ls5-responsive-action-geography.render.test.mjs

   Product routes are read-only. The development-only fixture mounts the real
   ListingActionRail and MarketplaceControl owners with in-memory data. Every
   non-GET browser request is aborted, so proof cannot mutate product state. */

const originArgument = process.argv.find((argument) => argument.startsWith("--origin="));
const productOnly = process.argv.includes("--product-only");
const origin =
  originArgument?.slice("--origin=".length) ??
  process.env.LS5_GEOGRAPHY_ORIGIN ??
  "http://localhost:3100";
const listingPath =
  process.env.LS5_LISTING_PATH ??
  "/listings/878bd4d5-7956-4d40-94b8-1058a8a86a45";
const fixturePath = "/internal/ls5-responsive-action-geography";
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
assert.ok(executablePath, "Chrome/Chromium is available (or CHROME_PATH is set)");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
page.setDefaultTimeout(30_000);
await page.setRequestInterception(true);
page.on("request", (request) => {
  if (request.method() === "GET") void request.continue();
  else void request.abort("blockedbyclient");
});

async function viewport(width, height = 900) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await delay(120);
}

async function goto(path, width, height = 900) {
  await viewport(width, height);
  const response = await page.goto(`${origin}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  assert.ok(response && response.status() < 500, `${path} loads without a server error`);
  await page.waitForSelector('[data-market-bar=""]');
}

async function marketBar() {
  return page.$eval('[data-market-bar=""]', (node) => {
    const element = /** @type {HTMLElement} */ (node);
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const previous = element.previousElementSibling;
    const next = element.nextElementSibling;
    const previousBottom = previous?.getBoundingClientRect().bottom ?? rect.top;
    const nextRect = next?.getBoundingClientRect();
    const nextVisible = next && getComputedStyle(next).display !== "none" && (nextRect?.height ?? 0) > 0;
    const followingTop = nextVisible
      ? nextRect.top
      : element.parentElement?.getBoundingClientRect().bottom ?? previousBottom;
    return {
      display: style.display,
      height: rect.height,
      gapWhenAbsent: followingTop - previousBottom,
    };
  });
}

try {
  /* ── MarketBar route/width law ─────────────────────────────────────── */
  await goto("/", 360);
  assert.notEqual((await marketBar()).display, "none", "Home keeps MarketBar at 360px");

  const narrowNonHome = [
    "/browse",
    "/catalogue",
    "/vault",
    "/sell",
    "/admin/marketplace-control",
    listingPath,
  ];
  for (const path of narrowNonHome) {
    await goto(path, 360);
    const state = await marketBar();
    assert.equal(state.display, "none", `${path} hides MarketBar at 360px`);
    assert.equal(state.height, 0, `${path} leaves no MarketBar-height box at 360px`);
    assert.ok(Math.abs(state.gapWhenAbsent) <= 1, `${path} leaves no blank header band`);
  }

  await goto("/browse", 639);
  assert.equal((await marketBar()).display, "none", "ordinary non-Home route is hidden at 639px");
  await viewport(640);
  assert.notEqual((await marketBar()).display, "none", "ordinary non-Home route returns at 640px");

  await goto(listingPath, 639);
  assert.equal((await marketBar()).display, "none", "Watch Detail MarketBar is hidden at 639px");
  for (const width of [640, 895]) {
    await viewport(width);
    assert.equal((await marketBar()).display, "none", `Watch Detail MarketBar remains hidden at ${width}px`);
  }
  for (const width of [896, 897]) {
    await viewport(width);
    assert.notEqual((await marketBar()).display, "none", `Watch Detail MarketBar is restored at ${width}px`);
  }

  for (const width of [895, 896, 897]) {
    await viewport(width);
    const shellNavigation = await page.evaluate(() => {
      const shown = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        const style = getComputedStyle(element);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          element.getClientRects().length > 0
        );
      };
      return {
        mobile: shown('[data-mobile-navigation-trigger=""]'),
        desktop: shown('[data-desktop-navigation=""]'),
      };
    });
    const mobileShell = width < 896;
    assert.equal(shellNavigation.mobile, mobileShell, `${width}px has the correct global mobile navigation owner`);
    assert.equal(shellNavigation.desktop, !mobileShell, `${width}px has the correct global desktop navigation owner`);
    assert.notEqual(shellNavigation.mobile, shellNavigation.desktop, `${width}px has exactly one global navigation owner`);
  }

  /* ── Watch Detail action/Drawer handoff ────────────────────────────── */
  await page.waitForSelector('[data-purchase-inline=""]');
  const watchWidths = [360, 639, 640, 895, 896, 897, 1024, 1438];
  for (const width of watchWidths) {
    await viewport(width);
    await page.evaluate(() => window.scrollTo(0, 0));
    await delay(180);
    const state = await page.evaluate(() => {
      const shown = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        const style = getComputedStyle(element);
        /* A child keeps its own computed `display` value even when an
           ancestor is display:none. Client rects prove effective rendered
           ownership, which is the contract this probe is asking about. */
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          element.getClientRects().length > 0
        );
      };
      const fixedBar = [...document.querySelectorAll("div")].find(
        (element) =>
          getComputedStyle(element).position === "fixed" &&
          getComputedStyle(element).bottom === "0px" &&
          element.textContent?.includes("Sign in to Message Seller"),
      );
      const main = document.querySelector("main");
      return {
        inline: shown('[data-purchase-inline=""]'),
        rail: shown('[data-purchase-rail=""]'),
        mobileDrawer: shown('[data-mobile-drawer-opener=""]'),
        desktopDrawer: shown('button[aria-controls="collectors-drawer-overlay"]'),
        fixedBar: !!fixedBar,
        fixedBarHeight: fixedBar?.getBoundingClientRect().height ?? 0,
        mainBottomPadding: main ? Number.parseFloat(getComputedStyle(main).paddingBottom) : 0,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    const narrow = width < 896;
    assert.equal(state.inline, narrow, `${width}px has the correct inline purchase owner`);
    assert.equal(state.rail, !narrow, `${width}px has the correct rail purchase owner`);
    assert.equal(state.mobileDrawer, narrow, `${width}px has the correct mobile Drawer owner`);
    assert.equal(state.desktopDrawer, !narrow, `${width}px has the correct desktop Drawer owner`);
    assert.notEqual(state.mobileDrawer, state.desktopDrawer, `${width}px has exactly one Drawer navigation owner`);
    assert.equal(state.fixedBar, true, `${width}px keeps the persistent guest action reachable`);
    assert.ok(state.mainBottomPadding >= state.fixedBarHeight, `${width}px reserves enough listing content space for the fixed bar`);
    assert.ok(state.overflow <= 1, `${width}px has no horizontal page overflow`);
  }

  for (const width of watchWidths) {
    await viewport(width, 700);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await delay(350);
    const fixedBarStillVisible = await page.evaluate(() =>
      [...document.querySelectorAll("div")].some(
        (element) =>
          getComputedStyle(element).position === "fixed" &&
          getComputedStyle(element).bottom === "0px" &&
          element.textContent?.includes("Sign in to Message Seller"),
      ),
    );
    assert.equal(fixedBarStillVisible, false, `${width}px fixed bar retires before the footer`);
  }

  if (productOnly) {
    console.log(
      [
        "LS-5 production product-route smoke PASS",
        "MarketBar: Home/non-Home 360, sm 639/640, Watch Detail 895/896/897",
        "Watch Detail: 360/639/640/895/896/897/1024/1438 atomic purchase + Drawer handoff, fixed-bar retirement, no overflow",
      ].join("\n"),
    );
  } else {
    /* ── Shared purchase decision across all three dressings ─────────── */
    await goto(fixturePath, 1400, 800);
    await page.waitForSelector('[data-fixture-hydrated="true"]');
  const actionTruth = await page.$$eval('[data-ls5-action-state]', (states) =>
    Object.fromEntries(
      states.map((state) => [
        state.getAttribute("data-ls5-action-state"),
        Object.fromEntries(
          [...state.querySelectorAll('[data-ls5-action-dressing]')].map((dressing) => [
            dressing.getAttribute("data-ls5-action-dressing"),
            dressing.textContent?.replace(/\s+/g, " ").trim() ?? "",
          ]),
        ),
      ]),
    ),
  );
  for (const dressing of ["inline", "rail", "bar"]) {
    assert.match(actionTruth.open[dressing], /Make an Offer|Make Offer|Start Purchase Request/i, `${dressing} exposes the open purchase decision`);
    assert.match(actionTruth.pending[dressing], /pending/i, `${dressing} exposes the pending decision`);
    assert.match(actionTruth["accepted-reserved"][dressing], /accepted|reserved/i, `${dressing} exposes accepted/reserved truth`);
  }

  /* ── Marketplace Control exact container handoff ───────────────────── */
  const shell = '[data-ls5-marketplace-shell=""]';
  const workspace = `${shell} section[class~="@container"]`;
  const rowSelector = '[data-mc-row="ls5-marketplace-09"]';

  async function setContainerWidth(width) {
    const inset = await page.evaluate(
      ({ shellSelector, workspaceSelector }) => {
        const shellElement = document.querySelector(shellSelector);
        const workspaceElement = document.querySelector(workspaceSelector);
        return (
          (shellElement?.getBoundingClientRect().width ?? 0) -
          (/** @type {HTMLElement | null} */ (workspaceElement)?.clientWidth ?? 0)
        );
      },
      { shellSelector: shell, workspaceSelector: workspace },
    );
    await page.$eval(shell, (node, value) => {
      /** @type {HTMLElement} */ (node).style.width = `${value}px`;
    }, width + inset);
    await delay(180);
    const measured = await page.evaluate(
      ({ shellSelector, workspaceSelector }) => ({
        shell: document.querySelector(shellSelector)?.getBoundingClientRect().width ?? -1,
        workspace:
          /** @type {HTMLElement | null} */ (document.querySelector(workspaceSelector))
            ?.clientWidth ?? -1,
        viewport: document.documentElement.clientWidth,
      }),
      { shellSelector: shell, workspaceSelector: workspace },
    );
    assert.ok(
      Math.abs(measured.workspace - width) <= 0.5,
      `Marketplace container measures ${width}px (shell ${measured.shell}, workspace ${measured.workspace}, viewport ${measured.viewport})`,
    );
  }

  async function clearInspector() {
    const clear = await page.$('aside[data-mc-keep] button[aria-label="Clear selection"]');
    if (clear) {
      await clear.click();
      await page.waitForFunction(() => !document.querySelector("aside[data-mc-keep]"));
    }
  }

  await setContainerWidth(1049);
  await clearInspector();
  assert.equal(await page.$("aside[data-mc-keep]"), null, "no selection renders no inspector placeholder");
  await page.$eval(rowSelector, (node) => node.scrollIntoView({ block: "center" }));
  await page.click(rowSelector);
  await page.waitForSelector("aside[data-mc-keep]");
  await delay(650);
  let geometry = await page.evaluate((workspaceSelector) => {
    const aside = document.querySelector("aside[data-mc-keep]");
    const action = aside?.querySelector("button, a");
    const work = document.querySelector(workspaceSelector);
    return {
      position: aside ? getComputedStyle(aside).position : null,
      asideTop: aside?.getBoundingClientRect().top ?? -999,
      actionBottom: action?.getBoundingClientRect().bottom ?? 9999,
      viewportHeight: window.innerHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      workspaceRight: work?.getBoundingClientRect().right ?? 0,
    };
  }, workspace);
  assert.notEqual(geometry.position, "absolute", "1049px inspector is stacked");
  assert.ok(
    geometry.asideTop >= -1 && geometry.asideTop <= geometry.viewportHeight / 4,
    `1049px selection brings inspector to the actionable region (top ${geometry.asideTop}, action bottom ${geometry.actionBottom})`,
  );
  assert.ok(geometry.actionBottom <= 800, "1049px inspector controls are immediately reachable");
  assert.ok(geometry.overflow <= 1, "1049px introduces no horizontal page overflow");

  const returnControl = await page.$eval('aside[data-mc-keep]', (aside) => {
    const button = [...aside.querySelectorAll("button")].find((candidate) =>
      candidate.textContent?.includes("Back to list"),
    );
    if (!(button instanceof HTMLButtonElement)) return null;
    button.click();
    return button.textContent?.replace(/\s+/g, " ").trim() ?? null;
  });
  assert.match(returnControl ?? "", /Back to list/, "the stacked inspector exposes its governed return control");
  await page.waitForFunction(
    (selector) => {
      const row = document.querySelector(selector);
      if (!row) return false;
      const rect = row.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      return Math.abs(center - window.innerHeight / 2) <= 110;
    },
    { timeout: 5_000 },
    rowSelector,
  );
  const rowReturn = await page.$eval(rowSelector, (node) => {
    const rect = node.getBoundingClientRect();
    return {
      center: rect.top + rect.height / 2,
      top: rect.top,
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight,
    };
  });
  assert.ok(
    Math.abs(rowReturn.center - rowReturn.viewportHeight / 2) <= 110,
    `Back to list returns to the exact selected row context (top ${rowReturn.top}, center ${rowReturn.center}, scrollY ${rowReturn.scrollY})`,
  );

  for (const width of [1050, 1051]) {
    await clearInspector();
    await setContainerWidth(width);
    await page.$eval('[data-mc-row="ls5-marketplace-01"]', (node) => node.scrollIntoView({ block: "center" }));
    const before = await page.evaluate(() => window.scrollY);
    await page.click('[data-mc-row="ls5-marketplace-01"]');
    await page.waitForSelector("aside[data-mc-keep]");
    await delay(500);
    geometry = await page.evaluate((workspaceSelector) => {
      const aside = document.querySelector("aside[data-mc-keep]");
      const work = document.querySelector(workspaceSelector);
      const first = document.querySelector('[data-mc-row="ls5-marketplace-01"]');
      const last = document.querySelector('[data-mc-row="ls5-marketplace-32"]');
      const workRect = work?.getBoundingClientRect();
      const firstRect = first?.getBoundingClientRect();
      const lastRect = last?.getBoundingClientRect();
      return {
        position: aside ? getComputedStyle(aside).position : null,
        scrollY: window.scrollY,
        workspaceWidth: workRect?.width ?? 0,
        firstWidth: firstRect?.width ?? 0,
        firstRight: firstRect?.right ?? 0,
        lastWidth: lastRect?.width ?? 0,
        lastTop: lastRect?.top ?? 0,
        lastRight: lastRect?.right ?? 0,
        inspectorBottom: aside?.getBoundingClientRect().bottom ?? 0,
        workspaceRight: workRect?.right ?? 0,
        backDisplay: aside
          ? getComputedStyle(aside.querySelector("button") ?? aside).display
          : null,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    }, workspace);
    assert.equal(geometry.position, "absolute", `${width}px inspector is the governed overlay`);
    assert.ok(Math.abs(geometry.scrollY - before) <= 1, `${width}px row selection does not scroll the room`);
    assert.ok(Math.abs(geometry.firstWidth - geometry.workspaceWidth) <= 2, `${width}px overlay reserves no ledger column`);
    assert.ok(Math.abs(geometry.lastWidth - geometry.workspaceWidth) <= 2, `${width}px ledger returns full-width beyond overlay height`);
    assert.ok(geometry.lastTop >= geometry.inspectorBottom, `${width}px full-width lower row begins beyond the inspector`);
    assert.ok(Math.abs(geometry.firstRight - geometry.workspaceRight) <= 2, `${width}px first row reaches the workspace edge`);
    assert.ok(Math.abs(geometry.lastRight - geometry.workspaceRight) <= 2, `${width}px lower row reaches the workspace edge`);
    assert.equal(geometry.backDisplay, "none", `${width}px overlay needs no stacked Back-to-list control`);
    assert.ok(geometry.overflow <= 1, `${width}px introduces no horizontal page overflow`);
  }

    console.log(
      [
        "LS-5 MANUAL / HEAVY Chromium proof PASS",
        "MarketBar: Home/non-Home 360, sm 639/640, Watch Detail 895/896/897",
        "Watch Detail: 360/639/640/895/896/897/1024/1438 atomic purchase + Drawer handoff, fixed-bar retirement, no overflow",
        "Marketplace Control: exact 1049/1050/1051 container stacked/overlay round trip and full-width ledger",
      ].join("\n"),
    );
  }
} finally {
  await browser.close();
}
