"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { uploadPhoto } from "@/lib/storage";
import { type PhotoCategory } from "@/lib/scoring";

export type UploadedPhotoMeta = {
  url: string;
  pathname: string;
  category: PhotoCategory | "";
  isWristShot: boolean;
};

/* Parent can call uploadFiles() directly (used by the page-level drop guard),
   so uploads don't depend on which inner element catches the drop event. */
export type PhotoUploadHandle = { uploadFiles: (files: FileList) => void };

// The three mandatory categories (required:true) are pinned to the top in
// Dial → Caseback → Clasp/Pin Buckle order and shown with a trailing " *".
// IMPORTANT: `value` is the exact PhotoCategory string the scoring engine
// matches on — the " *" lives ONLY in the displayed label, never the value.
const CATEGORY_OPTIONS: { value: string; required?: boolean }[] = [
  { value: "Dial", required: true },
  { value: "Caseback", required: true },
  { value: "Clasp/Pin Buckle", required: true },
  { value: "Side/Lugs" },
  { value: "Movement" },
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
};

const PhotoUpload = forwardRef<PhotoUploadHandle, { onChange?: (photos: UploadedPhotoMeta[]) => void }>(
  function PhotoUpload({ onChange }, ref) {
    const [items, setItems] = useState<Item[]>([]);
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
          }))
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items]);

    const handleFiles = useCallback(async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (list.length === 0) return;

      const incoming: Item[] = list.map((f) => ({
        id: crypto.randomUUID(),
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
        <p className="mb-3 text-[12px] text-[#C9A84C]">
          Blur any visible serial numbers before uploading.
        </p>

        <div
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragging
              ? "border-[#C9A84C] bg-[#C9A84C]/10"
              : "border-[#C9A84C]/40 hover:border-[#C9A84C]/70 hover:bg-white/5"
          }`}
        >
          <div className="text-[14px] font-medium text-[#E8E4DC]">
            Drop photos here, or click to browse
          </div>
          <div className="mt-1 text-[12px] text-[#8A8F9E]">
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
          <div className="mb-3 mt-4 flex items-center gap-2.5 rounded-lg border border-[#C9A84C]/30 border-l-[3px] border-l-[#C9A84C] bg-[#C9A84C]/10 px-3.5 py-2.5">
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
            <span className="text-[12.5px] font-medium tracking-[0.01em] text-[#C9A84C]">
              Tag every photo — it&apos;s what buyers look at first.
            </span>
          </div>
        )}

        {items.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((it) => (
              <div key={it.id} className="space-y-1.5">
                <div className="relative aspect-square overflow-hidden rounded-md border border-white/10 bg-[#0D0F14]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.previewUrl} alt={it.name} className="h-full w-full object-cover" />
                  {it.status === "uploading" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white/90" />
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
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[12px] leading-none text-white hover:bg-black/80"
                  >
                    ×
                  </button>
                </div>

                <select
                  value={it.isWristShot ? "Wrist shot" : it.category}
                  onChange={(e) => setCategory(it.id, e.target.value)}
                  disabled={it.status !== "done"}
                  className={`w-full rounded-md border bg-[#0D0F14] px-2 py-1 text-[12px] text-[#E8E4DC] disabled:opacity-40 ${
                    it.category || it.isWristShot ? "border-white/15" : "border-[#C9A84C]/60"
                  }`}
                >
                  <option value="">Label…</option>
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.required ? `${c.value} *` : c.value}
                    </option>
                  ))}
                </select>

                {it.category === "Full watch, strap/bracelet extended" && (
                  <p className="text-[10px] leading-snug text-[#8A8F9E]">
                    Show the full strap/bracelet extended in one frame — open any
                    clasp fully, even if it won&apos;t lie flat.
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
