"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FIT,
  distanceBetween,
  hasInspectableDetail,
  midpointOf,
  containRect,
  nativeDetailCeiling,
  panBy,
  pinchScale,
  reconcile,
  wheelScaleFactor,
  zoomAtPoint,
  type Point,
  type Transform,
} from "@/lib/media/inspectionZoom";

/* ════════════════════════════════════════════════════════════════════════
   INSPECTION VIEWPORT — the photograph, and only the photograph

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "The image element is the interaction surface."

   It is not, and that was the whole reason this needed its own component.
   The inspection stage is shared with the previous/next arrows, so an
   interaction bound to the stage would swallow wheel events over the
   controls, and one bound to the bare <img> has no stable rectangle to clip
   against once the image is transformed. This element is the boundary: it
   is exactly the Fit rectangle, it clips, it owns hit testing, and the
   Ctrl+wheel refusal reaches precisely this far and no further.

   ── WHY A NATIVE LISTENER AND NOT onWheel ──────────────────────────────
   React's synthetic wheel handler cannot reliably preventDefault() a
   browser-zoom gesture in the installed event system, so the refusal is
   attached natively with { passive: false } to this element alone. Not
   window, not document, not the modal: a document-level listener would take
   Ctrl+wheel away from the whole page, which is a browser accessibility
   feature the collector may be relying on to read the rest of the room.

   Ordinary wheel — no Ctrl — is never touched. Scrolling past a modal is
   not this component's business.
   ════════════════════════════════════════════════════════════════════════ */

type Props = {
  src: string;
  alt: string;
  /** Natural pixel size of the loaded source, or zeroes until it is known.
      The ceiling cannot be computed without it, and guessing one would mean
      offering zoom the file cannot honour. */
  natural: { w: number; h: number };
  aspect: number;
  onZoomStateChange?: (state: { scale: number; maxScale: number }) => void;
  /** Imperative handle for the accessible controls, which live in the
      viewer header rather than on top of the watch. */
  controlsRef?: React.MutableRefObject<InspectionControls | null>;
};

export type InspectionControls = {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
};

const STEP = 1.35;

