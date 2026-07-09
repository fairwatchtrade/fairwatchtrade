import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   SITE FOOTER — minimal dark footer, sits below page content in the layout.
   ──────────────────────────────────────────────────────────────────────── */

export default function SiteFooter({
  authed,
  displayName,
  isAdmin,
}: {
  authed: boolean;
  displayName: string | null;
  isAdmin: boolean;
}) {
  // Temporary founder-only pre-launch tooling — a session-status
  // indicator, NOT the future public account-navigation UX. Deliberately
  // kept on its own line beneath the real public footer links, never
  // mixed in with About/Contact/Terms/Privacy — public nav and founder
  // auth-status are two different things, not one list.
  const name = displayName ?? "your account";
  const statusLabel = !authed
    ? "Authorized test access"
    : isAdmin
      ? `Signed in: ${name} · Admin`
      : `Signed in: ${name}`;
  const statusHref = !authed ? "/login" : isAdmin ? "/admin" : "/account";

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
          <span className="text-[#8A8F9E]">·</span>
          <Link href="/terms" className="transition-colors hover:text-[#E8E4DC]">
            Terms
          </Link>
          <span className="text-[#8A8F9E]">·</span>
          <Link href="/privacy" className="transition-colors hover:text-[#E8E4DC]">
            Privacy
          </Link>
        </div>
        <p className="mt-3 text-[11px] text-[#8A8F9E]">
          Built for collectors. 5% flat fee. No ads. Ever.
        </p>
        <p className="mt-2 text-[11px] text-[#8A8F9E]">
          <Link
            href={statusHref}
            className="transition-colors hover:text-[#E8E4DC]"
          >
            {statusLabel}
          </Link>
        </p>
      </div>
    </footer>
  );
}
