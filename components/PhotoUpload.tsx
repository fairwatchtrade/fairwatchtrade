"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { randomUUID } from "@/lib/uuid";
import HelpBubble from "@/components/HelpBubble";
import { uploadPhoto } from "@/lib/storage";
import { type PhotoCategory } from "@/lib/scoring";
import WatchSpinner from "@/components/WatchSpinner";

/* Native <option> elements don't inherit the form's dark styling — when a
   <select> opens, the browser renders the option list with defaults (often a
   white menu), making our light --platinum option text invisible
   (white-on-white). Explicit hex bg + text fixes it; CSS variables are ignored
   for <option> in some browsers, so we use concrete values matching
   --surface / --platinum. */
const OPTION_STYLE: CSSProperties = {
  backgroundColor: "#141821",
  color: "#E8E4DC",
};

export type UploadedPhotoMeta = {
  url: string;
  pathname: string;
  category: PhotoCategory | "";
  isWristShot: boolean;
  /** Service Evidence only: deliberate public-display opt-in (default off). */
  servicePublicOptIn?: boolean;
  /** SHA-256 of the selected file's bytes — same-draft duplicate rejection
      only. Never fraud detection, never cross-listing recurrence. */
  contentHash?: string;
};

/* Parent can call uploadFiles() directly (used by the page-level drop guard),
   so uploads don't depend on which inner element catches the drop event. */
export type PhotoUploadHandle = { uploadFiles: (files: FileList) => void };

// The three mandatory categories (required:true) are pinned to the top in
// Dial → Caseback → Clasp/Pin Buckle order and shown with a trailing " *".
// IMPORTANT: `value` is the exact PhotoCategory string the scoring engine
// matches on — the " *" lives ONLY in the displayed label, never the value.
//
// ⚠️ KNOWN MISMATCH (flagged v2.0j, not fixed here): SellFlow.tsx's
// PHOTO_LAYER_MAP and this CATEGORY_OPTIONS list are not a perfect 1:1 set
// (e.g. "Wrist shot"/"Other"/"Bracelet/Strap" coverage differs). Left as-is
// intentionally — do not reconcile in this flight.
const CATEGORY_OPTIONS: { value: string; required?: boolean; label?: string }[] = [
  { value: "Dial", required: true },
  { value: "Caseback", required: true },
  { value: "Clasp/Pin Buckle", required: true },
  { value: "Non-Crown Side" },
  { value: "Crown Side" },
  { value: "Movement (closeup)" },
  { value: "Bracelet/Strap" },
  { value: "Full watch, strap/bracelet extended" },
  { value: "Box" },
  { value: "Papers/Warranty" },
  /* Service documentation for EVERY seller (2026-08-22 order) — the
     category "Service Evidence" already existed with exactly this
     semantic, ruled distinct from Papers/Warranty (identity docs vs
     evidence of service/repair/maintenance) and private-by-default via
     servicePublicOptIn. Reused rather than duplicated: a second stored
     value for the same concept would fork the taxonomy. Only the menu
     LABEL is the order's wording; the stored value stays the ruled one,
     so the Rolex corridor's requirement matching is untouched. */
  { value: "Service Evidence", label: "Service Receipt / Records" },
  { value: "Wrist shot" },
  { value: "Other" },
];

type Item = {
  id: string;
  name: string;
  previewUrl: string;
  status: "uploading" | "done" | "error";
  url?: string;
  pathname?: string;
  error?: string;
  category: PhotoCategory | "";
  isWristShot: boolean;
  /** Service Evidence only: the seller's deliberate opt-in to show the
      document publicly. PRIVATE BY DEFAULT — see lib/servicePhotoPrivacy. */
  servicePublicOptIn?: boolean;
  contentHash?: string;
};

/* SHA-256 over the exact selected bytes. Same-draft duplicate rejection only
   — deliberately NOT the Aubrey Check exact-hash index, which answers the
   cross-listing recurrence question server-side over retained bytes. Returns
   null if the platform withholds SubtleCrypto (non-secure context), and every
   caller treats null as "cannot tell, allow it". */
async function sha256OfFile(file: File): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

