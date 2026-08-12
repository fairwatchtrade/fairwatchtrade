import { put } from "@vercel/blob";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_LOGO_BYTES = 4 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["png", "jpeg", "webp"]);

type DealerProfileRow = {
  seller_id: string;
  slug: string;
  business_name: string;
  logo_url: string | null;
  logo_path: string | null;
  location: string | null;
  tagline: string | null;
};

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean ? clean.slice(0, max) : null;
}

async function dealerContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" as const };

  const [{ data: profile }, { data: dealer }, { data: importedMedia }] =
    await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", user.id).single(),
      supabase
        .from("dealer_profiles")
        .select("seller_id,slug,business_name,logo_url,logo_path,location,tagline")
        .eq("seller_id", user.id)
        .maybeSingle(),
      supabase
        .from("listing_media")
        .select("id")
        .eq("capture_source", "dealer_import")
        .limit(1),
    ]);

  if (!dealer && (importedMedia ?? []).length === 0) {
    return { error: "dealer_required" as const };
  }

  return {
    supabase,
    user,
    profile,
    dealer: (dealer as DealerProfileRow | null) ?? null,
  };
}

async function availableSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requested: string,
  userId: string
): Promise<string> {
  const base = slugify(requested) || `dealer-${userId.slice(0, 8)}`;
  const { data: existing } = await supabase
    .from("dealer_profiles")
    .select("seller_id")
    .eq("slug", base)
    .maybeSingle();
  return !existing || existing.seller_id === userId
    ? base
    : `${base.slice(0, 71)}-${userId.slice(0, 8)}`;
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const context = await dealerContext();
  if ("error" in context) {
    return NextResponse.json(
      { error: context.error },
      { status: context.error === "not_authenticated" ? 401 : 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const businessName = boundedText(body.businessName, 120);
  if (!businessName) {
    return NextResponse.json({ error: "business_name_required" }, { status: 400 });
  }

  const slug = await availableSlug(
    context.supabase,
    boundedText(body.slug, 80) ?? businessName,
    context.user.id
  );
  const next = {
    seller_id: context.user.id,
    slug,
    business_name: businessName,
    location: boundedText(body.location, 120),
    tagline: boundedText(body.tagline, 240),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await context.supabase
    .from("dealer_profiles")
    .upsert(next, { onConflict: "seller_id" })
    .select("slug,business_name,logo_url,location,tagline")
    .single();
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ dealer: data });
}

export async function POST(request: Request): Promise<NextResponse> {
  const context = await dealerContext();
  if ("error" in context) {
    return NextResponse.json(
      { error: context.error },
      { status: context.error === "not_authenticated" ? 401 : 403 }
    );
  }

  const form = await request.formData();
  const file = form.get("logo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "logo_required" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: "logo_size" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(bytes).metadata().catch(() => null);
  if (
    !metadata?.format ||
    !ALLOWED_FORMATS.has(metadata.format) ||
    !metadata.width ||
    !metadata.height ||
    metadata.width < 64 ||
    metadata.height < 64 ||
    metadata.width > 4096 ||
    metadata.height > 4096
  ) {
    return NextResponse.json({ error: "logo_format" }, { status: 400 });
  }

  const extension = metadata.format === "jpeg" ? "jpg" : metadata.format;
  const contentType = metadata.format === "jpeg" ? "image/jpeg" : `image/${metadata.format}`;
  const pathname = `dealer-logos/${context.user.id}/public-logo.${extension}`;
  const blob = await put(pathname, bytes, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    cacheControlMaxAge: 31_536_000,
  });

  const businessName =
    context.dealer?.business_name ||
    boundedText(context.profile?.display_name, 120) ||
    "FairWatchTrade Dealer";
  const slug =
    context.dealer?.slug ||
    (await availableSlug(context.supabase, businessName, context.user.id));
  const { data, error } = await context.supabase
    .from("dealer_profiles")
    .upsert(
      {
        seller_id: context.user.id,
        slug,
        business_name: businessName,
        logo_url: blob.url,
        logo_path: blob.pathname,
        location: context.dealer?.location ?? null,
        tagline: context.dealer?.tagline ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "seller_id" }
    )
    .select("slug,business_name,logo_url,location,tagline")
    .single();
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ dealer: data });
}
