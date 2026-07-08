import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SellerProfile, {
  type SellerCardListing,
  type SellerView,
} from "@/components/SellerProfile";

/* ────────────────────────────────────────────────────────────────────────
   SELLER PROFILE — app/sellers/[id]/page.tsx   (v1.66)

   Server component. Fetches the seller's profile + their published listings,
   computes the quality signal SERVER-SIDE, and passes ONLY display-safe data
   to the client component. The raw combined_score never crosses into client
   props — privacy invariant. (See PRIVACY note below.)

   Schema reality (confirmed against live Supabase, option (b) build):
     profiles: id, email, display_name, strikes, new_listings_paused_until,
               created_at   — NO location / house_style / collector_statement
     listings: seller_id (FK), combined_score, status, ...
   So: name = display_name; location/house_style omitted; collector_statement
   always renders its fallback; strikes & new_listings_paused_until NEVER read.

   NOTE on the Supabase client import: this assumes `@/lib/supabase/server`
   exposes `createClient()` (the App Router SSR pattern used elsewhere). If the
   project's server-client helper is named/located differently, adjust ONLY
   this import + the `createClient()` call — the rest is schema-correct.
   ──────────────────────────────────────────────────────────────────────── */

// Quality signal is PROSE ONLY, derived from the average combined_score of the
// seller's published listings. The number itself is never returned. Low/no
// data → null (the box is omitted; we never surface a negative signal).
function qualityTextFor(scores: number[]): string | null {
  if (!scores.length) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 70)
    return "Consistently detailed listings — thorough documentation and original photography throughout.";
  if (avg >= 40)
    return "Thorough where it counts — documentation and photography above the platform average.";
  return null; // below 40 → omit, never negative
}

export default async function SellerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

const { data: seller, error: sellerError } = await supabase
  .from("public_seller_profiles")
  .select("id, display_name, created_at")
  .eq("id", id)
  .single();

if (sellerError) {
  console.error("Seller profile query error:", {
    code: sellerError.code,
    message: sellerError.message,
  });
}

if (!seller) notFound();

  // Listings — FK is seller_id (confirmed). We select combined_score here ONLY
  // to compute the quality signal server-side; it is NOT forwarded to the card
  // data passed to the client.
  const { data: listingRows } = await supabase
    .from("listings")
    .select(
      "id, brand, model, reference, year, condition, asking_price, photos, details, combined_score"
    )
    .eq("seller_id", id)
    .eq("status", "published");

  const rows = listingRows ?? [];

  // Server-side quality computation; only the resulting string leaves the server.
  const qualityText = qualityTextFor(
    rows
      .map((r) => Number(r.combined_score))
      .filter((n) => Number.isFinite(n))
  );

  // Strip combined_score before handing listings to the client. The cards never
  // need it and it must not appear in the serialized props.
  const cardListings: SellerCardListing[] = rows.map((r) => ({
    id: r.id,
    brand: r.brand,
    model: r.model ?? null,
    reference: r.reference,
    year: r.year,
    condition: r.condition,
    asking_price: r.asking_price,
    photos: Array.isArray(r.photos) ? r.photos : [],
    details: r.details ?? null,
  }));

  // Completed sales: no transaction system yet → dormant. Pass 0 so the client
  // renders the "joined recently" note; the left-column stat shows a literal
  // dash regardless (never a number).
  const sellerView: SellerView = {
    id: seller.id,
    displayName: seller.display_name ?? "Seller",
    createdAt: seller.created_at,
  };

  return (
    <SellerProfile
      seller={sellerView}
      listings={cardListings}
      qualityText={qualityText}
      completedSales={0}
    />
  );
}
