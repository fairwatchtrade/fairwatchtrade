"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  matchBrands,
  normalizeBrand,
  resolveTypedBrand,
  MIN_BRAND_CHARS,
} from "@/lib/brandIndex";
import { useBrandIndex } from "@/components/useBrandIndex";

/* ────────────────────────────────────────────────────────────────────────
   BRAND COMBOBOX — type-ahead over the platform's brand corpus.

   The corpus is composed at read time by lib/brandIndex.ts from the curated
   static list AND the live Vault brand table — the same table the phone
   wizard and the Galaxy read. The static list renders immediately and is
   the floor: if the Vault query fails, the field degrades to exactly the
   list it has always had, never to an empty one.

   Permissive-with-nudge, unchanged: filtering steers hard toward the
   corpus, but a seller may still submit an off-corpus brand. When the text
   doesn't resolve to a known brand, onChange reports isCustom=true so the
   listing is flagged for review (custom_brand_flag) rather than silently
   fragmenting brand data. This field recognizes brands; it never decides
   admission.

   Matching is normalized — case-insensitive, accent-stripped, and
   punctuation/space-insensitive — and widened by the Vault's aliases, so
   "moser" → "H. Moser & Cie.", "fp journe" → "F.P. Journe", and "jlc" →
   "Jaeger-LeCoultre". An alias never appears as its own row, and a name
   that is itself a brand is never rewritten into another one.

   Custom (not native <select>) so the open list can be filtered and styled —
   the whole reason native couldn't do this.
   ──────────────────────────────────────────────────────────────────────── */

export default function BrandCombobox({
  value,
  onChange,
  placeholder = "Start typing a brand…",
  inputClassName = "",
}: {
  value: string;
  /** Reports the chosen text and whether it's off the corpus. */
  onChange: (value: string, isCustom: boolean) => void;
  placeholder?: string;
  inputClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep the visible text in sync if the parent value changes externally.
  useEffect(() => {
    setQuery(value);
  }, [value]);

  /* The shared index — the same object the model field beside this one
     reads, so the two can never disagree about what a brand is. */
  const index = useBrandIndex();

  const matches = useMemo(() => matchBrands(query, index), [query, index]);

  // Centralized selection update function
  function commit(selectedName: string) {
    const resolved = resolveTypedBrand(selectedName, index);
    setQuery(resolved.name);
    setOpen(false);
    onChange(resolved.name, resolved.isCustom);
  }

  // Handle outside click + auto-correct snap fill logic
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        if (matches.length === 1) {
          const idx = activeIdx >= 0 && activeIdx < matches.length ? activeIdx : 0;
          commit(matches[idx]);
        } else {
          setOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [matches, activeIdx, index]);

  function onInput(text: string) {
    setQuery(text);
    setActiveIdx(0);
    setOpen(true);
    // Report the text exactly as typed — resolution happens on commit, so the
    // caret is never fought mid-keystroke.
    onChange(text, resolveTypedBrand(text, index).isCustom);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && matches[activeIdx]) {
        e.preventDefault();
        commit(matches[activeIdx]);
      }
      document.getElementById("model")?.focus();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const resolved = resolveTypedBrand(query, index);
  const isKnown = !resolved.isCustom && normalizeBrand(query) !== "";
  const normLen = normalizeBrand(query).length;
  const needsMoreChars =
    query.trim() !== "" && normLen > 0 && normLen < MIN_BRAND_CHARS;
  const showCustomHint =
    normLen >= MIN_BRAND_CHARS && matches.length === 0 && !isKnown;

  return (
    <div ref={wrapRef} className="relative">
      <input
        className={inputClassName}
        value={query}
        placeholder={placeholder}
        onChange={(e) => onInput(e.target.value)}
        onFocus={(e) => {
          setOpen(true);
          if (isKnown) {
            e.target.select();
          }
        }}
        onBlur={() => {
          if (matches.length === 1) {
            commit(matches[0]);
          } else if (isKnown) {
            commit(query);
          }
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
      />

      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-white/15 bg-[#0D0F14] py-1 shadow-xl">
          {matches.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(name);
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className={`block w-full px-3 py-1.5 text-left text-[13px] ${i === activeIdx
                    ? "bg-[#C9A84C]/15 text-[#E8E4DC]"
                    : "text-[#B7BAC4] hover:bg-white/5"
                  }`}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {needsMoreChars && (
        <p className="mt-1 text-[11px] text-[#8A8F9E]">
          Keep typing to search brands…
        </p>
      )}

      {showCustomHint && (
        <div className="mt-1 rounded-md border border-[#C9A84C]/25 bg-[#C9A84C]/5 px-3 py-2">
          <div className="text-[11px] font-medium text-[#C9A84C]">
            Rare or independent brand
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-[#8A8F9E]">
            “{query.trim()}” isn’t on our standard index — submit it and our
            curation desk will verify the piece during review.
          </div>
        </div>
      )}
    </div>
  );
}
