/* ════════════════════════════════════════════════════════════════════════
   TAX TIME SHELL — behaviour and truthfulness pins  (v8.30)
   Run: node --experimental-strip-types scripts/tax-time.test.mjs

   Three halves:
   · the dealer-access seam and the module normalization — PURE, unit-tested
     with in-memory rows, no database, no rendered page;
   · the room's locked content — every governed sentence present, every
     forbidden thing absent (no zero, no fake row, no working export);
   · the integration seams that are structural rather than computable —
     the server page reads the access, the rail and the selector render only
     what they are handed, and the founder's Marketplace Control path is
     byte-for-byte what it was.
   ════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dealerAccessFrom, readDealerAccess, NO_DEALER_ACCESS } from "../lib/dealerAccess.ts";
import { moduleFromParam, moduleVisible, NAVIGABLE_MODULE_IDS, TAX_TIME_MODULE_ID } from "../lib/accountModules.ts";

let n = 0;
const ok = (name) => { n += 1; console.log(`  ✓ ${name}`); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const DEALER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

/* ═══ A · dealer access is a server-read dealer_profiles row, nothing else ═══ */
{
  assert.deepEqual(dealerAccessFrom({ seller_id: DEALER }, DEALER), { taxTime: true });
  ok("A1 · an account with its own dealer_profiles row is a dealer");

  assert.deepEqual(dealerAccessFrom(null, DEALER), NO_DEALER_ACCESS);
  assert.deepEqual(dealerAccessFrom(undefined, DEALER), NO_DEALER_ACCESS);
  ok("A2 · no row → no access (an ordinary collector-seller)");

  assert.deepEqual(dealerAccessFrom({ seller_id: OTHER }, DEALER), NO_DEALER_ACCESS);
  ok("A3 · someone else's row grants nothing to this account");

  assert.deepEqual(dealerAccessFrom({ seller_id: DEALER }, null), NO_DEALER_ACCESS);
  assert.deepEqual(dealerAccessFrom({ business_name: "Acme Watches" }, DEALER), NO_DEALER_ACCESS);
  ok("A4 · a business name without an identity row, or no user, is not dealer truth");
}

/* The impure half, exercised against an in-memory client that records what
   was asked and answers what a real read would. */
{
  const calls = [];
  const client = (answer) => ({
    from: (table) => ({
      select: (cols) => ({
        eq: (col, value) => ({
          maybeSingle: async () => {
            calls.push({ table, cols, col, value });
            return answer;
          },
        }),
      }),
    }),
  });

  const yes = await readDealerAccess(client({ data: { seller_id: DEALER }, error: null }), DEALER);
  assert.deepEqual(yes, { taxTime: true });
  assert.deepEqual(calls.at(-1), { table: "dealer_profiles", cols: "seller_id", col: "seller_id", value: DEALER });
  ok("A5 · the read asks dealer_profiles for THIS user's own row and nothing wider");

  const none = await readDealerAccess(client({ data: null, error: null }), DEALER);
  assert.deepEqual(none, NO_DEALER_ACCESS);
  const failed = await readDealerAccess(client({ data: { seller_id: DEALER }, error: { message: "boom" } }), DEALER);
  assert.deepEqual(failed, NO_DEALER_ACCESS);
  const threw = await readDealerAccess({ from: () => { throw new Error("down"); } }, DEALER);
  assert.deepEqual(threw, NO_DEALER_ACCESS);
  ok("A6 · a missing row, a read error, or a thrown client all fail CLOSED");
}

/* ═══ B · the module normalization refuses tax-time for a non-dealer ═══ */
{
  const dealer = { taxTime: true };
  const seller = { taxTime: false };

  assert.equal(moduleFromParam("tax-time", dealer), "tax-time");
  ok("B1 · a dealer's ?module=tax-time resolves to the Tax Time room");

  assert.equal(moduleFromParam("tax-time", seller), "inventory");
  assert.equal(moduleFromParam("tax-time", null), "inventory");
  assert.equal(moduleFromParam("tax-time", undefined), "inventory");
  ok("B2 · a non-dealer's typed ?module=tax-time falls to Inventory exactly like an unknown word");

  assert.equal(moduleVisible("tax-time", dealer), true);
  assert.equal(moduleVisible("tax-time", seller), false);
  assert.equal(moduleVisible("trades", seller), true);
  ok("B3 · visibility follows the same access, and ungated modules stay visible");

  for (const id of ["dashboard", "inventory", "accelerator", "communications", "messages", "requests", "saved", "wanted", "trades"]) {
    assert.equal(moduleFromParam(id, seller), id, id);
    assert.equal(moduleFromParam(id, dealer), id, id);
  }
  assert.equal(moduleFromParam("market", seller), "inventory");
  assert.equal(moduleFromParam("analytics", dealer), "inventory");
  assert.equal(moduleFromParam(null, dealer), "inventory");
  assert.equal(moduleFromParam("", seller), "inventory");
  ok("B4 · every existing module still resolves for everyone; soon/unknown/absent still fall to Inventory");

  assert.ok(NAVIGABLE_MODULE_IDS.includes(TAX_TIME_MODULE_ID));
  assert.equal(TAX_TIME_MODULE_ID, "tax-time");
  ok("B5 · tax-time is a real navigable id, named once");
}

