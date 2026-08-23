"use client";

import { useEffect, useState } from "react";
import { RailShell, RailSection, RailItem } from "@/components/rail/railPrimitives";

/* ────────────────────────────────────────────────────────────────────────
   ACCOUNT RAIL — components/AccountRail.tsx  (v3.21)

   The Account family's persistent left navigation (Concept A "Painted
   Line"), replacing AccountDashboard's inline aside per the v3
   implementation order §4/§6 — REPLACEMENT, never layered beside the old
   rail (Layout's law).

   Surfaces:
   · surface="account"  — mounted by AccountDashboard. Module items call
     onSelectModule (the WS2 pushState convention — the URL stays the sole
     owner of the active module); badges arrive as props from the
     dashboard's existing state. NO second fetch (the v2.68 lesson).
   · surface="settings" — mounted by app/account/settings/page.tsx.
     Module items are ordinary Links back into the workspace; Settings is
     active; the rail performs the same established on-mount fetches
     itself for badge truth (/api/messages + the RLS-scoped requests
     read — the repo's proven "read my own rows" convention). Fetch
     silence renders no badge, never a fabricated 0.

   v5.95 — one Communications entry is the door to the Communications
   room (founder ruling 2026-08-19); the old separate Requests/Messages
   items retired. Soon items (Market Intel, Analytics) stay excluded
   from the deep-link allowlist. Icons are the Design Gate study's exact
   SVG set.
   ──────────────────────────────────────────────────────────────────────── */

type ModuleId =
  | "dashboard"
  | "inventory"
  | "accelerator"
  | "communications"
  | "saved"
  | "wanted";

const ICONS = {
  overview: (
    <svg viewBox="0 0 24 24">
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
    </svg>
  ),
  listings: (
    <svg viewBox="0 0 24 24">
      <path d="M6 5h12M6 12h12M6 19h12" />
      <circle cx="3" cy="5" r=".8" />
      <circle cx="3" cy="12" r=".8" />
      <circle cx="3" cy="19" r=".8" />
    </svg>
  ),
  drafts: (
    <svg viewBox="0 0 24 24">
      <path d="M5 3h10l4 4v14H5z" />
      <path d="M15 3v5h5M8 13h8M8 17h6" />
    </svg>
  ),
  requests: (
    <svg viewBox="0 0 24 24">
      <path d="M4 5h16v12H8l-4 4z" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  ),
  messages: (
    <svg viewBox="0 0 24 24">
      <path d="M3 5h18v12H8l-5 4z" />
      <path d="M7 9h10M7 13h7" />
    </svg>
  ),
  saved: (
    <svg viewBox="0 0 24 24">
      <path d="M6 4h12v16l-6-4-6 4z" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1-2-3-2 1a7 7 0 0 0-2-1l-.3-2h-4l-.3 2a7 7 0 0 0-2 1l-2-1-2 3 2 1a7 7 0 0 0 0 2l-2 1 2 3 2-1a7 7 0 0 0 2 1l.3 2h4l.3-2a7 7 0 0 0 2-1l2 1 2-3-2-1a7 7 0 0 0 .1-1z" />
    </svg>
  ),
  control: (
    <svg viewBox="0 0 24 24">
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="7" cy="17" r="1.6" />
    </svg>
  ),
  marketIntel: (
    <svg viewBox="0 0 24 24">
      <path d="M4 18V9M10 18V5M16 18v-7M22 18v-4" />
    </svg>
  ),
  /* A loupe over an absence — the collector is looking FOR something. The
     same mark the Catalogue rail uses, so one idea reads as one idea. */
  wanted: (
    <svg viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5L20 20" />
      <path d="M11 8.5v5M8.5 11h5" />
    </svg>
  ),
  analytics: (
    <svg viewBox="0 0 24 24">
      <path d="M4 18l5-6 4 3 7-9" />
      <path d="M17 6h3v3" />
    </svg>
  ),
} as const;

/* v5.95 — ONE Communications entry replaces the separate Requests and
   Messages items (founder ruling 2026-08-19: one doorway, one room,
   filters inside — the Requests/Messages/Unread/Archived split lives in
   the room's own folder rail, never out here). */
const MODULE_ITEMS: Array<{ id: ModuleId; label: string; icon: keyof typeof ICONS }> = [
  { id: "dashboard", label: "Overview", icon: "overview" },
  { id: "inventory", label: "Listings", icon: "listings" },
  /* The rail names the CAPABILITY, not one of its work states. This item
     read "Imported Drafts" while the module id was already `accelerator`:
     the navigation was advertising a product's output as though it were the
     product. Imported Drafts is now reached inside the room, and must never
     return here as a peer — it is produced BY Dealer Accelerator, not a
     sibling of it. */
  { id: "accelerator", label: "Dealer Accelerator", icon: "drafts" },
  { id: "communications", label: "Communications", icon: "messages" },
  { id: "saved", label: "Saved Searches", icon: "saved" },
  /* Wanted Requests — collector demand this seller may answer. Seller
     Workspace owns it by founder ruling; Dealer Room may surface the same
     requests contextually later and is deliberately not a second door. */
  { id: "wanted", label: "Wanted Requests", icon: "wanted" },
];

