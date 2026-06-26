"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BRANDS_MODELS, type BrandModels } from "@/lib/brandsModels";

/* ────────────────────────────────────────────────────────────────────────
   MODEL COMBOBOX — type-ahead over a brand's models from BRANDS_MODELS.

   Sibling to BrandCombobox. Behaviour keys off the brand passed in:
     • brand empty                     → disabled, "Select a brand first"
     • brand in JSON, has models       → type-ahead over display_name +
                                          search_aliases (normalized substring)
     • brand off-list, OR in JSON with → enabled free-text input, no dropdown
       no models (80 of them)
   Off-list models are always allowed — onChange reports whatever is typed.
   Same normalize() as BrandCombobox; single-match snaps on outside blur;
   Enter commits the active match and advances focus to the Reference field.
   ──────────────────────────────────────────────────────────────────────── */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]/g, ""); // drop spaces & punctuation
}

// Normalized brand-name → brand entry, built once.
const BRAND_INDEX = new Map<string, BrandModels>();
for (const b of BRANDS_MODELS) {
  BRAND_INDEX.set(normalize(b.name), b);
}

export default function ModelCombobox({
  value,
  onChange,
  brandName,
  inputClassName = "",
  placeholder = "",
  disabled = false,
  id,
}: {
  value: string;
  onChange: (model: string) => void;
  brandName: string;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep visible text in sync if the parent value changes externally.
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Resolve the brand entry from the JSON by normalized name.
  const brandEntry = useMemo(() => {
    const n = normalize(brandName ?? "");
    return n ? BRAND_INDEX.get(n) : undefined;
  }, [brandName]);

  const hasModels = !!brandEntry && brandEntry.models.length > 0;
  // Disabled only when no brand has been entered. A brand that's present but
  // off-list (or in-list with no models) → enabled free-text, no dropdown.
  const isDisabled = disabled || normalize(brandName ?? "") === "";

  // Pre-normalize this brand's models for matching (display_name + aliases).
  const normalizedModels = useMemo(() => {
    if (!brandEntry) return [];
    return brandEntry.models.map((m) => ({
      name: m.display_name,
      displayNorm: normalize(m.display_name),
      hay: [normalize(m.display_name), ...(m.search_aliases ?? []).map(normalize)],
    }));
  }, [brandEntry]);

  const MIN_CHARS = 2;

  const matches = useMemo(() => {
    if (!hasModels) return [];
    const q = normalize(query);
    if (q.length < MIN_CHARS) return [];

    const hit = normalizedModels.filter((m) =>m.hay.some((h) => q.length < 3 ? h.startsWith(q) : h.includes(q)));
    const prefix = hit.filter((m) => m.displayNorm.startsWith(q));
    const sub = hit.filter((m) => !m.displayNorm.startsWith(q));

    return [
      ...prefix.sort((a, b) => a.name.localeCompare(b.name)),
      ...sub.sort((a, b) => a.name.localeCompare(b.name)),
    ]
      .map((m) => m.name)
      .slice(0, 8);
  }, [query, hasModels, normalizedModels]);

  // Centralized selection update.
  function commit(selectedName: string) {
    setQuery(selectedName);
    setOpen(false);
    onChange(selectedName);
  }

  // Outside click + single-match blur snap (mirrors BrandCombobox).
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
    onChange(text);
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
      // Advance to the Reference field whether a match was committed or the
      // model was free-typed (already reported via onInput).
      document.getElementById("reference")?.focus();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const effectivePlaceholder = isDisabled ? "Select a brand first" : placeholder;

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        className={inputClassName}
        value={query}
        placeholder={effectivePlaceholder}
        disabled={isDisabled}
        onChange={(e) => onInput(e.target.value)}
        onFocus={() => setOpen(true)}
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
                className={`block w-full px-3 py-1.5 text-left text-[13px] ${
                  i === activeIdx
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
    </div>
  );
}
