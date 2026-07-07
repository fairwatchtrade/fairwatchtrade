"use client";

import { useState } from "react";

/* ────────────────────────────────────────────────────────────────────────
   ADMIN AUCTION INGEST — components/AdminAuctionIngest.tsx

   The interactive half of /admin/auctions. Operational instrument, boring
   on purpose: clarity and speed over polish, per the /admin law.

   Flow: paste text → Parse (AI drafts, blank-over-guess) → every field
   sits in an editable input → Save. A dedupe match comes back as 409 with
   the existing row: a field-by-field diff renders and ONLY the explicit
   "Update existing" button (confirm_update_id) changes anything. Discard
   is always available. No silent saves, no silent overwrites.

   Text-only v1: the source URL field is provenance metadata — stored if
   provided, never fetched.
   ──────────────────────────────────────────────────────────────────────── */

export type AuctionEventRow = {
  id: string;
  auction_house: string;
  auction_title: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  source_url: string | null;
  online_only: boolean | null;
  updated_at: string;
};

type Draft = {
  auction_house: string;
  auction_title: string;
  location: string;
  starts_at: string;
  ends_at: string;
  preview_url: string;
  catalog_url: string;
  source_url: string;
  online_only: boolean;
};

const EMPTY: Draft = {
  auction_house: "",
  auction_title: "",
  location: "",
  starts_at: "",
  ends_at: "",
  preview_url: "",
  catalog_url: "",
  source_url: "",
  online_only: false,
};

const inputCls =
  "w-full border border-[var(--border-subtle)] bg-[rgba(7,8,12,0.4)] px-3 py-2 text-[13px] text-[var(--platinum)] outline-none focus:border-[var(--border-gold)]";
const labelCls = "mb-1 block text-[9px] uppercase tracking-[2px] text-[var(--muted)]";

