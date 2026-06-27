/* ────────────────────────────────────────────────────────────────────────
   ABOUT — /about  (founder's statement, server component)
   ──────────────────────────────────────────────────────────────────────── */

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#0D0F14]">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:px-8">
        <div className="text-[11px] uppercase tracking-[0.15em] text-[#C9A84C]">
          The Story Behind the Platform
        </div>
        <h1 className="mt-2 text-3xl font-light text-[#E8E4DC]">
          About FairWatchTrade
        </h1>

        <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-[#B7BAC4]">
          <p>
            My name is William Mynatt. Long before I devoted my free time to
            collecting watches, I worked in IT infrastructure
            consulting in Northern Virginia. Throughout those years, my interest
            was always the engineering, history, and craftsmanship of watches.
          </p>
          <p>
            FairWatchTrade wasn't born from a business plan. It grew out of a 
            personal search.
          </p>
          <p>
            I was looking for the perfect Mother's Day gift for my wife
            — a watch that met a very specific look and feel. I wasn't
            focused on a particular brand. I was searching for a moon phase,
            a particular mother-of-pearl dial, and a design where every detail
            felt balanced and intentional.
          </p>
          <p>
            What should have been an inspiring search quickly devolved into a
            frustrating exercise in digital fragmentation. The watch
            industry's search engines forced me to shop by manufacturer
            first, rather than by the artistry and specific features of the
            timepiece itself. I found myself hunting across dozens of scattered
            tabs, realizing how punishing the landscape is when you are looking
            for independent, rare, or highly specific pieces of horology.
          </p>
          <p>
            Adding to the frustration was the daily lag. Like many collectors,
            I'd wake up to an inbox flooded with match alerts bundled into
            automated batch releases. You open an alert thinking you've
            spotted something fresh, only to realize the listing is already 23
            hours old. When you are chasing extremely rare pieces where only
            five examples might exist worldwide, a day-long delay means the
            watch was sold before the email even hit your inbox.
          </p>
          <p>
            It got to the point where I was actively writing custom batch files
            just to automate the process — building scripts to scrape the web
            for a single reference number or a specific dial color.
          </p>
          <p>
            When a collector has to resort to writing custom scripts just to
            search the market efficiently, you know the system is broken.
          </p>
          <p>
            Driven by that frustration, I sat down one night — not to create another marketplace, but to solve a problem collectors had quietly lived with for years.
          </p>
          <p>
            I built FairWatchTrade to be the platform I wished had existed when I was searching for those hard-to-find pieces. Every feature was designed by a collector, for collectors, with the goal of making the experience a little easier and a little more enjoyable.
          </p>
        </div>

        <p className="mt-8 text-[15px] font-medium text-[#E8E4DC]">
          — William Mynatt, Founder
        </p>
      </div>
    </main>
  );
}