export default function InspectionViewport({
  src,
  alt,
  natural,
  aspect,
  onZoomStateChange,
  controlsRef,
}: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [stored, setTransform] = useState<Transform>(FIT);
  const [hintDismissed, setHintDismissed] = useState(false);

  /* Measure the STAGE, then compute the Fit rectangle in JS.
     Two CSS approaches failed here and both failed silently — see
     containRect. Observing the stage rather than this element also avoids
     the obvious trap of measuring a box whose size we are about to set from
     that measurement. clientWidth/clientHeight, never
     getBoundingClientRect(): the rect reports the TRANSFORMED size, which
     would shrink the ceiling as the collector zoomed in. */
  const [stage, setStage] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = viewportRef.current?.parentElement;
    if (!el) return;
    const measure = () => setStage({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useMemo(
    () => containRect(stage, aspect, natural.w > 0 ? { width: natural.w, height: natural.h } : undefined),
    [stage, aspect, natural.w, natural.h]
  );
  /* Memoised because it is a dependency of the wheel listener effect: a new
     object identity every render would tear down and re-add that native
     listener on every frame of a zoom. */
  const viewport = useMemo(() => ({ width: fit.width, height: fit.height }), [fit.width, fit.height]);

  /* The ceiling is derived from the SAME rectangle the photograph is drawn
     in, so the two can never disagree about what Fit means. */
  const maxScale = nativeDetailCeiling(
    { width: natural.w, height: natural.h },
    viewport
  );
  const canInspect = hasInspectableDetail(maxScale);

  /* Geometry moved under a zoomed photograph — a resize, an orientation
     flip — and the ceiling may now be LOWER than the scale in use.
     Reconciled at RENDER rather than in an effect, deliberately: an effect
     would paint one frame of over-scaled interpolation before correcting
     it, and "briefly showing detail the source does not have" is the exact
     thing the ceiling exists to prevent. Derived, so it can never be stale.
     `stored` remains the raw intent; `transform` is what is true now. */
  const transform = viewport.width > 0 ? reconcile(stored, viewport, maxScale) : stored;

  useEffect(() => {
    onZoomStateChange?.({ scale: transform.scale, maxScale });
  }, [transform.scale, maxScale, onZoomStateChange]);

  const pointerIn = useCallback((clientX: number, clientY: number): Point => {
    const rect = viewportRef.current?.getBoundingClientRect();
    /* getBoundingClientRect IS correct here — the pointer arrives in screen
       coordinates and needs the element's on-screen origin. It is only the
       untransformed SIZE that it must never be asked for. */
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }, []);

  /* ── The Ctrl+wheel boundary ─────────────────────────────────────────── */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // ordinary scrolling is none of our business
      /* Prevented even at the ceiling. Letting the gesture through once the
         image stops growing would hand the next notch to the browser, and
         the page would lurch mid-inspection — the collector's hand has not
         changed, so the behaviour must not either. */
      e.preventDefault();
      if (!canInspect) return;
      const pointer = pointerIn(e.clientX, e.clientY);
      setTransform((t) =>
        zoomAtPoint(t, pointer, t.scale * wheelScaleFactor(e.deltaY, e.deltaMode), viewport, maxScale)
      );
      setHintDismissed(true);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [viewport, maxScale, canInspect, pointerIn]);

  /* ── Pointer: one finger pans, two pinch ─────────────────────────────── */
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const lastPan = useRef<Point | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: distanceBetween(a, b), scale: transform.scale };
      lastPan.current = null;
    } else if (transform.scale > 1) {
      lastPan.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const centroid = pointerIn(midpointOf(a, b).x, midpointOf(a, b).y);
      const next = pinchScale(pinch.current.distance, distanceBetween(a, b), pinch.current.scale);
      /* The centroid is the anchor, exactly as the pointer is on desktop:
         the detail between the collector's fingers is the one being
         inspected. */
      setTransform((t) => zoomAtPoint(t, centroid, next, viewport, maxScale));
      setHintDismissed(true);
      return;
    }

    if (lastPan.current && transform.scale > 1) {
      const delta = { x: e.clientX - lastPan.current.x, y: e.clientY - lastPan.current.y };
      lastPan.current = { x: e.clientX, y: e.clientY };
      setTransform((t) => panBy(t, delta, viewport));
    }
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) lastPan.current = null;
  };

  /* ── Keyboard, arbitrated locally ────────────────────────────────────── */
  const applyStep = useCallback(
    (factor: number) => {
      const centre = { x: viewport.width / 2, y: viewport.height / 2 };
      setTransform((t) => zoomAtPoint(t, centre, t.scale * factor, viewport, maxScale));
      setHintDismissed(true);
    },
    [viewport, maxScale]
  );

  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = {
      zoomIn: () => applyStep(STEP),
      zoomOut: () => applyStep(1 / STEP),
      fit: () => setTransform(FIT),
    };
    return () => {
      controlsRef.current = null;
    };
  }, [controlsRef, applyStep]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    /* ARBITRATION. The viewer's document-level handler moves between
       photographs on Left/Right. While this surface is focused AND zoomed,
       those keys pan instead — and the event is stopped here so the
       document handler never also fires. Unzoomed, the keys are left alone
       and photo navigation behaves exactly as it always did. */
    const panning = transform.scale > 1;
    const step = 48;
    const pans: Record<string, Point> = {
      ArrowLeft: { x: step, y: 0 },
      ArrowRight: { x: -step, y: 0 },
      ArrowUp: { x: 0, y: step },
      ArrowDown: { x: 0, y: -step },
    };
    if (panning && pans[e.key]) {
      e.preventDefault();
      e.stopPropagation();
      setTransform((t) => panBy(t, pans[e.key], viewport));
      return;
    }
    if (e.key === "+" || e.key === "=") { e.preventDefault(); applyStep(STEP); }
    else if (e.key === "-" || e.key === "_") { e.preventDefault(); applyStep(1 / STEP); }
    else if (e.key === "0") { e.preventDefault(); setTransform(FIT); }
  };

  const zoomed = transform.scale > 1;

  return (
    <div
      ref={viewportRef}
      /* THE BOUNDARY. Exactly the Fit rectangle, capped at the source's own
         pixels, clipping what it cannot contain. Container-query units give
         the true contain rectangle — the same technique the resting hero
         already uses — so the viewport IS the photograph rather than a box
         the photograph sits inside with dead margins that would accept
         gestures meant for the arrows. */
      className="relative overflow-hidden"
      style={{
        /* Explicit pixels from containRect. The box IS the photograph's
           Fit rectangle, so the interaction boundary and the visible
           photograph are the same rectangle by construction rather than by
           CSS coincidence. */
        width: fit.width > 0 ? `${fit.width}px` : undefined,
        height: fit.height > 0 ? `${fit.height}px` : undefined,
        /* Only here. A page-wide touch-action would take pinch-to-zoom away
           from the whole site, which is an accessibility feature and not
           ours to spend. */
        touchAction: canInspect ? "none" : undefined,
        cursor: zoomed ? "grab" : canInspect ? "zoom-in" : "default",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="img"
      aria-label={
        zoomed ? `${alt} — zoomed ${transform.scale.toFixed(1)}×` : alt
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="h-full w-full select-none object-contain"
        style={{
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          transformOrigin: "0 0",
          /* No transition. Direct manipulation must track the hand exactly;
             an eased transform makes the photograph lag behind the gesture
             and feel like software animating rather than an object moving. */
          willChange: zoomed ? "transform" : undefined,
        }}
      />

      {canInspect && !hintDismissed && !zoomed && (
        /* Transient, and only where there is genuinely more detail to reach.
           --platinum-dim on a translucent slate plate: this is functional
           text telling a collector a capability exists, so it takes the
           readable floor rather than being dressed as decoration. */
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-[rgba(232,235,239,0.92)] px-2.5 py-1 text-[11px] tracking-[0.4px] text-[var(--platinum-dim)] shadow-sm"
        >
          Ctrl + scroll to zoom · drag to inspect
        </div>
      )}
    </div>
  );
}
