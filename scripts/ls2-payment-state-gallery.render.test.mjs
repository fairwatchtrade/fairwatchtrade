/* LS-2 Accepted Purchase / Payment actual-surface render contract.

   Start the app in development, then run this script. The route's local-only
   deterministic seam avoids all production data and provider calls. */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

import {
  PAYMENT_STATE_GALLERY_FIXTURES,
  acceptedPurchaseStatePresentation,
} from "../lib/payments/acceptedPurchaseStatePresentation.ts";

const url = process.env.LS2_PAYMENT_GALLERY_URL ?? "http://127.0.0.1:3100/internal/ls2-payment-state-gallery";
const executablePath = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean).find((candidate) => existsSync(candidate));
assert.ok(executablePath, "Chrome/Chromium is available (or CHROME_PATH is set)");

const stateKey = ({ axis, state, context }) => `${axis}:${state}${context ? `:${context}` : ""}`;
const expectedPairs = PAYMENT_STATE_GALLERY_FIXTURES.map(stateKey).sort();
const expectedPresentations = Object.fromEntries(
  PAYMENT_STATE_GALLERY_FIXTURES.map((input) => {
    const presentation = acceptedPurchaseStatePresentation(input);
    return [stateKey(input), {
      governance: presentation.governance,
      meaning: presentation.meaning,
      text: presentation.text,
      line: presentation.line,
    }];
  }),
);
const expectedTypography = {
  primary: { fontSize: 11, fontWeight: "300" },
  "availability-14": { fontSize: 14, fontWeight: "300" },
  "availability-13-buyer": { fontSize: 13, fontWeight: "300" },
  "bag-chip": { fontSize: 11, fontWeight: "400" },
  "buyer-chip": { fontSize: 11, fontWeight: "300" },
};
const fixtures = [
  { appearance: "light", name: "Dell 4K @125%", width: 3072, height: 1728, scale: 1.25 },
  { appearance: "dark", name: "Dell 4K @125%", width: 3072, height: 1728, scale: 1.25 },
  { appearance: "light", name: "synthetic XCover-width", width: 360, height: 800, scale: 3 },
  { appearance: "dark", name: "synthetic XCover-width", width: 360, height: 800, scale: 3 },
];

