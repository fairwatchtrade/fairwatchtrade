import type { Metadata } from "next";
import FaqRoom from "@/components/FaqRoom";

/* ────────────────────────────────────────────────────────────────────────
   FAQ — /faq  (public, no authentication)

   The FAQ's launch location. A casual visitor who has never signed in can
   read it, which is the whole point of a FAQ: the questions it answers are
   the ones people ask BEFORE they have an account.

   Shell: the root layout already supplies the production navbar, auction
   strip, metals strip, and footer to every page, so this route inherits them
   unchanged. It deliberately does NOT mount the Account rail — "Account /
   Your Workspace" is signed-in navigation, and showing a logged-out visitor
   a workspace whose every link bounces to /login would be a worse page, not
   a more complete one. The FAQ experience itself is the same accepted shell,
   rendered by the same component: FaqRoom is untouched by this route.

   /account/faq remains for signed-in users, so an Account-side entry point
   exists when one is authorized. Both render the identical room.

   NOINDEX WHILE FIXTURES REMAIN. The answers are still badged placeholders,
   so this page asks search engines to skip it. (Site-wide robots.txt is also
   closed pre-launch, but that is a crawler request about the whole site and
   will open at launch — this page-level block is what keeps a placeholder
   FAQ out of an index on the day that happens.) Remove it in the same change
   that publishes approved copy, not before.

   No public navigation entry is added here. The route works; linking to it
   is a separate authorization.
   ──────────────────────────────────────────────────────────────────────── */

export const metadata: Metadata = {
  title: "Frequently Asked Questions — FairWatchTrade",
  description:
    "Answers to common questions about buying, selling, payments, listings, verification, and privacy on FairWatchTrade.",
  robots: { index: false, follow: false },
};

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-[var(--ink)]">
      <FaqRoom />
    </main>
  );
}
