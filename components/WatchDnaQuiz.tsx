"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ARCHETYPES,
  QUESTIONS,
  scoreQuiz,
  type Archetype,
  type ArchetypeKey,
  type QuizOption,
} from "@/lib/watchDna";
import { buildBrowseBrandHref } from "@/lib/nav/browseCriteria";

type Props = {
  /**
   * Stored `listings.brand` values that currently have published inventory.
   * A pill becomes a link only for a brand in this set — see the availability
   * note on app/watch-dna/page.tsx. Empty set = every pill stays plain text.
   */
  availableBrands: string[];
  /** Result to restore on arrival, read from ?dna= by the page. */
  initialArchetype: ArchetypeKey | null;
};

/**
 * Replace ?dna= without a route transition. `replaceState` is router-
 * integrated in Next 16, so the URL, the history entry, and the Next router
 * stay in agreement — and `replace` (not `push`) keeps the Back button
 * pointing at wherever the collector came FROM, never at their own answers.
 */
function stampResultInUrl(key: ArchetypeKey | null) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (key) params.set("dna", key);
  else params.delete("dna");
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

export default function WatchDnaQuiz({ availableBrands, initialArchetype }: Props) {
  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState<QuizOption[]>([]);
  const [archetype, setArchetype] = useState<Archetype | null>(
    initialArchetype ? ARCHETYPES[initialArchetype] : null
  );

  /**
   * Pill label → stored brand value. Matching is case/whitespace-insensitive
   * so a curated pill spelling still finds its listings, but the href always
   * carries the STORED value, because Browse's Brand criterion is an exact
   * string match against `listings.brand`.
   */
  const brandLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const brand of availableBrands) {
      map.set(brand.trim().toLowerCase(), brand);
    }
    return map;
  }, [availableBrands]);

  function pick(option: QuizOption) {
    const next = [...chosen.slice(0, step), option];
    setChosen(next);
    if (step + 1 < QUESTIONS.length) {
      setStep(step + 1);
    } else {
      const scored = scoreQuiz(next);
      setArchetype(scored.archetype);
      stampResultInUrl(scored.archetype.key);
    }
  }

  function back() {
    if (step > 0) setStep(step - 1);
  }

  function restart() {
    setStep(0);
    setChosen([]);
    setArchetype(null);
    stampResultInUrl(null);
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
  if (archetype) {
    const a = archetype;
    return (
      <div className="rounded-xl border border-white/10 bg-[#13151C] p-7 text-center">
        <div className="text-[11px] uppercase tracking-[0.2em] text-[#8A8F9E]">
          Your Watch DNA
        </div>
        <div className="mt-2 text-[26px] font-semibold text-[#E8E4DC]">
          {a.name}
        </div>
        <div className="mt-1 text-[14px] italic text-[#C9A84C]">{a.tagline}</div>
        <p className="mt-4 text-center text-[14px] leading-relaxed text-[#B7BAC4]" style={{textAlign: 'center'}}>
          {a.description}
        </p>

        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-[0.15em] text-[#8A8F9E]">
            In your orbit
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {a.exampleBrands.map((b) => {
              /* A pill is a door only where the door leads somewhere. Brands
                 with no published inventory keep the exact pill that shipped
                 before — unavailable is not rendered as negative, so there is
                 no count, no dimming, and no "soon". */
              const stored = brandLookup.get(b.trim().toLowerCase());
              const pill =
                "rounded-full border border-white/10 px-3 py-1 text-[12px] text-[#E8E4DC]";

              if (!stored) {
                return (
                  <span key={b} className={pill}>
                    {b}
                  </span>
                );
              }

              return (
                <Link
                  key={b}
                  href={buildBrowseBrandHref(stored)}
                  aria-label={`Browse ${b} watches`}
                  className={`${pill} cursor-pointer transition-colors hover:border-[#C9A84C]/60 hover:text-[#C9A84C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A84C]`}
                >
                  {b}
                </Link>
              );
            })}
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
    <div className="rounded-xl border border-white/10 bg-[#13151C] p-7 text-center">
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
