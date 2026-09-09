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

  /* v8.31 — dealer admission is a founder act. This route EDITS the identity
     row of an already-admitted dealer; it never creates one. The former
     "imported media counts as dealer" branch is gone: having Accelerator
     photographs is not admission, and the database no longer lets any
     client insert a dealer_profiles row at all (migration
     20260909120000). The row is minted only by dealer_profile_admit(),
     service_role-only, from the founder-gated admin route. */
  const [{ data: profile }, { data: dealer }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    supabase
      .from("dealer_profiles")
      .select("seller_id,slug,business_name,logo_url,logo_path,location,tagline")
      .eq("seller_id", user.id)
      .maybeSingle(),
  ]);

  if (!dealer) {
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
    slug,
    business_name: businessName,
    location: boundedText(body.location, 120),
    tagline: boundedText(body.tagline, 240),
    updated_at: new Date().toISOString(),
  };

  /* UPDATE of the caller's own row, never upsert: an upsert is an INSERT
     with a conflict clause and needs the INSERT privilege the client no
     longer holds. The owner UPDATE policy scopes this to seller_id =
     auth.uid(); seller_id itself is outside the client UPDATE grant. */
  const { data, error } = await context.supabase
    .from("dealer_profiles")
    .update(next)
    .eq("seller_id", context.user.id)
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

  /* The logo joins an EXISTING admitted row (dealerContext refused anyone
     without one). Update of the two logo columns only — no upsert, no
     identity rewrite: the admitted business name and slug are not
     re-derived from a display name on a logo upload. */
  const { data, error } = await context.supabase
    .from("dealer_profiles")
    .update({
      logo_url: blob.url,
      logo_path: blob.pathname,
      updated_at: new Date().toISOString(),
    })
    .eq("seller_id", context.user.id)
    .select("slug,business_name,logo_url,location,tagline")
    .single();
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ dealer: data });
}
