"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/* ════════════════════════════════════════════════════════════════════════
   FounderAssistant — components/FounderAssistant.tsx   (v6.89)

   The conversational surface of the Persistent Admin Assistant. ONE
   component serving both rooms — invoked from the adjudication row in
   Founder Review, and from the selected-listing inspector in Marketplace
   Control. No permanent rail, no new admin destination, no floating
   element. It occupies space only while open and closes when done;
   conversational intelligence lives in the page, not on top of it.

   The room is a prop, and it changes three things and nothing else: which
   session the server resumes, what the Assistant is allowed to propose, and
   the words on the confirm button. Everything consequential happens
   server-side (/api/admin/assistant): the founder gate, the production
   re-reads, plan resolution, execution through the ONE governed machinery
   for that verb, and the receipt. This component renders the conversation,
   shows the exact plan and its consequences as the SERVER computed them,
   and carries the founder's explicit confirmation — nothing more.

   IT NEVER COMPOSES A CONSEQUENCE. The removal lines shown beside a plan
   come from public.listing_remove_preview() through the server; this file
   has no opinion about how many buyers are affected, so it cannot disagree
   with the product about what is about to happen.

   Closing the card keeps the session; reopening resumes it against current
   production truth. "End session" is the deliberate fresh start.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

type Room = "founder_review" | "marketplace_control";
type ChatLine = { role: "founder" | "assistant" | "room"; text: string };
type PlanItem = {
  listing_id: string;
  code: string;
  brand: string | null;
  model: string | null;
  reference: string | null;
};
type Plan = {
  id: string;
  operation?: "approve_listings" | "remove_listing";
  items: PlanItem[];
  reason_code?: string | null;
  reason_note?: string | null;
};

const INPUT_MAX = 2000;

const ROOM_COPY: Record<
  Room,
  { sub: string; empty: string; placeholder: string; planTitle: (n: number) => string }
> = {
  founder_review: {
    sub: "Approves only what you confirm, through the same governed actions as the row above — recorded as executed by the Assistant on your authority.",
    empty:
      "Name the listings to approve — the open record and the pending-review queue are in reach. Nothing executes until you confirm an exact plan.",
    placeholder: "Ask in words — e.g. approve this listing and FWT-0123…",
    planTitle: (n) => `Approval plan — ${n} listing${n === 1 ? "" : "s"}`,
  },
  marketplace_control: {
    sub: "Answers from the room's live truth, and can take the SELECTED listing off the market once you confirm — never more than one, never a deletion, and always reversible through Restore.",
    empty:
      "Ask about the selected listing, or ask to take it off the market. Removal is reversible, it is one listing at a time, and nothing happens until you confirm.",
    placeholder: "Ask in words — e.g. why does this need attention, or take it off the market…",
    planTitle: () => "Removal plan — 1 listing",
  },
};

