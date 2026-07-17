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
  try {
    const service = createServiceClient();
    const { data } = await service.from("listings").select("*").eq("id", id).maybeSingle();
    listing = data ?? null;

    /* ── v2.24 · Aubrey evidence fetches — founder-locked tables, read only
          after the gate above, only when the listing exists. A failure in
          any of these degrades to an empty panel, never a broken page. ── */
    if (listing) {
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
        <Link href="/admin" style={{ color: "#7aa2f7", textDecoration: "none" }}>
          ← Operations Center
        </Link>

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
