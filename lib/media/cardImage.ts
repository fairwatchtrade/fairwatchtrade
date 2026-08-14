/* ════════════════════════════════════════════════════════════════════════
   CARD IMAGE SOURCE — one derivation door for every small-image surface

   A card that paints a watch at 341×140 has no business transferring the
   1800×2400 original. The derivation already existed for the mobile Gallery
   card; this is the single helper every small surface asks through, so the
   strategy stays one strategy instead of a per-page habit.

   MODES

   "trim"  (default) — empty source margins removed, watch made larger inside
           the card's frame. For surfaces that present the photograph with
           object-contain and no authored geometry.

   "fit"   — proportions preserved exactly, bytes reduced only. For surfaces
           whose presentation is expressed against the photograph's own
           coordinate space: a seller-authored frame, or the Collector row's
           rotation cover-scale. Trimming those would move framing the seller
           approved, so they get the smaller bytes and none of the crop.

   Full-resolution originals are untouched and still served wherever real
   inspection happens — the listing hero and the photo inspection overlay.
   Only card-sized contexts route through here.

   Anything that is not one of our own public images is returned unchanged.
   ════════════════════════════════════════════════════════════════════════ */

import type { AllowedWidth } from "@/lib/media/presentationThumb";

const DERIVABLE = [
  ".public.blob.vercel-storage.com/listings/",
  ".public.blob.vercel-storage.com/dealer-logos/",
];

export type CardImageOptions = {
  /** Preserve proportions exactly (no margin trim). */
  mode?: "trim" | "fit";
  /** Requested derivative width. The route allowlists these. */
  width?: AllowedWidth;
};

export function cardImageSrc(url: string, options: CardImageOptions = {}): string {
  if (!url || !DERIVABLE.some((fragment) => url.includes(fragment))) return url;

  const params = new URLSearchParams({ src: url });
  if (options.mode === "fit") params.set("mode", "fit");
  if (options.width) params.set("w", String(options.width));
  return `/api/presentation-thumb?${params.toString()}`;
}
