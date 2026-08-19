"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { BRANDS_MODELS, type BrandModels } from "@/lib/brandsModels";
import { normalizeBrand, resolveTypedBrand } from "@/lib/brandIndex";
import { useBrandIndex } from "@/components/useBrandIndex";

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

/* One normalization, shared with the brand field — never a second copy. */
const normalize = normalizeBrand;

export default function ModelCombobox({
  value,
  onChange,
  onResolutionChange,
  brandName,
  inputClassName = "",
  placeholder = "",
  disabled = false,
  id,
}: {
  value: string;
  onChange: (model: string) => void;
  /** Empty and deliberate free text are valid; suggestion fragments are not. */
  onResolutionChange?: (resolved: boolean) => void;
  brandName: string;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const query = value;
  const [activeIdx, setActiveIdx] = useState(0);
  const [hasBlurred, setHasBlurred] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  /* The same authoritative, alias-aware index the brand field uses. */
  const index = useBrandIndex();

  /* Model arrays keyed by the CANONICAL brand each entry resolves to, rather
     than by whatever string this legacy corpus happens to store. That is the
     whole repair: "Victorinox Swiss Army" and "Sarpaneva Watches" are the
     Vault's own declared aliases for brands a seller can pick, so their
     models were unreachable purely because two fields disagreed about the
     name. Entries that resolve to nothing keep their own name as the key, so
     nothing is silently re-pointed; where two entries land on one canonical,
     the richer array wins rather than whichever was parsed last. */
  const modelsByBrand = useMemo(() => {
    const map = new Map<string, BrandModels>();
    for (const b of BRANDS_MODELS) {
      const resolved = resolveTypedBrand(b.name, index);
      const key = normalize(resolved.isCustom ? b.name : resolved.name);
      const held = map.get(key);
      if (!held || b.models.length > held.models.length) map.set(key, b);
    }
    return map;
  }, [index]);

  const brandEntry = useMemo(() => {
    const typed = normalize(brandName ?? "");
    if (!typed) return undefined;
    const canonical = normalize(resolveTypedBrand(brandName, index).name);
    // Canonical first; the raw name still resolves an off-corpus entry.
    return modelsByBrand.get(canonical) ?? modelsByBrand.get(typed);
  }, [brandName, index, modelsByBrand]);

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
  const commit = useCallback((selectedName: string) => {
    setOpen(false);
    setHasBlurred(false);
    onChange(selectedName);
  }, [onChange]);

  // Outside clicks close the list; a model suggestion is never selected on
  // the seller's behalf merely because it happened to be the remaining row.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function onInput(text: string) {
    setActiveIdx(0);
    setOpen(true);
    setHasBlurred(false);
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

  const effectivePlaceholder = isDisabled
    ? normalize(brandName ?? "") === ""
      ? "Select a brand first"
      : "Choose a complete brand first"
    : placeholder;
  const normalizedQuery = normalize(query);
  const isExactModel = normalizedModels.some((m) => m.displayNorm === normalizedQuery);
  const resolutionValid =
    query.trim() === "" ||
    isDisabled ||
    !hasModels ||
    isExactModel ||
    (normalizedQuery.length >= MIN_CHARS && matches.length === 0);
  const needsResolution = query.trim() !== "" && !resolutionValid;

  useEffect(() => {
    onResolutionChange?.(resolutionValid);
  }, [onResolutionChange, resolutionValid]);

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
        onBlur={() => {
          setHasBlurred(true);
          if (isExactModel) commit(query);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-invalid={needsResolution}
        autoComplete="off"
      />

      {open && matches.length > 0 && (
        <ul id={listboxId} className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] py-1 shadow-xl">
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
                    ? "bg-[var(--gold-whisper)] text-[var(--platinum)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasBlurred && needsResolution && (
        <p role="alert" className="mt-1 text-[11px] text-[var(--gold-subtle)]">
          Choose a complete model from the list, or type the full name of an unlisted model.
        </p>
      )}
    </div>
  );
}
