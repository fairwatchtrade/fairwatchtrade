/* LS-2 Accepted Purchase / Payment state-color semantics.

   This contract is deliberately payment-specific. It proves that the two
   ordinary buyer surfaces share one presentation owner without flattening
   transaction, payment-attempt, refund, dispute, or availability truth.
   Run directly, and through `npm run build` via prebuild. */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

import { DISPUTE_STATES, LIFECYCLE, REFUND_STATES } from "../lib/payments/paymentState.ts";
import { TRANSACTION_LIFECYCLE, transactionLifecycleState } from "../lib/payments/transactionPayability.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const exists = (path) => existsSync(new URL(path, root));

const ownerPath = "lib/payments/acceptedPurchaseStatePresentation.ts";
const rendererPath = "components/AcceptedPurchaseStateMarker.tsx";
const galleryPath = "app/internal/ls2-payment-state-gallery/page.tsx";

assert.ok(exists(ownerPath), "one accepted-purchase/payment presentation owner exists");
assert.ok(exists(rendererPath), "one accepted-purchase/payment state renderer exists");
assert.ok(exists(galleryPath), "the founder-only payment state gallery exists");

const {
  ACCEPTED_PURCHASE_AVAILABILITY_STATES,
  ACCEPTED_PURCHASE_TRANSACTION_STATES,
  PAYMENT_STATE_GALLERY_FIXTURES,
  ACCEPTED_PURCHASE_FOCUSED_ROW_CLASS,
  ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES,
  acceptedPurchasePaymentInput,
  acceptedPurchasePaymentLifecycleState,
  acceptedPurchaseCheckoutContext,
  acceptedPurchaseStatePresentation,
  acceptedPurchaseTransactionState,
  buyerPurchasePrimaryStateInput,
  shoppingBagPrimaryStateInput,
} = await import("../lib/payments/acceptedPurchaseStatePresentation.ts");

const expected = {
  "payment-lifecycle:pending": ["settled", "actionable", "var(--lc-private_active-badge)", "var(--lc-private_active-line)"],
  "payment-lifecycle:checkout_created:open": ["settled", "actionable", "var(--lc-private_active-badge)", "var(--lc-private_active-line)"],
  "payment-lifecycle:checkout_created:return-pending": ["settled", "operational", "var(--lc-private_active-badge)", "var(--lc-private_active-line)"],
  "payment-lifecycle:checkout_created:cancel-returned": ["pending", "unruled", "var(--platinum-dim)", "var(--lc-neutral-line)"],
  "payment-lifecycle:confirming": ["settled", "operational", "var(--lc-private_active-badge)", "var(--lc-private_active-line)"],
  "payment-lifecycle:requires_capture": ["settled", "operational", "var(--lc-private_active-badge)", "var(--lc-private_active-line)"],
  "payment-lifecycle:succeeded": ["settled", "complete", "var(--lc-published-badge)", "var(--lc-published-line)"],
  "payment-lifecycle:failed": ["pending", "unruled", "var(--platinum-dim)", "var(--lc-neutral-line)"],
  "payment-lifecycle:canceled": ["settled", "actionable", "var(--lc-private_active-badge)", "var(--lc-private_active-line)"],
  "payment-lifecycle:expired": ["settled", "actionable", "var(--lc-private_active-badge)", "var(--lc-private_active-line)"],
  "payment-lifecycle:unresolved": ["pending", "unruled", "var(--platinum-dim)", "var(--lc-neutral-line)"],

  "transaction:pending": ["settled", "actionable", "var(--lc-private_active-badge)", "var(--lc-private_active-line)"],
  "transaction:payment_pending": ["settled", "actionable", "var(--lc-private_active-badge)", "var(--lc-private_active-line)"],
  "transaction:paid": ["settled", "complete", "var(--lc-published-badge)", "var(--lc-published-line)"],
  "transaction:shipped": ["pending", "unruled", "var(--platinum-dim)", "var(--lc-neutral-line)"],
  "transaction:delivered": ["pending", "unruled", "var(--platinum-dim)", "var(--lc-neutral-line)"],
  "transaction:under_inspection": ["pending", "unruled", "var(--platinum-dim)", "var(--lc-neutral-line)"],
  "transaction:completed": ["settled", "complete", "var(--lc-published-badge)", "var(--lc-published-line)"],
  "transaction:cancelled": ["pending", "unruled", "var(--platinum-dim)", "var(--lc-neutral-line)"],
  "transaction:disputed": ["pending", "unruled", "var(--platinum-dim)", "var(--lc-neutral-line)"],
  "transaction:refunded": ["pending", "unruled", "var(--platinum-dim)", "var(--lc-neutral-line)"],
  "transaction:unresolved": ["pending", "unruled", "var(--platinum-dim)", "var(--lc-neutral-line)"],

  "refund:none": ["out-of-surface", "absent", "var(--muted)", "var(--lc-neutral-line)"],
  "refund:partial": ["pending", "unruled", "var(--platinum-dim)", "var(--lc-neutral-line)"],
  "refund:full": ["pending", "unruled", "var(--platinum-dim)", "var(--lc-neutral-line)"],

  "dispute:none": ["out-of-surface", "absent", "var(--muted)", "var(--lc-neutral-line)"],
  "dispute:open": ["pending", "unruled", "var(--platinum-dim)", "var(--lc-neutral-line)"],
  "dispute:won": ["pending", "unruled", "var(--platinum-dim)", "var(--lc-neutral-line)"],
  "dispute:lost": ["pending", "unruled", "var(--platinum-dim)", "var(--lc-neutral-line)"],

  "availability:read_unavailable": ["settled", "unavailable", "var(--platinum)", "var(--lc-neutral-line)"],
  "availability:payment_unavailable": ["pending", "unruled", "var(--platinum-dim)", "var(--lc-neutral-line)"],
};

