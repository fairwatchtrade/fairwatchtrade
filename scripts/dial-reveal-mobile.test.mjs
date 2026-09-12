/* ════════════════════════════════════════════════════════════════════════
   DIAL REVEAL — touch parity contract

   Run: node scripts/dial-reveal-mobile.test.mjs

   The XCover regression this catches is not a width problem. Dial Reveal
   used to return the plain photograph whenever the primary pointer was
   coarse, so the complete control disappeared on the physical phone. The
   mobile Drawer is still allowed to suspend the control while it is open;
   touch capability by itself is not.
   ════════════════════════════════════════════════════════════════════════ */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
let n = 0;
const ok = (label, condition) => {
  n += 1;
  assert.ok(condition, label);
};

const reveal = read("components/DialReveal.tsx");
const gallery = read("components/ListingGallery.tsx");
const capabilityCopy = read("lib/whatFairWatchTradeCanDo/content.ts");

ok(
  "T1 a coarse/touch pointer no longer replaces Dial Reveal with a plain image",
  !/if \(!supportsHover \|\| suspended\)/.test(reveal)
);
ok(
  "T1 the open mobile Drawer still suspends and resets Dial Reveal",
  /if \(suspended\)/.test(reveal) &&
    /setActive\(false\)/.test(reveal) &&
    /setLevel\(FADER_DEFAULT\)/.test(reveal)
);
ok(
  "T2 the touch anchor has a 44px hit target while fine pointers retain the approved 16px target",
  /supportsHover[\s\S]{0,220}h-\[16px\][\s\S]{0,220}h-\[44px\]/.test(reveal)
);
ok(
  "T2 the touch fader has a 44px-wide drag surface while the desktop fader stays unchanged",
  /supportsHover[\s\S]{0,220}h-\[18px\][\s\S]{0,220}h-\[44px\]/.test(reveal)
);
ok(
  "T2 fader gestures are owned by the fader rather than scrolling the page",
  /\.fwt-dial-fader\{[^}]*touch-action:none/.test(reveal)
);
ok(
  "T3 the hover-only Click tooltip is never mounted as touch guidance",
  /\{supportsHover && \([\s\S]*Click for Dial Reveal[\s\S]*\)\}/.test(reveal)
);
ok(
  "T4 the listing still mounts Dial Reveal only for the actual dial photograph",
  /dialUrl && heroUrl === dialUrl/.test(gallery) && /<DialReveal/.test(gallery)
);
ok(
  "T5 public capability copy no longer falsely limits Dial Reveal to desktop",
  !/supported desktop devices/.test(capabilityCopy)
);

console.log(`dial-reveal-mobile: ${n} assertions passed`);
