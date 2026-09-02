"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ════════════════════════════════════════════════════════════════════════
   AUCTION RESULTS INGEST — components/AdminAuctionResultsIngest.tsx

   The founder doorway into registered results ingestion:

     choose an eligible registered packet → START PLANNING → the durable
     governed run appears the moment it exists → sources are staged or
     fetched → a zero-write plan (or a truthful refusal) lands on that same
     run → Current & Recent Runs finds it again after a reload → Apply is
     a separate, explicit act against the exact plan hash, where the
     family allows one at all.

   THE PACKET LIST IS SERVER TRUTH. This room renders whatever the governed
   catalogue says is active and holds no list of its own; if the catalogue
   cannot be read it says so and offers nothing, because a built-in fallback
   would be authoritative exactly when the server could not be trusted.

   ── THE RUN IS THE OBJECT, NOT THE SPINNER ─────────────────────────────
   The backend births a durable run before any long work: /uploads binds
   the exact revision before it issues a single token; /runs births a
   registered-fetch run before /plan is ever called. The moment either
   returns, the run id and its real state are on screen, and nothing that
   happens afterwards — an upload that fails, a plan that is refused, a tab
   that closes — makes that run disappear. Post-birth failure is recorded
   against the run by the server (markFailed / the /plan verification
   path), never invented here. "Creating…" is a pre-birth label only; it is
   not a persisted state and there is no such state to add.

   ── RECOVERY IS INSPECTION ─────────────────────────────────────────────
   Current & Recent Runs is a bounded server projection: catalog-owned
   packetLabel, real state, useful error, and revisionBound — derived by
   the server from whether the run was born bound to an exact packet
   revision. A legacy run that predates binding renders as inspection only:
   no re-plan, no Apply. Selecting any row hydrates through the existing
   by-id run route. No plan bytes, storage paths or source payloads reach
   the browser.

   Apply is never implied by START. Generate/Apply stay visually distinct,
   Apply appears only for a contradiction-free planned run of a family the
   server has not withheld, and the button names the exact hash it approves.

   Files go DIRECTLY to private storage with single-use signed tokens
   (dynamic import of the browser Supabase client, the AccountDashboard
   pattern) — auction PDFs never travel through a function body.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

type PacketCard = {
  adapter: string;
  packetId: string;
  title: string;
  description: string;
  uploads: { kind: string; label: string; required: boolean }[];
};

type RunStatus = {
  runId: string;
  adapter?: string;
  packetId?: string;
  state: string;
  planSha256: string | null;
  summary: Record<string, unknown>;
  contradictions: string[];
  progress: { processed?: number; total?: number } & Record<string, unknown>;
  lastErrorCode: string | null;
  lastErrorDetail: string | null;
  createdAt?: string;
  /* Server-derived. False for a legacy run born before revision binding:
     inspection only, never re-planned or applied from here. Undefined for a
     run this session just birthed (those are bound by construction). */
  revisionBound?: boolean;
  reusedExisting?: boolean;
};

type RecentRun = {
  runId: string;
  adapter: string;
  packetId: string;
  packetLabel: string;
  state: string;
  revisionBound: boolean;
  lastErrorCode: string | null;
  lastErrorDetail: string | null;
  createdAt: string;
  approvedAt: string | null;
  appliedAt: string | null;
};

const cardCls =
  "w-full cursor-pointer border border-[var(--border-mid)] p-4 text-left transition-colors hover:border-[var(--border-gold)]";

const STATE_LABEL: Record<string, string> = {
  uploading: "Uploading — staging sources",
  planning: "Planning — zero writes",
  planned: "Plan ready for review — nothing has been written",
  applying: "Applying — bounded slices, durable progress",
  applied: "Applied",
  failed: "Refused",
};

function emptyRun(runId: string, extra: Partial<RunStatus>): RunStatus {
  return {
    runId,
    state: "planning",
    planSha256: null,
    summary: {},
    contradictions: [],
    progress: {},
    lastErrorCode: null,
    lastErrorDetail: null,
    ...extra,
  };
}

