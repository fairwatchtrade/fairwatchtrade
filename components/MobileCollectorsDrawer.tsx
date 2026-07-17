"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import SavedSearchQuickLinks from "@/components/SavedSearchQuickLinks";

/* ────────────────────────────────────────────────────────────────────────
   MOBILE COLLECTOR'S DRAWER — components/MobileCollectorsDrawer.tsx (v2.25)

   The approved mobile/tablet restoration (Design Gate artifact:
   FairWatchTrade_Collectors_Drawer_Saved_Search_Mobile_Design_Gate_FINAL_
   TOUCH_REFINEMENT.html — geometry and behavior ported, not redesigned).
   Mounted ONLY below lg (1024): desktop keeps the persistent smoked-glass
   spine and components/CollectorsDrawer.tsx untouched — this flight's
   locked boundary. One component per breakpoint side, no shared state
   needed: only one is ever visible, and each defaults closed.

   ── THE GOLD WATCH-HAND PULL (placement is design law) ─────────────────
   The single control in both states. Its lowered position — top at
   71% + 40px of the gallery, phone-tested — is intentional and protects
   three things at once: THUMB REACH (it sits where a one-handed grip
   actually lands), CONTROL MEANING (a watch hand, not a chevron — the
   Drawer's own vocabulary), and SEPARATION from gallery/thumbnail
   navigation (it cannot be mistaken for, or mis-tapped as, a photo
   control). Do not raise it back toward the gallery's vertical center.
   Closed: hand points down at the left edge — tapping opens. Open: the
   hand reverses 180° and rides the Drawer's right edge — tapping closes.
   The accessible name swaps with state. No other dismissal exists, by
   design — same philosophy as the desktop spine (none is invented here).

   ── GEOMETRY (artifact tiers → production viewports) ───────────────────
   The artifact is a container-query mock; production maps its tiers to
   viewport breakpoints, mobile-first:
     base  (<470)      overlay 82vw   · rows 67px · hand travel 82vw−21px
                        · foot + "Up to three" hidden
     ≥470  (<768)      overlay min(360px,84vw) · rows 73px · hand 42×90
                        (svg 36×78) · travel min(360px,84vw)−21px
     ≥768  (md, <1024) overlay 390px · rows 84px · hand 46×96 (svg 40×84)
                        · travel 367px
   The overlay anchors inset-y-0 left-0 in the page's gallery CELL (made
   relative by page.tsx), so its height IS the gallery's height by grid
   construction — ListingGallery keeps ZERO knowledge of the Drawer, the
   same law the desktop spine rail obeys (v2.14).

   ── LANGUAGE (chain ruling: current tool-row language governs mobile) ──
   The artifact mock carried pre-v2.17 vocabulary; the ruling keeps the
   production v2.17 language here: single gold "Collector's Drawer"
   heading, "← Back to Browse", "Search Similar Watches" (omitted with its
   row when the listing lacks the four safe facets), reversible "Add to My
   Catalogue" with the v2.17 notes. Saved Search Quick Links sit BELOW —
   not inside — the tool rows (artifact's saved-section, locked behavior
   in SavedSearchQuickLinks.tsx). The catalogue toggle mirrors the desktop
   component's logic verbatim rather than importing it — desktop is frozen
   this flight; extracting a shared hook is flagged for a later cleanup.

   Canary: PFC274 = 62 — /api/evaluate untouched.
   ──────────────────────────────────────────────────────────────────────── */

