"use client";

import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";

/* ────────────────────────────────────────────────────────────────────────
   THE VAULT ENTRANCE — components/VaultEntrance.tsx  (v1.91)

   The gates before the Galaxy. Two engraved gate panels flank a centered
   invitation; crossing does not open them — the architecture YIELDS.

   Motion & Transition (PRODUCT_SOUL.md): every animation should feel like
   architecture responding, never software reacting. On crossing:
     Phase 1 (0–200ms)  the gold rule beneath the headline brightens (0.5→1).
     Phase 2 (200–600ms) the gate panels fade to 0.06 and the center fades to
                          0 — the geometry stays exactly where it is; it does
                          not slide, swing, or open. It yields.
     Phase 3 (600ms)     navigate to /vault/galaxy — the page is already void.

   The sequence is driven purely by CSS transitions + transition-delay (no JS
   animation library, no requestAnimationFrame, no setTimeout chains — the only
   timer is the single 600ms navigation). Expressed as inline styles keyed off
   one `yielding` state flag, so the whole entrance is self-contained.

   Gate SVGs, the background circles, and the FW mark are copied verbatim from
   the approved prototype. Gradient IDs are prefixed (vault-gfadeR / vault-gfadeL)
   so they can never collide with another SVG on the page after navigation.
   ──────────────────────────────────────────────────────────────────────── */

const BG = "#0D0F14";

