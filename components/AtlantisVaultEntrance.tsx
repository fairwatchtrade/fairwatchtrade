"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

/* ════════════════════════════════════════════════════════════════════════
   THE ATLANTIS REVEAL — components/AtlantisVaultEntrance.tsx   (v1.96)

   The emotional centerpiece of the Vault — the moment the platform stops
   being a marketplace and becomes a place.

   A film builds to a peak; then the screen goes translucent and LIFTS AWAY
   to reveal what was there all along. Here: the entrance gates yield (never
   slide, swing, or open) and the veil covering the galaxy lifts upward — the
   galaxy was always behind it, always there.

   Architecture — three layers, two canvases, one off-screen mask:
     z-3  arrival text  — "The galaxy was always here."
     z-2  .fw-vault     — the entrance UI (gates, headline, crossing)
     z-1  veilCanvas    — the veil (pointer-events: none)
     z-0  galaxyCanvas  — the galaxy (always rendering, behind the veil)
          maskCanvas    — off-screen, never in the DOM, drives the reveal shape

   TWO crossings, deliberately NOT collapsed:
     Crossing 1 (startReveal)   — the threshold: ignite, then the veil lifts
       over 2500ms while the entrance UI exits and the arrival line appears.
     Crossing 2 (approachGalaxy) — the collector CHOOSES to approach, unlocked
       at 3000ms. They are not taken in; they cross. That is the Atlantis
       moment. Navigation to /vault/galaxy fires 700ms after they click.

   Every canvas function, gradient, star count, and timing value is copied
   verbatim from the approved prototype (fairwatchtrade_atlantis_reveal_v2_
   gate_mask.html). Gate gradient IDs are prefixed (vault-gfadeR / vault-gfadeL)
   so they can't collide on the /vault/galaxy page, and the prototype's
   y1="="0" typo on the gfadeL gradient is corrected here.

   PFC274 = 62 — no evaluation logic here; the starfield is a seeded preview,
   not the real galaxy (which loads at /vault/galaxy).
   ════════════════════════════════════════════════════════════════════════ */

type Star = {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  color: string;
  zone: "outer" | "mid" | "gold";
};

