import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import ListingStatusControls from "@/components/ListingStatusControls";
import IntegrityEvidencePanel, {
  type PanelPhoto,
  type PanelPhotoState,
  type PanelReview,
} from "@/components/IntegrityEvidencePanel";
import { PROVIDER_IMAGE_AUTHENTICITY } from "@/lib/integrity";

/* ════════════════════════════════════════════════════════════════════════
   /admin/listings/[id] — LISTING REVIEW  (v2.1 · founder reads any listing)

   This URL is PERMANENT. The Operations Center points here — never back into
   Supabase. Shows the raw record and now carries founder-only status controls
   (change status / take down), matching /admin's protection model.

   ── PROD GATE — NOW ENFORCED ────────────────────────────────────────────
   Founder-only, identical pattern to /admin (page-admin.tsx): a hardcoded
   single-UID check, silent redirect to / for anyone else. The literal is
   intentionally duplicated here and in the status API route — two independent
   gates, never one shared constant both surfaces trust.

   ── v2.1 · ADMIN VISIBILITY GAP CLOSED (Dealer Accelerator Flight 2A) ───
   The record was previously read with the SESSION client, so RLS
   (listings_select_public_or_own = published OR auth.uid() = seller_id)
   scoped it to published listings plus the founder's own. That covered the
   takedown case but left a real hole: another seller's NON-published listing
   was simply invisible here. Dealer Accelerator makes that hole load-bearing
   — a dealer's submitted draft is pending_review and owned by the dealer, so
   it is neither published nor the founder's own, and the founder could not
   reach the very listing they are meant to adjudicate. A transition into an
   unreachable state is worse than no transition at all.

   The read now uses the TRUSTED service client, which bypasses RLS — the same
   precedent already established by the admin status route and the Flight 1
   import route, and reached by the same discipline: ONLY after the founder
   gate below has already passed. The gate still runs on the session client,
   so authentication is never delegated to the client that ignores RLS. Two
   independent things: the session client proves who you are; the service
   client is only handed the read once that proof holds.

   PFC274 = 62 — the evaluate route is untouched.
   ──────────────────────────────────────────────────────────────────────── */

export const dynamic = "force-dynamic";

// Defense-in-depth literal — intentionally duplicated in the status route,
// independent of any shared constant. Matches /admin (page-admin.tsx).
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

/* ── v2.24 · The Aubrey Check evidence-panel model (Design Gate artifact
      governs; D1 refinement: per-photo states, judgment-first ordering).
      Derivation runs here, server-side, from founder-locked tables — the
      client component only renders what this page hands it. ── */

type AubreyProviderRow = {
  id: string;
  media_id: string | null;
  capture_session_id: string | null;
  storage_path: string | null;
  execution_status: string;
  classification: string | null;
  is_active: boolean;
  attempt_number: number | null;
  reason: string | null;
  detail: Record<string, unknown> | null;
};

type MediaRow = {
  id: string;
  storage_path: string | null;
  capture_session_id: string | null;
  category: string | null;
  capture_source: string;
};

/* One purchase request on this listing, as the founder needs to read it:
   the state AND the attribution, never the state alone. buyer_id is
   deliberately not selected — this panel answers "what happened to this
   listing", and naming the buyers is not part of that question. */
type LifecycleRequest = {
  id: string;
  status: string;
  closure_cause: string | null;
  proposed_purchase_price: number | null;
  proposed_currency: string | null;
  created_at: string;
  updated_at: string | null;
};

/* The founder-facing sentence for each closure. Distinct from the seller's
   and the buyer's wording on purpose: this surface is diagnostic, so it names
   the actor plainly rather than softening it, and an unattributed legacy
   closure is shown AS unattributed instead of being guessed. */
function closureSentence(r: LifecycleRequest): string {
  if (r.status !== "cancelled") return "";
  if (r.closure_cause === "buyer_withdrew") return "closed by the buyer";
  if (r.closure_cause === "listing_removed_by_seller")
    return "closed by the seller removing the listing";
  return "closed — cause not recorded";
}

