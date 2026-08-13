"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WRITABLE_STATUSES, isWritableStatus, type WritableStatus } from "@/lib/listingStatus";

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

   v2.21 · Rejection reason (Dealer Accelerator Flight 2B): selecting
   'rejected' reveals a bounded reason field (≤ 1000 chars) sent as
   rejection_reason. The route stores it only on 'rejected' and clears it on
   every other transition — only the current actionable reason ever exists.
   The dealer sees it in the Review Workspace and corrects before resubmitting.

   v2.24 · Restyled to the approved Aubrey Design Gate artifact (head row,
   "Update status", "Take Down → draft", select order) — VISUALS ONLY. The
   behavior above (confirm dialogs, bounded rejection reason, feedback, the
   one status route) is preserved unchanged per the "preserve the current
   listing-status controls" ruling.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

// The writable set + guard now come from the shared lib/listingStatus.ts
// helper (single source of truth); order and values are unchanged, so the
// founder dropdown renders identically.
const STATUS_OPTIONS = WRITABLE_STATUSES;
type StatusOption = WritableStatus;
const isStatusOption = isWritableStatus;
/* Adverse from the SELLER's side: their listing is refused, or their live
   listing is taken down. Both owe them a reason. */
const ADVERSE_STATUSES: string[] = ["rejected", "draft"];

export default function ListingStatusControls({
  listingId,
  currentStatus,
}: {
  listingId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string>(currentStatus);
  const [selected, setSelected] = useState<StatusOption>(
    isStatusOption(currentStatus) ? currentStatus : "published"
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  async function apply(next: StatusOption, confirmText: string) {
    if (busy) return;
    /* This surface must not be the back door. The server refuses an adverse
       transition without a seller-facing reason regardless of which admin
       control posts it, so asking here is what turns a 400 into an
       explanation the founder can act on. Take Down lands on 'draft', which
       is adverse from the seller's side — their live listing disappeared. */
    if (ADVERSE_STATUSES.includes(next) && !rejectionReason.trim()) {
      setFeedback({
        kind: "err",
        text:
          "A message to the seller is required before this listing can be rejected or returned to draft. They see this text, and it is their only explanation.",
      });
      return;
    }
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/listings/${listingId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          ADVERSE_STATUSES.includes(next)
            ? {
                status: next,
                seller_message: rejectionReason.trim(),
                // Keep the rejection-only column's own meaning intact.
                ...(next === "rejected"
                  ? { rejection_reason: rejectionReason.trim() }
                  : {}),
              }
            : { status: next }
        ),
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
        /* Founder finding (2026-08-12): this control and the adjudication
           panel below act on the same listing but each only updated itself,
           so the page header, the other panel, and the next-in-queue link
           went stale after a change here. The evidence panel already
           refreshes the server render on success; this control now does the
           same, so both surfaces always show one truth. Local feedback text
           survives the refresh — this component keeps its own state. */
        router.refresh();
      }
    } catch {
      setFeedback({ kind: "err", text: "Network error — status unchanged." });
    } finally {
      setBusy(false);
    }
  }

  // v2.24 · artifact styling — head row, control row, same behavior beneath.
  const panel: React.CSSProperties = {
    border: "1px solid #2A2F3A",
    background: "#12151B",
    padding: 14,
    marginBottom: 18,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };
  const label: React.CSSProperties = {
    color: "#8B93A1",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
  };
  const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" };
  const select: React.CSSProperties = {
    background: "#0F1115",
    color: "#E6E8EC",
    border: "1px solid #303642",
    padding: "8px 10px",
    minWidth: 180,
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={label}>Listing status controls</span>
        <span style={{ color: "#C9A84C", fontSize: 11 }}>{status}</span>
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
          {busy ? "Working…" : "Update status"}
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
          Take Down → draft
        </button>
      </div>

      {/* Shown for BOTH adverse targets, and for Take Down — which lands on
          'draft' and is adverse from the seller's side. Required, because
          the transition boundary refuses it blank either way. */}
      {ADVERSE_STATUSES.includes(selected) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={label}>
            Message to seller — required ({rejectionReason.length} / 1000) · shown in their
            account and sent by email
          </span>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value.slice(0, 1000))}
            disabled={busy}
            rows={3}
            placeholder="What happened, why, and what should they do next?"
            style={{ ...select, resize: "vertical", lineHeight: 1.5 }}
          />
        </div>
      )}

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
