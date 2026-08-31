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
    ? "Sign in"
    : isAdmin
      ? `Signed in: ${name} · Admin`
      : `Signed in: ${name}`;
  const statusHref = !authed ? "/login" : isAdmin ? "/admin" : "/account";

  return (
    <footer className="border-t border-[var(--border-mid)] bg-[var(--ink)]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--slate)]">
          <span>© 2026 FairWatchTrade</span>
          <span className="text-[var(--muted)]">·</span>
          <Link href="/about" className="transition-colors hover:text-[var(--platinum)]">
            About
          </Link>
          <span className="text-[var(--muted)]">·</span>
          {/* Public discovery: a FAQ nobody can find answers nobody. Sits with
              the other public utility links, visible signed-out and signed-in. */}
          <Link href="/faq" className="transition-colors hover:text-[var(--platinum)]">
            FAQ
          </Link>
          <span className="text-[var(--muted)]">·</span>
          {/* Was a mailto: — it handed the visitor to Outlook or Gmail and out
              of FairWatchTrade. Now an in-site contact page. */}
          <Link href="/contact" className="transition-colors hover:text-[var(--platinum)]">
            Contact
          </Link>
          <span className="text-[var(--muted)]">·</span>
          <Link href="/terms" className="transition-colors hover:text-[var(--platinum)]">
            Terms
          </Link>
          <span className="text-[var(--muted)]">·</span>
          <Link href="/privacy" className="transition-colors hover:text-[var(--platinum)]">
            Privacy
          </Link>
        </div>
        <p className="mt-3 text-[11px] text-[var(--muted)]">
          Built for collectors. 5% flat fee. No ads. Ever.
        </p>
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          <Link
            href={statusHref}
            className="transition-colors hover:text-[var(--platinum)]"
          >
            {statusLabel}
          </Link>
        </p>
      </div>
    </footer>
  );
}
