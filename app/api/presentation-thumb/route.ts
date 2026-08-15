import { NextResponse } from "next/server";
import { clampWidth, deriveResized, deriveThumb } from "@/lib/media/presentationThumb";

/* Presentation thumbnail for Gallery cards: the listing photograph with its
   EMPTY source margins trimmed away (see lib/media/presentationThumb.ts for
   the governing law — originals untouched, watch content untouchable, safe
   margin retained, trust-gated fallback).

   Composed at read time — no stored derivative, no second copy of the
   photograph anywhere. The CDN caches the response; blob pathnames carry a
   per-upload random suffix, so a URL's content never changes and the cache
   may be immutable.

   NOT an open proxy: only this project's own public listing photographs are
   ever fetched. Anything else is refused before any network I/O. */

export const runtime = "nodejs";

const ALLOWED_HOST_SUFFIX = ".public.blob.vercel-storage.com";
/* Our own public imagery only. Dealer logos sit beside listing photographs
   in the same bucket and are shown at 38px while stored at 512px, so they
   belong to the same derivation — nothing else does. */
const ALLOWED_PATH_PREFIXES = ["/listings/", "/dealer-logos/"];
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

export function isAllowedSource(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.hostname.endsWith(ALLOWED_HOST_SUFFIX) &&
    url.hostname.length > ALLOWED_HOST_SUFFIX.length &&
    ALLOWED_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const src = params.get("src");
  if (!src || !isAllowedSource(src)) {
    return NextResponse.json({ error: "invalid source" }, { status: 400 });
  }

  /* "fit" preserves the photograph's proportions exactly — for surfaces whose
     presentation is expressed in the original's own coordinate space (a
     seller-authored frame, the Collector row's rotation cover-scale). Default
     stays the margin trim the Gallery card was built for. */
  const fitOnly = params.get("mode") === "fit";
  const width = clampWidth(params.get("w"));

  try {
    const upstream = await fetch(src, { redirect: "error" });
    if (!upstream.ok) {
      return NextResponse.redirect(src, 302);
    }
    const length = Number(upstream.headers.get("content-length") ?? 0);
    if (length > MAX_SOURCE_BYTES) {
      return NextResponse.redirect(src, 302);
    }
    const source = Buffer.from(await upstream.arrayBuffer());
    if (source.byteLength === 0 || source.byteLength > MAX_SOURCE_BYTES) {
      return NextResponse.redirect(src, 302);
    }

    /* Both paths honour the requested width. The trim path used to ignore it
       and always emit THUMB_WIDTH, so a card asking for 720 received 480 and
       the parameter did nothing but fragment the CDN cache. */
    const thumb = fitOnly ? await deriveResized(source, width) : await deriveThumb(source, width);
    return new NextResponse(new Uint8Array(thumb.buffer), {
      status: 200,
      headers: {
        "Content-Type": thumb.contentType,
        // Immutable is safe: the src pathname is unique per upload.
        "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
        "X-Presentation-Trim": thumb.trimmed ? "1" : "0",
      },
    });
  } catch {
    /* Any failure — network, undecodable image, sharp — falls back to the
       untouched original. The card renders exactly as before derivation. */
    return NextResponse.redirect(src, 302);
  }
}
