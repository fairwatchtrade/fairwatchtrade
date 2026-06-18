"use client";

import { useState } from "react";
import {
  QUESTIONS,
  scoreQuiz,
  type QuizOption,
  type QuizResult,
} from "@/lib/watchDna";

export default function WatchDnaQuiz() {
  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState<QuizOption[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);

  function pick(option: QuizOption) {
    const next = [...chosen.slice(0, step), option];
    setChosen(next);
    if (step + 1 < QUESTIONS.length) {
      setStep(step + 1);
    } else {
      setResult(scoreQuiz(next));
    }
  }

  function back() {
    if (step > 0) setStep(step - 1);
  }

  function restart() {
    setStep(0);
    setChosen([]);
    setResult(null);
  }

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Watch DNA",
          text: "What's your Watch DNA?",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      /* user dismissed share sheet — ignore */
    }
  }

  /* ── Result screen ─────────────────────────────────────────────────── */
  if (result) {
    const a = result.archetype;
    return (
      <div className="rounded-xl border border-white/10 bg-[#13151C] p-7 text-center">
        <div className="text-[11px] uppercase tracking-[0.2em] text-[#8A8F9E]">
          Your Watch DNA
        </div>
        <div className="mt-2 text-[26px] font-semibold text-[#E8E4DC]">
          {a.name}
        </div>
        <div className="mt-1 text-[14px] italic text-[#C9A84C]">{a.tagline}</div>
        <p className="mx-auto mt-4 max-w-md text-center text-[14px] leading-relaxed text-[#B7BAC4]">
          {a.description}
        </p>

        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-[0.15em] text-[#8A8F9E]">
            In your orbit
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {a.exampleBrands.map((b) => (
              <span
                key={b}
                className="rounded-full border border-white/10 px-3 py-1 text-[12px] text-[#E8E4DC]"
              >
                {b}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-7 flex justify-center gap-3">
          <button
            onClick={share}
            className="rounded-md bg-[#C9A84C] px-4 py-2 text-[13px] font-medium text-black hover:opacity-90"
          >
            Share
          </button>
          <button
            onClick={restart}
            className="rounded-md border border-white/15 px-4 py-2 text-[13px] text-[#E8E4DC] hover:bg-white/5"
          >
            Retake
          </button>
        </div>
      </div>
    );
  }

  /* ── Question screen ───────────────────────────────────────────────── */
  const q = QUESTIONS[step];
  return (
    <div className="rounded-xl border border-white/10 bg-[#13151C] p-7">
      <div className="flex items-center justify-between text-[11px] text-[#8A8F9E]">
        <span>
          Question {step + 1} of {QUESTIONS.length}
        </span>
        {step > 0 && (
          <button onClick={back} className="hover:text-[#E8E4DC]">
            ← Back
          </button>
        )}
      </div>

      {/* progress */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[#C9A84C] transition-all duration-300"
          style={{ width: `${(step / QUESTIONS.length) * 100}%` }}
        />
      </div>

      <h2 className="mt-5 text-[19px] font-medium leading-snug text-[#E8E4DC]">
        {q.prompt}
      </h2>
      {q.subtext && (
        <p className="mt-2 text-[13px] italic leading-relaxed text-[#8A8F9E]">
          {q.subtext}
        </p>
      )}

      <div className="mt-5 space-y-2.5">
        {q.options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => pick(opt)}
            className="w-full rounded-lg border border-white/12 px-4 py-3 text-left text-[14px] text-[#E8E4DC] transition-colors hover:border-[#C9A84C] hover:bg-white/5"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
