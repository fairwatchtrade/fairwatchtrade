/* LS-2 Trade + Wanted actual-surface render contract.

   Start the app in development so the deterministic gallery's local-only
   review seam is available, then run:

     node scripts/ls2-trade-wanted-state-gallery.render.test.mjs

   Override LS2_GALLERY_URL or CHROME_PATH when needed. This is deliberately
   a browser contract: source-token arithmetic cannot prove inherited opacity,
   the resolved light-dark() arm, the mounted surface, or narrow overflow. */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const url =
  process.env.LS2_GALLERY_URL ??
  "http://127.0.0.1:3100/internal/ls2-trade-wanted-state-gallery";

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
assert.ok(executablePath, "Chrome/Chromium is available (or CHROME_PATH is set)");

const expectedStateTokens = {
  "trade-offer:pending": ["--lc-private_active-badge", "--lc-private_active-line"],
  "trade-offer:accepted": ["--lc-reserved-badge", "--lc-reserved-line"],
  "trade-offer:declined": ["--lc-rejected-badge", "--lc-rejected-line"],
  "trade-offer:superseded": ["--lc-removed-badge", "--lc-removed-line"],
  "trade-offer:withdrawn": ["--lc-removed-badge", "--lc-removed-line"],
  "trade-deal:pending": ["--lc-reserved-badge", "--lc-reserved-line"],
  "trade-deal:settling": ["--lc-private_active-badge", "--lc-private_active-line"],
  "trade-deal:completed": ["--lc-published-badge", "--lc-published-line"],
  "trade-deal:cancelled": ["--platinum-dim", "--lc-neutral-line"],
  "trade-leg:bound": ["--lc-reserved-badge", "--lc-reserved-line"],
  "trade-leg:in_transit": ["--lc-private_active-badge", "--lc-private_active-line"],
  "trade-leg:delivered": ["--platinum-dim", "--lc-neutral-line"],
  "trade-leg:verified": ["--platinum-dim", "--lc-neutral-line"],
  "trade-leg:transferred": ["--lc-published-badge", "--lc-published-line"],
  "trade-leg:cancelled": ["--platinum-dim", "--lc-neutral-line"],
  "wanted:draft": ["--lc-draft-badge", "--lc-draft-line"],
  "wanted:active": ["--lc-published-badge", "--lc-published-line"],
  "wanted:answered": ["--lc-private_active-badge", "--lc-private_active-line"],
  "wanted:paused": ["--lc-pending_review-badge", "--lc-pending_review-line"],
  "wanted:closed": ["--lc-removed-badge", "--lc-removed-line"],
};
const expectedStatePairs = Object.keys(expectedStateTokens).sort();

