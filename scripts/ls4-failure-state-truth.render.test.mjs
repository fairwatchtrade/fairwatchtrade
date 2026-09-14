/* LS-4 deterministic browser truth proof.

   Start the development server on port 3100, then run:
     node scripts/ls4-failure-state-truth.render.test.mjs

   Every Purchase Request POST and Notification GET/PATCH is intercepted in
   Chromium. The fixture route is local-development-only, so this proof cannot
   create production state or manufacture a production failure. */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const url =
  process.env.LS4_FAILURE_TRUTH_URL ??
  "http://localhost:3100/internal/ls4-failure-state-truth";
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
assert.ok(executablePath, "Chrome/Chromium is available (or CHROME_PATH is set)");
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const confirmedNotification = {
  id: "ls4-notification",
  type: "system_notice",
  message: "A previously confirmed notification remains visible.",
  listing_id: null,
  purchase_request_id: null,
  transaction_id: null,
  read: false,
  created_at: "2026-09-13T20:00:00.000Z",
};
const routedNotification = {
  ...confirmedNotification,
  id: "ls4-routed-notification",
  message: "A routed notification keeps its doorway during failure.",
  listing_id: "ls4-routed-fixture",
};

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

async function clickText(page, selector, text) {
  const clicked = await page.$$eval(
    selector,
    (nodes, wanted) => {
      const node = nodes.find((candidate) => candidate.textContent?.trim() === wanted);
      if (!node) return false;
      node.click();
      return true;
    },
    text,
  );
  assert.equal(clicked, true, `${selector} contains actionable text ${text}`);
}

async function setValue(page, selector, value) {
  await page.click(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.type(value);
}

async function waitForText(page, text) {
  await page.waitForFunction(
    (wanted) => document.body.innerText.includes(wanted),
    { timeout: 10_000 },
    text,
  );
}

async function installInterception(page, state) {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.pathname === "/api/purchase-requests" || requestUrl.pathname === "/api/notifications") {
      state.requests.push({ path: requestUrl.pathname, method: request.method(), body: request.postData() });
    }
    if (requestUrl.pathname === "/api/purchase-requests" && request.method() === "POST") {
      const body = JSON.parse(request.postData() ?? "{}");
      if (String(body.notes ?? "").includes("transport")) {
        void request.abort("failed");
        return;
      }
      void request.respond({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: "duplicate_request",
          detail: "You already have a pending request on this listing.",
        }),
      });
      return;
    }
    if (requestUrl.pathname === "/api/notifications" && request.method() === "GET") {
      if (state.notificationGet === "error") {
        void request.respond({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "notifications_unavailable" }),
        });
      } else if (state.notificationGet === "one") {
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ notifications: [confirmedNotification], unread_count: 1 }),
        });
      } else if (state.notificationGet === "routed") {
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ notifications: [routedNotification], unread_count: 1 }),
        });
      } else {
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ notifications: [], unread_count: 0 }),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/notifications" && request.method() === "PATCH") {
      void request.respond({
        status: state.notificationPatch === "error" ? 503 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          state.notificationPatch === "error"
            ? { error: "notification_update_unconfirmed" }
            : { ok: true },
        ),
      });
      return;
    }
    void request.continue();
  });
}

