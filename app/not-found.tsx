import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   NOT FOUND — app/not-found.tsx  (v1.63)

   Full-page route (min-h-screen). A moment of redirection, kept clean — no
   movement-background SVG, per Studio ruling. Headline is the locked Docs
   line "We lost our frame of reference." (overrides the prototype wording).
   ──────────────────────────────────────────────────────────────────────── */

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--ink)] px-6 py-24 text-center">
      {/* Breadcrumb */}
      <div className="absolute left-6 top-6 z-[1] flex items-center gap-1.5 text-[9px] tracking-[0.5px] text-[var(--void)] sm:left-8">
        <Link href="/" className="text-[var(--ghost)] transition-colors hover:text-[var(--muted)]">
          Home
        </Link>
      </div>

      <div className="relative z-[1] w-full max-w-[520px]">
        <div className="mb-6 text-[8px] uppercase tracking-[4px] text-[var(--gold-subtle)]">
          Page not found
        </div>
        <h1 className="mb-2 font-display text-[32px] font-light leading-[1.2] tracking-[0.3px] text-[var(--platinum)]">
          We lost our frame of reference.
        </h1>
        <div className="mx-auto mb-4 h-px w-[28px] bg-[var(--gold-subtle)]" />
        <p className="mx-auto mb-8 max-w-[460px] font-display text-[15px] font-light italic leading-[1.8] text-[var(--slate)]">
          The page you were looking for has been removed or renamed. If you followed a link, it
          may be outdated. Everything else on FairWatchTrade is exactly where it should be.
        </p>

        {/* Actions — primary · ghost · quiet */}
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href="/"
            className="bg-[var(--gold)] px-[22px] py-2.5 font-[Inter] text-[9px] font-normal uppercase tracking-[2.5px] text-[var(--ink)]"
          >
            Return Home
          </Link>
          <Link
            href="/browse"
            className="border border-[var(--border-subtle)] bg-transparent px-[18px] py-[9px] font-[Inter] text-[9px] uppercase tracking-[2px] text-[var(--slate)]"
          >
            Browse Watches
          </Link>
          <Link
            href="/account"
            className="font-[Inter] text-[9px] uppercase tracking-[1.5px] text-[var(--ghost)]"
          >
            Open My Catalogue
          </Link>
        </div>
      </div>
    </main>
  );
}
