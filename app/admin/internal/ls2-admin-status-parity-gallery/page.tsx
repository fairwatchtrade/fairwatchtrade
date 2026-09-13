import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import AdminListingStatusMarker from "@/components/AdminListingStatusMarker";
import AdminPurchaseRequestStatus from "@/components/AdminPurchaseRequestStatus";
import { LIFECYCLE_STATUSES, adminLabel, statusTokenKey } from "@/lib/listingStatus";
import {
  PURCHASE_REQUEST_CLOSURE_CAUSES,
  PURCHASE_REQUEST_LIFECYCLE_STATUSES,
} from "@/lib/purchaseRequestPresentation";
import { createClient } from "@/lib/supabase/server";

const ADMIN_EMAIL = "jmynatt74@gmail.com";

export const metadata: Metadata = {
  title: "LS-2 Admin Status Parity Gallery",
  robots: { index: false, follow: false, nocache: true },
};

const listingFixtures = [...LIFECYCLE_STATUSES, "unknown_state"] as const;
const requestFixtures = [
  ...PURCHASE_REQUEST_LIFECYCLE_STATUSES.filter((status) => status !== "cancelled").map(
    (status) => ({ status, closureCause: null }),
  ),
  ...PURCHASE_REQUEST_CLOSURE_CAUSES.map((closureCause) => ({
    status: "cancelled" as const,
    closureCause,
  })),
  { status: "cancelled" as const, closureCause: null },
  { status: "unknown_state" as const, closureCause: null },
] as const;

export default async function AdminStatusParityGalleryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* Deterministic local review follows the established LS-2 gallery seam;
     every deployed environment enforces founder identity at this route. */
  const localDevelopment = process.env.NODE_ENV === "development";
  if (!localDevelopment && (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase())) {
    redirect("/");
  }

  return (
    <main
      className="min-h-screen bg-[var(--ink)] px-4 py-8 text-[var(--platinum)] sm:px-8"
      data-fixture-gallery="ls2-admin-status-parity"
    >
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-[var(--border-gold)] pb-6">
          <div className="fw-lifecycle-label uppercase text-[var(--gold-dim)]">
            Internal founder fixture · read only
          </div>
          <h1 className="mt-2 font-display text-[30px] font-light sm:text-[38px]">
            Seller / Admin status parity
          </h1>
          <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-[var(--platinum-dim)]">
            IN-MEMORY FIXTURES ONLY. The gallery inherits Admin&apos;s permanent-dark route scope,
            reads no listing or Purchase Request rows, and uses the exact presentation owners mounted
            by Founder Review.
          </p>
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-[var(--muted)]">
            Change the surrounding preference in{" "}
            <Link className="underline underline-offset-2 hover:text-[var(--platinum)]" href="/account/settings">
              Account Settings
            </Link>{" "}
            and return: Admin remains the same dark operational product in either case.
          </p>
        </header>

        <section className="mt-8" aria-labelledby="listing-lifecycle-matrix">
          <h2 id="listing-lifecycle-matrix" className="font-display text-[23px] font-light">
            Listing lifecycle
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {listingFixtures.map((status) => (
              <article key={status} className="min-w-0 border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
                <AdminListingStatusMarker status={status} />
                <dl className="mt-3 space-y-1 text-[11px] text-[var(--muted)]">
                  <div><dt className="inline">Stored value:</dt> <dd className="inline text-[var(--platinum-dim)]">{status}</dd></div>
                  <div><dt className="inline">Admin label:</dt> <dd className="inline text-[var(--platinum-dim)]">{adminLabel(status)}</dd></div>
                  <div><dt className="inline">Token key:</dt> <dd className="inline text-[var(--platinum-dim)]">{statusTokenKey(status)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10" aria-labelledby="purchase-request-matrix">
          <h2 id="purchase-request-matrix" className="font-display text-[23px] font-light">
            Purchase Request lifecycle
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {requestFixtures.map(({ status, closureCause }) => (
              <article
                key={`${status}:${closureCause ?? "none"}`}
                className="min-w-0 border border-[var(--border-subtle)] bg-[var(--surface)] p-4"
              >
                <AdminPurchaseRequestStatus status={status} closureCause={closureCause} />
                <p className="mt-3 text-[11px] text-[var(--muted)]">
                  {closureCause ?? (status === "expired" ? "GOVERNANCE-PENDING · neutral" : "No closure cause")}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10" aria-labelledby="native-control-proof">
          <h2 id="native-control-proof" className="font-display text-[23px] font-light">
            Native control inheritance
          </h2>
          <div className="mt-4 grid max-w-3xl gap-3 sm:grid-cols-2">
            <select
              aria-label="Fixture listing status"
              data-admin-native-control="select"
              defaultValue="pending_review"
              className="border border-[var(--border-mid)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--platinum)]"
            >
              <option value="pending_review">Pending Review</option>
              <option value="published">Published</option>
            </select>
            <textarea
              aria-label="Fixture seller message"
              data-admin-native-control="textarea"
              defaultValue="Permanent-dark Admin control proof."
              readOnly
              className="min-h-20 resize-y border border-[var(--border-mid)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--platinum)]"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