function toLocalInput(iso: string): string {
  // ISO → the value a datetime-local input accepts (minute precision, local)
  if (!iso) return "";
  const t = Date.parse(iso);
  if (isNaN(t)) return "";
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string {
  return v ? new Date(v).toISOString() : "";
}

export default function AdminAuctionIngest({ events }: { events: AuctionEventRow[] }) {
  const [pasted, setPasted] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rows, setRows] = useState<AuctionEventRow[]>(events);
  const [busy, setBusy] = useState<"parse" | "save" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ existing: AuctionEventRow } | null>(null);

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  async function runParse() {
    if (!pasted.trim()) return;
    setBusy("parse");
    setNote(null);
    setConflict(null);
    try {
      const res = await fetch("/api/admin/auctions/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasted }),
      });
      const data = await res.json();
      const d = data?.draft ?? {};
      setDraft({
        auction_house: d.auction_house ?? "",
        auction_title: d.auction_title ?? "",
        location: d.location ?? "",
        starts_at: d.starts_at ?? "",
        ends_at: d.ends_at ?? "",
        preview_url: d.preview_url ?? "",
        catalog_url: d.catalog_url ?? "",
        source_url: "",
        online_only: d.online_only === true,
      });
      if (data?.parsed === false) {
        setNote("Parser unavailable — fields left blank for manual entry.");
      }
    } catch {
      setDraft({ ...EMPTY });
      setNote("Parser unavailable — fields left blank for manual entry.");
    } finally {
      setBusy(null);
    }
  }

  async function runSave(confirmUpdateId?: string) {
    if (!draft) return;
    setBusy("save");
    setNote(null);
    try {
      const res = await fetch("/api/admin/auctions/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auction_house: draft.auction_house,
          auction_title: draft.auction_title,
          location: draft.location || null,
          starts_at: draft.starts_at,
          ends_at: draft.ends_at || null,
          preview_url: draft.preview_url || null,
          catalog_url: draft.catalog_url || null,
          source_url: draft.source_url || null,
          online_only: draft.online_only ? true : null,
          ...(confirmUpdateId ? { confirm_update_id: confirmUpdateId } : {}),
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data?.existing) {
        setConflict({ existing: data.existing as AuctionEventRow });
        return;
      }
      if (!res.ok) {
        setNote(data?.detail || "Save failed.");
        return;
      }
      setNote(confirmUpdateId ? "Existing row updated." : "Saved to auction_events.");
      setConflict(null);
      setDraft(null);
      setPasted("");
      // refresh the list from the response id — cheap local update
      const nowIso = new Date().toISOString();
      const newRow: AuctionEventRow = {
        id: data.id,
        auction_house: draft.auction_house,
        auction_title: draft.auction_title,
        location: draft.location || null,
        starts_at: draft.starts_at,
        ends_at: draft.ends_at || null,
        source_url: draft.source_url || null,
        online_only: draft.online_only ? true : null,
        updated_at: nowIso,
      };
      setRows((r) =>
        [...r.filter((x) => x.id !== data.id), newRow].sort(
          (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)
        )
      );
    } catch {
      setNote("Network error — nothing was saved.");
    } finally {
      setBusy(null);
    }
  }

  const diffFields: { key: keyof AuctionEventRow & keyof Draft; label: string }[] = [
    { key: "auction_house", label: "House" },
    { key: "auction_title", label: "Title" },
    { key: "location", label: "Location" },
    { key: "starts_at", label: "Starts" },
    { key: "ends_at", label: "Ends" },
    { key: "source_url", label: "Source URL" },
  ];

  return (
    <div>
      {/* ── paste + parse ── */}
      <label className={labelCls}>Auction listing text (paste from the source page)</label>
      <textarea
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        rows={7}
        placeholder="Paste the announcement / listing text here. URLs are not fetched — paste the words."
        className={`${inputCls} font-mono text-[12px]`}
      />
      <button
        type="button"
        onClick={runParse}
        disabled={busy !== null || !pasted.trim()}
        className="fw-btn-primary mt-3 disabled:opacity-40"
      >
        {busy === "parse" ? "Parsing…" : "Parse →"}
      </button>

      {note && (
        <p className="mt-3 text-[12px] italic text-[var(--gold-subtle)]">{note}</p>
      )}

      {/* ── editable draft — the human decides every field ── */}
      {draft && (
        <div className="mt-8 border border-[var(--border-subtle)] p-4">
          <div className="mb-4 text-[9px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
            Review the draft — nothing is saved until you say so
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>House *</label>
              <input className={inputCls} value={draft.auction_house}
                onChange={(e) => patch({ auction_house: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Sale title *</label>
              <input className={inputCls} value={draft.auction_title}
                onChange={(e) => patch({ auction_title: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Location</label>
              <input className={inputCls} value={draft.location}
                onChange={(e) => patch({ location: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Online only</label>
              <label className="flex items-center gap-2 py-2 text-[13px] text-[var(--platinum-dim)]">
                <input type="checkbox" checked={draft.online_only}
                  onChange={(e) => patch({ online_only: e.target.checked })} />
                Explicitly an online sale
              </label>
            </div>
            <div>
              <label className={labelCls}>Starts *</label>
              <input type="datetime-local" className={inputCls}
                value={toLocalInput(draft.starts_at)}
                onChange={(e) => patch({ starts_at: fromLocalInput(e.target.value) })} />
            </div>
            <div>
              <label className={labelCls}>Ends</label>
              <input type="datetime-local" className={inputCls}
                value={toLocalInput(draft.ends_at)}
                onChange={(e) => patch({ ends_at: fromLocalInput(e.target.value) })} />
            </div>
            <div>
              <label className={labelCls}>Preview URL</label>
              <input className={inputCls} value={draft.preview_url}
                onChange={(e) => patch({ preview_url: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Catalog URL</label>
              <input className={inputCls} value={draft.catalog_url}
                onChange={(e) => patch({ catalog_url: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Source URL (provenance only — never fetched)</label>
              <input className={inputCls} value={draft.source_url}
                onChange={(e) => patch({ source_url: e.target.value })}
                placeholder="Where this text came from, for the record" />
            </div>
          </div>
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => runSave()}
              disabled={busy !== null}
              className="fw-btn-primary disabled:opacity-40">
              {busy === "save" ? "Saving…" : "Save to auction_events"}
            </button>
            <button type="button"
              onClick={() => { setDraft(null); setConflict(null); setNote(null); }}
              className="border border-[var(--border-mid)] px-4 py-2 text-[10px] uppercase tracking-[2px] text-[var(--slate)]">
              Discard
            </button>
          </div>
        </div>
      )}

      {/* ── 409 diff — explicit choice, never silent ── */}
      {conflict && draft && (
        <div className="mt-6 border border-[var(--border-gold)] p-4">
          <div className="mb-3 text-[9px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
            This event already exists — review the difference
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[9px] uppercase tracking-[1px] text-[var(--muted)]">
                <th className="py-1 pr-2">Field</th>
                <th className="py-1 pr-2">Existing</th>
                <th className="py-1">Your draft</th>
              </tr>
            </thead>
            <tbody>
              {diffFields.map(({ key, label }) => {
                const oldV = String(conflict.existing[key] ?? "—");
                const newV = String((draft[key] as string) || "—");
                const changed = oldV !== newV;
                return (
                  <tr key={key} className="border-t border-[var(--border-faint)]">
                    <td className="py-1.5 pr-2 text-[var(--muted)]">{label}</td>
                    <td className="py-1.5 pr-2 text-[var(--slate)]">{oldV}</td>
                    <td className={`py-1.5 ${changed ? "text-[var(--gold)]" : "text-[var(--slate)]"}`}>
                      {newV}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-4 flex gap-3">
            <button type="button"
              onClick={() => runSave(conflict.existing.id)}
              disabled={busy !== null}
              className="fw-btn-primary disabled:opacity-40">
              Update existing row
            </button>
            <button type="button" onClick={() => setConflict(null)}
              className="border border-[var(--border-mid)] px-4 py-2 text-[10px] uppercase tracking-[2px] text-[var(--slate)]">
              Keep both cancelled — go back
            </button>
          </div>
        </div>
      )}

      {/* ── rows already in the table ── */}
      <div className="mt-12">
        <div className="mb-3 text-[9px] uppercase tracking-[3px] text-[var(--muted)]">
          auction_events · {rows.length} row{rows.length === 1 ? "" : "s"}
        </div>
        {rows.length === 0 ? (
          <p className="text-[13px] italic text-[var(--ghost)]">
            Empty. The first paste starts the archive.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border-faint)] border border-[var(--border-subtle)]">
            {rows.map((r) => (
              <div key={r.id} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <span className="text-[13px] text-[var(--platinum-dim)]">
                    {r.auction_house} — {r.auction_title}
                  </span>
                  <span className="ml-2 text-[11px] text-[var(--muted)]">
                    {r.location ?? ""}
                  </span>
                </div>
                <div className="shrink-0 text-[11px] tabular-nums text-[var(--slate)]">
                  {r.starts_at.slice(0, 10)}
                  {r.online_only ? " · online" : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
