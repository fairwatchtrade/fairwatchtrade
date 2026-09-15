"use client";

import { useEffect, useRef, useState } from "react";
import { CLOSING, REFUSALS_SECTION, ROOMS } from "@/lib/whatFairWatchTradeCanDo/content";
import styles from "./SignupEditorialRotator.module.css";

// Reuse the published words. Signup does not own a second copywriting surface.
const messages = [
  { id: "start", label: CLOSING.heading, eyebrow: "", heading: CLOSING.heading, body: CLOSING.body },
  ...ROOMS.map((room) => ({
    id: room.id, label: room.kicker, eyebrow: room.kicker, heading: room.heading, body: room.intro,
  })),
  { id: "limits", label: REFUSALS_SECTION.heading, eyebrow: REFUSALS_SECTION.eyebrow,
    heading: REFUSALS_SECTION.heading, body: REFUSALS_SECTION.lead },
];

const DWELL_MS = 9000;
const FADE_MS = 600;

export default function SignupEditorialRotator() {
  const [active, setActive] = useState(0);
  const area = useRef<HTMLElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const fills = useRef<(HTMLSpanElement | null)[]>([]);
  const clock = useRef({ active: 0, elapsed: 0, phase: "dwell", hovered: false, focused: false });

  function select(index: number) {
    clock.current.active = index;
    clock.current.elapsed = 0;
    clock.current.phase = "dwell";
    if (copy.current) copy.current.style.opacity = "1";
    fills.current.forEach((fill) => { if (fill) fill.style.transform = "scaleX(0)"; });
    setActive(index);
  }

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 1440px)");
    let frame = 0;
    let previous = 0;

    function restoreStatic() {
      clock.current.phase = "dwell";
      clock.current.elapsed = 0;
      if (copy.current) copy.current.style.opacity = "1";
      fills.current.forEach((fill) => { if (fill) fill.style.transform = "scaleX(0)"; });
    }

    function tick(now: number) {
      const delta = previous ? now - previous : 0;
      previous = now;
      const state = clock.current;
      // Finish an in-progress fade even when the pointer enters. Never strand
      // a reader on half-visible text. Hover/focus pause the readable dwell.
      const paused = state.phase === "dwell" && (state.hovered || state.focused);
      if (!reduced.matches && desktop.matches && !document.hidden && !paused) {
        state.elapsed += delta;
        if (state.phase === "dwell") {
          const fill = fills.current[state.active];
          if (fill) fill.style.transform = `scaleX(${Math.min(1, state.elapsed / DWELL_MS)})`;
          if (state.elapsed >= DWELL_MS) { state.phase = "out"; state.elapsed = 0; }
        } else if (state.phase === "out") {
          if (copy.current) copy.current.style.opacity = String(Math.max(0, 1 - state.elapsed / FADE_MS));
          if (state.elapsed >= FADE_MS) {
            state.active = (state.active + 1) % messages.length;
            state.phase = "in";
            state.elapsed = 0;
            fills.current.forEach((fill) => { if (fill) fill.style.transform = "scaleX(0)"; });
            setActive(state.active);
          }
        } else {
          if (copy.current) copy.current.style.opacity = String(Math.min(1, state.elapsed / FADE_MS));
          if (state.elapsed >= FADE_MS) { state.phase = "dwell"; state.elapsed = 0; }
        }
      }
      frame = requestAnimationFrame(tick);
    }

    // A background tab must not return with a whole hidden dwell accrued.
    const resetTimestamp = () => { previous = 0; };
    reduced.addEventListener("change", restoreStatic);
    desktop.addEventListener("change", resetTimestamp);
    document.addEventListener("visibilitychange", resetTimestamp);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      reduced.removeEventListener("change", restoreStatic);
      desktop.removeEventListener("change", resetTimestamp);
      document.removeEventListener("visibilitychange", resetTimestamp);
    };
  }, []);

  return (
    <aside
      ref={area}
      className={styles.rotator}
      aria-label="What FairWatchTrade can do"
      onMouseEnter={() => { clock.current.hovered = true; }}
      onMouseLeave={() => { clock.current.hovered = false; }}
      onFocusCapture={() => { clock.current.focused = true; }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) clock.current.focused = false;
      }}
    >
      <div ref={copy} className={styles.messages} aria-live="off">
        {messages.map((message, index) => (
          <div key={message.id} className={styles.message} aria-hidden={index !== active}
            style={{ visibility: index === active ? "visible" : "hidden" }}>
            <div className={styles.eyebrow}>{message.eyebrow}</div>
            <h2 className={`font-display ${styles.heading}`}>{message.heading}</h2>
            <p className={styles.body}>{message.body}</p>
          </div>
        ))}
      </div>
      <div className={styles.controls} role="group" aria-label="Editorial messages">
        {messages.map((message, index) => (
          <button key={message.id} type="button" className={styles.control}
            aria-label={`Show ${message.label} message`} aria-pressed={index === active}
            onClick={() => select(index)}>
            <span className={styles.dash} aria-hidden="true">
              <span ref={(element) => { fills.current[index] = element; }} className={styles.fill} />
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
