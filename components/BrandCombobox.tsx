"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WATCH_BRANDS } from "@/lib/brands";

/* ────────────────────────────────────────────────────────────────────────
   BRAND COMBOBOX — type-ahead over the verified WATCH_BRANDS list.

   Permissive-with-nudge: filtering steers hard toward the curated list, but
   a seller may still submit an off-list brand (e.g. an obscure/historic piece
   not yet catalogued). When the current value doesn't exactly match a known
   brand, onChange reports isCustom=true so the listing can be flagged for
   review (custom_brand_flag) rather than silently fragmenting brand data.

   Matching is normalized: case-insensitive, accent-stripped, and punctuation/
   space-insensitive — so "moser" → "H. Moser & Cie.", "fp journe" →
   "F.P. Journe", "girard perregaux" → "Girard-Perregaux". Verified 12/12
   against the real list before this component was written.

   Custom (not native <select>) so the open list can be filtered and styled —
   the whole reason native couldn't do this.
   ──────────────────────────────────────────────────────────────────────── */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]/g, ""); // drop spaces & punctuation
}

const NORMALIZED_BRANDS = WATCH_BRANDS.map((b) => ({ name: b, norm: normalize(b) }));

function isKnownBrand(value: string): boolean {
  const n = normalize(value);
  return NORMALIZED_BRANDS.some((b) => b.norm === n);
}

export default function BrandCombobox({
  value,
  onChange,
  placeholder = "Start typing a brand…",
  inputClassName = "",
}: {
  value: string;
  /** Reports the chosen text and whether it's off the verified list. */
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

  const MIN_CHARS = 2;

  const matches = useMemo(() => {
    const q = normalize(query);
    if (q.length < MIN_CHARS) return [];

    const prefix = NORMALIZED_BRANDS.filter((b) => b.norm.startsWith(q));
    const sub = NORMALIZED_BRANDS.filter((b) => b.norm.includes(q) && !b.norm.startsWith(q));

    return [...prefix.sort((a,b) => a.name.localeCompare(b.name)), 
            ...sub.sort((a,b) => a.name.localeCompare(b.name))]
      .map((b) => b.name)
      .slice(0, 8);
  }, [query]);

  // Centralized selection update function
  function commit(selectedName: string) {
    setQuery(selectedName);
    setOpen(false);
    onChange(selectedName, !isKnownBrand(selectedName));
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
  }, [matches, activeIdx]);

  function onInput(text: string) {
    setQuery(text);
    setActiveIdx(0);
    setOpen(true);
    onChange(text, text.trim() !== "" && !isKnownBrand(text));
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

  const normLen = normalize(query).length;
  const needsMoreChars = query.trim() !== "" && normLen > 0 && normLen < MIN_CHARS;
  const showCustomHint =
    normLen >= MIN_CHARS && matches.length === 0 && !isKnownBrand(query);

  return (
    <div ref={wrapRef} className="relative">
      <input
        className={inputClassName}
        value={query}
        placeholder={placeholder}
        onChange={(e) => onInput(e.target.value)}
        onFocus={(e) => {
          setOpen(true);
          if (isKnownBrand(query)) {
            e.target.select();
          }
        }}
        onBlur={() => {
          if (matches.length === 1) {
            commit(matches[0]);
          } else if (isKnownBrand(query)) {
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