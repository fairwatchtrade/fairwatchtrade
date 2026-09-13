import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  DEAL_STATUSES,
  LEG_STATUSES,
  TRADE_STATUSES,
  type DealStatus,
  type LegStatus,
  type TradeStatus,
} from "@/lib/trade";
import {
  BUDGET_FIT_LABELS,
  WANTED_STATUSES,
  type BudgetFit,
  type WantedStatus,
} from "@/lib/wanted";
import { TradeStateBadge, WantedStateBadge } from "@/components/TradeWantedStateBadge";
import {
  TRADE_CASH_PRESENTATION,
  WANTED_BUDGET_FIT_PRESENTATION,
  tradeStatePresentation,
  wantedStatePresentation,
} from "@/lib/tradeWantedStatePresentation";

/* Founder-only deterministic review surface. There is no loader, action,
   client state, API request, database read after authentication, or mutation.
   Every badge below is the same component mounted by ordinary-user product
   surfaces. */

const ADMIN_EMAIL = "jmynatt74@gmail.com";

export const metadata: Metadata = {
  title: "LS-2 Trade + Wanted State Gallery",
  robots: { index: false, follow: false, nocache: true },
};

const budgetFixtures: ReadonlyArray<{ fit: BudgetFit | null; label: string }> = [
  ...(["within", "near", "outside"] as const).map((fit) => ({
    fit,
    label: BUDGET_FIT_LABELS[fit],
  })),
  { fit: null, label: "No comparable listing" },
];

function FixtureCard({ children }: { children: React.ReactNode }) {
  return (
    <article className="min-w-0 border border-[var(--border-subtle)] bg-[var(--ink)] p-4">
      {children}
    </article>
  );
}

function TradeMatrix({ kind }: { kind: "offer" | "deal" | "leg" }) {
  const statuses = kind === "offer" ? TRADE_STATUSES : kind === "deal" ? DEAL_STATUSES : LEG_STATUSES;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {statuses.map((status) => {
        const input =
          kind === "offer"
            ? ({ kind, status: status as TradeStatus } as const)
            : kind === "deal"
              ? ({ kind, status: status as DealStatus } as const)
              : ({ kind, status: status as LegStatus } as const);
        const presentation = tradeStatePresentation(input);
        return (
          <FixtureCard key={`${kind}:${status}`}>
            {kind === "offer" ? (
              <TradeStateBadge kind="offer" status={status as TradeStatus} />
            ) : kind === "deal" ? (
              <TradeStateBadge kind="deal" status={status as DealStatus} />
            ) : (
              <TradeStateBadge kind="leg" status={status as LegStatus} />
            )}
            <p className="mt-3 text-[12px] text-[var(--platinum-dim)]">
              {kind} · {presentation.meaning.replace(/-/g, " ")}
            </p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              {presentation.governance === "settled"
                ? "Governed product meaning"
                : "Defined vocabulary · semantic tone stopped"}
            </p>
          </FixtureCard>
        );
      })}
    </div>
  );
}

