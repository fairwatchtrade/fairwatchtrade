"use client";

import { useState } from "react";
import {
  emptyDraft,
  toScoringState,
  type Condition,
  type ListingDraft,
} from "@/lib/listing";
import ListingScoreMeter from "@/components/ListingScoreMeter";

const STEPS = [
  "Curation",
  "Photos",
  "Details",
  "Description",
  "Review",
] as const;

const CONDITIONS: Condition[] = ["Unworn", "Mint", "Excellent", "Good", "Fair"];

/* ── Curation call ───────────────────────────────────────────────────────
   ASSUMED /api/evaluate contract (confirm against the real route):
     POST body : { brand, reference, year, condition, askingPrice, provenanceNote }
     response  : { score: number 0-100, decision: string, reasoning: string }
   Pass = decision is anything other than a clear rejection.
   Adjust the field reads below once the real route is confirmed. */
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

export default function SellFlow() {
  const [draft, setDraft] = useState<ListingDraft>(emptyDraft);
  const [step, setStep] = useState(0);

  function patch(p: Partial<ListingDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  return (
    <div className="space-y-6">
      <ProgressBar step={step} />

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="rounded-xl border border-white/10 bg-[#13151C] p-6">
          {step === 0 && (
            <CurationStep
              draft={draft}
              patch={patch}
              onPass={() => setStep(1)}
            />
          )}
          {step === 1 && <Stub title="Step 2 — Photos" note="Next: add the nine-category dropdown to PhotoUpload and wire the meter to it." />}
          {step === 2 && <Stub title="Step 3 — Listing Details" note="Next: the structured 17-field details form." />}
          {step === 3 && <Stub title="Step 4 — Seller Description" note="Next: 75-word field + AI validation + strike logic." />}
          {step === 4 && <Stub title="Step 5 — Review & Publish" note="Next: combined score, preview, Publish + Resend email." />}

          {step > 0 && (
            <div className="mt-6 flex justify-between">
              <button
                onClick={() => setStep(step - 1)}
                className="rounded-md border border-white/15 px-4 py-2 text-[13px] text-[#E8E4DC] hover:bg-white/5"
              >
                ← Back
              </button>
              {step < STEPS.length - 1 && (
                <button
                  onClick={() => setStep(step + 1)}
                  className="rounded-md bg-[#C9A84C] px-4 py-2 text-[13px] font-medium text-black hover:opacity-90"
                >
                  Next →
                </button>
              )}
            </div>
          )}
        </div>

        {/* Live score meter — fixed Part 1 once curation passes, Part 2 climbs */}
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
          <div
            className={`h-1 rounded-full ${
              i <= step ? "bg-[#C9A84C]" : "bg-white/10"
            }`}
          />
          <div
            className={`text-[11px] ${
              i === step ? "text-[#E8E4DC]" : "text-[#8A8F9E]"
            }`}
          >
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
          <input
            className={input}
            value={draft.brand}
            onChange={(e) => patch({ brand: e.target.value })}
            placeholder="Parmigiani Fleurier"
          />
        </div>
        <div>
          <label className={label}>Reference number</label>
          <input
            className={input}
            value={draft.reference}
            onChange={(e) => patch({ reference: e.target.value })}
            placeholder="PFC274-0000600"
          />
        </div>
        <div>
          <label className={label}>Year</label>
          <input
            className={input}
            value={draft.year}
            onChange={(e) => patch({ year: e.target.value })}
            placeholder="2021"
          />
        </div>
        <div>
          <label className={label}>Condition</label>
          <select
            className={input}
            value={draft.condition}
            onChange={(e) =>
              patch({ condition: e.target.value as Condition })
            }
          >
            <option value="">Select…</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Asking price (USD)</label>
          <input
            className={input}
            value={draft.askingPrice}
            onChange={(e) => patch({ askingPrice: e.target.value })}
            placeholder="7250"
            inputMode="numeric"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className={label}>Brief provenance note</label>
        <textarea
          className={`${input} min-h-[72px]`}
          value={draft.provenanceNote}
          onChange={(e) => patch({ provenanceNote: e.target.value })}
          placeholder="Bought from an authorized dealer; full set; one owner…"
        />
      </div>

      {draft.curationDecision === "fail" && (
        <div className="mt-4 rounded-md border border-red-500/30 bg-red-950/30 p-3 text-[13px] text-red-200">
          <div className="font-medium">Not a fit right now.</div>
          {draft.curationReasoning && (
            <div className="mt-1 text-red-200/90">{draft.curationReasoning}</div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 text-[13px] text-red-300">Error: {error}</div>
      )}

      <button
        onClick={check}
        disabled={!ready || busy}
        className="mt-5 rounded-md bg-[#C9A84C] px-5 py-2.5 text-[13px] font-medium text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Checking…" : "Check eligibility"}
      </button>
    </div>
  );
}

function Stub({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h2 className="text-[18px] font-medium text-[#E8E4DC]">{title}</h2>
      <p className="mt-2 text-[13px] text-[#8A8F9E]">{note}</p>
      <div className="mt-4 rounded-md border border-dashed border-white/15 p-4 text-[12px] text-[#8A8F9E]">
        Flow scaffold in place — this step's content is built next. Back / Next
        navigation and the live score meter already work.
      </div>
    </div>
  );
}
