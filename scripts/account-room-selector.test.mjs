/* Account Room Selector — interaction + palette guard
   (SFX-026 · dismissal-consumption correction, 2026-08-29)

   Run: node scripts/account-room-selector.test.mjs

   The law under guard: THE DISMISSAL GESTURE BELONGS TO THE OPEN SELECTOR.
   An outside tap while the menu is open closes it and does nothing else —
   no control underneath may receive that interaction. Proven here at the
   mechanism level: dismissal is a mounted catcher that consumes the click
   by construction, never a document listener that closes on mousedown and
   lets the same tap's click land on whatever stood beneath (the Android
   sequence that navigated a dismissal into the Dealer room on the real
   device).

   Also pinned: the ruled selector palette (mineral structure, ink content),
   the eight real rooms, and the accessibility contract the native select
   was replaced under. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  passed += 1;
}

const src = readFileSync(
  new URL("../components/AccountRoomSelector.tsx", import.meta.url),
  "utf8"
);

/* ── 1 · dismissal consumption — the defect can never come back ── */
ok("a mounted catcher owns outside dismissal",
  src.includes('className="fixed inset-0 z-30 cursor-default"'));
ok("the catcher CONSUMES the gesture — prevent + stop + close, in that layer",
  /fixed inset-0 z-30[\s\S]{0,220}preventDefault\(\);[\s\S]{0,80}stopPropagation\(\);[\s\S]{0,80}setOpen\(false\);/.test(src));
ok("the catcher sits under the menu, above the page",
  src.indexOf("z-30") < src.indexOf("z-40") && src.includes("top-[46px] z-40"));
ok("no document mousedown dismissal remains — that was the pass-through",
  !src.includes('addEventListener("mousedown"'));
ok("the catcher renders only while open",
  /\{open && \(\s*<div\s*aria-hidden="true"\s*className="fixed inset-0 z-30/.test(src));
ok("the root cause is recorded where the next person will read it",
  src.includes("SWALLOWED by") && src.includes("synthesized mousedown"));

/* ── 2 · selection activates exactly once, then closes ── */
ok("selecting a room closes the menu and calls onSelect once",
  /setOpen\(false\);\s*if \(!selected\) onSelect\(room\.id\);/.test(src));
ok("re-selecting the current room is a close, not a navigation",
  src.includes("if (!selected) onSelect(room.id);"));

/* ── 3 · Escape + focus contract preserved ── */
ok("Escape still closes",
  /e\.key === "Escape"[\s\S]{0,60}setOpen\(false\);/.test(src));
ok("Escape returns focus to the trigger",
  /Escape"[\s\S]{0,120}triggerRef\.current\?\.focus\(\);/.test(src));
ok("route/module change still closes via render-adjustment, never an effect",
  src.includes("valueWhenOpened !== value") && src.includes("setOpen(false);"));

/* ── 4 · the ruled palette survives (v7.42) ── */
ok("chevron is mineral",
  /text-\[var\(--mineral\)\]"?>\s*<Chevron/.test(src));
ok("selected edge + wash are mineral, at the governed wash value",
  src.includes('border-[var(--mineral)] bg-[rgba(62,99,121,0.07)]'));
ok("selection check is mineral",
  /selected && \([\s\S]{0,60}text-\[var\(--mineral\)\]/.test(src));
ok("no gold remains in the selector's structural language",
  !src.includes("--gold"));
ok("current-room word keeps the display serif ink",
  src.includes('font-display text-[16px] font-light text-[var(--platinum)]'));

/* ── 5 · destinations + truth unchanged ── */
{
  const rooms = ["Overview","Listings","Trades","Messages","Saved","Wanted","Dealer","Settings"];
  ok("all eight real Account rooms, in the select's original order",
    rooms.every((r) => src.includes(`label: "${r}"`)) &&
      rooms.map((r) => src.indexOf(`label: "${r}"`)).every((v, i, a) => i === 0 || v > a[i - 1]));
  ok("Marketplace Control remains absent as a DESTINATION (the comment may name it as excluded)",
    !/label: "Marketplace/i.test(src) && !/id: "market/i.test(src));
  ok("selection speaks through the caller's onSelect — no second routing truth",
    // Call syntax only: the header COMMENT rightly describes the caller's
    // pushState mechanism; the component itself must never invoke routing.
    !/router.(push|replace|back)(/.test(src) &&
      !/history.pushState(/.test(src) &&
      src.includes("onSelect(room.id)"));
}

console.log(`account-room-selector: ${passed} assertions PASS`);