export default function AtlantisVaultEntrance() {
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);
  const galaxyCanvasRef = useRef<HTMLCanvasElement>(null);
  const veilCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isIgnited, setIsIgnited] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [arrivalVisible, setArrivalVisible] = useState(false);
  const [canApproach, setCanApproach] = useState(false); // Crossing 2 unlocked at 3000ms
  const [isApproaching, setIsApproaching] = useState(false); // Approach in progress

  const enteredRef = useRef(false);
  const revealStartRef = useRef(0);
  const starsRef = useRef<Star[]>([]);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── Crossing 1 — the threshold ────────────────────────────────────────
  const startReveal = useCallback(() => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    revealStartRef.current = performance.now();

    // Immediate: ignite — gates fade, rule brightens, headline glows.
    setIsIgnited(true);

    // 620ms: the entrance UI begins its exit.
    timeoutsRef.current.push(setTimeout(() => setIsRevealing(true), 620));

    // 1950ms: "The galaxy was always here."
    timeoutsRef.current.push(setTimeout(() => setArrivalVisible(true), 1950));

    // 3000ms: the second crossing unlocks. The collector is NOT taken into the
    // galaxy — they CHOOSE to approach. That is the Atlantis moment.
    timeoutsRef.current.push(setTimeout(() => setCanApproach(true), 3000));
  }, []);

  // ── Crossing 2 — the approach (the collector's choice) ────────────────
  const approachGalaxy = useCallback(() => {
    if (!canApproach || isApproaching) return;
    setIsApproaching(true);
    // 700ms visual push, then cross into the galaxy.
    timeoutsRef.current.push(
      setTimeout(() => router.push("/vault/galaxy"), 700)
    );
  }, [canApproach, isApproaching, router]);

  // Clear any pending timeouts on unmount.
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, []);

  // ── Canvas engine — galaxy + veil + off-screen mask ───────────────────
  useEffect(() => {
    const galaxyCanvas = galaxyCanvasRef.current;
    const veilCanvas = veilCanvasRef.current;
    if (!galaxyCanvas || !veilCanvas) return;

    const galaxyCtx = galaxyCanvas.getContext("2d");
    const veilCtx = veilCanvas.getContext("2d");
    if (!galaxyCtx || !veilCtx) return;

    // Off-screen mask — never added to the DOM; used only for compositing.
    const maskCanvas = document.createElement("canvas");
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;
    maskCanvasRef.current = maskCanvas;

    let W = 0;
    let H = 0;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let seed = 193;

    function rand(): number {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }

    function createStars() {
      seed = 193; // always reset before generating
      const stars: Star[] = [];
      const cx = W * 0.5;
      const cy = H * 0.53;
      const maxR = Math.min(W, H) * 0.54;

      // 130 outer white stars
      for (let i = 0; i < 130; i++) {
        const a = rand() * Math.PI * 2;
        const r = Math.pow(rand(), 0.55) * maxR * 1.08;
        stars.push({
          x: cx + Math.cos(a) * r * (1.22 + rand() * 0.22),
          y: cy + Math.sin(a) * r * (0.72 + rand() * 0.16),
          radius: 0.35 + rand() * 0.42,
          opacity: 0.024 + rand() * 0.05,
          color: "255,255,255",
          zone: "outer",
        });
      }

      // 82 mid white stars
      for (let i = 0; i < 82; i++) {
        const a = rand() * Math.PI * 2;
        const r = Math.pow(rand(), 1.38) * maxR * 0.84;
        stars.push({
          x: cx + Math.cos(a) * r * 1.08,
          y: cy + Math.sin(a) * r * 0.68,
          radius: 0.55 + rand() * 0.72,
          opacity: 0.055 + rand() * 0.105,
          color: "255,255,255",
          zone: "mid",
        });
      }

      // 5 gold brand stars — exact positions
      const goldStars: [number, number, number, number][] = [
        [0, 0, 2.9, 0.68],
        [-0.18, -0.08, 1.35, 0.38],
        [0.22, 0.06, 1.25, 0.34],
        [0.08, -0.21, 1.1, 0.3],
        [-0.05, 0.22, 1.0, 0.26],
      ];
      goldStars.forEach(([dx, dy, rr, op]) => {
        stars.push({
          x: cx + dx * maxR,
          y: cy + dy * maxR,
          radius: rr,
          opacity: op,
          color: "201,168,76",
          zone: "gold",
        });
      });

      starsRef.current = stars;
    }

    function prerenderMask() {
      if (!maskCtx) return;
      maskCtx.clearRect(0, 0, W, H);
      const cx = W * 0.5;
      const cy = H * 0.53;

      const radial = maskCtx.createRadialGradient(cx, cy, 12, cx, cy, Math.min(W, H) * 0.43);
      radial.addColorStop(0, "rgba(255,255,255,0.95)");
      radial.addColorStop(0.24, "rgba(255,255,255,0.34)");
      radial.addColorStop(0.64, "rgba(255,255,255,0.08)");
      radial.addColorStop(1, "rgba(255,255,255,0)");
      maskCtx.fillStyle = radial;
      maskCtx.fillRect(0, 0, W, H);

      const left = maskCtx.createLinearGradient(0, 0, W * 0.3, 0);
      left.addColorStop(0, "rgba(255,255,255,0)");
      left.addColorStop(0.42, "rgba(255,255,255,0.07)");
      left.addColorStop(1, "rgba(255,255,255,0)");
      maskCtx.fillStyle = left;
      maskCtx.fillRect(0, 0, W * 0.32, H);

      const right = maskCtx.createLinearGradient(W, 0, W * 0.7, 0);
      right.addColorStop(0, "rgba(255,255,255,0)");
      right.addColorStop(0.42, "rgba(255,255,255,0.07)");
      right.addColorStop(1, "rgba(255,255,255,0)");
      maskCtx.fillStyle = right;
      maskCtx.fillRect(W * 0.68, 0, W * 0.32, H);

      const rule = maskCtx.createLinearGradient(cx - 100, 0, cx + 100, 0);
      rule.addColorStop(0, "rgba(255,255,255,0)");
      rule.addColorStop(0.5, "rgba(255,255,255,0.78)");
      rule.addColorStop(1, "rgba(255,255,255,0)");
      maskCtx.fillStyle = rule;
      maskCtx.fillRect(cx - 100, cy - 1, 200, 2);
    }

    function drawGalaxy(now: number) {
      if (!galaxyCtx) return;
      galaxyCtx.clearRect(0, 0, W, H);
      galaxyCtx.fillStyle = "#0D0F14";
      galaxyCtx.fillRect(0, 0, W, H);
      const drift = Math.sin(now * 0.00018) * 1.6;
      starsRef.current.forEach((s) => {
        galaxyCtx.beginPath();
        galaxyCtx.fillStyle = `rgba(${s.color},${s.opacity})`;
        galaxyCtx.arc(s.x + drift, s.y, s.radius, 0, Math.PI * 2);
        galaxyCtx.fill();
        if (s.zone === "gold" && s.radius > 2) {
          const g = galaxyCtx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 26);
          g.addColorStop(0, "rgba(201,168,76,0.14)");
          g.addColorStop(1, "rgba(201,168,76,0)");
          galaxyCtx.fillStyle = g;
          galaxyCtx.beginPath();
          galaxyCtx.arc(s.x, s.y, 26, 0, Math.PI * 2);
          galaxyCtx.fill();
        }
      });
    }

    function smoothstep(a: number, b: number, x: number): number {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    }
    function easeOutCubic(x: number): number {
      return 1 - Math.pow(1 - x, 3);
    }

    function drawVeil(now: number) {
      if (!veilCtx) return;
      let p = 0;
      if (enteredRef.current) p = Math.min(1, (now - revealStartRef.current) / 2500);
      const peek = smoothstep(0.08, 0.34, p);
      const lift = easeOutCubic(smoothstep(0.34, 0.96, p));
      const coveredHeight = H * (1 - lift);

      veilCtx.clearRect(0, 0, W, H);
      veilCtx.fillStyle = enteredRef.current ? "rgba(13,15,20,0.985)" : "rgba(13,15,20,0.997)";
      veilCtx.fillRect(0, 0, W, coveredHeight);

      // Phase 1 — the galaxy peeks through the mask shape, center-first.
      if (peek > 0 && coveredHeight > 0) {
        veilCtx.save();
        veilCtx.globalCompositeOperation = "destination-out";
        veilCtx.globalAlpha = 0.2 + peek * 0.7;
        veilCtx.drawImage(maskCanvas, 0, 0, W, H);
        veilCtx.restore();
      }

      // Phase 2 — a soft hem gradient follows the lifting edge.
      if (lift > 0 && lift < 1) {
        const y = coveredHeight;
        const edge = veilCtx.createLinearGradient(0, y - 95, 0, y + 95);
        edge.addColorStop(0, "rgba(13,15,20,0.97)");
        edge.addColorStop(0.5, "rgba(13,15,20,0.50)");
        edge.addColorStop(1, "rgba(13,15,20,0)");
        veilCtx.fillStyle = edge;
        veilCtx.fillRect(0, y - 100, W, 200);
      }
    }

    function frame(now: number) {
      drawGalaxy(now);
      drawVeil(now);
      animFrameRef.current = requestAnimationFrame(frame);
    }

    function resize() {
      if (!galaxyCanvas || !veilCanvas || !galaxyCtx || !veilCtx || !maskCtx) return;
      W = window.innerWidth;
      H = window.innerHeight;
      [galaxyCanvas, veilCanvas, maskCanvas].forEach((c) => {
        c.width = Math.floor(W * DPR);
        c.height = Math.floor(H * DPR);
        c.style.width = W + "px";
        c.style.height = H + "px";
      });
      galaxyCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
      veilCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
      maskCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
      createStars();
      prerenderMask();
    }

    window.addEventListener("resize", resize);
    resize();
    animFrameRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return (
    <div
      ref={stageRef}
      onClick={canApproach ? approachGalaxy : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "#0D0F14",
        overflow: "hidden",
        cursor: canApproach ? "pointer" : "default",
      }}
    >
      <canvas
        ref={galaxyCanvasRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      <canvas
        ref={veilCanvasRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />

      {/* .fw-vault — the entrance UI (yields upward as the veil lifts) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          opacity: isRevealing ? 0 : 1,
          transform: isRevealing ? "translateY(-18px)" : "translateY(0)",
          transition: "opacity 850ms ease, transform 850ms ease",
          transitionDelay: isRevealing ? "650ms" : "0ms",
        }}
      >
        {/* nav */}
        <div
          style={{
            padding: "18px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            flexShrink: 0,
          }}
        >
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "15px", fontWeight: 400, color: "#E8E4DC" }}>
            Fair<span style={{ color: "#C9A84C" }}>Watch</span>Trade
          </div>
          <div style={{ fontSize: "9px", letterSpacing: "2px", color: "#4A4F5C", textTransform: "uppercase" }}>
            ← Marketplace
          </div>
        </div>

        {/* gate + center + gate */}
        <div style={{ flex: 1, display: "flex", alignItems: "stretch", position: "relative" }}>
          {/* Left gate — 88px, yields to opacity 0.12 on ignite */}
          <div style={{ width: "88px", flexShrink: 0, position: "relative", opacity: isIgnited ? 0.12 : 1, transition: "opacity 700ms ease" }}>
            <svg viewBox="0 0 88 560" fill="none" width="88" style={{ height: "100%", minHeight: "480px" }} preserveAspectRatio="xMidYMid meet">
              <line x1="18" y1="20" x2="18" y2="540" stroke="rgba(201,168,76,0.28)" strokeWidth="1.2" />
              <line x1="42" y1="48" x2="42" y2="512" stroke="rgba(201,168,76,0.16)" strokeWidth="0.7" />
              <line x1="62" y1="70" x2="62" y2="490" stroke="rgba(201,168,76,0.1)" strokeWidth="0.5" />
              <circle cx="18" cy="20" r="8" stroke="rgba(201,168,76,0.4)" strokeWidth="0.8" />
              <circle cx="18" cy="20" r="4" stroke="rgba(201,168,76,0.25)" strokeWidth="0.6" />
              <circle cx="18" cy="20" r="1.5" fill="rgba(201,168,76,0.5)" />
              <line x1="18" y1="48" x2="72" y2="48" stroke="rgba(201,168,76,0.2)" strokeWidth="0.8" />
              <rect x="10" y="58" width="68" height="72" stroke="rgba(201,168,76,0.08)" strokeWidth="0.4" />
              <circle cx="44" cy="94" r="20" stroke="rgba(201,168,76,0.12)" strokeWidth="0.5" />
              <circle cx="44" cy="94" r="12" stroke="rgba(201,168,76,0.08)" strokeWidth="0.4" />
              <line x1="18" y1="160" x2="72" y2="160" stroke="rgba(201,168,76,0.16)" strokeWidth="0.7" />
              <circle cx="36" cy="280" r="26" stroke="rgba(201,168,76,0.22)" strokeWidth="0.8" />
              <circle cx="36" cy="280" r="18" stroke="rgba(201,168,76,0.15)" strokeWidth="0.6" />
              <circle cx="36" cy="280" r="10" stroke="rgba(201,168,76,0.12)" strokeWidth="0.5" />
              <line x1="36" y1="254" x2="36" y2="260" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" />
              <line x1="36" y1="300" x2="36" y2="306" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" />
              <line x1="10" y1="280" x2="16" y2="280" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" />
              <line x1="56" y1="280" x2="62" y2="280" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" />
              <line x1="18" y1="400" x2="72" y2="400" stroke="rgba(201,168,76,0.16)" strokeWidth="0.7" />
              <rect x="10" y="430" width="68" height="60" stroke="rgba(201,168,76,0.07)" strokeWidth="0.4" />
              <line x1="18" y1="512" x2="72" y2="512" stroke="rgba(201,168,76,0.2)" strokeWidth="0.8" />
              <circle cx="18" cy="540" r="6" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" />
              <rect x="58" y="0" width="30" height="560" fill="url(#vault-gfadeR)" />
              <defs>
                <linearGradient id="vault-gfadeR" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#0D0F14" stopOpacity="0" />
                  <stop offset="100%" stopColor="#0D0F14" stopOpacity="1" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Center */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px 32px 48px",
              textAlign: "center",
            }}
          >
            {/* FW mark */}
            <div style={{ marginBottom: "36px" }}>
              <svg viewBox="0 0 36 36" fill="none" width="28" height="28">
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

            <div style={{ fontSize: "8px", letterSpacing: "5px", color: "rgba(201,168,76,0.45)", textTransform: "uppercase", marginBottom: "32px" }}>
              The FairWatchTrade Vault
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "30px", fontWeight: 300, lineHeight: 1.35, letterSpacing: "0.3px", color: "#E8E4DC", marginBottom: "6px" }}>
              What lies beyond these gates
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "30px", fontWeight: 300, lineHeight: 1.35, letterSpacing: "0.3px", color: "#E8E4DC", marginBottom: "6px" }}>
              isn&apos;t data.
            </div>
            <div
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "30px",
                fontWeight: 300,
                lineHeight: 1.35,
                letterSpacing: "0.3px",
                color: "#C9A84C",
                fontStyle: "italic",
                marginBottom: "36px",
                textShadow: isIgnited ? "0 0 18px rgba(201,168,76,0.22)" : "none",
                transition: "text-shadow 200ms ease",
              }}
            >
              It&apos;s understanding.
            </div>

            {/* Gold rule — brightens and widens on ignite */}
            <div
              style={{
                width: isIgnited ? "76px" : "32px",
                height: "1px",
                background: "linear-gradient(to right, transparent, rgba(201,168,76,0.5), transparent)",
                margin: "0 auto 28px",
                filter: isIgnited ? "brightness(1.85)" : "brightness(1)",
                transition: "width 200ms ease, filter 200ms ease",
              }}
            />

            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "15px", fontWeight: 300, fontStyle: "italic", color: "#8A8F9E", lineHeight: 1.8, marginBottom: "52px", letterSpacing: "0.2px" }}>
              A living archive, freely open to every collector.
            </div>

            {/* The crossing — not a button, not a link. A crossing. */}
            <div
              role="button"
              tabIndex={0}
              onClick={startReveal}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  startReveal();
                }
              }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", userSelect: "none" }}
              aria-label="Enter the FairWatchTrade Vault"
            >
              <div style={{ width: "1px", height: "32px", background: "linear-gradient(to bottom, transparent, rgba(201,168,76,0.3))" }} />
              <div style={{ fontSize: "9px", letterSpacing: "6px", color: "rgba(201,168,76,0.55)", textTransform: "uppercase", padding: "8px 0" }}>
                Enter
              </div>
              <div style={{ width: "1px", height: "20px", background: "linear-gradient(to bottom, rgba(201,168,76,0.25), transparent)" }} />
            </div>
          </div>

          {/* Right gate — 88px mirror, yields on ignite */}
          <div style={{ width: "88px", flexShrink: 0, position: "relative", opacity: isIgnited ? 0.12 : 1, transition: "opacity 700ms ease" }}>
            <svg viewBox="0 0 88 560" fill="none" width="88" style={{ height: "100%", minHeight: "480px" }} preserveAspectRatio="xMidYMid meet">
              <line x1="70" y1="20" x2="70" y2="540" stroke="rgba(201,168,76,0.28)" strokeWidth="1.2" />
              <line x1="46" y1="48" x2="46" y2="512" stroke="rgba(201,168,76,0.16)" strokeWidth="0.7" />
              <line x1="26" y1="70" x2="26" y2="490" stroke="rgba(201,168,76,0.1)" strokeWidth="0.5" />
              <circle cx="70" cy="20" r="8" stroke="rgba(201,168,76,0.4)" strokeWidth="0.8" />
              <circle cx="70" cy="20" r="4" stroke="rgba(201,168,76,0.25)" strokeWidth="0.6" />
              <circle cx="70" cy="20" r="1.5" fill="rgba(201,168,76,0.5)" />
              <line x1="16" y1="48" x2="70" y2="48" stroke="rgba(201,168,76,0.2)" strokeWidth="0.8" />
              <rect x="10" y="58" width="68" height="72" stroke="rgba(201,168,76,0.08)" strokeWidth="0.4" />
              <circle cx="44" cy="94" r="20" stroke="rgba(201,168,76,0.12)" strokeWidth="0.5" />
              <circle cx="44" cy="94" r="12" stroke="rgba(201,168,76,0.08)" strokeWidth="0.4" />
              <line x1="16" y1="160" x2="70" y2="160" stroke="rgba(201,168,76,0.16)" strokeWidth="0.7" />
              <circle cx="52" cy="280" r="26" stroke="rgba(201,168,76,0.22)" strokeWidth="0.8" />
              <circle cx="52" cy="280" r="18" stroke="rgba(201,168,76,0.15)" strokeWidth="0.6" />
              <circle cx="52" cy="280" r="10" stroke="rgba(201,168,76,0.12)" strokeWidth="0.5" />
              <line x1="52" y1="254" x2="52" y2="260" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" />
              <line x1="52" y1="300" x2="52" y2="306" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" />
              <line x1="26" y1="280" x2="32" y2="280" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" />
              <line x1="72" y1="280" x2="78" y2="280" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" />
              <line x1="16" y1="400" x2="70" y2="400" stroke="rgba(201,168,76,0.16)" strokeWidth="0.7" />
              <rect x="10" y="430" width="68" height="60" stroke="rgba(201,168,76,0.07)" strokeWidth="0.4" />
              <line x1="16" y1="512" x2="70" y2="512" stroke="rgba(201,168,76,0.2)" strokeWidth="0.8" />
              <circle cx="70" cy="540" r="6" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7" />
              <rect x="0" y="0" width="30" height="560" fill="url(#vault-gfadeL)" />
              <defs>
                {/* Prototype had y1="="0" here — corrected to y1="0". */}
                <linearGradient id="vault-gfadeL" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#0D0F14" stopOpacity="1" />
                  <stop offset="100%" stopColor="#0D0F14" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      {/* Arrival text — appears as the veil lifts and the entrance exits */}
      <div
        style={{
          position: "absolute",
          zIndex: 3,
          left: "50%",
          top: "52%",
          transform: "translate(-50%, -50%)",
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "17px",
          fontStyle: "italic",
          fontWeight: 300,
          color: "rgba(201,168,76,0.58)",
          opacity: arrivalVisible ? 1 : 0,
          letterSpacing: "0.6px",
          pointerEvents: "none",
          transition: "opacity 1200ms ease",
          textAlign: "center",
          whiteSpace: "nowrap",
        }}
      >
        The galaxy was always here.
      </div>
    </div>
  );
}
