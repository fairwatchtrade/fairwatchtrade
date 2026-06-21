"use client";

import { useState } from "react";
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

const inputCls =
  "w-full rounded-md border border-white/15 bg-[#0D0F14] px-3 py-2 text-[14px] text-[#E8E4DC] placeholder:text-[#8A8F9E]/60 focus:border-[#C9A84C] focus:outline-none";
const labelCls = "mb-1 block text-[12px] text-[#8A8F9E]";

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
      <h2 className="text-[18px] font-medium text-[#E8E4DC]">
        Step 3 — Listing details
      </h2>
      <p className="mt-1 text-[13px] text-[#8A8F9E]">
        The specifics collectors look for. Optional fields are marked — skip what
        you can't confirm rather than guessing.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Movement type">
          <select className={inputCls} value={d.movementType ?? ""} onChange={(e) => set("movementType", e.target.value)}>
            <option value="">Select…</option>
            {MOVEMENT_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>

        <Field label="Movement frequency (optional)">
          <input className={inputCls} value={d.movementFrequency ?? ""} onChange={(e) => set("movementFrequency", e.target.value)} placeholder="28,800 vph (4 Hz)" />
        </Field>

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
            <option value="">Select…</option>
            {CASE_MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
            <option value="Other">Other…</option>
          </select>
          {otherMaterial && (
            <input className={`${inputCls} mt-2`} value={d.caseMaterial ?? ""} onChange={(e) => set("caseMaterial", e.target.value)} placeholder="e.g. Palladium" />
          )}
        </Field>

        <Field label="Case color / finish">
          <input className={inputCls} value={d.caseColorFinish ?? ""} onChange={(e) => set("caseColorFinish", e.target.value)} placeholder="Polished, brushed lugs" />
        </Field>

        <Field label="Closure type">
          <select className={inputCls} value={d.closureType ?? ""} onChange={(e) => set("closureType", e.target.value)}>
            <option value="">Select…</option>
            {CLOSURE_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <Field label="Caseback type">
          <select className={inputCls} value={d.casebackType ?? ""} onChange={(e) => set("casebackType", e.target.value)}>
            <option value="">Select…</option>
            {CASEBACK_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <Field label="Crystal material">
          <select className={inputCls} value={d.crystalMaterial ?? ""} onChange={(e) => set("crystalMaterial", e.target.value)}>
            <option value="">Select…</option>
            {CRYSTAL_MATERIALS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <Field label="Dial color / type">
          <input className={inputCls} value={d.dialColorType ?? ""} onChange={(e) => set("dialColorType", e.target.value)} placeholder="Abyss Blue sunburst" />
        </Field>

        <Field label="Documentation status">
          <select className={inputCls} value={d.documentation} onChange={(e) => set("documentation", e.target.value as DocumentationStatus)}>
            {DOCS.map((doc) => <option key={doc} value={doc}>{doc}</option>)}
          </select>
        </Field>

        <Field label="Bracelet wrist size range (optional)">
          <input className={inputCls} value={d.braceletWristSize ?? ""} onChange={(e) => set("braceletWristSize", e.target.value)} placeholder="Fits up to 7.5 in" />
        </Field>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:gap-8">
        <Toggle label="Crown present" checked={!!d.crownPresent} onChange={(v) => set("crownPresent", v)} />
        <Toggle label="Original strap/bracelet & pins" checked={!!d.originalStrapBracelet} onChange={(v) => set("originalStrapBracelet", v)} />
      </div>

      <MultiSelect label="Included with watch" options={INCLUDED} selected={d.includedWithWatch ?? []} onChange={(v) => set("includedWithWatch", v)} />
      <MultiSelect label="Complication / function" options={COMPLICATIONS} selected={d.complications ?? []} onChange={(v) => set("complications", v)} />
      <MultiSelect label="Service / repair history" options={SERVICE} selected={d.serviceHistory ?? []} onChange={(v) => set("serviceHistory", v)} exclusiveWith={SERVICE_EXCLUSIONS} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
    <label className="flex items-center gap-2 text-[13px] text-[#E8E4DC]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[#C9A84C]" />
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
              className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                on
                  ? "border-[#C9A84C] bg-[#C9A84C]/15 text-[#E8E4DC]"
                  : "border-white/15 text-[#8A8F9E] hover:border-white/30"
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
