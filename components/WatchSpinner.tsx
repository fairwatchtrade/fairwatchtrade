"use client";

/* ────────────────────────────────────────────────────────────────────────
   WATCH SPINNER — a small subdial that sweeps a hand continuously.

   A branded replacement for the generic border-spinner. Champagne-gold dial
   (not white — white reads flat against the dark UI) with a thin sweeping
   second hand, tying into the gold accent used across the wordmark, score
   meter, and flyer.

   Reusable: drop <WatchSpinner /> anywhere a loading state is needed.
   `size` controls the diameter in px; inherits currentColor for the hand
   highlight where useful. Defaults suit an inline button spinner.
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
        {/* Dial face — champagne gold */}
        <circle cx="20" cy="20" r="18" fill="#C9A84C" />
        {/* Inner ring for a touch of dial depth */}
        <circle cx="20" cy="20" r="18" fill="none" stroke="#A8863A" strokeWidth="1.5" />
        {/* Hour ticks */}
        <g stroke="#5A4A1E" strokeWidth="1.4" strokeLinecap="round">
          <line x1="20" y1="4.5" x2="20" y2="8" />
          <line x1="35.5" y1="20" x2="32" y2="20" />
          <line x1="20" y1="35.5" x2="20" y2="32" />
          <line x1="4.5" y1="20" x2="8" y2="20" />
        </g>
        {/* Sweeping hand — rotates continuously */}
        <g style={{ transformOrigin: "20px 20px", animation: "fwt-sweep 1.1s linear infinite" }}>
          <line
            x1="20"
            y1="20"
            x2="20"
            y2="7"
            stroke="#1A1206"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          {/* Counterweight tail */}
          <line
            x1="20"
            y1="20"
            x2="20"
            y2="24"
            stroke="#1A1206"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>
        {/* Center cap */}
        <circle cx="20" cy="20" r="2" fill="#1A1206" />
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
