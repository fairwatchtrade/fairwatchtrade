import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import Stripe from "stripe";

import { fromMinorUnits, toMinorUnits } from "../lib/payments/money.ts";
import { canStartCheckout, transitionFor, LIFECYCLE } from "../lib/payments/paymentState.ts";
import { buildCheckoutParams, checkoutIdempotencyKey, checkoutRequestOptions, returnUrls } from "../lib/payments/stripe/checkout.ts";
import { normalizeEvent, verifyStripeEvent } from "../lib/payments/stripe/events.ts";

/* ── Stripe Step 1 of 4 — pay an accepted purchase through Stripe Sandbox ──
   Provider-neutral money and state, the Checkout request shape, real
   signature verification with the SDK's own test header, and source pins on
   the routes, migration and surface.
   Run: node scripts/stripe-step1.test.mjs
   ─────────────────────────────────────────────────────────────────────── */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");

const TXN = "11111111-1111-4111-8111-111111111111";
const ATT = "22222222-2222-4222-8222-222222222222";

const truth = (over = {}) => ({
  lifecycle: "checkout_created",
  amountMinor: 715000,
  refundState: "none",
  refundedAmountMinor: 0,
  disputeState: "none",
  disputeProviderStatus: null,
  ...over,
});
const ev = (type, over = {}) => ({
  eventId: "evt_1",
  type,
  livemode: false,
  account: "acct_test",
  objectType: null,
  objectId: null,
  created: 1,
  checkoutSessionId: null,
  paymentIntentId: null,
  chargeId: null,
  paymentStatus: null,
  amountMinor: null,
  amountRefundedMinor: null,
  refunds: [],
  disputeId: null,
  disputeStatus: null,
  metadata: {},
  ...over,
});

/* ── Money ──────────────────────────────────────────────────────────── */

test("minor units come from the governed exponent, never from ×100", () => {
  assert.equal(toMinorUnits("10.99", 2), 1099);
  assert.equal(toMinorUnits("10", 0), 10);
  assert.equal(toMinorUnits("7150", 2), 715000);
  assert.equal(toMinorUnits("7150.10", 2), 715010);
  assert.equal(toMinorUnits(7150, 2), 715000);
  assert.equal(toMinorUnits("0.001", 3), 1);
  assert.throws(() => toMinorUnits("10.5", 0), /amount_precision_exceeds_currency/);
  assert.throws(() => toMinorUnits("10.999", 2), /amount_precision_exceeds_currency/);
  assert.throws(() => toMinorUnits("0", 2), /amount_not_positive/);
  assert.throws(() => toMinorUnits("abc", 2), /amount_not_decimal/);
  assert.throws(() => toMinorUnits("10", 5), /currency_exponent_invalid/);
  assert.equal(fromMinorUnits(715010, 2), "7150.10");
  assert.equal(fromMinorUnits(10, 0), "10");
  assert.equal(fromMinorUnits(5, 2), "0.05");
  // No hardcoded cents conversion anywhere in the payment libraries or routes.
  for (const f of [
    "lib/payments/money.ts",
    "lib/payments/paymentState.ts",
    "lib/payments/stripe/checkout.ts",
    "lib/payments/stripe/events.ts",
    "app/api/stripe/checkout/route.ts",
    "app/api/stripe/webhook/route.ts",
    "app/api/stripe/payment-state/route.ts",
  ]) {
    assert.doesNotMatch(stripComments(read(f)), /\*\s*100\b|\/\s*100\b|\b100\s*\*/, f);
  }
});

/* ── State machine ──────────────────────────────────────────────────── */

