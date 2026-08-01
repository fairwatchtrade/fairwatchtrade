"use client";

import {
  type CaptureMetadata,
  emptyCaptureMetadata,
  readCaptureMetadata,
} from "@/lib/photoForensics";

export type UploadedPhoto = {
  url: string;
  pathname: string;
  /* Read from the seller's ORIGINAL file before compression — see the note on
     compressImage below. Optional so photos uploaded before this existed
     still typecheck and still render. */
  capture?: CaptureMetadata;
};

/* ────────────────────────────────────────────────────────────────────────
   STORAGE ABSTRACTION

   Everything that touches storage lives in THIS FILE + /api/upload only.
   Today  : Vercel Blob via a server route (OIDC auth — NO token needed).
            Photos are compressed client-side first, which keeps them under
            Vercel's 4.5MB server-upload limit and normalizes listing images.
   Later  : to migrate to Cloudflare R2, rewrite uploadPhoto()/getPhotoUrl()
            here (and the /api/upload route). Nothing else changes.
   ──────────────────────────────────────────────────────────────────────── */

/* ⚠ THIS FUNCTION DESTROYS EVIDENCE — BY DESIGN, AND IRREVERSIBLY.

   canvas.toBlob() re-encodes from raw pixels, so EVERY piece of metadata the
   seller's camera wrote — make, model, capture time, lens — is gone the
   moment this runs. For a long time that meant every FairWatch photograph
   arrived looking exactly like a photograph pulled off a website, and the
   absence of EXIF told us nothing because it was absent for everybody.

   Anything forensic must therefore be read from the ORIGINAL File BEFORE
   this is called. See uploadPhoto() below, and lib/photoForensics.ts.

   The compression itself stays: it keeps uploads under Vercel's 4.5MB server
   limit and normalizes listing images. It is the metadata loss that was the
   accident, not the resize. */
async function compressImage(
  file: File,
  maxDim = 2400,
  quality = 0.85
): Promise<File> {
  // Only raster types the canvas can read; anything else uploads as-is.
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob(res, "image/jpeg", quality)
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file; // if anything fails, fall back to the original file
  }
}

export async function uploadPhoto(file: File): Promise<UploadedPhoto> {
  /* ORDER IS LOAD-BEARING. Read the forensics from the seller's original
     file FIRST — compressImage() below permanently erases it. A failure here
     must never block a seller from listing, so it degrades to empty metadata
     rather than throwing. */
  let capture: CaptureMetadata;
  try {
    capture = await readCaptureMetadata(file);
  } catch {
    capture = emptyCaptureMetadata();
  }

  const prepared = await compressImage(file);
  const form = new FormData();
  form.append("file", prepared);

  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`upload failed (${res.status}) ${msg}`);
  }
  const data = (await res.json()) as UploadedPhoto;
  return { url: data.url, pathname: data.pathname, capture };
}

export function getPhotoUrl(photo: UploadedPhoto): string {
  return photo.url; // pass-through today; construct from pathname under R2
}
