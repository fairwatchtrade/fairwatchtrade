"use client";

import { useEffect, useRef, useState, type RefObject, type CSSProperties } from "react";
import {
  emptyDraft,
  toScoringState,
  type Condition,
  type ListingDraft,
  type ListingPhoto,
} from "@/lib/listing";
import { scoreCompleteness, type PhotoCategory } from "@/lib/scoring";
import ListingScoreMeter from "@/components/ListingScoreMeter";
import PhotoUpload, {
  type UploadedPhotoMeta,
  type PhotoUploadHandle,
} from "@/components/PhotoUpload";
import DetailsStep from "@/components/DetailsStep";
import DescriptionStep from "@/components/DescriptionStep";
import ReviewStep from "@/components/ReviewStep";
import WatchBlueprint, { type Layer } from "@/components/WatchBlueprint";
import WatchSpinner from "@/components/WatchSpinner";
import BrandCombobox from "@/components/BrandCombobox";
import ModelCombobox from "@/components/ModelCombobox";

const STEPS = ["Curation", "Photos", "Details", "Description", "Review"] as const;
const CONDITIONS: Condition[] = ["Unworn", "Mint", "Excellent", "Good", "Fair"];
const ROMAN = ["I", "II", "III", "IV", "V"] as const;

/* Native <option> elements don't reliably inherit the form's dark styling — when
   a <select> opens, the browser renders the option list with OS/browser defaults
   (often a white menu), which made our light --platinum option text invisible
   (white-on-white). Explicit hex bg + text on each <option> fixes it across
   browsers. CSS variables are ignored for <option> in some browsers, so we use
   concrete hex values that match --surface / --platinum. */
const OPTION_STYLE: CSSProperties = {
  backgroundColor: "#141821",
  color: "#E8E4DC",
};

/* ── Curation call ───────────────────────────────────────────────────────
   /api/evaluate confirmed working (returns score + decision). Defensive reads
   in case field names differ. */
async function runCuration(d: ListingDraft): Promise<{
  pass: boolean;
  score: number;
  reasoning: string;
}> {
  const res = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brand: d.brand,
      reference: d.reference,
      year: d.year,
      condition: d.condition,
      askingPrice: d.askingPrice,
      provenanceNote: d.provenanceNote,
    }),
  });
  if (!res.ok) throw new Error(`evaluate ${res.status}`);
  const json = await res.json();
  const score = Number(json.score ?? json.significance ?? 0);
  const decision = String(json.decision ?? "").toLowerCase();
  const reasoning = String(json.reasoning ?? json.message ?? "");
  const pass = decision
    ? !decision.includes("reject") && !decision.includes("declin")
    : score > 0;
  return { pass, score, reasoning };
}

function mandatoryDone(d: ListingDraft): boolean {
  return (
    scoreCompleteness(toScoringState(d)).items.find((i) => i.key === "mandatory")
      ?.done ?? false
  );
}

/* The six DetailsStep chapters, keyed by their `data-chapter` attribute values.
   Drives which WatchBlueprint layer lights on the Details step. Previously
   imported as `WatchChapter` from a ChapterWatch component that never shipped;
   defined locally now so SellFlow owns its own type. */
type WatchChapter =
  | "movement"
  | "case"
  | "dial"
  | "wearing"
  | "complications"
  | "provenance";

/* ── WatchBlueprint wiring (v1.89) ───────────────────────────────────────
   Maps the two data sources (tagged photos, filled chapters) onto the plate's
   named layers. Note: GPT flagged these tables for eventual extraction to
   lib/watchBlueprintMappings.ts once a second surface needs them — logged as a
   future refactor; for v1.89 they live here. */

// PhotoCategory strings → WatchBlueprint Layer names. Verified against
// PhotoCategory in lib/scoring.ts and CATEGORY_OPTIONS in PhotoUpload.tsx.
// "Wrist shot" and "Other" have no layer equivalent — omitted intentionally.
// "Box" and "Papers/Warranty" both collapse to "provenance" — the title-block
// layer, the record of the watch's life.
const PHOTO_LAYER_MAP: Partial<Record<string, Layer>> = {
  Dial: "dial",
  Caseback: "case",
  "Clasp/Pin Buckle": "clasp",
  "Side/Lugs": "lugs",
  Movement: "movement",
  "Bracelet/Strap": "strap",
  "Full watch, strap/bracelet extended": "strap",
  "Papers/Warranty": "provenance",
  Box: "provenance",
};

