import { formatMovementFrequency } from "@/lib/movementFrequency";

/* ────────────────────────────────────────────────────────────────────────
   LISTING SPECS — §3 Collector Snapshot + §4 Technical Specifications
   for /listings/[id].

   v4.26 — THE BROOM CLOSET OPENS (founder audit, 2026-08-12). The Sell flow
   collects 22 structured details and the publish route persists every one of
   them verbatim — but this renderer showed 11 fields and hid six more behind
   a collapsed accordion the founder himself forgot existed. Eight persisted
   fields appeared nowhere at all, including Beat Rate — which Browse renders
   and facets on, then dropped the moment a buyer clicked through.

   Corrections, per the audited ruling:
     · Every orphan joins the surface: Beat Rate, Case Finish, Crown Present,
       Service & Case History, Included With Watch, Original strap/bracelet,
       Bracelet Wrist Size. (Rolex admission rendering is corridor-design
       territory — deliberately NOT here; it has its own gate.)
     · The accordion is REMOVED, not defaulted open: nothing in these rows
       earns hiding — caseback, crystal and bezel are exactly what the
       criteria-first collector came to check. One continuous specifications
       surface; the heading stays as rhythm, the chevron and its state go.
     · Beat Rate renders through the ONE ruled formatter
       (lib/movementFrequency, v3.13) — never a second presentation.

   Every row keeps the standing law: rendered only when present. No penalty
   for missing data — only for hiding data we have.

   Now stateless and server-rendered: no client state remained once the
   disclosure died.
   ──────────────────────────────────────────────────────────────────────── */

type ListingDetails = {
  movementType?: string;
  movementFrequency?: string;
  caseSizeMm?: string;
  caseThicknessMm?: string;
  caseMaterial?: string;
  caseColorFinish?: string;
  dialColorType?: string;
  complications?: string[];
  crownPresent?: boolean;
  closureType?: string;
  originalStrapBracelet?: boolean;
  braceletWristSize?: string;
  includedWithWatch?: string[];
  serviceHistory?: string[];
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
  "Manual Wind": "Manual Wind",
  Automatic: "Automatic",
  Quartz: "Quartz",
  "Solar/Kinetic": "Solar/Kinetic",
};

function SpecGrid({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col">
          <dt className="text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]">
            {row.label}
          </dt>
          <dd className="mt-0.5 font-display text-[16px] font-light text-[var(--platinum)]">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function ListingSpecs({
  details,
  year,
  condition,
}: {
  details: ListingDetails;
  year?: string | null;
  condition?: string | null;
}) {
  const movementLabel = details.movementType
    ? MOVEMENT_LABELS[details.movementType] ?? details.movementType
    : "";

  const complications =
    Array.isArray(details.complications) && details.complications.length > 0
      ? details.complications.join(", ")
      : "";

  const joined = (list?: string[]): string =>
    Array.isArray(list) && list.length > 0
      ? list.map((v) => String(v).trim()).filter(Boolean).join(", ")
      : "";

  const snapshotRows: Array<{ label: string; value: string }> = [];
  const pushSnap = (label: string, value?: string | null) => {
    if (value != null && String(value).trim() !== "")
      snapshotRows.push({ label, value: String(value) });
  };
  pushSnap("Case Size", details.caseSizeMm ? `${details.caseSizeMm} mm` : "");
  pushSnap("Case Thickness", details.caseThicknessMm ? `${details.caseThicknessMm} mm` : "");
  pushSnap("Case Material", details.caseMaterial);
  pushSnap("Case Finish", details.caseColorFinish);
  pushSnap("Movement", movementLabel);
  pushSnap("Calibre", details.calibre);
  pushSnap("Beat Rate", formatMovementFrequency(details.movementFrequency));
  pushSnap("Power Reserve", details.powerReserve);
  pushSnap("Water Resistance", details.waterResistance);
  pushSnap("Dial Color", details.dialColorType);
  pushSnap("Complications", complications);
  pushSnap("Year", year);
  pushSnap("Condition", condition);

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
  /* Crown Present is a required Sell answer — a declared fact either way.
     Only its absence (older listings, pre-question drafts) renders nothing. */
  if (typeof details.crownPresent === "boolean") {
    pushTech("Crown Present", details.crownPresent ? "Yes" : "No");
  }
  /* Checkbox semantics: unchecked is "not claimed", never "No" — so the
     original-hardware row appears only on the affirmative claim. */
  if (details.originalStrapBracelet === true) {
    pushTech("Strap / Bracelet & Hardware", "Original");
  }
  pushTech("Bracelet Wrist Size", details.braceletWristSize);
  pushTech("Included With Watch", joined(details.includedWithWatch));
  pushTech("Service & Case History", joined(details.serviceHistory));
  pushTech("Documentation", details.documentation);

  return (
    <>
      {/* SECTION 3 — Collector Snapshot */}
      {snapshotRows.length > 0 && (
        <section className="mt-8">
          <div className="pt-8">
            <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent mb-6" />
            <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--gold-dim)]">
              Collector Snapshot
            </span>
          </div>
          <SpecGrid rows={snapshotRows} />
        </section>
      )}

      {/* SECTION 4 — Technical Specifications: one continuous surface. The
          disclosure died in v4.26 — facts a buyer came to check do not hide
          behind an affordance the founder himself forgot existed. */}
      {techRows.length > 0 && (
        <section className="mt-6">
          <div className="pt-8">
            <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent mb-6" />
            <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--gold-dim)]">
              Technical Specifications
            </span>
          </div>
          <SpecGrid rows={techRows} />
        </section>
      )}
    </>
  );
}