/* ═══ C · the room says exactly what was approved, and nothing invented ═══ */
{
  const room = read("components/TaxTimeRoom.tsx");

  for (const s of [
    "Dealer records",
    "Tax Time",
    "A permanent home for understanding completed FairWatchTrade business, preparing records, and tracing every reported total back to the transactions behind it.",
    "Dealer-only workspace",
    "Reporting is not available yet.",
    "Tax Time is being prepared. When reporting opens, this room will show your completed FairWatchTrade transactions and the totals built from them. Until then, no balances or transaction counts are shown.",
    "Reporting period",
    "Year at a Glance",
    "Your completed FairWatchTrade business for the selected period will appear here.",
    "Reporting not available yet",
    "Every total in Tax Time will trace back to the completed transactions behind it.",
    "Transaction Detail",
    "The completed transactions behind your totals will appear here.",
    "Transaction reporting is not available yet.",
    "When reporting opens, you&rsquo;ll be able to review the completed sales and adjustments behind each total.",
    "Reports &amp; Exports",
    "Downloadable records will be prepared from the same completed FairWatchTrade transaction history shown here.",
    "A readable annual summary of your completed FairWatchTrade business.",
    "Transaction-level records for your own files or further preparation.",
    "Not available yet",
    "Recordkeeping first",
    "One record. Explainable totals.",
    "Your summaries, transaction details, and exports will come from the same completed FairWatchTrade record.",
    "Totals trace back to completed transactions",
    "Exports use the same underlying record",
    "No number is shown until the record can support it",
    "Tax Time supports record preparation.",
    "It is not tax advice, a tax filing service, an accounting system, a profit-and-loss engine, or an official tax-form generator.",
    "FairWatchTrade dealer recordkeeping",
  ]) {
    assert.ok(room.includes(s), `missing locked copy: ${s}`);
  }
  ok("C1 · every locked dealer-facing sentence is present verbatim");

  for (const m of ["Completed Transactions", "Gross Sales", "FairWatchTrade Fees", "Refunds / Adjustments", "Net Proceeds"]) {
    assert.ok(room.includes(`"${m}"`), m);
  }
  assert.match(room, /TAX_TIME_METRICS\.map/);
  assert.ok(room.includes("{UNAVAILABLE}") && room.includes('export const UNAVAILABLE = "Unavailable"'));
  ok("C2 · the five governed measures are permanent homes and every value position renders Unavailable");

  for (const c of ["Sale date", "Brand", "Model", "Reference", "Transaction ID", "Gross sale", "FWT fee", "Refunds / Adj.", "Net proceeds"]) {
    assert.ok(room.includes(`"${c}"`), c);
  }
  assert.ok(room.includes('"Annual PDF"') && room.includes('"CSV"'));
  ok("C3 · the durable column contract and the two output homes are present");

  /* Nothing invented. Judged on CODE — block and JSX comments are stripped
     first, because the file's own commentary names the things it refuses
     ("no href, no button, no download") and prose is not a control. */
  const code = room.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /\$\s?0|\$0\.00|\b0 completed|[$€£]\s?\d/);
  assert.doesNotMatch(code, /toFixed|Intl\.NumberFormat|formatMoney|parseFloat|reduce\(/);
  assert.doesNotMatch(code, /supabase|fetch\(|\.from\(|rpc\(|api\//i);
  assert.doesNotMatch(code, /href=|<a |<button|onClick|download|Blob|createObjectURL/);
  assert.doesNotMatch(code, /Accountant Package/i);
  assert.doesNotMatch(code, /read model|ledger connection|durable reporting truth|backend|provider|data pipeline|analytics truth|drill-down/i);
  assert.doesNotMatch(code, /<select|<input|<option/);
  assert.doesNotMatch(code, /2026/);
  assert.match(code, /new Date\(\)\.getFullYear\(\)/);
  ok("C4 · no currency, no arithmetic, no data read, no link/button/download, no Accountant Package, no implementation vocabulary, no fake controls, no hard-coded year");

  /* Typography floor: no governed text below 11px. */
  const sizes = [...room.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length > 0 && sizes.every((s) => s >= 11), `sizes: ${sizes.join(",")}`);
  assert.ok(room.includes("text-[11px] uppercase tracking-[0.04em]"));
  assert.ok(room.includes("text-[11.5px]"));
  assert.ok(/footer[^>]*text-\[12px\]/.test(room));
  ok("C5 · nothing below 11px; table headers 11px, state pills 11.5px, boundary footer 12px");

  assert.ok(room.includes("overflow-x-auto") && room.includes("min-w-[1040px]"));
  assert.ok(room.includes("grid-cols-1 border") && room.includes("sm:grid-cols-2 lg:grid-cols-5"));
  ok("C6 · Transaction Detail scrolls horizontally at narrow widths and Year at a Glance stacks");
}

/* ═══ D · integration seams — structural, read from source ═══ */
{
  const page = read("app/account/page.tsx");
  const settings = read("app/account/settings/page.tsx");
  const dash = read("components/AccountDashboard.tsx");
  const rail = read("components/AccountRail.tsx");
  const selector = read("components/AccountRoomSelector.tsx");
  const access = read("lib/dealerAccess.ts");

  assert.match(page, /readDealerAccess\(supabase, user\.id\)/);
  assert.match(page, /dealerAccess=\{dealerAccess\}/);
  assert.match(settings, /readDealerAccess\(supabase, user\.id\)/);
  assert.match(settings, /taxTime=\{dealerAccess\.taxTime\}/);
  ok("D1 · both server pages resolve dealer access from the session and pass only the result");

  const accessCode = access.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(accessCode, /from\("dealer_profiles"\)/);
  assert.doesNotMatch(accessCode, /localStorage|listing_media|dealer_import|business_name|listings|window\./);
  ok("D2 · the access seam reads dealer_profiles only — no Accelerator media, no business-name field, no client storage");

  assert.match(dash, /moduleFromParam\(moduleParam, dealerAccess\)/);
  assert.match(dash, /taxTime=\{dealerAccess\.taxTime\}/);
  assert.match(dash, /activeModule === "tax-time" \? \(/);
  assert.match(dash, /<TaxTimeRoom \/>/);
  assert.match(dash, /rooms=\{mobileRooms\}/);
  assert.match(dash, /dealerAccess\.taxTime\s*\?\s*ACCOUNT_ROOMS\.flatMap/);
  assert.doesNotMatch(dash, /localStorage.*tax|tax.*localStorage/);
  ok("D3 · the dashboard normalizes the module with the access, renders the room once, and hands the phone selector a gated list");

  assert.match(rail, /\{taxTime && \(/);
  assert.match(rail, /label="Tax Time"/);
  /* The Tax Time item itself, bounded to its own props — a greedy match
     would reach the genuine "Coming next" soon items further down. */
  const taxItemStart = rail.indexOf('label="Tax Time"');
  const taxItem = rail.slice(taxItemStart, rail.indexOf("/>", taxItemStart));
  assert.doesNotMatch(taxItem, /\bsoon\b/);
  assert.ok(rail.indexOf('label="Tax Time"') < rail.indexOf('label="Account Settings"'));
  assert.ok(rail.indexOf('label="Tax Time"') < rail.indexOf('label="Coming next"'));
  ok("D4 · the rail renders Tax Time only when told, as a live destination above Account Settings, never under Coming next");

  assert.match(selector, /rooms = ACCOUNT_ROOMS/);
  assert.match(selector, /rooms\.map\(\(room\)/);
  assert.match(selector, /rooms\.find\(\(r\)/);
  assert.ok(!/ACCOUNT_ROOMS\.(map|find)/.test(selector));
  ok("D5 · the phone selector lists the rooms it is handed and decides nothing");

  /* Founder Marketplace Control: untouched. */
  assert.match(page, /marketplaceControl=\{user\.id === "77a6893a-54fe-4373-9bf7-3327d0ba69cf"\}/);
  assert.match(settings, /marketplaceControl=\{user\.id === "77a6893a-54fe-4373-9bf7-3327d0ba69cf"\}/);
  assert.match(rail, /\{marketplaceControl && \(/);
  assert.match(rail, /label="Marketplace Control"/);
  assert.match(rail, /href="\/admin"/);
  assert.ok(!/MOBILE_ROOM_IDS[^\]]*"market"/.test(dash));
  ok("D6 · founder Marketplace Control gating, door and destination are unchanged; still absent from the phone list");

  for (const id of ["dashboard", "inventory", "accelerator", "communications", "saved", "wanted", "trades"]) {
    assert.ok(new RegExp(`id: "${id}"`).test(rail), id);
  }
  assert.match(dash, /activeModule === "saved" \?/);
  assert.match(dash, /activeModule === "trades" \?/);
  assert.match(dash, /activeModule === "wanted" \?/);
  assert.match(dash, /activeModule === "accelerator" \?/);
  assert.match(dash, /activeModule === "dashboard" \?/);
  ok("D7 · every existing module keeps its rail item and its render branch");

  assert.doesNotMatch(dash + rail + selector + access + read("lib/accountModules.ts"), /tax_year|annual_report|transactions\b.*select|sum\(|fee_total/i);
  ok("D8 · no reporting read, aggregation or export capability was invented anywhere in the seams");
}

console.log(`\ntax-time: ${n} pins hold.`);