async function provePurchaseOwner(page, owner, state) {
  const root = `[data-ls4-purchase-owner="${owner}"]`;
  if (owner === "inline") {
    await clickText(page, `${root} button`, "Start Purchase Request");
  }
  const offer = `${root} input[data-purchase-offer-for]`;
  const message = `${root} textarea`;
  await setValue(page, offer, "7000");
  await setValue(page, message, "known rejection fixture");
  await delay(500);
  const ready = await page.$eval(root, (node) => ({
    offer: node.querySelector("input[data-purchase-offer-for]")?.value,
    message: node.querySelector("textarea")?.value,
    send: [...node.querySelectorAll("button")]
      .filter((button) => button.textContent?.trim() === "Send Purchase Request")
      .map((button) => ({ disabled: button.disabled, text: button.textContent?.trim() })),
    text: node.textContent?.slice(-500),
  }));
  assert.ok(ready.send.some((button) => !button.disabled), `${owner}: send is enabled after controlled input ${JSON.stringify(ready)}`);
  const requestCount = state.requests.length;
  await clickText(page, `${root} button`, "Send Purchase Request");
  await delay(250);
  assert.ok(state.requests.length > requestCount, `${owner}: submission request left the real controller`);
  await page.waitForSelector(`${root} [data-purchase-request-failure="product_rejection"]`);
  assert.match(
    await page.$eval(`${root} [data-purchase-request-failure]`, (node) => node.textContent ?? ""),
    /Request not sent[\s\S]*already have a pending request/i,
  );
  assert.equal(await page.$eval(offer, (node) => node.value), "7000");
  assert.equal(await page.$eval(message, (node) => node.value), "known rejection fixture");

  await setValue(page, offer, "7100");
  await setValue(page, message, "transport unconfirmed fixture");
  await clickText(page, `${root} button`, "Send Purchase Request");
  await page.waitForSelector(`${root} [data-purchase-request-failure="submission_unconfirmed"]`);
  const unconfirmed = await page.$eval(
    `${root} [data-purchase-request-failure]`,
    (node) => ({ text: node.textContent ?? "", href: node.querySelector("a")?.getAttribute("href") }),
  );
  assert.match(unconfirmed.text, /Submission not confirmed/);
  assert.match(unconfirmed.text, /Check My Offers before trying again/);
  assert.equal(unconfirmed.href, "/catalogue#my-offers");
  assert.equal(await page.$eval(offer, (node) => node.value), "7100");
  assert.equal(await page.$eval(message, (node) => node.value), "transport unconfirmed fixture");
  const listingId = owner === "full" ? "ls4-full-purchase-request" : "ls4-inline-purchase-request";
  assert.deepEqual(
    await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? "null"), `fwt.pr.draft.${listingId}`),
    { offer: "7100", message: "transport unconfirmed fixture" },
    `${owner}: the unconfirmed draft survives the View My Offers handoff`,
  );
}

async function openBell(page) {
  await page.click('[data-ls4-notification-probe] [data-notification-bell]');
}

