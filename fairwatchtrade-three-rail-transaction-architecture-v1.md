# FairWatchTrade — Three-Rail Transaction Architecture v1

**Owner:** GPT  
**Partner:** NewFavDuck  
**Status:** Research architecture only — **not approved for implementation**  
**Purpose:** Preserve the original FairWatchTrade 5% promise while identifying a viable transaction architecture for peer-to-peer collectors, private sellers, estates, and professional dealers.

---

## 0. Governing Principles

### The 5% Promise

FairWatchTrade's intended seller economics are:

> **5% flat seller fee on completed FairWatchTrade sales. No additional FairWatchTrade transaction fees.**

Third-party costs may exist because a chosen payment rail has a real cost. FairWatchTrade's intent is:

- no hidden markup on escrow fees;
- no hidden markup on card-processing costs;
- no hidden spread on bank or wire costs;
- no dynamic FairWatchTrade commission based on brand, price, desirability, or seller type.

**Important:** This is a product/business intent, not yet final public copy.

### The Core Architectural Separation

The system must distinguish:

1. **The watch sale**
2. **The movement of purchase funds**
3. **The event that earns FairWatchTrade's 5%**
4. **The event that collects FairWatchTrade's 5%**

Those events may coincide on one rail and be separate on another.

### The Peer-to-Peer Test

Every architecture must work not only for a dealer, but also for:

- a trusted collector selling one watch;
- a private owner;
- an estate;
- the recurring “widow selling her late husband's Breguet” test case.

A rail that requires every private seller to behave like a professional merchant fails the original peer-to-peer mission.

---

# Status Legend

- **CONFIRMED** — supported by current primary provider documentation.
- **LIKELY** — strongly suggested by primary documentation, but exact FairWatchTrade configuration is not yet verified.
- **UNKNOWN** — unresolved.
- **PROVIDER REVIEW** — requires direct confirmation from Escrow.com or Stripe for FairWatchTrade's actual business model.
- **LEGAL REVIEW** — requires qualified counsel.
- **BUSINESS DECISION** — Jason/FairWatchTrade must decide.
- **POLICY DECISION** — operating rule must be designed before build.

---

# RAIL 1 — Escrowed Wire via Escrow.com Broker Flow

## Intended Role

A protected, escrowed transaction path for buyers and sellers who want structured funding, shipment, inspection, and closing.

## Who pays whom?

Buyer funds Escrow.com by wire. Escrow.com secures the buyer's funds. Seller ships under the agreed transaction terms. On successful close, seller proceeds and broker commission are disbursed according to the transaction structure.

**Status:** **CONFIRMED** at the capability level for broker transactions; exact FairWatchTrade configuration remains **PROVIDER REVIEW**.

## Who holds funds?

Escrow.com holds transaction funds within its escrow structure during the transaction.

**Status:** **CONFIRMED**.

## How does FairWatchTrade earn 5%?

FairWatchTrade participates as broker and the transaction includes a broker-fee item. Escrow.com's API documentation supports brokered transactions, broker fee items, and percentage-based broker fees.

**Status:**

- Broker commission capability: **CONFIRMED**
- Percentage-based broker fee capability: **CONFIRMED**
- Exact 5% seller-paid FWT structure: **LIKELY / PROVIDER REVIEW**

## When is the 5% earned?

Intended rule:

> **Only on a completed sale.**

For a normal successful escrow path, completion follows buyer acceptance or expiration of the agreed inspection period under the transaction terms.

Escrow.com's published terms indicate broker commission is not generally paid on cancellation/rejection unless otherwise stipulated.

**Status:** **LIKELY**, with exact transaction-term configuration requiring **PROVIDER REVIEW** and terms review.

## When is the 5% collected?

Intended architecture: at successful close, through the broker commission mechanism.

**Status:** **LIKELY**. Exact timing, payout sequencing, and any required broker action: **PROVIDER REVIEW**.

## What happens if the sale fails before completion?

Intended outcome:

- seller receives no sale proceeds;
- FairWatchTrade earns no 5%;
- buyer refund treatment follows Escrow.com terms;
- escrow fees may still be payable depending on the failure stage.

Escrow.com's published FAQ states that after funds approval, cancellation or buyer rejection can leave the buyer responsible for the escrow fee.

**Status:**

- Failure-state escrow fee treatment: **substantially CONFIRMED** by published FAQ
- FWT-specific partner/broker economics: **PROVIDER REVIEW**

## What happens if the sale reverses later?

This must not be waved away merely because wire funding is used.

