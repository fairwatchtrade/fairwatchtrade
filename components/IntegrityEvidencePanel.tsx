"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/* ════════════════════════════════════════════════════════════════════════
   IntegrityEvidencePanel — components/IntegrityEvidencePanel.tsx   (v2.24)

   The Aubrey Check founder evidence panel, built to the approved Design
   Gate artifact (FairWatchTrade_Aubrey_Check_Admin_Evidence_Panel_Design_
   Gate_FINAL.html — Layout's file governs; visual structure and behavior
   are ported, not redesigned). Lives ONLY on /admin/listings/[id], between
   the status controls and the raw record. No parallel moderation room.

   D1 scaling refinement (ruled): ONE shared header and ONE shared founder
   action area; photographs ordered full → partial → unavailable/pending →
   clean → excluded. The first three groups render the full evidence
   comparison; clean and excluded photographs render as compact truthful
   rows, expandable to their full per-photo state. The founder sees the
   photographs requiring judgment first without losing the complete record.

   Adjudication: the four decision buttons POST to the ONE status route
   (with review_action context — Ruling 11 lands every action in
   listing_integrity_reviews); Re-run check POSTs to the founder recheck
   route (inert while AUBREY_ENFORCEMENT is off). Nothing here decides —
   provider output is evidence, never guilt, never an auto-rejection.

   The scoped <style> below is the artifact's stylesheet (panel subset,
   including the 900px/660px breakpoints) — the admin page itself is
   inline-styled and media queries cannot be inline.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export type PanelPhotoState =
  | "full"
  | "partial"
  | "unavailable"
  | "pending"
  | "clean"
  | "excluded";

export type PanelPhoto = {
  mediaId: string;
  category: string | null;
  captureSource: string;
  sellerUrl: string | null;
  state: PanelPhotoState;
  executionLabel: string;
  executionTone: "ok" | "hold" | "danger" | "";
  matchType: "full" | "partial" | null;
  score: number | null;
  matchedImageUrl: string | null;
  sourceUrl: string | null;
  sourceDomain: string | null;
  providerFinding: string;
};

export type PanelReview = {
  status: string;
  resolvedAt: string | null;
  adminNotes: string | null;
} | null;

const NOTE_MAX = 320;

const STATE_ORDER: Record<PanelPhotoState, number> = {
  full: 0,
  partial: 1,
  unavailable: 2,
  pending: 2,
  clean: 3,
  excluded: 4,
};

/* Artifact per-state strings — match type, hold sentence, empty states. */
const MATCH_LABEL: Record<PanelPhotoState, string> = {
  full: "Full match",
  partial: "Partial match",
  unavailable: "No result",
  pending: "Pending",
  clean: "No matching source identified",
  excluded: "No Aubrey evidence",
};
const HOLD_LABEL: Record<PanelPhotoState, string> = {
  full: "Completed evidence requires human review",
  partial: "Partial-image relationship requires human review",
  unavailable: "No adverse hold from provider unavailability",
  pending: "Image-authenticity execution has not completed",
  clean: "No integrity hold",
  excluded: "No Aubrey hold",
};
const EMPTY_STATE: Partial<Record<PanelPhotoState, { title: string; copy: string }>> = {
  unavailable: {
    title: "Provider unavailable",
    copy: "The provider could not complete this execution. No adverse evidence was created. Re-run remains available.",
  },
  pending: {
    title: "No completed evidence",
    copy: "The image-authenticity provider has not returned a completed result.",
  },
  clean: {
    title: "Clean completed result",
    copy: "The provider completed successfully and did not identify a source relationship requiring founder review.",
  },
  excluded: {
    title: "No Aubrey evidence for this photograph",
    copy: "This image is an original dealer-import source excluded from the launch scope. The founder reviews the listing using the existing status controls and other available evidence.",
  },
};
const COMPACT_LABEL: Record<"clean" | "excluded", string> = {
  clean: "Clean completed result — no source relationship identified",
  excluded: "Original dealer-import source — excluded from The Aubrey Check at launch",
};

const ORIGIN_LABEL: Record<string, string> = {
  desktop_upload: "Desktop file upload",
  live_camera: "Mobile camera capture",
  dealer_import: "Imported source photograph",
};

const REVIEW_STATUS_LABEL: Record<string, string> = {
  approved: "Approved by founder",
  rejected: "Rejected by founder",
  clarification_requested: "Clarification requested",
  pending_review: "No prior decision",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) +
      " · " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    );
  } catch {
    return "—";
  }
}

