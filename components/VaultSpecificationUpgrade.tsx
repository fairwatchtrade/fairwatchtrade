"use client";

/* ────────────────────────────────────────────────────────────────────────
   VAULT SPECIFICATION UPGRADE — the room (client component)

   Two-pane file workflow: Input Files → structural upgrade → Updated
   Candidates, with an exact change-review surface below. All state lives
   in this browser's IndexedDB — labeled honestly as local staging. The
   engine is deterministic and never invents truth; every status shown here
   is a file-upgrade status only, never certification, reconciliation,
   ingestion, or publication.
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import { createUpgradeEngine, type UpgradeEngine } from "@/lib/vault-upgrade/analyze.ts";
import {
  completeUpgrade,
  CompletionCancelled,
} from "@/lib/vault-upgrade/complete.ts";
import WatchSpinner from "@/components/WatchSpinner";
import { createBrowserResearchTransport } from "@/lib/vault-upgrade/researchClient.ts";
import { verifySchemaCompanion } from "@/lib/vault-upgrade/contracts/vault-lock-v3.2.manifest.ts";
import schemaJson from "@/lib/vault-upgrade/contracts/vault-lock-v3.2.schema.json";
import { utf8Bytes, utf8Text } from "@/lib/vault-upgrade/hash.ts";
import {
  intakeFile,
  openVaultUpgradeDb,
  removeCandidate,
  removeWorkItem,
  saveAnalysis,
  saveCompletion,
  setReviewState,
  stageCandidate,
  unstageCandidate,
  verifyCandidateForDelivery,
  verifyProvisionalForDelivery,
  type VaultUpgradeDb,
} from "@/lib/vault-upgrade/indexedDb.ts";
import {
  buildChangeReport,
  buildCompletionReport,
  buildZip,
  completionReportFilename,
  reportFilename,
  serializeCompletionReport,
  serializeReport,
  type ZipEntry,
} from "@/lib/vault-upgrade/reports.ts";
import {
  BLOCKED_STATUSES,
  COMPLETABLE_STATUSES,
  FILTERS,
  filterCounts as computeFilterCounts,
  filterWorkItems,
  rowStatus,
  UNRESOLVED_STATUSES,
  type FilterKey,
  type RowStatus,
} from "@/lib/vault-upgrade/filters.ts";
import type {
  CompletionPhase,
  ContractIdentity,
  ContractVerification,
  WorkItem,
} from "@/lib/vault-upgrade/types.ts";

export type ServerContractResult =
  | { ok: true; identity: ContractIdentity }
  | { ok: false; detail: string };

/* ── Status presentation: text + glyph, never color alone ──────────────── */

const STATUS_META: Record<
  RowStatus,
  { glyph: string; label: string; className: string }
> = {
  UPLOADED: {
    glyph: "○",
    label: "Awaiting analysis",
    className: "text-[var(--slate)]",
  },
  CURRENT_SPEC_NO_CHANGE: {
    glyph: "✓",
    label: "Current v3.2 — no change",
    className: "text-[var(--platinum-dim)]",
  },
  STRUCTURAL_UPGRADE_READY: {
    glyph: "✦",
    label: "Upgrade ready",
    className: "text-[var(--gold)]",
  },
  RESEARCH_REQUIRED: {
    glyph: "⚠",
    label: "Research required",
    className: "text-[#d8b36d]",
  },
  DECISION_REQUIRED: {
    glyph: "⚑",
    label: "Decision required",
    className: "text-[#779ec8]",
  },
  UNSUPPORTED_SOURCE_FORMAT: {
    glyph: "∅",
    label: "Unsupported format",
    className: "text-[var(--danger)]",
  },
  AMBIGUOUS_SOURCE_FORMAT: {
    glyph: "≈",
    label: "Ambiguous format",
    className: "text-[var(--danger)]",
  },
  INVALID_JSON: {
    glyph: "✕",
    label: "Invalid JSON",
    className: "text-[var(--danger)]",
  },
  DUPLICATE_SOURCE: {
    glyph: "⧉",
    label: "Duplicate source",
    className: "text-[var(--slate)]",
  },
  ACTIVE_CONTRACT_MISMATCH: {
    glyph: "■",
    label: "Contract mismatch",
    className: "text-[var(--danger)]",
  },
  BLOCKED: {
    glyph: "■",
    label: "Blocked",
    className: "text-[var(--danger)]",
  },
  CANDIDATE_READY: {
    glyph: "✦",
    label: "Candidate ready",
    className: "text-[var(--gold)]",
  },
  READY_WITH_HUMAN_DECISIONS: {
    glyph: "✦",
    label: "Ready — decisions noted",
    className: "text-[var(--gold)]",
  },
  HUMAN_DECISION_REQUIRED: {
    glyph: "⚑",
    label: "Needs your decision",
    className: "text-[#779ec8]",
  },
  BLOCKED_PROVIDER_AUTHORIZATION: {
    glyph: "■",
    label: "Research not configured",
    className: "text-[var(--danger)]",
  },
  FAILED_RETRYABLE: {
    glyph: "↻",
    label: "Failed — retry safe",
    className: "text-[#d8b36d]",
  },
};

/** Operator-facing phase labels for a running completion. */
const PHASE_LABEL: Record<CompletionPhase, string> = {
  ANALYZING: "Analyzing",
  STRUCTURAL_UPGRADE: "Converting structure",
  RESEARCHING: "Researching",
  REFERENCE_PASS: "Checking references",
  VALIDATING: "Validating",
  FREEZING: "Freezing candidate",
  DONE: "Done",
};

type ReviewTab =
  | "summary"
  | "changes"
  | "decisions"
  | "sources"
  | "unresolved"
  | "original"
  | "candidate"
  | "source";

const REVIEW_TABS: { key: ReviewTab; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "changes", label: "Exact Changes" },
  { key: "decisions", label: "Your Decisions" },
  { key: "sources", label: "Sources" },
  { key: "unresolved", label: "Unresolved Items" },
  { key: "original", label: "Original JSON" },
  { key: "candidate", label: "Candidate JSON" },
  { key: "source", label: "Source Details" },
];

