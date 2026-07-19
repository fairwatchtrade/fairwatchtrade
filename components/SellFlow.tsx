"use client";

import { useEffect, useRef, useState, type RefObject, type CSSProperties } from "react";
import {
  emptyDraft,
  toScoringState,
  type Condition,
  type ListingDraft,
  type ListingPhoto,
} from "@/lib/listing";
import { scoreCompleteness, type PhotoCategory } from "@/lib/scoring";
import ListingScoreMeter from "@/components/ListingScoreMeter";
import PhotoUpload, {
  type UploadedPhotoMeta,
  type PhotoUploadHandle,
} from "@/components/PhotoUpload";
import DetailsStep from "@/components/DetailsStep";
import DescriptionStep from "@/components/DescriptionStep";
import ReviewStep from "@/components/ReviewStep";
import WatchBlueprint, { type Layer } from "@/components/WatchBlueprint";
import WatchSpinner from "@/components/WatchSpinner";
import BrandCombobox from "@/components/BrandCombobox";
import ModelCombobox from "@/components/ModelCombobox";

const STEPS = ["Curation", "Photos", "Details", "Description", "Review"] as const;
const CONDITIONS: Condition[] = ["Unworn", "Mint", "Excellent", "Good", "Fair"];
const ROMAN = ["I", "II", "III", "IV", "V"] as const;

/* Native <option> elements don't reliably inherit the form's dark styling — when
   a <select> opens, the browser renders the option list with OS/browser defaults
   (often a white menu), which made our light --platinum option text invisible
   (white-on-white). Explicit hex bg + text on each <option> fixes it across
   browsers. CSS variables are ignored for <option> in some browsers, so we use
   concrete hex values that match --surface / --platinum. */
const OPTION_STYLE: CSSProperties = {
  backgroundColor: "#141821",
  color: "#E8E4DC",
};

/* ── Curation call ───────────────────────────────────────────────────────
   /api/evaluate confirmed working (returns score + decision). Defensive reads
   in case field names differ. */
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

function mandatoryDone(d: ListingDraft): boolean {
  return (
    scoreCompleteness(toScoringState(d)).items.find((i) => i.key === "mandatory")
      ?.done ?? false
  );
}

/* The six DetailsStep chapters, keyed by their `data-chapter` attribute values.
   Drives which WatchBlueprint layer lights on the Details step. Previously
   imported as `WatchChapter` from a ChapterWatch component that never shipped;
   defined locally now so SellFlow owns its own type. */
type WatchChapter =
  | "movement"
  | "case"
  | "dial"
  | "wearing"
  | "complications"
  | "provenance";

/* ── WatchBlueprint wiring (v1.89) ───────────────────────────────────────
   Maps the two data sources (tagged photos, filled chapters) onto the plate's
   named layers. Note: GPT flagged these tables for eventual extraction to
   lib/watchBlueprintMappings.ts once a second surface needs them — logged as a
   future refactor; for v1.89 they live here. */

// PhotoCategory strings → WatchBlueprint Layer names. Verified against
// PhotoCategory in lib/scoring.ts and CATEGORY_OPTIONS in PhotoUpload.tsx.
// "Wrist shot" and "Other" have no layer equivalent — omitted intentionally.
// "Box" and "Papers/Warranty" both collapse to "provenance" — the title-block
// layer, the record of the watch's life.
const PHOTO_LAYER_MAP: Partial<Record<string, Layer>> = {
  Dial: "dial",
  Caseback: "case",
  "Clasp/Pin Buckle": "clasp",
  // "Side/Lugs" retired in v2.0j → split into the two side shots below.
  // Layer names verified against the Layer union in WatchBlueprint.tsx:
  // there is no "side" layer — the non-crown profile lights "lugs" (as the
  // old Side/Lugs did), and the crown side lights the dedicated "crown" layer.
  "Non-Crown Side": "lugs",
  "Crown Side": "crown",
  "Movement (closeup)": "movement",
  "Bracelet/Strap": "strap",
  "Full watch, strap/bracelet extended": "strap",
  "Papers/Warranty": "provenance",
  Box: "provenance",
};

