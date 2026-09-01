"use client";

import { useEffect, useRef, useState } from "react";

/* ════════════════════════════════════════════════════════════════════════
   AUCTION RESULTS INGEST — components/AdminAuctionResultsIngest.tsx

   The founder doorway into registered results ingestion:

     choose a registered packet → stage its required source files →
     Generate Plan (zero writes) → review the summary + hash →
     Apply (explicit, against that exact hash) → watch truthful progress

   THE PACKET LIST IS SERVER TRUTH. This room renders whatever the governed
   catalogue says is active and holds no list of its own; if the catalogue
   cannot be read it says so and offers nothing, because a built-in fallback
   would be authoritative exactly when the server could not be trusted.

   What that did NOT become is an arbitrary-source door. A packet still
   names an adapter from a finite code allowlist, and only a family proven
   able to resolve a new instance from descriptor data alone may be
   registered at runtime at all. A genuinely new source schema still needs a
   parser, and a parser still needs a commit.

   Planning and applying are never visually conflated: Generate Plan is one
   button, and Apply appears only after a contradiction-free plan exists,
   labelled with the exact hash it approves. Leaving the page loses
   nothing — the run is durable and this component resumes it by id.

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

/* THE MIRRORED LIST IS GONE, AND MUST NOT COME BACK.

   This file used to hold its own copy of the three registered packets,
   while lib/auction-operations/registry.ts held the same three again. Two
   lists meant a new sale of an already-proven family needed a source edit
   here, a second edit there, and a deployment — for data, not for a parser.

   Packet instances now come from the governed server catalog. If that read
   fails, this room says so and offers nothing; it does not fall back to a
   built-in list. A fallback would be the mirror rebuilding itself, and it
   would be authoritative exactly when the catalog could not be trusted. */

type RunStatus = {
  runId: string;
  state: string;
  planSha256: string | null;
  summary: Record<string, unknown>;
  contradictions: string[];
  progress: { processed?: number; total?: number } & Record<string, unknown>;
  lastErrorCode: string | null;
  lastErrorDetail: string | null;
};

const cardCls =
  "w-full border border-[var(--border-mid)] p-4 text-left transition-colors hover:border-[var(--border-gold)]";

export default function AdminAuctionResultsIngest({ onApplied }: { onApplied?: () => void }) {
  const [packet, setPacket] = useState<PacketCard | null>(null);
  /* Catalog state. `null` while loading is deliberately distinct from `[]`
     after a successful empty read: "we have not looked yet" and "there is
     nothing to select" are different sentences and the room says the right
     one. */
  const [catalog, setCatalog] = useState<PacketCard[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [run, setRun] = useState<RunStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Truthful progress while an apply is running: poll the durable run.
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
      } catch {
        if (cancelled) return;
        setCatalogError("The packet catalog could not be reached.");
        setCatalog([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        setRun(fresh);
        if (fresh.state === "applying") {
          /* The apply route resumes an 'applying' run idempotently — this
             keeps slices flowing if a serverless window closed mid-run. */
          void fetch("/api/admin/auctions/results/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runId: fresh.runId, planSha256: fresh.planSha256 }),
          });
        }
      } catch {
        /* transient poll failure — the run is durable, keep polling */
      }
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [run]);

  async function generatePlan() {
    if (!packet) return;
    setBusy("plan");
    setNote(null);
    try {
      let runId: string | undefined;

      if (packet.uploads.length > 0) {
        for (const u of packet.uploads) {
          if (u.required && !files[u.kind]) {
            setNote(`${u.label} is required before a plan can be generated.`);
            setBusy(null);
            return;
          }
        }
        const tokenRes = await fetch("/api/admin/auctions/results/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adapter: packet.adapter, packetId: packet.packetId }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok) {
          setNote(tokenData?.detail ?? "Staging refused.");
          setBusy(null);
          return;
        }
        runId = tokenData.runId as string;
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
            setNote(`Upload of ${slot.kind} failed: ${error.message}`);
            setBusy(null);
            return;
          }
        }
        /* The server already knows where each kind lives — the uploads route
           recorded the deterministic paths on the run. Nothing path-shaped
           crosses from the browser. */
        setNote("Sources staged. Generating the plan…");
        const planRes = await fetch("/api/admin/auctions/results/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId }),
        });
        const planData = await planRes.json();
        if (!planRes.ok) {
          setNote(planData?.detail ?? "Plan generation refused.");
          setRun(planData?.runId ? ({ ...planData, runId: planData.runId } as RunStatus) : null);
          setBusy(null);
          return;
        }
        setRun(planData as RunStatus);
        setNote(null);
      } else {
        setNote("Fetching registered sources and generating the plan…");
        const planRes = await fetch("/api/admin/auctions/results/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adapter: packet.adapter, packetId: packet.packetId }),
        });
        const planData = await planRes.json();
        if (!planRes.ok) {
          setNote(planData?.detail ?? "Plan generation refused.");
          setBusy(null);
          return;
        }
        setRun(planData as RunStatus);
        setNote(null);
      }
    } catch (e) {
      setNote(`Plan generation failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
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
    }
  }

  const summaryEntries = run ? Object.entries(run.summary ?? {}) : [];

  return (
    <div className="border border-[var(--border-subtle)] p-4">
      {!packet ? (
        <div>
          <div className="mb-3 text-[11px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
            Choose the registered sale you are bringing in
          </div>
          <p className="mb-4 text-[12px] text-[var(--muted)]">
            Results ingestion works from approved, already-proven source packets. A new sale of a
            family that has been proven reusable can be registered, approved and activated here; a
            genuinely new source schema still needs its own reviewed adapter first. This room never
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
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <div className="text-[13px] text-[var(--platinum)]">{packet.title}</div>
            <button
              type="button"
              className="text-[10px] uppercase tracking-[1.5px] text-[var(--slate)] hover:text-[var(--platinum)]"
              onClick={() => {
                setPacket(null);
                setRun(null);
                setNote(null);
              }}
            >
              ← Choose a different packet
            </button>
          </div>
          <p className="mb-4 text-[11px] leading-relaxed text-[var(--muted)]">{packet.description}</p>

          {/* ── source staging ── */}
          {packet.uploads.length > 0 && (!run || run.state === "failed") && (
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

          {/* ── plan (zero writes) ── */}
          {(!run || run.state === "failed") && (
            <button
              type="button"
              className="fw-btn-primary disabled:opacity-40"
              disabled={busy !== null}
              onClick={generatePlan}
            >
              {busy === "plan" ? "Generating plan…" : "Generate Plan — no writes"}
            </button>
          )}

          {note && <p className="mt-3 text-[12px] italic text-[var(--gold-subtle)]">{note}</p>}

          {run?.state === "failed" && (
            <div className="mt-4 border border-[var(--danger,#8a3a3a)] p-3">
              <div className="text-[11px] uppercase tracking-[2px] text-[var(--danger,#c96a6a)]">
                Refused — {run.lastErrorCode ?? "failed"}
              </div>
              <p className="mt-1 text-[12px] text-[var(--platinum-dim)]">{run.lastErrorDetail}</p>
            </div>
          )}

          {/* ── review + explicit apply ── */}
          {run && run.state !== "failed" && (
            <div className="mt-4 border border-[var(--border-subtle)] p-4">
              <div className="mb-2 text-[11px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
                {run.state === "planned" && "Plan ready for review — nothing has been written"}
                {run.state === "applying" && "Applying — bounded slices, durable progress"}
                {run.state === "applied" && "Applied"}
              </div>

              {summaryEntries.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
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

              {run.state === "planned" && run.contradictions.length === 0 && (
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
    </div>
  );
}