test("succeeded is terminal on the capture axis; refund and dispute axes are independent", () => {
  const paid = transitionFor(truth(), ev("checkout.session.completed", { paymentStatus: "paid", paymentIntentId: "pi_1" }));
  assert.equal(paid.kind, "apply");
  assert.equal(paid.patch.lifecycle, "succeeded");
  assert.equal(paid.patch.paymentIntentId, "pi_1");

  const after = truth({ lifecycle: "succeeded" });
  for (const t of ["checkout.session.expired", "payment_intent.payment_failed", "payment_intent.canceled", "checkout.session.async_payment_failed"]) {
    assert.equal(transitionFor(after, ev(t)).kind, "ignore", t);
  }

  const partial = transitionFor(after, ev("charge.refunded", { amountRefundedMinor: 100000, refunds: [{ id: "re_1", amountMinor: 100000, status: "succeeded", created: 1 }] }));
  assert.equal(partial.kind, "apply");
  assert.equal(partial.patch.refundState, "partial");
  assert.equal(partial.patch.lifecycle, undefined, "a refund never touches the capture axis");
  const full = transitionFor(after, ev("charge.refunded", { amountRefundedMinor: 715000 }));
  assert.equal(full.patch.refundState, "full");

  const disputed = transitionFor(truth({ lifecycle: "succeeded", refundState: "partial", refundedAmountMinor: 100000 }), ev("charge.dispute.created", { disputeId: "dp_1", disputeStatus: "needs_response" }));
  assert.equal(disputed.kind, "apply");
  assert.equal(disputed.patch.disputeState, "open");
  assert.equal(disputed.patch.lifecycle, undefined);
  assert.equal(disputed.patch.refundState, undefined, "a dispute never touches the refund axis");
  assert.equal(transitionFor(after, ev("charge.dispute.closed", { disputeStatus: "won" })).patch.disputeState, "won");
  assert.equal(transitionFor(after, ev("charge.dispute.closed", { disputeStatus: "lost" })).patch.disputeState, "lost");
});

test("the pre-capture states move as Stripe reports, and unknown events are ignored", () => {
  assert.equal(transitionFor(truth(), ev("checkout.session.expired")).patch.lifecycle, "expired");
  assert.equal(transitionFor(truth(), ev("payment_intent.amount_capturable_updated")).patch.lifecycle, "requires_capture");
  assert.equal(transitionFor(truth(), ev("payment_intent.processing")).patch.lifecycle, "confirming");
  assert.equal(transitionFor(truth(), ev("payment_intent.succeeded", { chargeId: "ch_1" })).patch.chargeId, "ch_1");
  assert.equal(transitionFor(truth(), ev("checkout.session.completed", { paymentStatus: "unpaid" })).patch.lifecycle, "confirming");
  assert.equal(transitionFor(truth(), ev("customer.created")).kind, "ignore");
  assert.ok(LIFECYCLE.includes("requires_capture"));
});

test("checkout may start only from payable states", () => {
  assert.equal(canStartCheckout(null), true);
  for (const lc of ["pending", "checkout_created", "failed", "canceled", "expired"]) assert.equal(canStartCheckout(truth({ lifecycle: lc })), true, lc);
  for (const lc of ["confirming", "requires_capture", "succeeded"]) assert.equal(canStartCheckout(truth({ lifecycle: lc })), false, lc);
});

/* ── Checkout request shape ─────────────────────────────────────────── */

test("the Checkout request is cards-only, automatic capture, server amounts, correlated, and idempotent", () => {
  const p = buildCheckoutParams({
    transactionId: TXN,
    attemptId: ATT,
    amountMinor: 715000,
    currency: "USD",
    description: "Rolex Datejust Ref. 79173",
    successUrl: "https://x/ok",
    cancelUrl: "https://x/cancel",
  });
  assert.equal(p.mode, "payment");
  assert.deepEqual(p.payment_method_types, ["card"]);
  assert.equal(p.line_items[0].price_data.unit_amount, 715000);
  assert.equal(p.line_items[0].price_data.currency, "usd");
  assert.equal(p.client_reference_id, TXN);
  assert.deepEqual(p.metadata, { fwt_transaction_id: TXN, fwt_payment_attempt_id: ATT });
  assert.deepEqual(p.payment_intent_data.metadata, { fwt_transaction_id: TXN, fwt_payment_attempt_id: ATT });
  assert.equal(p.payment_intent_data.capture_method, "automatic");
  assert.equal(p.payment_intent_data.application_fee_amount, undefined);
  assert.equal(checkoutIdempotencyKey(TXN, ATT), `fwt:stripe:checkout:${TXN}:${ATT}`);
  const o = checkoutRequestOptions(TXN, ATT, "acct_123");
  assert.equal(o.idempotencyKey, `fwt:stripe:checkout:${TXN}:${ATT}`);
  assert.equal(o.stripeAccount, "acct_123");
  const u = returnUrls("https://www.fairwatchtrade.com", TXN);
  assert.match(u.successUrl, new RegExp(`^https://www\\.fairwatchtrade\\.com/account\\?module=dashboard&transaction=${TXN}&payment=return$`));
  assert.match(u.cancelUrl, /payment=cancel$/);
});