type Action = "approve" | "clarify" | "reject" | "return_to_draft";
const ACTION_STATUS: Record<Action, string> = {
  approve: "published",
  reject: "rejected",
  clarify: "draft",
  return_to_draft: "draft",
};
const ACTION_CONFIRM: Record<Action, string> = {
  approve: "Approve this listing and publish it?",
  reject: "Reject this listing? The provider evidence is context — this is your human decision.",
  clarify:
    "Return this listing to draft and ask the seller for clarification? The seller sees the neutral introduction plus your bounded note.",
  return_to_draft: "Return this listing to draft without a resolution?",
};

export default function IntegrityEvidencePanel({
  listingId,
  currentStatus,
  holdReason,
  sellerClarificationNote,
  review,
  photos,
}: {
  listingId: string;
  currentStatus: string;
  holdReason: string | null;
  sellerClarificationNote: string | null;
  review: PanelReview;
  photos: PanelPhoto[];
}) {
  const router = useRouter();
  const [note, setNote] = useState(review?.adminNotes ?? "");
  const [sellerNote, setSellerNote] = useState("");
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const ordered = [...photos].sort(
    (a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]
  );
  const fullSections = ordered.filter((p) => STATE_ORDER[p.state] <= 2);
  const compact = ordered.filter((p) => STATE_ORDER[p.state] > 2);

  const findings = photos.filter((p) => p.state === "full" || p.state === "partial").length;

  /* Listing-level execution summary for the shared header. */
  const exec = ((): { label: string; tone: "ok" | "hold" | "danger" | "" } => {
    if (review?.status === "rejected") return { label: "Completed · human reviewed", tone: "danger" };
    if (review?.status === "approved") return { label: "Completed · human reviewed", tone: "ok" };
    if (review?.status === "clarification_requested")
      return { label: "Completed · clarification requested", tone: "hold" };
    if (findings > 0) return { label: "Completed · review suggested", tone: "hold" };
    if (photos.some((p) => p.state === "pending")) return { label: "Pending", tone: "" };
    if (photos.some((p) => p.state === "unavailable"))
      return { label: "Unavailable · fail-open", tone: "" };
    if (photos.some((p) => p.state === "clean"))
      return { label: "Completed · no review suggested", tone: "ok" };
    if (photos.length > 0 && photos.every((p) => p.state === "excluded"))
      return { label: "Not run · launch exclusion", tone: "" };
    return { label: "No completed evidence", tone: "" };
  })();

  const currentHold = ((): string => {
    if (holdReason === "finding_review") return "Review required before publication.";
    if (holdReason === "results_pending")
      return "Listing remains in founder review while the execution is pending.";
    if (holdReason === "provider_unavailable")
      return "No adverse image-authenticity finding. Any listing status decision remains human and evidence-based.";
    if (review?.status === "clarification_requested")
      return "Listing returned to editable draft. Review status: clarification_requested.";
    return "No integrity hold. Review may proceed normally.";
  })();

  const reviewStatusValue =
    review?.status === "approved"
      ? "approved"
      : review?.status === "rejected"
        ? "rejected"
        : review?.status === "clarification_requested"
          ? "clarification_requested"
          : holdReason === "finding_review"
            ? "awaiting_human_review"
            : holdReason === "provider_unavailable"
              ? "provider_unavailable"
              : holdReason === "results_pending"
                ? "provider_pending"
                : findings > 0
                  ? "awaiting_human_review"
                  : photos.length > 0 && photos.every((p) => p.state === "excluded")
                    ? "no_aubrey_evidence"
                    : "clear";

  const priorSummary = review ? (REVIEW_STATUS_LABEL[review.status] ?? review.status) : "No prior decision";

  async function act(action: Action) {
    if (busy) return;
    if (action === "clarify" && !clarifyOpen) {
      setClarifyOpen(true);
      return;
    }
    if (!window.confirm(ACTION_CONFIRM[action])) return;
    setBusy(true);
    setFeedback(null);
    try {
      const payload: Record<string, unknown> = {
        status: ACTION_STATUS[action],
        review_action: action,
      };
      if (note.trim()) payload.reviewer_note = note.trim();
      if (action === "clarify" && sellerNote.trim()) {
        payload.seller_clarification_note = sellerNote.trim();
      }
      const res = await fetch(`/api/admin/listings/${listingId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        setFeedback({ kind: "err", text: data?.detail || data?.error || `Action failed (${res.status}).` });
      } else {
        setFeedback({ kind: "ok", text: `Recorded. Listing status: "${data.status ?? ACTION_STATUS[action]}".` });
        setClarifyOpen(false);
        router.refresh();
      }
    } catch {
      setFeedback({ kind: "err", text: "Network error — nothing was changed." });
    } finally {
      setBusy(false);
    }
  }

  async function rerun() {
    if (busy) return;
    if (!window.confirm("Re-run The Aubrey Check for this listing's photographs?")) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/listings/${listingId}/recheck`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        rechecked?: number;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        setFeedback({ kind: "err", text: data?.detail || data?.error || `Re-run failed (${res.status}).` });
      } else {
        setFeedback({ kind: "ok", text: `Re-ran ${data.rechecked ?? 0} check(s).` });
        router.refresh();
      }
    } catch {
      setFeedback({ kind: "err", text: "Network error — nothing was re-run." });
    } finally {
      setBusy(false);
    }
  }

  function renderEvidenceBody(p: PanelPhoto) {
    const empty = EMPTY_STATE[p.state];
    return (
      <div className="evidence-body">
        {p.state === "full" || p.state === "partial" ? (
          <div className="image-compare">
            <article className="image-card">
              <div className="image-label">Seller-uploaded photograph</div>
              <div className="image-frame">
                {p.sellerUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.sellerUrl} alt="Seller-uploaded watch photograph" />
                ) : (
                  <span className="frame-missing">Photograph unavailable</span>
                )}
              </div>
              <div className="image-meta">
                <div className="meta-line"><b>Category</b><span>{p.category || "—"}</span></div>
                <div className="meta-line"><b>Origin</b><span>{ORIGIN_LABEL[p.captureSource] ?? p.captureSource}</span></div>
                <div className="meta-line"><b>Review scope</b><span>Founder-only evidence</span></div>
              </div>
            </article>
            <article className="image-card">
              <div className="image-label">Possible matching image</div>
              <div className="image-frame">
                {p.matchedImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.matchedImageUrl} alt="Possible matching image from a source page" />
                ) : (
                  <span className="frame-missing">Match image unavailable</span>
                )}
              </div>
              <div className="image-meta">
                <div className="meta-line"><b>Source domain</b><span>{p.sourceDomain ?? "—"}</span></div>
                <div className="meta-line">
                  <b>Source page</b>
                  {p.sourceUrl ? (
                    <a href={p.sourceUrl} target="_blank" rel="noreferrer noopener" title={p.sourceUrl}>
                      {p.sourceUrl}
                    </a>
                  ) : (
                    <span>—</span>
                  )}
                </div>
                <div className="meta-line">
                  <b>Provider score</b>
                  <span className="score-tech">
                    {p.score != null ? p.score.toFixed(2) : "—"}
                    <small>Technical visual-similarity evidence. Not a fraud score.</small>
                  </span>
                </div>
              </div>
            </article>
          </div>
        ) : (
          <div className="empty-evidence show">
            <div>
              <h3>{empty?.title ?? "No completed evidence"}</h3>
              <p>{empty?.copy ?? "The image-authenticity provider has not returned a completed result."}</p>
            </div>
          </div>
        )}

        <div className="photo-context">
          <div className="detail-row"><b>Provider finding</b><span>{p.providerFinding}</span></div>
          <div className="detail-row"><b>Execution</b><span>{p.executionLabel}</span></div>
          <div className="detail-row"><b>Hold context</b><span>{HOLD_LABEL[p.state]}</span></div>
        </div>
      </div>
    );
  }

  function renderPhotoSection(p: PanelPhoto) {
    return (
      <section key={p.mediaId} className="photo-section" aria-label="Photograph evidence">
        <div className="state-summary">
          <div className="summary-cell"><b>Match type</b><span>{MATCH_LABEL[p.state]}</span></div>
          <div className="summary-cell"><b>Photo category</b><span>{p.category || "—"}</span></div>
          <div className="summary-cell"><b>Integrity hold reason</b><span>{HOLD_LABEL[p.state]}</span></div>
          <div className="summary-cell"><b>Prior human review</b><span>{priorSummary}</span></div>
        </div>
        {renderEvidenceBody(p)}
      </section>
    );
  }

  return (
    <section className="aubrey-panel" aria-label="Image-authenticity evidence">
      <style>{PANEL_CSS}</style>

      <header className="aubrey-head">
        <div>
          <div className="aubrey-kicker">The Aubrey Check</div>
          <h1 className="aubrey-title">Image-authenticity evidence</h1>
          <p className="aubrey-intro">
            Provider evidence is presented for founder review. It identifies visual relationships
            and source pages; it does not determine seller intent, guilt, or the final listing
            decision.
          </p>
        </div>
        <div className="execution">
          <div className="execution-label">Provider execution</div>
          <div className={`execution-value ${exec.tone}`}>{exec.label}</div>
        </div>
      </header>

      {photos.length === 0 ? (
        <div className="evidence-body">
          <div className="empty-evidence show">
            <div>
              <h3>No completed evidence</h3>
              <p>
                No correlated photographs exist for this listing, so the image-authenticity
                provider has nothing to examine. Listings published before media correlation
                shipped are reviewed with the existing status controls alone.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {fullSections.map(renderPhotoSection)}

          {compact.length > 0 && (
            <div className="compact-list">
              {compact.map((p) =>
                expanded[p.mediaId] ? (
                  <div key={p.mediaId}>
                    <button
                      type="button"
                      className="compact-row"
                      onClick={() => setExpanded((e) => ({ ...e, [p.mediaId]: false }))}
                    >
                      <span className="compact-cat">{p.category || "—"}</span>
                      <span className="compact-state">
                        {COMPACT_LABEL[p.state as "clean" | "excluded"]}
                      </span>
                      <span className="compact-toggle">Collapse ↑</span>
                    </button>
                    {renderPhotoSection(p)}
                  </div>
                ) : (
                  <button
                    key={p.mediaId}
                    type="button"
                    className="compact-row"
                    onClick={() => setExpanded((e) => ({ ...e, [p.mediaId]: true }))}
                  >
                    <span className="compact-cat">{p.category || "—"}</span>
                    <span className="compact-state">
                      {COMPACT_LABEL[p.state as "clean" | "excluded"]}
                    </span>
                    <span className="compact-toggle">Full record ↓</span>
                  </button>
                )
              )}
            </div>
          )}
        </>
      )}

      <div className="evidence-body review-shared">
        <div className="review-grid">
          <section className="review-block">
            <h3>Evidence and review context</h3>
            <div className="detail-row"><b>Current hold</b><span>{currentHold}</span></div>
            <div className="detail-row"><b>Review status</b><span>{reviewStatusValue}</span></div>
            <div className="detail-row"><b>Prior decision</b><span>{priorSummary}</span></div>
            <div className="detail-row"><b>Decision recorded</b><span>{fmtDate(review?.resolvedAt ?? null)}</span></div>
            {(review?.status === "clarification_requested" || clarifyOpen) && (
              <div className="seller-copy">
                <strong>Seller-facing clarification copy</strong>
                We need a little more information about one or more photographs before the
                listing can be published.
                {sellerClarificationNote ? ` ${sellerClarificationNote}` : ""}
              </div>
            )}
            {clarifyOpen && (
              <div className="clarify-input">
                <span className="clarify-label">
                  Bounded seller-visible note (optional · {sellerNote.length} / {NOTE_MAX}) — no
                  provider names, scores, sources, or suspicion language
                </span>
                <textarea
                  value={sellerNote}
                  onChange={(e) => setSellerNote(e.target.value.slice(0, NOTE_MAX))}
                  disabled={busy}
                  rows={3}
                  placeholder="What do you need the seller to confirm or replace?"
                  className="reviewer-note"
                />
              </div>
            )}
          </section>

          <section className="review-block">
            <h3>Reviewer note</h3>
            <div className="prior-decision">
              <b>Bounded internal note</b>
              <span>
                Founder-only. Describe the evidence reviewed and the reason for the human
                decision. Do not infer intent.
              </span>
            </div>
            <div className="note-wrap">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                disabled={busy}
                maxLength={NOTE_MAX}
                placeholder="Record a concise evidence-based note…"
                className="reviewer-note"
              />
              <div className="note-foot">
                <span>Founder-only · maximum {NOTE_MAX} characters</span>
                <span>{note.length} / {NOTE_MAX}</span>
              </div>
            </div>
          </section>
        </div>

        {feedback && (
          <div className={`panel-feedback ${feedback.kind}`}>{feedback.text}</div>
        )}
      </div>

      <footer className="actions">
        <div className="actions-label">Founder adjudication</div>
        <button type="button" className="admin-action approve" disabled={busy || currentStatus === "published"} onClick={() => act("approve")}>
          Approve listing
        </button>
        <button type="button" className="admin-action clarify" disabled={busy} onClick={() => act("clarify")}>
          {clarifyOpen ? "Send clarification request" : "Request clarification"}
        </button>
        <button type="button" className="admin-action reject" disabled={busy || currentStatus === "rejected"} onClick={() => act("reject")}>
          Reject listing
        </button>
        <button type="button" className="admin-action" disabled={busy || currentStatus === "draft"} onClick={() => act("return_to_draft")}>
          Return to draft
        </button>
        <button type="button" className="admin-action rerun" disabled={busy} onClick={rerun}>
          Re-run check
        </button>
      </footer>
    </section>
  );
}

