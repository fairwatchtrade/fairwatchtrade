"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";

/* ════════════════════════════════════════════════════════════════════════
   THE VAULT GALAXY — components/VaultGalaxy.tsx   (v1.85)

   The POC engine ported to real data. Canvas rendering, camera/zoom,
   click hit-detection, orbit rings, starfield, and search are ported
   faithfully from fairwatchtrade_vault_galaxy_poc-1.html. What changed:

   v1.83 — flyTo overshoot fix: fly targets divided by brand depth (b.z)
           in enterBrand / enterCollection / runSearch so a brand lands
           dead-center for any z (see enterBrand comment for the math).
   v1.84 — Askania empty-state: a brand with zero collections no longer
           dead-ends on "Choose a planet." When the fetch returns no
           collections, the card renders a graceful "still being mapped"
           state with a Return to Galaxy affordance. Never a dead end,
           never a blank stare.
   v1.85 — Persistent Return to Galaxy exit. The only way out used to be
           RESET buried in the search bar — invisible to a first-time
           traveller. The top-left control zone now swaps: filter chips in
           the galaxy, a quiet "← Return to Galaxy" exit in every drill
           state (view !== "brands"). Mutually exclusive, so no collision.

     • The hardcoded DATA array → real `brands` prop (the stars).
     • Brand positions → AUTHORED galaxy_x/y/z when present, else a
       deterministic seeded spiral (per-brand fallback).
     • Deeper tiers (collections/families/variants/references) → fetched
       on drill-down from /api/vault/[brandId] instead of pre-loaded.

   3-body galaxy (5-tier data):
     star   = brand
     planet = collection
     moon   = variant
   Family is grouping metadata shown inside the collection card, NOT an
   orbital body. References show in the variant detail card.

   Scope note: this is the abstract gold-glow galaxy (POC aesthetic). The
   photoreal Selene-relief moons, the gated entrance, and the rich image
   card are later flights — this is the engine they'll build on.

   Readability: the canvas is dark by nature, but all surrounding UI text
   (labels, hints, crumb) floors at --muted per Readability-Floor-Governance.
   ════════════════════════════════════════════════════════════════════════ */

// ── Types ──
type VaultBrand = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  search_aliases: string[] | null;
  galaxy_x: number | null;
  galaxy_y: number | null;
  galaxy_z: number | null;
  cluster: string | null;
};

type VaultReference = {
  id: string;
  reference: string | null;
  metadata: Record<string, unknown> | null;
  sort_order: number | null;
};

type VaultVariant = {
  id: string;
  name: string;
  description: string | null;
  notes: string | null;
  search_aliases: string[] | null;
  sort_order: number | null;
  vault_references: VaultReference[];
};

type VaultFamily = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number | null;
  vault_variants: VaultVariant[];
};

type VaultCollection = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number | null;
  vault_families: VaultFamily[];
};

// A brand with its resolved galaxy position + runtime brightness.
type PositionedBrand = VaultBrand & { x: number; y: number; z: number; brightness: number };

// ── Viewport responsiveness ──
// The Rule #1 immersion (wide spread, deep zoom) is tuned for desktop. On a
// phone that same spread+zoom collapses into one giant glow ("the blob").
// This factor tames spread and opening scale on narrow viewports so a phone
// sees a modest, navigable field while desktop keeps the wide universe.
function viewportFactor() {
  if (typeof window === "undefined") return 1;
  const w = window.innerWidth;
  if (w >= 1100) return 1;        // desktop — full immersion
  if (w <= 480) return 0.42;      // phone — modest, POC-like spread
  // tablet range: smooth interpolation between phone and desktop
  return 0.42 + (w - 480) * ((1 - 0.42) / (1100 - 480));
}
function isMobileViewport() {
  return typeof window !== "undefined" && window.innerWidth <= 700;
}

// ── Position generation — seeded spiral fallback (from the brief) ──
function generateGalaxyPosition(slug: string, index: number) {
  const seed = slug.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const angle = index * goldenAngle;
  // Wide spread: the Vault is a universe — it must exceed the viewport in
  // every direction so you can never frame the whole at once. The field is
  // far larger than any screen; you are always WITHIN it, seeing only a part.
  // Scaled by viewportFactor so phones get a tighter, navigable field.
  const radius = (Math.sqrt(index) * 74 + 40) * viewportFactor();
  const jitter = ((seed % 31) - 15) * viewportFactor();
  return {
    x: Math.cos(angle) * radius + jitter,
    y: Math.sin(angle) * radius + jitter,
    // z is depth (0.4 near → 1.4 far) — drives parallax so movement feels
    // like travelling through a volume, not panning a flat map.
    z: 0.4 + ((seed % 100) / 100),
  };
}

// ── Relevance scoring — ported from POC, adapted to real fields ──
function relevance(b: PositionedBrand, terms: string[]): number {
  if (!terms.length) return 1;
  const hay = (
    b.name +
    " " +
    (b.description ?? "") +
    " " +
    (b.search_aliases ?? []).join(" ") +
    " " +
    (b.cluster ?? "")
  ).toLowerCase();
  let s = 0;
  terms.forEach((term) => {
    if (hay.includes(term)) s++;
  });
  return Math.max(0.18, s / Math.max(1, terms.length));
}