Questions remain:

- What post-close remedies exist under Escrow.com terms?
- Can a transaction be administratively reopened?
- What happens after alleged fraud discovered post-close?
- What happens if a watch is later proven stolen or materially misrepresented?

**Status:** **UNKNOWN / LEGAL REVIEW / POLICY DECISION**

## Who bears third-party costs?

Escrow.com permits fee allocation among transaction participants in broker transactions. Therefore:

> **“Buyer pays escrow fee” is not an architectural fact. It is a FairWatchTrade business choice.**

Possible structures include buyer, seller, broker, or allowed splits.

**Status:**

- Flexible fee allocation capability: **CONFIRMED**
- FWT launch policy: **BUSINESS DECISION**

## Who bears fraud/dispute risk?

Escrow.com provides the escrow process and transaction mechanics. FairWatchTrade's own liability as broker, marketplace operator, curator, or party making representations is not established by provider documentation.

**Status:** **LEGAL REVIEW**

## What does the buyer choose?

Potentially:

- use protected escrowed wire;
- agree to transaction terms;
- fund transaction;
- accept or reject during inspection according to the agreed rules.

**Status:** Mixed **CONFIRMED capability / BUSINESS DECISION**

## What does the seller choose?

Potentially:

- accept the purchase/offer;
- agree to escrow terms;
- ship within required window;
- accept Rail 1 as the settlement method.

**Status:** **BUSINESS DECISION** layered on supported provider mechanics.

## Critical provider facts

- Broker transactions are wire-transfer only.
- Escrow.com's public FAQ states no transaction amount limit for broker transactions.
- Escrow.com's API supports marketplaces.
- Escrow.com's API supports broker-fee items.
- Escrow.com's API reference supports percentage-based broker fees.
- Escrow.com's public WooCommerce integration documentation includes an example of a 5% broker commission in multi-vendor scenarios.

## Rail 1 unresolved items

1. Can FairWatchTrade be approved for this exact high-value watch marketplace model?
2. Can the broker fee be configured exactly as 5% of the completed sale amount?
3. Can seller-paid broker commission be deducted cleanly from seller proceeds?
4. What is the current partner/API pricing for FWT?
5. What onboarding/application process applies?
6. What are FWT's legal obligations and exposure as broker?
7. What exact failure/reversal states affect broker commission?

---

# RAIL 2 — Connected Card via Stripe Connect

## Intended Role

A seller-optional card rail. The seller chooses whether to accept card payments. FairWatchTrade remains part of the transaction and seeks to collect its 5% automatically without marking up processor costs.

## Who pays whom?

Conceptually:

- buyer pays by card;
- payment is processed through a Stripe Connect configuration;
- seller receives proceeds;
- FairWatchTrade receives an application fee.

**Status:** **CONFIRMED capability**, exact FWT model **UNKNOWN** until charge type and platform configuration are chosen.

## Who holds funds?

This question cannot be answered generically as “Stripe holds the funds and FWT is out of it.”

Fund flow and responsibility vary by Connect architecture.

**Status:** **CONFIGURATION-DEPENDENT / UNKNOWN**

## How does FairWatchTrade earn 5%?

Stripe Connect supports application fees.

**Status:** **CONFIRMED capability**

The exact implementation may differ between:

- direct charges;
- destination charges;
- separate charges and transfers;
- other supported Connect configurations.

**Status:** **BUSINESS + PROVIDER DECISION**

## When is the 5% earned?

FairWatchTrade's intended policy is:

> **5% on completed sales, not merely on a successful card authorization.**

That is not automatically the same as Stripe's charge event.

**Status:** **BUSINESS DECISION**

This distinction is critical. A card can be successfully charged before:

- shipment;
- delivery;
- inspection;
- buyer acceptance;
- later refund or dispute.

## When is the 5% collected?

Depending on configuration, an application fee can be collected as part of the payment flow.

**Status:** **CONFIRMED capability / CONFIGURATION-DEPENDENT**

## What happens if the sale fails?

Must be defined by event:

- card decline;
- cancellation before shipment;
- cancellation after shipment;
- seller non-shipment;
- return;
- agreed refund;
- buyer dispute.

Application fees are not automatically refunded simply because the underlying payment is refunded; Stripe documents that the platform must explicitly refund the application fee in direct-charge flows.

**Status:** **CONFIRMED provider behavior at capability level; FWT policy UNKNOWN**

## What happens if the sale reverses later?

Chargebacks and disputes are a first-order architectural risk.

### Direct charges

