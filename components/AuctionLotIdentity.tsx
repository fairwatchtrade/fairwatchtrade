"use client";

import { useCallback, useState } from "react";

/* ════════════════════════════════════════════════════════════════════════
   AUCTION LOT IDENTITY — the founder's one-lot adjudication panel

   The sale detail page is read-first and stays that way. This is the one
   place on it where a decision can be made, and it makes exactly one kind:
   what canonical Vault reference an auction lot IS.

   ⚠ IT DECIDES IDENTITY, NOT VISIBILITY. Recording `exact` here does not
   publish the lot, does not grant rights, and does not move it into public
   Market Evidence — those are governed separately and deliberately
   untouched. A lot can be resolved and still correctly invisible.

   THE THREE OUTCOMES ARE NOT THREE BUTTONS FOR THE SAME THING:
     · exact      — this lot is that one Vault reference. One candidate.
     · ambiguous  — the evidence genuinely fits more than one, and saying
                    which would be a guess. Two or more, none selected.
     · unresolved — the Vault has no answer for this yet. No candidates.

   Ambiguous and unresolved are real answers, not failures to answer. The
   governed record keeps them, which is the whole reason a founder is
   allowed to stop at them instead of forcing a match.

   CANDIDATE PROVENANCE IS PRESERVED. Suggestions the resolver produced from
   the catalogue text and rows the founder went looking for are shown apart
   and carry different default evidence, so the record never claims the
   machinery proposed something a human found by hand.
   ════════════════════════════════════════════════════════════════════════ */

type Candidate = {
  vaultReferenceId: string;
  reference: string;
  brand: string;
  collection: string;
  family: string;
  variant: string;
};

type LotSummary = {
  id: string;
  lot_number: string;
  brand_text: string | null;
  model_text: string | null;
  reference_text: string | null;
  hasIdentity: boolean;
};

type LotState = {
  lot: {
    id: string;
    lot_number: string;
    brand_text: string | null;
    model_text: string | null;
    reference_text: string | null;
    description: string | null;
  };
  sale: { sale_name: string } | null;
  hasCase: boolean;
  decision: {
    id: string;
    outcome: string;
    review_reason: string;
    reviewed_at: string;
  } | null;
  decisionCandidates: Array<{
    vault_reference_id: string | null;
    candidate_role: string;
    evidence: string;
  }>;
  suggested: Candidate[];
  searched: Candidate[];
};

type Chosen = { c: Candidate; evidence: string; from: "suggested" | "search" };

const OUTCOMES = [
  { key: "exact", label: "Exact", hint: "This lot is that one Vault reference." },
  { key: "ambiguous", label: "Ambiguous", hint: "Fits more than one; saying which would be a guess." },
  { key: "unresolved", label: "Unresolved", hint: "The Vault has no answer for this yet." },
] as const;

const label = "text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]";
const field =
  "w-full border border-[var(--border-mid)] bg-transparent px-2 py-1.5 text-[12px] text-[var(--platinum)] outline-none focus:border-[var(--border-gold)]";

