import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import test from "node:test";

import { dealerAccessFrom, NO_DEALER_ACCESS } from "../lib/dealerAccess.ts";
import { moduleFromParam, moduleVisible } from "../lib/accountModules.ts";

/* ── Dealer Accelerator designated-dealer-only (founder lock 2026-09-10) ──
   Dealer identity and Dealer Accelerator entitlement are separate facts.
   The capability exists only for seller accounts FairWatchTrade explicitly
   designated. No entitlement means no visibility, no navigation and no
   seller-facing invocation. Nothing here may be inferred from
   dealer_profiles, admitted_at, prior use, batches, sources or the URL.
   Run: node scripts/dealer-accelerator-entitlement.test.mjs
   ─────────────────────────────────────────────────────────────────────── */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");

const TCI = "524851b5-1eb5-45d2-92ad-533c2de8d465";
const WILLIAM = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";
const JOE = "00000000-0000-4000-8000-00000000c0de";
const GRANTED = "2026-09-10T15:00:00Z";

/* The resolver under test lives in its own module so the distinction from
   dealer identity is mechanical. Loaded lazily so a missing module is an
   assertion, not a crash before the first test. */
async function loadEntitlement() {
  try {
    return await import("../lib/dealerAcceleratorEntitlement.ts");
  } catch (e) {
    assert.fail(`lib/dealerAcceleratorEntitlement.ts is missing or broken: ${e?.message ?? e}`);
  }
}

const client = (result) => ({
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => result }),
    }),
  }),
});

test("dealer identity alone never grants Dealer Accelerator", async () => {
  const { dealerAcceleratorEntitlementFrom, NO_DEALER_ACCELERATOR } = await loadEntitlement();
  // A dealer_profiles-shaped row is not an entitlement row.
  assert.deepEqual(dealerAcceleratorEntitlementFrom({ seller_id: WILLIAM, admitted_at: "2026-09-01" }, WILLIAM), NO_DEALER_ACCELERATOR);
  assert.deepEqual(dealerAcceleratorEntitlementFrom({ seller_id: WILLIAM, business_name: "William Mynatt" }, WILLIAM), NO_DEALER_ACCELERATOR);
  // No record: closed.
  assert.deepEqual(dealerAcceleratorEntitlementFrom(null, WILLIAM), NO_DEALER_ACCELERATOR);
  assert.deepEqual(dealerAcceleratorEntitlementFrom(undefined, JOE), NO_DEALER_ACCELERATOR);
  // No user: closed even with a row.
  assert.deepEqual(dealerAcceleratorEntitlementFrom({ seller_id: TCI, granted_at: GRANTED, revoked_at: null }, null), NO_DEALER_ACCELERATOR);
  // A row for someone else is not this account's entitlement.
  assert.deepEqual(dealerAcceleratorEntitlementFrom({ seller_id: TCI, granted_at: GRANTED, revoked_at: null }, WILLIAM), NO_DEALER_ACCELERATOR);
  // Revoked is closed.
  assert.deepEqual(dealerAcceleratorEntitlementFrom({ seller_id: TCI, granted_at: GRANTED, revoked_at: "2026-09-11T00:00:00Z" }, TCI), NO_DEALER_ACCELERATOR);
  assert.equal(NO_DEALER_ACCELERATOR.dealerAccelerator, false);
});

test("an explicit, unrevoked entitlement row grants Dealer Accelerator", async () => {
  const { dealerAcceleratorEntitlementFrom } = await loadEntitlement();
  assert.deepEqual(dealerAcceleratorEntitlementFrom({ seller_id: TCI, granted_at: GRANTED, revoked_at: null }, TCI), { dealerAccelerator: true });
});

test("the read fails closed on error, throw and absence; open only on a matching live row", async () => {
  const { readDealerAcceleratorEntitlement, NO_DEALER_ACCELERATOR } = await loadEntitlement();
  assert.deepEqual(await readDealerAcceleratorEntitlement(client({ data: { seller_id: TCI, granted_at: GRANTED, revoked_at: null }, error: null }), TCI), { dealerAccelerator: true });
  assert.deepEqual(await readDealerAcceleratorEntitlement(client({ data: null, error: null }), TCI), NO_DEALER_ACCELERATOR);
  assert.deepEqual(await readDealerAcceleratorEntitlement(client({ data: { seller_id: TCI, granted_at: GRANTED, revoked_at: null }, error: { message: "boom" } }), TCI), NO_DEALER_ACCELERATOR);
  assert.deepEqual(await readDealerAcceleratorEntitlement({ from: () => { throw new Error("down"); } }, TCI), NO_DEALER_ACCELERATOR);
  assert.deepEqual(await readDealerAcceleratorEntitlement(client({ data: { seller_id: TCI, granted_at: GRANTED, revoked_at: null }, error: null }), WILLIAM), NO_DEALER_ACCELERATOR);
});

