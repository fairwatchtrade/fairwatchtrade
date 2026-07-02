import { createClient } from "@/lib/supabase/server";
import AtlantisVaultEntrance from "@/components/AtlantisVaultEntrance";

/* ────────────────────────────────────────────────────────────────────────
   THE VAULT — /vault  (v1.96e)

   The entrance. A server component, free and ungated. It fetches the same
   brand universe the Galaxy uses and hands it to the Atlantis reveal, so the
   field that lifts into view behind the veil IS the real archive — not a
   preview. Crossing (the collector's own second choice) then navigates to
   /vault/galaxy, the very same field, now live.

   The fetch here is INTENTIONALLY byte-identical to app/vault/galaxy/page.tsx
   — same columns, same `.order("name")`, no secondary sort. That order is
   load-bearing: any brand without authored galaxy_x/y/z is positioned by the
   seeded spiral using its INDEX in this array, so the entrance and the galaxy
   must resolve brands in the exact same order or the two fields would drift
   apart. Do not add ordering the galaxy page doesn't have.

   VaultEntrance.tsx (the v1.91 static entrance) is left in place for
   reference and is no longer rendered here.
   ──────────────────────────────────────────────────────────────────────── */

export default async function VaultPage() {
  const supabase = await createClient();

  const { data: brands, error } = await supabase
    .from("vault_brands")
    .select(
      "id, slug, name, description, search_aliases, galaxy_x, galaxy_y, galaxy_z, cluster"
    )
    .order("name");

  // Never reveal an empty ceremony — mirror the Galaxy's graceful fallback.
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

  return <AtlantisVaultEntrance brands={brands} />;
}
