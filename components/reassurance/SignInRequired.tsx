import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   REASSURANCE — Sign in required  (v1.63)

   Embeddable inline component (min-height, not full-page). Shown on
   members-only surfaces. Reassures that everything saved is intact and
   waiting. No movement-background SVG, per Studio ruling.
   ──────────────────────────────────────────────────────────────────────── */

export default function SignInRequired() {
  return (
    <section className="relative flex min-h-[260px] flex-col items-center justify-center overflow-hidden px-6 py-12 text-center sm:px-8">
      {/* Breadcrumb */}
      <div className="absolute left-6 top-5 z-[1] flex items-center gap-1.5 text-[9px] tracking-[0.5px] text-[var(--void)] sm:left-8">
        <Link href="/" className="text-[var(--ghost)] transition-colors hover:text-[var(--muted)]">
          Home
        </Link>
      </div>

      <div className="relative z-[1] w-full max-w-[480px]">
        <div className="mb-3.5 text-[8px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
          Members only
        </div>
        <h2 className="mb-2 font-display text-[28px] font-light leading-[1.25] tracking-[0.3px] text-[var(--platinum)]">
          Your collection is waiting.
        </h2>
        <div className="mx-auto mb-4 h-px w-[28px] bg-[var(--gold-subtle)]" />
        <p className="mx-auto mb-6 max-w-[460px] font-display text-[15px] font-light italic leading-[1.8] text-[var(--slate)]">
          This page is available to FairWatchTrade members. Sign in to access your dashboard,
          catalogue, saved watches, and conversations — everything is exactly where you left it.
        </p>

        {/* Catalogue nudge */}
        <div className="mx-auto mb-6 flex max-w-[400px] items-start gap-2.5 border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-3 text-left">
          <span className="mt-0.5 shrink-0 text-[11px] text-[var(--gold-subtle)]">♡</span>
          <p className="font-display text-[13px] font-light leading-[1.65] text-[var(--muted)]">
            <strong className="font-normal not-italic text-[var(--platinum-dim)]">
              Already have a Catalogue?
            </strong>{" "}
            Sign in and FairWatchTrade will show you everything that changed while you were away.
          </p>
        </div>

        {/* Actions — primary · ghost · quiet */}
        <div className="relative z-[1] flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href="/login"
            className="bg-[var(--gold)] px-[22px] py-2.5 font-[Inter] text-[9px] font-normal uppercase tracking-[2.5px] text-[var(--ink)]"
          >
            Sign In
          </Link>
          <Link
            href="/browse"
            className="border border-[var(--border-subtle)] bg-transparent px-[18px] py-[9px] font-[Inter] text-[9px] uppercase tracking-[2px] text-[var(--slate)]"
          >
            Continue Browsing
          </Link>
          <Link
            href="/signup"
            className="font-[Inter] text-[9px] uppercase tracking-[1.5px] text-[var(--ghost)]"
          >
            Create an Account
          </Link>
        </div>
      </div>
    </section>
  );
}