const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const results = [];
try {
  for (const fixture of fixtures) {
    const page = await browser.newPage();
    await page.setViewport({ width: fixture.width, height: fixture.height, deviceScaleFactor: fixture.scale });
    await page.setCookie({ name: "fwt-appearance", value: fixture.appearance, url: new URL(url).origin, sameSite: "Lax" });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector('[data-fixture-gallery="ls2-payment-state"]', { timeout: 15_000 });

    const result = await page.evaluate((presentationLedger) => {
      const parseColor = (value) => {
        const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
        if (value.startsWith("color(srgb")) {
          return { rgb: channels.slice(0, 3).map((channel) => channel * 255), alpha: channels[3] ?? 1 };
        }
        return { rgb: channels.slice(0, 3), alpha: channels[3] ?? 1 };
      };
      const composite = (front, back) => {
        const alpha = front.alpha + back.alpha * (1 - front.alpha);
        if (alpha === 0) return { rgb: [0, 0, 0], alpha: 0 };
        return {
          rgb: front.rgb.map((channel, index) => (
            channel * front.alpha + back.rgb[index] * back.alpha * (1 - front.alpha)
          ) / alpha),
          alpha,
        };
      };
      const effectiveBackground = (element) => {
        const layers = [];
        let current = element;
        while (current) {
          layers.push(parseColor(getComputedStyle(current).backgroundColor));
          current = current.parentElement;
        }
        return layers.reverse().reduce(
          (background, layer) => composite(layer, background),
          { rgb: [255, 255, 255], alpha: 1 },
        );
      };
      const linear = (channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (rgb) => {
        const [r, g, b] = rgb.map(linear);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
      const paintChain = (element) => {
        const chain = [];
        let current = element;
        while (current) {
          const style = getComputedStyle(current);
          chain.push({ opacity: Number(style.opacity), filter: style.filter });
          current = current.parentElement;
        }
        return chain;
      };
      const resolvedColorCache = new Map();
      const resolveColor = (expression) => {
        if (resolvedColorCache.has(expression)) return resolvedColorCache.get(expression);
        const probe = document.createElement("span");
        probe.style.color = expression;
        document.body.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        resolvedColorCache.set(expression, resolved);
        return resolved;
      };
      const elementStateKey = (element) => `${element.dataset.paymentStateAxis}:${element.dataset.paymentState}${element.dataset.paymentStateContext ? `:${element.dataset.paymentStateContext}` : ""}`;
      const markers = [...document.querySelectorAll("[data-payment-state-axis]")].map((element) => {
        const style = getComputedStyle(element);
        const surface = element.closest("[data-payment-surface]");
        const card = element.closest("[data-payment-fixture]");
        const background = effectiveBackground(surface);
        const chain = paintChain(element);
        const key = elementStateKey(element);
        const expected = presentationLedger[key];
        const lightHue = `color-mix(in srgb, ${expected.text} 65%, var(--platinum) 35%)`;
        const expectedColor = resolveColor(`light-dark(color-mix(in srgb, ${lightHue} 85%, black 15%), ${expected.text})`);
        const cardStyle = card ? getComputedStyle(card) : null;
        const cardBackground = card ? effectiveBackground(card) : null;
        const cardBorder = cardStyle ? parseColor(cardStyle.borderTopColor) : null;
        return {
          axis: element.dataset.paymentStateAxis,
          state: element.dataset.paymentState,
          context: element.dataset.paymentStateContext || undefined,
          typographyContext: element.closest("[data-payment-typography-context]")?.dataset.paymentTypographyContext,
          governance: element.dataset.paymentStateGovernance,
          meaning: element.dataset.paymentStateMeaning,
          color: style.color,
          expectedColor,
          expectedGovernance: expected.governance,
          expectedMeaning: expected.meaning,
          fixtureBorder: cardStyle?.borderTopColor,
          expectedFixtureBorder: card ? resolveColor(expected.line) : null,
          fixtureBorderAlpha: cardBorder?.alpha,
          fixtureBorderStyle: cardStyle?.borderTopStyle,
          fixtureBorderWidth: cardStyle ? Number.parseFloat(cardStyle.borderTopWidth) : null,
          fixtureRenderedBorderContrast: cardBorder && cardBackground
            ? contrast(composite(cardBorder, cardBackground).rgb, cardBackground.rgb)
            : null,
          surface: surface?.dataset.paymentSurface,
          background: background.rgb,
          contrast: contrast(parseColor(style.color).rgb, background.rgb),
          fontSize: Number.parseFloat(style.fontSize),
          fontWeight: style.fontWeight,
          fontStyle: style.fontStyle,
          effectiveOpacity: chain.reduce((product, item) => product * item.opacity, 1),
          filteredAncestors: chain.filter((item) => item.filter !== "none"),
        };
      });
      return {
        title: document.title,
        theme: document.documentElement.dataset.theme,
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        dpr: devicePixelRatio,
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        markers,
        matrixCards: [...document.querySelectorAll("[data-payment-fixture]")].map((card) => ({
          key: card.dataset.paymentFixture,
          governanceLabel: card.querySelector("[data-governance-label]")?.textContent?.trim(),
          markers: [...card.querySelectorAll("[data-payment-state-axis]")].map((element) => ({
            key: elementStateKey(element),
            surface: element.closest("[data-payment-surface]")?.dataset.paymentSurface,
          })),
        })),
        governanceLabels: [...document.querySelectorAll("[data-governance-label]")].map((element) => element.textContent?.trim()),
        compositeAxes: [...document.querySelectorAll('[data-payment-composite] [data-payment-state-axis]')].map((element) => element.dataset.paymentStateAxis),
        parityCards: [...document.querySelectorAll("[data-payment-parity]")].map((card) => ({
          key: card.dataset.paymentParity,
          sources: [...card.querySelectorAll("[data-payment-parity-source]")].map((source) => {
            const marker = source.querySelector("[data-payment-state-axis]");
            return {
              source: source.dataset.paymentParitySource,
              stateKey: marker ? elementStateKey(marker) : null,
              color: marker ? getComputedStyle(marker).color : null,
            };
          }),
        })),
        mixedStops: [...document.querySelectorAll("[data-payment-mixed-stop]")].map((element) => element.dataset.paymentMixedStop).sort(),
        bodyText: document.body.innerText,
        errorOverlay: /Unhandled Runtime Error|Build Error|Runtime Error/.test(document.querySelector("nextjs-portal")?.shadowRoot?.textContent ?? ""),
      };
    }, expectedPresentations);

    assert.equal(result.title, "LS-2 Accepted Purchase + Payment State Gallery");
    assert.equal(result.theme, fixture.appearance, `${fixture.name} receives ${fixture.appearance}`);
    assert.equal(result.colorScheme, fixture.appearance, `${fixture.name} resolves ${fixture.appearance}`);
    assert.equal(result.dpr, fixture.scale, `${fixture.name} uses the intended device scale`);
    assert.equal(result.width, fixture.width, `${fixture.name} uses the intended CSS width`);
    assert.equal(result.documentWidth, result.width, `${fixture.name} has no horizontal overflow`);
    assert.deepEqual(pageErrors, [], `${fixture.name} has no browser runtime error`);
    assert.equal(result.errorOverlay, false, `${fixture.name} has no Next error overlay`);

    const uniquePairs = [...new Set(result.markers.map(stateKey))].sort();
    assert.deepEqual(uniquePairs, expectedPairs, `${fixture.name} renders every axis-qualified fixture`);
    assert.equal(result.matrixCards.length, expectedPairs.length, `${fixture.name} renders exactly one matrix card per axis-qualified fixture`);
    assert.deepEqual(result.matrixCards.map((card) => card.key).sort(), expectedPairs, `${fixture.name} matrix has no missing or duplicate fixture card`);
    for (const card of result.matrixCards) {
      assert.deepEqual(card.markers, [
        { key: card.key, surface: "ink" },
        { key: card.key, surface: "focused-gold-whisper" },
      ], `${fixture.name} ${card.key} renders the exact ink + focused surface pair`);
      const governance = expectedPresentations[card.key].governance;
      const expectedLabel = governance === "pending"
        ? "GOVERNANCE-PENDING"
        : governance === "out-of-surface"
          ? "SOURCE BRANCH · NOT CURRENTLY USER-SEEN"
          : "GOVERNED";
      assert.equal(card.governanceLabel, expectedLabel, `${fixture.name} ${card.key} carries its exact founder governance label`);
    }
    assert.deepEqual(result.compositeAxes.sort(), ["dispute", "payment-lifecycle", "refund", "transaction"], `${fixture.name} keeps four simultaneous truth axes in the composite fixture`);
    assert.deepEqual(
      result.parityCards.map((card) => card.key).sort(),
      ["accepted-no-attempt", "canceled", "checkout-open", "confirming", "expired", "failed", "transaction-cancelled", "unknown-attempt"],
      `${fixture.name} renders every executable Bag/Buyer parity scenario`,
    );
    for (const card of result.parityCards) {
      assert.deepEqual(card.sources.map((source) => source.source), ["shopping-bag", "buyer-purchases"], `${fixture.name} ${card.key} renders both live emitter owners`);
      assert.equal(card.sources[0].stateKey, card.sources[1].stateKey, `${fixture.name} ${card.key} keeps axis/state/context parity`);
      assert.equal(card.sources[0].color, card.sources[1].color, `${fixture.name} ${card.key} keeps computed semantic-color parity`);
    }
    assert.deepEqual(result.mixedStops, ["bag-departure", "checkout-alert"], `${fixture.name} visibly retains both mixed-truth product stops`);
    assert.ok(result.governanceLabels.filter((label) => label === "GOVERNANCE-PENDING").length >= 11, `${fixture.name} makes every pending fixture explicit`);
    assert.match(result.bodyText, /IN-MEMORY FIXTURES ONLY/, `${fixture.name} states the fixture safety boundary`);

    for (const marker of result.markers) {
      assert.equal(marker.color, marker.expectedColor, `${fixture.name} ${marker.axis}:${marker.state} resolves its exact axis-qualified semantic color`);
      assert.equal(marker.governance, marker.expectedGovernance, `${fixture.name} ${marker.axis}:${marker.state} preserves governance disposition`);
      assert.equal(marker.meaning, marker.expectedMeaning, `${fixture.name} ${marker.axis}:${marker.state} preserves semantic meaning`);
      if (marker.fixtureBorder != null) {
        assert.equal(marker.fixtureBorder, marker.expectedFixtureBorder, `${fixture.name} ${marker.axis}:${marker.state} resolves its axis-qualified gallery line`);
        assert.ok(marker.fixtureBorderAlpha > 0, `${fixture.name} ${marker.axis}:${marker.state} gallery line has visible alpha`);
        assert.notEqual(marker.fixtureBorderStyle, "none", `${fixture.name} ${marker.axis}:${marker.state} gallery line has a painted style`);
        assert.ok(marker.fixtureBorderWidth > 0, `${fixture.name} ${marker.axis}:${marker.state} gallery line has nonzero width`);
        assert.ok(marker.fixtureRenderedBorderContrast > 1, `${fixture.name} ${marker.axis}:${marker.state} gallery line changes the actual surface`);
      }
      const typography = expectedTypography[marker.typographyContext];
      assert.ok(typography, `${fixture.name} ${marker.axis}:${marker.state} names its live typography context`);
      assert.equal(marker.fontSize, typography.fontSize, `${fixture.name} ${marker.axis}:${marker.state} preserves ${marker.typographyContext} size`);
      assert.equal(marker.fontWeight, typography.fontWeight, `${fixture.name} ${marker.axis}:${marker.state} preserves ${marker.typographyContext} weight`);
      assert.equal(marker.fontStyle, "normal", `${fixture.name} ${marker.axis}:${marker.state} is not decorative italic`);
      assert.equal(marker.effectiveOpacity, 1, `${fixture.name} ${marker.axis}:${marker.state} has no compounded dimming`);
      assert.deepEqual(marker.filteredAncestors, [], `${fixture.name} ${marker.axis}:${marker.state} has no filtered ancestor`);
      assert.ok(
        marker.contrast >= (fixture.appearance === "light" ? 7 : 4.5),
        `${fixture.name} ${marker.axis}:${marker.state} on ${marker.surface} clears its readability floor (actual ${marker.contrast.toFixed(3)}; color ${marker.color}; background ${marker.background})`,
      );
    }

    results.push({
      appearance: fixture.appearance,
      viewport: `${fixture.width}x${fixture.height}`,
      uniqueStates: uniquePairs.length,
      minimumContrast: Math.min(...result.markers.map((marker) => marker.contrast)).toFixed(2),
      minimumContrastBySurface: Object.fromEntries(
        [...new Set(result.markers.map((marker) => marker.surface))]
          .map((surface) => [surface, Math.min(...result.markers.filter((marker) => marker.surface === surface).map((marker) => marker.contrast)).toFixed(2)]),
      ),
      minimumContrastByMeaning: Object.fromEntries(
        [...new Set(result.markers.map((marker) => marker.meaning))]
          .map((meaning) => [meaning, Math.min(...result.markers.filter((marker) => marker.meaning === meaning).map((marker) => marker.contrast)).toFixed(2)]),
      ),
      minimumRenderedGalleryLineContrast: Math.min(
        ...result.markers
          .filter((marker) => marker.fixtureRenderedBorderContrast != null)
          .map((marker) => marker.fixtureRenderedBorderContrast),
      ).toFixed(2),
    });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`LS-2 Accepted Purchase / Payment actual-surface PASS\n${JSON.stringify(results, null, 2)}`);