test("Tax Time's dealer-profile derivation is untouched and carries no DA key", () => {
  assert.deepEqual(dealerAccessFrom({ seller_id: WILLIAM }, WILLIAM), { taxTime: true });
  assert.deepEqual(dealerAccessFrom(null, WILLIAM), NO_DEALER_ACCESS);
  assert.equal("dealerAccelerator" in dealerAccessFrom({ seller_id: WILLIAM }, WILLIAM), false);
  const src = stripComments(read("lib/dealerAccess.ts"));
  assert.doesNotMatch(src, /dealer_accelerator_entitlements|dealerAccelerator/);
});

test("?module=accelerator resolves only for an entitled account; a dealer without it lands on Listings", () => {
  const williamAccess = { taxTime: true, dealerAccelerator: false };
  const tciAccess = { taxTime: true, dealerAccelerator: true };
  const joeAccess = { taxTime: false, dealerAccelerator: false };
  assert.equal(moduleFromParam("accelerator", tciAccess), "accelerator");
  assert.equal(moduleFromParam("accelerator", williamAccess), "inventory");
  assert.equal(moduleFromParam("accelerator", joeAccess), "inventory");
  assert.equal(moduleFromParam("accelerator", { taxTime: true }), "inventory");
  assert.equal(moduleFromParam("accelerator", null), "inventory");
  assert.equal(moduleFromParam("accelerator", undefined), "inventory");
  assert.equal(moduleVisible("accelerator", tciAccess), true);
  assert.equal(moduleVisible("accelerator", williamAccess), false);
  assert.equal(moduleVisible("accelerator", joeAccess), false);
  // Tax Time keeps its own law: William still has it, Joe still does not.
  assert.equal(moduleFromParam("tax-time", williamAccess), "tax-time");
  assert.equal(moduleFromParam("tax-time", joeAccess), "inventory");
  // Ordinary rooms are untouched for everyone.
  for (const id of ["dashboard", "inventory", "communications", "saved", "wanted", "trades"]) {
    assert.equal(moduleFromParam(id, joeAccess), id, id);
  }
});

/* ── Storage ─────────────────────────────────────────────────────────── */

test("one durable entitlement table, founder-written, never self-granted, never inherited", () => {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const file = readdirSync(dir).find((f) => /dealer_accelerator_entitlement/.test(f));
  assert.ok(file, "migration for dealer_accelerator_entitlements is missing");
  const sql = read(`supabase/migrations/${file}`);
  assert.match(sql, /create table (if not exists )?public\.dealer_accelerator_entitlements/i);
  assert.match(sql, /seller_id\s+uuid/i);
  assert.match(sql, /granted_at\s+timestamptz/i);
  assert.match(sql, /granted_by/i);
  assert.match(sql, /revoked_at\s+timestamptz/i);
  assert.match(sql, /enable row level security/i);
  // Ordinary users may read their own live row and nothing else.
  assert.match(sql, /revoke all on (table )?public\.dealer_accelerator_entitlements from anon, authenticated/i);
  assert.match(sql, /grant select on (table )?public\.dealer_accelerator_entitlements to authenticated/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)[^;]*to (anon|authenticated)/i);
  // No trigger, no backfill from dealer identity or prior use.
  assert.doesNotMatch(sql, /create trigger/i);
  assert.doesNotMatch(sql, /dealer_inventory_batches|dealer_sources|listing_media|admitted_at/i);
  // The founder designation: TCI by name, William absent.
  assert.match(sql, /The Collector Identity/);
  assert.doesNotMatch(sql, /William/);
  assert.doesNotMatch(sql, new RegExp(WILLIAM));
});

/* ── Visibility and navigation ───────────────────────────────────────── */