export default function FounderAssistant({
  listingId,
  onClose,
  room = "founder_review",
}: {
  listingId: string;
  onClose: () => void;
  room?: Room;
}) {
  const router = useRouter();
  const copy = ROOM_COPY[room];
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [consequences, setConsequences] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  /* Resume on open — the server revalidates any pending plan against
     production and RECOMPUTES its consequences; nothing is trusted from
     memory, including the consequence lines shown when it was proposed. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/assistant?room=${room}`);
        const data = (await res.json().catch(() => ({}))) as {
          session?: {
            id: string;
            messages?: { role: string; text: string }[];
            pending_plan?: Plan | null;
            plan_consequences?: string[];
          } | null;
          resume_report?: string;
          detail?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.detail || `The Assistant is unavailable (${res.status}).`);
        } else if (data.session) {
          setSessionId(data.session.id);
          setLines([
            ...(data.session.messages ?? []).map((m) => ({
              role: m.role === "founder" ? ("founder" as const) : ("assistant" as const),
              text: m.text,
            })),
            ...(data.resume_report ? [{ role: "room" as const, text: data.resume_report }] : []),
          ]);
          setPlan(data.session.pending_plan ?? null);
          setConsequences(data.session.plan_consequences ?? []);
        }
      } catch {
        if (!cancelled) setError("The Assistant is unreachable — nothing was changed.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, plan, busy]);

  async function post(payload: Record<string, unknown>) {
    const res = await fetch("/api/admin/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, ...payload }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setLines((l) => [...l, { role: "founder", text }]);
    setInput("");
    try {
      const { ok, status, data } = await post({
        action: "message",
        session_id: sessionId,
        listing_id: listingId,
        text,
      });
      if (!ok) {
        setError(String(data.detail ?? `The Assistant could not respond (${status}).`));
      } else {
        if (typeof data.session_id === "string") setSessionId(data.session_id);
        setLines((l) => [...l, { role: "assistant", text: String(data.reply ?? "") }]);
        setPlan(data.plan && typeof data.plan === "object" ? (data.plan as Plan) : null);
        setConsequences(Array.isArray(data.consequences) ? (data.consequences as string[]) : []);
      }
    } catch {
      setError("Network error — nothing was recorded or executed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPlan() {
    if (!plan || !sessionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { ok, status, data } = await post({
        action: "confirm",
        session_id: sessionId,
        plan_id: plan.id,
      });
      if (!ok) {
        setError(String(data.detail ?? `Execution was refused (${status}).`));
      } else {
        setLines((l) => [...l, { role: "assistant", text: String(data.reply ?? "") }]);
        setPlan(null);
        setConsequences([]);
        // Statuses genuinely moved — re-render the room from production.
        router.refresh();
      }
    } catch {
      setError("Network error — check the listing statuses before retrying.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelPlan() {
    if (!plan || !sessionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await post({ action: "cancel_plan", session_id: sessionId });
      if (ok) {
        setLines((l) => [
          ...l,
          { role: "assistant", text: String(data.reply ?? "Plan cancelled.") },
        ]);
      }
      setPlan(null);
      setConsequences([]);
    } catch {
      setError("Network error — the plan may still be pending.");
    } finally {
      setBusy(false);
    }
  }

  async function endSession() {
    if (busy) return;
    if (
      !window.confirm("End this Assistant session? The conversation will not resume next time.")
    )
      return;
    setBusy(true);
    try {
      if (sessionId) await post({ action: "close", session_id: sessionId });
    } finally {
      setSessionId(null);
      setLines([]);
      setPlan(null);
      setConsequences([]);
      setBusy(false);
    }
  }

  const isRemoval = plan?.operation === "remove_listing";
  const confirmLabel = isRemoval
    ? `Confirm — take ${plan?.items[0]?.code ?? "this listing"} off the market`
    : `Confirm — approve ${plan?.items.length ?? 0} listing${
        (plan?.items.length ?? 0) === 1 ? "" : "s"
      }`;

  return (
    <section className={`fwa fwa-room-${room}`} aria-label="Founder Assistant">
      <style>{FWA_CSS}</style>
      <header className="fwa-head">
        <div>
          <div className="fwa-kicker">Founder Assistant</div>
          <p className="fwa-sub">{copy.sub}</p>
        </div>
        <div className="fwa-head-actions">
          <button
            type="button"
            className="fwa-quiet"
            onClick={endSession}
            disabled={busy || !sessionId}
          >
            End session
          </button>
          <button type="button" className="fwa-quiet" onClick={onClose}>
            Close
          </button>
        </div>
      </header>

      <div className="fwa-log" ref={logRef}>
        {!ready ? (
          <div className="fwa-room">Reaching the Assistant…</div>
        ) : lines.length === 0 ? (
          <div className="fwa-room">{copy.empty}</div>
        ) : (
          lines.map((m, i) => (
            <div key={i} className={`fwa-line ${m.role}`}>
              <span className="fwa-who">
                {m.role === "founder" ? "You" : m.role === "assistant" ? "Assistant" : "Room"}
              </span>
              <span className="fwa-text">{m.text}</span>
            </div>
          ))
        )}

        {plan && (
          <div className="fwa-plan">
            <div className="fwa-plan-title">{copy.planTitle(plan.items.length)}</div>
            {plan.items.map((it) => (
              <div key={it.listing_id} className="fwa-plan-item">
                <b>{it.code}</b>
                <span>{[it.brand, it.model, it.reference].filter(Boolean).join(" ") || "—"}</span>
              </div>
            ))}

            {isRemoval && (
              <div className="fwa-plan-reason">
                <b>Reason</b>
                <span>
                  {plan.reason_code
                    ? plan.reason_code.replace(/_/g, " ")
                    : "none recorded — the removal carries no reason code"}
                  {plan.reason_note ? ` · ${plan.reason_note}` : ""}
                </span>
              </div>
            )}

            {/* The consequences the SERVER computed. Never restated here. */}
            {consequences.length > 0 && (
              <ul className="fwa-consequences">
                {consequences.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}

            <div className="fwa-plan-note">
              {isRemoval
                ? "Confirming executes one governed removal, re-checked against production first, and records a receipt."
                : "Confirming executes one governed approval per listing and records a receipt. Each listing is re-checked against production first."}
            </div>
            <div className="fwa-plan-actions">
              <button
                type="button"
                className={isRemoval ? "fwa-confirm fwa-confirm-remove" : "fwa-confirm"}
                onClick={confirmPlan}
                disabled={busy}
              >
                {confirmLabel}
              </button>
              <button type="button" className="fwa-quiet" onClick={cancelPlan} disabled={busy}>
                Cancel plan
              </button>
            </div>
          </div>
        )}

        {busy && <div className="fwa-room">Working…</div>}
      </div>

      {error && <div className="fwa-error">{error}</div>}

      <div className="fwa-compose">
        <textarea
          className="fwa-input"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, INPUT_MAX))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          disabled={busy || !ready}
          rows={2}
          placeholder={copy.placeholder}
        />
        <button
          type="button"
          className="fwa-send"
          onClick={() => void send()}
          disabled={busy || !ready || !input.trim()}
        >
          Send
        </button>
      </div>
    </section>
  );
}

