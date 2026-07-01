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

export default function SellFlow() {
  const [draft, setDraft] = useState<ListingDraft>(emptyDraft);
  const [step, setStep] = useState(0);

  function patch(p: Partial<ListingDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  const photoRef = useRef<PhotoUploadHandle | null>(null);

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
          {step === 2 && <DetailsStep draft={draft} patch={patch} />}
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
                {step < STEPS.length - 1 && step !== 3 && (
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

        <div className="md:pt-1">
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
    "w-full border-b border-[var(--border-mid)] bg-transparent px-0 py-2 font-display text-[16px] font-light text-[var(--platinum)] placeholder:italic placeholder:text-[var(--ghost)] focus:border-[var(--border-gold)] focus:outline-none transition";
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
        <textarea className={`${input} min-h-[72px]`} value={draft.provenanceNote} onChange={(e) => patch({ provenanceNote: e.target.value })} placeholder="Service history, previous ownership, how you acquired it…" />
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
