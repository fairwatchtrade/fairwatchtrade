"use client";

import { useRef, useState } from "react";
import { type ListingDraft } from "@/lib/listing";
import PhotoPresentationEditor, {
  PhotoPresentationEntry,
} from "@/components/PhotoPresentationEditor";
import { automaticHeroIndex as roleAutomaticHero, sortByPhotoRole } from "@/lib/photoRoles";
import {
  type PhotoPresentation,
  presentationStyleFor,
  resolveHeroIndex,
  sanitizePhotoPresentation,
} from "@/lib/photoPresentation";
import { toScoringState } from "@/lib/listing";
import WatchSpinner from "@/components/WatchSpinner";
import { parsePrice } from "@/lib/parsePrice";
import { formatMoney } from "@/lib/formatMoney";

/* Money Truth Stage B (order §9.2 + approved Design Gate) — the Review step
   restates the EXACT amount-and-currency pair the seller confirmed in the
   curation step: governed parse (no [^0-9.] strip), formatMoney rendering
   (no hardcoded $), and the explicit ISO code beside the amount. */
function reviewMoney(d: ListingDraft): { text: string; code: string | null } {
  const parsed = parsePrice(d.askingPrice, d.askingCurrency);
  if (!parsed.ok) {
    // An unparseable or currency-less draft price is stated as undisclosed,
    // never dressed up as dollars. The curation step's confirmation gate makes
    // this unreachable in the normal flow.
    return { text: "Price on request", code: null };
  }
  return { text: formatMoney(parsed.amount, parsed.currency), code: parsed.currency };
}

function specRows(draft: ListingDraft): [string, string][] {
  const d = draft.details;
  const rows: [string, string][] = [];
  const push = (label: string, value?: string | null) => {
    if (value != null && String(value).trim() !== "") rows.push([label, String(value)]);
  };
  push("Movement", d.movementType);
  push("Frequency", d.movementFrequency);
  push("Case size", d.caseSizeMm ? `${d.caseSizeMm} mm` : "");
  push("Thickness", d.caseThicknessMm ? `${d.caseThicknessMm} mm` : "");
  push("Case material", d.caseMaterial);
  push("Case finish", d.caseColorFinish);
  push("Dial", d.dialColorType);
  push("Crystal", d.crystalMaterial);
  push("Caseback", d.casebackType);
  push("Closure", d.closureType);
  /* A required binary answer, so "No" must SHOW. The old form emitted "" for
     false, which made a deliberate No indistinguishable from an unanswered
     field on Review — the very ambiguity the control was changed to remove.
     undefined still emits "" (push drops empties), but Details now blocks
     Continue until it is answered, so that state should not reach Review. */
  push("Crown present", d.crownPresent === undefined ? "" : d.crownPresent ? "Yes" : "No");
  push("Documentation", d.documentation);
  push("Complications", (d.complications ?? []).join(", "));
  push("Service history", (d.serviceHistory ?? []).join(", "));
  push("Included", (d.includedWithWatch ?? []).join(", "));
  push("Original strap & pins", d.originalStrapBracelet ? "Yes" : "");
  push("Bracelet wrist size", d.braceletWristSize);
  return rows;
}

