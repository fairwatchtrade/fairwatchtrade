import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import ListingStatusControls from "@/components/ListingStatusControls";
import {
  blockerAdminLine,
  type DeleteEligibility,
} from "@/lib/listingDeleteEligibility";
import IntegrityEvidencePanel, {
  type PanelPhoto,
  type PanelPhotoState,
  type PanelReview,
} from "@/components/IntegrityEvidencePanel";
import { PROVIDER_IMAGE_AUTHENTICITY } from "@/lib/integrity";
import { adminLabel } from "@/lib/listingStatus";

/* ════════════════════════════════════════════════════════════════════════
   /admin/listings/[id] — FOUNDER REVIEW  (the one-listing adjudication room)

   Marketplace Control tells the founder what exists and what needs
   attention. THIS room gives the founder everything necessary to make one
   governed decision correctly. This URL is PERMANENT. The Operations
   Center points here — never back into Supabase.

   THE ARCHITECTURE LAW: this is a decision surface over EXISTING listing,
   evidence, review, and lifecycle truth. Two persisted systems, consumed
   without conflation, and no third one:
     · listing_integrity_reviews  — CURRENT, mutable review truth
     · listing_decision_events    — APPEND-ONLY lifecycle decision log
   The governed actions are exactly approve | clarify | reject |
   return_to_draft, executed by the ONE status route. There is no Escalate
   — clarify is the need-more-information path.

   The render follows the founder's reasoning order:
     1 what am I reviewing → 2 why is it here → 3/4 evidence in BOTH
     directions (+ the governed actions) → 5 seller context → 6 what
     happened previously → 7 lifecycle facts → generic status tool → raw
     record last, collapsed.

   Aubrey evidence is context, never verdict: a real listing holds 11
   clean passes, zero adverse rows, and a founder rejection. Nothing here
   may imply clean ⇒ approve, and nothing here decides.

   ── PROD GATE ───────────────────────────────────────────────────────────
   Founder-only, identical pattern to /admin: a hardcoded single-UID check,
   silent redirect to / for anyone else. The literal is intentionally
   duplicated here and in the status API route — two independent gates,
   never one shared constant both surfaces trust.

   ── SERVICE-CLIENT READS (v2.1, preserved) ──────────────────────────────
   The record is read with the TRUSTED client because RLS
   (listings_select_public_or_own) would hide another seller's
   draft/pending_review row from this page entirely — and a dealer's
   submitted draft is exactly that. The gate above runs on the SESSION
   client first; the service client is only handed the read once that
   proof holds. Same discipline for every other read on this page.

   This room is dark on purpose: its two embedded governed components
   (ListingStatusControls and IntegrityEvidencePanel) are artifact-styled
   to their own approved Design Gates, and the room frames them rather
   than restyling them.

   PFC274 = 62 — the evaluate route is untouched.
   ──────────────────────────────────────────────────────────────────────── */

export const dynamic = "force-dynamic";

// Defense-in-depth literal — intentionally duplicated in the status route,
// independent of any shared constant. Matches /admin.
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

/* ── The Aubrey Check evidence-panel model (v2.24, preserved verbatim).
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

/* One row of the append-only decision log, as written by the status route.
   actor_uid is not selected: every writer is the founder gate, so the
   column adds no information this room needs. */
type DecisionEvent = {
  id: number;
  decision: string;
  prior_status: string | null;
  resulting_status: string | null;
  seller_message: string | null;
  created_at: string;
};

const DECISION_LABEL: Record<string, string> = {
  approved: "Approved",
  rejected: "Rejected",
  clarification_requested: "Clarification requested",
  returned_to_draft: "Returned to draft",
};

/* Seller context — REAL recorded facts only. No strikes, no synthetic risk
   scores, no derived reputation: the founder weighs the record; this panel
   only retrieves it. */
