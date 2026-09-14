"use client";

import { useEffect, useRef } from "react";
import ListingActionRail from "@/components/ListingActionRail";
import MarketplaceControl, { type McPrefs } from "@/components/MarketplaceControl";
import type { McPayload, McRow } from "@/lib/marketplaceControlData";

const ROW_COUNT = 32;

function fixtureRow(index: number): McRow {
  const suffix = String(index + 1).padStart(2, "0");
  return {
    id: `ls5-marketplace-${suffix}`,
    public_code: `G${String(51000 + index)}`,
    brand: index % 2 === 0 ? "Parmigiani Fleurier" : "Rolex",
    model: `Responsive fixture ${suffix}`,
    reference: `LS5-${suffix}`,
    condition: "Very Good",
    year: "2026",
    status: "published",
    asking_price: 12000 + index * 250,
    asking_currency: "USD",
    created_at: `2026-09-13T${String(index % 23).padStart(2, "0")}:00:00.000Z`,
    updated_at: null,
    seller_id: "ls5-seller",
    seller_name: "Fixture Seller",
    completeness_score: 100,
    significance_score: null,
    description_passed_ai: true,
    custom_brand_flag: false,
    in_hand_verified: true,
    dealer_attested_at: null,
    integrity_hold_reason: null,
    rejection_reason: null,
    removed_at: null,
    removal_reason_code: null,
    private_buyer_id: null,
    thumb: null,
  };
}

const rows = Array.from({ length: ROW_COUNT }, (_, index) => fixtureRow(index));
const initial: McPayload = {
  rows,
  total: rows.length,
  page: 1,
  per: 25,
  counts: {
    byStatus: { published: rows.length },
    current: rows.length,
    offmarket: 0,
    history: 0,
    all: rows.length,
    attention: 0,
  },
  attention: {},
  sellers: [{ id: "ls5-seller", name: "Fixture Seller" }],
  exact: null,
  noExactMatch: false,
};

const prefs: McPrefs = {};
const purchaseStates = [
  { key: "open", requestStatus: null, listingStatus: "published", bagHref: null },
  { key: "pending", requestStatus: "pending", listingStatus: "published", bagHref: null },
  {
    key: "accepted-reserved",
    requestStatus: "accepted",
    listingStatus: "reserved",
    bagHref: "/catalogue#shopping-bag",
  },
] as const;

/* Local deterministic state only. The components below are the real product
   presentation/state owners; this fixture supplies data and containing width,
   never a second implementation of their decisions or interactions. */
export default function Ls5ResponsiveActionGeographyFixture() {
  const fixtureRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fixtureRef.current?.setAttribute("data-fixture-hydrated", "true");
  }, []);

  return (
    <main
      ref={fixtureRef}
      data-fixture-gallery="ls5-responsive-action-geography"
      data-fixture-hydrated="false"
      className="min-h-screen bg-[var(--ink)] px-4 py-8 text-[var(--platinum)]"
    >
      <h1 className="font-display text-[28px]">LS-5 responsive proof equipment</h1>

      <div
        data-ls5-marketplace-shell=""
        className="mt-8 box-border max-w-full"
        style={{ width: "1049px" }}
      >
        <MarketplaceControl initial={initial} initialPrefs={prefs} initialPer={25} />
      </div>

      <section data-ls5-purchase-state-matrix="" className="mt-12 border-t border-[var(--border-mid)] pt-8">
        <h2 className="font-display text-[24px]">Shared purchase-action state owner</h2>
        {purchaseStates.map((state) => (
          <div
            key={state.key}
            data-ls5-action-state={state.key}
            className="mt-6 grid gap-4 border border-[var(--border-subtle)] p-4 min-[56rem]:grid-cols-3"
          >
            {(["inline", "rail", "bar"] as const).map((variant) => (
              <div
                key={variant}
                data-ls5-action-dressing={variant}
                className="min-w-0 border border-[var(--border-faint)] p-3"
              >
                <div className="mb-2 text-[11px] uppercase tracking-[1.5px] text-[var(--muted)]">
                  {variant}
                </div>
                <ListingActionRail
                  variant={variant}
                  listingId={`ls5-${state.key}`}
                  sellerId="ls5-seller"
                  sellerName="Fixture Seller"
                  priceText="US$12,000"
                  isOwner={false}
                  requestStatus={state.requestStatus}
                  listingStatus={state.listingStatus}
                  canRequestInline={false}
                  bagHref={state.bagHref}
                />
              </div>
            ))}
          </div>
        ))}
      </section>
    </main>
  );
}