const fixtures = [
  { appearance: "light", name: "Dell 4K @125% / browser 100%", width: 3072, height: 1728, scale: 1.25, browserZoom: 1 },
  { appearance: "dark", name: "Dell 4K @125% / browser 100%", width: 3072, height: 1728, scale: 1.25, browserZoom: 1 },
  { appearance: "light", name: "Dell 4K @125% / browser 110%", width: 2793, height: 1571, scale: 1.375, browserZoom: 1.1 },
  { appearance: "dark", name: "Dell 4K @125% / browser 110%", width: 2793, height: 1571, scale: 1.375, browserZoom: 1.1 },
  { appearance: "light", name: "synthetic XCover-width", width: 360, height: 800, scale: 3, browserZoom: 1 },
  { appearance: "dark", name: "synthetic XCover-width", width: 360, height: 800, scale: 3, browserZoom: 1 },
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
    await page.waitForSelector('[data-fixture-gallery="ls2-trade-wanted"]', { timeout: 15_000 });

    const result = await page.evaluate((stateTokens) => {
      const parseColor = (value) => {
        const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
        return {
          rgb: value.startsWith("color(srgb")
            ? channels.slice(0, 3).map((channel) => channel * 255)
            : channels.slice(0, 3),
          alpha: channels.length > 3 ? channels[3] : 1,
          raw: value,
        };
      };
      const linear = (channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (rgb) => {
        const [r, g, b] = rgb.map(linear);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const contrast = (a, b) =>
        (Math.max(luminance(a), luminance(b)) + 0.05) /
        (Math.min(luminance(a), luminance(b)) + 0.05);
      const composite = (foreground, background) =>
        foreground.rgb.map((channel, index) =>
          channel * foreground.alpha + background.rgb[index] * (1 - foreground.alpha),
        );
      const resolvedTokenCache = new Map();
      const resolveColorToken = (token) => {
        if (resolvedTokenCache.has(token)) return resolvedTokenCache.get(token);
        const probe = document.createElement("span");
        probe.style.color = `var(${token})`;
        document.body.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        resolvedTokenCache.set(token, resolved);
        return resolved;
      };
      const paintChain = (element) => {
        const chain = [];
        let current = element;
        while (current) {
          const style = getComputedStyle(current);
          chain.push({
            node: current.tagName,
            opacity: Number(style.opacity),
            filter: style.filter,
          });
          current = current.parentElement;
        }
        return chain;
      };
      const inspectText = (element) => {
        const style = getComputedStyle(element);
        const foreground = parseColor(style.color);
        const background = parseColor(style.backgroundColor);
        const border = parseColor(style.borderTopColor);
        const chain = paintChain(element);
        const pair = `${element.dataset.stateDomain}:${element.dataset.state}`;
        const [textToken, lineToken] = stateTokens[pair];
        return {
          domain: element.dataset.stateDomain ?? null,
          state: element.dataset.state ?? null,
          governance: element.dataset.stateGovernance ?? null,
          color: foreground.raw,
          expectedColor: resolveColorToken(textToken),
          colorAlpha: foreground.alpha,
          background: background.raw,
          backgroundAlpha: background.alpha,
          border: style.borderTopColor,
          expectedBorder: resolveColorToken(lineToken),
          borderAlpha: parseColor(style.borderTopColor).alpha,
          borderStyle: style.borderTopStyle,
          borderWidth: Number.parseFloat(style.borderTopWidth),
          fontSize: Number.parseFloat(style.fontSize),
          physicalBorderPx: Number.parseFloat(style.borderTopWidth) * devicePixelRatio,
          physicalFontPx: Number.parseFloat(style.fontSize) * devicePixelRatio,
          fontWeight: style.fontWeight,
          lineHeight: Number.parseFloat(style.lineHeight),
          letterSpacing: Number.parseFloat(style.letterSpacing),
          textTransform: style.textTransform,
          effectiveOpacity: chain.reduce((product, item) => product * item.opacity, 1),
          filteredAncestors: chain.filter((item) => item.filter !== "none"),
          contrast: contrast(foreground.rgb, background.rgb),
          renderedBorderContrast: contrast(composite(border, background), background.rgb),
        };
      };

      const badges = [...document.querySelectorAll("[data-state-domain]")].map(inspectText);
      const budgets = [...document.querySelectorAll("[data-budget-fit]")].map((element) => {
        const style = getComputedStyle(element);
        const foreground = parseColor(style.color);
        const card = element.closest("article");
        const background = parseColor(getComputedStyle(card).backgroundColor);
        const chain = paintChain(element);
        return {
          fit: element.dataset.budgetFit,
          color: foreground.raw,
          colorAlpha: foreground.alpha,
          effectiveOpacity: chain.reduce((product, item) => product * item.opacity, 1),
          filteredAncestors: chain.filter((item) => item.filter !== "none"),
          contrast: contrast(foreground.rgb, background.rgb),
        };
      });
      const cashElement = document.querySelector("[data-trade-cash]");
      const cashStyle = getComputedStyle(cashElement);
      const cashForeground = parseColor(cashStyle.color);
      const cashBackground = parseColor(getComputedStyle(cashElement.closest("article")).backgroundColor);
      const cashChain = paintChain(cashElement);

      return {
        title: document.title,
        dataTheme: document.documentElement.dataset.theme ?? null,
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        devicePixelRatio,
        geometry: {
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
          documentWidth: document.documentElement.scrollWidth,
        },
        badges,
        budgets,
        cash: {
          color: cashForeground.raw,
          colorAlpha: cashForeground.alpha,
          effectiveOpacity: cashChain.reduce((product, item) => product * item.opacity, 1),
          filteredAncestors: cashChain.filter((item) => item.filter !== "none"),
          contrast: contrast(cashForeground.rgb, cashBackground.rgb),
        },
        expectedBudgetColor: resolveColorToken("--muted"),
        expectedCashColor: resolveColorToken("--platinum-dim"),
        expectedBadgeSurface: resolveColorToken("--surface"),
        /* Next dev mounts a portal for its small tools button even when the
           page is healthy. Only error-dialog text is a failing overlay. */
        errorOverlay: /Unhandled Runtime Error|Build Error|Runtime Error/.test(
          document.querySelector("nextjs-portal")?.shadowRoot?.textContent ?? "",
        ),
      };
    }, expectedStateTokens);

    assert.equal(result.title, "LS-2 Trade + Wanted State Gallery");
    assert.equal(result.dataTheme, fixture.appearance, `${fixture.appearance} cookie reaches the server theme`);
    assert.equal(result.colorScheme, fixture.appearance, `${fixture.appearance} arm resolves exactly`);
    assert.equal(result.devicePixelRatio, fixture.scale, `${fixture.name} uses the intended device scale`);
    assert.equal(result.geometry.viewportWidth, fixture.width, `${fixture.name} resolves the intended CSS width`);
    assert.equal(result.geometry.viewportHeight, fixture.height, `${fixture.name} resolves the intended CSS height`);
    assert.equal(result.geometry.documentWidth, result.geometry.viewportWidth, `${fixture.name} has no horizontal overflow`);
    assert.equal(result.errorOverlay, false, `${fixture.name} has no Next error overlay`);
    assert.deepEqual(pageErrors, [], `${fixture.name} has no browser runtime errors`);
    assert.equal(result.badges.length, 26, `${fixture.name} renders the complete gallery badge set`);

    const uniquePairs = [...new Set(result.badges.map((badge) => `${badge.domain}:${badge.state}`))].sort();
    assert.deepEqual(uniquePairs, expectedStatePairs, `${fixture.name} renders the exact current state vocabulary`);
    assert.equal(
      result.badges.filter((badge) => badge.governance === "pending").length,
      4,
      `${fixture.name} visibly retains all four governance stops`,
    );
    assert.ok(
      new Set(result.badges.map((badge) => badge.border)).size >= 7,
      `${fixture.name} resolves distinct state lines instead of one collapsed edge`,
    );
    for (const badge of result.badges) {
      assert.equal(badge.fontSize, 11, `${fixture.name} ${badge.domain}:${badge.state} keeps the governed text size`);
      assert.ok(
        Math.abs(badge.physicalFontPx - 11 * fixture.scale) < 0.01,
        `${fixture.name} ${badge.domain}:${badge.state} resolves the intended physical glyph scale`,
      );
      assert.equal(badge.fontWeight, "400", `${fixture.name} ${badge.domain}:${badge.state} keeps the governed text weight`);
      assert.ok(Math.abs(badge.lineHeight - 15.4) < 0.01, `${fixture.name} ${badge.domain}:${badge.state} keeps the governed line height`);
      assert.equal(badge.letterSpacing, 1, `${fixture.name} ${badge.domain}:${badge.state} keeps the governed tracking`);
      assert.equal(badge.textTransform, "uppercase", `${fixture.name} ${badge.domain}:${badge.state} keeps the governed casing`);
      assert.equal(badge.background, result.expectedBadgeSurface, `${fixture.name} ${badge.domain}:${badge.state} keeps the established badge plane`);
      assert.equal(badge.colorAlpha, 1, `${fixture.name} ${badge.domain}:${badge.state} text is opaque`);
      assert.equal(badge.backgroundAlpha, 1, `${fixture.name} ${badge.domain}:${badge.state} surface is opaque`);
      if (fixture.appearance === "dark") {
        assert.equal(badge.color, badge.expectedColor, `${fixture.name} ${badge.domain}:${badge.state} preserves the approved Dark text arm`);
        assert.equal(badge.border, badge.expectedBorder, `${fixture.name} ${badge.domain}:${badge.state} preserves the approved Dark line arm`);
      }
      assert.ok(badge.borderAlpha > 0, `${fixture.name} ${badge.domain}:${badge.state} line resolves visibly`);
      assert.notEqual(badge.borderStyle, "none", `${fixture.name} ${badge.domain}:${badge.state} line has a painted style`);
      assert.ok(badge.borderWidth > 0, `${fixture.name} ${badge.domain}:${badge.state} line has nonzero width`);
      assert.ok(
        Math.abs(badge.physicalBorderPx - badge.borderWidth * fixture.scale) < 0.01,
        `${fixture.name} ${badge.domain}:${badge.state} resolves the intended physical edge scale`,
      );
      assert.equal(badge.effectiveOpacity, 1, `${fixture.name} ${badge.domain}:${badge.state} has no compounded dimming`);
      assert.deepEqual(badge.filteredAncestors, [], `${fixture.name} ${badge.domain}:${badge.state} has no filtered ancestor`);
      assert.ok(
        badge.contrast >= (fixture.appearance === "light" ? 7 : 4.5),
        `${fixture.name} ${badge.domain}:${badge.state} clears its appearance-specific text floor`,
      );
      if (fixture.appearance === "light") {
        assert.ok(
          badge.renderedBorderContrast >= 3,
          `${fixture.name} ${badge.domain}:${badge.state} carries a scannable rendered edge`,
        );
        assert.ok(
          badge.contrast > badge.renderedBorderContrast,
          `${fixture.name} ${badge.domain}:${badge.state} keeps the state word dominant over its edge`,
        );
      }
    }

    assert.equal(result.budgets.length, 4, `${fixture.name} renders every advisory budget projection`);
    assert.equal(new Set(result.budgets.map((budget) => budget.color)).size, 1, `${fixture.name} keeps budget outcomes color-flat`);
    for (const budget of result.budgets) {
      assert.equal(budget.color, result.expectedBudgetColor, `${fixture.name} budget ${budget.fit} resolves --muted`);
      assert.equal(budget.colorAlpha, 1, `${fixture.name} budget ${budget.fit} text is opaque`);
      assert.equal(budget.effectiveOpacity, 1, `${fixture.name} budget ${budget.fit} has no compounded dimming`);
      assert.deepEqual(budget.filteredAncestors, [], `${fixture.name} budget ${budget.fit} has no filtered ancestor`);
      assert.ok(budget.contrast >= 4.5, `${fixture.name} budget ${budget.fit} clears 4.5:1`);
    }
    assert.equal(result.cash.color, result.expectedCashColor, `${fixture.name} cash resolves --platinum-dim`);
    assert.equal(result.cash.colorAlpha, 1, `${fixture.name} cash text is opaque`);
    assert.equal(result.cash.effectiveOpacity, 1, `${fixture.name} cash has no compounded dimming`);
    assert.deepEqual(result.cash.filteredAncestors, [], `${fixture.name} cash has no filtered ancestor`);
    assert.ok(result.cash.contrast >= 4.5, `${fixture.name} cash clears 4.5:1`);

    results.push({
      appearance: fixture.appearance,
      browserZoom: fixture.browserZoom,
      viewport: `${fixture.width}x${fixture.height}`,
      minimumBadgeContrast: Math.min(...result.badges.map((badge) => badge.contrast)).toFixed(2),
      minimumRenderedBorderContrast: Math.min(...result.badges.map((badge) => badge.renderedBorderContrast)).toFixed(2),
      budgetContrast: result.budgets[0].contrast.toFixed(2),
      cashContrast: result.cash.contrast.toFixed(2),
      resolvedStateLines: new Set(result.badges.map((badge) => badge.border)).size,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`LS-2 Trade + Wanted actual-surface PASS\n${JSON.stringify(results, null, 2)}`);
