"use client";

import { useState } from "react";
import PhotoUpload from "@/components/PhotoUpload";
import { type UploadedPhoto } from "@/lib/storage";

export default function PhotoTestPage() {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);

  return (
    <main className="min-h-screen bg-[#0D0F14] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 text-xl font-medium text-[#E8E4DC]">
          Photo upload test
        </h1>
        <p className="mb-6 text-[13px] text-[#8A8F9E]">
          Throwaway page for testing the upload flow. Not linked from anywhere.
        </p>

        <PhotoUpload onChange={setPhotos} />

        {photos.length > 0 && (
          <div className="mt-6 text-[12px] text-[#8A8F9E]">
            <div className="mb-1">
              {photos.length} uploaded URL{photos.length > 1 ? "s" : ""} (click to verify in Blob):
            </div>
            <ul className="space-y-1 break-all">
              {photos.map((p) => (
                <li key={p.pathname}>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#C9A84C] underline"
                  >
                    {p.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