Stripe documentation says disputes on direct charges are debited from the connected account balance rather than automatically from the platform balance. However, negative-balance responsibility can still depend on Connect configuration.

**Status:** **CONFIRMED / CONFIGURATION-DEPENDENT**

### Destination charges

Stripe documentation states the platform account is debited for Stripe fees, refunds, and chargebacks.

**Status:** **CONFIRMED**

### Architectural ruling

> **Charge type is not an implementation detail. It is the risk architecture.**

No Rail 2 brief should proceed without this being explicitly decided.

## Who bears third-party costs?

FairWatchTrade intent:

- seller chooses whether to enable cards;
- actual processing economics are disclosed;
- FWT does not mark up or share in processor fees.

**Status:** **CONFIRMED intent / BUSINESS DECISION**

Do **not** lock 2.9% + 30¢ into architecture. That is illustrative public pricing, not confirmed FWT Connect economics.

**Status:** **PROVIDER REVIEW**

## Who bears fraud/dispute/chargeback risk?

Depends materially on charge type, connected-account structure, negative-balance responsibility, and Stripe's approval of the platform.

**Status:** **PROVIDER REVIEW / LEGAL REVIEW**

## What does the buyer choose?

If card rail is enabled:

- buyer chooses among permitted card payment options.

Buyer does not necessarily choose whether the seller supports Rail 2; that can be seller-controlled.

**Status:** **BUSINESS DECISION**

## What does the seller choose?

Intended model:

> Seller may enable or disable card acceptance.

If enabled, seller is shown clearly that processor costs reduce net proceeds.

**Status:** **BUSINESS DECISION**

## Critical provider approval question

FairWatchTrade must not assume that a high-value watch marketplace is automatically permitted.

Stripe restricted-business rules vary by jurisdiction and context and may require review of high-value goods or other risk categories.

Therefore:

> **Stripe approval for FairWatchTrade's high-value watch marketplace is UNKNOWN until provider review.**

**Status:** **PROVIDER REVIEW — BLOCKING**

## Rail 2 unresolved items

1. Is the FWT high-value watch marketplace approved?
2. Which Connect charge type fits the desired risk model?
3. Who is merchant of record?
4. Who is responsible for connected-account negative balances?
5. Who bears disputes and chargebacks?
6. What happens to the 5% on refund?
7. Can card proceeds be delayed through a meaningful inspection period?
8. What reserve requirements might apply?
9. What are actual Connect economics for FWT?
10. What KYC/KYB requirements apply to private sellers, estates, and dealers?

---

# RAIL 3 — Direct Settlement + Seller Fee Obligation

## Intended Role

A peer-to-peer path where buyer and seller settle directly while FairWatchTrade remains the marketplace of record and separately collects its 5% seller success fee.

This rail is strongly motivated by the original P2P mission and by existing marketplace patterns such as seller commission billing.

## Who pays whom?

Buyer pays seller directly using an agreed method.

Potential examples:

- direct wire;
- PayPal;
- another mutually agreed method.

FairWatchTrade does not receive or hold the purchase funds.

**Status:** **CONFIRMED intent**

## Who holds funds?

No one on FairWatchTrade's behalf.

**Status:** **CONFIRMED intent**

## How does FairWatchTrade earn 5%?

As a contractual seller obligation tied to a completed FairWatchTrade-originated sale.

Potential collection models:

- per-transaction invoice;
- recurring seller commission bill;
- stored payment method;
- ACH debit authorization;
- automatic billing after a defined completion event.

**Status:** **BUSINESS DECISION / LEGAL REVIEW**

Existing marketplace patterns are evidence that separate seller commission billing is feasible as a business model. They are not proof that a specific FWT structure is legally or operationally correct.

## When is the 5% earned?

This is the central Rail 3 question.

Possible trigger:

> A sale is completed when the buyer and seller confirm settlement and transfer of the watch.

But the confirmation standard is unresolved.

Possible evidence:

- both parties confirm;
- seller confirms payment and buyer confirms receipt;
- platform messages show acceptance and subsequent completion;
- one-sided confirmation plus documented evidence;
- lapse of a defined close window.

**Status:** **POLICY DECISION / LEGAL REVIEW**

## When is the 5% collected?

Separate from the watch purchase funds.

Possible models:

1. per-transaction invoice;
2. monthly statement;
3. stored card charge;
4. ACH debit under valid authorization;
5. seller account balance.

**Status:** **BUSINESS DECISION / LEGAL REVIEW**

## What happens if the sale fails?

Intended rule:

