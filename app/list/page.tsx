'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { EvaluationResult } from '@/lib/evaluationPrompt';

const INK = '#0D0F14';
const PLATINUM = '#E8E4DC';
const GOLD = '#C9A84C';
const SLATE = '#8A8F9E';
const SURFACE = '#13151C';
const GREEN = '#4CAF7D';
const AMBER = '#E8A838';
const RED = '#C94C4C';

// Known gray market magnets for instant soft warning
const INSTANT_REJECT = ['rolex', 'tudor'];
const INSTANT_WARN = ['patek', 'audemars', 'ap '];

function getBrandSignal(brand: string): { color: string; message: string } | null {
  const b = brand.toLowerCase().trim();
  if (!b || b.length < 3) return null;

  if (INSTANT_REJECT.some(r => b.includes(r))) {
    return {
      color: RED,
      message: "Rolex and Tudor have strong existing marketplaces — FairWatchTrade focuses on independent and boutique makers. We'll complete the evaluation, but this may not be the right fit.",
    };
  }
  if (INSTANT_WARN.some(w => b.includes(w))) {
    return {
      color: AMBER,
      message: "Some references from this maker are accepted — certain popular references may not qualify. Tell us the reference and we'll evaluate carefully.",
    };
  }
  if (b.length >= 3) {
    return {
      color: GREEN,
      message: "Looks promising — fill in the details and we'll evaluate this piece.",
    };
  }
  return null;
}

