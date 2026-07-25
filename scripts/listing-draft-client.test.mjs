/* Client seam pure-logic tests (URL construction + poll predicates).
   The RPC result states are proven by the transactional data-layer harness.
   Run: node scripts/listing-draft-client.test.mjs */
import assert from "node:assert/strict";
import { handoffPath, handoffUrl, handoffIsLive, desktopIsPaused } from "../lib/listingDraftShared.ts";

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); pass++; };

// URL carries only the opaque token — never a draft/seller id.
ok("path is token-only", handoffPath("abc123") === "/sell/continue/abc123");
ok("token is url-encoded", handoffPath("a/b?c").includes("a%2Fb%3Fc"));
ok("absolute url built", handoffUrl("tok", "https://fairwatchtrade.com") === "https://fairwatchtrade.com/sell/continue/tok");
ok("origin trailing slash trimmed", handoffUrl("tok", "https://x.com/") === "https://x.com/sell/continue/tok");

// Poll should run only while a handoff is live.
ok("live when issued+active", handoffIsLive({ state: "OK", handoff_status: "issued", status: "active" }));
ok("live when redeemed+active", handoffIsLive({ state: "OK", handoff_status: "redeemed", status: "active" }));
ok("not live when none", !handoffIsLive({ state: "OK", handoff_status: "none", status: "active" }));
ok("not live when expired", !handoffIsLive({ state: "OK", handoff_status: "expired", status: "active" }));
ok("not live when published", !handoffIsLive({ state: "OK", handoff_status: "redeemed", status: "published" }));

// Desktop paused exactly when the phone holds the baton.
ok("paused when phone active", desktopIsPaused({ state: "OK", active_editor: "phone", status: "active" }));
ok("not paused when desktop active", !desktopIsPaused({ state: "OK", active_editor: "desktop", status: "active" }));
ok("not paused after publish", !desktopIsPaused({ state: "OK", active_editor: "phone", status: "published" }));

console.log(`listing-draft-client: ${pass} assertions PASS`);
