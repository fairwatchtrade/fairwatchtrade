"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  type RedactionStroke,
  type RedactionTool,
  REDACTION_BRUSH_RADIUS,
  MAX_REDACTION_STROKES,
  MAX_STROKE_POINTS,
  makeBlurredCopy,
  paintStrokes,
} from "@/lib/photoRedaction";

/* ════════════════════════════════════════════════════════════════════════
   PHOTO REDACTION EDITOR — hide private details, nothing else

   Blur brush · whiteout marker · undo · clear. That is the whole tool set,
   by product law: this is a privacy utility, not an image editor.

   The stage always shows the ORIGINAL photograph with the current strokes
   painted live, so editing never compounds — reopening a redacted photo
   resumes from the original plus its marks, and blur is never blurred.

   Pointer-driven (mouse, pen, finger); controls sized for touch.
   ════════════════════════════════════════════════════════════════════════ */

export default function PhotoRedactionEditor({
  photoUrl,
  categoryLabel,
  initialStrokes,
  onApply,
  onClose,
}: {
  /** URL of the ORIGINAL (unredacted) photograph. */
  photoUrl: string;
  categoryLabel: string;
  initialStrokes: RedactionStroke[];
  /** Commits the stroke list (empty list = remove all redaction and restore
      the original). Resolves true on success; false leaves the editor open
      with its work intact. */
  onApply: (strokes: RedactionStroke[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const titleId = useId();
  const [tool, setTool] = useState<RedactionTool>("blur");
  const [strokes, setStrokes] = useState<RedactionStroke[]>(initialStrokes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const liveStrokeRef = useRef<RedactionStroke | null>(null);
  const blurredRef = useRef<HTMLCanvasElement | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(strokes) !== JSON.stringify(initialStrokes),
    [strokes, initialStrokes]
  );

  /* Load the ORIGINAL image once. Everything renders from this. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(photoUrl);
        if (!res.ok) throw new Error(String(res.status));
        const bmp = await createImageBitmap(await res.blob());
        if (!cancelled) setBitmap(bmp);
      } catch {
        if (!cancelled) setError("The photograph could not be loaded for redaction.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  /* Repaint: original → live strokes. The blurred paint copy is derived once
     per bitmap at the canvas's own resolution. */
  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (!blurredRef.current || blurredRef.current.width !== w || blurredRef.current.height !== h) {
      const scaled = document.createElement("canvas");
      scaled.width = w;
      scaled.height = h;
      scaled.getContext("2d")?.drawImage(bitmap, 0, 0, w, h);
      blurredRef.current = makeBlurredCopy(scaled, w, h);
    }
    const all = liveStrokeRef.current ? [...strokes, liveStrokeRef.current] : strokes;
    paintStrokes(ctx, all, blurredRef.current, w, h);
  }, [bitmap, strokes]);

  /* Size the canvas to its on-screen box (contain-fit inside the frame),
     backed at devicePixelRatio for a crisp preview. */
  const layout = useCallback(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas || !bitmap) return;
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    if (fw <= 0 || fh <= 0) return;
    const scale = Math.min(fw / bitmap.width, fh / bitmap.height);
    const cw = Math.max(1, Math.round(bitmap.width * scale));
    const ch = Math.max(1, Math.round(bitmap.height * scale));
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    blurredRef.current = null; // resolution changed — rebuild the paint copy
    repaint();
  }, [bitmap, repaint]);

  useEffect(() => {
    layout();
    const frame = frameRef.current;
    if (!frame) return;
    const ro = new ResizeObserver(layout);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [layout]);

  useEffect(() => {
    repaint();
  }, [repaint]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  /* ── Drawing ── */
  function normPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (busy || !bitmap || strokes.length >= MAX_REDACTION_STROKES) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    liveStrokeRef.current = {
      tool,
      radius: REDACTION_BRUSH_RADIUS,
      points: [normPoint(e)],
    };
    repaint();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const live = liveStrokeRef.current;
    if (!live || live.points.length >= MAX_STROKE_POINTS) return;
    const p = normPoint(e);
    const last = live.points[live.points.length - 1];
    // Point thinning: skip sub-2px moves so a slow drag stays bounded.
    const rect = e.currentTarget.getBoundingClientRect();
    if (
      Math.abs(p.x - last.x) * rect.width < 2 &&
      Math.abs(p.y - last.y) * rect.height < 2
    ) {
      return;
    }
    live.points.push(p);
    repaint();
  }

  function endStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    const live = liveStrokeRef.current;
    if (!live) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    liveStrokeRef.current = null;
    setStrokes((prev) => [...prev, live]);
  }

  async function apply() {
    setBusy(true);
    setError(null);
    const ok = await onApply(strokes);
    setBusy(false);
    if (ok) onClose();
    else setError("Saving the redacted photograph failed. Your marks are still here — try again.");
  }

  const btn =
    "border text-[11px] uppercase tracking-[0.1em] transition disabled:opacity-40 " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#ead37e]";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[rgba(3,4,6,0.78)] p-3 sm:p-8">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            if (!busy) onClose();
          }
        }}
        className="relative w-full max-w-[760px] border border-[#39352a] bg-[#0d0f14] shadow-[0_28px_72px_rgba(0,0,0,0.72)] outline-none"
      >
        <div className="flex items-start justify-between gap-5 border-b border-[var(--border-subtle)] bg-[#101217] px-4 py-3.5">
          <div>
            <div className="text-[8px] uppercase tracking-[0.16em] text-[var(--gold)]">
              Privacy redaction
            </div>
            <h3 id={titleId} className="mt-1 font-display text-[19px] font-light text-[var(--platinum)]">
              Hide private details — {categoryLabel}
            </h3>
          </div>
          <div className="text-right text-[11px] leading-[1.4] text-[var(--muted)]">
            Original preserved privately
            <br />
            Buyers see the redacted photo
          </div>
        </div>

        <div className="p-4">
          {/* Tool row — big enough for a thumb. */}
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {(
              [
                ["blur", "Blur brush"],
                ["white", "Whiteout marker"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={tool === k}
                disabled={busy}
                onClick={() => setTool(k)}
                className={`${btn} h-[38px] px-3.5 ${
                  tool === k
                    ? "border-[#78683a] bg-[#17140e] text-[#dec66f]"
                    : "border-[#373a42] bg-[#101217] text-[#aaaeb8]"
                }`}
              >
                {label}
              </button>
            ))}
            <span className="mx-1 hidden w-px self-stretch bg-[#292c33] sm:block" aria-hidden="true" />
            <button
              type="button"
              disabled={busy || strokes.length === 0}
              onClick={() => setStrokes((prev) => prev.slice(0, -1))}
              className={`${btn} h-[38px] border-[#363940] bg-[#101217] px-3.5 text-[#c8c4b9]`}
            >
              Undo
            </button>
            <button
              type="button"
              disabled={busy || strokes.length === 0}
              onClick={() => setStrokes([])}
              className={`${btn} h-[38px] border-[#363940] bg-[#101217] px-3.5 text-[#c8c4b9]`}
            >
              Clear redactions
            </button>
          </div>

          {/* Stage — the original with live marks. Draw with mouse or finger. */}
          <div
            ref={frameRef}
            className="flex h-[52vh] min-h-[260px] items-center justify-center border border-[#353840] bg-[#090a0d]"
          >
            {bitmap ? (
              <canvas
                ref={canvasRef}
                role="img"
                aria-label="Photograph with redaction marks. Draw over private details to hide them."
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endStroke}
                onPointerCancel={endStroke}
                className="cursor-crosshair touch-none select-none"
              />
            ) : (
              <div className="text-[12px] text-[var(--muted)]">
                {error ?? "Loading photograph…"}
              </div>
            )}
          </div>

          <p className="mt-1.5 min-h-[16px] text-[10px] leading-[1.5] text-[var(--muted)]">
            {error && bitmap ? (
              <span className="text-[var(--danger)]">{error}</span>
            ) : (
              "Draw over anything private — an address, a name, a serial. Blur softens it; whiteout covers it. The original photograph is kept privately and is never altered."
            )}
          </p>

          <div className="mt-2.5 grid grid-cols-[1fr_1.6fr] gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className={`${btn} h-[40px] border-[#363940] bg-[#101217] px-2 text-[#c8c4b9]`}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !dirty}
              onClick={() => void apply()}
              className={`${btn} h-[40px] border-[#d1b862] bg-[#c3a951] px-2 text-[#17140d]`}
            >
              {busy
                ? "Applying…"
                : strokes.length === 0
                  ? "Remove redaction"
                  : "Apply redaction"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
