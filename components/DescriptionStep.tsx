"use client";

import { useState } from "react";
import { wordCount, type ListingDraft } from "@/lib/listing";
import { MIN_WORDS } from "@/lib/scoring";
import WatchSpinner from "@/components/WatchSpinner";

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
      if (!res.ok) {
        setHint(
          `Validation request failed (HTTP ${res.status}). The /api/validate-description route may not be deployed.`
        );
        return;
      }
      const data = await res.json();
      if (data.error) {
        setHint(
          `Validation service error (${data.error}${
            data.status ? " " + data.status : ""
          })${data.detail ? ": " + data.detail : ""}`
        );
        return;
      }
      const { passed, reason } = data;
      if (passed) {
        patch({ descriptionPassedAI: true });
        onProceed();
      } else {
        patch({ descriptionPassedAI: false });
        setFlag(reason || "This reads like generic or copied text. Add detail only you would know.");
      }
    } catch (e) {
      setHint(
        `Couldn't reach the validator: ${e instanceof Error ? e.message : "unknown error"}.`
      );
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
      <h2 className="font-display text-[20px] font-light text-[var(--platinum)]">
        Step 4 — Your description
      </h2>
      <p className="mt-1 text-[13px] text-[var(--muted)]">
        Tell us something only YOU could know about this watch — how it wears,
        why you bought it, a quirk, its history. {MIN_WORDS} words minimum.
      </p>

      <textarea
        value={draft.description}
        onChange={(e) => onEdit(e.target.value)}
        placeholder="I bought this from the original owner in Geneva in 2019. The Abyss Blue dial shifts from near-black to deep ocean in daylight — photos never quite catch it. Wears smaller than its 40mm because of the short lugs…"
        className="mt-4 min-h-[160px] w-full resize-none border-b border-[var(--border-mid)] bg-transparent px-0 py-2 text-[14px] leading-relaxed text-[var(--platinum)] placeholder:text-[var(--void)] focus:border-[var(--gold)] focus:outline-none"
        spellCheck={true}
      />
      <div className={`mt-1 text-[12px] ${enough ? "text-[var(--muted)]" : "text-[var(--gold)]"}`}>
        {words} / {MIN_WORDS} words
      </div>

      {hint && <div className="mt-2 text-[13px] text-[var(--gold)]">{hint}</div>}

      {flag && (
        <div className="mt-4 border border-[var(--border-gold)] bg-[var(--gold-whisper)] p-4 text-center">
          <div className="text-[13px] font-medium text-[var(--platinum)]">
            This needs another pass
          </div>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-[var(--slate)]">
            {flag}
          </p>
          <p className="mx-auto mt-2 max-w-md text-[12px] text-[var(--muted)]">
            Revising is free and has no penalty. You can also submit as-is, which
            records a strike on your account
            {willBeThird ? " — this would be your 3rd." : "."}
          </p>
          <div className="mt-3 flex justify-center gap-3">
            <button
              onClick={() => setFlag(null)}
              className="bg-[var(--gold)] px-5 py-[13px] text-[9px] font-normal uppercase tracking-[2.5px] text-[var(--ink)] hover:opacity-90"
            >
              Revise it
            </button>
            <button
              onClick={submitAnyway}
              className="border border-[var(--border-subtle)] px-4 py-2 text-[13px] text-[var(--muted)] hover:bg-white/5"
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
          className={`mt-5 flex items-center gap-2 bg-[var(--gold)] px-5 py-[13px] text-[9px] font-normal uppercase tracking-[2.5px] text-[var(--ink)] hover:opacity-90 disabled:opacity-40 ${
            busy ? "cursor-wait" : ""
          }`}
        >
          {busy && <WatchSpinner size={16} />}
          {busy ? "Checking…" : "Check & continue →"}
        </button>
      )}
    </div>
  );
}