export default function MobileCollectorsDrawer({
  listingId,
  browseHref,
  similarHref,
}: {
  listingId: string;
  browseHref: string;
  similarHref: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  // v2.25 · mode arbitration — the Drawer and Dial Reveal are mutually
  // exclusive on mobile/tablet ONLY (chain ruling; desktop keeps both).
  // Whether this Drawer is EFFECTIVELY open is expanded AND below lg:
  // above lg the component is CSS-hidden, and a hidden drawer must never
  // hold Dial Reveal suspended. useSyncExternalStore reads the media query
  // without effect-driven setState (SSR snapshot: false).
  const belowLg = useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(max-width: 1023.98px)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(max-width: 1023.98px)").matches,
    () => false
  );
  const router = useRouter();

  // Broadcast the effective open state ("fwt:mobile-drawer", detail {open})
  // — DialReveal listens and suspends/resets while we are open, so pointer
  // and focus belong to exactly one overlay at a time. Loose coupling only:
  // no imports in either direction; ListingGallery stays zero-knowledge.
  useEffect(() => {
    const open = expanded && belowLg;
    window.dispatchEvent(new CustomEvent("fwt:mobile-drawer", { detail: { open } }));
  }, [expanded, belowLg]);

  useEffect(() => {
    return () => {
      // Unmounting while open must not strand a suspended Dial Reveal.
      window.dispatchEvent(new CustomEvent("fwt:mobile-drawer", { detail: { open: false } }));
    };
  }, []);

  // Truth on load, exactly as the desktop Drawer does it (v2.17): a watch
  // saved in a previous session must present as saved or it can never be
  // removed here. RLS-scoped; signed-out resolves to not-saved.
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

  const rowCls =
    "flex h-[67px] min-[470px]:h-[73px] md:h-[84px] flex-col justify-center border-b border-[var(--border-mid)] text-left";
  const titleCls =
    "block font-display text-[13px] min-[470px]:text-[14px] md:text-[15px] leading-[1.25] text-[var(--platinum)]";
  const noteCls =
    "mt-1 block text-[8.5px] min-[470px]:text-[9px] md:text-[10px] leading-[1.45] text-[var(--platinum-dim)]";

  return (
    <>
      {/* ── SIDE OVERLAY — no spine below lg (artifact). Anchored to the
             gallery cell; slides from the left edge. ── */}
      <aside
        id="mobile-collectors-drawer"
        aria-hidden={!expanded}
        className={[
          "absolute inset-y-0 left-0 z-[24] lg:hidden",
          "w-[82vw] min-[470px]:w-[min(360px,84vw)] md:w-[390px]",
          "border border-l-0 border-[rgba(232,226,214,0.14)] border-r-[var(--border-gold)]",
          "bg-[linear-gradient(90deg,rgba(20,22,28,0.34),rgba(20,22,28,0.28))] backdrop-blur-[17px]",
          "shadow-[20px_0_48px_rgba(0,0,0,0.30)]",
          "transition-[opacity,transform,visibility] duration-[220ms] ease-out",
          expanded
            ? "visible translate-x-0 opacity-100"
            : "invisible -translate-x-[18px] opacity-0 pointer-events-none",
        ].join(" ")}
      >
        <div className="h-full overflow-auto px-4 pb-[17px] pt-5 min-[470px]:px-[18px] min-[470px]:pb-[18px] min-[470px]:pt-[23px] md:px-[22px] md:pb-[22px] md:pt-[30px]">
          {/* v2.17 language: the Drawer's single gold heading. */}
          <h2 className="mb-[14px] font-display text-[21px] font-normal uppercase leading-[1.1] tracking-[0.08em] text-[var(--gold)] min-[470px]:mb-4 min-[470px]:text-[23px] md:mb-[21px] md:text-[25px]">
            Collector&rsquo;s Drawer
          </h2>

          <div className="border-t border-[var(--border-mid)]">
            <Link href={browseHref} className={rowCls}>
              <span className={titleCls}>&larr; Back to Browse</span>
            </Link>

            {similarHref && (
              <Link href={similarHref} className={rowCls}>
                <span className={titleCls}>Search Similar Watches</span>
              </Link>
            )}

            <button
              type="button"
              onClick={toggleCatalogue}
              disabled={saving}
              className={`${rowCls} w-full`}
            >
              <span className={titleCls}>
                {saving
                  ? saved
                    ? "Removing…"
                    : "Adding…"
                  : saved
                    ? "In My Catalogue"
                    : "Add to My Catalogue"}
              </span>
              <span className={noteCls}>
                {saveError
                  ? "That didn't work. Please try again."
                  : saved
                    ? "Saved — select again to remove."
                    : "Save for later."}
              </span>
            </button>
          </div>

          {/* Saved Search Quick Links — BELOW, not inside, the tool rows
              (artifact's saved-section; behavior locked in the component). */}
          <section
            aria-label="Saved Search Quick Links"
            className="mt-[14px] border-t border-[var(--border-gold)] pt-[14px] md:mt-[18px] md:pt-[17px]"
          >
            <div className="mb-2 flex items-center justify-between gap-2.5">
              <b className="text-[7px] font-medium uppercase tracking-[0.17em] text-[var(--gold)] min-[470px]:text-[8px]">
                Saved Search Quick Links
              </b>
              <span className="hidden text-[8px] uppercase tracking-[0.11em] text-[var(--ghost)] min-[470px]:inline">
                Up to three
              </span>
            </div>
            <SavedSearchQuickLinks />
            <p className="mt-[17px] hidden text-[8px] uppercase leading-[1.5] tracking-[0.09em] text-[var(--ghost)] min-[470px]:block">
              Names reopen their saved browse query immediately.
            </p>
          </section>
        </div>
      </aside>

      {/* ── THE GOLD WATCH-HAND PULL — the only control, both states. The
             lowered placement (71% + 40px) is design law: thumb reach,
             control meaning, separation from gallery/thumb navigation. ── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="mobile-collectors-drawer"
        aria-label={expanded ? "Close Collector's Drawer" : "Open Collector's Drawer"}
        className={[
          "absolute z-[26] lg:hidden",
          "top-[calc(71%+40px)] -translate-y-1/2",
          "h-[90px] w-[42px] md:h-[96px] md:w-[46px]",
          "border-0 bg-transparent p-0 text-[var(--gold)]",
          "[filter:drop-shadow(0_5px_7px_rgba(0,0,0,0.5))]",
          "transition-[left] duration-[240ms] ease-out",
          "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--gold)] focus-visible:outline-offset-2",
          expanded
            ? "left-[calc(82vw-21px)] min-[470px]:left-[calc(min(360px,84vw)-21px)] md:left-[367px]"
            : "left-1",
        ].join(" ")}
      >
        {/* v2.25b — artwork sharpened after founder review ("reads like a
            feather"): the soft artifact taper is replaced with a DAUPHINE
            blade — a faceted watch hand. Two long facets (lit + shadowed)
            meet at a hard center spine and a needle point; the counterweight
            ring gains a pinion dot; the drop-shadow blur is tightened so the
            silhouette stays crisp. Size, placement, travel, and rotation are
            untouched — ruling-locked; this is artwork only. */}
        <svg
          viewBox="0 0 46 96"
          aria-hidden="true"
          className={[
            "block h-[78px] w-[36px] overflow-visible md:h-[84px] md:w-[40px]",
            "origin-center transition-transform duration-[240ms] ease-out",
            expanded ? "scale-[0.88] rotate-180" : "scale-[0.88]",
          ].join(" ")}
        >
          {/* counterweight ring + pinion — anchored to the site gold
              (#C9A84C, the Box & Papers chip's exact color, per founder). */}
          <circle cx="23" cy="14" r="6" fill="#11141A" stroke="#C9A84C" strokeWidth="1.3" />
          <circle cx="23" cy="14" r="1.6" fill="#C9A84C" />
          {/* stem */}
          <rect x="21.6" y="20" width="2.8" height="6" fill="#A88E4B" stroke="#C9A84C" strokeWidth="0.7" />
          {/* dauphine blade — lit facet / shadow facet meeting at the spine,
              needle point at the tip */}
          <path d="M23 26 L16 56 L23 90 Z" fill="#C9A84C" />
          <path d="M23 26 L30 56 L23 90 Z" fill="#7C6428" />
          {/* hard spine + crisp silhouette */}
          <path d="M23 26 V90" stroke="#E5CE8A" strokeWidth="0.9" />
          <path d="M23 26 L16 56 L23 90 L30 56 Z" fill="none" stroke="#D4B45C" strokeWidth="1" strokeLinejoin="miter" />
        </svg>
      </button>
    </>
  );
}
