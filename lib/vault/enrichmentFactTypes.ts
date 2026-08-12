/* ════════════════════════════════════════════════════════════════════════
   VAULT ENRICHMENT — FACT VOCABULARY AND ENTRY RULES (client-safe)

   The shapes, the field lists, and the rules for refusing a record. Pure and
   dependency-free so the authoring form and the server planner read from ONE
   definition and cannot drift — the same arrangement lib/integrity.ts uses
   for the publish gate.

   Every builder here is a deliberate port of config/fact-types.mjs in the
   enrichment tools. The apply script re-derives the payload from `incoming`
   and refuses the plan if it does not match (STALE_PLAN), so a change here
   without a matching change there fails loudly at validation rather than
   silently at the write.

   No node: imports. No crypto. This file is bundled to the browser.
   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

/** Fact types the database CHECK on vault_enrichment_events permits. */
export const ENRICHMENT_FACT_TYPES = [
  "beat_rate",
  "power_reserve",
  "movement_dimensions",
] as const;

export type EnrichmentFactType = (typeof ENRICHMENT_FACT_TYPES)[number];

/** ALLOWLISTED_FACTS in scripts/apply-enrichment-import.mjs. A
    movement_dimensions plan is valid for the database and for the SQL path,
    but the apply SCRIPT will refuse it — so the room says so rather than
    handing over a command that cannot run. */
export const APPLY_SCRIPT_FACT_TYPES: readonly EnrichmentFactType[] = [
  "beat_rate",
  "power_reserve",
];

export const EVIDENCE_FIELDS = [
  "source_type",
  "source_name",
  "source_url",
  "date_accessed",
  "excerpt",
] as const;

export type EvidenceInput = {
  source_type?: string;
  source_name?: string;
  source_url?: string;
  date_accessed?: string;
  excerpt?: string;
  verified?: boolean;
};

export type Evidence = {
  source_type: string | null;
  source_name: string | null;
  source_url: string | null;
  date_accessed: string | null;
  excerpt: string | null;
  verified: boolean;
};

/* ── faithful ports of the tools' primitives ──────────────────────────── */

export function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function buildEvidence(record: EvidenceInput): Evidence {
  return {
    source_type: stringOrNull(record.source_type),
    source_name: stringOrNull(record.source_name),
    source_url: stringOrNull(record.source_url),
    date_accessed: stringOrNull(record.date_accessed),
    excerpt: stringOrNull(record.excerpt),
    verified: record.verified === true,
  };
}

/* ── evidence refusals — the two real-world traps, caught at the form ────

   Both were found inside already-"validated" packs: a placeholder example.com
   URL, and the prose string "Verified Independent Source" standing in for a
   source — each carrying verified: true. The old validator passed them
   because it checked envelope SHAPE, not source authenticity. These refuse
   them at entry instead of a year later. ── */

const PLACEHOLDER_HOSTS = ["example.com", "example.org", "example.net", "localhost"];
const PROSE_SOURCE_PATTERNS = [
  /^verified\s+independent\s+source$/i,
  /^independent\s+source$/i,
  /^manufacturer$/i,
  /^official\s+source$/i,
  /replace[-\s]?with[-\s]?real/i,
];

export function evidenceProblems(evidence: Evidence): string[] {
  const problems: string[] = [];
  for (const field of EVIDENCE_FIELDS) {
    if (!evidence[field]) problems.push(`evidence.${field} is required`);
  }
  if (evidence.verified !== true) {
    problems.push("evidence.verified must be true — an unverified record is not applyable");
  }
  const url = evidence.source_url;
  if (url) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(url);
    } catch {
      problems.push("evidence.source_url is not a valid absolute URL");
    }
    if (parsed) {
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        problems.push("evidence.source_url must be an http(s) URL");
      }
      const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
      if (PLACEHOLDER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
        problems.push(
          `evidence.source_url points at the placeholder host "${parsed.hostname}" — a real source is required`
        );
      }
    }
  }
  const name = evidence.source_name;
  if (name && PROSE_SOURCE_PATTERNS.some((p) => p.test(name))) {
    problems.push(
      `evidence.source_name "${name}" is a description, not a source — name the actual page or document`
    );
  }
  if (evidence.date_accessed && !/^\d{4}-\d{2}-\d{2}$/.test(evidence.date_accessed)) {
    problems.push("evidence.date_accessed must be ISO YYYY-MM-DD");
  }
  return problems;
}

/* ── fact payloads — exact ports ──────────────────────────────────────── */

export type FactValuesInput = Record<string, unknown>;

export type FactDefinition = {
  factType: EnrichmentFactType;
  label: string;
  /** Numeric fields the operator enters, in display order. */
  fields: { key: string; label: string; hint?: string; required: boolean }[];
  buildValues(input: FactValuesInput): Record<string, number | null>;
  buildPayload(input: FactValuesInput, evidence: Evidence): Record<string, unknown>;
  valueProblems(values: Record<string, number | null>): string[];
  readExisting(metadata: unknown): Record<string, number | null> | null;
};

function readFact(factType: string, metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object") return null;
  const enrichment = (metadata as Record<string, unknown>).enrichment;
  if (!enrichment || typeof enrichment !== "object") return null;
  const fact = (enrichment as Record<string, unknown>)[factType];
  return fact && typeof fact === "object" ? (fact as Record<string, unknown>) : null;
}

