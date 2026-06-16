import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

// Generates the short-lived token the browser uses to upload directly to Blob.
// The token never reaches the client as a secret — it's scoped to one upload.
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, _clientPayload) => {
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/heic",
          ],
          addRandomSuffix: true, // two IMG_0001.jpg files won't collide
          maximumSizeInBytes: 15 * 1024 * 1024, // 15 MB ceiling per photo
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // Fires after a successful upload. Hook for AI validation / DB write
        // later. NOTE: does not fire on localhost (Vercel can't reach a local
        // webhook) — it works once deployed. No-op for now.
        console.log("photo uploaded:", blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
