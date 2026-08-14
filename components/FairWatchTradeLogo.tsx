"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   FAIRWATCHTRADE LOGO — the canonical live identity (v4.28)

   [ live F/W clock mark ]  FairWatchTrade

   One component, every surface. The mark is a REAL clock reading the
   viewer's browser local time — never a server timezone, never a fake
   animation, never a hardcoded pose.

   ── WHY THE HANDS ARE MOVED BY REF, NOT BY STATE ───────────────────────
   A clock in the global header runs on every page. Driving it through
   React state would rerender the header sixty times a second, forever. The
   rAF loop mutates the three <g transform> attributes directly, so the
   component renders exactly once and the browser only recomposites three
   rotations. Zero rerenders, page-wide or local.

   requestAnimationFrame is also self-suspending: browsers stop firing it
   for hidden tabs, so a background tab costs nothing. The loop is
   cancelled on unmount.

   ── HYDRATION ──────────────────────────────────────────────────────────
   Server and client both render the hands at rotate(0) and the ticks from
   the same deterministic loop, so the markup matches byte-for-byte and
   nothing warns. The first animation frame after hydration sets the true
   time. No layout shift is possible: hand rotation changes no box.

   ── PROPORTIONS, NOT STAGE DIMENSIONS ──────────────────────────────────
   The study staged the mark at 76px against 44/56px wordmark text. The
   real header is h-14 (56px), so the identity is scaled to fit while the
   RATIOS the design depends on are preserved:

       mark ÷ Fair  = 1.70   (study 1.73)
       Watch ÷ Fair = 1.20   (study 1.27)
       gap  ÷ Fair  = 0.45   (study 0.41)

   Watch stays the emphasized word; the mark stays smaller than the
   wordmark; nothing crowds the nav.

   ── GEOMETRY ───────────────────────────────────────────────────────────
   The 180×180 study geometry is preserved exactly and scaled by the SVG
   viewBox: dial centred at 90,90 · rim r=72 · 12 major + 48 minor ticks ·
   F/W initials · hour/minute/second hands · central pin.

   Colours use production tokens rather than forking a second palette; the
   study's brighter minute-hand gold collapses into --gold, with the
   hierarchy carried by the ivory hour hand and the thinner, translucent
   second hand. The one non-token value is the dial well: per appearance it
   sits a touch beyond the page ink — darker than --ink at night, a touch
   lighter than the ivory page in daylight — so the dial reads as a dial
   and not as a hole in the header.

   ── ACCESSIBILITY ──────────────────────────────────────────────────────
   The link carries the accessible name. The mark and the wordmark are both
   aria-hidden, so a screen reader announces "FairWatchTrade, link" once —
   never the ticks, never the hands, and never a per-second live region.
   This is brand identity, not a time-reading widget.
   ──────────────────────────────────────────────────────────────────────── */

type LogoSize = "header" | "compact";

const SIZES: Record<
  LogoSize,
  { mark: string; word: string; watch: string; gap: string }
> = {
  /* Global header. Below lg the whole identity steps down so the mobile
     masthead (wordmark + bell + hamburger) never wraps or collides. */
  /* v4.30 — sized up on Jason's real display (3072 CSS px wide, 32" 4K at
     125%), where the first pass read as a trinket. 42px is the practical
     ceiling for the h-14 (56px) masthead: 7px of air above and below, no
     header redesign, no breakpoint move. The mark deliberately runs a
     little larger against the wordmark than the study's 1.73 ratio — the
     study staged a full-page identity, this one has to hold its own beside
     five nav words on a very wide screen. Real-device observation outranks
     the stage measurement. */
  header: {
    mark: "h-[34px] w-[34px] lg:h-[42px] lg:w-[42px]",
    word: "text-[18px] lg:text-[21px]",
    watch: "text-[21px] lg:text-[25px]",
    gap: "gap-[8px] lg:gap-[10px]",
  },
  /* Inside the mobile drawer header, beside its close control. */
  compact: {
    mark: "h-[26px] w-[26px]",
    word: "text-[15px]",
    watch: "text-[18px]",
    gap: "gap-[6px]",
  },
};

/* 60 ticks: every fifth is a major hour tick. Deterministic — identical on
   the server and the client, so this never costs a hydration warning. */
const TICKS = Array.from({ length: 60 }, (_, i) => {
  const major = i % 5 === 0;
  return {
    i,
    y1: major ? -67 : -65,
    y2: major ? -55 : -60,
    major,
  };
});

