/* Correction B — signed-out Catalogue must resolve to the sign-in callback
   contract, never the /sell bounce (which terminated in the error page).
   Source-contract assertion on the server component's guest redirect.
   Run: node scripts/catalogue-guest-redirect.test.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../app/catalogue/page.tsx", import.meta.url), "utf8");

let pass = 0;
// Redirects a signed-out visitor to sign-in, preserving /catalogue as callback.
assert.ok(
  src.includes('redirect("/login?callbackUrl=/catalogue")'),
  "catalogue redirects guests to /login?callbackUrl=/catalogue"
);
pass++;
// No /sell bounce remains.
assert.ok(!src.includes('redirect("/sell")'), "catalogue no longer bounces guests to /sell");
pass++;
// The guard still runs only for unauthenticated users (behavior preserved).
assert.ok(/if\s*\(!user\)/.test(src), "guest guard still present");
pass++;

console.log(`catalogue-guest-redirect: ${pass} assertions PASS`);
