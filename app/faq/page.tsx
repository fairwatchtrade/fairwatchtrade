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

   The page-level noindex is GONE. It was set on the explicit condition that
   it hold "only while placeholder fixture answers remain" — the answers are
   now the published customer copy, so the condition has lapsed and the block
   came off with it. Nothing becomes crawlable today regardless: app/robots.ts
   still disallows the whole site pre-launch. This only changes what happens
   on the day that opens.
   ──────────────────────────────────────────────────────────────────────── */

export const metadata: Metadata = {
  title: "Frequently Asked Questions — FairWatchTrade",
  description:
    "Answers to common questions about buying, selling, payments, listings, verification, and privacy on FairWatchTrade.",
};

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-[var(--ink)]">
      <FaqRoom />
    </main>
  );
}