test("the Account surfaces render Dealer Accelerator only from the server-resolved entitlement", () => {
  const page = read("app/account/page.tsx");
  assert.match(page, /readDealerAcceleratorEntitlement\(supabase, user\.id\)/);
  assert.match(page, /dealerAccelerator=\{/);

  const dash = stripComments(read("components/AccountDashboard.tsx"));
  assert.match(dash, /dealerAccelerator = false/);
  assert.match(dash, /dealerAccelerator\?: boolean/);
  // The module resolver sees the merged access, and the rail is handed the flag.
  assert.match(dash, /dealerAccelerator \}/);
  assert.match(dash, /dealerAccelerator=\{dealerAccelerator\}/);
  // Both Overview entries and the mobile row exist only for an entitled account.
  assert.ok((dash.match(/dealerAccelerator && \(/g) ?? []).length >= 2, "entry mounts are not gated");
  // The phone's room list drops the Dealer room for a non-entitled account.
  assert.match(dash, /room\.id !== "accelerator"/);
  // The returning-dealer predicate is not even fetched without entitlement.
  assert.match(dash, /if \(!dealerAccelerator\) return;/);
  assert.doesNotMatch(dash, /Access denied/i);
  assert.doesNotMatch(dash, /request access/i);

  const rail = stripComments(read("components/AccountRail.tsx"));
  assert.match(rail, /dealerAccelerator = false/);
  assert.match(rail, /m\.id === "accelerator" && !dealerAccelerator/);
  assert.doesNotMatch(rail, /Access denied/i);

  // Every other rail mount is decided by the same server read.
  const settings = read("app/account/settings/page.tsx");
  assert.match(settings, /readDealerAcceleratorEntitlement\(supabase, user\.id\)/);
  assert.match(settings, /dealerAccelerator=\{/);
  const faq = read("app/account/faq/page.tsx");
  assert.match(faq, /readDealerAcceleratorEntitlement\(supabase, user\.id\)/);
  assert.match(faq, /dealerAccelerator=\{/);
  const admin = read("app/admin/page.tsx");
  assert.doesNotMatch(admin, /dealerAccelerator=\{true\}|dealerAccelerator\b(?!=)/);
});

/* ── Seller-facing enforcement ───────────────────────────────────────── */

const SELLER_ROUTES = ["check-website", "connect", "start", "state", "retry-item"];

test("every seller-facing Dealer Accelerator route requires the same entitlement, after auth, before anything else", () => {
  for (const r of SELLER_ROUTES) {
    const src = stripComments(read(`app/api/dealer-accelerator/${r}/route.ts`));
    assert.match(src, /import \{ readDealerAcceleratorEntitlement \} from "@\/lib\/dealerAcceleratorEntitlement"/, r);
    // Auth refusal first, then the entitlement refusal, generic and unadorned.
    const gate = /if \(!user\) \{\s*return NextResponse\.json\(\{ error: "not_authenticated" \}, \{ status: 401 \}\);\s*\}\s*if \(!\(await readDealerAcceleratorEntitlement\(supabase, user\.id\)\)\.dealerAccelerator\) \{\s*return NextResponse\.json\(\{ error: "forbidden" \}, \{ status: 403 \}\);\s*\}/;
    assert.match(src, gate, `${r}: entitlement gate missing or out of order`);
    // The refusal body is the generic one and carries no detail about the room.
    assert.match(src, /\{ error: "forbidden" \}, \{ status: 403 \}/, r);
    assert.doesNotMatch(src, /"not_entitled"|"no_entitlement"|"not_designated"|detail: "[^"]*(Accelerator|entitle)/i, `${r}: refusal must not teach the caller`);
  }
});

test("the worker keeps its machine authority and never acquires the human gate", () => {
  const src = stripComments(read("app/api/dealer-accelerator/worker/route.ts"));
  assert.doesNotMatch(src, /readDealerAcceleratorEntitlement|dealerAcceleratorEntitlement/);
  assert.match(src, /Bearer /);
});

test("admin Dealer Accelerator routes keep founder authority and do not become seller-entitlement routes", () => {
  for (const r of ["manifest-run", "import", "materialize"]) {
    const src = stripComments(read(`app/api/admin/dealer-accelerator/${r}/route.ts`));
    assert.doesNotMatch(src, /readDealerAcceleratorEntitlement/, r);
    assert.match(src, /77a6893a-54fe-4373-9bf7-3327d0ba69cf/, `${r}: founder literal gone`);
  }
});
