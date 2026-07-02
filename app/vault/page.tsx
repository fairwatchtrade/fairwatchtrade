import AtlantisVaultEntrance from "@/components/AtlantisVaultEntrance";

/* ────────────────────────────────────────────────────────────────────────
   THE VAULT — /vault  (v1.96)

   The entrance. A server component with no data needs and no auth check —
   the Vault is free, ungated, open to all. It now renders the Atlantis
   reveal: the gates yield and the veil lifts to show the galaxy that was
   always behind it; crossing (the collector's own second choice) navigates
   to /vault/galaxy.

   VaultEntrance.tsx (the v1.91 static entrance) is left in place for
   reference and is no longer rendered here.
   ──────────────────────────────────────────────────────────────────────── */

export default function VaultPage() {
  return <AtlantisVaultEntrance />;
}
