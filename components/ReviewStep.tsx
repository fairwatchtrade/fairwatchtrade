"use client";

import { useState } from "react";
import { type ListingDraft } from "@/lib/listing";
import { toScoringState } from "@/lib/listing";
import WatchSpinner from "@/components/WatchSpinner";

function formatPrice(p: string): string {
  const n = Number(String(p).replace(/[^0-9.]/g, ""));
  if (!isFinite(n) || n <= 0) return p ? `$${p}` : "Price on request";
  return `$${n.toLocaleString("en-US")}`;
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
  push("Crown present", d.crownPresent ? "Yes" : "");
  push("Documentation", d.documentation);
  push("Complications", (d.complications ?? []).join(", "));
  push("Service history", (d.serviceHistory ?? []).join(", "));
  push("Included", (d.includedWithWatch ?? []).join(", "));
  push("Original strap & pins", d.originalStrapBracelet ? "Yes" : "");
  push("Bracelet wrist size", d.braceletWristSize);
  return rows;
}

export default function ReviewStep({ draft }: { draft: ListingDraft }) {
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          provenanceNote: draft.provenanceNote,
          significanceScore: draft.significanceScore,
          photos: draft.photos,
          hasBracelet: draft.hasBracelet,
          details: draft.details,
          description: draft.description,
          descriptionPassedAI: draft.descriptionPassedAI,
          scoreState: toScoringState(draft),
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
      setPublished(true);
    } catch {
      setError("Network error — your listing wasn't published. Try again.");
    } finally {
      setPublishing(false);
    }
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

  const photos = draft.photos;
  const dial = photos.find((p) => p.category === "Dial");
  const hero = (dial ?? photos[0])?.photo.url;
  const rows = specRows(draft);

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
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt="" className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center text-[13px] text-[var(--muted)]">
            No photos added
          </div>
        )}

        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-3 pt-3">
            {photos.slice(0, 8).map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={p.photo.url}
                alt=""
                className="h-14 w-14 shrink-0 border border-[var(--border-subtle)] object-cover"
              />
            ))}
          </div>
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
          <div className="mt-1 font-display text-[16px] font-light text-[var(--gold)]">
            {formatPrice(draft.askingPrice)}
          </div>

          {draft.description && (
            <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-[var(--slate)]">
              {draft.description}
            </p>
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