const REMOVAL_REASON: Record<string, string> = {
  sold_in_store: "Sold in store",
  sold_elsewhere: "Sold elsewhere",
  no_longer_for_sale: "No longer for sale",
  listing_mistake: "Mistake in the listing",
  other: "Other",
};

const EXEC_LABEL: Record<PanelPhotoState, { label: string; tone: "ok" | "hold" | "danger" | "" }> = {
  full: { label: "Completed · review suggested", tone: "hold" },
  partial: { label: "Completed · review suggested", tone: "hold" },
  unavailable: { label: "Unavailable · fail-open", tone: "" },
  pending: { label: "No completed evidence", tone: "" },
  clean: { label: "Completed · no review suggested", tone: "ok" },
  excluded: { label: "Not run · launch exclusion", tone: "" },
};

const FINDING_FALLBACK: Record<PanelPhotoState, string> = {
  full: "High visual similarity across the full seller photograph.",
  partial: "A partially matching image region was located on an external source page.",
  unavailable: "No completed finding. Execution history records provider unavailability only.",
  pending: "No completed provider finding.",
  clean: "Completed with no matching public-web source identified.",
  excluded: "No provider execution was created for this launch-excluded image origin.",
};

function buildPanelPhoto(
  media: MediaRow,
  rows: AubreyProviderRow[],
  urlByPath: Map<string, string>
): PanelPhoto {
  // The row that speaks for this photo: the active completed attempt if one
  // exists, else the latest attempt of any kind.
  const mine = rows
    .filter(
      (r) =>
        r.media_id === media.id ||
        (r.media_id === null &&
          r.capture_session_id === media.capture_session_id &&
          r.storage_path === media.storage_path)
    )
    .sort((a, b) => (b.attempt_number ?? 0) - (a.attempt_number ?? 0));
  const row =
    mine.find((r) => r.execution_status === "completed" && r.is_active === true) ??
    mine[0] ??
    null;

  let state: PanelPhotoState;
  if (media.capture_source === "dealer_import") {
    state = "excluded";
  } else if (!row) {
    state = "pending";
  } else if (row.execution_status === "completed" && row.is_active === true) {
    if (row.classification === "passed") {
      state = "clean";
    } else {
      const matchType = (row.detail ?? {})["match_type"];
      state = matchType === "partial" ? "partial" : "full";
    }
  } else if (row.execution_status === "pending") {
    state = "pending";
  } else {
    state = "unavailable";
  }

  const d = (row?.detail ?? {}) as Record<string, unknown>;
  const isFinding = state === "full" || state === "partial";
  return {
    mediaId: media.id,
    category: media.category,
    captureSource: media.capture_source,
    sellerUrl: media.storage_path ? (urlByPath.get(media.storage_path) ?? null) : null,
    state,
    executionLabel: EXEC_LABEL[state].label,
    executionTone: EXEC_LABEL[state].tone,
    matchType: isFinding ? (state === "partial" ? "partial" : "full") : null,
    score: isFinding && typeof d.best_score === "number" ? d.best_score : null,
    matchedImageUrl:
      isFinding && typeof d.matched_image_url === "string" ? d.matched_image_url : null,
    sourceUrl:
      isFinding && typeof d.matched_source_url === "string" ? d.matched_source_url : null,
    sourceDomain:
      isFinding && typeof d.matched_domain === "string" ? d.matched_domain : null,
    providerFinding: row?.reason ?? FINDING_FALLBACK[state],
  };
}

