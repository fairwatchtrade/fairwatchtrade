import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminDashboard, { type AdminListing } from "@/components/AdminDashboard";

/* ────────────────────────────────────────────────────────────────────────
   ADMIN — /admin  (v1.95)

   Founder-only operator control room. Answers one question: "What needs my
   attention right now?" Server component, server-fetched, no client fetching.

   Route protection is a hardcoded single-UID check — no role system, no
   middleware gate. Anyone who isn't the founder is silently redirected to /;
   the route simply doesn't exist for them (no error, no "unauthorized" page).

   PRIVACY: combined_score / significance_score / score_state are NEVER shown
   on BUYER-FACING surfaces (protects the curation engine from gaming). The
   founder admin DOES see significance_score here — catching an anomalous score
   (e.g. anything that shouldn't be possible under the engine's floor) is part
   of "what needs my attention." Admin is gated to a single founder UID, so this
   is the operator viewing their own data, not a buyer leak. PFC274 = 62 — the
   evaluate route is untouched.
   ──────────────────────────────────────────────────────────────────────── */

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== ADMIN_USER_ID) {
    redirect("/");
  }

  // Full inventory, newest first — powers the attention queue, stat cards, and table.
  const { data: listingsData } = await supabase
    .from("listings")
    .select(
      "id, brand, model, reference, condition, asking_price, status, created_at, seller_id, completeness_score, significance_score, description_passed_ai, custom_brand_flag"
    )
    .order("created_at", { ascending: false });

  // Seller display-name lookup.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name");

  // Total notifications sent (count only).
  const { count: notificationCount } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true });

  const listings = (Array.isArray(listingsData) ? listingsData : []) as AdminListing[];

  // Derived pipeline counts — computed server-side (not in the client).
  const now = Date.now();
  const yesterday = now - 24 * 60 * 60 * 1000;
  const lastWeek = now - 7 * 24 * 60 * 60 * 1000;

  const published = listings.filter((l) => l.status === "published");
  const drafts = listings.filter((l) => l.status === "draft");
  const rejected = listings.filter((l) => l.status === "rejected");
  const last24h = listings.filter((l) => new Date(l.created_at).getTime() > yesterday);
  const last7d = listings.filter((l) => new Date(l.created_at).getTime() > lastWeek);

  const sellerMap: Record<string, string> = Object.fromEntries(
    (profiles ?? []).map((p) => [p.id, p.display_name ?? "Unknown"])
  );

  const counts = {
    published: published.length,
    drafts: drafts.length,
    rejected: rejected.length,
    last24h: last24h.length,
    last7d: last7d.length,
    notifications: notificationCount ?? 0,
  };

  return <AdminDashboard listings={listings} sellerMap={sellerMap} counts={counts} />;
}
