"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  emptyDraft,
  toScoringState,
  type Condition,
  type ListingDraft,
} from "@/lib/listing";
import { type PhotoCategory, type SaleState } from "@/lib/scoring";
import { parsePrice } from "@/lib/parsePrice";
import { buildCurationSubmission } from "@/lib/curationSubmission";
import { formatMoney } from "@/lib/formatMoney";
import {
  SUPPORTED_CURRENCIES,
  RECOMMENDED_CURRENCY,
  isSupportedCurrency,
} from "@/lib/supportedCurrencies";
import CameraCapture, { type ConfirmedCapture } from "@/components/CameraCapture";
import { type OverlayVariant } from "@/components/AlignmentOverlay";
import WatchSpinner from "@/components/WatchSpinner";
import { randomUUID } from "@/lib/uuid";
import PhotoPresentationEditor, {
  PhotoPresentationEntry,
} from "@/components/PhotoPresentationEditor";
import {
  presentationStyleFor,
  resolveHeroIndex,
  sanitizePhotoPresentation,
} from "@/lib/photoPresentation";
import {
  automaticHeroIndex as roleAutomaticHero,
  sortByPhotoRole,
} from "@/lib/photoRoles";
import {
  createDraft,
  saveContent,
  returnAuthority,
  markPublished,
  fetchDraftRow,
  fetchNewestActiveDraft,
} from "@/lib/listingDraft";

/* ════════════════════════════════════════════════════════════════════════
   MOBILE WIZARD — components/MobileWizard.tsx   (v2.2 · Phase 3)

   "List from Phone." A guided, camera-first client over the SAME
   FairWatchTrade listing record, validation rules, curation system, and
   publishing pipeline as the desktop flow. Not a second sell flow — a second
   door into the same room. Every decision below is governed by that.

   Shared truth, consumed not copied:
   · Draft shape       → ListingDraft / emptyDraft (@/lib/listing)
   · Completeness      → toScoringState + the scoring engine; the wizard adds
                         saleState by composition: { ...toScoringState(d), saleState }
   · Curation          → POST /api/evaluate, byte-for-byte the desktop
                         contract (defensive parse mirrored from SellFlow)
   · Publish           → POST /api/listings with ReviewStep's exact payload,
                         plus additive v2.2 fields (publish_request_id,
                         capture_session_id, sale_state, media_meta) that
                         today's route ignores and the amended route consumes
   · Categories        → canonical PhotoCategory strings only. Wrist shots
                         follow the desktop convention: category "Other" +
                         isWristShot — one vocabulary, zero drift.

   Draft survival invariant (non-negotiable): session failures, camera
   failures, expired badges — none of them touch the draft. The draft lives
   in wizard state, mirrors to localStorage on every change, and survives
   refresh, crash, and permission denial. The badge is a reward, never a gate.

   PFC274 = 62 — the evaluate route is called, never touched.
   ════════════════════════════════════════════════════════════════════════ */

/* ── Vault data passed from the server page ── */
export type VaultBrandLite = { id: string; name: string; slug: string };

/* ── Capture step config — data-driven, per the brief ── */
type CaptureStep = {
  category: PhotoCategory;
  /** Included in the mandatory run at all? */
  included: boolean;
  /** May be skipped inside the run ("Other / mixed" clasp case). */
  skippable: boolean;
  instruction: string;
  subInstruction: string;
  overlay: OverlayVariant;
  privacyReview: boolean;
  isWristShot?: boolean;
};

function buildCaptureSteps(saleState: SaleState): CaptureStep[] {
  const claspIncluded = saleState !== "head_only";
  const claspSkippable = saleState === "other";
  return [
    {
      category: "Dial",
      included: true,
      skippable: false,
      instruction: "Position the dial face-up within the outline",
      subInstruction: "Fill the frame. Keep the watch flat.",
      overlay: "front",
      privacyReview: false,
    },
    {
      category: "Caseback",
      included: true,
      skippable: false,
      instruction: "Flip the watch over",
      subInstruction: "Show the full caseback.",
      overlay: "back",
      privacyReview: true,
    },
    {
      category: "Crown Side",
      included: true,
      skippable: false,
      instruction: "Turn to the crown side",
      subInstruction: "Crown and pushers visible.",
      overlay: "crown-side",
      privacyReview: false, // ruled: no serial exposure risk on the crown side
    },
    {
      category: "Non-Crown Side",
      included: true,
      skippable: false,
      instruction: "Rotate to the opposite side",
      subInstruction: "The side without the crown.",
      overlay: "non-crown-side",
      privacyReview: true,
    },
    {
      category: "Clasp/Pin Buckle",
      included: claspIncluded,
      skippable: claspSkippable,
      instruction:
        saleState === "bracelet"
          ? "Show the clasp"
          : saleState === "strap"
            ? "Show the buckle"
            : "Show the clasp or buckle if present",
      subInstruction: "Open it fully if possible.",
      overlay: "clasp",
      privacyReview: true,
    },
    {
      category: "Full watch, strap/bracelet extended",
      included: true, // mandatory for all four sale states — locked ruling
      skippable: false,
      instruction: "Full length shot",
      subInstruction:
        saleState === "bracelet"
          ? "Bracelet fully extended."
          : saleState === "strap"
            ? "Strap lying flat."
            : "Complete watch visible.",
      overlay: "full",
      privacyReview: false,
    },
  ].filter((s) => s.included) as CaptureStep[];
}

/* Optional shots — offered after the mandatory run, always skippable. */
function buildOptionalSteps(): CaptureStep[] {
  return [
    {
      category: "Movement (closeup)", // canonical v2.0j string — never "Movement"
      included: true,
      skippable: true,
      instruction: "Add a movement photo",
      subInstruction:
        "Only if the movement is already safely visible or the watch is open for service. Never remove a caseback yourself.",
      overlay: "front",
      privacyReview: false,
    },
    {
      category: "Other", // desktop convention: wrist shots are "Other" + isWristShot
      included: true,
      skippable: true,
      instruction: "On the wrist?",
      subInstruction: "Optional. Shows scale.",
      overlay: "wrist",
      privacyReview: false,
      isWristShot: true,
    },
  ];
}

/* ── Media metadata accumulated per confirmed capture (server consumes it
     in the amended /api/listings — client never writes listing_media). ── */
type MediaMeta = {
  category: PhotoCategory;
  storage_path: string;
  capture_source: "live_camera";
  capture_session_id: string | null;
  sequence_index: number;
  original_hash: string;
  privacy_review_requested: boolean;
  is_wrist_shot: boolean;
  /** Phase 5 — per-photo AI verdict. hard_fail never lands here (those
   *  photos are never added). Sent additively at publish. */
  ai_review_status: "pending" | "passed" | "soft_fail";
  /** The draft attempt this photo was captured under. Publish refuses a set
   *  whose photos don't all share the active attempt — the backstop behind
   *  the resume-choice gate against cross-watch photo contamination. */
  draft_attempt_id: string;
};

/* ── Persisted resume blob — the exact shape mirrored to localStorage. The
     attempt identity travels with it so a resumed draft keeps the attempt its
     photos were stamped under. ── */
type ResumeBlob = {
  draft: ListingDraft;
  saleState: SaleState | null;
  mediaMeta: MediaMeta[];
  stage: Stage;
  captureIndex?: number;
  optionalIndex?: number;
  optionalActive?: boolean;
  captureSessionId?: string | null;
  badgeForfeited?: boolean;
  referenceInput?: string;
  notesInput?: string;
  attemptId?: string;
};

/* ── Curation — the desktop contract, mirrored defensively ── */
async function runCuration(d: ListingDraft): Promise<{
  pass: boolean;
  score: number;
  reasoning: string;
}> {
  const res = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    /* Shared mapper — see lib/curationSubmission.ts. Hand-assembling this
       payload is what drifted from the route's contract in the first place,
       and mobile carried the identical defect. */
    body: JSON.stringify(buildCurationSubmission(d)),
  });
  if (!res.ok) throw new Error(`evaluate ${res.status}`);
  const json = await res.json();
  const score = Number(json.score ?? json.significance ?? 0);
  const decision = String(json.decision ?? "").toLowerCase();
  const reasoning = String(json.reasoning ?? json.message ?? "");
  const pass = decision
    ? !decision.includes("reject") && !decision.includes("declin")
    : score > 0;
  return { pass, score, reasoning };
}