/* ── Signature verification and normalization, with the real SDK ───── */

test("a signed event verifies over the raw body; a tampered body and a missing signature refuse", () => {
  const stripe = new Stripe("sk_test_placeholder", { typescript: true });
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({
    id: "evt_test_1",
    object: "event",
    type: "checkout.session.completed",
    livemode: false,
    created: 1700000000,
    account: "acct_connected",
    data: {
      object: {
        id: "cs_test_1",
        object: "checkout.session",
        payment_intent: "pi_test_1",
        payment_status: "paid",
        amount_total: 715000,
        metadata: { fwt_transaction_id: TXN, fwt_payment_attempt_id: ATT },
      },
    },
  });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const event = verifyStripeEvent(stripe, payload, header, secret);
  assert.equal(event.id, "evt_test_1");
  const n = normalizeEvent(event);
  assert.equal(n.account, "acct_connected");
  assert.equal(n.checkoutSessionId, "cs_test_1");
  assert.equal(n.paymentIntentId, "pi_test_1");
  assert.equal(n.paymentStatus, "paid");
  assert.equal(n.amountMinor, 715000);
  assert.equal(n.metadata.fwt_payment_attempt_id, ATT);
  assert.equal(n.livemode, false);

  assert.throws(() => verifyStripeEvent(stripe, payload.replace("715000", "1"), header, secret));
  assert.throws(() => verifyStripeEvent(stripe, payload, null, secret), /stripe_signature_missing/);
  assert.throws(() => verifyStripeEvent(stripe, payload, header, "whsec_other"));
});

test("charge, refund and dispute objects normalize with their identities intact", () => {
  const charge = normalizeEvent({
    id: "evt_c",
    type: "charge.refunded",
    livemode: false,
    created: 1,
    data: { object: { id: "ch_1", object: "charge", payment_intent: "pi_1", amount: 715000, amount_refunded: 200000, refunds: { data: [{ id: "re_a", amount: 100000, status: "succeeded", created: 5 }, { id: "re_b", amount: 100000, status: "succeeded", created: 6 }] }, metadata: {} } },
  });
  assert.equal(charge.chargeId, "ch_1");
  assert.equal(charge.amountRefundedMinor, 200000);
  assert.deepEqual(charge.refunds.map((r) => r.id), ["re_a", "re_b"]);
  assert.equal(charge.account, null, "platform context when Stripe sends none");
  const dispute = normalizeEvent({ id: "evt_d", type: "charge.dispute.created", livemode: false, created: 1, account: "acct_x", data: { object: { id: "dp_1", object: "dispute", status: "needs_response", charge: "ch_1", payment_intent: "pi_1", amount: 715000 } } });
  assert.equal(dispute.disputeId, "dp_1");
  assert.equal(dispute.disputeStatus, "needs_response");
  assert.equal(dispute.chargeId, "ch_1");
});

/* ── Source pins: routes ────────────────────────────────────────────── */

test("checkout route: buyer-authenticated, transaction-authoritative, nothing from the browser but the id", () => {
  const src = stripComments(read("app/api/stripe/checkout/route.ts"));
  assert.match(src, /supabase\.auth\.getUser\(\)|session\.auth\.getUser\(\)/);
  assert.match(src, /refuse\("unauthenticated", 401\)/);
  assert.match(src, /body\.transactionId/);
  assert.doesNotMatch(src, /body\.(amount|currency|sellerAccount|stripeAccount|paid|applicationFee)/);
  assert.match(src, /transaction\.buyer_id !== user\.id/);
  assert.match(src, /refuse\("not_transaction_buyer", 403\)/);
  assert.match(src, /transaction_not_payment_eligible/);
  assert.match(src, /transaction\.final_purchase_currency/);
  assert.doesNotMatch(src, /asking_currency|listings\b.*currency/);
  assert.match(src, /toMinorUnits\(transaction\.final_purchase_price, Number\(cur\.exponent\)\)/);
  assert.match(src, /getSandboxConnectedAccount\(\)/);
  assert.match(src, /checkoutRequestOptions\(transaction\.id, attemptId, connectedAccount\)/);
  assert.match(src, /reused: true/);
  assert.match(src, /payment_locked/);
  assert.match(src, /is_active: false/);
  assert.doesNotMatch(src, /rail/);
});

