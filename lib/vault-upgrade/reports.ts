/* ────────────────────────────────────────────────────────────────────────
   VAULT SPECIFICATION UPGRADE — change reports and batch downloads

   The change report is the exact ledger and unresolved-item record for one
   analyzed file, serialized deterministically (no runtime timestamps in the
   payload). Batch downloads bundle verified artifacts with jszip; entry
   dates are pinned to a fixed epoch so identical inputs produce identical
   archives.
   ──────────────────────────────────────────────────────────────────────── */

import JSZipImport from "jszip";
import type { AnalysisRecord, ContractIdentity } from "./types.ts";

const JSZip = ((JSZipImport as unknown as { default?: unknown }).default ??
  JSZipImport) as typeof JSZipImport;

export type ChangeReport = {
  reportType: "vault-specification-upgrade-change-report";
  contract: ContractIdentity;
  source: { filename: string; sha256: string; byteLength: number };
  analysis: Pick<
    AnalysisRecord,
    | "status"
    | "detection"
    | "issues"
    | "ledger"
    | "counts"
    | "parseError"
    | "engineVersion"
    | "upgradeRuleVersion"
    | "normalizationVersion"
  >;
  candidate: {
    filename: string;
    sha256: string;
    ledgerSha256: string;
    byteLength: number;
  } | null;
};

export function buildChangeReport(
  contract: ContractIdentity,
  source: { filename: string; sha256: string; byteLength: number },
  analysis: AnalysisRecord
): ChangeReport {
  return {
    reportType: "vault-specification-upgrade-change-report",
    contract,
    source,
    analysis: {
      status: analysis.status,
      detection: analysis.detection,
      issues: analysis.issues,
      ledger: analysis.ledger,
      counts: analysis.counts,
      parseError: analysis.parseError,
      engineVersion: analysis.engineVersion,
      upgradeRuleVersion: analysis.upgradeRuleVersion,
      normalizationVersion: analysis.normalizationVersion,
    },
    candidate: analysis.candidate
      ? {
          filename: analysis.candidate.filename,
          sha256: analysis.candidate.sha256,
          ledgerSha256: analysis.candidate.ledgerSha256,
          byteLength: analysis.candidate.byteLength,
        }
      : null,
  };
}

export function serializeReport(report: ChangeReport): string {
  return JSON.stringify(report, null, 2) + "\n";
}

export function reportFilename(report: ChangeReport): string {
  const base = (report.candidate?.filename ?? report.source.filename).replace(
    /\.json$/i,
    ""
  );
  return `${base}.change-report.json`;
}

/* ── Batch archives ────────────────────────────────────────────────────── */

const FIXED_ZIP_DATE = new Date(0);

export type ZipEntry = {
  filename: string;
  content: ArrayBuffer | Uint8Array | string;
};

export async function buildZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.filename, entry.content, { date: FIXED_ZIP_DATE });
  }
  return zip.generateAsync({ type: "uint8array" });
}