type SellerContext = {
  displayName: string | null;
  memberSince: string | null;
  listingCounts: Record<string, number>;
  listingTotal: number;
  /* Prior adverse decisions across ALL of this seller's listings — the
     append-only log again, wider scope. thisListing marks rows that belong
     to the listing being reviewed so history is attributable at a glance. */
  adverseHistory: {
    decision: string;
    created_at: string;
    listing_id: string;
    thisListing: boolean;
  }[];
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
  sold_in_store: "Sold in my store / privately",
  sold_elsewhere: "Sold on another website",
  no_longer_for_sale: "No longer for sale",
  listing_mistake: "Listing mistake / duplicate",
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

/* ── The room's shared visual vocabulary (dark, matching the two embedded
      Design-Gate artifacts). One place, so every panel is the same panel. */
const C = {
  page: "#0f1115",
  panel: "#15181E",
  border: "#2A2F3A",
  divider: "#23272f",
  text: "#C6CCD8",
  bright: "#E6E8EC",
  muted: "#8b93a1",
  faint: "#565f89",
  gold: "#E0A83C",
  green: "#70C090",
  red: "#DB8E88",
  link: "#7aa2f7",
} as const;

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  background: C.page,
  color: C.bright,
  fontFamily:
    "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontSize: 13,
  padding: "20px 24px",
};

const panel: React.CSSProperties = {
  border: `1px solid ${C.border}`,
  background: C.panel,
  padding: "14px 16px",
  marginBottom: 18,
};

const kicker: React.CSSProperties = {
  color: C.gold,
  fontSize: 11,
  letterSpacing: 1.6,
  textTransform: "uppercase",
  marginBottom: 10,
};