assert.deepEqual(ACCEPTED_PURCHASE_TRANSACTION_STATES, [
  "pending",
  "payment_pending",
  "paid",
  "shipped",
  "delivered",
  "under_inspection",
  "completed",
  "cancelled",
  "disputed",
  "refunded",
], "transaction presentation vocabulary stays a separate axis");
assert.strictEqual(ACCEPTED_PURCHASE_TRANSACTION_STATES, TRANSACTION_LIFECYCLE, "gallery derives transaction coverage from the product-owned lifecycle source");
assert.deepEqual(ACCEPTED_PURCHASE_AVAILABILITY_STATES, [
  "read_unavailable",
  "payment_unavailable",
], "availability presentation vocabulary stays a separate axis");
for (const state of TRANSACTION_LIFECYCLE) {
  assert.equal(transactionLifecycleState(state), state, `transaction runtime boundary admits ${state}`);
}
assert.equal(transactionLifecycleState("future_transaction_state"), null, "transaction runtime boundary stops unknown future states");

/* SQL is the transaction writer authority. This build-path guard walks every
   checked-in migration and fails when a literal transaction-status writer
   appears outside the canonical runtime vocabulary. Unknown reads still land
   on the explicit transaction:unresolved fixture. */
const splitSqlList = (source) => {
  const values = [];
  let start = 0;
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "'" && source[index + 1] === "'") {
      index += 1;
      continue;
    }
    if (char === "'") quoted = !quoted;
    if (quoted) continue;
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      values.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  values.push(source.slice(start).trim());
  return values;
};
const parenthesized = (source, openIndex, label) => {
  assert.equal(source[openIndex], "(", `${label} starts with a parenthesized list`);
  let depth = 0;
  let quoted = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "'" && source[index + 1] === "'") {
      index += 1;
      continue;
    }
    if (char === "'") quoted = !quoted;
    if (quoted) continue;
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return { body: source.slice(openIndex + 1, index), end: index + 1 };
    }
  }
  assert.fail(`${label} has a closed parenthesized list`);
};
const literalSqlState = (expression, label) => {
  const literal = expression.trim().match(/^'([^']+)'(?:::[a-z0-9_.]+)?$/i)?.[1];
  assert.ok(literal, `${label} must be one mechanically enumerable literal; expressions require an explicit guard update`);
  return literal;
};
const transactionWriterStatesFor = (sql, label) => {
  const states = [];
  for (const match of sql.matchAll(/\b(insert\s+into|update)\s+(?:public\.)?transactions\b/gi)) {
    const statementEnd = sql.indexOf(";", match.index);
    assert.ok(statementEnd >= 0, `${label} transaction write terminates`);
    const statement = sql.slice(match.index, statementEnd + 1);
    if (/^insert\s+into/i.test(statement)) {
      const table = statement.match(/^insert\s+into\s+(?:public\.)?transactions\b/i);
      const columnOpen = statement.indexOf("(", table[0].length);
      const columns = parenthesized(statement, columnOpen, `${label} transaction INSERT columns`);
      const names = splitSqlList(columns.body).map((column) => column.replace(/\s+/g, "").toLowerCase());
      const statusIndex = names.indexOf("status");
      assert.ok(statusIndex >= 0, `${label} transaction INSERT must name status; no implicit database default is governed here`);
      const valuesKeyword = statement.slice(columns.end).match(/^\s*values\b/i);
      assert.ok(valuesKeyword, `${label} transaction INSERT must expose an enumerable VALUES list`);
      const valueOpen = statement.indexOf("(", columns.end + valuesKeyword[0].length);
      const values = splitSqlList(parenthesized(statement, valueOpen, `${label} transaction INSERT values`).body);
      assert.equal(values.length, names.length, `${label} transaction INSERT column/value cardinality matches`);
      states.push(literalSqlState(values[statusIndex], `${label} transaction INSERT status`));
      continue;
    }

    const setIndex = statement.search(/\bset\b/i);
    assert.ok(setIndex >= 0, `${label} transaction UPDATE has SET`);
    const afterSet = statement.slice(setIndex).replace(/^\bset\b/i, "");
    const whereIndex = afterSet.search(/\bwhere\b/i);
    const assignments = splitSqlList(whereIndex >= 0 ? afterSet.slice(0, whereIndex) : afterSet.replace(/;\s*$/, ""));
    const statusAssignment = assignments.find((assignment) => /^(?:[a-z_][a-z0-9_]*\.)?status\s*=/i.test(assignment));
    if (!statusAssignment) continue;
    const expression = statusAssignment.slice(statusAssignment.indexOf("=") + 1);
    states.push(literalSqlState(expression, `${label} transaction UPDATE status`));
  }
  return states;
};

