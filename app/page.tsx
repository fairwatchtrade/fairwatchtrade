'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [time, setTime] = useState({ hourDeg: -90, minDeg: -90, secDeg: -90 });
  const [email, setEmail] = useState('');
  const [isBuyer, setIsBuyer] = useState(false);
  const [isSeller, setIsSeller] = useState(false);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [waitlistError, setWaitlistError] = useState('');

  const handleWaitlist = async () => {
    if (!email) { setWaitlistError('Please enter your email'); return; }
    if (!isBuyer && !isSeller) { setWaitlistError('Please select buyer, seller, or both'); return; }
    setWaitlistLoading(true);
    setWaitlistError('');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, isBuyer, isSeller }),
      });
      if (!res.ok) throw new Error('Failed');
      setWaitlistDone(true);
    } catch {
      setWaitlistError('Something went wrong. Please try again.');
    } finally {
      setWaitlistLoading(false);
    }
  };

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
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[var(--ink)]">

      {/* Movement background art */}
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

      {/* ── ZONE 1 — HERO ──
          Inline styles guarantee spacing regardless of Tailwind JIT compilation.
      ── */}
      <div
        className="relative z-[1] flex flex-col items-center px-6 text-center"
        style={{ paddingTop: '72px', paddingBottom: '40px' }}
      >

        {/* Gap between market bar and eyebrow — inline guaranteed */}
        <div className="mb-8 font-[Inter] text-[10px] uppercase tracking-[4px] text-[var(--gold-subtle)]">
          Independent &amp; Boutique Watchmakers Only
        </div>

        <div className="mx-auto mb-9 w-full max-w-[180px]">
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
            <g style={{ transformOrigin: '110px 110px', transform: `rotate(${hourDeg}deg)` }}>
              <line x1="110" y1="110" x2="110" y2="48" stroke="#E8E4DC" strokeWidth="1.2" strokeLinecap="round" />
            </g>
            <g style={{ transformOrigin: '110px 110px', transform: `rotate(${minDeg}deg)` }}>
              <line x1="110" y1="110" x2="110" y2="34" stroke="#E8E4DC" strokeWidth="1" strokeLinecap="round" />
            </g>
            <g className="second-hand" style={{ transformOrigin: '110px 110px', transform: `rotate(${secDeg}deg)` }}>
              <line x1="110" y1="122" x2="110" y2="40" stroke="#C9A84C" strokeWidth="0.8" strokeLinecap="round" opacity="0.7" />
            </g>
            <circle cx="110" cy="110" r="3" fill="#C9A84C" />
            <circle cx="110" cy="110" r="1.5" fill="#0D0F14" />
          </svg>
        </div>

        <h1 className="mb-4 max-w-[540px] font-display text-[40px] font-light leading-[1.3] tracking-[0.3px] text-[var(--platinum)] sm:text-[48px]">
          A marketplace <span className="text-[var(--gold)]">worthy</span>
          <br />
          of the watches within it.
        </h1>

        <p className="mb-9 max-w-[400px] font-display text-[16px] font-light italic leading-[1.8] text-[var(--slate)]">
          Independent and boutique watchmakers only. One flat fee. No hidden costs. No compromises.
        </p>

        <div className="fw-rule" />

      </div>

      {/* ── GUARANTEED SPACER between Zone 1 and Zone 2 ── */}
      <div style={{ height: '56px', flexShrink: 0 }} />

      {/* ── ZONE 2 — WAITLIST ── */}
      <div className="relative z-[1] flex flex-col items-center px-6">

        <p className="mb-5 text-center text-[10px] uppercase tracking-[3px] text-[var(--muted)]">
          Launching Soon — Get Early Access
        </p>

        <div className="mb-5 flex justify-center gap-6">
          {[
            { label: 'I want to buy', key: 'buyer' },
            { label: 'I want to sell', key: 'seller' },
          ].map(({ label, key }) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 text-[11px] tracking-[0.5px] text-[var(--slate)]"
            >
              <input
                type="checkbox"
                checked={key === 'buyer' ? isBuyer : isSeller}
                onChange={e => key === 'buyer' ? setIsBuyer(e.target.checked) : setIsSeller(e.target.checked)}
                style={{ accentColor: '#C9A84C', width: '14px', height: '14px', cursor: 'pointer' }}
              />
              {label}
            </label>
          ))}
        </div>

        <div className="w-full max-w-[420px]">
          <div className="flex gap-3">
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="fw-input flex-1"
            />
            <button
              onClick={handleWaitlist}
              disabled={waitlistLoading || waitlistDone}
              className="fw-btn-primary whitespace-nowrap"
            >
              {waitlistDone ? "You're In ✦" : waitlistLoading ? '...' : 'Notify Me'}
            </button>
          </div>

          {waitlistError && (
            <p className="mt-3 text-center text-[11px] text-[var(--danger)]">
              {waitlistError}
            </p>
          )}
        </div>

      </div>

      {/* ── FOOTER TAGLINE — guaranteed 48px below button row ── */}
      <p
        className="relative z-[1] text-center text-[9px] uppercase tracking-[3px] text-[var(--ghost)]"
        style={{ marginTop: '48px', paddingBottom: '48px' }}
      >
        For independent &amp; boutique watchmakers
      </p>

    </main>
  );
}
