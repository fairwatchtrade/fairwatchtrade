import { NextResponse } from "next/server";
import { deriveThumb } from "@/lib/media/presentationThumb";

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
const ALLOWED_PATH_PREFIX = "/listings/";
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
    url.pathname.startsWith(ALLOWED_PATH_PREFIX)
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  const src = new URL(request.url).searchParams.get("src");
  if (!src || !isAllowedSource(src)) {
    return NextResponse.json({ error: "invalid source" }, { status: 400 });
  }

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

    const thumb = await deriveThumb(source);
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
