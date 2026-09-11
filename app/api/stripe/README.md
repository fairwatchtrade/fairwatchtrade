# Stripe payments — Step 1 of 4: pay an accepted purchase through Stripe Sandbox

**Lead with the misconception this file exists to kill:**

> "The buyer came back through the success URL, so the payment succeeded."

No. The redirect tells FairWatchTrade where the collector came from. Only a
signature-verified webhook tells FairWatchTrade what happened. Every state a
buyer sees here was written by `stripe_apply_event()` from a verified event, or
it is the honest "Confirming payment" state that says the webhook has not
arrived yet.

Files: `app/api/stripe/checkout/route.ts` · `app/api/stripe/webhook/route.ts` ·
`app/api/stripe/payment-state/route.ts` · `lib/payments/money.ts` ·
`lib/payments/paymentState.ts` · `lib/payments/stripe/{client,checkout,events}.ts` ·
`components/BuyerPurchasesPanel.tsx` ·
`supabase/migrations/20260910210000_stripe_step1_payment_records.sql` ·
Shopping Bag (2026-09-11): `lib/payments/transactionPayability.ts` ·
`lib/purchases/bagMembership.ts` · `lib/purchases/shoppingBag.ts` ·
`app/api/shopping-bag/route.ts` · `app/shopping-bag/page.tsx` ·
`components/ShoppingBag{Icon,Entrance,Room}.tsx` ·
`supabase/migrations/20260911090000_accepted_purchase_buyer_summons.sql`

Verify current state:

```bash
node scripts/stripe-step1.test.mjs
node scripts/shopping-bag.test.mjs
# database proof: run scripts/stripe-step1.test.sql as one statement; expect PROOF_OK
# acceptance + summons proof: run scripts/shopping-bag.test.sql as one statement; expect PROOF_OK
grep -n "payment_method_types" lib/payments/stripe/checkout.ts
grep -rn "\* 100\|\*100" lib/payments   # must be empty
```

---

## The human capability

The buyer of an accepted purchase opens their Account Overview, sees the
purchase under **Your Purchases**, presses **Pay with Stripe**, deliberately
leaves for Stripe's hosted Checkout, pays by card, returns to the same
purchase, sees **Confirming payment** until the webhook lands, then **Paid**.
No founder, SQL or developer in the loop.

## Step 1 boundary

Sandbox only. Cards only, enforced in code. Automatic capture only. One
controlled connected account. No live keys (the client refuses `sk_live_`).
No seller onboarding, no manual capture, no shipping-triggered capture, no
refund or dispute UI, no production charge-model ruling. Steps 2, 3 and 4 own
those, in that order.

## Where payment begins

Purchase Request is negotiation. Payment begins only after
`accept_purchase_request()` has created the authoritative `transactions` row.
The payment record hangs off `transactions.id`, never off a purchase request.
The acceptance function is otherwise frozen; its one Step 1 amendment writes
`final_purchase_currency` from the accepted request's `proposed_currency` in
the same INSERT as `final_purchase_price`, so amount and currency are one
truth pair that cannot drift with the listing.

## Money

`transactions.final_purchase_price` is major units. Stripe wants the
currency's minor-unit integer. `lib/payments/money.ts` converts using
`supported_currencies.exponent`, on the decimal string, and refuses precision
loss. USD 10.99 → `1099`; JPY 10 → `10`. There is no `× 100` anywhere.
Provider integers are named `amount_minor` wherever stored.

## Checkout creation (`POST /api/stripe/checkout`)

Body: `{ transactionId }` and nothing else has authority. The route
re-reads the transaction, requires the caller to be its buyer, requires a
payable transaction status, requires the snapshotted currency to be active in
`supported_currencies`, converts the amount, resolves the connected account
from `STRIPE_SANDBOX_CONNECTED_ACCOUNT_ID`, then:

- reuses the still-open Checkout of the active attempt (double click safe);
- refuses if the active attempt is `confirming` / `requires_capture` /
  `succeeded` (`payment_locked`);
- otherwise deactivates the dead attempt (kept as history), inserts a new
  `stripe_payment_attempts` row, and creates the session with idempotency
  key `fwt:stripe:checkout:<transaction_uuid>:<attempt_uuid>` in the
  connected account's context (`stripeAccount` request option = the Step 1
  direct-charge fixture; non-governing).

Session metadata and payment-intent metadata carry `fwt_transaction_id` and
`fwt_payment_attempt_id` for correlation. Metadata is correlation, not a
second database.

Success and cancel URLs both return to
`/shopping-bag?transaction=<id>&payment=return|cancel` (2026-09-11; before
that, the Overview). Cancel is not failure; the attempt stays
`checkout_created` until Stripe says otherwise. See "Shopping Bag" below for
what the Bag page does with that arrival.

## Webhook (`POST /api/stripe/webhook`)

1. `request.text()` — the raw body — then `constructEvent` over it with
   `STRIPE_WEBHOOK_SECRET`. Bad signature → 400. Nothing is parsed first.
