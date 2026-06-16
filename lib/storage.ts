"use client";

import { upload } from "@vercel/blob/client";

export type UploadedPhoto = {
  url: string;
  pathname: string;
};

/* ────────────────────────────────────────────────────────────────────────
   STORAGE ABSTRACTION

   Everything that touches the storage backend lives in THIS FILE ONLY.
   Today  : Vercel Blob (client-direct upload — bypasses the 4.5MB serverless
            request limit, so large phone photos go straight to the bucket).
   Later  : to migrate to Cloudflare R2, rewrite ONLY the bodies of the two
            functions below. The upload form, the listing page, and the AI
            validation step never call the backend directly — they only ever
            call uploadPhoto() and getPhotoUrl(). Nothing else changes.
   ──────────────────────────────────────────────────────────────────────── */

export async function uploadPhoto(file: File): Promise<UploadedPhoto> {
  const result = await upload(`listings/${file.name}`, file, {
    access: "public",
    handleUploadUrl: "/api/upload",
    clientPayload: JSON.stringify({ kind: "listing-photo" }),
  });
  return { url: result.url, pathname: result.pathname };
}

export function getPhotoUrl(photo: UploadedPhoto): string {
  // Blob returns a full public URL on upload, so this is a pass-through today.
  // Under R2 you'd construct the URL from photo.pathname here instead.
  return photo.url;
}
