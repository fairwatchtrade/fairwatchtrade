import VaultEntrance from "@/components/VaultEntrance";

/* ────────────────────────────────────────────────────────────────────────
   THE VAULT — /vault  (v1.91)

   The entrance. A server component with no data needs and no auth check —
   the Vault is free, ungated, open to all. It renders the gates; crossing
   navigates to /vault/galaxy, where the Galaxy now lives (moved here from
   this path in v1.91).
   ──────────────────────────────────────────────────────────────────────── */

export default function VaultPage() {
  return <VaultEntrance />;
}