assert.deepEqual(
  transactionWriterStatesFor("insert into transactions (id, status) values (gen_random_uuid(), 'pending');", "synthetic unqualified writer"),
  ["pending"],
  "unqualified transaction writers are inventoried",
);
assert.deepEqual(
  transactionWriterStatesFor("update public.transactions set status = 'paid' where id = gen_random_uuid();", "synthetic literal update"),
  ["paid"],
  "literal transaction UPDATE states are inventoried",
);
assert.throws(
  () => transactionWriterStatesFor("update transactions set status = v_status where id = gen_random_uuid();", "synthetic dynamic update"),
  /mechanically enumerable literal/,
  "dynamic transaction status writers fail closed",
);
assert.throws(
  () => transactionWriterStatesFor("insert into transactions (id) values (gen_random_uuid());", "synthetic defaulted insert"),
  /must name status/,
  "transaction INSERTs cannot silently depend on an ungoverned default",
);
const migrationRoot = new URL("../supabase/migrations/", import.meta.url);
const transactionWriterStates = new Set();
for (const entry of readdirSync(migrationRoot, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".sql")) continue;
  const sql = readFileSync(new URL(entry.name, migrationRoot), "utf8");
  for (const state of transactionWriterStatesFor(sql, entry.name)) transactionWriterStates.add(state);
}
assert.ok(transactionWriterStates.has("pending"), "the accepted-purchase transaction writer is discovered");
for (const state of transactionWriterStates) {
  assert.ok(TRANSACTION_LIFECYCLE.includes(state), `SQL transaction writer state is covered by runtime/gallery vocabulary: ${state}`);
}

const sourceFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
  return entry.isDirectory() ? sourceFiles(child) : [child];
});
for (const sourceRoot of [new URL("../app/", import.meta.url), new URL("../lib/", import.meta.url)]) {
  for (const file of sourceFiles(sourceRoot).filter((url) => /\.(?:ts|tsx)$/.test(url.pathname))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\.from\(["']transactions["']\)/g)) {
      const statementEnd = source.indexOf(";", match.index);
      const statement = source.slice(match.index, statementEnd >= 0 ? statementEnd + 1 : undefined);
      assert.doesNotMatch(statement, /\.(?:insert|update|upsert)\s*\(/, `${file.pathname} adds no ungoverned application transaction writer`);
    }
  }
}

const sourceVocabularies = {
  transaction: ACCEPTED_PURCHASE_TRANSACTION_STATES,
  refund: REFUND_STATES,
  dispute: DISPUTE_STATES,
  availability: ACCEPTED_PURCHASE_AVAILABILITY_STATES,
};
const lifecyclePairs = LIFECYCLE.flatMap((state) => state === "checkout_created"
  ? ["open", "return-pending", "cancel-returned"].map((context) => `payment-lifecycle:${state}:${context}`)
  : [`payment-lifecycle:${state}`]);
const expectedPairs = [
  ...lifecyclePairs,
  "payment-lifecycle:unresolved",
  "transaction:unresolved",
  ...Object.entries(sourceVocabularies)
  .flatMap(([axis, states]) => states.map((state) => `${axis}:${state}`))
].sort();
const fixtureKey = ({ axis, state, context }) => `${axis}:${state}${context ? `:${context}` : ""}`;
assert.deepEqual(Object.keys(expected).sort(), expectedPairs, "the semantic ledger covers every state on every independent axis");
assert.deepEqual(
  PAYMENT_STATE_GALLERY_FIXTURES.map(fixtureKey).sort(),
  expectedPairs,
  "gallery fixtures derive from the complete governed presentation vocabulary",
);
assert.equal(acceptedPurchasePaymentLifecycleState("confirming"), "confirming", "known payment lifecycle remains on its own axis");
assert.equal(acceptedPurchasePaymentLifecycleState("future_provider_state"), null, "unknown payment lifecycle is stopped rather than flattened");
assert.equal(acceptedPurchaseTransactionState("paid"), "paid", "known transaction lifecycle remains on its own axis");
assert.equal(acceptedPurchaseTransactionState("future_transaction_state"), null, "unknown transaction lifecycle is stopped rather than flattened");

/* The same pure adapter feeds both Bag and Buyer Purchases. Exercise every
   overlapping lifecycle/context before inspecting that both callers use it. */
for (const lifecycle of LIFECYCLE.filter((state) => state !== "checkout_created")) {
  assert.deepEqual(
    acceptedPurchasePaymentInput(lifecycle),
    { axis: "payment-lifecycle", state: lifecycle },
    `${lifecycle} has one shared caller-to-owner input`,
  );
}
for (const context of ["open", "return-pending", "cancel-returned"]) {
  assert.deepEqual(
    acceptedPurchasePaymentInput("checkout_created", context),
    { axis: "payment-lifecycle", state: "checkout_created", context },
    `checkout_created:${context} has one shared caller-to-owner input`,
  );
}
assert.deepEqual(acceptedPurchasePaymentInput("future_provider_state"), { axis: "payment-lifecycle", state: "unresolved" }, "unknown attempt truth stays on the payment axis");
assert.equal(acceptedPurchasePaymentInput(null), null, "absence of an attempt is not fabricated as a payment state");

assert.deepEqual(
  ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES,
  {
    primary: "mt-0.5 text-[11px] uppercase tracking-[1.2px]",
    "availability-14": "mt-4 text-[14px] leading-[1.6]",
    "availability-13-bag": "mt-3 text-[13px] leading-[1.6]",
    "availability-13-buyer": "mt-2 text-[13px] leading-[1.6]",
    "bag-chip": "fw-lifecycle-label mt-0.5 uppercase",
    "buyer-chip": "mt-1 text-[11px] uppercase tracking-[1.2px]",
  },
  "gallery and live anchors share one exact typography-context registry",
);
assert.equal(ACCEPTED_PURCHASE_FOCUSED_ROW_CLASS, "bg-[var(--gold-whisper)]", "gallery and live rows share the focused wash");
assert.equal(acceptedPurchaseCheckoutContext("return"), "return-pending");
assert.equal(acceptedPurchaseCheckoutContext("cancel"), "cancel-returned");
assert.equal(acceptedPurchaseCheckoutContext(null), "open");

const parityCases = [
  {
    name: "accepted without an attempt",
    bag: { memberState: "awaiting_payment", transactionStatus: "pending", paymentLifecycle: null, hasPayment: false, canPay: true, returned: null },
    buyer: { transactionStatus: "pending", paymentLifecycle: null, hasPayment: false, canPay: true, returned: null },
    expected: { axis: "transaction", state: "pending" },
  },
  {
    name: "pending attempt",
    bag: { memberState: "awaiting_payment", transactionStatus: "pending", paymentLifecycle: "pending", hasPayment: true, canPay: true, returned: null },
    buyer: { transactionStatus: "pending", paymentLifecycle: "pending", hasPayment: true, canPay: true, returned: null },
    expected: { axis: "payment-lifecycle", state: "pending" },
  },
  ...["open", "return", "cancel"].map((returnKind) => ({
    name: `checkout created (${returnKind})`,
    bag: { memberState: "checkout_open", transactionStatus: "pending", paymentLifecycle: "checkout_created", hasPayment: true, canPay: true, returned: returnKind === "open" ? null : returnKind },
    buyer: { transactionStatus: "pending", paymentLifecycle: "checkout_created", hasPayment: true, canPay: true, returned: returnKind === "open" ? null : returnKind },
    expected: { axis: "payment-lifecycle", state: "checkout_created", context: returnKind === "return" ? "return-pending" : returnKind === "cancel" ? "cancel-returned" : "open" },
  })),
  ...["confirming", "requires_capture"].map((lifecycle) => ({
    name: lifecycle,
    bag: { memberState: "confirming", transactionStatus: "pending", paymentLifecycle: lifecycle, hasPayment: true, canPay: false, returned: null },
    buyer: { transactionStatus: "pending", paymentLifecycle: lifecycle, hasPayment: true, canPay: false, returned: null },
    expected: { axis: "payment-lifecycle", state: lifecycle },
  })),
  ...["failed", "canceled", "expired"].map((lifecycle) => ({
    name: lifecycle,
    bag: { memberState: "retry", transactionStatus: "pending", paymentLifecycle: lifecycle, hasPayment: true, canPay: true, returned: null },
    buyer: { transactionStatus: "pending", paymentLifecycle: lifecycle, hasPayment: true, canPay: true, returned: null },
    expected: { axis: "payment-lifecycle", state: lifecycle },
  })),
  {
    name: "unknown attempt remains on payment axis",
    bag: { memberState: "unruled", transactionStatus: "pending", paymentLifecycle: "future_provider_state", hasPayment: true, canPay: false, returned: null },
    buyer: { transactionStatus: "pending", paymentLifecycle: "future_provider_state", hasPayment: true, canPay: false, returned: null },
    expected: { axis: "payment-lifecycle", state: "unresolved" },
  },
  {
    name: "transaction cancellation is not payment cancellation",
    bag: { memberState: "unruled", transactionStatus: "cancelled", paymentLifecycle: null, hasPayment: false, canPay: false, returned: null },
    buyer: { transactionStatus: "cancelled", paymentLifecycle: null, hasPayment: false, canPay: false, returned: null },
    expected: { axis: "transaction", state: "cancelled" },
  },
  {
    name: "unknown transaction remains on transaction axis",
    bag: { memberState: "unruled", transactionStatus: "future_transaction_state", paymentLifecycle: null, hasPayment: false, canPay: false, returned: null },
    buyer: { transactionStatus: "future_transaction_state", paymentLifecycle: null, hasPayment: false, canPay: false, returned: null },
    expected: { axis: "transaction", state: "unresolved" },
  },
];
for (const parity of parityCases) {
  assert.deepEqual(shoppingBagPrimaryStateInput(parity.bag), parity.expected, `Bag executable emitter: ${parity.name}`);
  assert.deepEqual(buyerPurchasePrimaryStateInput(parity.buyer), parity.expected, `Buyer executable emitter: ${parity.name}`);
}

for (const fixture of PAYMENT_STATE_GALLERY_FIXTURES) {
  const pair = fixtureKey(fixture);
  const presentation = acceptedPurchaseStatePresentation(fixture);
  assert.deepEqual(
    [presentation.governance, presentation.meaning, presentation.text, presentation.line],
    expected[pair],
    `${pair} keeps its ruled presentation without crossing axes`,
  );
  assert.equal(presentation.axis, fixture.axis, `${pair} preserves its authoritative axis`);
  assert.equal(presentation.state, fixture.state, `${pair} preserves its exact state`);
  assert.equal(presentation.context, fixture.context, `${pair} preserves its exact rendering context`);
  assert.equal(presentation.surface, "var(--ink)", `${pair} records the ordinary buyer-surface plane`);
}

assert.notDeepEqual(
  acceptedPurchaseStatePresentation({ axis: "payment-lifecycle", state: "canceled" }),
  acceptedPurchaseStatePresentation({ axis: "transaction", state: "cancelled" }),
  "payment-attempt canceled and transaction cancelled never become one raw-string state",
);

/* These retry presentations are grounded in the current payment law, not
   inferred from their labels or copied from the old local tone maps. */
const stripeLaw = read("app/api/stripe/README.md");
assert.match(stripeLaw, /Cancel is not failure; the attempt stays\s+`checkout_created`/s, "cancel-return context remains neutral rather than becoming adverse");
assert.match(stripeLaw, /`failed` \/ `canceled` \/ `expired` \| member, `retry`/, "persisted failed/canceled/expired attempts have a ruled retry action");

/* `failed` itself cannot receive an adverse color yet: current writers use
   it for unlike provider and checkout-creation failures, while both browser
   projections deliberately omit the provider_status discriminator. */
const checkoutRoute = read("app/api/stripe/checkout/route.ts");
const paymentState = read("lib/payments/paymentState.ts");
assert.match(checkoutRoute, /lifecycle: "failed", provider_status: "checkout_create_failed"/, "checkout creation writes the shared failed value");
assert.match(paymentState, /lifecycle: "failed", providerStatus: "async_payment_failed"/, "async provider failure writes the shared failed value");
assert.match(paymentState, /lifecycle: "failed", providerStatus: "payment_failed"/, "PaymentIntent failure writes the shared failed value");
for (const path of ["app/api/stripe/payment-state/route.ts", "lib/purchases/shoppingBag.ts"]) {
  const source = read(path);
  const start = source.indexOf("payment: a");
  const terminator = source.indexOf(": null,", start);
  const end = terminator < 0 ? -1 : terminator + ": null,".length;
  assert.ok(start >= 0 && end > start, `${path} exposes a bounded public payment projection`);
  assert.doesNotMatch(source.slice(start, end), /provider_status|providerStatus/, `${path} withholds the discriminator needed for adverse failed color`);
}

const owner = read(ownerPath);
assert.doesNotMatch(owner, /Record<string|Record<AcceptedPurchaseStateInput\["state"\]/, "the owner is discriminated by axis, not one raw-string map");
for (const branch of [
  'case "payment-lifecycle"',
  'case "transaction"',
  'case "refund"',
  'case "dispute"',
  'case "availability"',
]) assert.match(owner, new RegExp(branch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `owner has an explicit ${branch} branch`);

const bag = read("components/ShoppingBagRoom.tsx");
const purchases = read("components/BuyerPurchasesPanel.tsx");
for (const [name, source] of [["Shopping Bag", bag], ["Buyer Purchases", purchases]]) {
  assert.match(source, /AcceptedPurchaseStateMarker/, `${name} uses the shared real state renderer`);
  assert.match(source, /axis: "refund"/, `${name} sends refund truth with its axis`);
  assert.match(source, /axis: "dispute"/, `${name} sends dispute truth with its axis`);
  assert.doesNotMatch(source, /GOVERNANCE-PENDING|PAYMENT PRODUCT SEMANTICS NOT YET RULED/, `${name} leaks no internal governance copy`);
}
assert.match(bag, /shoppingBagPrimaryStateInput\(/, "Shopping Bag executes the tested state-input projector");
assert.match(purchases, /buyerPurchasePrimaryStateInput\(/, "Buyer Purchases executes the tested state-input projector");
assert.doesNotMatch(bag, /type Presentation = \{[\s\S]*?tone:/, "Bag has no local color-tone vocabulary");
assert.doesNotMatch(purchases, /function describe[\s\S]*?tone:/, "Buyer Purchases has no local color-tone vocabulary");
assert.match(bag, /axis: "availability", state: "read_unavailable"/, "Bag read failure uses the shared high-priority neutral presentation");
assert.match(purchases, /axis: "availability", state: "read_unavailable"/, "Buyer Purchases read failure uses the same presentation");
assert.match(purchases, /if \(lc === "succeeded"\)[^\n]+input,/, "Buyer Purchases paid uses its executable shared-owner input");
assert.doesNotMatch(bag, /axis: "payment-lifecycle", state: "succeeded"/, "Bag disappearance never fabricates a succeeded payment-attempt source");
for (const [name, source] of [["Bag", bag], ["Buyer Purchases", purchases]]) {
  assert.match(source, /focused \? ACCEPTED_PURCHASE_FOCUSED_ROW_CLASS : ""/, `${name} consumes the measured focused-row wash`);
  assert.match(source, /ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES\.primary/, `${name} consumes the primary state typography context`);
}
assert.match(bag, /ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES\["availability-14"\]/, "Bag full-read failure consumes its live 14px context");
assert.match(bag, /ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES\["availability-13-bag"\]/, "Bag partial-read failure consumes its live 13px context");
assert.match(purchases, /ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES\["availability-13-buyer"\]/, "Buyer Purchases read failure consumes its live 13px context");
assert.match(bag, /className="fw-lifecycle-label mt-0\.5 uppercase"/, "Bag refund\/dispute chips retain the LS1-governed 11px\/400 binding represented by the shared gallery recipe");
assert.match(purchases, /ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES\["buyer-chip"\]/, "Buyer refund\/dispute chips consume their existing 11px\/300 context");

/* The checkout error state stores heterogeneous failure, availability,
   eligibility and retry truth in one string slot. It remains stopped rather
   than being painted adverse wholesale. */
for (const source of [bag, purchases]) {
  assert.match(source, /border-l-2 border-\[var\(--gold\)\]/, "mixed checkout error keeps its existing stopped gold boundary");
}

const gallery = read(galleryPath);
for (const source of [bag, purchases, gallery]) {
  assert.match(source, /ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES/, "live/gallery anchor classes come from the same recipe registry");
  assert.match(source, /ACCEPTED_PURCHASE_FOCUSED_ROW_CLASS/, "live/gallery focused wash comes from the same surface registry");
}
assert.match(gallery, /createClient\(\)/, "gallery authenticates at the route");
assert.match(gallery, /supabase\.auth\.getUser\(\)/, "gallery verifies the session on the server");
assert.match(gallery, /jmynatt74@gmail\.com/, "gallery uses the established founder identity");
assert.match(gallery, /if \(!localDevelopment && \(!user \|\| user\.email\?\.toLowerCase\(\) !== ADMIN_EMAIL\.toLowerCase\(\)\)\) \{\s*redirect\("\/"\);/s, "deployed gallery redirects every non-founder");
assert.match(gallery, /robots: \{ index: false, follow: false, nocache: true \}/, "gallery is noindex, nofollow and nocache");
assert.match(gallery, /PAYMENT_STATE_GALLERY_FIXTURES\.map/, "gallery derives its cards from the complete shared fixture registry");
assert.match(gallery, /AcceptedPurchaseStateMarker/, "gallery mounts the real shared product renderer");
assert.doesNotMatch(gallery, /fetch\(|\.from\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|createServiceClient|getStripe\(/, "gallery contains no data/payment read, provider call, or mutation after auth");
assert.match(gallery, /GOVERNANCE-PENDING/, "gallery alone makes unresolved governance visible for founder review");
assert.match(gallery, /data-payment-mixed-stop="checkout-alert"/, "gallery disposes the heterogeneous checkout alert without recoloring it");
assert.match(gallery, /data-payment-mixed-stop="bag-departure"/, "gallery disposes the Bag departure message without fabricating succeeded payment truth");

const renderer = read(rendererPath);
assert.match(renderer, /return \{ color: `light-dark\(/, "shared marker owns semantic color");
assert.match(
  renderer,
  /color-mix\(in srgb, \$\{presentation\.text\} 65%, var\(--platinum\) 35%\)/,
  "Light markers use the Human-approved 65/35 semantic expression",
);
assert.match(
  renderer,
  /color-mix\(in srgb, \$\{lightHue\} 85%, black 15%\)/,
  "Light markers darken the approved semantic hue by the bounded 15% optical clamp",
);
assert.match(
  renderer,
  /light-dark\(\$\{lightText\}, \$\{presentation\.text\}\)/,
  "Dark markers remain the byte-identical governed semantic token arm",
);
assert.doesNotMatch(
  renderer,
  /color-mix\(in srgb, \$\{presentation\.text\} 45%, var\(--platinum\) 55%\)/,
  "the too-faint 45/55 Light expression cannot return",
);
assert.doesNotMatch(renderer, /(?:fontSize|fontWeight|fontStyle|lineHeight|letterSpacing|textTransform|backgroundColor|opacity|filter)\s*:/, "shared marker cannot override caller typography, surface, opacity or filters");

const packageJson = JSON.parse(read("package.json"));
assert.match(packageJson.scripts.prebuild, /ls2-accepted-purchase-payment-state-semantics\.test\.mjs/, "coverage guard runs through the normal build lifecycle");

for (const declaration of [
  "--platinum:     light-dark(#25231F, #E8E4DC);",
  "--platinum-dim: light-dark(#3B382F, #CFCBC3);",
  "--muted:        light-dark(#6B655B, #818799);",
  "--lc-published-badge:      light-dark(#2E7D4F, #70C090);",
  "--lc-rejected-badge:       light-dark(#A03B33, #DB8E88);",
  "--lc-private_active-badge: light-dark(#3E4E6E, #9FB3E0);",
  "--lc-neutral-line:         var(--border-subtle);",
]) assert.ok(read("app/globals.css").includes(declaration), `existing governed token remains unchanged: ${declaration}`);

console.log(`LS-2 Accepted Purchase / Payment state semantics PASS: ${expectedPairs.length} axis-qualified states; shared Bag/Buyer owner; founder-only in-memory gallery coverage.`);