// DetailsStep data-chapter values → the WatchBlueprint Layer REGIONS each
// chapter governs — the `active` prop on the Details step. A chapter owns more
// than one anatomy region: "The Dial & Hands" (chapterKey "dial") holds the
// dial, the hands, and the crown-present toggle; "The Wearing" holds the strap,
// its clasp, and the lugs that bridge it to the case. Lighting the whole region
// set keeps the active highlight honest to what the chapter actually covers.
// Verified against the chapterKey values in DetailsStep.tsx.
const CHAPTER_LAYERS: Partial<Record<string, Layer[]>> = {
  movement: ["movement"],
  case: ["case"],
  dial: ["dial", "hands", "crown"],
  wearing: ["strap", "clasp", "lugs"],
  complications: ["complications"],
  provenance: ["provenance"],
};

// The six exterior body layers the six primary photos map onto. When all six
// are lit — "Required photos 6/6" — the required watch is fully documented and
// reads as whole. Note these are LAYERS, derived purely from tagged photos; the
// required-photo COUNTING in PhotoUpload is untouched.
const SIX_BODY_LAYERS: Layer[] = ["dial", "case", "crown", "lugs", "clasp", "strap"];

// The four layers no single primary photo maps to. Left unmapped, full plate
// completion was visually impossible from the required run — the audited
// defect. Resolved deliberately: `hands` are inseparable from the dial shot, so
// they pair onto Dial below; the remaining three (movement/complications/
// provenance) complete at the 6/6 milestone, when the required watch is whole.
// movement and provenance still light individually via their own optional
// photos (see PHOTO_LAYER_MAP) before the milestone.
const MILESTONE_LAYERS: Layer[] = ["hands", "movement", "complications", "provenance"];

// All layers with a tagged photo — the `completed` prop on the Photos step.
// A Set dedupes (several photos of the same category = one layer), so duplicate
// tags of a category stay stable and removing/reassigning a photo simply drops
// its layer on the next derivation. Cumulative model preserved; only the
// hands-pairing and the 6/6 milestone are added.
function deriveCompletedLayersFromPhotos(photos: ListingDraft["photos"]): Layer[] {
  const layers = new Set<Layer>();
  for (const p of photos ?? []) {
    const layer = PHOTO_LAYER_MAP[p.category as string];
    if (layer) layers.add(layer);
    // The dial shot always shows the hands — a deliberate structural pairing,
    // not a separate photo requirement.
    if (layer === "dial") layers.add("hands");
  }
  // Required photos 6/6 → complete the required watch: the four otherwise
  // unmapped layers light so the plate can actually reach a whole state.
  if (SIX_BODY_LAYERS.every((l) => layers.has(l))) {
    for (const l of MILESTONE_LAYERS) layers.add(l);
  }
  return [...layers];
}

// The layer mapped from the most recently tagged photo — the `active` prop on
// the Photos step. Walks newest → oldest, skipping untagged/unmapped photos.
function deriveActiveLayerFromPhotos(
  photos: ListingDraft["photos"]
): Layer | undefined {
  const list = photos ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const layer = PHOTO_LAYER_MAP[list[i].category as string];
    if (layer) return layer;
  }
  return undefined;
}

// Layers whose chapter is MEANINGFULLY completed — the `completed` prop on the
// Details step. Cumulative: it only grows as chapters fill in. Completion keys
// on each chapter's primary (non-optional) field so a lone optional detail —
// jewels, power reserve, a bracelet-size note, a crown toggle — can't falsely
// light a whole chapter. Missing optional data is never penalized: it simply
// doesn't gate completion. When a chapter IS complete, its full anatomy region
// set lights (mirroring CHAPTER_LAYERS), including the previously-dark hands,
// crown, clasp, and lugs. Field names verified against ListingDetails in
// DetailsStep.tsx (nested under draft.details; provenanceNote is top-level).
function deriveCompletedLayersFromDraft(draft: ListingDraft): Layer[] {
  const d = draft.details;
  const layers = new Set<Layer>();

  // I · The Watch Itself — movement type is the one required field; calibre,
  // frequency, jewels, power reserve are all optional and can't complete alone.
  if (d.movementType?.trim()) layers.add("movement");

  // II · The Case — anchored on the two defining specs (size + material), not a
  // single incidental entry.
  if (d.caseMaterial?.trim() && d.caseSizeMm?.trim()) layers.add("case");

  // III · The Dial & Hands — the dial color is the chapter's substance; it
  // lights dial + hands together. The crown-present toggle lights the crown
  // region on its own, but never completes the chapter by itself.
  if (d.dialColorType?.trim()) {
    layers.add("dial");
    layers.add("hands");
  }
  if (d.crownPresent) layers.add("crown");

  // IV · The Wearing — closure type is the substantive field; strap size and
  // the original-strap toggle are optional and can't complete alone. A complete
  // wearing chapter lights strap + clasp + the lugs that bridge to the case.
  if (d.closureType?.trim()) {
    layers.add("strap");
    layers.add("clasp");
    layers.add("lugs");
  }

  // V · Complications — at least one selected complication is real engagement.
  if (d.complications?.length) layers.add("complications");

  // VI · Provenance & Papers — a written note, included items, or service
  // history. `documentation` defaults to "Watch Only", so it is deliberately
  // excluded — its default must not auto-complete the chapter.
  if (
    draft.provenanceNote?.trim() ||
    d.includedWithWatch?.length ||
    d.serviceHistory?.length
  )
    layers.add("provenance");

  return [...layers];
}


