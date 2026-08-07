"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { randomUUID } from "@/lib/uuid";
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
const CATEGORY_OPTIONS: { value: string; required?: boolean }[] = [
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
};

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
    const categoryOptions = [
      ...CATEGORY_OPTIONS,
      ...(extraCategories ?? []).map((value) => ({ value } as { value: string; required?: boolean })),
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
      }))
    );
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      onChange?.(
        items
          .filter((i) => i.status === "done" && i.url)
          .map((i) => ({
            url: i.url!,
            pathname: i.pathname!,
            category: i.category,
            isWristShot: i.isWristShot,
            servicePublicOptIn: i.servicePublicOptIn === true,
          }))
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items]);

    const handleFiles = useCallback(async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (list.length === 0) return;

      const incoming: Item[] = list.map((f) => ({
        id: randomUUID(),
        name: f.name,
        previewUrl: URL.createObjectURL(f),
        status: "uploading",
        category: "",
        isWristShot: false,
      }));
      setItems((prev) => [...prev, ...incoming]);

      await Promise.all(
        list.map(async (file, idx) => {
          const id = incoming[idx].id;
          try {
            const uploaded = await uploadPhoto(file);
            setItems((prev) =>
              prev.map((it) =>
                it.id === id
                  ? { ...it, status: "done", url: uploaded.url, pathname: uploaded.pathname }
                  : it
              )
            );
          } catch (e) {
            const msg = e instanceof Error ? e.message : "upload failed";
            setItems((prev) =>
              prev.map((it) => (it.id === id ? { ...it, status: "error", error: msg } : it))
            );
          }
        })
      );
    }, []);

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
      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== id) return it;
          if (value === "Wrist shot") return { ...it, category: "Other", isWristShot: true };
          return { ...it, category: value as PhotoCategory | "", isWristShot: false };
        })
      );
    }

    function remove(id: string) {
      setItems((prev) => prev.filter((it) => it.id !== id));
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
                      {c.required ? `${c.value} *` : c.value}
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
                  <div className="text-[10px] leading-snug text-[var(--muted)]">
                    <p>
                      Service records, invoices, or timing results. Optional
                      supporting evidence — service documentation provided, not
                      verified by FairWatchTrade. Private by default: this
                      image stays off your public listing.
                    </p>
                    <label className="mt-1.5 flex items-start gap-1.5 text-[var(--platinum-dim)]">
                      <input
                        type="checkbox"
                        checked={it.servicePublicOptIn === true}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((p) =>
                              p.id === it.id
                                ? { ...p, servicePublicOptIn: e.target.checked }
                                : p
                            )
                          )
                        }
                        className="mt-[1px] accent-[#C9A84C]"
                      />
                      <span>Show this service document on my public listing</span>
                    </label>
                    <p className="mt-1 text-[var(--gold-subtle)]">
                      Before enabling, check the document for private
                      information: address, phone, email, billing ZIP, partial
                      payment or card details, account or customer numbers,
                      signatures, service or purchase prices, or anything else
                      you would not publish.
                    </p>
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
