"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   PAINTED LINE RAIL PRIMITIVES — components/rail/railPrimitives.tsx (v3.21)

   The ONE geometry source for AccountRail and CatalogueRail, per the
   Design Gate (Account_Catalogue_Rails_DGate_2026-08-01_v2.1, Concept A
   "Painted Line", Layout visual PASS) and the v3 implementation order
   (sha f579deff…). The pixel law lives here and only here — no
   page-specific offsets can exist because no page owns any of these
   numbers.

   Pixel law (v3): 238px expanded / 72px collapsed · 44px rows on a
   24px | minmax(0,1fr) | 36px grid (the 36px trailing column is shared by
   the 18px badge and the tracked Soon label — one right edge, no drift) ·
   24px icon cell with 20px stroke-1.5 SVGs · type floors: labels 13px,
   kicker/section 12px, Soon + badge numerals 11px, tooltips 12px,
   collapse glyph 16px — NOTHING below 11px.

   Contrast law (v3): #8A8F9E is the dimmest permitted text color. The
   app-global --ghost (#646B7A) and --muted (#818799) both sit BELOW that
   floor, so the rails carry their own text tokens (--rl-*) and never
   paint text with the global ghost/muted. Decorative hairlines are
   exempt.

   Collapse + hydration-flash law (v3 §7): the collapsed choice must be
   correct at first paint. A render-blocking inline script (SSR HTML)
   stamps data-fwt-rail-<family>="collapsed" on <html> BEFORE the aside
   paints; every collapsed style keys off that attribute, so server
   markup never disagrees with the painted state and React hydrates
   cleanly (no className branching on collapse). SPA navigations are
   covered by a useLayoutEffect that syncs the attribute pre-paint. The
   width transition exists only after mount — initial paint and hydration
   never animate; only a real toggle does.
   ──────────────────────────────────────────────────────────────────────── */

export type RailFamily = "account" | "catalogue";

const STORAGE_PREFIX = "fwt-rail-";

function railAttr(family: RailFamily): string {
  return `data-fwt-rail-${family}`;
}

/* Pre-paint script — stamped into the SSR HTML immediately before the
   aside. Reads the family's localStorage key and marks <html> so the CSS
   attribute selectors below apply on the very first paint. Never throws. */
function prePaintScript(family: RailFamily): string {
  return (
    `try{if(localStorage.getItem('${STORAGE_PREFIX}${family}')==='1')` +
    `document.documentElement.setAttribute('${railAttr(family)}','collapsed')}catch(e){}`
  );
}

/* The complete Painted Line stylesheet. Family-scoped collapsed selectors
   are generated for both families so the sheet is identical wherever it
   renders — one law, byte-for-byte. */
const RAIL_CSS = `
.fwt-rail{
  /* Appearance foundation (v4.58): the rail keeps its own text floor
     (contrast law: nothing dimmer than the dark arm's #8A8F9E) but each
     local token now resolves per appearance, same light-dark() mechanism
     as the global tokens. The light rail is the room's slightly deeper
     warm stone — architecturally distinct from the page, never a dark
     island on paper. */
  --rl-muted:light-dark(#5B564D,#8f97a8);
  --rl-ghost:light-dark(#6E685F,#8A8F9E);
  --rl-dim:light-dark(#3B382F,#c9c4b8);
  --rl-line:light-dark(rgba(62,54,38,.14),rgba(232,226,214,.10));
  --rl-line-strong:light-dark(rgba(62,54,38,.22),rgba(232,226,214,.17));
  --rl-focus:light-dark(rgba(122,95,32,.8),rgba(201,168,76,.75));
  width:238px;flex-shrink:0;align-self:stretch;min-height:100%;
  display:flex;flex-direction:column;
  border-right:1px solid var(--rl-line);
  padding:22px 12px 18px;
  background:linear-gradient(90deg,
    light-dark(rgba(236,231,221,.85),rgba(20,22,28,.62)),
    light-dark(rgba(230,224,212,.98),rgba(13,15,20,.98)));
  /* v3.21b — the rail carries its OWN sans stack (the gate study's --sans)
     instead of inheriting the host page's font: on pages with wider body
     metrics, "Seller Workspace" at the locked 13px overflowed the 130px
     label column and truncated to "Seller Worksp…" (the carried
     correction). Same 13px, same rail width — the metrics, not the law,
     were the defect. The serif title below overrides explicitly. */
  font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}
@media (max-width:767px){.fwt-rail{display:none}}
.fwt-rail-anim{transition:width .25s ease}
@media (prefers-reduced-motion:reduce){.fwt-rail-anim{transition:none}}
.fwt-rail-head{padding:0 10px 20px;border-bottom:1px solid var(--rl-line);margin-bottom:12px}
.fwt-rail-kicker{font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--rl-ghost)}
.fwt-rail-title{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:300;margin-top:5px;color:var(--rl-dim);white-space:nowrap}
.fwt-rail-nav{display:block}
.fwt-rail-section{margin-top:18px}
.fwt-rail-section-label{padding:0 12px 8px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--rl-ghost);white-space:nowrap}
.fwt-rail-section--exit{margin-top:26px;border-top:1px solid light-dark(rgba(62,54,38,.10),rgba(232,226,214,.06));padding-top:8px}
.fwt-rail-item{
  width:100%;height:44px;
  display:grid;grid-template-columns:24px minmax(0,1fr) 36px;align-items:center;gap:12px;
  padding:0 12px;border:1px solid transparent;border-radius:4px;
  background:transparent;color:var(--rl-muted);
  text-align:left;position:relative;margin:2px 0;
  font:inherit;text-decoration:none;cursor:pointer;
}
.fwt-rail-item:hover{background:light-dark(rgba(62,54,38,.05),rgba(232,226,214,.035));color:var(--rl-dim)}
.fwt-rail-item:focus-visible{outline:1px solid var(--rl-focus);outline-offset:2px}
.fwt-rail-item:active{background:light-dark(rgba(122,95,32,.10),rgba(201,168,76,.09));transform:translateY(1px)}
.fwt-rail-item--active{
  color:var(--platinum);
  background:light-dark(rgba(122,95,32,.07),rgba(201,168,76,.055));
  border-color:light-dark(rgba(122,95,32,.24),rgba(201,168,76,.18));
  box-shadow:inset 2px 0 0 var(--gold),inset 0 0 18px light-dark(rgba(122,95,32,.03),rgba(201,168,76,.025));
}
.fwt-rail-item--active:hover{background:light-dark(rgba(122,95,32,.07),rgba(201,168,76,.055));color:var(--platinum)}
.fwt-rail-item--soon{color:var(--rl-ghost);cursor:default}
.fwt-rail-item--soon:hover{background:transparent;color:var(--rl-ghost)}
.fwt-rail-item--soon:active{background:transparent;transform:none}
.fwt-rail-item--exit{border-radius:0}
.fwt-rail-icon{width:24px;height:24px;display:grid;place-items:center;color:currentColor}
.fwt-rail-icon svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.fwt-rail-label{font-size:13px;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fwt-rail-chev{justify-self:end;font-size:12px;color:var(--rl-ghost)}
.fwt-rail-badge{justify-self:end;min-width:18px;height:18px;padding:0 3px;border:1px solid var(--rl-line-strong);display:grid;place-items:center;font-size:11px;color:var(--rl-dim)}
.fwt-rail-soon{justify-self:end;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--rl-ghost);white-space:nowrap}
.fwt-rail-tip{
  display:none;position:absolute;left:calc(100% + 10px);top:50%;transform:translateY(-50%);
  white-space:nowrap;font-size:12px;color:var(--rl-dim);
  background:var(--ink-deep,#07080C);border:1px solid var(--rl-line-strong);
  padding:6px 10px;z-index:60;pointer-events:none;
}
.fwt-rail-collapse{
  margin-top:auto;width:100%;height:44px;
  border:1px solid var(--rl-line);background:transparent;color:var(--rl-ghost);
  display:flex;align-items:center;justify-content:center;
  font-size:16px;cursor:pointer;font:inherit;
}
.fwt-rail-collapse:hover{color:var(--gold);border-color:light-dark(rgba(122,95,32,.35),rgba(201,168,76,.25))}
.fwt-rail-collapse:focus-visible{outline:1px solid var(--rl-focus);outline-offset:2px}
` +
  (["account", "catalogue"] as const)
    .map(
      (f) => `
html[data-fwt-rail-${f}="collapsed"] .fwt-rail--${f}{width:72px}
html[data-fwt-rail-${f}="collapsed"] .fwt-rail--${f} .fwt-rail-kicker,
html[data-fwt-rail-${f}="collapsed"] .fwt-rail--${f} .fwt-rail-title,
html[data-fwt-rail-${f}="collapsed"] .fwt-rail--${f} .fwt-rail-label,
html[data-fwt-rail-${f}="collapsed"] .fwt-rail--${f} .fwt-rail-section-label,
html[data-fwt-rail-${f}="collapsed"] .fwt-rail--${f} .fwt-rail-badge,
html[data-fwt-rail-${f}="collapsed"] .fwt-rail--${f} .fwt-rail-soon,
html[data-fwt-rail-${f}="collapsed"] .fwt-rail--${f} .fwt-rail-chev{display:none}
html[data-fwt-rail-${f}="collapsed"] .fwt-rail--${f} .fwt-rail-item{grid-template-columns:1fr;gap:0;justify-items:center;padding:0}
html[data-fwt-rail-${f}="collapsed"] .fwt-rail--${f} .fwt-rail-item:hover .fwt-rail-tip,
html[data-fwt-rail-${f}="collapsed"] .fwt-rail--${f} .fwt-rail-item:focus-visible .fwt-rail-tip{display:block}
html[data-fwt-rail-${f}="collapsed"] .fwt-rail--${f} .fwt-rail-head{padding:0 0 20px;text-align:center}
`
    )
    .join("");

export function RailShell({
  family,
  kicker,
  title,
  ariaLabel,
  children,
}: {
  family: RailFamily;
  kicker: string;
  title: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  const asideRef = useRef<HTMLElement | null>(null);
  // aria-expanded mirror only — every visual collapse style keys off the
  // <html> attribute, so SSR markup and first paint can never disagree.
  const [collapsed, setCollapsed] = useState(false);

  // SPA-navigation cover: sync the html attribute from localStorage before
  // the browser paints this mount (SSR loads were already handled by the
  // inline pre-paint script).
  useLayoutEffect(() => {
    let stored = false;
    try {
      stored = localStorage.getItem(STORAGE_PREFIX + family) === "1";
    } catch {
      /* storage unavailable → expanded, never throws */
    }
    const attr = railAttr(family);
    if (stored) document.documentElement.setAttribute(attr, "collapsed");
    else document.documentElement.removeAttribute(attr);
    setCollapsed(stored);
  }, [family]);

  // Width transition exists only after first paint — a real toggle
  // animates; initial render and hydration never do (v3 §7).
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => el.classList.add("fwt-rail-anim"));
    return () => cancelAnimationFrame(raf);
  }, []);

  function toggle() {
    const next = !collapsed;
    try {
      localStorage.setItem(STORAGE_PREFIX + family, next ? "1" : "0");
    } catch {
      /* persistence best-effort; the session state still toggles */
    }
    const attr = railAttr(family);
    if (next) document.documentElement.setAttribute(attr, "collapsed");
    else document.documentElement.removeAttribute(attr);
    setCollapsed(next);
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: RAIL_CSS }} />
      <script dangerouslySetInnerHTML={{ __html: prePaintScript(family) }} />
      <aside ref={asideRef} className={`fwt-rail fwt-rail--${family}`}>
        <div className="fwt-rail-head">
          <div className="fwt-rail-kicker">{kicker}</div>
          <div className="fwt-rail-title">{title}</div>
        </div>
        <nav className="fwt-rail-nav" aria-label={ariaLabel}>
          {children}
        </nav>
        <button
          type="button"
          className="fwt-rail-collapse"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {collapsed ? "»" : "«"}
        </button>
      </aside>
    </>
  );
}