const FILTER_CHIPS = ["Independent", "Architectural", "Japanese", "Manual wind", "Heritage"];

// ── Reduced-motion preference — checked once at module level ──
export default function VaultGalaxy({ brands, atlantisIntro = false }: { brands: VaultBrand[]; atlantisIntro?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Resolve each brand's position once: authored coords win, spiral fallback.
  const positioned = useMemo<PositionedBrand[]>(() => {
    return brands.map((b, i) => {
      const hasCoords =
        b.galaxy_x !== null && b.galaxy_y !== null && b.galaxy_x !== undefined && b.galaxy_y !== undefined;
      const vf = viewportFactor();
      const pos = hasCoords
        ? { x: (b.galaxy_x as number) * vf, y: (b.galaxy_y as number) * vf, z: b.galaxy_z ?? 0.7 }
        : generateGalaxyPosition(b.slug || String(i), i);
      return { ...b, ...pos, brightness: 1 };
    });
  }, [brands]);

  // ── React-surfaced state (drives the DOM card/crumb/hero) ──
  const [view, setView] = useState<"brands" | "collections" | "models" | "detail">("brands");
  const [selectedBrand, setSelectedBrand] = useState<PositionedBrand | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<VaultCollection | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<VaultVariant | null>(null);
  const [brandDetail, setBrandDetail] = useState<VaultCollection[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [crumb, setCrumb] = useState("The gates are open");
  const [heroHidden, setHeroHidden] = useState(atlantisIntro);
  // True once the user has drilled into their first brand — gates the
  // back-button caution so it only appears after there's something to warn about.
  const [hasEntered, setHasEntered] = useState(false);
  const [query, setQuery] = useState("");

  // ── Engine refs (mutable, outside React render) ──
  const openScale = isMobileViewport() ? 1.15 : 2.2;
  const camRef = useRef({ x: 0, y: 0, scale: openScale });
  const targetRef = useRef({ x: 0, y: 0, scale: openScale });
  // Drag-to-pan state: tracks pointer drag so you can pull the universe around.
  const dragRef = useRef({ active: false, moved: false, lastX: 0, lastY: 0 });
  const objectsRef = useRef<EngineObject[]>([]);
  const tRef = useRef(0);
  const dprRef = useRef(1);
  // Mirror state into refs so the rAF loop reads current values without re-binding.
  const viewRef = useRef(view);
  const selBrandRef = useRef(selectedBrand);
  const selCollRef = useRef(selectedCollection);
  const detailRef = useRef<VaultCollection[] | null>(brandDetail);
  const brightnessRef = useRef<Record<string, number>>({});

  // ── Atlantis overlay state (v2.0) ─────────────────────────────────────
  // /vault mounts the REAL working galaxy from first paint. Atlantis is only
  // the viewing-room overlay: gates + veil above this same canvas. No route
  // handoff, no preview field, no duplicate stars.
  const [atlantisActive, setAtlantisActive] = useState(atlantisIntro);
  const [atlantisIgnited, setAtlantisIgnited] = useState(false);
  const [atlantisRevealing, setAtlantisRevealing] = useState(false);
  const atlantisEnteredRef = useRef(false);
  const atlantisRevealStartRef = useRef(0);
  const veilCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const atlantisMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const atlantisRafRef = useRef<number>(0);
  const atlantisTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { selBrandRef.current = selectedBrand; }, [selectedBrand]);
  useEffect(() => { selCollRef.current = selectedCollection; }, [selectedCollection]);
  useEffect(() => { detailRef.current = brandDetail; }, [brandDetail]);

  // ── Opening drift — fires once on mount ──
  // flyTo refs targetRef.current, safe to call here.
  useEffect(() => {
    const mob = isMobileViewport();
    flyTo(0, 0, mob ? 1.25 : 2.4);
    const t = setTimeout(() => flyTo(0, 0, mob ? 1.15 : 2.2), 400);
    setCrumb("Welcome to the Galaxy");
    return () => clearTimeout(t);
  }, []);

  type EngineObject = {
    type: "brand" | "brandCore" | "collection" | "model";
    refIndex?: number; // index into positioned (for brands)
    coll?: VaultCollection;
    collIdx?: number;
    variant?: VaultVariant;
    x: number;
    y: number;
    z: number;
    r: number;
    label: string;
    glow: number;
  };

  function flyTo(x: number, y: number, scale: number) {
    targetRef.current = { x, y, scale };
  }

  // ── Atlantis v2.0 — one click, curtain, automatic walk-in, no route ──
  const startAtlantisReveal = useCallback(() => {
    if (atlantisEnteredRef.current) return;
    atlantisEnteredRef.current = true;
    atlantisRevealStartRef.current = performance.now();

    setAtlantisIgnited(true);

    // Entrance UI yields while the veil lift is underway.
    atlantisTimersRef.current.push(
      setTimeout(() => setAtlantisRevealing(true), 620)
    );

    // KSC walk-in moment: once the curtain has largely lifted, move the
    // already-mounted working galaxy closer. This is not a movie cut and not
    // a route transition — it is the same room pulling forward.
    atlantisTimersRef.current.push(
      setTimeout(() => {
        flyTo(0, 0, isMobileViewport() ? 1.38 : 2.68);
      }, 2700)
    );

    // Hand control to the live galaxy. The canvas never unmounts; only the
    // viewing-room overlay disappears. Bring the normal Galaxy UI in after the
    // wall has yielded.
    atlantisTimersRef.current.push(
      setTimeout(() => {
        setAtlantisActive(false);
        setHeroHidden(false);
      }, 3650)
    );
  }, []);

  useEffect(() => {
    const timers = atlantisTimersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(atlantisRafRef.current);
    };
  }, []);

  // ── Drill-down: enter a brand (fetch its subtree) ──
  async function enterBrand(b: PositionedBrand) {
    setView("collections");
    setSelectedBrand(b);
    setSelectedCollection(null);
    setSelectedVariant(null);
    setHeroHidden(true);
    setHasEntered(true);
    setCrumb("Brand constellation · " + b.name);
    // Overshoot fix: the projection renders at screen.y = cy + (o.y - cam.y*z)*scale,
    // so flying cam to (b.x, b.y) lands the brand at cy + b.y*(1 - z)*scale —
    // centered ONLY when z≈1. Far/off-z brands overshot off-screen. Dividing the
    // fly target by the brand's depth (b.z) makes it land dead-center for ANY z:
    //   screen.y = cy + (b.y - (b.y/z)*z)*scale = cy. Verified.
    flyTo(b.x / b.z, b.y / b.z, 2.35); // camera moves immediately; card fills when data lands
    setLoading(true);
    try {
      const res = await fetch(`/api/vault/${b.id}`);
      const data = await res.json();
      setBrandDetail(data.collections ?? []);
    } catch {
      setBrandDetail([]);
    }
    setLoading(false);
  }

  function enterCollection(c: VaultCollection, idx: number) {
    const b = selBrandRef.current;
    if (!b) return;
    setSelectedCollection(c);
    setSelectedVariant(null);
    setView("models");
    const n = Math.max(3, (detailRef.current?.length ?? 1));
    const a = -Math.PI / 2 + idx * ((Math.PI * 2) / n);
    setCrumb(b.name + " · " + c.name);
    // Same /z overshoot fix: the planet orbits at the brand's depth, so divide
    // the whole (brand + orbital offset) target by b.z to land it dead-center.
    flyTo((b.x + Math.cos(a) * 58) / b.z, (b.y + Math.sin(a) * 42) / b.z, 3.5);
  }

  function enterVariant(v: VaultVariant) {
    const b = selBrandRef.current;
    const c = selCollRef.current;
    if (!b || !c) return;
    setSelectedVariant(v);
    setView("detail");
    setCrumb(b.name + " · " + c.name + " · " + v.name);
    flyTo(camRef.current.x, camRef.current.y, 5.2);
  }

  function resetGalaxy() {
    setView("brands");
    setSelectedBrand(null);
    setSelectedCollection(null);
    setSelectedVariant(null);
    setBrandDetail(null);
    setCrumb("The gates are open");
    setHeroHidden(false);
    brightnessRef.current = {};
    flyTo(0, 0, isMobileViewport() ? 1.15 : 2.2);
  }

  function historyBack() {
    if (viewRef.current === "detail") {
      setView("models");
      setSelectedVariant(null);
    } else if (viewRef.current === "models") {
      setView("collections");
      setSelectedCollection(null);
    } else {
      resetGalaxy();
    }
  }

  // ── Search — ported from POC ──
  function runSearch(raw: string) {
    const terms = raw.toLowerCase().split(/[\s,]+/).filter(Boolean);
    setView("brands");
    setSelectedBrand(null);
    setSelectedCollection(null);
    setSelectedVariant(null);
    setBrandDetail(null);
    setHeroHidden(true);
    setCrumb(terms.length ? "Galaxy arranged by curiosity" : "The gates are open");

    const bmap: Record<string, number> = {};
    let best: PositionedBrand | null = null;
    let bestScore = -1;
    positioned.forEach((b) => {
      const r = relevance(b, terms);
      bmap[b.id] = r;
      if (r > bestScore) {
        bestScore = r;
        best = b;
      }
    });
    brightnessRef.current = bmap;
    // Same /z overshoot fix as enterBrand — divide the search target by its depth
    // so the flown-to brand lands centered regardless of z (was fine only for
    // brands that happened to have z≈1).
    if (best) {
      const pb = best as PositionedBrand;
      flyTo(pb.x / pb.z, pb.y / pb.z, 2.2);
    }
  }

  // ── Canvas engine — ported from POC, runs once on mount ──
  useEffect(() => {
    const canvasEl = canvasRef.current;
    const context = canvasEl?.getContext("2d");
    if (!canvasEl || !context) return;
    // Non-null locals the nested closures can safely capture.
    const cv: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = context;

    let raf = 0;

    function resize() {
      dprRef.current = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = window.innerWidth * dprRef.current;
      cv.height = window.innerHeight * dprRef.current;
      ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
    }
    window.addEventListener("resize", resize);
    resize();

    function screen(o: { x: number; y: number; z?: number; r?: number }) {
      const cam = camRef.current;
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2 + 10;
      // Parallax: a star's apparent motion scales with its depth (z). Near
      // stars (high z) sweep past faster than far stars (low z) as the camera
      // moves — the field reads as a VOLUME you travel through, not a flat map
      // you pan. This is what makes you feel inside the universe.
      const depth = o.z || 1;
      return {
        x: cx + (o.x - cam.x * depth) * cam.scale,
        y: cy + (o.y - cam.y * depth) * cam.scale,
        r: (o.r || 6) * cam.scale * depth,
      };
    }

    function starfield() {
      const t = tRef.current;
      for (let i = 0; i < 120; i++) {
        const x = (i * 137.508 + Math.sin(t * 0.00008 + i) * 18) % window.innerWidth;
        const y = (i * 83.17 + Math.cos(t * 0.0001 + i) * 12) % window.innerHeight;
        const a = 0.12 + 0.25 * Math.abs(Math.sin(t * 0.0005 + i));
        ctx.fillStyle = `rgba(232,228,220,${a})`;
        ctx.beginPath();
        ctx.arc(x, y, i % 3 === 0 ? 1.2 : 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function orbit(cx: number, cy: number, rx: number, ry: number, a = 0.18) {
      ctx.strokeStyle = `rgba(201,168,76,${a})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Build the object list for the current view (ported build()).
    function build() {
      const objs: EngineObject[] = [];
      const v = viewRef.current;
      const sb = selBrandRef.current;
      const sc = selCollRef.current;
      const detail = detailRef.current;
      const bmap = brightnessRef.current;

      if (v === "brands") {
        positioned.forEach((b, i) => {
          const glow = bmap[b.id] ?? b.brightness ?? 1;
          objs.push({
            type: "brand",
            refIndex: i,
            x: b.x,
            y: b.y,
            z: b.z,
            r: 7 + glow * 5,
            label: b.name,
            glow,
          });
        });
      }

      if ((v === "collections" || v === "models" || v === "detail") && sb) {
        objs.push({
          type: "brandCore",
          refIndex: positioned.indexOf(sb),
          x: sb.x,
          y: sb.y,
          z: sb.z,
          r: 12,
          label: sb.name,
          glow: 1.2,
        });
        const colls = detail ?? [];
        colls.forEach((c, i) => {
          const n = Math.max(1, colls.length);
          const a = -Math.PI / 2 + i * ((Math.PI * 2) / n) + Math.sin(tRef.current * 0.0004) * 0.05;
          objs.push({
            type: "collection",
            coll: c,
            collIdx: i,
            x: sb.x + Math.cos(a) * 66,
            y: sb.y + Math.sin(a) * 48,
            z: sb.z,
            r: 8,
            label: c.name,
            glow: 0.95,
          });
        });
      }

      if ((v === "models" || v === "detail") && sb && sc && detail) {
        const cidx = detail.indexOf(sc);
        const a = -Math.PI / 2 + cidx * ((Math.PI * 2) / Math.max(1, detail.length));
        const cx = sb.x + Math.cos(a) * 66;
        const cy = sb.y + Math.sin(a) * 48;
        // Moons = variants. Family is grouping metadata, not orbital — so we
        // flatten all variants across the collection's families into moons.
        const variants: VaultVariant[] = [];
        sc.vault_families?.forEach((f) => f.vault_variants?.forEach((vv) => variants.push(vv)));
        variants.forEach((m, i) => {
          const n = Math.max(1, variants.length);
          // Moons orbit — that is what makes it a galaxy. But VERY slowly:
          // a serene, contemplative revolution you can dwell on and click,
          // not a shooting gallery. The orbit stays; only the haste goes.
          const ma = i * ((Math.PI * 2) / n) + tRef.current * 0.00008;
          objs.push({
            type: "model",
            variant: m,
            x: cx + Math.cos(ma) * 34,
            y: cy + Math.sin(ma) * 26,
            z: sb.z,
            r: 5.5,
            label: m.name,
            glow: 0.9,
          });
        });
      }

      objectsRef.current = objs;
    }

    function draw() {
      tRef.current = performance.now();
      const cam = camRef.current;
      const target = targetRef.current;
      cam.x += (target.x - cam.x) * 0.045;
      cam.y += (target.y - cam.y) * 0.045;
      cam.scale += (target.scale - cam.scale) * 0.045;

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      starfield();
      build();

      const v = viewRef.current;
      const sb = selBrandRef.current;
      const sc = selCollRef.current;
      const detail = detailRef.current;

      if ((v === "collections" || v === "models" || v === "detail") && sb) {
        const c = screen({ x: sb.x, y: sb.y, z: sb.z });
        orbit(c.x, c.y, 66 * cam.scale * sb.z, 48 * cam.scale * sb.z, 0.13);
      }
      if ((v === "models" || v === "detail") && sb && sc && detail) {
        const ci = detail.indexOf(sc);
        const a = -Math.PI / 2 + ci * ((Math.PI * 2) / Math.max(1, detail.length));
        const p = screen({ x: sb.x + Math.cos(a) * 66, y: sb.y + Math.sin(a) * 48, z: sb.z });
        orbit(p.x, p.y, 34 * cam.scale * sb.z, 26 * cam.scale * sb.z, 0.11);
      }

      objectsRef.current.forEach((o) => {
        const p = screen(o);
        if (p.x < -80 || p.x > window.innerWidth + 80 || p.y < -80 || p.y > window.innerHeight + 80) return;
        const glow = o.glow || 1;
        const glowCap = isMobileViewport()
          ? Math.min(window.innerWidth, window.innerHeight) * 0.18
          : Infinity;
        const glowR = Math.min(Math.max(16, p.r * 5), glowCap);
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
        grd.addColorStop(0, `rgba(201,168,76,${0.75 * glow})`);
        grd.addColorStop(0.25, `rgba(201,168,76,${0.22 * glow})`);
        grd.addColorStop(1, "rgba(201,168,76,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = o.type === "model" ? "rgba(232,228,220,.88)" : "rgba(201,168,76,.9)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(2.5, p.r), 0, Math.PI * 2);
        ctx.fill();

        if (cam.scale > 1.25 || o.type === "brand" || o.type === "brandCore") {
          ctx.font = `${o.type === "brandCore" ? 18 : 13}px 'Cormorant Garamond', serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(232,228,220,.9)";
          ctx.fillText(o.label, p.x, p.y - p.r - 12);
        }
      });

      raf = requestAnimationFrame(draw);
    }
    draw();

    // ── Pointer: drag-to-pan + click-to-select (a drag suppresses the click) ──
    function doSelect(mx: number, my: number) {
      let hit: EngineObject | null = null;
      let dist = 99999;
      objectsRef.current.forEach((o) => {
        const p = screen(o);
        const d = Math.hypot(mx - p.x, my - p.y);
        if (d < Math.max(18, p.r + 10) && d < dist) {
          hit = o;
          dist = d;
        }
      });
      if (!hit) return;
      const h = hit as EngineObject;
      if (h.type === "brand" || h.type === "brandCore") {
        if (h.refIndex !== undefined) enterBrand(positioned[h.refIndex]);
      } else if (h.type === "collection" && h.coll !== undefined && h.collIdx !== undefined) {
        enterCollection(h.coll, h.collIdx);
      } else if (h.type === "model" && h.variant !== undefined) {
        enterVariant(h.variant);
      }
    }

    function onPointerDown(e: PointerEvent) {
      dragRef.current = { active: true, moved: false, lastX: e.clientX, lastY: e.clientY };
    }
    function onPointerMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d.active) return;
      const dx = e.clientX - d.lastX;
      const dy = e.clientY - d.lastY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
      // Pan: move the camera target opposite the drag, divided by scale so the
      // field tracks the cursor 1:1. You pull the universe around you.
      const cam = camRef.current;
      targetRef.current = {
        x: targetRef.current.x - dx / cam.scale,
        y: targetRef.current.y - dy / cam.scale,
        scale: targetRef.current.scale,
      };
      // Keep the camera responsive mid-drag (don't wait for the lerp to catch up).
      camRef.current = { ...camRef.current, x: cam.x - dx / cam.scale, y: cam.y - dy / cam.scale };
      d.lastX = e.clientX;
      d.lastY = e.clientY;
    }
    function onPointerUp(e: PointerEvent) {
      const d = dragRef.current;
      d.active = false;
      // Only a true click (no meaningful drag) selects — a pan must not also
      // fire a star select.
      if (!d.moved) doSelect(e.clientX, e.clientY);
    }

    cv.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      cv.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    // positioned is stable (memoized on brands); engine binds once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positioned]);


  // ── Atlantis veil canvas — theater only; real Galaxy canvas is underneath ──
  useEffect(() => {
    if (!atlantisIntro || !atlantisActive) return;
    const veilCanvas = veilCanvasRef.current;
    if (!veilCanvas) return;

    const veilCtx = veilCanvas.getContext("2d");
    if (!veilCtx) return;

    const maskCanvas = document.createElement("canvas");
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;
    atlantisMaskCanvasRef.current = maskCanvas;

    let W = 0;
    let H = 0;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    function smoothstep(a: number, b: number, x: number): number {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    }

    function easeOutCubic(x: number): number {
      return 1 - Math.pow(1 - x, 3);
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

    function resizeVeil() {
      W = window.innerWidth;
      H = window.innerHeight;
      [veilCanvas, maskCanvas].forEach((c) => {
        c.width = Math.floor(W * DPR);
        c.height = Math.floor(H * DPR);
        c.style.width = W + "px";
        c.style.height = H + "px";
      });
      veilCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
      maskCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
      prerenderMask();
    }

    function drawVeil(now: number) {
      let p = 0;
      if (atlantisEnteredRef.current) {
        p = Math.min(1, (now - atlantisRevealStartRef.current) / 3000);
      }

      const peek = smoothstep(0.08, 0.34, p);
      const lift = easeOutCubic(smoothstep(0.34, 0.96, p));
      const coveredHeight = H * (1 - lift);

      veilCtx.clearRect(0, 0, W, H);
      veilCtx.fillStyle = atlantisEnteredRef.current
        ? "rgba(13,15,20,0.985)"
        : "rgba(13,15,20,0.997)";
      veilCtx.fillRect(0, 0, W, coveredHeight);

      if (peek > 0 && coveredHeight > 0) {
        veilCtx.save();
        veilCtx.globalCompositeOperation = "destination-out";
        veilCtx.globalAlpha = 0.2 + peek * 0.7;
        veilCtx.drawImage(maskCanvas, 0, 0, W, H);
        veilCtx.restore();
      }

      if (lift > 0 && lift < 1) {
        const y = coveredHeight;
        const edge = veilCtx.createLinearGradient(0, y - 180, 0, y + 180);
        edge.addColorStop(0, "rgba(13,15,20,0.97)");
        edge.addColorStop(0.5, "rgba(13,15,20,0.50)");
        edge.addColorStop(1, "rgba(13,15,20,0)");
        veilCtx.fillStyle = edge;
        veilCtx.fillRect(0, y - 185, W, 370);

        // Very faint light seam: the edge of a physical screen catching light.
        veilCtx.fillStyle = `rgba(201,168,76,${0.035 * (1 - lift)})`;
        veilCtx.fillRect(0, y - 1, W, 1);
      }
    }

    function frame(now: number) {
      drawVeil(now);
      atlantisRafRef.current = requestAnimationFrame(frame);
    }

    window.addEventListener("resize", resizeVeil);
    resizeVeil();
    atlantisRafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resizeVeil);
      cancelAnimationFrame(atlantisRafRef.current);
    };
  }, [atlantisIntro, atlantisActive]);

  // ── Variant detail: gather references + the family it belongs to ──
  const variantFamily = useMemo(() => {
    if (!selectedVariant || !selectedCollection) return null;
    return (
      selectedCollection.vault_families?.find((f) =>
        f.vault_variants?.some((v) => v.id === selectedVariant.id)
      ) ?? null
    );
  }, [selectedVariant, selectedCollection]);

  return (
    <div
      className="fixed inset-0 z-[60] h-screen w-full overflow-hidden bg-[var(--ink-deep)]"
    >
      <canvas
        ref={canvasRef}
        className="fixed inset-0 h-full w-full"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, #141824 0%, #090A10 45%, #03040A 100%)",
          touchAction: "none",
          cursor: "grab",
        }}
      />

      <div style={{ opacity: atlantisActive ? 0 : 1, pointerEvents: atlantisActive ? "none" : "auto", transition: "opacity 700ms ease" }}>
      {/* Crumb trail */}
      <div className="pointer-events-none fixed left-0 right-0 top-0 z-[5] flex items-center justify-between px-7 py-4">
        <div className="font-display text-[16px] text-[var(--platinum)]">
          Fair<span className="text-[var(--gold)]">Watch</span>Trade Vault
        </div>
        <div className="text-[10px] uppercase tracking-[2px] text-[var(--muted)]">{crumb}</div>
      </div>

      {/* Top-left control zone.
          Global navigation changes where you are; workspace controls change what
          you're doing. In the galaxy this slot offers discovery (filter chips).
          Once drilled in, brand-search chips are contextually wrong, so the same
          slot becomes the persistent way out — Return to Galaxy. The two are
          mutually exclusive, so they never collide. */}

      {/* Filter chips — galaxy (brands) view only */}
      {view === "brands" && (
        <div className="fixed left-7 top-[76px] z-[6] flex flex-wrap gap-2">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => {
                setQuery(chip.toLowerCase());
                runSearch(chip.toLowerCase());
              }}
              className="cursor-pointer border border-[var(--border-subtle)] bg-[rgba(7,8,12,0.4)] px-2.5 py-2 text-[9px] uppercase tracking-[1.5px] text-[var(--slate)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--gold)]"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Return to Galaxy — persistent exit, any drill state.
          The only exit used to be RESET buried in the search bar; a first-time
          traveller had no way to know it was there. This is the always-visible
          way home. Quiet, but never hidden — legible over the starfield in
          Florida sun (Readability-Floor-Governance). Calls resetGalaxy(), which
          flies the camera to the origin and clears all drill state. */}
      {view !== "brands" && (
        <div className="fixed left-7 top-[76px] z-[6]">
          <button
            onClick={resetGalaxy}
            aria-label="Return to the galaxy"
            className="group flex items-center gap-2 border border-[var(--border-subtle)] bg-[rgba(7,8,12,0.55)] px-3 py-2 backdrop-blur-md transition-colors hover:border-[var(--border-gold)]"
          >
            <span className="text-[13px] leading-none text-[var(--slate)] transition-colors group-hover:text-[var(--gold)]">
              ←
            </span>
            <span className="text-[9px] uppercase tracking-[2px] text-[var(--slate)] transition-colors group-hover:text-[var(--gold)]">
              Return to Galaxy
            </span>
          </button>
        </div>
      )}

      {/* Hero */}
      <div
        className={`pointer-events-none fixed left-1/2 top-[13%] z-[4] w-[min(760px,calc(100%-40px))] -translate-x-1/2 text-center transition-all duration-700 ${
          heroHidden ? "-translate-y-4 opacity-0" : "opacity-100"
        }`}
      >
        <div className="mb-[18px] text-[9px] uppercase tracking-[5px] text-[var(--gold-subtle)]">
          The FairWatchTrade Vault
        </div>
        <h1 className="mb-3 font-display text-[42px] font-light leading-[1.15] text-[var(--platinum)]">
          What draws you <em className="italic text-[var(--gold)]">to a watch?</em>
        </h1>
        <p className="mx-auto max-w-[560px] font-display text-[17px] font-light italic leading-[1.6] text-[var(--slate)]">
          Begin with curiosity. The Vault will illuminate a path through brands,
          collections, and references.
        </p>
      </div>

      {/* Detail / drill-down card */}
      {(view !== "brands" || selectedBrand) && (
        <div className="fixed z-[7] border border-[var(--border-subtle)] bg-[rgba(7,8,12,0.84)] p-5 backdrop-blur-md max-sm:bottom-[150px] max-sm:left-4 max-sm:right-4 max-sm:top-auto sm:right-7 sm:top-[90px] sm:w-[330px]">
          {loading ? (
            <p className="font-display text-[14px] font-light italic text-[var(--muted)]">
              Illuminating the constellation…
            </p>
          ) : view === "detail" && selectedVariant ? (
            <>
              <div className="mb-[10px] text-[8px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
                Reference card
              </div>
              <h2 className="mb-[10px] font-display text-[26px] font-light text-[var(--platinum)]">
                {selectedVariant.name}
              </h2>
              {variantFamily && (
                <div className="mb-2 text-[9px] uppercase tracking-[2px] text-[var(--muted)]">
                  {variantFamily.name}
                </div>
              )}
              {selectedVariant.description && (
                <p className="mb-3 font-display text-[15px] font-light leading-[1.65] text-[var(--slate)]">
                  {selectedVariant.description}
                </p>
              )}
              {selectedVariant.notes && (
                <p className="mb-3 font-display text-[13px] font-light italic leading-[1.6] text-[var(--muted)]">
                  {selectedVariant.notes}
                </p>
              )}
              {selectedVariant.vault_references?.length > 0 && (
                <div className="mt-3 border-t border-[var(--border-faint)] pt-3">
                  <div className="mb-2 text-[8px] uppercase tracking-[2px] text-[var(--muted)]">
                    References
                  </div>
                  {selectedVariant.vault_references.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-baseline justify-between gap-4 py-1 text-[12px] text-[var(--slate)]"
                    >
                      <span>{r.reference ?? "—"}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-[18px] flex gap-2">
                <button onClick={resetGalaxy} className="fw-btn-primary">
                  Return to Galaxy
                </button>
                <button onClick={historyBack} className="fw-btn-secondary">
                  Back
                </button>
              </div>
            </>
          ) : view === "models" && selectedCollection ? (
            <>
              <div className="mb-[10px] text-[8px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
                {selectedBrand?.name}
              </div>
              <h2 className="mb-[10px] font-display text-[26px] font-light text-[var(--platinum)]">
                {selectedCollection.name}
              </h2>
              {selectedCollection.description && (
                <p className="mb-3 font-display text-[15px] font-light leading-[1.65] text-[var(--slate)]">
                  {selectedCollection.description}
                </p>
              )}
              {/* Family groupings surfaced here (not as orbital bodies) */}
              {selectedCollection.vault_families?.length > 0 && (
                <div className="mt-3 border-t border-[var(--border-faint)] pt-3">
                  <div className="mb-2 text-[8px] uppercase tracking-[2px] text-[var(--muted)]">
                    Families
                  </div>
                  {selectedCollection.vault_families.map((f) => (
                    <div key={f.id} className="py-1 text-[12px] text-[var(--slate)]">
                      {f.name}
                      <span className="text-[var(--muted)]">
                        {" "}
                        · {f.vault_variants?.length ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 text-[10px] italic text-[var(--muted)]">Choose a moon.</div>
            </>
          ) : view === "collections" && selectedBrand && (brandDetail?.length ?? 0) === 0 ? (
            /* Empty-state: a brand whose constellation has no collections yet.
               The `loading` branch is checked first, so reaching here means the
               fetch has resolved with nothing — a genuinely unmapped brand, not
               a mid-load flicker. Never a dead end: always a way back. */
            <>
              <div className="mb-[10px] text-[8px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
                Manufacturer
              </div>
              <h2 className="mb-[10px] font-display text-[26px] font-light text-[var(--platinum)]">
                {selectedBrand.name}
              </h2>
              <p className="mb-3 font-display text-[15px] font-light leading-[1.65] text-[var(--slate)]">
                This constellation is still being mapped.
              </p>
              <p className="mb-1 font-display text-[13px] font-light italic leading-[1.6] text-[var(--muted)]">
                Every house in the Vault is charted by hand — {selectedBrand.name}
                &apos;s collections are still to come.
              </p>
              <div className="mt-[18px]">
                <button onClick={resetGalaxy} className="fw-btn-primary">
                  Return to Galaxy
                </button>
              </div>
            </>
          ) : view === "collections" && selectedBrand ? (
            <>
              <div className="mb-[10px] text-[8px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
                Manufacturer
              </div>
              <h2 className="mb-[10px] font-display text-[26px] font-light text-[var(--platinum)]">
                {selectedBrand.name}
              </h2>
              {selectedBrand.description && (
                <p className="mb-3 font-display text-[15px] font-light leading-[1.65] text-[var(--slate)]">
                  {selectedBrand.description}
                </p>
              )}
              <div className="mt-3 border-t border-[var(--border-faint)] pt-3 text-[10px] uppercase tracking-[1px] text-[var(--muted)]">
                <div className="flex justify-between py-1">
                  <span>Collections</span>
                  <span className="text-[var(--platinum-dim)]">{brandDetail?.length ?? 0}</span>
                </div>
                <div className="mt-1 italic tracking-normal">Choose a planet.</div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Search bar */}
      <div className="fixed bottom-[42px] left-1/2 z-[8] w-[min(710px,calc(100%-32px))] -translate-x-1/2 border border-[var(--border-gold)] bg-[rgba(7,8,12,0.72)] p-[14px] backdrop-blur-lg">
        <label className="mb-[10px] block text-[9px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
          What interests you today?
        </label>
        <div className="flex flex-wrap gap-[10px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch(query);
            }}
            placeholder="Try: architectural manual wind, Japanese independent, heritage chronograph…"
            className="flex-1 border-0 border-b border-[var(--border-mid)] bg-transparent px-[2px] py-2 font-display text-[21px] text-[var(--platinum)] outline-none placeholder:italic placeholder:text-[var(--void)]"
          />
          <button onClick={() => runSearch(query)} className="fw-btn-primary">
            Explore
          </button>
          <button onClick={resetGalaxy} className="fw-btn-secondary">
            Reset
          </button>
        </div>
        <p className="mt-[10px] text-[11px] leading-[1.5] text-[var(--muted)]">
          Click a star to fly toward a brand. Click a planet to enter a collection. Click a
          moon to reach the reference card.
        </p>
        {hasEntered && view !== "brands" && (
          <p className="mt-[7px] text-[11px] font-medium leading-[1.5] text-[#E0A845]">
            Use <span className="uppercase tracking-[1px]">Reset</span> to step back — not your
            browser&apos;s back button, which will exit the Vault.
          </p>
        )}
      </div>

      {/* Quiet disclosure line */}
      <div className="pointer-events-none fixed bottom-[10px] left-1/2 z-[6] -translate-x-1/2 text-center font-display text-[9px] italic text-[var(--ghost)]">
        {brands.length} manufacturers. A living catalogue of independent and heritage
        watchmaking.
      </div>
      </div>

      {atlantisActive && (
        <>
          <canvas
            ref={veilCanvasRef}
            aria-hidden="true"
            className="fixed inset-0 z-[48] h-full w-full"
            style={{ pointerEvents: "none" }}
          />

          <div
            className="fixed inset-0 z-[49] flex flex-col bg-transparent"
            style={{
              opacity: atlantisRevealing ? 0 : 1,
              transform: atlantisRevealing ? "translateY(-18px)" : "translateY(0)",
              transition: "opacity 850ms ease, transform 850ms ease",
              transitionDelay: atlantisRevealing ? "650ms" : "0ms",
            }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/[0.04] px-8 py-[18px]">
              <div className="font-display text-[15px] font-normal text-[var(--platinum)]">
                Fair<span className="text-[var(--gold)]">Watch</span>Trade
              </div>
              <div className="text-[9px] uppercase tracking-[2px] text-[#4A4F5C]">
                ← Marketplace
              </div>
            </div>

            <div className="relative flex flex-1 items-stretch">
              <div
                className="relative w-[88px] shrink-0"
                style={{ opacity: atlantisIgnited ? 0.12 : 1, transition: "opacity 700ms ease" }}
              >
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

              <div className="flex flex-1 flex-col items-center justify-center px-8 pb-12 pt-10 text-center">
                <div className="mb-9">
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

                <div className="mb-8 text-[8px] uppercase tracking-[5px] text-[rgba(201,168,76,0.45)]">
                  The FairWatchTrade Vault
                </div>
                <div className="font-display text-[30px] font-light leading-[1.35] tracking-[0.3px] text-[var(--platinum)]">
                  What lies beyond these gates
                </div>
                <div className="mb-[6px] font-display text-[30px] font-light leading-[1.35] tracking-[0.3px] text-[var(--platinum)]">
                  isn&apos;t data.
                </div>
                <div
                  className="mb-9 font-display text-[30px] font-light italic leading-[1.35] tracking-[0.3px] text-[var(--gold)]"
                  style={{
                    textShadow: atlantisIgnited ? "0 0 18px rgba(201,168,76,0.22)" : "none",
                    transition: "text-shadow 200ms ease",
                  }}
                >
                  It&apos;s understanding.
                </div>

                <div
                  style={{
                    width: atlantisIgnited ? "76px" : "32px",
                    height: "1px",
                    background: "linear-gradient(to right, transparent, rgba(201,168,76,0.5), transparent)",
                    margin: "0 auto 28px",
                    filter: atlantisIgnited ? "brightness(1.85)" : "brightness(1)",
                    transition: "width 200ms ease, filter 200ms ease",
                  }}
                />

                <div className="mb-[52px] font-display text-[15px] font-light italic leading-[1.8] tracking-[0.2px] text-[var(--muted)]">
                  A living archive, freely open to every collector.
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={startAtlantisReveal}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      startAtlantisReveal();
                    }
                  }}
                  className="flex cursor-pointer select-none flex-col items-center"
                  aria-label="Enter the FairWatchTrade Vault"
                >
                  <div className="h-8 w-px bg-gradient-to-b from-transparent to-[rgba(201,168,76,0.3)]" />
                  <div className="py-2 text-[9px] uppercase tracking-[6px] text-[rgba(201,168,76,0.55)]">
                    Enter
                  </div>
                  <div className="h-5 w-px bg-gradient-to-b from-[rgba(201,168,76,0.25)] to-transparent" />
                </div>
              </div>

              <div
                className="relative w-[88px] shrink-0"
                style={{ opacity: atlantisIgnited ? 0.12 : 1, transition: "opacity 700ms ease" }}
              >
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
                    <linearGradient id="vault-gfadeL" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#0D0F14" stopOpacity="1" />
                      <stop offset="100%" stopColor="#0D0F14" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
