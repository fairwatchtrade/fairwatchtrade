"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadPhoto } from "@/lib/storage";
import { isAttestationCurrent, type CommercialTruth } from "@/lib/attestation";

/* ════════════════════════════════════════════════════════════════════════
   IMPORTED DRAFTS — Dealer Accelerator Review Workspace  (v2.21, Flight 2B)

   The dealer's private workbench for drafts FairWatchTrade prepared from
   their existing inventory. Renders INSIDE the real Seller Workspace shell
   (AccountDashboard module — desktop is governing scope). Governing Design
   Gate artifact: Dealer_Accelerator_Review_Workspace_CC_FINAL_PLATINUM.html
   (session evidence, deliberately NOT in the repo).

   TRUTH BOUNDARIES (all verified against live schema/policies this flight):
   · Imported watches are ordinary dealer-owned listings rows. This room
     merely FILTERS to them — identity comes from listing_media rows with
     capture_source='dealer_import', which v2.21 RLS makes unforgeable by
     client sessions. Two-step query with Set dedup: one listing appears
     exactly once, guaranteed by construction, not by join semantics.
   · Needs Attention is COMPUTED from incomplete draft truth. Never stored.
     There is deliberately no manual "mark needs attention" action.
   · The six confirmation checkboxes are UI ceremony — ephemeral by design.
     The DURABLE attestation is stamped by submit_listing_for_review()
     atomically with the transition; its validity is COMPOSED at read time
     by recomputing the 13-field fingerprint (lib/attestation.ts) against
     the stored one. Stale ⇒ ceremony reappears. Nothing to un-flip.
   · Save Draft updates ONLY commercial-truth columns — the v2.21 column
     grants make everything else unwritable from this session anyway.
   · Replacement photos upload via the existing uploadPhoto() seam and are
     recorded in listing_media as capture_source='dealer_upload'. They are
     NOT live_camera and never earn In Hand Verified. Import provenance
     rows are never deleted — imported identity is permanent.
   · Availability vocabulary is locked: 'In Stock' | 'Not Currently
     Available'. Only In Stock can submit (server-enforced by the RPC;
     mirrored here for immediate feedback).
   · Included-items vocabulary is the repo's canonical DetailsStep list —
     NOT the artifact fixture's differing labels.
   · Scoring fields are never selected. PFC274 = 62 — evaluate untouched.
   ════════════════════════════════════════════════════════════════════════ */

type ImportedPhoto = { photo: { url: string; pathname: string | null }; category: string | null; isWristShot?: boolean };

type ImportedListing = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  year: string | null;
  condition: string | null;
  asking_price: number | null;
  asking_price_raw: string | null;
  provenance_note: string | null;
  description: string | null;
  has_bracelet: boolean;
  details: Record<string, unknown>;
  photos: ImportedPhoto[];
  status: string;
  rejection_reason: string | null;
  // v2.24 · active clarification round (founder's bounded note); cleared on
  // resubmission by the submit RPC. Locked neutral intro lives in the UI.
  seller_clarification_note: string | null;
  dealer_attested_at: string | null;
  dealer_attested_fingerprint: string | null;
  created_at: string;
};

/* Repo-canonical vocabularies — DetailsStep's INCLUDED list and the sell
   flow's Condition set. The artifact fixture's differing labels do not ship. */
const INCLUDED_OPTIONS = [
  "Box",
  "Papers",
  "Warranty Card",
  "Extra Links",
  "Travel Case",
  "Hang Tags",
  "Manual / Booklet",
  "Service Receipt",
] as const;

const CONDITION_OPTIONS = ["Unworn", "Mint", "Excellent", "Good", "Fair"] as const;

const AVAILABILITY_OPTIONS = ["In Stock", "Not Currently Available"] as const;

const REJECTION_FALLBACK =
  "This listing was returned for revision. Contact FairWatchTrade if no requested change is shown.";

type Ceremony = {
  price: boolean;
  condition: boolean;
  availability: boolean;
  reference: boolean;
  description: boolean;
  photos: boolean;
};

const CEREMONY_CLEAR: Ceremony = {
  price: false,
  condition: false,
  availability: false,
  reference: false,
  description: false,
  photos: false,
};

/* Editable commercial buffer — the room's slice of truth. */
type Buffer = {
  askingPrice: string; // input text; parsed on save
  condition: string;
  availability: string;
  reference: string;
  description: string;
  included: string[];
  includedNotes: string;
  photos: ImportedPhoto[];
  newUploadUrls: string[]; // staged this session → listing_media on save
};

