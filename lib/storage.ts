"use client";

export type UploadedPhoto = {
  url: string;
  pathname: string;
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
  const prepared = await compressImage(file);
  const form = new FormData();
  form.append("file", prepared);

  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`upload failed (${res.status}) ${msg}`);
  }
  const data = (await res.json()) as UploadedPhoto;
  return { url: data.url, pathname: data.pathname };
}

export function getPhotoUrl(photo: UploadedPhoto): string {
  return photo.url; // pass-through today; construct from pathname under R2
}
