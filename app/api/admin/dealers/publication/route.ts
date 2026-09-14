import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  if (user.id !== ADMIN_USER_ID) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { sellerId?: unknown; enabled?: unknown };
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_body");
    body = parsed;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const sellerId = typeof body.sellerId === "string" ? body.sellerId.trim() : "";
  if (!UUID.test(sellerId)) return NextResponse.json({ error: "seller_id_invalid" }, { status: 400 });
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "enabled_invalid" }, { status: 400 });

  try {
    const service = createServiceClient();
    const { data, error } = await service.from("dealer_profiles")
      .update({ public_room_enabled: body.enabled })
      .eq("seller_id", sellerId)
      .select("seller_id,slug,business_name,public_room_enabled")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "publication_unconfirmed" }, { status: 500 });
    if (!data) return NextResponse.json({ error: "dealer_not_found" }, { status: 404 });
    return NextResponse.json({ dealer: data });
  } catch {
    return NextResponse.json({ error: "publication_unconfirmed" }, { status: 500 });
  }
}
