/* ────────────────────────────────────────────────────────────────────────
   ABOUT — /about  (founder's statement, server component)
   ──────────────────────────────────────────────────────────────────────── */

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#0D0F14]">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="text-[11px] uppercase tracking-[0.15em] text-[#C9A84C]">
          The Story Behind the Platform
        </div>
        <h1 className="mt-2 text-3xl font-light text-[#E8E4DC]">
          About FairWatchTrade
        </h1>

        <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-[#B7BAC4]">
          <p>
            My name is William Mynatt. Long before I dedicated my free time to
            the collection of timepieces, I cut my teeth in IT infrastructure
            consulting in Northern Virginia. My quiet, enduring passion was
            always the engineering, history, and artistry of watches.
          </p>
          <p>
            The spark for FairWatchTrade didn&rsquo;t come from a boardroom. It
            came from a personal mission.
          </p>
          <p>
            I was searching for the perfect Mother&rsquo;s Day gift for my wife
            — a watch that met a very specific, elegant aesthetic. I wasn&rsquo;t
            tied to a single brand name; I was chasing a vision. A moon phase
            complication, a specific mother-of-pearl dial, and an exact
            structural harmony.
          </p>
          <p>
            What should have been an inspiring search quickly devolved into a
            frustrating exercise in digital fragmentation. The watch
            industry&rsquo;s search engines forced me to shop by manufacturer
            first, rather than by the artistry and specific features of the
            timepiece itself. I found myself hunting across dozens of scattered
            tabs, realizing how punishing the landscape is when you are looking
            for independent, rare, or highly specific pieces of horology.
          </p>
          <p>
            Adding to the frustration was the daily lag. Like many collectors,
            I&rsquo;d wake up to an inbox flooded with match alerts bundled into
            automated batch releases. You open an alert thinking you&rsquo;ve
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
            Driven by that frustration, I decided to bridge the gap permanently.
            I sat down one night, reached back to my roots in technical
            architecture, and began writing the code to solve a real, unmet need
            in our community.
          </p>
          <p>
            I built FairWatchTrade to be the definitive ecosystem I wished
            existed when I was hunting for those hard-to-find pieces. It was made
            by a collector, for collectors, with every feature exactly where it
            belongs.
          </p>
        </div>

        <p className="mt-8 text-[15px] font-medium text-[#E8E4DC]">
          — William Mynatt, Founder
        </p>
      </div>
    </main>
  );
}
