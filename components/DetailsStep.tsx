"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { type ListingDraft, type ListingDetails } from "@/lib/listing";
import { type DocumentationStatus } from "@/lib/scoring";
import {
  requirementProfileFor,
  governDocumentation,
  admissionBoxIncluded,
  unclassifiedComponents,
  fullSetSupportable,
  COMPONENT_KEYS,
  COMPONENT_LABELS,
  COMPONENT_REPRESENTATIONS,
  REPRESENTATION_LABELS,
  PACKAGING_CLASSIFICATIONS,
  PACKAGING_LABELS,
  PACKAGING_DESCRIPTIONS,
  ADMISSION_STOPS,
  type AdmissionState,
  type ComponentRepresentation,
} from "@/lib/admission/requirementProfile";
import WatchSpinner from "@/components/WatchSpinner";
import { formatMovementFrequency, vphInputDigits } from "@/lib/movementFrequency";

/* Digits while editing, presentation at rest. The stored draft value is
   always bare digits (or a legacy string being progressively cleaned as the
   seller edits it) — commas, "vph", and the Hz note exist only on screen. */
function MovementFrequencyInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      className={className}
      value={focused ? value : formatMovementFrequency(value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => onChange(vphInputDigits(e.target.value))}
      placeholder="28,800 vph (4 Hz)"
      inputMode="numeric"
      spellCheck={false}
    />
  );
}

const MOVEMENT_TYPES = ["Automatic", "Manual Wind", "Quartz"];
const CLOSURE_TYPES = [
  "Pin Buckle",
  "Folding / Deployant Clasp",
  "None / Strap Only",
  "Other",
];
const CASEBACK_TYPES = ["Solid", "Exhibition / Display", "Other"];
const CRYSTAL_MATERIALS = ["Sapphire", "Hesalite / Acrylic", "Mineral", "Other"];
const CASE_MATERIALS = [
  "Stainless Steel",
  "18k Yellow Gold",
  "18k White Gold",
  "18k Rose Gold",
  "Platinum",
  "Titanium",
  "Two-Tone",
  "Ceramic",
  "Bronze",
];
const BEZEL_MATERIALS = ["Steel", "Ceramic", "Gold", "Platinum", "Titanium", "Other"];
const WATER_RESISTANCE_OPTIONS = ["30 m", "50 m", "100 m", "200 m", "300 m+", "Not Rated"];
/* Documentation summary status is DERIVED from the "Included with Watch" checklist
   (Jason ruling 2026-07-21) — no separate input, so it can never contradict the
   itemized list. papers = Papers OR Warranty Card (a warranty card IS ownership
   evidence collectors call "papers"); a Manual / Booklet is literature and does
   NOT independently count as papers. Everything downstream (scoring DOC_POINTS,
   listing badges, purchase-request "Included" row, browse facets) keeps reading
   details.documentation unchanged — now guaranteed consistent with the checklist. */
function deriveDocumentation(included: string[]): DocumentationStatus {
  const hasPapers = included.includes("Papers") || included.includes("Warranty Card");
  const hasBox = included.includes("Box");
  if (hasBox && hasPapers) return "Full Set";
  if (hasPapers) return "Papers Only";
  if (hasBox) return "Box Only";
  return "Watch Only";
}
const INCLUDED = [
  "Box",
  "Extra Links",
  "Hang Tags",
  "Manual / Booklet",
  "Papers",
  "Service Receipt",
  "Travel Case",
  "Warranty Card",
];
const COMPLICATIONS = [
  "Annual Calendar",
  "Center Seconds",
  "Chronograph",
  "Date",
  "Day-Date",
  "GMT / Dual Time",
  "Minute Repeater",
  "Moonphase",
  "Perpetual Calendar",
  "Power Reserve",
  "Small Seconds",
  "Tourbillon",
  "World Time",
];
/* Service EVENTS alphabetized; the case-treatment PAIR (Polished / Unpolished)
   is deliberately grouped LAST — out of pure alphabetical order on purpose — so
   the mutually-exclusive pair reads together on its own line (Jason 2026-07-20).
   Do not re-sort into strict alphabetical. */
const SERVICE = [
  "Never Serviced",
  "Recently Serviced",
  "Serviced by Independent",
  "Serviced by Manufacturer",
  "Polished",
  "Unpolished / Original",
];
const DIAL_COLOR_SUGGESTIONS = [
  "Black", "White", "Silver", "Blue", "Champagne", "Green",
  "Grey", "Salmon", "Brown", "Burgundy", "Ivory", "Cream",
  "Anthracite", "Slate", "Chocolate", "Navy", "Abyss Blue",
  "Sunburst Blue", "Sunburst Grey", "Mother of Pearl", "Meteorite",
];

/* Mutual-exclusion rules for Service/repair history (option (b) — expressive):
   - "Never serviced" contradicts every service claim → clears all three.
   - "Serviced by manufacturer" ⊗ "Serviced by independent" — one who per service;
     each clears the other AND clears "Never serviced".
   - "Recently serviced" may coexist with a who (e.g. "recently serviced by an
     independent"), so it only clears "Never serviced".
   - "Polished" ⊗ "Unpolished / original" — case-finish contradiction.
   Note: Group A (service) and Group B (polish) are independent, so e.g.
   "Never serviced" + "Unpolished / original" remains a valid combo. */
