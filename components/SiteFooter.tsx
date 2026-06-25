import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   SITE FOOTER — minimal dark footer, sits below page content in the layout.
   ──────────────────────────────────────────────────────────────────────── */

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#0D0F14]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[#B7BAC4]">
          <span>© 2026 FairWatchTrade</span>
          <span className="text-[#8A8F9E]">·</span>
          <Link href="/about" className="transition-colors hover:text-[#E8E4DC]">
            About
          </Link>
          <span className="text-[#8A8F9E]">·</span>
          <a
            href="mailto:hello@fairwatchtrade.com"
            className="transition-colors hover:text-[#E8E4DC]"
          >
            Contact
          </a>
        </div>
        <p className="mt-3 text-[11px] text-[#8A8F9E]">
          Built for collectors. 5% flat fee. No ads. Ever.
        </p>
      </div>
    </footer>
  );
}
