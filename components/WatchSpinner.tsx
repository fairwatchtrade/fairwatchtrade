"use client";

/* ────────────────────────────────────────────────────────────────────────
   WATCH SPINNER — a small subdial that sweeps a hand continuously.

   A branded replacement for the generic border-spinner. DARK dial face with
   a champagne-gold rim, ticks, and sweeping hand. The dark face is the key:
   it reads sharply against BOTH the gold buttons (where a solid-gold dial
   would wash out) and the dark UI panels — and a black-dial-with-gold-trim
   look is more "luxury watch" than a flat gold disc anyway.

   Reusable: drop <WatchSpinner /> anywhere a loading state is needed.
   `size` controls the diameter in px. Defaults suit an inline button spinner.
   ──────────────────────────────────────────────────────────────────────── */
export default function WatchSpinner({
  size = 18,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", width: size, height: size }}
      role="status"
      aria-label="Loading"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Dial face — dark, so it reads on gold buttons AND dark panels */}
        <circle cx="20" cy="20" r="18" fill="#495B74" />
        {/* Champagne-gold rim */}
        <circle cx="20" cy="20" r="18" fill="none" stroke="#C9A84C" strokeWidth="2" />
        {/* Gold hour ticks */}
        <g stroke="#C9A84C" strokeWidth="1.4" strokeLinecap="round">
          <line x1="20" y1="4.5" x2="20" y2="8" />
          <line x1="35.5" y1="20" x2="32" y2="20" />
          <line x1="20" y1="35.5" x2="20" y2="32" />
          <line x1="4.5" y1="20" x2="8" y2="20" />
        </g>
        {/* Sweeping gold hand — rotates continuously */}
        <g style={{ transformOrigin: "20px 20px", animation: "fwt-sweep 1.1s linear infinite" }}>
          <line
            x1="20"
            y1="20"
            x2="20"
            y2="7"
            stroke="#E6C868"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          {/* Counterweight tail */}
          <line
            x1="20"
            y1="20"
            x2="20"
            y2="24"
            stroke="#C9A84C"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>
        {/* Center cap */}
        <circle cx="20" cy="20" r="2" fill="#C9A84C" />
      </svg>

      <style>{`
        @keyframes fwt-sweep {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </span>
  );
}