test("webhook route: raw body, signature first, connect-aware, one atomic writer", () => {
  const src = stripComments(read("app/api/stripe/webhook/route.ts"));
  const rawAt = src.indexOf("await request.text()");
  const verifyAt = src.indexOf("verifyStripeEvent(");
  assert.ok(rawAt > 0 && verifyAt > rawAt, "raw body is read before verification");
  assert.doesNotMatch(src, /request\.json\(\)/);
  assert.match(src, /request\.headers\.get\("stripe-signature"\)/);
  assert.match(src, /invalid_signature/);
  assert.match(src, /stripe_account_id: ev\.account/);
  assert.match(src, /db\.rpc\("stripe_apply_event"/);
  assert.match(src, /fwt_payment_attempt_id/);
  assert.match(src, /livemode event refused/);
  // No client-supplied authority, no direct state writes outside the RPC.
  assert.doesNotMatch(src, /\.update\(\{\s*lifecycle/);
  assert.doesNotMatch(src, /searchParams/);
});

test("payment-state route: session identity, server-only provider read, allowlisted response (S1-C1)", () => {
  const src = stripComments(read("app/api/stripe/payment-state/route.ts"));
  assert.match(src, /createClient\(\)/);
  assert.match(src, /\.eq\("buyer_id", user\.id\)/);
  // The provider record is read with the service role, scoped to the ids the
  // session client just proved are this buyer's.
  assert.match(src, /createServiceClient\(\)/);
  assert.match(src, /\.in\("transaction_id", ids\)/);
  assert.doesNotMatch(src, /getStripe/);
  // Only public-safe columns are ever selected, and only they are returned.
  assert.match(src, /const SAFE_ATTEMPT_COLUMNS =\s*"transaction_id, lifecycle, amount_minor, refund_state, refunded_amount_minor, dispute_state, checkout_expires_at, updated_at"/);
  for (const secret of ["checkout_url", "stripe_account_id", "payment_intent_id", "charge_id", "idempotency_key", "provider_status", "dispute_provider_status", "dispute_id", "attemptId"]) {
    assert.doesNotMatch(src, new RegExp(secret), `payment-state must never touch ${secret}`);
  }
  assert.doesNotMatch(src, /select\("\*"\)/);
});

test("the Stripe client is server-only, sandbox-only, and secrets never leave it", () => {
  const src = stripComments(read("lib/payments/stripe/client.ts"));
  assert.match(src, /import "server-only"/);
  assert.match(src, /startsWith\("sk_test_"\)/);
  assert.match(src, /stripe_live_key_refused/);
  assert.doesNotMatch(src, /NEXT_PUBLIC_/);
  assert.doesNotMatch(src, /export .*process\.env/);
  const pkg = read("package.json");
  assert.match(pkg, /"stripe":/);
  assert.doesNotMatch(pkg, /@stripe\/stripe-js|@stripe\/react-stripe-js/);
});

/* ── Source pins: migration ─────────────────────────────────────────── */

test("migration: currency snapshotted at acceptance, three server-only tables, one atomic writer, rail untouched", () => {
  const sql = read("supabase/migrations/20260910210000_stripe_step1_payment_records.sql");
  assert.match(sql, /add column if not exists final_purchase_currency text\s+references public\.supported_currencies \(code\)/);
  assert.match(sql, /final_purchase_price, final_purchase_currency, rail, status\)/);
  assert.match(sql, /v_request\.proposed_purchase_price, v_request\.proposed_currency, null, 'pending'\)/);
  // The frozen parts of the acceptance function are reproduced verbatim.
  for (const frozen of [
    "raise exception 'listing_already_accepted'",
    "set status = 'superseded', updated_at = now()",
    "set status = 'reserved', updated_at = now()",
    "from public.listings\n  where id = v_listing_id\n  for update;",
    "if v_request.seller_id <> v_caller then",
  ]) assert.ok(sql.includes(frozen), frozen);
  assert.doesNotMatch(sql, /set rail\b/i);
  assert.doesNotMatch(sql, /update public\.transactions/i);
  for (const t of ["stripe_payment_attempts", "stripe_refunds", "stripe_events"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${t}`));
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${t} from anon, authenticated`));
  }
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)[^;]*to (anon|authenticated)/i);
  assert.match(sql, /stripe_events_provider_identity\s+on public\.stripe_events \(event_id, coalesce\(stripe_account_id, ''\)\)/);
  assert.match(sql, /stripe_payment_attempts_one_active\s+on public\.stripe_payment_attempts \(transaction_id\) where is_active/);
  assert.match(sql, /create or replace function public\.stripe_apply_event\(/);
  assert.match(sql, /revoke all on function public\.stripe_apply_event\(jsonb, uuid, text, jsonb\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.stripe_apply_event\(jsonb, uuid, text, jsonb\) to service_role/);
  assert.match(sql, /on conflict \(event_id, coalesce\(stripe_account_id, ''\)\) do nothing/);
  assert.match(sql, /where id = p_attempt_id and lifecycle = p_expected_lifecycle/);
  for (const lc of ["requires_capture", "expired", "confirming"]) assert.ok(sql.includes(`'${lc}'`), lc);
  assert.match(sql, /amount_minor\s+bigint/);
  assert.doesNotMatch(sql, /paid boolean|refunded boolean/);

  // S1-C1: the correction migration withdraws every client read of the
  // provider record, so the net authority after both migrations is
  // server-only for all three Stripe tables.
  const c1 = read("supabase/migrations/20260910220000_stripe_step1_c1_server_only_reads.sql");
  assert.match(c1, /drop policy if exists stripe_payment_attempts_read_own on public\.stripe_payment_attempts;/);
  assert.match(c1, /drop policy if exists stripe_refunds_read_own on public\.stripe_refunds;/);
  assert.match(c1, /revoke all on table public\.stripe_payment_attempts from anon, authenticated;/);
  assert.match(c1, /revoke all on table public\.stripe_refunds from anon, authenticated;/);
  assert.doesNotMatch(c1, /grant\s+select|create policy/i);
});

