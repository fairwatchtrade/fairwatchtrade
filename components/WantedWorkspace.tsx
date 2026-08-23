"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ANSWER_KINDS,
  BUDGET_FIT_LABELS,
  CLOSE_REASONS,
  DOCUMENTATION_LABELS,
  DOCUMENTATION_LEVELS,
  STATUS_LABELS,
  ageLabel,
  availableActions,
  displayIdentity,
  type BudgetFit,
  type DocumentationLevel,
  type WantedStatus,
} from "@/lib/wanted";
import { formatMoney } from "@/lib/formatMoney";

/* ════════════════════════════════════════════════════════════════════════
   WANTED — the collector's workspace — components/WantedWorkspace.tsx

   "Tell FairWatchTrade what you are actively trying to buy."

   Identity first, criteria second, private-listing preference third — the
   approved creation sequence. The collector begins with the watch, never
   with prose, and honest ambiguity is respected: brand is the only
   required field, because a collector who knows the dial but not the
   reference must not be made to invent one.

   ── WHAT THIS ROOM IS NOT ──────────────────────────────────────────────
   No feed, no comments, no likes, no public wall, no buyer profile, no way
   for a seller to browse the person. A Wanted request is a demand object
   in a collector's own workspace; the only thing that travels outward is
   the watch and the criteria.

   ── THE BUDGET IS SHOWN HERE AND NOWHERE ELSE ──────────────────────────
   The collector sees their own exact numbers because they wrote them. Every
   surface a seller can reach receives at most three words (within / near /
   outside), computed server-side. The line under each request says so
   plainly, because a collector deciding what to type deserves to know who
   can read it.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

type WantedRow = {
  id: string;
  status: WantedStatus;
  brand: string;
  model_text: string | null;
  reference_text: string | null;
  display_identity: string;
  target_price: number | null;
  max_price: number | null;
  currency: string | null;
  collector_note: string | null;
  min_condition: string | null;
  documentation: DocumentationLevel;
  must_have: string[];
  preferred: string[];
  private_listing_ok: boolean;
  created_at: string;
  answer_count: number;
  unread_answer_count: number;
};

type AnswerRow = {
  id: string;
  kind: (typeof ANSWER_KINDS)[number];
  state: string;
  criteria_report: {
    requiredMet?: string[];
    requiredFailed?: string[];
    requiredUnknown?: string[];
    preferredMet?: string[];
    preferredMissing?: string[];
    budgetFit?: BudgetFit | null;
  };
  created_at: string;
  listing: {
    id: string;
    public_code: string | null;
    brand: string;
    model: string | null;
    reference: string | null;
    condition: string | null;
    asking_price: number | null;
    asking_currency: string | null;
    status: string;
    seller_name: string;
  } | null;
};

const TABS: { key: "active" | "answered" | "paused" | "closed"; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "answered", label: "Answered" },
  { key: "paused", label: "Paused" },
  { key: "closed", label: "Closed" },
];

const inputCls =
  "w-full border border-[var(--border-subtle)] bg-[rgba(7,8,12,0.4)] px-3 py-2 text-[13px] text-[var(--platinum)] outline-none focus:border-[var(--border-gold)]";
const labelCls = "mb-1 block text-[11px] uppercase tracking-[2px] text-[var(--muted)]";
const quietBtn =
  "border border-[var(--border-mid)] px-3 py-1.5 text-[10px] uppercase tracking-[1.5px] text-[var(--slate)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--platinum)]";

type Draft = {
  brand: string;
  modelText: string;
  referenceText: string;
  targetPrice: string;
  maxPrice: string;
  currency: string;
  minCondition: string;
  documentation: DocumentationLevel;
  mustHave: string;
  preferred: string;
  privateListingOk: boolean;
  collectorNote: string;
};

const EMPTY_DRAFT: Draft = {
  brand: "",
  modelText: "",
  referenceText: "",
  targetPrice: "",
  maxPrice: "",
  currency: "USD",
  minCondition: "",
  documentation: "any",
  mustHave: "",
  preferred: "",
  privateListingOk: true,
  collectorNote: "",
};

const splitCriteria = (s: string): string[] =>
  s.split(/[\n,]/).map((v) => v.trim()).filter(Boolean).slice(0, 12);

export default function WantedWorkspace() {
  const params = useSearchParams();

  const [rows, setRows] = useState<WantedRow[] | null>(null);
  const [tab, setTab] = useState<"active" | "answered" | "paused" | "closed">("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /* Browse hand-off: arriving with ?new=1 opens the composer, seeded with
     whatever the collector had already narrowed down. */
  const [composing, setComposing] = useState(() => params.get("new") === "1");
  const [draft, setDraft] = useState<Draft>(() => ({
    ...EMPTY_DRAFT,
    brand: params.get("brand") ?? "",
    modelText: params.get("model") ?? "",
    minCondition: params.get("condition") ?? "",
  }));
  const [editingId, setEditingId] = useState<string | null>(null);

  const [openAnswers, setOpenAnswers] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [closingId, setClosingId] = useState<string | null>(null);

  /* Fetch and state-set are separate so the mount effect can commit AFTER
     the await (the repo's established async-load shape), while mutations
     still have a one-call refresh. */
  const fetchRows = useCallback(async (): Promise<WantedRow[]> => {
    try {
      const res = await fetch("/api/wanted");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.requests) ? data.requests : [];
    } catch {
      return [];
    }
  }, []);

  const load = useCallback(async () => {
    setRows(await fetchRows());
  }, [fetchRows]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await fetchRows();
      if (!cancelled) setRows(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchRows]);

  const [now] = useState(() => Date.now());

  const counts = useMemo(() => {
    const c: Record<string, number> = { active: 0, answered: 0, paused: 0, closed: 0 };
    for (const r of rows ?? []) {
      /* A draft has never been seen by a seller; it belongs with the work
         in progress under Active rather than in a fifth tab. */
      const key = r.status === "draft" ? "active" : r.status;
      if (key in c) c[key] += 1;
    }
    return c;
  }, [rows]);

  const visible = useMemo(
    () =>
      (rows ?? []).filter((r) =>
        tab === "active" ? r.status === "active" || r.status === "draft" : r.status === tab
      ),
    [rows, tab]
  );

  async function submitDraft(activate: boolean) {
    setBusy("save");
    setNote(null);
    try {
      const payload = {
        brand: draft.brand,
        modelText: draft.modelText,
        referenceText: draft.referenceText,
        targetPrice: draft.targetPrice,
        maxPrice: draft.maxPrice,
        currency: draft.currency,
        minCondition: draft.minCondition,
        documentation: draft.documentation,
        mustHave: splitCriteria(draft.mustHave),
        preferred: splitCriteria(draft.preferred),
        privateListingOk: draft.privateListingOk,
        collectorNote: draft.collectorNote,
        activate,
      };
      const res = editingId
        ? await fetch(`/api/wanted/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/wanted", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) {
        setNote(data?.detail ?? "That could not be saved.");
        return;
      }
      if (editingId && activate) {
        await fetch(`/api/wanted/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "activate" }),
        });
      }
      setComposing(false);
      setEditingId(null);
      setDraft({ ...EMPTY_DRAFT });
      setNote(activate ? "Your request is live. Eligible sellers can answer it." : "Saved as a draft.");
      await load();
    } catch {
      setNote("Network error — nothing was saved.");
    } finally {
      setBusy(null);
    }
  }

  async function act(id: string, action: string, closeReason?: string) {
    setBusy(id);
    setNote(null);
    try {
      const res = await fetch(`/api/wanted/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, closeReason }),
      });
      const data = await res.json();
      if (!res.ok) setNote(data?.detail ?? "That did not work.");
      else await load();
    } catch {
      setNote("Network error.");
    } finally {
      setBusy(null);
      setClosingId(null);
    }
  }

  async function showAnswers(id: string) {
    if (openAnswers === id) {
      setOpenAnswers(null);
      return;
    }
    setOpenAnswers(id);
    setAnswers([]);
    try {
      const res = await fetch(`/api/wanted/${id}/answers`);
      if (!res.ok) return;
      const data = await res.json();
      const list: AnswerRow[] = Array.isArray(data.answers) ? data.answers : [];
      setAnswers(list);
      /* Opening the answers marks the unread ones seen — the collector has
         now actually looked at them. */
      for (const a of list.filter((x) => x.state === "unread")) {
        void fetch(`/api/wanted/${id}/answers`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answerId: a.id, state: "viewed" }),
        });
      }
      if (list.some((x) => x.state === "unread")) void load();
    } catch {
      /* the panel simply stays empty */
    }
  }

  function beginEdit(r: WantedRow) {
    setDraft({
      brand: r.brand,
      modelText: r.model_text ?? "",
      referenceText: r.reference_text ?? "",
      targetPrice: r.target_price != null ? String(r.target_price) : "",
      maxPrice: r.max_price != null ? String(r.max_price) : "",
      currency: r.currency ?? "USD",
      minCondition: r.min_condition ?? "",
      documentation: r.documentation,
      mustHave: (r.must_have ?? []).join(", "),
      preferred: (r.preferred ?? []).join(", "),
      privateListingOk: r.private_listing_ok,
      collectorNote: r.collector_note ?? "",
    });
    setEditingId(r.id);
    setComposing(true);
  }

  const previewIdentity = displayIdentity({
    brand: draft.brand,
    modelText: draft.modelText,
    referenceText: draft.referenceText,
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-light text-[var(--platinum)]">Wanted</h1>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            Tell FairWatchTrade what you are actively trying to buy. Eligible sellers can answer
            with governed inventory or create a private listing for you.
          </p>
        </div>
        {!composing && (
          <button
            type="button"
            className="fw-btn-primary"
            onClick={() => {
              setDraft({ ...EMPTY_DRAFT });
              setEditingId(null);
              setComposing(true);
              setNote(null);
            }}
          >
            Create Wanted Request
          </button>
        )}
      </div>

      {note && <p className="mb-4 text-[12px] italic text-[var(--gold-subtle)]">{note}</p>}

      {/* ── composer: identity → criteria → how sellers may answer ── */}
      {composing && (
        <section className="mb-8 border border-[var(--border-subtle)] p-4">
          <div className="mb-4 text-[11px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
            {editingId ? "Edit request" : "Identity first"}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Maker *</label>
              <input
                className={inputCls}
                value={draft.brand}
                onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
                placeholder="Parmigiani Fleurier"
              />
            </div>
            <div>
              <label className={labelCls}>Model / family</label>
              <input
                className={inputCls}
                value={draft.modelText}
                onChange={(e) => setDraft({ ...draft, modelText: e.target.value })}
                placeholder="Kalpa Hebdomadaire"
              />
            </div>
            <div>
              <label className={labelCls}>Reference (if you know it)</label>
              <input
                className={inputCls}
                value={draft.referenceText}
                onChange={(e) => setDraft({ ...draft, referenceText: e.target.value })}
                placeholder="Leave blank if unsure"
              />
            </div>
          </div>
          {previewIdentity && (
            <p className="mt-2 font-display text-[15px] text-[var(--platinum-dim)]">
              {previewIdentity}
            </p>
          )}

          <div className="mt-6 mb-3 text-[11px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
            What matters
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Target price</label>
              <input
                className={inputCls}
                value={draft.targetPrice}
                onChange={(e) => setDraft({ ...draft, targetPrice: e.target.value })}
                inputMode="decimal"
              />
            </div>
            <div>
              <label className={labelCls}>Maximum</label>
              <input
                className={inputCls}
                value={draft.maxPrice}
                onChange={(e) => setDraft({ ...draft, maxPrice: e.target.value })}
                inputMode="decimal"
              />
            </div>
            <div>
              <label className={labelCls}>Currency</label>
              <input
                className={inputCls}
                value={draft.currency}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase().slice(0, 8) })}
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            Your exact numbers stay private. A seller answering your request is told only whether
            their watch is within, near, or outside your range — never the figure itself.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Minimum condition</label>
              <input
                className={inputCls}
                value={draft.minCondition}
                onChange={(e) => setDraft({ ...draft, minCondition: e.target.value })}
                placeholder="Excellent"
              />
            </div>
            <div>
              <label className={labelCls}>Documentation</label>
              <select
                className={inputCls}
                value={draft.documentation}
                onChange={(e) =>
                  setDraft({ ...draft, documentation: e.target.value as DocumentationLevel })
                }
              >
                {DOCUMENTATION_LEVELS.map((d) => (
                  <option key={d} value={d}>
                    {DOCUMENTATION_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Must have (comma separated)</label>
              <input
                className={inputCls}
                value={draft.mustHave}
                onChange={(e) => setDraft({ ...draft, mustHave: e.target.value })}
                placeholder="White guilloché dial, full set"
              />
            </div>
            <div>
              <label className={labelCls}>Preferred</label>
              <input
                className={inputCls}
                value={draft.preferred}
                onChange={(e) => setDraft({ ...draft, preferred: e.target.value })}
                placeholder="Unpolished case"
              />
            </div>
          </div>

          <div className="mt-6 mb-3 text-[11px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
            How sellers may answer
          </div>
          <label className="flex items-start gap-2 text-[13px] text-[var(--platinum-dim)]">
            <input
              type="checkbox"
              className="mt-1"
              checked={draft.privateListingOk}
              onChange={(e) => setDraft({ ...draft, privateListingOk: e.target.checked })}
            />
            <span>
              A private listing is acceptable.
              <span className="mt-1 block text-[11px] text-[var(--muted)]">
                A seller with this watch in hand can list it for you alone — a complete
                FairWatchTrade listing, with the same photographs, review and protections, that
                never becomes public.
              </span>
            </span>
          </label>

          <div className="mt-4">
            <label className={labelCls}>Private note (only you ever see this)</label>
            <input
              className={inputCls}
              value={draft.collectorNote}
              onChange={(e) => setDraft({ ...draft, collectorNote: e.target.value })}
              placeholder="Anything you want to remember about this hunt"
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className="fw-btn-primary disabled:opacity-40"
              disabled={busy !== null || !draft.brand.trim()}
              onClick={() => submitDraft(true)}
            >
              {busy === "save" ? "Saving…" : editingId ? "Save and keep looking" : "Activate request"}
            </button>
            {!editingId && (
              <button
                type="button"
                className={quietBtn}
                disabled={busy !== null || !draft.brand.trim()}
                onClick={() => submitDraft(false)}
              >
                Save as draft
              </button>
            )}
            <button
              type="button"
              className={quietBtn}
              onClick={() => {
                setComposing(false);
                setEditingId(null);
                setNote(null);
              }}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* ── the ledger ── */}
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`border px-3 py-1.5 text-[10px] uppercase tracking-[1.5px] transition-colors ${
              tab === t.key
                ? "border-[var(--border-gold)] bg-[var(--surface)] text-[var(--platinum)]"
                : "border-[var(--border-mid)] text-[var(--slate)] hover:text-[var(--platinum)]"
            }`}
          >
            {t.label}
            {counts[t.key] > 0 ? ` · ${counts[t.key]}` : ""}
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="text-[13px] italic text-[var(--muted)]">Loading your requests…</p>
      ) : visible.length === 0 ? (
        <p className="border border-[var(--border-subtle)] px-4 py-8 text-center text-[13px] italic text-[var(--muted)]">
          {tab === "active"
            ? "Nothing declared yet. Tell FairWatchTrade what you are hunting for."
            : `No ${tab} requests.`}
        </p>
      ) : (
        <div className="divide-y divide-[var(--border-faint)] border border-[var(--border-subtle)]">
          {visible.map((r) => {
            const actions = availableActions(r.status);
            const money =
              r.max_price != null
                ? `Maximum ${formatMoney(r.max_price, r.currency)}`
                : r.target_price != null
                  ? `Target ${formatMoney(r.target_price, r.currency)}`
                  : null;
            return (
              <div key={r.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display text-[19px] text-[var(--platinum)]">
                      {r.display_identity}
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--muted)]">
                      {[
                        r.min_condition ? `${r.min_condition} or better` : null,
                        r.documentation !== "any" ? DOCUMENTATION_LABELS[r.documentation] : null,
                        money,
                        ageLabel(r.created_at, now),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {money && (
                      <div className="mt-1 text-[10px] text-[var(--muted)]">
                        Your figure stays private — sellers see only within / near / outside.
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(r.must_have ?? []).map((m) => (
                        <span
                          key={`m-${m}`}
                          className="border border-[var(--border-mid)] px-2 py-1 text-[9px] uppercase tracking-[1px] text-[var(--platinum-dim)]"
                        >
                          Must · {m}
                        </span>
                      ))}
                      {(r.preferred ?? []).map((p) => (
                        <span
                          key={`p-${p}`}
                          className="border border-[var(--border-faint)] px-2 py-1 text-[9px] uppercase tracking-[1px] text-[var(--muted)]"
                        >
                          Pref · {p}
                        </span>
                      ))}
                      {r.private_listing_ok && (
                        <span className="border border-[var(--border-faint)] px-2 py-1 text-[9px] uppercase tracking-[1px] text-[var(--muted)]">
                          Private listing OK
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[9px] uppercase tracking-[1.5px] text-[var(--gold-dim)]">
                      {r.status === "draft" ? "Draft" : STATUS_LABELS[r.status]}
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--muted)]">
                      {r.answer_count === 0
                        ? "No answers yet"
                        : `${r.answer_count} answer${r.answer_count === 1 ? "" : "s"}`}
                      {r.unread_answer_count > 0 ? ` · ${r.unread_answer_count} new` : ""}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {r.answer_count > 0 && (
                    <button type="button" className={quietBtn} onClick={() => showAnswers(r.id)}>
                      {openAnswers === r.id ? "Hide answers" : "See answers"}
                    </button>
                  )}
                  {r.status === "draft" && (
                    <button
                      type="button"
                      className={quietBtn}
                      disabled={busy === r.id}
                      onClick={() => act(r.id, "activate")}
                    >
                      Activate
                    </button>
                  )}
                  {actions.canEdit && (
                    <button type="button" className={quietBtn} onClick={() => beginEdit(r)}>
                      Edit
                    </button>
                  )}
                  {actions.canPause && (
                    <button
                      type="button"
                      className={quietBtn}
                      disabled={busy === r.id}
                      onClick={() => act(r.id, "pause")}
                    >
                      Pause
                    </button>
                  )}
                  {actions.canResume && (
                    <button
                      type="button"
                      className={quietBtn}
                      disabled={busy === r.id}
                      onClick={() => act(r.id, "resume")}
                    >
                      Resume
                    </button>
                  )}
                  {actions.canClose && (
                    <button
                      type="button"
                      className={quietBtn}
                      onClick={() => setClosingId(closingId === r.id ? null : r.id)}
                    >
                      Close
                    </button>
                  )}
                </div>

                {closingId === r.id && (
                  <div className="mt-3 border border-[var(--border-gold)] p-3">
                    <div className="mb-2 text-[11px] uppercase tracking-[2px] text-[var(--gold-subtle)]">
                      No longer looking? The request is kept, not deleted.
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {CLOSE_REASONS.map((cr) => (
                        <button
                          key={cr.value}
                          type="button"
                          className={quietBtn}
                          disabled={busy === r.id}
                          onClick={() => act(r.id, "close", cr.value)}
                        >
                          {cr.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {openAnswers === r.id && (
                  <div className="mt-4 border-t border-[var(--border-faint)] pt-3">
                    {answers.length === 0 ? (
                      <p className="text-[12px] italic text-[var(--muted)]">Loading answers…</p>
                    ) : (
                      <div className="space-y-3">
                        {answers.map((a) => (
                          <AnswerCard key={a.id} answer={a} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-[11px] leading-relaxed text-[var(--muted)]">
        A Wanted request is not a public advertisement. There is no board, no comments, and no
        contact details — sellers answer with a real FairWatchTrade listing or not at all.
      </p>
    </div>
  );
}

/* ── One governed listing, answering. Never a message. ─────────────────── */
function AnswerCard({ answer }: { answer: AnswerRow }) {
  const l = answer.listing;
  const report = answer.criteria_report ?? {};
  const failed = report.requiredFailed ?? [];
  const unknown = report.requiredUnknown ?? [];
  const met = report.requiredMet ?? [];

  if (!l) {
    return (
      <div className="border border-[var(--border-subtle)] p-3 text-[12px] text-[var(--muted)]">
        A listing answered this request but is not currently viewable.
      </div>
    );
  }

  const isPrivate = answer.kind === "private_listing" || l.status === "private_active";

  return (
    <div className="border border-[var(--border-subtle)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-[16px] text-[var(--platinum)]">
            {[l.brand, l.model].filter(Boolean).join(" ")}
          </div>
          <div className="mt-1 text-[11px] text-[var(--muted)]">
            {[l.reference, l.condition, l.public_code].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-1 text-[11px] text-[var(--muted)]">
            {isPrivate ? "Private listing — created for you" : "Public listing"} · {l.seller_name}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-[17px] text-[var(--gold)]">
            {formatMoney(l.asking_price, l.asking_currency)}
          </div>
        </div>
      </div>

      {(met.length > 0 || failed.length > 0 || unknown.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {met.map((m) => (
            <span
              key={`ok-${m}`}
              className="border border-[var(--border-faint)] px-2 py-1 text-[9px] uppercase tracking-[1px] text-[var(--platinum-dim)]"
            >
              ✓ {m}
            </span>
          ))}
          {failed.map((m) => (
            <span
              key={`no-${m}`}
              className="border border-[#880015] px-2 py-1 text-[9px] uppercase tracking-[1px] text-[var(--platinum-dim)]"
            >
              ✗ {m}
            </span>
          ))}
          {unknown.map((m) => (
            <span
              key={`un-${m}`}
              className="border border-[var(--border-faint)] px-2 py-1 text-[9px] uppercase tracking-[1px] text-[var(--muted)]"
            >
              ? {m} — unconfirmed
            </span>
          ))}
        </div>
      )}

      {report.budgetFit && (
        <div className="mt-2 text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]">
          {BUDGET_FIT_LABELS[report.budgetFit]}
        </div>
      )}

      <div className="mt-3">
        <Link
          href={`/listings/${l.id}`}
          className="border border-[var(--border-mid)] px-3 py-1.5 text-[10px] uppercase tracking-[1.5px] text-[var(--slate)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--platinum)]"
        >
          {isPrivate ? "Open private listing" : "View listing"} →
        </Link>
      </div>
    </div>
  );
}
