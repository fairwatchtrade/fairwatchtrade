import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  dealerProfileMetadata,
  individualSellerMetadata,
  unknownSellerMetadata,
  unpublishedDealerProfileMetadata,
} from "@/lib/seo/routeMetadata";
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
  public_room_enabled: boolean;
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

type SellerDb = Awaited<ReturnType<typeof createClient>>;

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

// Session RLS reads public rooms and the owner's private identity. Only the
// authenticated founder may fall back to a trusted read for private preview.
async function resolveDealer(supabase: SellerDb, id: string): Promise<DealerProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  const readDealer = async (db: SellerDb) => {
    const dealerQuery = db
    .from("dealer_profiles")
    .select("seller_id,slug,business_name,logo_url,location,tagline,public_room_enabled");
    const { data, error } = isUuid(id)
    ? await dealerQuery.eq("seller_id", id).maybeSingle()
    : await dealerQuery.eq("slug", id.toLowerCase()).maybeSingle();
    if (error) throw new Error("Dealer Room identity could not be confirmed");
    return (data as DealerProfile | null) ?? null;
  };
  let dealer = await readDealer(supabase);
  if (!dealer && user?.id === ADMIN_USER_ID) {
    dealer = await readDealer(createServiceClient());
  }
  if (!dealer) return null;
  return dealer.public_room_enabled === true || user?.id === dealer.seller_id || user?.id === ADMIN_USER_ID
    ? dealer : null;
}

// Row existence proves admission. Only publication permits indexable dealer
// metadata. Private previews and ordinary Sellers remain noindex.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const dealer = await resolveDealer(supabase, id);
  if (dealer) {
    return dealer.public_room_enabled === true
      ? dealerProfileMetadata(dealer)
      : unpublishedDealerProfileMetadata();
  }
  if (!isUuid(id)) return unknownSellerMetadata();
  const { data: seller } = await supabase
    .from("public_seller_profiles")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  return seller ? individualSellerMetadata(id) : unknownSellerMetadata();
}

export default async function SellerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const dealer = await resolveDealer(supabase, id);

  if (dealer) {
    if (dealer.public_room_enabled === true && id !== dealer.slug) redirect(`/sellers/${dealer.slug}`);

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
        {dealer.public_room_enabled !== true && (
          <aside className="mb-6 border border-[var(--border-subtle)] p-4 text-[var(--slate)]" aria-label="Private Dealer Room preview">
            <p className="font-medium">Dealer Room not public</p>
            <p className="mt-2 text-sm">Only you and FairWatchTrade can view this Dealer Room until FairWatchTrade publishes it.</p>
          </aside>
        )}
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
      "id, brand, model, reference, public_code, year, condition, asking_price, asking_currency, photos, details, combined_score"
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
    public_code: row.public_code ?? null,
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
