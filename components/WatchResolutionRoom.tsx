"use client";

import { useCallback, useEffect, useState } from "react";

/* ════════════════════════════════════════════════════════════════════════
   WatchResolutionRoom — components/WatchResolutionRoom.tsx

   The founder's surface for one question: do these two records describe the
   same physical watch?

   THE THING THIS ROOM MUST KEEP VISIBLE:

     A candidate is a SUGGESTION. Confirming is a human act.

   So the machine's suggestion and the human's conclusion never share a
   visual weight. Candidates are listed plainly with the evidence domain
   that produced them; the three governed actions sit beside them and say
   exactly what they mean. Nothing is pre-selected, nothing is ranked, and
   there is no score — a number here would become a threshold, and a
   threshold would become automatic confirmation.

   Retract is offered as its own action, worded as withdrawal rather than
   disagreement, because retraction asserts NEITHER sameness nor
   difference. Reading it as "undo" is the mistake this wording exists to
   prevent.

   Equality tokens and raw identifiers are never rendered. The founder sees
   THAT two beads share a compatible current observation and which domain
   it belongs to — never the value.
   ════════════════════════════════════════════════════════════════════════ */

type Candidate = {
  left_physical_watch_id: string;
  right_physical_watch_id: string;
  identifier_type: string;
  normalization_version: number;
  token_key_version: number;
  left_source_class: string;
  right_source_class: string;
  left_observation_id: string;
  right_observation_id: string;
};

type Listing = {
  id: string;
  public_code: string | null;
  brand: string | null;
  model: string | null;
  reference: string | null;
  physical_watch_id: string;
};

type Resolution = {
  state: string;
  members?: string[];
  resolved_watch_id?: string | null;
  conflicted?: boolean | null;
  generation?: number;
  committed_generation?: number;
  cached_generation?: number;
};

type Decision = {
  id: string;
  decision_generation: number;
  outcome: string;
  left_physical_watch_id: string;
  right_physical_watch_id: string;
  supersedes_id: string | null;
  reason: string | null;
  evidence_note: string | null;
  recorded_at: string;
};

const C = {
  border: "#2A2F3A",
  panel: "#12151B",
  page: "#0C0F14",
  text: "#E6E9EF",
  muted: "#9BA4B4",
  gold: "#C9A84C",
  warn: "#E2A0A0",
};