function SmallSecondsSpinner() {
  const [time, setTime] = useState({ hourDeg: -90, minDeg: -90 });

  useEffect(() => {
    function calcTime() {
      const now = new Date();
      const hours = now.getHours() % 12;
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      setTime({
        hourDeg: (hours * 30) + (minutes * 0.5),
        minDeg: (minutes * 6) + (seconds * 0.1),
      });
    }
    calcTime();
    const interval = setInterval(calcTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const { hourDeg, minDeg } = time;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '3rem 0',
      gap: '1.5rem',
    }}>
      <svg width="180" height="180" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg">

        {/* Outer bezel */}
        <circle cx="90" cy="90" r="86" stroke="#C9A84C" strokeWidth="1.5" opacity="0.4" fill="#0D0F14" />
        <circle cx="90" cy="90" r="80" stroke="#C9A84C" strokeWidth="0.4" opacity="0.15" fill="none" />

        {/* Subtle guilloché radial texture */}
        {Array.from({length: 48}).map((_, i) => {
          const rad = (i * 7.5 - 90) * Math.PI / 180;
          return (
            <line key={i}
              x1={90 + 22 * Math.cos(rad)} y1={90 + 22 * Math.sin(rad)}
              x2={90 + 68 * Math.cos(rad)} y2={90 + 68 * Math.sin(rad)}
              stroke="#C9A84C" strokeWidth="0.2" opacity="0.07"
            />
          );
        })}

        {/* Main dial hour markers */}
        {[0,30,60,90,120,150,180,210,240,270,300,330].map((deg, i) => {
          const rad = (deg - 90) * Math.PI / 180;
          const isMain = i % 3 === 0;
          const r1 = isMain ? 62 : 68;
          const r2 = isMain ? 74 : 72;
          const x1 = 90 + r1 * Math.cos(rad);
          const y1 = 90 + r1 * Math.sin(rad);
          const x2 = 90 + r2 * Math.cos(rad);
          const y2 = 90 + r2 * Math.sin(rad);
          return (
            <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#E8E4DC"
              strokeWidth={isMain ? "3" : "1"}
              opacity={isMain ? "0.9" : "0.35"}
            />
          );
        })}

        {/* Brand text */}
        <text x="90" y="70" textAnchor="middle"
          fill="#E8E4DC" fontSize="7" fontFamily="Cormorant Garamond, serif"
          fontWeight="300" letterSpacing="3" opacity="0.8">
          FAIRWATCHTRADE
        </text>
        <text x="90" y="80" textAnchor="middle"
          fill="#C9A84C" fontSize="5" fontFamily="Inter, sans-serif"
          fontWeight="300" letterSpacing="2" opacity="0.5">
          GENÈVE
        </text>

        {/* ── OFFSET SMALL SECONDS SUBDIAL at 6 o'clock — drawn BEFORE main hands ── */}
        <circle cx="90" cy="128" r="22" fill="#13151C" stroke="#C9A84C" strokeWidth="0.75" opacity="0.7" />
        <circle cx="90" cy="128" r="19" stroke="#C9A84C" strokeWidth="0.25" opacity="0.2" fill="none" />

        {/* Subdial markers — 60 tick marks */}
        {Array.from({length: 60}).map((_, i) => {
          const deg = i * 6;
          const rad = (deg - 90) * Math.PI / 180;
          const isMain = i % 5 === 0;
          const r1 = isMain ? 13 : 16;
          const r2 = isMain ? 18 : 17.5;
          const x1 = 90 + r1 * Math.cos(rad);
          const y1 = 128 + r1 * Math.sin(rad);
          const x2 = 90 + r2 * Math.cos(rad);
          const y2 = 128 + r2 * Math.sin(rad);
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#C9A84C"
              strokeWidth={isMain ? "1.2" : "0.4"}
              opacity={isMain ? "0.8" : "0.3"}
            />
          );
        })}

        {/* Subdial center */}
        <circle cx="90" cy="128" r="2" fill="#C9A84C" opacity="0.9" />

        {/* ── ANIMATED small seconds hand ── */}
        <g style={{
          transformOrigin: '90px 128px',
          animation: 'smallSpin 1s linear infinite',
        }}>
          <line x1="90" y1="128" x2="90" y2="135"
            stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
          <line x1="90" y1="128" x2="90" y2="112"
            stroke="#C9A84C" strokeWidth="1" strokeLinecap="round" opacity="0.95" />
        </g>

        {/* Hour hand — real time — drawn ABOVE subdial ── */}
        <g style={{ transformOrigin: '90px 90px', transform: `rotate(${hourDeg}deg)` }}>
          <line x1="90" y1="90" x2="90" y2="34"
            stroke="#E8E4DC" strokeWidth="3.5" strokeLinecap="round" opacity="0.65" />
          <line x1="90" y1="90" x2="90" y2="104"
            stroke="#E8E4DC" strokeWidth="3.5" strokeLinecap="round" opacity="0.2" />
        </g>

        {/* Minute hand — real time — drawn ABOVE subdial ── */}
        <g style={{ transformOrigin: '90px 90px', transform: `rotate(${minDeg}deg)` }}>
          <line x1="90" y1="90" x2="90" y2="24"
            stroke="#E8E4DC" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
          <line x1="90" y1="90" x2="90" y2="106"
            stroke="#E8E4DC" strokeWidth="2" strokeLinecap="round" opacity="0.2" />
        </g>

        {/* Center cap — on top of everything */}
        <circle cx="90" cy="90" r="4" fill="#C9A84C" opacity="0.95" />
        <circle cx="90" cy="90" r="2" fill="#0D0F14" opacity="0.8" />

      </svg>

      <p style={{
        fontFamily: 'Cormorant Garamond, serif',
        fontSize: '1.25rem',
        fontWeight: 300,
        fontStyle: 'italic',
        color: '#8A8F9E',
        letterSpacing: '0.05em',
      }}>
        Evaluating your piece...
      </p>

      <style>{`
        @keyframes smallSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function ListPage() {
  const [form, setForm] = useState({
    brand: '',
    reference: '',
    year: '',
    condition: '',
    asking_price: '',
    provenance: '',
    description: '',
  });

  const [brandSignal, setBrandSignal] = useState<{ color: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightFields, setHighlightFields] = useState<string[]>([]);

  const refs = {
    brand: useRef<HTMLInputElement>(null),
    reference: useRef<HTMLInputElement>(null),
    year: useRef<HTMLInputElement>(null),
    condition: useRef<HTMLSelectElement>(null),
    asking_price: useRef<HTMLInputElement>(null),
    provenance: useRef<HTMLTextAreaElement>(null),
    description: useRef<HTMLTextAreaElement>(null),
  };

  const handleCompleteListingClick = useCallback(() => {
    // Find empty fields
    const empty: string[] = [];
    if (!form.reference) empty.push('reference');
    if (!form.year) empty.push('year');
    if (!form.condition) empty.push('condition');
    if (!form.asking_price) empty.push('asking_price');
    if (!form.provenance) empty.push('provenance');

    setHighlightFields(empty);
    setResult(null);
    setError(null);

    // Scroll to first empty field after render
    setTimeout(() => {
      const firstEmpty = empty[0] as keyof typeof refs;
      if (firstEmpty && refs[firstEmpty]?.current) {
        refs[firstEmpty].current!.scrollIntoView({ behavior: 'smooth', block: 'center' });
        refs[firstEmpty].current!.focus();
      }
    }, 100);
  }, [form, refs]);

  const handleBrandChange = useCallback((val: string) => {
    setForm(f => ({ ...f, brand: val }));
    setBrandSignal(getBrandSignal(val));
    setResult(null);
  }, []);

  const handleSubmit = async () => {
    if (!form.brand) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          asking_price: form.asking_price ? parseFloat(form.asking_price) : undefined,
        }),
      });

      if (!res.ok) throw new Error('Evaluation failed');
      const data: EvaluationResult = await res.json();
      setResult(data);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const decisionColor = result ? {
    approved: GREEN,
    approved_with_guidance: GREEN,
    review_required: AMBER,
    not_accepted: RED,
  }[result.decision] : GOLD;

  const decisionLabel = result ? {
    approved: 'Approved',
    approved_with_guidance: 'Approved — A few questions',
    review_required: 'Under Review',
    not_accepted: 'Not a Current Fit',
  }[result.decision] : '';

  const inputStyle = (field?: string) => ({
    width: '100%',
    padding: '0.875rem 1rem',
    background: SURFACE,
    border: `1px solid ${field && highlightFields.includes(field) ? GOLD : 'rgba(201,168,76,0.2)'}`,
    borderRadius: '2px',
    color: PLATINUM,
    fontSize: '0.875rem',
    fontFamily: 'Inter, sans-serif',
    fontWeight: 300,
    outline: 'none',
    boxShadow: field && highlightFields.includes(field) ? `0 0 0 2px ${GOLD}30` : 'none',
    transition: 'border 0.2s, box-shadow 0.2s',
  });

  const labelStyle = {
    display: 'block',
    fontSize: '0.65rem',
    letterSpacing: '0.15em',
    color: SLATE,
    textTransform: 'uppercase' as const,
    marginBottom: '0.5rem',
  };

  return (
    <main style={{
      minHeight: '100vh',
      background: INK,
      color: PLATINUM,
      fontFamily: 'Inter, sans-serif',
      fontWeight: 300,
      padding: '3rem 1.5rem',
    }}>
      <div style={{ maxWidth: '560px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '3rem' }}>
          <a href="/" style={{
            fontSize: '0.65rem',
            letterSpacing: '0.15em',
            color: SLATE,
            textDecoration: 'none',
            textTransform: 'uppercase',
          }}>
            ← FairWatchTrade
          </a>
          <h1 style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: '2.5rem',
            fontWeight: 300,
            color: PLATINUM,
            marginTop: '1.5rem',
            lineHeight: 1.1,
          }}>
            {result ? 'Evaluation Complete' : 'List Your Watch'}
          </h1>
          {!result && !loading && (
          <p style={{
            color: SLATE,
            fontSize: '0.875rem',
            marginTop: '0.75rem',
            lineHeight: 1.7,
          }}>
            Tell us about your piece. We'll evaluate it against our curation standards and let you know if it's a fit.
          </p>
          )}
          {result && (
          <p style={{
            color: SLATE,
            fontSize: '0.875rem',
            marginTop: '0.75rem',
            lineHeight: 1.7,
            fontStyle: 'italic',
          }}>
            You've told us about your watch — here's what we found.
          </p>
          )}
        </div>

        {/* Loading spinner */}
        {loading && <SmallSecondsSpinner />}

        {/* Form */}
        {!result && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Brand — the key field */}
            <div>
              <label style={labelStyle}>Brand *</label>
              <input
                type="text"
                placeholder="e.g. Breguet, F.P. Journe, Omega..."
                value={form.brand}
                onChange={e => handleBrandChange(e.target.value)}
                ref={refs.brand}
                style={inputStyle('brand')}
              />
              {/* Real-time brand signal */}
              {brandSignal && (
                <div style={{
                  marginTop: '0.625rem',
                  padding: '0.5rem 1rem',
                  background: `${brandSignal.color}12`,
                  border: `1px solid ${brandSignal.color}30`,
                  borderRadius: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                }}>
                  <span style={{
                    fontSize: '0.9rem',
                    color: brandSignal.color,
                  }}>
                    {brandSignal.color === '#4CAF7D' ? '✦' : brandSignal.color === '#E8A838' ? '◈' : '◇'}
                  </span>
                  <p style={{
                    fontSize: '0.75rem',
                    color: brandSignal.color,
                    lineHeight: 1.5,
                    margin: 0,
                    letterSpacing: '0.05em',
                  }}>
                    {brandSignal.color === '#4CAF7D' 
                      ? 'Approved brand — fill in the details below'
                      : brandSignal.message}
                  </p>
                </div>
              )}
            </div>

            {/* Reference */}
            <div>
              <label style={labelStyle}>Reference Number</label>
              {highlightFields.includes('reference') && (
                <p style={{ fontSize: '0.7rem', color: GOLD, marginBottom: '0.4rem' }}>↑ Add this to complete your listing</p>
              )}
              <input
                type="text"
                placeholder="e.g. 7057BR, 5970G, Cal. 27-70..."
                value={form.reference}
                onChange={e => { setForm(f => ({ ...f, reference: e.target.value })); setHighlightFields(h => h.filter(f => f !== 'reference')); }}
                ref={refs.reference}
                style={inputStyle('reference')}
              />
            </div>

            {/* Year */}
            <div>
              <label style={labelStyle}>Year / Era</label>
              {highlightFields.includes('year') && (
                <p style={{ fontSize: '0.7rem', color: GOLD, marginBottom: '0.4rem' }}>↑ Add this to complete your listing</p>
              )}
              <input
                type="text"
                placeholder="e.g. 1968, circa 1990s, 2019..."
                value={form.year}
                onChange={e => { setForm(f => ({ ...f, year: e.target.value })); setHighlightFields(h => h.filter(f => f !== 'year')); }}
                ref={refs.year}
                style={inputStyle('year')}
              />
            </div>

            {/* Condition */}
            <div>
              <label style={labelStyle}>Condition</label>
              {highlightFields.includes('condition') && (
                <p style={{ fontSize: '0.7rem', color: GOLD, marginBottom: '0.4rem' }}>↑ Add this to complete your listing</p>
              )}
              <select
                value={form.condition}
                onChange={e => { setForm(f => ({ ...f, condition: e.target.value })); setHighlightFields(h => h.filter(f => f !== 'condition')); }}
                ref={refs.condition}
                style={{ ...inputStyle('condition'), cursor: 'pointer' }}
              >
                <option value="">Select condition...</option>
                <option value="New / Unworn">New / Unworn</option>
                <option value="Excellent — minimal wear">Excellent — minimal wear</option>
                <option value="Very Good — light wear">Very Good — light wear</option>
                <option value="Good — visible wear, no damage">Good — visible wear, no damage</option>
                <option value="Fair — wear and/or minor issues">Fair — wear and/or minor issues</option>
                <option value="Vintage patina — honest wear consistent with age">Vintage patina — honest wear consistent with age</option>
              </select>
            </div>

            {/* Asking price */}
            <div>
              <label style={labelStyle}>Asking Price (USD)</label>
              {highlightFields.includes('asking_price') && (
                <p style={{ fontSize: '0.7rem', color: GOLD, marginBottom: '0.4rem' }}>↑ Add this to complete your listing</p>
              )}
              <input
                type="number"
                placeholder="e.g. 12500"
                value={form.asking_price}
                onChange={e => { setForm(f => ({ ...f, asking_price: e.target.value })); setHighlightFields(h => h.filter(f => f !== 'asking_price')); }}
                ref={refs.asking_price}
                style={inputStyle('asking_price')}
              />
            </div>

            {/* Provenance */}
            <div>
              <label style={labelStyle}>Provenance & Documentation</label>
              {highlightFields.includes('provenance') && (
                <p style={{ fontSize: '0.7rem', color: GOLD, marginBottom: '0.4rem' }}>↑ Add this to complete your listing</p>
              )}
              <textarea
                placeholder="Box, papers, archive extracts, service records, purchase receipt, original owner story..."
                value={form.provenance}
                onChange={e => { setForm(f => ({ ...f, provenance: e.target.value })); setHighlightFields(h => h.filter(f => f !== 'provenance')); }}
                ref={refs.provenance}
                rows={3}
                style={{ ...inputStyle('provenance'), resize: 'vertical' }}
              />
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>Additional Details</label>
              <textarea
                placeholder="Anything else that makes this piece special — dial variants, historical significance, your story with it..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={5}
                style={{ ...inputStyle('description'), resize: 'vertical', minHeight: '120px' }}
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!form.brand || loading}
              style={{
                padding: '1rem',
                background: form.brand && !loading ? GOLD : 'rgba(201,168,76,0.3)',
                border: 'none',
                borderRadius: '2px',
                color: form.brand && !loading ? INK : SLATE,
                fontSize: '0.75rem',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 500,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                cursor: form.brand && !loading ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
            >
              Submit for Evaluation
            </button>

            {error && (
              <p style={{ color: RED, fontSize: '0.8rem', textAlign: 'center' }}>{error}</p>
            )}

            {/* Fee reminder */}
            <p style={{
              fontSize: '0.7rem',
              color: SLATE,
              textAlign: 'center',
              letterSpacing: '0.05em',
              lineHeight: 1.6,
            }}>
              FairWatchTrade charges a flat 5% on successful sales. No listing fees. No hidden costs.
            </p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div>
            {/* Decision card */}
            <div style={{
              padding: '2rem',
              border: `1px solid ${decisionColor}40`,
              borderRadius: '2px',
              background: `${decisionColor}08`,
              marginBottom: '1.5rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: decisionColor,
                }} />
                <span style={{
                  fontSize: '0.65rem',
                  letterSpacing: '0.15em',
                  color: decisionColor,
                  textTransform: 'uppercase',
                  fontWeight: 500,
                }}>
                  {decisionLabel}
                </span>
                <span style={{
                  marginLeft: 'auto',
                  fontSize: '0.65rem',
                  color: SLATE,
                  letterSpacing: '0.1em',
                }}>
                  Score: {result.score}/100
                </span>
              </div>

              <p style={{
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: '1.25rem',
                fontWeight: 300,
                color: PLATINUM,
                lineHeight: 1.5,
                marginBottom: '1rem',
              }}>
                {result.headline}
              </p>

              <p style={{
                fontSize: '0.875rem',
                color: SLATE,
                lineHeight: 1.7,
              }}>
                {result.seller_message}
              </p>
            </div>

            {/* Guidance questions */}
            {result.guidance_questions && result.guidance_questions.length > 0 && (
              <div style={{
                padding: '1.5rem',
                border: `1px solid rgba(201,168,76,0.2)`,
                borderRadius: '2px',
                marginBottom: '1.5rem',
              }}>
                <p style={{ ...labelStyle, marginBottom: '1rem' }}>A few questions to complete your listing:</p>
                {result.guidance_questions.map((q, i) => (
                  <p key={i} style={{
                    fontSize: '0.875rem',
                    color: PLATINUM,
                    lineHeight: 1.7,
                    marginBottom: '0.5rem',
                    paddingLeft: '1rem',
                    borderLeft: `2px solid ${GOLD}40`,
                  }}>
                    {q}
                  </p>
                ))}
              </div>
            )}

            {/* Alternatives for not_accepted */}
            {result.suggested_alternatives && result.suggested_alternatives.length > 0 && (
              <div style={{
                padding: '1.5rem',
                border: `1px solid rgba(138,143,158,0.2)`,
                borderRadius: '2px',
                marginBottom: '1.5rem',
              }}>
                <p style={{ ...labelStyle, marginBottom: '1rem' }}>Where you might find better success:</p>
                {result.suggested_alternatives.map((alt, i) => (
                  <p key={i} style={{
                    fontSize: '0.875rem',
                    color: SLATE,
                    lineHeight: 1.7,
                    marginBottom: '0.25rem',
                  }}>
                    — {alt}
                  </p>
                ))}
              </div>
            )}

            {/* Score breakdown */}
            <div style={{
              padding: '1.5rem',
              border: `1px solid rgba(201,168,76,0.1)`,
              borderRadius: '2px',
              marginBottom: '2rem',
            }}>
              <p style={{ ...labelStyle, marginBottom: '1rem' }}>Evaluation breakdown</p>
              {Object.entries(result.dimensions).map(([key, val]) => {
                const labels: Record<string, { label: string; max: number }> = {
                  brand_fit: { label: 'Brand Fit', max: 25 },
                  reference_significance: { label: 'Reference Significance', max: 25 },
                  era_and_provenance: { label: 'Era & Provenance', max: 25 },
                  collector_market: { label: 'Collector Market', max: 15 },
                  price_reasonableness: { label: 'Price Reasonableness', max: 10 },
                };
                const meta = labels[key];
                if (!meta) return null;
                const pct = (val / meta.max) * 100;
                return (
                  <div key={key} style={{ marginBottom: '0.875rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                      <span style={{ fontSize: '0.75rem', color: SLATE }}>{meta.label}</span>
                      <span style={{ fontSize: '0.75rem', color: PLATINUM }}>{val}/{meta.max}</span>
                    </div>
                    <div style={{ height: '2px', background: 'rgba(201,168,76,0.15)', borderRadius: '1px' }}>
                      <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: pct >= 70 ? GREEN : pct >= 40 ? AMBER : RED,
                        borderRadius: '1px',
                        transition: 'width 0.6s ease',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => { setResult(null); setError(null); }}
                style={{
                  flex: 1,
                  padding: '0.875rem',
                  background: 'transparent',
                  border: `1px solid rgba(201,168,76,0.3)`,
                  borderRadius: '2px',
                  color: PLATINUM,
                  fontSize: '0.75rem',
                  fontFamily: 'Inter, sans-serif',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Edit Listing
              </button>
              {(result.decision === 'approved' || result.decision === 'approved_with_guidance') && (
                <button
                  onClick={result.decision === 'approved_with_guidance' ? handleCompleteListingClick : undefined}
                  style={{
                    flex: 1,
                    padding: '0.875rem',
                    background: GOLD,
                    border: 'none',
                    borderRadius: '2px',
                    color: INK,
                    fontSize: '0.75rem',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 500,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  {result.decision === 'approved_with_guidance' ? 'Complete Your Listing →' : 'Continue Listing →'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
