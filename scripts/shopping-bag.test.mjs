import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { bagDecisionFor, bagHeaderTruthFor, BAG_MEMBER_STATES } from "../lib/purchases/bagMembership.ts";
import { PAYABLE_TRANSACTION_STATUSES, POST_PAYMENT_TRANSACTION_STATUSES, isPayableTransactionStatus } from "../lib/payments/transactionPayability.ts";
import { LIFECYCLE } from "../lib/payments/paymentState.ts";
import { returnUrls } from "../lib/payments/stripe/checkout.ts";
import { notificationHref } from "../lib/communications.ts";

/* ── Accepted Purchase Continuity + Shopping Bag (2026-09-11) ──────────────
   The laws, not only the happy path: the pure membership mapping across
   every transaction status × payment lifecycle, the header's three truths,
   the shared payability predicate, and source pins on every surface that
   must consume the resolver rather than invent membership.
   Run: node scripts/shopping-bag.test.mjs
   ─────────────────────────────────────────────────────────────────────── */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const truth = (lifecycle, over = {}) => ({
  lifecycle,
  amountMinor: 715000,
  refundState: "none",
  refundedAmountMinor: 0,
  disputeState: "none",
  disputeProviderStatus: null,
  ...over,
});

const DB_TRANSACTION_STATUSES = ["pending", "payment_pending", "paid", "shipped", "delivered", "under_inspection", "completed", "cancelled", "disputed", "refunded"];

/* ── 1 · Bag resolver mapping ──────────────────────────────────────────── */

test("no accepted transaction → zero known members; a read failure is unavailable, never empty", () => {
  assert.deepEqual(bagHeaderTruthFor({ ok: true, memberCount: 0 }), { status: "none" });
  assert.deepEqual(bagHeaderTruthFor({ ok: true, memberCount: 1 }), { status: "members", count: 1 });
  assert.deepEqual(bagHeaderTruthFor({ ok: true, memberCount: 3 }), { status: "members", count: 3 });
  assert.deepEqual(bagHeaderTruthFor({ ok: false }), { status: "unavailable" });
});

test("accepted / payable with no payment → member awaiting payment, payable", () => {
  for (const s of ["pending", "payment_pending"]) {
    assert.deepEqual(bagDecisionFor(s, null), { member: true, state: "awaiting_payment", canPay: true });
    assert.deepEqual(bagDecisionFor(s, truth("pending")), { member: true, state: "awaiting_payment", canPay: true });
  }
});

test("Checkout open → member; failed / canceled / expired → member with retry; confirming → member without action", () => {
  assert.deepEqual(bagDecisionFor("pending", truth("checkout_created")), { member: true, state: "checkout_open", canPay: true });
  for (const lc of ["failed", "canceled", "expired"]) {
    assert.deepEqual(bagDecisionFor("pending", truth(lc)), { member: true, state: "retry", canPay: true });
  }
  assert.deepEqual(bagDecisionFor("pending", truth("confirming")), { member: true, state: "confirming", canPay: false });
  assert.deepEqual(bagDecisionFor("pending", truth("requires_capture")), { member: true, state: "confirming", canPay: false });
});

test("webhook-confirmed paid → leaves the Bag, and nothing later brings it back", () => {
  assert.deepEqual(bagDecisionFor("pending", truth("succeeded")), { member: false, reason: "paid" });
  // later refund / dispute truth on the same succeeded attempt: still out
  assert.equal(bagDecisionFor("pending", truth("succeeded", { refundState: "full", refundedAmountMinor: 715000 })).member, false);
  assert.equal(bagDecisionFor("pending", truth("succeeded", { disputeState: "open" })).member, false);
  // later post-payment transaction statuses, with or without the attempt row: out
  for (const s of POST_PAYMENT_TRANSACTION_STATUSES) {
    assert.deepEqual(bagDecisionFor(s, null), { member: false, reason: "post_payment" });
    assert.equal(bagDecisionFor(s, truth("succeeded")).member, false);
    assert.equal(bagDecisionFor(s, truth("checkout_created")).member, false, `${s} with a stale open checkout must not resurrect`);
  }
  // a succeeded capture wins even over a status the mapping has never seen
  assert.deepEqual(bagDecisionFor("something_new", truth("succeeded")), { member: false, reason: "paid" });
});