// DetailsStep data-chapter values → WatchBlueprint Layer names. Verified against
// the chapterKey values in DetailsStep.tsx (movement/case/dial/wearing/
// complications/provenance).
const CHAPTER_LAYER_MAP: Partial<Record<string, Layer>> = {
  movement: "movement",
  case: "case",
  dial: "dial",
  wearing: "strap",
  complications: "complications",
  provenance: "provenance",
};

// All layers with a tagged photo — the `completed` prop on the Photos step.
// A Set dedupes (several photos of the same category = one layer).
function deriveCompletedLayersFromPhotos(photos: ListingDraft["photos"]): Layer[] {
  const layers = new Set<Layer>();
  for (const p of photos ?? []) {
    const layer = PHOTO_LAYER_MAP[p.category as string];
    if (layer) layers.add(layer);
  }
  return [...layers];
}

// The layer mapped from the most recently tagged photo — the `active` prop on
// the Photos step. Walks newest → oldest, skipping untagged/unmapped photos.
function deriveActiveLayerFromPhotos(
  photos: ListingDraft["photos"]
): Layer | undefined {
  const list = photos ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const layer = PHOTO_LAYER_MAP[list[i].category as string];
    if (layer) return layer;
  }
  return undefined;
}

// Layers whose chapter has any content — the `completed` prop on the Details
// step. Cumulative: it only ever grows as chapters fill in. Field names verified
// against the actual ListingDetails fields written in DetailsStep.tsx (all
// nested under draft.details; provenanceNote is top-level on the draft). lugs
// have no chapter data — they light only under completed="all" on Publish.
function deriveCompletedLayersFromDraft(draft: ListingDraft): Layer[] {
  const d = draft.details;
  const layers: Layer[] = [];
  if (d.movementType || d.calibre || d.movementFrequency || d.jewels || d.powerReserve)
    layers.push("movement");
  if (d.caseMaterial || d.caseSizeMm || d.crystalMaterial || d.casebackType)
    layers.push("case");
  if (d.dialColorType) layers.push("dial", "hands");
  if (d.crownPresent) layers.push("crown");
  if (d.closureType || d.braceletWristSize || d.originalStrapBracelet)
    layers.push("strap", "clasp");
  if (d.complications?.length) layers.push("complications");
  if (draft.provenanceNote?.trim()) layers.push("provenance");
  return layers;
}


