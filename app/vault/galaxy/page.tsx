import { createClient } from "@/lib/supabase/server";
import VaultGalaxy from "@/components/VaultGalaxy";

/* ════════════════════════════════════════════════════════════════════════
   THE VAULT GALAXY — app/vault/galaxy/page.tsx   (v1.99)

   Server component. Fetches all brands (the galaxy's stars), including
   their authored galaxy coordinates. Passes the brand array to the client
   galaxy — the Atlantis entrance is the only ceremony; the galaxy opens
   directly into the real interactive field.

   PRIVACY: combined_score / significance_score / score_state are NEVER
   selected here. PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export default async function VaultGalaxyPage() {
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

  return <VaultGalaxy brands={brands} />;
}