test("unruled lifecycles fail conservatively: kept as a member with no action, never silently removed", () => {
  for (const s of ["cancelled", "disputed", "refunded", "not_a_status", null, undefined]) {
    assert.deepEqual(bagDecisionFor(s, null), { member: true, state: "unruled", canPay: false }, `status ${s}`);
    assert.deepEqual(bagDecisionFor(s, truth("checkout_created")), { member: true, state: "unruled", canPay: false }, `status ${s} + open checkout`);
  }
  // an unknown provider lifecycle inside the payable phase: same conservatism
  assert.deepEqual(bagDecisionFor("pending", truth("brand_new_lifecycle")), { member: true, state: "unruled", canPay: false });
});

test("every database transaction status × every provider lifecycle has exactly one decision, and count equals member count", () => {
  const members = [];
  for (const s of DB_TRANSACTION_STATUSES) {
    for (const lc of [null, ...LIFECYCLE]) {
      const d = bagDecisionFor(s, lc ? truth(lc) : null);
      assert.ok(typeof d.member === "boolean");
      if (d.member) {
        assert.ok(BAG_MEMBER_STATES.includes(d.state), `${s}/${lc} state ${d.state}`);
        members.push(d);
      } else {
        assert.ok(["paid", "post_payment"].includes(d.reason));
      }
    }
  }
  assert.deepEqual(bagHeaderTruthFor({ ok: true, memberCount: members.length }), { status: "members", count: members.length });
});

/* ── 2 · Shared payability predicate ───────────────────────────────────── */

test("one payability predicate, consumed by Checkout, payment-state and the Bag; no second copy anywhere", () => {
  assert.deepEqual([...PAYABLE_TRANSACTION_STATUSES].sort(), ["payment_pending", "pending"]);
  assert.ok(isPayableTransactionStatus("pending") && isPayableTransactionStatus("payment_pending"));
  assert.ok(!isPayableTransactionStatus("paid") && !isPayableTransactionStatus(null) && !isPayableTransactionStatus(undefined));
  for (const f of ["app/api/stripe/checkout/route.ts", "app/api/stripe/payment-state/route.ts", "lib/purchases/bagMembership.ts"]) {
    const src = read(f);
    assert.ok(/transactionPayability/.test(src), `${f} imports the shared predicate`);
    assert.ok(!/new Set\(\["pending", "payment_pending"\]\)/.test(src), `${f} carries no private copy of the payable set`);
  }
  assert.match(read("app/api/stripe/checkout/route.ts"), /if \(!isPayableTransactionStatus\(transaction\.status\)\)/);
  assert.match(read("app/api/stripe/payment-state/route.ts"), /isPayableTransactionStatus\(t\.status\) && !!t\.final_purchase_currency && canStartCheckout\(truth\)/);
});

/* ── 3 · Source of truth: no bag table, browser cannot author membership ── */