export function RailSection({
  label,
  exit = false,
  children,
}: {
  /** Optional since the Workspace-eyebrow ruling (2026-08-19): one label
      does one real job — a section whose rail header already names it
      renders no repeated eyebrow. Sections with a real semantic split
      (e.g. "Coming next") keep theirs. */
  label?: string;
  exit?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`fwt-rail-section${exit ? " fwt-rail-section--exit" : ""}`}>
      {label && <div className="fwt-rail-section-label">{label}</div>}
      {children}
    </div>
  );
}

/* One rail row. Exactly one of href / onClick / soon decides its nature:
   soon → inert div (aria-disabled, not focusable as an action);
   href → route Link; onClick → module button. The collapsed tooltip is
   always present in the markup (CSS shows it only when collapsed). */
export function RailItem({
  icon,
  label,
  href,
  onClick,
  active = false,
  soon = false,
  exit = false,
  badge,
  chevron = false,
  ariaCurrent,
}: {
  icon: ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  soon?: boolean;
  exit?: boolean;
  badge?: number | null;
  chevron?: boolean;
  ariaCurrent?: "page" | "true";
}) {
  const cls = [
    "fwt-rail-item",
    active ? "fwt-rail-item--active" : "",
    soon ? "fwt-rail-item--soon" : "",
    exit ? "fwt-rail-item--exit" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const showBadge = typeof badge === "number" && badge > 0;

  const inner = (
    <>
      <span className="fwt-rail-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="fwt-rail-label">{label}</span>
      {soon ? (
        <span className="fwt-rail-soon">Soon</span>
      ) : showBadge ? (
        <span className="fwt-rail-badge">{badge}</span>
      ) : chevron ? (
        <span className="fwt-rail-chev" aria-hidden="true">
          ›
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
      <span className="fwt-rail-tip" role="presentation">
        {label}
      </span>
    </>
  );

  if (soon) {
    return (
      <div className={cls} aria-disabled="true" aria-label={label}>
        {inner}
      </div>
    );
  }

  if (href) {
    return (
      <Link href={href} className={cls} aria-label={label} aria-current={ariaCurrent}>
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      aria-label={label}
      aria-current={ariaCurrent}
    >
      {inner}
    </button>
  );
}