export default async function TradeWantedStateGalleryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* Local development may render deterministic fixtures without an account;
     every deployed environment keeps the established founder-email gate. */
  const localDevelopment = process.env.NODE_ENV === "development";
  if (!localDevelopment && (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase())) {
    redirect("/");
  }

  return (
    <main
      className="min-h-screen bg-[var(--ink)] px-4 py-8 text-[var(--platinum)] sm:px-8"
      data-fixture-gallery="ls2-trade-wanted"
    >
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-[var(--border-gold)] pb-6">
          <div className="fw-lifecycle-label uppercase text-[var(--gold-dim)]">
            Internal fixture · read only
          </div>
          <h1 className="mt-2 font-display text-[30px] font-light sm:text-[38px]">
            Trade + Wanted state gallery
          </h1>
          <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-[var(--platinum-dim)]">
            Deterministic presentation fixtures only. No marketplace record is read or written.
            Every state marker below is the same bounded component used by the live product. The
            deployed route is founder-gated; local development contains no production facts.
          </p>
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-[var(--muted)]">
            This page follows your current appearance. Use{" "}
            <Link className="underline underline-offset-2 hover:text-[var(--platinum)]" href="/account/settings">
              Account Settings
            </Link>{" "}
            to inspect Light and Dark, and this same URL on the physical XCover for narrow proof.
          </p>
        </header>

        <section className="mt-8" aria-labelledby="trade-offer-fixtures">
          <h2 id="trade-offer-fixtures" className="font-display text-[23px] font-light">
            Trade offers
          </h2>
          <p className="mb-4 mt-1 text-[12px] text-[var(--muted)]">
            Proposal truth. Acceptance is a committed agreement, not a completed exchange.
          </p>
          <TradeMatrix kind="offer" />
        </section>

        <section className="mt-10" aria-labelledby="trade-deal-fixtures">
          <h2 id="trade-deal-fixtures" className="font-display text-[23px] font-light">
            Trade deals
          </h2>
          <p className="mb-4 mt-1 text-[12px] text-[var(--muted)]">
            Whole-agreement truth. This owner, not a leg, governs completion and archive eligibility.
          </p>
          <TradeMatrix kind="deal" />
        </section>

        <section className="mt-10" aria-labelledby="trade-leg-fixtures">
          <h2 id="trade-leg-fixtures" className="font-display text-[23px] font-light">
            Trade legs
          </h2>
          <p className="mb-4 mt-1 text-[12px] text-[var(--muted)]">
            Per-watch progress, deliberately subordinate to whole-deal truth.
          </p>
          <TradeMatrix kind="leg" />
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-2" aria-label="Trade factual and archive fixtures">
          <FixtureCard>
            <div className="fw-lifecycle-label uppercase text-[var(--muted)]">Cash adjustment</div>
            <div
              className="mt-2 font-display text-[18px] font-light"
              style={{ color: TRADE_CASH_PRESENTATION.text }}
              data-trade-cash="factual"
            >
              You add US$1,500
            </div>
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              Factual consideration · neither positive nor adverse.
            </p>
          </FixtureCard>
          <FixtureCard>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 text-[11px] text-[var(--muted)]">Active view</div>
                <TradeStateBadge kind="deal" status="completed" />
              </div>
              <div>
                <div className="mb-2 text-[11px] text-[var(--muted)]">Archived view</div>
                <TradeStateBadge kind="deal" status="completed" />
              </div>
            </div>
            <p className="mt-3 text-[11px] text-[var(--muted)]">
              Filing changes one collector&apos;s view, never the deal state or its tone.
            </p>
          </FixtureCard>
        </section>

        <section className="mt-10" aria-labelledby="wanted-fixtures">
          <h2 id="wanted-fixtures" className="font-display text-[23px] font-light">
            Wanted lifecycle
          </h2>
          <p className="mb-4 mt-1 text-[12px] text-[var(--muted)]">
            The exact five-state vocabulary emitted by the collector workspace at current HEAD.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {WANTED_STATUSES.map((status) => {
              const presentation = wantedStatePresentation(status);
              return (
                <FixtureCard key={status}>
                  <WantedStateBadge status={status} />
                  <p className="mt-3 text-[12px] text-[var(--platinum-dim)]">
                    {presentation.meaning.replace(/-/g, " ")}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    Governed collector lifecycle
                  </p>
                </FixtureCard>
              );
            })}
          </div>
        </section>

        <section className="mt-10" aria-labelledby="wanted-parity-fixtures">
          <h2 id="wanted-parity-fixtures" className="font-display text-[23px] font-light">
            Buyer / seller shared-truth reference
          </h2>
          <p className="mb-4 mt-1 max-w-3xl text-[12px] leading-relaxed text-[var(--muted)]">
            Sellers receive only open request rows. Their current product queue does not emit a
            lifecycle badge, so this is a parity reference without adding new seller-facing copy.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {(["active", "answered"] as readonly WantedStatus[]).map((status) => (
              <FixtureCard key={`parity:${status}`}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="mb-2 text-[11px] text-[var(--muted)]">Buyer lifecycle</div>
                    <WantedStateBadge status={status} />
                  </div>
                  <div>
                    <div className="mb-2 text-[11px] text-[var(--muted)]">Seller projection reference</div>
                    <WantedStateBadge status={status} />
                  </div>
                </div>
              </FixtureCard>
            ))}
          </div>
        </section>

        <section className="mt-10" aria-labelledby="budget-fixtures">
          <h2 id="budget-fixtures" className="font-display text-[23px] font-light">
            Budget-fit privacy projection
          </h2>
          <p className="mb-4 mt-1 max-w-3xl text-[12px] leading-relaxed text-[var(--muted)]">
            All coarse outcomes deliberately share one advisory treatment. None becomes green,
            red, good, or bad.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {budgetFixtures.map(({ fit, label }) => (
              <FixtureCard key={fit ?? "none"}>
                <div
                  className="fw-validity-state uppercase"
                  style={{ color: WANTED_BUDGET_FIT_PRESENTATION.text }}
                  data-budget-fit={fit ?? "none"}
                >
                  {label}
                </div>
              </FixtureCard>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
