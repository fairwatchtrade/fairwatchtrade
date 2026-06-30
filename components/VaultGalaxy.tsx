"use client";

import { useEffect, useRef, useState, useMemo } from "react";

/* ════════════════════════════════════════════════════════════════════════
   THE VAULT GALAXY — components/VaultGalaxy.tsx   (v1.70)

   The POC engine ported to real data. Canvas rendering, camera/zoom,
   click hit-detection, orbit rings, starfield, and search are ported
   faithfully from fairwatchtrade_vault_galaxy_poc-1.html. What changed:

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

// ── Position generation — seeded spiral fallback (from the brief) ──
function generateGalaxyPosition(slug: string, index: number) {
  const seed = slug.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const angle = index * goldenAngle;
  const radius = Math.sqrt(index) * 28;
  const jitter = (seed % 17) - 8;
  return {
    x: Math.cos(angle) * radius + jitter,
    y: Math.sin(angle) * radius + jitter,
    z: 0.5 + ((seed % 50) / 100),
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

export default function VaultGalaxy({ brands }: { brands: VaultBrand[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Resolve each brand's position once: authored coords win, spiral fallback.
  const positioned = useMemo<PositionedBrand[]>(() => {
    return brands.map((b, i) => {
      const hasCoords =
        b.galaxy_x !== null && b.galaxy_y !== null && b.galaxy_x !== undefined && b.galaxy_y !== undefined;
      const pos = hasCoords
        ? { x: b.galaxy_x as number, y: b.galaxy_y as number, z: b.galaxy_z ?? 0.7 }
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
  const [heroHidden, setHeroHidden] = useState(false);
  const [query, setQuery] = useState("");

  // ── Engine refs (mutable, outside React render) ──
  const camRef = useRef({ x: 0, y: 0, scale: 1 });
  const targetRef = useRef({ x: 0, y: 0, scale: 1 });
  const objectsRef = useRef<EngineObject[]>([]);
  const tRef = useRef(0);
  const dprRef = useRef(1);
  // Mirror state into refs so the rAF loop reads current values without re-binding.
  const viewRef = useRef(view);
  const selBrandRef = useRef(selectedBrand);
  const selCollRef = useRef(selectedCollection);
  const detailRef = useRef<VaultCollection[] | null>(brandDetail);
  const brightnessRef = useRef<Record<string, number>>({});

  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { selBrandRef.current = selectedBrand; }, [selectedBrand]);
  useEffect(() => { selCollRef.current = selectedCollection; }, [selectedCollection]);
  useEffect(() => { detailRef.current = brandDetail; }, [brandDetail]);

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

  // ── Drill-down: enter a brand (fetch its subtree) ──
  async function enterBrand(b: PositionedBrand) {
    setView("collections");
    setSelectedBrand(b);
    setSelectedCollection(null);
    setSelectedVariant(null);
    setHeroHidden(true);
    setCrumb("Brand constellation · " + b.name);
    flyTo(b.x, b.y, 2.35); // camera moves immediately; card fills when data lands
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
    flyTo(b.x + Math.cos(a) * 58, b.y + Math.sin(a) * 42, 3.5);
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
    flyTo(0, 0, 1);
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
    if (best) flyTo((best as PositionedBrand).x * 0.25, (best as PositionedBrand).y * 0.25, 1.4);
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
      return {
        x: cx + (o.x - cam.x) * cam.scale,
        y: cy + (o.y - cam.y) * cam.scale,
        r: (o.r || 6) * cam.scale * (o.z || 1),
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

      if (v === "brands" || v === "detail") {
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

      if ((v === "collections" || v === "models") && sb) {
        objs.push({
          type: "brandCore",
          refIndex: positioned.indexOf(sb),
          x: sb.x,
          y: sb.y,
          z: 1,
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
            z: 0.9,
            r: 8,
            label: c.name,
            glow: 0.95,
          });
        });
      }

      if (v === "models" && sb && sc && detail) {
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
          const ma = i * ((Math.PI * 2) / n) + tRef.current * 0.0006;
          objs.push({
            type: "model",
            variant: m,
            x: cx + Math.cos(ma) * 34,
            y: cy + Math.sin(ma) * 26,
            z: 0.75,
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

      if ((v === "collections" || v === "models") && sb) {
        const c = screen({ x: sb.x, y: sb.y });
        orbit(c.x, c.y, 66 * cam.scale, 48 * cam.scale, 0.13);
      }
      if (v === "models" && sb && sc && detail) {
        const ci = detail.indexOf(sc);
        const a = -Math.PI / 2 + ci * ((Math.PI * 2) / Math.max(1, detail.length));
        const p = screen({ x: sb.x + Math.cos(a) * 66, y: sb.y + Math.sin(a) * 48 });
        orbit(p.x, p.y, 34 * cam.scale, 26 * cam.scale, 0.11);
      }

      objectsRef.current.forEach((o) => {
        const p = screen(o);
        if (p.x < -80 || p.x > window.innerWidth + 80 || p.y < -80 || p.y > window.innerHeight + 80) return;
        const glow = o.glow || 1;
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(16, p.r * 5));
        grd.addColorStop(0, `rgba(201,168,76,${0.75 * glow})`);
        grd.addColorStop(0.25, `rgba(201,168,76,${0.22 * glow})`);
        grd.addColorStop(1, "rgba(201,168,76,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(16, p.r * 5), 0, Math.PI * 2);
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

    function onClick(e: MouseEvent) {
      const mx = e.clientX;
      const my = e.clientY;
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
    cv.addEventListener("click", onClick);

    // Opening drift, mirrors POC.
    const opening = window.setTimeout(() => flyTo(0, 0, 1.08), 400);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      cv.removeEventListener("click", onClick);
      window.clearTimeout(opening);
    };
    // positioned is stable (memoized on brands); engine binds once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positioned]);

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
    <div className="relative h-[calc(100vh-0px)] w-full overflow-hidden bg-[var(--ink-deep)]">
      <canvas
        ref={canvasRef}
        className="fixed inset-0 h-full w-full"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, #141824 0%, #090A10 45%, #03040A 100%)",
        }}
      />

      {/* Crumb trail */}
      <div className="pointer-events-none fixed left-0 right-0 top-0 z-[5] flex items-center justify-between px-7 py-4">
        <div className="font-display text-[16px] text-[var(--platinum)]">
          Fair<span className="text-[var(--gold)]">Watch</span>Trade Vault
        </div>
        <div className="text-[10px] uppercase tracking-[2px] text-[var(--muted)]">{crumb}</div>
      </div>

      {/* Filter chips */}
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
        <div className="fixed right-7 top-[90px] z-[7] w-[330px] border border-[var(--border-subtle)] bg-[rgba(7,8,12,0.84)] p-5 backdrop-blur-md">
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
      </div>

      {/* Quiet disclosure line */}
      <div className="pointer-events-none fixed bottom-[10px] left-1/2 z-[6] -translate-x-1/2 text-center font-display text-[9px] italic text-[var(--ghost)]">
        {brands.length} manufacturers. A living catalogue of independent and heritage
        watchmaking.
      </div>
    </div>
  );
}
