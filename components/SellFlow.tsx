"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
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

const STEPS = ["Curation", "Photos", "Details", "Description", "Review"] as const;
const CONDITIONS: Condition[] = ["Unworn", "Mint", "Excellent", "Good", "Fair"];

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
          className="rounded-xl border border-white/10 bg-[#13151C] p-6"
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
                <p className="mb-2 text-[12px] text-[#8A8F9E]">
                  Add and label the required photos to continue
                  {draft.hasBracelet
                    ? " (dial, caseback, clasp, and a full shot with the strap/bracelet extended)."
                    : " (dial, caseback, and clasp)."}
                </p>
              )}
              <div className="flex justify-between">
                <button
                  onClick={() => setStep(step - 1)}
                  className="rounded-md border border-white/15 px-4 py-2 text-[13px] text-[#E8E4DC] hover:bg-white/5"
                >
                  ← Back
                </button>
                {step < STEPS.length - 1 && step !== 3 && (
                  <button
                    onClick={() => canProceed && setStep(step + 1)}
                    disabled={!canProceed}
                    className={`rounded-md bg-[#C9A84C] px-4 py-2 text-[13px] font-medium text-black hover:opacity-90 disabled:opacity-40 ${
                      canProceed ? "" : "cursor-not-allowed"
                    }`}
                  >
                    Next →
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
            <div className="rounded-lg border border-dashed border-white/15 p-4 text-[12px] text-[#8A8F9E]">
              Your listing score appears here once curation passes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((label, i) => (
        <div key={label} className="flex flex-1 flex-col gap-1">
          <div className={`h-1 rounded-full ${i <= step ? "bg-[#C9A84C]" : "bg-white/10"}`} />
          <div className={`text-[11px] ${i === step ? "text-[#E8E4DC]" : "text-[#8A8F9E]"}`}>
            {i + 1}. {label}
          </div>
        </div>
      ))}
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
    "w-full rounded-md border border-white/15 bg-[#0D0F14] px-3 py-2 text-[14px] text-[#E8E4DC] placeholder:text-[#8A8F9E]/60 focus:border-[#C9A84C] focus:outline-none";
  const label = "mb-1 block text-[12px] text-[#8A8F9E]";

  return (
    <div>
      <h2 className="text-[18px] font-medium text-[#E8E4DC]">
        Step 1 — Is your watch a fit?
      </h2>
      <p className="mt-1 text-[13px] text-[#8A8F9E]">
        A quick check before you build the listing. FairWatchTrade is curated.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Brand</label>
          <input className={input} value={draft.brand} onChange={(e) => patch({ brand: e.target.value })} placeholder="Parmigiani Fleurier" />
        </div>
        <div>
          <label className={label}>Model</label>
          <input className={input} value={draft.model} onChange={(e) => patch({ model: e.target.value })} placeholder="Tonda Métrographe" />
        </div>
        <div>
          <label className={label}>Reference number</label>
          <input className={input} value={draft.reference} onChange={(e) => patch({ reference: e.target.value })} placeholder="PFC274-0000600" />
        </div>
        <div>
          <label className={label}>Year</label>
          <input className={input} value={draft.year} onChange={(e) => patch({ year: e.target.value })} placeholder="2021" />
        </div>
        <div>
          <label className={label}>Condition</label>
          <select className={input} value={draft.condition} onChange={(e) => patch({ condition: e.target.value as Condition })}>
            <option value="">Select…</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Asking price (USD)</label>
          <input className={input} value={draft.askingPrice} onChange={(e) => patch({ askingPrice: e.target.value })} placeholder="7250" inputMode="numeric" />
        </div>
      </div>

      <div className="mt-4">
        <label className={label}>Brief provenance note</label>
        <textarea className={`${input} min-h-[72px]`} value={draft.provenanceNote} onChange={(e) => patch({ provenanceNote: e.target.value })} placeholder="Bought from an authorized dealer; full set; one owner…" />
      </div>

      {draft.curationDecision === "fail" && (
        <div className="mt-4 rounded-md border border-red-500/30 bg-red-950/30 p-3 text-[13px] text-red-200">
          <div className="font-medium">Not a fit right now.</div>
          {draft.curationReasoning && <div className="mt-1 text-red-200/90">{draft.curationReasoning}</div>}
        </div>
      )}

      {error && <div className="mt-4 text-[13px] text-red-300">Error: {error}</div>}

      <button
        onClick={check}
        disabled={!ready || busy}
        className={`mt-5 flex items-center gap-2 rounded-md bg-[#C9A84C] px-5 py-2.5 text-[13px] font-medium text-black hover:opacity-90 disabled:opacity-40 ${
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
      <h2 className="text-[18px] font-medium text-[#E8E4DC]">Step 2 — Photos</h2>
      <p className="mt-1 text-[13px] text-[#8A8F9E]">
        Upload your shots and label each one. Required: dial, caseback, clasp
        {draft.hasBracelet ? ", and a full shot with the strap/bracelet extended" : ""}. The score on the
        right climbs as you go.
      </p>

      <label className="mt-4 flex items-center gap-2 text-[13px] text-[#E8E4DC]">
        <input
          type="checkbox"
          checked={draft.hasBracelet}
          onChange={(e) => patch({ hasBracelet: e.target.checked })}
          className="accent-[#C9A84C]"
        />
        This watch is on a bracelet (needs a full shot with the bracelet extended)
      </label>

      <div className="mt-4">
        <PhotoUpload ref={photoRef} onChange={onPhotos} />
      </div>
    </div>
  );
}
