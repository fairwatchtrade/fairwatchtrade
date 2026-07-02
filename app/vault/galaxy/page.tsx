import { createClient } from "@/lib/supabase/server";
import VaultGalaxy from "@/components/VaultGalaxy";

/* ════════════════════════════════════════════════════════════════════════
   THE VAULT GALAXY — app/vault/galaxy/page.tsx   (v1.97)

   Server component. Fetches brands + catalogue counts for the intro
   sequence in parallel (Promise.all — never sequential). Counts are real
   Supabase values, never hardcoded. Passes all four props to VaultGalaxy.

   PRIVACY: combined_score / significance_score / score_state are NEVER
   selected here. PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export default async function VaultGalaxyPage() {
  const supabase = await createClient();

  const [brandsResult, collectionCountResult, referenceCountResult] =
    await Promise.all([
      supabase
        .from("vault_brands")
        .select(
          "id, slug, name, description, search_aliases, galaxy_x, galaxy_y, galaxy_z, cluster"
        )
        .order("name"),
      supabase
        .from("vault_collections")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("vault_references")
        .select("*", { count: "exact", head: true }),
    ]);

  const brands = brandsResult.data ?? [];
  const collectionCount = collectionCountResult.count ?? 0;
  const referenceCount = referenceCountResult.count ?? 0;

  // Quiet fallback — never a broken canvas.
  if (brandsResult.error || brands.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--ink-deep)] px-6 text-center">
        <div className="mb-3 text-[8px] uppercase tracking-[5px] text-[var(--gold-subtle)]">
          The FairWatchTrade Vault
        </div>
        <p className="font-display text-[18px] font-light italic leading-[1.7] text-[var(--muted)]">
          The gates are closed for a moment.
          <br />
          The catalogue will return shortly.
        </p>
      </main>
    );
  }

  return (
    <VaultGalaxy
      brands={brands}
      brandCount={brands.length}
      collectionCount={collectionCount}
      referenceCount={referenceCount}
    />
  );
}