test("no shopping_bag_items table or competing truth store; the browser sends no membership", () => {
  const files = [
    "lib/purchases/shoppingBag.ts",
    "lib/purchases/bagMembership.ts",
    "app/api/shopping-bag/route.ts",
    "components/ShoppingBagRoom.tsx",
    "components/ShoppingBagEntrance.tsx",
    "supabase/migrations/20260911090000_accepted_purchase_buyer_summons.sql",
  ];
  for (const f of files) {
    const src = read(f);
    assert.ok(!/shopping_bag_items|shopping_bag\b.*create table|create table.*bag/i.test(src), `${f}: no bag table`);
  }
  const route = read("app/api/shopping-bag/route.ts");
  assert.ok(!/export async function (POST|PUT|PATCH|DELETE)/.test(route), "the Bag route is read-only");
  assert.match(route, /resolveShoppingBag\(user\.id, \{ only \}\)/, "membership is resolved for the session-proven caller only");
  assert.match(route, /status: 503/, "a failed read answers 503, not an empty list");
  const resolver = read("lib/purchases/shoppingBag.ts");
  assert.match(resolver, /import "server-only"/);
  assert.match(resolver, /\.eq\("buyer_id", buyerId\)/, "transactions are scoped to the buyer");
  assert.match(resolver, /bagDecisionFor\(t\.status, truth\)/, "the pure mapping decides");
  for (const forbidden of ["checkout_url", "payment_intent_id", "charge_id", "idempotency_key", "stripe_account_id"]) {
    assert.ok(!resolver.includes(forbidden), `resolver never selects ${forbidden}`);
  }
  assert.match(resolver, /return \{ ok: false, reason: "transaction_read_failed" \}/);
  assert.match(resolver, /return \{ ok: false, reason: "payment_read_failed" \}/);
});

test("accepted price/currency come from the transaction snapshot; asking context from the request snapshot, never the live listing", () => {
  const resolver = read("lib/purchases/shoppingBag.ts");
  assert.match(resolver, /acceptedAmount: t\.final_purchase_price/);
  assert.match(resolver, /acceptedCurrency: t\.final_purchase_currency/);
  assert.match(resolver, /askingAmount: pr\?\.listing_price \?\? null/);
  assert.match(resolver, /askingCurrency: pr\?\.listing_currency \?\? null/);
  assert.match(resolver, /brand: t\.listing_brand/);
  assert.ok(!/asking_price/.test(resolver), "the live listing's asking_price is never read");
  assert.match(resolver, /\.from\("listings"\)\.select\("id, public_code, photos, seller_id"\)/, "live listing contributes image + code only");
  assert.match(resolver, /public_seller_profiles/);
  assert.match(resolver, /note: pr\?\.notes\?\.trim\(\) \? pr\.notes\.trim\(\) : null/);
});

/* ── 4 · Entrance + header truth ───────────────────────────────────────── */

