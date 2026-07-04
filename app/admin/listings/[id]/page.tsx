import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   /admin/listings/[id] — LISTING REVIEW (stub)

   This URL is PERMANENT. The Operations Center points here — never back into
   Supabase. Today it shows the raw record so it's already useful; the full
   review view (approve/reject, description diff, strike actions) comes later.

   ── PROD GATE ──────────────────────────────────────────────────────────
   LOCAL-DEV ONLY. Add the same admin allowlist check here before prod.
   ──────────────────────────────────────────────────────────────────────── */

export const dynamic = "force-dynamic";

export default async function ListingReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // ── PROD GATE: add admin allowlist check here before deploying ──

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

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <Link href="/admin" style={{ color: "#7aa2f7", textDecoration: "none" }}>
          ← Operations Center
        </Link>

        <div style={{ margin: "14px 0 4px", fontSize: 18, fontWeight: 700 }}>
          {(listing.brand as string) || "—"} {(listing.model as string) || ""}
        </div>
        <div style={{ marginBottom: 4, color: "#8b93a1", fontSize: 12 }}>
          Listing Review · full review actions coming soon
        </div>

        <div
          style={{
            display: "inline-block",
            border: "1px solid #2a2f3a",
            background: "#15181e",
            color: "#e0a83c",
            padding: "4px 10px",
            fontSize: 11,
            marginBottom: 18,
          }}
        >
          Review actions (approve / reject / strike) — Coming Soon
        </div>

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
