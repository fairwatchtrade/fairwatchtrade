/* ────────────────────────────────────────────────────────────────────────
   ADMIN — /admin/vault-enrichment  (Enrichment Authoring room, server)

   Third Vault room, sibling of /admin/vault-review and /admin/vault-upgrade,
   behind the same single-admin gate. NOT linked from any public nav.

   Why it exists: the enrichment capability lived only in a second repository
   — a validator, a planner, an apply script, a folder of packs and a
   ten-parameter SECURITY DEFINER function. That is knowledge spread too thin
   to survive. Here the form is the contract.

   It performs no database write and no Vault mutation. It reads the Vault to
   resolve a real target, refuses anything not applyable, and hands back a
   plan file, its hash, and the statement that carries them. Applying remains
   a deliberate, separately authorized act.

   Canary: PFC274 = 62 lives in the evaluate route — not touched here.
   ──────────────────────────────────────────────────────────────────────── */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VaultRoomTabs from "@/components/VaultRoomTabs";
import VaultEnrichmentAuthoring from "@/components/VaultEnrichmentAuthoring";

// Single-admin gate — must match /admin/vault-review exactly.
const ADMIN_EMAIL = "jmynatt74@gmail.com";

export default async function VaultEnrichmentPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in, or not the admin → bounce. No hint that the page exists.
  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-[var(--ink)] px-6 py-12 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <VaultRoomTabs active="enrichment" />

        <div className="mb-8">
          <h2 className="font-display text-[22px] font-light tracking-[0.3px] text-[var(--platinum)]">
            Enrichment Authoring
          </h2>
          <p className="mt-1 font-display text-[14px] font-light italic text-[var(--muted)]">
            Name the source. Quote its words. The room builds the rest.
          </p>
        </div>

        <VaultEnrichmentAuthoring />
      </div>
    </main>
  );
}