2. `normalizeEvent` flattens the Stripe object into a `NormalizedEvent`,
   carrying `event.account` as the connected-account context (`null` means
   platform).
3. The payment attempt is resolved by correlation metadata, then session id,
   payment-intent id, charge id.
4. `transitionFor(currentTruth, event)` decides purely
   (`lib/payments/paymentState.ts`).
5. `stripe_apply_event(p_event, p_attempt_id, p_expected_lifecycle, p_patch)`
   records the event once (unique on `event_id` + account context), applies
   at most one transition only if the attempt is still at the expected
   lifecycle, upserts refunds by provider id, recomputes the refund total
   from `stripe_refunds`, and marks the result: `applied`, `ignored`,
   `unresolved`, `stale`, or `duplicate`.

Any recorded outcome returns 2xx so Stripe stops retrying. A database
failure returns 500 so Stripe retries. Live-mode events are recorded and
ignored in this sandbox step.

**Dashboard requirement that code cannot satisfy:** the sandbox webhook
endpoint must be created with **Connected accounts** events enabled
("Listen to events on Connected accounts"), or direct-charge events never
arrive. Subscribe at least: `checkout.session.completed`,
`checkout.session.expired`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `payment_intent.succeeded`,
`payment_intent.payment_failed`, `payment_intent.canceled`,
`payment_intent.amount_capturable_updated`, `charge.refunded`,
`refund.created`, `refund.updated`, `charge.dispute.created`,
`charge.dispute.updated`, `charge.dispute.closed`.

## Payment truth (`stripe_payment_attempts`)

Three independent axes:

| Axis | Column | Values |
|---|---|---|
| capture lifecycle | `lifecycle` | pending · checkout_created · confirming · requires_capture · succeeded · failed · canceled · expired |
| refund | `refund_state`, `refunded_amount_minor` | none · partial · full (derived from amount refunded vs `amount_minor`) |
| dispute | `dispute_state`, `dispute_provider_status`, `dispute_id` | none · open · won · lost |

`succeeded` is terminal on the capture axis: a later expired / failed /
canceled event never demotes it, a partial refund never erases a dispute, a
dispute never erases the capture. `requires_capture` is representable now so
Step 2 needs no migration. One active attempt per transaction (partial unique
index); retired attempts stay as history.

`transactions.rail` and `transactions.status` are untouched by Step 1. A
Stripe success does not write `rail = 'card'`; payment truth lives on the
payment record.

## Event log (`stripe_events`)

Every received event, once per `(event_id, coalesce(stripe_account_id,''))`,
with type, livemode, object, provider timestamp, receipt time, the resolved
attempt/transaction, the processing result and note, and the full payload.
Kept even when nothing transitioned.

## Authority (S1-C1: provider internals are server-only)

No client role can read or write any Stripe table. `anon` and
`authenticated` hold no SELECT, INSERT, UPDATE or DELETE on
`stripe_payment_attempts`, `stripe_refunds` or `stripe_events`
(`20260910220000_stripe_step1_c1_server_only_reads.sql` withdrew the
own-row SELECT the first migration had granted). `stripe_apply_event`
executes for `service_role` only.

The buyer sees payment truth only through `GET /api/stripe/payment-state`,
which identifies the caller on the session client, reads their transactions
under RLS, then reads the provider record with the service role and returns
an allowlist: `lifecycle`, `refundState`, `refundedAmountMinor`,
`disputeState`, `checkoutExpiresAt`, `updatedAt`. `checkout_url`, the
connected account id, PaymentIntent and Charge ids, the idempotency key and
raw provider status never leave the server. The browser sends requests; the
server determines commercial truth; the webhook confirms it.

## Could-not-look is not nothing-found (S1-C2)

Every read of the provider record checks its error. `payment-state`
answers 503 `payment_state_unavailable` when the attempt read fails, so a
buyer is never shown Pay with Stripe on top of a state FairWatchTrade failed
to establish; the Overview panel then says the purchases could not be loaded
and offers Refresh instead of rendering nothing. `checkout` answers the same
503 when it cannot see whether an attempt already exists or cannot read the
currency, rather than starting a new attempt on an assumption. `webhook`
answers 500 `lookup_failed` when an attempt lookup fails, so Stripe retries
instead of the event being recorded as unresolved and never re-examined.

## Return race

Returning before the webhook is normal. The Overview panel shows
**Confirming payment**, polls the read route every 4 s for up to 2 minutes,
then says confirmation is still pending and offers Refresh. It never shows
Paid from the redirect.

## Configuration (server-only, never `NEXT_PUBLIC_`)

| Variable | Meaning |
|---|---|
| `STRIPE_SECRET_KEY` | sandbox secret key, must start `sk_test_` |
| `STRIPE_WEBHOOK_SECRET` | signing secret of the sandbox webhook endpoint, `whsec_…` |
| `STRIPE_SANDBOX_CONNECTED_ACCOUNT_ID` | the one controlled connected account, `acct_…` |

## Replay and recovery

