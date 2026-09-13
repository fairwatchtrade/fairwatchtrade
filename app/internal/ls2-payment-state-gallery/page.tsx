import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AcceptedPurchaseStateMarker } from "@/components/AcceptedPurchaseStateMarker";
import {
  ACCEPTED_PURCHASE_FOCUSED_ROW_CLASS,
  ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES,
  PAYMENT_STATE_GALLERY_FIXTURES,
  acceptedPurchaseStatePresentation,
  buyerPurchasePrimaryStateInput,
  shoppingBagPrimaryStateInput,
  type AcceptedPurchaseStateInput,
} from "@/lib/payments/acceptedPurchaseStatePresentation";
import { createClient } from "@/lib/supabase/server";

/* Founder-only deterministic review surface. Apart from the route-level
   identity check, it has no loader, action, API request, database read,
   provider call or mutation. Every fixture is an in-memory axis-qualified
   object, and every state word uses the renderer shared by the real buyer
   surfaces. */

const ADMIN_EMAIL = "jmynatt74@gmail.com";

export const metadata: Metadata = {
  title: "LS-2 Accepted Purchase + Payment State Gallery",
  robots: { index: false, follow: false, nocache: true },
};

const lifecycleLabels = {
  pending: "Awaiting payment",
  confirming: "Confirming payment",
  requires_capture: "Authorized",
  succeeded: "Paid",
  failed: "Payment failed",
  canceled: "Payment canceled · retry available",
  expired: "Checkout expired · retry available",
  unresolved: "Payment state unavailable",
} as const;

const transactionLabels = {
  pending: "Pending",
  payment_pending: "Payment pending",
  paid: "Paid",
  shipped: "Shipped",
  delivered: "Delivered",
  under_inspection: "Under inspection",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
  refunded: "Refunded",
  unresolved: "Payment state unavailable",
} as const;

const refundLabels = {
  none: "No refund marker",
  partial: "Partially refunded",
  full: "Refunded",
} as const;

const disputeLabels = {
  none: "No dispute marker",
  open: "Disputed",
  won: "Dispute won",
  lost: "Dispute lost",
} as const;

const availabilityLabels = {
  read_unavailable: "Your purchases could not be loaded just now",
  payment_unavailable: "Accepted · payment unavailable",
} as const;

function labelFor(input: AcceptedPurchaseStateInput): string {
  switch (input.axis) {
    case "payment-lifecycle":
      if (input.state === "checkout_created") {
        if (input.context === "return-pending") return "Confirming payment";
        if (input.context === "cancel-returned") return "Payment not completed";
        return "Checkout open";
      }
      return lifecycleLabels[input.state];
    case "transaction":
      return transactionLabels[input.state];
    case "refund":
      return refundLabels[input.state];
    case "dispute":
      return disputeLabels[input.state];
    case "availability":
      return availabilityLabels[input.state];
  }
}

function fixtureKey(input: AcceptedPurchaseStateInput): string {
  return `${input.axis}:${input.state}${input.axis === "payment-lifecycle" && input.state === "checkout_created" ? `:${input.context}` : ""}`;
}

function governanceLabel(input: AcceptedPurchaseStateInput): string {
  const governance = acceptedPurchaseStatePresentation(input).governance;
  if (governance === "pending") return "GOVERNANCE-PENDING";
  if (governance === "out-of-surface") return "SOURCE BRANCH · NOT CURRENTLY USER-SEEN";
  return "GOVERNED";
}

