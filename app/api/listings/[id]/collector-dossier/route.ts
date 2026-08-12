import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCollectorDossierForListing } from "@/lib/dossier/collectorDossierService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServiceClient();

  // The service client bypasses RLS, so public eligibility is enforced here
  // explicitly before an artifact URL is exposed.
  const { data: listing, error } = await db
    .from("listings")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (
    error ||
    !listing ||
    (listing.status !== "published" && listing.status !== "reserved")
  ) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const dossier = await getCollectorDossierForListing(id);
  if (dossier.state !== "ready") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let url: URL;
  try {
    url = new URL(dossier.storageUrl);
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (url.protocol !== "https:") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.redirect(url, {
    status: 307,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
