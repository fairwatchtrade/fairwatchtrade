"use client";

import { useState } from "react";

/* ════════════════════════════════════════════════════════════════════════
   ListingStatusControls — components/ListingStatusControls.tsx

   Founder-only status control panel for /admin/listings/[id]. Client component
   (needs confirm() + inline feedback). Talks to the status API route, which
   runs its OWN independent admin check and performs the write with the trusted
   client (RLS would otherwise silently no-op a cross-seller update).

   Two actions:
     · Apply status — sets the listing to the selected value (draft / published
       / rejected / pending_review). Disabled when it matches the current status.
     · Take Down    — one click, distinct button, sets status to 'draft' and
       removes the listing from public view. Disabled when already draft.

   Both confirm() before firing. Inline success/error feedback, no redirect.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

const STATUS_OPTIONS = ["draft", "published", "rejected", "pending_review"] as const;
type StatusOption = (typeof STATUS_OPTIONS)[number];

function isStatusOption(v: string): v is StatusOption {
  return (STATUS_OPTIONS as readonly string[]).includes(v);
}

export default function ListingStatusControls({
  listingId,
  currentStatus,
}: {
  listingId: string;
  currentStatus: string;
}) {
  const [status, setStatus] = useState<string>(currentStatus);
  const [selected, setSelected] = useState<StatusOption>(
    isStatusOption(currentStatus) ? currentStatus : "published"
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function apply(next: StatusOption, confirmText: string) {
    if (busy) return;
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/listings/${listingId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        setFeedback({
          kind: "err",
          text: data?.detail || data?.error || `Update failed (${res.status}).`,
        });
      } else {
        const applied = data.status ?? next;
        setStatus(applied);
        if (isStatusOption(applied)) setSelected(applied);
        setFeedback({ kind: "ok", text: `Status changed to "${applied}".` });
      }
    } catch {
      setFeedback({ kind: "err", text: "Network error — status unchanged." });
    } finally {
      setBusy(false);
    }
  }

  const panel: React.CSSProperties = {
    border: "1px solid #2a2f3a",
    background: "#15181e",
    padding: "14px 16px",
    marginBottom: 18,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };
  const label: React.CSSProperties = { color: "#8b93a1", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 };
  const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" };
  const select: React.CSSProperties = {
    background: "#0f1115",
    color: "#e6e8ec",
    border: "1px solid #2a2f3a",
    padding: "6px 10px",
    fontSize: 12,
    fontFamily: "inherit",
  };
  const btn: React.CSSProperties = {
    background: "#1c2230",
    color: "#e6e8ec",
    border: "1px solid #2a2f3a",
    padding: "6px 14px",
    fontSize: 12,
    fontFamily: "inherit",
    cursor: "pointer",
  };
  const takeDownBtn: React.CSSProperties = {
    ...btn,
    background: "#2a1518",
    color: "#f0857d",
    borderColor: "#5a2a2a",
  };
  const disabledBtn: React.CSSProperties = { opacity: 0.4, cursor: "not-allowed" };

  const applyDisabled = busy || selected === status;
  const takeDownDisabled = busy || status === "draft";

  return (
    <div style={panel}>
      <div>
        <span style={label}>Current status</span>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#e0a83c", marginTop: 2 }}>{status}</div>
      </div>

      <div style={row}>
        <select
          value={selected}
          onChange={(e) => isStatusOption(e.target.value) && setSelected(e.target.value)}
          disabled={busy}
          style={select}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => apply(selected, `Change status to "${selected}"?`)}
          disabled={applyDisabled}
          style={applyDisabled ? { ...btn, ...disabledBtn } : btn}
        >
          {busy ? "Working…" : "Apply status"}
        </button>

        <button
          type="button"
          onClick={() =>
            apply(
              "draft",
              "Take this listing down? It will be set to draft and removed from public view."
            )
          }
          disabled={takeDownDisabled}
          style={takeDownDisabled ? { ...takeDownBtn, ...disabledBtn } : takeDownBtn}
        >
          Take Down
        </button>
      </div>

      {feedback && (
        <div
          style={{
            fontSize: 12,
            padding: "6px 10px",
            border: `1px solid ${feedback.kind === "ok" ? "#2e5a34" : "#5a2a2a"}`,
            background: feedback.kind === "ok" ? "#132417" : "#241315",
            color: feedback.kind === "ok" ? "#7fd18a" : "#f0857d",
          }}
        >
          {feedback.text}
        </div>
      )}
    </div>
  );
}
