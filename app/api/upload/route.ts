import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

// Server upload. With the Blob store connected via OIDC, put() authenticates
// automatically using BLOB_STORE_ID + the rotating VERCEL_OIDC_TOKEN that
// Vercel injects — NO BLOB_READ_WRITE_TOKEN required. (If that token is set
// in env, the SDK uses it INSTEAD of OIDC, so it must NOT be present.)
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "no file provided" }, { status: 400 });
    }

    // Listing photos must be publicly readable so buyers' browsers (and, later,
    // AI photo validation) can fetch them directly. Private access returns a
    // 403/Forbidden on the public URL, which breaks <img> rendering.
    const blob = await put(`listings/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true, // two IMG_0001.jpg files won't collide
    });

    return NextResponse.json({ url: blob.url, pathname: blob.pathname });
  } catch (error) {
    const message = error instanceof Error ? error.message : "upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
