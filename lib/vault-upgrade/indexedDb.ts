/* ────────────────────────────────────────────────────────────────────────
   VAULT SPECIFICATION UPGRADE — local work queue (IndexedDB)

   Honest boundary: local staging, stored in this browser. No database
   table, no storage bucket, no server persistence, no cross-device promise.

   One work item per unique source byte sequence, keyed by source SHA-256.
   Re-uploading identical bytes resolves to the existing item and records a
   duplicate event — never an indistinguishable second job.

   The IDBFactory is injectable so the queue logic is provable under direct
   node execution with a stub; the browser passes nothing and gets the real
   IndexedDB. Timestamps are supplied by callers, keeping every function
   here deterministic for tests.
   ──────────────────────────────────────────────────────────────────────── */

import { sha256HexOfBytes } from "./hash.ts";
import type {
  AnalysisRecord,
  CompletionRecord,
  ReviewState,
  WorkItem,
} from "./types.ts";

const DB_NAME = "fwt-vault-upgrade";
const DB_VERSION = 1;
const STORE = "workItems";

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export type VaultUpgradeDb = {
  getAll: () => Promise<WorkItem[]>;
  get: (sourceSha256: string) => Promise<WorkItem | undefined>;
  put: (item: WorkItem) => Promise<void>;
  remove: (sourceSha256: string) => Promise<void>;
  close: () => void;
};

export async function openVaultUpgradeDb(
  factory?: IDBFactory
): Promise<VaultUpgradeDb> {
  const idb = factory ?? globalThis.indexedDB;
  if (!idb) {
    throw new Error("IndexedDB is not available in this environment.");
  }
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = idb.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const database = open.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "sourceSha256" });
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });

  function store(mode: IDBTransactionMode): IDBObjectStore {
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  return {
    getAll: () =>
      requestToPromise(store("readonly").getAll()) as Promise<WorkItem[]>,
    get: (sourceSha256: string) =>
      requestToPromise(store("readonly").get(sourceSha256)) as Promise<
        WorkItem | undefined
      >,
    put: async (item: WorkItem) => {
      await requestToPromise(store("readwrite").put(item));
    },
    remove: async (sourceSha256: string) => {
      await requestToPromise(store("readwrite").delete(sourceSha256));
    },
    close: () => db.close(),
  };
}

/* ── Intake ────────────────────────────────────────────────────────────── */

export type IntakeResult = {
  item: WorkItem;
  /** True when these exact bytes were already in the queue. */
  duplicate: boolean;
};

/**
 * Accept one file's exact bytes. Identical bytes resolve to the existing
 * work item (recording the re-upload); new bytes create a new item.
 * The original bytes are stored exactly and never rewritten.
 */
export async function intakeFile(
  db: VaultUpgradeDb,
  input: { filename: string; bytes: ArrayBuffer },
  operator: string,
  nowIso: string
): Promise<IntakeResult> {
  const sourceSha256 = await sha256HexOfBytes(input.bytes);
  const existing = await db.get(sourceSha256);
  if (existing) {
    existing.duplicateUploads = [
      ...existing.duplicateUploads,
      { filename: input.filename, atIso: nowIso },
    ];
    existing.lastAction = `Duplicate upload of identical bytes (as "${input.filename}") resolved to this work item.`;
    existing.updatedAtIso = nowIso;
    await db.put(existing);
    return { item: existing, duplicate: true };
  }
  const item: WorkItem = {
    sourceSha256,
    sourceFilename: input.filename,
    sourceByteLength: input.bytes.byteLength,
    sourceBytes: input.bytes,
    uploadedAtIso: nowIso,
    updatedAtIso: nowIso,
    lastAction: "Uploaded.",
    operator,
    duplicateUploads: [],
    analysis: null,
    completion: null,
    candidateBytes: null,
    reviewState: "NONE",
    staging: null,
  };
  await db.put(item);
  return { item, duplicate: false };
}

/* ── Analysis persistence ──────────────────────────────────────────────── */

export async function saveAnalysis(
  db: VaultUpgradeDb,
  sourceSha256: string,
  analysis: AnalysisRecord,
  candidateBytes: ArrayBuffer | null,
  nowIso: string
): Promise<WorkItem> {
  const item = await db.get(sourceSha256);
  if (!item) {
    throw new Error(`No work item exists for source ${sourceSha256}.`);
  }
  item.analysis = analysis;
  /* A fresh deterministic analysis supersedes any earlier completion — the
     two must never disagree about the same source bytes. */
  item.completion = null;
  item.candidateBytes = candidateBytes;
  item.lastAction = `Analyzed — ${analysis.status}.`;
  item.updatedAtIso = nowIso;
  await db.put(item);
  return item;
}

/**
 * Persist the result of a completion pass. The completion candidate becomes
 * the artifact delivery verifies and staging records; the deterministic
 * analysis is kept alongside it as the record of what the engine could
 * establish without research.
 */
export async function saveCompletion(
  db: VaultUpgradeDb,
  sourceSha256: string,
  completion: CompletionRecord,
  candidateBytes: ArrayBuffer | null,
  nowIso: string
): Promise<WorkItem> {
  const item = await db.get(sourceSha256);
  if (!item) {
    throw new Error(`No work item exists for source ${sourceSha256}.`);
  }
  item.completion = completion;
  item.candidateBytes = candidateBytes;
  item.lastAction = `Upgrade completed — ${completion.status}.`;
  item.updatedAtIso = nowIso;
  await db.put(item);
  return item;
}

/* ── Verified delivery ─────────────────────────────────────────────────── */

export type VerifiedCandidate = {
  filename: string;
  bytes: ArrayBuffer;
  sha256: string;
};

