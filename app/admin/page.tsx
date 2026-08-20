import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import AccountRail from "@/components/AccountRail";
import MarketplaceControl, { type McPrefs } from "@/components/MarketplaceControl";
import { DEFAULT_MC_QUERY, fetchMarketplacePayload } from "@/lib/marketplaceControlData";

/* ────────────────────────────────────────────────────────────────────────
   MARKETPLACE CONTROL — /admin

   The founder's marketplace operations room (2026-08-20 competing Design
   Gate: watch-centered ledger + persistent selected-listing inspector;
   dense configurable table on demand). Replaces the v1.95 AdminDashboard
   composition; the five placeholder Phase-2 cards are deliberately gone.

   Route protection is the established hardcoded single-UID check — no role
   system, no middleware gate. Anyone who isn't the founder is silently
   redirected to /. This page renders inside the ordinary FWT shell (NavBar +
   MarketBar from the root layout) with the Account workspace rail beside it:
   Marketplace Control is FairWatchTrade becoming more capable, not a
   detached admin console. The rail entry exists only for the founder; the
   visual continuity does not widen access — this gate and every
   /api/admin/marketplace route's own gate stay the authority.

   THE READ PATH (v3.74 pattern, unchanged in shape): identity is proved by
   the session client; only past the redirect does the trusted client read.
   listings_select_public_or_own is never widened. Server component — the
   service key never reaches a bundle.

   The initial payload is fetched here with the DEFAULT query (CURRENT,
   newest first) so first paint is real data; every later interaction goes
   through /api/admin/marketplace with server-side filter/sort/pagination —
   the room never loads the retained listing universe into the browser.

   PRIVACY: significance_score is founder-facing here exactly as it was in
   the previous admin table; it is NEVER rendered on buyer-facing surfaces.
   PFC274 = 62 — the evaluate route is untouched.
   ──────────────────────────────────────────────────────────────────────── */

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== ADMIN_USER_ID) {
    redirect("/");
  }

  const db = createServiceClient();
  const payload = await fetchMarketplacePayload(db, DEFAULT_MC_QUERY);

  /* Presentation preferences are the founder's own row (RLS-own table);
     the session client reads them. Absent row → defaults. */
  let prefs: McPrefs = {};
  try {
    const { data } = await supabase
      .from("admin_view_preferences")
      .select("prefs")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data?.prefs && typeof data.prefs === "object") prefs = data.prefs as McPrefs;
  } catch {
    /* preferences are presentation only — the room opens on defaults */
  }

  return (
    <div className="flex min-h-screen bg-[var(--ink)]">
      <AccountRail surface="marketplace" marketplaceControl />
      <div className="min-w-0 flex-1">
        <MarketplaceControl initial={payload} initialPrefs={prefs} />
      </div>
    </div>
  );
}
