import { formatMovementFrequency } from "./movementFrequency.ts";

/* ────────────────────────────────────────────────────────────────────────
   WATCH DETAIL — fixed semantic geography for Collector Snapshot and
   Technical Specifications (/listings/[id]).

   The misconception this file exists to kill:

     "The specs are a list of whatever the seller filled in."

   They are not. Facts live in predictable places so a collector builds
   spatial memory: Year is always top-right, Documentation is always the
   middle of the third row, whether or not this particular watch has a value
   there. A missing value leaves its slot in place with the label and an
   empty value. It never lets a later fact slide forward into the gap, and
   the matrix never collapses.

   Snapshot (3 x 3):
     Case Size   | Case Material | Year
     Movement    | Dial Color    | Complications
     Condition   | Documentation | reserved

   Technical Specifications:
     Closure Type  | Caseback                    | Bezel Material
     Crown Present | Strap / Bracelet & Hardware | reserved
     Included With Watch        (wide: long facts breathe)
     Service & Case History     (wide)

   Documentation lives in the Snapshot ONLY. It is the glanceable status;
   Included With Watch is the itemised contents. Two concepts, two slots.

   The Sell flow also collects facts this matrix does not name (case
   thickness, case finish, calibre, beat rate, power reserve, water
   resistance, crystal, jewel count, bracelet wrist size). The v4.26 founder
   audit ruled that a fact we hold is never hidden, so those render after
   the governed rows, present-only, and never inside a governed slot.

   Narrow screens read each row top to bottom in DOM order, so the mobile
   sequence is the desktop row-major order by construction.
   ──────────────────────────────────────────────────────────────────────── */

export type WatchDetailDetails = {
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
  documentation?: string;
  bezelMaterial?: string;
  waterResistance?: string;
  calibre?: string;
  jewels?: string;
  powerReserve?: string;
  casebackType?: string;
  crystalMaterial?: string;
};

export type SpecSlot = {
  key: string;
  label: string;
  /** Empty string means the slot is present but the value is not stated. */
  value: string;
  href?: string;
  reserved?: boolean;
};

export type SpecRow = SpecSlot[];

export type WatchDetailGeography = {
  snapshot: SpecRow[];
  snapshotExtras: SpecSlot[];
  technical: SpecRow[];
  technicalWide: SpecSlot[];
  technicalExtras: SpecSlot[];
};

export const RESERVED: SpecSlot = { key: "reserved", label: "", value: "", reserved: true };

/** The governed Snapshot reading order on a narrow screen. */
export const SNAPSHOT_SEQUENCE = [
  "Case Size",
  "Case Material",
  "Year",
  "Movement",
  "Dial Color",
  "Complications",
  "Condition",
  "Documentation",
] as const;

const MOVEMENT_LABELS: Record<string, string> = {
  "Manual Wind": "Manual Wind",
  Automatic: "Automatic",
  Quartz: "Quartz",
  "Solar/Kinetic": "Solar/Kinetic",
};

const text = (v: unknown): string => (v == null ? "" : String(v).trim());

const joined = (list?: string[]): string =>
  Array.isArray(list) && list.length > 0
    ? list.map((v) => String(v).trim()).filter(Boolean).join(", ")
    : "";

/* Clickable collector navigation (buyer-facing polish 2026-08-13 §9): only
   dimensions whose Browse filter consumes the stored value byte-for-byte get
   a destination (caseMaterial, dialColor, movement). Formatted or derived
   values (case size, beat rate, power reserve) stay text: a link built from
   a reformatted value could land on an empty filter and masquerade as a real
   path. Documentation is never a link (founder ruling 2026-09-01): it
   describes what came with this watch, not what the watch is. */
const browseLink = (param: string, raw?: string | null): string | undefined =>
  raw && String(raw).trim() !== ""
    ? `/browse?${param}=${encodeURIComponent(String(raw))}`
    : undefined;

const slot = (key: string, label: string, value: unknown, href?: string): SpecSlot => {
  const v = text(value);
  return v ? { key, label, value: v, href } : { key, label, value: "" };
};

export function composeWatchDetailGeography(
  details: WatchDetailDetails,
  year?: string | null,
  condition?: string | null,
): WatchDetailGeography {
  const movementLabel = details.movementType
    ? MOVEMENT_LABELS[details.movementType] ?? details.movementType
    : "";

  const snapshot: SpecRow[] = [
    [
      slot("caseSize", "Case Size", details.caseSizeMm ? `${details.caseSizeMm} mm` : ""),
      slot("caseMaterial", "Case Material", details.caseMaterial, browseLink("caseMaterial", details.caseMaterial)),
      slot("year", "Year", year),
    ],
    [
      slot("movement", "Movement", movementLabel, browseLink("movement", details.movementType)),
      slot("dialColor", "Dial Color", details.dialColorType, browseLink("dialColor", details.dialColorType)),
      slot("complications", "Complications", joined(details.complications)),
    ],
    [
      slot("condition", "Condition", condition),
      slot("documentation", "Documentation", details.documentation),
      RESERVED,
    ],
  ];

  /* Crown Present is a required Sell answer, a declared fact either way.
     Only its absence (older listings, pre-question drafts) leaves the slot
     empty. The original-hardware checkbox is a claim: unchecked means "not
     claimed", never "No", so the slot fills only on the affirmative. */
  const crown = typeof details.crownPresent === "boolean" ? (details.crownPresent ? "Yes" : "No") : "";
  const strap = details.originalStrapBracelet === true ? "Original" : "";

  const technical: SpecRow[] = [
    [
      slot("closureType", "Closure Type", details.closureType),
      slot("caseback", "Caseback", details.casebackType),
      slot("bezelMaterial", "Bezel Material", details.bezelMaterial),
    ],
    [
      slot("crownPresent", "Crown Present", crown),
      slot("strapHardware", "Strap / Bracelet & Hardware", strap),
      RESERVED,
    ],
  ];

  const technicalWide: SpecSlot[] = [
    slot("includedWithWatch", "Included With Watch", joined(details.includedWithWatch)),
    slot("serviceHistory", "Service & Case History", joined(details.serviceHistory)),
  ];

  const present = (slots: SpecSlot[]) => slots.filter((s) => s.value !== "");

  const snapshotExtras = present([
    slot("caseThickness", "Case Thickness", details.caseThicknessMm ? `${details.caseThicknessMm} mm` : ""),
    slot("caseFinish", "Case Finish", details.caseColorFinish),
    slot("calibre", "Calibre", details.calibre),
    slot("beatRate", "Beat Rate", formatMovementFrequency(details.movementFrequency)),
    slot("powerReserve", "Power Reserve", details.powerReserve),
    slot("waterResistance", "Water Resistance", details.waterResistance),
  ]);

  const technicalExtras = present([
    slot("crystal", "Crystal", details.crystalMaterial),
    slot("jewels", "Jewel Count", details.jewels),
    slot("braceletWristSize", "Bracelet Wrist Size", details.braceletWristSize),
  ]);

  return { snapshot, snapshotExtras, technical, technicalWide, technicalExtras };
}

/** Rows of three for the present-only continuation facts. */
export function chunkRows(slots: SpecSlot[], width = 3): SpecRow[] {
  const rows: SpecRow[] = [];
  for (let i = 0; i < slots.length; i += width) rows.push(slots.slice(i, i + width));
  return rows;
}
