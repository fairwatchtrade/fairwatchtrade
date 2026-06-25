"use client";

import { useState } from "react";

/* ────────────────────────────────────────────────────────────────────────
   LISTING SPECS — §3 Collector Snapshot (always visible) + §4 Technical
   Specifications (collapsible) for /listings/[id].

   Client child of the server detail page: receives raw spec data and derives
   the display rows here so the page stays a clean server component. §4 is
   collapsed by default; its label row is the toggle (no button chrome).
   ──────────────────────────────────────────────────────────────────────── */

type ListingDetails = {
  movementType?: string;
  caseSizeMm?: string;
  caseThicknessMm?: string;
  caseMaterial?: string;
  dialColorType?: string;
  complications?: string[];
  closureType?: string;
  documentation: string;
  bezelMaterial?: string;
  waterResistance?: string;
  calibre?: string;
  jewels?: string;
  powerReserve?: string;
  casebackType?: string;
  crystalMaterial?: string;
};

const MOVEMENT_LABELS: Record<string, string> = {
  "Manual Wind": "✦ Manual Wind",
  Automatic: "🔄 Automatic",
  Quartz: "⚡ Quartz",
  "Solar/Kinetic": "🔋 Solar/Kinetic",
};

export default function ListingSpecs({
  details,
  year,
  condition,
}: {
  details: ListingDetails;
  year: string;
  condition: string;
}) {
  const [open, setOpen] = useState(false);

  // Movement — mapped to the canonical labelled string.
  const movementLabel = details.movementType
    ? MOVEMENT_LABELS[details.movementType] ?? details.movementType
    : "";

  // Complications — comma-joined.
  const complications =
    Array.isArray(details.complications) && details.complications.length > 0
      ? details.complications.join(", ")
      : "";

  // §3 — Collector Snapshot (prominent values), in spec order. Skip if absent.
  const snapshotRows: Array<{ label: string; value: string }> = [];
  const pushSnap = (label: string, value?: string | null) => {
    if (value != null && String(value).trim() !== "")
      snapshotRows.push({ label, value: String(value) });
  };
  pushSnap("Case Size", details.caseSizeMm ? `${details.caseSizeMm} mm` : "");
  pushSnap("Case Thickness", details.caseThicknessMm ? `${details.caseThicknessMm} mm` : "");
  pushSnap("Case Material", details.caseMaterial);
  pushSnap("Movement", movementLabel);
  pushSnap("Calibre", details.calibre);
  pushSnap("Power Reserve", details.powerReserve);
  pushSnap("Water Resistance", details.waterResistance);
  pushSnap("Dial Color", details.dialColorType);
  pushSnap("Complications", complications);
  pushSnap("Year", year);
  pushSnap("Condition", condition);

  // §4 — Technical Specifications: remaining fields only, never duplicating §3.
  const techRows: Array<{ label: string; value: string }> = [];
  const pushTech = (label: string, value?: string | null) => {
    if (value != null && String(value).trim() !== "")
      techRows.push({ label, value: String(value) });
  };
  pushTech("Closure Type", details.closureType);
  pushTech("Caseback", details.casebackType);
  pushTech("Crystal", details.crystalMaterial);
  pushTech("Bezel Material", details.bezelMaterial);
  pushTech("Jewel Count", details.jewels);
  pushTech("Documentation", details.documentation);

  return (
    <>
      {/* SECTION 3 — Collector Snapshot (always visible) */}
      {snapshotRows.length > 0 && (
        <section className="mt-8">
          <div className="border-t border-white/10 pt-6 text-[11px] uppercase tracking-[0.15em] text-[#B7BAC4]">
            Collector Snapshot
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {snapshotRows.map((row) => (
              <div key={row.label} className="flex flex-col">
                <dt className="text-[11px] uppercase tracking-wide text-[#B7BAC4]">
                  {row.label}
                </dt>
                <dd className="mt-0.5 text-[15px] font-medium text-[#E8E4DC]">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* SECTION 4 — Technical Specifications (collapsible, collapsed by default) */}
      {techRows.length > 0 && (
        <section className="mt-6">
          <div
            role="button"
            tabIndex={0}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpen((v) => !v);
              }
            }}
            className="group flex cursor-pointer items-center justify-between border-t border-white/10 pt-6"
          >
            <span className="text-[11px] uppercase tracking-[0.15em] text-[#B7BAC4]">
              Technical Specifications
            </span>
            <span
              aria-hidden="true"
              className={`text-[#C9A84C]/40 transition-all duration-300 group-hover:text-[#C9A84C] ${
                open ? "rotate-180" : ""
              }`}
            >
              ∨
            </span>
          </div>

          {/* Collapsible body — grid-rows 0fr→1fr animates to natural height */}
          <div
            className={`grid transition-all duration-300 ${
              open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="overflow-hidden">
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {techRows.map((row) => (
                  <div key={row.label} className="flex flex-col">
                    <dt className="text-[11px] uppercase tracking-wide text-[#B7BAC4]">
                      {row.label}
                    </dt>
                    <dd className="mt-0.5 text-sm text-[#E8E4DC]">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
