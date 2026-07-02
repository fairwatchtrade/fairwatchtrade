import { createClient } from "@/lib/supabase/server";
import VaultGalaxy from "@/components/VaultGalaxy";

/* ════════════════════════════════════════════════════════════════════════
   THE VAULT — app/vault/page.tsx   (v2.0)

   The Atlantis correction: /vault is now the viewing room AND the real
   archive room. The working VaultGalaxy is mounted from first paint, and the
   Atlantis curtain is only an overlay above it. No preview galaxy. No route
   transition. No black flash. The thing behind the veil is the actual live
   Vault universe.

   /vault/galaxy remains the direct-entry route for the same interactive
   component with the entrance skipped.

   PRIVACY: combined_score / significance_score / score_state are NEVER
   selected here. PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export default async function VaultPage() {
  const supabase = await createClient();

  const { data: brands, error } = await supabase
    .from("vault_brands")
    .select(
      "id, slug, name, description, search_aliases, galaxy_x, galaxy_y, galaxy_z, cluster"
    )
    .order("name");

  // Quiet fallback — never a broken canvas.
  if (error || !brands || brands.length === 0) {
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

  return <VaultGalaxy brands={brands} atlantisIntro />;
}