const results = [];
try {
  for (const fixture of [
    { appearance: "light", width: 1280, height: 800, completeNotificationFlow: true },
    { appearance: "dark", width: 360, height: 800, completeNotificationFlow: false },
  ]) {
    const page = await browser.newPage();
    await page.setViewport({ width: fixture.width, height: fixture.height, deviceScaleFactor: 1 });
    await page.setCookie({
      name: "fwt-appearance",
      value: fixture.appearance,
      url: new URL(url).origin,
      sameSite: "Lax",
    });
    const state = { notificationGet: "error", notificationPatch: "error", requests: [] };
    await installInterception(page, state);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector('[data-fixture-gallery="ls4-failure-state-truth"]');
    await page.waitForSelector('[data-fixture-hydrated="true"]');

    await provePurchaseOwner(page, "full", state);
    await provePurchaseOwner(page, "inline", state);

    await openBell(page);
    await waitForText(page, "Notifications couldn't be loaded right now.");
    const failedInitial = await page.$eval('[data-ls4-notification-probe]', (node) => node.textContent ?? "");
    assert.doesNotMatch(failedInitial, /No notifications yet/);
    assert.match(failedInitial, /Retry/);

    state.notificationGet = "empty";
    await clickText(page, '[data-ls4-notification-probe] button', "Retry");
    await waitForText(page, "No notifications yet.");

    if (fixture.completeNotificationFlow) {
      state.notificationGet = "one";
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-fixture-hydrated="true"]');
      await openBell(page);
      await waitForText(page, confirmedNotification.message);

      state.notificationGet = "error";
      await delay(30_500);
      await waitForText(page, "Couldn't refresh notifications. Showing the last loaded list.");
      const stale = await page.$eval('[data-ls4-notification-probe]', (node) => node.textContent ?? "");
      assert.match(stale, new RegExp(confirmedNotification.message));
      assert.doesNotMatch(stale, /No notifications yet/);

      state.notificationGet = "one";
      await clickText(page, '[data-ls4-notification-probe] button', "Retry");
      await page.waitForFunction(
        () => !document.body.innerText.includes("Showing the last loaded list"),
        { timeout: 10_000 },
      );

      state.notificationPatch = "error";
      const rowPatchCount = state.requests.filter((request) => request.method === "PATCH").length;
      await page.click('[data-ls4-notification-probe] button:has([data-notification-read-state="unread"])');
      await waitForText(page, "Couldn't confirm that change. Notifications will refresh.");
      assert.equal(
        state.requests.filter((request) => request.method === "PATCH").length,
        rowPatchCount + 1,
        "row activation requests confirmation once",
      );
      assert.equal(
        await page.$$eval('[data-ls4-notification-probe] [data-notification-read-state="unread"]', (nodes) => nodes.length),
        1,
        "failed row mark-read preserves last confirmed unread row",
      );

      const allPatchCount = state.requests.filter((request) => request.method === "PATCH").length;
      await clickText(page, '[data-ls4-notification-probe] button', "Mark all read");
      await waitForText(page, "Couldn't confirm that change. Notifications will refresh.");
      assert.equal(
        state.requests.filter((request) => request.method === "PATCH").length,
        allPatchCount + 1,
        "Mark-all requests confirmation once",
      );
      assert.equal(
        await page.$$eval('[data-ls4-notification-probe] [data-notification-read-state="unread"]', (nodes) => nodes.length),
        1,
        "failed Mark-all preserves last confirmed unread row",
      );
      assert.equal(
        await page.$eval('[data-ls4-notification-probe] [data-notification-visible-count]', (node) => node.textContent?.trim()),
        "1",
        "failed Mark-all preserves last confirmed count",
      );

      state.notificationPatch = "success";
      await clickText(page, '[data-ls4-notification-probe] button', "Mark all read");
      await page.waitForFunction(
        () => document.querySelectorAll('[data-ls4-notification-probe] [data-notification-read-state="unread"]').length === 0,
        { timeout: 10_000 },
      );
      assert.equal(
        await page.$$eval('[data-ls4-notification-probe] [data-notification-visible-count]', (nodes) => nodes.length),
        0,
      );
      const confirmed = await page.$eval('[data-ls4-notification-probe]', (node) => node.textContent ?? "");
      assert.match(confirmed, /Couldn't confirm that change/,
        "a separate confirmed mutation cannot erase the prior unconfirmed outcome before reconciliation");
      state.notificationGet = "empty";
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-fixture-hydrated="true"]');
      await openBell(page);
      await waitForText(page, "No notifications yet.");
      assert.doesNotMatch(
        await page.$eval('[data-ls4-notification-probe]', (node) => node.textContent ?? ""),
        /Couldn't confirm that change/,
        "an authoritative reload clears the unconfirmed-mutation notice",
      );
    }

    const geometry = await page.evaluate(() => ({
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      failures: [...document.querySelectorAll("[data-purchase-request-failure]")].map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      }),
    }));
    assert.equal(geometry.documentOverflow, false, `${fixture.appearance}: no document overflow`);
    assert.ok(
      geometry.failures.every((rect) => rect.left >= -0.5 && rect.right <= fixture.width + 0.5 && rect.width > 0),
      `${fixture.appearance}: failure truth stays inside viewport`,
    );
    if (fixture.completeNotificationFlow) {
      state.notificationGet = "routed";
      state.notificationPatch = "error";
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-fixture-hydrated="true"]');
      await openBell(page);
      await waitForText(page, routedNotification.message);
      const routedSelector = '[data-ls4-notification-probe] a[href="/listings/ls4-routed-fixture"]';
      assert.equal(await page.$eval(routedSelector, (node) => node.getAttribute("href")), "/listings/ls4-routed-fixture");
      await page.evaluate(() => {
        document.addEventListener("click", (event) => {
          const target = event.target instanceof Element ? event.target : null;
          if (target?.closest('a[href="/listings/ls4-routed-fixture"]')) event.preventDefault();
        }, { capture: true, once: true });
      });
      const routedPatchCount = state.requests.filter((request) => request.method === "PATCH").length;
      await page.click(routedSelector);
      await delay(250);
      await openBell(page);
      await waitForText(page, "Couldn't confirm that change. Notifications will refresh.");
      assert.equal(
        state.requests.filter((request) => request.method === "PATCH").length,
        routedPatchCount + 1,
        "routed row still requests mark-read confirmation once",
      );
      assert.equal(new URL(page.url()).pathname, "/internal/ls4-failure-state-truth");
      assert.equal(
        await page.$$eval('[data-ls4-notification-probe] [data-notification-read-state="unread"]', (nodes) => nodes.length),
        1,
        "routed row remains at last confirmed truth after failed confirmation",
      );
    }
    assert.deepEqual(pageErrors, [], `${fixture.appearance}: no page errors`);
    results.push(`${fixture.appearance} ${fixture.width}px: Purchase Request rejection/unconfirmed and Notification initial failure/ready render without overflow${fixture.completeNotificationFlow ? "; stale and PATCH confirmation sequence proved" : ""}`);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`LS-4 failure-state browser proof PASS\n${results.join("\n")}`);