function bufferFrom(l: ImportedListing): Buffer {
  const d = l.details ?? {};
  return {
    askingPrice: l.asking_price === null ? "" : String(l.asking_price),
    condition: l.condition ?? "",
    availability: typeof d.availability === "string" ? d.availability : "",
    reference: l.reference,
    description: l.description ?? "",
    included: Array.isArray(d.includedWithWatch) ? (d.includedWithWatch as string[]) : [],
    includedNotes: typeof d.includedNotes === "string" ? d.includedNotes : "",
    photos: Array.isArray(l.photos) ? l.photos : [],
    newUploadUrls: [],
  };
}

/* Needs Attention — computed from incomplete draft truth, never stored. */
function missingFacts(l: ImportedListing): string[] {
  const d = l.details ?? {};
  const missing: string[] = [];
  if (l.asking_price === null) missing.push("price");
  if (!l.condition) missing.push("condition");
  if (typeof d.availability !== "string" || !d.availability) missing.push("availability");
  if (!l.description) missing.push("description");
  if (!Array.isArray(l.photos) || l.photos.filter((p) => p?.photo?.url).length === 0)
    missing.push("photographs");
  return missing;
}

type RoomStatus = "attention" | "draft" | "submitted" | "approved" | "rejected";

function roomStatus(l: ImportedListing): RoomStatus {
  if (l.status === "rejected") return "rejected";
  if (l.status === "pending_review") return "submitted";
  if (l.status === "published") return "approved";
  return missingFacts(l).length > 0 ? "attention" : "draft";
}

const STATUS_META: Record<RoomStatus, { label: string; cls: string; order: number }> = {
  rejected: { label: "Rejected", cls: "text-[var(--danger)]", order: 0 },
  attention: { label: "Needs Attention", cls: "text-[var(--gold-dim)]", order: 1 },
  draft: { label: "Draft", cls: "text-[var(--muted)]", order: 2 },
  submitted: { label: "Submitted", cls: "text-[var(--gold)]", order: 3 },
  approved: { label: "Approved", cls: "text-[var(--success)]", order: 4 },
};

function truthOf(l: ImportedListing): CommercialTruth {
  const d = l.details ?? {};
  return {
    brand: l.brand,
    model: l.model,
    reference: l.reference,
    year: l.year,
    condition: l.condition,
    asking_price: l.asking_price,
    provenance_note: l.provenance_note,
    description: l.description,
    has_bracelet: l.has_bracelet,
    details: {
      availability: typeof d.availability === "string" ? d.availability : undefined,
      includedWithWatch: Array.isArray(d.includedWithWatch)
        ? (d.includedWithWatch as string[])
        : undefined,
      includedNotes: typeof d.includedNotes === "string" ? d.includedNotes : undefined,
    },
    photos: l.photos,
  };
}

