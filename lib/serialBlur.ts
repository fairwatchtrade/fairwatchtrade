import sharp from "sharp";
import { createHash } from "crypto";

/* ════════════════════════════════════════════════════════════════════════
   SERIAL BLUR — lib/serialBlur.ts   (Mobile Wizard 2A)

   The ONE positional privacy-blur transform, shared so the client-preview
   path (app/api/blur-serial) and the server-authoritative publication path
   (app/api/listings) apply BYTE-IDENTICAL processing — "the established
   positional privacy blur," never two copies that can drift.

   Position-based, no detection (locked GPT ruling):
     · Caseback       → bottom-center third (typical engraving zone)
     · Non-Crown Side → center horizontal band (case-side serials)
     · everything else → no region (caller leaves the photo untouched)

   This module owns the transform only (bytes → blurred bytes + hash). Fetch
   and upload/storage are the caller's job, because the two callers store
   differently (client path re-uploads via /api/upload with a random suffix;
   publication path writes a deterministic canonical blob).

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

/** The two serial-sensitive capture categories. Publication-safety and the
    wizard's blur trigger both key off this single list. */
export const SERIAL_BLUR_CATEGORIES = ["Caseback", "Non-Crown Side"] as const;

export function isSerialSensitiveCategory(category: string): boolean {
  return (SERIAL_BLUR_CATEGORIES as readonly string[]).includes(category);
}

type BlurRegion = { left: number; top: number; width: number; height: number };

export function regionFor(category: string, width: number, height: number): BlurRegion | null {
  if (category === "Caseback") {
    // Bottom-center third — where casebacks typically carry engravings.
    return {
      left: Math.floor(width * 0.2),
      top: Math.floor(height * 0.65),
      width: Math.floor(width * 0.6),
      height: Math.floor(height * 0.25),
    };
  }
  if (category === "Non-Crown Side") {
    // Center horizontal band — where case-side serials appear.
    return {
      left: Math.floor(width * 0.1),
      top: Math.floor(height * 0.4),
      width: Math.floor(width * 0.8),
      height: Math.floor(height * 0.2),
    };
  }
  return null;
}

/** Apply the positional blur to raw image bytes. Returns the processed JPEG
    bytes plus their sha256, or null when the category has no blur region (or
    the computed region is too small to be meaningful) — in which case the
    caller keeps the original untouched. Throws only on genuine sharp/decoding
    failure; callers decide whether that failure blocks or fails open. */
export async function blurSerialBuffer(
  source: Buffer,
  category: string
): Promise<{ buffer: Buffer; hash: string } | null> {
  const metadata = await sharp(source).metadata();
  const width = metadata.width ?? 800;
  const height = metadata.height ?? 800;

  const region = regionFor(category, width, height);
  if (!region || region.width < 8 || region.height < 8) return null;

  const blurredRegion = await sharp(source).extract(region).blur(12).toBuffer();
  const processed = await sharp(source)
    .composite([{ input: blurredRegion, left: region.left, top: region.top }])
    .jpeg({ quality: 92 })
    .toBuffer();

  const hash = createHash("sha256").update(processed).digest("hex");
  return { buffer: processed, hash };
}