export default function VaultEntrance() {
  const router = useRouter();
  const [yielding, setYielding] = useState(false);

  function handleCrossing() {
    if (yielding) return;
    setYielding(true);
    // Phase 3 — navigate once the page is mostly void.
    setTimeout(() => router.push("/vault/galaxy"), 600);
  }

  // Phase 2 — the gates yield (fade in place), waiting 200ms for the rule.
  const gatePanel: CSSProperties = {
    width: 88,
    flexShrink: 0,
    position: "relative",
    opacity: yielding ? 0.06 : 1,
    transition: "opacity 400ms ease",
    transitionDelay: yielding ? "200ms" : "0ms",
  };

  // Phase 2 — the center fades with the gates.
  const center: CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 32px 48px",
    position: "relative",
    zIndex: 2,
    textAlign: "center",
    opacity: yielding ? 0 : 1,
    transition: "opacity 400ms ease",
    transitionDelay: yielding ? "200ms" : "0ms",
  };

  // Phase 1 — the rule brightens first, immediately, drawing the eye to center.
  const rule: CSSProperties = {
    width: 32,
    height: 1,
    background:
      "linear-gradient(to right, transparent, rgba(201,168,76,0.5), transparent)",
    margin: "0 auto 28px",
    opacity: yielding ? 1 : 0.5,
    transition: "opacity 200ms ease",
    pointerEvents: "none",
    cursor: "default",
  };

  const headline: CSSProperties = {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 30,
    fontWeight: 300,
    color: "#E8E4DC",
    lineHeight: 1.35,
    letterSpacing: "0.3px",
    marginBottom: 6,
  };

  const headlineEm: CSSProperties = {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 30,
    fontWeight: 300,
    fontStyle: "italic",
    color: "#C9A84C",
    lineHeight: 1.35,
    letterSpacing: "0.3px",
    marginBottom: 36,
  };

  return (
    <div
      style={{
        background: BG,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', sans-serif",
        color: "#E8E4DC",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* The entrance — [LEFT GATE 88px] [CENTER flex-1] [RIGHT GATE 88px] */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "stretch",
          position: "relative",
        }}
      >
        {/* Background — barely-there concentric circles (opacity 0.015) */}
        <svg
          viewBox="0 0 500 500"
          fill="none"
          width={460}
          height={460}
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            opacity: 0.015,
            pointerEvents: "none",
          }}
        >
          <circle cx="250" cy="250" r="240" stroke="white" strokeWidth="0.3" />
          <circle cx="250" cy="250" r="195" stroke="white" strokeWidth="0.3" />
          <circle cx="250" cy="250" r="150" stroke="white" strokeWidth="0.3" />
          <circle cx="250" cy="250" r="105" stroke="white" strokeWidth="0.3" />
          <circle cx="250" cy="250" r="60" stroke="white" strokeWidth="0.3" />
          <circle cx="250" cy="250" r="15" stroke="white" strokeWidth="0.4" />
          <line x1="250" y1="10" x2="250" y2="490" stroke="white" strokeWidth="0.2" />
          <line x1="10" y1="250" x2="490" y2="250" stroke="white" strokeWidth="0.2" />
          <circle cx="250" cy="250" r="4" fill="white" opacity="0.5" />
        </svg>

        {/* LEFT GATE — the FairWatchTrade symbol, left half */}
        <div style={gatePanel}>
          <svg
            viewBox="0 0 88 560"
            fill="none"
            width={88}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            style={{ height: "100%", minHeight: 480, display: "block" }}
          >
            {/* Outer post — the confident vertical anchor */}
            <line x1="18" y1="20" x2="18" y2="540" stroke="rgba(201,168,76,0.28)" strokeWidth="1.2" />
            {/* Inner bar */}
            <line x1="42" y1="48" x2="42" y2="512" stroke="rgba(201,168,76,0.16)" strokeWidth="0.7" />
            {/* Secondary inner bar */}
            <line x1="62" y1="70" x2="62" y2="490" stroke="rgba(201,168,76,0.1)" strokeWidth="0.5" />

            {/* Top finial — crown of the gate */}
            <circle cx="18" cy="20" r="8" stroke="rgba(201,168,76,0.4)" strokeWidth="0.8" fill="none" />
            <circle cx="18" cy="20" r="4" stroke="rgba(201,168,76,0.25)" strokeWidth="0.6" fill="none" />
            <circle cx="18" cy="20" r="1.5" fill="rgba(201,168,76,0.5)" />

            {/* Top rail */}
            <line x1="18" y1="48" x2="72" y2="48" stroke="rgba(201,168,76,0.2)" strokeWidth="0.8" />
            <circle cx="18" cy="48" r="3.5" stroke="rgba(201,168,76,0.3)" strokeWidth="0.6" fill="none" />
            <circle cx="42" cy="48" r="3" stroke="rgba(201,168,76,0.2)" strokeWidth="0.5" fill="none" />
            <circle cx="62" cy="48" r="2.5" stroke="rgba(201,168,76,0.15)" strokeWidth="0.5" fill="none" />

            {/* Upper decorative panel — watch-dial motif */}
            <rect x="10" y="58" width="68" height="72" stroke="rgba(201,168,76,0.08)" strokeWidth="0.4" fill="none" />
            <circle cx="44" cy="94" r="20" stroke="rgba(201,168,76,0.12)" strokeWidth="0.5" fill="none" />
            <circle cx="44" cy="94" r="12" stroke="rgba(201,168,76,0.08)" strokeWidth="0.4" fill="none" />
            <circle cx="44" cy="94" r="4" stroke="rgba(201,168,76,0.1)" strokeWidth="0.4" fill="none" />
            <line x1="44" y1="74" x2="44" y2="114" stroke="rgba(201,168,76,0.06)" strokeWidth="0.4" />
            <line x1="24" y1="94" x2="64" y2="94" stroke="rgba(201,168,76,0.06)" strokeWidth="0.4" />

            {/* Upper middle rail */}
            <line x1="18" y1="160" x2="72" y2="160" stroke="rgba(201,168,76,0.16)" strokeWidth="0.7" />
            <circle cx="18" cy="160" r="3.5" stroke="rgba(201,168,76,0.28)" strokeWidth="0.6" fill="none" />
            <circle cx="42" cy="160" r="3" stroke="rgba(201,168,76,0.18)" strokeWidth="0.5" fill="none" />
            <circle cx="62" cy="160" r="2.5" stroke="rgba(201,168,76,0.12)" strokeWidth="0.4" fill="none" />

            {/* Center medallion — the heart of the gate symbol */}
            <circle cx="36" cy="280" r="26" stroke="rgba(201,168,76,0.22)" strokeWidth="0.8" fill="none" />
            <circle cx="36" cy="280" r="18" stroke="rgba(201,168,76,0.15)" strokeWidth="0.6" fill="none" />
            <circle cx="36" cy="280" r="10" stroke="rgba(201,168,76,0.12)" strokeWidth="0.5" fill="none" />
            <circle cx="36" cy="280" r="3" stroke="rgba(201,168,76,0.2)" strokeWidth="0.5" fill="none" />
            <line x1="36" y1="254" x2="36" y2="260" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" />
            <line x1="36" y1="300" x2="36" y2="306" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" />
            <line x1="10" y1="280" x2="16" y2="280" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" />
            <line x1="56" y1="280" x2="62" y2="280" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" />

            {/* Lower middle rail */}
            <line x1="18" y1="400" x2="72" y2="400" stroke="rgba(201,168,76,0.16)" strokeWidth="0.7" />
            <circle cx="18" cy="400" r="3.5" stroke="rgba(201,168,76,0.28)" strokeWidth="0.6" fill="none" />
            <circle cx="42" cy="400" r="3" stroke="rgba(201,168,76,0.18)" strokeWidth="0.5" fill="none" />
            <circle cx="62" cy="400" r="2.5" stroke="rgba(201,168,76,0.12)" strokeWidth="0.4" fill="none" />

            {/* Lower decorative panel */}
            <rect x="10" y="430" width="68" height="60" stroke="rgba(201,168,76,0.07)" strokeWidth="0.4" fill="none" />
            <circle cx="44" cy="460" r="14" stroke="rgba(201,168,76,0.1)" strokeWidth="0.4" fill="none" />
            <circle cx="44" cy="460" r="6" stroke="rgba(201,168,76,0.07)" strokeWidth="0.3" fill="none" />

            {/* Bottom rail */}
            <line x1="18" y1="512" x2="72" y2="512" stroke="rgba(201,168,76,0.2)" strokeWidth="0.8" />
            <circle cx="18" cy="512" r="3.5" stroke="rgba(201,168,76,0.3)" strokeWidth="0.6" fill="none" />
            <circle cx="42" cy="512" r="3" stroke="rgba(201,168,76,0.2)" strokeWidth="0.5" fill="none" />
            <circle cx="62" cy="512" r="2.5" stroke="rgba(201,168,76,0.14)" strokeWidth="0.4" fill="none" />

            {/* Bottom finial */}
            <circle cx="18" cy="540" r="6" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" fill="none" />
            <circle cx="18" cy="540" r="2.5" stroke="rgba(201,168,76,0.2)" strokeWidth="0.5" fill="none" />

            {/* Fade toward center — gate dissolves into the crossing space */}
            <rect x="58" y="0" width="30" height="560" fill="url(#vault-gfadeR)" />
            <defs>
              <linearGradient id="vault-gfadeR" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#0D0F14" stopOpacity="0" />
                <stop offset="100%" stopColor="#0D0F14" stopOpacity="1" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* CENTER — trust the feeling. Almost nothing. */}
        <div style={center}>
          {/* FW mark — the watch-dial medallion */}
          <div style={{ marginBottom: 36 }}>
            <svg viewBox="0 0 36 36" fill="none" width={28} height={28} aria-hidden="true">
              <circle cx="18" cy="18" r="17" stroke="rgba(201,168,76,0.28)" strokeWidth="0.6" />
              <circle cx="18" cy="18" r="12" stroke="rgba(201,168,76,0.15)" strokeWidth="0.5" />
              <line x1="18" y1="4" x2="18" y2="7" stroke="rgba(201,168,76,0.45)" strokeWidth="0.7" />
              <line x1="18" y1="29" x2="18" y2="32" stroke="rgba(201,168,76,0.45)" strokeWidth="0.7" />
              <line x1="4" y1="18" x2="7" y2="18" stroke="rgba(201,168,76,0.45)" strokeWidth="0.7" />
              <line x1="29" y1="18" x2="32" y2="18" stroke="rgba(201,168,76,0.45)" strokeWidth="0.7" />
              <line x1="18" y1="18" x2="18" y2="8" stroke="rgba(232,228,220,0.55)" strokeWidth="0.7" />
              <line x1="18" y1="18" x2="23" y2="18" stroke="rgba(232,228,220,0.45)" strokeWidth="0.6" />
              <circle cx="18" cy="18" r="1.6" fill="#C9A84C" opacity="0.6" />
            </svg>
          </div>

          {/* Eyebrow */}
          <div
            style={{
              fontSize: 8,
              letterSpacing: "5px",
              color: "rgba(201,168,76,0.45)",
              textTransform: "uppercase",
              marginBottom: 32,
            }}
          >
            The FairWatchTrade Vault
          </div>

          {/* The headline — does all the work */}
          <div style={headline}>What lies beyond these gates</div>
          <div style={{ ...headline, marginBottom: 8 }}>isn&apos;t data.</div>
          <div style={headlineEm}>It&apos;s understanding.</div>

          {/* Gold rule — brightens first on crossing (Phase 1) */}
          <div style={rule} />

          {/* Statement — museum plaque: narrow, left-set, subconsciously off-center */}
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 15,
              fontWeight: 300,
              fontStyle: "italic",
              color: "#8A8F9E",
              lineHeight: 1.8,
              letterSpacing: "0.2px",
              textAlign: "left",
              maxWidth: 320,
              alignSelf: "flex-start",
              marginLeft: "auto",
              marginRight: "auto",
              marginBottom: 52,
            }}
          >
            A living archive, freely open to every collector.
          </div>

          {/* The crossing — inevitable, not clicked. No hover, no glow. */}
          <div
            onClick={handleCrossing}
            role="button"
            tabIndex={0}
            aria-label="Enter the Vault"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleCrossing();
              }
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              cursor: "pointer",
              gap: 0,
              outline: "none",
            }}
          >
            <div
              style={{
                width: 1,
                height: 32,
                background:
                  "linear-gradient(to bottom, transparent, rgba(201,168,76,0.3))",
              }}
            />
            <div
              style={{
                fontSize: 9,
                letterSpacing: "6px",
                color: "rgba(201,168,76,0.55)",
                textTransform: "uppercase",
                padding: "8px 0",
              }}
            >
              Enter
            </div>
            <div
              style={{
                width: 1,
                height: 20,
                background:
                  "linear-gradient(to bottom, rgba(201,168,76,0.25), transparent)",
              }}
            />
          </div>
        </div>

        {/* RIGHT GATE — mirror, the symbol completed */}
        <div style={gatePanel}>
          <svg
            viewBox="0 0 88 560"
            fill="none"
            width={88}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            style={{ height: "100%", minHeight: 480, display: "block" }}
          >
            <line x1="70" y1="20" x2="70" y2="540" stroke="rgba(201,168,76,0.28)" strokeWidth="1.2" />
            <line x1="46" y1="48" x2="46" y2="512" stroke="rgba(201,168,76,0.16)" strokeWidth="0.7" />
            <line x1="26" y1="70" x2="26" y2="490" stroke="rgba(201,168,76,0.1)" strokeWidth="0.5" />

            <circle cx="70" cy="20" r="8" stroke="rgba(201,168,76,0.4)" strokeWidth="0.8" fill="none" />
            <circle cx="70" cy="20" r="4" stroke="rgba(201,168,76,0.25)" strokeWidth="0.6" fill="none" />
            <circle cx="70" cy="20" r="1.5" fill="rgba(201,168,76,0.5)" />

            <line x1="16" y1="48" x2="70" y2="48" stroke="rgba(201,168,76,0.2)" strokeWidth="0.8" />
            <circle cx="70" cy="48" r="3.5" stroke="rgba(201,168,76,0.3)" strokeWidth="0.6" fill="none" />
            <circle cx="46" cy="48" r="3" stroke="rgba(201,168,76,0.2)" strokeWidth="0.5" fill="none" />
            <circle cx="26" cy="48" r="2.5" stroke="rgba(201,168,76,0.15)" strokeWidth="0.5" fill="none" />

            <rect x="10" y="58" width="68" height="72" stroke="rgba(201,168,76,0.08)" strokeWidth="0.4" fill="none" />
            <circle cx="44" cy="94" r="20" stroke="rgba(201,168,76,0.12)" strokeWidth="0.5" fill="none" />
            <circle cx="44" cy="94" r="12" stroke="rgba(201,168,76,0.08)" strokeWidth="0.4" fill="none" />
            <circle cx="44" cy="94" r="4" stroke="rgba(201,168,76,0.1)" strokeWidth="0.4" fill="none" />
            <line x1="44" y1="74" x2="44" y2="114" stroke="rgba(201,168,76,0.06)" strokeWidth="0.4" />
            <line x1="24" y1="94" x2="64" y2="94" stroke="rgba(201,168,76,0.06)" strokeWidth="0.4" />

            <line x1="16" y1="160" x2="70" y2="160" stroke="rgba(201,168,76,0.16)" strokeWidth="0.7" />
            <circle cx="70" cy="160" r="3.5" stroke="rgba(201,168,76,0.28)" strokeWidth="0.6" fill="none" />
            <circle cx="46" cy="160" r="3" stroke="rgba(201,168,76,0.18)" strokeWidth="0.5" fill="none" />
            <circle cx="26" cy="160" r="2.5" stroke="rgba(201,168,76,0.12)" strokeWidth="0.4" fill="none" />

            <circle cx="52" cy="280" r="26" stroke="rgba(201,168,76,0.22)" strokeWidth="0.8" fill="none" />
            <circle cx="52" cy="280" r="18" stroke="rgba(201,168,76,0.15)" strokeWidth="0.6" fill="none" />
            <circle cx="52" cy="280" r="10" stroke="rgba(201,168,76,0.12)" strokeWidth="0.5" fill="none" />
            <circle cx="52" cy="280" r="3" stroke="rgba(201,168,76,0.2)" strokeWidth="0.5" fill="none" />
            <line x1="52" y1="254" x2="52" y2="260" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" />
            <line x1="52" y1="300" x2="52" y2="306" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" />
            <line x1="26" y1="280" x2="32" y2="280" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" />
            <line x1="72" y1="280" x2="78" y2="280" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" />

            <line x1="16" y1="400" x2="70" y2="400" stroke="rgba(201,168,76,0.16)" strokeWidth="0.7" />
            <circle cx="70" cy="400" r="3.5" stroke="rgba(201,168,76,0.28)" strokeWidth="0.6" fill="none" />
            <circle cx="46" cy="400" r="3" stroke="rgba(201,168,76,0.18)" strokeWidth="0.5" fill="none" />
            <circle cx="26" cy="400" r="2.5" stroke="rgba(201,168,76,0.12)" strokeWidth="0.4" fill="none" />

            <rect x="10" y="430" width="68" height="60" stroke="rgba(201,168,76,0.07)" strokeWidth="0.4" fill="none" />
            <circle cx="44" cy="460" r="14" stroke="rgba(201,168,76,0.1)" strokeWidth="0.4" fill="none" />
            <circle cx="44" cy="460" r="6" stroke="rgba(201,168,76,0.07)" strokeWidth="0.3" fill="none" />

            <line x1="16" y1="512" x2="70" y2="512" stroke="rgba(201,168,76,0.2)" strokeWidth="0.8" />
            <circle cx="70" cy="512" r="3.5" stroke="rgba(201,168,76,0.3)" strokeWidth="0.6" fill="none" />
            <circle cx="46" cy="512" r="3" stroke="rgba(201,168,76,0.2)" strokeWidth="0.5" fill="none" />
            <circle cx="26" cy="512" r="2.5" stroke="rgba(201,168,76,0.14)" strokeWidth="0.4" fill="none" />

            <circle cx="70" cy="540" r="6" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" fill="none" />
            <circle cx="70" cy="540" r="2.5" stroke="rgba(201,168,76,0.2)" strokeWidth="0.5" fill="none" />

            <rect x="0" y="0" width="30" height="560" fill="url(#vault-gfadeL)" />
            <defs>
              <linearGradient id="vault-gfadeL" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#0D0F14" stopOpacity="1" />
                <stop offset="100%" stopColor="#0D0F14" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
    </div>
  );
}
