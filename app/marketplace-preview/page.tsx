'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function MarketplaceHome() {
  const [time, setTime] = useState({ hourDeg: -90, minDeg: -90, secDeg: -90 });

  useEffect(() => {
    function calcTime() {
      const now = new Date();
      const hours = now.getHours() % 12;
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      setTime({
        hourDeg: (hours * 30) + (minutes * 0.5),
        minDeg: (minutes * 6) + (seconds * 0.1),
        secDeg: (seconds * 6) - 90,
      });
    }
    calcTime();
    const interval = setInterval(calcTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const { hourDeg, minDeg, secDeg } = time;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--ink)]">

      {/* Movement background art — right side, copied verbatim from prototype */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-10%] top-[40%] w-[55%] max-w-[560px] -translate-y-1/2 opacity-[0.025]"
      >
        <svg viewBox="0 0 500 500" fill="none" className="h-auto w-full">
          <circle cx="250" cy="250" r="230" stroke="white" strokeWidth="0.4" />
          <circle cx="250" cy="250" r="185" stroke="white" strokeWidth="0.4" />
          <circle cx="250" cy="250" r="140" stroke="white" strokeWidth="0.4" />
          <circle cx="250" cy="250" r="95" stroke="white" strokeWidth="0.4" />
          <circle cx="250" cy="250" r="50" stroke="white" strokeWidth="0.4" />
          <line x1="250" y1="20" x2="250" y2="55" stroke="white" strokeWidth="0.4" />
          <line x1="250" y1="445" x2="250" y2="480" stroke="white" strokeWidth="0.4" />
          <line x1="20" y1="250" x2="55" y2="250" stroke="white" strokeWidth="0.4" />
          <line x1="445" y1="250" x2="480" y2="250" stroke="white" strokeWidth="0.4" />
          <line x1="250" y1="250" x2="250" y2="100" stroke="white" strokeWidth="0.9" />
          <line x1="250" y1="250" x2="315" y2="250" stroke="white" strokeWidth="0.7" />
          <circle cx="250" cy="250" r="4" fill="white" />
        </svg>
      </div>

      {/* HERO */}
      <div className="relative flex flex-col items-center px-10 py-[52px] text-center">
        <div className="mb-8 text-[10px] uppercase tracking-[4px] text-[var(--gold-subtle)]">
          Independent &amp; Boutique Watchmakers Only
        </div>

        {/* Hero clock — 220 viewBox from prototype, real-time hands applied */}
        <div className="mx-auto mb-9 w-full max-w-[220px] max-[520px]:max-w-[72vw]">
          <svg viewBox="0 0 220 220" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="FairWatchTrade clock" className="block h-auto w-full">
            <circle cx="110" cy="110" r="108" stroke="rgba(201,168,76,0.12)" strokeWidth="0.5" />
            <circle cx="110" cy="110" r="100" stroke="rgba(201,168,76,0.28)" strokeWidth="1" />
            <circle cx="110" cy="110" r="93" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            <line x1="110" y1="16" x2="110" y2="26" stroke="#C9A84C" strokeWidth="1.5" />
            <line x1="110" y1="194" x2="110" y2="204" stroke="#C9A84C" strokeWidth="1.5" />
            <line x1="16" y1="110" x2="26" y2="110" stroke="#C9A84C" strokeWidth="1.5" />
            <line x1="194" y1="110" x2="204" y2="110" stroke="#C9A84C" strokeWidth="1.5" />
            <line x1="158.4" y1="21.6" x2="153.4" y2="30.3" stroke="rgba(201,168,76,0.3)" strokeWidth="0.8" />
            <line x1="198.4" y1="61.6" x2="189.7" y2="66.6" stroke="rgba(201,168,76,0.3)" strokeWidth="0.8" />
            <line x1="198.4" y1="158.4" x2="189.7" y2="153.4" stroke="rgba(201,168,76,0.3)" strokeWidth="0.8" />
            <line x1="158.4" y1="198.4" x2="153.4" y2="189.7" stroke="rgba(201,168,76,0.3)" strokeWidth="0.8" />
            <line x1="61.6" y1="198.4" x2="66.6" y2="189.7" stroke="rgba(201,168,76,0.3)" strokeWidth="0.8" />
            <line x1="21.6" y1="158.4" x2="30.3" y2="153.4" stroke="rgba(201,168,76,0.3)" strokeWidth="0.8" />
            <line x1="21.6" y1="61.6" x2="30.3" y2="66.6" stroke="rgba(201,168,76,0.3)" strokeWidth="0.8" />
            <line x1="61.6" y1="21.6" x2="66.6" y2="30.3" stroke="rgba(201,168,76,0.3)" strokeWidth="0.8" />
            <text x="110" y="50" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="11" fill="rgba(232,228,220,0.55)" letterSpacing="1">XII</text>
            <text x="170" y="114" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="11" fill="rgba(232,228,220,0.38)" letterSpacing="1">III</text>
            <text x="110" y="178" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="11" fill="rgba(232,228,220,0.38)" letterSpacing="1">VI</text>
            <text x="50" y="114" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="11" fill="rgba(232,228,220,0.38)" letterSpacing="1">IX</text>
            <text x="110" y="96" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="8" fill="rgba(201,168,76,0.4)" letterSpacing="2">FW</text>
            <text x="110" y="106" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="5.5" fill="rgba(201,168,76,0.28)" letterSpacing="1.5">FAIRWATCHTRADE</text>

            {/* Hour hand — real time */}
            <g style={{ transformOrigin: '110px 110px', transform: `rotate(${hourDeg}deg)` }}>
              <line x1="110" y1="110" x2="110" y2="48" stroke="#E8E4DC" strokeWidth="1.2" strokeLinecap="round" />
            </g>

            {/* Minute hand — real time */}
            <g style={{ transformOrigin: '110px 110px', transform: `rotate(${minDeg}deg)` }}>
              <line x1="110" y1="110" x2="110" y2="34" stroke="#E8E4DC" strokeWidth="1" strokeLinecap="round" />
            </g>

            {/* Second hand — real time + CSS sweep */}
            <g className="second-hand" style={{ transformOrigin: '110px 110px', transform: `rotate(${secDeg}deg)` }}>
              <line x1="110" y1="122" x2="110" y2="40" stroke="#C9A84C" strokeWidth="0.8" strokeLinecap="round" opacity="0.7" />
            </g>

            <circle cx="110" cy="110" r="3" fill="#C9A84C" />
            <circle cx="110" cy="110" r="1.5" fill="#0D0F14" />
          </svg>
        </div>

        <h1 className="mb-4 max-w-[540px] text-center font-display text-[40px] font-light leading-[1.3] tracking-[0.3px] text-[var(--platinum)]">
          A marketplace <span className="text-[var(--gold)]">worthy</span>
          <br />
          of the watches within it.
        </h1>

        <p className="mb-9 max-w-[400px] text-center font-display text-[16px] font-light italic leading-[1.8] text-[var(--slate)]">
          Independent and boutique watchmakers only. One flat fee. No hidden costs. No compromises.
        </p>

        <div className="fw-rule mb-9" />

        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/browse" className="fw-btn-primary whitespace-nowrap">
            Browse Watches
          </Link>
          <Link
            href="/sell"
            className="cursor-pointer whitespace-nowrap border border-[var(--border-mid)] bg-transparent px-8 py-[13px] font-[Inter] text-[10px] uppercase tracking-[2.5px] text-[var(--slate)]"
          >
            List a Watch
          </Link>
        </div>
      </div>

      {/* SECTION DIVIDER */}
      <div className="mb-9 flex items-center gap-5 px-10">
        <div className="h-px flex-1 bg-[var(--border-faint)]" />
        <div className="whitespace-nowrap text-[10px] uppercase tracking-[4px] text-[var(--muted)]">
          Featured Listings
        </div>
        <div className="h-px flex-1 bg-[var(--border-faint)]" />
      </div>

      {/* LISTINGS */}
      <div className="grid grid-cols-1 gap-px px-8 pb-[72px] sm:grid-cols-3">

        {/* Card 1 — Parmigiani Fleurier */}
        <div className="cursor-pointer border-b border-[var(--border-faint)] p-8 last:border-r-0 sm:border-b-0 sm:border-r">
          <div className="mx-auto mb-6 h-[90px] w-[90px]">
            <svg viewBox="0 0 100 100" fill="none" className="h-full w-full">
              <circle cx="50" cy="50" r="48" stroke="rgba(201,168,76,0.18)" strokeWidth="0.5" />
              <circle cx="50" cy="50" r="41" stroke="rgba(201,168,76,0.1)" strokeWidth="0.5" />
              <line x1="50" y1="8" x2="50" y2="16" stroke="rgba(201,168,76,0.45)" strokeWidth="1" />
              <line x1="50" y1="84" x2="50" y2="92" stroke="rgba(201,168,76,0.45)" strokeWidth="1" />
              <line x1="8" y1="50" x2="16" y2="50" stroke="rgba(201,168,76,0.45)" strokeWidth="1" />
              <line x1="84" y1="50" x2="92" y2="50" stroke="rgba(201,168,76,0.45)" strokeWidth="1" />
              <line x1="50" y1="50" x2="50" y2="22" stroke="rgba(232,228,220,0.7)" strokeWidth="1" strokeLinecap="round" />
              <line x1="50" y1="50" x2="68" y2="50" stroke="rgba(232,228,220,0.6)" strokeWidth="0.8" strokeLinecap="round" />
              <line x1="50" y1="50" x2="50" y2="72" stroke="rgba(201,168,76,0.5)" strokeWidth="0.6" strokeLinecap="round" />
              <circle cx="50" cy="50" r="2.5" fill="#C9A84C" opacity="0.8" />
              <text x="50" y="38" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="6" fill="rgba(201,168,76,0.35)" letterSpacing="1">PF</text>
            </svg>
          </div>
          <div className="mb-[7px] text-[9px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
            Parmigiani Fleurier
          </div>
          <div className="mb-[5px] font-display text-[17px] font-light leading-[1.25] text-[var(--platinum)]">
            Tonda Métrographe
          </div>
          <div className="mb-[22px] text-[9px] tracking-[0.4px] text-[var(--muted)]">
            PFC274 · Abyss Blue
          </div>
          <div className="flex items-end justify-between">
            <div className="font-display text-[20px] font-light text-[var(--platinum-dim)]">$11,111</div>
            <div className="text-right">
              <span className="mb-[3px] block text-[8.5px] uppercase tracking-[1.5px] text-[var(--muted)]">
                Excellent
              </span>
            </div>
          </div>
        </div>

        {/* Card 2 — F.P. Journe */}
        <div className="cursor-pointer border-b border-[var(--border-faint)] p-8 last:border-r-0 sm:border-b-0 sm:border-r">
          <div className="mx-auto mb-6 h-[90px] w-[90px]">
            <svg viewBox="0 0 100 100" fill="none" className="h-full w-full">
              <circle cx="50" cy="50" r="48" stroke="rgba(201,168,76,0.18)" strokeWidth="0.5" />
              <circle cx="50" cy="50" r="41" stroke="rgba(201,168,76,0.1)" strokeWidth="0.5" />
              <line x1="50" y1="8" x2="50" y2="16" stroke="rgba(201,168,76,0.45)" strokeWidth="1" />
              <line x1="50" y1="84" x2="50" y2="92" stroke="rgba(201,168,76,0.45)" strokeWidth="1" />
              <line x1="8" y1="50" x2="16" y2="50" stroke="rgba(201,168,76,0.45)" strokeWidth="1" />
              <line x1="84" y1="50" x2="92" y2="50" stroke="rgba(201,168,76,0.45)" strokeWidth="1" />
              <line x1="50" y1="50" x2="35" y2="27" stroke="rgba(232,228,220,0.7)" strokeWidth="1" strokeLinecap="round" />
              <line x1="50" y1="50" x2="67" y2="44" stroke="rgba(232,228,220,0.6)" strokeWidth="0.8" strokeLinecap="round" />
              <line x1="50" y1="50" x2="50" y2="72" stroke="rgba(201,168,76,0.5)" strokeWidth="0.6" strokeLinecap="round" />
              <circle cx="50" cy="50" r="2.5" fill="#C9A84C" opacity="0.8" />
              <text x="50" y="38" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="6" fill="rgba(201,168,76,0.35)" letterSpacing="1">FPJ</text>
            </svg>
          </div>
          <div className="mb-[7px] text-[9px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
            F.P. Journe
          </div>
          <div className="mb-[5px] font-display text-[17px] font-light leading-[1.25] text-[var(--platinum)]">
            Chronomètre Bleu
          </div>
          <div className="mb-[22px] text-[9px] tracking-[0.4px] text-[var(--muted)]">
            CBT · Tantalum
          </div>
          <div className="flex items-end justify-between">
            <div className="font-display text-[20px] font-light text-[var(--platinum-dim)]">$28,500</div>
            <div className="text-right">
              <span className="mb-[3px] block text-[8.5px] uppercase tracking-[1.5px] text-[var(--muted)]">
                Mint
              </span>
            </div>
          </div>
        </div>

        {/* Card 3 — H. Moser & Cie */}
        <div className="cursor-pointer border-b border-[var(--border-faint)] p-8 last:border-r-0 sm:border-b-0 sm:border-r">
          <div className="mx-auto mb-6 h-[90px] w-[90px]">
            <svg viewBox="0 0 100 100" fill="none" className="h-full w-full">
              <circle cx="50" cy="50" r="48" stroke="rgba(201,168,76,0.18)" strokeWidth="0.5" />
              <circle cx="50" cy="50" r="41" stroke="rgba(201,168,76,0.1)" strokeWidth="0.5" />
              <line x1="50" y1="8" x2="50" y2="16" stroke="rgba(201,168,76,0.45)" strokeWidth="1" />
              <line x1="50" y1="84" x2="50" y2="92" stroke="rgba(201,168,76,0.45)" strokeWidth="1" />
              <line x1="8" y1="50" x2="16" y2="50" stroke="rgba(201,168,76,0.45)" strokeWidth="1" />
              <line x1="84" y1="50" x2="92" y2="50" stroke="rgba(201,168,76,0.45)" strokeWidth="1" />
              <line x1="50" y1="50" x2="50" y2="24" stroke="rgba(232,228,220,0.7)" strokeWidth="1" strokeLinecap="round" />
              <line x1="50" y1="50" x2="64" y2="60" stroke="rgba(232,228,220,0.6)" strokeWidth="0.8" strokeLinecap="round" />
              <line x1="50" y1="50" x2="50" y2="72" stroke="rgba(201,168,76,0.5)" strokeWidth="0.6" strokeLinecap="round" />
              <circle cx="50" cy="50" r="2.5" fill="#C9A84C" opacity="0.8" />
              <text x="50" y="38" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="6" fill="rgba(201,168,76,0.35)" letterSpacing="1">HM</text>
            </svg>
          </div>
          <div className="mb-[7px] text-[9px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
            H. Moser &amp; Cie
          </div>
          <div className="mb-[5px] font-display text-[17px] font-light leading-[1.25] text-[var(--platinum)]">
            Streamliner
          </div>
          <div className="mb-[22px] text-[9px] tracking-[0.4px] text-[var(--muted)]">
            6200-0100 · Fumé
          </div>
          <div className="flex items-end justify-between">
            <div className="font-display text-[20px] font-light text-[var(--platinum-dim)]">$14,200</div>
            <div className="text-right">
              <span className="mb-[3px] block text-[8.5px] uppercase tracking-[1.5px] text-[var(--muted)]">
                Excellent
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
