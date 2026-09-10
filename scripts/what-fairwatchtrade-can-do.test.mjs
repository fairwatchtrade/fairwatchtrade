/* What Can FairWatchTrade Do For Me? — content parity + integration guards
   (language-pass baseline + consolidated corrections C01–C08, 2026-09-09)

   Run: node scripts/what-fairwatchtrade-can-do.test.mjs

   This is content-parity proof against the settled baseline, NOT a
   capability audit: the inventory (52 ordinary rows in four rooms, 25 live /
   27 available-with-limits, one separate coming Tax Time block, eight
   shared refusals), the exact corrected strings, the absence of the retired
   strings, and the integration semantics of the room. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CLOSING_PATHS,
  COMING_LABEL,
  HERO,
  REFUSALS,
  ROOMS,
  ROOM_IDS,
  SPECIALTY,
  STATUS_LABELS,
  TAX_TIME,
  allBenefits,
  roomBenefitCount,
} from "../lib/whatFairWatchTradeCanDo/content.ts";

let n = 0;
const ok = (name, cond) => { assert.ok(cond, name); n += 1; };
const eq = (name, a, b) => { assert.equal(a, b, name); n += 1; };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/* ── 1 · inventory shape (mechanical, from the supplied source) ── */
assert.deepEqual([...ROOM_IDS], ["browse", "buy", "sell", "dealer"], "four rooms, in order"); n += 1;
assert.deepEqual(ROOMS.map((r) => r.choice), [
  "I want to browse watches", "I might buy a watch", "I might sell once in a while", "I’m a dealer",
], "the four audience choices are the supplied ones"); n += 1;
eq("Browse has 14 ordinary rows", roomBenefitCount("browse"), 14);
eq("Buy has 12 ordinary rows", roomBenefitCount("buy"), 12);
eq("Sell has 14 ordinary rows", roomBenefitCount("sell"), 14);
eq("Dealer has 12 ordinary rows", roomBenefitCount("dealer"), 12);
const all = allBenefits();
eq("52 ordinary rows in total", all.length, 52);
eq("25 LIVE rows", all.filter((x) => x.status === "live").length, 25);
eq("27 BOUNDED rows", all.filter((x) => x.status === "bounded").length, 27);
ok("every row carries only live or bounded (Tax Time is never an ordinary row)",
  all.every((x) => x.status === "live" || x.status === "bounded"));
ok("no ordinary row is titled Tax Time", !all.some((x) => /tax time/i.test(x.title)));
ok("every row has a non-empty title and body", all.every((x) => x.title.trim() && x.body.trim()));
eq("eight shared refusals", REFUSALS.length, 8);

/* ── 2 · C01 — no public count pills ── */
const component = read("components/WhatFairWatchTradeCanDo.tsx");
ok("component renders no benefit counts", !/\d+ benefits|benefits\.length|current \+ 1 coming|roomBenefitCount/.test(component));
ok("content carries no count-pill strings", !/\b1[24] benefits\b|12 current \+ 1 coming/.test(JSON.stringify(ROOMS)));