export default function WatchResolutionRoom() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [inspect, setInspect] = useState<{
    bead: string;
    resolution: Resolution | null;
    history: Decision[];
    listings: Listing[];
  } | null>(null);

  const fetchCandidates = useCallback(async () => {
    const res = await fetch("/api/admin/watch-resolution");
    if (!res.ok) return null;
    return (await res.json()) as { candidates: Candidate[]; listings: Listing[] };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchCandidates().then((d) => {
      if (cancelled || !d) return;
      setCandidates(d.candidates);
      setListings(d.listings);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchCandidates]);

  const label = (bead: string) => {
    const l = listings.find((x) => x.physical_watch_id === bead);
    if (!l) return bead.slice(0, 8);
    return `${l.brand ?? "—"} ${l.model ?? ""} · ${l.reference ?? "—"}${
      l.public_code ? ` · ${l.public_code}` : ""
    }`;
  };

  async function adjudicate(a: string, b: string, outcome: string) {
    if (busy) return;
    let reason: string | null = null;
    if (outcome === "RETRACTED") {
      reason = window.prompt(
        "Withdrawing the current conclusion for this pair. This asserts neither sameness nor difference. Why?"
      );
      if (!reason) return;
    } else if (
      !window.confirm(
        outcome === "CONFIRMED_SAME_WATCH"
          ? "Record that these two records describe the SAME physical watch?"
          : "Record that these two records are NOT the same physical watch?"
      )
    ) {
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/watch-resolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beadA: a, beadB: b, outcome, reason }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        reason?: string;
        detail?: string;
        resolution?: Resolution;
      };
      if (!res.ok) {
        setFeedback({ kind: "err", text: body.detail || body.reason || `Failed (${res.status}).` });
      } else {
        const r = body.resolution;
        setFeedback({
          kind: "ok",
          text:
            r?.state === "CONFLICTED"
              ? "Recorded — and this component is now CONFLICTED. No current identity is served for it until a decision is retracted."
              : r?.state === "RESOLVED"
                ? `Recorded. Component now holds a current resolved identity (${r.members?.length ?? "?"} beads).`
                : "Recorded. This pair is currently unresolved.",
        });
        const d = await fetchCandidates();
        if (d) {
          setCandidates(d.candidates);
          setListings(d.listings);
        }
      }
    } catch {
      setFeedback({ kind: "err", text: "Network error — nothing was recorded." });
    } finally {
      setBusy(false);
    }
  }

  async function inspectBead(bead: string) {
    const res = await fetch(`/api/admin/watch-resolution?bead=${encodeURIComponent(bead)}`);
    if (!res.ok) return;
    const d = (await res.json()) as {
      bead: string;
      resolution: Resolution | null;
      history: Decision[];
      listings: Listing[];
    };
    setInspect(d);
  }

  const panel: React.CSSProperties = {
    border: `1px solid ${C.border}`,
    background: C.panel,
    padding: 14,
    marginBottom: 18,
  };
  const kicker: React.CSSProperties = {
    color: C.gold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 10,
  };
  const btn: React.CSSProperties = {
    border: `1px solid ${C.border}`,
    background: C.page,
    color: C.text,
    fontSize: 13,
    padding: "6px 12px",
    cursor: busy ? "default" : "pointer",
  };

  return (
    <div>
      <div style={panel}>
        <div style={kicker}>Exact-watch resolution</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
          Candidates below are <strong style={{ color: C.text }}>suggestions</strong> drawn from
          compatible current identifier evidence. They decide nothing. Confirming, recording a
          non-match, and withdrawing a prior conclusion are all human acts, and each one is
          recorded permanently against the two original records — nothing is ever merged, moved,
          or deleted.
        </div>
      </div>

      <div style={panel}>
        <div style={kicker}>Awaiting adjudication · {candidates.length}</div>
        {candidates.length === 0 ? (
          <div style={{ fontSize: 14, color: C.text }}>
            No candidates. Nothing currently shares compatible identifier evidence across two
            unresolved records.
          </div>
        ) : (
          candidates.map((c) => {
            const a = c.left_physical_watch_id;
            const b = c.right_physical_watch_id;
            return (
              <div
                key={`${a}-${b}-${c.identifier_type}`}
                style={{ borderTop: `1px solid ${C.border}`, padding: "12px 0" }}
              >
                <div style={{ fontSize: 14, color: C.text, marginBottom: 4 }}>
                  <button
                    type="button"
                    onClick={() => inspectBead(a)}
                    style={{ ...btn, padding: "2px 6px", fontSize: 13 }}
                  >
                    {label(a)}
                  </button>
                  <span style={{ color: C.muted }}> ↔ </span>
                  <button
                    type="button"
                    onClick={() => inspectBead(b)}
                    style={{ ...btn, padding: "2px 6px", fontSize: 13 }}
                  >
                    {label(b)}
                  </button>
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
                  Matching current {c.identifier_type.replace("_", " ")} evidence · normalization v
                  {c.normalization_version} · key v{c.token_key_version} · sources{" "}
                  {c.left_source_class} / {c.right_source_class}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={busy}
                    style={btn}
                    onClick={() => adjudicate(a, b, "CONFIRMED_SAME_WATCH")}
                  >
                    Same watch
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    style={btn}
                    onClick={() => adjudicate(a, b, "EXPLICIT_NON_MATCH")}
                  >
                    Not the same watch
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {inspect ? (
        <div style={panel}>
          <div style={kicker}>Record · {label(inspect.bead)}</div>
          <div style={{ fontSize: 14, color: C.text, marginBottom: 10 }}>
            {inspect.resolution?.state === "CONFLICTED" ? (
              <span style={{ color: C.warn }}>
                CONFLICTED — decisions about this group contradict each other. No current identity
                is served until one of them is withdrawn.
              </span>
            ) : inspect.resolution?.state === "RESOLVED" ? (
              <>
                Resolved with {inspect.resolution.members?.length ?? 0} records ·{" "}
                <span style={{ color: C.muted }}>
                  generation {inspect.resolution.generation}
                </span>
              </>
            ) : inspect.resolution?.state === "STALE_CACHE" ? (
              <span style={{ color: C.warn }}>
                Derived state is behind the decision log — identity is deliberately not served.
              </span>
            ) : (
              "Not currently resolved with any other record."
            )}
          </div>

          {inspect.history.length === 0 ? (
            <div style={{ fontSize: 13, color: C.muted }}>No decisions recorded yet.</div>
          ) : (
            inspect.history.map((d) => (
              <div
                key={d.id}
                style={{
                  borderTop: `1px solid ${C.border}`,
                  padding: "8px 0",
                  fontSize: 13,
                  color: C.text,
                }}
              >
                <span style={{ color: C.gold }}>gen {d.decision_generation}</span> · {d.outcome}
                {d.supersedes_id ? (
                  <span style={{ color: C.muted }}> · supersedes an earlier decision</span>
                ) : null}
                {d.reason ? <span style={{ color: C.muted }}> · {d.reason}</span> : null}
                <div style={{ marginTop: 4 }}>
                  <button
                    type="button"
                    disabled={busy}
                    style={{ ...btn, fontSize: 12, padding: "3px 9px" }}
                    onClick={() =>
                      adjudicate(d.left_physical_watch_id, d.right_physical_watch_id, "RETRACTED")
                    }
                  >
                    Withdraw this pair&rsquo;s current conclusion
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {feedback ? (
        <div
          style={{
            fontSize: 13,
            color: feedback.kind === "ok" ? "#4CAF7D" : C.warn,
            lineHeight: 1.6,
          }}
        >
          {feedback.text}
        </div>
      ) : null}
    </div>
  );
}
