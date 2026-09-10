/* ════════════════════════════════════════════════════════════════════════
   ACCOUNT MODULES — the ?module= vocabulary and its normalization
   (extracted from AccountDashboard for the Tax Time shell, v8.30)

   The URL is the only owner of the active account module (the WS2
   convention). This helper is the one place a typed ?module= value becomes
   a real room, and it is pure so the refusal can be proven with in-memory
   inputs rather than by reading a rendered page.

   Two rules:

   1. The strict allowlist: every REAL module id, never a "soon"
      placeholder, and unknown/absent values fall to Inventory — the
      account's default task (unchanged from the dashboard's original
      `moduleFromParam`).

   2. Access-gated modules: `tax-time` is a real module, but it is
      navigable only for an account whose server-resolved dealer access
      says so; `accelerator` likewise exists only for a seller account
      FairWatchTrade explicitly designated (founder lock 2026-09-10 —
      dealer identity does NOT imply it). For anyone else the value is treated exactly like an unknown
      one — it falls to Inventory. There is no "you cannot see this" room:
      a non-dealer typing the address lands on their Listings, the same
      thing an unknown word does, and learns nothing about the room's
      existence from the URL.
   ════════════════════════════════════════════════════════════════════════ */

import type { DealerAccess } from "@/lib/dealerAccess";
import type { DealerAcceleratorEntitlement } from "@/lib/dealerAcceleratorEntitlement";

/** Everything the workspace may be handed about this account's access:
    dealer identity (Tax Time) and Dealer Accelerator entitlement are read
    separately on the server and merged only here, for the module gate. */
export type AccountAccess = DealerAccess & DealerAcceleratorEntitlement;

export type AccountModuleId =
  | "dashboard"
  | "inventory"
  | "accelerator"
  | "market"
  | "communications"
  | "messages"
  | "requests"
  | "saved"
  | "wanted"
  | "trades"
  | "tax-time"
  | "analytics";

/** The Tax Time module id and its deep link, named once. */
export const TAX_TIME_MODULE_ID = "tax-time" as const;

/* "communications" is the rail door; "messages" and "requests" survive
   ONLY as deep-link addresses (notification → requests filter, email →
   messages filter). All three render the same room. */
export const NAVIGABLE_MODULE_IDS = [
  "dashboard",
  "inventory",
  "accelerator",
  "communications",
  "messages",
  "requests",
  "saved",
  "wanted",
  "trades",
  TAX_TIME_MODULE_ID,
] as const;

/** Modules that exist only for accounts with the named access. */
const ACCESS_GATED: Readonly<Record<string, keyof AccountAccess>> = {
  [TAX_TIME_MODULE_ID]: "taxTime",
  accelerator: "dealerAccelerator",
};

/**
 * Resolve a ?module= value to the module that will render.
 * `access` is the server-resolved dealer access; when absent, every gated
 * module is refused (fail closed).
 */
export function moduleFromParam(p: string | null | undefined, access?: Partial<AccountAccess> | null): AccountModuleId {
  const value = p ?? "";
  if (!(NAVIGABLE_MODULE_IDS as readonly string[]).includes(value)) return "inventory";
  const gate = ACCESS_GATED[value];
  if (gate && !(access && access[gate] === true)) return "inventory";
  return value as AccountModuleId;
}

/** Whether a module id may appear as a destination for this access. */
export function moduleVisible(id: string, access?: Partial<AccountAccess> | null): boolean {
  const gate = ACCESS_GATED[id];
  return !gate || !!(access && access[gate] === true);
}