export default function SellFlow() {
  const [draft, setDraft] = useState<ListingDraft>(emptyDraft);
  const [step, setStep] = useState(0);

  function patch(p: Partial<ListingDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  const photoRef = useRef<PhotoUploadHandle | null>(null);

  // The companion watch's lit region, driven purely by which chapter is in view
  // on Step 3 (Details). No buttons — the scroll position is the input.
  const [activeChapter, setActiveChapter] = useState<WatchChapter>("movement");

  // Watch the six chapter <section>s (id="chapter-*") while on the Details step.
  // Three inputs drive the active chapter, so it's correct on ANY viewport:
  //   1. IntersectionObserver — as a chapter crosses ~40% into the viewport.
  //   2. An initial calc on mount — so the top chapters light on load without
  //      waiting for a scroll (on a tall monitor several chapters are already in
  //      view at load, and the observer alone leaves them dark until you scroll).
  //   3. Focus — tabbing/clicking into any field lights that field's chapter,
  //      so the watch tracks where you're actually working even without scrolling.
  useEffect(() => {
    if (step !== 2) return;
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-chapter]")
    );
    if (sections.length === 0) return;

    // Pick the chapter nearest the upper third of the viewport right now.
    const pickByPosition = () => {
      const anchor = window.innerHeight * 0.4;
      let best: string | null = null;
      let bestDist = Infinity;
      for (const s of sections) {
        const top = s.getBoundingClientRect().top;
        const dist = Math.abs(top - anchor);
        // Prefer sections at or above the anchor line (already "entered").
        if (top <= anchor + 40 && dist < bestDist) {
          bestDist = dist;
          best = s.dataset.chapter ?? null;
        }
      }
      // Fallback: nothing above the line yet → the first section.
      if (!best) best = sections[0].dataset.chapter ?? null;
      if (best) setActiveChapter(best as WatchChapter);
    };

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const key = (e.target as HTMLElement).dataset.chapter ?? "";
          if (e.isIntersecting) visible.set(key, e.boundingClientRect.top);
          else visible.delete(key);
        }
        if (visible.size > 0) {
          const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0][0];
          setActiveChapter(top as WatchChapter);
        }
      },
      { threshold: 0, rootMargin: "-40% 0px -60% 0px" }
    );
    sections.forEach((s) => observer.observe(s));

    // Focus backup: any field gaining focus lights its enclosing chapter. This
    // makes the watch follow your attention (which field you're in), which is
    // even more direct than scroll — and rescues chapters that never scroll
    // through the threshold on a tall screen.
    const onFocusIn = (e: FocusEvent) => {
      const sec = (e.target as HTMLElement | null)?.closest?.("[data-chapter]");
      const key = (sec as HTMLElement | null)?.dataset?.chapter;
      if (key) setActiveChapter(key as WatchChapter);
    };
    document.addEventListener("focusin", onFocusIn);

    // Initial calc on mount (rAF so layout has settled).
    const raf = requestAnimationFrame(pickByPosition);

    return () => {
      observer.disconnect();
      document.removeEventListener("focusin", onFocusIn);
      cancelAnimationFrame(raf);
    };
  }, [step]);

  // Page-level drag guard. Every drop on the page is preventDefault()'d so the
  // browser never opens a file in a new tab. If the drop landed inside the
  // photo zone, we upload it directly through the PhotoUpload handle — so
  // uploads don't depend on which inner element happened to catch the event.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const inZone = (e.target as HTMLElement | null)?.closest?.(
        "[data-photo-dropzone]"
      );
      if (inZone && e.dataTransfer?.files?.length) {
        photoRef.current?.uploadFiles(e.dataTransfer.files);
      }
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  // Per-step gate for the Next button. Step 0 advances via the curation pass.
  const canProceed = step === 1 ? mandatoryDone(draft) : true;

  return (
    <div className="space-y-6">
      <ProgressBar step={step} />

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div
          data-photo-dropzone={step === 1 ? "" : undefined}
          className="border border-[var(--border-subtle)] bg-[var(--surface)] px-8 py-8"
        >
          {step === 0 && (
            <CurationStep draft={draft} patch={patch} onPass={() => setStep(1)} />
          )}
          {step === 1 && (
            <PhotosStep draft={draft} patch={patch} photoRef={photoRef} />
          )}
          {step === 2 && (
            <DetailsStep
              draft={draft}
              patch={patch}
              onProceed={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <DescriptionStep
              draft={draft}
              patch={patch}
              onProceed={() => setStep(4)}
            />
          )}
          {step === 4 && <ReviewStep draft={draft} />}

          {step > 0 && (
            <div className="mt-6">
              {step === 1 && !canProceed && (
                <p className="mb-2 text-[12px] text-[var(--muted)]">
                  Add and label the required photos to continue
                  {draft.hasBracelet
                    ? " (dial, caseback, clasp, and a full shot with the strap/bracelet extended)."
                    : " (dial, caseback, and clasp)."}
                </p>
              )}
              <div className="flex justify-between">
                <button
                  onClick={() => setStep(step - 1)}
                  className="border border-[var(--border-mid)] px-4 py-2 font-[Inter] text-[11px] uppercase tracking-[2px] text-[var(--slate)] transition hover:border-[var(--border-subtle)] hover:text-[var(--platinum)]"
                >
                  Back
                </button>
                {step < STEPS.length - 1 && step !== 3 && step !== 2 && (
                  <button
                    onClick={() => canProceed && setStep(step + 1)}
                    disabled={!canProceed}
                    className="bg-[var(--gold)] px-5 py-[13px] font-[Inter] text-[11px] font-normal uppercase tracking-[2px] text-[var(--ink)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Continue
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="md:sticky md:top-6 md:self-start md:pt-1 space-y-6">
          {draft.significanceScore != null ? (
            <ListingScoreMeter listing={toScoringState(draft)} />
          ) : (
            <div className="border border-dashed border-[var(--border-faint)] px-4 py-6 text-center">
              <div className="text-[9px] uppercase tracking-[2px] text-[var(--ghost)]">
                Listing Score
              </div>
              <div className="mt-2 font-display text-[11px] italic text-[var(--ghost)]">
                Appears after curation passes.
              </div>
            </div>
          )}

          {/**
           * WatchBlueprint is a companion to the seller.
           * It should reinforce documentation, never compete with the form.
           * Every instinct in UI development will be to make it move more. Resist.
           * If users remember the blueprint, it should be because it quietly
           * accompanied them through documenting a watch — not because it
           * demanded attention.
           */}

          {/* WatchBlueprint — Photos step.
           * Companion to the seller: layers fill gold as photos are tagged.
           * Caseback tag flips the plate to reveal the reverse.
           * WatchBlueprint is a companion, not a focal point. */}
          {step === 1 && (
            <div className="px-2 opacity-90">
              <WatchBlueprint
                completed={deriveCompletedLayersFromPhotos(draft.photos)}
                active={deriveActiveLayerFromPhotos(draft.photos)}
                autoRotateOnCaseback
              />
            </div>
          )}

          {/* WatchBlueprint — Details step (supersedes the former ChapterWatch).
           * Active layer tracks the chapter the seller is currently in.
           * Completed layers accumulate — they never reset.
           * WatchBlueprint is a companion, not a focal point. */}
          {step === 2 && (
            <div className="px-2 opacity-90">
              <WatchBlueprint
                completed={deriveCompletedLayersFromDraft(draft)}
                active={CHAPTER_LAYER_MAP[activeChapter] as Layer | undefined}
              />
            </div>
          )}

          {/* WatchBlueprint — Publish step.
           * completed="all": the watch is whole, documented, ready to hand over.
           * Nothing animates. Quiet and complete. opacity-75 keeps it more
           * recessive than the working steps — the seller's eye is on Publish.
           * WatchBlueprint is a companion, not a focal point. */}
          {step === 4 && (
            <div className="px-2 opacity-75">
              <WatchBlueprint completed="all" />
            </div>
          )}

          {/* WatchBlueprint — empty state for steps without a dedicated surface
           * (Curation, Description). Ghost at rest with the movement layer
           * faintly active as a placeholder — present without implying progress
           * that hasn't happened. opacity-50: barely there.
           * WatchBlueprint is a companion, not a focal point. */}
          {(step === 0 || step === 3) && (
            <div className="px-2 opacity-50">
              <WatchBlueprint completed={[]} active="movement" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`font-[Inter] text-[9px] uppercase tracking-[2px] ${
                  i === step
                    ? "text-[var(--gold)]"
                    : i < step
                      ? "text-[var(--gold-subtle)]"
                      : "text-[var(--ghost)]"
                }`}
              >
                {ROMAN[i]}
              </div>
              <div
                className={`mt-1 font-[Inter] text-[9px] uppercase tracking-[1.5px] ${
                  i === step
                    ? "text-[var(--platinum)]"
                    : i < step
                      ? "text-[var(--ghost)]"
                      : "text-[var(--ghost)]"
                }`}
              >
                {label}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div className="mx-3 mb-3 flex items-center gap-1">
                <div
                  className={`h-1 w-1 rounded-full ${
                    i < step ? "bg-[var(--gold-subtle)]" : "bg-[var(--border-subtle)]"
                  }`}
                />
                <div
                  className={`h-px w-8 ${
                    i < step ? "bg-[var(--gold-subtle)]" : "bg-[var(--border-faint)]"
                  }`}
                />
                <div
                  className={`h-1 w-1 rounded-full ${
                    i < step ? "bg-[var(--gold-subtle)]" : "bg-[var(--border-subtle)]"
                  }`}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CurationStep({
  draft,
  patch,
  onPass,
}: {
  draft: ListingDraft;
  patch: (p: Partial<ListingDraft>) => void;
  onPass: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready =
    draft.brand.trim() &&
    draft.reference.trim() &&
    draft.year.trim() &&
    draft.condition &&
    draft.askingPrice.trim();

  async function check() {
    setBusy(true);
    setError("");
    try {
      const { pass, score, reasoning } = await runCuration(draft);
      patch({
        significanceScore: score,
        curationDecision: pass ? "pass" : "fail",
        curationReasoning: reasoning,
      });
      if (pass) onPass();
    } catch (e) {
      setError(e instanceof Error ? e.message : "evaluation failed");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full border-b border-[var(--border-mid)] bg-transparent px-2 py-2 font-display text-[16px] font-light text-[var(--platinum)] placeholder:italic placeholder:text-[var(--ghost)] focus-visible:border-[var(--gold)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-gold)] focus:border-[var(--border-gold)] focus:outline-none transition";
  const label = "mb-2 block text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]";

  return (
    <div>
      <h2 className="mb-1 font-display text-[20px] font-light text-[var(--platinum)]">
        Is your watch a fit?
      </h2>
      <p className="mb-6 text-[13px] text-[var(--muted)]">
        A quick check before you build the listing. FairWatchTrade is curated.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Brand</label>
          <BrandCombobox
            value={draft.brand}
            onChange={(brand, isCustom) => patch({ brand, customBrandFlag: isCustom })}
            inputClassName={input}
            placeholder="e.g. Parmigiani Fleurier"
          />
        </div>
        <div>
          <label className={label}>Model</label>
          <ModelCombobox
            id="model"
            value={draft.model}
            onChange={(model) => patch({ model })}
            brandName={draft.brand}
            inputClassName={input}
            placeholder="e.g. Tonda Métrographe"
          />
        </div>
        <div>
          <label className={label}>Reference number</label>
          <input id="reference" className={input} value={draft.reference} onChange={(e) => patch({ reference: e.target.value })} placeholder="e.g. reference number" />
        </div>
        <div>
          <label className={label}>Year</label>
          <input className={input} value={draft.year} onChange={(e) => patch({ year: e.target.value })} placeholder="e.g. 2021" />
        </div>
        <div>
          <label className={label}>Condition</label>
          <select
            className={input}
            value={draft.condition}
            onChange={(e) => patch({ condition: e.target.value as Condition })}
          >
            <option value="" style={OPTION_STYLE}>Select…</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c} style={OPTION_STYLE}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Asking price (USD)</label>
          <input className={input} value={draft.askingPrice} onChange={(e) => patch({ askingPrice: e.target.value })} placeholder="e.g. 7250" inputMode="numeric" />
        </div>
      </div>

      <div className="mt-4">
        <label className={label}>Brief provenance note</label>
        <textarea className={`${input} min-h-[72px]`} value={draft.provenanceNote} onChange={(e) => patch({ provenanceNote: e.target.value })} placeholder="Service history, previous ownership, how you acquired it…" spellCheck={false} />
      </div>

      {draft.curationDecision === "fail" && (
        <div className="mt-4 border border-[rgba(220,80,80,0.25)] bg-[rgba(220,80,80,0.06)] px-4 py-3 text-[13px]">
          <div className="mb-1 font-medium text-[var(--danger)]">Not a fit right now.</div>
          {draft.curationReasoning && <div className="text-[var(--danger)]/80">{draft.curationReasoning}</div>}
        </div>
      )}

      {error && <div className="mt-4 text-[13px] text-[var(--danger)]">Error: {error}</div>}

      <button
        onClick={check}
        disabled={!ready || busy}
        className={`mt-6 flex items-center gap-2 bg-[var(--gold)] px-6 py-[13px] font-[Inter] text-[10px] font-normal uppercase tracking-[2.5px] text-[var(--ink)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${
          busy ? "cursor-wait" : !ready ? "cursor-not-allowed" : ""
        }`}
      >
        {busy && <WatchSpinner size={16} />}
        {busy ? "Checking…" : "Check eligibility"}
      </button>
    </div>
  );
}

function PhotosStep({
  draft,
  patch,
  photoRef,
}: {
  draft: ListingDraft;
  patch: (p: Partial<ListingDraft>) => void;
  photoRef: RefObject<PhotoUploadHandle | null>;
}) {
  const [dragCount, setDragCount] = useState(0);
  const dragOver = dragCount > 0;

  function onPhotos(metas: UploadedPhotoMeta[]) {
    const photos: ListingPhoto[] = metas
      .filter((m) => m.category)
      .map((m) => ({
        photo: { url: m.url, pathname: m.pathname },
        category: m.category as PhotoCategory,
        isWristShot: m.isWristShot,
      }));
    patch({ photos });
  }

  return (
    <div>
      <h2 className="mb-1 font-display text-[20px] font-light text-[var(--platinum)]">Photos</h2>
      <p className="mb-6 text-[13px] text-[var(--muted)]">
        Upload your shots and label each one. Required: dial, caseback, clasp
        {draft.hasBracelet ? ", and a full shot with the strap/bracelet extended" : ""}. The score on the
        right climbs as you go.
      </p>

      <label className="mt-4 flex items-center gap-2 text-[13px] text-[var(--platinum)]">
        <input
          type="checkbox"
          checked={draft.hasBracelet}
          onChange={(e) => patch({ hasBracelet: e.target.checked })}
          className="accent-[#C9A84C]"
        />
        This watch is on a bracelet (needs a full shot with the bracelet extended)
      </label>

      <div
        className={`mt-4 transition-all duration-200 ${
          dragOver
            ? "bg-[rgba(201,168,76,0.04)] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.2)]"
            : ""
        }`}
        onDragEnter={() => setDragCount((c) => c + 1)}
        onDragLeave={() => setDragCount((c) => c - 1)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setDragCount(0);
        }}
      >
        <PhotoUpload ref={photoRef} onChange={onPhotos} />
      </div>
    </div>
  );
}
