import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { blurSerialBuffer } from "@/lib/serialBlur";

/* ════════════════════════════════════════════════════════════════════════
   BLUR SERIAL — app/api/blur-serial/route.ts   (v2.2 · Phase 5)

   Silent privacy processing on serial-adjacent photos. Position-based blur
   per the locked GPT ruling — no fake detection:
     · Caseback        → bottom-center region (typical engraving zone)
     · Non-Crown Side  → center horizontal band (case-side serials)
     · everything else → untouched, returned as-is

   THE SELLER IS NEVER TOLD. No blur announcements, no failure surfacing.
   Every failure path returns the ORIGINAL url — the listing never waits on,
   and can never be hurt by, image processing.

   Re-upload: uploadPhoto() in @/lib/storage is browser-only (canvas), so
   this route posts the processed JPEG straight to /api/upload — the same
   endpoint storage.ts uses — with the caller's cookies forwarded for auth.
   Contract observed from storage.ts: FormData field "file" → { url, pathname }.

   listing_media reconciliation: listingMediaId is OPTIONAL. During the
   wizard no row exists yet (rows are written server-side at publish), so the
   wizard omits it and swaps the processed URL into its draft directly. When
   an id IS provided (post-publish/admin reprocessing), the row is updated:
   privacy_review_status processed/failed + processed_hash.

   Requires the Node runtime — sharp is a native module.
   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";

async function markRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listingMediaId: string | null,
  status: "processed" | "failed",
  processedHash?: string
) {
  if (!listingMediaId) return;
  try {
    const update: Record<string, unknown> = { privacy_review_status: status };
    if (processedHash) update.processed_hash = processedHash;
    await supabase.from("listing_media").update(update).eq("id", listingMediaId);
  } catch {
    // Reconciliation metadata only — never worth failing the request over.
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let photoUrl = "";
  let category = "";
  let listingMediaId: string | null = null;

  try {
    const body = await req.json();
    photoUrl = typeof body.photoUrl === "string" ? body.photoUrl.trim() : "";
    category = typeof body.category === "string" ? body.category.slice(0, 64) : "";
    listingMediaId =
      typeof body.listingMediaId === "string" && body.listingMediaId.trim() !== ""
        ? body.listingMediaId.trim()
        : null;
  } catch {
    return NextResponse.json({ processedUrl: "", blurred: false });
  }

  if (!photoUrl) {
    return NextResponse.json({ processedUrl: "", blurred: false });
  }

  try {
    // Fetch the original from storage.
    const imgRes = await fetch(photoUrl);
    if (!imgRes.ok) throw new Error(`fetch ${imgRes.status}`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // The shared, established positional blur (lib/serialBlur) — byte-identical
    // to the transform the publication path applies server-side.
    const result = await blurSerialBuffer(buffer, category);
    if (!result) {
      // No blur strategy for this category — untouched, honestly.
      return NextResponse.json({ processedUrl: photoUrl, blurred: false });
    }
    const processed = result.buffer;
    const processedHash = result.hash;

    // Re-upload via the same endpoint the client uses (uploadPhoto is
    // browser-only). Cookies forwarded so /api/upload sees the same seller.
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(processed)], { type: "image/jpeg" }),
      "processed.jpg"
    );
    const uploadRes = await fetch(new URL("/api/upload", req.url), {
      method: "POST",
      body: form,
      headers: { cookie: req.headers.get("cookie") ?? "" },
    });
    if (!uploadRes.ok) throw new Error(`upload ${uploadRes.status}`);
    const uploaded = (await uploadRes.json()) as { url?: string; pathname?: string };
    if (!uploaded.url) throw new Error("upload returned no url");

    await markRow(supabase, listingMediaId, "processed", processedHash);

    return NextResponse.json({
      processedUrl: uploaded.url,
      pathname: uploaded.pathname ?? "",
      blurred: true,
    });
  } catch {
    // Silent by design: original stands, status recorded for reconciliation,
    // the seller never hears about it and the listing never waits.
    await markRow(supabase, listingMediaId, "failed");
    return NextResponse.json({ processedUrl: photoUrl, blurred: false });
  }
}
