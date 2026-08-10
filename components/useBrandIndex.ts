"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { WATCH_BRANDS } from "@/lib/brands";
import {
  buildBrandIndex,
  type BrandIndex,
  type VaultBrandRow,
} from "@/lib/brandIndex";

/* ────────────────────────────────────────────────────────────────────────
   THE BRAND INDEX, ONCE PER PAGE.

   The Sell brand field and the model field sit beside each other and must
   agree about what a brand IS. They did not: the brand field resolved
   aliases through this index while the model field matched an exact
   normalized name, so a seller could pick a brand the platform recognised
   and be told it had no models — "Victorinox" could not reach the seven
   models filed under "Victorinox Swiss Army", which is that brand's own
   declared alias.

   Both now read the same index. The Vault fetch is cached at module scope
   so mounting two consumers still costs one request, and a failure leaves
   the curated static list standing exactly as before.
   ──────────────────────────────────────────────────────────────────────── */

let vaultPromise: Promise<VaultBrandRow[]> | null = null;

function loadVaultBrands(): Promise<VaultBrandRow[]> {
  if (!vaultPromise) {
    vaultPromise = (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("vault_brands")
          .select("name, search_aliases")
          .order("name");
        return Array.isArray(data) ? (data as VaultBrandRow[]) : [];
      } catch {
        /* the static list is the floor — a failed widen is never a broken field */
        return [];
      }
    })();
  }
  return vaultPromise;
}

export function useBrandIndex(): BrandIndex {
  const [rows, setRows] = useState<VaultBrandRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadVaultBrands().then((r) => {
      if (!cancelled && r.length) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => buildBrandIndex(WATCH_BRANDS, rows), [rows]);
}
