"use client";

import { useState } from "react";
import { wordCount, type ListingDraft } from "@/lib/listing";
import { MIN_WORDS } from "@/lib/scoring";

export default function DescriptionStep({
  draft,
  patch,
  onProceed,
}: {
  draft: ListingDraft;
  patch: (p: Partial<ListingDraft>) => void;
  onProceed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [flag, setFlag] = useState<string | null>(null);
  const [hint, setHint] = useState("");

  const words = wordCount(draft.description);
  const enough = words >= MIN_WORDS;

  function onEdit(value: string) {
    // Any edit invalidates a prior pass and clears the current flag.
    patch({ description: value, descriptionPassedAI: null });
    if (flag) setFlag(null);
    if (hint) setHint("");
  }

  async function checkAndContinue() {
    setHint("");
    if (!enough) {
      setHint(`Add a little more — you're at ${words} of ${MIN_WORDS} words.`);
      return;
    }
    // Already passed and unchanged → no need to call the API again.
    if (draft.descriptionPassedAI === true) {
      onProceed();
      return;
    }
    setBusy(true);
    setFlag(null);
    try {
      const res = await fetch("/api/validate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: draft.description,
          watchContext: `${draft.brand} ${draft.reference} (${draft.year})`.trim(),
        }),
      });
      const { passed, reason } = await res.json();
      if (passed) {
        patch({ descriptionPassedAI: true });
        onProceed();
      } else {
        patch({ descriptionPassedAI: false });
        setFlag(reason || "This reads like generic or copied text. Add detail only you would know.");
      }
    } catch {
      setHint("Couldn't check just now — try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  function submitAnyway() {
    // Strike recorded ONLY here: a knowing push-through past a flag.
    patch({ strikes: draft.strikes + 1, descriptionPassedAI: false });
    onProceed();
  }

  const willBeThird = draft.strikes + 1 >= 3;

  return (
    <div>
      <h2 className="text-[18px] font-medium text-[#E8E4DC]">
        Step 4 — Your description
      </h2>
      <p className="mt-1 text-[13px] text-[#8A8F9E]">
        Tell us something only YOU could know about this watch — how it wears,
        why you bought it, a quirk, its history. {MIN_WORDS} words minimum.
      </p>

      <textarea
        value={draft.description}
        onChange={(e) => onEdit(e.target.value)}
        placeholder="I bought this from the original owner in Geneva in 2019. The Abyss Blue dial shifts from near-black to deep ocean in daylight — photos never quite catch it. Wears smaller than its 40mm because of the short lugs…"
        className="mt-4 min-h-[160px] w-full rounded-md border border-white/15 bg-[#0D0F14] px-3 py-2 text-[14px] leading-relaxed text-[#E8E4DC] placeholder:text-[#8A8F9E]/60 focus:border-[#C9A84C] focus:outline-none"
      />
      <div className={`mt-1 text-[12px] ${enough ? "text-[#8A8F9E]" : "text-[#C9A84C]"}`}>
        {words} / {MIN_WORDS} words
      </div>

      {hint && <div className="mt-2 text-[13px] text-[#C9A84C]">{hint}</div>}

      {flag && (
        <div
          className="mt-4 rounded-md border border-[#C9A84C]/40 bg-[#C9A84C]/10 p-4 text-center"
          style={{ textAlign: "center" }}
        >
          <div className="text-[13px] font-medium text-[#E8E4DC]">
            This needs another pass
          </div>
          <p
            className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-[#B7BAC4]"
            style={{ textAlign: "center" }}
          >
            {flag}
          </p>
          <p
            className="mx-auto mt-2 max-w-md text-[12px] text-[#8A8F9E]"
            style={{ textAlign: "center" }}
          >
            Revising is free and has no penalty. You can also submit as-is, which
            records a strike on your account
            {willBeThird ? " — this would be your 3rd." : "."}
          </p>
          <div className="mt-3 flex justify-center gap-3">
            <button
              onClick={() => setFlag(null)}
              className="rounded-md bg-[#C9A84C] px-4 py-2 text-[13px] font-medium text-black hover:opacity-90"
            >
              Revise it
            </button>
            <button
              onClick={submitAnyway}
              className="rounded-md border border-white/20 px-4 py-2 text-[13px] text-[#8A8F9E] hover:bg-white/5"
            >
              Submit anyway →
            </button>
          </div>
        </div>
      )}

      {!flag && (
        <button
          onClick={checkAndContinue}
          disabled={busy}
          className={`mt-5 flex items-center gap-2 rounded-md bg-[#C9A84C] px-5 py-2.5 text-[13px] font-medium text-black hover:opacity-90 disabled:opacity-40 ${
            busy ? "cursor-wait" : ""
          }`}
        >
          {busy && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
          )}
          {busy ? "Checking…" : "Check & continue →"}
        </button>
      )}
    </div>
  );
}
