"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ENRICHMENT_FACT_TYPES,
  FACT_DEFINITIONS,
  APPLY_SCRIPT_FACT_TYPES,
  type EnrichmentFactType,
} from "@/lib/vault/enrichmentFactTypes";

/* ────────────────────────────────────────────────────────────────────────
   VAULT ENRICHMENT — authoring room (client)

   Type the specification and the evidence for it. The room resolves the
   target against the real Vault, refuses anything that is not applyable, and
   hands back the plan file, its hash, and the statement that carries them.

   It never writes. The apply stays a deliberate, separate act.
   ──────────────────────────────────────────────────────────────────────── */

type Reference = {
  reference_id: string;
  reference: string;
  brand: { id: string; name: string; slug: string };
  collection: { id: string; name: string };
  family: { id: string; name: string };
  variant: { id: string; name: string };
  existing_facts: string[];
};

type PlanResult = {
  classification: "IMPORT" | "SKIP" | "CONFLICT";
  reason: string;
  planJson: string | null;
  planSha256Upper: string | null;
  sql: string | null;
  cliCommand: string | null;
  appliesWithScript: boolean;
  problems: string[];
  existingValues: Record<string, number | null> | null;
  plan_file_name: string;
};

const LABEL = "block font-[Inter] text-[11px] uppercase tracking-[1.6px] text-[var(--slate)]";
const INPUT =
  "fw-input mt-1.5 w-full border border-[var(--border-mid)] bg-[var(--ink-2,#111)] px-3 py-2.5 font-[Inter] text-[13px] text-[var(--platinum)] outline-none focus:border-[var(--gold)]";
const BTN =
  "border border-[var(--border-mid)] px-4 py-2.5 font-[Inter] text-[11px] uppercase tracking-[1.6px] text-[var(--slate)] transition hover:border-[var(--gold)] hover:text-[var(--platinum)] disabled:opacity-40 disabled:hover:border-[var(--border-mid)] disabled:hover:text-[var(--slate)]";

