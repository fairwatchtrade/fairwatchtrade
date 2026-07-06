"use client";

import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { type ListingDraft, type ListingDetails } from "@/lib/listing";
import { type DocumentationStatus } from "@/lib/scoring";
import WatchSpinner from "@/components/WatchSpinner";

const MOVEMENT_TYPES = ["Automatic", "Manual Wind", "Quartz"];
const CLOSURE_TYPES = [
  "Pin Buckle",
  "Deployant Clasp",
  "Folding Clasp",
  "None / Strap only",
  "Other",
];
const CASEBACK_TYPES = ["Solid", "Exhibition (Display)", "Other"];
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
const WATER_RESISTANCE_OPTIONS = ["30m", "50m", "100m", "200m", "300m+", "Not rated"];
const DOCS: DocumentationStatus[] = [
  "Full Set",
  "Papers Only",
  "Box Only",
  "Watch Only",
];
const INCLUDED = [
  "Box",
  "Papers",
  "Warranty Card",
  "Extra Links",
  "Travel Case",
  "Hang Tags",
  "Manual / Booklet",
  "Service Receipt",
];
const COMPLICATIONS = [
  "Date",
  "Day-Date",
  "Chronograph",
  "GMT / Dual Time",
  "Moonphase",
  "Power Reserve",
  "Small Seconds",
  "Center Seconds",
  "Annual Calendar",
  "Perpetual Calendar",
  "Tourbillon",
  "Minute Repeater",
  "World Time",
];
const SERVICE = [
  "Never serviced",
  "Serviced by manufacturer",
  "Serviced by independent",
  "Recently serviced",
  "Unpolished / original",
  "Polished",
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
  "Never serviced": [
    "Serviced by manufacturer",
    "Serviced by independent",
    "Recently serviced",
  ],
  "Serviced by manufacturer": ["Never serviced", "Serviced by independent"],
  "Serviced by independent": ["Never serviced", "Serviced by manufacturer"],
  "Recently serviced": ["Never serviced"],
  "Polished": ["Unpolished / original"],
  "Unpolished / original": ["Polished"],
};

/* Native <option> elements don't inherit the form's dark styling — when a
   <select> opens the browser renders the option list with defaults (often a
   white menu), making our light --platinum option text invisible. Explicit hex
   bg + text fixes it; CSS variables are ignored for <option> in some browsers. */
const OPTION_STYLE: CSSProperties = {
  backgroundColor: "#141821",
  color: "#E8E4DC",
};

const inputCls =
  "w-full border-b border-[var(--border-mid)] bg-transparent px-2 py-2 text-[14px] text-[var(--platinum)] placeholder:text-[var(--void)] focus-visible:border-[var(--gold)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-gold)] focus:border-[var(--gold)] focus:outline-none transition";
const labelCls = "mb-1 block text-[10px] uppercase tracking-[2px] text-[var(--muted)]";

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

function DialColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false);
  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return DIAL_COLOR_SUGGESTIONS.slice(0, 6);
    return DIAL_COLOR_SUGGESTIONS.filter((c) => c.toLowerCase().includes(q)).slice(0, 6);
  }, [value]);

  return (
    <div className="relative">
      <input
        className={inputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Abyss Blue sunburst"
        spellCheck={false}
        autoComplete="off"
      />
      {focused && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full border border-[var(--border-mid)] bg-[var(--ink)]">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s);
                setFocused(false);
              }}
              className="block w-full px-3 py-2 text-left text-[13px] text-[var(--platinum)] hover:bg-[rgba(201,168,76,0.06)]"
            >
              {s}
            </button>
          ))}
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
      <Chapter numeral="I" title="The Watch Itself" caption="Movement first." chapterKey="movement">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Movement type">
            <select className={inputCls} value={d.movementType ?? ""} onChange={(e) => set("movementType", e.target.value)}>
              <option value="" style={OPTION_STYLE}>Select…</option>
              {MOVEMENT_TYPES.map((m) => <option key={m} value={m} style={OPTION_STYLE}>{m}</option>)}
            </select>
          </Field>

          <Field label="Movement frequency (optional)">
            <input className={inputCls} value={d.movementFrequency ?? ""} onChange={(e) => set("movementFrequency", e.target.value)} placeholder="28,800 vph (4 Hz)" spellCheck={false} />
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
            <select
              className={inputCls}
              value={otherMaterial ? "Other" : d.caseMaterial ?? ""}
              onChange={(e) => {
                if (e.target.value === "Other") {
                  setOtherMaterial(true);
                  set("caseMaterial", "");
                } else {
                  setOtherMaterial(false);
                  set("caseMaterial", e.target.value);
                }
              }}
            >
              <option value="" style={OPTION_STYLE}>Select…</option>
              {CASE_MATERIALS.map((m) => <option key={m} value={m} style={OPTION_STYLE}>{m}</option>)}
              <option value="Other" style={OPTION_STYLE}>Other…</option>
            </select>
            {otherMaterial && (
              <input className={`${inputCls} mt-2`} value={d.caseMaterial ?? ""} onChange={(e) => set("caseMaterial", e.target.value)} placeholder="e.g. Palladium" spellCheck={false} />
            )}
          </Field>

          <Field label="Case color / finish">
            <input className={inputCls} value={d.caseColorFinish ?? ""} onChange={(e) => set("caseColorFinish", e.target.value)} placeholder="Polished, brushed lugs" spellCheck={false} />
          </Field>

          <Field label="Caseback type">
            <select className={inputCls} value={d.casebackType ?? ""} onChange={(e) => set("casebackType", e.target.value)}>
              <option value="" style={OPTION_STYLE}>Select…</option>
              {CASEBACK_TYPES.map((c) => <option key={c} value={c} style={OPTION_STYLE}>{c}</option>)}
            </select>
          </Field>

          <Field label="Crystal material">
            <select className={inputCls} value={d.crystalMaterial ?? ""} onChange={(e) => set("crystalMaterial", e.target.value)}>
              <option value="" style={OPTION_STYLE}>Select…</option>
              {CRYSTAL_MATERIALS.map((c) => <option key={c} value={c} style={OPTION_STYLE}>{c}</option>)}
            </select>
          </Field>

          <Field label="Water resistance (optional)">
            <select className={inputCls} value={d.waterResistance ?? ""} onChange={(e) => set("waterResistance", e.target.value)}>
              <option value="" style={OPTION_STYLE}>Select…</option>
              {WATER_RESISTANCE_OPTIONS.map((w) => <option key={w} value={w} style={OPTION_STYLE}>{w}</option>)}
            </select>
          </Field>
        </div>
      </Chapter>

      {/* ─────────────────────────────────────────────────────────────
          III · The Dial & Hands
          The dial is the face. Its own chapter, not buried in the case. */}
      <Chapter numeral="III" title="The Dial & Hands" caption="Dial and crown." chapterKey="dial">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dial color / type">
            <DialColorField value={d.dialColorType ?? ""} onChange={(v) => set("dialColorType", v)} />
          </Field>

          <div className="flex items-end pb-1">
            <Toggle label="Crown present" checked={!!d.crownPresent} onChange={(v) => set("crownPresent", v)} />
          </div>
        </div>
      </Chapter>

      {/* ─────────────────────────────────────────────────────────────
          IV · The Wearing
          How the watch lives on the wrist. */}
      <Chapter numeral="IV" title="The Wearing" caption="Strap, bracelet, and closure." chapterKey="wearing">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Closure type">
            <select className={inputCls} value={d.closureType ?? ""} onChange={(e) => set("closureType", e.target.value)}>
              <option value="" style={OPTION_STYLE}>Select…</option>
              {CLOSURE_TYPES.map((c) => <option key={c} value={c} style={OPTION_STYLE}>{c}</option>)}
            </select>
          </Field>

          <Field label="Bezel material (optional)">
            <select className={inputCls} value={d.bezelMaterial ?? ""} onChange={(e) => set("bezelMaterial", e.target.value)}>
              <option value="" style={OPTION_STYLE}>Select…</option>
              {BEZEL_MATERIALS.map((b) => <option key={b} value={b} style={OPTION_STYLE}>{b}</option>)}
            </select>
          </Field>

          <Field label="Bracelet wrist size range (optional)">
            <input className={inputCls} value={d.braceletWristSize ?? ""} onChange={(e) => set("braceletWristSize", e.target.value)} placeholder="Fits up to 7.5 in" />
          </Field>

          <div className="flex items-end pb-1">
            <Toggle label="Original strap/bracelet & pins" checked={!!d.originalStrapBracelet} onChange={(v) => set("originalStrapBracelet", v)} />
          </div>
        </div>
      </Chapter>

      {/* ─────────────────────────────────────────────────────────────
          V · Complications & Character
          What does this watch do beyond telling time? */}
      <Chapter numeral="V" title="Complications & Character" caption="Complications and functions." chapterKey="complications">
        <MultiSelect label="Complication / function" options={COMPLICATIONS} selected={d.complications ?? []} onChange={(v) => set("complications", v)} />
      </Chapter>

      {/* ─────────────────────────────────────────────────────────────
          VI · Provenance & Papers
          The watch's life before this moment. */}
      <Chapter numeral="VI" title="Provenance & Papers" caption="Documentation, service, and history." last chapterKey="provenance">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Documentation status">
            <select className={inputCls} value={d.documentation} onChange={(e) => set("documentation", e.target.value as DocumentationStatus)}>
              {DOCS.map((doc) => <option key={doc} value={doc} style={OPTION_STYLE}>{doc}</option>)}
            </select>
          </Field>
        </div>

        <MultiSelect label="Included with watch" options={INCLUDED} selected={d.includedWithWatch ?? []} onChange={(v) => set("includedWithWatch", v)} />
        <MultiSelect label="Service / repair history" options={SERVICE} selected={d.serviceHistory ?? []} onChange={(v) => set("serviceHistory", v)} exclusiveWith={SERVICE_EXCLUSIONS} />

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
          <div className="mt-6 border border-[var(--border-gold)] bg-[rgba(201,168,76,0.04)] px-5 py-5">
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
                className="border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-2 font-[Inter] text-[11px] uppercase tracking-[2px] text-[var(--platinum)] transition hover:bg-[rgba(201,168,76,0.12)]"
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

        {/* Step Continue lives here (DetailsStep owns its async gate). Hidden
            while Final Review is open, since the review's own actions advance. */}
        {!review && (
          <div className="mt-8">
            <button
              type="button"
              onClick={handleContinue}
              disabled={reviewing}
              className={`flex items-center gap-2 bg-[var(--gold)] px-5 py-[13px] font-[Inter] text-[11px] font-normal uppercase tracking-[2px] text-[var(--ink)] transition hover:opacity-90 disabled:opacity-60 ${
                reviewing ? "cursor-wait" : ""
              }`}
            >
              {reviewing && <WatchSpinner size={16} />}
              {reviewing ? "Reviewing…" : "Continue"}
            </button>
          </div>
        )}
      </Chapter>
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
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--platinum)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <div
        className={`flex h-3 w-3 shrink-0 items-center justify-center border ${
          checked
            ? "border-[var(--border-gold)] bg-[var(--gold-whisper)]"
            : "border-[var(--border-subtle)]"
        }`}
      >
        {checked && <div className="h-[5px] w-[5px] bg-[var(--gold)] opacity-80" />}
      </div>
      {label}
    </label>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  exclusiveWith,
}: {
  label: string;
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
      <div className={labelCls}>{label}</div>
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