const PhotoUpload = forwardRef<PhotoUploadHandle, {
  onChange?: (photos: UploadedPhotoMeta[]) => void;
  /* Context-gated evidence tags appended to the base taxonomy (Photos-step
     ruling 2026-08-06): "Service Evidence" rides only in the Rolex corridor,
     "Extra Links" only while the bracelet checkbox is active. The base list
     and its required markers are untouched for every other seller. */
  extraCategories?: string[];
  /* Already-uploaded photos from the draft, so a seller returning to the
     Photos step finds their completed work instead of an empty uploader.
     The draft IS the photo store; this component hydrates from it and
     never wipes it on remount (consolidation ruling 2026-08-06 — Jason's
     corridor walk lost every photo by stepping back to Photos, because
     the fresh mount emitted an empty list over the populated draft). */
  initialPhotos?: UploadedPhotoMeta[];
}>(
  function PhotoUpload({ onChange, extraCategories, initialPhotos }, ref) {
    /* Deduped by value: the Rolex corridor still passes "Service Evidence"
       through extraCategories, and now the base list carries it too — one
       menu entry, not two. */
    const categoryOptions = [
      ...CATEGORY_OPTIONS,
      ...(extraCategories ?? [])
        .filter((value) => !CATEGORY_OPTIONS.some((c) => c.value === value))
        .map((value) => ({ value } as { value: string; required?: boolean; label?: string })),
    ];
    const [items, setItems] = useState<Item[]>(() =>
      (initialPhotos ?? []).map((p) => ({
        id: p.pathname || randomUUID(),
        name: p.pathname?.split("/").pop() ?? "photo",
        previewUrl: p.url,
        status: "done" as const,
        url: p.url,
        pathname: p.pathname,
        category: p.category,
        isWristShot: !!p.isWristShot,
        servicePublicOptIn: p.servicePublicOptIn === true,
        contentHash: p.contentHash,
      }))
    );
    const [dragging, setDragging] = useState(false);
    /* Seller-facing notice for a rejected same-draft duplicate. Ordinary
       feedback, not an accusation — the existing photo is never touched. */
    const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
    /* Which item's public-display attempt is currently showing the privacy
       warning card (Layout correction 2026-08-06). Escape and outside
       pointerdown dismiss WITHOUT enabling — only the explicit confirm
       enables. */
    const [publishWarnFor, setPublishWarnFor] = useState<string | null>(null);
    /* Measured placement for the privacy warning card. Like the help bubble,
       it anchors inside one narrow photo-grid cell, so it takes a real width
       and is then slid/flipped to stay inside the viewport — width is never
       crushed to solve collision. Only one card is open at a time. */
    const warnCardRef = useRef<HTMLDivElement | null>(null);
    const [warnAbove, setWarnAbove] = useState(false);
    const [warnShiftX, setWarnShiftX] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useLayoutEffect(() => {
      if (!publishWarnFor) {
        setWarnAbove(false);
        setWarnShiftX(0);
        return;
      }
      const card = warnCardRef.current;
      if (!card) return;
      const r = card.getBoundingClientRect();
      const margin = 12;
      let shift = 0;
      if (r.right > window.innerWidth - margin) {
        shift = r.right - (window.innerWidth - margin);
      }
      if (r.left - shift < margin) {
        shift = Math.max(0, r.left - margin);
      }
      if (shift !== 0) setWarnShiftX(shift);
      if (r.bottom > window.innerHeight - margin) {
        const anchor = card.parentElement?.getBoundingClientRect();
        if (anchor) {
          const spaceAbove = anchor.top;
          const spaceBelow = window.innerHeight - anchor.bottom;
          if (spaceAbove > spaceBelow && spaceAbove >= r.height + 22) {
            setWarnAbove(true);
          }
        }
      }
    }, [publishWarnFor]);

    useEffect(() => {
      if (!publishWarnFor) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setPublishWarnFor(null);
        }
      };
      const onPointerDown = (e: PointerEvent) => {
        const t = e.target as HTMLElement;
        if (t.closest?.("[data-publish-warning]")) return;
        setPublishWarnFor(null);
      };
      document.addEventListener("keydown", onKey);
      document.addEventListener("pointerdown", onPointerDown);
      return () => {
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("pointerdown", onPointerDown);
      };
    }, [publishWarnFor]);

    /* ── Reaching the draft must not depend on still being mounted ─────────
       An upload resolves on its own clock. If the Photos step has unmounted
       by then — a step change, or the help-history kick-out — React discards
       the setItems and the items-derived effect below never runs, so a photo
       that finished uploading is in Blob storage and in NO listing state at
       all. That is the in-flight loss around the old line 184.

       itemsRef is the authoritative list and is updated SYNCHRONOUSLY at
       every mutation, so parallel uploads in one Promise.all each see the
       latest value instead of racing a stale closure. onChangeRef keeps the
       parent callback reachable after unmount — SellFlow itself stays mounted
       while the step content swaps, so the draft is still there to write to.
       The draft remains the one photo store; nothing here is a second one. */
    const itemsRef = useRef<Item[]>(items);
    const onChangeRef = useRef(onChange);
    useEffect(() => {
      onChangeRef.current = onChange;
    });

    const emitFrom = useCallback((list: Item[]) => {
      onChangeRef.current?.(
        list
          .filter((i) => i.status === "done" && i.url)
          .map((i) => ({
            url: i.url!,
            pathname: i.pathname!,
            category: i.category,
            isWristShot: i.isWristShot,
            servicePublicOptIn: i.servicePublicOptIn === true,
            contentHash: i.contentHash,
          }))
      );
    }, []);

    useEffect(() => {
      itemsRef.current = items;
      emitFrom(items);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items]);

    /* Commit a list from anywhere — mounted or not. setItems is a no-op after
       unmount; the ref update and the emit are what actually preserve work. */
    const commit = useCallback(
      (next: Item[]) => {
        itemsRef.current = next;
        setItems(next);
        emitFrom(next);
      },
      [emitFrom]
    );

    const handleFiles = useCallback(
      async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
        if (list.length === 0) return;
        setDuplicateNotice(null);

        /* Same-draft duplicate check, BEFORE upload — the exact bytes decide,
           not the filename (a re-saved copy renames freely). Scope is this
           listing draft and nothing else: it answers "is this exact photo
           already in this listing?" and never asks a cross-listing question.
           Fail-open by construction — if hashing is unavailable the upload
           proceeds, because blocking a real photo is worse than allowing a
           duplicate. */
        const seen = new Set(
          itemsRef.current.map((i) => i.contentHash).filter(Boolean) as string[]
        );
        const accepted: { file: File; hash: string | null }[] = [];
        let rejected = 0;
        for (const file of list) {
          const hash = await sha256OfFile(file);
          if (hash && seen.has(hash)) {
            rejected += 1;
            continue;
          }
          if (hash) seen.add(hash); // also catches duplicates inside one batch
          accepted.push({ file, hash });
        }
        if (rejected > 0) {
          setDuplicateNotice(
            rejected === 1
              ? "This photo is already in your listing."
              : `${rejected} photos are already in your listing.`
          );
        }
        if (accepted.length === 0) return;

        const incoming: Item[] = accepted.map(({ file, hash }) => ({
          id: randomUUID(),
          name: file.name,
          previewUrl: URL.createObjectURL(file),
          status: "uploading",
          category: "",
          isWristShot: false,
          contentHash: hash ?? undefined,
        }));
        commit([...itemsRef.current, ...incoming]);

        await Promise.all(
          accepted.map(async ({ file }, idx) => {
            const id = incoming[idx].id;
            try {
              const uploaded = await uploadPhoto(file);
              commit(
                itemsRef.current.map((it) =>
                  it.id === id
                    ? { ...it, status: "done", url: uploaded.url, pathname: uploaded.pathname }
                    : it
                )
              );
            } catch (e) {
              const msg = e instanceof Error ? e.message : "upload failed";
              commit(
                itemsRef.current.map((it) =>
                  it.id === id ? { ...it, status: "error", error: msg } : it
                )
              );
            }
          })
        );
      },
      [commit]
    );

    useImperativeHandle(
      ref,
      () => ({
        uploadFiles: (files: FileList) => {
          setDragging(false);
          handleFiles(files);
        },
      }),
      [handleFiles]
    );

    function setCategory(id: string, value: string) {
      commit(
        itemsRef.current.map((it) => {
          if (it.id !== id) return it;
          if (value === "Wrist shot") return { ...it, category: "Other", isWristShot: true };
          return { ...it, category: value as PhotoCategory | "", isWristShot: false };
        })
      );
    }

    function remove(id: string) {
      commit(itemsRef.current.filter((it) => it.id !== id));
    }

    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
      >
        <p className="mb-3 text-[12px] text-[var(--gold)]">
          Blur any visible serial numbers before uploading.
        </p>

        <div
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center border px-6 py-10 text-center transition-colors ${
            dragging
              ? "border-[var(--gold)] bg-[var(--gold-whisper)]"
              : "border-[var(--border-gold)] hover:border-[var(--gold)] hover:bg-[var(--gold-whisper)]"
          }`}
        >
          <div className="text-[14px] font-medium text-[var(--platinum)]">
            Place your photograph here
          </div>
          <div className="mt-1 text-[12px] text-[var(--muted)]">
            JPG, PNG, or WebP · up to 15 MB each · label each one below
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {duplicateNotice && (
          /* Ordinary feedback, dismissible, and deliberately plain — the
             seller picked the same file twice, which is a slip, not a
             suspicion. The photo already in the listing is untouched. */
          <div
            role="status"
            className="mt-4 flex items-start gap-2.5 border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3.5 py-2.5"
          >
            <span className="flex-1 text-[12px] leading-[1.5] text-[var(--platinum-dim)]">
              {duplicateNotice}
            </span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setDuplicateNotice(null)}
              className="shrink-0 text-[16px] leading-none text-[var(--muted)] hover:text-[var(--platinum)]"
            >
              ×
            </button>
          </div>
        )}

        {items.length > 0 && (
          <div className="mb-3 mt-4 flex items-center gap-2.5 border border-l-[3px] border-[var(--border-gold)] border-l-[var(--gold)] bg-[var(--gold-whisper)] px-3.5 py-2.5">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#C9A84C"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
            <span className="text-[12.5px] font-medium tracking-[0.01em] text-[var(--gold)]">
              Tag every photo — it&apos;s what buyers look at first.
            </span>
          </div>
        )}

        {items.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((it) => (
              <div key={it.id} className="space-y-1.5">
                <div className="relative aspect-square overflow-hidden border border-[var(--border-subtle)] bg-[var(--ink)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.previewUrl} alt={it.name} className="h-full w-full object-cover" />
                  {it.status === "uploading" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                      <WatchSpinner size={20} />
                    </div>
                  )}
                  {it.status === "error" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-950/70 px-2 text-center text-[10px] text-red-200">
                      {it.error}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(it.id)}
                    aria-label="Remove photo"
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(0,0,0,0.6)] text-[12px] leading-none text-white hover:bg-black/80"
                  >
                    ×
                  </button>
                </div>

                <select
                  value={it.isWristShot ? "Wrist shot" : it.category}
                  onChange={(e) => setCategory(it.id, e.target.value)}
                  disabled={it.status !== "done"}
                  className={`w-full border bg-transparent px-2 py-1 text-[12px] text-[var(--platinum)] disabled:opacity-40 ${
                    it.category || it.isWristShot ? "border-[var(--border-subtle)]" : "border-[var(--border-gold)]"
                  }`}
                >
                  <option value="" style={OPTION_STYLE}>Tag photo…</option>
                  {categoryOptions.map((c) => (
                    <option key={c.value} value={c.value} style={OPTION_STYLE}>
                      {(c.label ?? c.value) + (c.required ? " *" : "")}
                    </option>
                  ))}
                </select>

                {it.category === "Full watch, strap/bracelet extended" && (
                  <p className="text-[10px] leading-snug text-[var(--muted)]">
                    Show the full strap/bracelet extended in one frame — open any
                    clasp fully, even if it won&apos;t lie flat.
                  </p>
                )}

                {it.category === "Non-Crown Side" && (
                  <p className="text-[10px] leading-snug text-[var(--muted)]">
                    The side opposite the crown — shows lug-to-lug length and case profile.
                  </p>
                )}
                {it.category === "Crown Side" && (
                  <p className="text-[10px] leading-snug text-[var(--muted)]">
                    The crown side — shows the crown, pushers, and case finishing at 3 o&apos;clock.
                  </p>
                )}
                {it.category === "Service Evidence" && (
                  <div className="relative text-[10px] leading-snug text-[var(--muted)]">
                    {/* Instructional copy lives in the ONE shared help bubble
                        (Layout ruling 2026-08-06). The opt-in checkbox and
                        its warning are a CONSENT affordance, not help — they
                        stay inline, visible before the choice is made. */}
                    <div className="flex items-center">
                      <span>Service records, invoices, or timing results.</span>
                      <HelpBubble
                        label="Service Evidence help"
                        historyKey="fwtServiceEvidenceHelp"
                        title="Optional supporting evidence"
                        triggerClassName="-my-3"
                        /* A REAL width at every breakpoint. This bubble
                           anchors inside one photo-grid CELL (~150px on a
                           phone), and the old left-0/right-0 mobile
                           geometry made the cell's width the card's width —
                           the production long-and-skinny strip. The card
                           now keeps a readable width and HelpBubble's
                           measured clamp slides it into the viewport. */
                        bubbleClassName="left-0 top-[calc(100%+10px)] w-[min(320px,calc(100vw-24px))]"
                        caretClassName="left-[18px]"
                      >
                        <div className="text-[13px] leading-[1.5] text-[var(--muted)]">
                          <p>
                            Service evidence is optional and never required —
                            it can strengthen your listing, and a solid
                            caseback never needs to be opened for admission.
                          </p>
                          <p className="mt-2">
                            Uploading a document means service documentation
                            provided, not verified by FairWatchTrade.
                          </p>
                          <p className="mt-2">
                            Private by default: this image stays off your
                            public listing unless you deliberately choose to
                            show it below.
                          </p>
                        </div>
                      </HelpBubble>
                    </div>
                    {/* The checkbox stays visible before the choice; the long
                        privacy warning is NOT permanent inline copy — it
                        appears in the rounded floating card when the seller
                        ATTEMPTS to enable public display, and only its
                        explicit confirm actually enables (Layout correction
                        2026-08-06; the consent ruling's warn-before-enable is
                        preserved — strengthened: enabling now passes THROUGH
                        the warning). Unchecking never warns. */}
                    <label className="mt-1.5 flex items-start gap-1.5 text-[var(--platinum-dim)]">
                      <input
                        type="checkbox"
                        checked={it.servicePublicOptIn === true}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPublishWarnFor(it.id);
                          } else {
                            commit(
                              itemsRef.current.map((p) =>
                                p.id === it.id ? { ...p, servicePublicOptIn: false } : p
                              )
                            );
                          }
                        }}
                        className="mt-[1px] accent-[#C9A84C]"
                      />
                      <span>Show this service document on my public listing</span>
                    </label>
                    {publishWarnFor === it.id && (
                      <div
                        ref={warnCardRef}
                        role="dialog"
                        aria-label="Before showing this service document publicly"
                        data-publish-warning
                        className="absolute left-0 top-[calc(100%+10px)] z-30 w-[min(320px,calc(100vw-24px))] rounded-2xl border border-[rgba(201,168,76,0.48)] bg-[#12161e] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.5)] sm:p-[18px]"
                        style={{
                          ...(warnAbove
                            ? { top: "auto", bottom: "calc(100% + 10px)" }
                            : null),
                          ...(warnShiftX !== 0
                            ? { transform: `translateX(${-warnShiftX}px)` }
                            : null),
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={
                            warnShiftX !== 0
                              ? { transform: `translateX(${warnShiftX}px) rotate(45deg)` }
                              : undefined
                          }
                          className={`absolute left-[18px] h-[18px] w-[18px] rotate-45 border-[rgba(201,168,76,0.48)] bg-[#12161e] ${
                            warnAbove
                              ? "bottom-[-10px] border-b border-r"
                              : "top-[-10px] border-l border-t"
                          }`}
                        />
                        <button
                          type="button"
                          aria-label="Close without showing publicly"
                          onClick={() => setPublishWarnFor(null)}
                          className="absolute right-2 top-1 text-[20px] leading-none text-[var(--muted)] hover:text-[var(--platinum)]"
                        >
                          ×
                        </button>
                        <h2 className="mb-2 mr-8 font-display text-[20px] font-light text-[var(--platinum)]">
                          Check it before you show it
                        </h2>
                        <p className="text-[13px] leading-[1.5] text-[var(--muted)]">
                          Before enabling, check the document for private
                          information: address, phone, email, billing ZIP,
                          partial payment or card details, account or customer
                          numbers, signatures, service or purchase prices, or
                          anything else you would not publish.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            commit(
                              itemsRef.current.map((p) =>
                                p.id === it.id ? { ...p, servicePublicOptIn: true } : p
                              )
                            );
                            setPublishWarnFor(null);
                          }}
                          className="mt-3 border border-[var(--gold)] px-3.5 py-2 text-[11px] uppercase tracking-[1.5px] text-[var(--gold)] hover:bg-[var(--gold-whisper)]"
                        >
                          I checked it — show it publicly
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {it.category === "Extra Links" && (
                  <p className="text-[10px] leading-snug text-[var(--muted)]">
                    Loose spare links included with the watch. Welcome
                    completeness evidence — never required.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);

export default PhotoUpload;
