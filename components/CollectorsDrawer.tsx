"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/* ────────────────────────────────────────────────────────────────────────
   COLLECTOR'S DRAWER — components/CollectorsDrawer.tsx  (v2.13)
   INTEGRATED TOOL SPINE — production implementation of Study D (approved).

   The collapsed trigger is no longer a labeled tab: it is the Drawer's own
   exposed tool spine — full gallery height at the gallery's left edge,
   showing restrained line icons of the three functions inside, with a
   rightward opening cue. Opening reveals the same object: the spine stays in
   exactly the same position and becomes the Drawer's internal left icon
   column; the panel extends rightward from it.

   ── ALIGNMENT BY CONSTRUCTION (the 5px law) ────────────────────────────
   Study D aligns icons to rows with matched absolute geometry: icons and
   the drawer list BOTH anchor at top:119px on an 88px row rhythm. Production
   hardens that into something that cannot drift: ONE items[] array drives
   both the spine's icon cells and the panel's content rows. A listing with
   no "Around This Watch" facets drops the icon AND the row together — the
   two columns cannot desync because they are the same list rendered twice.
   Icons therefore never jump between states either: both grids are anchored
   to the same top offset in the same positioned ancestor.

   ── MATERIALS ──────────────────────────────────────────────────────────
   · SPINE: Study D's material verbatim (0.42 glass + sheen gradient +
     blur 16 + gold inset hairline). It carries icons only — no body copy —
     so the body-legibility gate does not apply. Icons get a constant
     drop-shadow (minor optical correction, allowed by the brief) so they
     stay recognizable over any dial, bright or dark: the spine sits ON the
     photograph, and its backdrop varies with every listing.
   · OVERLAY: the brief's continuity section says "preserve the current
     smoked-glass overlay" — so the production glass stands EXACTLY as
     fought for and signed off (0.35 + blur 16 + continuous veil
     0.62→0.50→0.50 + glyph glow, body gate ≥4.5 median-field). Study D's
     lighter overlay values are its render context, not a ruling; they are
     lighter than the state two human reviewers already failed.

   ── GEOMETRY (Study D) ─────────────────────────────────────────────────
   Spine 48px wide, full height. Icons: 3 cells × 88px from top:119px,
   19px strokes at 1.35. Opening cue (double chevron) bottom:18px, rotates
   180° when expanded. Panel 450px wide; content column left:82px right:28px;
   list anchored top:119px, rows exactly 88px; foot at bottom:26px. Kicker +
   title occupy the space above 119px (ends ~93px — verified no overlap).

   ── THUMB-STRIP INSET ──────────────────────────────────────────────────
   The Drawer anchors to the gallery WRAPPER, which includes ListingGallery's
   76px thumbnail strip (mt-3 + h-16) when a listing has multiple photos. An
   always-visible spine would permanently cover the first thumbnail — a live
   control. page.tsx now passes `thumbStrip`; spine and panel bottom out
   above the strip. (The v2.11 overlay technically overlapped the strip when
   open; the spine made it permanent, so it is fixed for both here.)

   ── INTERACTION ────────────────────────────────────────────────────────
   The whole spine is ONE toggle button in both states (Study D's own JS
   behavior): collapsed it opens, expanded it closes. Icons inside it are
   aria-hidden previews, never shortcuts. The panel's rows are the live
   links/actions, starting at x=82 — clear of the 48px spine, so no click
   conflict. aria-expanded + a state-dependent accessible name mirror the
   study verbatim. Focus-visible: 1px gold outline, 3px offset. The
   "Collector's Drawer" wording lives in the hover/focus tooltip and the
   accessible name — never as permanent vertical text. No Escape/outside-
   click handler existed in production or the study; none is invented here.

   ── NO ORPHANS / SAVE PATTERN ──────────────────────────────────────────
   Unchanged from v2.11: Back to Browse carries the returnTo-preserving
   href; Around This Watch uses only the four audited raw-match facets and
   is omitted (icon and row together) when null; Add to My Catalogue reuses
   the saved_watches upsert verbatim with honest idle/saving/saved/failed
   states.

   Canary: PFC274 = 62 — /api/evaluate untouched.
   ──────────────────────────────────────────────────────────────────────── */

