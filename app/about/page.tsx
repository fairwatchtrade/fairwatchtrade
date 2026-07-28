/* ────────────────────────────────────────────────────────────────────────
   ABOUT — /about  (founder's statement, server component)

   v1.49 — FINAL. Cormorant Garamond reinstated for body at 300/16.5px/2.1lh.
   font-display: swap already present in Google Fonts URL (&display=swap).
   text-rendering: optimizeLegibility added to html/body in globals.css.
   Paragraph spacing via .fw-body p (globals.css). sm:py-40 breathing room.
   Cormorant on title, body, pull quotes, and signature — as designed.
   Inter on eyebrow and tagline only. Canary: PFC274 = 62.
   v2.56 — founder story kept; the formal "My name is…" opening removed (the
   name still signs at the bottom); a quiet "What FairWatchTrade does
   differently" payoff added after the signature (approved product decision). Honest
   untargeted-instant notification wording — the targeted saved-search match
   promise stays reserved for a later build.
   ──────────────────────────────────────────────────────────────────────── */

import FounderSignature from "@/components/FounderSignature";

export default function AboutPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--ink)] px-6 py-24 sm:py-40">
      {/* Movement background — decorative watch dial, left side, vertically centered */}
      <svg
        className="fw-movement-bg left-[-80px] top-1/2 h-[500px] w-[500px] -translate-y-1/2"
        viewBox="0 0 400 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="200" cy="200" r="180" stroke="white" strokeWidth="0.5" />
        <circle cx="200" cy="200" r="140" stroke="white" strokeWidth="0.5" />
        <circle cx="200" cy="200" r="100" stroke="white" strokeWidth="0.5" />
        <circle cx="200" cy="200" r="60" stroke="white" strokeWidth="0.5" />
        <circle cx="200" cy="200" r="20" stroke="white" strokeWidth="0.8" />
        <line x1="200" y1="20" x2="200" y2="58" stroke="white" strokeWidth="0.5" />
        <line x1="200" y1="342" x2="200" y2="380" stroke="white" strokeWidth="0.5" />
        <line x1="20" y1="200" x2="58" y2="200" stroke="white" strokeWidth="0.5" />
        <line x1="342" y1="200" x2="380" y2="200" stroke="white" strokeWidth="0.5" />
        <line x1="200" y1="200" x2="200" y2="78" stroke="white" strokeWidth="1.2" />
        <line x1="200" y1="200" x2="258" y2="200" stroke="white" strokeWidth="0.8" />
        <circle cx="200" cy="200" r="3.5" fill="white" />
        <circle cx="200" cy="60" r="5" stroke="white" strokeWidth="0.5" opacity="0.5" />
        <circle cx="340" cy="200" r="5" stroke="white" strokeWidth="0.5" opacity="0.5" />
        <circle cx="200" cy="340" r="5" stroke="white" strokeWidth="0.5" opacity="0.5" />
        <circle cx="60" cy="200" r="5" stroke="white" strokeWidth="0.5" opacity="0.5" />
      </svg>

      {/* Placard — .fw-placard supplies border + top-left/bottom-right pseudo
          corners; the two divs below add top-right/bottom-left corners. */}
      <div className="fw-placard relative w-full max-w-[660px] text-center">
        <div className="absolute right-[-1px] top-[-1px] h-[14px] w-[14px] border-r border-t border-[var(--border-gold-strong)]" />
        <div className="absolute bottom-[-1px] left-[-1px] h-[14px] w-[14px] border-b border-l border-[var(--border-gold-strong)]" />

        {/* Eyebrow — Inter, display moment */}
        <div className="mb-6 font-[Inter] text-[10px] uppercase tracking-[4px] text-[var(--gold-subtle)]">
          The Story Behind the Platform
        </div>

        {/* Title — Cormorant, display moment */}
        <h1 className="font-[Cormorant_Garamond] text-[30px] font-light leading-[1.3] tracking-[1.5px] text-[var(--platinum)]">
          About FairWatchTrade
        </h1>
        <div className="fw-rule my-8" />

        {/* Body — Cormorant Garamond 300, 16.5px, line-height 2.1 via .fw-body.
            font-display: swap in Google Fonts URL. text-rendering: optimizeLegibility
            in globals.css. Paragraph spacing via .fw-body p. This is the approved
            Studio spec. Done. */}
        <div className="fw-body font-display px-1 text-left text-[14px] font-light text-[var(--platinum-dim)] sm:text-[16.5px]">
          <p>
            Long before I devoted my free time to collecting watches, I worked
            in IT infrastructure consulting in Northern Virginia. FairWatchTrade
            wasn&apos;t born from a business plan — it grew out of a personal
            search.
          </p>

          <p>
            I was looking for the perfect Mother&apos;s Day gift for my wife — a
            moon phase, a particular mother-of-pearl dial, a design where every
            detail felt intentional. But the industry&apos;s search engines
            forced me to shop by manufacturer first, rather than by the design
            itself. It got to the point where I was writing custom batch files
            just to search the market — scripts to scrape the web for a single
            reference number or a specific dial color.
          </p>

          <div className="fw-pull">
            When a collector has to resort to writing custom scripts just to
            search the market efficiently, you know the system is broken.
          </div>

          <p>
            So I sat down one night — not to create another marketplace, but to
            solve a problem collectors had quietly lived with for years. I built
            FairWatchTrade to be the platform I wished had existed, designed by a
            collector, for collectors.
          </p>
        </div>

        {/* Signature — William's actual hand, vectorized (FounderSignature). */}
        <div className="mt-9 flex justify-end px-1">
          <FounderSignature width={180} withRule className="text-[var(--platinum-dim)]" />
        </div>
      </div>

      {/* v2.56 — "What FairWatchTrade does differently": the founder story earns
          the trust; this is the practical payoff it was missing. Story above is
          unchanged. Approved wording — honest untargeted-instant
          notification language; the targeted saved-search match promise stays
          reserved until that capability is built. Quiet stanzas, not a feature grid. */}
      <div className="relative z-[1] mt-16 w-full max-w-[560px] text-center">
        <div className="mb-7 font-[Inter] text-[10px] uppercase tracking-[4px] text-[var(--gold-subtle)]">
          What FairWatchTrade Does Differently
        </div>
        <div className="flex flex-col gap-6 font-display text-[14px] font-light leading-[1.5] sm:text-[16px]">
          <div>
            <div className="text-[var(--platinum)]">5% when a sale is completed.</div>
            <div className="text-[var(--muted)]">No listing fees. No paid placement.</div>
          </div>
          <div>
            <div className="text-[var(--platinum)]">Discovery begins with the watch itself.</div>
            <div className="text-[var(--muted)]">
              Explore by the details collectors actually recognize — not only by manufacturer hierarchy.
            </div>
          </div>
          <div>
            <div className="text-[var(--platinum)]">
              New listings appear in FairWatchTrade notifications as soon as they are published.
            </div>
            <div className="text-[var(--muted)]">
              No daily batch standing between the listing and the collector.
            </div>
          </div>
          <div>
            <div className="text-[var(--platinum)]">Evidence before marketing.</div>
            <div className="text-[var(--muted)]">
              Built to help collectors understand the watch, not reward whoever paid to be seen.
            </div>
          </div>
        </div>
      </div>

      {/* Tagline — intentional whisper at --ghost (decorative, not instructional) */}
      <div className="mt-12 text-[10px] uppercase tracking-[4px] text-[var(--ghost)]">
        Collect with confidence
      </div>
    </main>
  );
}