/* ── Device token — localStorage per the locked ruling ── */
const DEVICE_TOKEN_KEY = "fw_device_token";
const RESUME_KEY = "fw_mobile_wizard_v2_2";

function getDeviceToken(): string {
  try {
    const existing = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (existing) return existing;
    const fresh = randomUUID();
    localStorage.setItem(DEVICE_TOKEN_KEY, fresh);
    return fresh;
  } catch {
    return randomUUID(); // storage blocked → session still works, badge may not persist
  }
}

/* ── Stages ── */
type Stage =
  | "sale_state"
  | "identity"
  | "capture"
  | "capture_optional"
  | "optional"
  | "reference"
  | "review"
  | "published";

const CONDITIONS: Condition[] = ["Unworn", "Mint", "Excellent", "Very Good", "Good", "Fair"];

const SALE_STATE_OPTIONS: { value: SaleState; label: string }[] = [
  { value: "bracelet", label: "Bracelet" },
  { value: "strap", label: "Strap" },
  { value: "head_only", label: "Head only" },
  { value: "other", label: "Other / mixed" },
];

export default function MobileWizard({
  brands,
  serverDraftId = null,
}: {
  brands: VaultBrandLite[];
  // List From Phone — set when this wizard opens via a redeemed handoff
  // (/sell/continue/[token] → /sell/mobile?draft=<id>). The server draft is
  // then canonical and this device holds the 'phone' baton.
  serverDraftId?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [stage, setStage] = useState<Stage>("sale_state");
  const [saleState, setSaleState] = useState<SaleState | null>(null);
  const [draft, setDraft] = useState<ListingDraft>(() => emptyDraft());
  const [mediaMeta, setMediaMeta] = useState<MediaMeta[]>([]);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const presentationEntryRef = useRef<HTMLButtonElement | null>(null);

  // ── Draft-attempt identity ── one token per listing attempt. Minted on a
  // fresh start and re-minted on "Start a new listing"; every photo is stamped
  // with it, and publish refuses a set that doesn't all match. This is what
  // makes a new attempt truly new — no field or photo survives from a prior
  // watch. A ref, not state: it changes only alongside a full reset.
  const attemptIdRef = useRef<string>("");
  // blockSaveRef starts true so the first render's save-effect pass can't
  // clobber a stored draft before the resume decision is made.
  const blockSaveRef = useRef<boolean>(true);
  // A held prior draft awaiting the seller's resume/start-new choice. While
  // set, nothing is restored and nothing is saved.
  const [pendingResume, setPendingResume] = useState<ResumeBlob | null>(null);

  /* ── List From Phone — server-backed draft (canonical) ──
     serverIdRef/serverRevRef track the listing_drafts row + optimistic
     revision. serverEditorRef is the baton label this device saves under:
     'phone' when the wizard opened via a redeemed handoff, 'desktop' (origin
     authority) for an organic same-device wizard draft — the baton only
     distinguishes devices once a handoff exists. localStorage remains a
     same-device recovery aid only; after import, server state wins and a
     stale local blob can never overwrite a newer server revision (the RPC's
     revision guard enforces this even if a delayed tab tries). */
  const serverIdRef = useRef<string | null>(serverDraftId);
  const serverRevRef = useRef(0);
  const serverEditorRef = useRef<"desktop" | "phone">(serverDraftId ? "phone" : "desktop");
  const serverSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creatingServerRef = useRef(false);
  const [serverPhase, setServerPhase] = useState<"idle" | "loading" | "gone">(
    serverDraftId ? "loading" : "idle"
  );
  // The baton left this device (hand-back completed, or desktop reclaimed).
  const [batonAway, setBatonAway] = useState<null | "handed_back" | "reclaimed">(null);
  const [handingBack, setHandingBack] = useState(false);

  // Capture run
  const [captureIndex, setCaptureIndex] = useState(0);
  const [optionalIndex, setOptionalIndex] = useState(0);
  const [optionalActive, setOptionalActive] = useState(false);

  // Phase 5 — AI review + privacy processing state.
  // hardFail: plain-language banner over a remounted live camera.
  // retakeNonce: bumps the CameraCapture key so a hard fail reopens live.
  // badgeForfeited: one soft fail = badge gone for this attempt; the draft
  // and publish are untouched (the badge is a reward, never a gate).
  const [hardFail, setHardFail] = useState<string | null>(null);
  const [retakeNonce, setRetakeNonce] = useState(0);
  const [badgeForfeited, setBadgeForfeited] = useState(false);

  // Session (badge infrastructure — its failure never blocks the flow)
  const [captureSessionId, setCaptureSessionId] = useState<string | null>(null);
  const sessionDeadRef = useRef(false);

  // Identity UI
  const [brandQuery, setBrandQuery] = useState("");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [modelQuery, setModelQuery] = useState("");
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [preflight, setPreflight] = useState<
    | { state: "idle" }
    | { state: "running" }
    | { state: "notice"; reasoning: string }
    | { state: "failed" }
  >({ state: "idle" });

  // Reference screen
  const [referenceInput, setReferenceInput] = useState("");
  const [notesInput, setNotesInput] = useState("");

  // Publish
  const publishRequestIdRef = useRef<string>("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  // v2.24 · a publish can land held (pending_review) — the published screen
  // then shows the locked held-state copy, never a false "in the marketplace".
  const [publishHeld, setPublishHeld] = useState(false);

  const captureSteps = useMemo(
    () => (saleState ? buildCaptureSteps(saleState) : []),
    [saleState]
  );
  const optionalSteps = useMemo(() => buildOptionalSteps(), []);


  /* Apply a held draft when the seller chooses to resume it. The attempt keeps
     its original identity (older blobs with no attemptId adopt a fresh one). */
  const resumeSaved = useCallback((saved: ResumeBlob) => {
    setDraft(saved.draft);
    setSaleState(saved.saleState ?? null);
    setMediaMeta(Array.isArray(saved.mediaMeta) ? saved.mediaMeta : []);
    setStage(saved.stage);
    setCaptureIndex(saved.captureIndex ?? 0);
    setOptionalIndex(saved.optionalIndex ?? 0);
    setOptionalActive(saved.optionalActive ?? false);
    setCaptureSessionId(saved.captureSessionId ?? null);
    setBadgeForfeited(saved.badgeForfeited === true);
    // Reference/notes live in their own state and only reach the draft at
    // publish time — so mid-session the saved draft.reference is empty.
    // Restore them from the blob's own fields; fall back to the draft fields
    // for older blobs saved before these were persisted directly.
    setReferenceInput(saved.referenceInput ?? saved.draft.reference ?? "");
    setNotesInput(saved.notesInput ?? saved.draft.provenanceNote ?? "");
    setBrandQuery(saved.draft.brand ?? "");
    setModelQuery(saved.draft.model ?? "");
    attemptIdRef.current = saved.attemptId || randomUUID();
    blockSaveRef.current = false;
    setPendingResume(null);
  }, []);

  /* ── Resume gate — a prior unpublished draft is NEVER silently restored.
     Layer-1 fix for the cross-watch draft leak: silent auto-resume let one
     watch's fields and photos ride under the next watch's session. Now, if an
     unpublished draft exists, we hold and let the seller choose — resume it,
     or start a new listing (a full, atomic clear). Only after that choice does
     any draft state, or any save, proceed. ── */
  useEffect(() => {
    let cancelled = false;

    // Server content → the wizard's blob shape. A desktop-origin draft carries
    // only { draft }; wizard extras default to a fresh capture flow around the
    // preserved field values.
    const toBlob = (content: Record<string, unknown>): ResumeBlob | null => {
      const d = content?.draft as ListingDraft | undefined;
      if (!d || typeof d !== "object") return null;
      const c = content as Partial<ResumeBlob>;
      return {
        draft: { ...emptyDraft(), ...d },
        saleState: c.saleState ?? null,
        mediaMeta: Array.isArray(c.mediaMeta) ? c.mediaMeta : [],
        stage: c.stage && c.stage !== "published" ? c.stage : "sale_state",
        captureIndex: c.captureIndex ?? 0,
        optionalIndex: c.optionalIndex ?? 0,
        optionalActive: c.optionalActive ?? false,
        captureSessionId: c.captureSessionId ?? null,
        badgeForfeited: c.badgeForfeited === true,
        referenceInput: c.referenceInput,
        notesInput: c.notesInput,
        attemptId: c.attemptId,
      };
    };

    (async () => {
      // ── Handoff mode: the server draft is canonical; local resume is skipped
      // entirely (the phone is continuing the seller's other-device work). ──
      if (serverDraftId) {
        const row = await fetchDraftRow(serverDraftId);
        if (cancelled) return;
        const blob = row ? toBlob(row.content) : null;
        if (!row || !blob || row.status !== "active") {
          setServerPhase("gone");
          return;
        }
        serverRevRef.current = row.revision;
        resumeSaved(blob); // opens the save path with the same attempt identity
        setServerPhase("idle");
        return;
      }

      // ── Organic wizard visit: the server draft (if any) is canonical and is
      // offered through the SAME resume-choice gate as before — never silently
      // restored. A local-only blob keeps today's behavior and is imported
      // once to the server on its first save after resume. ──
      const row = await fetchNewestActiveDraft().catch(() => null);
      if (cancelled) return;
      const serverBlob = row ? toBlob(row.content) : null;
      const serverMeaningful =
        serverBlob &&
        (serverBlob.draft.brand.trim() !== "" || serverBlob.draft.photos.length > 0);
      if (row && serverBlob && serverMeaningful) {
        serverIdRef.current = row.id;
        serverRevRef.current = row.revision;
        serverEditorRef.current = row.active_editor === "phone" ? "phone" : "desktop";
        setPendingResume(serverBlob);
        return;
      }
      try {
        const raw = localStorage.getItem(RESUME_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as ResumeBlob;
          if (saved && saved.draft && saved.stage && saved.stage !== "published") {
            // Hold for the seller's choice. blockSaveRef stays true so the
            // draft in storage is preserved untouched until they decide.
            setPendingResume(saved);
            return;
          }
        }
      } catch {
        /* a bad resume blob is discarded, never fatal */
      }
      // No resumable draft → a fresh attempt. Mint its identity, open the save
      // path.
      attemptIdRef.current = randomUUID();
      blockSaveRef.current = false;
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stage === "published") {
      try {
        localStorage.removeItem(RESUME_KEY);
      } catch {}
      return;
    }
    // Held on the resume decision → never write. This also stops the first
    // render's pass from clobbering a stored draft before the gate reads it.
    if (blockSaveRef.current) return;
    try {
      localStorage.setItem(
        RESUME_KEY,
        JSON.stringify({
          draft,
          saleState,
          mediaMeta,
          stage,
          captureIndex,
          optionalIndex,
          optionalActive,
          captureSessionId,
          badgeForfeited,
          // Persisted directly: these live in their own state and only reach
          // the draft at publish, so a resumed draft must carry them itself.
          referenceInput,
          notesInput,
          // The attempt identity travels with the draft so a resumed draft
          // keeps the same attempt its photos were stamped under.
          attemptId: attemptIdRef.current,
        })
      );
    } catch {}
  }, [draft, saleState, mediaMeta, stage, captureIndex, optionalIndex, optionalActive, captureSessionId, badgeForfeited, referenceInput, notesInput, pendingResume]);

  /* ── Canonical server save — debounced, revision-guarded, baton-aware.
     Mirrors the exact blob shape localStorage carries, so either device can
     continue it. Creates the server draft lazily on the first meaningful save
     (which is also the one-time import of a resumed local blob). ── */
  useEffect(() => {
    if (blockSaveRef.current || pendingResume || batonAway) return;
    if (stage === "published" || serverPhase === "loading") return;
    if (serverSaveTimer.current) clearTimeout(serverSaveTimer.current);
    serverSaveTimer.current = setTimeout(async () => {
      const content = {
        draft,
        saleState,
        mediaMeta,
        stage,
        captureIndex,
        optionalIndex,
        optionalActive,
        captureSessionId,
        badgeForfeited,
        referenceInput,
        notesInput,
        attemptId: attemptIdRef.current,
      };
      if (!serverIdRef.current) {
        // Lazy create / one-time import — only once there is something to keep.
        const meaningful = draft.brand.trim() !== "" || draft.photos.length > 0;
        if (!meaningful || creatingServerRef.current) return;
        creatingServerRef.current = true;
        const id = await createDraft(content);
        creatingServerRef.current = false;
        if (id) {
          serverIdRef.current = id;
          serverRevRef.current = 0;
        }
        return;
      }
      const res = await saveContent(
        serverIdRef.current,
        content,
        serverRevRef.current,
        serverEditorRef.current
      );
      if (res.state === "SAVED" && typeof res.revision === "number") {
        serverRevRef.current = res.revision;
      } else if (res.state === "NOT_ACTIVE_EDITOR") {
        // The desktop reclaimed authority — this device goes read-only.
        setBatonAway("reclaimed");
      } else if (res.state === "STALE") {
        // A newer revision exists elsewhere; adopt its counter so the next
        // save is judged against truth (content adoption happens on the
        // resume path, never silently mid-edit).
        const row = await fetchDraftRow(serverIdRef.current);
        if (row) serverRevRef.current = row.revision;
      }
    }, 1200);
    return () => {
      if (serverSaveTimer.current) clearTimeout(serverSaveTimer.current);
    };
  }, [draft, saleState, mediaMeta, stage, captureIndex, optionalIndex, optionalActive, captureSessionId, badgeForfeited, referenceInput, notesInput, pendingResume, batonAway, serverPhase]);

  /* ── Explicit hand-back: save the final phone state and return the baton. ── */
  const handBackToDesktop = useCallback(async () => {
    const id = serverIdRef.current;
    if (!id || handingBack) return;
    setHandingBack(true);
    const content = {
      draft,
      saleState,
      mediaMeta,
      stage,
      captureIndex,
      optionalIndex,
      optionalActive,
      captureSessionId,
      badgeForfeited,
      referenceInput,
      notesInput,
      attemptId: attemptIdRef.current,
    };
    let res = await returnAuthority(id, content, serverRevRef.current);
    if (res.state === "STALE") {
      // One honest retry against the server's current revision.
      const row = await fetchDraftRow(id);
      if (row) res = await returnAuthority(id, content, row.revision);
    }
    setHandingBack(false);
    if (res.state === "RETURNED") {
      setBatonAway("handed_back");
    }
  }, [draft, saleState, mediaMeta, stage, captureIndex, optionalIndex, optionalActive, captureSessionId, badgeForfeited, referenceInput, notesInput, handingBack]);

  /* ── Session lifecycle — best-effort, never blocking ── */
  const ensureSession = useCallback(async () => {
    if (captureSessionId || sessionDeadRef.current) return;
    try {
      const res = await fetch("/api/wizard-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_session_token: getDeviceToken() }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      if (typeof json.capture_session_id === "string") {
        setCaptureSessionId(json.capture_session_id);
      }
    } catch {
      // Badge infrastructure down ≠ seller blocked. Draft path continues.
      sessionDeadRef.current = true;
    }
  }, [captureSessionId]);

  const heartbeat = useCallback(
    (currentStep: string) => {
      if (!captureSessionId) return;
      fetch("/api/wizard-session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capture_session_id: captureSessionId,
          device_session_token: getDeviceToken(),
          current_step: currentStep,
        }),
      }).catch(() => {
        /* heartbeat loss never interrupts capture */
      });
    },
    [captureSessionId]
  );

  /* ── Vault typeahead ── */
  const brandSuggestions = useMemo(() => {
    const q = brandQuery.trim().toLowerCase();
    if (q.length < 3) return [];
    return brands
      .filter((b) => b.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [brandQuery, brands]);

  useEffect(() => {
    let cancelled = false;
    if (!brandId) {
      setModelOptions([]);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from("vault_collections")
          .select("name")
          .eq("brand_id", brandId)
          .order("sort_order");
        if (!cancelled && Array.isArray(data)) {
          setModelOptions(data.map((r: { name: string }) => r.name).filter(Boolean));
        }
      } catch {
        if (!cancelled) setModelOptions([]); // suggestions are sugar — free text always works
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brandId, supabase]);

  const modelSuggestions = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) return modelOptions.slice(0, 6);
    return modelOptions.filter((m) => m.toLowerCase().includes(q)).slice(0, 6);
  }, [modelQuery, modelOptions]);

  /* ── Money Truth Stage B — the same approved selector as desktop (one
        Design Gate, two doors into the same room). The stored preference
        prefills; no preference → USD visibly RECOMMENDED, never persisted.
        The prefill guards on the CURRENT draft value inside the updater so a
        resumed draft's chosen currency is never clobbered. ── */
  const [hasStoredPref, setHasStoredPref] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let pref: string | null = null;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from("profiles")
            .select("preferred_listing_currency")
            .eq("id", user.id)
            .maybeSingle();
          pref = isSupportedCurrency(data?.preferred_listing_currency)
            ? data!.preferred_listing_currency
            : null;
        }
      } catch {
        /* preference unavailable → the Recommended default carries */
      }
      if (cancelled) return;
      setHasStoredPref(pref !== null);
      setDraft((d) =>
        isSupportedCurrency(d.askingCurrency)
          ? d
          : { ...d, askingCurrency: pref ?? RECOMMENDED_CURRENCY }
      );
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only prefill — must not re-fire as the seller edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const askingParse = parsePrice(draft.askingPrice, draft.askingCurrency);

  /* ── Identity completion + curation preflight (advisory, never a wall) ── */
  const identityComplete =
    draft.brand.trim() !== "" &&
    draft.model.trim() !== "" &&
    draft.condition !== "" &&
    draft.askingPrice.trim() !== "" &&
    // Design Gate: the same deliberate confirmation state as desktop —
    // progression stays disabled until the pair is explicitly confirmed.
    draft.askingConfirmed;

  const startCapture = useCallback(() => {
    setStage("capture");
    setCaptureIndex(0);
    void ensureSession();
  }, [ensureSession]);

  const continueFromIdentity = useCallback(async () => {
    if (!identityComplete) return;
    setPreflight({ state: "running" });
    try {
      const result = await runCuration(draft);
      setDraft((d) => ({
        ...d,
        significanceScore: result.score,
        curationDecision: result.pass ? "pass" : "fail",
        curationReasoning: result.reasoning,
      }));
      if (result.pass) {
        setPreflight({ state: "idle" });
        startCapture();
      } else {
        // Gentle, before the camera opens — never a surprise mid-capture.
        setPreflight({ state: "notice", reasoning: result.reasoning });
      }
    } catch {
      // Advisory only: if curation is unreachable, the seller proceeds.
      setPreflight({ state: "failed" });
      setDraft((d) => ({ ...d, curationDecision: "pending" }));
      startCapture();
    }
  }, [draft, identityComplete, startCapture]);

  /* ── Capture confirmation — the dual-write metadata accumulates here ── */
  /* ── Phase 5 · blur late-swap — fire-and-forget with a callback. The
        seller advances immediately; when the processed image lands, its URL
        replaces the original in BOTH the draft photos (what the listing
        shows) and the media metadata (what the server records). If the
        seller publishes before it resolves, the original stands — fail-open,
        never a wait. Silent by design: the seller is never told. ── */
  const SERIAL_CATEGORIES: PhotoCategory[] = ["Caseback", "Non-Crown Side"];

  const fireBlurSerial = useCallback((category: PhotoCategory, originalUrl: string, originalPathname: string) => {
    fetch("/api/blur-serial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoUrl: originalUrl, category }),
    })
      .then((r) => r.json())
      .then((j: { processedUrl?: string; pathname?: string; blurred?: boolean }) => {
        if (!j || j.blurred !== true || !j.processedUrl) return;
        const newUrl = j.processedUrl;
        const newPath = j.pathname || originalPathname;
        setDraft((d) => ({
          ...d,
          photos: d.photos.map((p) =>
            p.photo.pathname === originalPathname
              ? { ...p, photo: { url: newUrl, pathname: newPath } }
              : p
          ),
        }));
        setMediaMeta((m) =>
          m.map((entry) =>
            entry.storage_path === originalPathname
              ? { ...entry, storage_path: newPath }
              : entry
          )
        );
      })
      .catch(() => {
        /* silent — original stands */
      });
  }, []);

  /* ── Capture confirmation — review gate, then the dual-write metadata ── */
  const handleConfirmed = useCallback(
    (step: CaptureStep) => async (cap: ConfirmedCapture) => {
      // Phase 5 · Step A — AI review, awaited inside the camera's Uploading
      // state. Fail-open on any error: infra never blocks a seller.
      const review: { result: string; reason: string } = await fetch(
        "/api/wizard-photo-review",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photoUrl: cap.url,
            category: step.category,
            captureSource: "live_camera",
            capture_session_id: captureSessionId,
            storage_path: cap.pathname,
          }),
        }
      )
        .then((r) => r.json())
        .catch(() => ({ result: "passed", reason: "" }));

      if (review.result === "hard_fail") {
        // Block: the photo is never added to the draft. The camera remounts
        // live (retakeNonce) under a plain-language banner. Draft untouched.
        setHardFail(
          `${step.category} photo couldn't be verified — ${
            review.reason || "the watch isn't clearly visible"
          }. Please retake.`
        );
        setRetakeNonce((n) => n + 1);
        return;
      }

      const verdict: MediaMeta["ai_review_status"] =
        review.result === "soft_fail" ? "soft_fail" : "passed";
      if (verdict === "soft_fail") {
        // One soft fail forfeits the badge for this attempt — publish and
        // draft are unaffected. Admin sees the verdict in media metadata.
        setBadgeForfeited(true);
      }
      setHardFail(null);

      setDraft((d) => ({
        ...d,
        photos: [
          ...d.photos,
          {
            photo: { url: cap.url, pathname: cap.pathname },
            category: step.category,
            ...(step.isWristShot ? { isWristShot: true } : {}),
          },
        ],
      }));
      setMediaMeta((m) => [
        ...m,
        {
          category: step.category,
          storage_path: cap.pathname,
          capture_source: "live_camera",
          capture_session_id: captureSessionId,
          sequence_index: m.length,
          original_hash: cap.originalHash,
          privacy_review_requested: step.privacyReview,
          is_wrist_shot: step.isWristShot === true,
          ai_review_status: verdict,
          draft_attempt_id: attemptIdRef.current,
        },
      ]);

      // Phase 5 · Step B — blur-serial, fire-and-forget for serial-adjacent
      // categories. The seller advances now; the swap happens when it lands.
      if (SERIAL_CATEGORIES.includes(step.category)) {
        fireBlurSerial(step.category, cap.url, cap.pathname);
      }

      heartbeat(step.category);

      if (!optionalActive) {
        if (captureIndex + 1 < captureSteps.length) {
          setCaptureIndex((i) => i + 1);
        } else {
          setStage("optional");
          setOptionalActive(true);
          setOptionalIndex(0);
        }
      } else {
        if (optionalIndex + 1 < optionalSteps.length) {
          setOptionalIndex((i) => i + 1);
          setStage("optional");
        } else {
          setStage("reference");
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [captureIndex, captureSteps.length, captureSessionId, fireBlurSerial, heartbeat, optionalActive, optionalIndex, optionalSteps.length]
  );

  const skipCurrent = useCallback(() => {
    if (!optionalActive) {
      if (captureIndex + 1 < captureSteps.length) setCaptureIndex((i) => i + 1);
      else {
        setStage("optional");
        setOptionalActive(true);
        setOptionalIndex(0);
      }
    } else {
      if (optionalIndex + 1 < optionalSteps.length) setOptionalIndex((i) => i + 1);
      else setStage("reference");
    }
  }, [captureIndex, captureSteps.length, optionalActive, optionalIndex, optionalSteps.length]);

  // Backward navigation out of an optional offer — the same Back affordance the
  // required capture steps and the reference step already have, so no capture
  // step traps the seller with only forward exits. From a later optional offer,
  // step to the previous one; from the first optional offer, return to the last
  // required capture step. Forward movement (Skip / Add) is unchanged.
  const backFromOptional = useCallback(() => {
    if (optionalIndex > 0) {
      setOptionalIndex((i) => i - 1);
    } else {
      setOptionalActive(false);
      setCaptureIndex(Math.max(0, captureSteps.length - 1));
      setStage("capture");
    }
  }, [optionalIndex, captureSteps.length]);

  /* ── Publish — ReviewStep's exact payload + additive v2.2 fields ── */
  const publish = useCallback(async () => {
    // ── Publish-time identity hardening ── every photo must belong to the
    // active draft attempt, and the dual-write arrays must agree. Backstop
    // behind the resume-choice gate: a photo set carrying another watch's
    // shots can never publish, even if some future path reintroduces one.
    const activeAttempt = attemptIdRef.current;
    const photosBelong =
      !!activeAttempt &&
      mediaMeta.length === draft.photos.length &&
      mediaMeta.every((m) => m.draft_attempt_id === activeAttempt);
    if (!photosBelong) {
      setPublishError(
        "These photos don't all belong to this listing. Please start a new listing and retake them."
      );
      return;
    }
    if (!publishRequestIdRef.current) {
      publishRequestIdRef.current = randomUUID(); // stable across retries — that's the idempotency
    }
    setPublishing(true);
    setPublishError(null);

    const finalDraft: ListingDraft = {
      ...draft,
      reference: referenceInput.trim(),
      provenanceNote: notesInput.trim(),
      hasBracelet: saleState === "bracelet",
    };

    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: finalDraft.brand,
          customBrandFlag: finalDraft.customBrandFlag,
          model: finalDraft.model,
          reference: finalDraft.reference,
          year: finalDraft.year,
          condition: finalDraft.condition,
          askingPrice: finalDraft.askingPrice,
          askingCurrency: finalDraft.askingCurrency,
          provenanceNote: finalDraft.provenanceNote,
          significanceScore: finalDraft.significanceScore,
          photos: finalDraft.photos,
          // Same shared contract as desktop Review — one metadata object, one
          // sanitizer, so the two surfaces cannot disagree about framing.
          photoPresentation: sanitizePhotoPresentation(finalDraft.photoPresentation),
          hasBracelet: finalDraft.hasBracelet,
          details: finalDraft.details,
          description: finalDraft.description,
          descriptionPassedAI: finalDraft.descriptionPassedAI,
          scoreState: { ...toScoringState(finalDraft), saleState: saleState ?? undefined },
          // ── v2.2 additive fields — ignored by today's route, consumed by
          //    the amended route (badge verification + listing_media writes
          //    happen SERVER-side; client claims are never trusted). ──
          publish_request_id: publishRequestIdRef.current,
          // Phase 5 — a soft-failed session forfeits the badge: withholding
          // the session id makes the server's badge check fail closed while
          // the publish itself is untouched. Verdicts still travel in
          // media_meta for the admin trail.
          capture_session_id: badgeForfeited ? null : captureSessionId,
          device_session_token: getDeviceToken(),
          sale_state: saleState,
          media_meta: mediaMeta,
          // Additive — the active draft attempt. Ignored by today's route;
          // available for future server-side identity enforcement.
          draft_attempt_id: activeAttempt,
          source: "mobile_wizard",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          setPublishError("Please sign in before publishing — your listing isn't lost.");
        } else {
          setPublishError(data?.detail || "Something went wrong publishing your listing.");
        }
        setPublishing(false);
        return;
      }

      if (captureSessionId) {
        fetch("/api/wizard-session", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            capture_session_id: captureSessionId,
            device_session_token: getDeviceToken(),
            status: "completed",
          }),
        }).catch(() => {});
      }
      /* Every submission is pending_review now, so status alone no longer
         separates the two messages — `held` is the server's own answer. */
      setPublishHeld(data?.held === true);
      // List From Phone — close the server draft idempotently now that the
      // real listing owns the work (it can never publish twice).
      if (serverIdRef.current && data?.id) {
        void markPublished(serverIdRef.current, String(data.id));
      }
      setStage("published");
    } catch {
      setPublishError("Network error — your listing wasn't published. Try again.");
    } finally {
      setPublishing(false);
    }
  }, [captureSessionId, draft, mediaMeta, notesInput, referenceInput, saleState]);

  const startOver = useCallback(() => {
    try {
      localStorage.removeItem(RESUME_KEY);
    } catch {}
    setDraft(emptyDraft());
    setSaleState(null);
    setMediaMeta([]);
    setStage("sale_state");
    setCaptureIndex(0);
    setOptionalIndex(0);
    setOptionalActive(false);
    setCaptureSessionId(null);
    sessionDeadRef.current = false;
    setBrandQuery("");
    setBrandId(null);
    setModelQuery("");
    setReferenceInput("");
    setNotesInput("");
    setPreflight({ state: "idle" });
    setHardFail(null);
    setRetakeNonce(0);
    setBadgeForfeited(false);
    publishRequestIdRef.current = "";
    // A new attempt gets a new identity, and the save path reopens. Nothing
    // from the prior watch — field or photo — can survive this.
    attemptIdRef.current = randomUUID();
    blockSaveRef.current = false;
    setPendingResume(null);
    setPublishError(null);
    setPublishHeld(false);
  }, []);

  /* ════════════════════ RENDER ════════════════════ */

  // ── List From Phone panels — before any stage renders. ──
  // Hand-back is a DEVICE-TRANSFER action, not global chrome (locked layout
  // ruling): it lives in a quiet handoff status row at the TOP of every
  // wizard screen — semantically tied to the handoff, always findable, never
  // fighting the step's real CTA or the Android bottom-control zone.
  const handBackChip =
    serverDraftId && serverPhase === "idle" && !batonAway && stage !== "published" ? (
      <div className="mb-6 flex min-h-[44px] items-center justify-between gap-3 border-b border-[var(--border-faint)] pb-2">
        <span className="text-[9px] uppercase tracking-[2.5px] text-[rgba(201,168,76,0.85)]">
          Editing on phone
        </span>
        <button
          type="button"
          onClick={handBackToDesktop}
          disabled={handingBack}
          className="flex min-h-[44px] items-center text-[10px] uppercase tracking-[2px] text-[var(--platinum)] transition-colors hover:text-[var(--gold)] disabled:opacity-60"
        >
          {handingBack ? "Saving…" : "Resume on desktop"}
        </button>
      </div>
    ) : null;

  if (serverPhase === "loading") {
    return (
      <Shell handBack={handBackChip}>
        <div className="py-24 text-center text-[11px] uppercase tracking-[2px] text-[var(--muted)]">
          Opening your listing…
        </div>
      </Shell>
    );
  }

  if (serverPhase === "gone") {
    return (
      <Shell handBack={handBackChip}>
        <div className="py-16 text-center">
          <h1 className="font-display text-[22px] font-light text-[var(--platinum)]">
            Listing not available
          </h1>
          <p className="mx-auto mt-3 max-w-[300px] text-[13px] leading-[1.6] text-[var(--muted)]">
            This handoff is no longer active. Your work is safe — continue from
            the device where you started, or begin here fresh.
          </p>
          <Link
            href="/sell/mobile"
            className="mt-8 inline-block border border-[rgba(255,255,255,0.28)] px-5 py-3 text-[11px] uppercase tracking-[1.5px] text-[var(--platinum-dim)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--platinum)]"
          >
            Start a new listing
          </Link>
        </div>
      </Shell>
    );
  }

  if (batonAway) {
    return (
      <Shell handBack={handBackChip}>
        <div className="py-16 text-center">
          <div className="text-[11px] uppercase tracking-[3px] text-[rgba(201,168,76,0.85)]">
            List from Phone
          </div>
          <h1 className="mt-3 font-display text-[22px] font-light text-[var(--platinum)]">
            {batonAway === "handed_back" ? "Back on your desktop" : "Editing moved to your desktop"}
          </h1>
          <p className="mx-auto mt-3 max-w-[300px] text-[13px] leading-[1.6] text-[var(--muted)]">
            {batonAway === "handed_back"
              ? "Everything you did here is saved. Pick the listing up on your desktop — this phone is now read-only."
              : "Your desktop resumed this listing. Everything saved here travelled with it — this phone is now read-only."}
          </p>
        </div>
      </Shell>
    );
  }

  /* ── Resume gate — shown before anything else when a prior unpublished
     draft exists. The seller chooses; nothing is silently inherited. ── */
  if (pendingResume) {
    const brand = pendingResume.draft?.brand?.trim();
    const model = pendingResume.draft?.model?.trim();
    const label = [brand, model].filter(Boolean).join(" ");
    return (
      <Shell handBack={handBackChip}>
        <div className="mb-2 text-[11px] uppercase tracking-[3px] text-[rgba(201,168,76,0.85)]">
          List from Phone
        </div>
        <h1 className="mb-3 font-display text-[24px] font-light leading-[1.3] text-[var(--platinum)]">
          You have an unfinished listing
        </h1>
        <p className="mb-8 font-display text-[14px] font-light italic leading-[1.7] text-[#8A8F9E]">
          {label
            ? `A draft for ${label} is still in progress on this device. `
            : "A draft is still in progress on this device. "}
          Pick up where you left off, or start a new listing.
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => resumeSaved(pendingResume)}
            className="fw-btn-primary w-full text-center"
          >
            {label ? `Resume ${label}` : "Resume this listing"}
          </button>
          <button
            type="button"
            onClick={startOver}
            className="w-full border border-[rgba(255,255,255,0.28)] px-4 py-4 text-center text-[12px] uppercase tracking-[1.5px] text-[var(--platinum-dim)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--platinum)]"
          >
            Start a new listing
          </button>
        </div>
        <p className="mt-8 font-display text-[11px] font-light italic leading-[1.7] text-[#6B7080]">
          Starting new clears the previous watch entirely — its photos and
          details won&apos;t carry over.
        </p>
      </Shell>
    );
  }

  /* ── Screen 0 — sale-state declaration ── */
  if (stage === "sale_state") {
    return (
      <Shell handBack={handBackChip}>
        <div className="mb-2 text-[11px] uppercase tracking-[3px] text-[rgba(201,168,76,0.85)]">
          List from Phone
        </div>
        <h1 className="mb-8 font-display text-[24px] font-light leading-[1.3] text-[var(--platinum)]">
          How is the watch being sold?
        </h1>
        <div className="grid grid-cols-2 gap-3">
          {SALE_STATE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setSaleState(opt.value);
                setDraft((d) => ({ ...d, hasBracelet: opt.value === "bracelet" }));
                setStage("identity");
              }}
              className={`border px-4 py-5 text-center text-[12px] tracking-[0.5px] transition-colors ${
                saleState === opt.value
                  ? "border-[var(--gold)] text-[var(--gold)]"
                  : "border-[rgba(255,255,255,0.28)] text-[var(--platinum-dim)] hover:border-[var(--border-gold)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-8 font-display text-[12px] font-light italic leading-[1.7] text-[#8A8F9E]">
          Your answer shapes the photo sequence. Every listing includes a full-length shot.
        </p>
        {draft.brand && (
          <button
            type="button"
            onClick={startOver}
            className="mt-10 w-full border border-[rgba(255,255,255,0.28)] px-4 py-3 text-center text-[11px] uppercase tracking-[1.5px] text-[var(--platinum-dim)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--platinum)]"
          >
            Start over from scratch
          </button>
        )}
      </Shell>
    );
  }

  /* ── Screen 1 — identity ── */
  if (stage === "identity") {
    return (
      <Shell handBack={handBackChip}>
        <StepCrumb label="Identity" />
        <h1 className="mb-7 font-display text-[24px] font-light text-[var(--platinum)]">
          The watch, in four answers.
        </h1>

        {/* Brand — Vault typeahead */}
        <Field label="Brand">
          <input
            type="text"
            value={brandQuery}
            onChange={(e) => {
              setBrandQuery(e.target.value);
              setBrandId(null);
              setDraft((d) => ({ ...d, brand: e.target.value, customBrandFlag: true }));
            }}
            placeholder="Start typing — 3 letters"
            className="fw-input placeholder:text-[var(--slate)]"
          />
          {brandSuggestions.length > 0 && brandId === null && (
            <div className="mt-1 border border-[var(--border-subtle)] bg-[var(--surface)]">
              {brandSuggestions.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setBrandQuery(b.name);
                    setBrandId(b.id);
                    setDraft((d) => ({ ...d, brand: b.name, customBrandFlag: false }));
                  }}
                  className="block w-full px-3 py-2.5 text-left text-[13px] text-[var(--platinum-dim)] transition-colors hover:bg-[var(--hover-wash)]"
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}
        </Field>

        {/* Model — cascades from brand */}
        <Field label="Model">
          <input
            type="text"
            value={modelQuery}
            onChange={(e) => {
              setModelQuery(e.target.value);
              setDraft((d) => ({ ...d, model: e.target.value }));
            }}
            placeholder={brandId ? "Vault suggestions below" : "Model name"}
            className="fw-input placeholder:text-[var(--slate)]"
          />
          {brandId !== null && modelSuggestions.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2">
              {modelSuggestions.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setModelQuery(m);
                    setDraft((d) => ({ ...d, model: m }));
                  }}
                  className={`border px-3 py-1.5 text-[11px] transition-colors ${
                    draft.model === m
                      ? "border-[var(--gold)] text-[var(--gold)]"
                      : "border-[rgba(255,255,255,0.28)] text-[var(--slate)] hover:text-[var(--platinum-dim)]"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </Field>

        {/* Condition — one-tap */}
        <Field label="Condition">
          <div className="flex flex-wrap gap-2">
            {CONDITIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, condition: c }))}
                className={`border px-4 py-2 text-[11px] tracking-[0.5px] transition-colors ${
                  draft.condition === c
                    ? "border-[var(--gold)] text-[var(--gold)]"
                    : "border-[rgba(255,255,255,0.28)] text-[var(--slate)] hover:text-[var(--platinum-dim)]"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>

        {/* Asking price — amount and currency adjacent (approved Design Gate).
            Editing either value clears the deliberate confirmation below. */}
        <Field label="Asking Price">
          <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-2.5">
            <input
              type="text"
              inputMode="decimal"
              value={draft.askingPrice}
              onChange={(e) =>
                setDraft((d) => ({ ...d, askingPrice: e.target.value, askingConfirmed: false }))
              }
              placeholder="8500"
              className="fw-input placeholder:text-[var(--slate)]"
            />
            <select
              aria-label="Asking price currency"
              value={isSupportedCurrency(draft.askingCurrency) ? draft.askingCurrency : RECOMMENDED_CURRENCY}
              onChange={(e) =>
                setDraft((d) => ({ ...d, askingCurrency: e.target.value, askingConfirmed: false }))
              }
              className="fw-input [&>option]:bg-[#141821] [&>option]:text-[#E8E4DC]"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </select>
          </div>

          {hasStoredPref === false && draft.askingCurrency === RECOMMENDED_CURRENCY && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--gold-subtle)]">
              <span className="border border-[var(--border-gold)] px-1.5 py-0.5 text-[8px] uppercase tracking-[1.2px]">
                Recommended
              </span>
              <span>USD is suggested because no preference is set.</span>
            </div>
          )}

          {draft.askingPrice.trim() !== "" && (
            <div className="mt-3 border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-3">
              {askingParse.ok ? (
                <div className="text-[12px] leading-[1.5] text-[var(--platinum-dim)]">
                  <strong className="font-medium text-[var(--platinum)]">
                    {formatMoney(askingParse.amount, askingParse.currency)} {askingParse.currency}
                  </strong>
                  <br />
                  Offers for this listing will use {askingParse.currency}.
                </div>
              ) : (
                <div className="text-[12px] leading-[1.5] italic text-[var(--gold-subtle)]">
                  {askingParse.message}
                </div>
              )}
              <button
                type="button"
                disabled={!askingParse.ok}
                onClick={() => setDraft((d) => ({ ...d, askingConfirmed: true }))}
                className={`mt-3 w-full border px-3.5 py-2.5 text-[10px] uppercase tracking-[1.5px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  draft.askingConfirmed
                    ? "border-[rgba(76,175,125,0.5)] text-[#7bc49c]"
                    : "border-[var(--gold)] text-[var(--gold)]"
                }`}
              >
                {draft.askingConfirmed
                  ? `${draft.askingCurrency} confirmed`
                  : `Use ${isSupportedCurrency(draft.askingCurrency) ? draft.askingCurrency : RECOMMENDED_CURRENCY}`}
              </button>
            </div>
          )}
          <p className="mt-2 text-[10px] leading-[1.5] text-[var(--slate)]">
            No conversion is performed. Choose the currency in which this watch is actually being offered.
          </p>
        </Field>

        {/* Curation preflight — advisory, gentle, before the camera */}
        {preflight.state === "notice" && (
          <div className="mb-6 border border-[var(--border-gold)] px-4 py-4">
            <div className="mb-2 text-[11px] uppercase tracking-[2px] text-[rgba(201,168,76,0.85)]">
              Before the camera opens
            </div>
            <p className="mb-4 font-display text-[13px] font-light italic leading-[1.7] text-[#8A8F9E]">
              {preflight.reasoning ||
                "This watch may sit outside FairWatchTrade's curation focus. You can continue — curation reviews every listing before it goes live."}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setPreflight({ state: "idle" });
                  startCapture();
                }}
                className="border border-[rgba(255,255,255,0.28)] px-4 py-2 text-[10px] uppercase tracking-[2px] text-[var(--platinum-dim)]"
              >
                Continue anyway
              </button>
              <button
                type="button"
                onClick={() => setPreflight({ state: "idle" })}
                className="px-2 py-2 text-[10px] uppercase tracking-[2px] text-[#8A8F9E]"
              >
                Adjust details
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={!identityComplete || preflight.state === "running"}
          onClick={continueFromIdentity}
          className="fw-btn-primary flex w-full items-center justify-center gap-2 disabled:opacity-40"
        >
          {preflight.state === "running" ? (
            <>
              <WatchSpinner size={16} /> Checking the Vault…
            </>
          ) : (
            "Continue to Camera →"
          )}
        </button>
        <BackLink onClick={() => setStage("sale_state")} />
      </Shell>
    );
  }

  /* ── Screens 2–7 — the guided capture run ── */
  if (stage === "capture" && saleState && captureSteps.length > 0) {
    // Clamped: an impossible index renders the last valid step — the draft
    // is never crashed and no state is set during render.
    const step = captureSteps[Math.min(captureIndex, captureSteps.length - 1)];
    return (
      <>
        {hardFail && (
          <div
            className="fixed left-0 right-0 top-0 z-[80] bg-[rgba(13,15,20,0.94)] px-6 py-4 text-center backdrop-blur-sm"
            style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
          >
            <div className="mb-1 text-[11px] uppercase tracking-[2px] text-[rgba(201,168,76,0.85)]">
              One more try
            </div>
            <div className="font-display text-[13px] font-light italic leading-[1.6] text-[var(--platinum-dim)]">
              {hardFail}
            </div>
          </div>
        )}
        <CameraCapture
          key={`m-${step.category}-${retakeNonce}`}
          category={step.category}
          overlay={step.overlay}
          instruction={step.instruction}
          subInstruction={step.subInstruction}
          stepLabel={`${captureIndex + 1} of ${captureSteps.length}`}
          onConfirmed={handleConfirmed(step)}
          onCancel={
            step.skippable
              ? skipCurrent
              : captureIndex === 0
                ? () => setStage("identity")
                : () => setCaptureIndex((i) => Math.max(0, i - 1))
          }
          // Camera-free escape hatch. Back either skips forward or steps to a
          // previous shot — both reopen a camera, so on a systemic failure
          // (e.g. insecure context) they can't escape. onExit → identity
          // guarantees no dead-end and never auto-reopens the camera; draft +
          // captured work persist in state/localStorage. The ONE case where
          // Back already lands camera-free is the first, non-skippable step
          // (Back → identity), so no separate exit is needed there.
          onExit={
            captureIndex === 0 && !step.skippable
              ? undefined
              : () => setStage("identity")
          }
        />
      </>
    );
  }

  /* ── Optional offers (Movement closeup, Wrist) — Add or Skip ── */
  if (stage === "optional") {
    const step = optionalSteps[Math.min(optionalIndex, optionalSteps.length - 1)];
    return (
      <Shell handBack={handBackChip}>
        <StepCrumb label="Optional" />
        <h1 className="mb-3 font-display text-[24px] font-light text-[var(--platinum)]">
          {step.instruction}
        </h1>
        <p className="mb-10 font-display text-[13px] font-light italic leading-[1.7] text-[#8A8F9E]">
          {step.subInstruction}
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setStage("capture_optional")}
            className="fw-btn-primary w-full"
          >
            Add this photo
          </button>
          <button
            type="button"
            onClick={skipCurrent}
            className="border border-[rgba(255,255,255,0.28)] px-4 py-3 text-[10px] uppercase tracking-[2px] text-[var(--slate)] transition-colors hover:text-[var(--platinum-dim)]"
          >
            Skip
          </button>
        </div>
        <BackLink onClick={backFromOptional} />
      </Shell>
    );
  }

  if (stage === "capture_optional") {
    const step = optionalSteps[Math.min(optionalIndex, optionalSteps.length - 1)];
    return (
      <>
        {hardFail && (
          <div
            className="fixed left-0 right-0 top-0 z-[80] bg-[rgba(13,15,20,0.94)] px-6 py-4 text-center backdrop-blur-sm"
            style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
          >
            <div className="mb-1 text-[11px] uppercase tracking-[2px] text-[rgba(201,168,76,0.85)]">
              One more try
            </div>
            <div className="font-display text-[13px] font-light italic leading-[1.6] text-[var(--platinum-dim)]">
              {hardFail}
            </div>
          </div>
        )}
        <CameraCapture
          key={`o-${step.category}-${optionalIndex}-${retakeNonce}`}
          category={step.category}
          overlay={step.overlay}
          instruction={step.instruction}
          subInstruction={step.subInstruction}
          onConfirmed={handleConfirmed(step)}
          // Back returns to the (camera-free) Add/Skip offer, so a camera
          // failure on an optional shot never traps the seller — no separate
          // exit needed here.
          onCancel={() => setStage("optional")}
        />
      </>
    );
  }

  /* ── Screen 8 — reference & notes ── */
  if (stage === "reference") {
    return (
      <Shell handBack={handBackChip}>
        <StepCrumb label="Reference" />
        <h1 className="mb-2 font-display text-[24px] font-light text-[var(--platinum)]">
          Reference number
        </h1>
        <p className="mb-7 font-display text-[12px] font-light italic leading-[1.7] text-[#8A8F9E]">
          A missing reference is honest. A wrong one is a betrayal. Never guess.
        </p>
        <Field label="Reference">
          <input
            type="text"
            value={referenceInput}
            onChange={(e) => setReferenceInput(e.target.value)}
            placeholder="e.g. PFC267-1207100"
            className="fw-input placeholder:text-[var(--slate)]"
          />
          <div className="mt-2 flex gap-2">
            {["Can't find it", "Not visible"].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setReferenceInput("")}
                className="border border-[rgba(255,255,255,0.28)] px-3 py-1.5 text-[10px] tracking-[1px] text-[var(--slate)] transition-colors hover:text-[var(--platinum-dim)]"
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Notes / Provenance (optional)">
          <textarea
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value)}
            rows={3}
            placeholder="Service history, story, anything a collector should know."
            className="fw-input min-h-[80px] placeholder:text-[var(--slate)]"
          />
        </Field>
        <button
          type="button"
          onClick={() => setStage("review")}
          className="fw-btn-primary w-full"
        >
          Review the Listing →
        </button>
        <BackLink onClick={() => setStage("optional")} />
      </Shell>
    );
  }

  /* ── Screen 9 — review & publish ── */
  if (stage === "review") {
    /* Automatic hero, mirroring desktop Review and the buyer-facing detail
       page: first Dial photo, else the first photo. */
    /* Role order, not upload order — same shared resolver as desktop Review,
       the editor, and the published gallery. */
    const orderedPhotos = sortByPhotoRole(draft.photos, (p) => p.category);
    const mobileAutomaticHeroIndex = roleAutomaticHero(orderedPhotos, (p) => p.category);
    const mobilePresentation = sanitizePhotoPresentation(draft.photoPresentation);
    const mobileHeroIndex = resolveHeroIndex(
      orderedPhotos.map((p) => p.photo.pathname),
      mobilePresentation,
      mobileAutomaticHeroIndex
    );
    return (
      <Shell handBack={handBackChip}>
        <StepCrumb label="Review" />
        <h1 className="mb-6 font-display text-[24px] font-light text-[var(--platinum)]">
          {draft.brand} {draft.model}
        </h1>

        <div className="mb-6 grid grid-cols-3 gap-2">
          {orderedPhotos.map((p, i) => (
            <div
              key={`${p.photo.pathname}-${i}`}
              /* aspect-[4/3] (was h-[90px]) so the cell's shape is KNOWN and
                 a saved quarter-turn can compute its exact cover-scale — a
                 fixed height with fluid width made rotation coverage a guess
                 per device. ~Same rendered height at typical widths. */
              className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--ink-deep)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.photo.url}
                alt={p.category}
                /* Only the hero carries the seller's framing; the others stay
                   automatic, because a focal point chosen on the dial means
                   nothing on a clasp shot. */
                /* Every photo now carries its OWN framing — the seller may
                   centre the clasp without touching the dial. */
                style={presentationStyleFor(mobilePresentation, p.photo.pathname, 4 / 3)}
                className="h-full w-full"
              />
            </div>
          ))}
        </div>

        {/* Same quiet utility, same component, same placement rule: directly
            beneath the thumbnails and before the listing facts. */}
        {draft.photos.length > 0 && (
          <PhotoPresentationEntry
            buttonRef={presentationEntryRef}
            onOpen={() => setPresentationOpen(true)}
            className="mb-6"
          />
        )}

        {presentationOpen && (
          <PhotoPresentationEditor
            photos={draft.photos}
            value={mobilePresentation}
            automaticHeroPathname={
              orderedPhotos[mobileAutomaticHeroIndex]?.photo.pathname ?? null
            }
            onSave={(photoPresentation) => setDraft((d) => ({ ...d, photoPresentation }))}
            onClose={() => {
              setPresentationOpen(false);
              presentationEntryRef.current?.focus();
            }}
          />
        )}

        <dl className="mb-8 space-y-2">
          <SummaryRow k="Condition" v={draft.condition || "—"} />
          {/* ONE coherent price expression — the formatter already carries the
              currency in the amount (US$8,500), so appending the ISO code said
              the same fact twice. Matches the desktop Review correction. */}
          <SummaryRow
            k="Asking"
            v={askingParse.ok ? formatMoney(askingParse.amount, askingParse.currency) : "—"}
          />
          <SummaryRow k="Reference" v={referenceInput || "Not provided"} />
          <SummaryRow
            k="Sold as"
            v={SALE_STATE_OPTIONS.find((o) => o.value === saleState)?.label ?? "—"}
          />
          <SummaryRow k="Photos" v={String(draft.photos.length)} />
        </dl>

        {publishError && (
          <div className="mb-4 border border-[rgba(220,80,80,0.3)] bg-[rgba(220,80,80,0.08)] px-3 py-2 text-[13px] text-[var(--danger)]">
            {publishError}
          </div>
        )}

        <button
          type="button"
          onClick={publish}
          disabled={publishing}
          className="fw-btn-primary flex w-full items-center justify-center gap-2 disabled:opacity-60"
        >
          {publishing ? (
            <>
              <WatchSpinner size={16} /> Submitting…
            </>
          ) : (
            "Submit for Review"
          )}
        </button>
        <p className="mt-4 text-center font-display text-[11px] font-light italic text-[#8A8F9E]">
          Double-taps are safe — publishing is idempotent.
        </p>
        <BackLink onClick={() => setStage("reference")} />
      </Shell>
    );
  }

  /* ── Published ── */
  return (
    <Shell handBack={handBackChip}>
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        {publishHeld ? (
          /* v2.24 · held at publish — the locked held-state copy. Truthful,
             never accusatory, no machinery named. */
          <>
            <div className="mb-3 font-display text-[26px] font-light text-[var(--platinum)]">
              Saved.
            </div>
            <p className="mb-10 max-w-[300px] font-display text-[14px] font-light italic leading-[1.7] text-[#8A8F9E]">
              Your photographs are receiving an additional authenticity review.
              Your listing is saved and is not visible to buyers yet. Most
              reviews require no action from the seller.
            </p>
          </>
        ) : (
          <>
            {/* Submission is not publication — "Listed." and "in the
                marketplace" were true only under the old direct-publish
                behavior. The listing now waits for review. */}
            <div className="mb-3 font-display text-[26px] font-light text-[var(--platinum)]">
              Submitted.
            </div>
            <p className="mb-10 max-w-[300px] font-display text-[14px] font-light italic leading-[1.7] text-[#8A8F9E]">
              Your watch is submitted for review and is not visible to buyers
              yet. It appears in the marketplace once review is complete.
            </p>
          </>
        )}
        <div className="flex flex-col gap-3">
          <Link
            href="/account"
            className="fw-btn-primary px-8 text-center"
          >
            Seller Workspace →
          </Link>
          <button
            type="button"
            onClick={startOver}
            className="text-[10px] uppercase tracking-[2px] text-[#8A8F9E] transition-colors hover:text-[var(--slate)]"
          >
            List another watch
          </button>
        </div>
      </div>
    </Shell>
  );
}

/* ── Small shared pieces ── */

function Shell({
  children,
  handBack = null,
}: {
  children: React.ReactNode;
  // List From Phone — the fixed "Resume on desktop" chip, present on every
  // screen while this device holds a redeemed handoff baton (null otherwise).
  handBack?: React.ReactNode;
}) {
  return (
    <main className="min-h-[100dvh] bg-[var(--ink)]">
      {/* The handoff status row renders ABOVE the screen content — a transfer
          action tied to the handoff, never floating chrome (layout ruling). */}
      <div className="mx-auto w-full max-w-[420px] px-6 py-8">
        {handBack}
        {children}
      </div>
    </main>
  );
}

function StepCrumb({ label }: { label: string }) {
  return (
    <div className="mb-2 text-[11px] uppercase tracking-[3px] text-[rgba(201,168,76,0.85)]">
      List from Phone · {label}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-2 text-[9px] uppercase tracking-[2.5px] text-[#8A8F9E]">{label}</div>
      {children}
    </div>
  );
}

function SummaryRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[var(--border-faint)] pb-2">
      <dt className="text-[9px] uppercase tracking-[2px] text-[#8A8F9E]">{k}</dt>
      <dd className="text-[13px] text-[var(--platinum-dim)]">{v}</dd>
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-6 block text-[9px] uppercase tracking-[2px] text-[var(--slate)] transition-colors hover:text-[var(--platinum)]"
    >
      ← Back
    </button>
  );
}