/* Panel-family styling — same tokens and scale as the evidence panel it
   sits beneath in Founder Review, scoped by the fwa- prefix.

   MARKETPLACE CONTROL IS A THEMED ROOM. Founder Review's panel is the
   approved dark artifact and keeps its literal values; Marketplace Control
   follows the application's light/dark tokens, so the same component does
   not drop a hardcoded dark slab into a light room. Only the variables are
   re-pointed — every rule below is written once. */
const FWA_CSS = `
.fwa{border-top:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,#10141A,#0F1319);
  --platinum:#E7E4DC;--platinum-dim:#C7CDD8;--muted:#9099A8;--gold:#C9A84C;
  --line:rgba(255,255,255,.08);--line-gold:rgba(201,168,76,.30);
  --field:#0D1015;--field-line:#303642;--chip:#171A21;--well:#0E1117}
.fwa.fwa-room-marketplace_control{
  background:var(--surface);border-top:1px solid var(--border-faint);
  --platinum:var(--platinum);--platinum-dim:var(--platinum-dim);--muted:var(--muted);--gold:var(--gold);
  --line:var(--border-faint);--line-gold:var(--border-gold);
  --field:var(--surface-sunken,var(--surface));--field-line:var(--border-mid);
  --chip:var(--surface-raised,var(--surface));--well:var(--surface-sunken,var(--surface))}
.fwa button{cursor:pointer;font:inherit}
.fwa textarea{font:inherit}
.fwa-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:12px 16px;border-bottom:1px solid var(--line)}
.fwa-kicker{color:var(--gold);font-size:10px;letter-spacing:.16em;text-transform:uppercase;margin-bottom:5px}
.fwa-sub{margin:0;max-width:560px;color:var(--muted);font-size:10px;line-height:1.55}
.fwa-head-actions{display:flex;gap:8px;flex-shrink:0}
.fwa-quiet{border:1px solid var(--field-line);background:var(--chip);color:var(--platinum-dim);padding:6px 10px;font-size:10px}
.fwa-quiet:disabled{opacity:.34;cursor:not-allowed}
.fwa-log{max-height:340px;overflow-y:auto;padding:12px 16px;display:grid;gap:10px}
.fwa-line{display:grid;grid-template-columns:64px minmax(0,1fr);gap:10px;font-size:11px;line-height:1.55}
.fwa-who{color:var(--muted);font-size:9px;letter-spacing:.1em;text-transform:uppercase;padding-top:2px}
.fwa-text{color:var(--platinum-dim);white-space:pre-wrap;overflow-wrap:anywhere}
.fwa-line.founder .fwa-text{color:var(--platinum)}
.fwa-room{color:var(--muted);font-size:10px;line-height:1.6;border:1px dashed var(--field-line);background:var(--well);padding:10px 12px}
.fwa-plan{border:1px solid var(--line-gold);background:rgba(201,168,76,.035);padding:11px 13px}
.fwa-plan-title{color:var(--gold);font-size:10px;letter-spacing:.13em;text-transform:uppercase;margin-bottom:8px}
.fwa-plan-item{display:grid;grid-template-columns:130px minmax(0,1fr);gap:10px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.045);font-size:11px}
.fwa-plan-item b{color:var(--platinum);font-weight:400}
.fwa-plan-item span{color:var(--platinum-dim);overflow-wrap:anywhere}
.fwa-plan-reason{display:grid;grid-template-columns:130px minmax(0,1fr);gap:10px;padding:6px 0;font-size:11px}
.fwa-plan-reason b{color:var(--muted);font-weight:400;font-size:9px;letter-spacing:.1em;text-transform:uppercase;padding-top:2px}
.fwa-plan-reason span{color:var(--platinum-dim)}
.fwa-consequences{margin:8px 0 0;padding:0 0 0 16px;display:grid;gap:4px}
.fwa-consequences li{color:var(--platinum-dim);font-size:11px;line-height:1.55}
.fwa-plan-note{margin-top:8px;color:var(--muted);font-size:9px;line-height:1.5}
.fwa-plan-actions{display:flex;gap:9px;margin-top:10px;flex-wrap:wrap}
.fwa-confirm{border:1px solid rgba(127,169,138,.42);background:var(--chip);color:#A4C7AD;padding:8px 11px;font-size:10px}
.fwa-confirm-remove{border-color:rgba(181,155,91,.55);color:var(--gold)}
.fwa-confirm:disabled{opacity:.34;cursor:not-allowed}
.fwa-error{margin:0 16px 10px;font-size:11px;padding:6px 10px;border:1px solid #5a2a2a;background:#241315;color:#f0857d}
.fwa-compose{display:flex;gap:9px;padding:12px 16px;border-top:1px solid var(--line);align-items:flex-end}
.fwa-input{flex:1;min-height:44px;resize:vertical;background:var(--field);border:1px solid var(--field-line);color:var(--platinum);padding:9px 10px;outline:none;line-height:1.5;font-size:12px}
.fwa-send{border:1px solid var(--line-gold);background:var(--chip);color:var(--gold);padding:9px 14px;font-size:10px}
.fwa-send:disabled{opacity:.34;cursor:not-allowed}
@media(max-width:660px){
  .fwa-line{grid-template-columns:1fr;gap:2px}
  .fwa-plan-item,.fwa-plan-reason{grid-template-columns:1fr;gap:2px}
  .fwa-head{display:block}
  .fwa-head-actions{margin-top:8px}
}
`;
