import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ListingStatusControls from "@/components/ListingStatusControls";

/* ════════════════════════════════════════════════════════════════════════
   /admin/listings/[id] — LISTING REVIEW  (v2.0 · status controls + prod gate)

   This URL is PERMANENT. The Operations Center points here — never back into
   Supabase. Shows the raw record and now carries founder-only status controls
   (change status / take down), matching /admin's protection model.

   ── PROD GATE — NOW ENFORCED ────────────────────────────────────────────
   Founder-only, identical pattern to /admin (page-admin.tsx): a hardcoded
   single-UID check, silent redirect to / for anyone else. The literal is
   intentionally duplicated here and in the status API route — two independent
   gates, never one shared constant both surfaces trust.

   NOTE: the record is read with the session client, so RLS
   (listings_select_public_or_own) scopes it to published + the founder's own
   listings. That fully covers the primary takedown case (pulling a PUBLISHED
   listing, any seller). Other sellers' NON-published listings are not viewable
   here yet — see delivery FLAG; that's a separate admin-visibility ruling.

   PFC274 = 62 — the evaluate route is untouched.
   ──────────────────────────────────────────────────────────────────────── */

export const dynamic = "force-dynamic";

// Defense-in-depth literal — intentionally duplicated in the status route,
// independent of any shared constant. Matches /admin (page-admin.tsx).
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

export default async function ListingReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // ── PROD GATE: founder-only, silent redirect for everyone else ──
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== ADMIN_USER_ID) {
    redirect("/");
  }

  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", id)
    .single();

  const wrap: React.CSSProperties = {
    minHeight: "100vh",
    background: "#0f1115",
    color: "#e6e8ec",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 13,
    padding: "20px 24px",
  };

  if (!listing) {
    return (
      <div style={wrap}>
        <Link href="/admin" style={{ color: "#7aa2f7", textDecoration: "none" }}>
          ← Operations Center
        </Link>
        <div style={{ marginTop: 16 }}>Listing not found: {id}</div>
      </div>
    );
  }

  const currentStatus =
    typeof listing.status === "string" ? (listing.status as string) : "—";

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <Link href="/admin" style={{ color: "#7aa2f7", textDecoration: "none" }}>
          ← Operations Center
        </Link>

        <div style={{ margin: "14px 0 4px", fontSize: 18, fontWeight: 700 }}>
          {(listing.brand as string) || "—"} {(listing.model as string) || ""}
        </div>
        <div style={{ marginBottom: 14, color: "#8b93a1", fontSize: 12 }}>
          Listing Review · founder status controls
        </div>

        {/* Founder-only status controls (client). Replaces the old
            "Coming Soon" placeholder. */}
        <ListingStatusControls listingId={id} currentStatus={currentStatus} />

        {/* Raw record so the page is already useful today */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {Object.entries(listing)
              .filter(([k]) => k !== "photos" && k !== "score_state" && k !== "details")
              .map(([k, v]) => (
                <tr key={k} style={{ borderBottom: "1px solid #23272f" }}>
                  <td
                    style={{
                      padding: "6px 10px",
                      color: "#8b93a1",
                      width: 200,
                      verticalAlign: "top",
                    }}
                  >
                    {k}
                  </td>
                  <td style={{ padding: "6px 10px", wordBreak: "break-word" }}>
                    {v === null || v === undefined
                      ? "—"
                      : typeof v === "object"
                      ? JSON.stringify(v)
                      : String(v)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
