/* Vault Specification Upgrade — access-control and navigation contract
   assertions on the route sources (repository convention for route tests).
   Run: node scripts/vault-upgrade-access-nav.test.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const upgradePage = read("app/admin/vault-upgrade/page.tsx");
const reviewPage = read("app/admin/vault-review/page.tsx");
const tabs = read("components/VaultRoomTabs.tsx");
const dashboard = read("components/AdminDashboard.tsx");
const room = read("components/VaultSpecificationUpgrade.tsx");

let pass = 0;
const ok = (name, condition) => {
  assert.ok(condition, name);
  pass++;
};

// Unauthorized access fails closed with the same gate as vault-review.
const gateOf = (src) => src.match(/const ADMIN_EMAIL = "([^"]+)"/)?.[1];
ok("upgrade page has the email gate", gateOf(upgradePage) !== undefined);
ok("gate matches vault-review exactly", gateOf(upgradePage) === gateOf(reviewPage));
ok(
  "unauthorized users are redirected away",
  /if \(!user \|\| user\.email\?\.toLowerCase\(\) !== ADMIN_EMAIL\.toLowerCase\(\)\) \{\s*redirect\("\/"\);/.test(
    upgradePage
  )
);

// /admin visibly reaches Vault Review.
ok(
  "/admin has a visible Vault Review door",
  dashboard.includes('href="/admin/vault-review"') &&
    dashboard.includes("Vault Review")
);

// Both rooms reach each other and Admin Home through labeled links.
ok("tabs link to Cluster Review", tabs.includes('href: "/admin/vault-review"'));
ok("tabs link to Specification Upgrade", tabs.includes('href: "/admin/vault-upgrade"'));
ok("tabs link to Admin Home", tabs.includes('href="/admin"'));
ok("Cluster Review page renders the shared tabs", reviewPage.includes("VaultRoomTabs"));
ok("Specification Upgrade page renders the shared tabs", upgradePage.includes("VaultRoomTabs"));

// The governed specification bytes stay server-side.
ok(
  "server page derives the contract from the byte carrier",
  upgradePage.includes("vault-lock-v3.2.spec-bytes.ts") &&
    upgradePage.includes("verifyActiveContract")
);
ok(
  "client room never imports the specification bytes",
  !room.includes("spec-bytes")
);

// The room performs no database work — its imports are local-only.
ok(
  "client room has no supabase import",
  !room.includes("supabase")
);
ok(
  "client room persists to the local queue only",
  room.includes("openVaultUpgradeDb")
);
ok(
  "client room reports storage unavailability honestly",
  room.includes("Local work queue unavailable")
);

// Honest copy: local staging label and folder support never claimed.
ok(
  "local staging labeled honestly",
  room.includes("stored in this browser")
);
ok("no folder-intake claim", !/entire folder/i.test(room));

// Repeated context is cached rather than re-bought. The placement logic is
// proven behaviorally in the completion suite; these confirm the route
// actually wires it up.
const researchRoute = read("app/api/admin/vault-upgrade/research/route.ts");
ok(
  "the static instructions are sent as a cacheable block",
  /system:\s*\[[\s\S]{0,300}cache_control/.test(researchRoute)
);
ok(
  "the shared prefix is held long enough to outlive a single file",
  /cache_control:\s*\{\s*type:\s*"ephemeral",\s*ttl:\s*"1h"\s*\}/.test(
    researchRoute
  )
);
ok(
  "a resumed search re-anchors its breakpoints rather than re-buying context",
  researchRoute.includes("applyMessageCacheBreakpoints(messages)")
);
ok(
  "what the call consumed is returned to the room",
  /usage,\s*\n\s*\}\);/.test(researchRoute) &&
    researchRoute.includes("usageOfTurn(data)")
);

// Active-run feedback: the established house treatment, and nothing invented.
ok(
  "the shared watch spinner is reused rather than a new one invented",
  room.includes('from "@/components/WatchSpinner"') &&
    room.includes("<WatchSpinner")
);
ok(
  "elapsed time is measured from a recorded start",
  room.includes("formatElapsed") && room.includes("setStartedAt")
);
ok(
  "the clock stops wherever a run reaches a terminal state",
  /setStartedAt\(\(prev\) => \{[\s\S]{0,120}next\.delete\(hash\)/.test(room)
);
ok(
  "cancelling a single file is still offered during a run",
  room.includes("Cancel this file")
);
// Runs are sequential, so the queue must be visible or a batch looks like it
// gave up after the first file.
ok(
  "files committed to a run are shown as queued",
  room.includes("queuedHashes") && /Queued/.test(room)
);
ok(
  "the count separates what is running from what is waiting",
  room.includes("active · ") && room.includes("queued")
);
ok(
  "the bulk completing control carries the activity indicator too",
  /completing\.size > 0 && <WatchSpinner/.test(room)
);
/* A visible queue that keeps marching after Cancel would be a worse lie
   than showing no queue at all. */
ok(
  "cancelling the run stops the queue, not just the file in flight",
  room.includes("cancelAllRef") &&
    /cancelAllRef\.current = true;[\s\S]{0,80}setQueuedHashes\(new Set\(\)\)/.test(
      room
    ) &&
    /if \(cancelAllRef\.current\) break;/.test(room)
);

/* The room cannot know how long a research round will take, so it must not
   imply otherwise. No share-of-total, no bar, no arrival time.

   Scanned with comments stripped: prose explaining that there is no
   percentage is not a percentage, and an assertion that cannot tell the
   difference would fail on its own documentation. */
const roomCode = room.replace(/\/\*[\s\S]*?\*\//g, " ");
ok("no fake percentage", !/\b\d+\s*%|percent(age)?\b/i.test(roomCode));
ok(
  "no fake progress bar",
  !/progress-?bar|role="progressbar"|<progress\b/i.test(roomCode)
);
ok(
  "no estimated time of arrival",
  !/\bETA\b|estimated (time|completion)|time remaining|remaining time/i.test(
    roomCode
  )
);

console.log(`vault-upgrade-access-nav: ${pass} assertions PASS`);