export default function ImportedDraftsWorkspace() {
  const [rows, setRows] = useState<ImportedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [buffer, setBuffer] = useState<Buffer | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  /* v2.22 — the button briefly answers "Saved ✓" right where the click
     happened, then settles back. Ref holds the timer so a rapid re-save
     restarts the two seconds instead of cutting them short. */
  const [justSaved, setJustSaved] = useState(false);
  const justSavedTimer = useRef<number | null>(null);

  const [ceremony, setCeremony] = useState<Ceremony>(CEREMONY_CLEAR);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [attested, setAttested] = useState<boolean | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* ── Load: two-step, deduplicated by Set — one listing appears once. ── */
  async function load(keepSelection = false) {
    setLoading(true);
    setLoadError(null);
    try {
      const supabase = createClient();
      const { data: media, error: mediaErr } = await supabase
        .from("listing_media")
        .select("listing_id")
        .eq("capture_source", "dealer_import");
      if (mediaErr) throw new Error(mediaErr.message);

      const ids = [...new Set((media ?? []).map((m) => m.listing_id as string))];
      if (ids.length === 0) {
        setRows([]);
        setSelectedId(null);
        setBuffer(null);
        return;
      }

      // PRIVACY: scoring fields are never selected here.
      const { data: listings, error: listErr } = await supabase
        .from("listings")
        .select(
          "id, brand, model, reference, year, condition, asking_price, asking_price_raw, provenance_note, description, has_bracelet, details, photos, status, rejection_reason, seller_clarification_note, dealer_attested_at, dealer_attested_fingerprint, created_at"
        )
        .in("id", ids);
      if (listErr) throw new Error(listErr.message);

      const loaded = (listings ?? []) as unknown as ImportedListing[];
      loaded.sort(
        (a, b) =>
          STATUS_META[roomStatus(a)].order - STATUS_META[roomStatus(b)].order ||
          a.brand.localeCompare(b.brand)
      );
      setRows(loaded);

      const nextId =
        keepSelection && selectedId && loaded.some((l) => l.id === selectedId)
          ? selectedId
          : (loaded[0]?.id ?? null);
      setSelectedId(nextId);
      const next = loaded.find((l) => l.id === nextId) ?? null;
      setBuffer(next ? bufferFrom(next) : null);
      setDirty(false);
      setCeremony(CEREMONY_CLEAR);
      setActivePhoto(0);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load imported drafts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => rows.find((l) => l.id === selectedId) ?? null,
    [rows, selectedId]
  );

  /* Attestation validity — composed at read time from SERVER truth. */
  useEffect(() => {
    let cancelled = false;
    if (!selected) {
      setAttested(null);
      return;
    }
    isAttestationCurrent(truthOf(selected), selected.dealer_attested_fingerprint).then((ok) => {
      if (!cancelled) setAttested(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((l) =>
      `${l.brand} ${l.model ?? ""} ${l.reference}`.toLowerCase().includes(q)
    );
  }, [rows, search]);

  function selectListing(id: string) {
    if (id === selectedId) return;
    const next = rows.find((l) => l.id === id) ?? null;
    setSelectedId(id);
    setBuffer(next ? bufferFrom(next) : null);
    setDirty(false);
    setSaveError(null);
    setSubmitError(null);
    setSavedAt(null);
    setJustSaved(false);
    setCeremony(CEREMONY_CLEAR);
    setActivePhoto(0);
  }

  function edit(patch: Partial<Buffer>) {
    if (!buffer) return;
    setBuffer({ ...buffer, ...patch });
    setDirty(true);
    setSavedAt(null);
    setJustSaved(false);
  }

  const editable = selected ? selected.status === "draft" || selected.status === "rejected" : false;

  /* ── Save Draft — commercial-truth columns only, RLS + grants enforce. ── */
  async function saveDraft(): Promise<boolean> {
    if (!selected || !buffer || !editable) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const supabase = createClient();
      const priceText = buffer.askingPrice.replace(/[^0-9.]/g, "");
      const price = priceText === "" ? null : Number(priceText);
      if (price !== null && (!isFinite(price) || price <= 0)) {
        setSaveError("Asking price must be a positive number, or left blank.");
        return false;
      }

      // Merge room-owned keys into the EXISTING details object — other keys
      // (movementType, caseSizeMm, …) pass through untouched.
      const details: Record<string, unknown> = { ...(selected.details ?? {}) };
      if (buffer.availability) details.availability = buffer.availability;
      else delete details.availability;
      details.includedWithWatch = buffer.included;
      if (buffer.includedNotes.trim()) details.includedNotes = buffer.includedNotes.trim();
      else delete details.includedNotes;

      const { data, error } = await supabase
        .from("listings")
        .update({
          asking_price: price,
          condition: buffer.condition || null,
          reference: buffer.reference.trim() || selected.reference,
          description: buffer.description || null,
          details,
          photos: buffer.photos,
        })
        .eq("id", selected.id)
        .select(
          "id, brand, model, reference, year, condition, asking_price, asking_price_raw, provenance_note, description, has_bracelet, details, photos, status, rejection_reason, seller_clarification_note, dealer_attested_at, dealer_attested_fingerprint, created_at"
        )
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Save affected no rows — refresh and try again.");

      // Provenance rows for replacement photos staged this session.
      if (buffer.newUploadUrls.length > 0) {
        const mediaRows = buffer.newUploadUrls.map((url, i) => ({
          listing_id: selected.id,
          category: "Uncategorized",
          storage_path: url,
          capture_source: "dealer_upload",
          ai_review_status: "pending",
          privacy_review_status: "pending",
          sequence_index: i,
        }));
        const { error: mediaErr } = await supabase.from("listing_media").insert(mediaRows);
        if (mediaErr) {
          // The draft saved; provenance write failed. Report, don't pretend.
          setSaveError(`Draft saved, but photo provenance failed to record: ${mediaErr.message}`);
        }
      }

      const fresh = data as unknown as ImportedListing;
      setRows((prev) => prev.map((l) => (l.id === fresh.id ? fresh : l)));
      setBuffer({ ...bufferFrom(fresh), newUploadUrls: [] });
      setDirty(false);
      setSavedAt(new Date().toLocaleTimeString());
      setJustSaved(true);
      if (justSavedTimer.current !== null) window.clearTimeout(justSavedTimer.current);
      justSavedTimer.current = window.setTimeout(() => setJustSaved(false), 2000);
      return true;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save this draft.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  /* ── Submit — save first if dirty, then the canonical RPC via its route. ── */
  const ceremonyComplete = Object.values(ceremony).every(Boolean);
  const canSubmit =
    editable && ceremonyComplete && buffer?.availability === "In Stock" && !submitting && !saving;

  async function submitForReview() {
    if (!selected || !canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (dirty) {
        const ok = await saveDraft();
        if (!ok) return;
      }
      const res = await fetch(`/api/listings/${selected.id}/submit-for-review`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSubmitError(data?.detail ?? "Could not submit this listing for review.");
        return;
      }
      await load(true);
    } catch {
      setSubmitError("Could not submit this listing for review.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Replace imported photographs — existing uploadPhoto() seam. ── */
  async function onFilesChosen(files: FileList | null) {
    if (!files || files.length === 0 || !buffer || !editable) return;
    setUploading(true);
    setSaveError(null);
    try {
      const uploaded: ImportedPhoto[] = [];
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, 12)) {
        const photo = await uploadPhoto(file);
        uploaded.push({ photo: { url: photo.url, pathname: photo.pathname }, category: null, isWristShot: false });
        urls.push(photo.url);
      }
      // Replacement: the new set REPLACES the photo array (that is the point
      // of the action). Import provenance rows in listing_media are untouched
      // and permanent. Nothing persists until Save Draft.
      edit({ photos: uploaded, newUploadUrls: urls });
      setCeremony((c) => ({ ...c, photos: false }));
      setActivePhoto(0);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Photo upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /* ────────────────────────── render ────────────────────────── */

  if (loading) {
    return (
      <div className="px-6 py-10 text-center font-display text-[13px] italic text-[var(--ghost)]">
        Opening your imported drafts…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-6 mt-6 border border-[var(--border-faint)] px-6 py-10 text-center">
        <p className="text-[13px] text-[var(--danger)]">{loadError}</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="mx-6 mt-6 border border-[var(--border-faint)] px-6 py-12 text-center">
        <p className="font-display text-[14px] font-light italic text-[var(--muted)]">
          No imported drafts yet. When FairWatchTrade prepares drafts from your
          existing inventory, they appear here — visible only to you until you
          submit and FairWatchTrade approves them.
        </p>
      </div>
    );
  }

  const meta = selected ? STATUS_META[roomStatus(selected)] : null;
  const missing = selected ? missingFacts(selected) : [];
  const photoUrls = (buffer?.photos ?? []).map((p) => p?.photo?.url).filter(Boolean) as string[];

  /* Once submitted, the ceremony has been CONSUMED into the durable
     attestation — render the boxes checked-and-locked so the dealer sees
     their confirmations were recorded, not wiped. While editable (draft /
     rejected) the live ceremony state governs and starts unticked. */
  const hasRecordedAttestation = Boolean(selected?.dealer_attested_fingerprint);
  const shownCeremony = (live: boolean) => (editable ? live : hasRecordedAttestation);

  return (
    <div className="flex min-h-0">
      {/* ── LEFT: draft list ── */}
      <aside className="w-[300px] shrink-0 border-r border-[var(--border-faint)]">
        <div className="border-b border-[var(--border-faint)] px-5 py-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brand, model, or reference…"
            className="w-full border-b border-[var(--border-faint)] bg-transparent py-1.5 text-[11px] text-[var(--platinum)] placeholder:text-[var(--ghost)] focus:border-[var(--border-gold)] focus:outline-none"
          />
          <div className="mt-2 flex justify-between text-[9px] tracking-[0.5px] text-[var(--muted)]">
            <span>{filtered.length} shown</span>
            <span>Sorted by attention needed</span>
          </div>
        </div>
        <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
          {filtered.map((l) => {
            const m = STATUS_META[roomStatus(l)];
            const isSel = l.id === selectedId;
            const thumb = (l.photos ?? []).find((p) => p?.photo?.url)?.photo?.url ?? null;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => selectListing(l.id)}
                className={`relative flex w-full items-center gap-3 border-b border-[rgba(255,255,255,0.03)] px-5 py-[14px] text-left transition hover:bg-[rgba(255,255,255,0.02)] ${
                  isSel
                    ? "bg-[rgba(201,168,76,0.04)] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-[var(--gold)]"
                    : ""
                }`}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden border border-[var(--border-faint)] bg-[var(--surface)]">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[9px] text-[var(--ghost)]">—</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[8.5px] uppercase tracking-[2px] text-[var(--gold-dim)]">
                    {l.brand}
                  </div>
                  <div className="truncate font-display text-[13px] font-light text-[var(--platinum)]">
                    {l.model ?? l.reference}
                  </div>
                  <div className="mt-[2px] text-[9px] text-[var(--muted)]">Ref. {l.reference}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-display text-[12px] font-light text-[var(--platinum-dim)]">
                    {l.asking_price !== null
                      ? `$${Number(l.asking_price).toLocaleString("en-US")}`
                      : "—"}
                  </div>
                  <div className={`mt-[3px] text-[8px] uppercase tracking-[1.2px] ${m.cls}`}>
                    {m.label}
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-5 py-8 text-center text-[12px] text-[var(--muted)]">
              No drafts match your search.
            </div>
          )}
        </div>
      </aside>

      {/* ── RIGHT: detail workbench ── */}
      {selected && buffer && meta ? (
        <section className="min-w-0 flex-1">
          <div className="px-6 pb-28 pt-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border-faint)] pb-4">
              <div>
                <div className="text-[9px] uppercase tracking-[2.5px] text-[var(--gold-dim)]">
                  {selected.brand}
                </div>
                <h3 className="mt-1 font-display text-[22px] font-light text-[var(--platinum)]">
                  {selected.model ?? selected.reference}
                </h3>
                <div className="mt-1 text-[10px] text-[var(--muted)]">
                  Reference {selected.reference}
                  {selected.year ? ` · ${selected.year}` : ""}
                </div>
              </div>
              <span className={`shrink-0 border border-current px-2 py-1 text-[9px] uppercase tracking-[1.5px] ${meta.cls}`}>
                {meta.label}
              </span>
            </div>

            {/* State message */}
            <div
              className={`mt-4 border-l-2 px-4 py-3 text-[12px] leading-relaxed text-[var(--platinum-dim)] ${
                selected.status === "rejected"
                  ? "border-[var(--danger)] bg-[rgba(166,106,112,0.06)]"
                  : selected.status === "published"
                    ? "border-[var(--success)] bg-[rgba(111,154,125,0.05)]"
                    : "border-[var(--gold)] bg-[rgba(201,168,76,0.04)]"
              }`}
            >
              {selected.status === "pending_review" ? (
                <>
                  <strong className="block text-[var(--platinum)]">
                    Awaiting FairWatchTrade review
                  </strong>
                  This draft is read-only while the curation team reviews it.
                  {selected.dealer_attested_at && (
                    <span className="mt-1 block text-[11px] text-[var(--muted)]">
                      Commercial facts attested{" "}
                      {new Date(selected.dealer_attested_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      .
                    </span>
                  )}
                </>
              ) : selected.status === "published" ? (
                <>
                  <strong className="block text-[var(--platinum)]">Approved and published</strong>
                  This listing is live. Open it from your Listings module.
                </>
              ) : selected.status === "rejected" ? (
                <>
                  <strong className="block text-[var(--platinum)]">
                    FairWatchTrade requested changes
                  </strong>
                  {selected.rejection_reason || REJECTION_FALLBACK}
                </>
              ) : selected.seller_clarification_note != null ? (
                /* v2.24 — clarification round: locked neutral introduction +
                   the founder's bounded note. Submitting again answers it. */
                <>
                  <strong className="block text-[var(--platinum)]">
                    A little more information, please
                  </strong>
                  We need a little more information about one or more photographs before the
                  listing can be published.
                  {selected.seller_clarification_note.trim() !== "" && (
                    <span className="mt-1 block text-[11px] text-[var(--muted)]">
                      {selected.seller_clarification_note}
                    </span>
                  )}
                </>
              ) : missing.length > 0 ? (
                <>
                  <strong className="block text-[var(--platinum)]">Needs your attention</strong>
                  Missing: {missing.join(", ")}. Complete these, confirm each imported value, and
                  submit when the listing is ready.
                </>
              ) : (
                <>
                  <strong className="block text-[var(--platinum)]">Private dealer draft</strong>
                  Confirm the imported facts and photographs before sending this listing to
                  FairWatchTrade.
                </>
              )}
            </div>

            {/* Stale attestation notice — only meaningful when editable and
                the listing HAS been attested before. Composed, not stored. */}
            {editable && selected.dealer_attested_fingerprint && attested === false && (
              <div className="mt-3 border-l-2 border-[var(--gold-dim)] bg-[rgba(201,168,76,0.03)] px-4 py-2.5 text-[11px] text-[var(--muted)]">
                Commercial facts changed since your last attestation — re-confirm each value
                before resubmitting.
              </div>
            )}

            {/* Photographs */}
            <div className="mt-5 flex gap-3">
              <div className="relative flex min-h-[300px] flex-1 items-center justify-center overflow-hidden border border-[var(--border-faint)] bg-[var(--surface)]">
                {photoUrls[activePhoto] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrls[activePhoto]}
                    alt={`Photograph ${activePhoto + 1}`}
                    className="max-h-[380px] w-full object-contain"
                  />
                ) : (
                  <span className="font-display text-[12px] italic text-[var(--ghost)]">
                    No photographs
                  </span>
                )}
                {photoUrls.length > 0 && (
                  <span className="absolute bottom-3 left-3 border border-[var(--border-gold)] bg-[rgba(10,11,15,0.85)] px-2 py-1 text-[9px] uppercase tracking-[1.5px] text-[var(--platinum-dim)]">
                    Imported photograph {activePhoto + 1} of {photoUrls.length}
                  </span>
                )}
              </div>
              {photoUrls.length > 1 && (
                <div className="flex w-[72px] shrink-0 flex-col gap-2">
                  {photoUrls.slice(0, 8).map((url, i) => (
                    <button
                      key={`${url}-${i}`}
                      type="button"
                      onClick={() => setActivePhoto(i)}
                      className={`h-[64px] overflow-hidden border ${
                        i === activePhoto ? "border-[var(--gold)]" : "border-[var(--border-faint)]"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 border-l border-[var(--gold)] bg-[rgba(201,168,76,0.03)] px-4 py-2.5 text-[11px] leading-relaxed text-[var(--muted)]">
              <strong className="text-[var(--platinum-dim)]">
                Imported photographs · Not In Hand Verified
              </strong>
              <br />
              Confirm these are current photographs of the actual watch, or replace them before
              submission.
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-[var(--border-faint)] bg-[var(--surface)] px-4 py-3">
              <label className="flex items-center gap-2.5 text-[12px] text-[var(--platinum-dim)]">
                <input
                  type="checkbox"
                  checked={shownCeremony(ceremony.photos)}
                  disabled={!editable}
                  onChange={(e) => setCeremony({ ...ceremony, photos: e.target.checked })}
                  className="h-4 w-4 accent-[var(--gold)]"
                />
                I confirm these photographs show the actual watch currently being offered.
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => onFilesChosen(e.target.files)}
              />
              <button
                type="button"
                disabled={!editable || uploading}
                onClick={() => fileInputRef.current?.click()}
                className="border border-[var(--border-mid)] px-3 py-1.5 text-[10px] uppercase tracking-[1.5px] text-[var(--muted)] transition hover:text-[var(--platinum)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {uploading ? "Uploading…" : "Replace imported photographs"}
              </button>
            </div>

            {/* Commercial Details */}
            <div className="mt-6 border-t border-[var(--border-faint)] pt-5">
              <div className="mb-3 flex items-baseline justify-between">
                <h4 className="font-display text-[16px] font-light text-[var(--platinum)]">
                  Commercial Details
                </h4>
                <span className="text-[10px] text-[var(--muted)]">
                  Imported values require dealer confirmation
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {/* Asking Price */}
                <Field
                  label="Asking Price"
                  confirmed={shownCeremony(ceremony.price)}
                  onConfirm={(v) => setCeremony({ ...ceremony, price: v })}
                  editable={editable}
                  foot={
                    selected.asking_price === null && selected.asking_price_raw
                      ? `Imported as: ${selected.asking_price_raw}`
                      : "USD"
                  }
                >
                  <input
                    value={buffer.askingPrice}
                    disabled={!editable}
                    onChange={(e) => {
                      edit({ askingPrice: e.target.value });
                      setCeremony((c) => ({ ...c, price: false }));
                    }}
                    placeholder="—"
                    inputMode="decimal"
                    className="w-full border-b border-[var(--border-subtle)] bg-transparent py-1.5 text-[14px] text-[var(--platinum)] focus:border-[var(--border-gold)] focus:outline-none disabled:opacity-60"
                  />
                </Field>

                {/* Condition */}
                <Field
                  label="Condition"
                  confirmed={shownCeremony(ceremony.condition)}
                  onConfirm={(v) => setCeremony({ ...ceremony, condition: v })}
                  editable={editable}
                  foot="Required"
                >
                  <select
                    value={buffer.condition}
                    disabled={!editable}
                    onChange={(e) => {
                      edit({ condition: e.target.value });
                      setCeremony((c) => ({ ...c, condition: false }));
                    }}
                    className="w-full border-b border-[var(--border-subtle)] bg-transparent py-1.5 text-[13px] text-[var(--platinum)] focus:border-[var(--border-gold)] focus:outline-none disabled:opacity-60 [&>option]:bg-[var(--ink)]"
                  >
                    <option value="">—</option>
                    {CONDITION_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>

                {/* Availability */}
                <Field
                  label="Availability"
                  confirmed={shownCeremony(ceremony.availability)}
                  onConfirm={(v) => setCeremony({ ...ceremony, availability: v })}
                  editable={editable}
                  foot={
                    buffer.availability === "Not Currently Available"
                      ? "Stays a private draft — cannot be submitted"
                      : "Required for submission"
                  }
                >
                  <select
                    value={buffer.availability}
                    disabled={!editable}
                    onChange={(e) => {
                      edit({ availability: e.target.value });
                      setCeremony((c) => ({ ...c, availability: false }));
                    }}
                    className="w-full border-b border-[var(--border-subtle)] bg-transparent py-1.5 text-[13px] text-[var(--platinum)] focus:border-[var(--border-gold)] focus:outline-none disabled:opacity-60 [&>option]:bg-[var(--ink)]"
                  >
                    <option value="">—</option>
                    {AVAILABILITY_OPTIONS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </Field>

                {/* Reference */}
                <Field
                  label="Reference Number"
                  confirmed={shownCeremony(ceremony.reference)}
                  onConfirm={(v) => setCeremony({ ...ceremony, reference: v })}
                  editable={editable}
                  foot="Check against the watch or its documentation"
                >
                  <input
                    value={buffer.reference}
                    disabled={!editable}
                    onChange={(e) => {
                      edit({ reference: e.target.value });
                      setCeremony((c) => ({ ...c, reference: false }));
                    }}
                    className="w-full border-b border-[var(--border-subtle)] bg-transparent py-1.5 text-[14px] text-[var(--platinum)] focus:border-[var(--border-gold)] focus:outline-none disabled:opacity-60"
                  />
                </Field>
              </div>
            </div>

            {/* Included Items — repo-canonical vocabulary */}
            <div className="mt-6 border-t border-[var(--border-faint)] pt-5">
              <div className="mb-3 flex items-baseline justify-between">
                <h4 className="font-display text-[16px] font-light text-[var(--platinum)]">
                  Included Items &amp; Documentation
                </h4>
                <span className="text-[10px] text-[var(--muted)]">
                  Confirm what actually ships with this watch
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {INCLUDED_OPTIONS.map((item) => {
                  const checked = buffer.included.includes(item);
                  return (
                    <label
                      key={item}
                      className="flex items-center gap-2.5 border border-[var(--border-faint)] bg-[var(--surface)] px-3 py-2.5 text-[12px] text-[var(--platinum-dim)]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!editable}
                        onChange={() =>
                          // Canonical-order array — deterministic for the fingerprint.
                          edit({
                            included: INCLUDED_OPTIONS.filter((o) =>
                              o === item ? !checked : buffer.included.includes(o)
                            ),
                          })
                        }
                        className="h-4 w-4 accent-[var(--gold)]"
                      />
                      {item}
                    </label>
                  );
                })}
              </div>
              <div className="mt-3">
                <div className="mb-1 flex items-baseline justify-between">
                  <label className="text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]">
                    Additional Included Items Notes
                  </label>
                  <span className="text-[9px] text-[var(--ghost)]">
                    {buffer.includedNotes.length} / 300
                  </span>
                </div>
                <textarea
                  value={buffer.includedNotes}
                  disabled={!editable}
                  onChange={(e) => edit({ includedNotes: e.target.value.slice(0, 300) })}
                  rows={2}
                  placeholder="Anything not covered above — a specific extra strap, a manufacturer letter, spare parts…"
                  className="w-full border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-[12px] text-[var(--platinum)] placeholder:text-[var(--ghost)] focus:border-[var(--border-gold)] focus:outline-none disabled:opacity-60"
                />
              </div>
            </div>

            {/* Description */}
            <div className="mt-6 border-t border-[var(--border-faint)] pt-5">
              <div className="mb-3 flex items-baseline justify-between">
                <h4 className="font-display text-[16px] font-light text-[var(--platinum)]">
                  Description
                </h4>
                <span className="text-[9px] text-[var(--ghost)]">
                  {buffer.description.length} / 1800
                </span>
              </div>
              <textarea
                value={buffer.description}
                disabled={!editable}
                onChange={(e) => {
                  edit({ description: e.target.value.slice(0, 1800) });
                  setCeremony((c) => ({ ...c, description: false }));
                }}
                rows={5}
                className="w-full border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-[13px] leading-[1.7] text-[var(--platinum)] focus:border-[var(--border-gold)] focus:outline-none disabled:opacity-60"
              />
              <label className="mt-2 flex items-center gap-2.5 text-[12px] text-[var(--platinum-dim)]">
                <input
                  type="checkbox"
                  checked={shownCeremony(ceremony.description)}
                  disabled={!editable}
                  onChange={(e) => setCeremony({ ...ceremony, description: e.target.checked })}
                  className="h-4 w-4 accent-[var(--gold)]"
                />
                Confirmed by dealer
              </label>
            </div>
          </div>

          {/* Action bar */}
          <div className="sticky bottom-0 flex items-center justify-between gap-4 border-t border-[var(--border-faint)] bg-[var(--ink)] px-6 py-4">
            {/* v2.22 — the LEFT line keeps errors and unsaved-state words; the
                saved acknowledgement now lives beside the button that earned it. */}
            <div className="min-w-0 text-[11px] text-[var(--muted)]">
              {saveError ? (
                <span className="text-[var(--danger)]">{saveError}</span>
              ) : submitError ? (
                <span className="text-[var(--danger)]">{submitError}</span>
              ) : dirty ? (
                "Unsaved changes"
              ) : (
                "No unsaved changes"
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              {savedAt && !dirty && (
                <span className="text-[11px] text-[var(--muted)]">
                  Saved privately at {savedAt}
                </span>
              )}
              <button
                type="button"
                onClick={() => saveDraft()}
                disabled={!editable || !dirty || saving}
                className={`border px-4 py-2 text-[10px] uppercase tracking-[1.5px] transition disabled:cursor-not-allowed ${
                  justSaved
                    ? "border-[var(--border-gold)] text-[var(--gold)] disabled:opacity-100"
                    : "border-[var(--border-mid)] text-[var(--muted)] hover:text-[var(--platinum)] disabled:opacity-40"
                }`}
              >
                {saving ? "Saving…" : justSaved ? "Saved ✓" : "Save Draft"}
              </button>
              {selected.status === "pending_review" ? (
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed border border-[var(--border-gold)] px-4 py-2 text-[10px] uppercase tracking-[1.5px] text-[var(--gold)] opacity-40"
                >
                  Awaiting FairWatchTrade Review
                </button>
              ) : selected.status === "published" ? (
                <a
                  href={`/listings/${selected.id}`}
                  className="border border-[var(--border-gold)] px-4 py-2 text-[10px] uppercase tracking-[1.5px] text-[var(--gold)] transition hover:bg-[rgba(201,168,76,0.06)]"
                >
                  View Published Listing
                </a>
              ) : (
                <button
                  type="button"
                  onClick={submitForReview}
                  disabled={!canSubmit}
                  title={
                    !ceremonyComplete
                      ? "Confirm every imported value and the photographs first."
                      : buffer.availability !== "In Stock"
                        ? "Availability must be In Stock to submit."
                        : undefined
                  }
                  className="bg-[var(--gold)] px-5 py-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-[var(--ink)] transition disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {submitting
                    ? "Submitting…"
                    : selected.status === "rejected"
                      ? "Resubmit for Review"
                      : "Submit for Review"}
                </button>
              )}
            </div>
          </div>
        </section>
      ) : (
        <div className="flex-1 px-6 py-10 text-center font-display text-[13px] italic text-[var(--ghost)]">
          Select a draft to review.
        </div>
      )}
    </div>
  );
}

/* Confirmed-field frame: label + Imported tag, the control, and the ceremony
   checkbox. The checkbox state is deliberately ephemeral — the durable
   attestation happens server-side at submission. */
function Field({
  label,
  confirmed,
  onConfirm,
  editable,
  foot,
  children,
}: {
  label: string;
  confirmed: boolean;
  onConfirm: (v: boolean) => void;
  editable: boolean;
  foot: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[var(--border-faint)] bg-[var(--surface)] px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[1.5px] text-[var(--platinum-dim)]">
          {label}
        </span>
        <span className="border border-[rgba(201,168,76,0.3)] px-1.5 py-0.5 text-[8px] uppercase tracking-[1px] text-[var(--gold-dim)]">
          Imported
        </span>
      </div>
      {children}
      <div className="mt-2 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[11px] text-[var(--platinum-dim)]">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={!editable}
            onChange={(e) => onConfirm(e.target.checked)}
            className="h-4 w-4 accent-[var(--gold)]"
          />
          Confirmed by dealer
        </label>
        <span className="text-[9px] text-[var(--ghost)]">{foot}</span>
      </div>
    </div>
  );
}
