/* ────────────────────────────────────────────────────────────────────────
   ADMIN — /admin/vault-review  (cluster review tool, server component)

   Private single-admin tool. NOT linked from any public nav — direct URL only.
   Reviews Gemini-proposed clusters (cluster_staging) and writes approved values
   into the canonical `cluster` column. One brand per row, 192 total.

   Auth: hardcoded single-admin email gate (fast path for a one-person tool).
   v1.79. Canary: PFC274 = 62 — not touched here.
   ──────────────────────────────────────────────────────────────────────── */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VaultClusterReview, {
  type ReviewBrand,
} from "@/components/VaultClusterReview";

// Single-admin gate. Confirm this matches the live Supabase auth email.
// (Flagged: a role/claim-based check would be cleaner long-term; hardcoded
// email is the fast path for a single-admin internal tool.)
const ADMIN_EMAIL = "jmynatt74@gmail.com";

export default async function VaultReviewPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in, or not the admin → bounce. No hint that the page exists.
  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    redirect("/");
  }

  const { data: brands, error } = await supabase
    .from("vault_brands")
    .select(
      "id, name, slug, country_of_origin, independent_status, search_aliases, cluster, region, cluster_rationale, cluster_staging, region_staging, cluster_rationale_staging, cluster_reviewed"
    )
    .order("name");

  if (error) {
    return (
      <main className="min-h-screen bg-[var(--ink)] px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <p className="text-[13px] text-[var(--danger)]">
            Could not load brands: {error.message}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--ink)] px-6 py-12 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <div className="text-[8px] uppercase tracking-[4px] text-[var(--gold-subtle)]">
            Internal · Vault
          </div>
          <h1 className="mt-2 font-display text-[28px] font-light tracking-[0.3px] text-[var(--platinum)]">
            Cluster Review
          </h1>
          <p className="mt-1 font-display text-[14px] font-light italic text-[var(--muted)]">
            Approve each brand&apos;s gravitational home. One home per star.
          </p>
        </div>

        <VaultClusterReview brands={(brands ?? []) as ReviewBrand[]} />
      </div>
    </main>
  );
}
