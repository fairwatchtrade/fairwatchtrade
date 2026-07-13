import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PurchaseRequestForm from "@/components/PurchaseRequestForm";

/* ────────────────────────────────────────────────────────────────────────
   PURCHASE REQUEST FORM — /listings/[id]/purchase-request  (v2.4a)

   Server wrapper. Auth-gated (redirect to /login if unauthenticated, per
   brief). Fetches the listing for display context only — no purchase_requests
   write happens here; the form POSTs to /api/purchase-requests, which does
   the actual insert server-side with buyer_id derived from auth, never from
   the client.

   A seller landing on their own listing's purchase-request URL is bounced
   back to the listing detail page — this form is buyer-only.
   ──────────────────────────────────────────────────────────────────────── */

type ListingPhoto = {
  photo: { url: string };
  category: string;
};

type ListingForRequest = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  asking_price: number;
  photos: ListingPhoto[];
  seller_id: string;
  status: string;
};

export default async function PurchaseRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("listings")
    .select("id, brand, model, reference, asking_price, photos, seller_id, status")
    .eq("id", id)
    .single();

  if (error || !data || data.status !== "published") {
    notFound();
  }

  const listing = data as ListingForRequest;

  // Sellers don't purchase-request their own listings.
  if (listing.seller_id === user.id) {
    redirect(`/listings/${listing.id}`);
  }

  // Seller display name for the confirmation message — same profiles/
  // display_name/id-join pattern already confirmed working elsewhere
  // (app/sellers/[id]/page.tsx, and reused in the listing detail page).
  const { data: sellerProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", listing.seller_id)
    .single();

  const sellerName = sellerProfile?.display_name ?? "The seller";

  const photos = Array.isArray(listing.photos) ? listing.photos : [];
  const dial = photos.find((p) => p?.category === "Dial");
  const heroUrl = (dial ?? photos[0])?.photo?.url ?? null;

  return (
    <PurchaseRequestForm
      listing={{
        id: listing.id,
        brand: listing.brand,
        model: listing.model,
        reference: listing.reference,
        askingPrice: listing.asking_price,
        heroUrl,
      }}
      sellerName={sellerName}
    />
  );
}
