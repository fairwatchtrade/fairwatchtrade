import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MobileWizard, { type VaultBrandLite } from "@/components/MobileWizard";

/* ════════════════════════════════════════════════════════════════════════
   LIST FROM PHONE — /sell/mobile   (v2.2 · Phase 3)

   The dealer-acquisition door. A guided, camera-first client over the same
   listing record, validation rules, curation system, and publishing
   pipeline as /sell. Explicit opt-in — nothing redirects here automatically.

   Server wrapper: requires a signed-in seller (photograph → publish needs an
   owner), and preloads the Vault brand list once (193 rows, the same table
   the Galaxy renders) so the Brand typeahead filters instantly on-device
   with zero per-keystroke queries. Model suggestions cascade client-side
   from vault_collections per selected brand.

   PRIVACY: combined_score / significance_score / score_state are never
   selected here. PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export default async function SellMobilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("vault_brands")
    .select("id, name, slug")
    .order("name");

  const brands: VaultBrandLite[] = Array.isArray(data) ? data : [];

  return <MobileWizard brands={brands} />;
}