function LiveClockMark({
  className,
  animate,
}: {
  className: string;
  animate: boolean;
}) {
  const hourRef = useRef<SVGGElement>(null);
  const minuteRef = useRef<SVGGElement>(null);
  const secondRef = useRef<SVGGElement>(null);

  useEffect(() => {
    /* The mobile drawer stays MOUNTED when closed (its hide mechanism is
       opacity/pointer-events, not unmounting), so without this guard a
       second clock would animate invisibly behind every page on every
       device. Caught by counting hand transforms in the shipped HTML: six
       where three were expected. A hidden clock costs nothing now. */
    if (!animate) return;
    let frame = 0;
    const tick = () => {
      const now = new Date();
      const s = now.getSeconds() + now.getMilliseconds() / 1000;
      const m = now.getMinutes() + s / 60;
      const h = (now.getHours() % 12) + m / 60;
      hourRef.current?.setAttribute("transform", `rotate(${h * 30} 90 90)`);
      minuteRef.current?.setAttribute("transform", `rotate(${m * 6} 90 90)`);
      secondRef.current?.setAttribute("transform", `rotate(${s * 6} 90 90)`);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  return (
    <svg
      viewBox="0 0 180 180"
      className={`${className} block flex-none overflow-visible`}
      aria-hidden="true"
      focusable="false"
    >
      {/* Dial well — a shade under --ink so the rim reads as a bezel. */}
      <circle
        cx="90"
        cy="90"
        r="72"
        fill="light-dark(#FAF7F0,#080A0D)"
        stroke="var(--gold)"
        strokeWidth="2.4"
      />

      <g transform="translate(90 90)">
        {TICKS.map((t) => (
          <line
            key={t.i}
            x1="0"
            y1={t.y1}
            x2="0"
            y2={t.y2}
            transform={`rotate(${t.i * 6})`}
            stroke={t.major ? "var(--gold)" : "var(--muted)"}
            strokeWidth={t.major ? 2 : 0.8}
            strokeLinecap={t.major ? "round" : "butt"}
            opacity={t.major ? 1 : 0.42}
          />
        ))}
      </g>

      {/* F/W initials — the site's display serif, so the mark and the
          wordmark are cut from the same typeface. */}
      <text x="51" y="93" fontSize="60" fill="var(--gold)" className="font-display">
        F
      </text>
      <text x="66" y="137" fontSize="57" fill="var(--platinum)" className="font-display">
        W
      </text>

      <g ref={hourRef} transform="rotate(0 90 90)">
        <line
          x1="90"
          y1="97"
          x2="90"
          y2="51"
          stroke="var(--platinum)"
          strokeWidth="4.1"
          strokeLinecap="round"
        />
      </g>
      <g ref={minuteRef} transform="rotate(0 90 90)">
        <line
          x1="90"
          y1="99"
          x2="90"
          y2="36"
          stroke="var(--gold)"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
      </g>
      <g ref={secondRef} transform="rotate(0 90 90)">
        <line
          x1="90"
          y1="103"
          x2="90"
          y2="31"
          stroke="var(--gold)"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.8"
        />
      </g>

      <circle cx="90" cy="90" r="6.2" fill="var(--gold)" />
      <circle cx="90" cy="90" r="2.2" fill="#0A0C10" />
    </svg>
  );
}

export default function FairWatchTradeLogo({
  size = "header",
  onClick,
  className = "",
  animate = true,
}: {
  size?: LogoSize;
  onClick?: () => void;
  className?: string;
  /** False while this instance is mounted but not visible — the mobile
      drawer's closed state. Stops a hidden second clock from animating. */
  animate?: boolean;
}) {
  const s = SIZES[size];
  return (
    <Link
      href="/"
      onClick={onClick}
      aria-label="FairWatchTrade"
      className={`flex select-none items-center ${s.gap} ${className}`}
    >
      <LiveClockMark className={s.mark} animate={animate} />
      {/* aria-hidden: the link above already carries the name, so the
          wordmark must not announce it a second time. */}
      <span
        aria-hidden="true"
        className="flex items-baseline whitespace-nowrap font-display font-light leading-none tracking-[-0.03em]"
      >
        <span className={`${s.word} text-[var(--platinum)]`}>Fair</span>
        <span className={`${s.watch} mx-[0.055em] text-[var(--gold)]`}>Watch</span>
        <span className={`${s.word} text-[var(--platinum)]`}>Trade</span>
      </span>
    </Link>
  );
}
