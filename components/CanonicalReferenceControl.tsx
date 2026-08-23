"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/* ════════════════════════════════════════════════════════════════════════
   CanonicalReferenceControl — components/CanonicalReferenceControl.tsx

   The founder's correction seam for one listing's canonical Vault identity,
   rendered inside /admin/listings/[id]. Before this control there was no
   mechanism of any kind to see, set, correct, or clear the link.

   THE DISTINCTION THIS PANEL MUST KEEP VISIBLE:

     Seller-stated      what the person typed. Never authoritative.
     Canonical identity the governed Vault row this watch IS.

   Both are shown, always, and never merged into one line — the moment they
   read as one fact, the founder loses the ability to see that a listing's
   text and its identity disagree, which is the single most useful thing
   this panel can tell them.

   The automatic resolver's CURRENT answer is shown beside the stored link,
   including when it honestly refuses: "no match" and "ambiguous" are
   rendered as results, not as failures. An ambiguous reference is the Vault
   distinguishing two real watches that share a string, and the founder is
   the one who decides which — that is the whole reason a human control
   exists here.

   Choosing is by SEARCH, never by typing a UUID: an id that does not exist
   is refused by the route, and a control that invites hand-typed identifiers
   is a control that invites misfiled watches.
   ════════════════════════════════════════════════════════════════════════ */

type Candidate = {
  vaultReferenceId: string;
  reference: string;
  brand: string;
  collection: string;
  family: string;
  variant: string;
};

type Suggestion = {
  status: "resolved" | "no_match" | "ambiguous";
  vaultReferenceId: string | null;
};

type Payload = {
  listing: { brand: string; model: string; reference: string; vaultReferenceId: string | null };
  current: Candidate | null;
  suggestion: Suggestion;
  results: Candidate[];
};

const C = {
  border: "#2A2F3A",
  panel: "#12151B",
  page: "#0C0F14",
  text: "#E6E9EF",
  muted: "#9BA4B4",
  gold: "#C9A84C",
};

function suggestionLine(s: Suggestion, current: string | null): string {
  if (s.status === "ambiguous") {
    return "Resolver: ambiguous — more than one Vault reference matches this brand and reference. It will not choose, and neither will anything downstream.";
  }
  if (s.status === "no_match") {
    return "Resolver: no match — the Vault holds no reference with this text under this brand.";
  }
  if (current && s.vaultReferenceId === current) {
    return "Resolver: agrees with the link stored below.";
  }
  if (current) {
    return "Resolver: resolves to a DIFFERENT reference than the one stored below.";
  }
  return "Resolver: resolves cleanly — this listing can be linked without a judgment call.";
}

export default function CanonicalReferenceControl({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  /* Fetches, never sets — so the mount effect below can land its result in a
     promise callback rather than synchronously in the effect body. */
  const fetchState = useCallback(
    async (q: string): Promise<Payload | null> => {
      try {
        const res = await fetch(
          `/api/admin/listings/${listingId}/canonical-reference${
            q ? `?q=${encodeURIComponent(q)}` : ""
          }`
        );
        if (!res.ok) return null;
        return (await res.json()) as Payload;
      } catch {
        /* The panel is a correction tool, not a monitor — a failed read
           leaves the last good state on screen rather than blanking it. */
        return null;
      }
    },
    [listingId]
  );

  const load = useCallback(
    async (q: string) => {
      const next = await fetchState(q);
      if (next) setData(next);
    },
    [fetchState]
  );

  useEffect(() => {
    let cancelled = false;
    fetchState("").then((next) => {
      if (!cancelled && next) setData(next);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchState]);

  async function write(vaultReferenceId: string | null, confirmText: string) {
    if (busy) return;
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/listings/${listingId}/canonical-reference`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultReferenceId }),
      });
      const body = (await res.json().catch(() => ({}))) as { detail?: string; error?: string };
      if (!res.ok) {
        setFeedback({ kind: "err", text: body.detail || body.error || `Failed (${res.status}).` });
      } else {
        setFeedback({
          kind: "ok",
          text: vaultReferenceId ? "Canonical identity linked." : "Canonical identity cleared.",
        });
        await load(query);
        router.refresh();
      }
    } catch {
      setFeedback({ kind: "err", text: "Network error — nothing changed." });
    } finally {
      setBusy(false);
    }
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
  const field: React.CSSProperties = {
    border: `1px solid ${C.border}`,
    background: C.page,
    color: C.text,
    fontSize: 14,
    padding: "7px 10px",
    width: "100%",
    maxWidth: 420,
  };

  const current = data?.current ?? null;

  return (
    <div style={panel}>
      <div style={kicker}>Canonical identity</div>

      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
        What kind of watch this is — the governed Vault reference. Separate from the
        seller&rsquo;s typed reference, and separate from which physical watch this is.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 3 }}>Seller-stated</div>
          <div style={{ fontSize: 14, color: C.text }}>
            {data ? `${data.listing.brand || "—"} · ${data.listing.reference || "—"}` : "…"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 3 }}>Canonical link</div>
          <div style={{ fontSize: 14, color: current ? C.gold : C.text }}>
            {current
              ? `${current.brand} · ${current.reference} · ${current.variant}`
              : "Not linked"}
          </div>
        </div>
      </div>

      {data ? (
        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, marginBottom: 12 }}>
          {suggestionLine(data.suggestion, data.listing.vaultReferenceId)}
          {data.suggestion.status === "resolved" &&
          data.suggestion.vaultReferenceId !== data.listing.vaultReferenceId ? (
            <>
              {" "}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  write(
                    data.suggestion.vaultReferenceId,
                    "Link this listing to the reference the resolver found?"
                  )
                }
                style={{ ...btn, marginLeft: 6, padding: "3px 9px", fontSize: 12 }}
              >
                Apply
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void load(query);
            }
          }}
          placeholder="Search Vault references…"
          style={field}
          aria-label="Search Vault references"
        />
        <button type="button" style={btn} disabled={busy} onClick={() => void load(query)}>
          Search
        </button>
        {current ? (
          <button
            type="button"
            style={btn}
            disabled={busy}
            onClick={() =>
              write(null, "Clear this listing's canonical identity? It returns to unresolved.")
            }
          >
            Clear link
          </button>
        ) : null}
      </div>

      {data && data.results.length > 0 ? (
        <div style={{ marginTop: 12, border: `1px solid ${C.border}` }}>
          {data.results.map((r) => {
            const isCurrent = r.vaultReferenceId === data.listing.vaultReferenceId;
            return (
              <div
                key={r.vaultReferenceId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 10px",
                  borderBottom: `1px solid ${C.border}`,
                  background: isCurrent ? C.page : "transparent",
                }}
              >
                <div style={{ minWidth: 0, fontSize: 13, color: C.text }}>
                  <span style={{ color: C.gold }}>{r.reference}</span>
                  {" · "}
                  {r.brand}
                  {" · "}
                  <span style={{ color: C.muted }}>
                    {r.collection} / {r.family} / {r.variant}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy || isCurrent}
                  style={{ ...btn, opacity: isCurrent ? 0.5 : 1, flexShrink: 0 }}
                  onClick={() =>
                    write(
                      r.vaultReferenceId,
                      `Link this listing to ${r.brand} ${r.reference} (${r.variant})?`
                    )
                  }
                >
                  {isCurrent ? "Linked" : "Link"}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {feedback ? (
        <div
          style={{
            marginTop: 12,
            fontSize: 13,
            color: feedback.kind === "ok" ? "#4CAF7D" : "#E2A0A0",
          }}
        >
          {feedback.text}
        </div>
      ) : null}
    </div>
  );
}
