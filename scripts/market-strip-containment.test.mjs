/* Market strip containment — GRS-011 / GW06-F01
   Run: node scripts/market-strip-containment.test.mjs

   THE DEFECT THIS GUARDS, stated so it cannot come back by accident:

     The strip is one flex row — [metals][divider][‹][auction scroller][›] —
     inside px-6 gutters. The metals block was `shrink-0`. At a 360px
     viewport its intrinsic 265px could not yield, so the row's fixed chrome
     was pushed past the edge: the right arrow measured 358→386 against a
     360px document, two pixels of it inside the viewport, and the document
     carried 26px of horizontal overflow that EVERY page sharing the shell
     inherited.

     The arrow was never the defect. It was the last item in a row whose
     first item refused to shrink.

   The two properties that must hold together, and the reason neither alone
   is enough:

     · the metals block must be able to SHRINK and scroll its own overflow,
       or it pushes the chrome off-screen again;
     · the auction scroller must keep a NON-ZERO flex basis, or shrink
       weighting (which is proportional to basis) hands the entire deficit
       to the metals and leaves the scroller 0px wide — contained, but
       useless, which fails "fully visible and usable" just as surely.

   Measured on production after the repair, signed out:
     360px → document overflow none, right arrow 308→336, metals 153px,
             scroller 70px, both scrollable, arrow topmost and functional
     386px → document overflow none, right arrow 334→362, metals 171px,
             scroller 78px
     1280px → unchanged from before: metals at its natural 265px starting at
              24, right arrow ending at 1241 with a 24px gutter */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let n = 0;
const ok = (name, cond) => { assert.ok(cond, name); n += 1; };

const src = readFileSync(new URL("../components/MarketBar.tsx", import.meta.url), "utf8");
/* Checked as CODE: the comments deliberately name `shrink-0` and the old
   geometry in order to record what went wrong, and a naive grep would read
   that history as the defect still being present. */
const code = src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "");

const row = code.match(/<div className="flex h-11 w-full items-center gap-2 px-6">/);
ok("the strip row is one full-width flex row with px-6 gutters", !!row);
ok("no width cap is reintroduced on the strip row",
  !/max-w-screen|max-w-\[|mx-auto/.test(code.slice(code.indexOf("h-11"), code.indexOf("h-11") + 400)));

/* ── the metals block yields ── */
const metals = code.match(/<div className="flex ([^"]*?)items-center gap-4 ([^"]*?)pr-3([^"]*)"/);
ok("the metals block is still present with its pr-3 separation", !!metals);
const metalsClass = metals ? metals[0] : "";
ok("the metals block is NOT shrink-0 — that was the defect",
  !/\bshrink-0\b/.test(metalsClass));
ok("the metals block can shrink", /\bshrink\b/.test(metalsClass) && !/shrink-0/.test(metalsClass));
ok("the metals block does not grow past its natural width on desktop",
  /\bgrow-0\b/.test(metalsClass));
ok("the metals block keeps its natural width when it fits (basis-auto)",
  /\bbasis-auto\b/.test(metalsClass));
ok("the metals block scrolls its own overflow rather than clipping it",
  /overflow-x-auto/.test(metalsClass));
ok("the metals block's scrollbar is hidden like the auction one",
  /\[scrollbar-width:none\]/.test(metalsClass) && /\[&::-webkit-scrollbar\]:hidden/.test(metalsClass));
ok("the metals block can actually shrink below its content (min-w-0)",
  /\bmin-w-0\b/.test(metalsClass));

/* ── each metal stays whole ── */
ok("each metal is shrink-0 so a price never wraps or squeezes",
  /<div key=\{m\.key\} className="flex shrink-0 items-center gap-2">/.test(code));
ok("the London label does not shrink either",
  /className="select-none shrink-0 text-\[11px\]/.test(code));

/* ── the auction scroller keeps a usable share ── */
const scroller = code.match(/className="flex ([^"]*?)gap-2 overflow-x-auto scroll-smooth px-1([^"]*)"/);
ok("the auction scroller is still an overflow-x scroller", !!scroller);
const scrollerClass = scroller ? scroller[0] : "";
ok("the auction scroller has a NON-ZERO flex basis — a zero basis collapses it to 0px",
  /basis-\[\d+px\]/.test(scrollerClass));
ok("the auction scroller is no longer plain flex-1 (basis 0)",
  !/\bflex-1\b/.test(scrollerClass));
ok("the auction scroller still grows into free space on desktop",
  /\bgrow\b/.test(scrollerClass));
ok("the auction scroller still shrinks when space is tight",
  /\bshrink\b/.test(scrollerClass));

/* ── the fixed chrome stays fixed ── */
ok("both scroll arrows stay shrink-0 at their 28px size",
  (code.match(/className="flex h-7 w-7 shrink-0 items-center justify-center/g) || []).length === 2);
ok("the divider stays shrink-0", /className="my-2 w-px shrink-0 self-stretch/.test(code));

/* ── behaviour preserved ── */
ok("both arrows keep their accessible labels",
  code.includes('aria-label="Scroll auctions left"') && code.includes('aria-label="Scroll auctions right"'));
ok("the arrows still drive the same 220px scrollBy",
  /scrollBy\(\{ left: dir \* 220, behavior: "smooth" \}\)/.test(code));
ok("the auction chrome still collapses entirely when there are no auctions",
  /\{ordered\.length > 0 && \(/.test(code));
ok("auction cards keep their min width inside the scroller",
  /min-w-\[190px\] shrink-0/.test(code));
ok("the strip still consumes /api/auctions through the contract",
  code.includes('fetch("/api/auctions")'));

/* ── the shell, not one page ── */
/* Comments stripped: the layout's own comment mentions <MarketBar /> when
   describing where the masthead sits above it, so the mount count must be
   taken from code. */
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8")
  .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "");
ok("the strip is mounted once in the shared root layout",
  (layout.match(/<MarketBar \/>/g) || []).length === 1);
ok("the repair lives in the shared component, not in any page",
  !/MarketBar|market-strip/i.test(
    readFileSync(new URL("../components/WhatFairWatchTradeCanDo.tsx", import.meta.url), "utf8")));

console.log(`market-strip-containment: ${n} assertions PASS`);