/* ── 3 · C02 — class preserved, visible label changed ── */
eq("bounded visible label is Available with limits", STATUS_LABELS.bounded, "Available with limits");
eq("live visible label is Live", STATUS_LABELS.live, "Live");
eq("Tax Time label is Coming / In development", COMING_LABEL, "Coming / In development");
ok("the word Bounded never appears as visible text in the component", !/[>"'`\s]Bounded[<"'`\s.]/.test(component));
ok("the word Bounded never appears in any published string",
  !JSON.stringify({ ROOMS, REFUSALS, TAX_TIME, HERO, SPECIALTY }).includes("Bounded"));
ok("the label is rendered through STATUS_LABELS, not hand-typed", component.includes("STATUS_LABELS[benefit.status]"));

/* ── 4 · C03 — hero ── */
eq("page title kept", HERO.title, "What Can FairWatchTrade Do For Me?");
eq("hero paragraph is the precise version",
  HERO.intro,
  "Choose what you came to do, and see what FairWatchTrade can actually help with today — including where it deliberately stops and what isn’t available yet.");
ok("the earlier hero sentence is gone", !HERO.intro.includes("FairWatchTrade does different jobs"));

/* ── 5 · C04 — Tax Time ── */
eq("Tax Time lead is unchanged", TAX_TIME.lead, "Reporting is not available yet.");
eq("Tax Time boundary is the settled sentence, with the present-tense claim removed",
  TAX_TIME.boundary,
  "Tax Time is being built to support record preparation. It is not tax advice, a tax filing service, an accounting system, a profit-and-loss engine, or an official tax-form generator.");
ok("no present-tense capability claim fights the not-available state", !TAX_TIME.boundary.startsWith("Tax Time supports"));
ok("the superseded boundary wording is gone", !TAX_TIME.boundary.includes("for you and your accountant"));
ok("exports remain future, not working downloads", TAX_TIME.body.includes("with future PDF and CSV exports"));
ok("Tax Time renders as the one coming block inside the Dealer room", component.includes('r.id === "dealer" &&') && component.includes('tone="coming"'));

/* ── 6 · C05 — Delete ── */
const del = all.find((x) => x.title === "Remove versus permanent Delete");
ok("Remove versus permanent Delete row exists in Sell", !!del && ROOMS.find((r) => r.id === "sell").groups.some((g) => g.benefits.includes(del)));
eq("Delete explanation names dependencies broader than transactions",
  del.body,
  "Remove takes a listing off market without deleting its record. Permanent Delete is separate and may be blocked while something active still depends on the listing.");
ok("no seller-facing Restore promise", !/\brestore\b/i.test(JSON.stringify(ROOMS)));

/* ── 7 · C06 — specialty ── */
eq("specialty statement is the natural version",
  SPECIALTY.body,
  "Independent and boutique watchmakers are the heart of FairWatchTrade. Selected historic and collector-worthy references from larger manufacturers may also enter through stricter curation.");
ok("no invented higher-bar mechanic", !SPECIALTY.body.includes("higher bar"));
ok("no internal specialty-truth label", !/specialty truth/i.test(SPECIALTY.lead + SPECIALTY.body + component));

/* ── 8 · C07 — publication refusal ── */
const pub = REFUSALS[3];
eq("publication refusal heading", pub.heading, "No going live with a blocking review issue or no watch photos.");
eq("publication refusal body", pub.body, "If review still has an issue that prevents publication — or there are no real watch photos — the listing does not go public.");
ok("“serious” is gone from every refusal", !REFUSALS.some((r) => /serious/i.test(r.heading + r.body)));

/* ── 9 · C08 — payment refusal, the founder's verbatim wording ── */
const pay = REFUSALS[5];
eq("payment heading", pay.heading, "No imaginary payment protection.");
eq("payment paragraph verbatim",
  pay.body,
  "Today, buyers and sellers arrange payment directly. FairWatchTrade does not currently hold escrow, provide buyer protection, or move Trade cash adjustments. If FWT offers a payment option in the future, its fees, protections, limits, and responsibilities will be stated explicitly.");
const everything = JSON.stringify({ ROOMS, REFUSALS, TAX_TIME, HERO, SPECIALTY }) + component;
ok("retired heading “No payment or escrow theater” absent", !everything.includes("No payment or escrow theater"));
ok("intermediate heading “Today, FWT does not handle the money” absent", !everything.includes("Today, FWT does not handle the money"));
ok("Stripe stays off the public page", !/stripe/i.test(everything));

/* ── 10 · remaining refusals unchanged ── */
assert.deepEqual(REFUSALS.map((r) => r.heading), [
  "No fake exact match.",
  "Unknown stays unknown.",
  "Couldn’t check does not mean all clear.",
  "No going live with a blocking review issue or no watch photos.",
  "Private does not mean reserved.",
  "No imaginary payment protection.",
  "Trade has clear rules, not blanket guarantees.",
  "No ads, crowd pressure, or fake urgency.",
], "eight refusal headings, in order"); n += 1;

/* ── 11 · no new claims ── */
ok("no claim of authentication as a service", !/\bauthenticat(es|ed) the watch for you\b|FWT authenticates/i.test(everything));
ok("exact/related language preserved", all.some((x) => x.body.includes("says so instead of swapping in a look-alike")));
ok("unknown/unconfirmed language preserved", all.some((x) => x.body.includes("leave it unconfirmed instead of guessing")));
ok("no Highlighter Search / Public Watch Index added", !/highlighter search|public watch index/i.test(everything));

/* ── 12 · integration: real shell, real doors, real semantics ── */
ok("prototype footer wording is not rendered", !everything.includes("public prototype") && !everything.includes("four reasons for visiting"));
ok("no second shell: no standalone header/topbar/footer element", !/<header|<footer|topbar|brandname/.test(component));
ok("no transplanted global CSS", !/<style|globals\.css|@import/.test(component));
assert.deepEqual(CLOSING_PATHS.map((p) => p.href), ["/browse", "/sell", "/account"], "closing paths are real existing destinations"); n += 1;
ok("closing paths render as real links", component.includes("CLOSING_PATHS.map(") && component.includes("<Link key={p.href} href={p.href}"));
ok("no dealer access is invented (no admin route, no dealer flag)", !/\/admin|dealer_profiles|is_dealer/.test(component));
ok("tablist semantics", component.includes('role="tablist"') && component.includes('role="tab"') && component.includes("aria-selected={active}") && component.includes("aria-controls={`wcd-panel-${r.id}`}"));
ok("tabpanel semantics", component.includes('role="tabpanel"') && component.includes("aria-labelledby={`wcd-tab-${r.id}`}") && component.includes("hidden={r.id !== room}"));
ok("roving tabindex", component.includes("tabIndex={active ? 0 : -1}"));
ok("arrow / Home / End keyboard navigation", /ArrowRight/.test(component) && /ArrowLeft/.test(component) && /"Home"/.test(component) && /"End"/.test(component));
ok("usable initial room without JS: browse is the default state", component.includes('useState<RoomId>("browse")'));
ok("direct room selection from the hash on load and on hashchange", component.includes("window.location.hash.slice(1)") && component.includes('addEventListener("hashchange"'));
ok("hash writes MERGE the framework's history state (History Merge Law)", component.includes("window.history.replaceState({ ...window.history.state }, \"\", `#${id}`)"));
ok("readability floor: no ghost/void text roles", !/--ghost|--void/.test(component));
ok("house tokens only: no raw hex colours", !/#[0-9a-fA-F]{3,6}\b/.test(component));

/* ── 13 · route + policy ── */
const page = read("app/what-fairwatchtrade-can-do/page.tsx");
ok("route renders the room inside the real shell (main + ink)", page.includes("<WhatFairWatchTradeCanDo />") && page.includes('bg-[var(--ink)]'));
ok("route metadata comes from the policy source", page.includes('staticRouteMetadata("/what-fairwatchtrade-can-do")'));
const policy = read("lib/seo/routeMetadata.ts");
ok("route is in the locked public set", policy.includes('"/what-fairwatchtrade-can-do": {'));

console.log(`what-fairwatchtrade-can-do: ${n} assertions PASS`);
