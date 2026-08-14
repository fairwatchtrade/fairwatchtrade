import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import ContactForm from "@/components/ContactForm";

/* ────────────────────────────────────────────────────────────────────────
   CONTACT — /contact  (public, no authentication)

   The in-site destination that replaced the mailto: link. A visitor with no
   account can write to FairWatchTrade without leaving FairWatchTrade, which
   is the whole point: the people most likely to have a question are the ones
   who have not signed up yet.

   Prefill: if a session happens to exist, the email box starts filled with
   that account's own address — their own data, shown back to them, and fully
   editable. Nothing else is prefilled and nothing is required of them.

   The root layout supplies the navbar, market strips, and footer. No new
   shell, no new navigation architecture.
   ──────────────────────────────────────────────────────────────────────── */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact — FairWatchTrade",
  description: "Write to FairWatchTrade.",
  robots: { index: false, follow: false },
};

export default async function ContactPage() {
  let email = "";
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? "";
  } catch {
    /* signed-out is the expected case here, never an error */
  }

  return (
    <main className="min-h-screen bg-[var(--ink)]">
      <div className="mx-auto w-full max-w-[1450px] px-[34px] pb-[70px] pt-[32px]">
        <div className="mb-[8px] text-[11px] uppercase leading-[14px] tracking-[2.2px] text-[var(--gold-dim)]">
          Help &amp; Information
        </div>
        <h1 className="mb-[8px] font-display text-[36px] font-normal leading-[42px] text-[var(--platinum)]">
          Contact FairWatchTrade
        </h1>
        <p className="mb-8 max-w-[720px] text-[14px] leading-[22px] text-[var(--muted)]">
          Send us a note and we&rsquo;ll reply by email. If you were reading the{" "}
          <a href="/faq" className="text-[var(--platinum-dim)] underline underline-offset-2 hover:text-[var(--platinum)]">
            FAQ
          </a>{" "}
          and it didn&rsquo;t cover your question, tell us — that is how it gets better.
        </p>
        <ContactForm initialEmail={email} />
      </div>
    </main>
  );
}