test("header: none renders nothing, members render the count beside the mark, unavailable renders with no number", () => {
  const e = read("components/ShoppingBagEntrance.tsx");
  assert.match(e, /if \(truth\.status === "none"\) return null;/);
  assert.match(e, /truth\.status === "members" \?/);
  assert.match(e, /data-shopping-bag-count=""/);
  assert.match(e, /data-shopping-bag-unavailable=""/);
  assert.ok(!/status: "none"[^]*?catch/.test(e.split("function truthFrom")[1].split("}")[0]), "an error path never yields none");
  assert.match(e, /if \(!read\.ok\) return \{ status: "unavailable" \};/);
  assert.match(e, /Shopping Bag, contents unavailable right now/);
  assert.match(e, /Shopping Bag, \$\{truth\.count\}/);
  assert.ok(!/>\s*0\s*<|\{0\}|"0"\s*\}/.test(e.replace(/\/\*[\s\S]*?\*\//g, "")), "no permanent 0 is ever rendered");
  const icon = read("components/ShoppingBagIcon.tsx");
  assert.match(icon, /data-shopping-bag-check=""/, "the gold acceptance disc is part of the icon");
  assert.match(icon, /fill="#B08D3E"/);
  assert.match(icon, /stroke="#FFFFFF"/, "white check");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.ok(!/\bcart\b|Add to Bag|Save for later|quantity/i.test(strip(icon) + strip(e) + strip(read("components/ShoppingBagRoom.tsx"))), "no cart terminology, no Add to Bag, no Save for later, no quantity");
});

test("founder-locked placement: desktop SELL → Bag → Bell → Username; drawer Sell → Bag → Account", () => {
  const nav = read("components/NavBar.tsx");
  const links = nav.indexOf("NAV_LINKS.map((item) =>");
  const bag = nav.indexOf("<ShoppingBagEntrance initial={initialBag} />");
  const bell = nav.indexOf("<NotificationsBell initialUnreadCount={initialUnreadCount} />");
  const account = nav.indexOf("{displayName ?? \"Account\"}");
  assert.ok(links > 0 && bag > links && bell > bag && account > bell, "masthead order");
  assert.match(nav, /\{authed && <ShoppingBagEntrance initial=\{initialBag\} \/>\}/, "authenticated only");
  assert.ok(!nav.includes('{ label: "Shopping Bag"'), "not a word in the collector row");
  const drawer = read("components/MobileNav.tsx");
  const sellMap = drawer.indexOf("UTILITY_LINKS_BEFORE_ACCOUNT.map((item) =>");
  const dBag = drawer.indexOf('<ShoppingBagEntrance initial={initialBag} variant="drawer"');
  const dAccount = drawer.indexOf("<NavIcon label=\"Account\" active={accountActive} />");
  const divider = drawer.indexOf("Everything below it is a utility");
  assert.ok(divider > 0 && sellMap > divider && dBag > sellMap && dAccount > dBag, "drawer order: below the divider, after Sell, before Account");
  const layout = read("app/layout.tsx");
  assert.match(layout, /initialBag = await resolveBagHeaderTruth\(user\.id\);/);
  assert.match(layout, /initialBag = \{ status: "unavailable" \};/, "a layout-level failure is unavailable, never none");
});

/* ── 5 · Buyer acceptance summons ──────────────────────────────────────── */

test("the summons is written by database-owned acceptance code, addressed from the locked request row, fail-open, deduped, deep-linked", () => {
  const m = read("supabase/migrations/20260911090000_accepted_purchase_buyer_summons.sql");
  assert.match(m, /add column if not exists transaction_id uuid references public\.transactions \(id\) on delete restrict/);
  // recipient from the locked row, never an argument
  assert.match(m, /\(v_request\.buyer_id,\s*'purchase_accepted'/);
  assert.match(m, /create or replace function public\.accept_purchase_request\(p_request_id uuid\)/);
  assert.ok(!/p_buyer|p_recipient|p_user/.test(m), "no caller-supplied recipient");
  // fail-open block, after the commercial writes
  const insertAt = m.indexOf("insert into public.notifications");
  const txnAt = m.indexOf("insert into public.transactions");
  const reservedAt = m.indexOf("set status = 'reserved'");
  assert.ok(txnAt > 0 && reservedAt > txnAt && insertAt > reservedAt, "summons runs after the transaction and the reservation");
  assert.match(m.slice(insertAt), /exception when others then\s*null;/);
  // partial-index-aware dedupe (the DA trap)
  assert.match(m, /on conflict \(dedupe_key\) where dedupe_key is not null do nothing/);
  assert.match(m, /'purchase_accepted:' \|\| v_request\.id::text/);
  // the frozen spine is byte-for-byte present
  for (const frozen of [
    "for update;",
    "raise exception 'listing_already_accepted'",
    "set status = 'superseded', updated_at = now()",
    "insert into public.trade_offer_events",
    "(v_request.id, v_request.listing_id, v_request.buyer_id, v_request.seller_id,\n     v_request.proposed_purchase_price, v_request.proposed_currency, null, 'pending')",
    "'superseded_trade_offers', coalesce(array_length(v_superseded_offers, 1), 0)",
  ]) {
    assert.ok(m.includes(frozen), `frozen: ${frozen.slice(0, 40)}`);
  }
  // no broad client INSERT path opened
  assert.ok(!/create policy[^;]*notifications[^;]*insert/i.test(m), "no notifications INSERT policy");
  assert.ok(!/grant insert/i.test(m));
});

test("the bell routes the summons to the accepted purchase in the Shopping Bag, and the route exposes the transaction id", () => {
  assert.equal(
    notificationHref({ id: "n", type: "purchase_accepted", message: "", listing_id: "l", purchase_request_id: "pr", transaction_id: "11111111-1111-4111-8111-111111111111", read: false, created_at: "" }),
    "/shopping-bag?transaction=11111111-1111-4111-8111-111111111111"
  );
  assert.equal(notificationHref({ id: "n", type: "purchase_accepted", message: "", listing_id: "l", purchase_request_id: "pr", read: false, created_at: "" }), "/shopping-bag");
  // seller bells keep their room
  assert.equal(notificationHref({ id: "n", type: "purchase_request", message: "", listing_id: "l", purchase_request_id: "pr", read: false, created_at: "" }), "/account?module=requests&request=pr");
  assert.match(read("app/api/notifications/route.ts"), /purchase_request_id, transaction_id, read, created_at/);
});

/* ── 6 · Seller continuity ─────────────────────────────────────────────── */

test("seller: the successful Accept response is kept and projected; a failed refetch cannot resurrect Pending", () => {
  const room = read("components/CommunicationsRoom.tsx");
  assert.match(room, /setCommitted\(\(prev\) => \(\{ \.\.\.prev, \[id\]: \{ transactionId: txn, at: Date\.now\(\) \} \}\)\);/);
  assert.match(room, /committed\[r\.id\] && r\.status === "pending" \? \{ \.\.\.r, status: "accepted" as const \} : r/, "the committed acceptance is projected over the prop until reconciled");
  assert.match(room, /buildItems\(threads, effectiveRequests\)/, "the list and the pane both read the projection");
  assert.match(room, /const reconciled = await onRequestsChanged\(\);\s*setReconcileFailedFor\(reconciled === false \? id : null\);/);
  assert.match(room, /Offer accepted\./);
  assert.match(room, /This watch is now Sale Pending\. The buyer can continue the purchase\./);
  assert.match(room, /The acceptance above is committed and stands\./);
  assert.match(room, /onCommercialStateChanged\?\.\(\);/, "Listings is re-read so Sale Pending shows in the same session");
  // Accept / Decline gate reads the projected request, so they cannot return after commit
  assert.match(room, /\{selected\.request\.status === "pending" && \(/);
  const dash = read("components/AccountDashboard.tsx");
  assert.match(dash, /async function refreshRequests\(\): Promise<boolean>/);
  assert.match(dash, /setRequestsLoaded\(true\);\s*return true;\s*\}\s*return false;/);
  assert.match(dash, /onCommercialStateChanged=\{\(\) => router\.refresh\(\)\}/);
});

/* ── 7 · Correspondence ────────────────────────────────────────────────── */

test("accepted buyer on a reserved listing may establish the first thread; strangers and superseded buyers cannot; no transaction-scoped thread", () => {
  const r = read("app/api/messages/route.ts");
  assert.match(r, /listing\.status === "reserved"/);
  assert.match(r, /\.eq\("buyer_id", user\.id\)\s*\.eq\("status", "accepted"\)/, "authority derived server-side from the accepted request");
  assert.match(r, /listing\.status !== "published" && !privateForMe && !acceptedBuyerOnReserved/);
  assert.match(r, /conversation_unavailable[^]*?status: 503/, "could-not-look refuses honestly");
  assert.ok(!/transaction_id/.test(r), "threads are never keyed by transaction");
  assert.ok(!/thread_kind: "transaction"|transaction_thread/.test(r));
  assert.match(r, /participant_a_id: user\.id,\s*participant_b_id: listing\.seller_id/, "same (listing, buyer, seller) thread home");
  const c = read("components/ListingCorrespondence.tsx");
  assert.match(c, /id="correspondence"/);
  assert.match(c, /window\.location\.hash === "#correspondence"\) openHome\(\)/);
});

/* ── 8 · Stripe continuity ─────────────────────────────────────────────── */

test("Stripe returns to the same Bag purchase context; the Bag page resolves membership at arrival and forwards a nonmember to Your Purchases", () => {
  const u = returnUrls("https://www.fairwatchtrade.com", "11111111-1111-4111-8111-111111111111");
  assert.equal(u.successUrl, "https://www.fairwatchtrade.com/shopping-bag?transaction=11111111-1111-4111-8111-111111111111&payment=return");
  assert.equal(u.cancelUrl, "https://www.fairwatchtrade.com/shopping-bag?transaction=11111111-1111-4111-8111-111111111111&payment=cancel");
  const page = read("app/shopping-bag/page.tsx");
  assert.match(page, /const stillMember = read\.members\.some\(\(m\) => m\.transactionId === transaction\);/);
  assert.match(page, /if \(!stillMember\) \{[^]*?redirect\(`\/account\?\$\{dest\}`\);/, "webhook-wins: land on Your Purchases, never resurrect");
  assert.match(page, /transaction && UUID\.test\(transaction\) && read\.ok/, "an unreadable Bag never redirects on a guess");
  assert.match(page, /privateRouteMetadata\("Shopping Bag"\)/);
  assert.match(page, /redirect\(`\/login\?callbackUrl=\$\{encodeURIComponent\(back\)\}`\);/);
  const room = read("components/ShoppingBagRoom.tsx");
  assert.match(room, /Confirming payment/);
  assert.ok(!/"Paid"/.test(room), "the room never says Paid; a paid watch has left it");
  assert.match(room, /fetch\("\/api\/stripe\/checkout"/, "Bag Pay uses the existing Checkout route");
  assert.match(room, /JSON\.stringify\(\{ transactionId \}\)/, "the browser sends the transaction id and nothing else");
  assert.match(room, /announceBagChanged\(\)/, "the header is told when a watch leaves");
  assert.match(room, /That watch has left your Shopping Bag\./);
  // the Overview panel keeps persistent history and is not renamed
  const panel = read("components/BuyerPurchasesPanel.tsx");
  assert.match(panel, /Your Purchases/);
  assert.match(panel, /lc === "succeeded"\) return \{ label: "Paid"/);
});

/* ── 9 · My Offers + Listing Detail: continuation only for current members ─ */

test("My Offers and Listing Detail expose the Bag continuation only for current members, and never a dead doorway", () => {
  const cat = read("components/CatalogueClient.tsx");
  assert.match(cat, /fetch\("\/api\/shopping-bag", \{ cache: "no-store" \}\)/);
  assert.match(cat, /group\.current\.status === "accepted" && state\.bag && state\.bag\[group\.current\.id\]/);
  assert.match(cat, /data-bag-continuation=\{current\.id\}/);
  assert.match(cat, /bag = null;/, "an unreadable Bag draws no continuation");
  const rail = read("components/ListingActionRail.tsx");
  assert.match(rail, /requestStatus === "accepted" && bagHref && \(/);
  assert.match(rail, /data-bag-doorway=""/);
  assert.match(rail, /Continue in your Shopping Bag/);
  const page = read("app/listings/[id]/page.tsx");
  assert.match(page, /const bag = await resolveShoppingBag\(user\.id\);/);
  assert.match(page, /bag\.ok \? bag\.members\.find\(\(m\) => m\.listingId === listing\.id\) : null/);
  assert.equal((page.match(/bagHref=\{bagHref\}/g) ?? []).length, 3, "all three rail mounts carry the doorway");
  assert.ok(!/Ask the seller/.test(rail.split('ctaState === "reserved" ?')[1].split(") : (")[0]), "accepted buyer is not left with generic framing");
});

/* ── 10 · Documentation ────────────────────────────────────────────────── */

test("the Stripe README records the Bag as a projection, not Your Purchases, with the resolver and predicate locations", () => {
  const readme = read("app/api/stripe/README.md");
  for (const s of [
    "lib/purchases/shoppingBag.ts",
    "lib/purchases/bagMembership.ts",
    "lib/payments/transactionPayability.ts",
    "Bag is not Your Purchases",
    "owns no commercial truth",
    "Confirming payment",
    "unavailable, never zero",
    "/shopping-bag?transaction=",
    "webhook remains payment authority",
  ]) {
    assert.ok(readme.includes(s), `README mentions: ${s}`);
  }
});