const beatRate: FactDefinition = {
  factType: "beat_rate",
  label: "Beat Rate",
  fields: [
    { key: "beat_rate_vph", label: "Beat rate (vph)", hint: "e.g. 28800", required: true },
    { key: "frequency_hz", label: "Frequency (Hz)", hint: "vph ÷ 7200", required: true },
  ],
  buildValues: (i) => ({
    beat_rate_vph: numberOrNull(i.beat_rate_vph),
    frequency_hz: numberOrNull(i.frequency_hz),
  }),
  buildPayload(i, evidence) {
    const v = this.buildValues(i);
    return { beat_rate_vph: v.beat_rate_vph, frequency_hz: v.frequency_hz, evidence };
  },
  valueProblems(v) {
    const p: string[] = [];
    if (v.beat_rate_vph === null || v.beat_rate_vph <= 0) {
      p.push("beat_rate_vph must be a positive number");
    }
    if (v.frequency_hz === null || v.frequency_hz <= 0) {
      p.push("frequency_hz must be a positive number");
    }
    // The tools' validator guarantees hz = vph / 7200; enforce it at entry so
    // an inconsistent pair can never reach a plan.
    if (v.beat_rate_vph !== null && v.frequency_hz !== null) {
      const expected = v.beat_rate_vph / 7200;
      if (Math.abs(expected - v.frequency_hz) > 1e-6) {
        p.push(`frequency_hz must equal vph ÷ 7200 (${v.beat_rate_vph} ÷ 7200 = ${expected})`);
      }
    }
    return p;
  },
  readExisting(metadata) {
    const f = readFact("beat_rate", metadata);
    if (!f) return null;
    return {
      beat_rate_vph: numberOrNull(f.beat_rate_vph),
      frequency_hz: numberOrNull(f.frequency_hz),
    };
  },
};

const powerReserve: FactDefinition = {
  factType: "power_reserve",
  label: "Power Reserve",
  fields: [
    {
      key: "power_reserve_hours",
      label: "Power reserve (hours)",
      hint: "leave blank if only days are stated",
      required: false,
    },
    {
      key: "power_reserve_days",
      label: "Power reserve (days)",
      hint: "leave blank if only hours are stated",
      required: false,
    },
  ],
  buildValues: (i) => ({
    power_reserve_hours: numberOrNull(i.power_reserve_hours),
    power_reserve_days: numberOrNull(i.power_reserve_days),
  }),
  buildPayload(i, evidence) {
    const v = this.buildValues(i);
    // Both keys always present; null for the absent one. canonical_hours is
    // derived-only and intentionally NOT stored (no invented display field).
    return {
      power_reserve_hours: v.power_reserve_hours,
      power_reserve_days: v.power_reserve_days,
      evidence,
    };
  },
  valueProblems(v) {
    const p: string[] = [];
    if (v.power_reserve_hours === null && v.power_reserve_days === null) {
      p.push("enter power_reserve_hours or power_reserve_days (at least one)");
    }
    for (const k of ["power_reserve_hours", "power_reserve_days"] as const) {
      const n = v[k];
      if (n !== null && n <= 0) p.push(`${k} must be a positive number`);
    }
    if (v.power_reserve_hours !== null && v.power_reserve_days !== null) {
      if (Math.abs(v.power_reserve_days * 24 - v.power_reserve_hours) > 1e-6) {
        p.push("hours and days disagree — days × 24 must equal hours");
      }
    }
    return p;
  },
  readExisting(metadata) {
    const f = readFact("power_reserve", metadata);
    if (!f) return null;
    return {
      power_reserve_hours: numberOrNull(f.power_reserve_hours),
      power_reserve_days: numberOrNull(f.power_reserve_days),
    };
  },
};

/* Movement dimensions: the contract is the shape already applied in
   production for PF703 (event c0813780…) — a single planar diameter plus the
   evidence envelope. Not accepted by the apply SCRIPT; SQL path only. */
const movementDimensions: FactDefinition = {
  factType: "movement_dimensions",
  label: "Movement Dimensions",
  fields: [
    {
      key: "movement_diameter_mm",
      label: "Movement diameter (mm)",
      hint: "the calibre, never the case",
      required: true,
    },
  ],
  buildValues: (i) => ({ movement_diameter_mm: numberOrNull(i.movement_diameter_mm) }),
  buildPayload(i, evidence) {
    const v = this.buildValues(i);
    return { movement_diameter_mm: v.movement_diameter_mm, evidence };
  },
  valueProblems(v) {
    const p: string[] = [];
    const d = v.movement_diameter_mm;
    if (d === null || d <= 0) {
      p.push("movement_diameter_mm must be a positive number");
    }
    // A movement is not a case. The PF703 plan explicitly rejected a 40.0 mm
    // CASE diameter as WRONG_PHYSICAL_OBJECT while the calibre measured 30.0;
    // this keeps that lesson enforced. 38 mm is the suspicion line: real
    // wristwatch calibres cluster well below it (7750 = 30.0, 9SA5 = 31.0,
    // PF703 = 30.0), and numbers that cross it are almost always the case.
    // It refuses rather than warns because this room has no second reviewer —
    // a genuine calibre above 38 mm is a case to raise, not to wave through.
    else if (d > 38) {
      p.push(
        `${d} mm is larger than a wristwatch calibre normally runs — this is very likely the CASE diameter, not the movement. Check the source names the calibre itself.`
      );
    }
    return p;
  },
  readExisting(metadata) {
    const f = readFact("movement_dimensions", metadata);
    if (!f) return null;
    return { movement_diameter_mm: numberOrNull(f.movement_diameter_mm) };
  },
};

export const FACT_DEFINITIONS: Record<EnrichmentFactType, FactDefinition> = {
  beat_rate: beatRate,
  power_reserve: powerReserve,
  movement_dimensions: movementDimensions,
};

export function getFactDefinition(factType: string): FactDefinition | null {
  return (FACT_DEFINITIONS as Record<string, FactDefinition>)[factType] ?? null;
}
