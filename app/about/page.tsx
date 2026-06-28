/* ────────────────────────────────────────────────────────────────────────
   ABOUT — /about  (founder's statement, server component)

   v1.47c — body paragraphs restored to Cormorant Garamond (16.5px, 2.1
   line-height, weight 300) to match the Ducky 3 Studio prototype. The earlier
   v1.48 switch to Inter tightened the column and lost the airy serif rhythm;
   this returns the body to the approved side-by-side look. Title, .fw-pull
   quotes, and signature were already Cormorant and are unchanged.
   All copy preserved verbatim. Canary: PFC274 = 62.
   ──────────────────────────────────────────────────────────────────────── */

export default function AboutPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--ink)] px-6 py-24">
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

      {/* Placard — .fw-placard supplies the border + top-left/bottom-right pseudo
          corners; the two divs below add the top-right/bottom-left corners. */}
      <div className="fw-placard relative w-full max-w-[660px] text-center">
        <div className="absolute right-[-1px] top-[-1px] h-[14px] w-[14px] border-r border-t border-[var(--border-gold-strong)]" />
        <div className="absolute bottom-[-1px] left-[-1px] h-[14px] w-[14px] border-b border-l border-[var(--border-gold-strong)]" />

        <div className="mb-6 font-[Inter] text-[10px] uppercase tracking-[4px] text-[var(--gold-subtle)]">
          The Story Behind the Platform
        </div>
        <h1 className="font-[Cormorant_Garamond] text-[30px] font-light leading-[1.3] tracking-[1.5px] text-[var(--platinum)]">
          About FairWatchTrade
        </h1>
        <div className="fw-rule my-8" />

        {/* Body — Cormorant Garamond 300, 16.5px / 2.1 line-height: the airy
            serif rhythm from the Studio prototype. Its condensed glyphs fit more
            per line, so the 660px column reads wider and breathes. */}
        <div className="space-y-6 px-1 text-left font-[Cormorant_Garamond] text-[16.5px] font-light leading-[2.1] text-[var(--platinum-dim)]">
          <p>
            My name is William Mynatt. Long before I devoted my free time to
            collecting watches, I worked in IT infrastructure consulting in
            Northern Virginia. Throughout those years, my interest was always the
            engineering, history, and craftsmanship of watches.
          </p>

          <div className="fw-pull">
            FairWatchTrade wasn&apos;t born from a business plan. It grew out of a
            personal search.
          </div>

          <p>
            I was looking for the perfect Mother&apos;s Day gift for my wife — a
            watch that met a very specific look and feel. I wasn&apos;t focused on
            a particular brand. I was searching for a moon phase, a particular
            mother-of-pearl dial, and a design where every detail felt balanced
            and intentional.
          </p>

          <p>
            What should have been an inspiring search quickly devolved into a
            frustrating exercise in digital fragmentation. The watch
            industry&apos;s search engines forced me to shop by manufacturer
            first, rather than by the artistry and specific features of the
            timepiece itself. I found myself hunting across dozens of scattered
            tabs, realizing how punishing the landscape is when you are looking
            for independent, rare, or highly specific pieces of horology.
          </p>

          <p>
            Adding to the frustration was the daily lag. Like many collectors,
            I&apos;d wake up to an inbox flooded with match alerts bundled into
            automated batch releases. You open an alert thinking you&apos;ve
            spotted something fresh, only to realize the listing is already 23
            hours old. When you are chasing extremely rare pieces where only five
            examples might exist worldwide, a day-long delay means the watch was
            sold before the email even hit your inbox.
          </p>

          <p>
            It got to the point where I was actively writing custom batch files
            just to automate the process — building scripts to scrape the web for
            a single reference number or a specific dial color.
          </p>

          <div className="fw-pull">
            When a collector has to resort to writing custom scripts just to
            search the market efficiently, you know the system is broken.
          </div>

          <p>
            Driven by that frustration, I sat down one night — not to create
            another marketplace, but to solve a problem collectors had quietly
            lived with for years.
          </p>

          <p>
            I built FairWatchTrade to be the platform I wished had existed when I
            was searching for those hard-to-find pieces. Every feature was
            designed by a collector, for collectors, with the goal of making the
            experience a little easier and a little more enjoyable.
          </p>
        </div>

        {/* Signature — Cormorant retained, display moment */}
        <div className="mt-9 px-1 text-right font-[Cormorant_Garamond] text-[15px] font-light italic text-[var(--muted)]">
          — <span className="text-[var(--gold)] not-italic">William Mynatt</span>,
          Founder
        </div>
      </div>

      {/* Tagline — intentional whisper at --ghost (decorative, not instructional) */}
      <div className="mt-12 text-[10px] uppercase tracking-[4px] text-[var(--ghost)]">
        Collect with confidence
      </div>
    </main>
  );
}