const ICON_BROWSE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.35} strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
    <path d="M9 7 4 12l5 5" />
    <path d="M5 12h9a5 5 0 0 1 5 5" />
  </svg>
);
const ICON_AROUND = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.35} strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
    <circle cx="12" cy="12" r="3" />
    <path d="M4.5 12c0-3.8 3.4-7 7.5-7s7.5 3.2 7.5 7-3.4 7-7.5 7-7.5-3.2-7.5-7Z" />
    <path d="M12 4.5c3.8 0 7 3.4 7 7.5s-3.2 7.5-7 7.5-7-3.4-7-7.5 3.2-7.5 7-7.5Z" />
  </svg>
);
const ICON_CATALOGUE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.35} strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
    <path d="M7 4.5h10v15l-5-3-5 3Z" />
    <path d="M12 8v5M9.5 10.5h5" />
  </svg>
);
const ICON_CUE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="m9 7 5 5-5 5" />
    <path d="m14 7 5 5-5 5" />
  </svg>
);

type DrawerItem = {
  key: string;
  icon: ReactNode;
  render: (rowCls: string, titleCls: string, noteCls: string) => ReactNode;
};

export default function CollectorsDrawer({
  listingId,
  browseHref,
  similarHref,
  thumbStrip = false,
}: {
  listingId: string;
  browseHref: string;
  /** null when this listing has none of the four safe facets — the icon and
      the row are then omitted together, keeping spine and list in lockstep. */
  similarHref: string | null;
  /** true when ListingGallery renders its thumbnail strip (photos > 1); the
      spine and panel then bottom out above it instead of covering it. */
  thumbStrip?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const router = useRouter();

  // Unchanged v2.11 save path — BrowseClient's saved_watches pattern verbatim.
  async function addToCatalogue() {
    if (saved || saving) return;
    setSaving(true);
    setSaveError(false);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push(`/login?callbackUrl=/listings/${listingId}`);
      return;
    }

    const { error } = await supabase
      .from("saved_watches")
      .upsert(
        { user_id: user.id, listing_id: listingId },
        { onConflict: "user_id,listing_id", ignoreDuplicates: true }
      );

    if (error) {
      console.error("[FairWatchTrade] Add to Catalogue failed:", error);
      setSaveError(true);
      setSaving(false);
      return;
    }

    setSaved(true);
    setSaving(false);
  }

  /* Production glass text treatment — unchanged, fought for, signed off. */
  const glassText = "[text-shadow:0_1px_2px_rgba(0,0,0,0.90),0_0_8px_rgba(0,0,0,0.70)]";
  const titleCls = `block font-display text-[15px] leading-[1.25] text-[var(--platinum)] transition group-hover/row:text-[var(--gold)] ${glassText}`;
  const noteCls = `mt-1.5 block text-[12px] leading-[1.5] text-[var(--platinum-dim)] ${glassText}`;
  // Rows are EXACTLY 88px (Study D) — the icon grid uses the same 88px, so
  // each icon's cell center and its row's center are the same number.
  const rowCls =
    "group/row flex h-[88px] flex-col justify-center border-b border-[var(--border-mid)] text-left";

  /* ONE list, rendered twice — spine icons and panel rows cannot desync. */
  const items: DrawerItem[] = [
    {
      key: "browse",
      icon: ICON_BROWSE,
      render: (row, title, note) => (
        <Link key="browse" href={browseHref} className={row}>
          <span className={title}>Back to Browse</span>
          <span className={note}>Return with the current browse context preserved.</span>
        </Link>
      ),
    },
    ...(similarHref
      ? [
          {
            key: "around",
            icon: ICON_AROUND,
            render: (row: string, title: string, note: string) => (
              <Link key="around" href={similarHref} className={row}>
                <span className={title}>Around This Watch</span>
                <span className={note}>
                  Similar watches by brand, movement, case material, and dial colour.
                </span>
              </Link>
            ),
          } satisfies DrawerItem,
        ]
      : []),
    {
      key: "catalogue",
      icon: ICON_CATALOGUE,
      render: (row, title, note) => (
        <button
          key="catalogue"
          type="button"
          onClick={addToCatalogue}
          disabled={saved || saving}
          className={`${row} w-full ${saved ? "cursor-default" : ""}`}
        >
          <span className={saved ? titleCls.replace("group-hover/row:text-[var(--gold)]", "") : titleCls}>
            {saved ? "In My Catalogue" : saving ? "Adding…" : "Add to My Catalogue"}
          </span>
          <span className={note}>
            {saveError
              ? "That didn't save. Please try again."
              : saved
                ? "Kept with your saved collector context."
                : "Keep this watch with the collector's saved context."}
          </span>
        </button>
      ),
    },
  ];

  // Spine and panel share the SAME vertical bounds — equal height by
  // construction, and neither ever covers the thumbnail strip.
  const bounds = thumbStrip ? "top-0 bottom-[76px]" : "inset-y-0";

  return (
    <>
      {/* ── TOOL SPINE — the trigger, both states. z-10 keeps it ABOVE the
             panel (Study D), so it never moves, never re-renders elsewhere:
             opening reveals the same object. ── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="collectors-drawer-overlay"
        aria-label={
          expanded
            ? "Close Collector's Drawer."
            : "Open Collector's Drawer. Contains Back to Browse, Around This Watch, and Add to My Catalogue."
        }
        className={[
          "group absolute left-0 z-[10] w-[48px] cursor-pointer",
          bounds,
          "border border-[rgba(232,226,214,0.15)] border-l-[rgba(232,226,214,0.07)]",
          "backdrop-blur-[16px]",
          "[background:linear-gradient(180deg,rgba(229,225,215,0.035),transparent_24%),rgba(20,22,28,0.42)]",
          "transition-[background,border-color,box-shadow] duration-[180ms]",
          "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--gold)] focus-visible:outline-offset-[3px]",
          expanded
            ? "border-r-[rgba(201,168,76,0.28)] shadow-[9px_0_28px_rgba(0,0,0,0.22),inset_-1px_0_rgba(201,168,76,0.24)] [background:linear-gradient(180deg,rgba(229,225,215,0.045),transparent_24%),rgba(20,22,28,0.34)]"
            : "shadow-[9px_0_28px_rgba(0,0,0,0.22),inset_-1px_0_rgba(201,168,76,0.18)]",
        ].join(" ")}
      >
        {/* inner hairline frame (Study D ::before) */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[7px] left-[6px] right-[6px] top-[7px] border border-[rgba(232,226,214,0.055)]"
        />

        {/* icon previews — same 88px rhythm as the panel rows, same top:119px
            anchor, driven by the same items[] array. Constant drop-shadow so
            the strokes survive any dial beneath the glass. */}
        <span
          aria-hidden="true"
          className="absolute left-0 top-[119px] grid w-full text-[rgba(229,225,215,0.42)] transition-colors duration-[160ms] group-hover:text-[rgba(229,225,215,0.78)] group-focus-visible:text-[rgba(229,225,215,0.78)] [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.65))]"
          style={{ gridTemplateRows: `repeat(${items.length}, 88px)` }}
        >
          {items.map((it, i) => (
            <span
              key={it.key}
              className={[
                "grid h-[88px] w-full place-items-center border-t border-[rgba(232,226,214,0.075)] transition-[color,background,filter] duration-[160ms]",
                i === items.length - 1 ? "border-b border-b-[rgba(232,226,214,0.075)]" : "",
                i === 1
                  ? "group-hover:bg-[rgba(201,168,76,0.025)] group-hover:text-[rgba(201,168,76,0.80)] group-hover:[filter:drop-shadow(0_0_8px_rgba(201,168,76,0.16))]"
                  : "",
              ].join(" ")}
            >
              {it.icon}
            </span>
          ))}
        </span>

        {/* opening cue — rightward when closed, reversed when open */}
        <span
          aria-hidden="true"
          className={[
            "absolute bottom-[18px] left-[9px] right-[9px] grid h-[42px] place-items-center",
            "border-t border-[rgba(232,226,214,0.10)] text-[rgba(201,168,76,0.68)]",
            "transition-[color,transform] duration-[180ms] group-hover:text-[var(--gold)] group-focus-visible:text-[var(--gold)]",
            expanded ? "rotate-180" : "",
          ].join(" ")}
        >
          {ICON_CUE}
        </span>

        {/* accessible wording — tooltip on hover/focus, never permanent text */}
        <span
          role="tooltip"
          className={[
            "pointer-events-none absolute left-[58px] top-1/2 -translate-y-1/2 translate-x-1",
            "whitespace-nowrap border border-[var(--border-mid)] bg-[rgba(13,15,20,0.96)] px-2.5 py-2",
            "font-display text-[12px] text-[var(--platinum-dim)] shadow-[0_10px_28px_rgba(0,0,0,0.24)]",
            "invisible opacity-0 transition-[opacity,transform,visibility] duration-[150ms]",
            "group-hover:visible group-hover:translate-x-0 group-hover:opacity-100",
            "group-focus-visible:visible group-focus-visible:translate-x-0 group-focus-visible:opacity-100",
          ].join(" ")}
        >
          Collector&rsquo;s Drawer
        </span>
      </button>

      {/* ── PANEL — extends rightward from the spine, z-8 beneath it.
             Production glass preserved exactly (brief: "preserve the current
             smoked-glass overlay"). ── */}
      <div
        id="collectors-drawer-overlay"
        aria-hidden={!expanded}
        className={[
          "absolute left-0 z-[8] w-[450px]",
          bounds,
          "border-r border-[var(--border-gold)]",
          "bg-[rgba(20,22,28,0.35)] backdrop-blur-[16px]",
          "shadow-[18px_0_42px_rgba(0,0,0,0.26)]",
          "transition-[opacity,transform,visibility] duration-[220ms] ease-out",
          expanded ? "visible translate-x-0 opacity-100" : "invisible -translate-x-4 opacity-0",
        ].join(" ")}
      >
        <div className="relative h-full pb-[26px] pl-[82px] pr-[28px] pt-[42px] [background:linear-gradient(180deg,rgba(13,15,20,0.62)_0%,rgba(13,15,20,0.50)_30%,rgba(13,15,20,0.50)_100%)]">
          <div className={`text-[10px] font-medium uppercase tracking-[0.17em] text-[var(--gold)] ${glassText}`}>
            Collector&rsquo;s Drawer
          </div>
          <h2 className={`mt-[9px] font-display text-[25px] font-normal leading-[1.15] text-[var(--platinum)] ${glassText}`}>
            Around this watch
          </h2>

          {/* the SAME items[], as rows — anchored at the SAME top:119px, on
              the SAME 88px rhythm as the icon cells. */}
          <div className="absolute left-[82px] right-[28px] top-[119px] border-t border-[var(--border-mid)]">
            {items.map((it) => it.render(rowCls, titleCls, noteCls))}
          </div>

          <div
            className={`absolute bottom-[26px] left-[82px] right-[28px] border-t border-[var(--border-mid)] pt-[18px] text-[9px] uppercase leading-[1.6] tracking-[0.10em] text-[var(--platinum-dim)] ${glassText}`}
          >
            The gallery remains beneath the smoked glass.
          </div>
        </div>
      </div>
    </>
  );
}