export default function ReviewStep({
  draft,
  onPresentationChange,
  captureSessionId,
  publishRequestId,
  onPublished,
}: {
  draft: ListingDraft;
  // Lifts the seller's hero framing back into the draft. Optional so the
  // component still renders read-only if mounted without an owner.
  onPresentationChange?: (p: PhotoPresentation) => void;
  // v2.24 · The Aubrey Check desktop correlation — supplied by SellFlow.
  // Optional so the component still renders (and publishes, pre-correlation
  // style) if mounted without them.
  captureSessionId?: string;
  publishRequestId?: string;
  // List From Phone — lets SellFlow close its server draft (idempotent) once
  // the real listing exists. Additive; publish behavior itself is untouched.
  onPublished?: (listingId: string) => void;
}) {
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  // v2.24 · a publish can land held (pending_review) — the seller sees the
  // locked held-state copy, never a false "live".
  const [held, setHeld] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  // Focus returns to the utility when the editor closes — the proven
  // SavedSearches restoration pattern, not a new one.
  const entryRef = useRef<HTMLButtonElement | null>(null);
  const presentation = sanitizePhotoPresentation(draft.photoPresentation);

  async function publish() {
    setPublishing(true);
    setError(null);

    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: draft.brand,
          customBrandFlag: draft.customBrandFlag,
          model: draft.model,
          reference: draft.reference,
          year: draft.year,
          condition: draft.condition,
          askingPrice: draft.askingPrice,
          askingCurrency: draft.askingCurrency,
          provenanceNote: draft.provenanceNote,
          significanceScore: draft.significanceScore,
          photos: draft.photos,
          // Presentation metadata travels beside the photos it frames — never
          // inside them, so the evidence array keeps exactly its old shape.
          photoPresentation: sanitizePhotoPresentation(draft.photoPresentation),
          hasBracelet: draft.hasBracelet,
          details: draft.details,
          description: draft.description,
          descriptionPassedAI: draft.descriptionPassedAI,
          scoreState: toScoringState(draft),
          // v2.24 · additive — desktop media correlation + idempotency.
          // media_meta mirrors the mobile wizard's shape; storage_path is the
          // upload pathname, category the seller's tag (draft.photos only
          // ever contains tagged photos — untagged uploads never join the
          // listing).
          ...(captureSessionId && publishRequestId
            ? {
                publish_request_id: publishRequestId,
                source: "desktop_sell",
                media_meta: draft.photos.map((p, i) => ({
                  category: p.category,
                  storage_path: p.photo.pathname,
                  capture_session_id: captureSessionId,
                  sequence_index: i,
                  original_hash: "",
                  privacy_review_requested: false,
                })),
              }
            : {}),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          setError("Please sign in before publishing — your listing isn't lost.");
        } else {
          setError(data?.detail || "Something went wrong publishing your listing.");
        }
        setPublishing(false);
        return;
      }
      window.scrollTo(0, 0);
      setHeld(data?.status === "pending_review");
      setPublished(true);
      if (data?.id && onPublished) onPublished(String(data.id));
    } catch {
      setError("Network error — your listing wasn't published. Try again.");
    } finally {
      setPublishing(false);
    }
  }

  if (published && held) {
    // v2.24 · locked held-state copy (Design Gate ruling) — truthful, never
    // accusatory, no machinery named.
    return (
      <div className="py-12 text-center">
        <div className="mb-6 font-display text-[28px] font-light text-[var(--platinum)]">
          Your photographs are receiving an additional authenticity review.
        </div>
        <p className="mx-auto max-w-md text-[13px] leading-relaxed text-[var(--slate)]">
          Your listing is saved and is not visible to buyers yet. Most reviews
          require no action from the seller.
        </p>
      </div>
    );
  }

  if (published) {
    return (
      <div className="py-12 text-center">
        <div className="mb-6 font-display text-[28px] font-light text-[var(--platinum)]">
          Your listing is live.
        </div>
        <p className="mx-auto mb-4 max-w-md font-display text-[16px] font-light italic leading-[1.8] text-[var(--muted)]">
          Your watch is ready for its next collector.
        </p>
        <p className="mx-auto max-w-md text-[13px] leading-relaxed text-[var(--slate)]">
          {draft.brand} {draft.model || draft.reference} is now published on FairWatchTrade. You can manage or edit it anytime from your listings.
        </p>
      </div>
    );
  }

  /* Role order, not upload order — the seller tagged each photo precisely so
     the sequence could be deliberate. One shared resolver governs this card,
     the editor, and the published gallery. */
  const photos = sortByPhotoRole(draft.photos, (p) => p.category);
  /* The automatic hero is unchanged: first Dial photo, else the first photo.
     The seller's choice only OVERRIDES it — it never replaces the rule, so a
     draft with no presentation frames exactly as it always did. */
  const automaticHeroIndex = roleAutomaticHero(photos, (p) => p.category);
  const heroIndex = resolveHeroIndex(
    photos.map((p) => p.photo.pathname),
    presentation,
    automaticHeroIndex
  );
  const hero = photos[heroIndex]?.photo.url;
  const rows = specRows(draft);
  const money = reviewMoney(draft);

  return (
    <div>
      <h2 className="font-display text-[20px] font-light text-[var(--platinum)]">
        Step 5 — Review &amp; publish
      </h2>
      <p className="mt-1 text-[13px] text-[var(--muted)]">
        Here&apos;s exactly how buyers will see your listing.
      </p>

      {/* Buyer's-eye preview */}
      <div className="mt-4 overflow-hidden border border-[var(--border-subtle)] bg-[var(--ink)]">
        {hero ? (
          /* overflow-hidden is load-bearing: it is what makes governed zoom a
             crop inside the frame rather than an image that spills over the
             card edge. */
          <div className="relative aspect-[4/3] w-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hero} alt="" style={presentationStyleFor(presentation, photos[heroIndex]?.photo.pathname, 4 / 3)} className="h-full w-full" />
          </div>
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center text-[13px] text-[var(--muted)]">
            No photos added
          </div>
        )}

        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-3 pt-3">
            {photos.slice(0, 8).map((p, i) => (
              /* Wrapped so rotation/zoom crop INSIDE the square — a transform
                 on a bare <img> paints outside its own border box. Square
                 container: aspect 1, so a quarter-turn needs no cover-scale. */
              <div
                key={i}
                className="relative h-14 w-14 shrink-0 overflow-hidden border border-[var(--border-subtle)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.photo.url}
                  alt=""
                  style={presentationStyleFor(presentation, p.photo.pathname, 1)}
                  className="h-full w-full"
                />
              </div>
            ))}
          </div>
        )}

        {/* Approved placement: directly beneath the thumbnail strip and BEFORE
            the listing identity. It renders for a single photo too — framing a
            lone hero is the case that needs it most, since there is no second
            photograph to carry the watch. */}
        {photos.length > 0 && onPresentationChange && (
          <PhotoPresentationEntry
            buttonRef={entryRef}
            onOpen={() => setEditorOpen(true)}
            className="px-3 pt-3"
          />
        )}

        <div className="p-4">
          <div className="text-[11px] uppercase tracking-[0.15em] text-[var(--muted)]">
            {[draft.condition, draft.year].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-1 font-display text-[18px] font-light text-[var(--platinum)]">
            {[draft.brand, draft.model].filter(Boolean).join(" ")}
          </div>
          {draft.reference && (
            <div className="mt-0.5 text-[12px] text-[var(--muted)]">
              Ref. {draft.reference}
            </div>
          )}
          {/* ONE coherent price expression. The shared formatter already carries
              the currency in the amount itself (US$8,250 · CHF 8,250 · €8,250),
              so the separate ISO label that used to sit beside it was the same
              fact said twice — "US$8,250 USD". The label is gone; the Money
              Truth formatting and currency semantics are untouched. */}
          <div className="mt-2 border border-[var(--border-gold)] bg-[rgba(201,168,76,0.04)] px-3 py-2.5">
            <div className="text-[8px] uppercase tracking-[2px] text-[var(--gold-dim)]">
              Asking price
            </div>
            <div className="mt-0.5 font-display text-[18px] font-light text-[var(--gold)]">
              {money.text}
            </div>
          </div>

          {/* What to Know — contextual disclosure tied to the price area. The
              currency explanation used to hold permanent page space directly
              above the seller's story, so the two ran together. It lives here
              now: the Review page stays quiet, and the explanation appears only
              when asked for. */}
          <details className="group mt-2 border-b border-[var(--border-faint)] pb-2">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-[10px] uppercase tracking-[1.5px] text-[var(--gold-subtle)] transition hover:text-[var(--gold)] [&::-webkit-details-marker]:hidden">
              <svg
                width="9"
                height="9"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
                className="shrink-0 transition-transform duration-200 group-open:rotate-90"
              >
                <path d="M5 3l5 4-5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              What to Know
            </summary>
            <p className="mt-1.5 max-w-[560px] text-[11px] leading-[1.6] text-[var(--muted)]">
              The amount and currency shown here are the exact values attached to the listing.
              FairWatchTrade does not convert the price into another currency, and buyers make
              offers in the same currency you chose.
            </p>
          </details>

          {draft.description && (
            <div className="mt-5">
              {/* Section boundary: the seller's story is its own region, never a
                  continuation of the price explanation above it. */}
              <div className="text-[8px] uppercase tracking-[3px] text-[var(--gold)]">
                Your Description
              </div>
              <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-[var(--slate)]">
                {draft.description}
              </p>
            </div>
          )}

          {rows.length > 0 && (
            <dl className="mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {rows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between gap-3 border-b border-white/5 py-1.5"
                >
                  <dt className="text-[12px] text-[var(--muted)]">{label}</dt>
                  <dd className="text-right text-[12px] text-[var(--platinum)]">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      {editorOpen && onPresentationChange && (
        <PhotoPresentationEditor
          photos={photos}
          value={presentation}
          automaticHeroPathname={photos[automaticHeroIndex]?.photo.pathname ?? null}
          onSave={onPresentationChange}
          onClose={() => {
            setEditorOpen(false);
            entryRef.current?.focus();
          }}
        />
      )}

      {error && (
        <p className="mt-4 border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-center text-[13px] text-[var(--danger)]">
          {error}
        </p>
      )}

      <p className="mb-4 mt-6 text-center font-display text-[15px] font-light italic text-[var(--muted)]">
        Your watch is ready for its next collector.
      </p>

      <div className="flex justify-end">
        <button
          onClick={publish}
          disabled={publishing}
          className={`flex items-center gap-2 bg-[var(--gold)] px-6 py-[13px] text-[11px] font-normal uppercase tracking-[2px] text-[var(--ink)] hover:opacity-90 disabled:opacity-40 ${
            publishing ? "cursor-wait" : ""
          }`}
        >
          {publishing && <WatchSpinner size={16} />}
          {publishing ? "Publishing…" : "Publish Listing"}
        </button>
      </div>
    </div>
  );
}