> No completed sale, no 5% fee.

But “failed” must be defined.

**Status:** **CONFIRMED intent / POLICY DECISION**

## What happens if the sale reverses later?

Hard problem.

Examples:

- buyer returns watch;
- seller refunds buyer;
- payment is reversed;
- fraud discovered;
- parties privately unwind the sale;
- buyer claims sale never completed;
- seller claims buyer is abusing refund policy.

Questions:

- Is FWT's fee refunded?
- Is it credited?
- Is the original fee still earned because the marketplace produced the sale?
- Who decides legitimacy?

**Status:** **POLICY DECISION / LEGAL REVIEW**

## Who bears third-party costs?

Buyer and seller bear the costs of the payment method they choose.

FairWatchTrade intent:

> No markup and no hidden share of third-party costs.

**Status:** **CONFIRMED intent**

## Who bears fraud/dispute risk?

This rail has the lowest payment custody by FWT but potentially the weakest transaction protection.

If buyer pays seller directly and seller disappears, FWT cannot freeze money it never held.

If seller ships before verified payment, seller bears substantial risk.

The principal FWT enforcement tools are:

- reputation;
- eligibility;
- account privileges;
- suspension;
- transaction record;
- contractual fee obligation.

**Status:** **POLICY DECISION / LEGAL REVIEW**

## What does the buyer choose?

Potentially:

- whether to accept direct settlement;
- payment method among those seller supports.

**Status:** **BUSINESS DECISION**

## What does the seller choose?

Potentially:

- whether to offer direct settlement, subject to eligibility;
- accepted direct-payment methods.

**Status:** **BUSINESS DECISION**

## Eligibility question

Rail 3 may be:

- open to all verified sellers;
- limited to trusted sellers;
- limited by transaction history;
- limited by reviews;
- limited by identity verification;
- Phase 2 only.

No answer is yet approved.

**Status:** **BUSINESS DECISION**

## Rail 3 unresolved items

1. What event proves a completed sale?
2. When exactly is 5% earned?
3. How is 5% invoiced or auto-collected?
4. What happens on later reversal?
5. What happens when seller denies completion?
6. What happens when buyer claims off-platform settlement?
7. What is circumvention?
8. What enforcement is fair?
9. What appeals process exists?
10. Is Rail 3 launch-critical or Phase 2?
11. What legal terms support fee collection?
12. Is stored card or ACH authorization appropriate?

---

# Side-by-Side Architecture

| Question | Rail 1 — Escrowed Wire | Rail 2 — Connected Card | Rail 3 — Direct Settlement |
|---|---|---|---|
| FWT holds purchase funds | No, intended | Not intended; configuration-sensitive | No |
| Third party controls payment rail | Escrow.com | Stripe | Buyer/seller chosen provider |
| Automatic 5% collection | Likely via broker commission | Possible via application fee | No; separate collection |
| 5% tied to completed sale | Strong fit | Must be designed | Must be designed |
| Buyer protection | Strongest structured path | Card/dispute protection, not equivalent to escrow | Lowest / trust-based |
| Seller choice | Moderate | High | Highest |
| Private-seller usability | Good if willing to use escrow | Potentially good with onboarding | High if eligible |
| Chargeback risk | Very low on broker wire rail | Material and configuration-sensitive | Depends on chosen direct method |
| FWT fee reversal complexity | Moderate | High | High |
| Provider approval dependency | Yes | Yes — blocking | Lower provider dependency, higher legal/policy burden |
| Legal review required | Yes | Yes | Yes |
| Ready to build | No | No | No |

---

# The 5% Promise — Rail Test

## Rail 1

Potentially preserves:

> **5% flat seller fee on completed sale**

Escrow fee remains a separately attributable third-party cost. Allocation is a business choice.

**Current confidence:** High enough to investigate aggressively.

## Rail 2

Potentially preserves:

> **5% FairWatchTrade seller fee + actual processor economics on a seller-enabled card rail**

But only if:

- processor costs are not marked up by FWT;
- application-fee behavior is explicit;
- refund/dispute rules are transparent;
- Stripe approves the business model.

**Current confidence:** Promising but materially risk-sensitive.

## Rail 3

Potentially preserves:

> **5% seller success fee, collected separately from the purchase funds**

This may be closest to the original P2P spirit, but it is also the rail most dependent on:

- transaction truth;
- seller honesty;
- account enforcement;
- contract terms;
- dispute policy.

**Current confidence:** Philosophically strong; operationally unresolved.

---

# Fee Event Model — Required Before Any Ledger Schema

