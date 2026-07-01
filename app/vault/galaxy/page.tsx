import { createClient } from "@/lib/supabase/server";
import VaultGalaxy from "@/components/VaultGalaxy";

/* ════════════════════════════════════════════════════════════════════════
   THE VAULT — app/vault/page.tsx   (v1.70)

   Server component. Fetches all brands (the galaxy's stars), including their
   AUTHORED galaxy coordinates (galaxy_x/y/z, cluster). Stored coordinates win;
   VaultGalaxy falls back to a seeded spiral only for brands whose coords are
   null. Passes the brand array to the client galaxy.

   Scope (v1.70): the POC engine ported to real data — the abstract gold-glow
   galaxy, 3-body (brand=star, collection=planet, variant=moon), drill-down,
   search. The photoreal moons / gates / rich detail card are later flights.

   NOTE: assumes `@/lib/supabase/server` createClient() (the SSR pattern used
   across the app). Adjust only the import + call if the helper differs.
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

  return <VaultGalaxy brands={brands} />;
}
