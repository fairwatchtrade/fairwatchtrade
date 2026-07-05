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

type Phase = "starting" | "live" | "preview" | "uploading" | "denied" | "failed";

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
}: {
  category: string;
  overlay: OverlayVariant;
  instruction: string;
  subInstruction?: string;
  /** "3 of 6" — number only, no progress bar. */
  stepLabel?: string;
  onConfirmed: (capture: ConfirmedCapture) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const dimsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  const [phase, setPhase] = useState<Phase>("starting");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [framing, setFraming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const framingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Camera lifecycle ── */
  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await openRearCamera();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {}); // iOS: playsInline + muted below
        }
        setPhase("live");
      } catch (e) {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "NotAllowedError") {
          setPhase("denied");
        } else {
          setErrorMsg("The camera couldn't start on this device.");
          setPhase("failed");
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (framingTimer.current) clearTimeout(framingTimer.current);
    };
    // Camera opens once per mounted step; category change remounts via key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /* ── Denied / failed — never strand the seller ── */
  if (phase === "denied" || phase === "failed") {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-8 text-center">
        <div className="mb-3 font-display text-[20px] font-light text-[var(--platinum)]">
          {phase === "denied" ? "Camera access is off." : "The camera couldn't start."}
        </div>
        <p className="mb-8 max-w-[300px] font-display text-[14px] font-light italic leading-[1.7] text-[var(--muted)]">
          {phase === "denied"
            ? "Allow camera access in your browser settings to continue — or finish this listing from the desktop flow. Your draft is safe either way."
            : errorMsg ?? "Your draft is safe. You can finish this listing from the desktop flow."}
        </p>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="border border-[var(--border-mid)] px-5 py-2.5 text-[10px] uppercase tracking-[2px] text-[var(--slate)] transition-colors hover:text-[var(--platinum)]"
          >
            ← Back
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-[#000]">
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