Do not build `seller_ledger` until the fee lifecycle is defined.

At minimum distinguish:

1. **Sale proposed**
2. **Sale agreed**
3. **Sale funded**
4. **Watch shipped**
5. **Watch delivered**
6. **Inspection active**
7. **Sale completed**
8. **FWT fee earned**
9. **FWT fee assessed**
10. **FWT fee invoiced**
11. **FWT fee collected**
12. **FWT fee reversed**
13. **FWT fee adjusted**
14. **Transaction disputed**
15. **Transaction closed**

These are not one mutable status.

Future ledger design should strongly consider immutable financial events rather than one row repeatedly changing state.

---

# Decisions Jason Must Eventually Make

Not all are required today.

1. Which rail or rails should launch first?
2. Is Rail 3 launch scope or Phase 2?
3. Who pays Escrow.com fees under Rail 1?
4. Does seller silence during inspection count as anything? Does buyer silence count as acceptance?
5. What exactly earns the 5%?
6. Is the fee refundable after a later reversal?
7. Does seller enable/disable card acceptance?
8. Can any seller use Direct Settlement?
9. What proof establishes a direct sale?
10. What is intentional circumvention?
11. What seller enforcement is proportionate?
12. What appeals process exists?

---

# Blocking Validation Work

## Escrow.com — Provider Reality Check

- Confirm FWT category approval.
- Confirm marketplace/partner onboarding path.
- Confirm exact 5% broker-fee configuration.
- Confirm seller-paid commission deduction mechanics.
- Confirm fee behavior on cancellation/rejection.
- Confirm partner/API pricing.
- Confirm failure and reversal states.
- Confirm branding / white-label limitations.

## Stripe — Provider Reality Check

- Confirm high-value watch marketplace eligibility.
- Confirm appropriate Connect model.
- Confirm merchant-of-record structure.
- Confirm negative-balance responsibility.
- Confirm chargeback allocation.
- Confirm application-fee refund mechanics.
- Confirm actual Connect pricing.
- Confirm private-seller onboarding.
- Confirm payout timing and reserve behavior.

## Counsel — Legal Reality Check

- Florida and federal implications for each rail.
- FWT broker role.
- Direct-settlement success-fee enforceability.
- Stored-payment / ACH collection for Rail 3.
- Terms of service.
- Dispute policy.
- Privilege suspension and circumvention enforcement.
- Estate/private-seller onboarding concerns.

---

# GPT Ruling

1. **Rail 1 is the strongest currently documented operational path.**
2. **Rail 2 is not rejected, but provider approval and charge-type risk are blocking.**
3. **Rail 3 is a serious architecture, not a fringe workaround; it may best preserve the original peer-to-peer mission.**
4. **No rail is approved for implementation.**
5. **No Seller Ledger schema is approved.**
6. **No invented 7-day/30-day privilege policy is approved.**
7. **The next work is provider and legal validation, not checkout code.**

---

# Primary Sources Reviewed

## Escrow.com

- API overview: https://www.escrow.com/api
- Broker flow: https://www.escrow.com/what-is-escrow/how-it-works-broker
- Broker payment methods: https://www.escrow.com/support/faqs/what-payment-methods-are-available-for-broker-transactions
- Create transaction / broker fees: https://www.escrow.com/api/docs/create-transaction
- API reference / percentage broker fees: https://www.escrow.com/api/docs/reference
- Escrow fee responsibility on cancellation/rejection: https://www.escrow.com/support/faqs/who-is-responsible-for-paying-escrow-fees-to-escrowcom
- Who pays broker commission: https://www.escrow.com/support/faqs/who-pays-the-broker-commission
- Terms of use / broker obligations: https://www.escrow.com/escrow-101/terms-of-use
- Partner benefits: https://www.escrow.com/partners/benefits
- WooCommerce broker commission example: https://www.escrow.com/plugins/woocommerce

## Stripe

- Connect charge types: https://docs.stripe.com/connect/charges
- Direct charges: https://docs.stripe.com/connect/direct-charges
- Destination charges: https://docs.stripe.com/connect/destination-charges
- Recommended Connect integrations: https://docs.stripe.com/connect/integration-recommendations
- Disputes on Connect platforms: https://docs.stripe.com/connect/disputes
- Restricted businesses: https://stripe.com/legal/restricted-businesses

---

## Final Status

**Research architecture owned by GPT with NewFavDuck research support.**  
**Not approved for Ducky 7 implementation.**  
**Next milestone: provider reality checks + counsel validation.**
