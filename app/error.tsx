"use client";

import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   ERROR BOUNDARY — app/error.tsx  (v1.63)

   Next.js error boundary: must be a Client Component and receives
   { error, reset }. Full-page route (min-h-screen). Quiet reassurance —
   the collector's data is safe; no movement-background SVG, per ruling.

   The component is named ErrorBoundary (not `Error`) so the `error: Error`
   prop type still resolves to the real global Error type rather than
   shadowing it. `export default` satisfies Next's error-file contract.
   ──────────────────────────────────────────────────────────────────────── */

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
          One moment
        </div>
        <h1 className="mb-2 font-display text-[32px] font-light leading-[1.2] tracking-[0.3px] text-[var(--platinum)]">
          We are taking care of something.
        </h1>
        <div className="mx-auto mb-4 h-px w-[28px] bg-[var(--gold-subtle)]" />
        <p className="mx-auto mb-8 max-w-[460px] font-display text-[15px] font-light italic leading-[1.8] text-[var(--slate)]">
          Something went wrong on our end, and we&apos;re on it. Your catalogue, listings,
          conversations, and saved watches are safe and will be exactly as you left them.
        </p>

        {/* Actions — primary (reset) · ghost */}
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => reset()}
            className="bg-[var(--gold)] px-[22px] py-2.5 font-[Inter] text-[9px] font-normal uppercase tracking-[2.5px] text-[var(--ink)]"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="border border-[var(--border-subtle)] bg-transparent px-[18px] py-[9px] font-[Inter] text-[9px] uppercase tracking-[2px] text-[var(--slate)]"
          >
            Return Home
          </Link>
        </div>
      </div>
    </main>
  );
}