export default function AuctionLotIdentity({ lots }: { lots: LotSummary[] }) {
  const [lotId, setLotId] = useState<string>("");
  const [state, setState] = useState<LotState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string>("");
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const [reason, setReason] = useState("");
  const [q, setQ] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async (id: string, query = "") => {
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/auctions/lots/${id}/identity${query ? `?q=${encodeURIComponent(query)}` : ""}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || json.error || "load failed");
      setState(json as LotState);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load failed");
    } finally {
      setBusy(false);
    }
  }, []);

  /* Selecting a different lot clears the working decision. Carrying a
     half-built adjudication across subjects is how the wrong reference gets
     attached to the wrong lot.

     Done in the CHANGE HANDLER, not an effect. Resetting state from an
     effect that watches the selection is the pattern this codebase's lint
     rule refuses - it renders once with the previous lot's decision still
     mounted against the new lot's id, and that intermediate frame is
     exactly the wrong-reference-on-the-wrong-lot risk this reset exists to
     prevent. The selection and its consequences are one act. */
  const selectLot = (id: string) => {
    setLotId(id);
    setState(null);
    setOutcome("");
    setChosen([]);
    setReason("");
    setQ("");
    setSaved(null);
    if (id) void load(id);
  };

  const toggle = (c: Candidate, from: "suggested" | "search") => {
    setSaved(null);
    setChosen((prev) => {
      const hit = prev.find((p) => p.c.vaultReferenceId === c.vaultReferenceId);
      if (hit) return prev.filter((p) => p.c.vaultReferenceId !== c.vaultReferenceId);
      return [
        ...prev,
        {
          c,
          from,
          /* Prefilled from HOW the candidate arrived, and editable. The
             governed record requires evidence per candidate; a default that
             states its own provenance is truthful, and a founder who knows
             more can say so. */
          evidence:
            from === "suggested"
              ? `Deterministic brand and reference match on catalogue text "${c.brand} ${c.reference}".`
              : `Founder Vault search match on "${c.reference}".`,
        },
      ];
    });
  };

  const submit = async () => {
    if (!state) return;
    setBusy(true);
    setErr(null);
    setSaved(null);
    try {
      const payload = {
        outcome,
        reviewReason: reason,
        expectedCurrentDecisionId: state.decision?.id ?? null,
        candidates:
          outcome === "unresolved"
            ? []
            : chosen.map((x) => ({
                vaultReferenceId: x.c.vaultReferenceId,
                role: outcome === "exact" ? "selected" : "alternative",
                evidence: x.evidence,
              })),
      };
      const res = await fetch(`/api/admin/auctions/lots/${state.lot.id}/identity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || json.error || "refused");
      setState(json.state as LotState);
      setChosen([]);
      setOutcome("");
      setReason("");
      setSaved(json.decision?.outcome ?? "recorded");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "refused");
    } finally {
      setBusy(false);
    }
  };

  const chosenIds = new Set(chosen.map((x) => x.c.vaultReferenceId));

  const renderCandidates = (list: Candidate[], from: "suggested" | "search") =>
    list.length === 0 ? (
      <p className="text-[11px] italic text-[var(--muted)]">
        {from === "suggested"
          ? "The resolver proposes nothing from this catalogue text. That is an ordinary result, not an error."
          : "No Vault reference matches that search."}
      </p>
    ) : (
      <ul className="grid gap-1">
        {list.map((c) => {
          const on = chosenIds.has(c.vaultReferenceId);
          return (
            <li key={`${from}-${c.vaultReferenceId}`}>
              <button
                type="button"
                onClick={() => toggle(c, from)}
                aria-pressed={on}
                disabled={outcome === "unresolved"}
                className={`w-full cursor-pointer border px-2 py-1.5 text-left text-[12px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  on
                    ? "border-[var(--border-gold)] bg-[var(--gold-whisper)] text-[var(--platinum)]"
                    : "border-[var(--border-subtle)] text-[var(--platinum-dim)] hover:border-[var(--border-mid)]"
                }`}
              >
                <span className="tracking-[0.6px]">{c.reference}</span>
                <span className="text-[var(--muted)]">
                  {" — "}
                  {c.brand} · {c.collection} · {c.family} · {c.variant}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );

  return (
    <section className="mt-6 border border-[var(--border-subtle)] p-4">
      <div className="mb-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--gold-dim)]">
          Lot Identity Adjudication
        </span>
        <p className="mt-1 max-w-[70ch] text-[11px] leading-[1.6] text-[var(--muted)]">
          Records what a lot <em>is</em>. It does not publish it, grant rights, or
          move it into public Market Evidence — those remain governed
          separately.
        </p>
      </div>

      <label className={label} htmlFor="lot-identity-picker">
        Lot
      </label>
      <select
        id="lot-identity-picker"
        value={lotId}
        onChange={(e) => selectLot(e.target.value)}
        className={`${field} mb-3 mt-1`}
      >
        <option value="">Select a lot…</option>
        {lots.map((l) => (
          <option key={l.id} value={l.id}>
            {`Lot ${l.lot_number} — ${l.brand_text ?? "?"} ${l.reference_text ?? ""}`.trim()}
            {l.hasIdentity ? " · decided" : " · no case"}
          </option>
        ))}
      </select>

      {busy && <p className="text-[11px] text-[var(--muted)]">Working…</p>}
      {err && (
        <p className="border border-[#880015] px-2 py-1.5 text-[11px] text-[#E0A845]">
          {err}
        </p>
      )}

      {state && (
        <div className="grid gap-4">
          {/* ── raw evidence ── */}
          <div className="border-t border-[var(--border-subtle)] pt-3">
            <div className={label}>Auction identity evidence</div>
            <dl className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-3">
              {[
                ["Brand text", state.lot.brand_text],
                ["Model text", state.lot.model_text],
                ["Reference text", state.lot.reference_text],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className={label}>{k}</dt>
                  <dd className="text-[12px] text-[var(--platinum)]">
                    {v || <span className="italic text-[var(--muted)]">absent</span>}
                  </dd>
                </div>
              ))}
            </dl>
            {state.lot.description && (
              <p className="mt-2 max-w-[80ch] text-[11px] leading-[1.6] text-[var(--platinum-dim)]">
                {state.lot.description}
              </p>
            )}
          </div>

          {/* ── current governed state ── */}
          <div className="border-t border-[var(--border-subtle)] pt-3">
            <div className={label}>Current governed decision</div>
            {state.decision ? (
              <p className="mt-1 text-[12px] text-[var(--platinum)]">
                <span className="uppercase tracking-[1px]">{state.decision.outcome}</span>
                <span className="text-[var(--muted)]">
                  {" · "}
                  {new Date(state.decision.reviewed_at).toLocaleString()} ·{" "}
                  {state.decision.review_reason}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-[12px] italic text-[var(--muted)]">
                No case. This lot has never been adjudicated.
              </p>
            )}
            {saved && (
              <p className="mt-1 text-[12px] text-[#4CAF7D]">
                ✦ Recorded as {saved}. This lot is no longer “no case”.
              </p>
            )}
          </div>

          {/* ── outcome ── */}
          <div className="border-t border-[var(--border-subtle)] pt-3">
            <div className={label}>Decision</div>
            <div className="mt-1 grid gap-1 sm:grid-cols-3">
              {OUTCOMES.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  aria-pressed={outcome === o.key}
                  onClick={() => {
                    setOutcome(o.key);
                    setSaved(null);
                    if (o.key === "unresolved") setChosen([]);
                  }}
                  className={`cursor-pointer border px-2 py-2 text-left transition ${
                    outcome === o.key
                      ? "border-[var(--border-gold)] bg-[var(--gold-whisper)]"
                      : "border-[var(--border-subtle)] hover:border-[var(--border-mid)]"
                  }`}
                >
                  <span className="block text-[12px] text-[var(--platinum)]">{o.label}</span>
                  <span className="block text-[10px] leading-[1.4] text-[var(--muted)]">
                    {o.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ── candidates ── */}
          {outcome !== "unresolved" && (
            <div className="grid gap-3 border-t border-[var(--border-subtle)] pt-3">
              <div>
                <div className={label}>Resolver suggestions</div>
                <div className="mt-1">{renderCandidates(state.suggested, "suggested")}</div>
              </div>
              <div>
                <label className={label} htmlFor="vault-search">
                  Search the Vault
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id="vault-search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void load(state.lot.id, q);
                    }}
                    placeholder="Reference text…"
                    className={field}
                  />
                  <button
                    type="button"
                    onClick={() => void load(state.lot.id, q)}
                    className="shrink-0 cursor-pointer border border-[var(--border-mid)] px-3 text-[11px] uppercase tracking-[1.2px] text-[var(--platinum-dim)]"
                  >
                    Search
                  </button>
                </div>
                <div className="mt-1">{renderCandidates(state.searched, "search")}</div>
              </div>

              {chosen.length > 0 && (
                <div>
                  <div className={label}>Evidence for each candidate</div>
                  <div className="mt-1 grid gap-2">
                    {chosen.map((x, i) => (
                      <div key={x.c.vaultReferenceId}>
                        <div className="text-[11px] text-[var(--platinum-dim)]">
                          {x.c.reference} · {x.c.brand}
                        </div>
                        <input
                          value={x.evidence}
                          onChange={(e) =>
                            setChosen((prev) =>
                              prev.map((p, j) =>
                                j === i ? { ...p, evidence: e.target.value } : p
                              )
                            )
                          }
                          className={field}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── reason + submit ── */}
          <div className="border-t border-[var(--border-subtle)] pt-3">
            <label className={label} htmlFor="review-reason">
              Why this decision
            </label>
            <input
              id="review-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="The governed record refuses a blank reason."
              className={`${field} mt-1`}
            />
            <button
              type="button"
              disabled={busy || !outcome || !reason.trim()}
              onClick={() => void submit()}
              className="mt-2 cursor-pointer border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-2 text-[11px] uppercase tracking-[1.4px] text-[var(--platinum)] transition hover:border-[var(--gold-dim)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {state.decision ? "Record correction" : "Record decision"}
            </button>
            {state.decision && (
              <p className="mt-1 text-[10px] text-[var(--muted)]">
                Supersedes the current decision; the earlier one is kept, not
                overwritten.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