/**
 * Stale-candidate protection: re-read the exact stored candidate bytes and
 * verify byte length, SHA-256, and ledger linkage against the analysis
 * record before any download or staging. A mismatch refuses delivery —
 * never serves a stale or tampered artifact.
 */
export async function verifyCandidateForDelivery(
  db: VaultUpgradeDb,
  sourceSha256: string
): Promise<VerifiedCandidate> {
  const item = await db.get(sourceSha256);
  if (!item) {
    throw new Error(`No work item exists for source ${sourceSha256}.`);
  }
  /* A completed candidate supersedes the structural-only one: it is built
     from the same source bytes with researched facts applied, and it is
     what the operator asked for. */
  const candidate =
    item.completion?.candidate ?? item.analysis?.candidate ?? null;
  if (!candidate || !item.candidateBytes) {
    throw new Error(
      `Work item ${sourceSha256} has no stored candidate to deliver.`
    );
  }
  if (item.candidateBytes.byteLength !== candidate.byteLength) {
    throw new Error(
      `Stored candidate byte length ${item.candidateBytes.byteLength} does not match the recorded ${candidate.byteLength} — delivery refused.`
    );
  }
  const actualSha = await sha256HexOfBytes(item.candidateBytes);
  if (actualSha !== candidate.sha256) {
    throw new Error(
      `Stored candidate SHA-256 ${actualSha} does not match the recorded ${candidate.sha256} — delivery refused.`
    );
  }
  if (!candidate.ledgerSha256) {
    throw new Error(
      `Candidate for ${sourceSha256} has no ledger linkage — delivery refused.`
    );
  }
  return {
    filename: candidate.filename,
    bytes: item.candidateBytes,
    sha256: actualSha,
  };
}

/* ── Operator actions ──────────────────────────────────────────────────── */

export async function setReviewState(
  db: VaultUpgradeDb,
  sourceSha256: string,
  reviewState: ReviewState,
  nowIso: string
): Promise<WorkItem> {
  const item = await db.get(sourceSha256);
  if (!item) {
    throw new Error(`No work item exists for source ${sourceSha256}.`);
  }
  item.reviewState = reviewState;
  item.lastAction =
    reviewState === "RETURNED_FOR_RESEARCH"
      ? "Returned for research."
      : reviewState === "HELD_FOR_DECISION"
        ? "Held for decision."
        : "Review state cleared.";
  item.updatedAtIso = nowIso;
  await db.put(item);
  return item;
}

/**
 * Save the verified candidate to local staging. Staging is a private local
 * holding state — it never certifies, reconciles, ingests, publishes, or
 * activates anything, and it never converts unresolved warnings to success.
 */
export async function stageCandidate(
  db: VaultUpgradeDb,
  sourceSha256: string,
  operator: string,
  nowIso: string
): Promise<WorkItem> {
  const verified = await verifyCandidateForDelivery(db, sourceSha256);
  const item = await db.get(sourceSha256);
  if (!item || !item.analysis) {
    throw new Error(`No analyzed work item exists for source ${sourceSha256}.`);
  }
  const completion = item.completion;
  item.staging = {
    stagedAtIso: nowIso,
    operator,
    specificationSha256: item.analysis.specificationSha256,
    sourceSha256: item.sourceSha256,
    candidateSha256: verified.sha256,
    candidateFilename: verified.filename,
    ledgerSha256:
      completion?.candidate?.ledgerSha256 ??
      item.analysis.candidate?.ledgerSha256 ??
      null,
    statusAtStaging: item.analysis.status,
    /* Staging records what was still open at the moment it was staged —
       after completion that is the open decision count, not the raw
       finding count the deterministic pass started with. */
    unresolvedAtStaging: completion
      ? completion.counts.humanDecisions
      : item.analysis.counts.unresolved,
  };
  item.lastAction = "Candidate saved to local staging.";
  item.updatedAtIso = nowIso;
  await db.put(item);
  return item;
}

/**
 * Take a candidate back out of local staging.
 *
 * Both removal paths refuse a staged item and tell the operator to clear
 * staging first, so without this the instruction named an action the room
 * could not perform and a staged work item was stuck in the queue forever.
 * Nothing is destroyed here: the candidate, its bytes, and the original
 * source all survive — only the staging record is cleared.
 */
export async function unstageCandidate(
  db: VaultUpgradeDb,
  sourceSha256: string,
  nowIso: string
): Promise<WorkItem> {
  const item = await db.get(sourceSha256);
  if (!item) {
    throw new Error(`No work item exists for source ${sourceSha256}.`);
  }
  item.staging = null;
  item.lastAction = "Candidate removed from local staging.";
  item.updatedAtIso = nowIso;
  await db.put(item);
  return item;
}

/** Discard a generated candidate. The original bytes remain untouched. */
export async function removeCandidate(
  db: VaultUpgradeDb,
  sourceSha256: string,
  nowIso: string
): Promise<WorkItem> {
  const item = await db.get(sourceSha256);
  if (!item) {
    throw new Error(`No work item exists for source ${sourceSha256}.`);
  }
  if (item.staging) {
    throw new Error(
      "This candidate is saved to local staging — remove it from staging first."
    );
  }
  item.analysis = null;
  item.completion = null;
  item.candidateBytes = null;
  item.lastAction = "Candidate removed; original preserved. Re-analyze to regenerate.";
  item.updatedAtIso = nowIso;
  await db.put(item);
  return item;
}

/** Remove a work item entirely. Staged items are protected. */
export async function removeWorkItem(
  db: VaultUpgradeDb,
  sourceSha256: string
): Promise<void> {
  const item = await db.get(sourceSha256);
  if (!item) return;
  if (item.staging) {
    throw new Error(
      "Staged work items cannot be removed — clear staging first."
    );
  }
  await db.remove(sourceSha256);
}