function shortValue(value: unknown, max = 120): string {
  if (value === undefined) return "—";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * Elapsed wall-clock time for a run in progress. Measured, never estimated:
 * this room has no idea how long a research round will take, so it reports
 * how long the work has actually been running and claims nothing further.
 */
function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function downloadBlob(
  filename: string,
  content: ArrayBuffer | Uint8Array | string,
  type: string
): void {
  const blob = new Blob([content as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sortItems(list: WorkItem[]): WorkItem[] {
  return [...list].sort(
    (a, b) =>
      a.sourceFilename.localeCompare(b.sourceFilename) ||
      a.sourceSha256.localeCompare(b.sourceSha256)
  );
}

const BTN =
  "border border-[var(--border-mid)] px-3 py-2 font-[Inter] text-[10px] uppercase tracking-[1.5px] text-[var(--slate)] transition hover:border-[var(--border-subtle)] hover:text-[var(--platinum)] disabled:cursor-not-allowed disabled:opacity-40";
const BTN_GOLD =
  "bg-[var(--gold)] px-3 py-2 font-[Inter] text-[10px] uppercase tracking-[1.5px] text-[var(--ink)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";

export default function VaultSpecificationUpgrade({
  serverContract,
  operator,
}: {
  serverContract: ServerContractResult;
  operator: string;
}) {
  const dbRef = useRef<VaultUpgradeDb | null>(null);
  const engineRef = useRef<UpgradeEngine | null>(null);
  const [contract, setContract] = useState<ContractVerification | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [notice, setNotice] = useState<{
    kind: "info" | "error";
    text: string;
  } | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [activeHash, setActiveHash] = useState<string | null>(null);
  const [reviewTab, setReviewTab] = useState<ReviewTab>("summary");
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set());
  /** hash → operator-facing progress line while a completion is running. */
  const [completing, setCompleting] = useState<Map<string, string>>(new Map());
  /* When each active run began, so the room can show real elapsed time. A
     run is timed from the moment it starts and keeps counting across
     research rounds — resetting per round would suggest the work had
     started over when it has not. */
  const [startedAt, setStartedAt] = useState<Map<string, number>>(new Map());
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const cancelRef = useRef<Map<string, { aborted: boolean }>>(new Map());
  const transportRef = useRef(createBrowserResearchTransport());
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [prettyOriginal, setPrettyOriginal] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* ── Initialization: contract binding, engine, local queue resume ────── */
  /* Ticks only while something is actually running, and the cleanup stops it
     the moment the last run reaches a terminal state — so the clock can
     never keep counting against work that has already finished. */
  useEffect(() => {
    if (completing.size === 0) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [completing.size]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let verified: ContractVerification;
      if (serverContract.ok) {
        // Client-side re-check of the executable companion binding.
        verified = await verifySchemaCompanion(
          schemaJson as Record<string, unknown>
        );
      } else {
        verified = {
          ok: false,
          code: "ACTIVE_CONTRACT_MISMATCH",
          detail: serverContract.detail,
        };
      }
      if (cancelled) return;
      setContract(verified);
      engineRef.current = createUpgradeEngine(
        schemaJson as Record<string, unknown>,
        verified
      );
      try {
        const db = await openVaultUpgradeDb();
        if (cancelled) {
          db.close();
          return;
        }
        dbRef.current = db;
        const all = await db.getAll();
        if (cancelled) return;
        setItems(sortItems(all));
        setStorageReady(true);
      } catch (err) {
        if (!cancelled) {
          setStorageError(
            err instanceof Error ? err.message : "IndexedDB is unavailable."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serverContract]);

  async function refresh(): Promise<void> {
    const db = dbRef.current;
    if (!db) return;
    setItems(sortItems(await db.getAll()));
  }

  /* ── Intake ──────────────────────────────────────────────────────────── */

  async function acceptFiles(files: File[]): Promise<void> {
    const db = dbRef.current;
    if (!db) return;
    const jsonFiles = files.filter((f) => /\.json$/i.test(f.name));
    const rejected = files.filter((f) => !/\.json$/i.test(f.name));
    let added = 0;
    let duplicates = 0;
    for (const file of jsonFiles) {
      try {
        const bytes = await file.arrayBuffer();
        const result = await intakeFile(
          db,
          { filename: file.name, bytes },
          operator,
          new Date().toISOString()
        );
        if (result.duplicate) duplicates++;
        else added++;
      } catch (err) {
        setNotice({
          kind: "error",
          text: `Could not accept "${file.name}": ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      }
    }
    await refresh();
    const parts: string[] = [];
    if (added) parts.push(`${added} file${added === 1 ? "" : "s"} accepted`);
    if (duplicates)
      parts.push(
        `${duplicates} duplicate upload${
          duplicates === 1 ? "" : "s"
        } of identical bytes resolved to existing work items`
      );
    if (rejected.length)
      parts.push(
        `rejected (not JSON): ${rejected.map((f) => f.name).join(", ")}`
      );
    if (parts.length) {
      setNotice({
        kind: rejected.length ? "error" : "info",
        text: parts.join(" · "),
      });
    }
  }

  /* ── Analysis ────────────────────────────────────────────────────────── */

  async function analyze(hashes: string[]): Promise<void> {
    const db = dbRef.current;
    const engine = engineRef.current;
    if (!db || !engine || hashes.length === 0) return;
    setBusy(true);
    for (const hash of hashes) {
      setAnalyzing((prev) => new Set(prev).add(hash));
      try {
        const item = await db.get(hash);
        if (!item) continue;
        const record = await engine.analyzeSource({
          filename: item.sourceFilename,
          bytes: item.sourceBytes,
        });
        const candidateBytes = record.candidate
          ? (utf8Bytes(record.candidate.text).buffer as ArrayBuffer)
          : null;
        await saveAnalysis(
          db,
          hash,
          record,
          candidateBytes,
          new Date().toISOString()
        );
        await refresh();
      } catch (err) {
        setNotice({
          kind: "error",
          text: `Analysis failed for one file: ${
            err instanceof Error ? err.message : String(err)
          }. The work item is unchanged — retry is safe.`,
        });
      } finally {
        setAnalyzing((prev) => {
          const next = new Set(prev);
          next.delete(hash);
          return next;
        });
      }
    }
    setBusy(false);
  }

  /* ── Completion: the room actually finishes the file ─────────────────── */

  /**
   * Run the full completion pass over each selected file: deterministic
   * conversion, sourced research for the gaps, a dedicated reference pass,
   * then validation until a candidate is strict-valid or only genuine
   * decisions remain.
   *
   * Each file is independent. One file's failure never touches another's
   * work, and cancelling leaves the original bytes exactly as uploaded.
   */
  async function runCompletion(hashes: string[]): Promise<void> {
    const db = dbRef.current;
    const engine = engineRef.current;
    if (!db || !engine || hashes.length === 0) return;
    if (!contract?.ok) {
      setNotice({
        kind: "error",
        text: "The active contract is not verified — completion is blocked.",
      });
      return;
    }

    setBusy(true);
    let completed = 0;
    let withDecisions = 0;
    let failed = 0;

    for (const hash of hashes) {
      const signal = { aborted: false };
      cancelRef.current.set(hash, signal);
      setCompleting((prev) => new Map(prev).set(hash, "Starting…"));
      setStartedAt((prev) => new Map(prev).set(hash, Date.now()));
      try {
        const item = await db.get(hash);
        if (!item) continue;

        const record = await completeUpgrade({
          engine,
          schema: schemaJson as Record<string, unknown>,
          contract,
          filename: item.sourceFilename,
          bytes: item.sourceBytes,
          transport: transportRef.current,
          signal,
          onPhase: (phase, detail) => {
            setCompleting((prev) =>
              new Map(prev).set(
                hash,
                detail
                  ? `${PHASE_LABEL[phase]} — ${detail}`
                  : PHASE_LABEL[phase]
              )
            );
          },
        });

        const candidateBytes = record.candidate
          ? (utf8Bytes(record.candidate.text).buffer as ArrayBuffer)
          : null;
        /* A held run still produced work. Keep its bytes so the operator can
           take the upgraded file away with the decision still open. */
        const provisionalBytes = record.provisionalCandidate
          ? (utf8Bytes(record.provisionalCandidate.text).buffer as ArrayBuffer)
          : null;
        await saveCompletion(
          db,
          hash,
          record,
          candidateBytes,
          provisionalBytes,
          new Date().toISOString()
        );
        await refresh();

        if (record.status === "CANDIDATE_READY") completed++;
        else if (record.status === "READY_WITH_HUMAN_DECISIONS") {
          completed++;
          withDecisions += record.counts.humanDecisions;
        } else if (
          record.status === "HUMAN_DECISION_REQUIRED" ||
          record.status === "CURRENT_V3_2_NO_CHANGE"
        ) {
          withDecisions += record.counts.humanDecisions;
        } else {
          failed++;
          setNotice({
            kind: "error",
            text:
              record.status === "BLOCKED_PROVIDER_AUTHORIZATION"
                ? `Research is not configured on the server: ${record.blocker ?? ""}`
                : `"${item.sourceFilename}" could not be completed: ${
                    record.blocker ?? record.status
                  }. The original is unchanged — retry is safe.`,
          });
        }
      } catch (err) {
        if (err instanceof CompletionCancelled) {
          setNotice({
            kind: "info",
            text: "Completion cancelled. The original file and all other work items are unchanged.",
          });
        } else {
          failed++;
          setNotice({
            kind: "error",
            text: `Completion failed for one file: ${
              err instanceof Error ? err.message : String(err)
            }. The original is unchanged — retry is safe.`,
          });
        }
      } finally {
        cancelRef.current.delete(hash);
        /* Terminal — done, failed, or cancelled. The clock stops here, in
           the one place every outcome passes through. */
        setCompleting((prev) => {
          const next = new Map(prev);
          next.delete(hash);
          return next;
        });
        setStartedAt((prev) => {
          const next = new Map(prev);
          next.delete(hash);
          return next;
        });
      }
    }

    setBusy(false);
    if (completed > 0 && failed === 0) {
      setNotice({
        kind: "info",
        text: `${completed} candidate${completed === 1 ? "" : "s"} completed${
          withDecisions > 0
            ? ` · ${withDecisions} decision${
                withDecisions === 1 ? "" : "s"
              } noted for you`
            : ""
        }.`,
      });
    }
  }

  function cancelCompletion(hash?: string): void {
    if (hash) {
      const signal = cancelRef.current.get(hash);
      if (signal) signal.aborted = true;
      return;
    }
    for (const signal of cancelRef.current.values()) signal.aborted = true;
  }

  /** Files with supportable work left that the room can complete. */
  const completable = useMemo(
    () => items.filter((i) => COMPLETABLE_STATUSES.includes(rowStatus(i))),
    [items]
  );

  /* ── Downloads (always re-verified from exact stored bytes) ──────────── */

  async function downloadOriginal(item: WorkItem): Promise<void> {
    downloadBlob(item.sourceFilename, item.sourceBytes, "application/json");
  }

  async function downloadCandidate(item: WorkItem): Promise<void> {
    const db = dbRef.current;
    if (!db) return;
    /* Which artifact this item has is decided by its run, not guessed here:
       a held run produces a provisional and no candidate, and the verifier
       for each refuses the other outright. Choosing the path up front keeps
       the failure message precise instead of reporting the wrong absence. */
    const held =
      !item.completion?.candidate && item.completion?.provisionalCandidate;
    try {
      const verified = held
        ? await verifyProvisionalForDelivery(db, item.sourceSha256)
        : await verifyCandidateForDelivery(db, item.sourceSha256);
      downloadBlob(verified.filename, verified.bytes, "application/json");
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function reportFor(item: WorkItem) {
    if (!contract?.ok || !item.analysis) return null;
    return buildChangeReport(
      contract.identity,
      {
        filename: item.sourceFilename,
        sha256: item.sourceSha256,
        byteLength: item.sourceByteLength,
      },
      item.analysis
    );
  }

  async function downloadReport(item: WorkItem): Promise<void> {
    const source = {
      filename: item.sourceFilename,
      sha256: item.sourceSha256,
      byteLength: item.sourceByteLength,
    };
    /* After a completion the operative record is the completion report —
       it carries the researched facts and their sources, which the
       structural change report has no place for. */
    if (contract?.ok && item.completion) {
      const report = buildCompletionReport(
        contract.identity,
        source,
        item.completion
      );
      downloadBlob(
        completionReportFilename(report),
        serializeCompletionReport(report),
        "application/json"
      );
      return;
    }
    const report = reportFor(item);
    if (!report) {
      setNotice({
        kind: "error",
        text: "No analysis exists for this file yet — analyze it first.",
      });
      return;
    }
    downloadBlob(
      reportFilename(report),
      serializeReport(report),
      "application/json"
    );
  }

  async function downloadSelectedCandidates(): Promise<void> {
    const db = dbRef.current;
    if (!db) return;
    const chosen = items.filter((i) => selection.has(i.sourceSha256));
    const entries: ZipEntry[] = [];
    const skipped: string[] = [];
    let ready = 0;
    let provisional = 0;

    for (const item of chosen) {
      /* No pre-check here. The verifiers are the single authority on whether
         an artifact can be delivered; they re-verify the stored bytes before
         releasing them. A second opinion in this loop is exactly how a
         completed file that HAD a candidate was reported as having none.

         Final first, then held work. The two can never both exist for one
         item — verifyProvisionalForDelivery refuses outright if a final
         candidate is present — so the folder a file lands in is decided by
         the run itself, not by the order of these calls. */
      try {
        const verified = await verifyCandidateForDelivery(db, item.sourceSha256);
        entries.push({
          filename: `ready/${verified.filename}`,
          content: verified.bytes,
        });
        ready++;
      } catch {
        try {
          const held = await verifyProvisionalForDelivery(db, item.sourceSha256);
          entries.push({
            filename: `decision-required/${held.filename}`,
            content: held.bytes,
          });
          provisional++;
        } catch (err) {
          skipped.push(
            `${item.sourceFilename} (${
              err instanceof Error ? err.message : "verification failed"
            })`
          );
          continue;
        }
      }
      /* The report travels with its file. For a held file it carries the
         exact decision that held it, so the reason arrives in the same
         operation as the work — never a second trip. */
      const report = reportFor(item);
      if (report) {
        entries.push({
          filename: `reports/${reportFilename(report)}`,
          content: serializeReport(report),
        });
      }
    }

    if (entries.length === 0) {
      setNotice({
        kind: "error",
        text: "None of the selected work items has a verified candidate or provisional work product to download.",
      });
      return;
    }
    downloadBlob(
      "vault-upgrade-candidates.zip",
      await buildZip(entries),
      "application/zip"
    );
    const parts = [
      `${ready} final candidate${ready === 1 ? "" : "s"} in ready/`,
      `${provisional} provisional file${
        provisional === 1 ? "" : "s"
      } in decision-required/`,
    ];
    setNotice({
      kind: skipped.length ? "error" : "info",
      text: `${parts.join(" · ")}${
        skipped.length ? ` · skipped: ${skipped.join(", ")}` : ""
      }. Provisional files are not final — one decision remains on each.`,
    });
  }

  async function downloadSelectedReports(): Promise<void> {
    const chosen = items.filter((i) => selection.has(i.sourceSha256));
    const entries: ZipEntry[] = [];
    const skipped: string[] = [];
    for (const item of chosen) {
      const report = reportFor(item);
      if (!report) {
        skipped.push(item.sourceFilename);
        continue;
      }
      entries.push({
        filename: reportFilename(report),
        content: serializeReport(report),
      });
    }
    if (entries.length === 0) {
      setNotice({
        kind: "error",
        text: "None of the selected work items has an analysis report yet.",
      });
      return;
    }
    downloadBlob(
      "vault-upgrade-change-reports.zip",
      await buildZip(entries),
      "application/zip"
    );
    setNotice({
      kind: skipped.length ? "error" : "info",
      text: `${entries.length} report${entries.length === 1 ? "" : "s"} downloaded${
        skipped.length ? ` · skipped (not analyzed): ${skipped.join(", ")}` : ""
      }`,
    });
  }

  /* ── Staging and queue actions ───────────────────────────────────────── */

  async function stageSelected(): Promise<void> {
    const db = dbRef.current;
    if (!db) return;
    const chosen = items.filter((i) => selection.has(i.sourceSha256));
    let staged = 0;
    const skipped: string[] = [];
    for (const item of chosen) {
      try {
        await stageCandidate(
          db,
          item.sourceSha256,
          operator,
          new Date().toISOString()
        );
        staged++;
      } catch {
        skipped.push(item.sourceFilename);
      }
    }
    await refresh();
    setNotice({
      kind: skipped.length ? "error" : "info",
      text: `${staged} candidate${
        staged === 1 ? "" : "s"
      } saved to local staging (stored in this browser)${
        skipped.length ? ` · no candidate to stage: ${skipped.join(", ")}` : ""
      }. Staging never certifies, reconciles, ingests, or publishes.`,
    });
  }

  /**
   * The way back out of staging. Both removal paths refuse a staged item and
   * say to clear staging first, so until this existed that instruction named
   * an action the room could not perform.
   */
  async function unstageSelected(): Promise<void> {
    const db = dbRef.current;
    if (!db) return;
    const staged = items.filter(
      (i) => selection.has(i.sourceSha256) && i.staging !== null
    );
    if (staged.length === 0) {
      setNotice({
        kind: "info",
        text: "None of the selected work items is in local staging.",
      });
      return;
    }
    let cleared = 0;
    const failed: string[] = [];
    for (const item of staged) {
      try {
        await unstageCandidate(db, item.sourceSha256, new Date().toISOString());
        cleared++;
      } catch {
        failed.push(item.sourceFilename);
      }
    }
    await refresh();
    setNotice({
      kind: failed.length ? "error" : "info",
      text: `${cleared} candidate${
        cleared === 1 ? "" : "s"
      } removed from local staging — the candidate and the original file are untouched${
        failed.length ? ` · could not clear: ${failed.join(", ")}` : ""
      }.`,
    });
  }

  async function removeSelected(): Promise<void> {
    const db = dbRef.current;
    if (!db) return;
    const chosen = items.filter((i) => selection.has(i.sourceSha256));
    if (chosen.length === 0) return;
    if (
      !window.confirm(
        `Remove ${chosen.length} work item${
          chosen.length === 1 ? "" : "s"
        } from the local queue? Staged items are protected and will be skipped. Originals on disk are untouched.`
      )
    ) {
      return;
    }
    let removed = 0;
    const protectedItems: string[] = [];
    const stillSelected = new Set<string>();
    for (const item of chosen) {
      try {
        await removeWorkItem(db, item.sourceSha256);
        removed++;
        if (activeHash === item.sourceSha256) setActiveHash(null);
      } catch {
        protectedItems.push(item.sourceFilename);
        stillSelected.add(item.sourceSha256);
      }
    }
    /* Keep exactly what could not be removed. Clearing the whole selection
       here meant a refused batch cost the operator every checkbox — on a
       large selection, re-ticking them was the only way to find out which
       file blocked. What survives is what still needs attention. */
    setSelection(stillSelected);
    await refresh();
    setNotice({
      kind: protectedItems.length ? "error" : "info",
      text: `${removed} work item${removed === 1 ? "" : "s"} removed${
        protectedItems.length
          ? ` · staged (protected): ${protectedItems.join(", ")}`
          : ""
      }`,
    });
  }

  async function dismissItem(item: WorkItem): Promise<void> {
    const db = dbRef.current;
    if (!db) return;
    if (
      !window.confirm(
        `Dismiss "${item.sourceFilename}" from the local queue? The file on disk is untouched.`
      )
    ) {
      return;
    }
    try {
      await removeWorkItem(db, item.sourceSha256);
      if (activeHash === item.sourceSha256) setActiveHash(null);
      /* The row is gone; its hash must not linger in the selection, or the
         count reports files that no longer exist. */
      setSelection((prev) => {
        const next = new Set(prev);
        next.delete(item.sourceSha256);
        return next;
      });
      await refresh();
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function removeCandidateFor(item: WorkItem): Promise<void> {
    const db = dbRef.current;
    if (!db) return;
    try {
      await removeCandidate(db, item.sourceSha256, new Date().toISOString());
      await refresh();
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function setReview(
    item: WorkItem,
    state: "RETURNED_FOR_RESEARCH" | "HELD_FOR_DECISION"
  ): Promise<void> {
    const db = dbRef.current;
    if (!db) return;
    await setReviewState(
      db,
      item.sourceSha256,
      item.reviewState === state ? "NONE" : state,
      new Date().toISOString()
    );
    await refresh();
  }

  /* ── Derived views ───────────────────────────────────────────────────── */

  const filtered = useMemo(
    () => filterWorkItems(items, filter, search),
    [items, filter, search]
  );

  const candidates = useMemo(
    () =>
      filtered.filter((i) => i.completion?.candidate ?? i.analysis?.candidate),
    [filtered]
  );

  const filterCounts = useMemo(() => computeFilterCounts(items), [items]);

  const activeItem = useMemo(
    () => items.find((i) => i.sourceSha256 === activeHash) ?? null,
    [items, activeHash]
  );

  function openNext(statuses: RowStatus[], label: string): void {
    const next = items.find((i) => statuses.includes(rowStatus(i)));
    if (!next) {
      setNotice({ kind: "info", text: `No ${label} work items.` });
      return;
    }
    setActiveHash(next.sourceSha256);
    setReviewTab("unresolved");
  }

  function toggleSelection(hash: string): void {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  }

  const unanalyzed = items.filter((i) => !i.analysis).length;

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div>
      {/* Active governing specification — derived from verified truth. */}
      <section className="mb-6 border border-[var(--border-subtle)] bg-[var(--surface)] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[9px] uppercase tracking-[2.5px] text-[var(--gold-dim)]">
              Active governing specification
            </div>
            {contract === null ? (
              <div className="mt-2 text-[13px] text-[var(--muted)]">
                Verifying contract binding&hellip;
              </div>
            ) : contract.ok ? (
              <div className="mt-2">
                <div className="font-display text-[16px] font-light text-[var(--platinum)]">
                  {contract.identity.specificationFilename}
                  <span className="ml-3 text-[11px] uppercase tracking-[1.5px] text-[#78b58a]">
                    &#9679; Active
                  </span>
                </div>
                <div className="mt-1 break-all font-mono text-[10px] text-[var(--slate)]">
                  SHA-256 {contract.identity.specificationSha256}
                </div>
                <div className="mt-1 text-[11px] text-[var(--muted)]">
                  contract {contract.identity.contractId} &middot; rules{" "}
                  {contract.identity.upgradeRuleVersion} &middot;{" "}
                  {contract.identity.normalizationVersion} &middot; registered{" "}
                  {contract.identity.registeredOn}
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <div className="text-[14px] text-[var(--danger)]">
                  &#9632; ACTIVE_CONTRACT_MISMATCH &mdash; candidate generation
                  is blocked.
                </div>
                <div className="mt-1 text-[12px] text-[var(--muted)]">
                  {contract.detail}
                </div>
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-[2.5px] text-[var(--gold-dim)]">
              Work queue
            </div>
            <div className="mt-2 text-[13px] text-[var(--platinum-dim)]">
              {items.length} file{items.length === 1 ? "" : "s"} &middot;{" "}
              {items.filter((i) => i.staging).length} staged
            </div>
            <div className="mt-1 text-[11px] italic text-[var(--muted)]">
              Local staging &mdash; stored in this browser.
            </div>
          </div>
        </div>
      </section>

      {storageError && (
        <div className="mb-6 border border-red-900 bg-[var(--surface)] px-5 py-3 text-[13px] text-[var(--danger)]">
          Local work queue unavailable: {storageError}
        </div>
      )}

      {/* Intake */}
      <section
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void acceptFiles([...e.dataTransfer.files]);
        }}
        className={`mb-6 border border-dashed px-6 py-8 text-center transition ${
          dragging
            ? "border-[var(--gold)] bg-[rgba(201,168,76,0.05)]"
            : "border-[var(--border-mid)] bg-[var(--surface)]"
        }`}
      >
        <div className="font-display text-[18px] font-light text-[var(--platinum)]">
          Drop older Vault JSON files here
        </div>
        <p className="mt-1 text-[12px] text-[var(--muted)]">
          One or more JSON files. Originals are preserved exactly &mdash;
          nothing leaves this browser.
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!storageReady}
          className={`mt-4 ${BTN_GOLD}`}
        >
          Choose Files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          multiple
          className="hidden"
          aria-label="Add Vault JSON files"
          onChange={(e) => {
            void acceptFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </section>

      {notice && (
        <div
          role="status"
          className={`mb-6 border px-5 py-3 text-[12px] ${
            notice.kind === "error"
              ? "border-red-900 text-[var(--danger)]"
              : "border-[var(--border-subtle)] text-[var(--platinum-dim)]"
          } bg-[var(--surface)]`}
        >
          <div className="flex items-start justify-between gap-4">
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-[var(--slate)] hover:text-[var(--platinum)]"
              aria-label="Dismiss message"
            >
              &#10005;
            </button>
          </div>
        </div>
      )}

      {/* Toolbar: search, filters, selection, navigation */}
      <section className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search filename or Brand&hellip;"
            aria-label="Search by filename or Brand"
            className="min-w-[220px] flex-1 border border-[var(--border-mid)] bg-[var(--surface)] px-3 py-2 font-[Inter] text-[12px] text-[var(--platinum)] placeholder:text-[var(--ghost)] focus:border-[var(--border-gold)] focus:outline-none sm:flex-none"
          />
          <button
            type="button"
            className={BTN}
            onClick={() =>
              setSelection(new Set(filtered.map((i) => i.sourceSha256)))
            }
            disabled={filtered.length === 0}
          >
            Select all filtered ({filtered.length})
          </button>
          <button
            type="button"
            className={BTN}
            onClick={() => setSelection(new Set())}
            disabled={selection.size === 0}
          >
            Clear selection
          </button>
          <button
            type="button"
            className={BTN}
            onClick={() => openNext(UNRESOLVED_STATUSES, "unresolved")}
          >
            Open next unresolved
          </button>
          <button
            type="button"
            className={BTN}
            onClick={() => openNext(BLOCKED_STATUSES, "blocked")}
          >
            Open next blocked
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`px-3 py-1.5 font-[Inter] text-[10px] uppercase tracking-[1.5px] transition ${
                filter === f.key
                  ? "bg-[var(--gold)] text-[var(--ink)]"
                  : "border border-[var(--border-mid)] text-[var(--slate)] hover:text-[var(--platinum)]"
              }`}
            >
              {f.label} ({filterCounts.get(f.key) ?? 0})
            </button>
          ))}
        </div>
      </section>

      {/* Two-pane workspace */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {/* Input Files */}
        <div className="border border-[var(--border-subtle)] bg-[var(--surface)]">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
            <div className="font-display text-[15px] font-light text-[var(--platinum)]">
              Input Files
            </div>
            <div className="text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]">
              {filtered.length} shown &middot; {selection.size} selected
            </div>
          </div>
          <div className="max-h-[420px] overflow-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12px] italic text-[var(--muted)]">
                {items.length === 0
                  ? "No files yet. Drop Vault JSON files above to begin."
                  : "No work items match this filter."}
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-[9px] uppercase tracking-[2px] text-[var(--muted)]">
                    <th className="w-8 px-3 py-2"></th>
                    <th className="px-2 py-2">Name</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-faint)]">
                  {filtered.map((item) => {
                    const status = rowStatus(item);
                    const meta = STATUS_META[status];
                    const isActive = activeHash === item.sourceSha256;
                    const isAnalyzing = analyzing.has(item.sourceSha256);
                    const progress = completing.get(item.sourceSha256) ?? null;
                    return (
                      <tr
                        key={item.sourceSha256}
                        className={isActive ? "bg-[rgba(201,168,76,0.07)]" : ""}
                      >
                        <td className="px-3 py-2.5 align-top">
                          <input
                            type="checkbox"
                            checked={selection.has(item.sourceSha256)}
                            onChange={() => toggleSelection(item.sourceSha256)}
                            aria-label={`Select ${item.sourceFilename}`}
                            className="h-4 w-4 accent-[var(--gold)]"
                          />
                        </td>
                        <td className="px-2 py-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveHash(item.sourceSha256);
                              setReviewTab("summary");
                            }}
                            className="text-left"
                          >
                            <div className="break-all text-[12px] text-[var(--platinum)]">
                              {item.sourceFilename}
                            </div>
                            <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                              {item.analysis?.brandName ?? "—"} &middot;{" "}
                              {formatBytes(item.sourceByteLength)}
                              {item.duplicateUploads.length > 0 && (
                                <span className="ml-1 text-[var(--slate)]">
                                  &middot; &#10697;{" "}
                                  {item.duplicateUploads.length} duplicate
                                  upload
                                  {item.duplicateUploads.length === 1
                                    ? ""
                                    : "s"}
                                </span>
                              )}
                              {item.staging && (
                                <span className="ml-1 text-[var(--gold-dim)]">
                                  &middot; &#9635; staged
                                </span>
                              )}
                            </div>
                          </button>
                        </td>
                        <td className="px-2 py-2.5 align-top">
                          <span
                            className={`flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[1px] ${
                              progress || isAnalyzing
                                ? "text-[var(--gold)]"
                                : meta.className
                            }`}
                          >
                            {(progress || isAnalyzing) && (
                              <WatchSpinner size={12} />
                            )}
                            {progress
                              ? progress
                              : isAnalyzing
                                ? "Analyzing"
                                : `${meta.glyph} ${meta.label}`}
                            {/* Measured, not estimated. No percentage, no bar,
                                no arrival time — the room does not know how
                                long a research round will take and does not
                                pretend to. */}
                            {progress && startedAt.has(item.sourceSha256) && (
                              <span className="tabular-nums text-[var(--muted)]">
                                {formatElapsed(
                                  nowTick -
                                    (startedAt.get(item.sourceSha256) ?? nowTick)
                                )}
                              </span>
                            )}
                          </span>
                          {progress ? (
                            <button
                              type="button"
                              className="mt-0.5 block text-[10px] uppercase tracking-[1px] text-[var(--muted)] underline hover:text-[var(--platinum)]"
                              onClick={() =>
                                cancelCompletion(item.sourceSha256)
                              }
                            >
                              Cancel this file
                            </button>
                          ) : item.completion ? (
                            item.completion.counts.humanDecisions > 0 && (
                              <div className="mt-0.5 text-[10px] text-[#779ec8]">
                                {item.completion.counts.humanDecisions} decision
                                {item.completion.counts.humanDecisions === 1
                                  ? ""
                                  : "s"}{" "}
                                for you
                              </div>
                            )
                          ) : (
                            item.analysis &&
                            item.analysis.counts.unresolved > 0 && (
                              <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                                {item.analysis.counts.unresolved} unresolved
                              </div>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="border-t border-[var(--border-subtle)] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                {completing.size > 0 && <WatchSpinner size={13} />}
                {completing.size > 0
                  ? `${completing.size} file${
                      completing.size === 1 ? "" : "s"
                    } in progress`
                  : unanalyzed > 0
                    ? `${unanalyzed} awaiting analysis`
                    : `All files analyzed · ${completable.length} with work remaining`}
              </div>
              <div className="flex flex-wrap gap-2">
                {completing.size > 0 && (
                  <button
                    type="button"
                    className={BTN}
                    onClick={() => cancelCompletion()}
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  className={BTN}
                  disabled={busy || selection.size === 0}
                  onClick={() => void analyze([...selection])}
                >
                  Analyze selected
                </button>
                <button
                  type="button"
                  className={BTN}
                  disabled={busy || items.length === 0 || !contract?.ok}
                  onClick={() => void analyze(items.map((i) => i.sourceSha256))}
                >
                  {busy && completing.size === 0 ? "Analyzing…" : "Analyze all"}
                </button>
                <button
                  type="button"
                  className={BTN}
                  disabled={busy || selection.size === 0 || !contract?.ok}
                  onClick={() => void runCompletion([...selection])}
                >
                  Complete upgrade
                </button>
                <button
                  type="button"
                  className={BTN_GOLD}
                  disabled={
                    busy || completable.length === 0 || !contract?.ok
                  }
                  onClick={() =>
                    void runCompletion(
                      completable.map((i) => i.sourceSha256)
                    )
                  }
                >
                  {completing.size > 0
                    ? "Completing…"
                    : "Complete all researchable"}
                </button>
              </div>
            </div>
            <p className="mt-2 text-[10px] italic leading-relaxed text-[var(--muted)]">
              Completing researches the facts the specification requires and
              fills them in with their sources recorded. Facts that cannot be
              sourced are left empty and shown to you &mdash; nothing is
              guessed.
            </p>
          </div>
        </div>

        {/* Transfer marker (decorative on desktop, hidden on mobile) */}
        <div
          aria-hidden="true"
          className="hidden flex-col items-center justify-center gap-2 px-1 lg:flex"
        >
          <div className="border border-[var(--border-gold)] px-2 py-1 text-[14px] text-[var(--gold)]">
            &rarr;
          </div>
          <div
            className="text-[8px] uppercase tracking-[2px] text-[var(--ghost)]"
            style={{ writingMode: "vertical-rl" }}
          >
            structural upgrade
          </div>
        </div>

        {/* Updated Candidates */}
        <div className="border border-[var(--border-subtle)] bg-[var(--surface)]">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
            <div className="font-display text-[15px] font-light text-[var(--platinum)]">
              Updated Candidates
            </div>
            <div className="text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]">
              {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="max-h-[420px] overflow-auto">
            {candidates.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12px] italic text-[var(--muted)]">
                No candidates yet. A candidate is generated only when a file is
                deterministically recognized and every required fact is
                present.
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-[9px] uppercase tracking-[2px] text-[var(--muted)]">
                    <th className="px-4 py-2">Candidate</th>
                    <th className="px-2 py-2">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-faint)]">
                  {candidates.map((item) => {
                    const cand = (item.completion?.candidate ??
                      item.analysis?.candidate)!;
                    const meta = STATUS_META[rowStatus(item)];
                    const isActive = activeHash === item.sourceSha256;
                    return (
                      <tr
                        key={item.sourceSha256}
                        className={isActive ? "bg-[rgba(201,168,76,0.07)]" : ""}
                      >
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveHash(item.sourceSha256);
                              setReviewTab("changes");
                            }}
                            className="text-left"
                          >
                            <div className="break-all text-[12px] text-[var(--platinum)]">
                              {cand.filename}
                            </div>
                            <div className="mt-0.5 font-mono text-[9px] text-[var(--muted)]">
                              {cand.sha256.slice(0, 16)}&hellip; &middot;{" "}
                              {formatBytes(cand.byteLength)}
                            </div>
                          </button>
                        </td>
                        <td className="px-2 py-2.5 align-top">
                          <span
                            className={`text-[10px] uppercase tracking-[1px] ${meta.className}`}
                          >
                            {meta.glyph} {meta.label}
                          </span>
                          {item.completion &&
                            item.completion.counts.humanDecisions > 0 && (
                              <div className="mt-0.5 text-[10px] text-[#779ec8]">
                                {item.completion.counts.humanDecisions} decision
                                {item.completion.counts.humanDecisions === 1
                                  ? ""
                                  : "s"}{" "}
                                for you
                              </div>
                            )}
                          {item.staging && (
                            <div className="mt-0.5 text-[10px] text-[var(--gold-dim)]">
                              &#9635; staged
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-4 py-3">
            <div className="text-[11px] text-[var(--muted)]">
              Downloads are re-verified against stored bytes.
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={BTN}
                disabled={selection.size === 0}
                onClick={() => void downloadSelectedCandidates()}
              >
                Download candidates
              </button>
              <button
                type="button"
                className={BTN}
                disabled={selection.size === 0}
                onClick={() => void downloadSelectedReports()}
              >
                Download reports
              </button>
              <button
                type="button"
                className={BTN_GOLD}
                disabled={selection.size === 0}
                onClick={() => void stageSelected()}
              >
                Save to local staging
              </button>
              <button
                type="button"
                className={BTN}
                disabled={selection.size === 0}
                onClick={() => void unstageSelected()}
              >
                Remove from staging
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Selection-level destructive action, clearly separated */}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className={BTN}
          disabled={selection.size === 0}
          onClick={() => void removeSelected()}
        >
          Remove selected unstaged work items
        </button>
      </div>

      {/* Review surface */}
      <section className="mt-6 border border-[var(--border-subtle)] bg-[var(--surface)]">
        {activeItem === null ? (
          <div className="px-5 py-12 text-center text-[13px] italic text-[var(--muted)]">
            Select a file above to review it. The active filename and Brand are
            always shown here so batch work never loses its subject.
          </div>
        ) : (
          <ReviewSurface
            item={activeItem}
            tab={reviewTab}
            onTab={setReviewTab}
            prettyOriginal={prettyOriginal}
            onTogglePretty={() => setPrettyOriginal((p) => !p)}
            onDownloadOriginal={() => void downloadOriginal(activeItem)}
            onDownloadCandidate={() => void downloadCandidate(activeItem)}
            onDownloadReport={() => void downloadReport(activeItem)}
            onStage={() =>
              void (async () => {
                const db = dbRef.current;
                if (!db) return;
                try {
                  await stageCandidate(
                    db,
                    activeItem.sourceSha256,
                    operator,
                    new Date().toISOString()
                  );
                  await refresh();
                  setNotice({
                    kind: "info",
                    text: "Candidate saved to local staging (stored in this browser). Staging never certifies, reconciles, ingests, or publishes.",
                  });
                } catch (err) {
                  setNotice({
                    kind: "error",
                    text: err instanceof Error ? err.message : String(err),
                  });
                }
              })()
            }
            onReturnForResearch={() =>
              void setReview(activeItem, "RETURNED_FOR_RESEARCH")
            }
            onHoldForDecision={() =>
              void setReview(activeItem, "HELD_FOR_DECISION")
            }
            onRemoveCandidate={() => void removeCandidateFor(activeItem)}
            onDismiss={() => void dismissItem(activeItem)}
            onComplete={() => void runCompletion([activeItem.sourceSha256])}
            completing={completing.get(activeItem.sourceSha256) ?? null}
          />
        )}
      </section>

      {/* Boundary notice */}
      <div className="mt-6 border border-[var(--border-faint)] px-5 py-3 text-[12px] text-[var(--muted)]">
        <strong className="text-[var(--platinum-dim)]">
          No automatic next step.
        </strong>{" "}
        These are file-upgrade results only. Database reconciliation,
        production apply, and Galaxy publication require separate
        authorization. Nothing here reads or writes the database.
      </div>
    </div>
  );
}

/* ── Review surface ─────────────────────────────────────────────────────── */

function ReviewSurface({
  item,
  tab,
  onTab,
  prettyOriginal,
  onTogglePretty,
  onDownloadOriginal,
  onDownloadCandidate,
  onDownloadReport,
  onStage,
  onReturnForResearch,
  onHoldForDecision,
  onRemoveCandidate,
  onDismiss,
  onComplete,
  completing,
}: {
  item: WorkItem;
  tab: ReviewTab;
  onTab: (t: ReviewTab) => void;
  prettyOriginal: boolean;
  onTogglePretty: () => void;
  onDownloadOriginal: () => void;
  onDownloadCandidate: () => void;
  onDownloadReport: () => void;
  onStage: () => void;
  onReturnForResearch: () => void;
  onHoldForDecision: () => void;
  onRemoveCandidate: () => void;
  onDismiss: () => void;
  onComplete: () => void;
  completing: string | null;
}) {
  const analysis = item.analysis;
  const completion = item.completion;
  const status = rowStatus(item);
  const meta = STATUS_META[status];
  /* hasCandidate means FINAL, and only a final candidate may be staged.
     A held run's work product is deliverable but never final, so it is kept
     in its own name — the two must not collapse into one boolean. */
  const hasCandidate = Boolean(completion?.candidate ?? analysis?.candidate);
  const heldCandidate = completion?.candidate
    ? null
    : (completion?.provisionalCandidate ?? null);
  const isProvisional = Boolean(heldCandidate);
  const canComplete = COMPLETABLE_STATUSES.includes(status);
  /* After completion the full ledger — structural transforms plus every
     applied researched fact — lives on the completion record. */
  const ledgerRows = completion?.ledger ?? analysis?.ledger ?? [];
  const activeCandidate =
    completion?.candidate ?? analysis?.candidate ?? heldCandidate;
  const hasDeliverable = Boolean(activeCandidate);
  const openIssues = completion?.issues ?? analysis?.issues ?? [];

  const originalText = useMemo(
    () => utf8Text(item.sourceBytes),
    [item.sourceBytes]
  );
  const originalDisplay = useMemo(() => {
    if (!prettyOriginal) return originalText;
    try {
      return JSON.stringify(JSON.parse(originalText), null, 2);
    } catch {
      return originalText;
    }
  }, [originalText, prettyOriginal]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
        <div>
          <div className="text-[9px] uppercase tracking-[2.5px] text-[var(--gold-dim)]">
            Change Review
          </div>
          <div className="mt-1 font-display text-[17px] font-light text-[var(--platinum)]">
            {analysis?.brandName ?? "Unknown Brand"}{" "}
            <span className="text-[var(--muted)]">&middot;</span>{" "}
            <span className="break-all text-[14px]">{item.sourceFilename}</span>
          </div>
          <div className={`mt-1 text-[11px] uppercase tracking-[1px] ${meta.className}`}>
            Specification Upgrade &middot; {meta.glyph} {meta.label}
            {item.reviewState !== "NONE" && (
              <span className="ml-2 text-[var(--slate)]">
                &middot;{" "}
                {item.reviewState === "RETURNED_FOR_RESEARCH"
                  ? "returned for research"
                  : "held for decision"}
              </span>
            )}
            {item.staging && (
              <span className="ml-2 text-[var(--gold-dim)]">
                &middot; &#9635; staged locally
              </span>
            )}
          </div>
          {status === "CURRENT_SPEC_NO_CHANGE" && (
            <div className="mt-2 text-[12px] text-[var(--platinum-dim)]">
              Current v3.2 structure detected. No structural upgrade was
              applied.
              <div className="mt-0.5 font-display italic text-[var(--muted)]">
                Nice try, you wanker.
              </div>
            </div>
          )}
          {status === "INVALID_JSON" && analysis?.parseError && (
            <div className="mt-2 text-[12px] text-[var(--danger)]">
              {analysis.parseError}
            </div>
          )}
        </div>
        <div className="text-right text-[11px] text-[var(--muted)]">
          Original preserved
          {hasCandidate
            ? " · candidate generated"
            : isProvisional
              ? " · provisional file generated — one decision remains"
              : " · no candidate"}
        </div>
      </div>

      {/* Actions — status-aware */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--border-subtle)] px-5 py-3">
        <button type="button" className={BTN} onClick={() => onTab("original")}>
          View Original
        </button>
        <button type="button" className={BTN} onClick={onDownloadOriginal}>
          Download Original
        </button>
        {canComplete && (
          <button
            type="button"
            className={`${BTN_GOLD} inline-flex items-center gap-2`}
            disabled={completing !== null}
            onClick={onComplete}
          >
            {completing !== null && <WatchSpinner size={14} />}
            {completing !== null
              ? completing
              : status === "FAILED_RETRYABLE" ||
                  status === "BLOCKED_PROVIDER_AUTHORIZATION"
                ? "Retry Completion"
                : "Complete Upgrade"}
          </button>
        )}
        {hasDeliverable && (
          <>
            <button
              type="button"
              className={BTN}
              onClick={() => onTab("candidate")}
            >
              {isProvisional ? "View Provisional File" : "View Candidate"}
            </button>
            <button type="button" className={BTN} onClick={onDownloadCandidate}>
              {isProvisional
                ? "Download Provisional File"
                : "Download Candidate"}
            </button>
          </>
        )}
        {analysis && (
          <button type="button" className={BTN} onClick={onDownloadReport}>
            {completion ? "Download Completion Report" : "Download Change Report"}
          </button>
        )}
        {hasCandidate && !item.staging && (
          <button type="button" className={BTN_GOLD} onClick={onStage}>
            Save Candidate to Local Staging
          </button>
        )}
        {analysis && status === "RESEARCH_REQUIRED" && (
          <button type="button" className={BTN} onClick={onReturnForResearch}>
            {item.reviewState === "RETURNED_FOR_RESEARCH"
              ? "Clear research mark"
              : "Return for Research"}
          </button>
        )}
        {analysis && status === "DECISION_REQUIRED" && (
          <button type="button" className={BTN} onClick={onHoldForDecision}>
            {item.reviewState === "HELD_FOR_DECISION"
              ? "Clear decision hold"
              : "Hold for Decision"}
          </button>
        )}
        {hasCandidate && !item.staging && (
          <button type="button" className={BTN} onClick={onRemoveCandidate}>
            Remove Candidate
          </button>
        )}
        {!item.staging && (
          <button type="button" className={BTN} onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>

      {/* Section tabs */}
      <div className="flex flex-wrap gap-1 border-b border-[var(--border-subtle)] px-5 py-3">
        {REVIEW_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onTab(t.key)}
            aria-pressed={tab === t.key}
            className={`px-3 py-1.5 font-[Inter] text-[10px] uppercase tracking-[1.5px] transition ${
              tab === t.key
                ? "bg-[var(--gold)] text-[var(--ink)]"
                : "border border-[var(--border-mid)] text-[var(--slate)] hover:text-[var(--platinum)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-5 py-5">
        {tab === "summary" && (
          <div>
            {completion ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SummaryCard
                    label="Completed structurally"
                    value={completion.counts.completedStructurally}
                    detail="Closed by the specification's own rules."
                  />
                  <SummaryCard
                    label="Completed by research"
                    value={completion.counts.completedByResearch}
                    detail="Each one has its sources under Sources."
                  />
                  <SummaryCard
                    label="References added"
                    value={completion.counts.referencesAdded}
                    detail={`${completion.counts.emptyReferencesRetained} variant(s) correctly kept an empty list.`}
                  />
                  <SummaryCard
                    label="Your decisions"
                    value={completion.counts.humanDecisions}
                    detail="Listed under Your Decisions."
                  />
                </div>
                <p className="mt-4 text-[12px] text-[var(--muted)]">
                  {completion.candidate
                    ? "The candidate passed every applicable v3.2 check. Totals alone never authorize staging."
                    : "No candidate was frozen — the items under Your Decisions must be settled first."}
                  {completion.counts.researchRounds > 0 &&
                    ` Research ran in ${completion.counts.researchRounds} round${
                      completion.counts.researchRounds === 1 ? "" : "s"
                    }.`}
                </p>
              </>
            ) : analysis ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SummaryCard
                    label="Transforms"
                    value={analysis.counts.transforms}
                    detail="Every one appears in Exact Changes."
                  />
                  <SummaryCard
                    label="Legacy fields disposed"
                    value={analysis.counts.omittedLegacyFields}
                    detail="Exact values retained in the change report."
                  />
                  <SummaryCard
                    label="References converted"
                    value={analysis.counts.convertedReferences}
                    detail="Exact strings preserved into Reference objects."
                  />
                  <SummaryCard
                    label="Unresolved"
                    value={analysis.counts.unresolved}
                    detail="Listed under Unresolved Items."
                  />
                </div>
                <p className="mt-4 text-[12px] text-[var(--muted)]">
                  Totals derive from the exact change ledger and unresolved
                  list. Totals alone never authorize staging.
                </p>
              </>
            ) : (
              <p className="text-[12px] italic text-[var(--muted)]">
                Not analyzed yet.
              </p>
            )}
          </div>
        )}

        {tab === "decisions" && (
          <div>
            {!completion ? (
              <p className="text-[12px] italic text-[var(--muted)]">
                Run Complete Upgrade to see what genuinely needs you.
              </p>
            ) : completion.decisions.length === 0 ? (
              <p className="text-[12px] text-[var(--platinum-dim)]">
                Nothing needs a decision. Every supportable fact was
                established and recorded with its sources.
              </p>
            ) : (
              <div className="space-y-4">
                <p className="text-[12px] text-[var(--muted)]">
                  These are the only items research could not settle safely.
                  Everything else is already done.
                </p>
                {completion.decisions.map((d, i) => (
                  <div
                    key={`${d.path}-${i}`}
                    className="border border-[var(--border-mid)] px-4 py-3"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="break-all font-mono text-[11px] text-[var(--platinum)]">
                        {d.path}
                      </div>
                      <div
                        className={`text-[9px] uppercase tracking-[1.5px] ${
                          d.scope === "STRUCTURAL"
                            ? "text-[var(--danger)]"
                            : "text-[#779ec8]"
                        }`}
                      >
                        {d.scope === "STRUCTURAL"
                          ? "Holds the candidate"
                          : "Field only"}
                      </div>
                    </div>
                    <div className="mt-1.5 text-[12px] text-[var(--platinum-dim)]">
                      {d.issue}
                    </div>
                    <div className="mt-1 text-[11px] italic text-[var(--muted)]">
                      {d.whyNotAutomatic}
                    </div>
                    {d.options.length > 0 && (
                      <div className="mt-2.5 space-y-1.5">
                        <div className="text-[9px] uppercase tracking-[1.5px] text-[var(--gold-dim)]">
                          Evidence supports
                        </div>
                        {d.options.map((o, oi) => (
                          <div
                            key={oi}
                            className="border-l border-[var(--border-mid)] pl-3"
                          >
                            <div className="text-[12px] text-[var(--platinum)]">
                              {o.value}
                            </div>
                            <div className="text-[11px] text-[var(--muted)]">
                              {o.evidence}
                            </div>
                            {o.sources.map((s, si) => (
                              <a
                                key={si}
                                href={s.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="block break-all text-[10px] text-[var(--gold-dim)] underline"
                              >
                                {s.title}
                              </a>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "sources" && (
          <div className="overflow-x-auto">
            {!completion || completion.provenance.length === 0 ? (
              <p className="text-[12px] italic text-[var(--muted)]">
                No researched facts yet. Run Complete Upgrade.
              </p>
            ) : (
              <table className="w-full min-w-[640px] border-collapse text-[11px]">
                <thead>
                  <tr className="text-left text-[9px] uppercase tracking-[2px] text-[var(--muted)]">
                    <th className="px-2 py-2">Path</th>
                    <th className="px-2 py-2">Outcome</th>
                    <th className="px-2 py-2">Value applied</th>
                    <th className="px-2 py-2">Evidence</th>
                    <th className="px-2 py-2">Sources</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-faint)]">
                  {completion.provenance.map((p, i) => (
                    <tr key={`${p.path}-${i}`} className="align-top">
                      <td className="break-all px-2 py-2 font-mono text-[10px] text-[var(--platinum-dim)]">
                        {p.path}
                      </td>
                      <td
                        className={`px-2 py-2 ${
                          p.outcome === "VERIFIED"
                            ? "text-[#78b58a]"
                            : p.outcome === "UNRESOLVED"
                              ? "text-[#779ec8]"
                              : "text-[var(--muted)]"
                        }`}
                      >
                        {p.outcome}
                        <div className="text-[9px] uppercase tracking-[1px] text-[var(--slate)]">
                          {p.pass} pass
                        </div>
                      </td>
                      <td
                        className="px-2 py-2 font-mono text-[10px] text-[var(--muted)]"
                        title={shortValue(p.finalValue, 2000)}
                      >
                        {shortValue(p.finalValue)}
                      </td>
                      <td className="px-2 py-2 text-[var(--muted)]">
                        {p.evidence}
                      </td>
                      <td className="px-2 py-2">
                        {p.sources.length === 0 ? (
                          <span className="text-[var(--slate)]">—</span>
                        ) : (
                          p.sources.map((s, si) => (
                            <a
                              key={si}
                              href={s.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="block break-all text-[10px] text-[var(--gold-dim)] underline"
                            >
                              {s.publisher ? `${s.publisher} — ` : ""}
                              {s.title}
                            </a>
                          ))
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "changes" && (
          <div className="overflow-x-auto">
            {ledgerRows.length > 0 ? (
              <table className="w-full min-w-[640px] border-collapse text-[11px]">
                <thead>
                  <tr className="text-left text-[9px] uppercase tracking-[2px] text-[var(--muted)]">
                    <th className="px-2 py-2">Path</th>
                    <th className="px-2 py-2">Action</th>
                    <th className="px-2 py-2">Before</th>
                    <th className="px-2 py-2">After</th>
                    <th className="px-2 py-2">Reason</th>
                    <th className="px-2 py-2">Rule</th>
                    <th className="px-2 py-2">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-faint)]">
                  {ledgerRows.map((row, i) => (
                    <tr key={i} className="align-top">
                      <td className="break-all px-2 py-2 font-mono text-[10px] text-[var(--platinum-dim)]">
                        {row.path}
                      </td>
                      <td className="px-2 py-2 text-[var(--platinum)]">
                        {row.action}
                      </td>
                      <td
                        className="px-2 py-2 font-mono text-[10px] text-[var(--muted)]"
                        title={shortValue(row.before, 2000)}
                      >
                        {shortValue(row.before)}
                      </td>
                      <td
                        className="px-2 py-2 font-mono text-[10px] text-[var(--muted)]"
                        title={shortValue(row.after, 2000)}
                      >
                        {shortValue(row.after)}
                      </td>
                      <td className="px-2 py-2 text-[var(--muted)]">
                        {row.reason}
                      </td>
                      <td className="px-2 py-2 font-mono text-[10px] text-[var(--slate)]">
                        {row.rule}
                      </td>
                      <td className="px-2 py-2 text-[var(--slate)]">
                        {row.severity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[12px] italic text-[var(--muted)]">
                {analysis
                  ? "No structural changes were applied to this file."
                  : "Not analyzed yet."}
              </p>
            )}
          </div>
        )}

        {tab === "unresolved" && (
          <div>
            {openIssues.length > 0 ? (
              <ul className="space-y-3">
                {openIssues.map((issue, i) => (
                  <li
                    key={i}
                    className="border border-[var(--border-faint)] px-4 py-3"
                  >
                    <div className="break-all font-mono text-[10px] text-[var(--platinum-dim)]">
                      {issue.path}
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-[1px] text-[#d8b36d]">
                      {issue.code}
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--platinum-dim)]">
                      {issue.reason}
                    </div>
                    {issue.value !== undefined && (
                      <div className="mt-1 break-all font-mono text-[10px] text-[var(--muted)]">
                        value: {shortValue(issue.value, 400)}
                      </div>
                    )}
                    {issue.allowedValues && (
                      <div className="mt-1 text-[11px] text-[var(--muted)]">
                        permitted: {issue.allowedValues.join(", ")}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] italic text-[var(--muted)]">
                {completion
                  ? "No unresolved contract findings remain."
                  : analysis
                    ? "No unresolved items."
                    : "Not analyzed yet."}
              </p>
            )}
          </div>
        )}

        {tab === "original" && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] text-[var(--muted)]">
                Display only &mdash; downloads always deliver the exact
                original bytes.
              </div>
              <button type="button" className={BTN} onClick={onTogglePretty}>
                {prettyOriginal ? "Show exact bytes" : "Show formatted"}
              </button>
            </div>
            <pre className="max-h-[420px] overflow-auto border border-[var(--border-faint)] bg-[var(--ink)] p-4 font-mono text-[11px] leading-relaxed text-[var(--platinum-dim)]">
              {originalDisplay}
            </pre>
          </div>
        )}

        {tab === "candidate" && (
          <div>
            {activeCandidate ? (
              <>
                <div className="mb-2 break-all text-[11px] text-[var(--muted)]">
                  {activeCandidate.filename} &middot; SHA-256{" "}
                  <span className="font-mono text-[10px]">
                    {activeCandidate.sha256}
                  </span>
                </div>
                <pre className="max-h-[420px] overflow-auto border border-[var(--border-faint)] bg-[var(--ink)] p-4 font-mono text-[11px] leading-relaxed text-[var(--platinum-dim)]">
                  {activeCandidate.text}
                </pre>
              </>
            ) : (
              <p className="text-[12px] italic text-[var(--muted)]">
                No candidate exists for this file. Candidates are generated
                only when the source is deterministically recognized, every
                transform is authorized, and all required facts are present
                &mdash; otherwise the truthful status stands and nothing is
                fabricated.
              </p>
            )}
          </div>
        )}

        {tab === "source" && (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-[12px] sm:grid-cols-2">
            <SourceDetail label="Original filename" value={item.sourceFilename} />
            <SourceDetail
              label="Original size"
              value={`${item.sourceByteLength} bytes`}
            />
            <SourceDetail label="Source SHA-256" value={item.sourceSha256} mono />
            <SourceDetail
              label="Specification SHA-256"
              value={analysis?.specificationSha256 ?? "—"}
              mono
            />
            <SourceDetail
              label="Detected source contract"
              value={analysis?.detection?.sourceContract ?? "—"}
            />
            <SourceDetail
              label="Detection basis"
              value={analysis?.detection?.detectionBasis ?? "—"}
            />
            <SourceDetail
              label="Certainty class"
              value={analysis?.detection?.certaintyClass ?? "—"}
            />
            <SourceDetail
              label="Mapping selected"
              value={
                analysis?.detection
                  ? `${analysis.detection.mappingSelected} (${analysis.detection.mappingVersion})`
                  : "—"
              }
            />
            <SourceDetail
              label="Engine"
              value={
                analysis
                  ? `${analysis.engineVersion} · ${analysis.upgradeRuleVersion} · ${analysis.normalizationVersion}`
                  : "—"
              }
            />
            <SourceDetail
              label="Candidate ledger SHA-256"
              value={analysis?.candidate?.ledgerSha256 ?? "—"}
              mono
            />
            <SourceDetail label="Uploaded" value={item.uploadedAtIso} />
            <SourceDetail label="Last action" value={item.lastAction} />
            <SourceDetail label="Operator" value={item.operator} />
            {item.duplicateUploads.length > 0 && (
              <SourceDetail
                label="Duplicate uploads"
                value={item.duplicateUploads
                  .map((d) => `${d.filename} (${d.atIso})`)
                  .join("; ")}
              />
            )}
            {item.staging && (
              <SourceDetail
                label="Local staging"
                value={`staged ${item.staging.stagedAtIso} by ${item.staging.operator} · status at staging ${item.staging.statusAtStaging} · ${item.staging.unresolvedAtStaging} unresolved`}
              />
            )}
          </dl>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="border border-[var(--border-faint)] px-4 py-3">
      <div className="text-[9px] uppercase tracking-[2px] text-[var(--gold-dim)]">
        {label}
      </div>
      <div className="mt-1 font-display text-[22px] font-light text-[var(--platinum)]">
        {value}
      </div>
      <div className="mt-1 text-[11px] text-[var(--muted)]">{detail}</div>
    </div>
  );
}

function SourceDetail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-[2px] text-[var(--gold-dim)]">
        {label}
      </dt>
      <dd
        className={`mt-0.5 break-all text-[var(--platinum-dim)] ${
          mono ? "font-mono text-[10px]" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
