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
import CameraCapture, { type ConfirmedCapture } from "@/components/CameraCapture";
import { type OverlayVariant } from "@/components/AlignmentOverlay";
import WatchSpinner from "@/components/WatchSpinner";

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
      overlay: "side",
      privacyReview: false, // GPT ruling: no serial exposure risk on the crown side
    },
    {
      category: "Non-Crown Side",
      included: true,
      skippable: false,
      instruction: "Rotate to the opposite side",
      subInstruction: "The side without the crown.",
      overlay: "side",
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
      included: true, // mandatory for all four sale states — GPT ruling
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
    body: JSON.stringify({
      brand: d.brand,
      reference: d.reference,
      year: d.year,
      condition: d.condition,
      askingPrice: d.askingPrice,
      provenanceNote: d.provenanceNote,
    }),
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

/* ── Device token — localStorage per the GPT ruling ── */
const DEVICE_TOKEN_KEY = "fw_device_token";
const RESUME_KEY = "fw_mobile_wizard_v2_2";

function getDeviceToken(): string {
  try {
    const existing = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(DEVICE_TOKEN_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID(); // storage blocked → session still works, badge may not persist
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

const CONDITIONS: Condition[] = ["Unworn", "Mint", "Excellent", "Good", "Fair"];

const SALE_STATE_OPTIONS: { value: SaleState; label: string }[] = [
  { value: "bracelet", label: "Bracelet" },
  { value: "strap", label: "Strap" },
  { value: "head_only", label: "Head only" },
  { value: "other", label: "Other / mixed" },
];

export default function MobileWizard({ brands }: { brands: VaultBrandLite[] }) {
  const supabase = useMemo(() => createClient(), []);

  const [stage, setStage] = useState<Stage>("sale_state");
  const [saleState, setSaleState] = useState<SaleState | null>(null);
  const [draft, setDraft] = useState<ListingDraft>(() => emptyDraft());
  const [mediaMeta, setMediaMeta] = useState<MediaMeta[]>([]);

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

  /* ── Resume — the draft outlives refreshes and crashes ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RESUME_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && saved.draft && saved.stage && saved.stage !== "published") {
        setDraft(saved.draft);
        setSaleState(saved.saleState ?? null);
        setMediaMeta(Array.isArray(saved.mediaMeta) ? saved.mediaMeta : []);
        setStage(saved.stage);
        setCaptureIndex(saved.captureIndex ?? 0);
        setOptionalIndex(saved.optionalIndex ?? 0);
        setOptionalActive(saved.optionalActive ?? false);
        setCaptureSessionId(saved.captureSessionId ?? null);
        setBadgeForfeited(saved.badgeForfeited === true);
        setReferenceInput(saved.draft.reference ?? "");
        setNotesInput(saved.draft.provenanceNote ?? "");
        setBrandQuery(saved.draft.brand ?? "");
        setModelQuery(saved.draft.model ?? "");
      }
    } catch {
      /* a bad resume blob is discarded, never fatal */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stage === "published") {
      try {
        localStorage.removeItem(RESUME_KEY);
      } catch {}
      return;
    }
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
        })
      );
    } catch {}
  }, [draft, saleState, mediaMeta, stage, captureIndex, optionalIndex, optionalActive, captureSessionId, badgeForfeited]);

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

  /* ── Identity completion + curation preflight (advisory, never a wall) ── */
  const identityComplete =
    draft.brand.trim() !== "" &&
    draft.model.trim() !== "" &&
    draft.condition !== "" &&
    draft.askingPrice.trim() !== "";

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
    if (!publishRequestIdRef.current) {
      publishRequestIdRef.current = crypto.randomUUID(); // stable across retries — that's the idempotency
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
          provenanceNote: finalDraft.provenanceNote,
          significanceScore: finalDraft.significanceScore,
          photos: finalDraft.photos,
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
      setPublishHeld(data?.status === "pending_review");
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
    setPublishError(null);
    setPublishHeld(false);
  }, []);

  /* ════════════════════ RENDER ════════════════════ */

  /* ── Screen 0 — sale-state declaration ── */
  if (stage === "sale_state") {
    return (
      <Shell>
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
                  : "border-[var(--border-mid)] text-[var(--platinum-dim)] hover:border-[var(--border-gold)]"
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
            className="mt-10 text-[9px] uppercase tracking-[2px] text-[#8A8F9E] transition-colors hover:text-[var(--slate)]"
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
      <Shell>
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
            className="fw-input border-b-[rgba(255,255,255,0.18)] placeholder:text-[var(--slate)]"
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
                  className="block w-full px-3 py-2.5 text-left text-[13px] text-[var(--platinum-dim)] transition-colors hover:bg-[rgba(255,255,255,0.03)]"
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
            className="fw-input border-b-[rgba(255,255,255,0.18)] placeholder:text-[var(--slate)]"
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
                      : "border-[var(--border-mid)] text-[var(--slate)] hover:text-[var(--platinum-dim)]"
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
                    : "border-[var(--border-mid)] text-[var(--slate)] hover:text-[var(--platinum-dim)]"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>

        {/* Asking price */}
        <Field label="Asking Price (USD)">
          <input
            type="text"
            inputMode="decimal"
            value={draft.askingPrice}
            onChange={(e) => setDraft((d) => ({ ...d, askingPrice: e.target.value }))}
            placeholder="8500"
            className="fw-input border-b-[rgba(255,255,255,0.18)] placeholder:text-[var(--slate)]"
          />
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
                className="border border-[var(--border-mid)] px-4 py-2 text-[10px] uppercase tracking-[2px] text-[var(--platinum-dim)]"
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
      <Shell>
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
            className="border border-[var(--border-mid)] px-4 py-3 text-[10px] uppercase tracking-[2px] text-[var(--slate)] transition-colors hover:text-[var(--platinum-dim)]"
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
      <Shell>
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
            className="fw-input border-b-[rgba(255,255,255,0.18)] placeholder:text-[var(--slate)]"
          />
          <div className="mt-2 flex gap-2">
            {["Can't find it", "Not visible"].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setReferenceInput("")}
                className="border border-[var(--border-mid)] px-3 py-1.5 text-[10px] tracking-[1px] text-[var(--slate)] transition-colors hover:text-[var(--platinum-dim)]"
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
            className="fw-input min-h-[80px] border-b-[rgba(255,255,255,0.18)] placeholder:text-[var(--slate)]"
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
    return (
      <Shell>
        <StepCrumb label="Review" />
        <h1 className="mb-6 font-display text-[24px] font-light text-[var(--platinum)]">
          {draft.brand} {draft.model}
        </h1>

        <div className="mb-6 grid grid-cols-3 gap-2">
          {draft.photos.map((p, i) => (
            <div
              key={`${p.photo.pathname}-${i}`}
              className="flex h-[90px] items-center justify-center overflow-hidden bg-[var(--ink-deep)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.photo.url} alt={p.category} className="h-full w-full object-cover" />
            </div>
          ))}
        </div>

        <dl className="mb-8 space-y-2">
          <SummaryRow k="Condition" v={draft.condition || "—"} />
          <SummaryRow k="Asking" v={draft.askingPrice ? `$${draft.askingPrice}` : "—"} />
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
              <WatchSpinner size={16} /> Publishing…
            </>
          ) : (
            "Publish Listing"
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
    <Shell>
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
            <div className="mb-3 font-display text-[26px] font-light text-[var(--platinum)]">
              Listed.
            </div>
            <p className="mb-10 max-w-[300px] font-display text-[14px] font-light italic leading-[1.7] text-[#8A8F9E]">
              Your watch is in the marketplace. Curation reviews every listing;
              you&apos;ll hear from us if anything needs attention.
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-[100dvh] bg-[var(--ink)]">
      <div className="mx-auto w-full max-w-[420px] px-6 py-8">{children}</div>
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