export default function AdminAuctionResultsIngest({ onApplied }: { onApplied?: () => void }) {
  const [packet, setPacket] = useState<PacketCard | null>(null);
  /* Catalog state. `null` while loading is deliberately distinct from `[]`
     after a successful empty read: "we have not looked yet" and "there is
     nothing to select" are different sentences and the room says the right
     one. */
  const [catalog, setCatalog] = useState<PacketCard[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  /* Server truth about which families are plan-only. The room never decides
     this; it only repeats what the catalog route said. */
  const [applyWithheld, setApplyWithheld] = useState<string[]>([]);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [run, setRun] = useState<RunStatus | null>(null);
  const [recent, setRecent] = useState<RecentRun[] | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/auctions/results/runs", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRecentError(data?.detail ?? "Recent runs could not be read.");
        setRecent([]);
        return;
      }
      setRecentError(null);
      setRecent(Array.isArray(data?.runs) ? (data.runs as RecentRun[]) : []);
    } catch {
      setRecentError("Recent runs could not be reached.");
      setRecent([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/auctions/packets", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setCatalogError(
            data?.detail ?? "The packet catalog could not be read. Nothing can be selected until it can."
          );
          setCatalog([]);
          return;
        }
        setCatalog(Array.isArray(data?.packets) ? (data.packets as PacketCard[]) : []);
        setApplyWithheld(Array.isArray(data?.applyWithheldAdapters) ? (data.applyWithheldAdapters as string[]) : []);
      } catch {
        if (cancelled) return;
        setCatalogError("The packet catalog could not be reached.");
        setCatalog([]);
      }
      /* Recovery list, after the catalogue: both are server reads whose
         state lands in callbacks, never synchronously in the effect body. */
      if (!cancelled) await loadRecent();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadRecent]);

  // Truthful progress while an apply is running: poll the durable run.
  useEffect(() => {
    if (!run || run.state !== "applying") {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/auctions/results/runs/${run.runId}`);
        if (!res.ok) return;
        const fresh = (await res.json()) as RunStatus;
        setRun((r) => ({ ...fresh, revisionBound: r?.revisionBound }));
        if (fresh.state === "applying") {
          /* The apply route resumes an 'applying' run idempotently — this
             keeps slices flowing if a serverless window closed mid-run. */
          void fetch("/api/admin/auctions/results/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runId: fresh.runId, planSha256: fresh.planSha256 }),
          });
        } else {
          void loadRecent();
        }
      } catch {
        /* transient poll failure — the run is durable, keep polling */
      }
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [run, loadRecent]);

  /* Plan a run that already exists. The server resolves everything by the
     run's bound revision; whatever it answers — plan or refusal — lands on
     the same run id and is shown as that run. */
  async function planExistingRun(runId: string, keep: Partial<RunStatus>) {
    setNote("Generating the plan — zero writes…");
    const planRes = await fetch("/api/admin/auctions/results/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId }),
    });
    const planData = await planRes.json().catch(() => null);
    if (!planRes.ok) {
      setRun({
        ...emptyRun(runId, keep),
        state: planData?.state ?? "failed",
        lastErrorCode: planData?.error ?? "plan_failed",
        lastErrorDetail: planData?.detail ?? "Plan generation refused.",
      });
      setNote(null);
      return;
    }
    setRun({ ...emptyRun(runId, keep), ...(planData as RunStatus) });
    setNote(null);
  }

  async function startPlanning() {
    if (!packet) return;
    setBusy("start");
    setNote(null);
    const identity = { adapter: packet.adapter, packetId: packet.packetId };
    try {
      if (packet.uploads.length > 0) {
        for (const u of packet.uploads) {
          if (u.required && !files[u.kind]) {
            setNote(`${u.label} is required before planning can begin.`);
            setBusy(null);
            return;
          }
        }
        setNote("Creating the governed run…");
        const tokenRes = await fetch("/api/admin/auctions/results/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adapter: packet.adapter, packetId: packet.packetId }),
        });
        const tokenData = await tokenRes.json().catch(() => null);
        if (!tokenRes.ok) {
          /* The server may have birthed the run and then refused (a signed
             token it could not issue). It has already recorded that against
             the run; show the run, not a bare error. */
          if (tokenData?.runId) {
            setRun({
              ...emptyRun(tokenData.runId as string, identity),
              state: tokenData.state ?? "failed",
              lastErrorCode: tokenData.error ?? "staging_unavailable",
              lastErrorDetail: tokenData.detail ?? "Staging refused.",
            });
            void loadRecent();
          }
          setNote(tokenData?.detail ?? "Staging refused.");
          setBusy(null);
          return;
        }
        /* RUN BIRTH IS VISIBLE NOW. The run is durable and bound to its
           exact revision before this response existed. */
        const runId = tokenData.runId as string;
        setRun(emptyRun(runId, { ...identity, state: "uploading" }));
        setNote("Run created. Staging sources…");
        void loadRecent();

        const { createClient } = await import("@/lib/supabase/client");
        const storage = createClient().storage.from(tokenData.bucket as string);
        for (const slot of tokenData.uploads as {
          kind: string;
          path: string;
          token: string;
          required: boolean;
        }[]) {
          const file = files[slot.kind];
          if (!file) continue; // optional kind the founder skipped
          setNote(`Uploading ${slot.kind}…`);
          const { error } = await storage.uploadToSignedUrl(slot.path, slot.token, file);
          if (error) {
            /* The run is kept. The server, not the browser, decides what a
               half-staged run is: the founder-gated /plan { runId } path
               inspects the actual staged objects and records its own
               truthful missing_source / hash / byte failure on this run. If
               the server cannot be reached, the run stays visible in its
               last true state rather than being labelled failed from here. */
            const local = `Upload of ${slot.kind} failed: ${error.message}`;
            try {
              await planExistingRun(runId, { ...identity, state: "uploading" });
              setNote(local);
            } catch {
              setNote(`${local} The server could not be reached to verify the run; it remains durable as shown.`);
            }
            setBusy(null);
            return;
          }
        }
        /* The server already knows where each kind lives — the uploads route
           recorded the deterministic paths on the run. Nothing path-shaped
           crosses from the browser. */
        await planExistingRun(runId, identity);
      } else {
        /* Registered-fetch: birth first, fast, bound to the exact revision;
           planning second, by that run id. A double press returns the
           existing live run rather than a second one. */
        setNote("Creating the governed run…");
        const birthRes = await fetch("/api/admin/auctions/results/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packetId: packet.packetId }),
        });
        const birth = await birthRes.json().catch(() => null);
        if (!birthRes.ok) {
          setNote(birth?.detail ?? "The governed run could not be created.");
          setBusy(null);
          return;
        }
        const runId = birth.runId as string;
        setRun(
          emptyRun(runId, {
            adapter: birth.adapter,
            packetId: birth.packetId,
            state: birth.state ?? "planning",
            createdAt: birth.createdAt,
            reusedExisting: birth.reusedExisting === true,
          })
        );
        setNote(birth.reusedExisting ? "A run for this packet is already live — showing it." : "Run created.");
        void loadRecent();
        if (birth.reusedExisting && birth.state !== "planning") {
          await hydrate(runId, true);
        } else {
          await planExistingRun(runId, { adapter: birth.adapter, packetId: birth.packetId, createdAt: birth.createdAt });
        }
      }
    } catch (e) {
      setNote(`Planning failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
      void loadRecent();
    }
  }

  async function applyPlan() {
    if (!run?.planSha256) return;
    setBusy("apply");
    setNote(null);
    try {
      const res = await fetch("/api/admin/auctions/results/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.runId, planSha256: run.planSha256 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data?.detail ?? "Apply refused.");
        return;
      }
      setRun((r) => (r ? { ...r, state: data.state, progress: data.progress } : r));
      if (data.state === "applied") onApplied?.();
    } catch (e) {
      setNote(`Apply failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
      void loadRecent();
    }
  }

  /* Recovery: hydrate a durable run through the existing by-id route. The
     row's revisionBound rides along so a legacy run stays inspection-only. */
  async function hydrate(runId: string, revisionBound: boolean) {
    try {
      const res = await fetch(`/api/admin/auctions/results/runs/${runId}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setNote(data?.detail ?? "That run could not be read.");
        return;
      }
      setPacket(null);
      setRun({ ...(data as RunStatus), revisionBound });
      setNote(null);
    } catch {
      setNote("That run could not be reached.");
    }
  }

  const summaryEntries = run ? Object.entries(run.summary ?? {}) : [];
  /* Withheld is decided by the adapter the SERVER put on the run, falling
     back to the packet the founder chose. Either way it is server truth. */
  const runAdapter = run?.adapter ?? packet?.adapter ?? null;
  const applyIsWithheld = runAdapter !== null && applyWithheld.includes(runAdapter);
  const legacyRun = run?.revisionBound === false;
  const stateLabel = run ? (STATE_LABEL[run.state] ?? run.state) : "";

  return (
    <div className="border border-[var(--border-subtle)] p-4">
      {!packet && !run ? (
        <div>
          <div className="mb-3 text-[11px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
            Choose the registered sale you are bringing in
          </div>
          <p className="mb-4 text-[12px] text-[var(--muted)]">
            Results ingestion works from approved, already-registered packets. Choose an eligible packet,
            supply any source files it requires, and start governed zero-write planning. Nothing is applied
            until you choose Apply, separately, against the exact plan you reviewed. This room never
            accepts an arbitrary source.
          </p>
          {catalogError && (
            <p className="mb-4 border border-[var(--border-subtle)] px-3 py-2 text-[12px] text-[var(--platinum-dim)]">
              {catalogError}
            </p>
          )}
          {catalog === null ? (
            <p className="text-[12px] text-[var(--muted)]">Reading the packet catalogue…</p>
          ) : catalog.length === 0 ? (
            /* An empty catalogue is a real answer, not a broken screen. It
               used to be impossible to see because the list was compiled in. */
            <p className="text-[12px] text-[var(--muted)]">
              No packet is currently active in the catalogue.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {catalog.map((p) => (
                <button
                  key={`${p.adapter}:${p.packetId}`}
                  type="button"
                  className={cardCls}
                  onClick={() => {
                    setPacket(p);
                    setRun(null);
                    setFiles({});
                    setNote(null);
                  }}
                >
                  <div className="text-[13px] text-[var(--platinum)]">{p.title}</div>
                  <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">{p.description}</p>
                  <p className="mt-3 text-[10px] uppercase tracking-[1.5px] text-[var(--gold-subtle)]">
                    Eligible to begin governed planning
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <div className="text-[13px] text-[var(--platinum)]">
              {packet?.title ?? (run?.packetId ? `Run · ${run.packetId}` : "Run")}
            </div>
            <button
              type="button"
              className="cursor-pointer text-[10px] uppercase tracking-[1.5px] text-[var(--slate)] hover:text-[var(--platinum)]"
              onClick={() => {
                setPacket(null);
                setRun(null);
                setNote(null);
              }}
            >
              ← Choose a different packet
            </button>
          </div>
          {packet && (
            <p className="mb-1 text-[11px] leading-relaxed text-[var(--muted)]">{packet.description}</p>
          )}
          {packet && !run && (
            <p className="mb-4 text-[10px] uppercase tracking-[1.5px] text-[var(--gold-subtle)]">
              Eligible to begin governed planning ·{" "}
              {packet.uploads.length > 0 ? "staged upload" : "registered fetch"}
            </p>
          )}

          {/* ── source staging ── */}
          {packet && packet.uploads.length > 0 && (!run || run.state === "failed") && (
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {packet.uploads.map((u) => (
                <label key={u.kind} className="block">
                  <span className="mb-1 block text-[11px] uppercase tracking-[2px] text-[var(--muted)]">
                    {u.label}
                    {u.required ? " *" : ""}
                  </span>
                  <input
                    type="file"
                    className="block w-full text-[12px] text-[var(--platinum-dim)] file:mr-3 file:border file:border-[var(--border-mid)] file:bg-transparent file:px-3 file:py-1.5 file:text-[10px] file:uppercase file:tracking-[1.5px] file:text-[var(--slate)]"
                    onChange={(e) => setFiles((f) => ({ ...f, [u.kind]: e.target.files?.[0] ?? null }))}
                  />
                </label>
              ))}
            </div>
          )}

          {/* ── START PLANNING (zero writes) ── */}
          {packet && (!run || run.state === "failed") && (
            <div>
              <button
                type="button"
                className="fw-btn-primary disabled:opacity-40"
                disabled={busy !== null}
                onClick={startPlanning}
              >
                {busy === "start" ? "Starting…" : "START PLANNING"}
              </button>
              <p className="mt-2 text-[11px] text-[var(--muted)]">
                Creates a governed run and generates a zero-write plan. Nothing is applied until you choose
                Apply.
              </p>
            </div>
          )}

          {note && <p className="mt-3 text-[12px] italic text-[var(--gold-subtle)]">{note}</p>}

          {/* ── the durable run, from the moment it exists ── */}
          {run && (
            <div className="mt-4 border border-[var(--border-subtle)] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="text-[11px] uppercase tracking-[3px] text-[var(--gold-subtle)]">{stateLabel}</div>
                <div className="text-[10px] tabular-nums text-[var(--muted)]">
                  Run <span className="text-[var(--platinum-dim)]">{run.runId}</span>
                  {run.packetId ? ` · ${run.packetId}` : ""}
                  {run.reusedExisting ? " · already live" : ""}
                </div>
              </div>

              {legacyRun && (
                <div className="mt-2 border border-[var(--border-mid)] px-3 py-2 text-[11px] text-[var(--platinum-dim)]">
                  <span className="uppercase tracking-[1.5px] text-[var(--muted)]">Legacy run — inspection only.</span>{" "}
                  This run was born before packet-revision binding existed. It is shown as historical truth and is
                  not re-planned or applied from here.
                </div>
              )}

              {run.state === "failed" && (
                <div className="mt-3 border border-[var(--danger,#8a3a3a)] p-3">
                  <div className="text-[11px] uppercase tracking-[2px] text-[var(--danger,#c96a6a)]">
                    Refused — {run.lastErrorCode ?? "failed"}
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--platinum-dim)]">{run.lastErrorDetail}</p>
                </div>
              )}

              {summaryEntries.length > 0 && (
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                  {summaryEntries.map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-2 border-b border-[var(--border-faint)] py-1">
                      <dt className="text-[10px] uppercase tracking-[1px] text-[var(--muted)]">
                        {k.replaceAll("_", " ")}
                      </dt>
                      <dd className="text-[12px] tabular-nums text-[var(--platinum-dim)]">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {run.contradictions.length > 0 && (
                <div className="mt-3 border border-[var(--danger,#8a3a3a)] p-3">
                  <div className="text-[11px] uppercase tracking-[2px] text-[var(--danger,#c96a6a)]">
                    Contradictions — Apply is unavailable
                  </div>
                  <ul className="mt-1 list-inside list-disc text-[12px] text-[var(--platinum-dim)]">
                    {run.contradictions.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {run.planSha256 && (
                <p className="mt-3 break-all text-[10px] text-[var(--muted)]">
                  Plan SHA-256: <span className="tabular-nums">{run.planSha256}</span>
                </p>
              )}

              {(run.state === "applying" || run.state === "applied") && (
                <p className="mt-2 text-[12px] tabular-nums text-[var(--platinum-dim)]">
                  {String(run.progress?.processed ?? 0)} / {String(run.progress?.total ?? "…")} rows
                  {run.state === "applying" ? " — you can leave; the run is durable." : " — complete."}
                </p>
              )}

              {run.state === "planned" && applyIsWithheld && (
                /* Not a disabled button. A plan-only family has no Apply to
                   offer, and the honest surface says so in words rather than
                   drawing a control the server would refuse. */
                <div className="mt-4 border border-[var(--border-gold)] p-3">
                  <div className="text-[11px] uppercase tracking-[2px] text-[var(--gold-subtle)]">
                    Plan-only family — Apply is not yet enabled
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--platinum-dim)]">
                    This plan can be reviewed. No writer exists for {runAdapter} and the server refuses Apply
                    for it by name. Nothing has been written to Auction Evidence and nothing will be from
                    this room until that family is separately authorised.
                  </p>
                </div>
              )}

              {run.state === "planned" && run.contradictions.length === 0 && !applyIsWithheld && !legacyRun && (
                <button
                  type="button"
                  className="fw-btn-primary mt-4 disabled:opacity-40"
                  disabled={busy !== null}
                  onClick={applyPlan}
                >
                  {busy === "apply" ? "Applying…" : "Apply this exact plan"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Current & Recent Runs — recovery, not a dashboard ── */}
      <div className="mt-6 border-t border-[var(--border-faint)] pt-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[3px] text-[var(--gold-subtle)]">Current &amp; recent runs</div>
          <button
            type="button"
            className="cursor-pointer text-[10px] uppercase tracking-[1.5px] text-[var(--slate)] hover:text-[var(--platinum)]"
            onClick={() => void loadRecent()}
          >
            Refresh
          </button>
        </div>
        {recentError && <p className="mb-2 text-[12px] text-[var(--platinum-dim)]">{recentError}</p>}
        {recent === null ? (
          <p className="text-[12px] text-[var(--muted)]">Reading recent runs…</p>
        ) : recent.length === 0 ? (
          <p className="text-[12px] text-[var(--muted)]">No runs yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-faint)]">
            {recent.map((r) => (
              <li key={r.runId}>
                <button
                  type="button"
                  className="flex w-full cursor-pointer flex-wrap items-baseline gap-x-4 gap-y-1 py-2 text-left transition-colors hover:bg-[var(--gold-whisper)]"
                  onClick={() => void hydrate(r.runId, r.revisionBound)}
                >
                  <span className="min-w-0 flex-1 text-[12px] text-[var(--platinum)]">{r.packetLabel}</span>
                  <span className="text-[10px] uppercase tracking-[1.5px] text-[var(--gold-subtle)]">
                    {STATE_LABEL[r.state] ? r.state : r.state}
                  </span>
                  {!r.revisionBound && (
                    <span className="text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]">Legacy · inspection only</span>
                  )}
                  <span className="text-[10px] tabular-nums text-[var(--muted)]">
                    {new Date(r.createdAt).toLocaleString()} · {r.runId.slice(0, 8)}
                  </span>
                  {r.lastErrorCode && (
                    <span className="basis-full text-[11px] text-[var(--platinum-dim)]">
                      {r.lastErrorCode}: {r.lastErrorDetail}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
