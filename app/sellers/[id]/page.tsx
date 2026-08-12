import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BrowseClient, {
  type DealerBrowseScope,
  type ListingRow as BrowseListingRow,
} from "@/components/BrowseClient";
import SellerProfile, {
  type SellerCardListing,
  type SellerView,
} from "@/components/SellerProfile";

type DealerProfile = {
  seller_id: string;
  slug: string;
  business_name: string;
  logo_url: string | null;
  location: string | null;
  tagline: string | null;
};

function qualityTextFor(scores: number[]): string | null {
  if (!scores.length) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 70)
    return "Consistently detailed listings — thorough documentation and original photography throughout.";
  if (avg >= 40)
    return "Thorough where it counts — documentation and photography above the platform average.";
  return null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export default async function SellerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // A Dealer Room is the dealer branch of the existing public seller route.
  // UUID links remain compatible, but resolve to the stable public slug.
  const dealerQuery = supabase
    .from("dealer_profiles")
    .select("seller_id,slug,business_name,logo_url,location,tagline");
  const { data: dealerData } = isUuid(id)
    ? await dealerQuery.eq("seller_id", id).maybeSingle()
    : await dealerQuery.eq("slug", id.toLowerCase()).maybeSingle();
  const dealer = (dealerData as DealerProfile | null) ?? null;

  if (dealer) {
    if (id !== dealer.slug) redirect(`/sellers/${dealer.slug}`);

    // This is the normal public catalogue query with one immutable owner
    // constraint. BrowseClient owns search, filtering, facets, cards, view
    // modes, pagination, and listing-return continuity exactly as on /browse.
    const { data: listingRows, error } = await supabase
      .from("listings")
      .select("*")
      .eq("seller_id", dealer.seller_id)
      .eq("status", "published");
    if (error) {
      console.error("Dealer Room listing query failed:", {
        code: error.code,
        message: error.message,
      });
    }

    const scope: DealerBrowseScope = {
      sellerId: dealer.seller_id,
      slug: dealer.slug,
      businessName: dealer.business_name,
      logoUrl: dealer.logo_url,
      location: dealer.location,
      tagline: dealer.tagline,
    };

    return (
      <main className="min-h-screen bg-[var(--ink)] px-6 py-5 text-[var(--platinum)]">
        <BrowseClient
          listings={(!error && Array.isArray(listingRows) ? listingRows : []) as BrowseListingRow[]}
          dealerScope={scope}
        />
      </main>
    );
  }

  // Existing individual-seller profile remains intact. A non-dealer has no
  // slug record, so only its established UUID route resolves here.
  if (!isUuid(id)) notFound();
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

  const { data: listingRows } = await supabase
    .from("listings")
    .select(
      "id, brand, model, reference, year, condition, asking_price, asking_currency, photos, details, combined_score"
    )
    .eq("seller_id", id)
    .eq("status", "published");
  const rows = listingRows ?? [];
  const qualityText = qualityTextFor(
    rows.map((row) => Number(row.combined_score)).filter((score) => Number.isFinite(score))
  );
  const cardListings: SellerCardListing[] = rows.map((row) => ({
    id: row.id,
    brand: row.brand,
    model: row.model ?? null,
    reference: row.reference,
    year: row.year,
    condition: row.condition,
    asking_price: row.asking_price,
    asking_currency: row.asking_currency ?? null,
    photos: Array.isArray(row.photos) ? row.photos : [],
    details: row.details ?? null,
  }));
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