const subhead: React.CSSProperties = {
  color: C.muted,
  fontSize: 11,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  margin: "16px 0 8px",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

  // Founder gate passed. Read with the trusted client so ANY listing is
  // reachable — including another seller's draft/pending_review row, which RLS
  // would otherwise hide from this page entirely. maybeSingle() rather than
  // single(): a missing row is a legitimate "not found" render below, not an
  // error to throw.
  let listing: Record<string, unknown> | null = null;
  let panelPhotos: PanelPhoto[] = [];
  let panelReview: PanelReview = null;
  /* Next-in-queue (founder request, 2026-08-12): adjudicating one listing
     must not dead-end back at the ledger. The oldest OTHER pending_review
     listing is fetched alongside this one so the header can always offer
     the next stop — computed at load, so it stays correct right after a
     decision on THIS listing changes its status. */
  let nextPending: { id: string; brand: string; model: string } | null = null;
  let pendingCount = 0;
  /* Every purchase request this listing ever carried, with WHY each closed.
     Read through the service client for the same reason the listing is: the
     founder is not a party to these requests and RLS would correctly hide
     them from an ordinary session. */
  let lifecycleRequests: LifecycleRequest[] = [];
  /* The SAME canonical answer the seller sees. Read through the service
     client, which the function admits because auth.uid() is null for it; no
     parallel admin calculation exists, and could not be allowed to, or the
     two surfaces would eventually disagree about whether a listing is safe
     to destroy. */
  let deleteEligibility: DeleteEligibility | null = null;
  /* The append-only decision log for THIS listing. Written by the status
     route on every real transition; read here so the founder sees what was
     decided before without leaving the room. */
  let decisionEvents: DecisionEvent[] = [];
  /* Seller context — recorded facts about the person behind the listing.
     Absence of any piece degrades that piece, never the room. */
  let seller: SellerContext | null = null;
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

    /* Evidence / context fetches — founder-locked tables, read only after
       the gate above, only when the listing exists. A failure in any of
       these degrades to an empty panel, never a broken page. */
    if (listing) {
      const { data: requestRows } = await service
        .from("purchase_requests")
        .select(
          "id, status, closure_cause, proposed_purchase_price, proposed_currency, created_at, updated_at"
        )
        .eq("listing_id", id)
        .order("created_at", { ascending: false });
      lifecycleRequests = (requestRows ?? []) as LifecycleRequest[];

      const { data: eligibilityRow } = await service.rpc(
        "listing_delete_eligibility",
        { p_listing_id: id }
      );
      deleteEligibility = (eligibilityRow as DeleteEligibility | null) ?? null;

      const { data: eventRows } = await service
        .from("listing_decision_events")
        .select("id, decision, prior_status, resulting_status, seller_message, created_at")
        .eq("listing_id", id)
        .order("id", { ascending: false });
      decisionEvents = (eventRows ?? []) as DecisionEvent[];

      /* Seller context. display_name comes from profiles via the service
         client (select-own RLS would blank it on a session read); counts
         come from the seller's own listing rows; the adverse history is the
         same append-only log, scoped to every listing this seller owns. */
      const sellerId =
        typeof listing.seller_id === "string" ? listing.seller_id : null;
      if (sellerId) {
        const [{ data: prof }, { data: theirListings }] = await Promise.all([
          service
            .from("profiles")
            .select("display_name, created_at")
            .eq("id", sellerId)
            .maybeSingle(),
          service.from("listings").select("id, status").eq("seller_id", sellerId),
        ]);
        const rows = (theirListings ?? []) as { id: string; status: string }[];
        const listingCounts: Record<string, number> = {};
        for (const r of rows) {
          listingCounts[r.status] = (listingCounts[r.status] ?? 0) + 1;
        }
        let adverseHistory: SellerContext["adverseHistory"] = [];
        if (rows.length > 0) {
          const { data: advRows } = await service
            .from("listing_decision_events")
            .select("decision, created_at, listing_id")
            .in(
              "listing_id",
              rows.map((r) => r.id)
            )
            .neq("decision", "approved")
            .order("id", { ascending: false })
            .limit(20);
          adverseHistory = ((advRows ?? []) as {
            decision: string;
            created_at: string;
            listing_id: string;
          }[]).map((e) => ({ ...e, thisListing: e.listing_id === id }));
        }
        seller = {
          displayName:
            prof && typeof prof.display_name === "string" ? prof.display_name : null,
          memberSince:
            prof && typeof prof.created_at === "string" ? prof.created_at : null,
          listingCounts,
          listingTotal: rows.length,
          adverseHistory,
        };
      }

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
    console.error("[admin] founder review — trusted client unavailable:", e);
    return (
      <div style={wrap}>
        <Link href="/admin" style={{ color: C.link, textDecoration: "none" }}>
          ← Marketplace Control
        </Link>
        <div style={{ marginTop: 16, color: "#e07070" }}>
          Admin read channel unavailable — the listing could not be loaded. This is a
          server configuration problem, not a missing listing.
        </div>
      </div>
    );
  }

  /* ── A permanently deleted listing is not "not found" ──────────────────
     The row is gone by design, but the tombstone survives and can still say
     which watch it was, whose, when it went and why. Reporting a purge as a
     missing record would make a governed deletion look like data loss — and
     this is the one page that has to be able to tell them apart.

     Deliberately NOT an archive: no photos, no description, no specs. Which
     watch, whose, when, why, under which purge. */
  if (!listing) {
    let tombstone: Record<string, unknown> | null = null;
    try {
      const service = createServiceClient();
      const { data } = await service
        .from("listing_deletion_tombstone")
        .select("*")
        .eq("listing_id", id)
        .maybeSingle();
      tombstone = data ?? null;
    } catch {
      /* fall through to the plain not-found below */
    }

    return (
      <div style={wrap}>
        <Link href="/admin" style={{ color: C.link, textDecoration: "none" }}>
          ← Marketplace Control
        </Link>
        {tombstone ? (
          <div style={{ maxWidth: 900, margin: "16px auto 0" }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              {String(tombstone.listing_brand ?? "—")}{" "}
              {String(tombstone.listing_model ?? "")}
            </div>
            <div
              style={{
                display: "inline-block",
                border: `1px solid ${C.border}`,
                background: C.panel,
                color: C.red,
                padding: "4px 10px",
                fontSize: 11,
                marginBottom: 18,
              }}
            >
              Permanently deleted
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <tbody>
                {Object.entries(tombstone).map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: `1px solid ${C.divider}` }}>
                    <td style={{ padding: "6px 10px", color: C.muted, width: 200 }}>{k}</td>
                    <td style={{ padding: "6px 10px", color: C.text }}>
                      {v === null ? "—" : String(v)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ color: C.faint, fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>
              The listing row no longer exists. This is the minimal deletion
              record, not an archive — durable history (completed sales,
              adjudication events, purchase requests) survives independently
              and carries its own copy of which watch it concerned.
            </p>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>Listing not found: {id}</div>
        )}
      </div>
    );
  }

  const currentStatus =
    typeof listing.status === "string" ? (listing.status as string) : "—";
  const publicCode =
    typeof listing.public_code === "string" ? (listing.public_code as string) : null;
  const isPrivateIntended =
    typeof listing.private_buyer_id === "string" && listing.private_buyer_id !== "";
  const holdReason = (listing.integrity_hold_reason as string | null) ?? null;

  /* First photograph as the identity anchor — the same JSON the raw record
     carries, surfaced instead of buried. */
  const firstPhotoUrl = (() => {
    for (const p of ((listing.photos ?? []) as { photo?: { url?: unknown } }[])) {
      if (typeof p?.photo?.url === "string") return p.photo.url;
    }
    return null;
  })();

  /* Evidence posture, counted for the why-strip. The counts NAME the state
     of the record; the sentence beside them refuses the shortcut — clean
     evidence is not a verdict, and a real rejected listing with eleven
     clean passes is the standing proof. */
  const adverseCount = panelPhotos.filter(
    (p) => p.state === "full" || p.state === "partial"
  ).length;
  const cleanCount = panelPhotos.filter((p) => p.state === "clean").length;

  const price =
    typeof listing.asking_price === "number" || typeof listing.asking_price === "string"
      ? Number(listing.asking_price)
      : null;
  const currency =
    typeof listing.asking_currency === "string" ? (listing.asking_currency as string) : "";

  const sellerName = seller?.displayName ?? "Unknown seller";

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* ── Orientation row: where I came from, where I go next ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <Link href="/admin" style={{ color: C.link, textDecoration: "none" }}>
            ← Marketplace Control
          </Link>
          {nextPending ? (
            <Link
              href={`/admin/listings/${nextPending.id}`}
              style={{ color: C.gold, textDecoration: "none" }}
            >
              Next in review queue: {nextPending.brand} {nextPending.model} →
              <span style={{ color: C.faint, marginLeft: 8 }}>
                ({pendingCount} waiting)
              </span>
            </Link>
          ) : (
            <span style={{ color: C.faint }}>Review queue clear</span>
          )}
        </div>

        {/* ── 1 · WHAT AM I REVIEWING ─────────────────────────────────────
            Identity before anything else: the watch, the exact code, the
            seller, the money, the state. If this block is wrong, every
            judgment underneath it is about the wrong object. */}
        <div style={{ ...panel, marginTop: 14, display: "flex", gap: 16 }}>
          {firstPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={firstPhotoUrl}
              alt=""
              width={96}
              height={96}
              style={{
                width: 96,
                height: 96,
                objectFit: "cover",
                border: `1px solid ${C.border}`,
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 96,
                height: 96,
                border: `1px solid ${C.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.faint,
                fontSize: 11,
                flexShrink: 0,
              }}
            >
              No photo
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: C.gold, fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase" }}>
              Founder Review
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, margin: "4px 0 2px" }}>
              {(listing.brand as string) || "—"} {(listing.model as string) || ""}
            </div>
            <div style={{ color: C.muted, fontSize: 12 }}>
              Ref. {(listing.reference as string) || "—"}
              {publicCode ? (
                <>
                  {" · "}
                  <span style={{ color: C.gold, letterSpacing: 1 }}>{publicCode}</span>
                </>
              ) : null}
              {" · "}
              {sellerName}
              {price != null && isFinite(price) ? (
                <>
                  {" · "}
                  {price.toLocaleString("en-US")}
                  {currency ? ` ${currency}` : ""}
                </>
              ) : null}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-block",
                  border: `1px solid ${C.border}`,
                  background: C.page,
                  color: C.gold,
                  padding: "3px 9px",
                  fontSize: 11,
                }}
              >
                {adminLabel(currentStatus)}
              </span>
              {isPrivateIntended && (
                <span
                  style={{
                    display: "inline-block",
                    border: `1px solid ${C.border}`,
                    background: C.page,
                    color: C.text,
                    padding: "3px 9px",
                    fontSize: 11,
                  }}
                >
                  Private listing — one authorized buyer
                </span>
              )}
              {typeof listing.created_at === "string" && (
                <span style={{ color: C.faint, fontSize: 11, padding: "3px 0" }}>
                  Created {fmtDate(listing.created_at)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── 2 · WHY IS IT HERE ──────────────────────────────────────────
            The reason for review, stated — never inferred from an absence.
            And the standing correction beside it: evidence is context, the
            decision is human, in BOTH directions. */}
        <div style={panel}>
          <div style={kicker}>Why is it here</div>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>
            {currentStatus === "pending_review" ? (
              <div>
                Submitted for review and awaiting a founder decision.
                {isPrivateIntended &&
                  " This is a held-private submission — see the private seam below before deciding."}
              </div>
            ) : (
              <div>
                This listing is {adminLabel(currentStatus).toLowerCase()} — it is not
                currently awaiting review. The record below is complete regardless, and
                the governed actions still work.
              </div>
            )}
            {holdReason && (
              <div style={{ marginTop: 6 }}>
                Integrity hold recorded:{" "}
                <span style={{ color: C.gold }}>{holdReason}</span>
              </div>
            )}
            {panelReview && (
              <div style={{ marginTop: 6, color: C.muted }}>
                Current review record: <span style={{ color: C.text }}>{panelReview.status}</span>
                {panelReview.resolvedAt
                  ? ` · resolved ${fmtDate(panelReview.resolvedAt)}`
                  : " · unresolved"}
                {" — this is the mutable current truth (listing_integrity_reviews); the decision log further down is the separate append-only history."}
              </div>
            )}
            <div style={{ marginTop: 10, color: C.muted }}>
              Photograph evidence:{" "}
              {adverseCount > 0 ? (
                <span style={{ color: C.gold }}>
                  {adverseCount} of {panelPhotos.length} with an active provider finding
                </span>
              ) : (
                <span>no active provider findings</span>
              )}
              {cleanCount > 0 && (
                <span>
                  {" "}
                  · {cleanCount} clean {cleanCount === 1 ? "pass" : "passes"}
                </span>
              )}
              {panelPhotos.length === 0 && <span>no photographs on record</span>}
            </div>
            <div style={{ marginTop: 6, color: C.faint, fontSize: 12 }}>
              Provider evidence is context, never the decision — in either direction.
              A clean record does not imply approval, and a finding does not imply
              guilt. Listings have been correctly rejected on a fully clean record.
            </div>
          </div>
        </div>

        {/* ── HELD-PRIVATE SEAM — stated at decision time, where it matters.
            The status route already does this; the room's job is to make
            sure the founder knows it BEFORE pressing Approve. */}
        {(isPrivateIntended || currentStatus === "private_active") && (
          <div style={panel}>
            <div style={kicker}>Private listing seam</div>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>
              {currentStatus === "private_active" ? (
                <>
                  This listing is <span style={{ color: C.green }}>private_active</span> —
                  live for exactly one authorized buyer, never the public marketplace.
                  Generic status changes below still apply to it; taking it down returns
                  it to draft as usual.
                </>
              ) : (
                <>
                  This submission is intended as a <strong>private listing</strong> with
                  one authorized buyer. <span style={{ color: C.gold }}>Approve</span>{" "}
                  makes it <span style={{ color: C.green }}>private_active</span>, not
                  published: visible only to its authorized buyer, absent from Browse and
                  search, and no public &ldquo;listing live&rdquo; email is sent. That
                  routing is enforced in the one status route — the same Approve button
                  is used; nothing extra to remember.
                </>
              )}
            </div>
          </div>
        )}

        {/* ── 3/4 · EVIDENCE, BOTH DIRECTIONS + THE GOVERNED ACTIONS ─────
            The Aubrey Check panel (its own approved Design Gate): findings
            first, clean and excluded photographs as truthful compact rows
            beside them, and the four governed actions posting to the ONE
            status route. Nothing here decides. */}
        <IntegrityEvidencePanel
          listingId={id}
          currentStatus={currentStatus}
          holdReason={holdReason}
          sellerClarificationNote={(listing.seller_clarification_note as string | null) ?? null}
          review={panelReview}
          photos={panelPhotos}
        />

        {/* ── 5 · SELLER CONTEXT ──────────────────────────────────────────
            Recorded facts about the person behind the listing — the third
            Aubrey question: what matters even when nothing raised its hand.
            No strikes, no scores, no derived reputation. The founder weighs
            the record; this panel only retrieves it. */}
        <div style={panel}>
          <div style={kicker}>Seller context</div>
          {!seller ? (
            <div style={{ fontSize: 12, color: C.faint }}>
              No seller record could be loaded for this listing.
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>
              <div>
                <span style={{ color: C.bright, fontWeight: 600 }}>{sellerName}</span>
                {seller.memberSince && (
                  <span style={{ color: C.muted }}>
                    {" "}
                    · member since {fmtDate(seller.memberSince)}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 6, color: C.muted }}>
                {seller.listingTotal} listing{seller.listingTotal === 1 ? "" : "s"} on
                record
                {Object.keys(seller.listingCounts).length > 0 && (
                  <>
                    {": "}
                    {Object.entries(seller.listingCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([s, n]) => `${n} ${adminLabel(s).toLowerCase()}`)
                      .join(" · ")}
                  </>
                )}
              </div>
              <div style={subhead}>
                Prior adverse decisions across this seller&rsquo;s listings
              </div>
              {seller.adverseHistory.length === 0 ? (
                <div style={{ fontSize: 12, color: C.faint }}>
                  None recorded. (The decision log began 2026-08-07 — earlier decisions
                  have no rows and are reported as absent, not as clean.)
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <tbody>
                    {seller.adverseHistory.map((e, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.divider}` }}>
                        <td style={{ padding: "5px 8px 5px 0", color: C.muted, width: 120 }}>
                          {fmtDate(e.created_at)}
                        </td>
                        <td style={{ padding: "5px 8px", color: C.text }}>
                          {DECISION_LABEL[e.decision] ?? e.decision}
                        </td>
                        <td style={{ padding: "5px 8px" }}>
                          {e.thisListing ? (
                            <span style={{ color: C.gold }}>this listing</span>
                          ) : (
                            <Link
                              href={`/admin/listings/${e.listing_id}`}
                              style={{ color: C.link, textDecoration: "none" }}
                            >
                              another listing →
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* ── 6 · WHAT HAPPENED PREVIOUSLY ────────────────────────────────
            The append-only decision log for THIS listing, exactly as the
            status route wrote it. Distinct from the current review record
            shown above by design: this cannot be edited, only appended. */}
        <div style={panel}>
          <div style={kicker}>Decision history — this listing</div>
          {decisionEvents.length === 0 ? (
            <div style={{ fontSize: 12, color: C.faint }}>
              No decision events recorded. (The append-only log began 2026-08-07 —
              earlier decisions predate it and are reported as absent.)
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <tbody>
                {decisionEvents.map((e) => (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${C.divider}` }}>
                    <td
                      style={{
                        padding: "6px 8px 6px 0",
                        color: C.muted,
                        width: 120,
                        verticalAlign: "top",
                      }}
                    >
                      {fmtDate(e.created_at)}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        color:
                          e.decision === "approved"
                            ? C.green
                            : e.decision === "rejected"
                              ? C.red
                              : C.gold,
                        width: 190,
                        verticalAlign: "top",
                      }}
                    >
                      {DECISION_LABEL[e.decision] ?? e.decision}
                      <div style={{ color: C.faint, fontSize: 11, marginTop: 2 }}>
                        {e.prior_status ?? "—"} → {e.resulting_status ?? "—"}
                      </div>
                    </td>
                    <td style={{ padding: "6px 8px", color: C.text, verticalAlign: "top" }}>
                      {e.seller_message ? (
                        <span style={{ color: C.muted }}>
                          To the seller: &ldquo;
                          <span style={{ color: C.text }}>{e.seller_message}</span>&rdquo;
                        </span>
                      ) : (
                        <span style={{ color: C.faint }}>No seller message (approval)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ color: C.faint, fontSize: 11, marginTop: 8, lineHeight: 1.6 }}>
            Append-only (listing_decision_events). The &ldquo;current review
            record&rdquo; in the strip above is the separate, mutable truth
            (listing_integrity_reviews) — the two are deliberately different systems
            and this room never merges them.
          </div>
        </div>

        {/* ── 7 · LIFECYCLE — what happened to this listing and to the
            requests it carried. The facts alone were already in the raw
            record and were unreadable there — a removal reason and a closure
            cause sitting as two more rows in an alphabetical key/value dump
            is storage, not a lifecycle view. */}
        <div style={panel}>
          <div style={kicker}>Lifecycle</div>

          {currentStatus === "removed" ? (
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
              The seller paused this listing
              {typeof listing.removed_at === "string"
                ? ` on ${new Date(listing.removed_at).toLocaleString("en-US")}`
                : ""}
              .
              {/* Historical only. Pause no longer collects a reason — the
                  exit-reason vocabulary belongs to Delete — but listings
                  paused under the older Remove semantics genuinely carry the
                  one their seller chose, and that is preserved rather than
                  rewritten. */}
              <div style={{ color: C.muted, marginTop: 4 }}>
                Reason recorded:{" "}
                <span style={{ color: C.text }}>
                  {typeof listing.removal_reason_code === "string"
                    ? (REMOVAL_REASON[listing.removal_reason_code] ??
                      listing.removal_reason_code)
                    : "not recorded"}
                </span>
                {typeof listing.removal_reason_note === "string" &&
                listing.removal_reason_note.trim() !== "" ? (
                  <span style={{ color: C.text }}> — {listing.removal_reason_note}</span>
                ) : null}
              </div>
              {/* The single most misreadable fact on this page, so it is
                  stated rather than left to be inferred from an absence. */}
              <div style={{ color: C.muted, marginTop: 6, fontSize: 12 }}>
                No transaction was written. A removal records why the watch left
                the market, never that FairWatchTrade sold it.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.muted }}>
              This listing is {adminLabel(currentStatus).toLowerCase()} — it has not been
              removed.
            </div>
          )}

          <div style={subhead}>Purchase requests ({lifecycleRequests.length})</div>

          {lifecycleRequests.length === 0 ? (
            <div style={{ fontSize: 12, color: C.faint }}>
              No purchase request was ever made on this listing.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <tbody>
                {lifecycleRequests.map((r) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.divider}` }}>
                    <td style={{ padding: "6px 8px 6px 0", color: C.muted, width: 150 }}>
                      {new Date(r.created_at).toLocaleDateString("en-US")}
                    </td>
                    <td style={{ padding: "6px 8px", color: C.text, width: 130 }}>
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
                              ? C.green
                              : r.status === "pending"
                                ? C.gold
                                : C.muted,
                        }}
                      >
                        {r.status}
                      </span>
                      {closureSentence(r) && (
                        <span style={{ color: C.faint }}> · {closureSentence(r)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Permanent-delete eligibility ──────────────────────────────
              The identical result the seller's Delete Listing dialog shows,
              from the identical function. If these two ever disagree, one of
              them is computing it locally and that is the defect.

              ⚠ This is current-state evidence, not an authorisation. Nothing
              is stored, and the future purge stage must re-evaluate under its
              own lock rather than trusting anything read here. */}
          <div style={subhead}>Permanent-delete eligibility</div>

          {!deleteEligibility ? (
            <div style={{ fontSize: 12, color: C.faint }}>
              Eligibility unavailable — the check did not answer.
            </div>
          ) : deleteEligibility.eligible_for_permanent_delete ? (
            <div style={{ fontSize: 13, color: C.green, lineHeight: 1.6 }}>
              Currently eligible for permanent deletion.
              <div style={{ color: C.faint, fontSize: 12, marginTop: 4 }}>
                Snapshot only — nothing is stored, and the purge stage must re-check
                under its own lock before destroying anything.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
              Blocked.
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {deleteEligibility.blockers.map((b, i) => (
                  <li key={`${b.code}-${i}`} style={{ color: C.gold, fontSize: 12 }}>
                    {blockerAdminLine(b)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Accepted requests survive a removal by design, and that is the
              thing most likely to look like a bug from this page. */}
          {currentStatus === "removed" &&
            lifecycleRequests.some((r) => r.status === "accepted") && (
              <div style={{ marginTop: 10, fontSize: 12, color: C.green, lineHeight: 1.6 }}>
                An accepted request survives removal deliberately — the seller
                cannot walk away from an agreed deal by taking the listing down.
              </div>
            )}
        </div>

        {/* ── Generic status tool — the blunt instrument, after the governed
            adjudication actions above, per the reasoning order: understand
            first, act second. Same one status route underneath. */}
        <ListingStatusControls listingId={id} currentStatus={currentStatus} />

        {/* ── Full record, last and collapsed — the complete row for the
            case where the curated panels above did not carry the fact the
            founder needs. Present, honest, and no longer the interface. */}
        <details style={{ ...panel, padding: 0 }}>
          <summary
            style={{
              padding: "12px 16px",
              cursor: "pointer",
              color: C.muted,
              fontSize: 11,
              letterSpacing: 1.6,
              textTransform: "uppercase",
            }}
          >
            Full record (raw)
          </summary>
          <div style={{ padding: "0 16px 14px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <tbody>
                {Object.entries(listing)
                  .filter(([k]) => k !== "photos" && k !== "score_state" && k !== "details")
                  .map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: `1px solid ${C.divider}` }}>
                      <td
                        style={{
                          padding: "6px 10px 6px 0",
                          color: C.muted,
                          width: 200,
                          verticalAlign: "top",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      >
                        {k}
                      </td>
                      <td
                        style={{
                          padding: "6px 0",
                          wordBreak: "break-word",
                          color: C.text,
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      >
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
        </details>
      </div>
    </div>
  );
}