function ProductSurface({
  input,
  focused = false,
}: {
  input: AcceptedPurchaseStateInput;
  focused?: boolean;
}) {
  return (
    <div className="min-w-0 bg-[var(--ink)]" data-payment-surface-base="ink">
      <div
        className={`px-3 py-2 ${ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES.primary} ${focused ? ACCEPTED_PURCHASE_FOCUSED_ROW_CLASS : ""}`}
        data-payment-surface={focused ? "focused-gold-whisper" : "ink"}
        data-payment-typography-context="primary"
      >
        <div className="mb-1 text-[10px] uppercase tracking-[1px] text-[var(--muted)]">
          {focused ? "Focused Bag / Purchases row" : "Ordinary Bag / Purchases row"}
        </div>
        <AcceptedPurchaseStateMarker
          input={input}
        >
          {labelFor(input)}
        </AcceptedPurchaseStateMarker>
      </div>
    </div>
  );
}

function FixtureCard({ input }: { input: AcceptedPurchaseStateInput }) {
  const presentation = acceptedPurchaseStatePresentation(input);
  return (
    <article
      className="min-w-0 border bg-[var(--surface)] p-3"
      style={{ borderColor: presentation.line }}
      data-payment-fixture={fixtureKey(input)}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <code className="break-all text-[11px] text-[var(--slate)]">{fixtureKey(input)}</code>
        <span
          className="text-[10px] uppercase tracking-[1px] text-[var(--platinum-dim)]"
          data-governance-label=""
        >
          {governanceLabel(input)}
        </span>
      </div>
      <div className="grid gap-2">
        <ProductSurface input={input} />
        <ProductSurface input={input} focused />
      </div>
      <p className="mt-2 text-[11px] text-[var(--muted)]">
        {presentation.meaning.replace(/-/g, " ")} · {input.axis.replace(/-/g, " ")}
      </p>
    </article>
  );
}

const composite: readonly AcceptedPurchaseStateInput[] = [
  { axis: "transaction", state: "paid" },
  { axis: "payment-lifecycle", state: "succeeded" },
  { axis: "refund", state: "partial" },
  { axis: "dispute", state: "open" },
];

const parityFixtures = [
  {
    key: "accepted-no-attempt",
    label: "Accepted · awaiting payment",
    bag: { memberState: "awaiting_payment", transactionStatus: "pending", paymentLifecycle: null, hasPayment: false, canPay: true, returned: null },
    buyer: { transactionStatus: "pending", paymentLifecycle: null, hasPayment: false, canPay: true, returned: null },
  },
  {
    key: "checkout-open",
    label: "Checkout open",
    bag: { memberState: "checkout_open", transactionStatus: "pending", paymentLifecycle: "checkout_created", hasPayment: true, canPay: true, returned: null },
    buyer: { transactionStatus: "pending", paymentLifecycle: "checkout_created", hasPayment: true, canPay: true, returned: null },
  },
  {
    key: "confirming",
    label: "Confirming payment",
    bag: { memberState: "confirming", transactionStatus: "pending", paymentLifecycle: "confirming", hasPayment: true, canPay: false, returned: null },
    buyer: { transactionStatus: "pending", paymentLifecycle: "confirming", hasPayment: true, canPay: false, returned: null },
  },
  ...(["failed", "canceled", "expired"] as const).map((paymentLifecycle) => ({
    key: paymentLifecycle,
    label: paymentLifecycle === "failed" ? "Payment failed" : paymentLifecycle === "canceled" ? "Payment canceled" : "Checkout expired",
    bag: { memberState: "retry" as const, transactionStatus: "pending", paymentLifecycle, hasPayment: true, canPay: true, returned: null },
    buyer: { transactionStatus: "pending", paymentLifecycle, hasPayment: true, canPay: true, returned: null },
  })),
  {
    key: "unknown-attempt",
    label: "Unknown attempt · neutral stop",
    bag: { memberState: "unruled", transactionStatus: "pending", paymentLifecycle: "future_provider_state", hasPayment: true, canPay: false, returned: null },
    buyer: { transactionStatus: "pending", paymentLifecycle: "future_provider_state", hasPayment: true, canPay: false, returned: null },
  },
  {
    key: "transaction-cancelled",
    label: "Transaction cancelled · distinct axis",
    bag: { memberState: "unruled", transactionStatus: "cancelled", paymentLifecycle: null, hasPayment: false, canPay: false, returned: null },
    buyer: { transactionStatus: "cancelled", paymentLifecycle: null, hasPayment: false, canPay: false, returned: null },
  },
] as const;

