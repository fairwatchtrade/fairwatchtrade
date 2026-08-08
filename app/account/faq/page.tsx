import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AccountRail from "@/components/AccountRail";
import FaqRoom from "@/components/FaqRoom";

/* ────────────────────────────────────────────────────────────────────────
   FAQ — app/account/faq/page.tsx

   Thin server wrapper, mirroring app/account/settings/page.tsx exactly: auth
   guard first (no flash), then the persistent AccountRail beside the room.
   The navbar, auction strip, and metals strip come from the root layout and
   are untouched.

   PRE-COPY BOUNDARY. The FAQ shell ships before its customer copy is
   written, so this route is deliberately NOT reachable from customer
   navigation — nothing in the navbar, the AccountRail, or the workspace
   links here, and AccountRail is mounted unmodified (surface="account" with
   no activeModule), so no navigation item lights up and none is added.
   Sitting behind the auth guard is the point: placeholder answers can never
   be read by the public, or indexed, while the shell is verified.

   Reached only by typing the route. Public activation is a separate
   authorization after customer copy closes; at that point this page needs
   nothing but a nav entry and real answers in the fixture's place.
   ──────────────────────────────────────────────────────────────────────── */

export const metadata: Metadata = {
  title: "FAQ — FairWatchTrade",
  /* Not customer-activated yet: keep it out of any index while the answers
     are placeholders. */
  robots: { index: false, follow: false },
};

export default async function AccountFaqPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-[var(--ink)]">
      <AccountRail surface="account" />
      <div className="min-w-0 flex-1">
        <FaqRoom />
      </div>
    </div>
  );
}
