/* ────────────────────────────────────────────────────────────────────────
   ADMIN — /admin/vault-upgrade  (Specification Upgrade room, server component)

   Private single-admin tool, sibling of /admin/vault-review. NOT linked
   from any public nav. Upgrades older Vault JSON files to the active
   Vault-lock v3.2 structure: preserves exact originals, produces
   deterministic candidates with exact change ledgers, and stores all work
   locally in the founder's browser (IndexedDB). It performs no database
   reads or writes, no Vault mutation, no Galaxy activation, no uploads.

   Auth: the same hardcoded single-admin email gate as /admin/vault-review.
   The active specification identity is derived here from the governed byte
   carrier — hashed at request time and verified against the contract
   manifest, never hard-coded presentation. The specification text itself
   stays server-side; the client receives only the verified identity.

   Canary: PFC274 = 62 lives in the evaluate route — not touched here.
   ──────────────────────────────────────────────────────────────────────── */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VaultRoomTabs from "@/components/VaultRoomTabs";
import VaultSpecificationUpgrade, {
  type ServerContractResult,
} from "@/components/VaultSpecificationUpgrade";
import { verifyActiveContract } from "@/lib/vault-upgrade/contracts/vault-lock-v3.2.manifest.ts";
import { VAULT_LOCK_V3_2_TEXT } from "@/lib/vault-upgrade/contracts/vault-lock-v3.2.spec-bytes.ts";
import schemaJson from "@/lib/vault-upgrade/contracts/vault-lock-v3.2.schema.json";

// Single-admin gate — must match /admin/vault-review exactly.
const ADMIN_EMAIL = "jmynatt74@gmail.com";

export default async function VaultUpgradePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in, or not the admin → bounce. No hint that the page exists.
  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    redirect("/");
  }

  // Governed active-contract check: hash the real specification bytes at
  // request time and bind them to the executable companion manifest.
  const verification = await verifyActiveContract(
    VAULT_LOCK_V3_2_TEXT,
    schemaJson as Record<string, unknown>
  );
  const serverContract: ServerContractResult = verification.ok
    ? { ok: true, identity: verification.identity }
    : { ok: false, detail: verification.detail };

  return (
    <main className="min-h-screen bg-[var(--ink)] px-6 py-12 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <VaultRoomTabs active="upgrade" />

        <div className="mb-8">
          <h2 className="font-display text-[22px] font-light tracking-[0.3px] text-[var(--platinum)]">
            Specification Upgrade
          </h2>
          <p className="mt-1 font-display text-[14px] font-light italic text-[var(--muted)]">
            Preserve the original. Upgrade the structure. Never invent the
            truth.
          </p>
        </div>

        <VaultSpecificationUpgrade
          serverContract={serverContract}
          operator={user.email ?? ADMIN_EMAIL}
        />
      </div>
    </main>
  );
}