export default async function PaymentStateGalleryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* The deterministic local seam matches the shipped LS-2 gallery pattern;
     every deployed environment enforces the founder email at the route. */
  const localDevelopment = process.env.NODE_ENV === "development";
  if (!localDevelopment && (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase())) {
    redirect("/");
  }

  return (
    <main
      className="min-h-screen bg-[var(--ink)] px-4 py-8 text-[var(--platinum)] sm:px-8"
      data-fixture-gallery="ls2-payment-state"
    >
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-[var(--border-gold)] pb-6">
          <div className="fw-lifecycle-label uppercase text-[var(--gold-dim)]">
            Internal founder fixture · read only
          </div>
          <h1 className="mt-2 font-display text-[30px] font-light sm:text-[38px]">
            Accepted Purchase + Payment state gallery
          </h1>
          <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-[var(--platinum-dim)]">
            IN-MEMORY FIXTURES ONLY. No transaction, payment attempt, refund, dispute, or provider
            record is read or written. Each state keeps its authoritative axis and uses the same
            bounded presentation owner and marker as Shopping Bag and Your Purchases.
          </p>
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-[var(--muted)]">
            This page follows your current appearance. Use{" "}
            <Link className="underline underline-offset-2 hover:text-[var(--platinum)]" href="/account/settings">
              Account Settings
            </Link>{" "}
            for Light/Dark inspection, and this same URL on the physical XCover for narrow proof.
          </p>
        </header>

        <section className="mt-8" aria-labelledby="payment-state-matrix">
          <h2 id="payment-state-matrix" className="font-display text-[23px] font-light">
            Axis-qualified state matrix
          </h2>
          <p className="mb-4 mt-1 max-w-3xl text-[12px] leading-relaxed text-[var(--muted)]">
            Every card shows the ordinary ink plane and the focused-row gold wash. Neutral
            governance stops are visible here for review and never become buyer-facing policy copy.
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {PAYMENT_STATE_GALLERY_FIXTURES.map((input) => (
              <FixtureCard key={fixtureKey(input)} input={input} />
            ))}
          </div>
        </section>

        <section className="mt-10" aria-labelledby="independent-axis-composite">
          <h2 id="independent-axis-composite" className="font-display text-[23px] font-light">
            Independent truths can coexist
          </h2>
          <p className="mb-4 mt-1 max-w-3xl text-[12px] leading-relaxed text-[var(--muted)]">
            A captured purchase can also carry refund and dispute truth. Neither secondary axis
            erases capture, and similar words do not merge their state models.
          </p>
          <article
            className="grid gap-3 border border-[var(--border-subtle)] bg-[var(--surface)] p-4 sm:grid-cols-2 lg:grid-cols-4"
            data-payment-composite="captured-refund-dispute"
          >
            {composite.map((input) => (
              <ProductSurface key={`composite:${fixtureKey(input)}`} input={input} />
            ))}
          </article>
        </section>

        <section className="mt-10" aria-labelledby="live-emitter-parity">
          <h2 id="live-emitter-parity" className="font-display text-[23px] font-light">
            Shopping Bag + Your Purchases emitter parity
          </h2>
          <p className="mb-4 mt-1 max-w-3xl text-[12px] leading-relaxed text-[var(--muted)]">
            These pairs execute the same state-input projectors called by the two live buyer
            components. Copy and actions remain locally owned; matching truth resolves to the same
            axis-qualified semantic presentation.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {parityFixtures.map((fixture) => {
              const bagInput = shoppingBagPrimaryStateInput(fixture.bag);
              const buyerInput = buyerPurchasePrimaryStateInput(fixture.buyer);
              return (
                <article
                  key={fixture.key}
                  className="min-w-0 border border-[var(--border-subtle)] bg-[var(--surface)] p-3"
                  data-payment-parity={fixture.key}
                >
                  <div className="mb-2 text-[11px] text-[var(--slate)]">{fixture.label}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div data-payment-parity-source="shopping-bag">
                      <ProductSurface input={bagInput} />
                    </div>
                    <div data-payment-parity-source="buyer-purchases">
                      <ProductSurface input={buyerInput} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-10" aria-labelledby="inherited-typography">
          <h2 id="inherited-typography" className="font-display text-[23px] font-light">
            Inherited live typography contexts
          </h2>
          <p className="mb-4 mt-1 max-w-3xl text-[12px] leading-relaxed text-[var(--muted)]">
            The shared marker owns color only. These in-memory examples use the exact inherited
            type contexts from the two live buyer surfaces.
          </p>
          <div className="grid gap-2 bg-[var(--ink)] p-3 sm:grid-cols-2">
            <p className={ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES["availability-14"]} data-payment-surface="ink" data-payment-typography-context="availability-14">
              <AcceptedPurchaseStateMarker input={{ axis: "availability", state: "read_unavailable" }}>
                Shopping Bag could not be read
              </AcceptedPurchaseStateMarker>
            </p>
            <p className={ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES["availability-13-buyer"]} data-payment-surface="ink" data-payment-typography-context="availability-13-buyer">
              <AcceptedPurchaseStateMarker input={{ axis: "availability", state: "read_unavailable" }}>
                Purchases could not be loaded
              </AcceptedPurchaseStateMarker>
            </p>
            <div className={ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES["bag-chip"]} data-payment-surface="ink" data-payment-typography-context="bag-chip">
              <AcceptedPurchaseStateMarker input={{ axis: "refund", state: "partial" }}>
                Partially refunded
              </AcceptedPurchaseStateMarker>
            </div>
            <div className={ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES["buyer-chip"]} data-payment-surface="ink" data-payment-typography-context="buyer-chip">
              <AcceptedPurchaseStateMarker input={{ axis: "dispute", state: "open" }}>
                Disputed
              </AcceptedPurchaseStateMarker>
            </div>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="mixed-checkout-stop">
          <h2 id="mixed-checkout-stop" className="font-display text-[23px] font-light">
            Mixed product signals — stopped
          </h2>
          <article
            className="mt-4 border-l-2 border-[var(--gold)] bg-[var(--ink)] px-4 py-3"
            data-payment-mixed-stop="checkout-alert"
          >
            <div className="text-[10px] uppercase tracking-[1px] text-[var(--platinum-dim)]" data-governance-label="">
              GOVERNANCE-PENDING
            </div>
            <p className="mt-2 text-[13px] leading-[1.6] text-[var(--platinum)]">
              The current checkout alert slot combines authentication, eligibility, availability,
              progress, and provider failures. It keeps its existing neutral/gold treatment until
              those emitters are truthfully separated; this color flight does not guess.
            </p>
          </article>
          <article
            className="mt-3 border-l-2 border-[var(--gold)] bg-[var(--ink)] px-4 py-3"
            data-payment-mixed-stop="bag-departure"
          >
            <div className="text-[10px] uppercase tracking-[1px] text-[var(--platinum-dim)]" data-governance-label="">
              GOVERNANCE-PENDING
            </div>
            <p className="mt-2 text-[13px] leading-[1.6] text-[var(--platinum)]">
              Payment confirmed. That watch has left your Shopping Bag.
            </p>
            <p className="mt-1 text-[11px] leading-[1.6] text-[var(--muted)]">
              The live departure signal only proves that an ID left the Bag. It currently combines
              captured payment and a post-payment transaction transition, so this existing message
              and gold boundary remain stopped outside the shared state owner.
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}
