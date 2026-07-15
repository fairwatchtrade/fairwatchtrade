"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/* ────────────────────────────────────────────────────────────────────────
   COLLECTOR'S DRAWER — components/CollectorsDrawer.tsx  (v2.11)

   William's original concept, Design Gate approved: a collapsed smoked-glass
   tab on the gallery's left edge that expands as an OVERLAY across the
   gallery rather than living as a permanent side column — chosen precisely
   because a fixed column never made sense on mobile.

   ── ANCHORING (per the locked ruling) ──────────────────────────────────
   This component is a SIBLING of <ListingGallery/>, never nested inside it.
   ListingGallery.tsx receives zero changes and stays scoped to photography.
   page.tsx wraps the gallery in a `relative` div and renders this alongside
   it, so `inset-y-0 left-0` covers the gallery box at ANY height with no
   measurement and no ResizeObserver. The tab's top:108px is measured from
   that wrapper's top edge — identical to the mockup, where the gallery is
   the first in-flow child of the same positioned ancestor.

   ── DESKTOP ONLY ───────────────────────────────────────────────────────
   Mounted only at `xl` by page.tsx. Mobile/tablet keep the single-column
   page and the standalone "Return to browse" link. No viewport shows both
   navigation mechanisms. The mobile Drawer (smoked-blue-glass bottom sheet,
   per PRODUCT_SOUL) is a later Design Gate flight.

   ── GLASS 0.35 + GLYPH-LOCAL CONTRAST + RESTRAINED VEIL (final) ────────
   The concept is smoked glass laid over the watch; legibility is never
   extracted from the panel. Three earlier states were each wrong:
     · 0.28 (mockup)  — --muted text at 1.13:1 over a silver dial
     · 0.88 (my fix)  — passed the math by becoming a wall; 12% show-through
       is mathematically real and perceptually nothing
     · 0.32 + double shadow + header-only scrim — passed my stroke-vs-halo
       metric at 5.5–11.6 and STILL failed two human reviewers ("close to
       unreadable"). The halo metric measures the darkest rim pixel; the eye
       integrates the whole bright field. Metric retired as the gate.

   Final recipe, each step added only when measurement demanded it:
     · glass 0.35 — top of the approved 0.28–0.35 band
     · glyph-wrapping glow on every live text
       (0 1px 2px rgba(0,0,0,.90), 0 0 8px rgba(0,0,0,.70))
     · kicker 10px/500 (at 9px its anti-aliased stroke measured (159,160,162)
       over a bright dial — the gold itself dissolves)
     · notes 12px (were 11px)
     · ONE continuous restrained veil behind the text column
       (62% ink at top → 42% at 30% → 30% floor) — deepening the existing
       header scrim rather than adding a second surface; never opaque

   Gate metric: stroke-vs-MEDIAN-local-field on real rendered Chromium pixels
   (playwright; wkhtmltoimage disqualified — silently no-ops grid/inset).
   Gates: display text ≥3.0, BODY COPY ≥4.5 — the body gate was raised from
   3.0 after a human reviewer read the lowest notes as faint at 4.07–4.48; a
   per-band sweep confirmed the eye exactly (the metric had sampled only the
   best-positioned note). Veil floor was then raised 0.30 → 0.50, which is
   why the lower gradient stop above is 0.50.

   Verified per-band over a silver dial: every body line 5.22–6.11, every
   heading 6.56–7.32. Dark dial passes with wide headroom. Mid-panel over
   silver: (73,74,77) vs the dial's (214,214,214) beside it — smokier than
   before, still clearly modulated by the photograph's light

   Numbers screen; the human eye signs off. That is the law's actual order.

   ── NO ORPHANS ─────────────────────────────────────────────────────────
   All three items are live. "Around This Watch" was audited against the real
   Browse implementation and is built ONLY from raw exact-match facets
   (brand / movementType / caseMaterial / dialColorType). Browse's caseSize,
   beatRate and powerReserve are normalized through label functions, so a
   hand-built link for those would match nothing while looking alive; they are
   omitted rather than faked. `reference` is not a Browse facet at all.
   "Add to My Catalogue" reuses the existing saved_watches upsert pattern
   verbatim — no second save implementation.

   Canary: PFC274 = 62 — /api/evaluate untouched.
   ──────────────────────────────────────────────────────────────────────── */

export default function CollectorsDrawer({
  listingId,
  browseHref,
  similarHref,
}: {
  listingId: string;
  browseHref: string;
  /** null when this listing has none of the four safe facets — the item is
      then omitted entirely rather than linking to an unfiltered browse. */
  similarHref: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const router = useRouter();

  // Reuses BrowseClient's saved_watches pattern exactly: client-side upsert,
  // idempotent via onConflict + ignoreDuplicates, logged-out → /login with a
  // callbackUrl. The only difference is the callback returns here, to this
  // listing, rather than to /browse.
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

  /* Local, text-independent contrast: a soft dark halo around each glyph.
     The glass stays translucent; legibility is not extracted from the panel.
     Tried per the ruling's order BEFORE any backing chip. */
  const glassText = "[text-shadow:0_1px_2px_rgba(0,0,0,0.90),0_0_8px_rgba(0,0,0,0.70)]";

  const itemTitle =
    `block font-display text-[15px] leading-[1.25] text-[var(--platinum)] transition group-hover:text-[var(--gold)] ${glassText}`;
  const itemNote = `mt-1.5 block text-[12px] leading-[1.5] text-[var(--platinum-dim)] ${glassText}`;
  const itemRow = "group border-b border-[var(--border-mid)] py-[18px] text-left";

  return (
    <>
      {/* ── COLLAPSED TAB — 46×286 at top:108px, left:-50px. Sits in the
             page's left padding, outside the grid column, exactly as
             approved. This is the only affordance until called upon. ── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? "Close the Collector's Drawer" : "Open the Collector's Drawer"}
        className={[
          "absolute left-[-50px] top-[108px] z-[7]",
          "flex h-[286px] w-[46px] items-center justify-center",
          "border border-[var(--border-mid)] bg-[rgba(20,22,28,0.74)] backdrop-blur-[14px]",
          "text-[9px] uppercase tracking-[0.17em] text-[var(--platinum-dim)]",
          "transition hover:border-[var(--border-gold)] hover:text-[var(--gold)]",
        ].join(" ")}
      >
        <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
          Collector&rsquo;s Drawer
        </span>
      </button>

      {/* ── EXPANDED OVERLAY — 360px, anchored to the gallery wrapper via
             inset-y-0, so it matches the gallery's height at any viewport
             without measuring it. visibility:hidden while collapsed keeps
             its links out of the tab order. ── */}
      <div
        aria-hidden={!expanded}
        className={[
          "absolute inset-y-0 left-0 z-[6] w-[360px]",
          "border-r border-[var(--border-gold)]",
          "bg-[rgba(20,22,28,0.35)] backdrop-blur-[16px]",
          "shadow-[18px_0_42px_rgba(0,0,0,0.26)]",
          "transition-[opacity,transform,visibility] duration-[220ms] ease-out",
          expanded
            ? "visible translate-x-0 opacity-100"
            : "invisible -translate-x-[18px] opacity-0",
        ].join(" ")}
      >
        <div className="flex h-full flex-col px-7 pb-7 pt-[54px] [background:linear-gradient(180deg,rgba(13,15,20,0.62)_0%,rgba(13,15,20,0.50)_30%,rgba(13,15,20,0.50)_100%)]">
          <div className={`text-[10px] font-medium uppercase tracking-[0.17em] text-[var(--gold)] ${glassText}`}>
            Collector&rsquo;s Drawer
          </div>
          <h2 className={`mb-6 mt-[9px] font-display text-[25px] font-normal leading-[1.15] text-[var(--platinum)] ${glassText}`}>
            Around this watch
          </h2>

          <div className="grid border-t border-[var(--border-mid)]">
            {/* 1 — Back to Browse. Carries the same returnTo-preserved href the
                   standalone link used, which is why that link can retire on
                   desktop without losing the collector's filters. */}
            <Link href={browseHref} className={itemRow}>
              <span className={itemTitle}>Back to Browse</span>
              <span className={itemNote}>
                Return with the current browse context preserved.
              </span>
            </Link>

            {/* 2 — Around This Watch. Omitted entirely when this listing has
                   none of the four audited facets: an unfiltered /browse link
                   would be a dead end wearing a live label. */}
            {similarHref && (
              <Link href={similarHref} className={itemRow}>
                <span className={itemTitle}>Around This Watch</span>
                <span className={itemNote}>
                  Similar watches by brand, movement, case material, and dial colour.
                </span>
              </Link>
            )}

            {/* 3 — Add to My Catalogue. Honest states: idle, saving, saved,
                   failed. Never reports a save that didn't happen. */}
            <button
              type="button"
              onClick={addToCatalogue}
              disabled={saved || saving}
              className={`${itemRow} ${saved ? "cursor-default" : ""}`}
            >
              <span className={saved ? itemTitle.replace("group-hover:text-[var(--gold)]", "") : itemTitle}>
                {saved ? "In My Catalogue" : saving ? "Adding…" : "Add to My Catalogue"}
              </span>
              <span className={itemNote}>
                {saveError
                  ? "That didn't save. Please try again."
                  : saved
                    ? "Kept with your saved collector context."
                    : "Keep this watch with the collector's saved context."}
              </span>
            </button>
          </div>

          <div className={`mt-auto pt-5 text-[9px] uppercase leading-[1.6] tracking-[0.10em] text-[var(--platinum-dim)] ${glassText}`}>
            The gallery remains beneath the smoked glass.
          </div>
        </div>
      </div>
    </>
  );
}
