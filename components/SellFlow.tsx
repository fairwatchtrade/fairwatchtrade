"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject, type CSSProperties } from "react";
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
import DetailsStep, { BinaryChoice } from "@/components/DetailsStep";
import DescriptionStep from "@/components/DescriptionStep";
import ReviewStep from "@/components/ReviewStep";
import WatchBlueprint, { type Layer, type Detail } from "@/components/WatchBlueprint";
import WatchSpinner from "@/components/WatchSpinner";
import HelpBubble from "@/components/HelpBubble";
import BrandCombobox from "@/components/BrandCombobox";
import ModelCombobox from "@/components/ModelCombobox";
import { randomUUID } from "@/lib/uuid";
import { uploadPhoto } from "@/lib/storage";
import { sanitizePhotoPresentation } from "@/lib/photoPresentation";
import {
  renderRedactedBlob,
  sanitizeRedactions,
  type RedactionStroke,
} from "@/lib/photoRedaction";
import { parsePrice } from "@/lib/parsePrice";
import { buildCurationSubmission } from "@/lib/curationSubmission";
import { formatMoney } from "@/lib/formatMoney";
import {
  SUPPORTED_CURRENCIES,
  RECOMMENDED_CURRENCY,
  isSupportedCurrency,
} from "@/lib/supportedCurrencies";
import ListFromPhoneHandoff from "@/components/ListFromPhoneHandoff";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  createDraft,
  saveContent,
  draftStatus,
  returnAuthority,
  markPublished,
  fetchDraftRow,
  fetchNewestActiveDraft,
  handoffIsLive,
  desktopIsPaused,
  type StatusResult,
} from "@/lib/listingDraft";
import {
  requirementProfileFor,
  missingRequiredViews,
  type AdmissionState,
} from "@/lib/admission/requirementProfile";
import {
  classifyRolexIdentifier,
  ROLEX_IDENTIFIER_STOP,
  ROLEX_IDENTIFIER_STOP_DETAIL,
  ROLEX_REFERENCE_RECOGNIZED,
  ROLEX_REFERENCE_DOC_FLAG,
  ROLEX_STYLE_RECOGNIZED,
  rolexStyleReferenceLine,
  ROLEX_STYLE_DOC_FLAG,
} from "@/lib/admission/rolexIdentifier";

const STEPS = ["Curation", "Photos", "Details", "Description", "Review"] as const;
const CONDITIONS: Condition[] = ["Unworn", "Mint", "Excellent", "Very Good", "Good", "Fair"];
const ROMAN = ["I", "II", "III", "IV", "V"] as const;

/* Native <option> elements don't reliably inherit the form's styling. Keep the
   values concrete (CSS variables are ignored for <option> in some browsers),
   but let light-dark() resolve them against the page's owned color-scheme so
   the browser popup follows Daylight, Dark, and System without a JS theme copy. */
const OPTION_STYLE: CSSProperties = {
  backgroundColor: "light-dark(#FAF7F0, #141821)",
  color: "light-dark(#25231F, #E8E4DC)",
};

/* ── Curation call ───────────────────────────────────────────────────────
   /api/evaluate confirmed working (returns score + decision). Defensive reads
   in case field names differ. */
async function runCuration(d: ListingDraft): Promise<{
  pass: boolean;
  score: number;
  reasoning: string;
  decision: string;
}> {
  const res = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    /* The payload is built by the shared mapper, NOT hand-assembled here.
       This call previously sent askingPrice/provenanceNote in camelCase while
       the route reads asking_price/provenance, so both arrived undefined and
       the prompt rendered "Not provided" for them on every evaluation. See
       lib/curationSubmission.ts. */
    body: JSON.stringify(buildCurationSubmission(d)),
  });
  if (!res.ok) throw new Error(`evaluate ${res.status}`);
  const json = await res.json();
  const score = Number(json.score ?? json.significance ?? 0);
  const decision = String(json.decision ?? "").toLowerCase();
  /* seller_message is the evaluator contract's field; reasoning/message stay
     first for defensive compatibility with any older response shape. */
  const reasoning = String(json.reasoning ?? json.message ?? json.seller_message ?? "");
  const pass = decision
    ? !decision.includes("reject") && !decision.includes("declin")
    : score > 0;
  /* The decision is returned raw so brand-admission callers can require an
     explicitly admitting decision instead of this lenient default. */
  return { pass, score, reasoning, decision };
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
   named layers. These tables can move to lib/watchBlueprintMappings.ts once a
   second surface needs them; for v1.89 they live here. */

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

// DetailsStep chapter → the WatchBlueprint regions/details it lights (the
// `active` prop on the Details step). A chapter owns more than one anatomy
// region; the Complications chapter is data-driven — it lights only the
// subdials / date the seller actually selected (the Moon Principle: the plate
// reflects the real watch, not a generic one). Verified against the chapterKey
// values in DetailsStep.tsx.
function chapterComplicationDetails(draft: ListingDraft): Detail[] {
  const comps = draft.details.complications ?? [];
  const out: Detail[] = [];
  if (comps.includes("Chronograph")) out.push("chrono");
  if (comps.includes("Date") || comps.includes("Day-Date")) out.push("date");
  return out;
}

function deriveActiveForChapter(chapter: WatchChapter, draft: ListingDraft): Layer[] {
  switch (chapter) {
    case "movement":
      return ["movement"];
    case "case":
      return ["case", "crown", "lugs"];
    case "dial":
      return ["dial", "hands", "crown", "5min"];
    case "wearing":
      return ["strap", "clasp", "lugs"];
    case "complications":
      return chapterComplicationDetails(draft);
    case "provenance":
      return ["provenance"];
    default:
      return [];
  }
}

// Fine-detail groups (5-min markers, chrono subdials, date) are visible only
// while their chapter is active; the one-minute track is defined but never shown.
function deriveDetailsForChapter(chapter: WatchChapter, draft: ListingDraft): Detail[] {
  if (chapter === "dial") return ["5min"];
  if (chapter === "complications") return chapterComplicationDetails(draft);
  return [];
}

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
const MILESTONE_LAYERS: Layer[] = ["hands", "movement", "glass", "provenance"];

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

  // V · Complications — no persistent region; the selected complications light
  // as fine details (chrono / date) only while the Complications chapter is active.

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


