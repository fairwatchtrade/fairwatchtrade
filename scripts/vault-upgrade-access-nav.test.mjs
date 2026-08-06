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

console.log(`vault-upgrade-access-nav: ${pass} assertions PASS`);
