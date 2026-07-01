"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { type ListingDraft, type ListingDetails } from "@/lib/listing";
import { type DocumentationStatus } from "@/lib/scoring";

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
  "w-full border-b border-[var(--border-mid)] bg-transparent px-0 py-2 text-[14px] text-[var(--platinum)] placeholder:text-[var(--void)] focus:border-[var(--gold)] focus:outline-none";
const labelCls = "mb-1 block text-[10px] uppercase tracking-[2px] text-[var(--muted)]";

export default function DetailsStep({
  draft,
  patch,
}: {
  draft: ListingDraft;
  patch: (p: Partial<ListingDraft>) => void;
}) {
  const d = draft.details;
  const set = <K extends keyof ListingDetails>(key: K, val: ListingDetails[K]) =>
    patch({ details: { ...d, [key]: val } });

  const knownMaterials = CASE_MATERIALS;
  const materialIsCustom =
    !!d.caseMaterial && !knownMaterials.includes(d.caseMaterial);
  const [otherMaterial, setOtherMaterial] = useState(materialIsCustom);

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
            <input className={inputCls} value={d.movementFrequency ?? ""} onChange={(e) => set("movementFrequency", e.target.value)} placeholder="28,800 vph (4 Hz)" />
          </Field>

          <Field label="Calibre / movement reference (optional)">
            <input className={inputCls} value={d.calibre ?? ""} onChange={(e) => set("calibre", e.target.value)} placeholder="e.g. Cal. 1020, Calibre 89" />
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
            <input className={inputCls} value={d.caseSizeMm ?? ""} onChange={(e) => set("caseSizeMm", e.target.value)} placeholder="40" inputMode="decimal" />
          </Field>

          <Field label="Case thickness (mm, optional)">
            <input className={inputCls} value={d.caseThicknessMm ?? ""} onChange={(e) => set("caseThicknessMm", e.target.value)} placeholder="8.7" inputMode="decimal" />
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
              <input className={`${inputCls} mt-2`} value={d.caseMaterial ?? ""} onChange={(e) => set("caseMaterial", e.target.value)} placeholder="e.g. Palladium" />
            )}
          </Field>

          <Field label="Case color / finish">
            <input className={inputCls} value={d.caseColorFinish ?? ""} onChange={(e) => set("caseColorFinish", e.target.value)} placeholder="Polished, brushed lugs" />
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
            <input className={inputCls} value={d.dialColorType ?? ""} onChange={(e) => set("dialColorType", e.target.value)} placeholder="Abyss Blue sunburst" />
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
          <label className={labelCls}>Brief provenance note</label>
          <textarea
            className={`${inputCls} min-h-[72px]`}
            value={draft.provenanceNote}
            onChange={(e) => patch({ provenanceNote: e.target.value })}
            placeholder="Service history, previous ownership, how you acquired it…"
          />
        </div>
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