export default function SellFlow({
  privateThreadId,
  privateBuyerName,
}: {
  /** Private Listing V1 — when present, the wizard is creating a listing for
      the ONE buyer behind this conversation. The server re-derives and
      re-verifies the buyer from the thread; these props only carry the
      relationship through the flow and name the recipient truthfully. */
  privateThreadId?: string;
  privateBuyerName?: string;
} = {}) {
  const [draft, setDraft] = useState<ListingDraft>(emptyDraft);
  const [step, setStepRaw] = useState(0);
  /* Furthest step the seller has actually reached. Clickability is keyed off
     THIS, not off `step` — otherwise jumping back to IV would immediately make
     V unreachable, stranding the seller in the middle of a flow they had
     already completed. A high-water mark never retreats. */
  const [maxStep, setMaxStep] = useState(0);
  /* Wrapping setStep rather than editing every call site keeps the existing
     five callers (curation pass, photo proceed, back, continue) untouched and
     makes it impossible to advance without the mark following. */
  const setStep = useCallback((next: number) => {
    setStepRaw(next);
    setMaxStep((m) => Math.max(m, next));
  }, []);

  /* ── Browser Back follows the wizard, not the page ──────────────────────
     The in-page Back button was always correct — it calls setStep(step - 1)
     and never leaves /sell. The defect was the BROWSER Back button: step
     changes pushed no history, so the flow occupied a single entry and one
     Back ejected the seller out of /sell entirely from any step.

     Each step now owns a history entry, so Back walks II ← III ← IV the way
     the seller expects, and reaching the exit takes as many deliberate presses
     as there are steps behind them. Nothing is unmounted or cleared — only
     `step` moves, exactly as the Back button does, so photos, description,
     score and presentation metadata are untouched.

     poppingRef stops the feedback loop: a popstate sets the step, which would
     otherwise re-push the entry we just came from and make Back inert. */
  const poppingRef = useRef(false);

  useEffect(() => {
    /* MERGE, never replace (data-loss correction 2026-08-06): a raw state
       object here wiped the Next App Router's own history.state for the
       current entry, so ANY later history.back() onto it — the shared help
       bubble's close path above all — made the router fall back to a full
       navigation, remounting this component and destroying the draft. */
    window.history.replaceState({ ...window.history.state, sellStep: 0 }, "");
    function onPop(e: PopStateEvent) {
      const s = (e.state as { sellStep?: number } | null)?.sellStep;
      if (typeof s === "number") {
        poppingRef.current = true;
        setStepRaw(s);
      }
      /* No sellStep means the seller has backed out past step I and is
         genuinely leaving. That is now a deliberate act — it costs one press
         per completed step — so it is allowed through rather than trapped
         behind a dialog the browser cannot reliably cancel here. */
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /* Previous step, for the landing rule below. Seeded to the initial step so
     the mount run is a non-transition and touches nothing. */
  const prevStepRef = useRef(0);

  useEffect(() => {
    if (poppingRef.current) {
      poppingRef.current = false;
      prevStepRef.current = step;
      /* Browser Back/Forward: the browser's own scroll restoration governs
         where the seller lands — normal history behavior, untouched. */
      return;
    }
    const isTransition = prevStepRef.current !== step;
    prevStepRef.current = step;
    if (!isTransition) return; // mount, not a step change
    if (step !== 0) {
      // Same merge law as the mount replaceState above — the router's own
      // state must ride every entry this flow creates.
      window.history.pushState({ ...window.history.state, sellStep: step }, "");
    }
    /* Entering a step lands at its top. The steps swap content inside one
       page, so without this the scroll depth of the step being LEFT carried
       into the one being entered — Photos → Continue delivered the seller
       partway down Details, around Component Review, instead of at its
       beginning. This is the cause (stale scroll across an in-place content
       swap), not a symptom patch: the reset runs in the same effect that
       commits the step change, never on a timer. */
    window.scrollTo(0, 0);
  }, [step]);

  /* Reload, tab close, or navigating away by URL still bypass step history
     entirely, so those keep an explicit confirmation while there is work worth
     losing. The browser supplies its own wording; the draft itself is saved
     server-side, so this guards the seller's place in the flow, not the data.

     Scope is deliberately narrow, and BOTH conditions matter:
       · step 0 is excluded — nothing has been entered yet, so warning there is
         just noise on the way in;
       · `published` disarms it — once the listing exists the work is finished
         and cannot be abandoned, and a browser warning after a successful
         publish would read as though something had gone wrong. Leaving the
         flow entirely unmounts the component, and the cleanup below removes
         the listener, so a deliberate exit never leaves it armed either. */
  const [published, setPublished] = useState(false);

  useEffect(() => {
    if (step === 0 || published) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [step, published]);
  // v2.4y — reference advisory lives at flow level so an unresolved
  // advisory can repeat at Review without touching ReviewStep itself.
  const [refAdvisory, setRefAdvisory] = useState<RefAdvisory | null>(null);
  // v2.24 · The Aubrey Check — desktop correlation identity. One synthetic
  // capture-session id (desk_ prefix, never collides with mobile wizard
  // sessions) and one idempotency key per wizard session, so desktop photos
  // get honest listing_media correlation and desktop publishes get the same
  // retry safety mobile has. Lazy init: stable for the life of the flow.
  const [desktopIds] = useState(() => ({
    captureSessionId: "desk_" + randomUUID(),
    publishRequestId: randomUUID(),
  }));

  /* ── List From Phone — server-backed draft + single-active-editor baton ──
     When the seller is signed in, the server draft (listing_drafts, RPCs only)
     is the canonical copy: it survives refresh/close and is what a redeemed
     phone continues. Desktop holds the 'desktop' baton; while the phone holds
     it, this flow renders paused/read-only and only polls status (5s). Guests
     keep today's in-memory behavior — the handoff itself requires sign-in. */
  const [authed, setAuthed] = useState(false);
  const [serverDraftId, setServerDraftId] = useState<string | null>(null);
  const revisionRef = useRef(0);
  const userTouchedRef = useRef(false);
  const creatingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [phoneActive, setPhoneActive] = useState(false);
  const [pollLive, setPollLive] = useState(false);
  // Closing the handoff panel returns focus to the control that opened it
  // after the close commits. Ref-not-state, following the proven
  // SavedSearches focus-restoration pattern.
  const handoffOpenerRef = useRef<HTMLButtonElement | null>(null);
  const restoreOpenerFocusRef = useRef(false);
  useEffect(() => {
    if (!handoffOpen && restoreOpenerFocusRef.current) {
      restoreOpenerFocusRef.current = false;
      handoffOpenerRef.current?.focus();
    }
  }, [handoffOpen]);

  // Adopt a server row into local state (content.draft is the ListingDraft).
  const adoptRow = (row: { id: string; content: Record<string, unknown>; revision: number }) => {
    const d = row.content?.draft as ListingDraft | undefined;
    if (d && typeof d === "object") setDraft({ ...emptyDraft(), ...d });
    revisionRef.current = row.revision;
    setServerDraftId(row.id);
  };

  // Mount: resume the newest active server draft (survives refresh/close).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      if (cancelled || !data.user) return;
      setAuthed(true);
      const row = await fetchNewestActiveDraft();
      if (cancelled || !row) return;
      // Never clobber typing that happened before this resolved.
      if (!userTouchedRef.current) {
        adoptRow(row);
        if (row.active_editor === "phone") {
          setPhoneActive(true);
          setPollLive(true);
        } else if (row.handoff_status === "issued" || row.handoff_status === "redeemed") {
          setPollLive(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function patch(p: Partial<ListingDraft>) {
    userTouchedRef.current = true;
    setDraft((d) => ({ ...d, ...p }));
  }

  /* ── Privacy redaction commit (the one owner of the swap) ───────────────
     The redaction editors upstream only collect strokes; committing them is
     draft surgery and belongs to the draft's owner. Applying renders the
     composite from the ORIGINAL bytes, uploads it as its own object, and
     swaps the listing photo to the redacted result; the original upload is
     preserved privately in the draft's redaction record. An empty stroke
     list restores the original. Presentation framing and the hero selection
     follow the photograph to its new pathname, so redacting never loses the
     seller's staged composition. */
  const photoRedactions = useMemo(
    () => sanitizeRedactions(draft.photoRedactions),
    [draft.photoRedactions]
  );

  async function applyPhotoRedaction(
    currentPathname: string,
    strokes: RedactionStroke[]
  ): Promise<string | null> {
    try {
      const photos = draft.photos;
      const idx = photos.findIndex((p) => p.photo.pathname === currentPathname);
      if (idx === -1) return null;
      const entry = photos[idx];
      const redactions = { ...photoRedactions };
      const record = redactions[currentPathname];
      const originalUrl = record?.originalUrl ?? entry.photo.url;
      const originalPathname = record?.originalPathname ?? entry.photo.pathname;

      const movePresentationKey = (from: string, to: string) => {
        const base = sanitizePhotoPresentation(draft.photoPresentation);
        if (from === to) return base;
        const frames = { ...base.frames };
        const moved = frames[from];
        if (moved) {
          frames[to] = moved;
          delete frames[from];
        }
        return {
          heroPathname: base.heroPathname === from ? to : base.heroPathname,
          frames,
        };
      };

      if (strokes.length === 0) {
        if (!record) return currentPathname; // nothing applied, nothing to clear
        delete redactions[currentPathname];
        const nextPhotos = [...photos];
        nextPhotos[idx] = {
          ...entry,
          photo: { ...entry.photo, url: originalUrl, pathname: originalPathname },
        };
        patch({
          photos: nextPhotos,
          photoRedactions: redactions,
          photoPresentation: movePresentationKey(currentPathname, originalPathname),
        });
        return originalPathname;
      }

      const blob = await renderRedactedBlob(originalUrl, strokes);
      const uploaded = await uploadPhoto(
        new File([blob], "redacted.jpg", { type: "image/jpeg" })
      );
      delete redactions[currentPathname];
      redactions[uploaded.pathname] = { originalPathname, originalUrl, strokes };
      const nextPhotos = [...photos];
      nextPhotos[idx] = {
        ...entry,
        photo: { ...entry.photo, url: uploaded.url, pathname: uploaded.pathname },
      };
      patch({
        photos: nextPhotos,
        photoRedactions: redactions,
        photoPresentation: movePresentationKey(currentPathname, uploaded.pathname),
      });
      return uploaded.pathname;
    } catch (e) {
      console.error("photo redaction apply failed:", e);
      return null;
    }
  }

  // Debounced canonical save — active desktop editor only, revision-guarded.
  useEffect(() => {
    if (!authed || phoneActive) return;
    if (!userTouchedRef.current) return; // nothing meaningful yet
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const content = { draft };
      if (!serverDraftId) {
        if (creatingRef.current) return;
        creatingRef.current = true;
        const id = await createDraft(content);
        creatingRef.current = false;
        if (id) {
          revisionRef.current = 0;
          setServerDraftId(id);
        }
        return;
      }
      const res = await saveContent(serverDraftId, content, revisionRef.current, "desktop");
      if (res.state === "SAVED" && typeof res.revision === "number") {
        revisionRef.current = res.revision;
      } else if (res.state === "NOT_ACTIVE_EDITOR") {
        // The phone took the baton between polls — pause immediately.
        setPhoneActive(true);
        setPollLive(true);
      } else if (res.state === "STALE") {
        // A newer revision exists (e.g. the phone saved then returned).
        const row = await fetchDraftRow(serverDraftId);
        if (row) adoptRow(row);
      }
    }, 1200);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [draft, authed, phoneActive, serverDraftId]);

  // Status poll — ONLY while a handoff is live (issued/redeemed) or the panel
  // is open. 5s interval; stops on return/expiry/publish/unmount.
  useEffect(() => {
    if (!serverDraftId || (!pollLive && !handoffOpen)) return;
    let stopped = false;
    const tick = async () => {
      const s: StatusResult = await draftStatus(serverDraftId);
      if (stopped || s.state !== "OK") return;
      const paused = desktopIsPaused(s);
      if (paused !== phoneActive) {
        if (!paused) {
          // Authority came back (returned/expired) — adopt the phone's work.
          const row = await fetchDraftRow(serverDraftId);
          if (row && !stopped) adoptRow(row);
        }
        if (!stopped) setPhoneActive(paused);
      }
      if (!handoffIsLive(s) && !paused && !stopped) setPollLive(false);
    };
    const iv = setInterval(tick, 5000);
    tick();
    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, [serverDraftId, pollLive, handoffOpen, phoneActive]);

  // Explicit hand-back from the desktop side ("Resume on desktop").
  async function resumeOnDesktop() {
    if (!serverDraftId) return;
    const res = await returnAuthority(serverDraftId);
    if (res.state === "RETURNED") {
      const row = await fetchDraftRow(serverDraftId);
      if (row) adoptRow(row);
      setPhoneActive(false);
      setPollLive(false);
      setHandoffOpen(false);
    }
  }

  // Open the handoff panel — ensures the server draft exists first so the QR
  // always points at real, saved work.
  async function openHandoff() {
    if (!authed) return;
    if (!serverDraftId) {
      const id = await createDraft({ draft });
      if (!id) return;
      revisionRef.current = 0;
      setServerDraftId(id);
    }
    setHandoffOpen(true);
    setPollLive(true);
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

  /* ── Brand admission (Rolex Admission Design Gate v1) ──────────────────
     The identified watch supplies the requirement profile; null means the
     standard path — non-profile sellers never see admission requirements. */
  const admissionProfile = requirementProfileFor(draft.brand);
  const missingAdmissionViews = admissionProfile
    ? missingRequiredViews(
        admissionProfile,
        draft.photos.map((p) => p.category)
      )
    : [];

  // Per-step gate for the Next button. Step 0 advances via the curation pass.
  const canProceed =
    step === 1
      ? mandatoryDone(draft) && missingAdmissionViews.length === 0
      : true;

  // ── Paused: the phone holds the baton. The flow stays mounted but inert
  // under an honest, calm panel. Not an error — a location.
  if (phoneActive) {
    return (
      <div className="space-y-6">
        <ProgressBar step={step} maxStep={maxStep} onJump={setStep} />
        <div className="border border-[var(--border-subtle)] bg-[var(--surface)] px-8 py-14 text-center">
          <div className="text-[11px] uppercase tracking-[1.4px] text-[var(--gold-subtle)]">
            List from phone
          </div>
          <h2 className="mt-2 font-display text-[22px] font-light text-[var(--platinum)]">
            Continuing on your phone
          </h2>
          <p className="mx-auto mt-2 max-w-[420px] text-[13px] leading-[1.6] text-[var(--muted)]">
            This listing is open on your phone right now. Your work saves there
            as you go — this page will pick it up the moment you bring it back.
          </p>
          <button
            type="button"
            onClick={resumeOnDesktop}
            className="mt-6 border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-5 py-2.5 text-[11px] uppercase tracking-[1.6px] text-[var(--gold)] transition-colors hover:bg-[rgba(201,168,76,0.1)]"
          >
            Resume on desktop
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProgressBar step={step} maxStep={maxStep} onJump={setStep} />

      {/* List From Phone — quiet affordance (signed-in sellers, desktop).
          It belongs to the work, not the score panel: same left edge as the
          step card, directly above it, content width. On the right it read as
          a detached utility for Listing Strength. */}
      {authed && !handoffOpen && (
        <div className="hidden md:flex">
          <button
            ref={handoffOpenerRef}
            type="button"
            onClick={openHandoff}
            className="border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] uppercase tracking-[1.4px] text-[var(--slate)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--gold)]"
          >
            List from phone
          </button>
        </div>
      )}
      {handoffOpen && serverDraftId && (
        <ListFromPhoneHandoff
          draftId={serverDraftId}
          onClose={() => {
            restoreOpenerFocusRef.current = true;
            setHandoffOpen(false);
            setPollLive(false);
          }}
        />
      )}

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
                privateThreadId={privateThreadId}
                privateBuyerName={privateBuyerName}
                /* Presentation is draft state like any other field, so it
                   rides the existing server-draft autosave and survives a
                   refresh or a phone handoff without new plumbing. */
                onPresentationChange={(photoPresentation) =>
                  patch({ photoPresentation })
                }
                /* Admission affirmations made at Review (profile brands) ride
                   the same draft autosave as every other field. */
                onAdmissionChange={(admission) =>
                  patch({ details: { ...draft.details, admission } })
                }
                /* Privacy redaction — draft state + commit, both owned here.
                   Offered for every brand: hiding private detail in a
                   photograph is not a corridor feature. */
                photoRedactions={photoRedactions}
                onApplyRedaction={applyPhotoRedaction}
                captureSessionId={desktopIds.captureSessionId}
                publishRequestId={desktopIds.publishRequestId}
                onPublished={(listingId) => {
                  // Disarms the abandon-warning: the work now exists as a
                  // listing and there is nothing left to lose.
                  setPublished(true);
                  // Close the server draft idempotently — the real listing now
                  // owns the work; the draft can never publish twice.
                  if (serverDraftId) void markPublished(serverDraftId, listingId);
                }}
              />
            </>
          )}

          {step > 0 && (
            <div className="mt-6">
              {step === 1 && !canProceed && (
                missingAdmissionViews.length > 0 ? (
                  <p className="mb-2 text-[12px] text-[var(--muted)]">
                    {admissionProfile!.brand} listings photograph the
                    identity-bearing parts. Still needed:{" "}
                    <span className="text-[var(--platinum)]">
                      {missingAdmissionViews.map((v) => v.view).join("; ")}
                    </span>
                    .
                  </p>
                ) : (
                  /* The approved cool accent marks the instructional cue — a
                     bounded Sell Flow use of mineral, this message only. Same
                     size, same position; the exact required-photo set is bold
                     so the eye lands on what actually unblocks Continue.
                     Validation itself is untouched. */
                  <p className="mb-2 text-[12px] text-[var(--mineral)]">
                    Add and label the required photos to continue{" "}
                    <span className="font-semibold">
                      {draft.hasBracelet
                        ? "(dial, caseback, clasp, and a full shot with the strap/bracelet extended)"
                        : "(dial, caseback, and clasp)"}
                    </span>
                    .
                  </p>
                )
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
                    className="bg-[var(--cta-fill)] px-5 py-[13px] font-[Inter] text-[11px] font-normal uppercase tracking-[2px] text-[var(--on-cta)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
              <div className="text-[11px] uppercase tracking-[1.4px] text-[var(--muted)]">
                Listing Score
              </div>
              <div className="mt-2 font-display text-[11px] italic text-[var(--muted)]">
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
                active={deriveActiveForChapter(activeChapter, draft)}
                details={deriveDetailsForChapter(activeChapter, draft)}
                rotatable
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

/* The progress row always LOOKED like navigation; now it behaves like it.
   A completed step is a real button covering the full numeral-and-label area,
   so returning to IV Description is one click instead of four Backs. Nothing
   visual changes: the existing tone rules are untouched and only a
   focus-visible outline is added, because a control reachable by keyboard has
   to show where the keyboard is. Future steps stay inert — they are not yet
   earned — and the current step is marked aria-current="step" rather than
   being a button that navigates nowhere.
   Jumping cannot publish, submit, or clear anything: it only calls setStep,
   the same function the Back and Continue buttons already call. */
function ProgressBar({
  step,
  maxStep,
  onJump,
}: {
  step: number;
  maxStep: number;
  onJump: (i: number) => void;
}) {
  return (
    <div className="mb-8">
      <nav aria-label="Listing progress" className="flex items-center gap-0">
        {STEPS.map((label, i) => {
          const isCurrent = i === step;
          const reachable = i <= maxStep && !isCurrent;
          const inner = (
            <>
              <div
                className={`font-[Inter] text-[11px] uppercase tracking-[1px] sm:tracking-[1.4px] ${
                  i === step
                    ? "text-[var(--gold)]"
                    : i < step
                      ? "text-[var(--gold-subtle)]"
                      : "text-[var(--muted)]"
                }`}
              >
                {ROMAN[i]}
              </div>
              <div
                className={`mt-1 font-[Inter] text-[11px] uppercase tracking-[0.5px] sm:tracking-[1.2px] ${
                  i === step
                    ? "text-[var(--platinum)]"
                    : i < step
                      ? "text-[var(--muted)]"
                      : "text-[var(--muted)]"
                }`}
              >
                {label}
              </div>
            </>
          );
          return (
            <div
              key={label}
              className={`flex min-w-0 items-center ${
                i < STEPS.length - 1 ? "flex-1 sm:flex-none" : ""
              }`}
            >
              {reachable ? (
                <button
                  type="button"
                  onClick={() => onJump(i)}
                  className="flex cursor-pointer flex-col items-center bg-transparent transition hover:opacity-80 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-[var(--gold)]"
                >
                  {inner}
                </button>
              ) : (
                <div
                  className="flex flex-col items-center"
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {inner}
                </div>
              )}
            {i < STEPS.length - 1 && (
              <div className="mb-3 flex min-w-0 flex-1 items-center sm:mx-3 sm:flex-none sm:gap-1">
                <div
                  className={`h-0.5 w-0.5 shrink-0 rounded-full sm:h-1 sm:w-1 ${
                    i < step ? "bg-[var(--gold-subtle)]" : "bg-[var(--border-subtle)]"
                  }`}
                />
                <div
                  className={`h-px min-w-0 flex-1 sm:w-8 sm:flex-none ${
                    i < step ? "bg-[var(--gold-subtle)]" : "bg-[var(--border-faint)]"
                  }`}
                />
                <div
                  className={`h-0.5 w-0.5 shrink-0 rounded-full sm:h-1 sm:w-1 ${
                    i < step ? "bg-[var(--gold-subtle)]" : "bg-[var(--border-subtle)]"
                  }`}
                />
              </div>
            )}
            </div>
          );
        })}
      </nav>
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
  const [brandIdentityResolved, setBrandIdentityResolved] = useState(false);
  const [modelIdentityResolved, setModelIdentityResolved] = useState(true);

  /* ── Money Truth Stage B — seller currency selector (approved Design Gate,
        sha f7de17d6…). The stored preference prefills the selector; when NO
        preference exists, USD is visibly preselected as RECOMMENDED — shown,
        never silently written to the profile. Only the account settings
        surface persists a preference. ── */
  const [hasStoredPref, setHasStoredPref] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let pref: string | null = null;
      try {
        const supabase = createSupabaseBrowserClient();
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
      // Prefill ONLY a draft that has no currency yet — a resumed draft's
      // chosen (or confirmed) currency is never overwritten by the preference.
      if (!isSupportedCurrency(draft.askingCurrency)) {
        patch({ askingCurrency: pref ?? RECOMMENDED_CURRENCY });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: the prefill must not re-fire as the seller edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const askingParse = parsePrice(draft.askingPrice, draft.askingCurrency);
  const confirmDisabled = !askingParse.ok;

  /* ── Brand admission (Rolex Admission Design Gate v1) ──────────────────
     Curation identifies the brand and opens the stricter corridor. The two
     entry conditions are answered here, before any evaluation call — the
     product stops early and explains why rather than allowing a listing
     destined for rejection. */
  const profile = requirementProfileFor(draft.brand);
  const admission = draft.details.admission;
  const setAdmission = (p: Partial<AdmissionState>) =>
    patch({
      details: {
        ...draft.details,
        admission: { ...draft.details.admission, ...p },
      },
    });
  const entryStopped =
    !!profile &&
    profile.entryConditions.some((c) => admission?.[c.key] === false);
  const entryConditionsMet =
    !profile ||
    profile.entryConditions.every((c) => admission?.[c.key] === true);

  /* ── Rolex identifier layer (Style-number ruling 2026-08-06) ───────────
     Deterministic, BEFORE any AI involvement. A bare canonical reference
     and a documented composite Style are both admitted; the Style is
     preserved verbatim and its canonical reference derived. An unsupported
     structure preserves the entry and stops for review with governed copy —
     identity-format judgments are never left to model prose. Recognition
     of an identifier NEVER satisfies the documentation gate. */
  const identifier =
    profile && draft.reference.trim()
      ? classifyRolexIdentifier(draft.reference)
      : null;
  const identifierStopped = identifier?.kind === "unsupported";

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
    // Rolex identifier layer sits between the local heuristic and the AI:
    // an unsupported structure is owned by the deterministic stop (no AI
    // call — the advisory slot stays empty so the governed copy renders
    // alone), and a recognized composite Style submits its DERIVED
    // canonical reference to the plausibility check, because the loose AI
    // layer knows references, not Rolex's internal bracelet/dial coding.
    let checkRef = ref;
    if (profile) {
      const ident = classifyRolexIdentifier(ref);
      if (ident.kind === "unsupported") {
        setAdvisory(null);
        return;
      }
      if (ident.kind === "style") checkRef = ident.reference;
    }
    // Layer 2 — loose AI plausibility. Brand is required context; model
    // rides along when present but is never required.
    const brand = draft.brand.trim();
    if (!brand) {
      setAdvisory(null);
      return;
    }
    const key = `${brand}|${draft.model.trim()}|${checkRef}`;
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
          body: JSON.stringify({ brand, model: draft.model.trim(), reference: checkRef }),
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
    brandIdentityResolved &&
    modelIdentityResolved &&
    draft.reference.trim() &&
    draft.year.trim() &&
    draft.condition &&
    draft.askingPrice.trim() &&
    // Design Gate: progression stays disabled until the seller explicitly
    // confirms the amount-and-currency pair.
    draft.askingConfirmed &&
    // Brand admission: both entry conditions affirmed before eligibility runs.
    entryConditionsMet &&
    // Rolex identifier: an unsupported structure stops for review here —
    // deterministically, before the evaluator can author a judgment on it.
    !identifierStopped;

  async function check() {
    setBusy(true);
    setError("");
    try {
      const { pass, score, reasoning, decision } = await runCuration(draft);
      /* A profile brand never takes the lenient normal-path pass: entry into
         the admission corridor requires an explicitly admitting decision.
         The evaluator remains the locked door; the identified watch supplies
         the key. Non-profile brands keep the exact pre-existing behavior. */
      const admitted = profile
        ? decision === "approved" || decision === "approved_with_guidance"
        : pass;
      /* Style-number ruling: the raw documented Style rides in admission
         state, SEPARATE from the canonical reference. The server re-derives
         from the submitted reference regardless — this persistence is for
         the seller's own draft, never trusted at publication. */
      const admissionPatch =
        identifier?.kind === "style"
          ? {
              details: {
                ...draft.details,
                admission: { ...draft.details.admission, styleNumber: identifier.style },
              },
            }
          : {};
      patch({
        significanceScore: score,
        curationDecision: admitted ? "pass" : "fail",
        curationReasoning: reasoning,
        ...admissionPatch,
      });
      if (admitted) onPass();
    } catch (e) {
      setError(e instanceof Error ? e.message : "evaluation failed");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full border-b border-[var(--border-mid)] bg-transparent px-2 py-2 font-display text-[16px] font-light text-[var(--platinum)] placeholder:italic placeholder:text-[var(--muted)] focus-visible:border-[var(--gold)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-gold)] focus:border-[var(--border-gold)] focus:outline-none transition";
  const label = "mb-2 block text-[11px] uppercase tracking-[1.6px] text-[var(--muted)]";

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
            onChange={(brand, isCustom) =>
              patch({
                brand,
                customBrandFlag: isCustom,
                // Model identity belongs to its brand. A changed brand cannot
                // silently carry a model selection from the previous one.
                model: brand === draft.brand ? draft.model : "",
              })
            }
            onResolutionChange={setBrandIdentityResolved}
            /* Placeholder-only size reduction (founder SEE-it): at the
                field's 16px display size the longest example brand did not
                fit. The placeholder: variant styles ONLY the ghost example —
                the value a seller types keeps the field's own 16px. */
            inputClassName={`${input} placeholder:text-[13px]`}
            placeholder="e.g. Parmigiani Fleurier"
          />
        </div>
        <div>
          <label className={label}>Model</label>
          <ModelCombobox
            id="model"
            value={draft.model}
            onChange={(model) => patch({ model })}
            onResolutionChange={setModelIdentityResolved}
            brandName={draft.brand}
            disabled={!brandIdentityResolved}
            inputClassName={input}
            placeholder="e.g. Tonda Métrographe"
          />
        </div>
        <div>
          {/* Consolidation ruling 2026-08-06: the Rolex corridor accepts both
              a canonical reference (79173) and a documented Style
              (R79173327B6252), so its label says so. Identifier behavior
              itself is unchanged. */}
          <label className={label}>
            {profile ? "Rolex Reference / Style" : "Reference number"}
          </label>
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
          {/* Rolex identifier status (Style-number ruling 2026-08-06).
              Recognition and documentation are SEPARATE facts: a recognized
              identifier always states that documentation is still unproven,
              in the two ruled voices. An unsupported structure preserves the
              entry and stops with governed copy — never a claim that the
              value is unknown to Rolex. */}
          {identifier?.kind === "reference" && (
            <div className="mt-2 text-[11px] uppercase tracking-[1.2px] leading-[1.8]">
              <div className="text-[var(--gold)]">{ROLEX_REFERENCE_RECOGNIZED}</div>
              <div className="text-[var(--muted)]">{ROLEX_REFERENCE_DOC_FLAG}</div>
            </div>
          )}
          {identifier?.kind === "style" && (
            <div className="mt-2 text-[11px] uppercase tracking-[1.2px] leading-[1.8]">
              <div className="text-[var(--gold)]">{ROLEX_STYLE_RECOGNIZED}</div>
              <div className="text-[var(--platinum-dim)]">
                {rolexStyleReferenceLine(identifier.reference)}
              </div>
              <div className="text-[var(--muted)]">{ROLEX_STYLE_DOC_FLAG}</div>
            </div>
          )}
          {identifierStopped && (
            <p
              role="alert"
              className="mt-2 border-l-2 border-[var(--border-gold)] pl-3 text-[12px] leading-[1.6] text-[var(--gold-subtle)]"
            >
              {ROLEX_IDENTIFIER_STOP} {ROLEX_IDENTIFIER_STOP_DETAIL}
            </p>
          )}
        </div>
        <div>
          <label className={label}>Year</label>
          <input className={input} value={draft.year} onChange={(e) => patch({ year: e.target.value })} placeholder="e.g. 2021" />
        </div>
        <div className="relative">
          <div className="flex items-center">
            <label className={`${label} mb-0`}>Condition</label>
            {/* Condition-governance help in FairWatchTrade's ONE help
                language (Layout ruling 2026-08-06): the Search help's gold ?
                with its hover/focus/tap behavior and anchored speech bubble,
                via the shared HelpBubble — never a second question-mark
                design, never inline copy that expands the page. */}
            <HelpBubble
              label="Condition help"
              historyKey="fwtConditionHelp"
              title="One grade, honestly supported"
              /* The 36px hit target is centred on the label row, so its lower
                 half reached into the select below and the ? met the select's
                 focus ring — help read as part of the control. The lift clears
                 it while the ? stays on the label's own optical centre. The
                 shift is vertical only: the caret is pinned horizontally to
                 the trigger, so moving it sideways would drag the bubble's
                 approved geometry with it. Hit target, ? size and gold states
                 are untouched — transform moves the button, it does not
                 resize it, and the row height is unchanged so the select does
                 not move. */
              triggerClassName="-my-3 -translate-y-[5px]"
              /* Long-help CARD treatment (Layout correction 2026-08-06):
                 size, position, caret, copy, border, spacing and behavior all
                 preserved — the corner radius ALONE changes, to the moderate
                 rounded-card character of the approved reference. */
              bubbleClassName="left-0 right-0 top-[calc(100%+10px)] rounded-2xl sm:left-0 sm:right-auto sm:w-[390px]"
              caretClassName="left-[52px]"
            >
              <div className="text-[13px] leading-[1.5] text-[var(--muted)]">
                <p>
                  Condition is a factual claim, not sales language. Choose ONE
                  grade — never a range like &ldquo;good to excellent&rdquo; —
                  and your photographs and description must support it.
                </p>
                <p className="mt-2">
                  <span className="text-[var(--platinum-dim)]">Very Good</span>{" "}
                  means fully wearable and functioning, with honest
                  age-consistent wear and no undisclosed major defect that
                  would materially surprise a buyer.
                </p>
                <p className="mt-2">
                  Polishing, refinishing, repairs, service parts, replacement
                  components, corrosion, damage, and functional issues are
                  disclosed separately — condition does not establish
                  originality.
                </p>
                <p className="mt-2 border-t border-[var(--border-subtle)] pt-2 text-[12px]">
                  Material misgrading or material omission may violate the{" "}
                  <a
                    href="/terms#seller-responsibilities"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--gold)] underline"
                  >
                    FairWatchTrade Terms of Service — Seller Responsibilities
                  </a>
                  .
                </p>
              </div>
            </HelpBubble>
          </div>
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
        <div className="sm:col-span-2">
          <label className={label}>Asking price</label>
          {/* Amount and currency adjacent — one money fact, entered together.
              Editing EITHER value clears the confirmation below. */}
          <div className="grid grid-cols-[minmax(0,1fr)_128px] gap-3">
            <input
              className={input}
              value={draft.askingPrice}
              onChange={(e) => patch({ askingPrice: e.target.value, askingConfirmed: false })}
              placeholder="e.g. 7250"
              inputMode="decimal"
            />
            <select
              aria-label="Asking price currency"
              className={input}
              value={isSupportedCurrency(draft.askingCurrency) ? draft.askingCurrency : RECOMMENDED_CURRENCY}
              onChange={(e) => patch({ askingCurrency: e.target.value, askingConfirmed: false })}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code} style={OPTION_STYLE}>{c.code}</option>
              ))}
            </select>
          </div>

          {hasStoredPref === false && draft.askingCurrency === RECOMMENDED_CURRENCY && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--gold-subtle)]">
              <span className="border border-[var(--border-gold)] px-1.5 py-0.5 text-[11px] uppercase tracking-[1.2px]">
                Recommended
              </span>
              <span>No preference is set. USD is suggested, not silently saved.</span>
            </div>
          )}

          {draft.askingPrice.trim() !== "" && (
            <div className="mt-3 flex flex-col gap-3 border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              {askingParse.ok ? (
                <div className="text-[12px] leading-[1.5] text-[var(--platinum-dim)]">
                  List this watch for{" "}
                  <strong className="font-medium text-[var(--platinum)]">
                    {formatMoney(askingParse.amount, askingParse.currency)} {askingParse.currency}
                  </strong>
                  . Offers will use the same currency.
                </div>
              ) : (
                <div className="text-[12px] leading-[1.5] italic text-[var(--gold-subtle)]">
                  {askingParse.message}
                </div>
              )}
              <button
                type="button"
                disabled={confirmDisabled}
                onClick={() => patch({ askingConfirmed: true })}
                className={`shrink-0 border px-3.5 py-2 text-[11px] uppercase tracking-[1.2px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  draft.askingConfirmed
                    ? "border-[rgba(76,175,125,0.5)] text-[#7bc49c]"
                    : "border-[var(--gold)] text-[var(--gold)] hover:bg-[var(--gold-whisper)]"
                }`}
              >
                {draft.askingConfirmed
                  ? `${draft.askingCurrency} confirmed`
                  : `Use ${isSupportedCurrency(draft.askingCurrency) ? draft.askingCurrency : RECOMMENDED_CURRENCY}`}
              </button>
            </div>
          )}
          <p className="mt-2 text-[11px] leading-[1.5] text-[var(--muted)]">
            No conversion is performed. Choose the currency in which this watch is actually being offered.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <label className={label}>Brief provenance note</label>
        <textarea className={`${input} min-h-[72px]`} value={draft.provenanceNote} onChange={(e) => patch({ provenanceNote: e.target.value })} placeholder="Service history, previous ownership, how you acquired it…" spellCheck={false} />
      </div>

      {/* ── Brand admission — profile activation + entry conditions.
          Renders ONLY when Curation has identified a profile brand; every
          other seller sees exactly the pre-existing step. */}
      {profile && (
        <div className="mt-5">
          <div className="border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-3">
            <div className="text-[11px] uppercase tracking-[1.6px] text-[var(--gold-dim)]">
              {profile.brand} profile active
            </div>
            <p className="mt-1.5 text-[12px] leading-[1.6] text-[var(--muted)]">
              {profile.activationNote}
            </p>
          </div>

          <div className="mt-4 grid gap-4">
            {profile.entryConditions.map((c) => (
              <div key={c.key}>
                <BinaryChoice
                  label={c.prompt}
                  name={`admission-${c.key}`}
                  value={admission?.[c.key]}
                  onChange={(v) => setAdmission({ [c.key]: v })}
                  sentenceLegend
                />
                {admission?.[c.key] === false && (
                  <p
                    role="alert"
                    className="mt-2 border-l-2 border-[var(--border-gold)] pl-3 text-[12px] leading-[1.6] text-[var(--gold-subtle)]"
                  >
                    {c.stop}
                  </p>
                )}
              </div>
            ))}
          </div>

          {!entryConditionsMet && !entryStopped && (
            <p className="mt-4 text-[12px] text-[var(--muted)]">
              Answer both {profile.brand} entry conditions above to check
              eligibility.
            </p>
          )}
        </div>
      )}

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
        className={`mt-6 flex items-center gap-2 bg-[var(--cta-fill)] px-6 py-[13px] font-[Inter] text-[11px] font-normal uppercase tracking-[1.9px] text-[var(--on-cta)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${
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
    /* Every accepted upload is recorded, tagged or not. The old
       `.filter((m) => m.category)` silently dropped untagged photos on the way
       into the draft, so a seller who uploaded seven and tagged five kept five
       — the other two were live in the uploader and nowhere else, and any
       remount took them. Tagging is a separate act from keeping. */
    const photos: ListingPhoto[] = metas.map((m) => ({
      photo: { url: m.url, pathname: m.pathname },
      category: (m.category ?? "") as PhotoCategory | "",
      isWristShot: m.isWristShot,
      servicePublicOptIn: m.servicePublicOptIn === true,
      contentHash: m.contentHash,
    }));
    patch({ photos });
  }

  /* Brand admission: the photograph checklist changes for a profile brand.
     These are evidence, not decorative gallery suggestions. */
  const profile = requirementProfileFor(draft.brand);
  const missingViews = profile
    ? new Set(
        missingRequiredViews(
          profile,
          draft.photos.map((p) => p.category)
        ).map((v) => v.category)
      )
    : null;

  return (
    <div>
      <h2 className="mb-1 font-display text-[20px] font-light text-[var(--platinum)]">Photos</h2>
      {profile ? (
        <>
          <p className="mb-3 text-[13px] text-[var(--muted)]">
            Photograph the identity-bearing parts. {profile.brand} listings
            require {profile.requiredViews.length} labeled views; the score on
            the right climbs as you go.
          </p>
          <div className="mb-3 grid gap-1.5 sm:grid-cols-2">
            {profile.requiredViews.map((v) => {
              const done = !missingViews?.has(v.category);
              return (
                <div
                  key={v.category}
                  className="flex items-baseline gap-2 text-[12px]"
                >
                  <span
                    aria-hidden="true"
                    className={done ? "text-[var(--gold)]" : "text-[var(--muted)]"}
                  >
                    {done ? "✓" : "·"}
                  </span>
                  <span
                    className={done ? "text-[var(--platinum)]" : "text-[var(--muted)]"}
                  >
                    {v.view}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mb-6 text-[11px] leading-[1.6] text-[var(--muted)]">
            {profile.photosNote}
          </p>
        </>
      ) : (
        <>
          {/* The blocking requirement stands on its own line, bold, first —
              it is the one sentence that decides whether Continue works, and
              it was buried mid-paragraph in helper prose. Requirements
              themselves are unchanged; only their visibility is. */}
          <p className="mb-1 text-[13px] font-semibold text-[var(--platinum)]">
            Required: dial, caseback, clasp
            {draft.hasBracelet
              ? ", and a full shot with the strap/bracelet extended"
              : ""}
            .
          </p>
          <p className="mb-6 text-[13px] text-[var(--muted)]">
            Upload your shots and label each one. The score on the right climbs
            as you go.
          </p>
        </>
      )}

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
            ? "bg-[var(--gold-whisper)] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.2)]"
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
        <PhotoUpload
          ref={photoRef}
          onChange={onPhotos}
          /* The draft IS the photo store — hydrate the uploader from it so
             stepping back to Photos finds completed work instead of an empty
             mount that would wipe draft.photos (consolidation ruling
             2026-08-06, Jason's corridor-walk state loss). */
          initialPhotos={draft.photos.map((p) => ({
            url: p.photo.url,
            pathname: p.photo.pathname,
            category: p.category,
            isWristShot: p.isWristShot === true,
            servicePublicOptIn: p.servicePublicOptIn === true,
            contentHash: p.contentHash,
          }))}
          /* Context-gated tags (Photos-step ruling 2026-08-06): Service
             Evidence exists only in the Rolex corridor — it is the OR-half
             of "Movement or service evidence", so a solid-caseback watch is
             never opened for admission. Extra Links exists only while the
             bracelet checkbox is active — encouraged completeness evidence,
             NEVER required, never a gate anywhere. */
          extraCategories={[
            ...(profile ? ["Service Evidence"] : []),
            ...(draft.hasBracelet ? ["Extra Links"] : []),
          ]}
        />
      </div>
      {draft.hasBracelet && (
        <p className="mt-2 text-[11px] leading-[1.6] text-[var(--muted)]">
          Loose spare links included? An Extra Links photo is welcome
          completeness evidence — never required, and a fully sized bracelet
          may leave nothing separate to photograph.
        </p>
      )}
    </div>
  );
}