export default async function ListingReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // ── PROD GATE: founder-only, silent redirect for everyone else ──
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== ADMIN_USER_ID) {
    redirect("/");
  }

  const wrap: React.CSSProperties = {
    minHeight: "100vh",
    background: "#0f1115",
    color: "#e6e8ec",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 13,
    padding: "20px 24px",
  };

  // Founder gate passed. Read with the trusted client so ANY listing is
  // reachable — including another seller's draft/pending_review row, which RLS
  // would otherwise hide from this page entirely. maybeSingle() rather than
  // single(): a missing row is a legitimate "not found" render below, not an
  // error to throw.
  let listing: Record<string, unknown> | null = null;
  let panelPhotos: PanelPhoto[] = [];
  let panelReview: PanelReview = null;
  /* ── Next-in-queue (founder request, 2026-08-12): adjudicating one listing
        must not dead-end back at the Operations Center list. The oldest OTHER
        pending_review listing is fetched alongside this one so the header can
        always offer the next stop — computed at load, so it stays correct
        right after a decision on THIS listing changes its status. ── */
  let nextPending: { id: string; brand: string; model: string } | null = null;
  let pendingCount = 0;
  /* Stage 6 — every purchase request this listing ever carried, with WHY each
     closed. Read through the service client for the same reason the listing
     is: the founder is not a party to these requests and RLS would correctly
     hide them from an ordinary session. */
  let lifecycleRequests: LifecycleRequest[] = [];
  try {
    const service = createServiceClient();
    const { data } = await service.from("listings").select("*").eq("id", id).maybeSingle();
    listing = data ?? null;

    const { data: nextRow, count } = await service
      .from("listings")
      .select("id, brand, model", { count: "exact" })
      .eq("status", "pending_review")
      .neq("id", id)
      .order("created_at", { ascending: true })
      .limit(1);
    pendingCount = count ?? 0;
    const first = (nextRow ?? [])[0];
    if (first) {
      nextPending = {
        id: String(first.id),
        brand: typeof first.brand === "string" ? first.brand : "—",
        model: typeof first.model === "string" ? first.model : "",
      };
    }

    /* ── v2.24 · Aubrey evidence fetches — founder-locked tables, read only
          after the gate above, only when the listing exists. A failure in
          any of these degrades to an empty panel, never a broken page. ── */
    if (listing) {
      const { data: requestRows } = await service
        .from("purchase_requests")
        .select(
          "id, status, closure_cause, proposed_purchase_price, proposed_currency, created_at, updated_at"
        )
        .eq("listing_id", id)
        .order("created_at", { ascending: false });
      lifecycleRequests = (requestRows ?? []) as LifecycleRequest[];

      const { data: mediaRows } = await service
        .from("listing_media")
        .select("id, storage_path, capture_session_id, category, capture_source")
        .eq("listing_id", id)
        .order("sequence_index", { ascending: true });
      const media = (mediaRows ?? []) as MediaRow[];

      if (media.length > 0) {
        const mediaIds = media.map((m) => m.id);
        const sessionIds = Array.from(
          new Set(media.map((m) => m.capture_session_id).filter((s): s is string => !!s))
        );

        const providerRows: AubreyProviderRow[] = [];
        const { data: postRows } = await service
          .from("listing_integrity_provider_results")
          .select(
            "id, media_id, capture_session_id, storage_path, execution_status, classification, is_active, attempt_number, reason, detail"
          )
          .eq("provider", PROVIDER_IMAGE_AUTHENTICITY)
          .in("media_id", mediaIds);
        providerRows.push(...((postRows ?? []) as AubreyProviderRow[]));
        if (sessionIds.length > 0) {
          const { data: preRows } = await service
            .from("listing_integrity_provider_results")
            .select(
              "id, media_id, capture_session_id, storage_path, execution_status, classification, is_active, attempt_number, reason, detail"
            )
            .eq("provider", PROVIDER_IMAGE_AUTHENTICITY)
            .in("capture_session_id", sessionIds)
            .is("media_id", null);
          providerRows.push(...((preRows ?? []) as AubreyProviderRow[]));
        }

        const urlByPath = new Map<string, string>();
        for (const p of ((listing.photos ?? []) as {
          photo?: { url?: unknown; pathname?: unknown };
        }[])) {
          const url = typeof p?.photo?.url === "string" ? p.photo.url : "";
          const pathname = typeof p?.photo?.pathname === "string" ? p.photo.pathname : "";
          if (url && pathname) urlByPath.set(pathname, url);
        }

        panelPhotos = media.map((m) => buildPanelPhoto(m, providerRows, urlByPath));
      }

      const { data: reviewRow } = await service
        .from("listing_integrity_reviews")
        .select("status, resolved_at, admin_notes")
        .eq("listing_id", id)
        .maybeSingle();
      if (reviewRow) {
        panelReview = {
          status: reviewRow.status as string,
          resolvedAt: (reviewRow.resolved_at as string | null) ?? null,
          adminNotes: (reviewRow.admin_notes as string | null) ?? null,
        };
      }
    }
  } catch (e) {
    // Trusted client unavailable (missing service-role config). Fail visibly
    // rather than rendering a misleading "Listing not found" for a listing
    // that may well exist.
    console.error("[admin] listing review — trusted client unavailable:", e);
    return (
      <div style={wrap}>
        <Link href="/admin" style={{ color: "#7aa2f7", textDecoration: "none" }}>
          ← Operations Center
        </Link>
        <div style={{ marginTop: 16, color: "#e07070" }}>
          Admin read channel unavailable — the listing could not be loaded. This is a
          server configuration problem, not a missing listing.
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div style={wrap}>
        <Link href="/admin" style={{ color: "#7aa2f7", textDecoration: "none" }}>
          ← Operations Center
        </Link>
        <div style={{ marginTop: 16 }}>Listing not found: {id}</div>
      </div>
    );
  }

  const currentStatus =
    typeof listing.status === "string" ? (listing.status as string) : "—";

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <Link href="/admin" style={{ color: "#7aa2f7", textDecoration: "none" }}>
            ← Operations Center
          </Link>
          {nextPending ? (
            <Link
              href={`/admin/listings/${nextPending.id}`}
              style={{ color: "#e0af68", textDecoration: "none" }}
            >
              Next in review queue: {nextPending.brand} {nextPending.model} →
              <span style={{ color: "#565f89", marginLeft: 8 }}>
                ({pendingCount} waiting)
              </span>
            </Link>
          ) : (
            <span style={{ color: "#565f89" }}>Review queue clear</span>
          )}
        </div>

        <div style={{ margin: "14px 0 4px", fontSize: 18, fontWeight: 700 }}>
          {(listing.brand as string) || "—"} {(listing.model as string) || ""}
        </div>
        <div style={{ marginBottom: 4, color: "#8b93a1", fontSize: 12 }}>
          Listing Review · founder-only adjudication surface
        </div>
        {/* v2.24 · status badge — artifact element, additive */}
        <div
          style={{
            display: "inline-block",
            border: "1px solid #2A2F3A",
            background: "#15181E",
            color: "#E0A83C",
            padding: "4px 10px",
            fontSize: 11,
            marginBottom: 18,
          }}
        >
          Current status: {currentStatus}
        </div>

        {/* Founder-only status controls (client). Replaces the old
            "Coming Soon" placeholder. */}
        <ListingStatusControls listingId={id} currentStatus={currentStatus} />

        {/* Stage 6 · Lifecycle — what happened to this listing and to the
            requests it carried. Placed above the evidence panel because it
            answers the first question the founder asks about a listing that
            is no longer live: who took it off, why, and what that did to the
            people who were mid-conversation about it.

            This exists because the facts alone were already in the raw record
            below and were unreadable there — a removal reason and a closure
            cause sitting as two more rows in an alphabetical key/value dump
            is storage, not a lifecycle view. */}
        <div
          style={{
            border: "1px solid #2A2F3A",
            background: "#15181E",
            padding: "14px 16px",
            marginBottom: 18,
          }}
        >
          <div
            style={{
              color: "#E0A83C",
              fontSize: 11,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Lifecycle
          </div>

          {currentStatus === "removed" ? (
            <div style={{ fontSize: 13, color: "#C6CCD8", lineHeight: 1.6 }}>
              The seller took this watch off the market
              {typeof listing.removed_at === "string"
                ? ` on ${new Date(listing.removed_at).toLocaleString("en-US")}`
                : ""}
              .
              <div style={{ color: "#8b93a1", marginTop: 4 }}>
                Reason:{" "}
                <span style={{ color: "#C6CCD8" }}>
                  {typeof listing.removal_reason_code === "string"
                    ? (REMOVAL_REASON[listing.removal_reason_code] ??
                      listing.removal_reason_code)
                    : "not recorded"}
                </span>
                {typeof listing.removal_reason_note === "string" &&
                listing.removal_reason_note.trim() !== "" ? (
                  <span style={{ color: "#C6CCD8" }}>
                    {" "}
                    — {listing.removal_reason_note}
                  </span>
                ) : null}
              </div>
              {/* The single most misreadable fact on this page, so it is
                  stated rather than left to be inferred from an absence. */}
              <div style={{ color: "#8b93a1", marginTop: 6, fontSize: 12 }}>
                No transaction was written. A removal records why the watch left
                the market, never that FairWatchTrade sold it.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#8b93a1" }}>
              This listing is {currentStatus} — it has not been removed.
            </div>
          )}

          <div
            style={{
              color: "#8b93a1",
              fontSize: 11,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              margin: "16px 0 8px",
            }}
          >
            Purchase requests ({lifecycleRequests.length})
          </div>

          {lifecycleRequests.length === 0 ? (
            <div style={{ fontSize: 12, color: "#565f89" }}>
              No purchase request was ever made on this listing.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <tbody>
                {lifecycleRequests.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #23272f" }}>
                    <td style={{ padding: "6px 8px 6px 0", color: "#8b93a1", width: 150 }}>
                      {new Date(r.created_at).toLocaleDateString("en-US")}
                    </td>
                    <td style={{ padding: "6px 8px", color: "#C6CCD8", width: 130 }}>
                      {r.proposed_purchase_price != null
                        ? `${r.proposed_purchase_price.toLocaleString("en-US")}${
                            r.proposed_currency ? ` ${r.proposed_currency}` : ""
                          }`
                        : "—"}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <span
                        style={{
                          color:
                            r.status === "accepted"
                              ? "#70C090"
                              : r.status === "pending"
                                ? "#E0A83C"
                                : "#8b93a1",
                        }}
                      >
                        {r.status}
                      </span>
                      {closureSentence(r) && (
                        <span style={{ color: "#565f89" }}> · {closureSentence(r)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Accepted requests survive a removal by design, and that is the
              thing most likely to look like a bug from this page. */}
          {currentStatus === "removed" &&
            lifecycleRequests.some((r) => r.status === "accepted") && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#70C090", lineHeight: 1.6 }}>
                An accepted request survives removal deliberately — the seller
                cannot walk away from an agreed deal by taking the listing down.
              </div>
            )}
        </div>

        {/* v2.24 · The Aubrey Check evidence panel — Design Gate placement:
            between the status controls and the raw record. */}
        <IntegrityEvidencePanel
          listingId={id}
          currentStatus={currentStatus}
          holdReason={(listing.integrity_hold_reason as string | null) ?? null}
          sellerClarificationNote={(listing.seller_clarification_note as string | null) ?? null}
          review={panelReview}
          photos={panelPhotos}
        />

        {/* Raw record so the page is already useful today */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {Object.entries(listing)
              .filter(([k]) => k !== "photos" && k !== "score_state" && k !== "details")
              .map(([k, v]) => (
                <tr key={k} style={{ borderBottom: "1px solid #23272f" }}>
                  <td
                    style={{
                      padding: "6px 10px",
                      color: "#8b93a1",
                      width: 200,
                      verticalAlign: "top",
                    }}
                  >
                    {k}
                  </td>
                  <td style={{ padding: "6px 10px", wordBreak: "break-word" }}>
                    {v === null || v === undefined
                      ? "—"
                      : typeof v === "object"
                      ? JSON.stringify(v)
                      : String(v)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
