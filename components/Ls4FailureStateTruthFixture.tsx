"use client";

import { useEffect, useRef } from "react";
import InlinePurchaseRequest from "@/components/InlinePurchaseRequest";
import ListingPurchaseRequestProvider from "@/components/ListingPurchaseRequestProvider";
import NotificationsBell from "@/components/NotificationsBell";
import PurchaseRequestForm from "@/components/PurchaseRequestForm";

const fullListing = {
  id: "ls4-full-purchase-request",
  brand: "FairWatchTrade",
  model: "Failure truth fixture",
  reference: "LS4-FULL",
  askingPrice: 8500,
  askingCurrency: "USD",
  heroUrl: null,
  sellerName: "Fixture seller",
  condition: "Very Good",
  included: "Watch and papers",
  strap: "Leather strap",
};

/* Local proof equipment only. The parent route redirects in every production
   build; browser interception supplies every response before these real
   presentation/state owners can reach an application API. */
export default function Ls4FailureStateTruthFixture() {
  const fixtureRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fixtureRef.current?.setAttribute("data-fixture-hydrated", "true");
  }, []);

  return (
    <div
      ref={fixtureRef}
      data-fixture-gallery="ls4-failure-state-truth"
      data-fixture-hydrated="false"
    >
      <section data-ls4-purchase-owner="full">
        <PurchaseRequestForm listing={fullListing} />
      </section>

      <section
        className="border-y border-[var(--border-subtle)] bg-[var(--ink)] px-4 py-10 text-[var(--platinum)]"
        data-ls4-purchase-owner="inline"
      >
        <div className="mx-auto max-w-xl">
          <div className="mb-4 fw-lifecycle-label uppercase text-[var(--gold)]">
            Inline Purchase Request truth fixture
          </div>
          <ListingPurchaseRequestProvider
            listingId="ls4-inline-purchase-request"
            askingPrice={8500}
            askingCurrency="USD"
          >
            <InlinePurchaseRequest
              listingId="ls4-inline-purchase-request"
              askingPrice={8500}
              askingCurrency="USD"
              variant="rail"
            />
          </ListingPurchaseRequestProvider>
        </div>
      </section>

      <section
        className="min-h-[320px] bg-[var(--ink)] px-4 py-10 text-[var(--platinum)]"
        data-ls4-notification-probe=""
      >
        <div className="mx-auto flex max-w-xl justify-end">
          <NotificationsBell initialUnreadCount={0} />
        </div>
      </section>
    </div>
  );
}