const SERVICE_EXCLUSIONS: Record<string, string[]> = {
  "Never Serviced": [
    "Serviced by Manufacturer",
    "Serviced by Independent",
    "Recently Serviced",
  ],
  "Serviced by Manufacturer": ["Never Serviced", "Serviced by Independent"],
  "Serviced by Independent": ["Never Serviced", "Serviced by Manufacturer"],
  "Recently Serviced": ["Never Serviced"],
  "Polished": ["Unpolished / Original"],
  "Unpolished / Original": ["Polished"],
};

/* ── CROSS-GROUP contradictions (Section VI) ─────────────────────────────
   SERVICE_EXCLUSIONS above governs contradictions WITHIN the service list and
   resolves them by CLEARING. That is right there: the options are alternative
   answers to one question, so choosing one plainly retracts the other.

   Across the two Section VI groups it is not right. "Included with watch" and
   "Service, repair & case history" are two separate factual claims the seller
   made deliberately in two places. Silently dropping one would decide on their
   behalf which is true, and they would never know it happened. These are named
   and surfaced instead, and the seller resolves them.

   Bounded audit of the four categories called for, against the real option
   lists: `Never Serviced` vs serviced-status, provider-without-service, and
   Polished vs Unpolished are ALL already governed intra-group by
   SERVICE_EXCLUSIONS. Documentary evidence contradicting declared history was
   the only category unguarded, and `Service Receipt` is the only entry in
   INCLUDED that asserts a service occurred — Warranty Card, Papers, Manual and
   the rest carry no service claim. Hence exactly one rule. Adding more would
   mean inventing contradictions the option lists do not actually contain. */
const CROSS_GROUP_CONTRADICTIONS: {
  included: string;
  service: string;
  why: string;
}[] = [
  {
    included: "Service Receipt",
    service: "Never Serviced",
    why: "a service receipt is documentary evidence that a service happened, which cannot be true of a watch that has never been serviced",
  },
];

const inputCls =
  "w-full border-b border-[rgba(201,168,76,0.40)] bg-transparent px-2 py-2 text-[14px] text-[var(--platinum)] placeholder:text-[var(--void)] focus-visible:border-[var(--gold)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-gold)] focus:border-[var(--gold)] focus:outline-none transition";
const labelCls = "mb-1 block text-[11px] uppercase tracking-[1.6px] text-[var(--muted)]";

/* Final Review support type — the shape the /api/validate-provenance route
   returns when it has near-certain corrections to offer. */
type ProvenanceReview = { corrected: string; issues: string[] };

/* Word-level LCS diff between the seller's original note and the corrected
   note. Returns ordered segments (including whitespace) with a `changed` flag
   so Final Review can gild ONLY the tokens that actually changed. The full
   corrected string is always reconstructed from these segments — if the diff
   ever mis-aligns, the worst case is a cosmetic over/under-highlight, never a
   lost or altered word. Splitting on (\s+) keeps whitespace as its own tokens
   so exact spacing is preserved on reassembly. */
function diffSegments(
  original: string,
  corrected: string
): { text: string; changed: boolean }[] {
  const a = original.split(/(\s+)/);
  const b = corrected.split(/(\s+)/);
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i:] and b[j:]
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: { text: string; changed: boolean }[] = [];
  let i = 0;
  let j = 0;
  while (j < m) {
    if (i < n && a[i] === b[j]) {
      out.push({ text: b[j], changed: false });
      i++;
      j++;
    } else if (i < n && dp[i + 1][j] >= dp[i][j + 1]) {
      // token present only in the original — a deletion; advance original.
      i++;
    } else {
      // token present only in the corrected — an insertion/change; gild it.
      out.push({ text: b[j], changed: true });
      j++;
    }
  }
  return out;
}

/* TypeaheadField — generalized from the original DialColorField (v1.x, one
   field only). Now backs 8 fields total: Dial Color (unchanged behavior) plus
   the 7 fields converted in this polish pass. Type to filter, click a
   suggestion, free text always works — suggestions are sugar, never a hard
   constraint. One shared component so the 7 conversions can't drift apart
   from each other over time.

   `otherOption` is used by exactly one field (Case Material): an optional
   pinned row appended below the filtered suggestions. Selecting it does NOT
   set the field's value via onChange — it calls onSelect(), so the parent can
   run its own "enter Other mode" logic exactly as the original <select>'s
   "Other…" menu item did. This preserves the original two-step Case Material
   UX (typeahead OR a dedicated custom-entry input) rather than assuming free
   text alone is an equivalent replacement for it. */
