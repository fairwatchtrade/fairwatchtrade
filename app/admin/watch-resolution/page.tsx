import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WatchResolutionRoom from "@/components/WatchResolutionRoom";

/* ════════════════════════════════════════════════════════════════════════
   /admin/watch-resolution — exact-watch adjudication

   The room where a human decides whether two records describe the same
   physical watch. Everything it can do is one of three governed acts, and
   none of them moves data: confirming does not merge, non-match does not
   delete, and withdrawal does not undo. Each is a new permanent row against
   the two original records.

   PROD GATE: founder-only, hardcoded single-UID check, silent redirect for
   anyone else. The literal is intentionally duplicated here and in the API
   route — two independent gates, neither trusting the other.
   ════════════════════════════════════════════════════════════════════════ */

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

const C = {
  page: "#0C0F14",
  text: "#E6E9EF",
  muted: "#9BA4B4",
  gold: "#C9A84C",
};

export default async function WatchResolutionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== ADMIN_USER_ID) {
    redirect("/");
  }

  return (
    <div style={{ background: C.page, color: C.text, minHeight: "100vh", padding: "24px 20px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ marginBottom: 14, fontSize: 13 }}>
          <Link href="/admin" style={{ color: C.gold, textDecoration: "none" }}>
            ← Marketplace Control
          </Link>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Exact-watch resolution</h1>
        <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7, margin: "0 0 20px" }}>
          Two listings of one reference are two different watches until someone with evidence says
          otherwise. This room records what FairWatchTrade concludes — and lets that conclusion be
          withdrawn later without erasing that it was once held.
        </p>
        <WatchResolutionRoom />
      </div>
    </div>
  );
}