function CopyBlock({ title, body, filename }: { title: string; body: string; filename?: string }) {
  const [copied, setCopied] = useState(false);
  const download = useCallback(() => {
    // Download the exact bytes that were hashed — retyping or re-saving the
    // text by hand is how a plan silently stops matching its hash.
    const blob = new Blob([body], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename ?? "plan.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [body, filename]);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-[Inter] text-[11px] uppercase tracking-[1.6px] text-[var(--gold)]">{title}</h4>
        <div className="flex gap-2">
          {filename ? (
            <button type="button" onClick={download} className={BTN}>
              Download exact file
            </button>
          ) : null}
          <button
            type="button"
            className={BTN}
            onClick={async () => {
              await navigator.clipboard.writeText(body);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="mt-2 max-h-[320px] overflow-auto border border-[var(--border-subtle)] bg-[var(--ink-2,#0e0e0e)] p-3 font-mono text-[12px] leading-relaxed text-[var(--platinum)]">
        {body}
      </pre>
    </div>
  );
}

export default function VaultEnrichmentAuthoring() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Reference[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Reference | null>(null);

  const [factType, setFactType] = useState<EnrichmentFactType>("beat_rate");
  const [values, setValues] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({
    source_type: "manufacturer",
    source_name: "",
    source_url: "",
    date_accessed: "",
    excerpt: "",
  });
  const [verified, setVerified] = useState(false);

  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const definition = FACT_DEFINITIONS[factType];

  const search = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/vault-enrichment?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setResults(Array.isArray(json.references) ? json.references : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void search(query), 250);
    return () => clearTimeout(t);
  }, [query, search]);

  const alreadyHasFact = useMemo(
    () => Boolean(picked?.existing_facts.includes(factType)),
    [picked, factType]
  );

  async function build() {
    if (!picked) return;
    setBuilding(true);
    setError(null);
    setPlan(null);
    try {
      const res = await fetch("/api/admin/vault-enrichment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference_id: picked.reference_id,
          fact_type: factType,
          values,
          evidence: { ...evidence, verified },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(String(json.error ?? "build_failed"));
        return;
      }
      setPlan(json as PlanResult);
    } catch {
      setError("build_failed");
    } finally {
      setBuilding(false);
    }
  }

  return (
    <div className="pb-24">
      {/* ── 1 · target ─────────────────────────────────────────────────── */}
      <section className="border border-[var(--border-subtle)] p-5">
        <h3 className="font-[Inter] text-[11px] uppercase tracking-[1.6px] text-[var(--gold)]">
          1 · The reference
        </h3>
        <p className="mt-1.5 font-[Inter] text-[12px] text-[var(--slate)]">
          Only references that exist in the Vault can be a target. You cannot author a fact against
          something that isn&rsquo;t there.
        </p>

        <label className={`${LABEL} mt-4`} htmlFor="ref-search">
          Search by reference number
        </label>
        <input
          id="ref-search"
          className={INPUT}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="SBGH201, PFC914…"
          autoComplete="off"
        />

        {picked ? (
          <div className="mt-4 border border-[var(--gold-dim)] p-4">
            <div className="font-[Inter] text-[11px] uppercase tracking-[1.6px] text-[var(--gold)]">
              Selected
            </div>
            <div className="mt-1.5 font-display text-[18px] font-light text-[var(--platinum)]">
              {picked.brand.name} · {picked.reference}
            </div>
            <div className="mt-1 font-[Inter] text-[12px] text-[var(--slate)]">
              {picked.collection.name} → {picked.family.name} → {picked.variant.name}
            </div>
            {picked.existing_facts.length > 0 ? (
              <div className="mt-2 font-[Inter] text-[12px] text-[var(--platinum)]">
                Already carries: {picked.existing_facts.join(", ")}
              </div>
            ) : null}
            <button type="button" className={`${BTN} mt-3`} onClick={() => setPicked(null)}>
              Change reference
            </button>
          </div>
        ) : (
          <ul className="mt-3 max-h-[240px] overflow-auto border border-[var(--border-subtle)]">
            {searching && results.length === 0 ? (
              <li className="px-3 py-2.5 font-[Inter] text-[12px] text-[var(--slate)]">Searching…</li>
            ) : null}
            {!searching && results.length === 0 ? (
              <li className="px-3 py-2.5 font-[Inter] text-[12px] text-[var(--slate)]">
                No matching reference in the Vault.
              </li>
            ) : null}
            {results.map((r) => (
              <li key={r.reference_id} className="border-b border-[var(--border-subtle)] last:border-b-0">
                <button
                  type="button"
                  onClick={() => setPicked(r)}
                  className="w-full px-3 py-2.5 text-left transition hover:bg-[var(--border-subtle)]"
                >
                  <span className="font-[Inter] text-[13px] text-[var(--platinum)]">{r.reference}</span>
                  <span className="ml-2 font-[Inter] text-[12px] text-[var(--slate)]">
                    {r.brand.name} · {r.family.name}
                  </span>
                  {r.existing_facts.length > 0 ? (
                    <span className="ml-2 font-[Inter] text-[11px] uppercase tracking-[1px] text-[var(--gold-dim)]">
                      has {r.existing_facts.join(", ")}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 2 · the fact ───────────────────────────────────────────────── */}
      <section className="mt-6 border border-[var(--border-subtle)] p-5">
        <h3 className="font-[Inter] text-[11px] uppercase tracking-[1.6px] text-[var(--gold)]">
          2 · The specification
        </h3>

        <label className={`${LABEL} mt-4`} htmlFor="fact-type">
          Fact type
        </label>
        <select
          id="fact-type"
          className={INPUT}
          value={factType}
          onChange={(e) => {
            setFactType(e.target.value as EnrichmentFactType);
            setValues({});
            setPlan(null);
          }}
        >
          {ENRICHMENT_FACT_TYPES.map((f) => (
            <option key={f} value={f}>
              {FACT_DEFINITIONS[f].label}
            </option>
          ))}
        </select>

        {!APPLY_SCRIPT_FACT_TYPES.includes(factType) ? (
          <p className="mt-2 font-[Inter] text-[12px] text-[var(--platinum)]">
            The database accepts this fact, but the apply <em>script</em> does not — it allowlists
            beat rate and power reserve only. For this one, use the SQL statement.
          </p>
        ) : null}

        {alreadyHasFact ? (
          <p className="mt-3 border border-[var(--gold-dim)] p-3 font-[Inter] text-[12px] text-[var(--platinum)]">
            This reference already carries {definition.label.toLowerCase()}. The room will not plan
            an overwrite — changing a recorded fact is a separate, authorized decision.
          </p>
        ) : null}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {definition.fields.map((field) => (
            <div key={field.key}>
              <label className={LABEL} htmlFor={`v-${field.key}`}>
                {field.label}
              </label>
              <input
                id={`v-${field.key}`}
                className={INPUT}
                inputMode="decimal"
                value={values[field.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                placeholder={field.hint}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── 3 · evidence ───────────────────────────────────────────────── */}
      <section className="mt-6 border border-[var(--border-subtle)] p-5">
        <h3 className="font-[Inter] text-[11px] uppercase tracking-[1.6px] text-[var(--gold)]">
          3 · The evidence
        </h3>
        <p className="mt-1.5 font-[Inter] text-[12px] text-[var(--slate)]">
          Six fields, all required. A description of a source is not a source, and a placeholder URL
          is not evidence — both are refused here rather than discovered a year from now.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="e-type">Source type</label>
            <select
              id="e-type"
              className={INPUT}
              value={evidence.source_type}
              onChange={(e) => setEvidence((v) => ({ ...v, source_type: e.target.value }))}
            >
              <option value="manufacturer">manufacturer</option>
              <option value="authorized_retailer">authorized_retailer</option>
              <option value="auction_house">auction_house</option>
              <option value="press_kit">press_kit</option>
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="e-date">Date accessed (YYYY-MM-DD)</label>
            <input
              id="e-date"
              className={INPUT}
              value={evidence.date_accessed}
              onChange={(e) => setEvidence((v) => ({ ...v, date_accessed: e.target.value }))}
              placeholder="2026-08-12"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="e-name">Source name — the actual page or document</label>
            <input
              id="e-name"
              className={INPUT}
              value={evidence.source_name}
              onChange={(e) => setEvidence((v) => ({ ...v, source_name: e.target.value }))}
              placeholder="Grand Seiko — SBGH201 official product page"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="e-url">Source URL</label>
            <input
              id="e-url"
              className={INPUT}
              value={evidence.source_url}
              onChange={(e) => setEvidence((v) => ({ ...v, source_url: e.target.value }))}
              placeholder="https://…"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="e-excerpt">
              Excerpt — the source&rsquo;s own words, quoted exactly
            </label>
            <textarea
              id="e-excerpt"
              rows={3}
              className={INPUT}
              value={evidence.excerpt}
              onChange={(e) => setEvidence((v) => ({ ...v, excerpt: e.target.value }))}
              placeholder="Total dimensions: 13 ¼''' - Ø 30.0 MM"
            />
          </div>
        </div>

        <label className="mt-4 flex items-start gap-3">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
            className="mt-1 h-4 w-4 accent-[var(--gold)]"
          />
          <span className="font-[Inter] text-[13px] text-[var(--platinum)]">
            I opened this source myself and the excerpt above is its exact wording.
          </span>
        </label>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={build}
          disabled={!picked || building}
          className="border border-[var(--gold)] bg-[var(--gold-fill)] px-6 py-3 font-[Inter] text-[11px] uppercase tracking-[1.6px] text-[var(--on-gold)] transition disabled:opacity-40"
        >
          {building ? "Building…" : "Build plan"}
        </button>
        <span className="font-[Inter] text-[12px] text-[var(--slate)]">
          Nothing is written. This produces a file, a hash, and a statement.
        </span>
      </div>

      {error ? (
        <p className="mt-4 border border-[var(--border-mid)] p-3 font-[Inter] text-[13px] text-[var(--platinum)]">
          Could not build the plan: {error}
        </p>
      ) : null}

      {plan ? (
        <section className="mt-8 border border-[var(--border-subtle)] p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`px-3 py-1.5 font-[Inter] text-[11px] uppercase tracking-[1.6px] ${
                plan.classification === "IMPORT"
                  ? "bg-[var(--gold-fill)] text-[var(--on-gold)]"
                  : "border border-[var(--border-mid)] text-[var(--platinum)]"
              }`}
            >
              {plan.classification}
            </span>
            <span className="font-[Inter] text-[12px] text-[var(--slate)]">{plan.reason}</span>
          </div>

          {plan.problems.length > 0 ? (
            <ul className="mt-4 space-y-1.5">
              {plan.problems.map((p) => (
                <li key={p} className="font-[Inter] text-[13px] text-[var(--platinum)]">
                  · {p}
                </li>
              ))}
            </ul>
          ) : null}

          {plan.classification === "IMPORT" && plan.planJson && plan.planSha256Upper ? (
            <>
              <div className="mt-5">
                <div className="font-[Inter] text-[11px] uppercase tracking-[1.6px] text-[var(--gold)]">
                  Plan SHA-256
                </div>
                <div className="mt-1.5 break-all font-mono text-[13px] text-[var(--platinum)]">
                  {plan.planSha256Upper}
                </div>
                <p className="mt-2 font-[Inter] text-[12px] text-[var(--slate)]">
                  This is the hash of the plan file&rsquo;s raw bytes. Download the file rather than
                  copying the text — a re-saved variant will not match its own hash.
                </p>
              </div>

              <CopyBlock title="Plan file" body={plan.planJson} filename={plan.plan_file_name} />

              {plan.cliCommand ? (
                <CopyBlock title="Apply — the guarded path" body={plan.cliCommand} />
              ) : null}

              {plan.sql ? <CopyBlock title="Apply — direct SQL" body={plan.sql} /> : null}

              <p className="mt-5 font-[Inter] text-[12px] text-[var(--slate)]">
                The CLI path re-hashes the file on disk and refuses if it disagrees. The SQL path
                carries the hash you were given, so it records what was applied but cannot detect a
                file that changed underneath it. Prefer the CLI where it is available.
              </p>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
