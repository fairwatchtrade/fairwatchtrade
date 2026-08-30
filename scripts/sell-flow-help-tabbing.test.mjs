/* ════════════════════════════════════════════════════════════════════════
   THE ? LEAVES THE SELLER'S TAB PATH                               (v7.57)

   The HelpBubble trigger opens on FOCUS, which is right on a reading surface
   and wrong inside a form. In the Sell Flow the ? sits between fields the
   seller tabs through, so every tab fired a bubble they had not asked for
   and then had to tab back out of — help interrupting the task it exists to
   support.

   Scoped, never global. HelpBubble is shared by eight rooms; on the reading
   surfaces the ? is a destination and belongs in the tab order. Only a form
   makes it an obstacle, so only the form opts out.

   Run:  node scripts/sell-flow-help-tabbing.test.mjs
   ════════════════════════════════════════════════════════════════════════ */

import assert from "node:assert";
import { readFileSync } from "node:fs";

let n = 0;
const ok = (label, cond) => { n += 1; assert.ok(cond, label); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const bubble = read("components/HelpBubble.tsx");
const sell = read("components/SellFlow.tsx");
const photos = read("components/PhotoUpload.tsx");

/* ── The mechanism ─────────────────────────────────────────────────────── */
ok("the trigger's tab stop is driven by a prop, not hardcoded",
   /tabIndex=\{tabbable \? undefined : -1\}/.test(bubble));
ok("tabbable defaults to true, so every other room is unchanged",
   /tabbable = true,/.test(bubble));
ok("undefined is used for the default rather than 0 — a button's own tab behaviour is left alone",
   !/tabIndex=\{tabbable \? 0 : -1\}/.test(bubble));

/* ── Only the Sell Flow opts out ───────────────────────────────────────── */
ok("the Sell Flow's Condition help is out of the tab order",
   /historyKey="fwtConditionHelp"[\s\S]{0,400}tabbable=\{false\}/.test(sell));
ok("the photo step's Service Evidence help is out of the tab order",
   /historyKey="fwtServiceEvidenceHelp"[\s\S]{0,300}tabbable=\{false\}/.test(photos));
for (const room of ["components/CommunicationsRoom.tsx", "components/AccountDashboard.tsx",
                    "components/MarketplaceControl.tsx", "components/DealerRoomActions.tsx"]) {
  ok(`${room.split("/").pop()} keeps its ? in the tab order`,
     !/tabbable=\{false\}/.test(read(room)));
}

/* ── Pointer and assistive behaviour survive ───────────────────────────── */
ok("the trigger is still a real button", /type="button"/.test(bubble));
ok("click still opens and closes it", /onClick=\{\(\) => \{[\s\S]{0,160}openHelp\(true\)/.test(bubble));
ok("hover still opens it", /onPointerEnter=/.test(bubble));
ok("it keeps its accessible name and expanded state",
   /aria-label=\{label\}/.test(bubble) && /aria-expanded=\{open\}/.test(bubble));

/* ── The form's own controls are untouched ─────────────────────────────── */
ok("no form input or primary control was given a negative tab index",
   !/tabIndex=\{-1\}/.test(sell) && !/tabIndex=\{-1\}/.test(photos));

console.log(`sell-flow-help-tabbing: ${n} assertions passed`);
