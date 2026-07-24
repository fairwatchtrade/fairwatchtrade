"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import SavedSearchQuickLinks from "@/components/SavedSearchQuickLinks";

/* ────────────────────────────────────────────────────────────────────────
   COLLECTOR'S DRAWER — components/CollectorsDrawer.tsx  (v2.17)
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

   ── GEOMETRIC OWNERSHIP (v2.14) ────────────────────────────────────────
   The Drawer is a LISTING feature, not a gallery feature. It now anchors to
   a zero-width "spine rail" that page.tsx places in the listing opening
   grid, occupying the gallery's own grid row — so the rail's height equals
   the gallery's height by pure CSS (no measurement), and its left edge is
   the listing content edge, independent of the gallery column's width.

   The spine sits in the page's existing 82px left GUTTER: left:-65px from
   the content edge = 48px spine centered in the gutter ((82−48)/2 = 17px of
   air each side; 17+48 = 65). It no longer touches the photograph at all
   when collapsed, its backdrop is the stable page ink rather than a
   varying dial, and it cannot move or vanish when the gallery column
   resizes — the content edge is fixed for every xl viewport. The old
   `thumbStrip` inset died with the old anchor: a spine in the gutter covers
   no thumbnails. (The open panel may overlay the gallery, including its
   thumb strip — the original v2.11 overlay behavior, explicitly retained by
   this flight's brief; not a law, just not today's question.)
   NOTE: the -65px derives from the page container's xl:px-[82px]. If that
   gutter ever changes, this offset changes with it — they are one design
   fact in two files.

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

   ── v2.17 CLEANUP FLIGHT ───────────────────────────────────────────────
   · TOOL PALETTE COPY: one gold "Collector's Drawer" heading (the old
     kicker + "Around this watch" title are gone), three actions with no
     explanatory paragraphs — "← Back to Browse", "Search Similar Watches"
     (renamed from Around This Watch), and "Add to My Catalogue" whose only
     note is "Save for later." The prototype footer sentence is deleted.
     All three action titles share identical default styling; gold appears
     only on hover/focus. Rows stay exactly 88px — the icon-to-row
     alignment architecture is untouched.
   · REVERSIBLE SAVE: the catalogue action is now a toggle. On mount it
     checks the real saved state (select, session client, RLS-scoped) so a
     watch saved last week shows as saved today — without that, a saved
     watch could never be removed here. Saved → click removes (DELETE,
     RLS saved_watches_delete_own, proven live: owner removes 1, wrong
     user removes 0). Never disabled while saved; honest states both ways.
     (The Catalogue home page needs the same reversibility — separate
     flight, flagged.)
   · TOOLTIP: triggers only from the opening-cue affordance at the spine's
     foot (plus keyboard focus on the button), not from the entire spine —
     no more flicker as the pointer travels the rail. The full spine stays
     clickable.
   · DESKTOP PERSISTENCE: the spine no longer pops at the xl edge — the
     mount now activates at lg (1024). See page.tsx; the grid's two-column
     form still waits for xl, exactly as approved.
   · "Search Similar Watches" still uses only the four audited raw-match
     facets and is omitted (icon and row together) when null; the save
     still reuses the saved_watches pattern — no second implementation.

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
}: {
  listingId: string;
  browseHref: string;
  /** null when this listing has none of the four safe facets — the icon and
      the row are then omitted together, keeping spine and list in lockstep. */
  similarHref: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const router = useRouter();

  // v2.17 — reversibility requires knowing the TRUTH on load: a watch saved
  // in a previous session must present as saved, or it can never be removed
  // from here. One RLS-scoped read; signed-out resolves to not-saved.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from("saved_watches")
        .select("listing_id")
        .eq("user_id", user.id)
        .eq("listing_id", listingId)
        .maybeSingle();
      if (!cancelled && data) setSaved(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  // v2.17 — reversible toggle. Add uses the v2.11 upsert pattern verbatim;
  // remove is a DELETE under saved_watches_delete_own (proven under real
  // RLS: owner removes 1 row, a different user removes 0). Neither path
  // ever reports a success that didn't happen.
  async function toggleCatalogue() {
    if (saving) return;
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

    if (saved) {
      const { error } = await supabase
        .from("saved_watches")
        .delete()
        .eq("user_id", user.id)
        .eq("listing_id", listingId);
      if (error) {
        console.error("[FairWatchTrade] Remove from Catalogue failed:", error);
        setSaveError(true);
        setSaving(false);
        return;
      }
      setSaved(false);
      setSaving(false);
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
      render: (row, title, _note) => (
        <Link key="browse" href={browseHref} className={row}>
          <span className={title}>&larr; Back to Browse</span>
        </Link>
      ),
    },
    ...(similarHref
      ? [
          {
            key: "around",
            icon: ICON_AROUND,
            render: (row: string, title: string, _note: string) => (
              <Link key="around" href={similarHref} className={row}>
                <span className={title}>Search Similar Watches</span>
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
          onClick={toggleCatalogue}
          disabled={saving}
          className={`${row} w-full`}
        >
          {/* v2.17 — identical default styling to the other two actions; the
              saved state changes the WORDS, never the resting color. */}
          <span className={titleCls}>
            {saving
              ? saved
                ? "Removing…"
                : "Adding…"
              : saved
                ? "In My Catalogue"
                : "Add to My Catalogue"}
          </span>
          <span className={note}>
            {saveError
              ? "That didn't work. Please try again."
              : saved
                ? "Saved — select again to remove."
                : "Save for later."}
          </span>
        </button>
      ),
    },
  ];

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
            : "Open Collector's Drawer. Contains Back to Browse, Search Similar Watches, and Add to My Catalogue."
        }
        className={[
          // In the gutter: −65px from the listing content edge (see header).
          "group absolute inset-y-0 left-[-65px] z-[10] w-[48px] cursor-pointer",
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

        {/* v2.17 — opening cue, and the ONLY pointer trigger for the
            tooltip: `group/cue` scopes hover to this 42px affordance, so the
            label no longer flickers as the pointer travels the rail. The
            whole spine stays clickable; keyboard focus on the button still
            shows the label. NOTE: this span is inside the toggle button, so
            hover state is fine, but it must not be a nested interactive —
            it stays aria-hidden and non-focusable. */}
        <span
          className={[
            "group/cue absolute bottom-[18px] left-[9px] right-[9px] grid h-[42px] place-items-center",
            "border-t border-[rgba(232,226,214,0.10)] text-[rgba(201,168,76,0.68)]",
            "transition-colors duration-[180ms] hover:text-[var(--gold)] group-focus-visible:text-[var(--gold)]",
          ].join(" ")}
        >
          <span
            aria-hidden="true"
            className={`grid place-items-center transition-transform duration-[180ms] ${expanded ? "rotate-180" : ""}`}
          >
            {ICON_CUE}
          </span>

          {/* accessible wording — shown from the cue's own hover, or from
              keyboard focus on the spine button; never permanent text */}
          <span
            role="tooltip"
            className={[
              "pointer-events-none absolute bottom-1/2 left-[49px] translate-x-1 translate-y-1/2",
              "whitespace-nowrap border border-[var(--border-mid)] bg-[rgba(13,15,20,0.96)] px-2.5 py-2",
              "font-display text-[12px] text-[var(--platinum-dim)] shadow-[0_10px_28px_rgba(0,0,0,0.24)]",
              "invisible opacity-0 transition-[opacity,transform,visibility] duration-[150ms]",
              "group-hover/cue:visible group-hover/cue:translate-x-0 group-hover/cue:opacity-100",
              "group-focus-visible:visible group-focus-visible:translate-x-0 group-focus-visible:opacity-100",
            ].join(" ")}
          >
            Collector&rsquo;s Drawer
          </span>
        </span>
      </button>

      {/* ── PANEL — extends rightward from the spine, z-8 beneath it.
             Production glass preserved exactly (brief: "preserve the current
             smoked-glass overlay"). ── */}
      <div
        id="collectors-drawer-overlay"
        aria-hidden={!expanded}
        className={[
          // v2.26a — Design Gate Option B: 390px at lg so an open drawer
          // stops dominating the narrower lg gallery (measured: 64% covered /
          // 241px of watch visible at 450px; ~56% / ~301px at 390px). The
          // approved 450px form returns at xl, where the gallery is wide
          // enough to keep its presence. Every anchor (spine, content-edge,
          // 82/28 insets, tool zone, scroll region) is untouched.
          "absolute inset-y-0 left-0 z-[8] w-[390px] xl:w-[450px]",
          "border-r border-[var(--border-gold)]",
          "bg-[rgba(20,22,28,0.35)] backdrop-blur-[16px]",
          "shadow-[18px_0_42px_rgba(0,0,0,0.26)]",
          "transition-[opacity,transform,visibility] duration-[220ms] ease-out",
          expanded ? "visible translate-x-0 opacity-100" : "invisible -translate-x-4 opacity-0",
        ].join(" ")}
      >
        <div className="relative h-full pb-[26px] pl-[82px] pr-[28px] pt-[42px] [background:linear-gradient(180deg,rgba(13,15,20,0.62)_0%,rgba(13,15,20,0.50)_30%,rgba(13,15,20,0.50)_100%)]">
          {/* v2.17 — the Drawer's single heading: same prominence the old
              title had, now carrying the Drawer's own name in gold. The
              kicker and the "Around this watch" secondary title are gone. */}
          <h2 className={`font-display text-[25px] font-normal uppercase leading-[1.15] tracking-[0.08em] text-[var(--gold)] ${glassText}`}>
            Collector&rsquo;s Drawer
          </h2>

          {/* the SAME items[], as rows — anchored at the SAME top:119px, on
              the SAME 88px rhythm as the icon cells. IMMOVABLE: this block
              never scrolls, so the spine's icon-to-row lockstep cannot break. */}
          <div className="absolute left-[82px] right-[28px] top-[119px] border-t border-[var(--border-mid)]">
            {items.map((it) => it.render(rowCls, titleCls, noteCls))}
          </div>

          {/* v2.26 — Saved Search Quick Links: the SHARED component (same
              ranking, reopen, bump, empty copy as the mobile Drawer and the
              buyer-dashboard card — lib/savedSearches.ts, no drift), mounted
              BELOW the tool rows and deliberately NOT in items[] (the 5px law
              pairs spine icons 1:1 with 88px rows; this section is neither).

              SHORT-VIEWPORT GEOMETRY (gate rulings, this flight): the panel
              stays gallery-height, the tool zone stays fixed, and this region
              alone owns the flexibility — top computed from items.length
              (119 + rows×88 + 18 gap), bottom at the 26px foot reserve, and
              overflow-y:auto with a thin, ALWAYS-VISIBLE-when-overflowing
              scrollbar (an honest cue that more saved searches are below —
              never hidden-until-hover). The explanatory foot note rides
              INSIDE the scroll region. Measured driver: at 1280×700 the
              panel is 526px and a populated section needs ~225px from y=402
              — this region contains it instead of bleeding past the glass. */}
          {/* DISCLOSED DEVIATION from the pre-edit plan's "26px foot
              reserve": the reserve is 12px here. Measured driver: at full
              height (900) the region under a 26px reserve is 219px against
              226px of populated content — a permanent 7px phantom scrollbar.
              The 26px figure served the v2.11 foot sentence that v2.17
              deleted; nothing occupies that glass. 12px keeps a visual
              breath and gives the populated section 7px of spare at full
              height. Flagged for gate review; one value, trivially
              reversible. */}
          <div
            className="fwt-saved-scroll absolute bottom-[12px] left-[82px] right-[28px] overflow-y-auto"
            style={{ top: 119 + items.length * 88 + 18 }}
          >
            <style>{`
              .fwt-saved-scroll{scrollbar-width:thin;scrollbar-color:rgba(201,168,76,.32) transparent}
              .fwt-saved-scroll::-webkit-scrollbar{width:6px}
              .fwt-saved-scroll::-webkit-scrollbar-track{background:transparent}
              .fwt-saved-scroll::-webkit-scrollbar-thumb{background:rgba(201,168,76,.30)}
              .fwt-saved-scroll::-webkit-scrollbar-thumb:hover{background:rgba(201,168,76,.45)}
            `}</style>
            <section
              aria-label="Saved Search Quick Links"
              className="border-t border-[var(--border-gold)] pt-[17px]"
            >
              <div className="mb-2 flex items-center justify-between gap-2.5">
                {/* v2.70 — 8px → 10px → 12px, device-tuned: the label has to
                    read as the section's head above the quick-link names, not
                    as a caption beside them. The qualifier stays at 8px on
                    purpose: the label leads, "Up to three" recedes. */}
                <b
                  className={`text-[12px] font-medium uppercase tracking-[0.17em] text-[var(--gold)] ${glassText}`}
                >
                  Saved Search Quick Links
                </b>
                <span
                  className={`text-[8px] uppercase tracking-[0.11em] text-[var(--ghost)] ${glassText}`}
                >
                  Up to three
                </span>
              </div>
              <SavedSearchQuickLinks />
              <p
                className={`mt-[17px] text-[8px] uppercase leading-[1.5] tracking-[0.09em] text-[var(--ghost)] ${glassText}`}
              >
                Names reopen their saved browse query immediately.
              </p>
            </section>
          </div>

        </div>
      </div>
    </>
  );
}