function moduleHref(id: ModuleId): string {
  return id === "inventory" ? "/account" : `/account?module=${id}`;
}

export default function AccountRail({
  surface,
  activeModule,
  onSelectModule,
  unreadThreads,
  pendingRequests,
  marketplaceControl = false,
}: {
  surface: "account" | "settings" | "marketplace";
  activeModule?: string;
  onSelectModule?: (id: ModuleId) => void;
  unreadThreads?: number;
  pendingRequests?: number;
  /** Founder-only Marketplace Control entry. The mounting SERVER page
      decides this from the session (never a client-side check), so the
      destination is rendered only for a user the gate would admit — no
      dead door for ordinary sellers, no founder UID in any bundle. */
  marketplaceControl?: boolean;
}) {
  /* Standalone badge truth (standalone surfaces only, and only when the
     mounting page passed nothing): the same two established reads
     AccountDashboard performs, unchanged. Silence → no badge. */
  const [ownUnread, setOwnUnread] = useState<number | undefined>(undefined);
  const [ownPending, setOwnPending] = useState<number | undefined>(undefined);
  const fetchOwn =
    (surface === "settings" || surface === "marketplace") &&
    unreadThreads === undefined &&
    pendingRequests === undefined;

  useEffect(() => {
    if (!fetchOwn) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/messages");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data.threads)) {
            setOwnUnread(
              data.threads.filter(
                (t: { archivedByMe?: boolean; unreadCount?: number }) =>
                  !t.archivedByMe && (t.unreadCount ?? 0) > 0
              ).length
            );
          }
        }
      } catch {
        /* badge simply stays absent — never crashes the page */
      }
    })();

    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { count, error } = await supabase
          .from("purchase_requests")
          .select("id", { count: "exact", head: true })
          .eq("seller_id", user.id)
          .eq("status", "pending");
        if (!cancelled && !error) setOwnPending(count ?? 0);
      } catch {
        /* badge simply stays absent */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchOwn]);

  const unread = unreadThreads ?? ownUnread;
  const pending = pendingRequests ?? ownPending;

  return (
    <RailShell
      family="account"
      kicker="Account"
      title="Your Workspace"
      ariaLabel="Account navigation"
    >
      {/* No "WORKSPACE" eyebrow — "Your Workspace" above already names this
          rail (ruling 2026-08-19: one label, one real job). COMING NEXT
          below keeps its label; that split is real information. */}
      <RailSection>
        {MODULE_ITEMS.map((m) => {
          const isActive = surface === "account" && activeModule === m.id;
          /* One door, one indicator: everything currently needing the
             seller's eyes — pending requests + unread correspondence.
             The two counts keep their SEPARATE semantics inside the room
             (Requests folder count vs Unread folder count); this is the
             door's total, not a merged model. Fetch silence on both
             sides renders no badge, never a fabricated 0. */
          const attention =
            unread === undefined && pending === undefined
              ? undefined
              : (unread ?? 0) + (pending ?? 0);
          const badge = m.id === "communications" ? attention : undefined;
          return (
            <RailItem
              key={m.id}
              icon={ICONS[m.icon]}
              label={m.label}
              active={isActive}
              badge={badge}
              chevron={badge === undefined || badge <= 0}
              ariaCurrent={isActive ? "true" : undefined}
              {...(surface === "account" && onSelectModule
                ? { onClick: () => onSelectModule(m.id) }
                : { href: moduleHref(m.id) })}
            />
          );
        })}
        <RailItem
          icon={ICONS.settings}
          label="Account Settings"
          href="/account/settings"
          active={surface === "settings"}
          chevron
          ariaCurrent={surface === "settings" ? "page" : undefined}
        />
        {marketplaceControl && (
          <RailItem
            icon={ICONS.control}
            label="Marketplace Control"
            href="/admin"
            active={surface === "marketplace"}
            chevron
            ariaCurrent={surface === "marketplace" ? "page" : undefined}
          />
        )}
      </RailSection>
      <RailSection label="Coming next">
        <RailItem icon={ICONS.marketIntel} label="Market Intel" soon />
        <RailItem icon={ICONS.analytics} label="Analytics" soon />
      </RailSection>
    </RailShell>
  );
}
