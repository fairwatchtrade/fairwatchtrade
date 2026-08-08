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

   NOT THE LAUNCH LOCATION. The FAQ's public home is /faq — a FAQ answers the
   questions people ask BEFORE they have an account, so it cannot sit behind a
   login. This route survives as the signed-in entry point, so an Account-side
   link exists when one is authorized. Both routes render the identical
   FaqRoom; the shell is single-sourced.

   AccountRail is mounted unmodified (surface="account" with no activeModule),
   so no navigation item lights up and none is added.

   Kept noindex — not because of the copy (that is now published and public at
   /faq), but because an authenticated route should not be crawled at all.
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