/* ── Source pins: surface and frozen neighbors ──────────────────────── */

test("the buyer surface never claims success from the redirect, and leaves for Stripe deliberately", () => {
  const src = stripComments(read("components/BuyerPurchasesPanel.tsx"));
  assert.match(src, /Confirming payment/);
  assert.match(src, /window\.location\.assign\(data\.url\)/);
  assert.doesNotMatch(src, /window\.open|target="_blank"/);
  assert.match(src, /fetch\("\/api\/stripe\/payment-state"/);
  assert.match(src, /POLL_WINDOW_MS = 120_000/);
  assert.doesNotMatch(src, /payment=return[^\n]*Paid|setPaid|lifecycle: "succeeded"/);
  assert.match(src, /if \(!purchases \|\| purchases\.length === 0\) return null;/);
  const dash = read("components/AccountDashboard.tsx");
  assert.match(dash, /import BuyerPurchasesPanel from "@\/components\/BuyerPurchasesPanel"/);
  assert.match(dash, /<BuyerPurchasesPanel \/>/);
  // Purchase Request UI truth stays: no payment at the request step.
  const inline = read("components/InlinePurchaseRequest.tsx");
  assert.doesNotMatch(inline, /stripe|Pay with/i);
});

test("frozen neighbors are byte-identical to HEAD", () => {
  const changed = execSync("git diff --name-only HEAD", { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  for (const f of ["components/usePurchaseRequest.ts", "app/api/purchase-requests/route.ts", "app/api/purchase-requests/[id]/route.ts", "app/api/evaluate/route.ts"]) {
    assert.ok(!changed.includes(f), `${f} must not change in Step 1`);
  }
});

test("README exists beside the machinery and names what a later reader could get backwards", () => {
  const md = read("app/api/stripe/README.md");
  for (const s of ["success URL", "stripe_apply_event", "Connected accounts", "amount_minor", "requires_capture", "STRIPE_WEBHOOK_SECRET", "STRIPE_SANDBOX_CONNECTED_ACCOUNT_ID", "rail", "Frozen neighbors", "PFC274 = 62", "duplicate", "stale"]) {
    assert.ok(md.includes(s), s);
  }
});
