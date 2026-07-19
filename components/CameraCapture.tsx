"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadPhoto } from "@/lib/storage";
import AlignmentOverlay, { type OverlayVariant } from "@/components/AlignmentOverlay";

/* Minimal self-contained spinner — no external component dependencies. */
function Spinner({ size = 26 }: { size?: number }) {
  return (
    <span
      aria-label="Loading"
      className="inline-block animate-spin rounded-full border-2 border-[var(--gold-subtle)] border-t-transparent"
      style={{ width: size, height: size }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────
   CAMERA CAPTURE — components/CameraCapture.tsx   (v2.2)

   The whole product in one gesture:
     Open → frame loosely → tap shutter → preview → Use Photo → next.
   Everything else in this file is support for that line. No zoom, no
   filters, no gallery (locked for v2.2 — gallery ambiguity breaks badge
   semantics; desktop flow exists for gallery sellers).

   Camera: rear-facing via getUserMedia, with the iOS fallback chain —
   { exact: 'environment' } → 'environment' → any camera. Permission denied
   never strands the seller: plain-language message, draft survives, the
   desktop flow is offered.

   Upload: ONLY confirmed photos upload ("Use Photo"). Retakes are discarded
   locally and never leave the device. A failed upload keeps the preview and
   offers retry — the shot is never lost to a network blip. SHA-256 of the
   captured blob is computed client-side and handed up as originalHash
   (metadata for duplicate/retry identity — the server's independent
   recompute is the authoritative trust layer, per the GPT ruling).

   Composition seam: this component owns camera → blob → confirm → upload,
   then reports { url, pathname, originalHash, width, height } via
   onConfirmed. The wizard (Phase 3) owns listing context, so IT writes
   listing_media (listing_id, sequence_index, capture_session_id) and
   advances the step. One truth, one owner per concern.

   PFC274 = 62 — the evaluate route is untouched.
   ──────────────────────────────────────────────────────────────────────── */

export type ConfirmedCapture = {
  url: string;
  pathname: string;
  originalHash: string;
  width: number;
  height: number;
};

type Phase = "starting" | "live" | "preview" | "uploading" | "error";

/* ── Failure classification ──────────────────────────────────────────────
   Camera startup fails by classified cause where the browser exposes one,
   and every classified failure carries a truthful next action. We never
   claim a device lacks a camera when the runtime only proves an insecure
   context or an unavailable API (the plain LAN-HTTP case). ── */
type FailCause =
  | "insecure" // insecure context / mediaDevices API unavailable (HTTP LAN)
  | "denied" // permission blocked
  | "no_device" // no camera present / usable
  | "busy" // camera in use or unreadable
  | "unsupported" // browser/device can't expose getUserMedia at all
  | "interrupted" // a live stream ended mid-capture (revocation / lost device)
  | "unknown"; // classified fallthrough

/* Thrown before getUserMedia when the camera API isn't reachable — this is
   the exact failure seen on http://192.168.x.x, where navigator.mediaDevices
   is undefined and no permission prompt ever appears. */
class CameraStartError extends Error {
  cause: FailCause;
  constructor(cause: FailCause) {
    super(cause);
    this.name = "CameraStartError";
    this.cause = cause;
  }
}

function cameraApiAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

/* Map a getUserMedia rejection to a cause. The insecure/unsupported split is
   decided upstream (before the call); this only classifies live rejections. */
function classifyCameraError(e: unknown): FailCause {
  if (e instanceof CameraStartError) return e.cause;
  if (e instanceof DOMException) {
    switch (e.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "denied";
      case "NotFoundError":
      case "DevicesNotFoundError":
      case "OverconstrainedError":
      case "ConstraintNotSatisfiedError":
        // Even the unconstrained `video: true` attempt failed to find a track.
        return "no_device";
      case "NotReadableError":
      case "TrackStartError":
      case "AbortError":
        return "busy";
      case "TypeError":
        return "unsupported";
    }
  }
  // A bare TypeError (e.g. reading getUserMedia off an undefined mediaDevices)
  // means the API shape wasn't there — an environment problem, not a device.
  if (e instanceof TypeError) return "unsupported";
  return "unknown";
}

async function sha256Hex(blob: Blob): Promise<string> {
  try {
    const buf = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return ""; // metadata only — never block a capture on hashing
  }
}

/* iOS fallback chain — some iOS versions honor only `exact`. */
async function openRearCamera(): Promise<MediaStream> {
  // Secure-context / API guard — the LAN-HTTP dead-end. mediaDevices is
  // absent on insecure origins, so distinguish "insecure site" (recoverable
  // by using https) from a genuinely unsupported browser.
  if (!cameraApiAvailable()) {
    const insecure =
      typeof window !== "undefined" && window.isSecureContext === false;
    throw new CameraStartError(insecure ? "insecure" : "unsupported");
  }
  const attempts: MediaStreamConstraints[] = [
    { video: { facingMode: { exact: "environment" } }, audio: false },
    { video: { facingMode: "environment" }, audio: false },
    { video: true, audio: false },
  ];
  let lastErr: unknown = null;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      lastErr = e;
      // Permission denial is final — don't keep prompting.
      if (e instanceof DOMException && e.name === "NotAllowedError") throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Camera unavailable");
}

export default function CameraCapture({
  category,
  overlay,
  instruction,
  subInstruction,
  stepLabel,
  onConfirmed,
  onCancel,
  onExit,
}: {
  category: string;
  overlay: OverlayVariant;
  instruction: string;
  subInstruction?: string;
  /** "3 of 6" — number only, no progress bar. */
  stepLabel?: string;
  onConfirmed: (capture: ConfirmedCapture) => void | Promise<void>;
  /** Step-level back — reflected as "Back" in live + failure states. */
  onCancel?: () => void;
  /** Always-present safe exit out of capture — the seller is never trapped
   *  on a failure screen. Draft survival is guaranteed by the wizard. */
  onExit?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const dimsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  const [phase, setPhase] = useState<Phase>("starting");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [framing, setFraming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [failCause, setFailCause] = useState<FailCause | null>(null);
  // Retry re-attempts camera start on explicit tap only — the camera never
  // reopens on its own after the seller has deliberately left a failure.
  const [startToken, setStartToken] = useState(0);
  const framingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Full-screen lock — the capture surface owns the whole viewport, so
        the page behind it (header, metals ticker, footer) must not scroll
        into view underneath the fixed overlay while capture is active. ── */
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  /* ── Camera lifecycle ── */
  useEffect(() => {
    let cancelled = false;

    // Involuntary end of the LIVE feed — permission revoked mid-stream, the
    // device lost, or another app seizing the camera. Without this the video
    // silently freezes on its last frame while phase stays "live" (a dead
    // shutter and no message). Our OWN track.stop() (cleanup / Retry / remount)
    // also fires "ended", but cleanup sets `cancelled` before stopping, so
    // those are ignored here — only an involuntary end reaches the classified
    // failure UI, on whatever step it happens.
    async function onTrackEnded() {
      if (cancelled) return;
      // Best-effort: if the browser exposes camera permission state and it now
      // reads "denied", this was a revocation → show the exact denial screen.
      // Otherwise fall back to the truthful "interrupted" cause.
      let cause: FailCause = "interrupted";
      try {
        const status = await navigator.permissions?.query({
          name: "camera" as unknown as PermissionName,
        });
        if (status?.state === "denied") cause = "denied";
      } catch {
        /* Permissions API absent (e.g. Safari) — keep "interrupted". */
      }
      if (cancelled) return; // re-check after the await
      setFailCause(cause);
      setPhase("error");
    }

    async function start() {
      try {
        const stream = await openRearCamera();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        stream
          .getVideoTracks()
          .forEach((t) => t.addEventListener("ended", onTrackEnded));
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {}); // iOS: playsInline + muted below
        }
        setPhase("live");
      } catch (e) {
        if (cancelled) return;
        setFailCause(classifyCameraError(e));
        setPhase("error");
      }
    }

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => {
        t.removeEventListener("ended", onTrackEnded);
        t.stop();
      });
      streamRef.current = null;
      if (framingTimer.current) clearTimeout(framingTimer.current);
    };
    // Re-runs only on an explicit Retry (startToken bump); category change
    // remounts the whole component via key.
  }, [startToken]);

  /* ── Retry — re-attempt startup after a classified failure ── */
  const retryStart = useCallback(() => {
    setErrorMsg(null);
    setFailCause(null);
    setPhase("starting");
    setStartToken((n) => n + 1);
  }, []);

  // Revoke preview object URLs when replaced/unmounted.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  /* ── Framing detection — overlay recedes while the seller adjusts ── */
  const onFrameTouch = useCallback(() => {
    setFraming(true);
    if (framingTimer.current) clearTimeout(framingTimer.current);
    framingTimer.current = setTimeout(() => setFraming(false), 600);
  }, []);

  /* ── Shutter ── */
  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || phase !== "live") return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        blobRef.current = blob;
        dimsRef.current = { width: w, height: h };
        setPreviewUrl(URL.createObjectURL(blob));
        setPhase("preview");
      },
      "image/jpeg",
      0.92
    );
  }, [phase]);

  /* ── Retake — discard locally; the shot never leaves the device ── */
  const retake = useCallback(() => {
    blobRef.current = null;
    setPreviewUrl(null);
    setErrorMsg(null);
    setPhase("live");
  }, []);

  /* ── Use Photo — the only path that uploads ── */
  const usePhoto = useCallback(async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setPhase("uploading");
    setErrorMsg(null);
    try {
      const originalHash = await sha256Hex(blob);
      const file = new File([blob], `${category.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.jpg`, {
        type: "image/jpeg",
      });
      const uploaded = await uploadPhoto(file);
      await onConfirmed({
        url: uploaded.url,
        pathname: uploaded.pathname,
        originalHash,
        width: dimsRef.current.width,
        height: dimsRef.current.height,
      });
      // Parent advances the step (and typically unmounts / re-keys us).
    } catch {
      // Draft survival: the shot is kept, the seller just retries.
      setErrorMsg("Upload didn't go through. Check your connection and try again.");
      setPhase("preview");
    }
  }, [category, onConfirmed]);

  /* ── Classified failure — never strand the seller ──────────────────────
       Every branch keeps the draft safe (the wizard mirrors it to storage on
       every change) and offers only actions this product actually supports:
       there is no gallery/upload fallback in v2.2, so failures point to
       Retry, another device, the secure site, or a safe exit — never a
       phantom "upload instead". ── */
  if (phase === "error") {
    const cause: FailCause = failCause ?? "unknown";
    const copy: Record<FailCause, { title: string; body: string; retry: boolean }> = {
      insecure: {
        title: "Camera needs the secure site.",
        body: "Live capture only works on the secure FairWatchTrade site (https). This looks like a local or insecure address, so the browser is blocking the camera — no permission prompt will appear here. Your draft is saved; reopen FairWatchTrade over https to finish the photos.",
        retry: false, // same insecure origin — retrying can't succeed
      },
      denied: {
        title: "Camera access is off.",
        body: "Camera permission is blocked for this site. Allow it in your browser settings, then retry. Your draft is safe either way.",
        retry: true,
      },
      no_device: {
        title: "No camera found.",
        body: "We couldn't find a camera to use on this device. Try again, or continue on a device with a working camera — your draft is safe.",
        retry: true,
      },
      busy: {
        title: "The camera is busy.",
        body: "Another app may be using the camera. Close it, then retry. Your draft is safe.",
        retry: true,
      },
      unsupported: {
        title: "Camera isn't supported here.",
        body: "This browser or device can't open the camera for capture. Try a different browser, or finish this listing from the desktop flow. Your draft is safe.",
        retry: true,
      },
      interrupted: {
        title: "The camera stopped.",
        body: "The live view was interrupted — camera permission may have been switched off, or another app took the camera. Retry, or step back — your draft is safe.",
        retry: true,
      },
      unknown: {
        title: "The camera couldn't start.",
        body:
          errorMsg ??
          "Something interrupted the camera. Retry, or step back — your draft is safe either way.",
        retry: true,
      },
    };
    const c = copy[cause];
    return (
      <div
        className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-[#000] px-8 text-center"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {stepLabel && (
          <div className="mb-4 text-[9px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
            {stepLabel}
          </div>
        )}
        <div className="mb-3 font-display text-[20px] font-light text-[var(--platinum)]">
          {c.title}
        </div>
        <p className="mb-8 max-w-[320px] font-display text-[14px] font-light italic leading-[1.7] text-[var(--muted)]">
          {c.body}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {c.retry && (
            <button
              type="button"
              onClick={retryStart}
              className="bg-[var(--gold)] px-6 py-2.5 text-[10px] uppercase tracking-[2px] text-[var(--ink)] transition-opacity hover:opacity-90"
            >
              Retry
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="border border-[var(--border-mid)] px-5 py-2.5 text-[10px] uppercase tracking-[2px] text-[var(--slate)] transition-colors hover:text-[var(--platinum)]"
            >
              ← Back
            </button>
          )}
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="px-4 py-2.5 text-[10px] uppercase tracking-[2px] text-[var(--ghost)] transition-colors hover:text-[var(--slate)]"
            >
              Leave — draft saved
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-[#000]"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Instruction band */}
      <div className="z-10 px-6 pb-3 pt-5 text-center">
        {stepLabel && (
          <div className="mb-1 text-[9px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
            {stepLabel}
          </div>
        )}
        <div className="font-display text-[18px] font-light text-[var(--platinum)]">
          {instruction}
        </div>
        {subInstruction && (
          <div className="mt-1 font-display text-[12px] font-light italic text-[var(--muted)]">
            {subInstruction}
          </div>
        )}
      </div>

      {/* Viewfinder / preview */}
      <div
        className="relative flex-1 overflow-hidden"
        onPointerDown={onFrameTouch}
        onPointerMove={onFrameTouch}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
          style={{ display: phase === "live" || phase === "starting" ? "block" : "none" }}
        />

        {(phase === "live" || phase === "starting") && (
          <AlignmentOverlay variant={overlay} framing={framing} />
        )}

        {phase === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner size={26} />
          </div>
        )}

        {(phase === "preview" || phase === "uploading") && previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-contain bg-[#000]"
          />
        )}

        {phase === "uploading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Spinner size={26} />
          </div>
        )}
      </div>

      {/* Error line — plain language, shot preserved */}
      {errorMsg && phase === "preview" && (
        <div className="z-10 px-6 py-2 text-center text-[12px] text-[var(--danger)]">
          {errorMsg}
        </div>
      )}

      {/* Controls */}
      <div className="z-10 flex items-center justify-center gap-10 px-6 pb-9 pt-4">
        {phase === "live" && (
          <>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="w-16 text-[10px] uppercase tracking-[2px] text-[var(--ghost)] transition-colors hover:text-[var(--slate)]"
              >
                Back
              </button>
            )}
            {/* The shutter — large, thumb-friendly, center-bottom. */}
            <button
              type="button"
              onClick={capture}
              aria-label={`Capture ${category}`}
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-[var(--platinum)]"
            >
              <span className="block h-[56px] w-[56px] rounded-full bg-[var(--platinum)] transition-transform active:scale-90" />
            </button>
            {/* Spacer keeps the shutter optically centered when Back exists. */}
            {onCancel && <span className="w-16" aria-hidden="true" />}
          </>
        )}

        {(phase === "preview" || phase === "uploading") && (
          <>
            <button
              type="button"
              onClick={retake}
              disabled={phase === "uploading"}
              className="border border-[var(--border-mid)] px-6 py-3 text-[10px] uppercase tracking-[2px] text-[var(--slate)] transition-colors hover:text-[var(--platinum)] disabled:opacity-40"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={usePhoto}
              disabled={phase === "uploading"}
              className="bg-[var(--gold)] px-7 py-3 text-[10px] uppercase tracking-[2px] text-[var(--ink)] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {phase === "uploading" ? "Uploading…" : "Use Photo"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