Resend an event from the Stripe Dashboard: it lands as `duplicate`, no
second transition. If processing failed before recording (500), Stripe
retries and the original event truth is preserved on the retry. If an event
arrives for an attempt the lifecycle has already moved past, it is recorded
as `stale`. If nothing matches, `unresolved`, kept for reconciliation.

## Shopping Bag (Accepted Purchase Continuity, 2026-09-11)

**The misconception this section exists to kill:** "the Shopping Bag is a
cart the buyer fills." Nothing is added to it. The Bag is an **ephemeral
projection over accepted transaction + payment truth**: for each transaction
the buyer owns, the resolver reads `transactions.status` and the active
`stripe_payment_attempts` row (webhook-written) and decides, at read time,
whether that accepted purchase is still inside the buyer's payment/funding
phase. There is no bag table, no bag row, no bag write, and the browser
cannot author a member. The Bag **owns no commercial truth**; it composes
truth owned elsewhere (transaction snapshot, request note and asking
snapshot, listing image/code, public seller identity).

**Bag is not Your Purchases.** Your Purchases (`BuyerPurchasesPanel`, the
Overview) is persistent transaction/payment history including paid
purchases and keeps its name. The Bag holds only what is still actionable
or confirming; a paid watch leaves it. Both surfaces initiate Checkout
through the same route and the same payability predicate.

Where things live:

| Thing | Location |
|---|---|
| transaction-payability predicate (one copy; Checkout, payment-state and the Bag import it) | `lib/payments/transactionPayability.ts` |
| pure membership mapping, `bagDecisionFor(status, paymentTruth)` | `lib/purchases/bagMembership.ts` |
| resolver (service role, server-only), `resolveShoppingBag(buyerId)` | `lib/purchases/shoppingBag.ts` |
| read route (session-identified, 503 on failure) | `app/api/shopping-bag/route.ts` |
| room + header entrance + locked icon | `components/ShoppingBag{Room,Entrance,Icon}.tsx`, `app/shopping-bag/page.tsx` |
| buyer acceptance summons (database-owned, fail-open) | `20260911090000_accepted_purchase_buyer_summons.sql` |

Lifecycle mapping (transaction status × active attempt lifecycle):

| Transaction | Attempt | Bag |
|---|---|---|
| pending / payment_pending | none or `pending` | member, `awaiting_payment`, Pay |
| pending / payment_pending | `checkout_created` | member, `checkout_open`, Continue |
| pending / payment_pending | `failed` / `canceled` / `expired` | member, `retry` |
| pending / payment_pending | `confirming` / `requires_capture` | member, **Confirming payment remains a member**, no action |
| any | `succeeded` | **paid/funded removes membership**; later refund/dispute never brings it back |
| paid / shipped / delivered / under_inspection / completed | any | not a member (post-payment, no resurrection) |
| cancelled / disputed / refunded / unknown, no confirmed capture | any | **not ruled**: kept as a member in `unruled` state with no action, said plainly. Never silently removed. |

Header truth: a successful read with zero members renders **no icon at
all**; N members render the icon with N beside the gold check (never over
it); a **failed membership read is unavailable, never zero** — the icon
renders with "Unavailable" and no number, and the accessible label says so.
Placement is fixed: `SELL → Bag → Bell → Username` on desktop, after Sell in
the drawer's utility group on narrow screens.

Stripe continuity: Checkout's success/cancel URLs return to
`/shopping-bag?transaction=<id>&payment=return|cancel`. The Bag page
resolves that arrival against **current** membership: still a member → the
Bag, focused on that purchase, showing Confirming payment until the webhook
lands; already gone (the webhook won the race) → forwarded to the same
transaction in Your Purchases, never resurrected. **The redirect is never
payment authority; the webhook remains payment authority.**

The one bounded write outside the frozen spine: `accept_purchase_request()`
now also inserts one `notifications` row for the request row's buyer (type
`purchase_accepted`, stamped with the minted `transaction_id`, deduped on
`purchase_accepted:<request_id>`) inside a fail-open block after every
commercial write. It can neither alter nor roll back acceptance.
`notificationHref` routes that type to the Bag purchase.

Correspondence repair: the messages route now admits a buyer-initiated
first thread on a **reserved** listing when the caller is the buyer of an
**accepted** purchase request for it (authority derived server-side).
Threads remain (listing, buyer, seller); nothing is transaction-scoped.

Not documented here as fact because not ruled: post-acceptance
cancellation, legal expiry, seller rescission, and what any terminal
settlement state means for the Bag.

## Frozen neighbors

`accept_purchase_request()` (except the currency snapshot and the bounded
buyer-summons block above), the canonical lock order,
`transactions_one_per_request`, Purchase Request semantics,
`components/usePurchaseRequest.ts`, `app/api/purchase-requests/route.ts`,
seller acceptance meaning, listing `reserved` meaning.

## Not in Step 1

Step 2: authorization and capture against the shipping event. Step 3:
seller payout onboarding. Step 4: the live rail, charge model, disclosures.

`app/api/evaluate/route.ts` is untouched. **PFC274 = 62.**
