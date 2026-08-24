import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { composeWatchPassport } from "@/lib/passport/watchPassport";

/* ════════════════════════════════════════════════════════════════════════
   /admin/passport/[beadId] — the founder's Passport

   A biography of evidence FairWatchTrade actually has. Everything it can
   say is derived at render time from a governed source; nothing is stored,
   and there is no Passport correction layer, because a correction layer
   could contradict the history it describes.

   ── THE HEADER IS NOT A CHAPTER ────────────────────────────────────────
   "Known to FairWatchTrade since" is the platform's knowledge boundary and
   nothing more. It is not an origin, a manufacture date, a first sale, or
   evidence the watch's real history began there — so it lives in the
   header and never enters the timeline as an event.

   ── CURRENT STATE AND HISTORY ARE KEPT APART ───────────────────────────
   What FWT believes NOW sits above. What happened, and what FWT believed
   when it happened, sits below — including beliefs since withdrawn, shown
   as the beliefs they were rather than quietly re-interpreted.

   PROD GATE: founder-only, hardcoded uid, silent redirect. The API route
   holds its own independent gate; neither trusts the other, and neither is
   navigation-based.
   ════════════════════════════════════════════════════════════════════════ */

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

const C = {
  page: "#0C0F14",
  panel: "#12151B",
  border: "#2A2F3A",
  text: "#E6E9EF",
  muted: "#9BA4B4",
  gold: "#C9A84C",
  warn: "#E2A0A0",
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function WatchPassportPage({
  params,
}: {
  params: Promise<{ beadId: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== ADMIN_USER_ID) {
    redirect("/");
  }

  const { beadId } = await params;
  const p = await composeWatchPassport(beadId);

  const panel: React.CSSProperties = {
    border: `1px solid ${C.border}`,
    background: C.panel,
    padding: 16,
    marginBottom: 18,
  };
  const kicker: React.CSSProperties = {
    color: C.gold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 10,
  };

  if (!p) {
    return (
      <div style={{ background: C.page, color: C.text, minHeight: "100vh", padding: "24px 20px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={panel}>No physical-watch record with that identifier.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.page, color: C.text, minHeight: "100vh", padding: "24px 20px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ marginBottom: 14, fontSize: 13 }}>
          <Link href="/admin" style={{ color: C.gold, textDecoration: "none" }}>
            ← Marketplace Control
          </Link>
        </div>

        {/* ── HEADER · what is true now ─────────────────────────────── */}
        <div style={panel}>
          <div style={kicker}>Watch Passport · founder view</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
            {p.canonicalIdentity
              ? `${p.canonicalIdentity.brand ?? "—"} ${p.canonicalIdentity.model ?? ""}`.trim()
              : "Unidentified record"}
          </div>
          <div style={{ color: C.muted, fontSize: 13, marginBottom: 10 }}>
            {p.canonicalIdentity?.reference ? `Ref. ${p.canonicalIdentity.reference} · ` : ""}
            Record {p.bead.slice(0, 8)}
          </div>

          <div style={{ fontSize: 14, marginBottom: 10 }}>
            Known to FairWatchTrade since <strong>{fmt(p.knownToFwtSince)}</strong>
          </div>

          <div style={{ fontSize: 13, color: p.currentIdentity.conflicted ? C.warn : C.muted }}>
            {p.currentIdentity.conflicted
              ? "Identity continuity under review — current decisions about this record contradict each other, so history from other records is not currently combined here. Nothing has been deleted."
              : p.currentIdentity.state === "RESOLVED"
                ? `Currently resolved with ${p.currentIdentity.members.length - 1} other record(s) as one physical watch.`
                : "Not currently resolved with any other record."}
          </div>
        </div>

        {/* ── TIMELINE · what happened ──────────────────────────────── */}
        <div style={panel}>
          <div style={kicker}>Timeline · {p.timeline.length}</div>
          {p.timeline.length === 0 ? (
            <div style={{ fontSize: 14 }}>
              No recorded chapters. FairWatchTrade holds no events for this watch — which is not
              evidence that none occurred.
            </div>
          ) : (
            p.timeline.map((item) => (
              <div
                key={item.sourceId}
                style={{ borderTop: `1px solid ${C.border}`, padding: "12px 0" }}
              >
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {item.title}
                  {item.identityBasis === "historical_prior_resolution" ? (
                    <span style={{ color: C.warn, fontWeight: 400, fontSize: 12 }}>
                      {" "}
                      · under a prior identity conclusion
                    </span>
                  ) : null}
                </div>
                <div style={{ color: C.muted, fontSize: 12, margin: "3px 0 6px" }}>
                  {fmt(item.effectiveAt)}
                  {item.effectiveAtIsRecordedAt ? " (date recorded, not date it occurred)" : ""}
                  {item.identityAtEvent
                    ? ` · identity generation ${item.identityAtEvent.generation}`
                    : ""}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.7 }}>{item.detail}</div>
              </div>
            ))
          )}
        </div>

        {/* ── EVIDENCE · presence only ──────────────────────────────── */}
        <div style={panel}>
          <div style={kicker}>Identifier evidence</div>
          {p.identifierEvidence.length === 0 ? (
            <div style={{ fontSize: 13, color: C.muted }}>None recorded.</div>
          ) : (
            <>
              {p.identifierEvidence.map((e) => (
                <div
                  key={`${e.identifierType}-${e.sourceClass}`}
                  style={{ fontSize: 13, marginBottom: 4 }}
                >
                  {e.observations} × {e.identifierType.replace(/_/g, " ")} ·{" "}
                  <span style={{ color: C.muted }}>{e.sourceClass.replace(/_/g, " ")}</span>
                </div>
              ))}
              <div style={{ fontSize: 12, color: C.muted, marginTop: 8, lineHeight: 1.7 }}>
                Presence and source only. No value is shown, and the presence of identifier
                evidence is not proof of authenticity.
              </div>
            </>
          )}
        </div>

        {p.sourceGovernanceGaps.length > 0 ? (
          <div style={panel}>
            <div style={kicker}>Source governance gaps</div>
            {p.sourceGovernanceGaps.map((g) => (
              <div key={g} style={{ fontSize: 13, color: C.warn, lineHeight: 1.7, marginBottom: 6 }}>
                {g}
              </div>
            ))}
          </div>
        ) : null}

        <div style={panel}>
          <div style={kicker}>What this Passport does not claim</div>
          {p.disclosures.map((d) => (
            <div key={d} style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 6 }}>
              {d}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