function TypeaheadField({
  value,
  onChange,
  suggestions,
  placeholder,
  maxSuggestions = 6,
  otherOption,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  maxSuggestions?: number;
  otherOption?: { label: string; onSelect: () => void };
}) {
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return suggestions.slice(0, maxSuggestions);
    return suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, maxSuggestions);
  }, [value, suggestions, maxSuggestions]);

  const showMenu = focused && (filtered.length > 0 || !!otherOption);
  // Rows in render order: filtered suggestions, then the optional pinned row.
  const rowCount = filtered.length + (otherOption ? 1 : 0);

  /* After a KEYBOARD selection, advance to the next visible field — the power-user
     flow Brand/Model already give. Mouse clicks do NOT advance; only Enter does.
     Global query is safe: only the current step is mounted, and the menu has
     unmounted by the time the rAF fires. */
  function advanceFocus() {
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      const fields = Array.from(
        document.querySelectorAll<HTMLElement>(
          "input:not([disabled]), select:not([disabled]), textarea:not([disabled])"
        )
      ).filter((f) => f.offsetParent !== null);
      const i = fields.indexOf(el);
      if (i >= 0 && i + 1 < fields.length) fields[i + 1].focus();
    });
  }

  // idx into the combined [ ...filtered, otherOption? ] row list.
  function commitRow(idx: number, advance: boolean) {
    if (otherOption && idx === filtered.length) {
      otherOption.onSelect();
    } else if (filtered[idx] !== undefined) {
      onChange(filtered[idx]);
    } else {
      return;
    }
    setFocused(false);
    if (advance) advanceFocus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!showMenu) return; // a closed combobox behaves like a plain input
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, rowCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // Core fix: Enter selects the highlighted option and NEVER submits the step.
      e.preventDefault();
      commitRow(activeIdx, true);
    } else if (e.key === "Tab") {
      /* Tab commits the highlighted suggestion before leaving. The trap this
         closes (production, 2026-08-01): type "s" expecting Stainless Steel,
         hit Tab instead of Enter, and the field keeps a bare "s" — a typo
         stored as Case Material. Commit only when the seller actually typed
         a query and the highlight is a real suggestion (never the pinned
         Other row), and do NOT preventDefault — Tab's own focus move is the
         point, so no advanceFocus either. An untouched field tabbed past
         stays honestly empty. */
      if (value.trim() !== "" && filtered[activeIdx] !== undefined) {
        commitRow(activeIdx, false);
      }
    } else if (e.key === "Escape") {
      setFocused(false);
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className={inputCls}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setActiveIdx(0); // typing re-highlights the first match
        }}
        onFocus={() => {
          setFocused(true);
          setActiveIdx(0);
        }}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
      />
      {showMenu && (
        <div className="absolute z-10 mt-1 w-full border border-[var(--border-mid)] bg-[var(--ink)]">
          {filtered.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commitRow(i, false);
              }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`block w-full px-3 py-2 text-left text-[13px] ${
                i === activeIdx
                  ? "bg-[var(--gold-whisper)] text-[var(--platinum)]"
                  : "text-[var(--platinum)] hover:bg-[var(--gold-whisper)]"
              }`}
            >
              {s}
            </button>
          ))}
          {otherOption && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commitRow(filtered.length, false);
              }}
              onMouseEnter={() => setActiveIdx(filtered.length)}
              className={`block w-full border-t border-[var(--border-faint)] px-3 py-2 text-left text-[13px] italic ${
                activeIdx === filtered.length
                  ? "bg-[var(--gold-whisper)] text-[var(--platinum)]"
                  : "text-[var(--muted)] hover:bg-[var(--gold-whisper)] hover:text-[var(--platinum)]"
              }`}
            >
              {otherOption.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function DetailsStep({
  draft,
  patch,
  onProceed,
}: {
  draft: ListingDraft;
  patch: (p: Partial<ListingDraft>) => void;
  /* DetailsStep owns its own async-gated Continue (like DescriptionStep): the
     shared SellFlow Continue is suppressed on this step, and advancing runs
     through the Final Review gate below. onProceed() moves to the next step. */
  onProceed: () => void;
}) {
  const d = draft.details;
  const set = <K extends keyof ListingDetails>(key: K, val: ListingDetails[K]) =>
    patch({ details: { ...d, [key]: val } });

  /* ── Brand admission (Rolex Admission Design Gate v1) ──────────────────
     The identified watch supplies the requirement profile; null means the
     standard path and none of the admission UI below renders. Admission
     writes re-govern the derived documentation status in the same patch: a
     packaging change can grant or withdraw "Full Set", and the summary
     status must never lag the claim that supports it. */
  const profile = requirementProfileFor(draft.brand);
  const admission = d.admission;
  const setAdmission = (p: Partial<AdmissionState>) => {
    const next = { ...admission, ...p };
    const included = d.includedWithWatch ?? [];
    patch({
      details: {
        ...d,
        admission: next,
        documentation: governDocumentation(
          deriveDocumentation(included),
          profile,
          next,
          included
        ),
      },
    });
  };
  const admissionUnclassified = profile ? unclassifiedComponents(admission) : [];
  const admissionPackagingMissing =
    !!profile && admissionBoxIncluded(d.includedWithWatch) && !admission?.packaging;
  const admissionHolds =
    admissionUnclassified.length > 0 || admissionPackagingMissing;

  const knownMaterials = CASE_MATERIALS;
  const materialIsCustom =
    !!d.caseMaterial && !knownMaterials.includes(d.caseMaterial);
  const [otherMaterial, setOtherMaterial] = useState(materialIsCustom);

  // ── Final Review (soft AI pass on the provenance note at Continue time) ──
  // `reviewing` = API call in flight; `review` non-null = suggestions to show.
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState<ProvenanceReview | null>(null);
  const provenanceRef = useRef<HTMLTextAreaElement | null>(null);

  // The seller clicks Continue out of Details. An empty note advances at once
  // (nothing to review). A non-empty note is checked by /api/validate-provenance;
  // suggestions pause here for the seller's choice, a clean note advances
  // silently. FAIL OPEN on any error — a network hiccup must never trap a seller
  // on this step.
  async function handleContinue() {
    const note = (draft.provenanceNote ?? "").trim();
    if (note.length === 0) {
      onProceed();
      return;
    }
    setReviewing(true);
    try {
      const res = await fetch("/api/validate-provenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provenanceNote: draft.provenanceNote }),
      });
      if (!res.ok) {
        onProceed(); // fail open
        return;
      }
      const data = await res.json();
      if (data?.hasSuggestions === true && typeof data.corrected === "string") {
        setReview({
          corrected: data.corrected,
          issues: Array.isArray(data.issues)
            ? data.issues.filter((x: unknown): x is string => typeof x === "string")
            : [],
        });
        // Do NOT advance — the seller chooses from the Final Review actions.
      } else {
        onProceed(); // no issues found
      }
    } catch {
      onProceed(); // fail open
    } finally {
      setReviewing(false);
    }
  }

  // Apply the corrected note, then advance. The original is only ever replaced
  // by the seller's explicit choice here — never silently.
  function applySuggestions() {
    if (review) patch({ provenanceNote: review.corrected });
    setReview(null);
    onProceed();
  }

  // Keep the seller's note exactly as written, then advance.
  function continueAsWritten() {
    setReview(null);
    onProceed();
  }

  // Dismiss the review and return the seller to their note. Does not advance.
  function goBack() {
    setReview(null);
    requestAnimationFrame(() => provenanceRef.current?.focus());
  }

  return (
    <div>
      <h2 className="font-display text-[20px] font-light text-[var(--platinum)]">
        Step 3 — Listing details
      </h2>
      <p className="mt-1 text-[13px] text-[var(--muted)]">
        The specifics collectors look for. Optional fields are marked — skip what
        you can&apos;t confirm rather than guessing.
      </p>

      {/* ─────────────────────────────────────────────────────────────
          I · The Watch Itself
          What's inside before anything else. Movement first, always. */}
      <Chapter numeral="I" title="The Watch Itself" caption="Movement and mechanical details." chapterKey="movement">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Movement type">
            <TypeaheadField
              value={d.movementType ?? ""}
              onChange={(v) => set("movementType", v)}
              suggestions={MOVEMENT_TYPES}
              placeholder="Automatic"
            />
          </Field>

          <Field label="Movement frequency (optional)">
            {/* Digits in, presentation out (Layout order 2026-08-01): the
                seller types 28000; at rest the field shows "28,000 vph" —
                comma, unit, and the exact-only Hz are formatting, never
                stored. On focus the raw digits return for editing. */}
            <MovementFrequencyInput
              className={inputCls}
              value={d.movementFrequency ?? ""}
              onChange={(v) => set("movementFrequency", v)}
            />
          </Field>

          <Field label="Calibre / movement reference (optional)">
            <input className={inputCls} value={d.calibre ?? ""} onChange={(e) => set("calibre", e.target.value)} placeholder="e.g. Cal. 1020, Calibre 89" spellCheck={false} />
          </Field>

          <Field label="Jewel count (optional)">
            <input className={inputCls} value={d.jewels ?? ""} onChange={(e) => set("jewels", e.target.value)} placeholder="25" inputMode="numeric" />
          </Field>

          <Field label="Power reserve (optional)">
            <input className={inputCls} value={d.powerReserve ?? ""} onChange={(e) => set("powerReserve", e.target.value)} placeholder="e.g. 8 days, 72 hours" />
          </Field>
        </div>
      </Chapter>

      {/* ─────────────────────────────────────────────────────────────
          II · The Case
          The object's physical presence. */}
      <Chapter numeral="II" title="The Case" caption="Case dimensions and materials." chapterKey="case">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Case size (mm)">
            <input className={inputCls} value={d.caseSizeMm ?? ""} onChange={(e) => set("caseSizeMm", e.target.value)} placeholder="e.g. 40" inputMode="decimal" />
          </Field>

          <Field label="Case thickness (mm, optional)">
            <input className={inputCls} value={d.caseThicknessMm ?? ""} onChange={(e) => set("caseThicknessMm", e.target.value)} placeholder="e.g. 8.7" inputMode="decimal" />
          </Field>

          <Field label="Case material">
            {/* Special case (per brief): the original <select> had a permanent
                "Other…" menu item plus a secondary free-text input. A typeahead
                has no equivalent always-there menu item, so otherOption pins one
                below the filtered suggestions. Choosing a real suggestion here
                auto-exits Other mode (setOtherMaterial(false)) — mirroring the
                original select, where picking any non-Other value always
                cleared Other automatically. Reversible both directions, exactly
                as before. */}
            <TypeaheadField
              value={otherMaterial ? "" : d.caseMaterial ?? ""}
              onChange={(v) => {
                setOtherMaterial(false);
                set("caseMaterial", v);
              }}
              suggestions={CASE_MATERIALS}
              placeholder="Stainless Steel"
              otherOption={{
                label: "Other…",
                onSelect: () => {
                  setOtherMaterial(true);
                  set("caseMaterial", "");
                },
              }}
            />
            {otherMaterial && (
              <input className={`${inputCls} mt-2`} value={d.caseMaterial ?? ""} onChange={(e) => set("caseMaterial", e.target.value)} placeholder="e.g. Palladium" spellCheck={false} />
            )}
          </Field>

          <Field label="Case color / finish">
            <input className={inputCls} value={d.caseColorFinish ?? ""} onChange={(e) => set("caseColorFinish", e.target.value)} placeholder="e.g. Silver-tone with polished and brushed surfaces" spellCheck={false} />
          </Field>

          <Field label="Caseback type">
            <TypeaheadField
              value={d.casebackType ?? ""}
              onChange={(v) => set("casebackType", v)}
              suggestions={CASEBACK_TYPES}
              placeholder="Solid"
            />
          </Field>

          <Field label="Crystal material">
            <TypeaheadField
              value={d.crystalMaterial ?? ""}
              onChange={(v) => set("crystalMaterial", v)}
              suggestions={CRYSTAL_MATERIALS}
              placeholder="Sapphire"
            />
          </Field>

          <Field label="Water resistance (optional)">
            <TypeaheadField
              value={d.waterResistance ?? ""}
              onChange={(v) => set("waterResistance", v)}
              suggestions={WATER_RESISTANCE_OPTIONS}
              placeholder="100 m"
            />
          </Field>
        </div>
      </Chapter>

      {/* ─────────────────────────────────────────────────────────────
          III · The Dial & Hands
          The dial is the face. Its own chapter, not buried in the case. */}
      <Chapter numeral="III" title="The Dial & Hands" caption="Dial, hands, and crown." chapterKey="dial">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dial color / type">
            <TypeaheadField
              value={d.dialColorType ?? ""}
              onChange={(v) => set("dialColorType", v)}
              suggestions={DIAL_COLOR_SUGGESTIONS}
              placeholder="Abyss Blue sunburst"
            />
          </Field>

          <div className="flex items-end pb-1">
            {/* Required ANSWER, not a required crown. "No" is fully valid —
                a missing crown is truthful — but silence is not, because it
                cannot be told apart from a deliberate No. */}
            <BinaryChoice
              label="Crown present"
              name="crown-present"
              value={d.crownPresent}
              onChange={(v) => set("crownPresent", v)}
            />
          </div>
        </div>
      </Chapter>

      {/* ─────────────────────────────────────────────────────────────
          IV · The Wearing
          How the watch lives on the wrist. */}
      <Chapter numeral="IV" title="The Wearing" caption="Strap, bracelet, and closure." chapterKey="wearing">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Closure type">
            <TypeaheadField
              value={d.closureType ?? ""}
              onChange={(v) => set("closureType", v)}
              suggestions={CLOSURE_TYPES}
              placeholder="Folding / Deployant Clasp"
            />
          </Field>

          <Field label="Bezel material (optional)">
            <TypeaheadField
              value={d.bezelMaterial ?? ""}
              onChange={(v) => set("bezelMaterial", v)}
              suggestions={BEZEL_MATERIALS}
              placeholder="Ceramic"
            />
          </Field>

          <Field label="Bracelet wrist size range (optional)">
            <input className={inputCls} value={d.braceletWristSize ?? ""} onChange={(e) => set("braceletWristSize", e.target.value)} placeholder="Fits wrists up to 7.5 in" />
          </Field>

          <div className="flex items-end pb-1">
            <Toggle label="Original strap / bracelet & hardware" checked={!!d.originalStrapBracelet} onChange={(v) => set("originalStrapBracelet", v)} />
          </div>
        </div>
      </Chapter>

      {/* ─────────────────────────────────────────────────────────────
          V · Complications & Character
          What does this watch do beyond telling time? */}
      <Chapter numeral="V" title="Complications & Character" caption="Select all functions that apply." chapterKey="complications">
        <MultiSelect options={COMPLICATIONS} selected={d.complications ?? []} onChange={(v) => set("complications", v)} />
      </Chapter>

      {/* ─────────────────────────────────────────────────────────────
          VI · Provenance & Papers
          The watch's life before this moment. */}
      <Chapter numeral="VI" title="Provenance & Papers" caption="Documentation, service, and history." last chapterKey="provenance">
        {/* Documentation Status input REMOVED (Jason ruling 2026-07-21): a separate
            dropdown duplicated — and could contradict — the "Included with Watch"
            checklist, and mislabeled a box as "documentation." The summary status is
            now DERIVED from the checklist below via deriveDocumentation(). */}

        {/* onChange derives the documentation summary status from the checklist —
            single source of truth (see deriveDocumentation above). */}
        <MultiSelect label="Included with watch" options={INCLUDED} selected={d.includedWithWatch ?? []} onChange={(v) => patch({ details: { ...d, includedWithWatch: v, documentation: governDocumentation(deriveDocumentation(v), profile, admission, v) } })} />
        <MultiSelect label="Service, repair & case history" options={SERVICE} selected={d.serviceHistory ?? []} onChange={(v) => set("serviceHistory", v)} exclusiveWith={SERVICE_EXCLUSIONS} />

        {/* Cross-group contradiction notice. Both selections are LEFT ALONE —
            the seller keeps whatever they ticked, and is told exactly which two
            answers disagree so they can decide which one is true. role="alert"
            so a screen reader hears it when it appears. */}
        {(() => {
          const included = d.includedWithWatch ?? [];
          const service = d.serviceHistory ?? [];
          const conflicts = CROSS_GROUP_CONTRADICTIONS.filter(
            (c) => included.includes(c.included) && service.includes(c.service),
          );
          if (conflicts.length === 0) return null;
          return (
            <div
              role="alert"
              className="mt-3 border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-3 text-[12px] leading-relaxed text-[var(--muted)]"
            >
              <div className="text-[11px] uppercase tracking-[1.6px] text-[var(--gold-dim)]">
                These two answers disagree
              </div>
              <ul className="mt-2 space-y-1">
                {conflicts.map((c) => (
                  <li key={`${c.included}|${c.service}`}>
                    <span className="text-[var(--platinum)]">{c.included}</span>
                    {" is selected under Included with watch, and "}
                    <span className="text-[var(--platinum)]">{c.service}</span>
                    {" under Service, repair & case history — "}
                    {c.why}.
                  </li>
                ))}
              </ul>
              <div className="mt-2">
                Nothing has been changed for you. Please clear whichever one does not
                describe this watch.
              </div>
            </div>
          );
        })()}

        <div className="mt-4">
          {/* draft.provenanceNote has TWO entry points by design: the curation
              gate (CurationStep) and here in Chapter VI. Whatever the seller
              typed at Curation pre-populates this field; Final Review checks
              whatever is in the field at Continue time. Same field, two doors —
              intentional, not a bug. */}
          <label className={labelCls}>Brief provenance note</label>
          <textarea
            ref={provenanceRef}
            className={`${inputCls} min-h-[72px]`}
            value={draft.provenanceNote}
            onChange={(e) => patch({ provenanceNote: e.target.value })}
            placeholder="Service history, previous ownership, how you acquired it…"
            spellCheck={false}
          />
        </div>

        {/* Final Review — inline assistance, never a blocker. Shown only when
            the AI pass returns near-certain corrections. Gold, not red: this is
            help, not a grade. */}
        {review && (
          <div className="mt-6 border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-5 py-5">
            <h3 className="font-display text-[17px] font-light text-[var(--platinum)]">
              One last look
            </h3>
            <p className="mt-1 text-[13px] leading-[1.6] text-[var(--muted)]">
              We noticed a few possible wording issues in your provenance note.
              You can apply the suggestions or continue as written.
            </p>

            {/* The corrected note, with only the changed tokens gilded. */}
            <div className="mt-4 whitespace-pre-wrap border-l border-[var(--border-gold)] bg-[rgba(7,8,12,0.35)] px-4 py-3 font-display text-[14px] font-light leading-[1.7] text-[var(--platinum)]">
              {diffSegments(draft.provenanceNote, review.corrected).map((seg, k) =>
                seg.changed && seg.text.trim().length > 0 ? (
                  <span key={k} style={{ color: "#C9A84C" }}>
                    {seg.text}
                  </span>
                ) : (
                  <span key={k}>{seg.text}</span>
                )
              )}
            </div>

            {review.issues.length > 0 && (
              <ul className="mt-3 space-y-1">
                {review.issues.map((it, k) => (
                  <li
                    key={k}
                    className="flex gap-2 text-[12px] leading-[1.5] text-[var(--muted)]"
                  >
                    <span style={{ color: "#C9A84C" }} aria-hidden="true">
                      ·
                    </span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applySuggestions}
                className="border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-2 font-[Inter] text-[11px] uppercase tracking-[2px] text-[var(--platinum)] transition hover:bg-[var(--gold-whisper)]"
              >
                Apply suggestions
              </button>
              <button
                type="button"
                onClick={continueAsWritten}
                className="border border-[var(--border-mid)] px-4 py-2 font-[Inter] text-[11px] uppercase tracking-[2px] text-[var(--slate)] transition hover:border-[var(--border-subtle)] hover:text-[var(--platinum)]"
              >
                Continue as written
              </button>
              <button
                type="button"
                onClick={goBack}
                className="px-4 py-2 font-[Inter] text-[11px] uppercase tracking-[2px] text-[var(--muted)] transition hover:text-[var(--platinum)]"
              >
                Go back
              </button>
            </div>
          </div>
        )}

      </Chapter>

      {/* ─────────────────────────────────────────────────────────────
          VII · Component Review — profile brands only (Rolex Admission
          Design Gate v1). Originality, period correctness, replacement
          status, and uncertainty are explicit, separate claims. Non-profile
          sellers never see this chapter. */}
      {profile && (
        <Chapter
          numeral="VII"
          title="Component Review"
          caption="Describe what is present and what is supportable. Original, period-correct, replacement, and unverified are different claims."
          last
        >
          <div className="grid gap-5 sm:grid-cols-2">
            {COMPONENT_KEYS.map((key) => (
              <RepresentationChoice
                key={key}
                label={COMPONENT_LABELS[key]}
                value={admission?.components?.[key]}
                onChange={(rep) =>
                  setAdmission({
                    components: { ...admission?.components, [key]: rep },
                  })
                }
              />
            ))}
          </div>

          {admissionBoxIncluded(d.includedWithWatch) && (
            <div className="mt-8">
              <h4 className="font-display text-[15px] font-light text-[var(--platinum)]">
                How is the included box related to this watch?
              </h4>
              <p className="mt-1 text-[12px] leading-[1.5] text-[var(--muted)]">
                A box is optional. The claim about it is not — commercially
                available packaging is never automatic provenance.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {PACKAGING_CLASSIFICATIONS.map((c) => {
                  const on = admission?.packaging === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAdmission({ packaging: c })}
                      className={`border px-4 py-3 text-left transition ${
                        on
                          ? "border-[var(--border-gold)] bg-[var(--gold-whisper)]"
                          : "border-[rgba(201,168,76,0.40)] bg-[rgba(255,255,255,0.04)] hover:border-[var(--border-mid)]"
                      }`}
                    >
                      <div
                        className={`text-[12px] ${
                          on ? "text-[var(--gold)]" : "text-[var(--platinum)]"
                        }`}
                      >
                        {PACKAGING_LABELS[c]}
                      </div>
                      <div className="mt-1 text-[11px] leading-[1.5] text-[var(--muted)]">
                        {PACKAGING_DESCRIPTIONS[c]}
                      </div>
                    </button>
                  );
                })}
              </div>
              {!fullSetSupportable(admission, d.includedWithWatch) && (
                <p className="mt-3 text-[11px] leading-[1.6] text-[var(--muted)]">
                  “Full set” remains unavailable. It may be claimed only when
                  the watch, its identity-bearing documentation, and a box
                  classified as original to this watch stand together.
                </p>
              )}
            </div>
          )}
        </Chapter>
      )}

      {/* Step Continue lives here (DetailsStep owns its async gate). Hidden
          while Final Review is open, since the review's own actions advance.
          Moved below the last chapter so the profile Component Review sits
          inside the step, never after its exit. */}
      {!review && (
        <div className="mt-8">
          {/* The Crown present answer is required to leave this step. The
              reason is stated where the seller is blocked, not only up at
              the control, so a disabled Continue is never a mystery. */}
          {d.crownPresent === undefined && (
            <p className="mb-3 text-[12px] text-[var(--muted)]">
              Please answer <span className="text-[var(--platinum)]">Crown present</span> above
              — <span className="text-[var(--platinum)]">No</span> is a perfectly good answer.
            </p>
          )}
          {admissionUnclassified.length > 0 && (
            <p className="mb-3 text-[12px] text-[var(--muted)]">
              {ADMISSION_STOPS.componentUnsupported}{" "}
              <span className="text-[var(--platinum)]">
                Still unclassified:{" "}
                {admissionUnclassified.map((k) => COMPONENT_LABELS[k]).join(", ")}.
              </span>
            </p>
          )}
          {admissionPackagingMissing && (
            <p className="mb-3 text-[12px] text-[var(--muted)]">
              Classify the included box under{" "}
              <span className="text-[var(--platinum)]">Component Review</span>{" "}
              before continuing.
            </p>
          )}
          <button
            type="button"
            onClick={handleContinue}
            disabled={reviewing || d.crownPresent === undefined || admissionHolds}
            className={`flex items-center gap-2 bg-[var(--cta-fill)] px-5 py-[13px] font-[Inter] text-[11px] font-normal uppercase tracking-[2px] text-[var(--on-cta)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${
              reviewing ? "cursor-wait" : ""
            }`}
          >
            {reviewing && <WatchSpinner size={18} />}
            {reviewing ? "Reviewing…" : "Continue"}
          </button>
        </div>
      )}
    </div>
  );
}

/* A chapter: Roman numeral + title + one-line caption, a hairline rule, then its
   fields. The numeral is the quiet ceremony that turns a form into a sequence of
   deliberate thoughts. */
function Chapter({
  numeral,
  title,
  caption,
  children,
  last,
  chapterKey,
}: {
  numeral: string;
  title: string;
  caption: string;
  children: ReactNode;
  last?: boolean;
  chapterKey?: string;
}) {
  return (
    <section id={chapterKey ? `chapter-${chapterKey}` : undefined} data-chapter={chapterKey} className={last ? "mt-9" : "mt-9"}>
      <div className="flex items-baseline gap-3">
        <span className="font-display text-[15px] font-light not-italic text-[var(--gold)]">
          {numeral}
        </span>
        <h3 className="font-display text-[17px] font-light text-[var(--platinum)]">
          {title}
        </h3>
      </div>
      <p className="mt-1 text-[12px] leading-[1.5] text-[var(--muted)]">
        {caption}
      </p>
      <div className="mt-3 h-px w-full bg-[var(--border-faint)]" />
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    /* Keyboard focus visibility: the real <input> is sr-only, so focus landed
       on an element with no visible presence and the box beside it never
       reacted — a keyboard seller had no way to tell which control they were
       on. `peer` lets the box answer the input's focus, and `has-` lifts the
       label with it, so the whole group acknowledges focus as one target.
       Deliberately an outline, not a glow or a fill: a fill would make an
       unchecked box read as checked. Space still toggles (native). */
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--platinum)] transition has-[:focus-visible]:text-[var(--gold)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      {/* Unchecked state legibility: the border was --border-subtle
          (rgba(255,255,255,0.06) — ~1.12:1 against the surface), which reads as
          an empty gap rather than a control you can tick. Same trap the
          lifecycle colorway flight found in --lc-neutral-line. The box now
          carries a visible gold-at-rest edge and a faint inner fill so the
          target is unmistakable before it is checked. Geometry and the
          checked-state treatment are unchanged. */}
      <div
        className={`flex h-3 w-3 shrink-0 items-center justify-center border transition peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--gold)] ${
          checked
            ? "border-[var(--border-gold)] bg-[var(--gold-whisper)]"
            : "border-[rgba(201,168,76,0.40)] bg-[rgba(255,255,255,0.04)]"
        }`}
      >
        {checked && <div className="h-[5px] w-[5px] bg-[var(--gold-fill)] opacity-80" />}
      </div>
      {label}
    </label>
  );
}

/* ── Required binary answer ──────────────────────────────────────────────
   A checkbox cannot tell "No, the crown is absent" apart from "I skipped
   this" — both read as unchecked. Where the ANSWER is required but either
   answer is truthful, the control has to carry three states, so this is a
   radio pair over `boolean | undefined`: undefined is genuinely unanswered
   and neither option is preselected.

   Radios rather than two buttons on purpose — the browser gives arrow-key
   movement, roving focus and group semantics for free, and a fieldset/legend
   names the question to assistive technology. Styling reuses the exact tokens
   the checkbox already uses, so nothing new enters the design system.

   Exported for the Curation step's admission entry conditions, whose prompts
   are full sentences — sentenceLegend renders the legend in sentence case
   instead of the uppercase micro-label. Default rendering is unchanged. */
export function BinaryChoice({
  label,
  value,
  onChange,
  name,
  sentenceLegend,
}: {
  label: string;
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  name: string;
  sentenceLegend?: boolean;
}) {
  const answered = value !== undefined;
  return (
    <fieldset className="min-w-0">
      <legend
        className={
          sentenceLegend
            ? "mb-2 text-[13px] leading-[1.6] text-[var(--platinum)]"
            : labelCls
        }
      >
        {label}
        {!answered && (
          <span className="ml-2 normal-case tracking-normal text-[var(--gold-dim)]">
            required
          </span>
        )}
      </legend>
      <div className="flex gap-2">
        {[
          { v: true, t: "Yes" },
          { v: false, t: "No" },
        ].map(({ v, t }) => (
          <label
            key={t}
            className={`cursor-pointer border px-4 py-2 font-[Inter] text-[11px] uppercase tracking-[2px] transition has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--gold)] ${
              value === v
                ? "border-[var(--border-gold)] bg-[var(--gold-whisper)] text-[var(--gold)]"
                : "border-[rgba(201,168,76,0.40)] bg-[rgba(255,255,255,0.04)] text-[var(--muted)] hover:text-[var(--platinum)]"
            }`}
          >
            <input
              type="radio"
              name={name}
              checked={value === v}
              onChange={() => onChange(v)}
              className="sr-only"
            />
            {t}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ── Component representation choice (profile brands) ────────────────────
   One required single-choice answer per component: the four admission
   claims, radio semantics like BinaryChoice, pill tokens like MultiSelect.
   Unanswered is genuinely unanswered — nothing is preselected, because a
   default would be a claim the seller never made. */
function RepresentationChoice({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ComponentRepresentation | undefined;
  onChange: (v: ComponentRepresentation) => void;
}) {
  const answered = value !== undefined;
  return (
    <fieldset className="min-w-0">
      <legend className={labelCls}>
        {label}
        {!answered && (
          <span className="ml-2 normal-case tracking-normal text-[var(--gold-dim)]">
            required
          </span>
        )}
      </legend>
      <div className="flex flex-wrap gap-2">
        {COMPONENT_REPRESENTATIONS.map((rep) => (
          <label
            key={rep}
            className={`cursor-pointer border px-3 py-1.5 text-[11px] transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--gold)] ${
              value === rep
                ? "border-[var(--border-gold)] bg-[var(--gold-whisper)] text-[var(--platinum)]"
                : "border-[var(--border-subtle)] text-[var(--muted)] hover:border-[var(--border-mid)] hover:text-[var(--platinum)]"
            }`}
          >
            <input
              type="radio"
              name={`representation-${label}`}
              checked={value === rep}
              onChange={() => onChange(rep)}
              className="sr-only"
            />
            {REPRESENTATION_LABELS[rep]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  exclusiveWith,
}: {
  label?: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  /* Optional: when a key option is selected, any options listed for it are
     auto-deselected (mutual-exclusion). Rules are applied symmetrically via
     a lookup at toggle time, so "A clears B" also means selecting B won't sit
     alongside A if A also lists B. */
  exclusiveWith?: Record<string, string[]>;
}) {
  function toggle(opt: string) {
    if (selected.includes(opt)) {
      onChange(selected.filter((s) => s !== opt));
      return;
    }
    // Selecting opt: drop anything opt conflicts with, and anything that
    // conflicts with opt (symmetric), so contradictions can't coexist.
    const clears = new Set(exclusiveWith?.[opt] ?? []);
    const next = selected.filter((s) => {
      if (clears.has(s)) return false;
      if ((exclusiveWith?.[s] ?? []).includes(opt)) return false;
      return true;
    });
    onChange([...next, opt]);
  }
  return (
    <div className="mt-4">
      {label && <div className={labelCls}>{label}</div>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`border px-3 py-1 text-[11px] transition-colors ${
                on
                  ? "border-[var(--border-gold)] bg-[var(--gold-whisper)] text-[var(--platinum)]"
                  : "border-[var(--border-subtle)] text-[var(--muted)] hover:border-[var(--border-mid)]"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