export default function SellFlow() {
  const [draft, setDraft] = useState<ListingDraft>(emptyDraft);
  const [step, setStep] = useState(0);
  // v2.4y — reference advisory lives at flow level so an unresolved
  // advisory can repeat at Review without touching ReviewStep itself.
  const [refAdvisory, setRefAdvisory] = useState<RefAdvisory | null>(null);
  // v2.24 · The Aubrey Check — desktop correlation identity. One synthetic
  // capture-session id (desk_ prefix, never collides with mobile wizard
  // sessions) and one idempotency key per wizard session, so desktop photos
  // get honest listing_media correlation and desktop publishes get the same
  // retry safety mobile has. Lazy init: stable for the life of the flow.
  const [desktopIds] = useState(() => ({
    captureSessionId: "desk_" + crypto.randomUUID(),
    publishRequestId: crypto.randomUUID(),
  }));

  function patch(p: Partial<ListingDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  const photoRef = useRef<PhotoUploadHandle | null>(null);

  // The companion watch's lit region, driven purely by which chapter is in view
  // on Step 3 (Details). No buttons — the scroll position is the input.
  const [activeChapter, setActiveChapter] = useState<WatchChapter>("movement");

  // Watch the six chapter <section>s (id="chapter-*") while on the Details step.
  // Three inputs drive the active chapter, so it's correct on ANY viewport:
  //   1. IntersectionObserver — as a chapter crosses ~40% into the viewport.
  //   2. An initial calc on mount — so the top chapters light on load without
  //      waiting for a scroll (on a tall monitor several chapters are already in
  //      view at load, and the observer alone leaves them dark until you scroll).
  //   3. Focus — tabbing/clicking into any field lights that field's chapter,
  //      so the watch tracks where you're actually working even without scrolling.
  useEffect(() => {
    if (step !== 2) return;
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-chapter]")
    );
    if (sections.length === 0) return;

    // Pick the chapter nearest the upper third of the viewport right now.
    const pickByPosition = () => {
      const anchor = window.innerHeight * 0.4;
      let best: string | null = null;
      let bestDist = Infinity;
      for (const s of sections) {
        const top = s.getBoundingClientRect().top;
        const dist = Math.abs(top - anchor);
        // Prefer sections at or above the anchor line (already "entered").
        if (top <= anchor + 40 && dist < bestDist) {
          bestDist = dist;
          best = s.dataset.chapter ?? null;
        }
      }
      // Fallback: nothing above the line yet → the first section.
      if (!best) best = sections[0].dataset.chapter ?? null;
      if (best) setActiveChapter(best as WatchChapter);
    };

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const key = (e.target as HTMLElement).dataset.chapter ?? "";
          if (e.isIntersecting) visible.set(key, e.boundingClientRect.top);
          else visible.delete(key);
        }
        if (visible.size > 0) {
          const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0][0];
          setActiveChapter(top as WatchChapter);
        }
      },
      { threshold: 0, rootMargin: "-40% 0px -60% 0px" }
    );
    sections.forEach((s) => observer.observe(s));

    // Focus backup: any field gaining focus lights its enclosing chapter. This
    // makes the watch follow your attention (which field you're in), which is
    // even more direct than scroll — and rescues chapters that never scroll
    // through the threshold on a tall screen.
    const onFocusIn = (e: FocusEvent) => {
      const sec = (e.target as HTMLElement | null)?.closest?.("[data-chapter]");
      const key = (sec as HTMLElement | null)?.dataset?.chapter;
      if (key) setActiveChapter(key as WatchChapter);
    };
    document.addEventListener("focusin", onFocusIn);

    // Initial calc on mount (rAF so layout has settled).
    const raf = requestAnimationFrame(pickByPosition);

    return () => {
      observer.disconnect();
      document.removeEventListener("focusin", onFocusIn);
      cancelAnimationFrame(raf);
    };
  }, [step]);

  // Page-level drag guard. Every drop on the page is preventDefault()'d so the
  // browser never opens a file in a new tab. If the drop landed inside the
  // photo zone, we upload it directly through the PhotoUpload handle — so
  // uploads don't depend on which inner element happened to catch the event.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const inZone = (e.target as HTMLElement | null)?.closest?.(
        "[data-photo-dropzone]"
      );
      if (inZone && e.dataTransfer?.files?.length) {
        photoRef.current?.uploadFiles(e.dataTransfer.files);
      }
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  // Per-step gate for the Next button. Step 0 advances via the curation pass.
  const canProceed = step === 1 ? mandatoryDone(draft) : true;

  return (
    <div className="space-y-6">
      <ProgressBar step={step} />

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div
          data-photo-dropzone={step === 1 ? "" : undefined}
          className="border border-[var(--border-subtle)] bg-[var(--surface)] px-8 py-8"
        >
          {step === 0 && (
            <CurationStep
              draft={draft}
              patch={patch}
              onPass={() => setStep(1)}
              advisory={refAdvisory}
              setAdvisory={setRefAdvisory}
            />
          )}
          {step === 1 && (
            <PhotosStep draft={draft} patch={patch} photoRef={photoRef} />
          )}
          {step === 2 && (
            <DetailsStep
              draft={draft}
              patch={patch}
              onProceed={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <DescriptionStep
              draft={draft}
              patch={patch}
              onProceed={() => setStep(4)}
            />
          )}
          {step === 4 && (
            <>
              {/* v2.4y — an advisory unresolved at Review repeats here;
                  cleared or consistent means silence. ReviewStep itself
                  is untouched. */}
              {refAdvisory && refAdvisory.kind !== "consistent" && (
                <p className="mb-3 text-[11px] italic text-[var(--gold-subtle)]">
                  {refAdvisory.message}
                </p>
              )}
              <ReviewStep
                draft={draft}
                captureSessionId={desktopIds.captureSessionId}
                publishRequestId={desktopIds.publishRequestId}
              />
            </>
          )}

          {step > 0 && (
            <div className="mt-6">
              {step === 1 && !canProceed && (
                <p className="mb-2 text-[12px] text-[var(--muted)]">
                  Add and label the required photos to continue
                  {draft.hasBracelet
                    ? " (dial, caseback, clasp, and a full shot with the strap/bracelet extended)."
                    : " (dial, caseback, and clasp)."}
                </p>
              )}
              <div className="flex justify-between">
                <button
                  onClick={() => setStep(step - 1)}
                  className="border border-[var(--border-mid)] px-4 py-2 font-[Inter] text-[11px] uppercase tracking-[2px] text-[var(--slate)] transition hover:border-[var(--border-subtle)] hover:text-[var(--platinum)]"
                >
                  Back
                </button>
                {step < STEPS.length - 1 && step !== 3 && step !== 2 && (
                  <button
                    onClick={() => canProceed && setStep(step + 1)}
                    disabled={!canProceed}
                    className="bg-[var(--gold)] px-5 py-[13px] font-[Inter] text-[11px] font-normal uppercase tracking-[2px] text-[var(--ink)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Continue
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="md:sticky md:top-6 md:self-start md:pt-1 space-y-6">
          {draft.significanceScore != null ? (
            <ListingScoreMeter listing={toScoringState(draft)} />
          ) : (
            <div className="border border-dashed border-[var(--border-faint)] px-4 py-6 text-center">
              <div className="text-[9px] uppercase tracking-[2px] text-[var(--ghost)]">
                Listing Score
              </div>
              <div className="mt-2 font-display text-[11px] italic text-[var(--ghost)]">
                Appears after curation passes.
              </div>
            </div>
          )}

          {/**
           * WatchBlueprint is a companion to the seller.
           * It should reinforce documentation, never compete with the form.
           * Every instinct in UI development will be to make it move more. Resist.
           * If users remember the blueprint, it should be because it quietly
           * accompanied them through documenting a watch — not because it
           * demanded attention.
           */}

          {/* WatchBlueprint — Photos step.
           * Companion to the seller: layers fill gold as photos are tagged.
           * The caseback auto-flip is intentionally NOT passed here: turning the
           * plate to reveal the reverse swept the accumulated illuminated watch
           * edge-on mid-run (audited). The Caseback tag now lights the case
           * layer without rotating the figure.
           * WatchBlueprint is a companion, not a focal point. */}
          {step === 1 && (
            <div className="px-2 opacity-90">
              <WatchBlueprint
                completed={deriveCompletedLayersFromPhotos(draft.photos)}
                active={deriveActiveLayerFromPhotos(draft.photos)}
              />
            </div>
          )}

          {/* WatchBlueprint — Details step (supersedes the former ChapterWatch).
           * Active layer tracks the chapter the seller is currently in.
           * Completed layers accumulate — they never reset.
           * WatchBlueprint is a companion, not a focal point. */}
          {step === 2 && (
            <div className="px-2 opacity-90">
              <WatchBlueprint
                completed={deriveCompletedLayersFromDraft(draft)}
                active={CHAPTER_LAYERS[activeChapter]}
              />
            </div>
          )}

          {/* WatchBlueprint — Publish step.
           * completed="all": the watch is whole, documented, ready to hand over.
           * Nothing animates. Quiet and complete. opacity-75 keeps it more
           * recessive than the working steps — the seller's eye is on Publish.
           * WatchBlueprint is a companion, not a focal point. */}
          {step === 4 && (
            <div className="px-2 opacity-75">
              <WatchBlueprint completed="all" />
            </div>
          )}

          {/* WatchBlueprint — empty state for steps without a dedicated surface
           * (Curation, Description). Ghost at rest with the movement layer
           * faintly active as a placeholder — present without implying progress
           * that hasn't happened. opacity-50: barely there.
           * WatchBlueprint is a companion, not a focal point. */}
          {(step === 0 || step === 3) && (
            <div className="px-2 opacity-50">
              <WatchBlueprint completed={[]} active="movement" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`font-[Inter] text-[9px] uppercase tracking-[2px] ${
                  i === step
                    ? "text-[var(--gold)]"
                    : i < step
                      ? "text-[var(--gold-subtle)]"
                      : "text-[var(--ghost)]"
                }`}
              >
                {ROMAN[i]}
              </div>
              <div
                className={`mt-1 font-[Inter] text-[9px] uppercase tracking-[1.5px] ${
                  i === step
                    ? "text-[var(--platinum)]"
                    : i < step
                      ? "text-[var(--ghost)]"
                      : "text-[var(--ghost)]"
                }`}
              >
                {label}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div className="mx-3 mb-3 flex items-center gap-1">
                <div
                  className={`h-1 w-1 rounded-full ${
                    i < step ? "bg-[var(--gold-subtle)]" : "bg-[var(--border-subtle)]"
                  }`}
                />
                <div
                  className={`h-px w-8 ${
                    i < step ? "bg-[var(--gold-subtle)]" : "bg-[var(--border-faint)]"
                  }`}
                />
                <div
                  className={`h-1 w-1 rounded-full ${
                    i < step ? "bg-[var(--gold-subtle)]" : "bg-[var(--border-subtle)]"
                  }`}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Extremely generous heuristic — only flags references that are clearly
// too short or contain no alphanumeric structure at all. This must almost
// never fire on a real reference number. Advisory only, never blocks.
function looksLikeWeakReference(ref: string): boolean {
  const trimmed = ref.trim();
  if (trimmed.length < 3) return true;
  if (!/[a-zA-Z0-9]/.test(trimmed)) return true;
  return false;
}

/* ── Reference advisory (v2.4y) ──────────────────────────────────────────
   ONE advisory state for the reference field, fed by two deliberate layers:
   1. the local heuristic above (cheap, generous) — fires alone, no API call
   2. /api/validate-reference (loose AI plausibility, brand-required /
      model-optional) — only when the local layer passes
   A single render slot means the two layers can never contradict each
   other in the UI. "consistent" renders SILENCE — no badge, no checkmark,
   no manufactured confidence. Advisory only; never a block, never a
   penalty. Missing data is honest; this check never accuses. */
export type RefAdvisory = {
  kind: "weak_local" | "uncertain" | "possible_mismatch" | "consistent";
  message: string;
};

function CurationStep({
  draft,
  patch,
  onPass,
  advisory,
  setAdvisory,
}: {
  draft: ListingDraft;
  patch: (p: Partial<ListingDraft>) => void;
  onPass: () => void;
  advisory: RefAdvisory | null;
  setAdvisory: (a: RefAdvisory | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // v2.4y — reference-check pipeline: local-first, then AI, one advisory.
  // Debounced on blur, cached by (brand|model|reference), stale responses
  // dropped by sequence. The API key never appears client-side — the
  // server route owns trust, this component only submits evidence.
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkSeqRef = useRef(0);
  const refCheckCacheRef = useRef<Map<string, RefAdvisory>>(new Map());

  function runReferenceCheck() {
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    const ref = draft.reference.trim();
    if (!ref) {
      setAdvisory(null);
      return;
    }
    // Layer 1 — local heuristic (v2.3). Obviously malformed: local
    // advisory, NO API call.
    if (looksLikeWeakReference(ref)) {
      setAdvisory({
        kind: "weak_local",
        message:
          "That reference number looks a little short — double-check it before continuing.",
      });
      return;
    }
    // Layer 2 — loose AI plausibility. Brand is required context; model
    // rides along when present but is never required.
    const brand = draft.brand.trim();
    if (!brand) {
      setAdvisory(null);
      return;
    }
    const key = `${brand}|${draft.model.trim()}|${ref}`;
    const cached = refCheckCacheRef.current.get(key);
    if (cached) {
      setAdvisory(cached);
      return;
    }
    checkTimerRef.current = setTimeout(async () => {
      const seq = ++checkSeqRef.current;
      try {
        const res = await fetch("/api/validate-reference", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brand, model: draft.model.trim(), reference: ref }),
        });
        const data = await res.json().catch(() => null);
        if (seq !== checkSeqRef.current) return; // stale — a newer check owns the field
        let adv: RefAdvisory;
        if (data?.verdict === "possible_mismatch") {
          adv = {
            kind: "possible_mismatch",
            message:
              "This reference may not match the selected brand or model. Worth checking before continuing.",
          };
        } else if (data?.verdict === "uncertain") {
          adv = {
            kind: "uncertain",
            message:
              "We couldn't confidently assess this reference. Please double-check it before publishing.",
          };
        } else {
          // looks_consistent — and fail-open lands here too: silence.
          adv = { kind: "consistent", message: "" };
        }
        refCheckCacheRef.current.set(key, adv);
        setAdvisory(adv);
      } catch {
        if (seq === checkSeqRef.current) setAdvisory({ kind: "consistent", message: "" });
      }
    }, 350);
  }

  const ready =
    draft.brand.trim() &&
    draft.reference.trim() &&
    draft.year.trim() &&
    draft.condition &&
    draft.askingPrice.trim();

  async function check() {
    setBusy(true);
    setError("");
    try {
      const { pass, score, reasoning } = await runCuration(draft);
      patch({
        significanceScore: score,
        curationDecision: pass ? "pass" : "fail",
        curationReasoning: reasoning,
      });
      if (pass) onPass();
    } catch (e) {
      setError(e instanceof Error ? e.message : "evaluation failed");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full border-b border-[var(--border-mid)] bg-transparent px-2 py-2 font-display text-[16px] font-light text-[var(--platinum)] placeholder:italic placeholder:text-[var(--ghost)] focus-visible:border-[var(--gold)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-gold)] focus:border-[var(--border-gold)] focus:outline-none transition";
  const label = "mb-2 block text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]";

  return (
    <div>
      <h2 className="mb-1 font-display text-[20px] font-light text-[var(--platinum)]">
        Is your watch a fit?
      </h2>
      <p className="mb-6 text-[13px] text-[var(--muted)]">
        A quick check before you build the listing. FairWatchTrade is curated.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Brand</label>
          <BrandCombobox
            value={draft.brand}
            onChange={(brand, isCustom) => patch({ brand, customBrandFlag: isCustom })}
            inputClassName={input}
            placeholder="e.g. Parmigiani Fleurier"
          />
        </div>
        <div>
          <label className={label}>Model</label>
          <ModelCombobox
            id="model"
            value={draft.model}
            onChange={(model) => patch({ model })}
            brandName={draft.brand}
            inputClassName={input}
            placeholder="e.g. Tonda Métrographe"
          />
        </div>
        <div>
          <label className={label}>Reference number</label>
          <input
            id="reference"
            className={input}
            value={draft.reference}
            onChange={(e) => {
              patch({ reference: e.target.value });
              if (advisory) setAdvisory(null); // editing clears — never nags mid-typing
            }}
            onBlur={runReferenceCheck}
            placeholder="e.g. reference number"
          />
          {advisory && advisory.kind !== "consistent" && (
            <p className="mt-1 text-[11px] italic text-[var(--gold-subtle)]">
              {advisory.message}
            </p>
          )}
        </div>
        <div>
          <label className={label}>Year</label>
          <input className={input} value={draft.year} onChange={(e) => patch({ year: e.target.value })} placeholder="e.g. 2021" />
        </div>
        <div>
          <label className={label}>Condition</label>
          <select
            className={input}
            value={draft.condition}
            onChange={(e) => patch({ condition: e.target.value as Condition })}
          >
            <option value="" style={OPTION_STYLE}>Select…</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c} style={OPTION_STYLE}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Asking price (USD)</label>
          <input className={input} value={draft.askingPrice} onChange={(e) => patch({ askingPrice: e.target.value })} placeholder="e.g. 7250" inputMode="numeric" />
        </div>
      </div>

      <div className="mt-4">
        <label className={label}>Brief provenance note</label>
        <textarea className={`${input} min-h-[72px]`} value={draft.provenanceNote} onChange={(e) => patch({ provenanceNote: e.target.value })} placeholder="Service history, previous ownership, how you acquired it…" spellCheck={false} />
      </div>

      {draft.curationDecision === "fail" && (
        <div className="mt-4 border border-[rgba(220,80,80,0.25)] bg-[rgba(220,80,80,0.06)] px-4 py-3 text-[13px]">
          <div className="mb-1 font-medium text-[var(--danger)]">Not a fit right now.</div>
          {draft.curationReasoning && <div className="text-[var(--danger)]/80">{draft.curationReasoning}</div>}
        </div>
      )}

      {error && <div className="mt-4 text-[13px] text-[var(--danger)]">Error: {error}</div>}

      <button
        onClick={check}
        disabled={!ready || busy}
        className={`mt-6 flex items-center gap-2 bg-[var(--gold)] px-6 py-[13px] font-[Inter] text-[10px] font-normal uppercase tracking-[2.5px] text-[var(--ink)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${
          busy ? "cursor-wait" : !ready ? "cursor-not-allowed" : ""
        }`}
      >
        {busy && <WatchSpinner size={16} />}
        {busy ? "Checking…" : "Check eligibility"}
      </button>
    </div>
  );
}

function PhotosStep({
  draft,
  patch,
  photoRef,
}: {
  draft: ListingDraft;
  patch: (p: Partial<ListingDraft>) => void;
  photoRef: RefObject<PhotoUploadHandle | null>;
}) {
  const [dragCount, setDragCount] = useState(0);
  const dragOver = dragCount > 0;

  function onPhotos(metas: UploadedPhotoMeta[]) {
    const photos: ListingPhoto[] = metas
      .filter((m) => m.category)
      .map((m) => ({
        photo: { url: m.url, pathname: m.pathname },
        category: m.category as PhotoCategory,
        isWristShot: m.isWristShot,
      }));
    patch({ photos });
  }

  return (
    <div>
      <h2 className="mb-1 font-display text-[20px] font-light text-[var(--platinum)]">Photos</h2>
      <p className="mb-6 text-[13px] text-[var(--muted)]">
        Upload your shots and label each one. Required: dial, caseback, clasp
        {draft.hasBracelet ? ", and a full shot with the strap/bracelet extended" : ""}. The score on the
        right climbs as you go.
      </p>

      <label className="mt-4 flex items-center gap-2 text-[13px] text-[var(--platinum)]">
        <input
          type="checkbox"
          checked={draft.hasBracelet}
          onChange={(e) => patch({ hasBracelet: e.target.checked })}
          className="accent-[#C9A84C]"
        />
        This watch is on a bracelet (needs a full shot with the bracelet extended)
      </label>

      <div
        className={`mt-4 transition-all duration-200 ${
          dragOver
            ? "bg-[rgba(201,168,76,0.04)] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.2)]"
            : ""
        }`}
        onDragEnter={() => setDragCount((c) => c + 1)}
        onDragLeave={() => setDragCount((c) => c - 1)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setDragCount(0);
        }}
      >
        <PhotoUpload ref={photoRef} onChange={onPhotos} />
      </div>
    </div>
  );
}
