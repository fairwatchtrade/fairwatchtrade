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
    <main style={{
      minHeight: '100vh',
      background: '#0D0F14',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      position: 'relative',
      overflow: 'hidden',
    }}>

      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Watch Dial — real time */}
      <div className="fade-up fade-up-1" style={{ marginBottom: '3rem' }}>
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="60" cy="60" r="58" stroke="#C9A84C" strokeWidth="0.75" opacity="0.4" />
          <circle cx="60" cy="60" r="52" stroke="#C9A84C" strokeWidth="0.25" opacity="0.2" />

          {[0,30,60,90,120,150,180,210,240,270,300,330].map((deg, i) => {
            const rad = (deg - 90) * Math.PI / 180;
            const isMain = i % 3 === 0;
            const r1 = isMain ? 44 : 46;
            const r2 = isMain ? 50 : 49;
            const x1 = 60 + r1 * Math.cos(rad);
            const y1 = 60 + r1 * Math.sin(rad);
            const x2 = 60 + r2 * Math.cos(rad);
            const y2 = 60 + r2 * Math.sin(rad);
            return (
              <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#C9A84C"
                strokeWidth={isMain ? "1.5" : "0.75"}
                opacity={isMain ? "0.8" : "0.4"}
              />
            );
          })}

          {/* Hour hand — real time */}
          <g style={{ transformOrigin: '60px 60px', transform: `rotate(${hourDeg}deg)` }}>
            <line x1="60" y1="60" x2="60" y2="26" stroke="#E8E4DC" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
            <line x1="60" y1="60" x2="60" y2="70" stroke="#E8E4DC" strokeWidth="2.5" strokeLinecap="round" opacity="0.2" />
          </g>

          {/* Minute hand — real time */}
          <g style={{ transformOrigin: '60px 60px', transform: `rotate(${minDeg}deg)` }}>
            <line x1="60" y1="60" x2="60" y2="18" stroke="#E8E4DC" strokeWidth="1.5" strokeLinecap="round" opacity="0.65" />
            <line x1="60" y1="60" x2="60" y2="72" stroke="#E8E4DC" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
          </g>

          {/* Second hand — animated CSS sweep */}
          <g className="second-hand" style={{ transformOrigin: '60px 60px', transform: `rotate(${secDeg}deg)` }}>
            <line x1="60" y1="66" x2="60" y2="20" stroke="#C9A84C" strokeWidth="0.75" strokeLinecap="round" />
            <circle cx="60" cy="66" r="2.5" fill="#C9A84C" />
          </g>

          <circle cx="60" cy="60" r="2" fill="#C9A84C" opacity="0.9" />

          <text x="60" y="75" textAnchor="middle"
            fill="#8A8F9E" fontSize="5" fontFamily="Inter, sans-serif"
            fontWeight="300" letterSpacing="2">
            FAIRWATCHTRADE
          </text>
        </svg>
      </div>

      {/* Wordmark */}
      <div className="fade-up fade-up-2" style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <h1 className="font-display" style={{
          fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
          fontWeight: 300,
          letterSpacing: '0.02em',
          color: '#E8E4DC',
          lineHeight: 1.1,
        }}>
          Fair<span style={{ color: '#C9A84C' }}>Watch</span>Trade
        </h1>
      </div>

      {/* Tagline */}
      <div className="fade-up fade-up-3" style={{ textAlign: 'center', marginBottom: '3.5rem', maxWidth: '480px' }}>
        <p className="font-display" style={{
          fontSize: 'clamp(1.1rem, 2.5vw, 1.5rem)',
          fontWeight: 300,
          fontStyle: 'italic',
          color: '#8A8F9E',
          lineHeight: 1.6,
        }}>
          A marketplace built for serious collectors.<br />
          One flat fee. No games.
        </p>
      </div>

      {/* Proposition */}
      <div className="fade-up fade-up-3" style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        marginBottom: '3.5rem',
        padding: '1.25rem 2rem',
        border: '1px solid rgba(201,168,76,0.2)',
        borderRadius: '2px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="font-display" style={{
            fontSize: '3rem',
            fontWeight: 300,
            color: '#C9A84C',
            lineHeight: 1,
          }}>5%</div>
          <div style={{
            fontSize: '0.65rem',
            letterSpacing: '0.15em',
            color: '#8A8F9E',
            marginTop: '0.25rem',
          }}>FLAT FEE</div>
        </div>
        <div style={{
          width: '1px',
          height: '40px',
          background: 'rgba(201,168,76,0.2)',
        }} />
        <div style={{
          fontSize: '0.8rem',
          color: '#8A8F9E',
          lineHeight: 1.7,
          maxWidth: '220px',
          letterSpacing: '0.02em',
        }}>
          Every listing. Every sale.<br />
          Independent & boutique makers only.
        </div>
      </div>

      {/* Email capture */}
      <div className="fade-up fade-up-4" style={{ width: '100%', maxWidth: '420px', marginBottom: '2rem' }}>
        <p style={{
          fontSize: '0.7rem',
          letterSpacing: '0.15em',
          color: '#8A8F9E',
          textAlign: 'center',
          marginBottom: '1rem',
          textTransform: 'uppercase',
        }}>
          Launching Soon — Get Early Access
        </p>

        {/* Buyer/Seller checkboxes */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '1.5rem',
          marginBottom: '1rem',
        }}>
          {[
            { label: 'I want to buy', key: 'buyer' },
            { label: 'I want to sell', key: 'seller' },
          ].map(({ label, key }) => (
            <label key={key} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.75rem',
              color: '#8A8F9E',
              letterSpacing: '0.05em',
            }}>
              <input
                type="checkbox"
                checked={key === 'buyer' ? isBuyer : isSeller}
                onChange={e => key === 'buyer' ? setIsBuyer(e.target.checked) : setIsSeller(e.target.checked)}
                style={{
                  accentColor: '#C9A84C',
                  width: '14px',
                  height: '14px',
                  cursor: 'pointer',
                }}
              />
              {label}
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0', width: '100%' }}>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{
              flex: 1,
              padding: '0.875rem 1.25rem',
              background: '#13151C',
              border: '1px solid rgba(201,168,76,0.25)',
              borderRight: 'none',
              color: '#E8E4DC',
              fontSize: '0.875rem',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 300,
              outline: 'none',
              borderRadius: '2px 0 0 2px',
            }}
          />
          <button
            onClick={handleWaitlist}
            disabled={waitlistLoading || waitlistDone}
            style={{
              padding: '0.875rem 1.5rem',
              background: waitlistDone ? '#4CAF7D' : '#C9A84C',
              border: 'none',
              color: '#0D0F14',
              fontSize: '0.75rem',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 500,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: waitlistLoading || waitlistDone ? 'default' : 'pointer',
              borderRadius: '0 2px 2px 0',
              whiteSpace: 'nowrap',
              transition: 'background 0.3s',
            }}
          >
            {waitlistDone ? "You're In ✦" : waitlistLoading ? '...' : 'Notify Me'}
          </button>
        </div>
        {waitlistError && (
          <p style={{ fontSize: '0.7rem', color: '#C94C4C', textAlign: 'center', marginTop: '0.5rem' }}>
            {waitlistError}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="fade-up fade-up-5" style={{ textAlign: 'center' }}>
        <p style={{
          fontSize: '0.65rem',
          letterSpacing: '0.12em',
          color: 'rgba(138,143,158,0.5)',
          textTransform: 'uppercase',
        }}>
          For independent & boutique watchmakers
        </p>
      </div>

    </main>
  );
}
