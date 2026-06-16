"use client";

import { useEffect, useRef, useState } from "react";
import { uploadPhoto, type UploadedPhoto } from "@/lib/storage";

type Item = {
  id: string;
  name: string;
  previewUrl: string;
  status: "uploading" | "done" | "error";
  uploaded?: UploadedPhoto;
  error?: string;
};

export default function PhotoUpload({
  onChange,
}: {
  onChange?: (photos: UploadedPhoto[]) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onChange?.(
      items
        .filter((i) => i.status === "done" && i.uploaded)
        .map((i) => i.uploaded!)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);

    const incoming: Item[] = list.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      previewUrl: URL.createObjectURL(f),
      status: "uploading",
    }));
    setItems((prev) => [...prev, ...incoming]);

    await Promise.all(
      list.map(async (file, idx) => {
        const id = incoming[idx].id;
        try {
          const uploaded = await uploadPhoto(file);
          setItems((prev) =>
            prev.map((it) =>
              it.id === id ? { ...it, status: "done", uploaded } : it
            )
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : "upload failed";
          setItems((prev) =>
            prev.map((it) =>
              it.id === id ? { ...it, status: "error", error: msg } : it
            )
          );
        }
      })
    );
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  return (
    <div>
      <p className="mb-3 text-[12px] text-[#C9A84C]">
        Blur any visible serial numbers before uploading.
      </p>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? "border-[#C9A84C] bg-white/5"
            : "border-white/15 hover:border-white/30 hover:bg-white/5"
        }`}
      >
        <div className="text-[14px] font-medium text-[#E8E4DC]">
          Drop photos here, or click to browse
        </div>
        <div className="mt-1 text-[12px] text-[#8A8F9E]">
          JPG, PNG, or WebP · up to 15 MB each
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
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {items.map((it) => (
            <div
              key={it.id}
              className="relative aspect-square overflow-hidden rounded-md border border-white/10 bg-[#0D0F14]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={it.previewUrl}
                alt={it.name}
                className="h-full w-full object-cover"
              />

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

              {it.status === "done" && (
                <div className="absolute bottom-1 left-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-medium text-black">
                  ✓
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
          ))}
        </div>
      )}
    </div>
  );
}