/* Artifact stylesheet — panel subset, verbatim values, plus the compact-row
   additions the D1 refinement calls for. Scoped by the panel's class names. */
const PANEL_CSS = `
.aubrey-panel{border:1px solid #2A2F3A;background:linear-gradient(180deg,#12161D,#10141A);margin-bottom:18px;overflow:hidden;
  --platinum:#E7E4DC;--platinum-dim:#C7CDD8;--muted:#9099A8;--ghost:#687181;--gold:#C9A84C;
  --line:rgba(255,255,255,.08);--line-soft:rgba(255,255,255,.045);--line-gold:rgba(201,168,76,.30);
  --ok:#7FA98A;--hold:#B59B5B;--display:Georgia,"Times New Roman",serif}
.aubrey-panel button{cursor:pointer;font:inherit}
.aubrey-panel textarea{font:inherit}
.aubrey-head{padding:16px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
.aubrey-kicker{color:var(--gold);font-size:10px;letter-spacing:.16em;text-transform:uppercase;margin-bottom:7px}
.aubrey-title{font:400 24px/1.1 var(--display);color:var(--platinum);margin:0}
.aubrey-intro{max-width:650px;margin:8px 0 0;color:var(--muted);font-size:11px;line-height:1.6}
.execution{text-align:right;flex-shrink:0}
.execution-label{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--ghost);margin-bottom:5px}
.execution-value{font-size:11px;color:var(--platinum-dim)}
.execution-value.ok{color:var(--ok)}
.execution-value.hold{color:var(--hold)}
.execution-value.danger{color:#C59292}
.photo-section{border-bottom:1px solid var(--line)}
.state-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-bottom:1px solid var(--line)}
.summary-cell{padding:12px 14px;border-right:1px solid var(--line)}
.summary-cell:last-child{border-right:0}
.summary-cell b{display:block;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--ghost);font-weight:400;margin-bottom:6px}
.summary-cell span{display:block;color:var(--platinum-dim);font-size:11px;line-height:1.45}
.evidence-body{padding:16px}
.image-compare{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.image-card{border:1px solid var(--line);background:#0B0E13;min-width:0}
.image-label{padding:9px 10px;border-bottom:1px solid var(--line);font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:var(--muted)}
.image-frame{height:300px;background:#090B10;display:grid;place-items:center;overflow:hidden}
.image-frame img{width:100%;height:100%;object-fit:contain;display:block}
.frame-missing{color:var(--ghost);font-size:11px}
.image-meta{padding:10px;border-top:1px solid var(--line);display:grid;gap:7px}
.meta-line{display:grid;grid-template-columns:116px minmax(0,1fr);gap:10px;font-size:10px;line-height:1.45}
.meta-line b{color:var(--ghost);font-weight:400;text-transform:uppercase;letter-spacing:.08em}
.meta-line span,.meta-line a{color:var(--platinum-dim);min-width:0;overflow-wrap:anywhere;word-break:break-word}
.meta-line a{color:#92AFE9;text-decoration:none}
.score-tech{font-size:12px;color:var(--platinum)}
.score-tech small{display:block;color:var(--muted);font-size:9px;line-height:1.45;margin-top:3px}
.empty-evidence{display:none;border:1px dashed #303642;background:#0E1117;padding:24px;min-height:180px;align-items:center;justify-content:center;text-align:center}
.empty-evidence.show{display:flex}
.empty-evidence h3{font:400 22px/1.1 var(--display);margin:0 0 8px;color:var(--platinum)}
.empty-evidence p{max-width:610px;margin:0;color:var(--muted);font-size:11px;line-height:1.65}
.photo-context{margin-top:12px;border:1px solid var(--line);background:rgba(255,255,255,.012);padding:10px 13px}
.review-shared{border-top:1px solid var(--line)}
.review-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:14px}
.review-block{border:1px solid var(--line);background:rgba(255,255,255,.012);padding:13px}
.review-block h3{margin:0 0 10px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);font-weight:400}
.detail-row{display:grid;grid-template-columns:150px minmax(0,1fr);gap:10px;padding:7px 0;border-bottom:1px solid var(--line-soft);font-size:10px;line-height:1.5}
.detail-row:last-child{border-bottom:0}
.detail-row b{font-weight:400;color:var(--ghost)}
.detail-row span{color:var(--platinum-dim);overflow-wrap:anywhere}
.seller-copy{margin-top:10px;border-left:1px solid var(--line-gold);padding:9px 11px;background:rgba(201,168,76,.035);color:var(--muted);font-size:10px;line-height:1.55}
.seller-copy strong{display:block;color:var(--platinum-dim);font-weight:400;margin-bottom:4px}
.clarify-input{margin-top:10px;display:flex;flex-direction:column;gap:6px}
.clarify-label{color:var(--ghost);font-size:9px;letter-spacing:.08em;text-transform:uppercase}
.note-wrap{position:relative}
.reviewer-note{width:100%;min-height:108px;resize:vertical;background:#0D1015;border:1px solid #303642;color:var(--platinum);padding:10px;outline:none;line-height:1.55;font-size:12px}
.note-foot{display:flex;justify-content:space-between;gap:12px;color:var(--ghost);font-size:9px;margin-top:6px}
.prior-decision{margin-bottom:10px;padding:10px;border:1px solid var(--line);background:#0E1117}
.prior-decision b{display:block;font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:var(--ghost);font-weight:400;margin-bottom:5px}
.prior-decision span{color:var(--platinum-dim);font-size:10px;line-height:1.5}
.compact-list{border-bottom:1px solid var(--line)}
.compact-row{display:grid;grid-template-columns:170px minmax(0,1fr) auto;gap:12px;width:100%;text-align:left;
  padding:10px 16px;background:transparent;border:0;border-bottom:1px solid var(--line-soft);align-items:center}
.compact-row:hover{background:rgba(255,255,255,.02)}
.compact-cat{color:var(--platinum-dim);font-size:10px;text-transform:uppercase;letter-spacing:.08em}
.compact-state{color:var(--muted);font-size:10px;line-height:1.4}
.compact-toggle{color:#92AFE9;font-size:9px;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
.panel-feedback{margin-top:12px;font-size:12px;padding:6px 10px;border:1px solid #5a2a2a;background:#241315;color:#f0857d}
.panel-feedback.ok{border-color:#2e5a34;background:#132417;color:#7fd18a}
.actions{padding:14px 16px;border-top:1px solid var(--line);display:flex;align-items:center;gap:9px;flex-wrap:wrap;background:#0F1319}
.actions-label{font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:var(--ghost);margin-right:auto}
.admin-action{border:1px solid #303642;background:#171A21;color:#C7CDD8;padding:8px 11px;font-size:10px}
.admin-action.approve{border-color:rgba(127,169,138,.42);color:#A4C7AD}
.admin-action.clarify{border-color:var(--line-gold);color:var(--gold)}
.admin-action.reject{border-color:rgba(166,107,107,.44);color:#C59292}
.admin-action.rerun{color:#A9B9D8}
.admin-action:disabled{opacity:.34;cursor:not-allowed}
@media(max-width:900px){
  .aubrey-head{display:block}
  .execution{margin-top:12px;text-align:left}
  .state-summary{grid-template-columns:1fr 1fr}
  .summary-cell:nth-child(2){border-right:0}
  .summary-cell:nth-child(-n+2){border-bottom:1px solid var(--line)}
  .review-grid{grid-template-columns:1fr}
  .image-frame{height:250px}
}
@media(max-width:660px){
  .image-compare{grid-template-columns:1fr}
  .state-summary{grid-template-columns:1fr}
  .summary-cell{border-right:0;border-bottom:1px solid var(--line)}
  .summary-cell:last-child{border-bottom:0}
  .meta-line,.detail-row{grid-template-columns:1fr;gap:4px}
  .compact-row{grid-template-columns:1fr auto}
  .compact-cat{display:none}
}
`;
