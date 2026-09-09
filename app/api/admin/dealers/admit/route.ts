import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/* ════════════════════════════════════════════════════════════════════════
   ADMIT A DEALER — POST /api/admin/dealers/admit   (v8.31)

   The founder door to the one governed writer of dealer identity,
   public.dealer_profile_admit(). Since migration 20260909120000 no client
   role can insert a dealer_profiles row and no client can execute the
   function; only service_role can, and service_role is reached only from
   here, after the same hardcoded founder gate every admin route carries.

   Body: { sellerId, businessName, slug? }.
   Result: the admitted row's public identity, or the function's named
   refusal (unknown_account · already_admitted · slug_taken ·
   business_name_invalid) as a 409/400, never a 500 in disguise.

   This is a founder-operated primitive with no room yet. It is the
   authority seam the Tax Time shell (v8.30) depends on; a Marketplace
   Control control for it is a separate bounded flight. Until then the
   founder reaches it as they reach every admin route.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  if (user.id !== ADMIN_USER_ID) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { sellerId?: unknown; businessName?: unknown; slug?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const sellerId = typeof body.sellerId === "string" ? body.sellerId.trim() : "";
  const businessName = typeof body.businessName === "string" ? body.businessName.trim() : "";
  const slug = typeof body.slug === "string" && body.slug.trim() ? body.slug.trim() : null;
  if (!UUID.test(sellerId)) return NextResponse.json({ error: "seller_id_invalid" }, { status: 400 });
  if (businessName.length < 1 || businessName.length > 120) {
    return NextResponse.json({ error: "business_name_invalid" }, { status: 400 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const { data, error } = await service.rpc("dealer_profile_admit", {
    p_seller_id: sellerId,
    p_business_name: businessName,
    p_slug: slug,
    /* The admitting founder, from the session — never from the body. */
    p_admitted_by: user.id,
  });

  if (error) {
    const named = /^(unknown_account|already_admitted|slug_taken|business_name_invalid|seller_required)/.exec(error.message ?? "");
    if (named) {
      const code = named[1];
      const status = code === "already_admitted" || code === "slug_taken" ? 409 : 400;
      return NextResponse.json({ error: code }, { status });
    }
    return NextResponse.json({ error: "admit_failed", detail: error.message }, { status: 500 });
  }

  const row = data as { seller_id: string; slug: string; business_name: string; admitted_at: string } | null;
  return NextResponse.json(
    {
      admitted: row
        ? { sellerId: row.seller_id, slug: row.slug, businessName: row.business_name, admittedAt: row.admitted_at }
        : null,
    },
    { status: 201 }
  );
}
