import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import ListingStatusControls from "@/components/ListingStatusControls";

/* ════════════════════════════════════════════════════════════════════════
   /admin/listings/[id] — LISTING REVIEW  (v2.1 · founder reads any listing)

   This URL is PERMANENT. The Operations Center points here — never back into
   Supabase. Shows the raw record and now carries founder-only status controls
   (change status / take down), matching /admin's protection model.

   ── PROD GATE — NOW ENFORCED ────────────────────────────────────────────
   Founder-only, identical pattern to /admin (page-admin.tsx): a hardcoded
   single-UID check, silent redirect to / for anyone else. The literal is
   intentionally duplicated here and in the status API route — two independent
   gates, never one shared constant both surfaces trust.

   ── v2.1 · ADMIN VISIBILITY GAP CLOSED (Dealer Accelerator Flight 2A) ───
   The record was previously read with the SESSION client, so RLS
   (listings_select_public_or_own = published OR auth.uid() = seller_id)
   scoped it to published listings plus the founder's own. That covered the
   takedown case but left a real hole: another seller's NON-published listing
   was simply invisible here. Dealer Accelerator makes that hole load-bearing
   — a dealer's submitted draft is pending_review and owned by the dealer, so
   it is neither published nor the founder's own, and the founder could not
   reach the very listing they are meant to adjudicate. A transition into an
   unreachable state is worse than no transition at all.

   The read now uses the TRUSTED service client, which bypasses RLS — the same
   precedent already established by the admin status route and the Flight 1
   import route, and reached by the same discipline: ONLY after the founder
   gate below has already passed. The gate still runs on the session client,
   so authentication is never delegated to the client that ignores RLS. Two
   independent things: the session client proves who you are; the service
   client is only handed the read once that proof holds.

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

  const wrap: React.CSSProperties = {
    minHeight: "100vh",
    background: "#0f1115",
    color: "#e6e8ec",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 13,
    padding: "20px 24px",
  };

  // Founder gate passed. Read with the trusted client so ANY listing is
  // reachable — including another seller's draft/pending_review row, which RLS
  // would otherwise hide from this page entirely. maybeSingle() rather than
  // single(): a missing row is a legitimate "not found" render below, not an
  // error to throw.
  let listing: Record<string, unknown> | null = null;
  try {
    const service = createServiceClient();
    const { data } = await service.from("listings").select("*").eq("id", id).maybeSingle();
    listing = data ?? null;
  } catch (e) {
    // Trusted client unavailable (missing service-role config). Fail visibly
    // rather than rendering a misleading "Listing not found" for a listing
    // that may well exist.
    console.error("[admin] listing review — trusted client unavailable:", e);
    return (
      <div style={wrap}>
        <Link href="/admin" style={{ color: "#7aa2f7", textDecoration: "none" }}>
          ← Operations Center
        </Link>
        <div style={{ marginTop: 16, color: "#e07070" }}>
          Admin read channel unavailable — the listing could not be loaded. This is a
          server configuration problem, not a missing listing.
        </div>
      </div>
    );
  }

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
