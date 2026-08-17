import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/* ────────────────────────────────────────────────────────────────────────
   ADMIN — Dealer Accelerator Review  (/admin/dealer-accelerator)

   The attention doorway the dealer path was missing. Dealer self-service is
   incomplete if a submitted imported draft only becomes visible to whoever
   remembers to go looking for it in the global listing explorer. A dealer who
   submits and hears nothing has no way to tell "under review" from "lost."

   ── This is a DOORWAY, not a second review system ─────────────────────────
   Nothing is adjudicated here. Every row's action opens the existing governed
   founder review at /admin/listings/[id], which remains the sole authority
   over approve / reject / clarify. If a decision control ever appears on this
   page, that is the mistake this comment exists to prevent.

   ── What makes a row appear ───────────────────────────────────────────────
   status = 'pending_review' AND the listing carries dealer_import provenance
   in listing_media — the same unforgeable marker every other imported-listing
   surface uses. Ordinary seller submissions are deliberately absent: they have
   their own review path and this page is about the imported chain.

   Route protection is the established hardcoded founder UID check, matching
   /admin exactly. Reads go through the trusted client because
   listings_select_public_or_own is the canonical PUBLIC predicate and must
   never be widened to grant a founder exception.
   ──────────────────────────────────────────────────────────────────────── */

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

export const dynamic = "force-dynamic";

type PendingRow = {
  id: string;
  brand: string | null;
  model: string | null;
  reference: string | null;
  public_code: string | null;
  seller_id: string;
  dealer_attested_at: string | null;
  dealer_attested_acts: unknown;
};

function submittedAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function DealerAcceleratorReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== ADMIN_USER_ID) {
    redirect("/");
  }

  const db = createServiceClient();

  const { data: pendingRaw } = await db
    .from("listings")
    .select("id,brand,model,reference,public_code,seller_id,dealer_attested_at,dealer_attested_acts")
    .eq("status", "pending_review")
    // Oldest first: the thing that has waited longest is the thing that needs
    // attention most, which is the only ordering this page could justify.
    .order("dealer_attested_at", { ascending: true, nullsFirst: true });

  const pending = (pendingRaw ?? []) as PendingRow[];

  /* Imported identity comes from provenance, never from a flag on the
     listing. Two-step rather than a join so one listing appears exactly once
     by construction. */
  let imported: PendingRow[] = [];
  if (pending.length > 0) {
    const { data: mediaRows } = await db
      .from("listing_media")
      .select("listing_id")
      .eq("capture_source", "dealer_import")
      .in(
        "listing_id",
        pending.map((p) => p.id)
      );
    const importedIds = new Set(
      ((mediaRows ?? []) as Array<{ listing_id: string }>).map((m) => m.listing_id)
    );
    imported = pending.filter((p) => importedIds.has(p.id));
  }

  // Dealer identity for the rows we are actually showing.
  const dealerNames = new Map<string, string>();
  if (imported.length > 0) {
    const sellerIds = Array.from(new Set(imported.map((r) => r.seller_id)));
    const { data: profiles } = await db
      .from("dealer_profiles")
      .select("seller_id,business_name")
      .in("seller_id", sellerIds);
    for (const p of (profiles ?? []) as Array<{ seller_id: string; business_name: string | null }>) {
      if (p.business_name) dealerNames.set(p.seller_id, p.business_name);
    }
  }

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--gold)]">
        Admin / Dealer Accelerator
      </div>
      <h1 className="mt-2 font-display text-[32px] font-light leading-[1.1] text-[var(--platinum)]">
        Dealer Accelerator Review
      </h1>
      <p className="mt-3 max-w-[70ch] text-[13px] leading-[1.65] text-[var(--muted)]">
        Imported drafts a dealer has submitted and confirmed, waiting for
        FairWatchTrade judgment. Each one opens the ordinary governed review —
        this page is the doorway, not a second place decisions get made.
      </p>

      {imported.length === 0 ? (
        <div className="mt-8 border border-[var(--border-subtle)] bg-[var(--surface-2)] p-6">
          <p className="text-[14px] text-[var(--platinum)]">
            Nothing is waiting for review.
          </p>
          <p className="mt-1.5 text-[12px] leading-[1.6] text-[var(--muted)]">
            Imported drafts appear here the moment a dealer submits one. An
            empty list means no dealer is waiting on you, not that submissions
            are being missed.
          </p>
        </div>
      ) : (
        <div className="mt-8 border border-[var(--border-mid)]">
          <div className="hidden border-b border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-3 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] md:grid md:grid-cols-[1.4fr_1fr_0.7fr_0.6fr]">
            <div>Dealer / watch</div>
            <div>Reference</div>
            <div>Submitted</div>
            <div className="text-right">Action</div>
          </div>

          <ul>
            {imported.map((r) => {
              const dealer = dealerNames.get(r.seller_id) ?? "Dealer";
              const watch = [r.brand, r.model].filter(Boolean).join(" ") || "Untitled watch";
              const acts = Array.isArray(r.dealer_attested_acts)
                ? (r.dealer_attested_acts as string[]).length
                : null;
              return (
                <li
                  key={r.id}
                  className="border-b border-[var(--border-subtle)] px-4 py-4 last:border-b-0 md:grid md:grid-cols-[1.4fr_1fr_0.7fr_0.6fr] md:items-center md:gap-4"
                >
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--gold-subtle)]">
                      {dealer}
                    </div>
                    <div className="mt-1 text-[14px] text-[var(--platinum)]">{watch}</div>
                    {r.public_code && (
                      <div className="mt-0.5 font-mono text-[12px] text-[var(--muted)]">
                        {r.public_code}
                      </div>
                    )}
                  </div>

                  <div className="mt-2 font-mono text-[12px] text-[var(--platinum-dim)] md:mt-0">
                    {r.reference || "—"}
                  </div>

                  <div className="mt-2 text-[12px] text-[var(--muted)] md:mt-0">
                    {submittedAgo(r.dealer_attested_at)}
                    {/* The dealer's own confirmations, as recorded on the row.
                        Shown because a submission with no recorded acts predates
                        server-enforced attestation and is worth noticing. */}
                    <div className="mt-0.5">
                      {acts === null ? "no recorded confirmations" : `${acts} confirmed`}
                    </div>
                  </div>

                  <div className="mt-3 md:mt-0 md:text-right">
                    <Link
                      href={`/admin/listings/${r.id}`}
                      className="inline-flex min-h-[40px] items-center justify-center border border-[var(--gold)] bg-[var(--cta-fill)] px-4 py-2 text-[12px] font-semibold text-[var(--on-cta)] transition-opacity hover:opacity-90"
                    >
                      Open Review
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-8">
        <Link
          href="/admin"
          className="text-[12px] font-semibold text-[var(--platinum)] underline decoration-[var(--border-mid)] underline-offset-4 hover:decoration-[var(--gold)]"
        >
          Back to Admin
        </Link>
      </div>
    </main>
  );
}
