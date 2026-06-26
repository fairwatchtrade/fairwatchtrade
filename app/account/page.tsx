import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/* ────────────────────────────────────────────────────────────────────────
   MY LISTINGS — /account  (v1.40)

   Seller-facing dashboard of the signed-in user's own listings. Server
   Component: reads the user from the SSR Supabase client, redirects to /sell
   (the login entry point for now) if unauthenticated, then lists their rows
   newest-first.

   Owner link: listings.seller_id (uuid → auth.users).

   PRIVACY: scoring fields (significance_score, score_state, combined_score)
   are NEVER selected or rendered — the query pulls only buyer-safe columns
   plus status. The curation/evaluate route is untouched (PFC274 = 62).
   ──────────────────────────────────────────────────────────────────────── */

type AccountListing = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  condition: string;
  asking_price: number;
  status: string;
  created_at: string;
};

// Status badge styling. `published` = gold, `pending` = muted, `rejected` = red.
const STATUS_STYLES: Record<string, string> = {
  published: "border-[#C9A84C] text-[#C9A84C]",
  pending: "border-white/15 text-[#8A8F9E]",
  rejected: "border-[#D4544C]/50 text-[#D4544C]",
};

const STATUS_LABELS: Record<string, string> = {
  published: "Published",
  pending: "Pending",
  rejected: "Rejected",
};

const CTA_CLASS =
  "inline-flex items-center justify-center rounded-md bg-[#C9A84C] px-4 py-2 text-sm font-medium text-[#0D0F14] transition hover:bg-[#C9A84C]/90";

export default async function AccountPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sell");
  }

  const { data, error } = await supabase
    .from("listings")
    .select("id, brand, model, reference, condition, asking_price, status, created_at")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  const listings = (!error && Array.isArray(data) ? data : []) as AccountListing[];

  return (
    <main className="min-h-screen bg-[#0D0F14] text-[#E8E4DC]">
      <div className="mx-auto w-full max-w-3xl px-6 py-8 sm:px-8">
        <h1 className="text-2xl font-light text-[#E8E4DC]">My Listings</h1>

        {listings.length === 0 ? (
          <div className="mt-12 rounded-xl border border-white/10 px-4 py-12 text-center">
            <p className="text-[14px] text-[#B7BAC4]">
              No listings yet. Create your first one.
            </p>
            <div className="mt-5">
              <Link href="/sell" className={CTA_CLASS}>
                Create New Listing
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4">
              <Link href="/sell" className={CTA_CLASS}>
                Create New Listing
              </Link>
            </div>

            <div className="mt-8 space-y-3">
              {listings.map((row) => {
                const title = row.model ? `${row.brand} ${row.model}` : row.brand;
                const meta = [
                  row.reference ? `Ref. ${row.reference}` : "",
                  row.condition,
                ]
                  .filter(Boolean)
                  .join(" · ");
                const price = `$${Number(row.asking_price).toLocaleString("en-US")}`;
                const badgeClass =
                  STATUS_STYLES[row.status] ?? "border-white/15 text-[#8A8F9E]";
                const badgeLabel = STATUS_LABELS[row.status] ?? row.status;

                const card = (
                  <div className="flex items-start justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-medium text-[#E8E4DC]">
                        {title}
                      </div>
                      {meta && (
                        <div className="mt-1 text-[12px] text-[#B7BAC4]">{meta}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-[15px] font-semibold text-[#C9A84C]">
                        {price}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badgeClass}`}
                      >
                        {badgeLabel}
                      </span>
                    </div>
                  </div>
                );

                // Only published listings have a live public detail page.
                return row.status === "published" ? (
                  <Link
                    key={row.id}
                    href={`/listings/${row.id}`}
                    className="block rounded-xl border border-white/10 transition hover:border-[#C9A84C]/40"
                  >
                    {card}
                  </Link>
                ) : (
                  <div
                    key={row.id}
                    className="rounded-xl border border-white/10"
                  >
                    {card}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
