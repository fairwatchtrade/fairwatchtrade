import { deriveEnrichmentLines } from "@/lib/vault/enrichmentFacts";

/* ────────────────────────────────────────────────────────────────────────
   VAULT ENRICHMENT FACTS — compact, always-visible reference specs (v2.73)

   Renders verified enrichment facts (beat rate, power reserve, …) as one quiet
   value line each, directly beneath the reference number and above Market
   Evidence in the Vault variant card. Composed from canonical
   metadata.enrichment at read time via lib/vault/enrichmentFacts.ts.

   Locked visual ruling (identity fact — always visible, never hidden behind an
   interaction): quiet typography, subordinate to the reference number, no box,
   no badge, no accordion/chevron/tooltip, no dedicated widget. Value alone —
   "36,000 vph · 5 Hz" — the card context makes the fact clear. Visible by
   default on desktop AND Galaxy. Missing/malformed facts render nothing (no
   empty labels, no grey placeholders). One generic renderer, no reference- or
   fact-specific hardcoding, no sample data.
   ──────────────────────────────────────────────────────────────────────── */

export default function VaultEnrichmentFacts({ metadata }: { metadata: unknown }) {
  const lines = deriveEnrichmentLines(metadata);
  if (lines.length === 0) return null;

  return (
    <div className="mt-[3px] flex flex-col gap-[2px]">
      {lines.map((line) => (
        <div
          key={line.key}
          className="text-[10.5px] leading-[1.35] text-[var(--muted)] [overflow-wrap:anywhere]"
        >
          {line.text}
        </div>
      ))}
    </div>
  );
}
